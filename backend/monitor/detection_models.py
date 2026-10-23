import uuid

from django.conf import settings
from django.db import models


class DetectionRun(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    dataset = models.ForeignKey("monitor.Dataset", on_delete=models.PROTECT, related_name="detection_runs")
    lot_no = models.CharField(max_length=40)
    mode = models.CharField(max_length=20, default="historical")
    config_hash = models.CharField(max_length=64)
    config = models.JSONField(default=dict)
    stats = models.JSONField(default=dict)
    summary = models.JSONField(default=dict)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["dataset", "lot_no", "config_hash"], name="detection_dataset_lot_config",
            ),
        ]
        indexes = [
            models.Index(fields=["dataset", "lot_no", "-created_at"], name="detection_dataset_lot_time"),
        ]


class AnomalyCandidate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    run = models.ForeignKey(DetectionRun, on_delete=models.CASCADE, related_name="candidates")
    channel_id = models.CharField(max_length=20)
    zone_id = models.CharField(max_length=20)
    start = models.CharField(max_length=26)
    end = models.CharField(max_length=26)
    peak_at = models.CharField(max_length=26)
    peak_value = models.FloatField()
    peak_z = models.FloatField()
    point_count = models.PositiveIntegerField()
    end_reason = models.CharField(max_length=30)
    acknowledged = models.BooleanField(default=False)
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
        related_name="acknowledged_candidates",
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["run", "start", "channel_id"], name="candidate_run_time_channel"),
        ]


class CandidatePoint(models.Model):
    candidate = models.ForeignKey(AnomalyCandidate, on_delete=models.CASCADE, related_name="points")
    source_frame = models.ForeignKey("monitor.MeasurementFrame", on_delete=models.PROTECT)
    source_row = models.PositiveBigIntegerField()
    source_record_id = models.CharField(max_length=255)
    recorded_at = models.CharField(max_length=26)
    value = models.FloatField()
    z_score = models.FloatField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["candidate", "source_frame"], name="candidate_source_frame_unique"),
        ]
        ordering = ["recorded_at", "source_row"]
