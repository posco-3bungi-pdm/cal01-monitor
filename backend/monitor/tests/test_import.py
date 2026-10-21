import csv
import hashlib
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from monitor.channels import CHANNEL_IDS
from monitor.models import Dataset, MeasurementFrame


class CsvImportTests(TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "source.csv"

    def write_rows(self, changes=None):
        rows = []
        for index in range(2):
            row = {channel: "10.5" for channel in CHANNEL_IDS}
            row.update(
                ROW_ID=f"r{index}", MEAS_DT=f"2024-01-02 03:36:0{index}",
                LOT_NO="240001", GRADE="SGCC", LABEL=str(index), EXCLUDED="False",
            )
            rows.append(row)
        rows[0].update({"OP-Z3": "0", "TC-Z1": "", "CP-Z4M": "1.15176e-10"})
        if changes:
            changes(rows)
        with self.path.open("w", encoding="utf-8-sig", newline="") as target:
            writer = csv.DictWriter(target, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)

    def run_import(self):
        call_command("import_cal01", self.path, stdout=StringIO())

    def test_source_values_time_labels_and_reimport_are_preserved(self):
        self.write_rows()
        before = hashlib.sha256(self.path.read_bytes()).hexdigest()
        self.run_import()
        self.run_import()
        self.assertEqual(Dataset.objects.count(), 1)
        self.assertEqual(MeasurementFrame.objects.count(), 2)
        first = MeasurementFrame.objects.get(source_row=1)
        self.assertEqual(first.recorded_at, "2024-01-02T03:36:00.000000")
        self.assertEqual(first.values["OP-Z3"], 0)
        self.assertIsNone(first.values["TC-Z1"])
        self.assertEqual(first.values["CP-Z4M"], 1.15176e-10)
        self.assertEqual(first.annotations["LABEL"], 0)
        self.assertEqual(Dataset.objects.get().metadata["label_counts"], {"0": 1, "1": 1})
        self.assertEqual(hashlib.sha256(self.path.read_bytes()).hexdigest(), before)

    def test_duplicate_source_id_rolls_back_every_row(self):
        self.write_rows(lambda rows: rows[1].update(ROW_ID="r0"))
        with self.assertRaises(CommandError):
            self.run_import()
        self.assertFalse(MeasurementFrame.objects.exists())
        self.assertEqual(Dataset.objects.get().status, "failed")

    def test_invalid_value_does_not_turn_into_zero(self):
        self.write_rows(lambda rows: rows[1].update({"TC-Z3": "nan"}))
        with self.assertRaises(CommandError):
            self.run_import()
        self.assertFalse(MeasurementFrame.objects.exists())
