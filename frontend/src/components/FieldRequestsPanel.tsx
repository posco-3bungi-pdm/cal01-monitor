import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, ChevronDown, ChevronRight, Crosshair, LoaderCircle, Send, UserCheck } from "lucide-react";
import { api, ApiError } from "../api";
import { activityTime } from "../review-types";
import type { CandidateLocation, FieldRequest } from "../review-types";
import type { User } from "../types";
import { dateTime } from "../time";

const STATUS = { requested: "접수 대기", accepted: "현장 확인 중", completed: "현장 결과 도착", closed: "검토 마침" };
export default function FieldRequestsPanel({ user, selectedRequestId, focusRevision, onOpenCandidate }: {
  user: User; selectedRequestId: string | null; focusRevision: number; onOpenCandidate: (location: CandidateLocation) => void;
}) {
  const queryClient = useQueryClient();
  const [opened, setOpened] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "mine" | "open">("open");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<Record<string, boolean>>({});
  useEffect(() => { if (selectedRequestId) setOpened(selectedRequestId); }, [selectedRequestId, focusRevision]);
  const query = useQuery({ queryKey: ["field-requests"], queryFn: ({ signal }) => api<{ requests: FieldRequest[] }>("/api/field-requests", { signal }), refetchInterval: 5000 });
  const rows = (query.data?.requests ?? []).filter(request => request.id === selectedRequestId || filter === "all" || (filter === "mine" ? request.assigned_to?.username === user.username : request.status !== "closed"));
  const field = user.team === "field" || user.is_admin;
  const monitoring = user.team === "monitoring" || user.is_admin;
  async function transition(request: FieldRequest, action: "accept" | "complete" | "close") {
    if (pending) return;
    setPending(request.id); setErrors(previous => ({ ...previous, [request.id]: "" }));
    try {
      await api<{ request: FieldRequest }>(`/api/field-requests/${encodeURIComponent(request.id)}/transition`, { method: "POST", body: JSON.stringify({ action, revision: request.revision, result: drafts[request.id] ?? "" }) });
      setConflicts(previous => ({ ...previous, [request.id]: false }));
      await queryClient.invalidateQueries({ queryKey: ["field-requests"] });
    } catch (error) {
      setErrors(previous => ({ ...previous, [request.id]: error instanceof Error ? error.message : "상태를 저장하지 못했습니다." }));
      if (error instanceof ApiError && error.status === 409) setConflicts(previous => ({ ...previous, [request.id]: true }));
    } finally { setPending(null); }
  }
  return <section className="panel field-requests-panel" aria-labelledby="requests-heading">
    <div className="panel-heading"><div><span className="eyebrow">MONITORING ↔ FIELD</span><h2 id="requests-heading">팀 확인 요청 <span className="count-tag">{query.data?.requests.length ?? "—"}</span></h2></div><div className="segmented-control"><button aria-pressed={filter === "open"} onClick={() => setFilter("open")}>진행 중</button><button aria-pressed={filter === "mine"} onClick={() => setFilter("mine")}>내가 맡은 요청</button><button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>전체</button></div></div>
    <p className="request-process">요청 저장 → 현장팀이 맡기 → 현장 결과 남기기 → 모니터링팀이 검토 마치기</p>
    {query.error && <div className="inline-error" role="alert"><AlertCircle size={15} /><span>요청 목록 연결이 끊겼습니다. 화면에 남은 내용은 마지막 조회 결과입니다.</span><button className="text-button" onClick={() => void query.refetch()}>다시 조회</button></div>}
    {query.isPending ? <div className="analysis-empty"><LoaderCircle size={16} className="spin" />팀 요청을 불러오는 중</div> : rows.length === 0 ? <div className="analysis-empty">표시할 요청이 없습니다. 이상 후보의 ‘현장 확인 요청’에서 내용을 남길 수 있습니다.</div> :
      <div className="field-request-list">{rows.map(request => {
        const expanded = opened === request.id;
        const busy = pending === request.id;
        return <article key={request.id} className={`field-request-item ${expanded ? "expanded" : ""}`}>
          <button className="field-request-heading" aria-expanded={expanded} onClick={() => setOpened(expanded ? null : request.id)}>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span className={`request-status status-${request.status}`}>{STATUS[request.status]}</span><strong>{request.title}</strong><small>{request.assigned_to ? `${request.assigned_to.display_name} 담당` : "담당자 미정"}</small></button>
          {expanded && <div className="field-request-body"><div className="field-request-meta"><span>LOT {request.lot_no} · {request.zone_id} · {request.channel_id}</span><span>{dateTime(request.start, true)} — {dateTime(request.end, true)}</span><span>{request.requested_by.display_name} 요청 · 저장 {activityTime(request.created_at)}</span></div><p className="field-request-message">{request.message}</p>
            {request.result && <div className="field-result"><strong>현장 결과</strong><p>{request.result}</p></div>}
            {request.status === "accepted" && request.assigned_to?.username === user.username && <label className="field-result-input">확인한 결과<textarea rows={4} maxLength={4000} value={drafts[request.id] ?? ""} onChange={event => setDrafts(previous => ({ ...previous, [request.id]: event.target.value }))} placeholder="확인한 내용과 조치한 결과를 적어 주세요." disabled={busy} /></label>}
            {errors[request.id] && <div className="form-error" role="alert">{errors[request.id]}{conflicts[request.id] && <button className="text-button" onClick={async () => { await query.refetch(); setConflicts(previous => ({ ...previous, [request.id]: false })); setErrors(previous => ({ ...previous, [request.id]: "최신 상태를 불러왔습니다. 작성한 결과는 남아 있습니다." })); }}>최신 상태 불러오기</button>}</div>}
            <div className="field-request-actions"><button className="subtle-button" onClick={() => onOpenCandidate({ candidate_id: request.candidate_id, dataset_id: request.dataset_id, lot_no: request.lot_no, run_id: request.run_id })}><Crosshair size={14} />요청한 구간 보기</button>
              {field && request.status === "requested" && <button className="primary-button compact" disabled={pending !== null || conflicts[request.id]} onClick={() => void transition(request, "accept")}>{busy ? <LoaderCircle className="spin" size={14} /> : <UserCheck size={14} />}내가 맡기</button>}
              {request.status === "accepted" && request.assigned_to?.username === user.username && <button className="primary-button compact" disabled={pending !== null || !drafts[request.id]?.trim() || conflicts[request.id]} onClick={() => void transition(request, "complete")}>{busy ? <LoaderCircle className="spin" size={14} /> : <Send size={14} />}현장 결과 보내기</button>}
              {monitoring && request.status === "completed" && <button className="primary-button compact" disabled={pending !== null || conflicts[request.id]} onClick={() => void transition(request, "close")}>{busy ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}검토 마치기</button>}
            </div>
          </div>}
        </article>;
      })}</div>}
  </section>;
}
