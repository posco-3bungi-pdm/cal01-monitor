from copy import deepcopy
from io import StringIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command, CommandError
from django.test import TestCase
from rest_framework.test import APIClient

from monitor.models import Dataset, OperationalRecord


def record(record_id, kind, start, end=None, **extra):
    return {
        "id": record_id, "type": kind, "start": start, "end": end,
        "precision": "linked-work" if kind == "parts" else "second",
        "title": record_id, "equipment": "P1-CR1-CAL01",
        "source": "test-source.csv", "sourceId": record_id, "details": {},
        **extra,
    }


class OperationalRecordTests(TestCase):
    def setUp(self):
        self.dataset = Dataset.objects.create(
            name="test", sha256="e" * 64, source_name="test.csv", status="ready",
        )
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "records.json"
        self.payloads = [
            record("op1", "operation", "2024-06-10T11:30:00"),
            record("detect1", "detection", "2024-06-10T12:31:00"),
            record("work1", "maintenance", "2024-06-10T10:00:00", "2024-06-10T12:00:00"),
            record(
                "parts1", "parts", "2024-06-10T12:00:00", "2024-06-10T14:00:00",
                details={"replacementTimeKnown": False, "linkedTimeSource": "maintenance.csv"},
            ),
            record(
                "plan1", "plan", "2024-06-10T00:00:00", "2024-06-15T00:00:00",
                precision="date",
                details={"startDate": "2024-06-10", "endDate": "2024-06-14", "endExclusive": True},
            ),
        ]
        self.client = APIClient()
        self.client.force_authenticate(user=get_user_model().objects.create_user("reader"))

    def write(self, payloads=None):
        self.path.write_text(json.dumps(payloads or self.payloads, ensure_ascii=False), encoding="utf-8")

    def import_records(self):
        call_command("import_context", str(self.dataset.pk), str(self.path), stdout=StringIO())

    def query(self, start, end):
        return self.client.get("/api/records", {
            "dataset": str(self.dataset.pk), "start": start, "end": end,
        })

    def test_point_and_interval_overlap_include_boundaries(self):
        self.write()
        self.import_records()
        result = self.query("2024-06-10T11:30:00", "2024-06-10T12:30:00").json()
        self.assertEqual({item["id"] for item in result["records"]}, {"op1", "work1", "parts1", "plan1"})
        boundary = self.query("2024-06-10T12:00:00", "2024-06-10T12:00:00").json()
        self.assertIn("work1", {item["id"] for item in boundary["records"]})

    def test_date_only_plan_uses_inclusive_dates_not_export_midnight(self):
        self.write()
        self.import_records()
        result = self.query("2024-06-14T23:00:00", "2024-06-14T23:59:59").json()
        plan = result["records"][0]
        self.assertEqual((plan["start"], plan["end"]), ("2024-06-10", "2024-06-14"))
        self.assertEqual(plan["time_basis"], "source_calendar_date")
        self.assertTrue(plan["end_inclusive"])
        self.assertEqual(self.query("2024-06-15T00:00:00", "2024-06-15T01:00:00").json()["count"], 0)
        saved = OperationalRecord.objects.get(source_record_id="plan1")
        self.assertEqual(saved.start, "2024-06-10T00:00:00")
        self.assertEqual(saved.payload, self.payloads[-1])

    def test_parts_keep_linked_work_precision_and_original_payload(self):
        self.write()
        self.import_records()
        result = self.query("2024-06-10T13:00:00", "2024-06-10T13:01:00").json()
        part = next(item for item in result["records"] if item["type"] == "parts")
        self.assertEqual(part["precision"], "linked-work")
        self.assertFalse(part["details"]["replacementTimeKnown"])

    def test_duplicate_file_is_idempotent_and_records_require_login(self):
        self.write()
        self.import_records()
        self.import_records()
        self.assertEqual(OperationalRecord.objects.count(), 5)
        self.dataset.refresh_from_db()
        self.assertEqual(len(self.dataset.metadata["context_exports"]), 1)
        self.client.force_authenticate(user=None)
        self.assertIn(self.query("2024-06-10T00:00:00", "2024-06-15T00:00:00").status_code, [401, 403])

    def test_changed_existing_record_never_overwrites_or_partially_imports(self):
        self.write()
        self.import_records()
        changed = deepcopy(self.payloads)
        changed[0]["title"] = "changed"
        changed.insert(0, record("new", "operation", "2024-06-10T11:00:00"))
        self.write(changed)
        with self.assertRaises(CommandError):
            self.import_records()
        self.assertEqual(OperationalRecord.objects.count(), 5)
        self.assertEqual(OperationalRecord.objects.get(source_record_id="op1").title, "op1")

    def test_duplicate_ids_and_file_changed_during_import_roll_back(self):
        self.write(self.payloads + [self.payloads[0]])
        with self.assertRaises(CommandError):
            self.import_records()
        self.assertEqual(OperationalRecord.objects.count(), 0)
        self.write()
        with patch(
            "monitor.management.commands.import_context.digest",
            side_effect=["a" * 64, "b" * 64],
        ), self.assertRaises(CommandError):
            self.import_records()
        self.assertEqual(OperationalRecord.objects.count(), 0)

    def test_ambiguous_plan_dates_and_source_timezone_are_rejected(self):
        for changes in [{"details": {}}, {"start": "2024-06-10T11:30:00Z", "type": "operation", "precision": "second"}]:
            payload = deepcopy(self.payloads[-1])
            payload.update(changes)
            self.write([payload])
            with self.assertRaises(CommandError):
                self.import_records()
        self.assertEqual(OperationalRecord.objects.count(), 0)
