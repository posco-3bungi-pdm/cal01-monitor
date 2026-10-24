import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Crosshair, LoaderCircle, Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import type { Channel, ChannelSeries, SeriesPoint, TimeRange } from "../types";
import { clockTime, dateTime, numberText, timeIso, timeMs } from "../time";
import type { ChannelBaseline, DetectionCandidate } from "../review-types";
import { incidentAxis, incidentTick } from './incident-axis';
import ReadingValue from './ReadingValue';

const LEFT = 72;
const RIGHT = 22;
const TOP = 24;
const BOTTOM = 178;
const HEIGHT = 244;
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

type Props = {
  live?: boolean;
  channels: Channel[];
  series: ChannelSeries[];
  view: TimeRange;
  fullRange: TimeRange;
  selectedChannel: string;
  selection: TimeRange | null;
  cursor: string | null;
  loading: boolean;
  aggregationSeconds?: number;
  labelIntervals: TimeRange[];
  sourceCount?: number;
  candidates?: DetectionCandidate[];
  focusedCandidate?: DetectionCandidate;
  highlightRange?: TimeRange | null;
  markers?: Record<string, { time: string; value: number; label: string }>;
  onSelectChannel: (channel: string) => void;
  onSelection: (range: TimeRange | null) => void;
  onView: (range: TimeRange) => void;
  onCursor: (time: string) => void;
};

function plotData(points: SeriesPoint[], x: (time: number) => number, baseline?: ChannelBaseline) {
  const values = [...points.flatMap(point => [point.value, point.min, point.max]), baseline?.mean, baseline?.lower, baseline?.upper].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const axis = incidentAxis(values.length ? values : [0, 1]);
  const low = axis.min;
  const high = axis.max;
  const y = (value: number) => BOTTOM - (value - low) / (high - low) * (BOTTOM - TOP);
  const segments: SeriesPoint[][] = [];
  let segment: SeriesPoint[] = [];
  points.forEach(point => {
    const valid = point.value !== null && Number.isFinite(point.value) && Number.isFinite(timeMs(point.time));
    if (!valid || point.gap_before) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (valid) segment.push(point);
  });
  if (segment.length) segments.push(segment);
  const lines = segments.map(points => points.map((point, index) => `${index ? "L" : "M"}${x(timeMs(point.time)).toFixed(2)},${y(point.value!).toFixed(2)}`).join(" "));
  const bands = segments.map(points => {
    if (!points.some(point => point.min != null && point.max != null && point.min !== point.max)) return "";
    const top = points.map((point, index) => `${index ? "L" : "M"}${x(timeMs(point.time)).toFixed(2)},${y(point.max ?? point.value!).toFixed(2)}`).join(" ");
    const bottom = [...points].reverse().map(point => `L${x(timeMs(point.time)).toFixed(2)},${y(point.min ?? point.value!).toFixed(2)}`).join(" ");
    return `${top} ${bottom} Z`;
  }).filter(Boolean);
  return { lines, bands, y, low, high, segments, empty: segments.length === 0 };
}

function ChartRow({ channel, data, index, view, selection, cursor, selected, labels, aggregated, candidates, focusedCandidate, live, highlightRange, marker, onSelect, onSelection, onCursor, onLabelZoom }: {
  live?: boolean;
  channel: Channel;
  data?: ChannelSeries;
  index: number;
  view: TimeRange;
  selection: TimeRange | null;
  cursor: string | null;
  selected: boolean;
  labels: TimeRange[];
  aggregated: boolean;
  candidates: DetectionCandidate[];
  focusedCandidate?: DetectionCandidate;
  highlightRange?: TimeRange | null;
  marker?: { time: string; value: number; label: string };
  onSelect: () => void;
  onSelection: (range: TimeRange | null) => void;
  onCursor: (time: string) => void;
  onLabelZoom: (range: TimeRange) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(680);
  useLayoutEffect(() => {
    const node = svg.current;
    if (!node) return;
    const sync = () => setWidth(Math.max(280, node.getBoundingClientRect().width));
    const observer = new ResizeObserver(sync); observer.observe(node); sync();
    return () => observer.disconnect();
  }, []);
  const gesture = useRef<{ id: number; startX: number; startTime: number; original: TimeRange | null } | null>(null);
  const [dragging, setDragging] = useState(false);
  const start = timeMs(view.start);
  const end = timeMs(view.end);
  const duration = Math.max(1, end - start);
  const plotWidth = width - LEFT - RIGHT;
  const x = (time: number) => LEFT + (time - start) / duration * plotWidth;
  const points = data?.points ?? [];
  const baseline = focusedCandidate?.baseline;
  const plot = useMemo(() => plotData(points, x, baseline), [points, start, end, baseline, width]);
  const color = COLORS[index % COLORS.length];
  const cursorMs = cursor ? timeMs(cursor) : Number.NaN;
  const nearest = Number.isFinite(cursorMs) ? points.reduce<SeriesPoint | null>((best, point) =>
    point.value === null ? best : !best || Math.abs(timeMs(point.time) - cursorMs) < Math.abs(timeMs(best.time) - cursorMs) ? point : best, null) : null;
  const selectionX = selection ? Math.max(LEFT, x(timeMs(selection.start))) : 0;
  const selectionEnd = selection ? Math.min(width - RIGHT, x(timeMs(selection.end))) : 0;
  const clipId = `chart-clip-${channel.id.replace(/[^a-zA-Z0-9]/g, "-")}`;
  const tickScale = channel.id === 'CP-Z4M' ? 1e-10 : 1;

  function pointerTime(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const pixel = (event.clientX - rect.left) / rect.width * width;
    return Math.max(start, Math.min(end, start + (pixel - LEFT) / plotWidth * duration));
  }

  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || (event.target as Element).closest("[data-label]")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const y = (event.clientY - rect.top) / rect.height * HEIGHT;
    if (y > BOTTOM + 4) return;
    event.preventDefault();
    onSelect();
    gesture.current = { id: event.pointerId, startX: event.clientX, startTime: pointerTime(event), original: selection };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (Math.abs(event.clientX - active.startX) < 4) return;
    const time = pointerTime(event);
    onSelection({ start: timeIso(Math.min(active.startTime, time)), end: timeIso(Math.max(active.startTime, time)) });
  }

  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (Math.abs(event.clientX - active.startX) < 4) onCursor(timeIso(pointerTime(event)));
    else {
      const time = pointerTime(event);
      onSelection({ start: timeIso(Math.min(active.startTime, time)), end: timeIso(Math.max(active.startTime, time)) });
    }
    gesture.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <article className={`channel-chart ${selected ? "is-selected" : ""}`}>
    <div className="chart-row-heading">
      <button className="chart-channel-title" onClick={onSelect} aria-pressed={selected}>
        <span className="channel-color" style={{ background: color }} />
        <strong>{channel.id}</strong><span>{channel.label !== channel.id ? channel.label : channel.zone}</span>
      </button>
      <div className="chart-reading">{nearest ? <>{aggregated && <span>요약 평균</span>}<ReadingValue channelId={channel.id} value={nearest.value} unit={channel.unit} /><small>{clockTime(nearest.time, true)}</small></> : <span>{points.length ? "그래프를 눌러 시각 선택" : "이 구간에 관측값 없음"}</span>}</div>
    </div>
    {baseline && <div className="baseline-description">이번 LOT 원자료 전체 기준 · 평균 {numberText(baseline.mean)} · 평균 − 3σ {numberText(baseline.lower)} · 평균 + 3σ {numberText(baseline.upper)} {channel.unit ?? ""}</div>}
    <svg ref={svg} viewBox={`0 0 ${width} ${HEIGHT}`} style={{ height: HEIGHT }} className={`series-svg ${dragging ? "is-dragging" : ""}`}
      role="group" aria-label={`${channel.id} 채널, ${dateTime(view.start)}부터 ${dateTime(view.end)}까지. 드래그해 구간 선택, 클릭해 관측 시각 선택`}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
      onPointerCancel={() => {
        if (gesture.current) onSelection(gesture.current.original);
        gesture.current = null;
        setDragging(false);
      }}>
      <defs><clipPath id={clipId}><rect x={LEFT} y={TOP - 2} width={plotWidth} height={BOTTOM - TOP + 4} /></clipPath></defs>
      {tickScale !== 1 && <text className="chart-axis-label" x="6" y="14">e⁻¹⁰</text>}
      {[0, 1, 2, 3].map(tick => {
        const value = plot.low + (plot.high - plot.low) * tick / 3;
        return <g key={`y-${tick}`}><line className="chart-grid" x1={LEFT} x2={width - RIGHT} y1={plot.y(value)} y2={plot.y(value)} /><text className="chart-axis-label" x={LEFT - 12} y={plot.y(value) + 4} textAnchor="end">{incidentTick(value / tickScale, (plot.high - plot.low) / tickScale / 3)}</text></g>;
      })}
      {(width < 600 ? [0, .5, 1] : [0, .25, .5, .75, 1]).map(fraction => {
        const t = start + duration * fraction;
        return <g key={`x-${fraction}`}><line className="chart-grid vertical" x1={x(t)} x2={x(t)} y1={TOP} y2={BOTTOM} /><text className="chart-axis-label" x={x(t)} y={HEIGHT - 12} textAnchor={fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"}>{clockTime(t, duration < 300_000)}</text></g>;
      })}
      <g clipPath={`url(#${clipId})`}>
        {highlightRange && <g pointerEvents="none"><rect className="live-event-band" x={x(timeMs(highlightRange.start))} y={TOP} width={Math.max(2, x(timeMs(highlightRange.end)) - x(timeMs(highlightRange.start)))} height={BOTTOM - TOP} />
          <text className="live-event-band-label" x={Math.max(LEFT + 5, x(timeMs(highlightRange.start)) + 5)} y={TOP + 14}>감지 구간</text></g>}
        {candidates.map(candidate => {
          const a = Math.max(LEFT, x(timeMs(candidate.start))), b = Math.min(width - RIGHT, x(timeMs(candidate.end)));
          if (b < LEFT || a > width - RIGHT || b < a) return null;
          return <rect key={candidate.id} className={`candidate-time-band ${focusedCandidate?.id === candidate.id ? "focused" : ""}`} x={a} y={TOP} width={Math.max(1.2, b - a)} height={BOTTOM - TOP} pointerEvents="none" />;
        })}
        {baseline && ([["평균 − 3σ", baseline.lower], ["평균", baseline.mean], ["평균 + 3σ", baseline.upper]] as const).map(([name, raw]) => {
          if (typeof raw !== "number") return null;
          return <g key={name} pointerEvents="none"><line className={`baseline-line ${name === "평균" ? "mean" : ""}`} x1={LEFT} x2={width - RIGHT} y1={plot.y(raw)} y2={plot.y(raw)} /><text className="baseline-label" x={width - RIGHT - 4} y={plot.y(raw) - 4} textAnchor="end">{name}</text></g>;
        })}
        {selection && selectionEnd >= selectionX && <rect className="selected-time-band" x={selectionX} y={TOP} width={Math.max(1.5, selectionEnd - selectionX)} height={BOTTOM - TOP} />}
        {plot.bands.map((path, i) => <path key={`band-${i}`} d={path} fill={color} fillOpacity={0.13} />)}
        {plot.lines.map((path, i) => <path key={i} d={path} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />)}
        {plot.segments.filter(segment => segment.length === 1).map((segment, i) => <circle key={`dot-${i}`} cx={x(timeMs(segment[0].time))} cy={plot.y(segment[0].value!)} r={2.5} fill={color} />)}
        {Number.isFinite(cursorMs) && cursorMs >= start && cursorMs <= end && <line className="shared-time-cursor" x1={x(cursorMs)} x2={x(cursorMs)} y1={TOP} y2={BOTTOM} />}
        {marker && <g className="live-observation-marker" pointerEvents="none"><circle cx={x(timeMs(marker.time))} cy={plot.y(marker.value)} r={4} /><title>{marker.label} · {clockTime(marker.time, true)} · {numberText(marker.value)}</title></g>}
      </g>
      {plot.empty && <text className="empty-chart-label" x={width / 2} y={TOP + 60} textAnchor="middle">표시할 관측값이 없습니다</text>}
      <line className="label-rail-base" x1={LEFT} x2={width - RIGHT} y1={BOTTOM + 22} y2={BOTTOM + 22} />
      <text className="chart-rail-label" x={LEFT - 12} y={BOTTOM + 26} textAnchor="end">LABEL 1</text>
      {labels.map((range, i) => {
        const rawLeft = x(timeMs(range.start));
        const rawRight = x(timeMs(range.end));
        if (rawRight < LEFT || rawLeft > width - RIGHT) return null;
        const left = Math.max(LEFT, rawLeft);
        const right = Math.min(width - RIGHT, rawRight);
        const previousEnd = i > 0 ? x(timeMs(labels[i - 1].end)) : LEFT;
        const nextStart = i + 1 < labels.length ? x(timeMs(labels[i + 1].start)) : width - RIGHT;
        // Share only the gap between adjacent intervals. A wide invisible target
        // must never cover the neighbouring interval, even at full-LOT scale.
        const hitLeft = Math.max(LEFT, left - 4, (previousEnd + left) / 2);
        const hitRight = Math.min(width - RIGHT, right + 4, (right + nextStart) / 2);
        const hitWidth = Math.max(0, hitRight - hitLeft);
        const visibleWidth = Math.min(hitWidth, Math.max(2, right - left));
        const visibleLeft = Math.max(hitLeft, Math.min(left, hitRight - visibleWidth));
        return <g key={i} data-label="true" role={live ? "img" : "button"} tabIndex={live ? undefined : 0}
          aria-label={`${channel.id} LABEL 1 구간 ${dateTime(range.start, true)}부터 ${dateTime(range.end, true)} ${live ? "표시" : "확대"}`}
          onClick={() => { if (!live) onLabelZoom(range); }}
          onKeyDown={event => { if (!live && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onLabelZoom(range); } }}>
          <rect className="label-rail-hit" x={hitLeft} y={BOTTOM + 11} width={hitWidth} height={22} fill="transparent" />
          <rect className="label-rail-segment" x={visibleLeft} y={BOTTOM + 18} width={visibleWidth} height={8} pointerEvents="none" />
          <title>{`${dateTime(range.start, true)} ~ ${dateTime(range.end, true)} · LABEL=1`}</title>
        </g>;
      })}
      {!labels.length && <text className="chart-rail-empty" x={LEFT + 8} y={BOTTOM + 26}>이 구간에 LABEL=1 없음</text>}
    </svg>
  </article>;
}

export default function ChannelCharts(props: Props) {
  const { channels, series, view, fullRange, selection, loading } = props;
  const data = new Map(series.map(item => [item.channel_id, item]));
  const viewStart = timeMs(view.start);
  const viewEnd = timeMs(view.end);
  const fullStart = timeMs(fullRange.start);
  const fullEnd = timeMs(fullRange.end);
  const zoomed = viewStart > fullStart || viewEnd < fullEnd;

  function clampRange(start: number, end: number): TimeRange {
    return { start: timeIso(Math.max(fullStart, start)), end: timeIso(Math.min(fullEnd, end)) };
  }

  function zoomTo(range: TimeRange) {
    const start = timeMs(range.start);
    const end = timeMs(range.end);
    const padding = Math.max(1000, (end - start) * 0.08);
    props.onView(clampRange(start - padding, end + padding));
  }

  function adjustView(factor: number) {
    const center = (viewStart + viewEnd) / 2;
    const half = Math.max(1000, (viewEnd - viewStart) * factor / 2);
    props.onView(clampRange(center - half, center + half));
  }

  const selectionToolbar = selection && <div className="selection-toolbar">
    <div><span className="selection-dot" /><strong>선택한 구간</strong><span>{dateTime(selection.start, true)} — {dateTime(selection.end, true)}</span></div>
    <div className="button-row"><button className="primary-button compact" onClick={() => zoomTo(selection)}><Maximize2 size={14} />이 구간 확대</button><button className="subtle-button" onClick={() => props.onSelection(null)}>선택 해제</button></div>
  </div>;

  return <section className="panel trends-panel" aria-labelledby="trends-heading">
    <div className="panel-heading chart-panel-heading">
      <div><span className="eyebrow">CHANNEL TRENDS</span><h2 id="trends-heading">{props.live ? "도착한 채널값" : "같은 시각의 채널값"} <span className="count-tag">{channels.length}</span></h2></div>
      <div className="chart-tools">
        <button className="icon-button" aria-label="그래프 시간 범위 넓게 보기" title="시간 범위 넓게" onClick={() => adjustView(1.6)} disabled={!zoomed}><Minus size={16} /></button>
        <button className="icon-button" aria-label="그래프 시간 범위 좁게 보기" title="시간 범위 좁게" onClick={() => adjustView(0.65)}><Plus size={16} /></button>
        {!props.live && <button className="subtle-button" onClick={() => props.onView(fullRange)} disabled={!zoomed}><RotateCcw size={14} />LOT 전체</button>}
      </div>
    </div>
    <div className="chart-context-line">
      <span>{dateTime(view.start)} <span className="muted">—</span> {dateTime(view.end)}</span>
      <span className="muted">{props.sourceCount !== undefined ? `${props.sourceCount.toLocaleString()}개 원자료` : ""}{props.aggregationSeconds !== undefined ? ` · ${props.aggregationSeconds === 0 ? "원자료 그대로" : `${props.aggregationSeconds}초 단위 요약`}` : ""}</span>
    </div>
    <div className="chart-legend"><span><i className="legend-yellow" />선택한 구간</span>{props.labelIntervals.length > 0 && <span><i className="legend-label" />CSV 원본 LABEL=1</span>}{props.highlightRange && <span><i className="legend-candidate" />모델 감지 구간</span>}{(props.candidates?.length ?? 0) > 0 && <span><i className="legend-candidate" />이번 분석의 통계적 후보</span>}<span><Crosshair size={12} />클릭한 시각 → 3D 계측값</span></div>
    {props.live && selectionToolbar}
    {loading && <div className="loading-bar" role="status" aria-label="채널 데이터 불러오는 중" />}
    {channels.length === 0 ? <div className="empty-state">위에서 표시할 채널을 선택해 주세요.</div> :
      loading && series.length === 0 ? <div className="data-loading" role="status"><LoaderCircle size={19} className="spin" />채널값을 불러오는 중</div> :
      <div className="charts-stack" aria-busy={loading}>
        {channels.map((channel, index) => <ChartRow live={props.live} key={channel.id} channel={channel} data={data.get(channel.id)} index={index}
          view={view} selection={selection} cursor={props.cursor} selected={props.selectedChannel === channel.id}
          labels={props.labelIntervals} aggregated={(props.aggregationSeconds ?? 0) > 0}
          candidates={(props.candidates ?? []).filter(candidate => candidate.channel_id === channel.id)}
          focusedCandidate={props.focusedCandidate?.channel_id === channel.id ? props.focusedCandidate : undefined}
          highlightRange={props.highlightRange} marker={props.markers?.[channel.id]}
          onSelect={() => props.onSelectChannel(channel.id)} onSelection={props.onSelection} onCursor={props.onCursor}
          onLabelZoom={range => { props.onSelectChannel(channel.id); props.onSelection(range); zoomTo(range); }} />)}
      </div>}
    {!props.live && selectionToolbar}
    <p className="panel-footnote">{props.live ? '수신한 기록만 표시합니다. 드래그로 구간을 선택한 뒤 확대할 수 있습니다.' : '원자료에 기록된 시각을 그대로 표시합니다.'} {props.aggregationSeconds ? "선은 요약 평균, 옅은 음영은 최솟값~최댓값입니다. " : ""}{props.labelIntervals.length > 0 && '분홍 표시는 CSV 원본의 LABEL=1이며 모델의 감지 구간과 별개입니다.'}</p>
  </section>;
}
