"""Load only versioned, repository-owned detector artifacts."""

from dataclasses import dataclass
from functools import lru_cache
from importlib.metadata import version
import json
import math
from pathlib import Path
import re
from threading import RLock


SKLEARN_VERSION = "1.9.1"
MODEL_ZONES = ("Z3", "Z4", "Z5", "Z6")
_load_lock = RLock()


class ModelRegistryError(ValueError):
    pass


@dataclass(frozen=True)
class LoadedModel:
    entry: dict
    estimator: object
    features: dict
    config: dict

    @property
    def feature_order(self):
        return self.features["feature_order"]


def models_root(root=None):
    # root is an internal argument for offline checks, never an HTTP parameter.
    return Path(root or Path(__file__).resolve().parents[2] / "models").resolve()


def _owned_file(root, relative, suffix):
    if not isinstance(relative, str) or not relative or Path(relative).is_absolute():
        raise ModelRegistryError("모델 파일 경로가 올바르지 않습니다.")
    candidate = (root / relative).resolve()
    if not candidate.is_relative_to(root) or candidate.suffix != suffix:
        raise ModelRegistryError("저장소 모델 폴더 밖의 파일은 읽을 수 없습니다.")
    if not candidate.is_file():
        raise ModelRegistryError("등록된 모델 파일을 찾을 수 없습니다.")
    return candidate


def _json_file(path):
    try:
        with path.open(encoding="utf-8-sig") as source:
            value = json.load(source)
    except (OSError, ValueError) as error:
        raise ModelRegistryError("모델 설정 파일을 읽을 수 없습니다.") from error
    if not isinstance(value, dict):
        raise ModelRegistryError("모델 설정은 JSON 객체여야 합니다.")
    return value


def _registry(root):
    entries = _json_file(root / "registry.json").get("models")
    if not isinstance(entries, list) or any(not isinstance(entry, dict) for entry in entries):
        raise ModelRegistryError("모델 목록 형식이 올바르지 않습니다.")
    ids = [entry.get("id") for entry in entries]
    if any(not isinstance(model_id, str) or not model_id for model_id in ids) or len(ids) != len(set(ids)):
        raise ModelRegistryError("모델 ID가 비어 있거나 중복되었습니다.")
    return entries


def _label_number(entry):
    label = entry.get("label_version", "")
    if not isinstance(label, str) or not re.fullmatch(r"v[0-9]+", label):
        raise ModelRegistryError("모델 라벨 버전은 v와 숫자로 표시해야 합니다.")
    return int(label[1:])


def select_model(zone, kind="RandomForest", *, root=None):
    if kind != "Z-score" and zone not in MODEL_ZONES:
        return None
    zone_key = "all" if kind == "Z-score" else zone
    entries = [
        entry for entry in _registry(models_root(root))
        if entry.get("kind") == kind and entry.get("zone") == zone_key and entry.get("status") == "active"
    ]
    if not entries:
        return None
    latest = max(_label_number(entry) for entry in entries)
    matches = [entry for entry in entries if _label_number(entry) == latest]
    # Two active artifacts with one label version require an explicit registry decision.
    if len(matches) != 1:
        raise ModelRegistryError("같은 구역과 라벨 버전에 활성 모델이 둘 이상입니다.")
    return matches[0].copy()


def _file_key(path):
    stat = path.stat()
    return (str(path), stat.st_mtime_ns, stat.st_size)


@lru_cache(maxsize=4)
def _load_cached(entry_json, model_key, features_key, config_key):
    import joblib
    from sklearn.ensemble import IsolationForest, RandomForestClassifier

    entry = json.loads(entry_json)
    if entry.get("sklearn") != SKLEARN_VERSION or version("scikit-learn") != SKLEARN_VERSION:
        raise ModelRegistryError(f"이 모델은 scikit-learn {SKLEARN_VERSION}에서 실행해야 합니다.")
    features = _json_file(Path(features_key[0]))
    config = _json_file(Path(config_key[0]))
    order = features.get("feature_order")
    if (
        not isinstance(order, list) or not order
        or any(not isinstance(name, str) or not name for name in order)
        or len(order) != len(set(order))
    ):
        raise ModelRegistryError("모델 입력 컬럼 목록이 올바르지 않습니다.")
    if features.get("zone") != entry["zone"] or config.get("zone") != entry["zone"]:
        raise ModelRegistryError("모델과 입력 설정의 구역이 다릅니다.")
    if config.get("label_version") != entry["label_version"]:
        raise ModelRegistryError("모델과 설정의 라벨 버전이 다릅니다.")
    if config.get("feature_count") != len(order):
        raise ModelRegistryError("모델 설정의 입력 컬럼 수가 다릅니다.")
    # Only registry-owned artifacts reach joblib. Uploaded files never reach this loader.
    try:
        estimator = joblib.load(model_key[0])
    except Exception as error:
        raise ModelRegistryError("등록된 모델을 불러오지 못했습니다.") from error
    expected_type = {"RandomForest": RandomForestClassifier, "IsolationForest": IsolationForest}.get(entry["kind"])
    if expected_type is None or not isinstance(estimator, expected_type):
        raise ModelRegistryError("등록한 종류와 실제 모델 종류가 다릅니다.")
    if list(getattr(estimator, "feature_names_in_", [])) != order:
        raise ModelRegistryError("features.json과 학습된 입력 컬럼 순서가 다릅니다.")
    if getattr(estimator, "n_features_in_", None) != len(order):
        raise ModelRegistryError("학습된 입력 컬럼 수가 다릅니다.")
    # One small service process must not create a worker for every available CPU.
    estimator.n_jobs = 1
    return LoadedModel(entry=entry, estimator=estimator, features=features, config=config)


def load_model_entry(entry, *, root=None, allow_check_only=False):
    folder = models_root(root)
    if entry not in _registry(folder):
        raise ModelRegistryError("목록에 등록된 모델만 불러올 수 있습니다.")
    allowed_statuses = {"active", "check_only"} if allow_check_only else {"active"}
    if entry.get("status") not in allowed_statuses or entry.get("zone") not in MODEL_ZONES:
        raise ModelRegistryError("이 모델은 현재 예측에 사용할 수 없습니다.")
    model_path = _owned_file(folder, entry.get("path"), ".joblib")
    features_path = _owned_file(folder, entry.get("features"), ".json")
    config_path = _owned_file(folder, entry.get("config"), ".json")
    entry_json = json.dumps(entry, ensure_ascii=False, sort_keys=True)
    with _load_lock:
        return _load_cached(entry_json, _file_key(model_path), _file_key(features_path), _file_key(config_path))


def load_selected_model(zone, kind="RandomForest", *, root=None):
    entry = select_model(zone, kind, root=root)
    if entry is None:
        raise ModelRegistryError("이 구역에 활성 모델이 없습니다.")
    return load_model_entry(entry, root=root)


def load_zscore_rule(*, root=None):
    """Return the active rule's registry entry and validated JSON parameters."""
    folder = models_root(root)
    entry = select_model("all", "Z-score", root=folder)
    if entry is None:
        raise ModelRegistryError("활성 Z-score 기준이 없습니다.")
    rule = _json_file(_owned_file(folder, entry.get("path"), ".json"))
    minimum = rule.get("min_periods")
    ddof = rule.get("ddof")
    threshold = rule.get("threshold")
    if (
        rule.get("id") != entry["id"]
        or isinstance(minimum, bool) or not isinstance(minimum, int) or minimum < 2
        or isinstance(ddof, bool) or not isinstance(ddof, int) or ddof < 0 or ddof >= minimum
        or isinstance(threshold, bool) or not isinstance(threshold, (int, float))
        or not math.isfinite(threshold) or threshold <= 0
    ):
        raise ModelRegistryError("Z-score 기준의 ID, 최소 관측 수, 표준편차 또는 범위가 올바르지 않습니다.")
    return entry, rule


def clear_model_cache():
    with _load_lock:
        _load_cached.cache_clear()


def _public_entry(entry):
    fields = (
        "id", "kind", "zone", "label_version", "input_tag", "trained_on", "status", "evidence",
        "walk_forward_f1", "walk_forward_fp", "created", "sklearn",
    )
    return {name: entry[name] for name in fields if name in entry}


def public_manifest(*, root=None):
    selected = [select_model(zone, root=root) for zone in MODEL_ZONES]
    fallback = select_model("all", "Z-score", root=root)
    return {
        "models": [_public_entry(entry) for entry in selected if entry],
        "fallback": _public_entry(fallback) if fallback else None,
        "supported_zones": [entry["zone"] for entry in selected if entry],
        "sklearn": SKLEARN_VERSION,
    }
