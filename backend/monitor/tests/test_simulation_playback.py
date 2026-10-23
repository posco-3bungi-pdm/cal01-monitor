from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from monitor.models import Dataset, LotSummary, MeasurementFrame


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class SimulationPlaybackTests(TestCase):
    def setUp(self):
        self.client.force_login(get_user_model().objects.create_user("simulation-reader"))
        self.dataset = Dataset.objects.create(
            name="simulation", sha256="c" * 64, source_name="day.csv", status="ready", row_count=6,
        )
        for lot, grade, start, end, count in [
            ("260001", "SPHC", "2026-10-26T06:29:58.000000", "2026-10-26T06:30:00.000000", 3),
            ("260002", "SPCE", "2026-10-26T06:30:00.000000", "2026-10-26T06:30:02.000000", 3),
        ]:
            LotSummary.objects.create(
                dataset=self.dataset, lot_no=lot, grade=grade, start=start, end=end, count=count,
            )
        # CSV row order and database insertion order differ from the clock.
        for row, time, lot, grade in [
            (5, "2026-10-26T06:30:01.000000", "260002", "SPCE"),
            (3, "2026-10-26T06:30:00.000000", "260001", "SPHC"),
            (1, "2026-10-26T06:29:58.000000", "260001", "SPHC"),
            (6, "2026-10-26T06:30:02.000000", "260002", "SPCE"),
            (2, "2026-10-26T06:29:59.000000", "260001", "SPHC"),
            (4, "2026-10-26T06:30:00.000000", "260002", "SPCE"),
        ]:
            MeasurementFrame.objects.create(
                dataset=self.dataset, source_row=row, source_record_id=f"sim-row-{row}", lot_no=lot,
                grade=grade, recorded_at=time, recorded_at_raw=time.replace("T", " "),
                values={"TC-Z4": 800 + row, "OP-Z4": 0}, annotations={"LABEL": int(row == 5)},
            )

    def page(self, **params):
        return self.client.get("/api/playback-frames", {"dataset": str(self.dataset.id), **params})

    def test_all_lots_default_to_whole_dataset_and_keep_row_context(self):
        response = self.page()
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        self.assertIsNone(data["lot_no"])
        self.assertEqual(data["start"], "2026-10-26T06:29:58.000000")
        self.assertEqual(data["end"], "2026-10-26T06:30:02.000000")
        self.assertEqual(data["lot_count"], 6)
        self.assertEqual([frame["source_row"] for frame in data["frames"]], [1, 2, 3, 4, 5, 6])
        self.assertEqual([(frame["lot_no"], frame["grade"]) for frame in data["frames"]],
                         [("260001", "SPHC")] * 3 + [("260002", "SPCE")] * 3)
        self.assertEqual(data["frames"][4]["annotations"], {"LABEL": 1})
        self.assertEqual(data["mode"], "historical")
        self.assertEqual(data["time_basis"], "source_recorded_clock")
        self.assertIsNone(data["source_timezone"])
        self.assertFalse(data["has_more"])

    def test_pages_cross_lot_and_same_timestamp_without_duplicate_or_missing_rows(self):
        seen, cursor = [], None
        for expected in [[1, 2, 3], [4, 5, 6]]:
            data = self.page(limit=3, **({"cursor": cursor} if cursor else {})).json()
            self.assertEqual([frame["source_row"] for frame in data["frames"]], expected)
            seen.extend(frame["source_row"] for frame in data["frames"])
            cursor = data["next_cursor"]
        self.assertEqual(seen, [1, 2, 3, 4, 5, 6])
        self.assertEqual(len(set(seen)), 6)
        self.assertIsNone(cursor)

    def test_lot_filter_preserves_existing_scope_and_frame_values(self):
        data = self.page(lot="260002", limit=2).json()
        self.assertEqual(data["lot_no"], "260002")
        self.assertEqual(data["lot_start"], "2026-10-26T06:30:00.000000")
        self.assertEqual(data["lot_count"], 3)
        self.assertEqual([frame["source_row"] for frame in data["frames"]], [4, 5])
        self.assertEqual(data["frames"][0]["values"], {"TC-Z4": 804, "OP-Z4": 0})
        end = self.page(lot="260002", limit=2, cursor=data["next_cursor"]).json()
        self.assertEqual([frame["source_row"] for frame in end["frames"]], [6])
        self.assertFalse(end["has_more"])

    def test_all_lot_and_single_lot_cursors_cannot_be_mixed(self):
        all_cursor = self.page(limit=1).json()["next_cursor"]
        lot_cursor = self.page(lot="260001", limit=1).json()["next_cursor"]
        self.assertEqual(self.page(lot="260001", limit=1, cursor=all_cursor).status_code, 400)
        self.assertEqual(self.page(limit=1, cursor=lot_cursor).status_code, 400)
        self.assertEqual(self.page(lot="260002", limit=1, cursor=lot_cursor).status_code, 400)

    def test_cursor_cannot_be_used_with_different_dataset_or_range(self):
        cursor = self.page(limit=1).json()["next_cursor"]
        other = Dataset.objects.create(
            name="other", sha256="d" * 64, source_name="other.csv", status="ready", row_count=6,
        )
        for lot in self.dataset.lots.all():
            LotSummary.objects.create(dataset=other, lot_no=lot.lot_no, grade=lot.grade,
                                      start=lot.start, end=lot.end, count=lot.count)
        for params in [
            {"dataset": str(other.id)},
            {"start": "2026-10-26T06:29:59"},
            {"end": "2026-10-26T06:30:01"},
            {"cursor": cursor + "tampered"},
        ]:
            with self.subTest(params=params):
                response = self.page(cursor=cursor, **params) if "cursor" not in params else self.page(**params)
                self.assertEqual(response.status_code, 400, response.content)

    def test_explicit_range_retains_every_row_at_same_time(self):
        data = self.page(start="2026-10-26 06:30:00", end="2026-10-26 06:30:00").json()
        self.assertEqual([frame["source_row"] for frame in data["frames"]], [3, 4])
        self.assertEqual(self.page(start="2026-10-27 00:00:00", end="2026-10-27 01:00:00").json()["frames"], [])

    def test_missing_empty_or_invalid_scope_is_rejected(self):
        self.assertEqual(self.client.get("/api/playback-frames").status_code, 400)
        empty = Dataset.objects.create(name="empty", sha256="e" * 64, source_name="empty.csv", status="ready")
        self.assertEqual(self.page(dataset=str(empty.id)).status_code, 400)
        self.assertEqual(self.page(lot="").status_code, 400)
        self.assertEqual(self.page(lot="missing").status_code, 404)
        self.assertEqual(self.page(start="2026-10-26T06:30:00+09:00").status_code, 400)
        self.assertEqual(self.page(start="2026-10-27 00:00:00").status_code, 400)
        self.client.logout()
        self.assertIn(self.page().status_code, (401, 403))
