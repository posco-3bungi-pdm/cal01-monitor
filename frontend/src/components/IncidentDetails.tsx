import { useState } from 'react'
import { BookOpen, Check, ClipboardList, LoaderCircle } from 'lucide-react'
import type { Channel, ChannelSeries, TimeRange } from '../types'
import type { DetectionCandidate } from '../review-types'
import { dateTime, clockTime, numberText, timeMs, timeIso } from '../time'
import ReadingValue from './ReadingValue'
import CPInfo from './CPInfo'
import { incidentAxis, incidentTick } from './incident-axis'
import IncidentInvestigation from './IncidentInvestigation'

function IncidentTrend({ candidate, data, view, onCursor }: { candidate: DetectionCandidate; data?: ChannelSeries; view: TimeRange; onCursor: (time: string) => void }) {
  const points = data?.points ?? [], lo = timeMs(view.start), span = Math.max(1, timeMs(view.end) - lo)
  const values = [...points.map(point => point.value), candidate.peak_value, candidate.baseline.lower, candidate.baseline.upper].filter((value): value is number => value != null && Number.isFinite(value))
  if (!values.length) return <p className="incident-no-data">이 구간에 관측값이 없습니다.</p>
  const axis = incidentAxis(values)
  const tickScale = candidate.channel_id === 'CP-Z4M' ? 1e-10 : 1
  const x = (time: string) => 60 + (timeMs(time) - lo) / span * 392
  const y = (value: number) => 158 - (value - axis.min) / (axis.max - axis.min) * 132
  const lines: string[] = []; let current = ''
  for (const point of points) {
    if (point.value == null || !Number.isFinite(point.value) || point.gap_before) { if (current) lines.push(current); current = '' }
    if (point.value != null && Number.isFinite(point.value)) current += `${current ? 'L' : 'M'}${x(point.time).toFixed(2)},${y(point.value).toFixed(2)} `
  }
  if (current) lines.push(current)
  return <div className="incident-trend"><svg viewBox="0 0 480 202" role="img" aria-label={`${candidate.channel_id} 이상 후보와 앞뒤 관측값 그래프`} onClick={event => {
    const box = event.currentTarget.getBoundingClientRect(), fraction = Math.max(0, Math.min(1, ((event.clientX - box.left) / box.width * 480 - 60) / 392))
    onCursor(timeIso(lo + fraction * span))
  }}>
    <defs><clipPath id="incident-plot"><rect x="60" y="18" width="392" height="148" /></clipPath></defs>
    {tickScale !== 1 && <text x="12" y="13">e⁻¹⁰</text>}
    {axis.ticks.map((value, index) => <g key={index}><line x1="60" x2="452" y1={y(value)} y2={y(value)} className="incident-grid" /><text x="52" y={y(value) + 4} textAnchor="end">{incidentTick(value / tickScale, (axis.max - axis.min) / tickScale / 2)}</text></g>)}
    <g clipPath="url(#incident-plot)"><rect x={x(candidate.start)} y="18" width={Math.max(2, x(candidate.end) - x(candidate.start))} height="148" className="incident-range" />
      {[candidate.baseline.lower, candidate.baseline.upper].map((value, index) => value != null && <line key={index} x1="60" x2="452" y1={y(value)} y2={y(value)} className="incident-reference" />)}
      {lines.map((line, index) => <path key={index} d={line} className="incident-line" />)}
      <circle cx={x(candidate.peak_at)} cy={y(candidate.peak_value)} r="4" className="incident-peak" />
    </g>
    {[0, .5, 1].map(fraction => <text key={fraction} x={60 + fraction * 392} y="188" textAnchor={fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'}>{clockTime(lo + fraction * span, true)}</text>)}
  </svg><p><i />후보 구간 <span>점선: LOT 평균 ±3σ · 정상 범위 아님</span></p></div>
}

export default function IncidentDetails({ candidate, zoneCandidates, channel, data, view, loading, error, pending, onSelect,
  onRead, onGuide, onRequest, onOpenRequest, onResolve, onRange, onCursor, readOnly = false }: {
  candidate: DetectionCandidate; zoneCandidates: DetectionCandidate[]; channel?: Channel; data?: ChannelSeries; view: TimeRange
  readOnly?: boolean; loading: boolean; error: unknown; pending: boolean; onSelect: (item: DetectionCandidate) => void
  onRead: () => void; onGuide: () => void; onRequest: () => void; onOpenRequest: (id: string) => void
  onResolve: (note: string) => Promise<void>; onRange: (mode: 'candidate' | 'context' | 'lot') => void; onCursor: (time: string) => void
}) {
  const [writing, setWriting] = useState(false), [note, setNote] = useState(''), [failure, setFailure] = useState('')
  return <div className="incident-details" data-preserve-outside={writing && note.trim() ? 'true' : undefined}>
    <div className="incident-status"><span>{candidate.resolved ? '조치 완료' : candidate.open_request ? '점검 진행 중' : candidate.acknowledged ? '읽음 · 미조치' : '이상 징후 감지'}</span><small>과거 LOT {candidate.lot_no} · 고장 확정 아님</small></div>
    {zoneCandidates.length > 1 && <label className="incident-switch">{candidate.channel_id.startsWith('CP-') ? 'Z4 CP' : `${candidate.zone_id} 온도·제어출력`} 미조치 {zoneCandidates.length}건<select value={candidate.id} onChange={event => { const item = zoneCandidates.find(item => item.id === event.target.value); if (item) onSelect(item) }}>{zoneCandidates.map(item => <option key={item.id} value={item.id}>{item.channel_id} · {dateTime(item.start, true)}</option>)}</select></label>}
    <h3>{candidate.zone_id} · {candidate.channel_id}</h3><p className="incident-period">{dateTime(candidate.start, true)} — {candidate.start.slice(0, 10) === candidate.end.slice(0, 10) ? clockTime(candidate.end, true) : dateTime(candidate.end, true)}</p>
    {candidate.channel_id.startsWith('CP-') && <CPInfo />}
    <div className="incident-peak-reading"><small>구간 내 최대 기준 이탈값</small><span><ReadingValue channelId={candidate.channel_id} value={candidate.peak_value} unit={channel?.unit} /></span><small>{dateTime(candidate.peak_at, true)} · |Z| {numberText(Math.abs(candidate.peak_z))}</small></div>
    <div className="incident-range-buttons" role="group" aria-label="이상 그래프 표시 범위"><button onClick={() => onRange('candidate')}>후보 구간</button><button onClick={() => onRange('context')}>앞뒤 5분</button><button onClick={() => onRange('lot')}>LOT 전체</button></div>
    {error ? <p className="form-error" role="alert">그래프를 불러오지 못했습니다.</p> : loading ? <p className="incident-no-data"><LoaderCircle size={16} className="spin" />관측값 불러오는 중</p> : <IncidentTrend candidate={candidate} data={data} view={view} onCursor={onCursor} />}
    <section className="incident-statistical-reason"><strong>통계적 감지 근거</strong><p>이 LOT에서 {candidate.channel_id}의 비교 기준은 <ReadingValue channelId={candidate.channel_id} value={candidate.baseline.lower} unit={channel?.unit} /> ~ <ReadingValue channelId={candidate.channel_id} value={candidate.baseline.upper} unit={channel?.unit} />입니다. 구간 내 최대 이탈은 |Z| {numberText(Math.abs(candidate.peak_z))}입니다.</p><small>LOT 전체 평균·표준편차 기준 · 목표값이나 운전 허용 한계와는 별도로 확인</small></section>
    <IncidentInvestigation readOnly={readOnly} datasetId={candidate.dataset_id} zoneId={candidate.zone_id} channelIds={[candidate.channel_id]} range={candidate} />
    <div className="incident-actions"><button className="subtle-button" onClick={onGuide}><BookOpen size={15} />대응 가이드</button>{!readOnly && !candidate.acknowledged && <button className="subtle-button" disabled={pending} onClick={() => { if (!readOnly) onRead(); }}><Check size={15} />읽음 표시</button>}
      {!candidate.resolved && (candidate.open_request || !readOnly) && <button className="subtle-button" onClick={() => { if (candidate.open_request) onOpenRequest(candidate.open_request.id); else if (!readOnly) onRequest(); }}><ClipboardList size={15} />{candidate.open_request ? '진행 중인 점검 요청' : '점검 요청'}</button>}
    </div>
    {candidate.resolved ? <section className="incident-resolution"><strong>저장된 조치 기록</strong><p>{candidate.resolution_note}</p><small>{candidate.resolved_by} · {candidate.resolved_at?.replace('T', ' ').slice(0, 19)}</small></section> : candidate.open_request ? <p className="incident-explanation">점검 결과를 등록하고 요청의 최종 확인을 완료하면 강조가 내려갑니다.</p> : readOnly ? null : !writing ? <button className="primary-button" onClick={() => { if (!readOnly) setWriting(true); }}>조치 완료 기록</button> : <form className="incident-resolution-form" onSubmit={async event => { event.preventDefault(); if (readOnly) return; setFailure(''); try { await onResolve(note); setWriting(false); setNote('') } catch (error) { setFailure(error instanceof Error ? error.message : '조치 기록을 저장하지 못했습니다.') } }}>
      <label>확인·조치한 내용<textarea value={note} onChange={event => setNote(event.target.value)} required maxLength={4000} disabled={pending} placeholder="확인 결과와 실제 조치 내용을 기록하십시오." /></label>{failure && <p className="form-error" role="alert">{failure}</p>}
      <div><button type="button" className="subtle-button" disabled={pending} onClick={() => { setWriting(false); setNote(''); setFailure('') }}>취소</button><button className="primary-button" disabled={pending || !note.trim()}>{pending ? '저장 중' : '기록 저장·강조 종료'}</button></div>
    </form>}
  </div>
}
