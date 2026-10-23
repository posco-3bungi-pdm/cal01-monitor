from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django.db import OperationalError, connection
from django.test import SimpleTestCase, TestCase, override_settings
from django.test.utils import CaptureQueriesContext

from config.restored_database import RestoredDatabaseRequired, require_restored_database
from config.serve import main
from monitor.models import Dataset


EXPECTED_SHA = "a" * 64


@override_settings(CAL01_REQUIRE_RESTORED_DB=True, CAL01_EXPECTED_DATASET_SHA256=EXPECTED_SHA)
class RestoredDatabaseTests(TestCase):
    def dataset(self, **changes):
        values = {"name": "Restored source", "sha256": EXPECTED_SHA, "source_name": "source.csv", "row_count": 3, "status": "ready"}
        return Dataset.objects.create(**{**values, **changes})

    def active_user(self):
        return get_user_model().objects.create_user("restored-user")

    def test_empty_database_cannot_trigger_migrations_even_without_runtime_gate(self):
        with override_settings(CAL01_REQUIRE_RESTORED_DB=False):
            with patch("monitor.management.commands.prepare_deployment.call_command") as migrate:
                with self.assertRaisesMessage(CommandError, "Restore and verify"):
                    call_command("prepare_deployment", stdout=StringIO())
        migrate.assert_not_called()

    def test_missing_original_tables_fail_without_exposing_database_details(self):
        with patch("config.restored_database.connection.cursor", side_effect=OperationalError("private-db-host-and-password")):
            with self.assertRaises(RestoredDatabaseRequired) as error:
                require_restored_database()
        self.assertNotIn("private-db", str(error.exception))
        self.assertIn("original tables", str(error.exception))

    def test_ready_dataset_without_active_user_is_refused(self):
        self.dataset()
        get_user_model().objects.create_user("inactive-user", is_active=False)
        with self.assertRaises(RestoredDatabaseRequired):
            require_restored_database()

    def test_active_user_without_ready_nonempty_dataset_is_refused(self):
        self.active_user()
        for status, rows in [("importing", 3), ("failed", 3), ("ready", 0)]:
            with self.subTest(status=status, rows=rows):
                dataset = self.dataset(status=status, row_count=rows)
                with self.assertRaises(RestoredDatabaseRequired):
                    require_restored_database()
                dataset.delete()

    def test_different_dataset_digest_is_refused(self):
        self.active_user()
        self.dataset(sha256="b" * 64)
        with self.assertRaises(RestoredDatabaseRequired):
            require_restored_database()

    def test_restored_dataset_check_only_reads_and_accepts_matching_digest(self):
        user = self.active_user()
        dataset = self.dataset()
        before = (dataset.id, dataset.sha256, dataset.row_count, user.id, user.password)
        with CaptureQueriesContext(connection) as queries:
            require_restored_database()
        self.assertEqual(len(queries), 1)
        self.assertTrue(queries[0]["sql"].lstrip().upper().startswith("SELECT "))
        dataset.refresh_from_db()
        user.refresh_from_db()
        self.assertEqual(before, (dataset.id, dataset.sha256, dataset.row_count, user.id, user.password))

    def test_optional_digest_accepts_any_ready_nonempty_dataset(self):
        self.active_user()
        self.dataset(sha256="b" * 64)
        with override_settings(CAL01_EXPECTED_DATASET_SHA256=""):
            require_restored_database()

    def test_prepare_deployment_calls_only_migrate_after_real_guard(self):
        self.active_user()
        self.dataset()
        with patch("monitor.management.commands.prepare_deployment.call_command") as command:
            call_command("prepare_deployment", verbosity=0, stdout=StringIO())
        command.assert_called_once()
        self.assertEqual(command.call_args.args, ("migrate",))
        self.assertFalse(command.call_args.kwargs["interactive"])

    def test_readiness_rejects_empty_database_and_passes_after_restore(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "index.html").write_text("build", encoding="utf-8")
            with override_settings(CAL01_FRONTEND_ROOT=root):
                response = self.client.get("/api/ready")
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json(), {"service": "cal01-monitor", "ready": False})
                self.assertEqual(self.client.get("/api/health").status_code, 200)
                self.active_user()
                self.dataset()
                self.assertEqual(self.client.get("/api/ready").status_code, 200)
                with override_settings(CAL01_EXPECTED_DATASET_SHA256="b" * 64):
                    self.assertEqual(self.client.get("/api/ready").status_code, 503)


class StartupRestoreGateTests(SimpleTestCase):
    @override_settings(CAL01_REQUIRE_RESTORED_DB=True)
    def test_startup_never_opens_socket_if_restore_gate_fails(self):
        with patch("config.serve.server_options", return_value={}), patch("django.core.wsgi.get_wsgi_application"):
            with patch("config.restored_database.require_restored_database", side_effect=RestoredDatabaseRequired("Restore required")):
                with patch("waitress.serve") as serve, self.assertRaises(RestoredDatabaseRequired):
                    main()
        serve.assert_not_called()

    @override_settings(CAL01_REQUIRE_RESTORED_DB=True)
    def test_startup_checks_restore_before_serving(self):
        sequence = []
        with patch("config.serve.server_options", return_value={}), patch("django.core.wsgi.get_wsgi_application"):
            with patch("config.restored_database.require_restored_database", side_effect=lambda: sequence.append("check")):
                with patch("waitress.serve", side_effect=lambda *args, **kwargs: sequence.append("serve")):
                    main()
        self.assertEqual(sequence, ["check", "serve"])

    @override_settings(CAL01_REQUIRE_RESTORED_DB=False)
    def test_local_startup_preserves_opt_out_without_database_query(self):
        with patch("config.serve.server_options", return_value={}), patch("django.core.wsgi.get_wsgi_application"):
            with patch("config.restored_database.require_restored_database") as check:
                with patch("waitress.serve") as serve:
                    main()
        check.assert_not_called()
        serve.assert_called_once()
