"""Register a read-only CAL01 CSV through the shared atomic importer."""
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from monitor.channels import CHANNEL_IDS
from monitor.csv_import import CsvImportError, register_csv


class Command(BaseCommand):
    help = "원본 CSV를 바꾸지 않고 데이터베이스에 등록합니다."

    def add_arguments(self, parser):
        parser.add_argument("source", type=Path)
        parser.add_argument("--name", default="")
        parser.add_argument("--retry-failed", action="store_true")

    def handle(self, *args, **options):
        path = options["source"].expanduser().resolve()
        if not path.is_file() or path.suffix.lower() != ".csv":
            raise CommandError("읽을 수 있는 CSV 파일을 지정하세요.")
        try:
            dataset, reused = register_csv(
                path, name=options["name"], retry_failed=options["retry_failed"],
            )
        except CsvImportError as exc:
            raise CommandError(f"등록하지 못했습니다: {exc}") from exc
        if reused:
            self.stdout.write(f"이미 등록된 데이터: {dataset.id} / {dataset.row_count:,}행")
            return
        self.stdout.write(self.style.SUCCESS(
            f"등록 완료: {dataset.id} / {dataset.row_count:,}행 / "
            f"{dataset.lots.count()} LOT / {len(CHANNEL_IDS)}채널"
        ))
