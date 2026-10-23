import uuid

from django.conf import settings
from django.db import models


class FieldRequest(models.Model):
    class Status(models.TextChoices):
        REQUESTED = "requested", "현장 확인 요청"
        ACCEPTED = "accepted", "현장 확인 중"
        COMPLETED = "completed", "현장 결과 등록"
        CLOSED = "closed", "모니터링 확인 완료"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    candidate = models.ForeignKey("monitor.AnomalyCandidate", on_delete=models.PROTECT, related_name="field_requests", null=True, blank=True)
    dataset = models.ForeignKey("monitor.Dataset", on_delete=models.PROTECT, related_name="manual_field_requests", null=True, blank=True)
    lot_no = models.CharField(max_length=40, blank=True)
    channel_id = models.CharField(max_length=40, blank=True)
    zone_id = models.CharField(max_length=40, blank=True)
    start = models.CharField(max_length=26, blank=True)
    end = models.CharField(max_length=26, blank=True)
    title = models.CharField(max_length=200)
    message = models.TextField()
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_field_requests",
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="assigned_field_requests",
        null=True, blank=True,
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.REQUESTED)
    revision = models.PositiveIntegerField(default=1)
    result = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    def source_context(self):
        if self.candidate_id:
            candidate = self.candidate
            run = candidate.run
            return {
                "source": "candidate", "candidate_id": str(candidate.id), "run_id": str(run.id),
                "dataset_id": str(run.dataset_id), "lot_no": run.lot_no,
                "channel_id": candidate.channel_id, "zone_id": candidate.zone_id,
                "start": candidate.start, "end": candidate.end,
            }
        return {
            "source": "manual", "candidate_id": None, "run_id": None,
            "dataset_id": str(self.dataset_id), "lot_no": self.lot_no,
            "channel_id": self.channel_id, "zone_id": self.zone_id,
            "start": self.start, "end": self.end,
        }

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(candidate__isnull=False, dataset__isnull=True) | (
                    models.Q(candidate__isnull=True, dataset__isnull=False)
                    & ~models.Q(lot_no="") & ~models.Q(channel_id="") & ~models.Q(zone_id="")
                    & ~models.Q(start="") & ~models.Q(end="")
                ), name="request_has_one_source_context",
            ),
            models.UniqueConstraint(
                fields=["candidate"], condition=models.Q(status__in=["requested", "accepted", "completed"]),
                name="candidate_one_open_request",
            ),
        ]
        ordering = ["-created_at", "-id"]


class FieldRequestHistory(models.Model):
    request = models.ForeignKey(FieldRequest, on_delete=models.PROTECT, related_name="history")
    revision = models.PositiveIntegerField()
    action = models.CharField(max_length=16)
    from_status = models.CharField(max_length=16, blank=True)
    to_status = models.CharField(max_length=16)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    result = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["request", "revision"], name="request_history_revision_unique"),
        ]
        ordering = ["revision"]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValueError("현장 요청 이력은 변경할 수 없습니다.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("현장 요청 이력은 삭제할 수 없습니다.")


class FieldRequestSubmission(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    idempotency_key = models.CharField(max_length=128)
    payload_hash = models.CharField(max_length=64)
    request = models.ForeignKey(FieldRequest, on_delete=models.PROTECT, related_name="submissions")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["actor", "idempotency_key"], name="request_submission_key_unique"),
        ]


class Notification(models.Model):
    id = models.BigAutoField(primary_key=True)
    event_key = models.CharField(max_length=150, unique=True)
    kind = models.CharField(max_length=40)
    title = models.CharField(max_length=255)
    candidate = models.ForeignKey(
        "monitor.AnomalyCandidate", on_delete=models.PROTECT, null=True, blank=True, related_name="notifications",
    )
    request = models.ForeignKey(
        FieldRequest, on_delete=models.PROTECT, null=True, blank=True, related_name="notifications",
    )
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True)
    recipient_team = models.CharField(
        max_length=16, default="all",
        choices=[("all", "팀 전체"), ("monitoring", "모니터링팀"), ("field", "현장팀")],
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
