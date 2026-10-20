from concurrent.futures import ThreadPoolExecutor
import json
from threading import Barrier
from unittest import skipUnless

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.core.cache import cache
from django.db import close_old_connections, connection, connections
from django.test import Client, TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from monitor.models import Dataset, EquipmentLayout, EquipmentLayoutHistory, LotSummary, MeasurementFrame

TEST_PASSWORD = "unit-test-password-only"
MODEL_VERSION = "cal01-concept-v1"
PLACEMENTS = [{"channel_id": "TC-Z3", "zone_id": "Z3", "position": [1, 2, 3]}]


def create_user(username="reviewer", staff=False):
    user = get_user_model().objects.create_user(username, password=TEST_PASSWORD, is_staff=staff)
    user.groups.add(Group.objects.get_or_create(name="field")[0])
    return user


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class AuthenticationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = create_user()
        self.client = Client(enforce_csrf_checks=True)

    def test_data_is_private_and_login_requires_csrf(self):
        for endpoint in ["datasets", "channels", "equipment/layout"]:
            self.assertIn(self.client.get("/api/" + endpoint).status_code, [401, 403])
        response = self.client.post(
            "/api/login", {"username": self.user.username, "password": TEST_PASSWORD},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    def test_login_rotates_csrf_and_logout_clears_session(self):
        token = self.client.get("/api/csrf").json()["csrfToken"]
        response = self.client.post(
            "/api/login", {"username": self.user.username, "password": TEST_PASSWORD},
            content_type="application/json", HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["team"], "field")
        self.assertFalse(response.json()["user"]["can_edit_layout"])
        self.assertEqual(self.client.get("/api/me").json()["user"]["username"], self.user.username)
        self.assertEqual(self.client.post("/api/logout").status_code, 403)
        self.assertEqual(self.client.post(
            "/api/logout", HTTP_X_CSRFTOKEN=response.json()["csrfToken"],
        ).status_code, 200)
        self.assertEqual(self.client.get("/api/me").status_code, 401)

    @override_settings(LOGIN_FAILURE_LIMIT=2)
    def test_failed_logins_are_limited_without_exposing_user_existence(self):
        token = self.client.get("/api/csrf").json()["csrfToken"]
        for _ in range(2):
            response = self.client.post(
                "/api/login", {"username": "missing", "password": "wrong"},
                content_type="application/json", HTTP_X_CSRFTOKEN=token,
            )
            self.assertEqual(response.status_code, 401)
        response = self.client.post(
            "/api/login", {"username": "missing", "password": "wrong"},
            content_type="application/json", HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 429)


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class MeasurementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=create_user())
        self.dataset = Dataset.objects.create(
            name="source", sha256="a" * 64, source_name="temperature.csv",
            row_count=4, status="ready",
            metadata={"plot_max_gap_seconds": 60, "stale_after_seconds": 30},
        )
        self.lot = LotSummary.objects.create(
            dataset=self.dataset, lot_no="240001", grade="SGCC",
            start="2024-01-02T03:36:00.000000", end="2024-01-02T03:40:00.000000", count=4,
        )
        for index, (time, value, label) in enumerate([
            ("03:36:00", 0, 0),
            ("03:36:05", 100, 1),
            ("03:36:10", None, None),
            ("03:40:00", 20, 0),
        ]):
            MeasurementFrame.objects.create(
                dataset=self.dataset, source_row=index + 1, source_record_id=f"row:{index + 1}",
                lot_no=self.lot.lot_no, grade="SGCC",
                recorded_at=f"2024-01-02T{time}.000000", recorded_at_raw=f"2024-01-02 {time}",
                values={"OP-Z3": value}, annotations={"LABEL": label},
            )

    def query(self, endpoint, **kwargs):
        return self.client.get("/api/" + endpoint, {
            "dataset": str(self.dataset.pk), "lot": self.lot.lot_no, **kwargs,
        })

    def test_list_hides_incomplete_imports_and_preserves_channel_metadata(self):
        Dataset.objects.create(name="incomplete", sha256="b" * 64, source_name="other.csv")
        self.assertEqual(len(self.client.get("/api/datasets").json()["datasets"]), 1)
        channels = {item["id"]: item for item in self.client.get("/api/channels").json()["channels"]}
        self.assertEqual(len(channels), 22)
        self.assertFalse(channels["OP-Z3"]["is_physical_sensor"])
        self.assertEqual(channels["TC-Z9"]["zone_status"], "needs_review")
        self.assertIsNone(channels["CP-Z4M"]["unit"])

    def test_raw_series_keeps_zero_missing_label_and_clock(self):
        result = self.query("series", channels="OP-Z3").json()
        points = result["series"][0]["points"]
        self.assertEqual(points[0]["value"], 0)
        self.assertEqual(points[1]["label"], 1)
        self.assertTrue(any(point["value"] is None for point in points))
        self.assertEqual(result["source_count"], 4)
        self.assertIsNone(result["source_timezone"])
        self.assertEqual(points[0]["time"], self.lot.start)

    def test_sampling_keeps_extrema_and_missing_data_breaks(self):
        result = self.query("series", channels="OP-Z3", max_points=2).json()
        points = result["series"][0]["points"]
        first = points[0]
        self.assertEqual((first["min"], first["max"], first["count"], first["label"]), (0, 100, 2, 1))
        self.assertTrue(points[1]["gap"])
        self.assertEqual(points[-1]["value"], 20)

    def test_long_time_gap_is_not_a_line(self):
        MeasurementFrame.objects.filter(dataset=self.dataset, source_row=3).delete()
        points = self.query("series", channels="OP-Z3").json()["series"][0]["points"]
        self.assertTrue(any(point.get("gap_reason") == "no_observation" for point in points))

    def test_source_label_survives_missing_channel_value(self):
        MeasurementFrame.objects.filter(dataset=self.dataset, source_row=3).update(annotations={"LABEL": 1})
        points = self.query("series", channels="OP-Z3").json()["series"][0]["points"]
        self.assertTrue(any(point["value"] is None and point["label"] == 1 for point in points))

    def test_label_intervals_keep_actual_observations_without_bucket_expansion(self):
        MeasurementFrame.objects.filter(dataset=self.dataset, source_row=3).update(annotations={"LABEL": 1})
        MeasurementFrame.objects.filter(dataset=self.dataset, source_row=4).update(annotations={"LABEL": 1})
        result = self.query("series", channels="TC-Z3", max_points=2).json()
        self.assertEqual(result["label_intervals"], [
            {"start": "2024-01-02T03:36:05.000000", "end": "2024-01-02T03:36:10.000000", "count": 2},
            {"start": "2024-01-02T03:40:00.000000", "end": "2024-01-02T03:40:00.000000", "count": 1},
        ])
        clipped = self.query(
            "series", channels="TC-Z3", start="2024-01-02T03:36:07", end="2024-01-02T03:36:20",
        ).json()
        self.assertEqual(clipped["label_intervals"], [
            {"start": "2024-01-02T03:36:10.000000", "end": "2024-01-02T03:36:10.000000", "count": 1},
        ])

    def test_zero_and_missing_label_end_a_labeled_interval(self):
        from datetime import datetime, timedelta

        MeasurementFrame.objects.filter(dataset=self.dataset).delete()
        for index, label in enumerate([1, 0, 1, None, 1]):
            time = (datetime(2024, 1, 2, 3, 36) + timedelta(seconds=index * 5)).isoformat(timespec="microseconds")
            MeasurementFrame.objects.create(
                dataset=self.dataset, source_row=index + 1, source_record_id=f"replacement:{index}",
                lot_no=self.lot.lot_no, grade="SGCC", recorded_at=time, recorded_at_raw=time,
                values={"OP-Z3": 0}, annotations={"LABEL": label},
            )
        intervals = self.query("series", channels="OP-Z3", max_points=2).json()["label_intervals"]
        self.assertEqual([item["count"] for item in intervals], [1, 1, 1])
        self.assertTrue(all(item["start"] == item["end"] for item in intervals))

    def test_current_frame_does_not_read_future_rows_and_marks_age(self):
        current = self.query("current-frame", at="2024-01-02T03:36:02").json()
        output = next(item for item in current["channels"] if item["channel_id"] == "OP-Z3")
        self.assertEqual(output["value"], 0)
        self.assertEqual(output["measured_at"], self.lot.start)
        self.assertEqual(output["quality_status"], "observed")
        current = self.query("current-frame", at="2024-01-02T03:41:00").json()
        output = next(item for item in current["channels"] if item["channel_id"] == "OP-Z3")
        self.assertEqual(output["quality_status"], "stale")
        self.assertEqual(output["age_seconds"], 60)
        before = self.query("current-frame", at="2024-01-02T03:00:00").json()
        self.assertTrue(all(item["value"] is None for item in before["channels"]))

    def test_unknown_ids_invalid_bounds_and_timezone_assumptions_are_rejected(self):
        for parameters in [
            {"channels": "NOT-A-CHANNEL"},
            {"start": "2024-01-02T05:00:00", "end": "2024-01-02T04:00:00"},
            {"start": "2024-01-02T03:36:00Z"},
            {"max_points": "bad"},
        ]:
            self.assertEqual(self.query("series", **parameters).status_code, 400)
        self.assertEqual(self.client.get("/api/lots", {"dataset": "not-a-uuid"}).status_code, 400)


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class LayoutTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = create_user()
        self.client.force_authenticate(user=self.user)

    def save(self, **changes):
        data = {"model_version": MODEL_VERSION, "revision": 0, "placements": PLACEMENTS, **changes}
        return self.client.put("/api/equipment/layout", data, format="json")

    def test_user_cannot_gain_layout_permission_from_payload(self):
        self.assertEqual(self.save(is_admin=True).status_code, 403)
        self.assertEqual(EquipmentLayoutHistory.objects.count(), 0)

    def test_revision_prevents_overwrite_and_history_records_author(self):
        self.user.is_staff = True
        self.user.save()
        first = self.save()
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["revision"], 1)
        self.assertEqual(self.save().status_code, 409)
        saved = self.client.get("/api/equipment/layout").json()
        self.assertEqual(saved["placements"], PLACEMENTS)
        history = EquipmentLayoutHistory.objects.get()
        self.assertEqual(history.changed_by_id, self.user.id)
        self.assertEqual(history.revision, 1)

    def test_layout_editor_permission_does_not_require_admin(self):
        permission = Permission.objects.get(
            content_type__app_label="monitor", codename="change_equipmentlayout",
        )
        self.user.user_permissions.add(permission)
        self.assertFalse(self.user.is_staff)
        self.assertEqual(self.save().status_code, 200)

    def test_model_unknown_channels_duplicate_channels_and_bad_positions_are_rejected(self):
        self.user.is_staff = True
        self.user.save()
        self.assertEqual(self.save(model_version="different-model").status_code, 409)
        for placements in [
            PLACEMENTS * 2,
            [{"channel_id": "missing", "zone_id": "Z3", "position": [0, 0, 0]}],
            [{"channel_id": [], "zone_id": "Z3", "position": [0, 0, 0]}],
            [{"channel_id": "TC-Z3", "zone_id": "Z4", "position": [0, 0, 0]}],
            [{"channel_id": "TC-Z3", "zone_id": "Z3", "position": [61, 0, 0]}],
            [{"channel_id": "TC-Z3", "zone_id": "Z3", "position": [True, 0, 0]}],
            [{"channel_id": "TC-Z3", "zone_id": "Z3", "position": ["1", 0, 0]}],
        ]:
            self.assertEqual(self.save(placements=placements).status_code, 400)
        self.assertEqual(EquipmentLayoutHistory.objects.count(), 0)

    def test_authenticated_write_still_requires_csrf(self):
        self.user.is_staff = True
        self.user.save()
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.user)
        response = client.put(
            "/api/equipment/layout",
            json.dumps({"model_version": MODEL_VERSION, "revision": 0, "placements": PLACEMENTS}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)


@skipUnless(connection.vendor == "postgresql", "Row locking is verified with PostgreSQL, not SQLite.")
@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class ConcurrentLayoutTests(TransactionTestCase):
    def test_two_editors_cannot_both_save_the_same_revision(self):
        user = create_user(staff=True)
        EquipmentLayout.objects.create(model_version=MODEL_VERSION)
        barrier = Barrier(2)

        def write():
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user=user)
                barrier.wait(timeout=10)
                return client.put("/api/equipment/layout", {
                    "model_version": MODEL_VERSION, "revision": 0, "placements": PLACEMENTS,
                }, format="json").status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: write(), range(2)))
        self.assertEqual(sorted(results), [200, 409])
        self.assertEqual(EquipmentLayout.objects.get().revision, 1)
        self.assertEqual(EquipmentLayoutHistory.objects.count(), 1)
