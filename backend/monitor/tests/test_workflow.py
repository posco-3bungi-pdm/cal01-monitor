from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import close_old_connections, connection, connections
from django.test import Client, TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from monitor.detection_models import AnomalyCandidate, DetectionRun
from monitor.models import Dataset
from monitor.notifications import publish_candidate_acknowledged, publish_candidate_notifications
from monitor.workflow_models import FieldRequest, FieldRequestHistory, FieldRequestSubmission, Notification


def team_user(username, team=None, staff=False):
    user = get_user_model().objects.create_user(
        username, password="test-password-only", first_name=username.upper(), is_staff=staff,
    )
    if team:
        user.groups.add(Group.objects.get_or_create(name=team)[0])
    return user


def candidate_fixture(actor):
    dataset = Dataset.objects.create(
        name="Workflow test", sha256="b" * 64, source_name="test.csv", status="ready",
    )
    run = DetectionRun.objects.create(
        dataset=dataset, lot_no="240001", config_hash="c" * 64, created_by=actor,
    )
    return AnomalyCandidate.objects.create(
        run=run, channel_id="TC-Z3", zone_id="Z3",
        start="2024-01-02T04:00:00.000000", end="2024-01-02T04:00:05.000000",
        peak_at="2024-01-02T04:00:00.000000", peak_value=870.5, peak_z=3.4,
        point_count=2, end_reason="normal",
    )


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def create_payload(candidate, key="request-test-1", message="같은 시각의 조업 상태 확인 부탁드립니다."):
    return {"candidate_id": str(candidate.id), "message": message, "idempotency_key": key}


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class WorkflowTests(TestCase):
    def setUp(self):
        self.monitor = team_user("monitor", "monitoring")
        self.field = team_user("field", "field")
        self.other_field = team_user("other_field", "field")
        self.admin = team_user("admin", staff=True)
        self.candidate = candidate_fixture(self.monitor)
        self.monitor_client = client_for(self.monitor)
        self.field_client = client_for(self.field)

    def create_request(self, client=None, key="request-test-1"):
        response = (client or self.monitor_client).post(
            "/api/field-requests", create_payload(self.candidate, key), format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["request"]

    def move(self, client, item, action, result=None):
        payload = {"action": action, "revision": item["revision"]}
        if result is not None:
            payload["result"] = result
        return client.post(
            f"/api/field-requests/{item['id']}/transition", payload, format="json",
        )

    def test_full_workflow_keeps_request_history_and_source_data(self):
        item = self.create_request(client=self.field_client)
        self.assertEqual(item["requested_by"]["username"], self.field.username)
        self.assertEqual(item["start"], self.candidate.start)
        self.assertEqual(item["dataset_id"], str(self.candidate.run.dataset_id))
        self.assertIsNone(item["assigned_to"])
        self.assertEqual(item["revision"], 1)
        response = self.move(self.field_client, item, "accept")
        self.assertEqual(response.status_code, 200)
        item = response.data["request"]
        self.assertEqual(item["assigned_to"]["username"], self.field.username)
        response = self.move(self.field_client, item, "complete", "조업 기록과 대조했고 담당자에게 확인 요청함.")
        self.assertEqual(response.status_code, 200)
        item = response.data["request"]
        self.assertEqual(item["status"], "completed")
        response = self.move(self.monitor_client, item, "close")
        self.assertEqual(response.status_code, 200)
        item = response.data["request"]
        self.assertEqual(item["status"], "closed")
        self.assertEqual(item["revision"], 4)
        self.assertTrue(all(item[name] for name in ["accepted_at", "completed_at", "closed_at"]))
        detail = self.monitor_client.get(f"/api/field-requests/{item['id']}")
        self.assertEqual([event["action"] for event in detail.data["history"]], ["create", "accept", "complete", "close"])
        self.assertEqual(list(Notification.objects.values_list("kind", flat=True)), [
            "request_created", "request_accepted", "request_completed", "request_closed",
        ])
        self.candidate.refresh_from_db()
        self.assertFalse(self.candidate.acknowledged)
        self.assertEqual(self.candidate.peak_value, 870.5)
        self.assertEqual(self.candidate.point_count, 2)
        self.assertEqual(FieldRequestSubmission.objects.count(), 1)

    def test_same_key_is_reused_but_payload_conflicts_and_open_duplicates_are_rejected(self):
        item = self.create_request()
        original = create_payload(self.candidate)
        response = self.monitor_client.post("/api/field-requests", original, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["reused"])
        self.assertEqual(response.data["request"]["id"], item["id"])
        response = self.monitor_client.post(
            "/api/field-requests", {**original, "message": "내용을 바꿔 다시 보냄"}, format="json",
        )
        self.assertEqual(response.status_code, 409)
        response = self.field_client.post(
            "/api/field-requests", create_payload(self.candidate, "another-key"), format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["request"]["id"], item["id"])
        self.assertEqual(FieldRequest.objects.count(), 1)
        self.assertEqual(FieldRequestHistory.objects.count(), 1)
        self.assertEqual(Notification.objects.count(), 1)
        self.assertEqual(FieldRequestSubmission.objects.count(), 1)

    def test_a_closed_candidate_can_have_a_new_request_without_changing_old_receipt(self):
        original = self.create_request()
        item = self.move(self.field_client, original, "accept").data["request"]
        item = self.move(self.field_client, item, "complete", "현장 확인 결과").data["request"]
        item = self.move(self.monitor_client, item, "close").data["request"]
        second = self.create_request(key="new-request-after-close")
        self.assertNotEqual(original["id"], second["id"])
        reused = self.monitor_client.post("/api/field-requests", create_payload(self.candidate), format="json")
        self.assertEqual(reused.status_code, 200)
        self.assertEqual(reused.data["request"]["id"], original["id"])
        self.assertEqual(reused.data["request"]["status"], "closed")

    def test_roles_assignment_and_transition_order_are_enforced(self):
        item = self.create_request()
        self.assertEqual(self.move(self.monitor_client, item, "accept").status_code, 403)
        self.assertEqual(self.move(self.monitor_client, item, "close").status_code, 409)
        self.assertEqual(self.move(self.field_client, item, "complete", "결과").status_code, 409)
        item = self.move(self.field_client, item, "accept").data["request"]
        self.assertEqual(self.move(client_for(self.other_field), item, "complete", "결과").status_code, 403)
        self.assertEqual(self.move(client_for(self.admin), item, "complete", "결과").status_code, 403)
        self.assertEqual(self.move(self.field_client, item, "complete", "  ").status_code, 400)
        self.assertEqual(self.move(self.field_client, item, "close").status_code, 403)
        item = self.move(self.field_client, item, "complete", "결과 확인").data["request"]
        self.assertEqual(self.move(self.field_client, item, "close").status_code, 403)
        self.assertEqual(self.move(client_for(self.admin), item, "close").status_code, 200)

    def test_stale_revision_does_not_overwrite_assignment_or_add_events(self):
        item = self.create_request()
        self.assertEqual(self.move(self.field_client, item, "accept").status_code, 200)
        response = self.move(client_for(self.other_field), item, "accept")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["request"]["assigned_to"]["username"], self.field.username)
        self.assertEqual(FieldRequestHistory.objects.count(), 2)
        self.assertEqual(Notification.objects.count(), 2)

    def test_missing_team_and_anonymous_users_cannot_read_or_write(self):
        outsider = client_for(team_user("outsider"))
        for client in [outsider, APIClient()]:
            for endpoint in ["field-requests", "field-users", "notifications"]:
                self.assertIn(client.get("/api/" + endpoint).status_code, [401, 403])
            self.assertIn(client.post(
                "/api/field-requests", create_payload(self.candidate), format="json",
            ).status_code, [401, 403])
        self.assertFalse(FieldRequest.objects.exists())

    def test_requests_require_session_csrf(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.field)
        self.assertEqual(client.get("/api/field-requests").status_code, 200)
        self.assertEqual(client.post(
            "/api/field-requests", create_payload(self.candidate), content_type="application/json",
        ).status_code, 403)
        token = client.get("/api/csrf").json()["csrfToken"]
        response = client.post(
            "/api/field-requests", create_payload(self.candidate), content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(response.status_code, 201)
        item = response.json()["request"]
        self.assertEqual(client.post(
            f"/api/field-requests/{item['id']}/transition",
            {"action": "accept", "revision": 1}, content_type="application/json",
        ).status_code, 403)

    def test_invalid_inputs_are_rejected_without_writes(self):
        valid = create_payload(self.candidate)
        for payload in [
            [], {**valid, "candidate_id": "bad"}, {**valid, "message": ""},
            {**valid, "message": "a" * 4001}, {**valid, "idempotency_key": ""},
        ]:
            self.assertEqual(self.monitor_client.post("/api/field-requests", payload, format="json").status_code, 400)
        self.assertFalse(FieldRequest.objects.exists())
        item = self.create_request()
        for revision in [True, 0, -1, "1"]:
            self.assertEqual(self.field_client.post(
                f"/api/field-requests/{item['id']}/transition",
                {"action": "accept", "revision": revision}, format="json",
            ).status_code, 400)
        self.assertEqual(self.monitor_client.get("/api/field-requests?status=invalid").status_code, 400)

    def test_failures_roll_back_request_history_receipt_and_notifications(self):
        with patch("monitor.workflow_views.publish_request_notification", side_effect=RuntimeError("test failure")):
            with self.assertRaises(RuntimeError):
                self.create_request()
        self.assertFalse(FieldRequest.objects.exists())
        self.assertFalse(FieldRequestHistory.objects.exists())
        self.assertFalse(FieldRequestSubmission.objects.exists())
        self.assertFalse(Notification.objects.exists())
        item = self.create_request()
        with patch("monitor.workflow_views.publish_request_notification", side_effect=RuntimeError("test failure")):
            with self.assertRaises(RuntimeError):
                self.move(self.field_client, item, "accept")
        stored = FieldRequest.objects.get(pk=item["id"])
        self.assertEqual(stored.status, "requested")
        self.assertEqual(stored.revision, 1)
        self.assertIsNone(stored.assigned_to)
        self.assertEqual(FieldRequestHistory.objects.count(), 1)
        self.assertEqual(Notification.objects.count(), 1)

    def test_history_is_append_only_and_roster_contains_only_active_field_users(self):
        item = self.create_request()
        history = FieldRequestHistory.objects.get(request_id=item["id"])
        history.result = "rewrite"
        with self.assertRaises(ValueError):
            history.save()
        with self.assertRaises(ValueError):
            history.delete()
        self.other_field.is_active = False
        self.other_field.save()
        users = self.monitor_client.get("/api/field-users").data["users"]
        self.assertEqual(users, [{"username": self.field.username, "display_name": self.field.first_name}])
        self.assertEqual(len(self.monitor_client.get("/api/field-requests?status=requested").data["requests"]), 1)
        self.assertEqual(self.monitor_client.get("/api/field-requests?status=closed").data["requests"], [])

    def test_notifications_are_shared_paginated_deduplicated_and_link_to_original_candidate(self):
        first = publish_candidate_notifications([self.candidate], self.monitor)[0]
        duplicate = publish_candidate_notifications([self.candidate], self.monitor)[0]
        self.assertEqual(first.id, duplicate.id)
        publish_candidate_acknowledged(self.candidate, self.monitor)
        publish_candidate_acknowledged(self.candidate, self.field)
        self.create_request()
        first_page = self.field_client.get("/api/notifications?after=0&limit=1").data
        self.assertEqual(len(first_page["notifications"]), 1)
        self.assertTrue(first_page["has_more"])
        event = first_page["notifications"][0]
        self.assertEqual(first_page["last_id"], event["id"])
        self.assertEqual(event["candidate_id"], str(self.candidate.id))
        self.assertEqual(event["dataset_id"], str(self.candidate.run.dataset_id))
        self.assertEqual(event["lot_no"], "240001")
        self.assertEqual(event["start"], self.candidate.start)
        second_page = self.field_client.get(f"/api/notifications?after={first_page['last_id']}&limit=1").data
        third_page = self.field_client.get(f"/api/notifications?after={second_page['last_id']}&limit=1").data
        self.assertFalse(third_page["has_more"])
        empty = self.field_client.get(f"/api/notifications?after={third_page['last_id']}").data
        self.assertEqual(empty, {"notifications": [], "last_id": third_page["last_id"], "has_more": False})
        all_events = self.monitor_client.get("/api/notifications").data["notifications"]
        self.assertEqual(len(all_events), 3)
        self.assertEqual(all_events[1]["actor"]["username"], self.monitor.username)
        for query in ["after=-1", "after=abc", "limit=0", "limit=101", "after=" + "1" * 5000]:
            self.assertEqual(self.monitor_client.get("/api/notifications?" + query).status_code, 400)

    def test_filtered_notification_rows_do_not_advance_past_returned_page(self):
        first = publish_candidate_notifications([self.candidate], self.monitor)[0]
        hidden = Notification.objects.create(
            event_key="monitoring-only", kind="private-test", title="test", recipient_team="monitoring",
        )
        last = publish_candidate_acknowledged(self.candidate, self.monitor)
        page = self.field_client.get("/api/notifications?limit=1").data
        self.assertEqual(page["last_id"], first.id)
        self.assertTrue(page["has_more"])
        page = self.field_client.get(f"/api/notifications?after={first.id}&limit=1").data
        self.assertEqual(page["last_id"], last.id)
        self.assertEqual([item["id"] for item in page["notifications"]], [last.id])
        self.assertNotEqual(hidden.id, last.id)


@skipUnless(connection.vendor == "postgresql", "Row locks require PostgreSQL.")
@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class ConcurrentWorkflowTests(TransactionTestCase):
    def setUp(self):
        self.monitor = team_user("monitor", "monitoring")
        self.field = team_user("field", "field")
        self.other_field = team_user("other_field", "field")
        self.candidate = candidate_fixture(self.monitor)

    def parallel_posts(self, actions):
        barrier = Barrier(len(actions))

        def execute(action):
            user, url, payload = action
            close_old_connections()
            try:
                client = client_for(get_user_model().objects.get(pk=user.pk))
                barrier.wait(timeout=10)
                return client.post(url, payload, format="json").status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=len(actions)) as pool:
            return list(pool.map(execute, actions))

    def test_two_creators_cannot_create_duplicate_open_requests(self):
        statuses = self.parallel_posts([
            (self.field, "/api/field-requests", create_payload(self.candidate, "field-key")),
            (self.monitor, "/api/field-requests", create_payload(self.candidate, "monitor-key")),
        ])
        self.assertEqual(sorted(statuses), [201, 409])
        self.assertEqual(FieldRequest.objects.count(), 1)
        self.assertEqual(FieldRequestHistory.objects.count(), 1)
        self.assertEqual(Notification.objects.count(), 1)

    def test_same_idempotency_key_concurrently_reuses_one_request(self):
        statuses = self.parallel_posts([
            (self.field, "/api/field-requests", create_payload(self.candidate)),
            (self.field, "/api/field-requests", create_payload(self.candidate)),
        ])
        self.assertEqual(sorted(statuses), [200, 201])
        self.assertEqual(FieldRequestSubmission.objects.count(), 1)
        self.assertEqual(Notification.objects.count(), 1)

    def test_only_one_assignee_claims_the_same_revision(self):
        item = client_for(self.monitor).post(
            "/api/field-requests", create_payload(self.candidate), format="json",
        ).data["request"]
        url = f"/api/field-requests/{item['id']}/transition"
        statuses = self.parallel_posts([
            (self.field, url, {"action": "accept", "revision": 1}),
            (self.other_field, url, {"action": "accept", "revision": 1}),
        ])
        self.assertEqual(sorted(statuses), [200, 409])
        self.assertEqual(FieldRequestHistory.objects.count(), 2)
        self.assertEqual(Notification.objects.count(), 2)
