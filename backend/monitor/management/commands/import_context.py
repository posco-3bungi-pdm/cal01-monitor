import hashlib
import json
from datetime import date, datetime
from pathlib import Path
import uuid

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from monitor.models import Dataset, OperationalRecord

KINDS = {"operation", "plan", "detection", "maintenance", "parts"}


def digest(path):
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def text(payload, key, required=True):
    value = payload.get(key)
    if value is None and not required:
        return None
    if not isinstance(value, str) or (required and not value) or len(value) > 255:
        raise ValueError(f"{key}: 비어 있지 않은 문자열이어야 합니다.")
    return value


def source_time(raw):
    if "T" not in raw and " " not in raw:
        raise ValueError("초 단위 기록에는 날짜와 시각이 함께 필요합니다.")
    parsed = datetime.fromisoformat(raw)
    if parsed.tzinfo is not None:
        raise ValueError("시간대가 있는 기록은 별도 확인이 필요합니다.")
    return parsed.isoformat(timespec="microseconds")


def build_record(dataset, payload, fingerprint):
    if not isinstance(payload, dict):
        raise ValueError("각 기록은 JSON 객체여야 합니다.")
    record_id, kind = text(payload, "id"), text(payload, "type")
    if kind not in KINDS:
        raise ValueError(f"{record_id}: 알 수 없는 기록 종류입니다.")
    precision = text(payload, "precision")
    details = payload.get("details", {})
    if not isinstance(details, dict):
        raise ValueError(f"{record_id}: details 형식이 잘못됐습니다.")
    start, end = text(payload, "start"), text(payload, "end", required=False)
    if len(start) > 100 or (end and len(end) > 100):
        raise ValueError(f"{record_id}: 시각 문자열이 너무 깁니다.")
    record = OperationalRecord(
        dataset=dataset, source_record_id=record_id, kind=kind,
        start=start, end=end, precision=precision,
        title=text(payload, "title"), equipment=text(payload, "equipment"),
        source=text(payload, "source"), source_id=text(payload, "sourceId"),
        details=details, payload=payload, imported_from_sha256=fingerprint,
    )
    if kind == "plan":
        if precision != "date":
            raise ValueError(f"{record_id}: 정기수리 계획의 날짜 정밀도를 확인해 주세요.")
        # The export's midnight boundaries are for display only. The source dates
        # in details include the final planned day and do not state actual times.
        record.start_date = date.fromisoformat(text(details, "startDate"))
        record.end_date = date.fromisoformat(text(details, "endDate"))
        if record.end_date < record.start_date:
            raise ValueError(f"{record_id}: 계획 종료일이 시작일보다 빠릅니다.")
    else:
        expected = "linked-work" if kind == "parts" else "second"
        if precision != expected:
            raise ValueError(f"{record_id}: 기록 종류와 시간 정밀도가 맞지 않습니다.")
        record.start_time = source_time(start)
        record.end_time = source_time(end) if end else None
        if record.end_time and record.end_time < record.start_time:
            raise ValueError(f"{record_id}: 끝 시각이 시작 시각보다 빠릅니다.")
    return record


class Command(BaseCommand):
    help = "기존 검증 records.json을 읽어 새 데이터 묶음에 조업·정비 기록을 연결합니다."

    def add_arguments(self, parser):
        parser.add_argument("dataset")
        parser.add_argument("source", type=Path)

    def handle(self, *args, **options):
        try:
            dataset_id = uuid.UUID(options["dataset"])
            dataset = Dataset.objects.get(pk=dataset_id, status=Dataset.Status.READY)
        except (ValueError, Dataset.DoesNotExist):
            raise CommandError("등록이 완료된 데이터 묶음 UUID를 지정해 주세요.")
        path = options["source"].expanduser().resolve()
        if not path.is_file() or path.suffix.lower() != ".json":
            raise CommandError("기존 records.json 파일을 지정해 주세요.")
        fingerprint = digest(path)
        try:
            payloads = json.loads(path.read_text(encoding="utf-8-sig"))
            if not isinstance(payloads, list) or not payloads:
                raise ValueError("기록 목록이 비어 있거나 형식이 잘못됐습니다.")
            records = [build_record(dataset, payload, fingerprint) for payload in payloads]
            ids = [record.source_record_id for record in records]
            if len(ids) != len(set(ids)):
                raise ValueError("내보내기 파일에 중복된 기록 ID가 있습니다.")
            with transaction.atomic():
                dataset = Dataset.objects.select_for_update().get(pk=dataset.pk)
                existing = {
                    item.source_record_id: item.payload
                    for item in OperationalRecord.objects.filter(dataset=dataset)
                }
                new_records = []
                for record in records:
                    if record.source_record_id in existing:
                        if existing[record.source_record_id] != record.payload:
                            raise ValueError(f"{record.source_record_id}: 기존 기록과 내용이 달라 덮어쓰지 않았습니다.")
                    else:
                        new_records.append(record)
                OperationalRecord.objects.bulk_create(new_records, batch_size=500)
                if digest(path) != fingerprint:
                    raise ValueError("등록 중 내보내기 파일이 바뀌어 저장을 취소했습니다.")
                exports = list(dataset.metadata.get("context_exports", []))
                if not any(item["sha256"] == fingerprint for item in exports):
                    exports.append({
                        "name": path.name, "sha256": fingerprint, "record_count": len(records),
                        "origin": "existing_cal01_review_verified_export",
                        "time_basis": "source_recorded_clock",
                    })
                    dataset.metadata = {**dataset.metadata, "context_exports": exports}
                    dataset.save(update_fields=["metadata"])
        except (ValueError, OSError) as exc:
            raise CommandError(f"기록을 등록하지 못했습니다: {exc}") from exc
        self.stdout.write(
            f"기록 연결 완료: {len(records)}건 중 신규 {len(new_records)}건. 기존 원본·판단은 변경하지 않았습니다."
        )
