import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, ChevronDown, ChevronRight, Crosshair, LoaderCircle, Plus, Search, Send, UserCheck, ClipboardList } from "lucide-react";
import { api, ApiError } from "../api";
import { activityTime } from "../review-types";
import type { FieldRequest } from "../review-types";
import type { User } from "../types";
import { dateTime } from "../time";

const STATUS = { requested: "접수 대기", accepted: "점검 중", completed: "결과 검토 대기", closed: "처리 종료" };
export default function FieldRequestsPanel({ user, selectedRequestId, focusRevision, onOpenRequest, onCreate, canCreate }: {
  user: User; selectedRequestId: string | null; focusRevision: number; onOpenRequest: (request: FieldRequest) => void;
  onCreate: () => void; canCreate: boolean;
}) {
  const queryClient = useQueryClient();
  const [opened, setOpened] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "mine" | "open">("open");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<FieldRequest['status'] | 'all'>("all");
  const [pinned, setPinned] = useState<string | null>(null);
  useEffect(() => { if (selectedRequestId) { setOpened(selectedRequestId); setPinned(selectedRequestId); } }, [selectedRequestId, focusRevision]);
  const query = useQuery({ queryKey: ["field-requests"], queryFn: ({ signal }) => api<{ requests: FieldRequest[] }>("/api/field-requests", { signal }), refetchInterval: 5000 });
  const allRows = query.data?.requests ?? [];
  const rows = allRows.filter(request => request.id === pinned || ((filter === "all" || (filter === "mine" ? request.assigned_to?.username === user.username || request.requested_by.username === user.username : request.status !== "closed")) && (status === 'all' || request.status === status) && `${request.lot_no} ${request.zone_id} ${request.channel_id} ${request.title} ${request.assigned_to?.display_name ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())));
  const field = user.team === "field" || user.is_admin;
  const monitoring = user.team === "monitoring" || user.is_admin;
  async function transition(request: FieldRequest, action: "accept" | "complete" | "close") {
    if (pending) return;
    setPending(request.id); setErrors(previous => ({ ...previous, [request.id]: "" }));
    try {
      await api<{ request: FieldRequest }>(`/api/field-requests/${encodeURIComponent(request.id)}/transition`, { method: "POST", body: JSON.stringify({ action, revision: request.revision, result: drafts[request.id] ?? "" }) });
      setConflicts(previous => ({ ...previous, [request.id]: false }));
      if (action === 'complete') setDrafts(previous => { const next = { ...previous }; delete next[request.id]; return next; });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["field-requests"] }), queryClient.invalidateQueries({ queryKey: ["detection-pending"] }), queryClient.invalidateQueries({ queryKey: ["detection-candidates"] })]);
    } catch (error) {
      setErrors(previous => ({ ...previous, [request.id]: error instanceof Error ? error.message : "상태를 저장하지 못했습니다." }));
      if (error instanceof ApiError && error.status === 409) setConflicts(previous => ({ ...previous, [request.id]: true }));
    } finally { setPending(null); }
  }
  const hasDraft = Object.values(drafts).some(value => value.trim());
  const nextAction = (request: FieldRequest) => request.status === 'requested' ? (field ? '요청을 확인하고 담당 접수' : '점검 담당자의 접수 대기') : request.status === 'accepted' ? (request.assigned_to?.username === user.username ? '점검 결과 작성' : `${request.assigned_to?.display_name ?? '담당자'}의 점검 결과 대기`) : request.status === 'completed' ? (monitoring ? '결과와 이후 관측값 검토' : '요청자의 검토 대기') : '처리 종료 · 기록 확인 가능';
  return <section className="panel field-requests-panel" aria-labelledby="requests-heading" data-preserve-outside={hasDraft || pending !== null ? 'true' : 'false'}>
    <div className="request-compose"><button className="primary-button compact" onClick={onCreate} disabled={!canCreate}><Plus size={16} />새 점검 요청</button><span>이상 후보 없이도 구간을 지정해 요청</span></div>
    <div className="panel-heading"><div><span className="eyebrow">CAL01 / TEAM REQUESTS</span><h2 id="requests-heading">팀 확인 요청 <span className="count-tag">{query.data?.requests.length ?? "—"}</span></h2></div><div className="segmented-control"><button aria-pressed={filter === "open"} onClick={() => { setFilter("open"); setPinned(null); }}>미종료</button><button aria-pressed={filter === "mine"} onClick={() => { setFilter("mine"); setPinned(null); }}>내 관련 요청</button><button aria-pressed={filter === "all"} onClick={() => { setFilter("all"); setPinned(null); }}>전체</button></div></div>
    <div className="request-status-summary" aria-label="요청 상태별 건수">{(Object.keys(STATUS) as FieldRequest['status'][]).map(item => <button key={item} aria-pressed={status === item} onClick={() => { setStatus(status === item ? 'all' : item); setFilter('all'); setPinned(null); }}><strong>{query.isPending || query.error && !query.data ? '—' : allRows.filter(request => request.status === item).length}</strong><span>{STATUS[item]}</span></button>)}</div>
    <label className="request-search"><Search size={17} /><span className="visually-hidden">요청 검색</span><input type="search" value={search} onChange={event => { setSearch(event.target.value); setPinned(null); }} placeholder="LOT·구역·채널·담당자 검색" /></label>
    <details className="request-process request-help"><summary>요청 처리 순서</summary><p>요청 작성 → 담당자 접수 → 점검 결과 등록 → 결과 검토·처리 종료</p><p>알림 확인과 점검 완료는 별개다. 결과 등록 후에도 이후 관측값을 확인한다. 작성 중인 점검 결과는 화면 밖을 눌러도 닫히지 않는다.</p></details>
    {query.error && <div className="inline-error" role="alert"><AlertCircle size={15} /><span>요청 목록 연결이 끊겼습니다. 화면에 남은 내용은 마지막 조회 결과입니다.</span><button className="text-button" onClick={() => void query.refetch()}>다시 조회</button></div>}
    {query.isPending ? <div className="analysis-empty"><LoaderCircle size={16} className="spin" />팀 요청을 불러오는 중</div> : rows.length === 0 ? <div className="analysis-empty request-empty"><ClipboardList size={26} /><strong>{allRows.length ? '조건에 맞는 요청 없음' : '등록된 점검 요청 없음'}</strong><p>{allRows.length ? '검색어와 상태 필터를 확인한다.' : '이상 후보 → 구간·대응 가이드 확인 → 점검 요청 작성'}</p><small>요청하면 LOT·채널·구간과 담당 상태를 이곳에서 함께 확인할 수 있다.</small></div> :
      <div className="field-request-list">{rows.map(request => {
        const expanded = opened === request.id;
        const busy = pending === request.id;
        return <article key={request.id} className={`field-request-item ${expanded ? "expanded" : ""}`}>
          <button className="field-request-heading" aria-expanded={expanded} onClick={() => setOpened(expanded ? null : request.id)}>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span className={`request-status status-${request.status}`}>{STATUS[request.status]}</span><strong>{request.title}</strong><small>{request.assigned_to ? `${request.assigned_to.display_name} 담당` : "담당자 미정"}</small></button>
          <div className="request-card-overview"><span>LOT {request.lot_no} · {request.zone_id} · {request.channel_id}</span><small>{request.candidate_id ? '이상 후보 연결' : '직접 작성'}</small><span className="request-next-action">다음: {nextAction(request)}</span><small>최근 변경 {activityTime(request.updated_at)}</small></div>
          {expanded && <div className="field-request-body"><div className="field-request-meta"><span>LOT {request.lot_no} · {request.zone_id} · {request.channel_id}</span><span>{dateTime(request.start, true)} — {dateTime(request.end, true)}</span><span>{request.requested_by.display_name} 요청 · 저장 {activityTime(request.created_at)}</span></div><p className="field-request-message">{request.message}</p>
            {request.result && <div className="field-result"><strong>현장 결과</strong><p>{request.result}</p></div>}
            {request.status === "accepted" && request.assigned_to?.username === user.username && <label className="field-result-input">확인한 결과<textarea rows={4} maxLength={4000} value={drafts[request.id] ?? ""} onChange={event => setDrafts(previous => ({ ...previous, [request.id]: event.target.value }))} placeholder="확인한 내용과 조치한 결과를 적어 주세요." disabled={busy} /></label>}
            {errors[request.id] && <div className="form-error" role="alert">{errors[request.id]}{conflicts[request.id] && <button className="text-button" onClick={async () => { await query.refetch(); setConflicts(previous => ({ ...previous, [request.id]: false })); setErrors(previous => ({ ...previous, [request.id]: "최신 상태를 불러왔습니다. 작성한 결과는 남아 있습니다." })); }}>최신 상태 불러오기</button>}</div>}
            <div className="field-request-actions"><button className="subtle-button" onClick={() => onOpenRequest(request)}><Crosshair size={14} />요청한 구간 보기</button>
              {field && request.status === "requested" && <button className="primary-button compact" disabled={pending !== null || conflicts[request.id]} onClick={() => void transition(request, "accept")}>{busy ? <LoaderCircle className="spin" size={14} /> : <UserCheck size={14} />}내가 맡기</button>}
              {request.status === "accepted" && request.assigned_to?.username === user.username && <button className="primary-button compact" disabled={pending !== null || !drafts[request.id]?.trim() || conflicts[request.id]} onClick={() => void transition(request, "complete")}>{busy ? <LoaderCircle className="spin" size={14} /> : <Send size={14} />}현장 결과 보내기</button>}
              {monitoring && request.status === "completed" && <button className="primary-button compact" disabled={pending !== null || conflicts[request.id]} onClick={() => void transition(request, "close")}>{busy ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}검토 마치기</button>}
            </div>
          </div>}
        </article>;
      })}</div>}
  </section>;
}
