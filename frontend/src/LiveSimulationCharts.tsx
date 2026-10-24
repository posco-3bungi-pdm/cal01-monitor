import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Radio } from 'lucide-react'
import { api, queryString } from './api'
import type { Channel, SeriesResponse, TimeRange } from './types'
import type { SimulationFrame } from './live-simulation'
import type { ModelEvent } from './model-predictions'
import { receivedSeries } from './live-simulation'
import { timeIso, timeMs } from './time'
import { observedEventChanges } from './live-evidence'
import ChannelCharts from './components/ChannelCharts'
import LiveEventEvidence from './LiveEventEvidence'

export default function LiveSimulationCharts({ frames, firstTime, cursor, channels, selectedChannel, onSelectChannel, datasetId, focus, focusLot, event, onRange, onCursor, onLive, onRequest }: {
  frames: SimulationFrame[]; firstTime?: string; cursor: string | null; channels: Channel[]; selectedChannel: string; onSelectChannel: (id: string) => void;
  datasetId: string; focus: TimeRange | null; focusLot?: string; event: ModelEvent | null;
  onRange: (range: TimeRange) => void; onCursor: (time: string) => void; onLive: () => void; onRequest: (event: ModelEvent) => void;
}) {
  const [selection, setSelection] = useState<TimeRange | null>(null)
  const data = useMemo(() => receivedSeries(frames, channels, 300), [frames, channels])
  const latest = frames.at(-1)
  const first = firstTime ? timeMs(firstTime) : latest ? timeMs(latest.time) : NaN
  const range = latest ? { start: timeIso(Math.max(first, timeMs(focus?.start ?? data?.view.start ?? latest.time))),
    end: timeIso(Math.min(timeMs(latest.time), timeMs(focus?.end ?? latest.time))) } : null
  const query = useQuery({
    queryKey: ['arrived-review-series', datasetId, focusLot ?? latest?.lot_no, channels.map(item => item.id).join(','), focus ? range?.start : '', focus ? range?.end : ''],
    enabled: !!datasetId && !!latest && !!focus && !!range && channels.length > 0,
    queryFn: ({ signal }) => api<SeriesResponse>('/api/series?' + queryString({ dataset: datasetId, lot: focusLot ?? latest?.lot_no,
      channels: channels.map(item => item.id).join(','), start: range?.start, end: range?.end, max_points: 1000 }), { signal }),
  })
  const buffered = focus && range ? receivedSeries(frames.filter(frame => (!focusLot || frame.lot_no === focusLot)
    && timeMs(frame.time) >= timeMs(range.start) && timeMs(frame.time) <= timeMs(range.end)), channels, Math.max(1, (timeMs(range.end) - timeMs(range.start)) / 1000)) : null
  const series = focus ? query.data?.series ?? buffered?.series ?? channels.map(channel => ({ channel_id: channel.id, unit: channel.unit, points: [] })) : data?.series ?? []
  const markers = useMemo(() => event ? Object.fromEntries(observedEventChanges(series, event).filter(row => row.peak).map(row => [row.channelId, row.peak!])) : {}, [series, event])
  return <div className="simulation-trends">
    <div className="simulation-chart-heading"><strong>{event ? '감지 구간 확인' : focus ? '이전 수신 기록' : '현재 수신 중인 계측값'}</strong>
      {focus && <button className="subtle-button" onClick={() => { setSelection(null); onLive() }}><Radio size={15} />현재로</button>}</div>
    {event && <LiveEventEvidence event={event} series={series} channels={channels} aggregated={Boolean(query.data?.aggregation_seconds)} onRequest={() => onRequest(event)} />}
    {query.error && focus && <p className="form-error" role="alert">{query.error.message}<button className="text-button" onClick={() => void query.refetch()}>다시 불러오기</button></p>}
    {range && latest ? <ChannelCharts live channels={channels} series={series} view={range}
      fullRange={{ start: timeIso(first), end: latest.time }} selectedChannel={selectedChannel} selection={selection}
      cursor={cursor ?? latest.time} loading={Boolean(focus && query.isFetching)} aggregationSeconds={focus ? query.data?.aggregation_seconds : 0}
      labelIntervals={focus ? query.data?.label_intervals ?? [] : data?.labels ?? []} sourceCount={focus ? query.data?.source_count : data?.count}
      highlightRange={event} markers={markers} onSelectChannel={onSelectChannel}
      onSelection={value => { if (value && !focus) onRange(range); setSelection(value) }}
      onView={value => { setSelection(null); onRange(value) }}
      onCursor={time => { if (!focus) onRange(range); onCursor(time) }} />
      : <div className="empty-state" role="status">첫 관측값을 기다리고 있습니다.</div>}
  </div>
}
