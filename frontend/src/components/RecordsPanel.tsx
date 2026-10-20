import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, ChevronDown, ChevronRight, LoaderCircle, Minus, Plus } from "lucide-react";
import { api, queryString } from "../api";
import { dateTime, timeIso, timeMs } from "../time";
import type { TimeRange } from "../types";

type RecordKind = "operation" | "plan" | "detection" | "maintenance" | "parts";
type ContextRecord = {
  id: string; type: RecordKind; start: string; end: string | null;
  precision: string; title: string; equipment: string; description: string;
  source: string; sourceId: string; details: Record<string, unknown>;
  end_inclusive?: boolean;
};
type RecordsResponse = {
  records: ContextRecord[]; count: number;
  counts_by_kind: Record<RecordKind, number>;
};
const DAY = 86_400_000;
const KINDS: { id: RecordKind; name: string; color: string }[] = [
  { id: "operation", name: "조업 기록", color: "#87ae9e" },
  { id: "plan", name: "정기수리 계획", color: "#a3bc71" },
  { id: "detection", name: "정비 이력의 이상 감지", color: "#dba55f" },
  { id: "maintenance", name: "실제 정비 작업", color: "#a698dc" },
  { id: "parts", name: "부품 교체와 연결된 작업", color: "#d18c9d" },
];

function recordBounds(record: ContextRecord): [number, number] {
  if (record.precision === "date") {
    return [timeMs(`${record.start.slice(0, 10)}T00:00:00`), timeMs(`${(record.end ?? record.start).slice(0, 10)}T00:00:00`) + DAY];
  }
  return [timeMs(record.start), timeMs(record.end ?? record.start)];
}

function recordTime(record: ContextRecord) {
  if (record.precision === "date") {
    return `${record.start.slice(0, 10)}${record.end && record.end !== record.start ? ` ~ ${record.end.slice(0, 10)}` : ""} · 날짜로 기록된 계획`;
  }
  return `${dateTime(record.start, true)}${record.end && record.end !== record.start ? ` ~ ${dateTime(record.end, true)}` : ""}`;
}

export default function RecordsPanel({ datasetId, view }: { datasetId: string; view: TimeRange }) {
  const [beforeDays, setBeforeDays] = useState(3);
  const [afterDays, setAfterDays] = useState(3);
  const [openKind, setOpenKind] = useState<RecordKind | null>(null);
  const start = timeMs(view.start) - beforeDays * DAY;
  const end = timeMs(view.end) + afterDays * DAY;
  const span = Math.max(1, end - start);
  const left = (time: number) => (time - start) / span * 100;
  const query = useQuery({
    queryKey: ["records", datasetId, start, end],
    queryFn: ({ signal }) => api<RecordsResponse>(`/api/records?${queryString({ dataset: datasetId, start: timeIso(start), end: timeIso(end) })}`, { signal }),
    enabled: !!datasetId,
  });
  const rows = query.data?.records ?? [];

  return <section className="panel records-panel" aria-labelledby="records-heading">
    <div className="panel-heading">
      <div><span className="eyebrow">OPERATIONS / MAINTENANCE</span><h2 id="records-heading">이 구간 앞뒤의 기록 <span className="count-tag">{query.data?.count ?? "—"}</span></h2></div>
      <div className="record-day-controls">
        <div><span>앞으로</span><button className="icon-button" aria-label="앞쪽 기록 기간 하루 줄이기" disabled={beforeDays === 0} onClick={() => setBeforeDays(value => value - 1)}><Minus size={13} /></button><strong>{beforeDays}일</strong><button className="icon-button" aria-label="앞쪽 기록 기간 하루 늘리기" disabled={beforeDays >= 31} onClick={() => setBeforeDays(value => value + 1)}><Plus size={13} /></button></div>
        <div><span>뒤로</span><button className="icon-button" aria-label="뒤쪽 기록 기간 하루 줄이기" disabled={afterDays === 0} onClick={() => setAfterDays(value => value - 1)}><Minus size={13} /></button><strong>{afterDays}일</strong><button className="icon-button" aria-label="뒤쪽 기록 기간 하루 늘리기" disabled={afterDays >= 31} onClick={() => setAfterDays(value => value + 1)}><Plus size={13} /></button></div>
      </div>
    </div>
    <div className="record-context"><CalendarDays size={14} /><span>{dateTime(start)} — {dateTime(end)}</span><span className="record-current-key"><i />위 그래프에 표시된 시간</span></div>
    <p className="record-help">기록을 찾는 기간만 넓힙니다. 위 채널 그래프의 확대 범위는 그대로입니다.</p>
    {query.isFetching && <div className="loading-bar" role="status" aria-label="조업과 정비 기록 불러오는 중" />}
    {query.error && <div className="inline-error" role="alert"><AlertCircle size={15} /><span>{query.error instanceof Error ? query.error.message : "기록을 불러오지 못했습니다."}</span><button className="text-button" onClick={() => void query.refetch()}>다시 시도</button></div>}
    <div className="records-timeline" aria-busy={query.isFetching}>
      {KINDS.map(kind => {
        const records = rows.filter(record => record.type === kind.id);
        const expanded = openKind === kind.id;
        return <div className={`record-kind ${expanded ? "is-expanded" : ""}`} key={kind.id}>
          <button className="record-kind-header" aria-expanded={expanded} onClick={() => setOpenKind(expanded ? null : kind.id)}>
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<i style={{ background: kind.color }} /><span>{kind.name}</span><small>{query.isPending ? "…" : `${records.length}건`}</small>
          </button>
          <div className="record-kind-track" aria-label={`${kind.name} 시간대`}>
            <span className="record-graph-window" style={{ left: `${left(timeMs(view.start))}%`, width: `${(timeMs(view.end) - timeMs(view.start)) / span * 100}%` }} />
            {records.map(record => {
              const [a, b] = recordBounds(record);
              const l = Math.max(0, left(a));
              const r = Math.min(100, left(b));
              return <button key={record.id} className={`record-marker ${record.precision === "date" ? "is-planned" : ""}`}
                style={{ left: `${l}%`, width: `max(3px, ${Math.max(0, r - l)}%)`, backgroundColor: kind.color }}
                title={`${record.title} · ${recordTime(record)}`} aria-label={`${record.title}, ${recordTime(record)}. 기록 펼치기`}
                onClick={() => setOpenKind(kind.id)} />;
            })}
            {!records.length && !query.isPending && <span className="record-track-empty">이 기간에 기록 없음</span>}
          </div>
          {expanded && <div className="record-details">
            {records.length === 0 ? <p className="muted">이 기간에 등록된 {kind.name}이 없습니다.</p> : records.map(record => <article key={record.id}>
              <header><span className="record-time">{recordTime(record)}</span><span className="technical-tag">{record.equipment}</span></header>
              <h3>{record.title}</h3>
              {record.description && <p>{record.description}</p>}
              {record.precision === "linked-work" && <p className="record-precision-note">표시된 시간은 부품 교체와 연결된 정비 작업 구간입니다. 부품을 실제 교체한 시각을 뜻하지 않습니다.</p>}
              {record.type === "detection" && <p className="record-precision-note">정비 이력에 적힌 감지 시각입니다. 이번 화면에서 새로 감지한 경고가 아닙니다.</p>}
              <footer>{record.source}{record.sourceId ? ` · ${record.sourceId}` : ""}</footer>
            </article>)}
          </div>}
        </div>;
      })}
      <div className="record-axis"><span>{dateTime(start)}</span><span>{dateTime((start + end) / 2)}</span><span>{dateTime(end)}</span></div>
    </div>
    {query.isPending && <div className="record-loading"><LoaderCircle size={15} className="spin" />기록 불러오는 중</div>}
  </section>;
}
