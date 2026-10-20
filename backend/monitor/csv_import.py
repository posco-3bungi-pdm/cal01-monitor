"""Shared, atomic CAL01 CSV registration for the CLI and authenticated uploads."""
import csv
import hashlib
import math
import re
from collections import Counter
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.db import IntegrityError, transaction

from .channels import CHANNEL_IDS
from .models import Dataset, LotSummary, MeasurementFrame

ANNOTATIONS = [
    "LABEL", "EXCLUDED", "EXCLUSION_REASON", "LABEL_STATUS", "LABEL_REASON",
    "RULE", "EVIDENCE_WO", "LABEL_VERSION", "FEATURES_COMPLETE", "MODEL_ELIGIBLE",
]
RECORDED_CLOCK = re.compile(r"\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?\Z")


class CsvImportError(ValueError):
    pass


class ImportInProgress(CsvImportError):
    pass


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
        raise CsvImportError(f"{row}행 {name}: 숫자가 아닙니다.") from exc
    if not math.isfinite(value):
        raise CsvImportError(f"{row}행 {name}: 유한한 숫자 또는 빈 값이어야 합니다.")
    return value


def import_rows(dataset, path):
    lots, labels, pending = {}, Counter(), []
    total = 0
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        columns = reader.fieldnames or []
        required = {"MEAS_DT", "LOT_NO", *CHANNEL_IDS}
        missing = required - set(columns)
        if missing:
            raise CsvImportError("필요한 열이 없습니다: " + ", ".join(sorted(missing)))
        if len(columns) > 200 or any(not name or len(name) > 100 or "\x00" in name for name in columns):
            raise CsvImportError("열 이름이나 열 개수를 확인해 주세요.")
        if len(columns) != len(set(columns)):
            raise CsvImportError("같은 이름의 열이 두 번 들어 있습니다.")
        for row_number, row in enumerate(reader, start=1):
            if row_number > settings.CAL01_UPLOAD_MAX_ROWS:
                raise CsvImportError(f"CSV는 {settings.CAL01_UPLOAD_MAX_ROWS:,}행까지 등록할 수 있습니다.")
            if None in row or any(value is None for value in row.values()):
                raise CsvImportError(f"{row_number}행: 열 개수가 맞지 않습니다.")
            if any("\x00" in value for value in row.values()):
                raise CsvImportError(f"{row_number}행: 저장할 수 없는 제어 문자가 있습니다.")
            lot = row["LOT_NO"].strip()
            grade = row.get("GRADE", "").strip()
            record_id = row["ROW_ID"].strip() if "ROW_ID" in columns else f"source-row-{row_number}"
            if not lot or not record_id:
                raise CsvImportError(f"{row_number}행: LOT_NO와 ROW_ID가 필요합니다.")
            if len(lot) > 40 or len(grade) > 80 or len(record_id) > 255:
                raise CsvImportError(f"{row_number}행: LOT_NO·GRADE·ROW_ID 길이를 확인해 주세요.")
            raw_time = row["MEAS_DT"]
            if len(raw_time) > 100 or not RECORDED_CLOCK.fullmatch(raw_time.strip()):
                raise CsvImportError(f"{row_number}행: MEAS_DT는 시간대 없는 날짜와 시각이어야 합니다. 소수 초는 6자리까지 보존합니다.")
            try:
                timestamp = datetime.fromisoformat(raw_time.strip())
            except ValueError as exc:
                raise CsvImportError(f"{row_number}행: MEAS_DT 날짜와 시각이 올바르지 않습니다.") from exc
            time = timestamp.isoformat(timespec="microseconds")
            values = {channel: number(row[channel], channel, row_number) for channel in CHANNEL_IDS}
            annotations = {key: row[key] for key in ANNOTATIONS if key in row}
            if any(len(value) > 8192 for value in annotations.values()):
                raise CsvImportError(f"{row_number}행: 라벨 설명은 열마다 8,192자까지 등록할 수 있습니다.")
            if "EXCLUDED" in row:
                raw_excluded = row["EXCLUDED"].strip()
                annotations["EXCLUDED_RAW"] = row["EXCLUDED"]
                flags = {"true": True, "false": False, "1": True, "0": False, "": None}
                if raw_excluded.lower() not in flags:
                    raise CsvImportError(f"{row_number}행: EXCLUDED 값을 확인해 주세요.")
                annotations["EXCLUDED"] = flags[raw_excluded.lower()]
            label = number(row.get("LABEL"), "LABEL", row_number)
            if label not in (None, 0, 1):
                raise CsvImportError(f"{row_number}행: LABEL은 0, 1 또는 빈 값이어야 합니다.")
            annotations["LABEL"] = int(label) if label is not None else None
            labels["missing" if label is None else str(int(label))] += 1
            summary = lots.setdefault(lot, {"grade": grade, "start": time, "end": time, "count": 0})
            if summary["grade"] != grade:
                raise CsvImportError(f"{row_number}행: 같은 LOT에 서로 다른 강종이 있습니다.")
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
        raise CsvImportError("CSV에 관측값이 없습니다.")
    return total, lots, labels, columns


def register_csv(path, *, name="", source_name=None, retry_failed=False):
    path = Path(path)
    size = path.stat().st_size
    if not 0 < size <= settings.CAL01_UPLOAD_MAX_BYTES:
        raise CsvImportError("빈 파일이거나 허용된 CSV 크기를 넘었습니다.")
    source_name = (source_name or path.name).replace("\\", "/").split("/")[-1]
    name = name.strip() or Path(source_name).stem
    if not source_name.lower().endswith(".csv") or len(source_name) > 255 or len(name) > 200 or "\x00" in source_name + name:
        raise CsvImportError("CSV 파일 이름은 255자, 표시 이름은 200자까지 사용할 수 있습니다.")
    fingerprint = file_hash(path)
    dataset, created = Dataset.objects.get_or_create(
        sha256=fingerprint,
        defaults={"name": name, "source_name": source_name, "source_size": size},
    )
    if not created and dataset.status == Dataset.Status.READY:
        return dataset, True
    if not created and not (retry_failed and dataset.status == Dataset.Status.FAILED):
        raise ImportInProgress("등록 중인 파일입니다. 잠시 후 같은 파일로 다시 확인해 주세요.")
    try:
        with transaction.atomic():
            dataset = Dataset.objects.select_for_update().get(pk=dataset.pk)
            # Another retry may have completed while this one waited for the row lock.
            if dataset.status == Dataset.Status.READY:
                return dataset, True
            if not created and dataset.status != Dataset.Status.FAILED:
                raise ImportInProgress("등록 중인 파일입니다. 잠시 후 다시 확인해 주세요.")
            if dataset.frames.exists() or dataset.lots.exists():
                raise CsvImportError("기존 관측값을 덮어쓸 수 없습니다.")
            dataset.status = Dataset.Status.IMPORTING
            dataset.save(update_fields=["status"])
            total, lots, labels, columns = import_rows(dataset, path)
            if file_hash(path) != fingerprint:
                raise CsvImportError("등록 중 원본 파일이 변경되어 저장을 취소했습니다.")
            LotSummary.objects.bulk_create([
                LotSummary(dataset=dataset, lot_no=lot, **summary) for lot, summary in lots.items()
            ])
            dataset.row_count = total
            dataset.status = Dataset.Status.READY
            dataset.metadata = {
                "channels": CHANNEL_IDS,
                "source_columns": columns,
                "imported_annotation_columns": [key for key in ANNOTATIONS if key in columns],
                "unimported_columns": [key for key in columns if key not in {
                    "ROW_ID", "MEAS_DT", "LOT_NO", "GRADE", *CHANNEL_IDS, *ANNOTATIONS,
                }],
                "source_record_id_origin": "ROW_ID" if "ROW_ID" in columns else "source_row",
                "grade_available": "GRADE" in columns,
                "source_timezone": None,
                "time_basis": "source_recorded_clock",
                "label_counts": dict(labels),
                "label_meaning": "원본 CSV의 임시 라벨. 고장 확정이나 실시간 감지 결과가 아님.",
            }
            dataset.save(update_fields=["row_count", "status", "metadata"])
    except ImportInProgress:
        raise
    except Exception as exc:
        Dataset.objects.filter(pk=dataset.pk).update(status=Dataset.Status.FAILED)
        if isinstance(exc, CsvImportError):
            raise
        if isinstance(exc, IntegrityError):
            raise CsvImportError("ROW_ID가 중복되었거나 행을 저장할 수 없습니다. 등록 전체를 취소했습니다.") from exc
        if isinstance(exc, UnicodeError):
            raise CsvImportError("CSV를 UTF-8 또는 UTF-8 BOM 형식으로 저장해 주세요.") from exc
        if isinstance(exc, (csv.Error, ValueError)):
            raise CsvImportError("CSV 형식이나 값이 올바르지 않아 등록 전체를 취소했습니다.") from exc
        raise
    return dataset, False
