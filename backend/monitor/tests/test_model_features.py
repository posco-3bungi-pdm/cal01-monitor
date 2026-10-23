import json
from pathlib import Path

import numpy as np
import pandas as pd
from django.test import SimpleTestCase
from pandas.testing import assert_frame_equal

from monitor.model_features import build_features, required_columns


MODELS = Path(__file__).resolve().parents[3] / "models"


def specification(zone="Z4"):
    return json.loads((MODELS / "v6" / "final" / zone / "features.json").read_text(encoding="utf-8"))


def minute_fixture(count=45, lot=260001):
    spec = specification()
    data = pd.DataFrame({
        "LOT_NO": lot,
        "MEAS_DT": pd.date_range("2026-10-26", periods=count, freq="min"),
    })
    for name in required_columns(spec):
        if name not in data:
            data[name] = np.arange(count, dtype=float) + 100
    for name in spec["zone_sensors"]:
        data[name + "__MIN"] = data[name] - 0.5
        data[name + "__MAX"] = data[name] + 1
        data[name + "__STD"] = 0.25
    return data


class ModelFeatureTests(SimpleTestCase):
    def test_later_minutes_cannot_change_past_inputs(self):
        data = minute_fixture()
        whole = build_features(data, specification())
        prefix = build_features(data.iloc[:36], specification())
        changed = data.copy()
        columns = [name for name in data if name not in ["LOT_NO", "MEAS_DT"]]
        changed.loc[36:, columns] = 1e9
        changed_features = build_features(changed, specification())
        assert_frame_equal(whole.iloc[:36], prefix)
        assert_frame_equal(whole.iloc[:36], changed_features.iloc[:36])

    def test_labels_and_exclusions_are_not_read(self):
        data = minute_fixture()
        original = build_features(data, specification())
        data["LABEL"] = 1
        data["EXCLUDED"] = True
        data["Z4__STAT_LABEL"] = np.nan
        data["Z4__DOMAIN_LABEL"] = 0
        assert_frame_equal(original, build_features(data, specification()))

    def test_lot_resets_and_shuffled_input_keeps_its_index(self):
        first = minute_fixture(40)
        second = minute_fixture(40, lot=260002)
        second["MEAS_DT"] += pd.Timedelta(days=1)
        data = pd.concat([first, second], ignore_index=True)
        combined = build_features(data, specification())
        self.assertTrue(np.isnan(combined.loc[40, "TC-Z4__DIFF"]))
        self.assertEqual(combined.loc[69, "TC-Z4__ZPAST"], 0)
        single = build_features(second, specification()).reset_index(drop=True)
        assert_frame_equal(combined.iloc[40:].reset_index(drop=True), single)
        shuffled = data.sample(frac=1, random_state=42)
        actual = build_features(shuffled, specification())
        self.assertEqual(list(actual.index), list(shuffled.index))
        assert_frame_equal(actual.sort_index(), combined)

    def test_expanding_population_std_and_rolling_sample_std_match_source(self):
        data = minute_fixture()
        result = build_features(data, specification())
        self.assertEqual(result.loc[29, "TC-Z4__ZPAST"], 0)
        expected_z = (130 - np.mean(np.arange(100, 130))) / np.std(np.arange(100, 130), ddof=0)
        self.assertAlmostEqual(result.loc[30, "TC-Z4__ZPAST"], expected_z)
        expected_edge = (131 - np.mean(np.arange(100, 130))) / np.std(np.arange(100, 130), ddof=0)
        self.assertAlmostEqual(result.loc[30, "TC-Z4__ZPAST_EDGE"], expected_edge)
        self.assertAlmostEqual(result.loc[30, "TC-Z4__STD10"], np.std(np.arange(120, 130), ddof=1))
        self.assertEqual(result.loc[30, "TC-Z4__DEV10"], 5.5)
        self.assertEqual(result.loc[1, "TC-Z4__STD10"], 0)
        self.assertTrue(np.isnan(result.loc[0, "TC-Z4__DIFF"]))

    def test_common_counts_exclude_own_zone_and_include_the_closed_current_minute(self):
        data = minute_fixture()
        data.loc[35, ["TC-Z3", "OP-Z3"]] = 1000
        result = build_features(data, specification())
        self.assertEqual(result.loc[34, "COMMON__OTHERS"], 0)
        self.assertEqual(result.loc[35, "COMMON__OTHERS"], 1)
        self.assertEqual(result.loc[35, "COMMON__OP_OTHERS"], 1)
        self.assertEqual(result.loc[35, "FURNACE__OTHERS"], 1)
        self.assertEqual(result.loc[39, "COMMON__OTHERS"], 1)
        self.assertEqual(result.loc[40, "COMMON__OTHERS"], 0)
        own = minute_fixture()
        own.loc[35, ["TC-Z4", "OP-Z4", "CP-Z4"]] = 1000
        own_features = build_features(own, specification())
        self.assertEqual(own_features.loc[35, "COMMON__OTHERS"], 0)
        self.assertEqual(own_features.loc[35, "FURNACE__OTHERS"], 0)

    def test_observed_minute_gaps_are_not_filled(self):
        data = minute_fixture(8)
        data.loc[5:, "MEAS_DT"] += pd.Timedelta(hours=1)
        result = build_features(data, specification())
        self.assertEqual(len(result), 8)
        self.assertEqual(result.loc[5, "TC-Z4__CHG5"], 5)
        self.assertEqual(result.loc[5, "TC-Z4__DIFF"], 1)

    def test_zero_output_small_cp_and_single_observation_std_are_preserved(self):
        data = minute_fixture()
        cp = 1e-10 + np.arange(len(data)) * 1e-12
        data["CP-Z4"] = cp
        data["CP-Z4__MIN"] = cp
        data["CP-Z4__MAX"] = cp
        data["CP-Z4__STD"] = np.nan
        data.loc[35, "OP-Z4"] = 0
        result = build_features(data, specification())
        self.assertEqual(result.loc[35, "OP-Z4"], 0)
        self.assertEqual(result.loc[35, "CP-Z4"], cp[35])
        self.assertEqual(result.loc[35, "CP-Z4__STD"], 0)
        self.assertTrue(np.isfinite(result.loc[35, "CP-Z4__ZPAST"]))
        self.assertGreater(result.loc[35, "CP-Z4__ZPAST"], 0)

    def test_missing_inputs_and_unknown_features_fail_instead_of_being_invented(self):
        data = minute_fixture()
        with self.assertRaisesRegex(ValueError, "Missing minute columns: CP-Z4__MIN"):
            build_features(data.drop(columns=["CP-Z4__MIN"]), specification())
        spec = specification()
        spec["feature_order"].append("LABEL")
        data["LABEL"] = 1
        with self.assertRaisesRegex(ValueError, "Unsupported model features: LABEL"):
            build_features(data, spec)

    def test_feature_order_for_all_four_registry_zones(self):
        data = minute_fixture()
        for zone in ["Z3", "Z4", "Z5", "Z6"]:
            spec = specification(zone)
            for channel in spec["zone_sensors"]:
                for suffix in ["__MIN", "__MAX", "__STD"]:
                    if channel + suffix not in data:
                        data[channel + suffix] = data[channel]
            result = build_features(data, spec)
            self.assertEqual(list(result.columns), spec["feature_order"])
            self.assertEqual(len(result.dropna()), len(data) - 1)
