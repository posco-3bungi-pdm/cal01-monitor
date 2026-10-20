import csv
import hashlib
from concurrent.futures import ThreadPoolExecutor
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Barrier
from unittest import skipUnless

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import close_old_connections, connection, connections
from django.test import Client, TestCase, TransactionTestCase, override_settings

from monitor.channels import CHANNEL_IDS
from monitor.csv_import import ImportInProgress, register_csv
from monitor.models import Dataset, EquipmentLayout, LotSummary, MeasurementFrame


def csv_bytes(rows, *, raw=False):
    columns = ["MEAS_DT", "LOT_NO", *CHANNEL_IDS]
    if not raw:
        columns += ["ROW_ID", "GRADE", "LABEL", "EXCLUDED", "LABEL_REASON"]
    text = StringIO(newline="")
    writer = csv.DictWriter(text, fieldnames=columns)
    writer.writeheader()
    for index, updates in enumerate(rows):
        row = {channel: "10.5" for channel in CHANNEL_IDS}
        row.update(MEAS_DT=f"2024-01-02 03:36:{index:02}", LOT_NO="240001")
        if not raw:
            row.update(ROW_ID=f"r{index}", GRADE="SGCC", LABEL="", EXCLUDED="", LABEL_REASON="")
        row.update(updates)
        writer.writerow(row)
    return text.getvalue().encode("utf-8-sig")


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class DataUploadTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("field", password="only-for-tests")
        self.client = Client(enforce_csrf_checks=True)
        self.client.force_login(self.user)
        self.token = self.client.get("/api/csrf").json()["csrfToken"]

    def upload(self, content, *, client=None, name="source.csv", token=True, **fields):
        return (client or self.client).post("/api/datasets/import", {
            "file": SimpleUploadedFile(name, content, content_type="text/csv"), **fields,
        }, **({"HTTP_X_CSRFTOKEN": self.token} if token else {}))

    def test_anonymous_and_missing_csrf_cannot_import(self):
        content = csv_bytes([{}])
        self.assertEqual(self.upload(content, client=Client(), token=False).status_code, 401)
        self.assertEqual(self.upload(content, token=False).status_code, 403)
        self.assertFalse(Dataset.objects.exists())

    def test_cross_origin_cannot_import(self):
        response = self.client.post("/api/datasets/import", {
            "file": SimpleUploadedFile("source.csv", csv_bytes([{}])),
        }, HTTP_X_CSRFTOKEN=self.token, HTTP_ORIGIN="https://not-this-server.example")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Dataset.objects.exists())

    def test_processed_values_and_annotations_survive_duplicate_upload(self):
        content = csv_bytes([{
            "MEAS_DT": "2024-01-02 03:36:00.123456",
            "OP-Z3": "0", "TC-Z1": "", "CP-Z4M": "1.15176e-10",
            "LABEL": "1", "EXCLUDED": "False", "LABEL_REASON": "원본 설명",
        }])
        response = self.upload(content)
        self.assertEqual(response.status_code, 201, response.content)
        payload = response.json()
        first = MeasurementFrame.objects.get()
        self.assertEqual(first.recorded_at, "2024-01-02T03:36:00.123456")
        self.assertEqual(first.recorded_at_raw, "2024-01-02 03:36:00.123456")
        self.assertEqual(first.values["OP-Z3"], 0)
        self.assertIsNone(first.values["TC-Z1"])
        self.assertEqual(first.values["CP-Z4M"], 1.15176e-10)
        self.assertEqual(first.annotations["LABEL"], 1)
        self.assertIs(first.annotations["EXCLUDED"], False)
        self.assertEqual(first.annotations["EXCLUDED_RAW"], "False")
        self.assertEqual(first.annotations["LABEL_REASON"], "원본 설명")
        layout = EquipmentLayout.objects.create(placements=[{"existing": True}], revision=2)
        second = self.upload(content, name="renamed.csv")
        self.assertEqual(second.status_code, 200, second.content)
        self.assertTrue(second.json()["reused"])
        self.assertEqual(second.json()["dataset"]["id"], payload["dataset"]["id"])
        self.assertEqual(Dataset.objects.count(), 1)
        self.assertEqual(MeasurementFrame.objects.get().pk, first.pk)
        self.assertEqual(Dataset.objects.get().source_name, "source.csv")
        layout.refresh_from_db()
        self.assertEqual(layout.placements, [{"existing": True}])
        self.assertEqual(payload["dataset"]["sha256"], hashlib.sha256(content).hexdigest())
        self.assertIsNone(payload["source_timezone"])

    def test_raw_24_columns_generate_row_id_without_guessing_grade(self):
        response = self.upload(csv_bytes([{"TC-Z3": "-1.5"}, {"TC-Z3": "0"}], raw=True))
        self.assertEqual(response.status_code, 201, response.content)
        dataset = Dataset.objects.get()
        self.assertEqual(dataset.metadata["source_record_id_origin"], "source_row")
        self.assertFalse(dataset.metadata["grade_available"])
        self.assertEqual(LotSummary.objects.get().grade, "")
        self.assertEqual(list(dataset.frames.order_by("source_row").values_list("source_record_id", flat=True)),
                         ["source-row-1", "source-row-2"])

    def test_nonfinite_malformed_and_missing_columns_are_rejected(self):
        for value in ["nan", "NaN", "Infinity", "-inf", "not a number", "1e999"]:
            with self.subTest(value=value):
                response = self.upload(csv_bytes([{}, {"TC-Z3": value}]))
                self.assertEqual(response.status_code, 400, response.content)
                self.assertFalse(MeasurementFrame.objects.exists())
                self.assertFalse(LotSummary.objects.exists())
        for content in [b"MEAS_DT,LOT_NO\n2024-01-02,240001\n", b"\xff\xfe\x00", b""]:
            with self.subTest(content=content):
                self.assertIn(self.upload(content).status_code, (400, 413))
        self.assertFalse(Dataset.objects.filter(status="ready").exists())

    def test_duplicate_row_ids_and_excess_timestamp_precision_roll_back(self):
        for rows in [
            [{"ROW_ID": "same"}, {"ROW_ID": "same"}],
            [{"MEAS_DT": "2024-01-02T03:36:00.1234567"}],
            [{"MEAS_DT": "2024-01-02T03:36:00+09:00"}],
            [{"MEAS_DT": "2024-02-30T03:36:00"}],
            [{"LABEL": "2"}],
        ]:
            with self.subTest(rows=rows):
                self.assertEqual(self.upload(csv_bytes(rows)).status_code, 400)
                self.assertFalse(MeasurementFrame.objects.exists())

    @override_settings(CAL01_UPLOAD_MAX_ROWS=2000)
    def test_failure_after_first_bulk_insert_rolls_back_rows_and_preserves_existing_dataset(self):
        prior = self.upload(csv_bytes([{}])).json()["dataset"]["id"]
        first_id = MeasurementFrame.objects.get().pk
        rows = [{"MEAS_DT": "2024-01-02 03:36:00", "ROW_ID": f"bulk-{index}"} for index in range(2001)]
        response = self.upload(csv_bytes(rows))
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(MeasurementFrame.objects.count(), 1)
        self.assertEqual(MeasurementFrame.objects.get().pk, first_id)
        self.assertEqual(str(MeasurementFrame.objects.get().dataset_id), prior)
        self.assertEqual(LotSummary.objects.count(), 1)

    @override_settings(CAL01_UPLOAD_MAX_BYTES=200)
    def test_oversize_stream_is_stopped(self):
        response = self.upload(csv_bytes([{}]))
        self.assertEqual(response.status_code, 413, response.content)
        self.assertFalse(Dataset.objects.exists())

    @override_settings(CAL01_UPLOAD_MAX_BYTES=400)
    def test_content_length_rejected_before_parsing(self):
        response = self.client.post("/api/datasets/import", b"", content_type="multipart/form-data; boundary=test",
                                    CONTENT_LENGTH=str(2 * 1024 * 1024), HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(response.status_code, 413)

    def test_client_path_and_multiple_files_not_accepted(self):
        response = self.upload(csv_bytes([{}]), path="C:/some/private/file.csv")
        self.assertEqual(response.status_code, 400)
        response = self.client.post("/api/datasets/import", {
            "file": [SimpleUploadedFile("a.csv", csv_bytes([{}])),
                     SimpleUploadedFile("b.csv", csv_bytes([{}]))],
        }, HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(response.status_code, 413)
        self.assertFalse(Dataset.objects.exists())

    def test_same_invalid_upload_can_retry_without_orphaned_rows(self):
        content = csv_bytes([{"TC-Z3": "broken"}])
        self.assertEqual(self.upload(content).status_code, 400)
        self.assertEqual(self.upload(content).status_code, 400)
        self.assertEqual(Dataset.objects.count(), 1)
        self.assertEqual(Dataset.objects.get().status, "failed")
        self.assertFalse(MeasurementFrame.objects.exists())

    def test_import_service_does_not_modify_source_file(self):
        content = csv_bytes([{}], raw=True)
        with TemporaryDirectory() as folder:
            path = Path(folder) / "raw.csv"
            path.write_bytes(content)
            before = hashlib.sha256(path.read_bytes()).hexdigest()
            register_csv(path)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class PlaybackTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user("reader", password="only-for-tests")
        self.client.force_login(user)
        self.dataset = Dataset.objects.create(name="data", sha256="a" * 64, source_name="data.csv",
                                              status="ready", row_count=5)
        for lot, start, end, count in [
            ("240001", "2024-01-02T03:36:00.000001", "2024-01-02T07:00:00.000000", 4),
            ("240002", "2024-01-03T03:36:00.000000", "2024-01-03T03:36:00.000000", 1),
        ]:
            LotSummary.objects.create(dataset=self.dataset, lot_no=lot, grade="", start=start, end=end, count=count)
        for row, time, lot in [
            (1, "2024-01-02T07:00:00.000000", "240001"),
            (2, "2024-01-02T03:36:00.000001", "240001"),
            (3, "2024-01-02T03:36:00.000001", "240001"),
            (4, "2024-01-02T03:36:00.000002", "240001"),
            (5, "2024-01-03T03:36:00.000000", "240002"),
        ]:
            MeasurementFrame.objects.create(
                dataset=self.dataset, source_row=row, source_record_id=f"source-{row}",
                lot_no=lot, recorded_at=time, recorded_at_raw=time.replace("T", " "),
                values={**{channel: 10.5 for channel in CHANNEL_IDS}, "OP-Z3": 0,
                        "TC-Z1": None, "CP-Z4M": 1.15176e-10}, annotations={"LABEL": row % 2},
            )

    def page(self, **overrides):
        return self.client.get("/api/playback-frames", {
            "dataset": str(self.dataset.pk), "lot": "240001", "limit": 2, **overrides,
        })

    def test_chronological_pages_preserve_same_time_rows_null_zero_precision_and_gaps(self):
        first = self.page()
        self.assertEqual(first.status_code, 200)
        data = first.json()
        self.assertEqual([frame["source_row"] for frame in data["frames"]], [2, 3])
        self.assertTrue(data["has_more"])
        second = self.page(cursor=data["next_cursor"]).json()
        self.assertEqual([frame["source_row"] for frame in second["frames"]], [4, 1])
        self.assertFalse(second["has_more"])
        self.assertIsNone(second["next_cursor"])
        frame = second["frames"][0]
        self.assertEqual(frame["time"], "2024-01-02T03:36:00.000002")
        self.assertEqual(frame["values"]["OP-Z3"], 0)
        self.assertIsNone(frame["values"]["TC-Z1"])
        self.assertEqual(frame["values"]["CP-Z4M"], 1.15176e-10)
        self.assertEqual(frame["annotations"]["LABEL"], 0)
        self.assertEqual(second["frames"][1]["time"], "2024-01-02T07:00:00.000000")
        self.assertEqual(data["mode"], "historical")
        self.assertIsNone(data["source_timezone"])

    def test_cursor_is_bound_to_dataset_lot_range_and_signature(self):
        cursor = self.page().json()["next_cursor"]
        for changes in [
            {"cursor": cursor + "tampered"},
            {"cursor": cursor, "lot": "240002"},
            {"cursor": cursor, "start": "2024-01-02T03:36:00.000002"},
        ]:
            with self.subTest(changes=changes):
                self.assertEqual(self.page(**changes).status_code, 400)
        other = Dataset.objects.create(name="other", sha256="b" * 64, status="ready")
        LotSummary.objects.create(dataset=other, lot_no="240001", start="2024-01-02T03:36:00.000001",
                                  end="2024-01-02T07:00:00.000000", count=0)
        self.assertEqual(self.page(dataset=str(other.id), cursor=cursor).status_code, 400)

    def test_bounds_limits_and_private_access(self):
        for limit in ["0", "2001", "nan", "1.5"]:
            self.assertEqual(self.page(limit=limit).status_code, 400)
        self.assertEqual(len(self.page(limit=2000).json()["frames"]), 4)
        self.assertEqual(self.page(start="2024-01-03T00:00:00", end="2024-01-04T00:00:00").json()["frames"], [])
        self.assertEqual(self.page(start="2024-01-02T07:00:00", end="2024-01-02T03:36:00").status_code, 400)
        self.assertEqual(self.page(start="2024-01-02T03:36:00Z").status_code, 400)
        self.assertEqual(self.page(lot="missing").status_code, 404)
        self.client.logout()
        self.assertIn(self.page().status_code, [401, 403])


@skipUnless(connection.vendor == "postgresql", "Concurrent registration uses PostgreSQL row locks.")
class ConcurrentImportTests(TransactionTestCase):
    def test_same_file_concurrently_never_duplicates_or_overwrites(self):
        with TemporaryDirectory() as folder:
            source = Path(folder) / "same.csv"
            source.write_bytes(csv_bytes([{}, {}]))
            barrier = Barrier(2)

            def register():
                close_old_connections()
                try:
                    barrier.wait(timeout=10)
                    try:
                        dataset, reused = register_csv(source, retry_failed=True)
                        return "reused" if reused else "created", str(dataset.pk)
                    except ImportInProgress:
                        return "in_progress", None
                finally:
                    connections.close_all()

            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: register(), range(2)))
        self.assertEqual(sum(status == "created" for status, _ in results), 1)
        self.assertTrue(all(status in {"created", "reused", "in_progress"} for status, _ in results))
        self.assertEqual(Dataset.objects.count(), 1)
        self.assertEqual(Dataset.objects.get().status, "ready")
        self.assertEqual(MeasurementFrame.objects.count(), 2)
        self.assertEqual(LotSummary.objects.get().count, 2)
