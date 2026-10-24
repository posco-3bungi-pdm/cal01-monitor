import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Radio } from 'lucide-react'
import { api, queryString } from './api'
import type { Channel, SeriesResponse, TimeRange } from './types'
import type { SimulationFrame } from './live-simulation'
import type { ModelEvent } from './model-predictions'
import { accumulatedLiveSeries, liveRangeLots } from './live-trends'
import type { LiveTrendHistory } from './live-trends'
import { dateTime, timeIso, timeMs } from './time'
import { observedEventChanges } from './live-evidence'
import ChannelCharts from './components/ChannelCharts'
import LiveEventEvidence from './LiveEventEvidence'

export default function LiveSimulationCharts({ frames, trends, firstTime, cursor, channels, selectedChannel, onSelectChannel, datasetId, focus, focusLot, event, onRange, onCursor, onLive, onRequest, readOnly = false }: {
  frames: SimulationFrame[]; firstTime?: string; cursor: string | null; channels: Channel[]; selectedChannel: string; onSelectChannel: (id: string) => void;
  trends: LiveTrendHistory;
  datasetId: string; focus: TimeRange | null; focusLot?: string; event: ModelEvent | null;
  onRange: (range: TimeRange) => void; onCursor: (time: string) => void; onLive: () => void; onRequest: (event: ModelEvent) => void; readOnly?: boolean;
}) {
  const [selection, setSelection] = useState<TimeRange | null>(null)
  const latest = frames.at(-1)
  const data = useMemo(() => accumulatedLiveSeries(trends, channels, focus ? undefined : latest?.lot_no), [trends, channels, Boolean(focus), latest?.lot_no])
  const sessionFirst = firstTime ? timeMs(firstTime) : trends.first ? timeMs(trends.first.time) : NaN
  const first = focus ? sessionFirst : data.view ? timeMs(data.view.start) : sessionFirst
  const range = latest ? { start: timeIso(Math.max(first, timeMs(focus?.start ?? data.view?.start ?? latest.time))),
    end: timeIso(Math.min(timeMs(latest.time), timeMs(focus?.end ?? latest.time))) } : null
  const rangeLots = focus ? liveRangeLots(trends, range) : []
  const multipleLots = rangeLots.length > 1
  const queryLot = rangeLots[0] ?? focusLot ?? latest?.lot_no
  const query = useQuery({
    queryKey: ['arrived-review-series', datasetId, queryLot, channels.map(item => item.id).join(','), focus ? range?.start : '', focus ? range?.end : ''],
    enabled: !!datasetId && !!latest && !!focus && !!range && !multipleLots && channels.length > 0,
    queryFn: ({ signal }) => api<SeriesResponse>('/api/series?' + queryString({ dataset: datasetId, lot: queryLot,
      channels: channels.map(item => item.id).join(','), start: range?.start, end: range?.end, max_points: 1000 }), { signal }),
  })
  const review = !multipleLots && focus ? query.data : undefined
  const buffered = focus && range ? data.series.map(item => ({ ...item,
    points: item.points.filter(point => timeMs(point.time) >= timeMs(range.start) && timeMs(point.time) <= timeMs(range.end)) })) : data.series
  const series = review?.series ?? buffered
  const markers = useMemo(() => event ? Object.fromEntries(observedEventChanges(series, event).filter(row => row.peak).map(row => [row.channelId, row.peak!])) : {}, [series, event])
  return <div className="simulation-trends">
    <div className="simulation-chart-heading"><strong>{event ? '감지 구간 확인' : focus ? '이전 수신 기록' : `현재 코일 LOT ${latest?.lot_no ?? '—'} · 측정 누적`}</strong>
      {focus && <button className="subtle-button" onClick={() => { setSelection(null); onLive() }}><Radio size={15} />현재로</button>}</div>
    {latest && <p className="live-statistics-note">{focus ? '수신 시작' : '코일 첫 측정'} <time>{dateTime(first, true)}</time> · {focus ? '전체 수신' : '현재 코일 누적'} {data.count.toLocaleString()}개<br />실시간 Z-score는 같은 LOT의 이전 유효 관측 30개부터 계산합니다. 주황 점선은 평균 ±3σ, 붉은 음영은 |Z| &gt; 3인 구간입니다. 기존 모델의 1분 분석과 별도로 표시합니다.</p>}
    {event && <LiveEventEvidence event={event} series={series} channels={channels} datasetId={datasetId} receivedThrough={latest?.time} aggregated={Boolean(review?.aggregation_seconds || !review && data.reduced)} readOnly={readOnly} onRequest={() => { if (!readOnly) onRequest(event) }} />}
    {query.error && focus && !multipleLots && <p className="form-error" role="alert">{query.error.message}<button className="text-button" onClick={() => void query.refetch()}>다시 불러오기</button></p>}
    {range && latest ? <ChannelCharts live channels={channels} series={series} view={range}
      fullRange={{ start: timeIso(first), end: latest.time }} selectedChannel={selectedChannel} selection={selection}
      cursor={cursor ?? latest.time} loading={Boolean(focus && !multipleLots && query.isFetching)} aggregationSeconds={review?.aggregation_seconds ?? 0}
      labelIntervals={review?.label_intervals ?? data.labels} sourceCount={focus ? review?.source_count : data.count}
      liveScores={data.scores} retainedExtrema={!review && data.reduced} onFullRange={() => { setSelection(null); onLive() }}
      fullRangeLabel="현재 코일 전체"
      highlightRange={event} markers={markers} onSelectChannel={onSelectChannel}
      onSelection={setSelection}
      onView={value => { setSelection(null); onRange(value) }}
      onCursor={time => { if (!focus) onRange(range); onCursor(time) }} />
      : <div className="empty-state" role="status">첫 관측값을 기다리고 있습니다.</div>}
  </div>
}
