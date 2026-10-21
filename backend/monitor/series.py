import math
from datetime import datetime

from rest_framework.exceptions import ValidationError


def recorded_time(value, field_name="time"):
    if not isinstance(value, str) or ("T" not in value and " " not in value):
        raise ValidationError({field_name: "날짜와 시각을 함께 입력해 주세요."})
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        raise ValidationError({field_name: "시각 형식이 올바르지 않습니다."})
    if parsed.tzinfo is not None:
        raise ValidationError({field_name: "원자료의 시간대 없는 시각을 사용해 주세요."})
    return parsed.isoformat(timespec="microseconds")


def number_or_none(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) else None


def source_label(annotations):
    value = annotations.get("LABEL")
    return int(value) if isinstance(value, (int, float)) and value in (0, 1) else None


def make_series(frames, channel_ids, start, end, source_count, max_points, gap_seconds):
    """Summarize only for display; keep extrema, labels and missing-data breaks."""
    start_time = datetime.fromisoformat(start)
    span = (datetime.fromisoformat(end) - start_time).total_seconds()
    bucket_seconds = 0
    if source_count > max_points:
        bucket_seconds = max(60, math.ceil(span / max_points / 60) * 60)
    points = {channel: [] for channel in channel_ids}
    buckets = {}
    previous_time = None
    epoch = datetime(1970, 1, 1)
    label_intervals = []
    active_label = None

    def close_label():
        nonlocal active_label
        if active_label is not None:
            label_intervals.append(active_label)
            active_label = None

    def flush(channel):
        bucket = buckets.pop(channel, None)
        if bucket:
            points[channel].append({
                "time": bucket["time"],
                "value": bucket["sum"] / bucket["count"],
                "min": bucket["min"],
                "max": bucket["max"],
                "count": bucket["count"],
                "label": bucket["label"],
            })

    def missing(channel, time, reason, label=None):
        flush(channel)
        if not points[channel] or points[channel][-1]["value"] is not None:
            points[channel].append({
                "time": time, "value": None, "min": None, "max": None,
                "count": 0, "label": label, "gap": True, "gap_reason": reason,
            })
        elif label is not None:
            points[channel][-1]["label"] = max(points[channel][-1]["label"] or 0, label)

    for frame in frames:
        time = frame["recorded_at"]
        parsed = datetime.fromisoformat(time)
        if previous_time is not None and (parsed - previous_time).total_seconds() > gap_seconds:
            close_label()
            gap_time = (previous_time + (parsed - previous_time) / 2).isoformat(timespec="microseconds")
            for channel in channel_ids:
                missing(channel, gap_time, "no_observation")
        previous_time = parsed
        label = source_label(frame["annotations"])
        # These are actual labeled observations, independent of plot buckets or channel nulls.
        if label == 1:
            if active_label is None:
                active_label = {"start": time, "end": time, "count": 1}
            else:
                active_label["end"] = time
                active_label["count"] += 1
        else:
            close_label()
        key = int((parsed - epoch).total_seconds() // bucket_seconds) if bucket_seconds else None
        for channel in channel_ids:
            value = number_or_none(frame["values"].get(channel))
            if value is None:
                missing(channel, time, "missing_value", label)
                continue
            if not bucket_seconds:
                points[channel].append({
                    "time": time, "value": value, "min": value, "max": value,
                    "count": 1, "label": label,
                })
                continue
            old = buckets.get(channel)
            if old and old["key"] != key:
                flush(channel)
                old = None
            if old is None:
                buckets[channel] = {
                    "key": key, "time": time, "sum": value,
                    "min": value, "max": value, "count": 1, "label": label,
                }
            else:
                old["sum"] += value
                old["count"] += 1
                old["min"] = min(old["min"], value)
                old["max"] = max(old["max"], value)
                if label is not None:
                    old["label"] = max(old["label"] or 0, label)
    for channel in channel_ids:
        flush(channel)
    close_label()
    return points, bucket_seconds, label_intervals
