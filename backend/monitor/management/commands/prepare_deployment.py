"""Apply migrations only after the original data and accounts are restored."""
from django.core.management import BaseCommand, CommandError, call_command

from config.restored_database import RestoredDatabaseRequired, require_restored_database


class Command(BaseCommand):
    help = "Verify the restored database, then apply pending migrations. Does not import data or create accounts."

    def handle(self, *args, **options):
        try:
            require_restored_database()
        except RestoredDatabaseRequired as error:
            raise CommandError(str(error)) from None
        call_command("migrate", interactive=False, verbosity=options["verbosity"], stdout=self.stdout, stderr=self.stderr)
