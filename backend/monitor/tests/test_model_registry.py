import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import joblib
import pandas as pd
from django.test import SimpleTestCase
from sklearn.ensemble import RandomForestClassifier

from monitor.model_registry import (
    ModelRegistryError, clear_model_cache, load_model_entry, load_selected_model, load_zscore_rule, public_manifest, select_model,
)


class ModelRegistryTests(SimpleTestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.addCleanup(clear_model_cache)
        self.root = Path(self.temporary.name)
        self.entry = {
            "id": "test-Z4-v6", "kind": "RandomForest", "zone": "Z4", "label_version": "v6",
            "path": "model.joblib", "features": "features.json", "config": "config.json",
            "status": "active", "sklearn": "1.9.1", "evidence": "팀 판단 재현용",
        }
        self.write_registry([self.entry])

    def write_json(self, filename, value):
        (self.root / filename).write_text(json.dumps(value), encoding="utf-8")

    def write_registry(self, entries):
        self.write_json("registry.json", {"models": entries})

    def write_model(self):
        values = pd.DataFrame({"TC-Z4": [850, 851, 852, 880], "OP-Z4": [60, 62, 61, 98]})
        model = RandomForestClassifier(n_estimators=2, random_state=42, n_jobs=-1).fit(values, [0, 0, 0, 1])
        joblib.dump(model, self.root / "model.joblib")
        self.write_json("features.json", {"zone": "Z4", "feature_order": list(values.columns)})
        self.write_json("config.json", {"zone": "Z4", "label_version": "v6", "feature_count": 2})

    def test_highest_numeric_label_wins_and_check_only_is_never_selected(self):
        version_10 = {**self.entry, "id": "test-Z4-v10", "label_version": "v10"}
        check_only = {**self.entry, "id": "test-Z4-v99-check", "label_version": "v99", "status": "check_only"}
        retired = {**self.entry, "id": "test-Z4-v100-retired", "label_version": "v100", "status": "retired"}
        self.write_registry([self.entry, version_10, check_only, retired])
        self.assertEqual(select_model("Z4", root=self.root)["id"], version_10["id"])

    def test_learned_models_are_limited_to_z3_through_z6(self):
        self.write_registry([{**self.entry, "zone": "Z1"}])
        self.assertIsNone(select_model("Z1", root=self.root))
        self.assertIsNone(select_model("Z4", root=self.root))

    def test_two_active_artifacts_in_latest_label_fail_instead_of_guessing(self):
        self.write_registry([self.entry, {**self.entry, "id": "another-Z4-v6"}])
        with self.assertRaises(ModelRegistryError):
            select_model("Z4", root=self.root)

    def test_invalid_label_and_duplicate_ids_fail(self):
        for entries in [[{**self.entry, "label_version": "newest"}], [self.entry, self.entry]]:
            with self.subTest(entries=entries):
                self.write_registry(entries)
                with self.assertRaises(ModelRegistryError):
                    select_model("Z4", root=self.root)

    def test_manifest_is_metadata_only_without_paths_or_check_artifacts(self):
        fallback = {
            "id": "zscore-v6", "kind": "Z-score", "zone": "all", "label_version": "v6",
            "status": "active", "path": "zscore.json",
        }
        self.write_registry([self.entry, fallback, {**self.entry, "id": "check-only", "status": "check_only"}])
        with patch("joblib.load") as deserialize:
            manifest = public_manifest(root=self.root)
        deserialize.assert_not_called()
        self.assertEqual(manifest["supported_zones"], ["Z4"])
        self.assertEqual(manifest["fallback"]["id"], fallback["id"])
        self.assertEqual(manifest["models"][0]["id"], self.entry["id"])
        for entry in manifest["models"] + [manifest["fallback"]]:
            self.assertNotIn("path", entry)
            self.assertNotIn("features", entry)
            self.assertNotIn("config", entry)

    def test_registered_model_loads_once_and_preserves_column_order(self):
        self.write_model()
        loaded = load_selected_model("Z4", root=self.root)
        again = load_selected_model("Z4", root=self.root)
        self.assertIs(loaded.estimator, again.estimator)
        self.assertEqual(loaded.feature_order, ["TC-Z4", "OP-Z4"])
        self.assertEqual(loaded.estimator.n_jobs, 1)
        self.assertEqual(loaded.estimator.predict(pd.DataFrame({"TC-Z4": [850], "OP-Z4": [60]})).tolist(), [0])

    def test_feature_order_mismatch_rejects_artifact(self):
        self.write_model()
        self.write_json("features.json", {"zone": "Z4", "feature_order": ["OP-Z4", "TC-Z4"]})
        with self.assertRaisesRegex(ModelRegistryError, "순서"):
            load_selected_model("Z4", root=self.root)

    def test_wrong_runtime_version_rejects_before_deserializing(self):
        self.write_model()
        with patch("monitor.model_registry.version", return_value="1.8.0"), patch("joblib.load") as deserialize:
            with self.assertRaisesRegex(ModelRegistryError, "1.9.1"):
                load_selected_model("Z4", root=self.root)
        deserialize.assert_not_called()

    def test_forged_entry_and_escape_paths_never_deserialize(self):
        with self.assertRaises(ModelRegistryError):
            load_model_entry({**self.entry, "path": "not-registered.joblib"}, root=self.root)
        for path in ["../model.joblib", str(self.root.parent / "model.joblib")]:
            entry = {**self.entry, "path": path}
            self.write_registry([entry])
            with self.subTest(path=path), patch("joblib.load") as deserialize:
                with self.assertRaises(ModelRegistryError):
                    load_model_entry(entry, root=self.root)
                deserialize.assert_not_called()

    def test_check_only_requires_explicit_offline_flag(self):
        self.write_model()
        entry = {**self.entry, "status": "check_only"}
        self.write_registry([entry])
        self.assertIsNone(select_model("Z4", root=self.root))
        with self.assertRaises(ModelRegistryError):
            load_model_entry(entry, root=self.root)
        self.assertEqual(load_model_entry(entry, root=self.root, allow_check_only=True).entry["status"], "check_only")

    def test_config_zone_or_label_mismatch_is_rejected(self):
        self.write_model()
        for config in [
            {"zone": "Z3", "label_version": "v6", "feature_count": 2},
            {"zone": "Z4", "label_version": "v5", "feature_count": 2},
            {"zone": "Z4", "label_version": "v6", "feature_count": 3},
        ]:
            self.write_json("config.json", config)
            with self.subTest(config=config), self.assertRaises(ModelRegistryError):
                load_selected_model("Z4", root=self.root)

    def test_active_zscore_rule_is_read_from_registry_with_validated_parameters(self):
        entry = {"id": "zscore-v10", "kind": "Z-score", "zone": "all", "label_version": "v10",
                 "status": "active", "path": "zscore.json"}
        self.write_registry([entry])
        self.write_json("zscore.json", {"id": entry["id"], "min_periods": 30, "ddof": 0, "threshold": 3})
        selected, rule = load_zscore_rule(root=self.root)
        self.assertEqual(selected["label_version"], "v10")
        self.assertEqual((rule["min_periods"], rule["ddof"], rule["threshold"]), (30, 0, 3))
        for invalid in [{"min_periods": True}, {"ddof": -1}, {"threshold": float("inf")}, {"id": "wrong"}]:
            self.write_json("zscore.json", {"id": entry["id"], "min_periods": 30, "ddof": 0, "threshold": 3, **invalid})
            with self.subTest(invalid=invalid), self.assertRaises(ModelRegistryError):
                load_zscore_rule(root=self.root)
