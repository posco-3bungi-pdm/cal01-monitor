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
    id: 'process-flow',
    kind: 'equipment',
    title: '강판이 설비를 통과하는 순서',
    body: '입측에서 코일을 풀고, 세정·건조 → 가열·균열 → 과시효 → 냉각을 거쳐 출측에서 다시 감아요. 프로젝트 발표자료의 공정 순서예요. 이 3D는 흐름을 설명하는 모형이며, 길이와 채널 표시점은 실제 설비를 측정한 정보가 아니에요.',
    check: '전체 설비를 누른 뒤 내부 보기를 켜서, 롤러를 따라 이어지는 강판을 살펴보세요.',
  },
  {
    id: 'cleaning-and-drying',
    kind: 'equipment',
    title: '세정조와 건조존부터 구분해요',
    body: 'CLN-IN은 세정조 입측 온도이고, TC-Z1·TC-Z2는 건조존 온도예요. 데이터사전의 “강종에 반응하지 않는다”는 모든 LOT의 그래프가 같다는 뜻은 아니에요. 강종별 모양이 달라도 그 차이가 강종 때문에 생겼다고 바로 해석하지 않아요.',
    channel: 'CLN-IN',
    check: 'CLN-IN과 TC-Z1을 차례로 선택해, 채널 이름과 표시되는 위치가 어떻게 달라지는지 보세요.',
  },
  {
    id: 'heating-and-soaking',
    kind: 'equipment',
    title: 'Z3~Z6에서 온도를 올리고 유지해요',
    body: '가열은 온도를 올리는 단계이고, 균열은 온도를 유지하는 단계예요. 데이터사전은 Z3~Z6를 가열·균열 구역으로 묶어요. 어느 존까지 가열이고 어디부터 균열인지는 숫자만 보고 단정하지 않아요. 값을 비교할 때는 강종과 LOT도 함께 봐요.',
    channel: 'TC-Z3',
    check: '가로축은 원자료의 날짜·시각이며 LOT 시작 후 경과시간이 아니에요. 시간대는 미확인이에요. 강종·LOT와 함께 읽어 보세요.',
  },
  {
    id: 'radiant-tube-heating',
    kind: 'equipment',
    title: '버너가 관을 달구고, 관이 강판을 데워요',
    body: '버너는 외벽 밖에 있고, 불꽃과 연소가스는 노 안의 래디언트 튜브를 지나가요. 달궈진 관이 강판을 데우므로 불꽃이 강판에 직접 닿지 않아요. 송풍기는 연소용 공기를 보내고, 열회수 장치는 뜨거운 배기로 공급 공기를 예열해요. 단열층은 열이 밖으로 빠져나가는 것을 줄여요. 제조사 자료를 참고한 복사관 방식의 설명 모형이에요.',
    channel: 'TC-Z3',
    check: '3D 도구에서 내부 보기를 켜고 장비·부품 목록의 Z3 버너·래디언트 튜브를 고른 뒤 작업 보기를 누르세요. OP는 제어 출력이며 실제 화염 크기나 가스 유량을 뜻하지 않아요.',
  },
  {
    id: 'overaging-and-cooling',
    kind: 'equipment',
    title: '과시효와 냉각 채널은 서로 달라요',
    body: '프로젝트에서는 TC-Z7·TC-Z8과 OP-Z7·OP-Z8을 과시효 구역으로, TC-OUT1·TC-OUT2를 냉각 구역으로 봐요. TC-Z9는 사전에 별도 부위로 적혀 있지만 실제 역할과 부착 위치를 확인하지 못했으므로, Z7·Z8과 같은 역할이라고 단정하지 않고 따로 확인해요.',
    channel: 'TC-Z7',
    check: 'TC-Z7과 TC-OUT1은 서로 다른 구역의 온도예요. 이름과 온도 크기를 함께 읽어 보세요.',
  },
  {
    id: 'channel-values',
    kind: 'reading',
    title: 'TC는 온도, OP는 제어 출력이에요',
    body: 'TC는 온도값이고 OP는 제어 출력값이에요. OP 표시점은 별도 온도 센서의 위치를 뜻하지 않아요. ℃와 %는 프로젝트의 단위 가정이에요. OP의 0은 실제 출력값이며 빈칸이 아니에요. CP-Z4·CP-Z4M의 단위는 미확인이고, 아주 작은 CP-Z4M 값을 반올림해 0으로 읽으면 안 돼요.',
    channel: 'OP-Z3',
    check: '그래프가 평균으로 집계됐으면 3D의 원자료값과 다를 수 있어요. 3D는 선택 시각까지 기록된 마지막 관측값을 보여주므로 실제 관측 시각도 확인하세요.',
  },
  {
    id: 'planned-stop-and-restart',
    kind: 'reading',
    title: '058은 정지, 061은 재가동으로 판단했어요',
    body: '팀은 LOT 240058의 온도 하강을 정기수리를 위한 소둔로 정지로, LOT 240061의 온도 상승을 정기수리 후 재가동으로 확정했어요. 이 두 LOT의 팀 판단을 설명하는 단계예요. 정지·재가동이라는 조업 상태와 고장 여부, 학습 제외 여부는 서로 다른 항목으로 기록해요.',
    channel: 'TC-Z3',
    check: '현재 화면의 LOT는 그대로예요. 058·061의 설명을 다른 LOT의 판단으로 옮겨 쓰지 마세요.',
  },
  {
    id: 'review-practice',
    kind: 'practice',
    title: '연습 상황: 온도가 갑자기 낮아졌다면',
    body: '먼저 실제 기록이 있는지 확인해요. 기록 없는 시간을 선으로 잇지 않아요. 값이 있다면 같은 시각의 TC·OP, 강종·LOT, 앞뒤 조업·정비 기록을 함께 봐요. 상단 이상 후보에서 과거 LOT 분석을 실행하고, 후보를 눌러 그래프를 확인한 뒤 현장 확인 요청을 남길 수 있어요. 현장팀이 요청을 맡아 결과를 보내면 모니터링팀이 검토를 마쳐요. 과거 자료의 기준 이탈이며 현재 설비의 자동 고장 감지는 아니에요.',
    channel: 'TC-Z3',
    check: '채널·날짜·구간과 관측한 변화를 설명해 보세요. 연습 상황은 실제 경고나 팀 판단으로 저장하지 않아요.',
  },
]
