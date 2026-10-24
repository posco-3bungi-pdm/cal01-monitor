export type TutorialStep = { id: string; title: string; body: string; action: string; target: string; panel?: 'channels' | 'requests'; menu?: boolean }

export function screenTutorial(live: boolean): TutorialStep[] {
  return [
    { id: 'source', title: '어떤 코일을 보고 있나요?', target: '.scene-data-control', body: '먼저 자료 이름, LOT, 강종과 관측 시각을 확인하세요. 강종 정보가 연결되어 있으면 제품 특성도 함께 볼 수 있습니다.', action: '값을 비교하기 전에 LOT와 시각부터 확인합니다.' },
    { id: 'mode', title: '과거 기록과 실시간', target: '.data-mode-control', body: '과거 기록은 저장된 LOT를 살펴보는 곳입니다. 실시간은 들어온 기록을 따라갑니다. 돋보기를 누르면 과거 기록을 찾을 수 있습니다.', action: '현재 시연의 실시간 화면은 CSV 순차 수신입니다.' },
    { id: 'zones', title: '보고 싶은 구역으로 이동', target: '.zone-navigation', body: 'CLN-IN, Z1~Z9, OUT, CP 중 원하는 구역을 누르면 가까이 봅니다. 같은 구역을 다시 누르면 전체 보기로 돌아갑니다.', action: '빨간 표시는 이상 징후가 있는 구역입니다. 고장 확정과는 구분해 읽습니다.' },
    { id: 'playback', title: live ? '이전 기록에서 현재로 복귀' : '기록을 앞뒤로 살펴보기', target: '.playback-control', body: live ? '「30초 전」으로 이전 수신 기록을 볼 수 있습니다. 이전 기록에서는 배속으로 따라잡고 「현재로」를 누르면 최신 수신을 따라갑니다. 현재에 도달하면 1배속으로 돌아옵니다.' : '재생 버튼과 시간 막대로 시각을 이동합니다. 방향키 ←·→는 5초, Shift와 함께 누르면 30초씩 이동합니다. 배속으로 기록의 흐름을 빠르게 볼 수 있습니다.', action: '실시간의 과거 조회 중에도 새로운 기록 수신은 계속됩니다.' },
    { id: 'equipment', title: '설비와 부품 살펴보기', target: '.scene-toolbar', body: '홀로그램·금속 설비, 외함·내부 보기와 코일 색상을 바꿀 수 있습니다. 설정의 장비·부품 보기에서 부품을 차례로 선택해 위치를 확인하세요.', action: '코일 색상은 구역 TC를 설명하는 색이며 실제 표면색이나 경보 등급이 아닙니다.' },
    { id: 'graph', title: '같은 시각의 채널 비교', target: '.drawer-channels', panel: 'channels', body: '상단 파형 버튼으로 이 창을 엽니다. 채널을 고르고 그래프를 누르면 관측 시각을 확인합니다. 구간을 드래그한 뒤 「이 구간 확대」로 변화를 자세히 봅니다.', action: '채널 이름·단위·축 범위를 먼저 읽고 TC·OP·CP를 같은 시간축에서 비교하세요.' },
    { id: 'alerts', title: '이상 징후의 근거 확인', target: '[aria-label="과거 LOT 이상 후보 열기"]', body: live ? '실시간 감지 알림이나 빨간 구역을 누르면 감지 구간을 확인합니다. 지금 강조된 상단 버튼은 과거 LOT에 저장된 후보를 여는 버튼입니다.' : '이 버튼은 저장된 이상 후보를 엽니다. 후보나 빨간 구역을 누르면 해당 지점과 앞뒤 그래프를 확인할 수 있습니다.', action: '변화량·지속 시간·통계 기준을 읽고, 실제 정비·조업 기록과 대조해 원인을 판단하세요.' },
    { id: 'requests', title: '확인할 내용을 팀에 전달', target: '.drawer-requests', panel: 'requests', body: '상단 점검 요청 버튼에서 요청함을 엽니다. 새 점검 요청에는 LOT·구역·채널·시간 구간과 관측한 변화를 적습니다. 필요한 자료와 담당 팀도 함께 정리하세요.', action: '이 튜토리얼에서는 실제 요청을 작성하거나 전송하지 않습니다.' },
    { id: 'menu', title: '필요할 때 다시 배우기', target: '.main-navigation', menu: true, body: '소둔로 공정 가이드에서 6개 주제를 골라 읽고 용어를 검색할 수 있습니다. 화면 사용법이 궁금하면 이 튜토리얼을 언제든 다시 시작하세요.', action: '마치면 시작 전 메뉴와 창 상태로 돌아갑니다.' },
  ]
}

export type Box = { left: number; top: number; width: number; height: number }
export function tutorialCardPosition(target: Box | null, card: { width: number; height: number }, viewport: { width: number; height: number }) {
  const gap = 20, margin = 16
  const clamp = (n: number, max: number) => Math.max(margin, Math.min(n, max - margin))
  const xMax = viewport.width - card.width, yMax = viewport.height - card.height
  if (target) {
    if (target.left >= card.width + gap + margin) return { left: target.left - card.width - gap, top: clamp(target.top + (target.height - card.height) / 2, yMax) }
    if (viewport.width - target.left - target.width >= card.width + gap + margin) return { left: target.left + target.width + gap, top: clamp(target.top, yMax) }
    if (viewport.height - target.top - target.height >= card.height + gap + margin) return { left: clamp(target.left + (target.width - card.width) / 2, xMax), top: target.top + target.height + gap }
    if (target.top >= card.height + gap + margin) return { left: clamp(target.left + (target.width - card.width) / 2, xMax), top: target.top - card.height - gap }
  }
  return { left: clamp((viewport.width - card.width) / 2, xMax), top: clamp((viewport.height - card.height) / 2, yMax) }
}
