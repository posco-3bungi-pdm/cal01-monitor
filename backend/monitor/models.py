import uuid

from django.conf import settings
from django.db import models


class Dataset(models.Model):
    class Status(models.TextChoices):
        IMPORTING = "importing", "불러오는 중"
        READY = "ready", "사용 가능"
        FAILED = "failed", "등록 실패"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    sha256 = models.CharField(max_length=64, unique=True)
    source_name = models.CharField(max_length=255)
    source_size = models.PositiveBigIntegerField(default=0)
    row_count = models.PositiveBigIntegerField(default=0)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.IMPORTING)
    created_at = models.DateTimeField(auto_now_add=True)
    metadata = models.JSONField(default=dict)


class MeasurementFrame(models.Model):
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, related_name="frames")
    source_row = models.PositiveBigIntegerField()
    source_record_id = models.CharField(max_length=255)
    lot_no = models.CharField(max_length=40)
    grade = models.CharField(max_length=80, blank=True)
    # Source wall-clock time: deliberately not a UTC DateTimeField.
    recorded_at = models.CharField(max_length=26)
    recorded_at_raw = models.CharField(max_length=100)
    values = models.JSONField(default=dict)
    annotations = models.JSONField(default=dict)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["dataset", "source_row"], name="frame_source_row_unique"),
            models.UniqueConstraint(fields=["dataset", "source_record_id"], name="frame_source_id_unique"),
        ]
        indexes = [
            models.Index(fields=["dataset", "lot_no", "recorded_at"], name="frame_dataset_lot_time"),
        ]


class LotSummary(models.Model):
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, related_name="lots")
    lot_no = models.CharField(max_length=40)
    grade = models.CharField(max_length=80, blank=True)
    start = models.CharField(max_length=26)
    end = models.CharField(max_length=26)
    count = models.PositiveBigIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["dataset", "lot_no"], name="lot_dataset_number_unique"),
        ]
        ordering = ["lot_no"]


class EquipmentLayout(models.Model):
    model_version = models.CharField(max_length=80, unique=True, default="cal01-concept-v1")
    revision = models.PositiveIntegerField(default=0)
    placements = models.JSONField(default=list)
    updated_at = models.DateTimeField(auto_now=True)


class EquipmentLayoutHistory(models.Model):
    layout = models.ForeignKey(EquipmentLayout, on_delete=models.PROTECT, related_name="history")
    revision = models.PositiveIntegerField()
    placements = models.JSONField(default=list)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["layout", "revision"], name="layout_history_revision_unique"),
        ]


class OperationalRecord(models.Model):
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, related_name="operational_records")
    source_record_id = models.CharField(max_length=255)
    kind = models.CharField(max_length=30)
    start = models.CharField(max_length=100)
    end = models.CharField(max_length=100, null=True, blank=True)
    precision = models.CharField(max_length=20)
    title = models.CharField(max_length=255)
    equipment = models.CharField(max_length=255)
    source = models.CharField(max_length=255)
    source_id = models.CharField(max_length=255)
    details = models.JSONField(default=dict)
    payload = models.JSONField(default=dict)
    imported_from_sha256 = models.CharField(max_length=64)
    # Search fields are separate from the unchanged export's start/end values.
    start_time = models.CharField(max_length=26, null=True, blank=True)
    end_time = models.CharField(max_length=26, null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["dataset", "source_record_id"], name="context_source_id_unique"),
        ]
        indexes = [
            models.Index(fields=["dataset", "kind", "start_time"], name="context_dataset_kind_time"),
            models.Index(fields=["dataset", "start_date"], name="context_dataset_date"),
        ]
