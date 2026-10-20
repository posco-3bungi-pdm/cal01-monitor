"""Initialize a separate, loopback-only development database on Windows."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess

import psycopg
from psycopg import sql

parser = argparse.ArgumentParser()
parser.add_argument("--runtime", type=Path, default=Path(os.environ["LOCALAPPDATA"]) / "CAL01Monitor")
parser.add_argument("--postgres-bin", type=Path, required=True)
args = parser.parse_args()
runtime, binaries = args.runtime.resolve(), args.postgres_bin.resolve()
repository = Path(__file__).resolve().parents[1]
if runtime.is_relative_to(repository):
    raise SystemExit("실행 데이터는 Git 저장소 밖에 저장하세요.")
runtime.mkdir(parents=True, exist_ok=True)
config_path = runtime / "server-config.json"
if config_path.exists():
    config = json.loads(config_path.read_text(encoding="utf-8"))
else:
    config = {
        "DJANGO_SECRET_KEY": secrets.token_urlsafe(50),
        "PGDATABASE": "cal01_monitor",
        "PGUSER": "cal01_monitor",
        "PGPASSWORD": secrets.token_urlsafe(40),
        "PGHOST": "127.0.0.1",
        "PGPORT": "55432",
        "CAL01_LOCAL_HTTP": "1",
        "DJANGO_ALLOWED_HOSTS": "localhost,127.0.0.1",
        "DJANGO_CSRF_TRUSTED_ORIGINS": "http://127.0.0.1:5173,http://localhost:5173",
        "CAL01_STATIC_ROOT": str(runtime / "static"),
        "ADMIN_PASSWORD": secrets.token_urlsafe(40),
    }
    with config_path.open("x", encoding="utf-8") as target:
        json.dump(config, target, indent=2)
data = runtime / "pgdata"
password_file = runtime / "init-password.txt"
if not (data / "PG_VERSION").exists():
    password_file.write_text(config["ADMIN_PASSWORD"], encoding="utf-8")
    try:
        subprocess.run([
            str(binaries / "initdb.exe"), "-D", str(data), "--encoding=UTF8", "--locale=C",
            "--username=cal01_admin", "--auth=scram-sha-256", f"--pwfile={password_file}",
        ], check=True)
    finally:
        password_file.unlink(missing_ok=True)
status = subprocess.run([str(binaries / "pg_ctl.exe"), "-D", str(data), "status"], capture_output=True)
if status.returncode:
    subprocess.run([
        str(binaries / "pg_ctl.exe"), "-D", str(data), "-l", str(runtime / "postgres.log"),
        "-o", "-p 55432 -h 127.0.0.1", "-w", "start",
    ], check=True)
with psycopg.connect(
    host="127.0.0.1", port=55432, dbname="postgres", user="cal01_admin",
    password=config["ADMIN_PASSWORD"], autocommit=True,
) as connection:
    if not connection.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", [config["PGUSER"]]).fetchone():
        connection.execute(sql.SQL("CREATE ROLE {} LOGIN PASSWORD {}").format(
            sql.Identifier(config["PGUSER"]), sql.Literal(config["PGPASSWORD"]),
        ))
    if not connection.execute("SELECT 1 FROM pg_database WHERE datname=%s", [config["PGDATABASE"]]).fetchone():
        connection.execute(sql.SQL("CREATE DATABASE {} OWNER {}").format(
            sql.Identifier(config["PGDATABASE"]), sql.Identifier(config["PGUSER"]),
        ))
print("별도 PostgreSQL 준비 완료: 127.0.0.1:55432. 비밀번호는 개인 설정 파일에 저장했습니다.")
