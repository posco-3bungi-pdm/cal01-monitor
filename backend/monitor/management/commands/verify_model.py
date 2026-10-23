"""Check a repository fold13 artifact against its unchanged minute oracle."""

import hashlib
import json
from pathlib import Path

import pandas as pd
from django.core.management.base import BaseCommand, CommandError

from monitor.model_features import build_features, required_columns
from monitor.model_registry import MODEL_ZONES, load_model_entry, models_root, select_model


class Command(BaseCommand):
    help = "LOT 133 분별 예측을 저장된 fold13 기대값과 비교합니다. 학습이나 DB 변경은 하지 않습니다."

    def add_arguments(self, parser):
        parser.add_argument("--csv", required=True, help="config.json에 기록된 cal01_base_v6.csv 경로")
        parser.add_argument("--zone", choices=[*MODEL_ZONES, "all"], default="Z4")

    def handle(self, *args, **options):
        csv_path = Path(options["csv"]).resolve()
        if not csv_path.is_file():
            raise CommandError("검증할 CSV를 찾을 수 없습니다.")
        with csv_path.open("rb") as source:
            source_hash = hashlib.file_digest(source, "sha256").hexdigest()
        folder = models_root()
        registry = json.loads((folder / "registry.json").read_text(encoding="utf-8-sig"))
        zones = MODEL_ZONES if options["zone"] == "all" else [options["zone"]]
        results = []

        for zone in zones:
            active = select_model(zone)
            checks = [
                entry for entry in registry["models"]
                if entry.get("zone") == zone and entry.get("kind") == "RandomForest"
                and entry.get("status") == "check_only" and entry.get("trained_on") == "fold13"
                and active and entry.get("label_version") == active["label_version"]
            ]
            if len(checks) != 1:
                raise CommandError(f"{zone}의 활성 버전과 짝인 fold13 모델이 하나여야 합니다.")
            entry = checks[0]
            loaded = load_model_entry(entry, allow_check_only=True)
            if source_hash != loaded.config["data_sha256"]:
                raise CommandError("CSV SHA256가 모델 설정에 기록된 파일과 다릅니다.")
            expected_path = (folder / entry["expected"]).resolve()
            if not expected_path.is_relative_to(folder) or expected_path.suffix != ".json":
                raise CommandError("기대값은 저장소 models 폴더 안의 JSON이어야 합니다.")
            expected = json.loads(expected_path.read_text(encoding="utf-8-sig"))
            if expected.get("model_id") != entry["id"]:
                raise CommandError("기대값과 fold13 모델 ID가 다릅니다.")
            # Read only measurements and time. Labels/exclusions are not available
            # to this path, including when constructing the oracle inputs.
            minutes = pd.read_csv(csv_path, encoding="utf-8-sig", usecols=required_columns(loaded.features))
            minutes["MEAS_DT"] = pd.to_datetime(minutes["MEAS_DT"], errors="raise")
            minutes = minutes[minutes["LOT_NO"].eq(expected["lot"])].sort_values("MEAS_DT")
            features = build_features(minutes, loaded.features).dropna()
            predictions = loaded.estimator.predict(features)
            actual = {
                timestamp.strftime("%Y-%m-%d %H:%M:%S"): int(prediction)
                for timestamp, prediction in zip(minutes.loc[features.index, "MEAS_DT"], predictions)
            }
            wanted = {minute["t"]: minute["pred"] for minute in expected["minutes"]}
            if len(wanted) != len(expected["minutes"]):
                raise CommandError("기대값에 같은 분이 중복되어 있습니다.")
            matched = sum(actual.get(timestamp) == prediction for timestamp, prediction in wanted.items())
            result = {
                "zone": zone,
                "model_id": entry["id"],
                "lot": expected["lot"],
                "source_sha256": source_hash,
                "label_columns_used": False,
                "expected_minutes": len(wanted),
                "actual_minutes": len(actual),
                "matched_minutes": matched,
                "minute_keys_match": set(actual) == set(wanted),
                "matches": actual == wanted,
            }
            results.append(result)

        self.stdout.write(json.dumps({"results": results}, ensure_ascii=False, indent=2))
        if any(not result["matches"] for result in results):
            raise CommandError("fold13의 분별 예측이 기대값과 다릅니다.")
