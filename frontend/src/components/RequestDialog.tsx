import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Send, X } from "lucide-react";
import { api } from "../api";
import type { DetectionCandidate, FieldRequest, ManualRequestContext } from "../review-types";
import type { Channel, Lot } from "../types";
import { dateTime, numberText, timeMs } from "../time";
import ThemedSelect from "./ThemedSelect";

export default function RequestDialog({ candidate, manualContext, channels = [], lots = [], onClose, onSaved }: {
  candidate?: DetectionCandidate | null; manualContext?: ManualRequestContext; channels?: Channel[]; lots?: Lot[];
  onClose: () => void; onSaved: (request: FieldRequest, reused: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const key = useRef(crypto.randomUUID());
  const submittedPayload = useRef<string | null>(null);
  const [lotNo, setLotNo] = useState(manualContext?.lot_no ?? '');
  const [channelId, setChannelId] = useState(manualContext?.channel_id ?? '');
  const [start, setStart] = useState(manualContext?.start.replace(' ', 'T') ?? '');
  const [end, setEnd] = useState(manualContext?.end.replace(' ', 'T') ?? '');
  const selectedLot = lots.find(item => String(item.lot_no) === lotNo);
  const contextValid = !!candidate || !!(manualContext?.dataset_id && selectedLot && channels.some(item => item.id === channelId)
    && Number.isFinite(timeMs(start)) && Number.isFinite(timeMs(end)) && timeMs(start) <= timeMs(end)
    && timeMs(start) >= timeMs(selectedLot.start) && timeMs(end) <= timeMs(selectedLot.end));
  const [observed, setObserved] = useState("");
  const [conditions, setConditions] = useState("");
  const [question, setQuestion] = useState("");
  const message = `[관측한 변화]\n${observed.trim()}\n\n[함께 확인한 조건]\n${conditions.trim() || '미기록'}\n\n[점검할 내용]\n${question.trim()}`;
  const valid = contextValid && !!observed.trim() && !!question.trim() && message.length <= 4000;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || pending) return;
    const payload = candidate ? { candidate_id: candidate.id, message: message.trim() } : {
      dataset_id: manualContext?.dataset_id, lot_no: lotNo, channel_id: channelId, start, end, message: message.trim(),
    };
    const serialized = JSON.stringify(payload);
    if (submittedPayload.current !== null && submittedPayload.current !== serialized) key.current = crypto.randomUUID();
    submittedPayload.current = serialized;
    setPending(true); setError("");
    try {
      const result = await api<{ request: FieldRequest; reused: boolean }>("/api/field-requests", { method: "POST", body: JSON.stringify({ ...payload, idempotency_key: key.current }) });
      onSaved(result.request, result.reused);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "요청을 저장하지 못했습니다. 작성한 내용은 그대로 남아 있습니다.");
    } finally { setPending(false); }
  }
  return <dialog ref={dialog} className="request-dialog" aria-labelledby="request-heading" onCancel={event => { event.preventDefault(); if (!pending) onClose(); }}>
    <form onSubmit={submit}><header><div><span className="eyebrow">CAL01 / REQUEST</span><h2 id="request-heading">점검 요청 작성</h2></div><button type="button" className="icon-button" aria-label="요청 작성 닫기" onClick={onClose} disabled={pending}><X size={18} /></button></header>
      {candidate ? <div className="request-identity"><strong>LOT {candidate.lot_no} · {candidate.zone_id} · {candidate.channel_id}</strong><span>{dateTime(candidate.start, true)} — {dateTime(candidate.end, true)}</span><span>기준을 가장 크게 벗어난 값 {numberText(candidate.peak_value)} · Z {numberText(candidate.peak_z)}</span><small>이상 후보에 연결된 점검 요청 · 고장 확정 아님</small></div> : <div className="manual-request-context">
        <strong>직접 작성 · 이상 후보 없이 요청 가능</strong>
        <ThemedSelect label="요청 LOT" value={lotNo} onChange={value => { setLotNo(value); const next = lots.find(item => String(item.lot_no) === value); setStart(next?.start.replace(' ', 'T') ?? ''); setEnd(next?.start.replace(' ', 'T') ?? ''); }} disabled={pending} options={lots.map(item => ({ value: String(item.lot_no), label: `${item.lot_no} · ${item.grade || '강종 미기록'}` }))} />
        <ThemedSelect label="점검할 채널" value={channelId} onChange={setChannelId} disabled={pending} options={channels.map(item => ({ value: item.id, label: `${item.id} · ${item.unit || '단위 미확인'}` }))} />
        <div className="request-period-presets"><button type="button" className="subtle-button" disabled={pending} onClick={() => { const time = manualContext && lotNo === manualContext.lot_no ? manualContext.start : selectedLot?.start ?? ''; setStart(time); setEnd(time); }}>선택 시각</button><button type="button" className="subtle-button" disabled={pending || !selectedLot} onClick={() => { if (selectedLot) { setStart(selectedLot.start); setEnd(selectedLot.end); } }}>LOT 전체</button></div>
        <div className="request-period"><label>시작 시각<input type="datetime-local" step="1" value={start.slice(0, 19)} min={selectedLot?.start.slice(0, 19)} max={selectedLot?.end.slice(0, 19)} onChange={event => setStart(event.target.value)} disabled={pending} required /></label><label>끝 시각<input type="datetime-local" step="1" value={end.slice(0, 19)} min={selectedLot?.start.slice(0, 19)} max={selectedLot?.end.slice(0, 19)} onChange={event => setEnd(event.target.value)} disabled={pending} required /></label></div>
        <small>원자료 시각 기준 · 선택한 LOT 범위 안에서 지정</small>
        {!contextValid && <p className="form-error">LOT·채널과 시작·끝 시각을 확인하십시오.</p>}
      </div>}
      <div className="request-writing-grid">
        <label htmlFor="request-observed">관측한 변화 <small>필수</small></label><textarea id="request-observed" autoFocus rows={3} maxLength={2000} required value={observed} onChange={event => setObserved(event.target.value)} placeholder="어떤 채널이 언제부터 어떻게 변했는지 기록" disabled={pending} />
        <label htmlFor="request-conditions">함께 확인한 조건</label><textarea id="request-conditions" rows={2} maxLength={1000} value={conditions} onChange={event => setConditions(event.target.value)} placeholder="TC·OP 비교, 강종, 정지·재가동, 설정 변경 등. 모르면 미확인으로 기록" disabled={pending} />
        <label htmlFor="request-question">점검할 내용 <small>필수</small></label><textarea id="request-question" rows={3} maxLength={2000} required value={question} onChange={event => setQuestion(event.target.value)} placeholder="담당자가 확인할 항목과 전달받을 결과를 기록" disabled={pending} />
        <span className={message.length > 4000 ? 'form-error' : 'muted'}>{message.length.toLocaleString()} / 4,000자 · 구역과 발생 시각은 자동으로 연결</span>
      </div>
      <p className="dialog-note">저장하면 팀 공통 요청 목록에 남고 앱 안에서 팀원에게 알립니다.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <footer><button type="button" className="subtle-button" onClick={onClose} disabled={pending}>취소</button><button type="submit" className="primary-button" disabled={pending || !valid}>{pending ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}요청 보내기</button></footer>
    </form>
  </dialog>;
}
