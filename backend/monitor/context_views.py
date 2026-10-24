from django.db.models import Q
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from .models import OperationalRecord
from .series import recorded_time
from .views import selected_dataset
from .presentation import is_presentation_viewer


@api_view(["GET"])
def records(request):
    if is_presentation_viewer(request.user):
        raise PermissionDenied("관람 계정에는 실제 조업·정비 기록을 공개하지 않습니다.")
    dataset = selected_dataset(request)
    start = recorded_time(request.query_params.get("start"), "start")
    end = recorded_time(request.query_params.get("end"), "end")
    if start > end:
        raise ValidationError({"end": "끝 시각은 시작 시각 이후여야 합니다."})
    points = Q(start_time__gte=start, start_time__lte=end, end_time__isnull=True)
    intervals = Q(start_time__lte=end, end_time__gte=start)
    dates = Q(precision="date", start_date__lte=end[:10], end_date__gte=start[:10])
    items = OperationalRecord.objects.filter(dataset=dataset).filter(points | intervals | dates)
    result = []
    counts = {kind: 0 for kind in ("operation", "plan", "detection", "maintenance", "parts")}
    for item in items:
        record = dict(item.payload)
        record["time_basis"] = "source_calendar_date" if item.precision == "date" else "source_recorded_clock"
        if item.precision == "date":
            record["start"] = item.start_date.isoformat()
            record["end"] = item.end_date.isoformat()
            record["end_inclusive"] = True
        else:
            record["start"] = item.start_time
            record["end"] = item.end_time
        record["source_export_sha256"] = item.imported_from_sha256
        result.append(record)
        counts[item.kind] += 1
    result.sort(key=lambda item: (item["start"], item["type"], item["id"]))
    return Response({
        "dataset_id": str(dataset.id), "start": start, "end": end,
        "records": result, "count": len(result), "counts_by_kind": counts,
        "source_exports": dataset.metadata.get("context_exports", []),
    })
