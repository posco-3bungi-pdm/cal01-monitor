export type GuideStep = {
  id: string
  title: string
  body: string
  channel?: string
  check: string
  kind?: 'equipment' | 'reading' | 'practice'
  category?: 'process' | 'measurements' | 'maintenance' | 'equipment' | 'practice'
  sections?: { title: string; body: string }[]
  pattern?: 'stop-restart'
  practice?: { question: string; options: { label: string; correct: boolean; feedback: string }[] }
  sources?: { title: string; url: string }[]
}

export const GUIDE_CATEGORIES = [
  { id: 'process', label: '공정 흐름' }, { id: 'measurements', label: 'TC·OP·CP' },
  { id: 'maintenance', label: '정비 구분' }, { id: 'practice', label: '설명용 연습' },
  { id: 'equipment', label: '장치 사전' },
] as const
const processSources = [{ title: 'JFE 재단 · 연속소둔 공정', url: 'https://www.jfe-21st-cf.or.jp/chapter_3/3c_5.html' },
  { title: 'Eurotherm · 연속소둔 온도 제어', url: 'https://www.eurotherm.com/in/temperature-control-applications-in/continuous-annealing-and-galvanizing-lines/' }]

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
    sources: processSources,
  },
  {
    id: 'process-flow',
    kind: 'equipment',
    title: '강판이 설비를 통과하는 순서',
    body: '연속소둔라인은 띠 형태의 강판을 이동시키며 처리한다. 일반적으로 코일 풀기·용접·세정·열처리·검사·권취를 포함한다. 이 화면은 제공 데이터의 구역을 세정 입측 → 건조 → 가열·균열 → 과시효 관련 → 냉각 순으로 설명한 개념도다. 실제 냉각·재가열·유지 순서는 제품과 설비에 따라 달라진다.',
    check: '전체 보기에서 공정 흐름을 확인한다. 강판 이동 애니메이션과 부품 위치는 설명용이며 실제 위치·속도 추적 정보가 아니다.',
    sections: [
      { title: '라인의 큰 흐름', body: '코일 풀기 → 용접으로 강판 연결 → 세정 → 가열·균열 → 제품별 냉각·과시효 → 검사·권취. 연속소둔로에서는 이어진 강판이 멈추지 않고 열처리 구간을 통과한다.' },
      { title: '화면의 구역 순서', body: 'CLN-IN → Z1 → Z2 → Z3 → Z4 → Z5 → Z6 → Z7 → Z8 → Z9 → OUT. CP는 Z4에서 읽는 별도 계측이며 강판이 다음에 통과하는 구역이 아니다.' },
    ],
    sources: processSources,
  },
  {
    id: 'cleaning-and-drying',
    kind: 'equipment',
    title: '세정 입측과 건조 구역',
    body: 'CLN-IN은 세정조 입측 온도 태그다. Z1~Z2는 세정 후 건조 구역이며 TC-Z1·TC-Z2와 OP-Z1·OP-Z2가 연결된다. 세정 입측 값과 건조 구역 값은 측정 구역이 다르다. LOT별 그래프의 차이가 강종 때문에 생겼다고 단정하지 않는다.',
    channel: 'CLN-IN',
    check: 'CLN-IN과 TC-Z1을 차례로 선택한다. 채널 이름·단위·실제 관측 시각을 확인한다.',
    sections: [
      { title: 'CLN-IN · 세정 입측', body: '압연유와 오염을 제거하는 세정은 후속 열처리와 표면 품질을 위한 준비다. 화면 값은 세정조 입측 태그이며 세정 결과나 강판 표면 온도를 직접 측정한 값은 아니다. 값의 추세·관측 공백과 실제 세정 조건을 함께 본다.' },
      { title: 'Z1 · 건조 구역', body: '세정 후 남은 수분을 제거하는 구역으로 설명한다. TC-Z1의 변화와 OP-Z1의 대응을 함께 본다. OP 변화만으로 건조 불량을 확정하지 않는다.' },
      { title: 'Z2 · 건조 구역', body: 'TC-Z2·OP-Z2를 Z1과 같은 시간축에서 비교한다. 갑작스러운 변화가 공통 운전 변경인지 한 채널의 현상인지 구분한다. Z1·Z2의 세부 장치와 건조 완료 기준은 현장 정의를 따른다.' },
    ],
  },
  {
    id: 'heating-and-soaking',
    kind: 'equipment',
    title: '가열·균열 구역 Z3~Z6',
    body: '강판을 가열하고 필요한 열처리 조건을 확보하는 구역이다. 균열(均熱)은 온도를 고르게 한다는 뜻이다. TC-Z3~Z6와 OP-Z3~Z6가 연결된다. 구역 번호만으로 가열과 유지의 세부 경계를 확정할 수 없다. TC의 측정 대상도 확인이 필요하므로 강판 표면온도로 단정하지 않는다.',
    channel: 'TC-Z3',
    check: '같은 구역의 TC와 OP를 같은 시간축에서 비교한다. 강종·LOT·설정 변경 기록을 함께 확인한다. 가로축은 원자료 시각이며 시간대는 미확인이다.',
    sections: ['Z3', 'Z4', 'Z5', 'Z6'].map(zone => ({ title: `${zone} · 가열·균열`, body: `${zone}의 TC는 온도 변화, OP는 제어가 얼마나 대응하는지 읽는다. 열 이력은 조직과 강도·성형성에 영향을 준다. 다른 존과 동시 변화인지, 출력 변경 뒤 온도가 어떻게 따라오는지 본다.${zone === 'Z4' ? ' Z4의 CP는 온도·출력과 분리해 확인한다.' : ''} 구역 번호만으로 목표 온도나 개별 존의 가열·유지 경계를 정하지 않는다.` })),
    sources: processSources,
  },
  {
    id: 'radiant-tube-heating',
    category: 'equipment',
    kind: 'equipment',
    title: '버너와 래디언트 튜브',
    body: '복사관 방식에서는 버너의 불꽃과 연소가스가 래디언트 튜브(열을 전달하는 관) 안을 지난다. 달궈진 관이 강판을 가열하므로 불꽃이 강판에 직접 닿지 않는다. 송풍기는 연소용 공기를 공급하고, 열회수 장치는 뜨거운 배기로 공급 공기를 예열한다. 단열층은 열손실을 줄인다. 제조사 자료를 참고한 설명 모형이다.',
    channel: 'TC-Z3',
    check: '상단 내부 보기 또는 화면 설정 → 장비·부품 보기에서 버너와 관의 관계를 확인한다. OP는 제어 출력이며 실제 화염 크기·가스 유량·에너지 사용량이 아니다.',
    sections: [
      { title: '버너와 복사관은 역할이 다르다', body: '버너는 연료와 공기로 열을 만들고, 래디언트 튜브는 그 열을 강판에 전달한다. 가열 방식과 노내 분위기를 함께 이해해야 한다.' },
      { title: '값으로 볼 수 있는 범위', body: 'TC와 OP는 상태를 살피는 단서다. 튜브 파손·화염 불량·누설 여부는 이 두 값만으로 확정하지 않는다. 현장 점검과 해당 장치의 운전 기준으로 확인한다.' },
    ],
    sources: [{ title: 'JFE 기술보고서 · 소둔로 래디언트 튜브 버너', url: 'https://www.jfe-steel.co.jp/en/research/report/032/pdf/032-09.pdf' }],
  },
  {
    id: 'overaging-and-cooling',
    kind: 'equipment',
    title: '과시효 관련 구역과 냉각 구역',
    body: 'Z7~Z9는 제품에 따라 용질 탄소와 석출 상태 등을 조정하는 과시효 관련 구역으로 설명한다. TC-Z7~Z9와 OP-Z7~Z8이 연결되며 OP-Z9는 데이터에 없다. TC-Z9의 세부 역할과 설치 위치는 추가 확인이 필요하다. OUT은 후속 공정에 필요한 상태로 냉각하는 구역이며 TC-OUT1·TC-OUT2가 연결된다.',
    channel: 'TC-Z7',
    check: 'TC-Z7과 TC-OUT1의 구역·시각을 구분한다. 관측 평균을 목표 온도나 정상 범위로 사용하지 않는다.',
    sections: [
      { title: 'Z7 · 과시효 관련', body: '과시효는 용질 탄소의 석출 등을 조정해 제품의 시효 거동과 성형 특성을 관리하는 과정이다. TC-Z7·OP-Z7의 추세와 앞선 가열 구간의 변화를 함께 본다.' },
      { title: 'Z8 · 과시효 관련', body: 'TC-Z8·OP-Z8을 Z7과 나란히 본다. 같은 온도라도 강종·열 이력·체류 시간이 다르면 결과가 달라질 수 있다. 화면에는 실제 체류 시간과 제품별 관리 기준이 없다.' },
      { title: 'Z9 · 출측 관련 온도', body: 'TC-Z9만 제공되고 OP-Z9는 없다. 냉각으로 이어지는 온도 추세를 확인하되, 이 존의 세부 역할과 측정 위치는 현장 확인이 필요하다.' },
    ],
    sources: processSources,
  },
  {
    id: 'delivery-cooling', kind: 'equipment', title: 'OUT · 냉각과 출측', channel: 'TC-OUT1',
    body: '열처리 뒤의 냉각 이력도 제품 특성에 영향을 준다. 이 화면의 OUT은 출측 냉각 구역을 나타낸다. TC-OUT1·TC-OUT2는 서로 다른 두 관측값이며 하나의 코일 표면 온도로 합쳐 읽지 않는다.',
    check: '두 출측 값의 추세·측정 시각·결측 여부를 각각 확인한다. 앞선 구역과 함께 변했는지 본다. 출측 목표값과 허용 차이는 현장 제품·운전 기준으로 확인한다.',
    sources: processSources,
  },
  {
    id: 'channel-values',
    category: 'measurements',
    kind: 'reading',
    title: 'TC·OP를 함께 읽는 방법',
    body: 'TC는 온도 계열, OP는 제어 출력 태그다. TC와 OP는 피드백 제어로 연결되므로 TC가 일정해도 OP는 변할 수 있다. 출력 변경 후 온도 반응까지 시간이 걸릴 수도 있다. 소재·운전 조건도 OP에 영향을 준다. 두 값이 함께 변한 사실만으로 고장 원인을 확정할 수 없다.',
    channel: 'OP-Z3',
    check: 'OP의 0과 결측을 구분한다. 작은 CP 값을 0으로 읽지 않는다. 3D의 마지막 관측값과 그래프의 집계 평균은 다를 수 있으므로 관측 시각·집계 간격을 확인한다. °C와 %는 프로젝트 단위 가정이다.',
    sections: [
      { title: 'TC · 온도 계열', body: '숫자 하나보다 상승·하강 속도, 지속 시간, 이웃 존과의 차이를 읽는다. 측정 대상이 노내인지 강판인지 먼저 확인한다. 평균 ±3σ 점선은 이번 LOT의 통계 비교선이며 운전 허용 한계가 아니다.' },
      { title: 'OP · 제어 출력', body: '0%는 기록된 값일 수 있고, —는 관측값이 없는 상태다. 출력 변화 뒤 온도가 늦게 반응할 수 있다. 설정값·속도·강종·운전 모드가 없으면 원인을 확정하지 않는다.' },
    ],
    sources: processSources,
  },
  {
    id: 'carbon-potential', kind: 'reading', category: 'measurements', title: 'CP · Carbon Potential 읽기', channel: 'CP-Z4',
    body: '탄소 포텐셜은 노내 분위기가 강재 표면과 탄소를 주고받는 성향을 나타낸다. 온도와 분위기 조성을 함께 고려한다. 강재의 현재 탄소 함량을 직접 보여주는 숫자는 아니다.',
    check: 'CP-Z4는 무차원, CP-Z4M의 e⁻¹⁰은 ×10⁻¹⁰ 배율이다. 1.146 e⁻¹⁰을 1.146이나 0으로 읽지 않는다. CP의 알림은 Z4의 온도·출력 알림과 별도로 확인한다.',
    sections: [{ title: '어떤 변화를 확인하나', body: 'CP 값과 관측 시각, Z4 온도와의 동시 변화, 분위기·설정 변경 기록을 비교한다. 두 CP 채널의 환산식과 관리 범위가 제공되지 않아 임의의 정상 한계를 만들지 않는다.' }],
    sources: [{ title: 'Eurotherm · Carbon Potential 기술 안내', url: 'https://www.eurotherm.com/?wpdmdl=28121' }],
  },
  {
    id: 'planned-stop-and-restart',
    category: 'maintenance',
    kind: 'reading',
    title: '정비 정지·재가동과 이상 구분',
    body: '팀은 LOT 240058의 온도 하강을 정기수리 전 정지로, LOT 240061의 온도 상승을 정기수리 후 재가동으로 판단했다. 이 판단은 해당 두 LOT에 한정된다. 정지·재가동 상태, 고장 여부, 학습 제외 여부는 서로 다른 항목이다.',
    channel: 'TC-Z3',
    check: '정비 일정·실제 정지/재가동 기록·발생 시각·TC와 OP의 양상이 함께 일치할 때 계획된 운전 변화로 설명한다. 그래프 모양만 같다는 이유로 정상 처리하지 않는다. 058·061의 팀 판단을 다른 LOT에 적용하지 않는다.',
    pattern: 'stop-restart',
    sections: [
      { title: '예정된 정지에서 볼 수 있는 양상', body: '출력이 먼저 낮아지고 온도가 서서히 내려갈 수 있다. 확인된 정비 정지와 시각·지속 구간이 일치하면 그 하강 자체를 고장 증거로 삼지 않는다.' },
      { title: '재가동에서 볼 수 있는 양상', body: '출력이 올라간 뒤 온도가 따라 상승하며 안정화될 수 있다. 재가동 기록과 해당 설비의 기준을 확인한다. 상승·출력 변화만으로 이상을 단정하지 않는다.' },
      { title: '그대로 넘기면 안 되는 경우', body: '정비 기록이 없거나, 기록된 구간 밖에서도 변화가 지속되거나, 한 존만 다른 추세를 보이면 추가 확인한다. 0·결측·센서 이상과 실제 온도 하강도 구분한다. 이 앱은 정비 구간을 자동으로 정상 처리하거나 경보에서 제외하지 않는다.' },
    ],
  },
  {
    id: 'review-practice',
    category: 'practice',
    kind: 'practice',
    title: '연습 상황: 온도가 갑자기 낮아졌다면',
    body: '먼저 해당 시각의 실제 관측값과 관측 공백을 확인한다. 값이 있으면 같은 구역의 TC·OP와 강종·LOT, 앞뒤 조업·정비 기록을 비교한다. 정지·재가동·설정 변경으로 설명되는지 검토하고, 원인이 불분명하면 확인할 내용과 구간을 적어 점검을 요청한다. 과거 자료의 이상 후보는 현재 설비의 고장 확정이나 정지 지시가 아니다.',
    channel: 'TC-Z3',
    check: '채널·발생 구간·관측한 변화·추가 확인할 조건을 정리한다. 실제 후보의 「대응 가이드」에서 확인 순서를 볼 수 있다. 이 연습은 알림이나 요청으로 저장되지 않는다.',
    practice: { question: '정비 정지 기록과 시각이 일치하고 여러 존의 출력·온도가 함께 내려간다. 어떻게 읽을까?', options: [
      { label: '온도가 내려갔으니 바로 고장으로 확정한다', correct: false, feedback: '계획된 정지는 온도 하강으로 나타날 수 있다. 실제 정비 기록과 양상을 먼저 대조한다.' },
      { label: '계획된 정지에 따른 변화인지 기록과 대조한다', correct: true, feedback: '맞다. 정비 기록·구간·다른 채널이 함께 설명되면 이 하강 자체를 고장으로 보지 않는다. 구간 밖의 변화나 다른 징후는 별도로 확인한다.' },
      { label: '이런 모양의 경보를 앞으로 모두 숨긴다', correct: false, feedback: '같은 모양이어도 원인은 다를 수 있다. 다른 LOT와 시각에 정비 판단을 자동 적용하지 않는다.' },
    ] },
  },
  {
    id: 'missing-value-practice', kind: 'practice', category: 'practice', title: '연습 상황: 값이 사라졌다면', channel: 'OP-Z3',
    body: '설명용 상황이다. TC-Z3에는 —가 보이고 OP-Z3에는 0이 기록되어 있다. 이 둘은 같은 뜻이 아니다.',
    check: '관측 시각과 공백, 원자료를 먼저 확인한다. 실제 경보·요청이나 정비 이력은 생성하지 않는다.',
    practice: { question: '현재 화면으로 알 수 있는 것은?', options: [
      { label: '온도가 0°C이고 설비가 정지했다', correct: false, feedback: '—는 0°C가 아니다. 온도 관측값이 없는 상태에서 정지를 확정할 수 없다.' },
      { label: '온도는 관측 없음, 출력은 기록된 0이다', correct: true, feedback: '맞다. 데이터 공백과 실제 0을 구분하고, 마지막 기록 시각과 통신·운전 기록을 확인한다.' },
    ] },
  },
]
