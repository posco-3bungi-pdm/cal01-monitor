import uuid

from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .channels import CHANNEL_IDS
from .detection import DETECTOR_VERSION, MAX_LOT_ROWS, analyze_frames, config_fingerprint
from .detection_models import AnomalyCandidate, CandidatePoint, DetectionRun
from .models import Dataset, LotSummary, MeasurementFrame
from .views import selected_dataset, selected_lot
from .workflow_views import require_team
from .workflow_models import FieldRequest
from .candidate_actions import record_resolution


def candidate_queryset():
    return AnomalyCandidate.objects.select_related("run", "acknowledged_by", "resolved_by").prefetch_related(
        Prefetch("field_requests", queryset=FieldRequest.objects.exclude(status="closed").only("id", "candidate_id", "status"), to_attr="active_requests"))


def run_result(run):
    return {
        "id": str(run.id), "dataset_id": str(run.dataset_id), "lot_no": run.lot_no,
        "mode": run.mode, "status": "completed", "config": run.config, "stats": run.stats, "summary": run.summary,
        "created_by": run.created_by.username, "created_at": run.created_at,
    }


def candidate_result(candidate):
    run = candidate.run
    active = getattr(candidate, "active_requests", None)
    active = active[0] if active else None if active is not None else candidate.field_requests.exclude(status="closed").first()
    return {
        "id": str(candidate.id), "run_id": str(run.id), "dataset_id": str(run.dataset_id),
        "lot_no": run.lot_no, "mode": run.mode, "channel_id": candidate.channel_id,
        "zone_id": candidate.zone_id, "start": candidate.start, "end": candidate.end,
        "peak_at": candidate.peak_at, "peak_value": candidate.peak_value, "peak_z": candidate.peak_z,
        "point_count": candidate.point_count, "end_reason": candidate.end_reason,
        "baseline": run.stats.get(candidate.channel_id, {"count": 0, "mean": None, "std": None, "lower": None, "upper": None, "status": "insufficient_samples"}),
        "acknowledged": candidate.acknowledged,
        "acknowledged_by": candidate.acknowledged_by.username if candidate.acknowledged_by_id else None,
        "acknowledged_at": candidate.acknowledged_at,
        "resolved": candidate.resolved,
        "resolved_at": candidate.resolved_at,
        "resolved_by": candidate.resolved_by.username if candidate.resolved_by_id else None,
        "resolution_note": candidate.resolution_note,
        "open_request": {"id": str(active.id), "status": active.status} if active else None,
        "time_basis": "source_recorded_clock", "source_timezone": None,
        "status": "statistical_candidate",
    }


def run_candidates(run):
    return [
        candidate_result(candidate)
        for candidate in candidate_queryset().filter(run=run).order_by("start", "channel_id")
    ]


def parse_config(data, dataset):
    channels = data.get("channels", CHANNEL_IDS)
    if not isinstance(channels, list) or not channels or len(channels) > len(CHANNEL_IDS):
        raise ValidationError({"channels": "분석할 채널을 1개 이상 선택해 주세요."})
    if any(not isinstance(channel, str) or channel not in CHANNEL_IDS for channel in channels):
        raise ValidationError({"channels": "등록되지 않은 채널입니다."})
    if len(channels) != len(set(channels)):
        raise ValidationError({"channels": "같은 채널을 두 번 선택할 수 없습니다."})
    threshold = data.get("threshold", 3)
    ddof = data.get("ddof", 0)
    if isinstance(threshold, bool) or not isinstance(threshold, (int, float)) or threshold != 3:
        raise ValidationError({"threshold": "이번 분석은 |Z-score| > 3 기준입니다."})
    if isinstance(ddof, bool) or not isinstance(ddof, int) or ddof != 0:
        raise ValidationError({"ddof": "이번 분석은 ddof=0으로 계산합니다."})
    gap = data.get("max_gap_seconds", 60)
    minimum = data.get("min_valid_samples", 30)
    if isinstance(gap, bool) or not isinstance(gap, int) or not 1 <= gap <= 3600:
        raise ValidationError({"max_gap_seconds": "공백 기준은 1~3600초의 정수로 입력해 주세요."})
    if isinstance(minimum, bool) or not isinstance(minimum, int) or not 2 <= minimum <= MAX_LOT_ROWS:
        raise ValidationError({"min_valid_samples": f"최소 관측 수는 2~{MAX_LOT_ROWS}의 정수로 입력해 주세요."})
    return {
        "detector_version": DETECTOR_VERSION, "mode": "historical",
        "baseline_scope": "whole_selected_lot", "aggregation": "raw_observations",
        "row_filter": "none", "label_used": False, "excluded_used": False,
        "channels": [channel for channel in CHANNEL_IDS if channel in channels],
        "threshold": 3.0, "comparison": "abs(z) > threshold", "ddof": 0,
        "max_gap_seconds": gap, "min_valid_samples": minimum,
        "source_sha256": dataset.sha256, "time_basis": "source_recorded_clock",
    }


@api_view(["GET", "POST"])
def runs(request):
    require_team(request.user)
    if request.method == "GET":
        dataset = selected_dataset(request)
        lot = selected_lot(request, dataset)
        items = DetectionRun.objects.filter(dataset=dataset, lot_no=lot.lot_no).select_related("created_by").order_by("-created_at")
        return Response({"runs": [run_result(run) for run in items]})
    if not isinstance(request.data, dict):
        raise ValidationError({"detail": "분석 설정을 확인해 주세요."})
    try:
        dataset_id = uuid.UUID(request.data.get("dataset_id", ""))
    except (ValueError, TypeError, AttributeError):
        raise ValidationError({"dataset_id": "데이터 묶음을 선택해 주세요."})
    dataset = get_object_or_404(Dataset, pk=dataset_id, status=Dataset.Status.READY)
    lot_no = request.data.get("lot_no")
    if not isinstance(lot_no, str) or not lot_no:
        raise ValidationError({"lot_no": "LOT를 선택해 주세요."})
    lot = get_object_or_404(LotSummary, dataset=dataset, lot_no=lot_no)
    config = parse_config(request.data, dataset)
    fingerprint = config_fingerprint(config)
    existing = DetectionRun.objects.filter(dataset=dataset, lot_no=lot_no, config_hash=fingerprint).select_related("created_by").first()
    if existing:
        return Response({"run": run_result(existing), "candidates": run_candidates(existing), "reused": True})
    frames_query = MeasurementFrame.objects.filter(dataset=dataset, lot_no=lot_no).order_by("recorded_at", "source_row")
    if lot.count > MAX_LOT_ROWS or frames_query.count() > MAX_LOT_ROWS:
        raise ValidationError({"lot_no": "한 번에 분석할 수 있는 관측 수를 넘었습니다."})
    frames = list(frames_query.values("id", "source_row", "source_record_id", "recorded_at", "values"))
    stats, candidate_data, summary = analyze_frames(
        frames, config["channels"], threshold=config["threshold"],
        max_gap_seconds=config["max_gap_seconds"], min_valid_samples=config["min_valid_samples"],
    )
    with transaction.atomic():
        # Serialize only persistence, so simultaneous identical requests publish once.
        Dataset.objects.select_for_update().get(pk=dataset.pk)
        existing = DetectionRun.objects.filter(dataset=dataset, lot_no=lot_no, config_hash=fingerprint).select_related("created_by").first()
        if existing:
            return Response({"run": run_result(existing), "candidates": run_candidates(existing), "reused": True})
        run = DetectionRun.objects.create(
            dataset=dataset, lot_no=lot_no, config_hash=fingerprint,
            config=config, stats=stats, summary=summary, created_by=request.user,
        )
        new_candidates = [
            AnomalyCandidate(run=run, **{key: value for key, value in item.items() if key != "points"})
            for item in candidate_data
        ]
        AnomalyCandidate.objects.bulk_create(new_candidates, batch_size=500)
        pending = []
        for candidate, item in zip(new_candidates, candidate_data):
            for point in item["points"]:
                pending.append(CandidatePoint(candidate=candidate, **point))
                if len(pending) >= 2000:
                    CandidatePoint.objects.bulk_create(pending, batch_size=1000)
                    pending.clear()
        if pending:
            CandidatePoint.objects.bulk_create(pending, batch_size=1000)
        from .notifications import publish_candidate_notifications

        publish_candidate_notifications(new_candidates, request.user)
    return Response({"run": run_result(run), "candidates": run_candidates(run), "reused": False}, status=201)


@api_view(["GET"])
def candidates(request):
    require_team(request.user)
    dataset = selected_dataset(request)
    lot = selected_lot(request, dataset)
    items = AnomalyCandidate.objects.filter(run__dataset=dataset, run__lot_no=lot.lot_no)
    run_id = request.query_params.get("run")
    if run_id:
        try:
            selected_run = uuid.UUID(run_id)
        except (ValueError, TypeError, AttributeError):
            raise ValidationError({"run": "분석 기록을 확인해 주세요."})
        get_object_or_404(DetectionRun, pk=selected_run, dataset=dataset, lot_no=lot.lot_no)
        items = items.filter(run_id=selected_run)
    items = candidate_queryset().filter(pk__in=items.values("pk")).order_by("start", "channel_id")
    return Response({"candidates": [candidate_result(candidate) for candidate in items]})


@api_view(["GET"])
def pending_candidates(request):
    require_team(request.user)
    items = candidate_queryset().filter(resolved=False, run__dataset__status="ready").order_by("acknowledged", "-run__created_at", "start", "id")
    count = items.count()
    return Response({"candidates": [candidate_result(item) for item in items[:500]], "count": count, "truncated": count > 500})


@api_view(["POST"])
def resolve(request, candidate_id):
    require_team(request.user)
    note = request.data.get("note") if isinstance(request.data, dict) else None
    if not isinstance(note, str) or not note.strip() or len(note) > 4000:
        raise ValidationError({"note": "실제로 확인·조치한 내용을 1~4000자로 기록하십시오."})
    note = note.strip()
    with transaction.atomic():
        candidate = get_object_or_404(AnomalyCandidate.objects.select_for_update(), pk=candidate_id)
        active = candidate.field_requests.exclude(status="closed").first()
        if active:
            return Response({"detail": "진행 중인 점검 요청의 결과 확인까지 완료하십시오.", "request_id": str(active.id)}, status=409)
        if candidate.resolved:
            if candidate.resolution_note != note:
                return Response({"detail": "이미 조치 완료된 후보입니다. 저장된 기록을 확인하십시오."}, status=409)
        else:
            record_resolution(candidate, request.user, note)
        return Response({"candidate": candidate_result(candidate)})


@api_view(["POST"])
def acknowledge(request, candidate_id):
    require_team(request.user)
    with transaction.atomic():
        candidate = get_object_or_404(AnomalyCandidate.objects.select_for_update(), pk=candidate_id)
        if not candidate.acknowledged:
            candidate.acknowledged = True
            candidate.acknowledged_by = request.user
            candidate.acknowledged_at = timezone.now()
            candidate.save(update_fields=["acknowledged", "acknowledged_by", "acknowledged_at"])
            from .notifications import publish_candidate_acknowledged

            publish_candidate_acknowledged(candidate, request.user)
        candidate = AnomalyCandidate.objects.select_related("run", "acknowledged_by").get(pk=candidate.pk)
    return Response({"candidate": candidate_result(candidate)})
