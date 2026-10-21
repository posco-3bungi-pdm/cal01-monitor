import json
import os
from pathlib import Path
import secrets

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group, Permission
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

TEAM = [
    ("sujin", "수진", "monitoring"),
    ("taegu", "태구", "monitoring"),
    ("yujin", "유진", "field"),
    ("jeongryeol", "정렬", "field"),
    ("minho", "민호", "field"),
]


class Command(BaseCommand):
    help = "Create five local team accounts; write new passwords only to a private local file."

    def add_arguments(self, parser):
        parser.add_argument("--output", required=True, help="New private JSON file outside the repository.")
        parser.add_argument("--layout-editor", action="append", default=[], choices=[user[0] for user in TEAM])

    def handle(self, *args, **options):
        output = Path(options["output"]).expanduser().resolve()
        repository = Path(__file__).resolve().parents[4]
        if output.is_relative_to(repository):
            raise CommandError("계정 파일은 저장소 밖의 개인 폴더에 저장해 주세요.")
        if not output.parent.is_dir():
            raise CommandError("계정 파일을 저장할 개인 폴더를 먼저 만들어 주세요.")
        try:
            descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            raise CommandError("기존 계정 파일을 덮어쓰지 않습니다. 새 파일 이름을 지정해 주세요.")
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle, transaction.atomic():
                groups = {name: Group.objects.get_or_create(name=name)[0] for name in ("monitoring", "field")}
                layout_permission = Permission.objects.get(
                    content_type__app_label="monitor", codename="change_equipmentlayout",
                )
                accounts = []
                for username, display_name, team in TEAM:
                    if get_user_model().objects.filter(username=username).exists():
                        continue
                    password = secrets.token_urlsafe(20)
                    user = get_user_model().objects.create_user(
                        username=username, password=password, first_name=display_name,
                    )
                    user.groups.add(groups[team])
                    if username in options["layout_editor"]:
                        user.user_permissions.add(layout_permission)
                    accounts.append({"username": username, "display_name": display_name, "password": password})
                json.dump({"new_accounts": accounts}, handle, ensure_ascii=False, indent=2)
                handle.flush()
                os.fsync(handle.fileno())
        except Exception:
            output.unlink(missing_ok=True)
            raise
        self.stdout.write(f"새 계정 {len(accounts)}개를 만들었습니다. 비밀번호는 지정한 개인 파일에서 확인하세요.")
