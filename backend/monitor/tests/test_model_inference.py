from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import pandas as pd
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings

from monitor.model_inference import aggregate_minutes, clear_inference_cache
from monitor.models import Dataset, LotSummary, MeasurementFrame


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class ModelInferenceTests(TestCase):
    def setUp(self):
        clear_inference_cache()
        self.addCleanup(clear_inference_cache)
        user = get_user_model().objects.create_user("model-reader")
        user.groups.add(Group.objects.get_or_create(name="field")[0])
        self.client.force_login(user)
        self.dataset = Dataset.objects.create(name="demo", sha256="a" * 64, source_name="demo.csv", status="ready")
        self.begin = datetime(2026, 10, 26)
        self.lot = LotSummary.objects.create(dataset=self.dataset, lot_no="260001", grade="SPHC",
            start=self.begin.isoformat(timespec="microseconds"),
            end=(self.begin + timedelta(minutes=34, seconds=59)).isoformat(timespec="microseconds"), count=70)
        frames = []
        for minute in range(35):
            for second in [0, 59]:
                # Deliberately reverse CSV row numbers. Arrival is CLOCK order, not CSV order.
                row = 1000 - minute * 2 - second // 59
                time = (self.begin + timedelta(minutes=minute, seconds=second)).isoformat(timespec="microseconds")
                value = 800 + (minute % 2) if minute < 31 else 1000
                frames.append(MeasurementFrame(dataset=self.dataset, source_row=row, source_record_id=str(row),
                    lot_no=self.lot.lot_no, grade="SPHC", recorded_at=time, recorded_at_raw=time,
                    values={"TC-Z4": value, "OP-Z4": 60 + minute % 2, "CP-Z4": .4 + minute % 2 * .01},
                    annotations={"LABEL": int(minute % 2), "EXCLUDED": minute > 30}))
        MeasurementFrame.objects.bulk_create(frames)

    def infer(self, minute, second=0, **extra):
        return self.client.post("/api/model-predictions", {
            "dataset": str(self.dataset.id), "lot_no": self.lot.lot_no,
            "through_source_row": 1000 - minute * 2 - second // 59, "model": "zscore", **extra,
        }, content_type="application/json")

    def test_raw_minute_statistics_are_not_statistics_of_averages(self):
        frame = aggregate_minutes([
            {"recorded_at": "2026-10-26T00:00:00", "values": {"TC-Z4": 1, "OP-Z4": 0}},
            {"recorded_at": "2026-10-26T00:00:59", "values": {"TC-Z4": 3, "OP-Z4": 0}},
            {"recorded_at": "2026-10-26T00:03:00", "values": {"TC-Z4": 9}},
        ], "260001")
        self.assertEqual(len(frame), 2)  # No fabricated rows across the two-minute gap.
        self.assertEqual(frame.iloc[0]["TC-Z4"], 2)
        self.assertEqual(frame.iloc[0]["TC-Z4__MIN"], 1)
        self.assertEqual(frame.iloc[0]["TC-Z4__MAX"], 3)
        self.assertAlmostEqual(frame.iloc[0]["TC-Z4__STD"], np.sqrt(2))
        self.assertEqual(frame.iloc[0]["OP-Z4"], 0)
        self.assertEqual(frame.iloc[1]["TC-Z4__STD"], 0)

    def test_only_closed_minutes_are_inferred_and_early_rows_are_not_called_normal(self):
        data = self.infer(0, 59).json()
        self.assertEqual(data["closed_minutes"], 0)
        self.assertTrue(all(p["prediction"] is None for p in data["predictions"]))
        data = self.infer(30).json()
        self.assertEqual(data["closed_minutes"], 30)
        z4 = next(p for p in data["predictions"] if p["zone_id"] == "Z4")
        self.assertEqual(z4["status"], "warming_up")
        data = self.infer(32).json()
        self.assertEqual(data["closed_minutes"], 32)
        z4 = next(p for p in data["predictions"] if p["zone_id"] == "Z4")
        self.assertEqual(z4["prediction"], 1)
        self.assertEqual(z4["minute"], "2026-10-26T00:31:00")
        self.assertEqual(data["events"][0]["channel_ids"], ["TC-Z4"])

    def test_future_values_and_labels_do_not_change_past_predictions_even_after_cache_rewind(self):
        before = self.infer(32).json()
        self.infer(34)
        MeasurementFrame.objects.filter(dataset=self.dataset, recorded_at__gte="2026-10-26T00:32").update(
            values={"TC-Z4": -999999}, annotations={"LABEL": 1, "EXCLUDED": True})
        after = self.infer(32).json()
        self.assertEqual(before, after)
        clear_inference_cache()
        MeasurementFrame.objects.filter(dataset=self.dataset).update(annotations={"LABEL": 1, "EXCLUDED": True})
        self.assertEqual(before, self.infer(32).json())

    def test_idempotent_response_coalesces_adjacent_anomalous_minutes_without_database_writes(self):
        before = (Dataset.objects.count(), MeasurementFrame.objects.count())
        first = self.infer(34).json()
        self.assertEqual(first, self.infer(34).json())
        events = [e for e in first["events"] if e["zone_id"] == "Z4"]
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["point_count"], 3)
        self.assertEqual(before, (Dataset.objects.count(), MeasurementFrame.objects.count()))

    def test_end_of_stream_is_verified_before_last_minute_is_released(self):
        self.assertEqual(self.infer(33, 59, end_of_stream=True).status_code, 400)
        response = self.infer(34, 59, end_of_stream=True)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["closed_minutes"], 35)
        self.assertLessEqual(max(e["end"] for e in response.json()["events"]), self.lot.end)

    def test_lot_context_does_not_include_other_lot_values(self):
        other = LotSummary.objects.create(dataset=self.dataset, lot_no="260002", grade="SPCE",
            start="2026-10-26T01:00:00.000000", end="2026-10-26T01:01:00.000000", count=2)
        for row, time in [(1001, other.start), (1002, other.end)]:
            MeasurementFrame.objects.create(dataset=self.dataset, source_row=row, source_record_id=str(row),
                lot_no=other.lot_no, recorded_at=time, recorded_at_raw=time, values={"TC-Z4": 9999})
        data = self.infer(34, lot_no=other.lot_no)
        self.assertEqual(data.status_code, 400)
        data = self.infer(34, through_source_row=1002, lot_no=other.lot_no).json()
        self.assertEqual(data["closed_minutes"], 1)
        self.assertTrue(all(p["prediction"] is None for p in data["predictions"]))

    def test_randomforest_uses_only_supported_zones_and_actual_feature_order(self):
        calls = []
        class Estimator:
            classes_ = [0, 1]
            def predict(self, inputs):
                calls.append(inputs.copy())
                return np.ones(len(inputs), dtype=int)
            def predict_proba(self, inputs):
                return np.tile([.2, .8], (len(inputs), 1))
        def loaded(zone):
            return SimpleNamespace(entry={"id": "test-" + zone, "label_version": "v6", "evidence": "team labels"},
                features={"zone_sensors": ["TC-" + zone]}, feature_order=["second", "first"], estimator=Estimator())
        def features(minutes, spec):
            return pd.DataFrame({"first": np.arange(len(minutes)), "second": np.arange(len(minutes)) * 2})
        with patch("monitor.model_inference.load_selected_model", side_effect=loaded) as load, \
             patch("monitor.model_inference.build_features", side_effect=features):
            data = self.infer(3, model="randomforest").json()
        self.assertEqual({call.args[0] for call in load.call_args_list}, {"Z3", "Z4", "Z5", "Z6"})
        self.assertTrue(all(list(inputs.columns) == ["second", "first"] for inputs in calls))
        self.assertEqual(next(p for p in data["predictions"] if p["zone_id"] == "CLN")["kind"], "Z-score")
        self.assertEqual(next(p for p in data["predictions"] if p["zone_id"] == "Z4")["probability"], .8)

    def test_derived_minute_csv_is_not_silently_treated_as_raw_observations(self):
        self.dataset.metadata = {"unimported_columns": ["TC-Z4__MIN", "TC-Z4__MAX", "TC-Z4__STD"]}
        self.dataset.save(update_fields=["metadata"])
        response = self.infer(32)
        self.assertEqual(response.status_code, 400)
        self.assertIn("원본 온도 CSV", response.json()["dataset"])

    def test_previous_lot_final_minute_closes_when_next_lot_arrives(self):
        other = LotSummary.objects.create(dataset=self.dataset, lot_no="260002", grade="SPCE",
            start="2026-10-26T00:35:00.000000", end="2026-10-26T00:35:59.000000", count=1)
        MeasurementFrame.objects.create(dataset=self.dataset, source_row=1001, source_record_id="next-lot",
            lot_no=other.lot_no, recorded_at=other.start, recorded_at_raw=other.start, values={"TC-Z4": 9999})
        response = self.infer(34, through_source_row=1001)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["closed_minutes"], 35)
        self.assertEqual(response.json()["lot_no"], self.lot.lot_no)

    def test_next_lot_also_closes_a_partial_minute(self):
        self.lot.end = "2026-10-26T00:34:59.000000"
        self.lot.save(update_fields=["end"])
        other = LotSummary.objects.create(dataset=self.dataset, lot_no="260002", grade="SPCE",
            start="2026-10-26T00:34:59.500000", end="2026-10-26T00:35:59.000000", count=1)
        MeasurementFrame.objects.create(dataset=self.dataset, source_row=1001, source_record_id="next-lot-partial",
            lot_no=other.lot_no, recorded_at=other.start, recorded_at_raw=other.start, values={"TC-Z4": 9999})
        response = self.infer(34, through_source_row=1001)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["closed_minutes"], 35)

    def test_scope_and_authentication_validation(self):
        for extra in [{"through_source_row": True}, {"model": "none"}, {"model": {}}, {"end_of_stream": "yes"}, {"dataset": "invalid"}]:
            self.assertEqual(self.infer(1, **extra).status_code, 400)
        self.client.logout()
        self.assertIn(self.infer(1).status_code, (401, 403))
