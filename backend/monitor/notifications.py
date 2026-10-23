from django.db import connection, transaction

from .workflow_models import Notification


def user_summary(user):
    if user is None:
        return None
    return {"username": user.username, "display_name": user.first_name or user.username}


def _lock_notification_order():
    # Hold until commit: a later ID must not become visible before an earlier ID.
    # SQLite already serializes writes. PostgreSQL sequences alone do not.
    if connection.vendor == "postgresql":
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", [1128352817])


def _publish(*, event_key, kind, title, actor, candidate=None, request=None):
    _lock_notification_order()
    notification, _ = Notification.objects.get_or_create(
        event_key=event_key,
        defaults={
            "kind": kind, "title": title, "actor": actor,
            "candidate": candidate, "request": request, "recipient_team": "all",
        },
    )
    return notification


@transaction.atomic
def publish_candidate_notifications(candidates, actor):
    pending = [
        Notification(
            event_key=f"candidate:{candidate.id}:created",
            kind="candidate_created",
            title=f"{candidate.run.lot_no} · {candidate.channel_id} 이상 후보",
            actor=actor, candidate=candidate, recipient_team="all",
        )
        for candidate in candidates
    ]
    if not pending:
        return []
    _lock_notification_order()
    Notification.objects.bulk_create(pending, ignore_conflicts=True, batch_size=500)
    keys = [item.event_key for item in pending]
    saved = {item.event_key: item for item in Notification.objects.filter(event_key__in=keys)}
    return [saved[key] for key in keys]


@transaction.atomic
def publish_candidate_acknowledged(candidate, actor):
    return _publish(
        event_key=f"candidate:{candidate.id}:acknowledged",
        kind="candidate_acknowledged",
        title=f"{candidate.run.lot_no} · {candidate.channel_id} 이상 후보 확인",
        actor=actor, candidate=candidate,
    )


@transaction.atomic
def publish_request_notification(field_request, actor, action):
    labels = {
        "created": "현장 확인 요청",
        "accepted": "현장 확인 시작",
        "completed": "현장 결과 등록",
        "closed": "모니터링 확인 완료",
    }
    candidate = field_request.candidate
    context = field_request.source_context()
    return _publish(
        event_key=f"request:{field_request.id}:{field_request.revision}:{action}",
        kind=f"request_{action}",
        title=f"{context['lot_no']} · {context['channel_id']} {labels[action]}",
        actor=actor, candidate=candidate, request=field_request,
    )


def notification_result(notification):
    candidate = notification.candidate
    run = candidate.run if candidate else None
    context = notification.request.source_context() if notification.request_id else {}
    return {
        "id": notification.id,
        "kind": notification.kind,
        "candidate_id": str(notification.candidate_id) if notification.candidate_id else None,
        "request_id": str(notification.request_id) if notification.request_id else None,
        "dataset_id": str(run.dataset_id) if run else context.get("dataset_id"),
        "run_id": str(run.id) if run else None,
        "lot_no": run.lot_no if run else context.get("lot_no"),
        "channel_id": candidate.channel_id if candidate else context.get("channel_id"),
        "zone_id": candidate.zone_id if candidate else context.get("zone_id"),
        "start": candidate.start if candidate else context.get("start"),
        "end": candidate.end if candidate else context.get("end"),
        "title": notification.title,
        "actor": user_summary(notification.actor),
        "created_at": notification.created_at,
    }
