import { AlertCircle, Check, ChevronDown, Crosshair, LoaderCircle, Play, Send } from "lucide-react";
import { dateTime, numberText } from "../time";
import { activityTime } from "../review-types";
import type { DetectionCandidate, DetectionRun } from "../review-types";

const skippedText: Record<string, string> = {
  insufficient_samples: "유효한 값이 30개보다 적음",
  constant: "모든 값이 같아 표준편차가 0임",
  unusable_statistics: "평균과 표준편차를 계산할 수 없음",
};

export default function DetectionPanel({ runs, run, candidates, selectedId, selectedChannels, loading, running, error, disabled, onRun, onChooseRun, onFocus, onRequest, onAcknowledge, acknowledging }: {
  runs: DetectionRun[]; run?: DetectionRun; candidates: DetectionCandidate[]; selectedId: string | null;
  selectedChannels: string[]; loading: boolean; running: boolean; error: unknown; disabled: boolean;
  onRun: () => void; onChooseRun: (id: string) => void; onFocus: (candidate: DetectionCandidate) => void;
  onRequest: (candidate: DetectionCandidate) => void; onAcknowledge: (candidate: DetectionCandidate) => void;
  acknowledging: string | null;
}) {
  return <section className="panel detection-panel" aria-labelledby="detection-heading">
    <div className="panel-heading"><div><span className="eyebrow">HISTORICAL LOT / Z-SCORE</span><h2 id="detection-heading">과거 LOT 분석 <span className="technical-tag">실시간 고장 감지 아님</span></h2></div>
      <button className="primary-button compact" onClick={onRun} disabled={disabled || running || selectedChannels.length === 0}>{running ? <LoaderCircle className="spin" size={15} /> : <Play size={14} />}{running ? "LOT 원자료 분석 중" : `표시한 ${selectedChannels.length}개 채널 분석`}</button></div>
    <div className="analysis-rule"><p>지금 선택한 LOT의 원자료 전체에서 채널별 <strong>평균 ± 3 × 표준편차</strong>를 벗어난 값을 찾습니다.</p><p>모집단 표준편차(ddof=0) · 유효값 30개 이상 · 60초보다 긴 관측 공백에서 구간 분리. <code>EXCLUDED</code>나 <code>LABEL</code>로 행을 빼지 않습니다. 기존 노트북과 별도로 계산하는 앱용 사후 탐색입니다.</p></div>
    {error ? <div className="inline-error" role="alert"><AlertCircle size={15} /><span>{error instanceof Error ? error.message : "분석 정보를 불러오지 못했습니다."}</span></div> : null}
    {runs.length > 0 && <div className="analysis-run-control"><label htmlFor="analysis-run">저장된 분석</label><div className="select-wrap"><select id="analysis-run" value={run?.id ?? ""} onChange={event => onChooseRun(event.target.value)} disabled={running}>{runs.map(item => <option value={item.id} key={item.id}>{activityTime(item.created_at)} · {item.config.channels.length}개 채널 · 후보 {item.summary.candidate_count}개</option>)}</select><ChevronDown size={13} /></div><span>선택한 분석의 후보만 3D와 그래프에 표시합니다.</span></div>}
    {loading ? <div className="analysis-empty"><LoaderCircle size={16} className="spin" />저장된 분석을 불러오는 중</div> :
      !run ? <div className="analysis-empty">{error ? "저장된 분석을 확인하지 못했습니다. 연결 상태를 확인해 주세요." : "아직 이 LOT의 저장된 분석이 없습니다. 위 버튼을 누르면 분석하고 팀 공통으로 저장합니다."}</div> : <>
        <div className="analysis-summary"><span>원자료 <strong>{run.summary.source_count.toLocaleString()}행</strong></span><span>기준 이탈 <strong>{run.summary.exceedance_count.toLocaleString()}개 값</strong></span><span>후보 <strong>{run.summary.candidate_count.toLocaleString()}개 구간</strong></span><span>팀 확인 전 <strong>{error && candidates.length === 0 ? "—" : candidates.filter(candidate => !candidate.acknowledged).length}개</strong></span></div>
        {Object.keys(run.summary.skipped_channels).length > 0 && <div className="analysis-skipped"><strong>계산하지 않은 채널</strong>{Object.entries(run.summary.skipped_channels).map(([channel, reason]) => <span key={channel}><code>{channel}</code> · {skippedText[reason] ?? reason}</span>)}</div>}
        <div className="candidate-list" role="list" aria-label="저장된 통계적 이상 후보">
          {candidates.length === 0 ? <div className="analysis-empty">{error ? "후보 목록을 불러오지 못했습니다. 후보가 0개라는 뜻은 아닙니다." : "이번 기준을 벗어난 후보가 없습니다. 이 결과만으로 정상 여부를 확정하지 않습니다."}</div> : candidates.map(candidate => <article key={candidate.id} role="listitem" className={`candidate-item ${selectedId === candidate.id ? "selected" : ""}`}>
            <button className="candidate-main" onClick={() => onFocus(candidate)} aria-label={`${candidate.channel_id} ${dateTime(candidate.start, true)}부터 ${dateTime(candidate.end, true)} 이상 후보 보기`}><span className="candidate-channel"><i /><strong>{candidate.channel_id}</strong><small>{candidate.point_count}개 값</small></span><span className="candidate-time">{dateTime(candidate.start, true)} — {dateTime(candidate.end, true)}</span><span className="candidate-numbers">가장 크게 벗어난 값 {numberText(candidate.peak_value)} · Z {numberText(candidate.peak_z)}</span><span className="candidate-ack">{candidate.acknowledged ? "팀 확인함 · 고장/해결 확정 아님" : "팀 확인 전"}</span></button>
            <div className="candidate-actions"><button className="icon-button" title="후보 그래프 보기" aria-label={`${candidate.channel_id} 후보 그래프 보기`} onClick={() => onFocus(candidate)}><Crosshair size={15} /></button><button className="subtle-button" onClick={() => onRequest(candidate)}><Send size={13} />현장 확인 요청</button>{!candidate.acknowledged && <button className="subtle-button" disabled={acknowledging !== null} onClick={() => onAcknowledge(candidate)}>{acknowledging === candidate.id ? <LoaderCircle size={13} className="spin" /> : <Check size={13} />}확인</button>}</div>
          </article>)}
        </div>
      </>}
  </section>;
}
