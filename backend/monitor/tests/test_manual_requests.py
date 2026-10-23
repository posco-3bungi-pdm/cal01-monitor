from unittest.mock import patch

from django.db.models.deletion import ProtectedError
from django.test import TestCase, override_settings

from monitor.detection_models import AnomalyCandidate, DetectionRun
from monitor.models import Dataset, LotSummary
from monitor.tests.test_workflow import client_for, team_user
from monitor.workflow_models import FieldRequest, FieldRequestHistory, FieldRequestSubmission, Notification


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class ManualRequestTests(TestCase):
    def setUp(self):
        self.operator = team_user("manual-operator", "monitoring")
        self.technician = team_user("manual-technician", "field")
        self.client = client_for(self.operator)
        self.field_client = client_for(self.technician)
        self.dataset = Dataset.objects.create(name="Manual request test", sha256="d" * 64, source_name="test.csv", status="ready")
        self.lot = LotSummary.objects.create(dataset=self.dataset, lot_no="240037", start="2024-04-13T23:16:00.000000", end="2024-04-14T09:27:00.000000", count=10)
        self.payload = {"dataset_id": str(self.dataset.id), "lot_no": self.lot.lot_no,
                        "channel_id": "CP-Z4M", "start": "2024-04-14T01:00:00", "end": "2024-04-14T01:05:00",
                        "message": "CP 계측 상태와 해당 시각 운전 기록 확인", "idempotency_key": "manual-test-1"}

    def test_direct_request_creates_no_anomaly_and_keeps_context_through_full_workflow(self):
        response = self.field_client.post("/api/field-requests", {**self.payload, "zone_id": "spoof"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        item = response.data["request"]
        self.assertEqual(item["source"], "manual")
        self.assertIsNone(item["candidate_id"])
        self.assertIsNone(item["run_id"])
        self.assertEqual(item["zone_id"], "Z4")
        self.assertEqual(item["channel_id"], "CP-Z4M")
        self.assertEqual(item["start"], "2024-04-14T01:00:00.000000")
        for client, action in [(self.field_client, "accept"), (self.field_client, "complete"), (self.client, "close")]:
            response = client.post(f"/api/field-requests/{item['id']}/transition",
                                   {"action": action, "revision": item["revision"], "result": "점검 결과 기록"}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            item = response.data["request"]
        self.assertEqual(item["status"], "closed")
        self.assertEqual(FieldRequestHistory.objects.count(), 4)
        self.assertEqual(Notification.objects.count(), 4)
        self.assertFalse(AnomalyCandidate.objects.exists())
        self.assertFalse(DetectionRun.objects.exists())
        for event in self.client.get("/api/notifications").data["notifications"]:
            self.assertIsNone(event["candidate_id"])
            self.assertEqual(event["request_id"], item["id"])
            self.assertEqual(event["dataset_id"], str(self.dataset.id))
            self.assertEqual(event["lot_no"], self.lot.lot_no)
        self.assertEqual(self.client.get(f"/api/field-requests/{item['id']}").data["request"]["source"], "manual")

    def test_retries_and_duplicate_direct_requests_do_not_add_records_or_notifications(self):
        created = self.client.post("/api/field-requests", self.payload, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        repeated = self.client.post("/api/field-requests", self.payload, format="json")
        self.assertEqual(repeated.status_code, 200)
        self.assertTrue(repeated.data["reused"])
        self.assertEqual(repeated.data["request"]["id"], created.data["request"]["id"])
        self.assertEqual(self.client.post("/api/field-requests", {**self.payload, "channel_id": "TC-Z3"}, format="json").status_code, 409)
        self.assertEqual(self.client.post("/api/field-requests", {**self.payload, "idempotency_key": "new-key"}, format="json").status_code, 409)
        self.assertEqual(FieldRequest.objects.count(), 1)
        self.assertEqual(FieldRequestSubmission.objects.count(), 1)
        self.assertEqual(Notification.objects.count(), 1)

    def test_invalid_or_unrelated_contexts_are_rejected_without_creating_anything(self):
        changes = [{"dataset_id": "bad"}, {"lot_no": "unknown"}, {"channel_id": "OP-Z9"},
                   {"start": "2024-04-12T00:00:00"}, {"end": "2024-04-15T00:00:00"},
                   {"end": "2024-04-14T00:59:59"}, {"start": "invalid"},
                   {"start": "2024-04-14T01:00:00+09:00"}, {"message": ""}]
        for change in changes:
            response = self.client.post("/api/field-requests", {**self.payload, **change}, format="json")
            self.assertIn(response.status_code, [400, 404], response.data)
        self.assertFalse(FieldRequest.objects.exists())
        self.assertFalse(Notification.objects.exists())

    def test_team_membership_is_still_required_for_direct_requests(self):
        response = client_for(team_user("manual-outsider")).post("/api/field-requests", self.payload, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(FieldRequest.objects.exists())

    def test_notification_failure_rolls_back_the_direct_request_and_its_receipt(self):
        with patch("monitor.workflow_views.publish_request_notification", side_effect=RuntimeError("test failure")):
            with self.assertRaises(RuntimeError):
                self.client.post("/api/field-requests", self.payload, format="json")
        self.assertFalse(FieldRequest.objects.exists())
        self.assertFalse(FieldRequestSubmission.objects.exists())
        self.assertFalse(FieldRequestHistory.objects.exists())

    def test_direct_request_protects_its_original_dataset_reference(self):
        self.assertEqual(self.client.post("/api/field-requests", self.payload, format="json").status_code, 201)
        with self.assertRaises(ProtectedError):
            self.dataset.delete()
