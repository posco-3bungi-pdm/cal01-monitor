import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { api, queryString } from '../api'
import { dateTime, timeMs } from '../time'
import type { TimeRange } from '../types'
import { investigationGuide, investigationWindow, relatedRecords } from '../incident-investigation'
import type { ContextRecord, ContextRecordsResponse } from '../incident-investigation'

const recordNames: Record<ContextRecord['type'], string> = { operation: '조업', plan: '계획', detection: '기존 감지', maintenance: '정비 작업', parts: '부품 연결 작업' }

function RecordList({ rows, through }: { rows: ContextRecord[]; through?: string }) {
  return <ul className="investigation-records">{rows.map(record => <li key={record.id}>
    <strong>{recordNames[record.type]} · {record.title}</strong>
    <span>{record.precision === 'date' ? `${record.start} ~ ${record.end ?? record.start} · 날짜만 기록` : `${dateTime(record.start, true)}${record.end ? ` ~ ${through && timeMs(record.end) > timeMs(through) ? '수신 시각 이후 종료 기록은 검토하지 않음' : dateTime(record.end, true)}` : ''}`}</span>
    <small>{record.equipment} · {record.source}{record.sourceId ? ` · ${record.sourceId}` : ''}</small>
    {record.precision === 'linked-work' && <small>연결된 작업 구간이며 실제 부품 교체 시각은 미확인</small>}
  </li>)}</ul>
}

export default function IncidentInvestigation({ datasetId, zoneId, channelIds, range, receivedThrough }: {
  datasetId: string; zoneId: string; channelIds: string[]; range: TimeRange; receivedThrough?: string;
}) {
  const window = investigationWindow(range, receivedThrough)
  const query = useQuery({
    queryKey: ['incident-context', datasetId, range.start, range.end, Boolean(receivedThrough)], enabled: !!datasetId,
    queryFn: ({ signal }) => api<ContextRecordsResponse>('/api/records?' + queryString({ dataset: datasetId, ...window }), { signal }),
    staleTime: 60_000, refetchInterval: 60_000,
  })
  const groups = relatedRecords(query.data?.records ?? [], range, receivedThrough)
  const linked = !!query.data && (query.data.records.length > 0 || (query.data.source_exports?.length ?? 0) > 0)
  const status = query.isPending ? '정비·조업 이력 확인 중' : query.error ? '이력 조회 실패 · 정비 여부 미확인' : !linked ? '정비·조업 이력 미연결' : groups.overlapping.length ? `같은 시간의 작업·조업 기록 ${groups.overlapping.length}건` : groups.plans.length ? '정비 계획 있음 · 실제 작업 여부 미확인' : groups.dated.length ? '같은 날짜의 기록 있음 · 발생 시각 미확인' : '겹치는 작업·조업 기록 없음'
  const guide = investigationGuide(zoneId, channelIds)
  return <section className="incident-investigation" aria-label="이상 구간 원인 확인">
    <header><Search size={17} /><h4>이상 구간 원인 확인</h4><span>원인 미확정</span></header>
    <p className="investigation-status">{status}</p>
    <details><summary>정비·조업 기록과 대조</summary>
      <p>발생 구간과 앞뒤 30분을 조회합니다{receivedThrough ? '. 실시간에서는 수신된 시각까지만 대조합니다' : ''}. 기록의 설비·존이 해당 위치와 맞는지도 확인하세요.</p>
      {query.error ? <p role="alert">기록을 불러오지 못했습니다. <button className="text-button" onClick={() => void query.refetch()}>다시 확인</button></p> : query.isPending ? <p role="status">기록을 불러오는 중입니다.</p> : !linked ? <p>이 자료 묶음에 연결된 정비·조업 이력이 없습니다. 정비가 없었다는 뜻은 아닙니다. 작업지시·실제 정지/재가동 기록을 정비·조업 담당자에게 확인하세요.</p> : <>
        {groups.overlapping.length > 0 && <><h5>발생 시간과 겹치는 기록</h5><RecordList rows={groups.overlapping} through={receivedThrough} /><p>시간이 겹친다는 근거이며 원인 연관은 미확인입니다.</p></>}
        {groups.plans.length > 0 && <><h5>계획 기록 · 실제 작업과 구분</h5><RecordList rows={groups.plans} through={receivedThrough} /><p>날짜만 있는 계획으로 실제 정지 시각이나 정비 수행을 확정하지 않습니다.</p></>}
        {groups.dated.length > 0 && <><h5>날짜만 있는 기록 · 발생 시각 미확인</h5><RecordList rows={groups.dated} through={receivedThrough} /><p>같은 날짜의 기록이며 감지 구간과 실제로 겹치는지는 확인되지 않았습니다.</p></>}
        {groups.nearby.length > 0 && <><h5>앞뒤 30분의 기록 · 구간과 직접 겹치지 않음</h5><RecordList rows={groups.nearby} through={receivedThrough} /></>}
        {groups.detections.length > 0 && <><h5>기존 이력에 적힌 감지 · 원인 판정 아님</h5><RecordList rows={groups.detections} through={receivedThrough} /></>}
        {!groups.overlapping.length && <p>발생 구간과 시간이 겹치는 실제 작업·조업 기록은 찾지 못했습니다. 누락된 기록이 있는지 확인하세요.</p>}
      </>}
      <p>정비 정지라면 OP가 낮아진 뒤 TC가 내려가고, 재가동 때는 반대 양상이 나타날 수 있습니다. 실제 운전 기록과 시각·존이 일치하는지 대조한 뒤 판단하세요.</p>
    </details>
    <details><summary>공정 관점에서 무엇을 볼까</summary><ul>{guide.checks.map(check => <li key={check}>{check}</li>)}</ul>
      <p>센서값의 0과 관측 없음(—)을 구분합니다. 통계 이탈·분류 점수만으로 고장 원인이나 품질 불량을 확정하지 않습니다.</p>
      <a href={guide.source.url} target="_blank" rel="noreferrer">{guide.source.title}</a>
    </details>
    <details><summary>원인 확인에 필요한 자료·협업</summary><p>아래 자료는 추가 확인 항목입니다. 현재 연결·검증된 것으로 간주하지 않습니다.</p>
      <dl className="investigation-teams">{guide.teams.map(item => <div key={item.team}><dt>{item.team}</dt><dd>{item.data}</dd></div>)}</dl>
      <p>아래 점검 요청에서 발생 구간과 관측한 변화, 대조한 기록 번호, 아직 없는 자료를 함께 전달하세요.</p>
    </details>
  </section>
}
