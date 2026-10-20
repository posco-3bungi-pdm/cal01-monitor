import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Send, X } from "lucide-react";
import { api } from "../api";
import type { DetectionCandidate, FieldRequest } from "../review-types";
import { dateTime, numberText } from "../time";

export default function RequestDialog({ candidate, onClose, onSaved }: {
  candidate: DetectionCandidate; onClose: () => void; onSaved: (request: FieldRequest, reused: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const key = useRef(crypto.randomUUID());
  const submittedMessage = useRef<string | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim() || pending) return;
    if (submittedMessage.current !== null && submittedMessage.current !== message.trim()) key.current = crypto.randomUUID();
    submittedMessage.current = message.trim();
    setPending(true); setError("");
    try {
      const result = await api<{ request: FieldRequest; reused: boolean }>("/api/field-requests", { method: "POST", body: JSON.stringify({ candidate_id: candidate.id, message: message.trim(), idempotency_key: key.current }) });
      onSaved(result.request, result.reused);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "요청을 저장하지 못했습니다. 작성한 내용은 그대로 남아 있습니다.");
    } finally { setPending(false); }
  }
  return <dialog ref={dialog} className="request-dialog" aria-labelledby="request-heading" onCancel={event => { event.preventDefault(); if (!pending) onClose(); }}>
    <form onSubmit={submit}><header><div><span className="eyebrow">FIELD REQUEST</span><h2 id="request-heading">이 후보를 현장팀에 확인 요청</h2></div><button type="button" className="icon-button" aria-label="요청 작성 닫기" onClick={onClose} disabled={pending}><X size={18} /></button></header>
      <div className="request-identity"><strong>LOT {candidate.lot_no} · {candidate.zone_id} · {candidate.channel_id}</strong><span>{dateTime(candidate.start, true)} — {dateTime(candidate.end, true)}</span><span>기준을 가장 크게 벗어난 값 {numberText(candidate.peak_value)} · Z {numberText(candidate.peak_z)}</span><small>과거 자료의 통계적 후보입니다. 고장으로 확정한 요청이 아닙니다.</small></div>
      <label htmlFor="request-message">어떤 부분을 확인하면 될까요?</label><textarea id="request-message" autoFocus rows={6} maxLength={4000} required value={message} onChange={event => setMessage(event.target.value)} placeholder="관측한 변화와 현장에서 확인할 내용을 적어 주세요." disabled={pending} />
      <p className="dialog-note">저장하면 팀 공통 요청 목록에 남고 앱 안에서 팀원에게 알립니다.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <footer><button type="button" className="subtle-button" onClick={onClose} disabled={pending}>취소</button><button type="submit" className="primary-button" disabled={pending || !message.trim()}>{pending ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}요청 저장</button></footer>
    </form>
  </dialog>;
}
