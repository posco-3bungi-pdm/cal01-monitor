"""모델링 저장소(pdm-project)가 만든 모델을 이 저장소의 models/로 가져옴

실행 (저장소 폴더에서):
    python scripts/import_models.py --from ../pdm-project/models

- registry.json의 항목을 읽어 그 항목이 가리키는 파일(모델, features, config, metrics, expected)을 복사함
- 이미 있는 ID는 건너뜀. 같은 ID를 다시 넣으려면 --replace
- 복사한 뒤 이 저장소의 models/registry.json에 항목을 병합함 (없는 것은 더하고, --replace면 바꿈)
- 아무것도 지우지 않음. 이전 모델을 내리려면 registry에서 status를 retired로 바꿈
"""

import argparse
import json
import os
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(os.path.dirname(HERE), "models")
REGISTRY = os.path.join(MODELS_DIR, "registry.json")
ENC = "utf-8"

# registry 항목에서 파일 경로가 들어 있는 칸
PATH_KEYS = ["path", "features", "config", "expected"]


def load_registry(path):
    if os.path.isfile(path):
        with open(path, encoding=ENC) as f:
            return json.load(f)
    return {"models": []}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="source", required=True, help="pdm-project의 models 폴더")
    parser.add_argument("--replace", action="store_true", help="같은 ID가 있어도 파일과 항목을 바꿈")
    args = parser.parse_args()

    source_dir = os.path.abspath(args.source)
    source_registry = load_registry(os.path.join(source_dir, "registry.json"))
    registry = load_registry(REGISTRY)

    existing = {}
    for entry in registry["models"]:
        existing[entry["id"]] = entry

    added = 0
    replaced = 0
    skipped = 0
    copied_files = 0
    for entry in source_registry["models"]:
        model_id = entry["id"]
        if model_id in existing and not args.replace:
            skipped = skipped + 1
            continue

        # 항목이 가리키는 파일을 복사함 (metrics.json은 config와 같은 폴더에 있어 함께 복사)
        files = []
        for key in PATH_KEYS:
            if key in entry and entry[key]:
                files.append(entry[key])
        if "config" in entry and entry["config"]:
            files.append(os.path.dirname(entry["config"]) + "/metrics.json")

        for relative in files:
            src = os.path.join(source_dir, relative)
            dst = os.path.join(MODELS_DIR, relative)
            if not os.path.isfile(src):
                print("없음:", relative)
                continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if not os.path.isfile(dst) or args.replace:
                shutil.copyfile(src, dst)
                copied_files = copied_files + 1

        if model_id in existing:
            replaced = replaced + 1
        else:
            added = added + 1
        existing[model_id] = entry

    registry["models"] = list(existing.values())
    registry["updated"] = source_registry.get("updated", registry.get("updated", ""))
    os.makedirs(MODELS_DIR, exist_ok=True)
    with open(REGISTRY, "w", encoding=ENC) as f:
        json.dump(registry, f, ensure_ascii=False, indent=1)

    print("항목: 새로", added, "/ 바꿈", replaced, "/ 이미 있음", skipped, "/ 복사한 파일", copied_files)
    for entry in registry["models"]:
        print(" ", entry["id"], "|", entry.get("zone"), "|", entry.get("status"))
    print("완료:", REGISTRY)


if __name__ == "__main__":
    main()
