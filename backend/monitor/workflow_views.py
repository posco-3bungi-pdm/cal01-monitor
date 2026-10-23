import hashlib
import json
import uuid

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from .detection_models import AnomalyCandidate
from .channels import CHANNEL_BY_ID
from .models import Dataset, LotSummary
from .series import recorded_time
from .notifications import notification_result, publish_request_notification, user_summary
from .workflow_models import FieldRequest, FieldRequestHistory, FieldRequestSubmission, Notification


def team_names(user):
    return set(user.groups.filter(name__in=["monitoring", "field"]).values_list("name", flat=True))


def is_admin(user):
    return user.is_staff or user.is_superuser


def require_team(user, team=None):
    groups = team_names(user)
    if not is_admin(user) and (team not in groups if team else not groups):
        raise PermissionDenied("이 작업을 할 수 있는 팀 계정이 아닙니다.")
    return groups


def request_queryset():
    return FieldRequest.objects.select_related("candidate__run", "requested_by", "assigned_to")


def request_result(item):
    return {
        "id": str(item.id), **item.source_context(),
        "title": item.title, "message": item.message,
        "status": item.status, "revision": item.revision,
        "requested_by": user_summary(item.requested_by),
        "assigned_to": user_summary(item.assigned_to),
        "created_at": item.created_at, "updated_at": item.updated_at,
        "accepted_at": item.accepted_at, "completed_at": item.completed_at, "closed_at": item.closed_at,
        "result": item.result,
    }


def history_result(item):
    return {
        "revision": item.revision, "action": item.action,
        "from_status": item.from_status, "to_status": item.to_status,
        "actor": user_summary(item.actor), "result": item.result, "created_at": item.created_at,
    }


def _text(data, name, maximum):
    value = data.get(name)
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValidationError({name: f"1~{maximum}자의 내용을 입력해 주세요."})
    return value.strip()


def manual_request_context(data):
    try:
        dataset_id = uuid.UUID(str(data.get("dataset_id", "")))
    except (ValueError, TypeError, AttributeError):
        raise ValidationError({"dataset_id": "사용할 데이터 묶음을 선택해 주세요."})
    dataset = get_object_or_404(Dataset, pk=dataset_id, status=Dataset.Status.READY)
    lot_no = _text(data, "lot_no", 40)
    lot = get_object_or_404(LotSummary, dataset=dataset, lot_no=lot_no)
    channel_id = _text(data, "channel_id", 40)
    if channel_id not in CHANNEL_BY_ID:
        raise ValidationError({"channel_id": "등록된 채널을 선택해 주세요."})
    start, end = recorded_time(data.get("start"), "start"), recorded_time(data.get("end"), "end")
    if start > end or start < recorded_time(lot.start) or end > recorded_time(lot.end):
        raise ValidationError({"end": "선택한 LOT 안에서 시작·끝 시각을 순서대로 지정해 주세요."})
    return {"dataset": dataset, "lot_no": lot_no, "channel_id": channel_id,
            "zone_id": CHANNEL_BY_ID[channel_id]["zone"], "start": start, "end": end}


@api_view(["GET", "POST"])
def field_requests(request):
    require_team(request.user)
    if request.method == "GET":
        queryset = request_queryset()
        status = request.query_params.get("status")
        if status is not None:
            if status not in FieldRequest.Status.values:
                raise ValidationError({"status": "요청 상태를 확인해 주세요."})
            queryset = queryset.filter(status=status)
        return Response({"requests": [request_result(item) for item in queryset]})

    if not isinstance(request.data, dict):
        raise ValidationError("요청 내용을 확인해 주세요.")
    message = _text(request.data, "message", 4000)
    key = _text(request.data, "idempotency_key", 128)
    candidate_id = None
    manual = None
    if request.data.get("candidate_id"):
        if any(name in request.data for name in ["dataset_id", "lot_no", "channel_id", "start", "end"]):
            raise ValidationError("이상 후보 연결 요청과 직접 작성 요청의 구간을 함께 보낼 수 없습니다.")
        try:
            candidate_id = uuid.UUID(str(request.data["candidate_id"]))
        except (ValueError, TypeError, AttributeError):
            raise ValidationError({"candidate_id": "이상 후보를 선택해 주세요."})
        payload = {"candidate_id": str(candidate_id), "message": message}
    else:
        manual = manual_request_context(request.data)
        payload = {**{name: value for name, value in manual.items() if name != "dataset"},
                   "dataset_id": str(manual["dataset"].id), "message": message}
    fingerprint = hashlib.sha256(json.dumps(
        payload,
        ensure_ascii=False, sort_keys=True,
    ).encode()).hexdigest()

    with transaction.atomic():
        # One user's retry cannot race another payload using the same key.
        get_user_model().objects.select_for_update(no_key=True).get(pk=request.user.pk)
        receipt = FieldRequestSubmission.objects.filter(actor=request.user, idempotency_key=key).first()
        if receipt:
            if receipt.payload_hash != fingerprint:
                return Response({"detail": "같은 요청 키로 다른 내용을 보낼 수 없습니다."}, status=409)
            item = request_queryset().get(pk=receipt.request_id)
            return Response({"request": request_result(item), "reused": True})
        candidate = None
        if candidate_id:
            # All creators lock the candidate before checking its one open request.
            candidate = get_object_or_404(
                AnomalyCandidate.objects.select_for_update(of=("self",), no_key=True).select_related("run"),
                pk=candidate_id,
            )
            matches = request_queryset().filter(candidate=candidate)
        else:
            matches = request_queryset().filter(candidate__isnull=True, requested_by=request.user, message=message, **manual)
        existing = matches.exclude(status=FieldRequest.Status.CLOSED).first()
        if existing:
            return Response({
                "detail": "같은 대상·내용의 진행 중인 점검 요청이 있습니다.",
                "request": request_result(existing),
            }, status=409)
        context = {"candidate": candidate} if candidate else manual
        lot_no = candidate.run.lot_no if candidate else manual["lot_no"]
        channel_id = candidate.channel_id if candidate else manual["channel_id"]
        item = FieldRequest.objects.create(**context, requested_by=request.user,
            title=f"{lot_no} · {channel_id} 점검 요청", message=message)
        if candidate and candidate.resolved:
            candidate.resolved = False
            candidate.save(update_fields=["resolved"])
        FieldRequestHistory.objects.create(
            request=item, revision=1, action="create", from_status="", to_status=item.status, actor=request.user,
        )
        FieldRequestSubmission.objects.create(
            actor=request.user, idempotency_key=key, payload_hash=fingerprint, request=item,
        )
        publish_request_notification(item, request.user, "created")
    return Response({"request": request_result(item), "reused": False}, status=201)


@api_view(["GET"])
def field_request_detail(request, request_id):
    require_team(request.user)
    item = get_object_or_404(request_queryset(), pk=request_id)
    return Response({
        "request": request_result(item),
        "history": [history_result(event) for event in item.history.select_related("actor")],
    })


@api_view(["POST"])
def transition(request, request_id):
    require_team(request.user)
    if not isinstance(request.data, dict):
        raise ValidationError("요청 내용을 확인해 주세요.")
    action = request.data.get("action")
    if action not in ["accept", "complete", "close"]:
        raise ValidationError({"action": "요청 처리 단계를 확인해 주세요."})
    require_team(request.user, "monitoring" if action == "close" else "field")
    revision = request.data.get("revision")
    if isinstance(revision, bool) or not isinstance(revision, int) or revision < 1:
        raise ValidationError({"revision": "현재 요청 버전을 보내 주세요."})
    result = _text(request.data, "result", 4000) if action == "complete" else ""
    stages = {
        "accept": (FieldRequest.Status.REQUESTED, FieldRequest.Status.ACCEPTED, "accepted_at", "accepted"),
        "complete": (FieldRequest.Status.ACCEPTED, FieldRequest.Status.COMPLETED, "completed_at", "completed"),
        "close": (FieldRequest.Status.COMPLETED, FieldRequest.Status.CLOSED, "closed_at", "closed"),
    }
    with transaction.atomic():
        # Avoid locking nullable select_related users with PostgreSQL FOR UPDATE.
        item = get_object_or_404(request_queryset().select_for_update(of=("self",)), pk=request_id)
        if item.revision != revision:
            return Response({
                "detail": "다른 팀원이 먼저 수정했습니다. 현재 내용을 확인해 주세요.",
                "request": request_result(item),
            }, status=409)
        before, after, timestamp_field, notification_action = stages[action]
        if item.status != before:
            return Response({
                "detail": "현재 상태에서는 이 작업을 할 수 없습니다.",
                "request": request_result(item),
            }, status=409)
        if action == "complete" and item.assigned_to_id != request.user.pk:
            raise PermissionDenied("이 요청을 맡은 현장 담당자만 결과를 등록할 수 있습니다.")
        if action == "accept":
            item.assigned_to = request.user
        if action == "complete":
            item.result = result
        item.status = after
        item.revision += 1
        setattr(item, timestamp_field, timezone.now())
        item.save()
        if action == "close" and item.candidate_id:
            from .candidate_actions import record_resolution

            candidate = AnomalyCandidate.objects.select_for_update().get(pk=item.candidate_id)
            record_resolution(candidate, request.user, item.result, item)
        FieldRequestHistory.objects.create(
            request=item, revision=item.revision, action=action,
            from_status=before, to_status=after, actor=request.user, result=result,
        )
        publish_request_notification(item, request.user, notification_action)
    return Response({"request": request_result(item)})


@api_view(["GET"])
def field_users(request):
    require_team(request.user)
    users = get_user_model().objects.filter(is_active=True, groups__name="field").distinct().order_by("username")
    return Response({"users": [user_summary(user) for user in users]})


def _integer_query(request, name, default, minimum, maximum):
    value = request.query_params.get(name, str(default))
    if len(value) > 19 or not value.isascii() or not value.isdecimal():
        raise ValidationError({name: "정수로 입력해 주세요."})
    number = int(value)
    if not minimum <= number <= maximum:
        raise ValidationError({name: f"{minimum}~{maximum} 범위로 입력해 주세요."})
    return number


@api_view(["GET"])
def notifications(request):
    groups = require_team(request.user)
    after = _integer_query(request, "after", 0, 0, 9223372036854775807)
    limit = _integer_query(request, "limit", 100, 1, 100)
    queryset = Notification.objects.filter(id__gt=after)
    if not is_admin(request.user):
        queryset = queryset.filter(Q(recipient_team="all") | Q(recipient_team__in=groups))
    page = list(queryset.select_related("candidate__run", "request__candidate__run", "actor").order_by("id")[:limit + 1])
    visible = page[:limit]
    return Response({
        "notifications": [notification_result(item) for item in visible],
        "last_id": visible[-1].id if visible else after,
        "has_more": len(page) > limit,
    })
