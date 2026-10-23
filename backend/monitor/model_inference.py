"""Read-only inference over closed source-clock minutes, never CSV labels."""
from collections import OrderedDict
from datetime import datetime, timedelta
import hashlib
import threading
import uuid

import numpy as np
import pandas as pd
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .channels import CHANNEL_BY_ID, CHANNEL_IDS
from .model_features import build_features
from .model_registry import ModelRegistryError, load_selected_model, load_zscore_rule, public_manifest, select_model
from .models import Dataset, LotSummary, MeasurementFrame
from .workflow_views import require_team


_contexts = OrderedDict()
_lock = threading.RLock()
VERSION = "closed-minute-v1"


def clear_inference_cache():
    with _lock:
        _contexts.clear()


def _minute(value):
    return datetime.fromisoformat(value).replace(second=0, microsecond=0)


def aggregate_minutes(frames, lot_no):
    """Use raw observations for the mean, minimum, maximum and sample std."""
    rows = [{"MEAS_DT": frame["recorded_at"], **{
        channel: frame["values"].get(channel) for channel in CHANNEL_IDS
    }} for frame in frames]
    if not rows:
        return pd.DataFrame(columns=["LOT_NO", "MEAS_DT", *CHANNEL_IDS])
    raw = pd.DataFrame(rows)
    raw["MEAS_DT"] = pd.to_datetime(raw["MEAS_DT"]).dt.floor("min")
    for channel in CHANNEL_IDS:
        raw[channel] = pd.to_numeric(raw[channel], errors="coerce").replace([np.inf, -np.inf], np.nan)
    groups = raw.groupby("MEAS_DT", sort=True)
    result = groups[CHANNEL_IDS].mean()
    for suffix, values in [("MIN", groups[CHANNEL_IDS].min()),
                           ("MAX", groups[CHANNEL_IDS].max()),
                           ("STD", groups[CHANNEL_IDS].std(ddof=1).fillna(0))]:
        result = result.join(values.add_suffix("__" + suffix))
    result["SAMPLE_COUNT"] = groups.size()
    result = result.reset_index()
    result.insert(0, "LOT_NO", str(lot_no))
    return result


def _closed_minutes(dataset, lot, cutoff):
    # A cache holds only aggregates. Rewinding slices before any feature calculation.
    key = (str(dataset.id), dataset.sha256, lot.lot_no)
    context = _contexts.pop(key, None)
    if context is None:
        context = {"cutoff": "", "minutes": pd.DataFrame(), "results": {}}
    _contexts[key] = context
    while len(_contexts) > 8:
        _contexts.popitem(last=False)
    limit = cutoff.isoformat(timespec="microseconds")
    if limit > context["cutoff"]:
        query = MeasurementFrame.objects.filter(dataset=dataset, lot_no=lot.lot_no, recorded_at__lt=limit)
        if context["cutoff"]:
            query = query.filter(recorded_at__gte=context["cutoff"])
        added = aggregate_minutes(query.order_by("recorded_at", "source_row").values("recorded_at", "values").iterator(chunk_size=2000), lot.lot_no)
        if len(added):
            context["minutes"] = pd.concat([context["minutes"], added], ignore_index=True)
        context["cutoff"] = limit
    minutes = context["minutes"]
    if len(minutes):
        minutes = minutes.loc[minutes["MEAS_DT"] < pd.Timestamp(cutoff)].copy()
    return minutes, context


def _zone_channels(zone):
    return [c for c in CHANNEL_IDS if CHANNEL_BY_ID[c]["zone"] == zone]


def _zscore_results(minutes, zone, entry, rule):
    channels = _zone_channels(zone)
    values = minutes[channels]
    means = values.expanding(min_periods=rule["min_periods"]).mean().shift(1)
    stds = values.expanding(min_periods=rule["min_periods"]).std(ddof=rule["ddof"]).shift(1)
    z = (values - means).abs() / stds.replace(0, np.nan)
    preds = (z > rule["threshold"]).any(axis=1)
    # A missing/constant channel is not a normal result for the whole zone.
    ready = z.notna().all(axis=1) | preds
    rows = []
    for scores, prediction, available in zip(z.to_numpy(), preds.to_numpy(), ready.to_numpy()):
        matched = [channel for channel, score in zip(channels, scores) if score > rule["threshold"]]
        rows.append({"prediction": int(prediction) if available else None,
                     "probability": None, "channel_ids": matched or channels,
                     "status": "ready" if available else "warming_up",
                     "unavailable_channels": [channel for channel, score in zip(channels, scores) if np.isnan(score)],
                     "reason": "" if available else f"일부 채널에 지난 {rule['min_periods']}분 이상의 값이나 변동이 부족함"})
    return {"model_id": entry["id"], "kind": "Z-score", "label_version": entry["label_version"],
            "evidence": "같은 LOT의 지난 분 평균에서 표준편차 3배를 벗어났는지 확인", "rows": rows}


def _forest_results(minutes, zone, loaded):
    features = build_features(minutes, loaded.features)
    valid = features.notna().all(axis=1) & np.isfinite(features).all(axis=1)
    rows = [{"prediction": None, "probability": None, "channel_ids": loaded.features["zone_sensors"],
             "status": "warming_up", "reason": "입력에 필요한 지난 값이나 채널값이 아직 부족함"}
            for _ in range(len(minutes))]
    if valid.any():
        inputs = features.loc[valid, loaded.feature_order]
        predictions = loaded.estimator.predict(inputs)
        classes = list(loaded.estimator.classes_)
        probabilities = loaded.estimator.predict_proba(inputs)[:, classes.index(1)] if 1 in classes else np.zeros(len(inputs))
        for index, prediction, probability in zip(np.flatnonzero(valid), predictions, probabilities):
            rows[int(index)] = {"prediction": int(prediction), "probability": float(probability),
                               "channel_ids": loaded.features["zone_sensors"], "status": "ready", "reason": ""}
    return {"model_id": loaded.entry["id"], "kind": "RandomForest", "label_version": loaded.entry["label_version"],
            "evidence": loaded.entry.get("evidence", ""), "rows": rows}


def _events(minutes, result, dataset, lot_no, zone, lot):
    events, active = [], None
    for timestamp, row in zip(minutes["MEAS_DT"], result["rows"]):
        if row["prediction"] != 1:
            active = None
            continue
        time = timestamp.to_pydatetime()
        start = time.isoformat(timespec="microseconds")
        # The last observation is part of this closed minute, not a future timestamp.
        end = min(time + timedelta(minutes=1) - timedelta(microseconds=1), datetime.fromisoformat(lot.end)).isoformat(timespec="microseconds")
        start = max(start, lot.start)
        if active is None or time - datetime.fromisoformat(active["observed_minute"]) != timedelta(minutes=1):
            digest = hashlib.sha256(f"{dataset.id}:{lot_no}:{zone}:{result['model_id']}:{start}".encode()).hexdigest()[:32]
            active = {"id": digest, "dataset_id": str(dataset.id), "lot_no": lot_no, "zone_id": zone,
                      **{k: result[k] for k in ["model_id", "kind", "label_version", "evidence"]},
                      "start": start, "end": end, "observed_minute": time.isoformat(), "channel_ids": row["channel_ids"],
                      "probability": row["probability"], "point_count": 1}
            events.append(active)
        else:
            active["end"] = end
            active["observed_minute"] = time.isoformat()
            active["point_count"] += 1
            active["channel_ids"] = list(dict.fromkeys(active["channel_ids"] + row["channel_ids"]))
            if row["probability"] is not None:
                active["probability"] = max(active["probability"] or 0, row["probability"])
    return events


def infer_closed_minutes(dataset, lot, watermark, model, end_of_stream=False):
    cutoff = _minute(watermark.recorded_at)
    if end_of_stream:
        last = MeasurementFrame.objects.filter(dataset=dataset).order_by("-recorded_at", "-source_row").first()
        if last and last.pk == watermark.pk:
            cutoff += timedelta(minutes=1)
        else:
            raise ValidationError({"end_of_stream": "데이터의 마지막 행에 도착한 뒤에만 마지막 분을 계산할 수 있습니다."})
    if watermark.lot_no != lot.lot_no:
        last_lot_frame = MeasurementFrame.objects.filter(dataset=dataset, lot_no=lot.lot_no).order_by("-recorded_at", "-source_row").first()
        if not last_lot_frame or (last_lot_frame.recorded_at, last_lot_frame.source_row) >= (watermark.recorded_at, watermark.source_row):
            raise ValidationError({"lot_no": "도착한 행보다 뒤의 LOT는 분석할 수 없습니다."})
        # A LOT can end halfway through a minute. The next LOT closes it too.
        cutoff = _minute(lot.end) + timedelta(minutes=1)
    with _lock:
        minutes, context = _closed_minutes(dataset, lot, cutoff)
        predictions, events = [], []
        z_entry, z_rule = load_zscore_rule()
        zones = list(dict.fromkeys(c["zone"] for c in CHANNEL_BY_ID.values()))
        for zone in zones:
            loaded = load_selected_model(zone) if model == "randomforest" and zone in {"Z3", "Z4", "Z5", "Z6"} and select_model(zone) else None
            if not len(minutes):
                predictions.append({"zone_id": zone, "model_id": loaded.entry["id"] if loaded else z_entry["id"],
                                    "kind": "RandomForest" if loaded else "Z-score", "label_version": loaded.entry["label_version"] if loaded else z_entry["label_version"],
                                    "status": "warming_up", "prediction": None, "probability": None, "minute": None,
                                    "channel_ids": _zone_channels(zone), "evidence": "", "reason": "첫 1분이 끝나면 계산 시작"})
                continue
            signature = (loaded.entry["id"] if loaded else z_entry["id"], len(minutes))
            result = context["results"].get((zone, signature))
            if result is None:
                result = _forest_results(minutes, zone, loaded) if loaded else _zscore_results(minutes, zone, z_entry, z_rule)
                # Cache only the latest result per zone/model; replay rewinds recompute causally.
                context["results"] = {k: v for k, v in context["results"].items() if k[0] != zone}
                context["results"][(zone, signature)] = result
            latest = {**result["rows"][-1], "zone_id": zone, "minute": minutes.iloc[-1]["MEAS_DT"].isoformat(),
                      **{k: result[k] for k in ["model_id", "kind", "label_version", "evidence"]}}
            predictions.append(latest)
            events.extend(_events(minutes, result, dataset, lot.lot_no, zone, lot))
        return {"dataset_id": str(dataset.id), "lot_no": lot.lot_no,
                "through_source_row": watermark.source_row, "through": watermark.recorded_at,
                "closed_before": cutoff.isoformat(timespec="microseconds"), "closed_minutes": len(minutes),
                "model": model, "predictions": predictions,
                "event_count": len(events), "events_truncated": len(events) > 200,
                "events": sorted(events, key=lambda e: (e["start"], e["zone_id"]))[-200:],
                "time_basis": "source_recorded_clock", "source_timezone": None,
                "label_used": False, "excluded_used": False, "mode": "csv_simulation", "version": VERSION}


@api_view(["GET"])
def model_manifest(request):
    require_team(request.user)
    try:
        return Response(public_manifest())
    except ModelRegistryError:
        return Response({"detail": "모델 등록 정보를 읽지 못했습니다."}, status=503)


@api_view(["POST"])
def model_predictions(request):
    require_team(request.user)
    data = request.data
    if not isinstance(data, dict):
        raise ValidationError("데이터와 도착한 행을 지정해 주세요.")
    try:
        dataset_id = uuid.UUID(str(data.get("dataset", "")))
    except (ValueError, TypeError, AttributeError):
        raise ValidationError({"dataset": "분석할 데이터를 선택해 주세요."})
    row = data.get("through_source_row")
    if isinstance(row, bool) or not isinstance(row, int) or row < 1:
        raise ValidationError({"through_source_row": "실제로 도착한 행 번호를 보내 주세요."})
    model = data.get("model", "randomforest")
    if not isinstance(model, str) or model not in {"randomforest", "zscore"}:
        raise ValidationError({"model": "RandomForestClassifier 또는 Z-score를 선택해 주세요."})
    end = data.get("end_of_stream", False)
    if not isinstance(end, bool):
        raise ValidationError({"end_of_stream": "참·거짓 값으로 보내 주세요."})
    dataset = get_object_or_404(Dataset, pk=dataset_id, status=Dataset.Status.READY)
    ignored = dataset.metadata.get("unimported_columns", [])
    if any(isinstance(name, str) and name.endswith(("__MIN", "__MAX", "__STD")) for name in ignored):
        raise ValidationError({"dataset": "이 분 단위 CSV는 원래의 최솟값·최댓값·표준편차가 등록되지 않았습니다. 원본 온도 CSV나 1초 시뮬레이션 CSV를 사용해 주세요."})
    lot = get_object_or_404(LotSummary, dataset=dataset, lot_no=str(data.get("lot_no", "")))
    watermark = get_object_or_404(MeasurementFrame, dataset=dataset, source_row=row)
    try:
        return Response(infer_closed_minutes(dataset, lot, watermark, model, end))
    except ModelRegistryError:
        return Response({"detail": "등록된 모델을 불러오지 못했습니다. 모델 파일과 입력 순서를 확인해 주세요."}, status=503)
