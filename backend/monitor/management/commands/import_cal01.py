"""Register a read-only CAL01 CSV in this application's database."""
import csv
import hashlib
import math
from collections import Counter
from datetime import datetime
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from monitor.channels import CHANNEL_IDS
from monitor.models import Dataset, LotSummary, MeasurementFrame

ANNOTATIONS = [
    "LABEL", "EXCLUDED", "EXCLUSION_REASON", "LABEL_STATUS", "LABEL_REASON",
    "RULE", "EVIDENCE_WO", "LABEL_VERSION", "FEATURES_COMPLETE", "MODEL_ELIGIBLE",
]


def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def number(raw, name, row):
    if raw is None or not raw.strip():
        return None
    try:
        value = float(raw)
    except ValueError as exc:
        raise ValueError(f"{row}행 {name}: 숫자가 아닙니다.") from exc
    if not math.isfinite(value):
        raise ValueError(f"{row}행 {name}: 유한한 숫자 또는 빈 값이어야 합니다.")
    return value


class Command(BaseCommand):
    help = "원본 CSV를 바꾸지 않고 새 데이터베이스에 등록합니다."

    def add_arguments(self, parser):
        parser.add_argument("source", type=Path)
        parser.add_argument("--name", default="")
        parser.add_argument("--retry-failed", action="store_true")

    def handle(self, *args, **options):
        path = options["source"].expanduser().resolve()
        if not path.is_file() or path.suffix.lower() != ".csv":
            raise CommandError("읽을 수 있는 CSV 파일을 지정하세요.")
        fingerprint = file_hash(path)
        dataset, created = Dataset.objects.get_or_create(
            sha256=fingerprint,
            defaults={
                "name": options["name"] or path.stem,
                "source_name": path.name,
                "source_size": path.stat().st_size,
            },
        )
        if not created and dataset.status == Dataset.Status.READY:
            self.stdout.write(f"이미 등록된 데이터: {dataset.id} / {dataset.row_count:,}행")
            return
        if not created and not (
            options["retry_failed"] and dataset.status == Dataset.Status.FAILED
        ):
            raise CommandError("등록 중인 파일입니다. 실패한 등록만 --retry-failed로 다시 실행하세요.")

        try:
            with transaction.atomic():
                dataset = Dataset.objects.select_for_update().get(pk=dataset.pk)
                dataset.status = Dataset.Status.IMPORTING
                dataset.save(update_fields=["status"])
                total, lots, labels, columns = self.import_rows(dataset, path)
                if file_hash(path) != fingerprint:
                    raise ValueError("등록 중 원본 파일이 변경되어 저장을 취소했습니다.")
                LotSummary.objects.bulk_create([
                    LotSummary(dataset=dataset, lot_no=lot, **summary)
                    for lot, summary in lots.items()
                ])
                dataset.row_count = total
                dataset.status = Dataset.Status.READY
                dataset.metadata = {
                    "channels": CHANNEL_IDS,
                    "source_columns": columns,
                    "imported_annotation_columns": [key for key in ANNOTATIONS if key in columns],
                    "source_timezone": None,
                    "time_basis": "source_recorded_clock",
                    "label_counts": dict(labels),
                    "label_meaning": "원본 CSV의 임시 라벨. 고장 확정이나 실시간 감지 결과가 아님.",
                }
                dataset.save(update_fields=["row_count", "status", "metadata"])
        except Exception as exc:
            Dataset.objects.filter(pk=dataset.pk).update(status=Dataset.Status.FAILED)
            raise CommandError(f"등록하지 못했습니다: {exc}") from exc
        self.stdout.write(self.style.SUCCESS(
            f"등록 완료: {dataset.id} / {total:,}행 / {len(lots)} LOT / {len(CHANNEL_IDS)}채널"
        ))

    def import_rows(self, dataset, path):
        lots, labels, pending = {}, Counter(), []
        total = 0
        with path.open("r", encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            columns = reader.fieldnames or []
            required = {"ROW_ID", "MEAS_DT", "LOT_NO", "GRADE", *CHANNEL_IDS}
            missing = required - set(columns)
            if missing:
                raise ValueError("필요한 열이 없습니다: " + ", ".join(sorted(missing)))
            if len(columns) != len(set(columns)):
                raise ValueError("같은 이름의 열이 두 번 들어 있습니다.")
            for row_number, row in enumerate(reader, start=1):
                if None in row or any(value is None for value in row.values()):
                    raise ValueError(f"{row_number}행: 열 개수가 맞지 않습니다.")
                lot, grade, record_id = row["LOT_NO"].strip(), row["GRADE"].strip(), row["ROW_ID"].strip()
                if not lot or not record_id:
                    raise ValueError(f"{row_number}행: LOT_NO와 ROW_ID가 필요합니다.")
                raw_time = row["MEAS_DT"]
                timestamp = datetime.fromisoformat(raw_time.strip())
                if timestamp.tzinfo is not None:
                    raise ValueError(f"{row_number}행: 시간대가 있는 시각은 별도 확인이 필요합니다.")
                time = timestamp.isoformat(timespec="microseconds")
                values = {channel: number(row[channel], channel, row_number) for channel in CHANNEL_IDS}
                annotations = {key: row[key] for key in ANNOTATIONS if key in row}
                if "EXCLUDED" in row:
                    raw_excluded = row["EXCLUDED"].strip()
                    annotations["EXCLUDED_RAW"] = row["EXCLUDED"]
                    flags = {"true": True, "false": False, "1": True, "0": False, "": None}
                    if raw_excluded.lower() not in flags:
                        raise ValueError(f"{row_number}행: EXCLUDED 값을 확인해 주세요.")
                    annotations["EXCLUDED"] = flags[raw_excluded.lower()]
                label = number(row.get("LABEL"), "LABEL", row_number)
                if label not in (None, 0, 1):
                    raise ValueError(f"{row_number}행: LABEL은 0, 1 또는 빈 값이어야 합니다.")
                annotations["LABEL"] = int(label) if label is not None else None
                labels["missing" if label is None else str(int(label))] += 1
                summary = lots.setdefault(lot, {"grade": grade, "start": time, "end": time, "count": 0})
                if summary["grade"] != grade:
                    raise ValueError(f"{row_number}행: 같은 LOT에 서로 다른 강종이 있습니다.")
                summary["start"] = min(summary["start"], time)
                summary["end"] = max(summary["end"], time)
                summary["count"] += 1
                pending.append(MeasurementFrame(
                    dataset=dataset, source_row=row_number, source_record_id=record_id,
                    lot_no=lot, grade=grade, recorded_at=time, recorded_at_raw=raw_time,
                    values=values, annotations=annotations,
                ))
                if len(pending) >= 2000:
                    MeasurementFrame.objects.bulk_create(pending, batch_size=1000)
                    pending.clear()
                total += 1
            if pending:
                MeasurementFrame.objects.bulk_create(pending, batch_size=1000)
        if not total:
            raise ValueError("CSV에 관측값이 없습니다.")
        return total, lots, labels, columns
