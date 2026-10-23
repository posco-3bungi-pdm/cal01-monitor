# 로컬에서 실행하기

Python 3.12 이상, Node 22 이상, pnpm, PostgreSQL 18을 사용함. 아래 명령은 Windows PowerShell에서 저장소 루트를 기준으로 실행함.

## 최초 설정

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
pnpm --dir frontend install --frozen-lockfile
```

PostgreSQL은 [공식 Windows 배포본](https://www.enterprisedb.com/download-postgresql-binaries)을 사용함. `pgsql` 폴더를 `$env:LOCALAPPDATA/CAL01Monitor/pgsql`에 풀고, 새 실행 폴더의 접근을 현재 사용자로 제한함. 기존 PostgreSQL 폴더는 사용하지 않음.

```powershell
$runtime = "$env:LOCALAPPDATA/CAL01Monitor"
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$account = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls $runtime /inheritance:r /grant:r "${account}:(OI)(CI)F" "SYSTEM:(OI)(CI)F"
.venv/Scripts/python.exe scripts/init-local-db.py --runtime $runtime --postgres-bin "$runtime/pgsql/bin"
```

설정과 비밀번호는 `server-config.json`에 생성됨. Git에는 올리지 않음. 다음 명령으로 현재 PowerShell에만 설정을 읽고 테이블·팀 계정을 만듦.

```powershell
$config = Get-Content "$runtime/server-config.json" -Raw | ConvertFrom-Json
foreach ($entry in $config.PSObject.Properties) {
    if ($entry.Name -ne "ADMIN_PASSWORD") {
        [Environment]::SetEnvironmentVariable($entry.Name, [string]$entry.Value, "Process")
    }
}
.venv/Scripts/python.exe backend/manage.py migrate
.venv/Scripts/python.exe backend/manage.py collectstatic --noinput
.venv/Scripts/python.exe backend/manage.py setup_team --output "$runtime/team-accounts.json" --layout-editor minho
```

수진·태구는 모니터링팀, 유진·정렬·민호는 현장팀임. `minho`만 추가로 채널 표시점 편집 권한을 가짐. 새 비밀번호는 개인 계정 파일에만 저장되며 기존 계정은 바꾸지 않음.

## 실제 자료 연결

원본 CSV와 기존 공동 검토 서버에는 쓰지 않음. 새 DB에 22개 채널과 라벨·제외 표시를 등록함. 원본 파생변수 열은 수정하지 않으며 이번 화면용 DB에는 복사하지 않음.

```powershell
.venv/Scripts/python.exe backend/manage.py import_cal01 "원본 폴더/cal01_base_v1.csv"
# 위 명령이 출력한 데이터 ID를 사용함.
.venv/Scripts/python.exe backend/manage.py import_context "데이터 ID" "기존 cal01-review/work/data/records.json"
```

같은 파일을 다시 등록해도 관측과 기록이 중복되지 않음. 같은 ID의 내용이 달라지면 덮어쓰지 않고 중단함. `records.json`은 기존 CSV에서 정리한 조업·정비 기록이며, 팀의 저장된 판단 DB는 아님.

## 실행

```powershell
./scripts/start-local.ps1 -Runtime $runtime
```

화면: `http://127.0.0.1:5173` · API: `127.0.0.1:9017` · DB: `127.0.0.1:55432`.

현재는 이 PC에서 확인하는 개발 서버임. 팀 PC 접속, HTTPS, 실시간 수집은 후속 이슈에서 연결함. 개발 서버의 바인딩만 바꿔 외부에 공개하지 않음.

Windows 앱용 화면은 `pnpm --dir frontend build` 후 API를 재시작하면 `http://127.0.0.1:9017`에서 제공함. [exe와 감지 기능 사용법](09-windows-and-detection.md).

## 검증

```powershell
$env:CAL01_TEST_SQLITE = "1"
.venv/Scripts/python.exe backend/manage.py test monitor
Remove-Item Env:CAL01_TEST_SQLITE
pnpm --dir frontend build
```

동시 위치 저장 검증은 PostgreSQL에서만 실행됨. 해당 검증에는 별도 테스트 DB를 만들 권한이 있는 테스트 계정을 사용함. 실제 관측 DB를 테스트 DB로 지정하지 않음.

현재 화면은 과거 자료 조회·분석임. 원본 시각에 시간대를 덧붙이지 않고, LABEL=1과 새 Z-score 후보는 따로 표시함.
