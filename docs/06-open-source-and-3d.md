# 오픈소스와 기존 3D 모델 사용 계획

로그인·데이터 저장·그래프·3D는 검증된 오픈소스를 사용한다. 우리가 만들 부분은 **채널값 → 이상 후보 → 팀 판단 → 현장 요청 → 처리 결과**를 연결하는 업무 흐름이다. 아직 앱 구현이나 모델 복사는 시작하지 않았다.

## 사용할 구성

| 역할 | 선택 | 라이선스·사용 범위 |
|---|---|---|
| 로그인·권한·서버 | [Django 5.2 LTS](https://github.com/django/django/blob/stable/5.2.x/LICENSE) | BSD-3-Clause. 사용자·세션·그룹·관리 화면을 재사용. [확장 지원은 2028년 4월까지](https://www.djangoproject.com/download/). |
| 화면과 서버 연결 | [Django REST Framework](https://github.com/encode/django-rest-framework/blob/main/LICENSE.md) | BSD-3-Clause. 입력 검증·API·권한 검사에 사용. |
| Windows 웹 서버 | [Waitress](https://github.com/Pylons/waitress/blob/main/LICENSE.txt) | ZPL-2.1. Windows에서 Django WSGI 앱을 실행. 개발용 `runserver`를 팀 서버로 사용하지 않음. |
| 화면 파일 제공 | [WhiteNoise](https://github.com/evansd/whitenoise/blob/main/LICENSE) | MIT. 빌드한 React의 JS·CSS 등 정적 파일을 제공. 업로드한 CSV와 비공개 데이터는 인증을 확인하는 API로 제공. |
| 팀 접속 HTTPS | [Caddy](https://github.com/caddyserver/caddy/blob/master/LICENSE) | Apache-2.0. HTTPS를 처리하고 로컬 Waitress로 전달. 내부 인증서를 쓰면 팀원 PC별 신뢰 설정이 필요. |
| 화면 | [React](https://github.com/react/react/blob/main/LICENSE), [Vite](https://github.com/vitejs/vite/blob/main/LICENSE), [TypeScript](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt) | React·Vite는 MIT, TypeScript는 Apache-2.0. 기존 대시보드의 화면·조작을 필요한 단위로 옮김. |
| 데이터 저장 | [PostgreSQL](https://www.postgresql.org/about/licence/) | PostgreSQL License. 수집 작업과 여러 팀원의 판단 저장을 함께 처리. |
| CSV·통계 계산 | [pandas](https://github.com/pandas-dev/pandas/blob/main/LICENSE), [NumPy](https://github.com/numpy/numpy/blob/main/LICENSE.txt) | BSD-3-Clause. 기존 Python 전처리·Z-score 기준을 연결. |
| 연간 흐름 | [Apache ECharts](https://github.com/apache/echarts/blob/master/LICENSE) | Apache-2.0. 일별 관측·이탈 집계에 사용. 채널 그래프는 기존 SVG 시간축·선택 기능을 재사용해 이번 주에 전면 재작성하지 않음. |
| 캘린더 | [FullCalendar Standard](https://fullcalendar.io/license) | MIT. 월·주·일 일정에 사용. 별도 라이선스인 Resource/Timeline Premium은 사용하지 않음. |
| 3D | [Three.js](https://github.com/mrdoob/three.js/blob/dev/LICENSE), [React Three Fiber](https://github.com/pmndrs/react-three-fiber/blob/master/LICENSE), [Drei](https://github.com/pmndrs/drei/blob/master/LICENSE) | 모두 MIT. 모델 표시·회전·선택·센서 위치 편집에 사용. React와 Fiber의 호환 버전을 함께 고정. |
| AI 설명 | [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python) | MIT. 서버에서 선택 구간 설명과 현장 요청 초안을 생성. API 서비스 이용 조건·요금은 SDK 라이선스와 별개. |
| 브라우저 검증 | [Playwright](https://github.com/microsoft/playwright/blob/main/LICENSE) | Apache-2.0. 두 계정의 저장·알림·3D 연결을 실제 화면에서 검증. |

Django를 고른 이유는 로그인과 계정 관리를 새로 조립할 부분이 적기 때문이다. 관리 화면은 계정·채널·기준 관리에 쓰고, 현장의 작업 흐름은 React 화면으로 만든다. [Django 인증·권한](https://docs.djangoproject.com/en/5.2/topics/auth/default/), [관리 화면 용도](https://docs.djangoproject.com/en/5.2/ref/contrib/admin/)

화면과 API는 같은 주소에서 제공한다. 세션 쿠키로 로그인하고, 로그인과 쓰기 요청에는 CSRF 검증을 적용한다. 알림은 DB에 저장한 뒤 2초마다 새 항목만 가져온다. [DRF 세션 인증](https://www.django-rest-framework.org/api-guide/authentication/#sessionauthentication)

첫 배포는 Windows에서 직접 실행한다. **팀 브라우저 → Caddy HTTPS → 로컬 Waitress → Django → 로컬 PostgreSQL** 순서다. Waitress는 Windows를 지원하며 Django의 WSGI 앱을 실행할 수 있다. PostgreSQL은 공식 Windows 설치 경로를 사용한다. Docker는 추후 선택사항이다. [Waitress 지원 환경](https://docs.pylonsproject.org/projects/waitress/en/stable/index.html), [Django WSGI](https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/), [PostgreSQL Windows](https://www.postgresql.org/download/windows/)

WhiteNoise는 정적 파일을 제공한다. 화면 주소를 새로고침했을 때 React를 여는 처리는 Django의 화면 경로에만 둔다. API·관리 화면·업로드 주소의 오류를 React 화면으로 덮지 않는다. Caddy 내부 인증서는 각 팀원 PC에서도 신뢰하도록 설정해야 하며, 서버의 자동 설치만으로 모든 PC가 접속되는 것은 아니다. [WhiteNoise 구성](https://whitenoise.readthedocs.io/en/stable/django.html), [Caddy 내부 인증서와 신뢰 설정](https://caddyserver.com/docs/automatic-https)

작업 프로세스도 같은 Python 프로젝트를 사용한다. PostgreSQL의 작업 목록에서 실행할 항목을 가져오며, 재시도·중복 방지·실패 상태를 기록한다. Redis·Celery는 이번 구성에 추가하지 않는다. [Django 행 잠금](https://docs.djangoproject.com/en/5.2/ref/models/querysets/#select-for-update), [PostgreSQL 작업 목록 잠금](https://www.postgresql.org/docs/current/sql-select.html)

실제 개발을 시작할 때 버전을 고정하고, 설치된 의존성의 라이선스·저작권 고지를 함께 보관한다. 오픈소스 라이브러리의 라이선스가 이미지·3D 모델 사용권까지 대신하지는 않는다.

## 기존 3D 모델: 무엇을 사용할 것인가

모델 원본 위치는 기존 프로젝트의 `_agent/annealing_3d/build/keynote/`다. 파일을 실행하지 않고 GLB 구조·좌표·메타데이터와 생성 코드를 읽었다.

| 후보 | 실제 파일 크기 | GLB 구조 | 선택 이유 |
|---|---:|---|---|
| **우선: `annealing_heat_soak_distinct.glb`** | 4,925,712바이트, 약 4.93 MB | 노드 1개·메시 1개·재질별 부분 15개·삼각형 55,748개·정점 123,432개 | `current-presentation.json`의 현재 모델. 가열과 균열의 외형이 구분되어 있음. |
| 보조: `annealing_steel_brushed_v3.glb` | 4,260,316바이트, 약 4.26 MB | 노드 1개·메시 1개·재질별 부분 14개·삼각형 42,640개·정점 96,800개 | 표면 표현을 갖춘 이전 모델. 가열·균열이 합쳐져 있어 성능·표현 비교에 사용. |

두 파일 모두 glTF 2.0이며 외부 파일을 요청하는 텍스처는 없다. 각각 1024×512 PNG 2장을 내부에 포함하고, 내장 애니메이션은 없다. 보관할 원본 식별값은 다음과 같다.

- 주모델 SHA-256: `62332fc78ae7fdc791890a27c2ef8c6e3da62b684c734d202a6187f2b0b57e0b`
- 보조 모델 SHA-256: `2b65b8db835607d706c67a2b51470fb66e35bef04e3b7231c59503e6eb34c9da`

생성 근거는 `build/native3d/build_scene.py`, `build/keynote/rebuild_heat_soak.py`, 두 모델의 메타데이터다. 기본 모델은 상자·롤러 등의 형상을 Python으로 만들며, 파일에는 외부 자산을 사용하지 않았다는 생성 정보와 절차적으로 만든 표면 정보가 있다. 다만 이번 확인 범위에서 모델 자체의 별도 라이선스 문서는 찾지 못했다. 저장소에 넣기 전 생성 코드·표면 생성 경로·배포 범위를 정리한다. 발표 표지에 쓰인 외부 사진은 모델과 별개이므로 함께 가져오지 않는다.

## 3D 위치와 채널을 연결하는 방식

두 모델의 실제 위치값 범위는 대략 `X -20.5~19.5`, `Y -0.61~10.78`, `Z -3.55~3.55`다. 위쪽은 `+Y`, 공정 진행은 `+X`, 앞쪽은 `+Z`로 기록되어 있다. **실측 미터가 아니라 설명용 모델 좌표**다.

주모델의 가열 부분은 `X -7.85~-2.8`, 균열 부분은 `X -2.8~0.75`로 명시되어 있다. 세정·건조·과시효·냉각 등도 재질과 공정 중심 좌표가 있다. 하지만 **Z3·Z4·Z5·Z6가 각각 독립된 이름의 노드로 들어 있지는 않다.** 모델을 클릭했다고 특정 채널을 자동으로 알 수 있는 구조가 아니다.

따라서 모델 위에 별도의 센서 표시점을 놓는다.

1. 채널 목록에서 `TC-Z3` 같은 채널을 고른다.
2. 모델 표면을 눌러 표시점을 놓거나, 기존 표시점을 옮긴다.
3. 채널·공정 존·모델 버전·모델 내부의 위치 `(x, y, z)`를 저장한다.
4. 위치를 저장한 뒤 다른 계정에서도 같은 위치를 본다.
5. 표시점을 누르면 그 채널의 값·선택한 시각·이상 후보·관련 작업을 연다.

TC와 OP가 같은 존을 가리켜도 하나의 센서로 합치지 않는다. 겹치는 표시점은 펼친 목록에서 채널을 고른다. 존의 공간 범위는 별도로 정리하고 팀이 확인한다. 실제 센서 설치 위치를 아는 것처럼 표시하지 않는다.

화면 크기와 카메라가 바뀌어도 표시점이 설비에 붙어 있도록 화면 픽셀 대신 **모델 내부 좌표**를 저장한다. 모델을 바꾸면 기존 좌표를 무조건 재사용하지 않고 모델 버전과 맞는지 확인한다. 발표용 Office 중심 이동·축척 값도 웹 화면에 그대로 적용하지 않는다.

회전·확대·표시점 이동은 이번 범위에 포함한다. 설비의 벽·롤러를 새로 설계하거나 치수를 수정하는 CAD 편집은 포함하지 않는다. 기존 파일 역시 실제 시공 도면이 아닌 교육용 구조임을 명시하고 있다.

## 첫 이틀에 먼저 확인할 것

3D는 마지막 장식으로 붙이지 않는다. **첫날 로드·선택, 둘째 날 실제 채널 연결·위치 저장**을 먼저 통과시킨다.

| 시점 | 작업 | 통과 기준 |
|---|---|---|
| 1일 차 | 원본·텍스처 출처 정리, 주모델 로드, 전체 보기·회전·확대 | 선택한 발표용 노트북에서 모델이 보이고 전체 공정이 화면에 들어옴. 콘솔 오류 없음. |
| 1일 차 | 공정 존·채널 매핑과 표면 선택 확인 | 원하는 위치에 표시점을 놓고 해당 채널 이름을 바로 확인할 수 있음. |
| 2일 차 | 위치 저장·권한·동시 수정 처리 | 새로고침·서버 재시작·다른 계정에서 같은 위치를 확인. 충돌 시 남의 변경을 덮어쓰지 않음. |
| 2일 차 | CSV 재생과 채널 그래프 연결 | 3D에서 고른 채널과 그래프에 표시되는 채널·시각이 같음. |
| 3~4일 차 | 감지 결과·현장 요청 연결 | 같은 표시점에서 실제 후보를 열고 같은 구간으로 현장 요청을 보냄. |

다음 검증도 완료 조건에 포함한다.

- 라이트·다크 모두에서 금속 표면, 채널 이름, 이상 후보 표시가 구분된다. 색상에 상태 이름도 함께 표시한다.
- 카메라 회전·확대·창 크기 변경 후에도 센서 표시점이 원래 위치에 붙어 있다.
- 3D의 시각을 고정하면 그래프와 값도 같은 시각을 따른다. 결측값을 0이나 정상으로 표시하지 않는다.
- 화면 밖으로 센서가 사라졌을 때 채널 목록에서 다시 선택해 그 위치로 이동한다.
- 일반 사용자는 센서 위치를 읽고, 위치 편집 권한을 가진 사용자만 변경한다. 서버도 같은 권한을 검사한다.
- 모델 밖의 좌표, 숫자가 아닌 좌표, 다른 모델 버전의 위치는 저장하지 않는다. 선택한 존 밖에 놓으려면 존을 다시 지정하도록 안내한다.
- 모바일에서는 표시점이 겹치면 채널 목록으로 선택한다. WebGL을 사용할 수 없으면 공정 배치도·채널 목록·그래프를 보여 주며 판단 저장은 계속 가능하다.
- 모델은 한 번만 불러오고 2초 알림 조회마다 다시 로드하지 않는다. 사용하지 않는 탭에서는 불필요한 3D 갱신을 멈춘다.

모델 크기와 삼각형 수만으로 화면 성능을 통과했다고 판단하지 않는다. 실제 발표용 노트북·팀원 브라우저에서 움직임과 첫 로딩을 확인한다. 주모델이 무겁다면 표면·그림자·픽셀 비율부터 줄이고, 보조 모델 또는 단순 존 모형으로 비교한다. **센서 선택·저장·채널 연결 기능은 유지한다.**
