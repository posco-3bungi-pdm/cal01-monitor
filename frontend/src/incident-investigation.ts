import type { TimeRange } from './types.ts'
import { timeIso, timeMs } from './time.ts'

export type ContextRecord = {
  id: string; type: 'operation' | 'plan' | 'detection' | 'maintenance' | 'parts';
  start: string; end: string | null; precision: string; title: string;
  equipment: string; description: string; source: string; sourceId: string;
  details: Record<string, unknown>; end_inclusive?: boolean;
}
export type ContextRecordsResponse = {
  records: ContextRecord[]; source_exports?: unknown[];
}

// This is a review window, not an alarm threshold. Live review stops at reception.
export function investigationWindow(range: TimeRange, receivedThrough?: string): TimeRange {
  const start = timeMs(range.start), end = timeMs(range.end)
  const through = receivedThrough ? timeMs(receivedThrough) : Infinity
  return { start: timeIso(start - 30 * 60_000), end: timeIso(Math.min(end + 30 * 60_000, through)) }
}

// A date-only plan or a recorded alarm is never evidence of an actual repair.
export function relatedRecords(records: ContextRecord[], range: TimeRange, receivedThrough?: string) {
  const start = timeMs(range.start), end = timeMs(range.end)
  const through = receivedThrough ? timeMs(receivedThrough) : Infinity
  const groups = { overlapping: [] as ContextRecord[], plans: [] as ContextRecord[], dated: [] as ContextRecord[], nearby: [] as ContextRecord[], detections: [] as ContextRecord[] }
  for (const record of records) {
    if (record.precision === 'date') {
      if (record.start.slice(0, 10) <= range.end.slice(0, 10) && (record.end ?? record.start).slice(0, 10) >= range.start.slice(0, 10)) (record.type === 'plan' ? groups.plans : groups.dated).push(record)
      continue
    }
    const a = timeMs(record.start), b = timeMs(record.end ?? record.start)
    if (!Number.isFinite(a) || !Number.isFinite(b) || a > through || a > end + 30 * 60_000 || b < start - 30 * 60_000) continue
    if (record.type === 'plan') { groups.plans.push(record); continue }
    if (record.type === 'detection') { groups.detections.push(record); continue }
    if (a <= end && b >= start) groups.overlapping.push(record)
    else groups.nearby.push(record)
  }
  return groups
}

const THERMAL_SOURCE = { title: 'ANDRITZ · 연속 소둔로 제어', url: 'https://www.andritz.com/resource/blob/19508/875528a8607601b1a4bf656442369fb8/me-article-heat-processing-1-2016-en-data.pdf' }
const CP_SOURCE = { title: 'Eurotherm · CP와 산소·온도 계측', url: 'https://www.eurotherm.com/heat-treatment-articles/heat-cool-with-carbon-potential-or-oxygen-level-monitoring/' }

export function investigationGuide(zoneId: string, channelIds: string[]) {
  const cpOnly = channelIds.length > 0 && channelIds.every(id => id.startsWith('CP-'))
  const cooling = /^Z[789]$|^OUT/.test(zoneId)
  const cleaning = /^CLN/.test(zoneId)
  const checks = cpOnly ? [
    'CP와 같은 시각의 Z4 TC를 함께 본다. 분위기 변화와 온도 보정·계측 변화를 구분할 자료가 필요하다.',
    'CP-Z4M의 e⁻¹⁰ 배율과 결측을 확인한다. 두 CP 채널의 환산식·관리 범위·센서 연결은 미확인이다.',
  ] : cleaning ? [
    'CLN-IN의 관측 시각·결측과 세정·건조 운전 기록을 대조한다. 화면의 세정 애니메이션은 실제 작동 기록이 아니다.',
    '세정액·건조 조건과 라인 속도를 함께 확인해야 한다. 현재 온도 한 값으로 세정 불량을 판정하지 않는다.',
  ] : cooling ? [
    '같은 시각의 해당 존과 앞뒤 존 TC 추세를 비교한다. OUT의 출측 1·2는 각각 확인한다.',
    '설정 온도·라인 속도·냉각 운전 기록을 대조한다. 온도 변화만으로 냉각 장치 고장을 특정하지 않는다.',
  ] : [
    '같은 존의 TC와 OP를 같은 시간축에서 비교한다. OP가 먼저 바뀌고 TC가 뒤따르는지, 이웃 존도 함께 변하는지 본다.',
    '목표 온도·강종·두께·폭·라인 속도와 정지·재가동 기록을 대조한다. 출력은 연료 유량이나 버너 고장 여부를 직접 나타내지 않는다.',
  ]
  return {
    checks,
    teams: [
      { team: '조업·공정 담당', data: cpOnly ? '동시간대 Z4 TC, 분위기 설정·가스 조성·운전 변경 기록' : cleaning ? '세정·건조 운전 상태, 세정액 조건, 라인 속도·강종 전환' : cooling ? '냉각 설정·운전 상태, 라인 속도·강종·소재 치수' : '목표 온도(SP), 라인 속도, 강종·두께·폭, 정지·재가동·설정 변경 시각' },
      { team: '정비 담당', data: '작업지시 번호, 실제 작업 시작·종료, 해당 존·부품, 작업 결과와 재가동 확인' },
      { team: '계측·제어 담당', data: cpOnly ? 'CP 채널 정의·환산식·관리 범위, 프로브·분석기 연결, 교정·점검 이력' : 'TC 센서 점검·교정, OP 명령과 실제 구동 피드백, 결측·품질 상태·시각 동기' },
      { team: '분석·데이터 담당', data: '같은 강종·운전 조건의 비교 LOT, 학습 라벨 근거, 정상 기준과 정비 구간 처리 방식' },
    ],
    source: cpOnly ? CP_SOURCE : THERMAL_SOURCE,
  }
}
