CHANNEL_IDS = [
    "CLN-IN",
    "TC-Z1", "TC-Z2", "OP-Z1", "OP-Z2",
    "TC-Z3", "TC-Z4", "TC-Z5", "TC-Z6",
    "OP-Z3", "OP-Z4", "OP-Z5", "OP-Z6",
    "CP-Z4", "CP-Z4M",
    "TC-Z7", "TC-Z8", "TC-Z9",
    "OP-Z7", "OP-Z8",
    "TC-OUT1", "TC-OUT2",
]


def describe_channel(channel_id):
    kind = "output" if channel_id.startswith("OP-") else (
        "process" if channel_id.startswith("CP-") else "temperature"
    )
    zone = "CLN" if channel_id == "CLN-IN" else channel_id.split("-", 1)[1]
    if zone == "Z4M":
        zone = "Z4"
    unit = "%" if kind == "output" else ("°C" if kind == "temperature" else None)
    return {
        "id": channel_id,
        "label": channel_id,
        "unit": unit,
        "zone": zone,
        "kind": kind,
        "is_physical_sensor": kind == "temperature",
        "unit_status": "unconfirmed" if kind == "process" else "project_convention",
        "zone_status": "needs_review" if channel_id == "TC-Z9" else "channel_identifier",
    }


CHANNELS = [describe_channel(channel_id) for channel_id in CHANNEL_IDS]
CHANNEL_BY_ID = {channel["id"]: channel for channel in CHANNELS}
ZONE_IDS = {channel["zone"] for channel in CHANNELS}
