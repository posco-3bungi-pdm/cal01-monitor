from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from threading import Barrier
from unittest import skipUnless
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import close_old_connections, connection, connections
from django.test import Client, SimpleTestCase, TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from monitor.detection import analyze_frames, channel_stats
from monitor.detection_models import AnomalyCandidate, CandidatePoint, DetectionRun
from monitor.models import Dataset, LotSummary, MeasurementFrame


def source_frames(values, channel="OP-Z3", times=None):
    start = datetime(2024, 1, 2, 3, 36)
    return [
        {
            "id": index + 1, "source_row": index + 1, "source_record_id": f"row:{index + 1}",
            "recorded_at": (times[index] if times else start + timedelta(seconds=index * 2)).isoformat(timespec="microseconds"),
            "values": {channel: value},
        }
        for index, value in enumerate(values)
    ]


class DetectionMathTests(SimpleTestCase):
    def test_exact_three_is_not_an_exceedance(self):
        stats, candidates, summary = analyze_frames(
            source_frames([0] * 9 + [10]), ["OP-Z3"], min_valid_samples=2,
        )
        self.assertEqual(stats["OP-Z3"]["mean"], 1)
        self.assertAlmostEqual(stats["OP-Z3"]["std"], 3)
        self.assertAlmostEqual(stats["OP-Z3"]["upper"], 10)
        self.assertEqual(candidates, [])
        self.assertEqual(summary["exceedance_count"], 0)

    def test_insufficient_constant_and_nonfinite_values_are_separate(self):
        frames = source_frames([0.1] * 30)
        for index, frame in enumerate(frames):
            frame["values"]["TC-Z3"] = float("nan") if index == 0 else None
        stats, candidates, _ = analyze_frames(frames, ["OP-Z3", "TC-Z3"])
        self.assertEqual(stats["OP-Z3"]["status"], "constant")
        self.assertEqual(stats["OP-Z3"]["std"], 0)
        self.assertEqual(stats["TC-Z3"]["status"], "insufficient_samples")
        self.assertEqual(stats["TC-Z3"]["count"], 0)
        self.assertEqual(candidates, [])

    def test_tiny_cp_variance_and_output_zero_are_preserved(self):
        frames = source_frames([50] * 30 + [0])
        for index, frame in enumerate(frames):
            frame["values"]["CP-Z4M"] = 1e-10 + (1e-12 if index == 30 else 0)
        stats, candidates, _ = analyze_frames(frames, ["OP-Z3", "CP-Z4M"])
        self.assertTrue(0 < stats["CP-Z4M"]["std"] < 1e-12)
        self.assertEqual({item["channel_id"] for item in candidates}, {"OP-Z3", "CP-Z4M"})
        output = next(item for item in candidates if item["channel_id"] == "OP-Z3")
        self.assertEqual(output["peak_value"], 0)
        self.assertLess(output["peak_z"], -3)
        self.assertEqual(output["start"], output["end"])
        self.assertEqual(output["point_count"], 1)

    def test_candidate_breaks_follow_normal_missing_and_observation_gaps(self):
        values = [0] * 100 + [100, 100, None, 100, 0, 100, 100]
        frames = source_frames(values)
        frames[-1]["recorded_at"] = "2024-01-02T04:36:00.000000"
        _, candidates, summary = analyze_frames(frames, ["OP-Z3"])
        self.assertEqual([item["end_reason"] for item in candidates], [
            "missing_value", "normal_value", "observation_gap", "end_of_lot",
        ])
        self.assertEqual([item["point_count"] for item in candidates], [2, 1, 1, 1])
        self.assertEqual(candidates[0]["end"], frames[101]["recorded_at"])
        self.assertEqual(candidates[-1]["start"], candidates[-1]["end"])
        self.assertEqual(summary["exceedance_count"], 5)

    def test_extreme_finite_values_do_not_make_nonfinite_json(self):
        stats = channel_stats([-1e308] * 30 + [1e308], 3, 30)
        self.assertEqual(stats["status"], "unusable_statistics")
        self.assertIsNone(stats["std"])


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class DetectionApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("detector", password="tests-only")
        self.user.groups.add(Group.objects.get_or_create(name="monitoring")[0])
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.dataset = Dataset.objects.create(
            name="source", sha256="d" * 64, source_name="source.csv", status="ready", row_count=31,
        )
        frames = source_frames([50] * 30 + [0])
        self.lot = LotSummary.objects.create(
            dataset=self.dataset, lot_no="240001", grade="SGCC",
            start=frames[0]["recorded_at"], end=frames[-1]["recorded_at"], count=len(frames),
        )
        for frame in frames:
            frame.pop("id")
            MeasurementFrame.objects.create(
                dataset=self.dataset, lot_no=self.lot.lot_no, grade="SGCC",
                recorded_at_raw=frame["recorded_at"],
                annotations={"LABEL": 1, "EXCLUDED": True, "EXCLUDED_RAW": "True"},
                **frame,
            )
        self.payload = {
            "dataset_id": str(self.dataset.id), "lot_no": self.lot.lot_no,
            "channels": ["OP-Z3"], "threshold": 3, "ddof": 0,
            "max_gap_seconds": 60, "min_valid_samples": 30,
        }

    def run_detection(self, **changes):
        return self.client.post("/api/detection/runs", {**self.payload, **changes}, format="json")

    @patch("monitor.notifications.publish_candidate_notifications")
    def test_source_is_unchanged_and_candidate_points_trace_exact_rows(self, publish):
        before = list(self.dataset.frames.values())
        response = self.run_detection()
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertFalse(data["reused"])
        self.assertEqual(data["run"]["mode"], "historical")
        self.assertEqual(data["run"]["status"], "completed")
        self.assertEqual(data["run"]["config"]["row_filter"], "none")
        self.assertEqual(data["run"]["stats"]["OP-Z3"]["count"], 31)
        self.assertEqual(data["run"]["summary"]["candidate_count"], 1)
        self.assertEqual(data["candidates"][0]["status"], "statistical_candidate")
        candidate = AnomalyCandidate.objects.get()
        point = CandidatePoint.objects.get()
        self.assertEqual(point.source_frame_id, self.dataset.frames.get(source_row=31).id)
        self.assertEqual((point.source_row, point.source_record_id, point.value), (31, "row:31", 0))
        self.assertEqual(point.recorded_at, candidate.start)
        self.assertEqual(candidate.start, candidate.end)
        self.assertEqual(point.z_score, candidate.peak_z)
        self.assertEqual(list(self.dataset.frames.values()), before)
        publish.assert_called_once()

    @patch("monitor.notifications.publish_candidate_notifications")
    def test_same_settings_reuse_run_and_publish_once(self, publish):
        first = self.run_detection(channels=["OP-Z3", "TC-Z3"]).json()
        second_response = self.run_detection(channels=["TC-Z3", "OP-Z3"])
        second = second_response.json()
        self.assertEqual(second_response.status_code, 200)
        self.assertTrue(second["reused"])
        self.assertEqual(first["run"]["id"], second["run"]["id"])
        self.assertEqual(DetectionRun.objects.count(), 1)
        self.assertEqual(CandidatePoint.objects.count(), 1)
        self.assertEqual(second["run"]["summary"]["skipped_channels"], {"TC-Z3": "insufficient_samples"})
        publish.assert_called_once()

    @patch("monitor.notifications.publish_candidate_notifications", side_effect=RuntimeError("notification failed"))
    def test_notification_failure_rolls_back_run_candidates_and_points(self, _publish):
        with self.assertRaises(RuntimeError):
            self.run_detection()
        self.assertFalse(DetectionRun.objects.exists())
        self.assertFalse(AnomalyCandidate.objects.exists())
        self.assertFalse(CandidatePoint.objects.exists())

    @patch("monitor.notifications.publish_candidate_acknowledged")
    @patch("monitor.notifications.publish_candidate_notifications")
    def test_acknowledgement_is_persistent_and_keeps_first_reader(self, _created, acknowledged):
        candidate_id = self.run_detection().json()["candidates"][0]["id"]
        url = f"/api/detection/candidates/{candidate_id}/acknowledge"
        first = self.client.post(url, {}, format="json").json()["candidate"]
        other = get_user_model().objects.create_user("other")
        other.groups.add(Group.objects.get_or_create(name="field")[0])
        self.client.force_authenticate(other)
        second = self.client.post(url, {}, format="json").json()["candidate"]
        self.assertTrue(second["acknowledged"])
        self.assertEqual(first["acknowledged_at"], second["acknowledged_at"])
        self.assertEqual(second["acknowledged_by"], self.user.username)
        self.assertEqual(second["status"], "statistical_candidate")
        acknowledged.assert_called_once()
        result = self.client.get("/api/detection/candidates", {
            "dataset": str(self.dataset.id), "lot": self.lot.lot_no, "run": first["run_id"],
        }).json()
        self.assertEqual(result["candidates"][0]["acknowledged_by"], self.user.username)

    @patch("monitor.notifications.publish_candidate_notifications")
    def test_authenticated_nonteam_account_cannot_run_read_or_acknowledge(self, _publish):
        candidate_id = self.run_detection().json()["candidates"][0]["id"]
        outsider = get_user_model().objects.create_user("unassigned")
        self.client.force_authenticate(outsider)
        self.assertEqual(self.run_detection().status_code, 403)
        query = {"dataset": str(self.dataset.id), "lot": self.lot.lot_no}
        self.assertEqual(self.client.get("/api/detection/runs", query).status_code, 403)
        self.assertEqual(self.client.get("/api/detection/candidates", query).status_code, 403)
        self.assertEqual(self.client.post(
            f"/api/detection/candidates/{candidate_id}/acknowledge", {}, format="json",
        ).status_code, 403)
        self.assertFalse(AnomalyCandidate.objects.get().acknowledged)

    def test_authentication_csrf_and_request_bounds(self):
        anonymous = Client()
        self.assertIn(anonymous.post("/api/detection/runs", {}).status_code, [401, 403])
        protected = Client(enforce_csrf_checks=True)
        protected.force_login(self.user)
        self.assertEqual(protected.post(
            "/api/detection/runs", self.payload, content_type="application/json",
        ).status_code, 403)
        for changes in [
            {"channels": ["UNKNOWN"]}, {"channels": ["OP-Z3", "OP-Z3"]},
            {"channels": []}, {"threshold": 2}, {"threshold": True},
            {"ddof": 1}, {"ddof": False}, {"max_gap_seconds": 0},
            {"min_valid_samples": True}, {"min_valid_samples": 1},
            {"dataset_id": []}, {"lot_no": []},
        ]:
            self.assertEqual(self.run_detection(**changes).status_code, 400)
        self.lot.count = 200001
        self.lot.save(update_fields=["count"])
        self.assertEqual(self.run_detection().status_code, 400)
        self.assertFalse(DetectionRun.objects.exists())


@skipUnless(connection.vendor == "postgresql", "Concurrent deduplication requires PostgreSQL row locking.")
@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class ConcurrentDetectionTests(TransactionTestCase):
    @patch("monitor.notifications.publish_candidate_notifications")
    def test_simultaneous_identical_requests_save_and_notify_once(self, publish):
        user = get_user_model().objects.create_user("parallel")
        user.groups.add(Group.objects.get_or_create(name="field")[0])
        dataset = Dataset.objects.create(
            name="parallel", sha256="e" * 64, source_name="source.csv", status="ready", row_count=31,
        )
        frames = source_frames([50] * 30 + [0])
        LotSummary.objects.create(
            dataset=dataset, lot_no="240001", grade="SGCC",
            start=frames[0]["recorded_at"], end=frames[-1]["recorded_at"], count=31,
        )
        for frame in frames:
            frame.pop("id")
            MeasurementFrame.objects.create(
                dataset=dataset, lot_no="240001", grade="SGCC",
                recorded_at_raw=frame["recorded_at"], **frame,
            )
        barrier = Barrier(2)

        def analyze_together(*args, **kwargs):
            result = analyze_frames(*args, **kwargs)
            barrier.wait(timeout=10)
            return result

        def request():
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user)
                response = client.post("/api/detection/runs", {
                    "dataset_id": str(dataset.id), "lot_no": "240001", "channels": ["OP-Z3"],
                }, format="json")
                return response.status_code, response.json()["run"]["id"]
            finally:
                connections.close_all()

        with patch("monitor.detection_views.analyze_frames", side_effect=analyze_together):
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: request(), range(2)))
        self.assertEqual(sorted(status for status, _ in results), [200, 201])
        self.assertEqual(len({run_id for _, run_id in results}), 1)
        self.assertEqual(DetectionRun.objects.count(), 1)
        self.assertEqual(AnomalyCandidate.objects.count(), 1)
        self.assertEqual(CandidatePoint.objects.count(), 1)
        publish.assert_called_once()
