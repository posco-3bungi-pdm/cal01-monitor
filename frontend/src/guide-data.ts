export type GuideStep = {
  id: string
  title: string
  body: string
  channel?: string
  check: string
  kind?: 'equipment' | 'reading' | 'practice'
}

// Sources checked without changing the source files:
// _agent/annealing_3d/keynote/annealing_morph_precision.pptx:
// presentation pages 12–20 (process), 35 (review order), 50–53 (058/061), 68 (zero/missing).
// 데이터사전/데이터사전_T-CR1-CAL01_온도.md: sections 2–4.
// 058 shutdown / 061 restart: explicit team decision supplied by the user.
// Zone names and temperature/output units follow the educational dataset's
// assumptions; they do not establish the original equipment's physical layout.
export const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'annealing-purpose',
    kind: 'equipment',
    title: '소둔의 목적',
    body: '소둔은 강판을 가열하고 필요한 시간 동안 유지한 뒤, 제품에 맞는 조건으로 냉각하는 열처리다. 냉간압연으로 단단해진 강판의 연성을 회복하거나, 필요한 강도와 성형성을 얻도록 조직을 조정한다. 모든 강종을 부드럽게 만드는 공정은 아니다. 목적과 조건은 강종·제품에 따라 달라진다.',
    check: '강종과 제품 목적을 먼저 확인한다. 강종 미기록이면 해당 조건을 확인하기 전까지 판단을 보류한다.',
  },
  {
    id: 'process-flow',
    kind: 'equipment',
    title: '강판이 설비를 통과하는 순서',
    body: '연속소둔라인은 띠 형태의 강판을 이동시키며 처리한다. 일반적으로 코일 풀기·용접·세정·열처리·검사·권취를 포함한다. 이 화면은 제공 데이터의 구역을 세정 입측 → 건조 → 가열·균열 → 과시효 관련 → 냉각 순으로 설명한 개념도다. 실제 냉각·재가열·유지 순서는 제품과 설비에 따라 달라진다.',
    check: '전체 보기에서 공정 흐름을 확인한다. 강판 이동 애니메이션과 부품 위치는 설명용이며 실제 위치·속도 추적 정보가 아니다.',
  },
  {
    id: 'cleaning-and-drying',
    kind: 'equipment',
    title: '세정 입측과 건조 구역',
    body: 'CLN-IN은 세정조 입측 온도 태그다. Z1~Z2는 세정 후 건조 구역이며 TC-Z1·TC-Z2와 OP-Z1·OP-Z2가 연결된다. 세정 입측 값과 건조 구역 값은 측정 구역이 다르다. LOT별 그래프의 차이가 강종 때문에 생겼다고 단정하지 않는다.',
    channel: 'CLN-IN',
    check: 'CLN-IN과 TC-Z1을 차례로 선택한다. 채널 이름·단위·실제 관측 시각을 확인한다.',
  },
  {
    id: 'heating-and-soaking',
    kind: 'equipment',
    title: '가열·균열 구역 Z3~Z6',
    body: '강판을 가열하고 필요한 열처리 조건을 확보하는 구역이다. 균열(均熱)은 온도를 고르게 한다는 뜻이다. TC-Z3~Z6와 OP-Z3~Z6가 연결된다. 구역 번호만으로 가열과 유지의 세부 경계를 확정할 수 없다. TC의 측정 대상도 확인이 필요하므로 강판 표면온도로 단정하지 않는다.',
    channel: 'TC-Z3',
    check: '같은 구역의 TC와 OP를 같은 시간축에서 비교한다. 강종·LOT·설정 변경 기록을 함께 확인한다. 가로축은 원자료 시각이며 시간대는 미확인이다.',
  },
  {
    id: 'radiant-tube-heating',
    kind: 'equipment',
    title: '버너와 래디언트 튜브',
    body: '복사관 방식에서는 버너의 불꽃과 연소가스가 래디언트 튜브(열을 전달하는 관) 안을 지난다. 달궈진 관이 강판을 가열하므로 불꽃이 강판에 직접 닿지 않는다. 송풍기는 연소용 공기를 공급하고, 열회수 장치는 뜨거운 배기로 공급 공기를 예열한다. 단열층은 열손실을 줄인다. 제조사 자료를 참고한 설명 모형이다.',
    channel: 'TC-Z3',
    check: '3D 도구 → 내부 보기에서 버너와 관의 관계를 확인한다. OP는 제어 출력이며 실제 화염 크기·가스 유량·에너지 사용량이 아니다.',
  },
  {
    id: 'overaging-and-cooling',
    kind: 'equipment',
    title: '과시효 관련 구역과 냉각 구역',
    body: 'Z7~Z9는 제품에 따라 용질 탄소와 석출 상태 등을 조정하는 과시효 관련 구역으로 설명한다. TC-Z7~Z9와 OP-Z7~Z8이 연결되며 OP-Z9는 데이터에 없다. TC-Z9의 세부 역할과 설치 위치는 추가 확인이 필요하다. OUT은 후속 공정에 필요한 상태로 냉각하는 구역이며 TC-OUT1·TC-OUT2가 연결된다.',
    channel: 'TC-Z7',
    check: 'TC-Z7과 TC-OUT1의 구역·시각을 구분한다. 관측 평균을 목표 온도나 정상 범위로 사용하지 않는다.',
  },
  {
    id: 'channel-values',
    kind: 'reading',
    title: 'TC·OP·CP 값 읽기',
    body: 'TC는 온도 계열, OP는 제어 출력 태그다. TC와 OP는 피드백 제어로 연결되므로 TC가 일정해도 OP는 변할 수 있다. 출력 변경 후 온도 반응까지 시간이 걸릴 수도 있다. 소재·운전 조건도 OP에 영향을 준다. 두 값이 함께 변한 사실만으로 고장 원인을 확정할 수 없다. CP-Z4·CP-Z4M의 단위는 미확인이다. e^-10은 숫자의 크기를 나타내는 지수 표기다.',
    channel: 'OP-Z3',
    check: 'OP의 0과 결측을 구분한다. 작은 CP 값을 0으로 읽지 않는다. 3D의 마지막 관측값과 그래프의 집계 평균은 다를 수 있으므로 관측 시각·집계 간격을 확인한다. °C와 %는 프로젝트 단위 가정이다.',
  },
  {
    id: 'planned-stop-and-restart',
    kind: 'reading',
    title: '058 정지·061 재가동 기록',
    body: '팀은 LOT 240058의 온도 하강을 정기수리 전 정지로, LOT 240061의 온도 상승을 정기수리 후 재가동으로 판단했다. 이 판단은 해당 두 LOT에 한정된다. 정지·재가동 상태, 고장 여부, 학습 제외 여부는 서로 다른 항목이다.',
    channel: 'TC-Z3',
    check: '선택 중인 LOT를 확인한다. 058·061의 판단을 다른 LOT에 적용하지 않는다.',
  },
  {
    id: 'review-practice',
    kind: 'practice',
    title: '연습 상황: 온도가 갑자기 낮아졌다면',
    body: '먼저 해당 시각의 실제 관측값과 관측 공백을 확인한다. 값이 있으면 같은 구역의 TC·OP와 강종·LOT, 앞뒤 조업·정비 기록을 비교한다. 정지·재가동·설정 변경으로 설명되는지 검토하고, 원인이 불분명하면 확인할 내용과 구간을 적어 점검을 요청한다. 과거 자료의 이상 후보는 현재 설비의 고장 확정이나 정지 지시가 아니다.',
    channel: 'TC-Z3',
    check: '채널·발생 구간·관측한 변화·추가 확인할 조건을 정리한다. 실제 후보의 「대응 가이드」에서 확인 순서를 볼 수 있다. 이 연습은 알림이나 요청으로 저장되지 않는다.',
  },
]
