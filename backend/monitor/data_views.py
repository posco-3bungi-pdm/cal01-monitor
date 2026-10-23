from pathlib import Path

from django.conf import settings
from django.core import signing
from django.db.models import Max, Min, Q, Sum
from rest_framework.decorators import api_view, parser_classes
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from .csv_import import CsvImportError, ImportInProgress, register_csv
from .models import MeasurementFrame
from .series import number_or_none, recorded_time
from .views import TIME_BASIS, selected_dataset, selected_lot

CURSOR_SALT = "cal01.historical-playback.v1"


def dataset_result(dataset):
    return {
        "id": str(dataset.id), "name": dataset.name, "row_count": dataset.row_count,
        "status": dataset.status, "source_name": dataset.source_name,
        "source_size": dataset.source_size, "sha256": dataset.sha256,
        "lot_count": dataset.lots.count(), "metadata": dataset.metadata,
    }


@api_view(["POST"])
@parser_classes([MultiPartParser])
def import_dataset(request):
    data = request.data
    if error := getattr(request._request, "cal01_upload_error", None):
        return Response({"detail": error}, status=413)
    if set(data) - {"file", "name"}:
        raise ValidationError({"detail": "file과 선택 사항인 name만 보내 주세요. 서버 경로는 받지 않습니다."})
    files = request.FILES.getlist("file")
    if len(files) != 1 or sum(len(items) for _, items in request.FILES.lists()) != 1:
        raise ValidationError({"file": "CSV 파일 한 개를 선택해 주세요."})
    file = files[0]
    if not file.name.lower().endswith(".csv"):
        raise ValidationError({"file": "CSV 파일을 선택해 주세요."})
    if not 0 < file.size <= settings.CAL01_UPLOAD_MAX_BYTES:
        return Response({"detail": "빈 파일이거나 허용된 CSV 크기를 넘었습니다."}, status=413)
    if len(data.getlist("name")) > 1:
        raise ValidationError({"name": "표시 이름은 한 개만 보내 주세요."})
    name = data.get("name", "")
    if not isinstance(name, str) or len(name) > 200:
        raise ValidationError({"name": "표시 이름은 200자까지 입력해 주세요."})
    # The middleware streams even small uploads to an OS-generated temporary
    # path. Neither the submitted filename nor a client path controls this path.
    if not hasattr(file, "temporary_file_path"):
        raise ValidationError({"file": "업로드 임시 파일을 읽을 수 없습니다."})
    try:
        dataset, reused = register_csv(
            Path(file.temporary_file_path()), name=name, source_name=file.name, retry_failed=True,
        )
    except ImportInProgress as exc:
        return Response({"detail": str(exc)}, status=409)
    except CsvImportError as exc:
        raise ValidationError({"detail": str(exc)}) from exc
    return Response({
        **TIME_BASIS, "dataset": dataset_result(dataset), "reused": reused,
    }, status=200 if reused else 201)


@api_view(["GET"])
def playback_frames(request):
    dataset = selected_dataset(request)
    if "lot" in request.query_params:
        lot = selected_lot(request, dataset)
        lot_no, scope_start, scope_end, scope_count = lot.lot_no, lot.start, lot.end, lot.count
    else:
        bounds = dataset.lots.aggregate(start=Min("start"), end=Max("end"), count=Sum("count"))
        if not bounds["start"] or not bounds["end"] or not bounds["count"]:
            raise ValidationError({"dataset": "재생할 관측값이 없습니다."})
        lot_no = None
        scope_start, scope_end, scope_count = bounds["start"], bounds["end"], bounds["count"]
    start = recorded_time(request.query_params.get("start", scope_start), "start")
    end = recorded_time(request.query_params.get("end", scope_end), "end")
    if start > end:
        raise ValidationError({"end": "끝 시각은 시작 시각 이후여야 합니다."})
    try:
        limit = int(request.query_params.get("limit", "1000"))
    except ValueError as exc:
        raise ValidationError({"limit": "1~2000 사이 정수로 입력해 주세요."}) from exc
    if not 1 <= limit <= 2000:
        raise ValidationError({"limit": "1~2000 사이 정수로 입력해 주세요."})
    context = {"dataset": str(dataset.id), "lot": lot_no, "start": start, "end": end}
    rows = MeasurementFrame.objects.filter(
        dataset=dataset, recorded_at__gte=start, recorded_at__lte=end,
    )
    if lot_no is not None:
        rows = rows.filter(lot_no=lot_no)
    cursor = request.query_params.get("cursor")
    if cursor:
        try:
            if len(cursor) > 2048:
                raise ValueError
            decoded = signing.loads(cursor, salt=CURSOR_SALT, max_age=7 * 24 * 3600)
            if not isinstance(decoded, dict) or decoded.get("context") != context:
                raise ValueError
            after_time, after_row = decoded["time"], decoded["row"]
            if not isinstance(after_row, int) or isinstance(after_row, bool) or after_row < 1:
                raise ValueError
            if recorded_time(after_time) != after_time or not start <= after_time <= end:
                raise ValueError
        except (signing.BadSignature, ValueError, TypeError, KeyError, ValidationError) as exc:
            raise ValidationError({"cursor": "재생 위치가 만료되었거나 데이터·LOT·기간이 다릅니다. 다시 시작해 주세요."}) from exc
        rows = rows.filter(Q(recorded_at__gt=after_time) | Q(recorded_at=after_time, source_row__gt=after_row))
    page = list(rows.order_by("recorded_at", "source_row").values(
        "source_row", "source_record_id", "lot_no", "grade", "recorded_at", "recorded_at_raw", "values", "annotations",
    )[:limit + 1])
    has_more = len(page) > limit
    page = page[:limit]
    next_cursor = None
    if has_more:
        last = page[-1]
        next_cursor = signing.dumps({
            "context": context, "time": last["recorded_at"], "row": last["source_row"],
        }, salt=CURSOR_SALT, compress=True)
    gap = number_or_none(dataset.metadata.get("plot_max_gap_seconds"))
    stale = number_or_none(dataset.metadata.get("stale_after_seconds"))
    return Response({
        **TIME_BASIS, "dataset_id": str(dataset.id), "lot_no": lot_no,
        "start": start, "end": end, "lot_start": scope_start, "lot_end": scope_end,
        "lot_count": scope_count, "plot_max_gap_seconds": gap if gap and gap > 0 else 60,
        "stale_after_seconds": stale if stale and stale > 0 else None,
        "frames": [{
            "source_row": row["source_row"], "source_record_id": row["source_record_id"],
            "lot_no": row["lot_no"], "grade": row["grade"],
            "time": row["recorded_at"], "recorded_at_raw": row["recorded_at_raw"],
            "values": row["values"], "annotations": row["annotations"],
        } for row in page],
        "next_cursor": next_cursor, "has_more": has_more,
    })
