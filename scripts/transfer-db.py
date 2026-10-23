"""Export, restore into an empty database, and verify a CAL01 PostgreSQL backup.

Requires psycopg and PostgreSQL client tools matching the source major version.
Credentials come from PG* / DATABASE_URL environment variables or --config JSON.
The dump contains private account data. Keep the backup outside Git repositories.
"""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict


SECRET_COLUMNS = {
    "auth_user": {"password"},
    "django_session": {"session_key", "session_data"},
}
PG_OPTIONS = {
    "PGHOST": "host", "PGPORT": "port", "PGDATABASE": "dbname",
    "PGUSER": "user", "PGPASSWORD": "password", "PGSSLMODE": "sslmode",
    "PGSSLROOTCERT": "sslrootcert", "PGSSLCERT": "sslcert",
    "PGSSLKEY": "sslkey", "PGCONNECT_TIMEOUT": "connect_timeout",
    "PGCHANNELBINDING": "channel_binding", "PGGSSENCMODE": "gssencmode",
    "PGTARGETSESSIONATTRS": "target_session_attrs", "PGHOSTADDR": "hostaddr",
    "PGAPPNAME": "application_name",
}
USER_SCHEMA = "n.nspname <> 'information_schema' AND n.nspname !~ '^pg_'"


class TransferError(Exception):
    pass


def connection_options(config_path=None):
    config = {}
    if config_path:
        config = json.loads(Path(config_path).read_text(encoding="utf-8-sig"))
    url = os.environ.get("DATABASE_URL") or config.get("DATABASE_URL")
    if url:
        options = conninfo_to_dict(url)
    else:
        options = {}
        for variable, parameter in PG_OPTIONS.items():
            value = os.environ.get(variable, config.get(variable))
            if value is not None:
                options[parameter] = str(value)
    if not all(options.get(key) for key in ("host", "dbname", "user")):
        raise TransferError("Set host, database and user with PG* or DATABASE_URL / --config.")
    if set(options) - set(PG_OPTIONS.values()):
        raise TransferError("Unsupported database connection option in DATABASE_URL.")
    options.setdefault("connect_timeout", "15")
    return options


def tool_path(name, postgres_bin=None):
    filename = name + (".exe" if os.name == "nt" else "")
    path = Path(postgres_bin) / filename if postgres_bin else shutil.which(filename)
    if not path or not Path(path).is_file():
        raise TransferError(f"{name} was not found. Set --postgres-bin.")
    return str(path)


def child_environment(options):
    environment = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    environment.pop("DATABASE_URL", None)
    for variable, parameter in PG_OPTIONS.items():
        if parameter in options:
            environment[variable] = str(options[parameter])
    environment["PGAPPNAME"] = "cal01-database-transfer"
    return environment


def run_postgres(command, options):
    result = subprocess.run(command, env=child_environment(options), capture_output=True)
    if result.returncode:
        # PostgreSQL diagnostics can contain row contents or connection credentials.
        raise TransferError(f"{Path(command[0]).stem} failed (exit {result.returncode}); private diagnostics were not printed.")


def private_directory(path):
    path = path.resolve()
    if any((parent / ".git").exists() for parent in [path, *path.parents]):
        raise TransferError("Store database backups outside Git repositories.")
    path.mkdir(mode=0o700, parents=True, exist_ok=False)
    if os.name != "nt":
        path.chmod(0o700)
        return "owner_only"
    try:
        result = subprocess.run(["whoami", "/user", "/fo", "csv", "/nh"], capture_output=True, check=True)
        sid = next(csv.reader(io.StringIO(result.stdout.decode().strip())))[1]
        subprocess.run([
            "icacls", str(path), "/inheritance:r", "/grant:r",
            f"*{sid}:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F",
        ], capture_output=True, check=True)
        return "owner_and_system_only"
    except (OSError, subprocess.SubprocessError, UnicodeError, IndexError, StopIteration):
        print("Warning: Windows ACL setup failed. Restrict the backup directory before sharing it.", file=sys.stderr)
        return "windows_acl_best_effort_failed"


def file_hash(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def read_only_snapshot(connection):
    connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
    connection.execute("SET LOCAL timezone = 'UTC'")
    connection.execute("SET LOCAL datestyle = 'ISO, YMD'")
    connection.execute("SET LOCAL extra_float_digits = 3")


def database_manifest(connection):
    tables = connection.execute(f"""
        SELECT n.nspname, c.relname, c.oid
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE {USER_SCHEMA} AND c.relkind IN ('r', 'p') AND NOT c.relispartition
        ORDER BY n.nspname, c.relname
    """).fetchall()
    result = {}
    for schema, table, oid in tables:
        definitions = connection.execute("""
            SELECT a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull
            FROM pg_attribute a WHERE a.attrelid = %s AND a.attnum > 0 AND NOT a.attisdropped
            ORDER BY a.attnum
        """, [oid]).fetchall()
        primary_key = [row[0] for row in connection.execute("""
            SELECT a.attname FROM pg_index i
            CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, position)
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
            WHERE i.indrelid = %s AND i.indisprimary ORDER BY k.position
        """, [oid]).fetchall()]
        excluded = SECRET_COLUMNS.get(table, set())
        columns = [row[0] for row in definitions if row[0] not in excluded]
        if not columns:
            raise TransferError(f"No non-secret columns to verify in {schema}.{table}.")
        selection = sql.SQL(", ").join(map(sql.Identifier, columns))
        table_name = sql.Identifier(schema, table)
        # Never use an excluded credential column as a sort key or digest input.
        safe_key = [column for column in primary_key if column not in excluded]
        if safe_key and len(safe_key) == len(primary_key):
            ordering = sql.SQL(", ").join(map(sql.Identifier, safe_key))
            query = sql.SQL("SELECT row_to_json(data)::text FROM (SELECT {} FROM {} ORDER BY {}) data").format(
                selection, table_name, ordering,
            )
        else:
            query = sql.SQL("SELECT row_to_json(data)::text FROM (SELECT {} FROM {}) data ORDER BY row_to_json(data)::text COLLATE \"C\"").format(
                selection, table_name,
            )
        digest = hashlib.sha256()
        count = 0
        with connection.cursor(name="cal01_manifest_rows") as rows:
            rows.itersize = 2000
            rows.execute(query)
            for (serialized,) in rows:
                digest.update(serialized.encode("utf-8"))
                digest.update(b"\n")
                count += 1
        result[f"{schema}.{table}"] = {
            "rows": count, "sha256": digest.hexdigest(), "hashed_columns": columns,
            "excluded_columns": sorted(excluded & {row[0] for row in definitions}),
            "columns": [list(row) for row in definitions], "primary_key": primary_key,
        }
    return result


def assert_empty_database(connection, confirmation):
    database = connection.execute("SELECT current_database()").fetchone()[0]
    if confirmation != database or database in {"postgres", "template0", "template1"}:
        raise TransferError("--confirm-empty-database must name the dedicated empty target database.")
    relations = connection.execute(f"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE {USER_SCHEMA}").fetchone()[0]
    routines = connection.execute(f"SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE {USER_SCHEMA}").fetchone()[0]
    types = connection.execute(f"SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE {USER_SCHEMA}").fetchone()[0]
    schemas = connection.execute(f"SELECT count(*) FROM pg_namespace n WHERE {USER_SCHEMA} AND n.nspname <> 'public'").fetchone()[0]
    extensions = connection.execute("SELECT count(*) FROM pg_extension WHERE extname <> 'plpgsql'").fetchone()[0]
    large_objects = connection.execute("SELECT count(*) FROM pg_largeobject_metadata").fetchone()[0]
    sessions = connection.execute("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid <> pg_backend_pid()").fetchone()[0]
    if any((relations, routines, types, schemas, extensions, large_objects, sessions)):
        raise TransferError("Target is not empty or has other connections. Restore refused; no data changed.")


def load_backup(path):
    path = path.resolve()
    manifest = json.loads((path / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("format_version") != 1 or manifest.get("dump", {}).get("file") != "database.dump":
        raise TransferError("Unsupported backup manifest.")
    dump = path / "database.dump"
    if dump.stat().st_size != manifest["dump"]["bytes"] or file_hash(dump) != manifest["dump"]["sha256"]:
        raise TransferError("Backup checksum does not match. Restore/verify refused.")
    return dump, manifest


def export_database(options, output, postgres_bin=None):
    executable = tool_path("pg_dump", postgres_bin)
    permissions = private_directory(output)
    output = output.resolve()
    partial = output / "database.dump.partial"
    with partial.open("xb"):
        pass
    partial.chmod(0o600)
    with psycopg.connect(**options) as connection:
        read_only_snapshot(connection)
        snapshot = connection.execute("SELECT pg_export_snapshot()").fetchone()[0]
        version = connection.info.server_version
        tables = database_manifest(connection)
        run_postgres([
            executable, "--format=custom", "--no-owner", "--no-acl", "--no-password",
            "--snapshot=" + snapshot, "--file=" + str(partial),
        ], options)
    destination = output / "database.dump"
    partial.rename(destination)
    manifest = {
        "format_version": 1, "created_at": datetime.now(timezone.utc).isoformat(),
        "source_server_version": version, "permissions": permissions,
        "dump": {"file": destination.name, "bytes": destination.stat().st_size, "sha256": file_hash(destination)},
        "verification": "Table contents from the same PostgreSQL snapshot as pg_dump. Password/session secrets are excluded from manifest hashes, but retained in the private dump.",
        "tables": tables,
    }
    with (output / "manifest.json").open("x", encoding="utf-8") as target:
        json.dump(manifest, target, ensure_ascii=False, indent=2)
    (output / "manifest.json").chmod(0o600)
    print(f"Export complete: {len(tables)} tables. Private backup: {output}")
    return manifest


def verify_database(options, manifest):
    with psycopg.connect(**options) as connection:
        read_only_snapshot(connection)
        actual = database_manifest(connection)
    expected = manifest["tables"]
    mismatches = sorted(key for key in set(expected) | set(actual) if expected.get(key) != actual.get(key))
    if mismatches:
        raise TransferError("Verification failed for tables: " + ", ".join(mismatches))
    print(f"Verification passed: {len(actual)} tables; row counts and non-secret data match.")
    return actual


def restore_database(options, dump, manifest, confirmation, postgres_bin=None):
    executable = tool_path("pg_restore", postgres_bin)
    with psycopg.connect(**options) as connection:
        assert_empty_database(connection, confirmation)
    # No --clean or --create: this tool never drops tables or databases.
    # The database must remain offline until restore and verification finish.
    run_postgres([
        executable, "--dbname=" + psycopg.conninfo.make_conninfo(dbname=options["dbname"]),
        "--single-transaction", "--exit-on-error", "--no-owner", "--no-acl", "--no-password", str(dump),
    ], options)
    verify_database(options, manifest)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, help="Private PG* / DATABASE_URL JSON file.")
    parser.add_argument("--postgres-bin", type=Path, help="Directory containing pg_dump and pg_restore.")
    commands = parser.add_subparsers(dest="command", required=True)
    export = commands.add_parser("export", help="Read-only export to a new private directory outside Git.")
    export.add_argument("--output-dir", type=Path, required=True)
    for name in ("verify", "restore"):
        command = commands.add_parser(name)
        command.add_argument("--backup-dir", type=Path, required=True)
        if name == "restore":
            command.add_argument("--confirm-empty-database", required=True)
    args = parser.parse_args()
    try:
        options = connection_options(args.config)
        if args.command == "export":
            export_database(options, args.output_dir, args.postgres_bin)
        else:
            dump, manifest = load_backup(args.backup_dir)
            if args.command == "verify":
                verify_database(options, manifest)
            else:
                restore_database(options, dump, manifest, args.confirm_empty_database, args.postgres_bin)
    except TransferError as error:
        parser.exit(1, str(error) + "\n")
    except (OSError, ValueError, KeyError, psycopg.Error):
        parser.exit(1, "Database transfer failed. Check private connection settings, file permissions and PostgreSQL tool versions. Credentials and row contents were not printed.\n")


if __name__ == "__main__":
    main()
