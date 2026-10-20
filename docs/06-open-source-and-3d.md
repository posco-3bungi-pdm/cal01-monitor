# 오픈소스와 새 연속 소둔로 3D 제작 계획

로그인·데이터 저장·그래프·3D는 검증된 오픈소스를 사용한다. 우리가 만들 부분은 **채널값 → 이상 후보 → 팀 판단 → 현장 요청 → 처리 결과**를 연결하는 업무 흐름이다. 사용자 요청에 따라 PPTX 재사용안은 새 모형 제작안으로 변경했다. 아직 앱 구현이나 새 모델 제작은 시작하지 않았다.

완성형 관제·정비 플랫폼과 추가 UI·3D 자산까지 비교한 결과는 [07 오픈소스 비교](07-open-source-selection.md)에 정리했다. 새로 가져올 후보는 Radix·TanStack Query와 CC0 배관·덕트·금속 재질이다. Three.js 생성 코드를 모형의 기준으로 유지하고 Blender는 부품·재질 작업을 돕는 도구로 사용한다.

## 사용할 구성

| 역할 | 선택 | 라이선스·사용 범위 |
|---|---|---|
| 로그인·권한·서버 | [Django 5.2 LTS](https://github.com/django/django/blob/stable/5.2.x/LICENSE) | BSD-3-Clause. 사용자·세션·그룹·관리 화면을 재사용. [확장 지원은 2028년 4월까지](https://www.djangoproject.com/download/). |
| 화면과 서버 연결 | [Django REST Framework](https://github.com/encode/django-rest-framework/blob/main/LICENSE.md) | BSD-3-Clause. 입력 검증·API·권한 검사에 사용. |
| Windows 웹 서버 | [Waitress](https://github.com/Pylons/waitress/blob/main/LICENSE.txt) | ZPL-2.1. Windows에서 Django WSGI 앱을 실행. 개발용 `runserver`를 팀 서버로 사용하지 않음. |
| 화면 파일 제공 | [WhiteNoise](https://github.com/evansd/whitenoise/blob/main/LICENSE) | MIT. 빌드한 React의 JS·CSS 등 정적 파일을 제공. 업로드한 CSV와 비공개 데이터는 인증을 확인하는 API로 제공. |
| 팀 접속 HTTPS | [Caddy](https://github.com/caddyserver/caddy/blob/master/LICENSE) | Apache-2.0. HTTPS를 처리하고 로컬 Waitress로 전달. 내부 인증서를 쓰면 팀원 PC별 신뢰 설정이 필요. |
| 화면 | [React](https://github.com/react/react/blob/main/LICENSE), [Vite](https://github.com/vitejs/vite/blob/main/LICENSE), [TypeScript](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt) | React·Vite는 MIT, TypeScript는 Apache-2.0. 기존 대시보드의 화면·조작을 필요한 단위로 옮김. |
| 모달·탭·토글 | [Radix Primitives](https://github.com/radix-ui/primitives/blob/main/LICENSE) | MIT. 초점·키보드 조작을 재사용하고 색·간격·형태는 우리 화면에 맞춤. 필요한 shadcn/ui 코드를 사용하는 방식도 가능. |
| 서버 데이터 갱신 | [TanStack Query](https://github.com/TanStack/query/blob/main/LICENSE) | MIT. 알림 폴링과 저장 후 목록 갱신. 판단·알림 이력은 서버 DB에 저장. |
| 데이터 저장 | [PostgreSQL](https://www.postgresql.org/about/licence/) | PostgreSQL License. 수집 작업과 여러 팀원의 판단 저장을 함께 처리. |
| CSV·통계 계산 | [pandas](https://github.com/pandas-dev/pandas/blob/main/LICENSE), [NumPy](https://github.com/numpy/numpy/blob/main/LICENSE.txt) | BSD-3-Clause. 기존 Python 전처리·Z-score 기준을 연결. |
| 연간 흐름 | [Apache ECharts](https://github.com/apache/echarts/blob/master/LICENSE) | Apache-2.0. 일별 관측·이탈 집계에 사용. 채널 그래프는 기존 SVG 시간축·선택 기능을 재사용해 이번 시연에서는 전면 재작성하지 않음. |
| 캘린더 | [FullCalendar Standard](https://fullcalendar.io/license) | MIT. 월·주·일 일정에 사용. 별도 라이선스인 Resource/Timeline Premium은 사용하지 않음. |
| 3D | [Three.js](https://github.com/mrdoob/three.js/blob/dev/LICENSE), [React Three Fiber](https://github.com/pmndrs/react-three-fiber/blob/master/LICENSE), [Drei](https://github.com/pmndrs/drei/blob/master/LICENSE) | 모두 MIT. 모델 표시·회전·선택·센서 위치 편집에 사용. React와 Fiber의 호환 버전을 함께 고정. |
| 화면 모핑 | [Motion for React](https://github.com/motiondivision/motion) | MIT 코어의 `layout`·`layoutId`로 선택 항목·패널을 연결. Motion+ 전용 기능은 별도. 3D 카메라는 Three.js·Drei로 처리. |
| AI 설명 | [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python) | MIT. 서버에서 선택 구간 설명과 현장 요청 초안을 생성. API 서비스 이용 조건·요금은 SDK 라이선스와 별개. |
| 브라우저 검증 | [Playwright](https://github.com/microsoft/playwright/blob/main/LICENSE) | Apache-2.0. 두 계정의 저장·알림·3D 연결을 실제 화면에서 검증. |

Django를 고른 이유는 로그인과 계정 관리를 새로 조립할 부분이 적기 때문이다. 관리 화면은 계정·채널·기준 관리에 쓰고, 현장의 작업 흐름은 React 화면으로 만든다. [Django 인증·권한](https://docs.djangoproject.com/en/5.2/topics/auth/default/), [관리 화면 용도](https://docs.djangoproject.com/en/5.2/ref/contrib/admin/)

화면과 API는 같은 주소에서 제공한다. 세션 쿠키로 로그인하고, 로그인과 쓰기 요청에는 CSRF 검증을 적용한다. 알림은 DB에 저장한 뒤 2초마다 새 항목만 가져온다. [DRF 세션 인증](https://www.django-rest-framework.org/api-guide/authentication/#sessionauthentication)

첫 배포는 Windows에서 직접 실행한다. **팀 브라우저 → Caddy HTTPS → 로컬 Waitress → Django → 로컬 PostgreSQL** 순서다. Waitress는 Windows를 지원하며 Django의 WSGI 앱을 실행할 수 있다. PostgreSQL은 공식 Windows 설치 경로를 사용한다. Docker는 추후 선택사항이다. [Waitress 지원 환경](https://docs.pylonsproject.org/projects/waitress/en/stable/index.html), [Django WSGI](https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/), [PostgreSQL Windows](https://www.postgresql.org/download/windows/)

WhiteNoise는 정적 파일을 제공한다. 화면 주소를 새로고침했을 때 React를 여는 처리는 Django의 화면 경로에만 둔다. API·관리 화면·업로드 주소의 오류를 React 화면으로 덮지 않는다. Caddy 내부 인증서는 각 팀원 PC에서도 신뢰하도록 설정해야 하며, 서버의 자동 설치만으로 모든 PC가 접속되는 것은 아니다. [WhiteNoise 구성](https://whitenoise.readthedocs.io/en/stable/django.html), [Caddy 내부 인증서와 신뢰 설정](https://caddyserver.com/docs/automatic-https)

작업 프로세스도 같은 Python 프로젝트를 사용한다. PostgreSQL의 작업 목록에서 실행할 항목을 가져오며, 재시도·중복 방지·실패 상태를 기록한다. Redis·Celery는 이번 구성에 추가하지 않는다. [Django 행 잠금](https://docs.djangoproject.com/en/5.2/ref/models/querysets/#select-for-update), [PostgreSQL 작업 목록 잠금](https://www.postgresql.org/docs/current/sql-select.html)

실제 개발을 시작할 때 버전을 고정하고, 설치된 의존성의 라이선스·저작권 고지를 함께 보관한다. 오픈소스 라이브러리의 라이선스가 이미지·3D 모델 사용권까지 대신하지는 않는다.

## 새 모형: 실제 연속 소둔로의 구조를 보여줌

금속 표면만 바꾸는 수준이 아니라 **길게 이어지는 설비, 구역별 외함, 지지 프레임, 상하부 롤러, 롤러를 돌아 다음 구역으로 이어지는 강판**을 새로 만든다. 공개 제작사 자료를 참고한 수직형 연속 소둔로를 기본 외형으로 제안한다. 실제 CAL01의 실측 도면과 같다는 뜻은 아니며, 화면에는 `연속소둔 공정 개념 모형`으로 표시한다.

| 부분 | 새로 만들 형태와 동작 |
| --- | --- |
| 설비 외관 | 높이가 있는 소둔로 외함, 지지 기둥·가로보, 주요 점검 통로, 구역별 분리된 구조 |
| 강판 경로 | 입구에서 출구까지 끊기지 않는 얇은 띠, 상하부 롤러를 돌아가는 경로, 진행 방향 표시 |
| 내부 보기 | 외함 표시·숨김 또는 투명도 전환으로 강판과 롤러를 확인 |
| 가열·유지·냉각 구역 | 공정별 독립된 그룹과 이름, 주요 가열부·송풍부 형상을 단순화해 배치 |
| 채널 | 데이터사전과 대조한 채널 ID를 구역에 연결. TC·OP·CP를 서로 다른 채널로 유지 |
| 화면 이동 | 전체→공정 구역→채널 위치로 카메라가 이동. 그래프와 요청의 채널·시각은 그대로 유지 |

### 구조의 참고 근거

- [ANDRITZ 연속 소둔로](https://www.andritz.com/products-en/metals/furnaces/continuous-strip-processing/annealing-line-furnaces): 가열·균열·냉각·과시효 기능과 수직형 가열 경로, 강종에 맞춘 가열·냉각 방식의 근거로 사용.
- [ANDRITZ 탄소강 연속 열처리 설비 자료](https://www.andritz.com/resource/blob/19318/7b7516e7d8b8973f006147414ba8132a/download-strip-furnaces-carbon-en-metals-data.pdf): `Continuous annealing line (CAL)`로 표시된 사진과 설명에서 외함·프레임·작업 통로의 배치를 참고. 같은 자료의 아연도금 설비를 CAL01에 그대로 옮기지 않음.

제작사 사진과 CAD를 제품 자산으로 복사하지 않고, 공정 구조를 참고해 자체 형상을 만든다. 참고 자료는 CAL01의 존 번호나 센서 부착 좌표를 입증하지 않는다. **Z3~Z6 및 TC-Z9 등의 역할은 프로젝트 데이터사전과 팀 확인으로 연결**하며, 이름의 숫자만 보고 실제 롤러 위치나 체류시간을 정하지 않는다.

### 4일 안에 만들 방법

Three.js 생성 코드와 구역별 치수·위치 설정을 분리한다. 외함, 프레임, 롤러, 강판 경로를 각각 독립 그룹으로 만들어 선택·숨김·강조를 가능하게 한다. 반복 부품은 같은 형상을 재사용하고, 생성 코드와 GLB 결과·모델 버전을 함께 관리한다. 생성 코드로 구조를 남겨 전체 높이나 구역 간격을 바꿀 때 형상을 다시 수작업하는 일을 줄인다.

첫날은 위의 구조와 실제 채널 선택→그래프 연결까지 완료하는 것이 목표다. 위치 편집은 표시점을 골라 이동·취소·저장하는 수준이다. 볼트·용접부·모든 배관·실측 치수·여러 설비용 편집기는 만들지 않는다. 일정이 밀리면 새 모형의 세부 표현을 줄이고, PPTX 모형으로 임의 대체하지 않는다.

강판의 진행 방향은 설명용 표시다. 라인 속도와 구역 길이의 근거가 없으면 실제 이동시간이나 특정 강판 조각의 위치를 계산한 것처럼 보여주지 않는다. 온도를 이용한 색도 채널 표시점과 상태 배지에 적용하며, 공간 전체의 온도 분포를 계산한 열지도처럼 채우지 않는다. OP는 제어 출력 채널이므로 별도 물리 센서가 부착된 것으로 표시하지 않는다.

<details>
<summary>이전 PPTX·GLB 자산의 확인 기록 — 이번 제품의 사용 모형은 아님</summary>

### 기존 자산 조사

모델 원본 위치는 기존 프로젝트의 `_agent/annealing_3d/build/keynote/`다. 파일을 실행하지 않고 GLB 구조·좌표·메타데이터와 생성 코드를 읽었다.

| 후보 | 실제 파일 크기 | GLB 구조 | 선택 이유 |
|---|---:|---|---|
| `annealing_heat_soak_distinct.glb` | 4,925,712바이트, 약 4.93 MB | 노드 1개·메시 1개·재질별 부분 15개·삼각형 55,748개·정점 123,432개 | 기존 발표의 모델. 가열과 균열의 외형이 구분되어 있음. |
| `annealing_steel_brushed_v3.glb` | 4,260,316바이트, 약 4.26 MB | 노드 1개·메시 1개·재질별 부분 14개·삼각형 42,640개·정점 96,800개 | 표면 표현을 갖춘 이전 모델. 가열·균열이 합쳐져 있음. |

두 파일 모두 glTF 2.0이며 외부 파일을 요청하는 텍스처는 없다. 각각 1024×512 PNG 2장을 내부에 포함하고, 내장 애니메이션은 없다. 보관할 원본 식별값은 다음과 같다.

- 주모델 SHA-256: `62332fc78ae7fdc791890a27c2ef8c6e3da62b684c734d202a6187f2b0b57e0b`
- 보조 모델 SHA-256: `2b65b8db835607d706c67a2b51470fb66e35bef04e3b7231c59503e6eb34c9da`

생성 근거는 `build/native3d/build_scene.py`, `build/keynote/rebuild_heat_soak.py`, 두 모델의 메타데이터다. 기본 모델은 상자·롤러 등의 형상을 Python으로 만들며, 파일에는 외부 자산을 사용하지 않았다는 생성 정보와 절차적으로 만든 표면 정보가 있다. 다만 이번 확인 범위에서 모델 자체의 별도 라이선스 문서는 찾지 못했다. 저장소에 넣기 전 생성 코드·표면 생성 경로·배포 범위를 정리한다. 발표 표지에 쓰인 외부 사진은 모델과 별개이므로 함께 가져오지 않는다.

### PPTX 안의 모형도 재사용 가능

`_agent/annealing_3d/current-presentation.json`가 지정한 현재 발표 파일은 `keynote/annealing_morph_precision.pptx`다. PPTX 내부 ZIP 목록·슬라이드 관계·GLB 구조를 읽어 실제 3D 파일 10개를 확인했다.

- 발표 순서 8~22쪽의 소둔로는 `ppt/media/model3d2.glb`, 8,557,904바이트다.
- 8~11쪽은 공장 주변을 포함한 `ppt/media/model3d1.glb`, 10,368,920바이트도 함께 사용한다.
- 소둔로 모형은 위의 원본 GLB와 같은 생성 기반이지만, 윤곽선 재질 등 발표용 가공이 더해져 파일은 다르다.

이는 재사용 가능성을 확인했던 기록이다. 이후 사용자 요청으로 제품 모형은 새로 제작하기로 변경했다. PPTX와 원본 파일은 수정하지 않았다.

### 이전 모형의 좌표

두 모델의 실제 위치값 범위는 대략 `X -20.5~19.5`, `Y -0.61~10.78`, `Z -3.55~3.55`다. 위쪽은 `+Y`, 공정 진행은 `+X`, 앞쪽은 `+Z`로 기록되어 있다. **실측 미터가 아니라 설명용 모델 좌표**다.

주모델의 가열 부분은 `X -7.85~-2.8`, 균열 부분은 `X -2.8~0.75`로 명시되어 있다. 세정·건조·과시효·냉각 등도 재질과 공정 중심 좌표가 있다. 하지만 **Z3·Z4·Z5·Z6가 각각 독립된 이름의 노드로 들어 있지는 않다.** 모델을 클릭했다고 특정 채널을 자동으로 알 수 있는 구조가 아니다.

</details>

## 새 모형의 위치와 채널을 연결하는 방식

새 모형은 공정 구역을 별도 그룹으로 만든다. 채널 ID는 구역 정보와 연결하되, 채널 표시점의 위치는 별도로 저장한다.

1. 채널 목록에서 `TC-Z3` 같은 채널을 고른다.
2. 모델 표면을 눌러 표시점을 놓거나, 기존 표시점을 옮긴다.
3. 채널·공정 존·모델 버전·모델 내부의 위치 `(x, y, z)`를 저장한다.
4. 위치를 저장한 뒤 다른 계정에서도 같은 위치를 본다.
5. 표시점을 누르면 그 채널의 값·선택한 시각·이상 후보·관련 작업을 연다.

TC와 OP가 같은 존을 가리켜도 하나의 센서로 합치지 않는다. 겹치는 표시점은 펼친 목록에서 채널을 고른다. 존의 공간 범위는 별도로 정리하고 팀이 확인한다. 실제 센서 설치 위치를 아는 것처럼 표시하지 않는다.

화면 크기와 카메라가 바뀌어도 표시점이 설비에 붙어 있도록 화면 픽셀 대신 **모델 내부 좌표**를 저장한다. 모델을 바꾸면 기존 좌표를 무조건 재사용하지 않고 모델 버전과 맞는지 확인한다. 발표용 Office 중심 이동·축척 값도 웹 화면에 그대로 적용하지 않는다.

회전·확대·표시점 이동은 이번 범위에 포함한다. 설비 형상은 생성 코드로 제작하며, 사용자가 앱에서 벽·롤러의 치수를 설계하는 CAD 편집 기능은 포함하지 않는다.

## 4일 동안 확인할 것

**첫날 새 모형과 실제 채널 연결, 둘째 날 현장 요청까지** 이어져야 한다. 모형의 세부 표현 때문에 업무 연결을 마지막 날로 미루지 않는다.

| 시점 | 작업 | 통과 기준 |
|---|---|---|
| 1일 차 | 새 외함·프레임·롤러·강판 경로·구역 제작, CSV 채널 연결·위치 저장 | 발표용 PC에서 3D 선택→실제 그래프가 됨. 위치가 새로고침 후 유지됨. |
| 2일 차 | 감지 결과·현장 요청·위치 권한과 충돌 처리 | 두 계정이 같은 위치·구간을 보고 요청 한 건을 완료함. |
| 3일 차 | 내부 보기·재질·핵심 카메라와 패널 모핑 마무리 | 라이트·다크에서 채널과 상태가 보이고 전환 중에도 선택 구간을 잃지 않음. |
| 4일 차 | 실제 발표 PC·팀원 PC 검증과 결함 수정 | 재시작·계정 변경·창 크기 변경 후에도 같은 위치와 판단을 확인함. |

다음 검증도 완료 조건에 포함한다.

- 라이트·다크 모두에서 금속 표면, 채널 이름, 이상 후보 표시가 구분된다. 색상에 상태 이름도 함께 표시한다.
- 카메라 회전·확대·창 크기 변경 후에도 센서 표시점이 원래 위치에 붙어 있다.
- 3D의 시각을 고정하면 그래프와 값도 같은 시각을 따른다. 결측값을 0이나 정상으로 표시하지 않는다.
- 화면 밖으로 센서가 사라졌을 때 채널 목록에서 다시 선택해 그 위치로 이동한다.
- 일반 사용자는 센서 위치를 읽고, 위치 편집 권한을 가진 사용자만 변경한다. 서버도 같은 권한을 검사한다.
- 모델 밖의 좌표, 숫자가 아닌 좌표, 다른 모델 버전의 위치는 저장하지 않는다. 선택한 존 밖에 놓으려면 존을 다시 지정하도록 안내한다.
- 모바일에서는 표시점이 겹치면 채널 목록으로 선택한다. WebGL을 사용할 수 없으면 공정 배치도·채널 목록·그래프를 보여 주며 판단 저장은 계속 가능하다.
- 모델은 한 번만 불러오고 2초 알림 조회마다 다시 로드하지 않는다. 사용하지 않는 탭에서는 불필요한 3D 갱신을 멈춘다.

모델 크기와 삼각형 수만으로 화면 성능을 통과했다고 판단하지 않는다. 실제 발표용 노트북·팀원 브라우저에서 움직임과 첫 로딩을 확인한다. 무겁다면 새 모형의 반복 부품 수·표면·그림자·픽셀 비율부터 줄인다. **연속된 강판 경로·구역 구분·채널 선택·저장은 유지한다.**
