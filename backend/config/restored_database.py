"""Read-only deployment gate; never create tables, users, or datasets here."""
from django.conf import settings
from django.db import DatabaseError, InterfaceError, connection


class RestoredDatabaseRequired(RuntimeError):
    pass


def require_restored_database():
    """Check stable original columns so this can run before new migrations."""
    expected_sha = settings.CAL01_EXPECTED_DATASET_SHA256
    dataset_sql = "SELECT 1 FROM monitor_dataset WHERE status = %s AND row_count > 0"
    parameters = ["ready"]
    if expected_sha:
        dataset_sql += " AND sha256 = %s"
        parameters.append(expected_sha)
    parameters.append(True)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT EXISTS ({dataset_sql}), EXISTS (SELECT 1 FROM auth_user WHERE is_active = %s)",
                parameters,
            )
            result = cursor.fetchone()
    except (DatabaseError, InterfaceError):
        raise RestoredDatabaseRequired(
            "Restored database is unavailable or missing its original tables. Restore and verify the backup before deployment."
        ) from None
    if not result or not all(result):
        raise RestoredDatabaseRequired(
            "Restored database must contain the expected ready dataset with rows and an active user. Restore and verify the backup before deployment."
        )
