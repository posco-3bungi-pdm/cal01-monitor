import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '../src/App'
import type { Channel, Lot, MaterialGrade } from '../src/types'
import materialReference from './material-fixtures.json'
import type { DetectionCandidate, FieldRequest } from '../src/review-types'
import '../src/App.css'

// This fixture uses the real application UI, with every API request intercepted here.
// No records or notifications are sent to the CAL01 server. Direct requests exist only in this tab's memory.
const start = '2026-10-01T08:00:00', end = '2026-10-01T09:00:00'
const materialGrades: MaterialGrade[] = materialReference.grades
const exampleLots: Lot[] = [
  { lot_no: 'EXAMPLE01', grade: '', source_grade: '', grade_source: null, material_revision: 0, product: null, start, end, count: 120 },
  { lot_no: 'EXAMPLE02', grade: 'SPCC', source_grade: 'SPCC', grade_source: 'source', material_revision: 0, product: materialGrades.find(item => item.grade === 'SPCC'), start, end, count: 120 },
  { lot_no: 'EXAMPLE03', grade: 'DP590', source_grade: 'DP590', grade_source: 'source', material_revision: 0, product: materialGrades.find(item => item.grade === 'DP590'), start, end, count: 120 },
]
const user = { username: 'ux-example', display_name: '예시 담당자', team: 'field', is_admin: false, can_edit_layout: false }
const ids = ['CLN-IN', ...Array.from({ length: 9 }, (_, i) => `TC-Z${i + 1}`), ...Array.from({ length: 8 }, (_, i) => `OP-Z${i + 1}`), 'CP-Z4', 'CP-Z4M', 'TC-OUT1', 'TC-OUT2']
const channels: Channel[] = ids.map(id => ({ id, label: id, zone: id === 'CLN-IN' ? 'CLN' : id.split('-')[1].replace('M', ''), unit: id.startsWith('OP-') ? '%' : id === 'CP-Z4' ? '무차원' : id.startsWith('CP-') ? null : '°C', kind: id.startsWith('OP-') ? 'output' : id.startsWith('CP-') ? 'process' : 'temperature' }))
const values = Object.fromEntries(channels.map(channel => [channel.id, channel.id === 'CP-Z4M' ? 1.15176e-10 : channel.id === 'CP-Z4' ? 0.45 : channel.kind === 'output' ? 56 : channel.id === 'CLN-IN' ? 65.48 : 740]))
const baseline = { count: 120, mean: 760, std: 5, lower: 745, upper: 775, status: 'ready' as const }
const candidate: DetectionCandidate = { id: 'example-candidate', run_id: 'example-run', dataset_id: 'example-data', lot_no: 'EXAMPLE01', mode: 'historical', channel_id: 'TC-Z3', zone_id: 'Z3', start: '2026-10-01T08:10:00', end: '2026-10-01T08:12:00', peak_at: '2026-10-01T08:11:00', peak_value: 740, peak_z: -4, point_count: 5, baseline, acknowledged: false, acknowledged_at: null, acknowledged_by: null }
const alarmExample = new URLSearchParams(location.search).get('alarms')
const cpCandidate: DetectionCandidate = { ...candidate, id: 'example-cp', channel_id: 'CP-Z4', zone_id: 'Z4', peak_value: .46, baseline: { ...baseline, mean: .45, std: .002, lower: .444, upper: .456 } }
const temperatureCandidate: DetectionCandidate = { ...candidate, id: 'example-temperature', channel_id: 'TC-Z4', zone_id: 'Z4' }
const outputCandidate: DetectionCandidate = { ...candidate, id: 'example-output', channel_id: 'OP-Z4', zone_id: 'Z4', peak_value: 56, baseline: { ...baseline, mean: 50, std: 1, lower: 47, upper: 53 } }
const exampleCandidates = alarmExample === 'cp' ? [cpCandidate] : alarmExample === 'z4' ? [temperatureCandidate, outputCandidate]
  : alarmExample === 'both' ? [cpCandidate, temperatureCandidate, outputCandidate] : [candidate]
const person = { username: user.username, display_name: user.display_name }
const requests: FieldRequest[] = (['requested', 'accepted', 'completed', 'closed'] as const).map((status, index) => ({ id: `example-request-${index}`, candidate_id: candidate.id, run_id: candidate.run_id, dataset_id: candidate.dataset_id, lot_no: candidate.lot_no, channel_id: candidate.channel_id, zone_id: candidate.zone_id, start: candidate.start, end: candidate.end, title: `예시 요청 ${index + 1} · Z3 온도 변화 확인`, message: '[관측한 변화]\nTC-Z3 변화 관측\n\n[함께 확인한 조건]\nTC·OP 비교 필요\n\n[점검할 내용]\n해당 시각 운전 기록 확인', status, revision: 1, requested_by: { username: 'example-operator', display_name: '예시 요청자' }, assigned_to: status === 'requested' ? null : person, created_at: '2026-10-01T00:15:00Z', updated_at: '2026-10-01T00:20:00Z', result: status === 'completed' || status === 'closed' ? '예시 점검 결과 · 실제 작업 기록 아님' : '' }))
const run = { id: candidate.run_id, dataset_id: candidate.dataset_id, lot_no: candidate.lot_no, mode: 'historical', status: 'completed', config: { channels: ['TC-Z3'], threshold: 3, ddof: 0, max_gap_seconds: 60, min_valid_samples: 30 }, stats: { 'TC-Z3': baseline }, summary: { source_count: 120, candidate_count: 1, exceedance_count: 5, analyzed_channels: ['TC-Z3'], skipped_channels: {}, interpretation: '예시 분석' }, created_by: person, created_at: '2026-10-01T00:14:00Z' }
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href)
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const actionCandidate = exampleCandidates.find(item => url.pathname.split('/').includes(item.id)) ?? candidate
  if (url.pathname.endsWith('/acknowledge') && init?.method === 'POST') {
    actionCandidate.acknowledged = true
    return reply({ candidate: actionCandidate })
  }
  if (url.pathname.endsWith('/resolve') && init?.method === 'POST') {
    const payload = JSON.parse(String(init.body))
    if (!payload.note?.trim()) return reply({ detail: '예시 조치 내용을 입력하십시오.' }, 400)
    actionCandidate.resolved = true; actionCandidate.resolution_note = payload.note
    actionCandidate.resolved_by = user.display_name; actionCandidate.resolved_at = '2026-10-01T00:30:00Z'
    return reply({ candidate: actionCandidate })
  }
  if (url.pathname === '/api/lot-grade-link' && init?.method === 'PATCH') {
    const payload = JSON.parse(String(init.body))
    const lot = exampleLots.find(item => item.lot_no === url.searchParams.get('lot'))
    if (!lot || lot.source_grade || payload.revision !== lot.material_revision) return reply({ detail: '예시 연결 조건을 확인하십시오.' }, 409)
    lot.grade = payload.grade; lot.product = materialGrades.find(item => item.grade === payload.grade) ?? null
    lot.grade_source = payload.grade ? 'linked' : null; lot.material_revision = (lot.material_revision ?? 0) + 1
    return reply({ lot })
  }
  if (url.pathname === '/api/field-requests' && init?.method === 'POST') {
    const payload = JSON.parse(String(init.body))
    if (payload.candidate_id || payload.dataset_id !== 'example-data') return reply({ detail: '이 미리보기에서는 직접 작성 예시만 탭 안에 표시합니다.' }, 409)
    const item: FieldRequest = { id: `example-direct-${requests.length + 1}`, candidate_id: null, run_id: null, source: 'manual', dataset_id: payload.dataset_id, lot_no: payload.lot_no, channel_id: payload.channel_id, zone_id: channels.find(channel => channel.id === payload.channel_id)?.zone ?? '', start: payload.start, end: payload.end, title: '예시 직접 작성 요청 · 실제 요청 아님', message: payload.message, requested_by: person, assigned_to: null, status: 'requested', revision: 1, result: '', created_at: '2026-10-01T00:30:00Z', updated_at: '2026-10-01T00:30:00Z' }
    requests.unshift(item)
    return reply({ request: item, reused: false }, 201)
  }
  if (!['GET', 'HEAD'].includes((init?.method ?? 'GET').toUpperCase())) return reply({ detail: '예시 화면에서는 서버 기록을 저장하지 않습니다. 입력 내용은 그대로 남습니다.' }, 409)
  switch (url.pathname) {
    case '/api/me': return reply({ user })
    case '/api/csrf': return reply({ csrfToken: 'example-not-a-real-token' })
    case '/api/datasets': return reply({ datasets: [{ id: 'example-data', name: '예시 데이터 · 사용성 확인 전용', row_count: 120, status: 'ready' }] })
    case '/api/lots': return reply({ lots: exampleLots })
    case '/api/material-grades': return reply({ grades: materialGrades })
    case '/api/channels': return reply({ channels })
    case '/api/equipment/layout': return reply({ model_version: 'example', revision: 1, placements: [] })
    case '/api/current-frame': return reply({ anchor_time: url.searchParams.get('at') ?? start, channels: channels.map(channel => ({ channel_id: channel.id, value: values[channel.id], measured_at: url.searchParams.get('at') ?? start, quality_status: 'observed' })) })
    case '/api/playback-frames': return reply({ frames: Array.from({ length: 121 }, (_, index) => {
      const time = new Date(Date.UTC(2026, 9, 1, 8, 0, index * 30)).toISOString().slice(0, 23)
      return { source_row: index + 1, source_record_id: `example-${index}`, time, recorded_at_raw: time, values, annotations: {} }
    }), has_more: false, next_cursor: null })
    case '/api/detection/pending': return reply({ candidates: exampleCandidates.filter(item => !item.resolved), count: exampleCandidates.filter(item => !item.resolved).length, truncated: false })
    case '/api/detection/runs': return reply({ runs: [run] })
    case '/api/detection/candidates': return reply({ candidates: exampleCandidates })
    case '/api/field-requests': return reply({ requests })
    case '/api/notifications': return reply({ notifications: [{ id: 1, kind: 'request', request_id: 'example-request-1', candidate_id: candidate.id, title: '예시 점검 요청 · 실제 알림 아님', actor: person, created_at: '2026-10-01T00:15:00Z' }], last_id: 1, has_more: false })
    case '/api/series': return reply({ start, end, mode: 'raw', aggregation_seconds: 0, source_count: 3, label_intervals: [], series: (url.searchParams.get('channels') ?? '').split(',').map(id => ({ channel_id: id, unit: channels.find(channel => channel.id === id)?.unit, points: [start, candidate.peak_at, end].map(time => ({ time, value: values[id] ?? null })) })) })
    case '/api/records': return reply({ records: [], count: 0, counts_by_kind: { operation: 0, plan: 0, detection: 0, maintenance: 0, parts: 0 } })
    default: return reply({ detail: `예시에서 지원하지 않는 기능: ${url.pathname}` }, 400)
  }
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const root = createRoot(document.getElementById('root')!)
root.render(<QueryClientProvider client={client}><App /><div style={{ position: 'fixed', zIndex: 500, bottom: 7, left: '50%', transform: 'translateX(-50%)', borderRadius: 8, padding: '5px 10px', fontSize: 11, color: '#fff', background: '#8d3c2d', pointerEvents: 'none', whiteSpace: 'nowrap' }}>예시 데이터 · 실제 분석·알림·요청 기록을 생성하지 않음</div></QueryClientProvider>)
if (import.meta.hot) import.meta.hot.dispose(() => { root.unmount(); client.clear() })
