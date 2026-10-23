from django.utils import timezone

from .detection_models import CandidateResolution


def record_resolution(candidate, actor, note, field_request=None):
    """Caller holds the candidate row lock; never changes the source observations."""
    event = CandidateResolution.objects.create(candidate=candidate, actor=actor, note=note, request=field_request)
    candidate.resolved = True
    candidate.resolved_by = actor
    candidate.resolved_at = timezone.now()
    candidate.resolution_note = note
    candidate.save(update_fields=["resolved", "resolved_by", "resolved_at", "resolution_note"])
    return event
