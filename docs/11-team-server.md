# 팀 공용 서버

하나의 HTTPS 주소로 브라우저와 Windows 앱을 연결한다. 화면과 API는 같은 서버, 기록은 PostgreSQL 18에 저장한다. 3D는 접속한 PC에서 그린다.

팀 접속 주소: **https://cal01-monitor.onrender.com**. 기존 팀 아이디와 비밀번호를 그대로 사용한다.

## 배포할 것

- 저장소 루트의 `Dockerfile`로 화면 빌드와 Python 서버를 함께 만든다.
- 실행 명령은 `python -m config.serve`, 상태 확인 주소는 `/api/ready`다.
- HTTPS를 제공하는 호스팅의 HTTP 서비스로 연결한다. 앱 포트의 직접 공개나 TCP 프록시는 사용하지 않는다.
- 앱은 한 프로세스, 한 인스턴스로 시작한다. 알림은 기존 5초 조회를 사용한다.
- DB는 앱과 같은 지역에 두고 내부 네트워크로 연결한다. 로컬 PC는 개발용으로 유지한다.

| 서버 환경변수 | 값 |
| --- | --- |
| `CAL01_DEPLOYMENT` | `cloud` |
| `DJANGO_ALLOWED_HOSTS` | 실제 접속 도메인만, `https://`와 경로 제외 |
| `DJANGO_SECRET_KEY` | 서버 전용 비밀값 |
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | 공용 PostgreSQL 연결 정보 |
| `PGSSLMODE` | 호스팅에서 제공하는 TLS 연결 설정 |
| `PGCONNECT_TIMEOUT` | 기본 10초 |
| `CAL01_REQUIRE_RESTORED_DB` | 공용 서버는 `1`: 복원한 데이터와 활성 계정이 있어야 시작 |
| `CAL01_EXPECTED_DATASET_SHA256` | 이전할 데이터셋의 SHA-256 |
| `PORT` | 호스팅이 지정하는 앱 포트 |

클라우드에서는 DEBUG와 로컬 HTTP 설정을 끈다. 정확한 HTTPS 주소를 기준으로 로그인 쿠키와 CSRF를 적용한다. 전달 헤더로 접속자의 주소나 프로토콜을 임의 변경하지 않는다. 로그인 실패 제한은 계정별로 적용한다.

## 기존 데이터 이전 순서

**빈 DB에 복원한 다음 앱을 시작한다. `migrate`나 계정 생성부터 실행하지 않는다.**

1. 이전할 때 로컬 서버의 저장을 잠시 멈춘다.
2. 현재 DB를 아래 도구로 백업한다. 원본 CSV도 개인 보관소에 별도로 보관한다.
3. 새 PostgreSQL 18의 연결 정보를 저장소 밖 개인 설정 파일에 준비한다.
4. 새 DB가 비어 있는 상태에서 복원하고 검증한다.
5. 검증 후 `python manage.py prepare_deployment`로 복원 상태를 확인하고 필요한 DB 변경만 적용한다. 그다음 앱을 배포한다.
6. 두 계정으로 로그인, 점검 요청과 결과, 알림을 확인한 뒤 공용 서버를 사용한다.

PostgreSQL 18의 `pg_dump`, `pg_restore`와 프로젝트 Python 환경을 사용한다. 아래 경로는 각 PC의 개인 경로로 바꾼다. 접속 정보는 `PG*` 또는 `DATABASE_URL` 환경변수로도 지정할 수 있다.

```powershell
.venv/Scripts/python.exe scripts/transfer-db.py --config "개인폴더/source.json" --postgres-bin "PostgreSQL18/bin" export --output-dir "개인폴더/새백업폴더"
.venv/Scripts/python.exe scripts/transfer-db.py --config "개인폴더/target.json" --postgres-bin "PostgreSQL18/bin" restore --backup-dir "개인폴더/새백업폴더" --confirm-empty-database 대상DB이름
.venv/Scripts/python.exe scripts/transfer-db.py --config "개인폴더/target.json" verify --backup-dir "개인폴더/새백업폴더"
```

복원은 기존 테이블이나 다른 접속이 있으면 중단한다. 복원 명령 실행이 실패하면 전체 롤백한다. 복원이 끝난 뒤 검증에서 불일치가 나오면 접속 전환을 멈추고 새 DB를 유지한 채 원인을 확인한다. 백업과 검증은 동일한 시점의 자료를 사용하며 테이블 구조, 행수와 데이터 지문을 비교한다. 비밀번호와 세션 내용은 검증 파일에 쓰지 않는다. 실제 백업에는 계정 정보가 포함되므로 개인 폴더에만 보관한다.

계정과 비밀번호는 DB 복원으로 이어진다. 이전 서버의 세션까지 이어야 하면 기존 `DJANGO_SECRET_KEY`를 안전하게 옮긴다. 새 키를 쓰면 비밀번호는 유지되고 다시 로그인하면 된다. `setup_team`이나 CSV 재등록은 이전 절차에 넣지 않는다.

## Render 설정

`cal01-review`와 같은 워크스페이스에 **별도 앱과 DB**를 만든다. 기존 검토 사이트의 DB와 가져오기 스크립트는 사용하지 않는다.

루트 `render.yaml`은 Singapore의 Docker 앱과 PostgreSQL 18을 정의한다. 앱은 월 $7, DB는 월 $6, 저장공간 1GB는 월 $0.30이며 트래픽은 별도다. 배포 브랜치는 `main`, 자동 배포는 `On Commit`이다. main에 push하거나 PR을 병합하면 새 버전을 빌드·배포한다. 다른 작업 브랜치에 push한 코드는 공용 서버에 반영되지 않는다.

1. 새 `cal01-monitor-db`를 먼저 만든다. 외부 접속은 기본 차단한다.
2. 로컬에서 이전할 때만 해당 PC의 공인 IP 한 개를 임시 허용한다. 백업 복원과 비교가 끝나면 외부 접속을 다시 차단한다.
3. 앱은 DB 내부 주소와 기존 데이터셋의 SHA-256을 사용한다. `RENDER_EXTERNAL_HOSTNAME`으로 실제 도메인을 자동 적용한다.
4. 배포 전 명령은 `python manage.py prepare_deployment`다. 복원 전에는 실패하는 것이 맞다. 빈 DB에 테이블이나 계정을 새로 만들지 않는다.
5. 복원 검증 후 수동 배포한다. 두 계정의 접속과 기록 저장을 확인한 다음 사용을 전환한다.

Blueprint로 앱과 DB를 한 번에 만들면 첫 앱 배포가 복원 검사에서 멈출 수 있다. DB 복원 후 다시 배포한다. DB 전체 비교는 `transfer-db.py verify`로 수행하며 앱의 시작 검사는 이를 대신하지 않는다.

Render에서 새 비밀키를 만들면 기존 비밀번호는 유지되고 다시 로그인하면 된다. PostgreSQL TLS는 `require`, 연결 대기는 3초로 설정한다. 준비 상태 확인은 `/api/ready`를 사용한다.

## 배포와 확인

GitHub에는 실행 코드와 설정만 올린다. DB, 백업, 개인 계정 파일, API 키는 올리지 않는다. 컨테이너 빌드에서도 제외한다.

작업 브랜치에서 GitHub 검사와 PR 검토를 마친 뒤 main에 병합한다. Render는 main의 새 커밋을 자동 배포하며, `/api/ready`가 성공해야 새 버전으로 접속을 전환한다. 빌드나 배포에 실패하면 이전 버전이 계속 실행된다. Render 대시보드와 `render.yaml`의 브랜치·자동 배포 설정을 함께 유지한다. 기존 DB·계정·비밀키는 재배포할 때 바꾸지 않는다.

- 로그인하지 않은 데이터 조회가 거절되는지 확인한다.
- 계정별 권한, 기존 LOT와 라벨, 저장된 요청과 알림을 비교한다.
- 다른 계정으로 요청과 결과를 주고받고 재접속 후 기록이 남는지 확인한다.
- 재배포와 서버 재시작 후에도 DB가 유지되는지 확인한다.
- 백업을 새 빈 DB에 복원하는 검사도 수행한다.

코드를 되돌려도 DB는 이전 시점으로 되돌아가지 않는다. 공용 서버 사용 후 복구가 필요하면 가장 최근의 공용 DB를 백업하고 해당 기록을 기준으로 복구한다.

## Windows 앱

```powershell
pnpm --dir desktop build --server https://cal01-monitor.onrender.com
```

배포한 exe에 기본 접속 주소를 넣는다. 이미 사용자가 저장한 주소는 유지되므로 기존 사용자는 `CAL01 → 서버 연결 설정`에서 공용 주소를 선택한다. exe에 계정이나 비밀번호는 포함하지 않는다.

GitHub Actions의 `CAL01-Monitor-Windows` 산출물도 이 주소를 기본으로 사용한다.

공식 참고: [Docker 지원](https://render.com/docs/docker), [PostgreSQL 버전](https://render.com/docs/postgresql-upgrading).
