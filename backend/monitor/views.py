import uuid
from datetime import datetime

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from .channels import CHANNEL_BY_ID, CHANNEL_IDS, CHANNELS, ZONE_IDS
from .models import Dataset, EquipmentLayout, EquipmentLayoutHistory, LotSummary, MeasurementFrame
from .materials import MATERIAL_GRADES, lot_material
from .series import make_series, number_or_none, recorded_time

TIME_BASIS = {"mode": "historical", "time_basis": "source_recorded_clock", "source_timezone": None}


def selected_dataset(request):
    try:
        dataset_id = uuid.UUID(request.query_params.get("dataset", ""))
    except (ValueError, AttributeError):
        raise ValidationError({"dataset": "사용할 데이터 묶음을 선택해 주세요."})
    return get_object_or_404(Dataset, pk=dataset_id, status=Dataset.Status.READY)


def selected_lot(request, dataset):
    lot_no = request.query_params.get("lot")
    if not lot_no:
        raise ValidationError({"lot": "LOT를 선택해 주세요."})
    return get_object_or_404(LotSummary, dataset=dataset, lot_no=lot_no)


def selected_channels(request):
    raw = request.query_params.get("channels")
    channel_ids = list(dict.fromkeys(raw.split(","))) if raw else CHANNEL_IDS
    if any(channel not in CHANNEL_BY_ID for channel in channel_ids):
        raise ValidationError({"channels": "등록되지 않은 채널이 있습니다."})
    return channel_ids


@api_view(["GET"])
def datasets(request):
    items = Dataset.objects.filter(status=Dataset.Status.READY).order_by("-created_at")
    return Response({"datasets": list(items.values("id", "name", "row_count", "status"))})


@api_view(["GET"])
def lots(request):
    dataset = selected_dataset(request)
    return Response({"lots": [lot_material(lot, dataset) for lot in dataset.lots.all()]})


@api_view(["GET"])
def material_grades(request):
    return Response({"grades": [{"grade": grade, **product} for grade, product in MATERIAL_GRADES.items()]})


@api_view(["PATCH"])
def lot_grade_link(request):
    if not isinstance(request.data, dict):
        raise ValidationError("강종 연결 내용을 확인하십시오.")
    if not (request.user.is_staff or request.user.groups.filter(name__in=["monitoring", "field"]).exists()):
        raise PermissionDenied("팀 담당자만 강종을 연결할 수 있습니다.")
    dataset = selected_dataset(request)
    lot = selected_lot(request, dataset)
    if lot.grade:
        raise ValidationError("원자료에 기록된 강종은 이 화면에서 변경하지 않습니다.")
    grade = request.data.get("grade")
    revision = request.data.get("revision")
    if not isinstance(grade, str) or grade not in ["", *MATERIAL_GRADES]:
        raise ValidationError({"grade": "목록에 있는 실제 강종을 선택하십시오."})
    if type(revision) is not int or revision < 0:
        raise ValidationError({"revision": "최신 강종 연결 상태를 다시 확인하십시오."})
    with transaction.atomic():
        dataset = Dataset.objects.select_for_update().get(pk=dataset.pk)
        links = dict(dataset.metadata.get("lot_grade_links", {}))
        previous = links.get(lot.lot_no, {})
        if previous.get("revision", 0) != revision:
            return Response({"detail": "다른 담당자가 먼저 연결을 변경했습니다. 최신 상태를 확인하십시오."}, status=409)
        links[lot.lot_no] = {"grade": grade, "revision": revision + 1, "linked_by": request.user.username}
        dataset.metadata = {**dataset.metadata, "lot_grade_links": links}
        dataset.save(update_fields=["metadata"])
    return Response({"lot": lot_material(lot, dataset)})


@api_view(["GET"])
def channels(request):
    return Response({"channels": CHANNELS})


@api_view(["GET"])
def series(request):
    dataset = selected_dataset(request)
    lot = selected_lot(request, dataset)
    channel_ids = selected_channels(request)
    start = recorded_time(request.query_params.get("start", lot.start), "start")
    end = recorded_time(request.query_params.get("end", lot.end), "end")
    if start > end:
        raise ValidationError({"end": "끝 시각은 시작 시각 이후여야 합니다."})
    try:
        max_points = int(request.query_params.get("max_points", "1000"))
    except ValueError:
        raise ValidationError({"max_points": "정수로 입력해 주세요."})
    if not 2 <= max_points <= 5000:
        raise ValidationError({"max_points": "2~5000 사이로 입력해 주세요."})
    frames = MeasurementFrame.objects.filter(
        dataset=dataset, lot_no=lot.lot_no, recorded_at__gte=start, recorded_at__lte=end,
    ).order_by("recorded_at", "source_row")
    source_count = frames.count()
    # This is only a line-breaking display rule, not an anomaly threshold.
    gap_seconds = number_or_none(dataset.metadata.get("plot_max_gap_seconds")) or 60.0
    if gap_seconds <= 0:
        gap_seconds = 60.0
    points, bucket_seconds, label_intervals = make_series(
        frames.values("recorded_at", "values", "annotations").iterator(chunk_size=2000),
        channel_ids, start, end, source_count, max_points, gap_seconds,
    )
    return Response({
        **TIME_BASIS,
        "dataset_id": str(dataset.id),
        "series": [
            {"channel_id": channel, "unit": CHANNEL_BY_ID[channel]["unit"], "points": points[channel]}
            for channel in channel_ids
        ],
        "start": start,
        "end": end,
        "source_count": source_count,
        "aggregation_seconds": bucket_seconds,
        "plot_max_gap_seconds": gap_seconds,
        "max_points_is_target": True,
        "label_intervals": label_intervals,
    })


@api_view(["GET"])
def current_frame(request):
    dataset = selected_dataset(request)
    lot = selected_lot(request, dataset)
    anchor = recorded_time(request.query_params.get("at", lot.end), "at")
    frame = MeasurementFrame.objects.filter(
        dataset=dataset, lot_no=lot.lot_no, recorded_at__lte=anchor,
    ).order_by("-recorded_at", "-source_row").first()
    threshold = number_or_none(dataset.metadata.get("stale_after_seconds"))
    items = []
    for channel in CHANNEL_IDS:
        value = number_or_none(frame.values.get(channel)) if frame else None
        measured_at = frame.recorded_at if frame else None
        age = (
            (datetime.fromisoformat(anchor) - datetime.fromisoformat(measured_at)).total_seconds()
            if measured_at else None
        )
        status = "missing" if value is None else (
            "time_threshold_unset" if threshold is None or threshold <= 0 else (
                "stale" if age > threshold else "observed"
            )
        )
        items.append({
            "channel_id": channel, "value": value, "measured_at": measured_at,
            "quality_status": status, "age_seconds": age,
            "time_basis": TIME_BASIS["time_basis"],
        })
    return Response({**TIME_BASIS, "dataset_id": str(dataset.id), "anchor_time": anchor, "channels": items})


def layout_result(layout):
    return {
        "model_version": layout.model_version,
        "revision": layout.revision,
        "placements": layout.placements,
    }


def validate_placements(data):
    placements = data.get("placements")
    if not isinstance(placements, list) or len(placements) > len(CHANNEL_IDS):
        raise ValidationError({"placements": "채널별 위치 목록을 확인해 주세요."})
    seen = set()
    cleaned = []
    for item in placements:
        if not isinstance(item, dict):
            raise ValidationError({"placements": "위치 정보의 형식이 올바르지 않습니다."})
        channel = item.get("channel_id")
        zone = item.get("zone_id")
        if not isinstance(channel, str) or channel not in CHANNEL_BY_ID or channel in seen:
            raise ValidationError({"placements": "알 수 없거나 중복된 채널입니다."})
        if not isinstance(zone, str) or zone not in ZONE_IDS or zone != CHANNEL_BY_ID[channel]["zone"]:
            raise ValidationError({"placements": "채널과 공정 구역이 맞지 않습니다."})
        position = item.get("position")
        if not isinstance(position, list) or len(position) != 3:
            raise ValidationError({"placements": "위치는 x, y, z 세 값이어야 합니다."})
        if any(number_or_none(value) is None or abs(value) > 60 for value in position):
            raise ValidationError({"placements": "좌표는 -60~60 사이의 유한한 숫자여야 합니다."})
        seen.add(channel)
        cleaned.append({"channel_id": channel, "zone_id": zone, "position": position})
    return cleaned


@api_view(["GET", "PUT"])
def equipment_layout(request):
    model_version = settings.CAL01_MODEL_VERSION
    if request.method == "GET":
        layout, _ = EquipmentLayout.objects.get_or_create(model_version=model_version)
        return Response(layout_result(layout))
    if not (request.user.is_staff or request.user.has_perm("monitor.change_equipmentlayout")):
        raise PermissionDenied("채널 위치를 수정할 권한이 없습니다.")
    if not isinstance(request.data, dict):
        raise ValidationError({"detail": "위치 정보의 형식이 올바르지 않습니다."})
    if request.data.get("model_version") != model_version:
        return Response({"detail": "모형 버전이 다릅니다. 다시 불러와 주세요."}, status=409)
    revision = request.data.get("revision")
    if isinstance(revision, bool) or not isinstance(revision, int) or revision < 0:
        raise ValidationError({"revision": "현재 위치 버전이 필요합니다."})
    placements = validate_placements(request.data)
    with transaction.atomic():
        layout, _ = EquipmentLayout.objects.get_or_create(model_version=model_version)
        layout = EquipmentLayout.objects.select_for_update().get(pk=layout.pk)
        if layout.revision != revision:
            return Response({
                "detail": "다른 사람이 위치를 수정했습니다. 최신 위치를 다시 불러와 주세요.",
                "current_revision": layout.revision,
            }, status=409)
        layout.revision += 1
        layout.placements = placements
        layout.save(update_fields=["revision", "placements", "updated_at"])
        EquipmentLayoutHistory.objects.create(
            layout=layout, revision=layout.revision,
            placements=placements, changed_by=request.user,
        )
    return Response(layout_result(layout))
