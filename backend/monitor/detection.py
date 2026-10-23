"""Retrospective, whole-LOT Z-score exploration; no source labels are changed."""
import hashlib
import json
import math
from datetime import datetime

from .channels import CHANNEL_BY_ID
from .series import number_or_none

DETECTOR_VERSION = "whole-lot-raw-zscore-v1"
MAX_LOT_ROWS = 200_000


def config_fingerprint(config):
    return hashlib.sha256(
        json.dumps(config, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    ).hexdigest()


def channel_stats(values, threshold, min_valid_samples):
    count = len(values)
    result = {"count": count, "mean": None, "std": None, "lower": None, "upper": None}
    if count < min_valid_samples:
        return {**result, "status": "insufficient_samples"}
    if min(values) == max(values):
        value = values[0]
        return {**result, "mean": value, "std": 0.0, "lower": value, "upper": value, "status": "constant"}
    try:
        mean = math.fsum(value / count for value in values)
        deviations = [value - mean for value in values]
        scale = max(abs(value) for value in deviations)
        if not math.isfinite(mean) or not math.isfinite(scale):
            return {**result, "status": "unusable_statistics"}
        # Scaling avoids treating a small but real CP variance as zero.
        std = scale * math.sqrt(math.fsum((value / scale) ** 2 for value in deviations) / count) if scale else 0.0
        lower, upper = mean - threshold * std, mean + threshold * std
    except (OverflowError, ValueError):
        return {**result, "status": "unusable_statistics"}
    if not all(math.isfinite(value) for value in [std, lower, upper]):
        return {**result, "status": "unusable_statistics"}
    result.update(mean=mean, std=std, lower=lower, upper=upper)
    return {**result, "status": "ready" if std > 0 else "constant"}


def analyze_frames(frames, channels, *, threshold=3.0, max_gap_seconds=60, min_valid_samples=30):
    """Frames must be ordered by source time and source row within one LOT."""
    stats = {}
    for channel in channels:
        values = [number_or_none(frame["values"].get(channel)) for frame in frames]
        stats[channel] = channel_stats(
            [value for value in values if value is not None], threshold, min_valid_samples,
        )
    ready = [channel for channel in channels if stats[channel]["status"] == "ready"]
    active = {}
    candidates = []
    previous_time = None
    exceedances = {channel: 0 for channel in channels}

    def close(channel, reason):
        candidate = active.pop(channel, None)
        if candidate:
            candidate["end_reason"] = reason
            candidates.append(candidate)

    for frame in frames:
        time = frame["recorded_at"]
        parsed = datetime.fromisoformat(time)
        if previous_time is not None and (parsed - previous_time).total_seconds() > max_gap_seconds:
            for channel in list(active):
                close(channel, "observation_gap")
        previous_time = parsed
        for channel in ready:
            value = number_or_none(frame["values"].get(channel))
            if value is None:
                close(channel, "missing_value")
                continue
            baseline = stats[channel]
            z_score = (value - baseline["mean"]) / baseline["std"]
            if not math.isfinite(z_score):
                close(channel, "unusable_score")
                continue
            if abs(z_score) <= threshold:
                close(channel, "normal_value")
                continue
            exceedances[channel] += 1
            point = {
                "source_frame_id": frame["id"], "source_row": frame["source_row"],
                "source_record_id": frame["source_record_id"], "recorded_at": time,
                "value": value, "z_score": z_score,
            }
            if channel not in active:
                active[channel] = {
                    "channel_id": channel, "zone_id": CHANNEL_BY_ID[channel]["zone"],
                    "start": time, "end": time, "peak_at": time,
                    "peak_value": value, "peak_z": z_score, "point_count": 0, "points": [],
                }
            candidate = active[channel]
            candidate["end"] = time
            candidate["point_count"] += 1
            candidate["points"].append(point)
            if abs(z_score) > abs(candidate["peak_z"]):
                candidate.update(peak_at=time, peak_value=value, peak_z=z_score)
    for channel in list(active):
        close(channel, "end_of_lot")
    candidates.sort(key=lambda item: (item["start"], item["channel_id"]))
    summary = {
        "source_count": len(frames),
        "candidate_count": len(candidates),
        "exceedance_count": sum(exceedances.values()),
        "exceedance_count_by_channel": exceedances,
        "analyzed_channels": ready,
        "skipped_channels": {channel: stats[channel]["status"] for channel in channels if channel not in ready},
        "interpretation": "선택한 LOT 전체 평균에서 벗어난 과거 관측값입니다. 고장 확정이나 새 LOT의 예측 결과가 아닙니다.",
    }
    return stats, candidates, summary
