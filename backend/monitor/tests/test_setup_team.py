from io import StringIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class TeamSetupTests(TestCase):
    def test_passwords_only_go_to_private_file_and_editor_is_not_admin(self):
        with TemporaryDirectory() as folder:
            output = Path(folder) / "accounts.json"
            stdout = StringIO()
            call_command("setup_team", output=str(output), layout_editor=["minho"], stdout=stdout)
            accounts = json.loads(output.read_text(encoding="utf-8"))["new_accounts"]
            self.assertEqual(len(accounts), 5)
            for account in accounts:
                self.assertNotIn(account["password"], stdout.getvalue())
                user = get_user_model().objects.get(username=account["username"])
                self.assertTrue(user.check_password(account["password"]))
                self.assertFalse(user.is_staff or user.is_superuser)
                self.assertEqual(user.has_perm("monitor.change_equipmentlayout"), user.username == "minho")

    def test_existing_user_password_and_groups_are_preserved(self):
        existing = get_user_model().objects.create_user("minho", password="existing-test-password")
        password_hash = existing.password
        with TemporaryDirectory() as folder:
            output = Path(folder) / "accounts.json"
            call_command("setup_team", output=str(output), stdout=StringIO())
            existing.refresh_from_db()
            self.assertEqual(existing.password, password_hash)
            self.assertFalse(existing.groups.exists())
            accounts = json.loads(output.read_text(encoding="utf-8"))["new_accounts"]
            self.assertNotIn("minho", [account["username"] for account in accounts])
