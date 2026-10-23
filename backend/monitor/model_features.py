"""Causal minute features used by the supplied v6 zone models.

The training notebook rolls over observed minute rows, without filling gaps.
Only the within-minute mean/minimum/maximum/standard deviation are supplied by
the caller. Labels, exclusions and other annotations are never model inputs.
"""

import numpy as np
import pandas as pd


FURNACE_CHANNELS = {
    "Z1": ["TC-Z1", "OP-Z1"],
    "Z2": ["TC-Z2", "OP-Z2"],
    "Z3": ["TC-Z3", "OP-Z3"],
    "Z4": ["TC-Z4", "OP-Z4", "CP-Z4"],
    "Z5": ["TC-Z5", "OP-Z5"],
    "Z6": ["TC-Z6", "OP-Z6"],
    "Z7": ["TC-Z7", "OP-Z7"],
    "Z8": ["TC-Z8", "OP-Z8"],
}


def required_columns(spec):
    """Columns needed from minute aggregates; no labels or annotations."""
    channels = list(spec["zone_sensors"])
    context = spec["context"]
    for channel in context["common_sensors"] + context["common_ops"]:
        if channel not in channels:
            channels.append(channel)
    for zone in context["furnace_zones"]:
        for channel in FURNACE_CHANNELS[zone]:
            if channel not in channels:
                channels.append(channel)
    columns = ["LOT_NO", "MEAS_DT"] + channels
    for channel in spec["zone_sensors"]:
        columns += [channel + suffix for suffix in ["__MIN", "__MAX", "__STD"]]
    return columns


def build_features(minutes, spec):
    """Return only ``feature_order`` columns, preserving input index and order.

    Calculations run in time order within each LOT. A first-row difference is
    intentionally missing, matching the notebook's dropna rule. The caller can
    report that minute as warming up, rather than inventing a normal result.
    """
    if not minutes.index.is_unique:
        raise ValueError("Minute input must have a unique index.")
    missing = sorted(set(required_columns(spec)) - set(minutes.columns))
    if missing:
        raise ValueError("Missing minute columns: " + ", ".join(missing))
    order = list(spec["feature_order"])
    if len(order) != len(set(order)):
        raise ValueError("Feature order contains duplicate names.")
    if minutes.empty:
        return pd.DataFrame(index=minutes.index, columns=order, dtype=float)

    data = minutes[required_columns(spec)].copy()
    data["MEAS_DT"] = pd.to_datetime(data["MEAS_DT"], errors="raise")
    if data[["LOT_NO", "MEAS_DT"]].isna().any().any():
        raise ValueError("LOT and minute timestamp are required.")
    if data.duplicated(["LOT_NO", "MEAS_DT"]).any():
        raise ValueError("Expected one aggregate per LOT and minute.")
    data = data.sort_values(["LOT_NO", "MEAS_DT"], kind="stable")
    numeric = [name for name in data.columns if name not in ["LOT_NO", "MEAS_DT"]]
    data[numeric] = data[numeric].apply(pd.to_numeric, errors="coerce")
    data[numeric] = data[numeric].replace([np.inf, -np.inf], np.nan)

    sensors = spec["zone_sensors"]
    context = spec["context"]
    window5 = int(context["window_5"])
    window10 = int(context["window_10"])
    min_periods = int(context["min_periods"])
    ddof = int(context["ddof"])
    threshold = float(context["z_threshold"])
    output = pd.DataFrame(index=data.index, columns=order, dtype=float)

    for _, lot in data.groupby("LOT_NO", sort=False):
        current = pd.DataFrame(index=lot.index)
        past_stats = {}

        def past(channel):
            if channel not in past_stats:
                previous = lot[channel].shift(1)
                mean = previous.expanding(min_periods=min_periods).mean()
                std = previous.expanding(min_periods=min_periods).std(ddof=ddof)
                past_stats[channel] = (mean, std.replace(0, np.nan))
            return past_stats[channel]

        def over(channel):
            mean, std = past(channel)
            return ((lot[channel] - mean).abs() / std > threshold).astype(int)

        for channel in sensors:
            values = lot[channel]
            previous = values.shift(1)
            current[channel] = values
            current[channel + "__DIFF"] = values - previous
            current[channel + "__MIN"] = lot[channel + "__MIN"]
            current[channel + "__MAX"] = lot[channel + "__MAX"]
            current[channel + "__STD"] = lot[channel + "__STD"].fillna(0)
            current[channel + "__DEV10"] = (
                values - previous.rolling(window10, min_periods=2).mean()
            ).fillna(0)
            # The source uses pandas' default sample std for this feature.
            current[channel + "__STD10"] = previous.rolling(
                window10, min_periods=2,
            ).std(ddof=1).fillna(0)
            mean, std = past(channel)
            current[channel + "__ZPAST"] = ((values - mean).abs() / std).fillna(0)
            high = (lot[channel + "__MAX"] - mean).abs()
            low = (lot[channel + "__MIN"] - mean).abs()
            edge = high.where(high > low, low)
            current[channel + "__ZPAST_EDGE"] = (edge / std).fillna(0)

        for common_channels, total_name in [
            (context["common_sensors"], "COMMON__OTHERS"),
            (context["common_ops"], "COMMON__OP_OTHERS"),
        ]:
            total = pd.Series(0, index=lot.index, dtype=float)
            for channel in common_channels:
                current[channel + "__CHG5"] = (
                    lot[channel] - lot[channel].shift(window5)
                ).fillna(0)
                if channel not in sensors:
                    total += over(channel).rolling(window5, min_periods=1).max()
            current[total_name] = total

        furnace = pd.Series(0, index=lot.index, dtype=float)
        for zone in context["furnace_zones"]:
            if zone == spec["zone"]:
                continue
            zone_over = pd.Series(0, index=lot.index)
            for channel in FURNACE_CHANNELS[zone]:
                zone_over = (zone_over + over(channel)).clip(upper=1)
            furnace += zone_over.rolling(window5, min_periods=1).max()
        current["FURNACE__OTHERS"] = furnace

        tc = next((name for name in sensors if name.startswith("TC-")), None)
        op = next((name for name in sensors if name.startswith("OP-")), None)
        if tc and op:
            same = ((lot[tc].diff() * lot[op].diff()) > 0).astype(int)
            current["CONTROL__SAME5"] = same.rolling(window5, min_periods=1).mean()

        unsupported = sorted(set(order) - set(current.columns))
        if unsupported:
            raise ValueError("Unsupported model features: " + ", ".join(unsupported))
        output.loc[lot.index, order] = current[order]

    return output.reindex(minutes.index)
