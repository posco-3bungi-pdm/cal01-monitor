# 오픈소스 조사와 가져올 기능

**3D·달력·로그인·차트는 있는 것을 쓰고, 우리는 같은 채널·구간을 현장 요청까지 이어주는 부분을 만든다.** 완성형 관제·정비 제품도 비교했지만, 현재 요구에는 기존 그래프와 Python 분석을 살리는 조합을 우선 추천한다.

아래 `추천`은 개발에 사용할 후보라는 뜻이다. 아직 설치하거나 실제 앱에서 성능을 검증한 것은 아니다. `후속`은 필요한 조건이 생기면 검토할 후보, `참고`는 기능·구조를 살펴볼 대상이다. 제품 문서에서 확인한 기능과 우리 프로젝트에 맞는지에 대한 판단을 구분했다.

## 1. 먼저 가져올 것

| 만들 화면·기능 | 우선 가져올 것 | 우리가 연결할 부분 |
| --- | --- | --- |
| 새 소둔로 3D | Three.js + React Three Fiber + Drei | 존·채널 ID, 표시점 저장, 같은 시각의 그래프 연결 |
| 설비 외관 | Poly Haven 배관·덕트·금속 재질, Blender 보조 작업 | 소둔로 본체·롤러·강판 경로와 구역 배치 |
| 자연스러운 화면 전환 | Motion + Drei CameraControls | 전체→존→채널→현장 요청으로 같은 대상 유지 |
| 모달·탭·토글 | Radix, 필요한 shadcn/ui 구성 | 우리 색·간격·글자와 업무 입력 항목 |
| 서버 데이터 갱신 | TanStack Query | 조회 키·저장 후 갱신·알림 조회 위치 |
| 채널 시계열 | 기존 공동 검토 서버의 SVG 그래프 | 서버의 기간 조회, 3D 선택, 저장한 구간 연결 |
| 연간·월별 흐름 | Apache ECharts | 관측 없는 날, 후보 수, 조업·정비 집계 |
| 계획·실제 작업·할 일 | FullCalendar Standard | 날짜 종류와 업무 상태를 구분해서 표시 |
| 로그인·권한·저장 | Django + Django REST Framework + PostgreSQL | 두 팀의 시작 화면, 담당자·요청자별 처리 권한 |
| Z-score | pandas·NumPy와 기존 계산 코드 | 기준 버전, 후보 묶기, 재생 중 중복 알림 방지 |
| 알림·현장 요청 | Django의 저장·트랜잭션 기능 | 요청→수락→조치→결과 제출→요청자 확인과 이력 |
| Claude 설명 | Anthropic Python SDK | 선택 구간과 기록의 근거 묶음, 설명 초안, 사용자 확인 |

기본 서버의 라이선스와 실행 구조는 [06 오픈소스와 3D](06-open-source-and-3d.md), 구현 범위는 [05 개발 계획](05-delivery.md)에 정리했다. 이 조사로 별도 서버나 새 감지 모델을 추가하지 않는다.

## 2. 완성형 제품을 가져오면 더 빠를까?

설치까지 빠른 것과 우리 기능을 완성하기 쉬운 것은 다르다. 아래 판단은 **새 3D + 기존 시계열 선택 + 두 팀의 요청 처리**를 한 화면 흐름으로 이어야 한다는 조건에서 내렸다.

| 후보 | 이미 있는 기능 | 라이선스·구성 | 이번 선택 |
| --- | --- | --- | --- |
| [FUXA](https://github.com/frangoteam/FUXA) | 산업 관제 화면 편집, 태그·경보·이력, OPC UA·MQTT·Modbus 등 연결 | MIT. Angular·SVG 화면과 Node 서버 | **관제 대안 중 우선 검토할 후보.** 실제 PLC와 2D 관제가 중심이면 유리함. 지금은 React 3D와 업무 흐름을 다시 연결해야 하므로 전체 교체는 보류 |
| [NASA Open MCT](https://github.com/nasa/openmct) | 과거·현재 계측값, 공통 시간 범위, 그래프·표·상태 화면과 플러그인 | [Apache-2.0](https://github.com/nasa/openmct/blob/master/LICENSE.md). 데이터 제공 플러그인 연결 필요 | **관제 사용 방식 참고.** 시간 범위가 여러 화면에 함께 적용되는 구조가 유용함. 우리 로그인·작업 요청·소둔로 3D까지 기본 제공되는 제품으로 보지는 않음 |
| [Grafana](https://github.com/grafana/grafana) | 데이터 조회, 대시보드, 경보, 공유 | [AGPL-3.0, 일부 구성은 별도 라이선스](https://github.com/grafana/grafana/blob/main/LICENSING.md) | **장기 운영 지표용 후보.** 현재 구간 선택과 현장 업무를 Grafana 안에 다시 만드는 것은 보류 |
| [OpenRemote](https://github.com/openremote/core) | 장치·자산 관리, 수집·규칙·대시보드 | [AGPLv3 및 상용 대안](https://openremote.io/open-source/). 별도 플랫폼 운영 | **실제 장치가 늘 때 후보.** 이번 CSV와 다섯 명의 업무에 플랫폼 전체를 추가할 필요는 낮음 |
| [Atlas CMMS](https://github.com/Grashjs/cmms) | 정비 요청, 작업 지시, 담당팀·이력, 설비·부품 관리 | AGPLv3/상용 이중 라이선스. React·Spring Boot, Docker 구성. 제품이 안내하는 고급 기능·브랜딩은 별도 조건 확인 | **정비 업무 참고에 가장 가까움.** 업무 화면만 필요하면 강한 후보지만, 우리 Python 감지·3D·시계열 첨부는 새로 연동해야 함 |
| [ThingsBoard](https://thingsboard.io/blog/one-thingsboard-source-available/) | 장치 수집, 규칙·알림·대시보드 | 공식 공지상 **4.4부터 BUSL-1.1**. 기존 CE 4.3.x까지의 Apache-2.0과 구분 | **이번 오픈소스 기본안에서는 제외.** 현재 버전을 예전 Apache 제품으로 생각하고 가져오면 안 됨. 무료 사용 조건과 자체 브랜딩 조건도 구분해야 함 |
| [Fledge](https://github.com/fledge-iot/fledge) | 산업 데이터 수집·버퍼링·변환·상위 서버 전달 | Apache-2.0. Linux 서비스 기반 | **실제 현장 수집 후속 후보.** 완성형 업무 화면이 아니라 수집 계층에 가까움. Windows CSV 시연에 Linux 수집 계층을 더하지 않음 |

FUXA의 [v1.3.5 릴리스](https://github.com/frangoteam/FUXA/releases/tag/v1.3.5), Open MCT의 [v4.3.1 릴리스](https://github.com/nasa/openmct/releases/tag/v4.3.1)도 확인했다. 버전이 있다는 사실만으로 CAL01에서 실행 검증을 마쳤다는 뜻은 아니다. 상용 부가 기능과 공개 소스 부분은 별도로 확인한다.

**추천은 기존 설계 유지다.** 완성형 제품을 고르면 새로 만드는 화면은 줄어들 수 있지만, 기존 코드 이관·데이터 제공 방식·계정·3D 플러그인 작업이 생긴다. 지금 우리에게 가장 큰 재사용 자산은 이미 만든 구간 선택과 조업·정비 기록 화면이다.

## 3. 3D와 모핑에 바로 쓸 도구

| 후보 | 라이선스 | 가져올 기능 | 적용 방법 |
| --- | --- | --- | --- |
| [Three.js](https://github.com/mrdoob/three.js) | [MIT](https://github.com/mrdoob/three.js/blob/dev/LICENSE) | GLB 읽기, 재질·조명, 카메라, 물체 선택, 단면 표시 | **추천.** 소둔로 전체를 한 메시로 합치지 않고 존·외함·롤러·강판을 분리 |
| [React Three Fiber](https://github.com/pmndrs/react-three-fiber) | MIT | React에서 3D 장면과 포인터 이벤트 관리 | **추천.** 채널·시각 상태를 그래프와 공유. 안정 계열과 React·Three 호환 버전을 함께 고정 |
| [Drei](https://github.com/pmndrs/drei) | MIT | `useGLTF`, `CameraControls`, `Html`, `TransformControls` | **추천.** 모형 로딩, 존으로 이동, 이름표, 표시점 위치 편집을 직접 구현하지 않음 |
| [Motion](https://github.com/motiondivision/motion) | MIT | 패널 펼침, 같은 요소의 화면 간 이동, 목록 전환 | **추천.** 구간이 현장 요청에 붙는 전환에 사용. 3D 카메라는 Drei가 담당 |
| [Blender](https://www.blender.org/about/license/) | 프로그램 GPL. 만든 작품에 자동 적용되는 것은 아님 | 부품 조립, 재질·UV 수정, GLB 내보내기 | **제작 보조.** 서버의 필수 실행 프로그램으로 추가하지 않음 |
| [glTF Transform](https://github.com/donmccurdy/glTF-Transform) | MIT | GLB 검사·텍스처 축소·압축 | **추천.** 선택 가능한 존 이름·메타데이터를 유지하며 최적화 |
| [gltfjsx](https://github.com/pmndrs/gltfjsx) | MIT | GLB를 React 구성으로 변환, 반복 형상 재사용 | **선택.** `useGLTF`만으로 충분하면 생략. 자동 병합으로 존 선택 단위를 없애지 않음 |
| [meshoptimizer / gltfpack](https://github.com/zeux/meshoptimizer) | MIT | 메시 최적화·압축 | **선택.** glTF Transform의 압축과 중복 파이프라인을 만들지 않음 |
| [FUXA SVG Widgets](https://github.com/frangoteam/FUXA-SVG-Widgets) | MIT | 공업용 계기·상태 표시·설비 SVG | **참고 또는 일부 재사용.** FUXA용 값 연결 코드는 React에 그대로 붙는 것이 아님. 3D 대체가 아니라 평면 설비 표시 후보 |

Drei는 [카메라 이동](https://drei.docs.pmnd.rs/controls/camera-controls), [모형에 붙는 이름표](https://drei.docs.pmnd.rs/misc/html), [위치 편집](https://drei.docs.pmnd.rs/gizmos/transform-controls)을 제공한다. 우리가 추가할 부분은 채널 ID 연결, 좌표 저장, 권한과 동시 수정 처리다.

### 새 소둔로를 만드는 방법

기본은 기존 설계대로 **Three.js 생성 코드 + 구역별 치수·위치 설정**이다. 외함·프레임·롤러·강판 경로를 먼저 만들고, Blender는 공개 부품의 크기·재질을 맞추거나 결과를 확인할 때 사용한다. 두 도구에서 본체를 따로 수정해 서로 다른 원본을 만들지 않는다.

- 외함을 숨기면 실제로 만든 내부 롤러와 강판 경로가 보이게 한다.
- 롤러를 감는 강판은 직선과 접선 방향의 원호로 연결한다. 임의의 부드러운 곡선으로 롤러를 관통하게 만들지 않는다.
- 표시점은 모형에 합치지 않고 채널·존·모형 버전·모형 내부 좌표로 저장한다.
- 이동 애니메이션은 공정 진행 방향을 설명한다. 실제 라인 속도·존 길이 자료 없이 동일 강판의 도착 시각을 계산했다고 표시하지 않는다.
- 프레임·볼트처럼 반복되는 형상은 재사용하되, 선택할 존과 외함은 구분을 유지한다.

R3F·Drei의 사전 배포 계열로 바꾸거나 WebGPU까지 함께 도입하지 않는다. [R3F 릴리스](https://github.com/pmndrs/react-three-fiber/releases), [Drei 릴리스](https://github.com/pmndrs/drei/releases)에서 안정판을 고른 뒤 호환 조합을 잠근다.

## 4. 실제로 가져올 수 있는 산업용 자산

아래는 소프트웨어 라이브러리와 별개인 **3D 모델·재질 자산**이다. 원본 페이지에서 CC0를 확인한 후보들이다.

| 자산 | 쓸 위치 | 적용 범위 |
| --- | --- | --- |
| [Poly Haven 산업용 배관](https://polyhaven.com/a/modular_industrial_pipes_01) | 소둔로 외부 배관 | 필요한 연결부·직관만 골라 배치 |
| [Poly Haven 사각 덕트](https://polyhaven.com/a/modular_airduct_rectangular_01) | 송풍·냉각부 주변 | 형상과 구역을 먼저 맞추고 장식으로 제한 |
| [Poly Haven 원형 덕트](https://polyhaven.com/a/modular_airduct_circular_01) | 외부 덕트 | 같은 부품을 반복 사용해 모형 용량 절약 |
| [Poly Haven Blue Metal Plate](https://polyhaven.com/a/blue_metal_plate) | 금속 외함 표면 | 페인트·금속의 거칠기 표현 |
| [Poly Haven Machine Shop 02](https://polyhaven.com/a/machine_shop_02) | 금속에 비치는 공장 조명 | HDRI를 반사광에 활용. 배경 사진을 우리 설비 사진으로 소개하지 않음 |
| [ambientCG Metal 009](https://ambientcg.com/view?id=Metal009) | 롤러·금속 면 재질 | 위 재질과 비교해 필요한 것만 선택 |
| [Kenney Factory Kit](https://kenney.nl/assets/factory-kit) | 주변 컨베이어·빠른 배치 시안 | 단순한 외형이므로 소둔로 본체에는 사용하지 않음 |

사용 조건: [Poly Haven 자산 라이선스](https://polyhaven.com/license), [ambientCG 라이선스](https://docs.ambientcg.com/license/), [Kenney 사용 안내](https://kenney.nl/support). CC0 자산이어도 출처 URL·제작자·받은 파일·변경 내역은 기록한다. 고해상도 묶음을 통째 배포하지 않고 필요한 부품과 낮은 해상도의 재질부터 사용한다.

**완성된 연속 소둔로 전체를 수정·재배포할 수 있는 모델은 이번 조사에서 확보하지 못했다.** [NCCM의 연속 소둔로 3D 뷰어](https://nccmco.com/pages/NCCM_Lines.html), [ANDRITZ 공정 자료](https://www.andritz.com/products-en/metals/furnaces/continuous-strip-processing/annealing-line-furnaces), [SMS 설비 자료](https://www.sms-group.com/en-us/plants/annealing-and-galvanizing-lines-for-steel)는 구조 참고용이다. 공개 뷰어의 내부 파일을 우리 자산으로 복사하지 않는다.

## 5. 데이터·시계열·감지 후보

| 후보 | 라이선스 | 가져올 수 있는 것 | 이번 선택 |
| --- | --- | --- | --- |
| [pandas](https://github.com/pandas-dev/pandas) · [NumPy](https://github.com/numpy/numpy) | BSD-3-Clause | CSV 분할 읽기, 날짜·채널 처리, 기존 계산 | **추천.** 기존 값이 재현되는 버전 사용 |
| [SciPy](https://github.com/scipy/scipy) | BSD-3-Clause | 통계 함수·Z-score 대조 | **필요할 때만.** 기존 계산을 함수 하나로 바꿔 결과를 바꾸지 않음 |
| [Apache ECharts](https://github.com/apache/echarts) | Apache-2.0 | 일별·월별 집계, 확대, 화면 전환 | **집계 화면에 추천.** 채널 그래프 전체 교체는 보류 |
| [uPlot](https://github.com/leeoniya/uPlot) | MIT | 가벼운 Canvas 시계열·확대·커서 | **성능 문제가 남을 때 비교.** 기본 애니메이션이 없고 기존 구간 표시를 다시 연결해야 함 |
| [Plotly.js](https://github.com/plotly/plotly.js) | MIT | 선택·확대·내보내기·SVG/WebGL 차트 | **분석 화면 대안.** 22개 개별 WebGL 차트와 3D를 함께 기본 구성으로 두지 않음 |
| [PyOD](https://github.com/yzhao062/pyod) | BSD-2-Clause | 여러 이상 탐지기의 공통 사용 방식 | **후속 모델 실험.** 이번 Z-score 연결에 새 탐지기 학습을 섞지 않음 |
| [River](https://github.com/online-ml/river) | BSD-3-Clause | 관측값별 온라인 학습·통계 | **후속.** CSV 재생 중 기준을 계속 바꾸는 용도로 쓰지 않음 |
| [PostgreSQL](https://www.postgresql.org/about/licence/) | PostgreSQL License | 저장·인덱스·트랜잭션·대량 적재 | **추천.** 실제 기간 조회를 측정하고 인덱스·일별 집계부터 적용 |
| [TimescaleDB](https://github.com/timescale/timescaledb) | [Apache-2.0 부분과 Timescale License 부분 혼합](https://github.com/timescale/timescaledb/blob/main/LICENSE) | 시간별 분할·압축·지속 집계 | **장기 수집 후속.** 처음부터 필수 확장으로 추가하지 않음 |
| [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python) | MIT. API 서비스 조건·요금은 별도 | Claude 호출·응답 처리 | **추천.** 별도 AI 에이전트 프레임워크 없이 설명 버튼 하나부터 |

### 차트와 모핑의 역할을 나눔

기존 SVG에는 같은 시간축, 노란 선택 구간, `LABEL=1` 띠, 존별 계단식 창이 연결되어 있다. 새 차트의 기본 확대 기능만 켜서는 이 연결이 따라오지 않는다. 기존 화면을 가져와 `선택한 채널 / 선택한 구간 / 화면에 보이는 구간 / 재생 시각`을 3D와 공유한다.

연간 집계는 ECharts에 맡긴다. 패널·목록 전환은 Motion, 카메라 이동은 Drei가 담당한다. 관측 공백을 부드럽게 잇거나, 실제 값 사이에 임의의 값을 만들어 모핑하지 않는다. [ECharts 전환](https://echarts.apache.org/handbook/en/how-to/animation/transition/), [uPlot 제공 범위](https://github.com/leeoniya/uPlot#non-features), [Plotly WebGL 제약](https://plotly.com/python/performance/)

### 기존 Z-score를 그대로 연결

SciPy `zscore`의 기본 표준편차 계산은 `ddof=0`, pandas `std`는 `ddof=1`이다. 결측 기본 처리도 다르다. 강종·채널 묶음, 기준 구간, 집계 방식, `ddof`, 0·결측 처리와 경계 포함 여부를 명시해서 기존 결과와 대조한다. 화면을 확대할 때마다 평균·표준편차를 다시 계산하지 않는다. [SciPy 문서](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.zscore.html), [pandas 문서](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.std.html)

## 6. 실제 설비 데이터 연결용 후보

| 후보 | 라이선스 | 역할 | 넣을 시점 |
| --- | --- | --- | --- |
| [Node-RED](https://github.com/node-red/node-red) | Apache-2.0 | 여러 수집원을 시각적으로 연결·변환 | 실제 수집 경로가 여러 개 필요할 때 |
| [Paho MQTT](https://github.com/eclipse-paho/paho.mqtt.python) | EPL-2.0 또는 EDL-1.0 | MQTT의 채널 메시지 구독 | 브로커·topic·접속 권한이 정해지면 |
| [asyncua](https://github.com/FreeOpcUa/opcua-asyncio) | LGPL-3.0 | OPC UA 값·시각·품질 구독 | 서버·node ID·인증서·읽기 권한이 정해지면 |
| [Fledge](https://github.com/fledge-iot/fledge) | Apache-2.0 | 현장 수집·버퍼링·상위 전달 | Linux 수집 장비와 운영 필요가 생기면 |

지금은 서버의 지정된 CSV를 pandas `chunksize`로 읽고, 원자료 시각 차이와 재생 배속에 맞춰 재생한다. 실제 수집 규격이 생기면 위 도구 중 필요한 어댑터 하나를 같은 입력 형식에 연결한다. 계측값 조회와 수집만 다루며 설비 제어 명령은 추가하지 않는다.

파일의 원래 시각, 서버가 받은 시각, 재생 실행 ID를 구분한다. 같은 `run_id`에서 일시정지 후 계속하거나 실패한 처리를 다시 해도 중복 입력·중복 알림이 없어야 한다. 되감아 새로 분석하는 경우는 새 `run_id`로 구분한다. [pandas 분할 읽기](https://pandas.pydata.org/docs/reference/api/pandas.read_csv.html), [Node-RED 연결 예제](https://cookbook.nodered.org/)

## 7. 업무·알림·화면 부품 후보

| 후보 | 라이선스·제공 기능 | 이번 선택 |
| --- | --- | --- |
| [Django](https://github.com/django/django) · [DRF](https://github.com/encode/django-rest-framework) | BSD-3-Clause. 사용자·세션·그룹·API·관리 화면 | **추천.** 업무의 담당자 조건·변경 이력·알림 저장은 추가 구현 |
| [Radix Primitives](https://github.com/radix-ui/primitives) | MIT. 모달·탭·토글·메뉴, 초점·키보드 조작 | **추천.** 모달을 매번 직접 만들지 않고 우리 화면에 필요한 스타일 적용 |
| [shadcn/ui](https://github.com/shadcn-ui/ui) | MIT. 수정해서 사용하는 개별 UI 코드 | **선택.** 필요한 Radix 기반 컴포넌트를 가져오는 방법. 완성 대시보드의 둥근 카드 모양을 그대로 쓰지 않음 |
| [TanStack Query](https://github.com/TanStack/query) | MIT. 서버 조회·캐시·폴링·저장 후 갱신 | **추천.** 알림 2초 조회와 변경 후 목록 갱신. 영구 저장은 PostgreSQL이 담당 |
| [Zustand](https://github.com/pmndrs/zustand) | MIT. 화면 간 상태 공유 | **선택.** 기존 Context로 충분하면 생략. 채널·구간·카메라 선택 공유에 한정 |
| [dnd-kit](https://github.com/clauderic/dnd-kit) | MIT. 마우스·키보드 드래그 | **후속.** 기존 드래그로 부족할 때 사용. 이번 범위에 스냅샷 폴더 전체 이전을 다시 추가하지 않음 |
| [FullCalendar Standard](https://fullcalendar.io/license) | MIT. 월·주·일 일정 | **추천.** 계획·실제·할 일 표시. Resource Timeline 같은 Premium 기능과 구분 |
| [react-admin](https://github.com/marmelab/react-admin) | 코어 MIT. 관리 목록·검색·등록·수정. 일부 실시간·이력 패키지는 유료 | **보류.** 일반 관리는 Django Admin을 사용하고 3D 중심 화면은 기존 React 유지 |
| [Refine](https://github.com/refinedev/refine) | 코어 MIT. 데이터 조회·인증·권한·관리 화면 연결. Enterprise 별도 | **보류.** 기존 화면을 다른 관리 앱 구조에 다시 맞추는 비용이 생김 |
| [Novu](https://github.com/novuhq/novu) | MIT 코어와 Enterprise 코드 구분. 알림함·여러 전달 경로 | **후속.** 여러 외부 알림 채널이 필요할 때 검토. 지금은 추가 서버·저장소 운영 부담이 큼 |
| [ntfy](https://github.com/binwiederhier/ntfy) | Apache-2.0 또는 GPLv2. HTTP로 브라우저·휴대폰 알림 | **후속.** 앱을 닫아도 휴대폰 알림이 필요할 때. 작업 이력의 저장소로 사용하지 않음 |
| [Plane Community](https://github.com/makeplane/plane) | AGPL-3.0. 업무·담당자·상태·댓글 | **참고.** 작업 관리 흐름은 유용하지만 우리 채널·3D와 별도 연동 필요 |
| [OpenProject Community](https://github.com/opf/openproject) | GPL-3.0. 일정·업무·Gantt·댓글. Enterprise 별도 | **참고.** 작은 현장 요청 기능 때문에 플랫폼 전체를 추가하지 않음 |
| [Frappe](https://github.com/frappe/frappe) · [ERPNext](https://github.com/frappe/erpnext) | Frappe MIT, ERPNext GPL-3.0. 역할·업무 단계·승인·배정 | **참고.** 제출·확인·다시 요청을 나누는 흐름을 참고. Django 기반을 ERP 플랫폼으로 교체하지 않음 |

Radix는 스타일을 강제하지 않아 산업용 화면의 간격·색·모서리를 직접 정할 수 있다. shadcn을 쓰더라도 필요한 부품만 수정해서 사용한다. 모달의 키보드 조작과 초점 복귀는 유지한다. [Radix 제공 기능](https://www.radix-ui.com/primitives/docs/overview/introduction), [shadcn 사용 방식](https://ui.shadcn.com/docs)

TanStack Query는 알림을 조회하는 코드를 줄여준다. 놓친 알림을 복구하려면 우리 API가 마지막 조회 위치 이후의 기록을 다시 제공해야 한다. 캐시나 잠깐 뜨는 토스트를 판단 저장으로 취급하지 않는다. [폴링 기능](https://tanstack.com/query/latest/docs/framework/react/guides/polling)

### 기능 이름이 같아도 무료 범위와 설치 방식이 다름

- **FullCalendar:** Standard는 MIT. v7 Premium은 상용·별도 비상업 조건·AGPLv3 선택지가 있으므로 기본 달력과 섞지 않는다. 이번에는 Standard만 사용한다. [라이선스](https://fullcalendar.io/license)
- **Motion:** 기본 `layout`·`layoutId`로 필요한 전환을 만들 수 있다. Motion+ 전용 예제와 기능을 무료 코어로 착각하지 않는다. [기본 전환](https://motion.dev/docs/react-layout-animations)
- **react-admin:** 공동 편집·잠금이나 변경 이력이 모두 무료 코어에 들어 있는 것은 아니다. [실시간 패키지](https://ra-enterprise.marmelab.com/documentation/ra-realtime), [변경 이력 패키지](https://registry.marmelab.com/documentation/ra-audit-log)
- **Plane:** Community 저장소와 Commercial 설치 안내를 구분한다. 기본 설치 명령을 복사하기 전에 판을 확인해야 한다. [판 구분](https://developers.plane.so/self-hosting/editions-and-versions)
- **ntfy:** 일반 ntfy iOS 앱의 즉시 알림에는 APNs/Firebase와 연결된 상위 서버가 필요하다. 완전히 로컬에서 끝나는 알림 기능으로 소개하지 않는다. [서버 설정](https://docs.ntfy.sh/config/#ios-instant-notifications)

FullCalendar의 [v7 변경점](https://fullcalendar.io/docs/upgrading-from-v6)과 dnd-kit의 [새 React 패키지](https://dndkit.com/react/quickstart/)도 확인한다. 이전 예제와 새 패키지 이름·API를 섞지 않는다. 새 도구를 채택했다는 이유로 이미 동작하는 드래그 코드를 일괄 교체하지 않는다.

## 8. 개발 시작 시 확인할 순서

아래는 조사 이후의 검증 계획이다. 지금 통과했다는 뜻은 아니다.

1. **새 모형 한 구역을 실제 화면에서 연결.** 존 선택·내부 보기·채널 목록·실제 그래프가 이어지는지 확인한다.
2. **기존 그래프를 서버 조회로 연결.** 같은 시각의 값·노란 구간·LABEL 위치를 대조한다. 원자료 전체를 브라우저에 매번 보내지 않는다.
3. **두 계정으로 업무 한 건 완료.** 요청·수락·결과·확인과 알림을 저장하고 서버 재시작 뒤 다시 연다.
4. **달력·연간·Claude를 얹음.** 새로운 데이터 기준을 만들지 않고 같은 DB의 기록을 보여준다.
5. **발표 PC에서 검증.** 3D 회전 중 그래프 선택, 창 크기 변경, 라이트·다크, 연결 복구를 확인한다.

모형의 재질과 주변 부품 조립은 서버 개발과 병렬로 진행한다. 3일차에 기능과 모형 구조를 고정하고, 4일차에는 결함 수정과 시연 검증을 한다. 후보를 많이 찾았다는 이유로 모두 설치하지 않는다.

## 9. 가져오는 코드·자산을 남기는 방식

- 패키지는 안정판의 호환 조합을 고정하고 버전 잠금 파일을 커밋한다.
- 복사한 예제는 출처·원본 버전·라이선스·수정 내용을 남긴다.
- 모델·재질은 코드와 별도로 출처를 남긴다. 엔진이 MIT라는 이유로 예제 모델까지 같은 조건으로 보지 않는다.
- 완성형 플랫폼의 AGPL·GPL이나 별도 상용 조건은 제품별로 확인한다. 공개 GitHub 저장소와 제한 없는 사용 허가는 같은 뜻이 아니다.
- 이번 저장소에 선택하지 않은 제품의 소스를 한꺼번에 복사하지 않는다.
