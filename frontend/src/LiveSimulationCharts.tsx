import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, queryString } from './api';
import type { Channel, SeriesResponse, TimeRange } from './types';
import type { SimulationFrame } from './live-simulation';
import { receivedSeries } from './live-simulation';
import { timeIso, timeMs } from './time';
import ChannelCharts from './components/ChannelCharts';
import ThemedSelect from './components/ThemedSelect';

export default function LiveSimulationCharts({ frames, channels, selectedChannel, onSelectChannel, datasetId = '', focus = null, focusLot, onClearFocus }: {
  frames: SimulationFrame[]; channels: Channel[]; selectedChannel: string; onSelectChannel: (id: string) => void;
  datasetId?: string; focus?: TimeRange | null; focusLot?: string; onClearFocus?: () => void;
}) {
  const [seconds, setSeconds] = useState(300);
  const data = useMemo(() => receivedSeries(frames, channels, seconds), [frames, channels, seconds]);
  const latest = frames.at(-1);
  const fixed = focus && latest ? {
    start: focus.start, end: timeIso(Math.min(timeMs(focus.end), timeMs(latest.time))),
  } : null;
  const focusQuery = useQuery({
    queryKey: ['arrived-model-series', datasetId, focusLot ?? latest?.lot_no, channels.map(item => item.id).join(','), fixed?.start, fixed?.end],
    enabled: !!datasetId && !!latest && !!fixed && channels.length > 0,
    queryFn: ({ signal }) => api<SeriesResponse>('/api/series?' + queryString({ dataset: datasetId, lot: focusLot ?? latest?.lot_no,
      channels: channels.map(item => item.id).join(','), start: fixed?.start, end: fixed?.end, max_points: 1000 }), { signal }),
  });
  return <div className="simulation-trends">
    <div className="simulation-chart-heading"><strong>{fixed ? '예측한 구간의 그래프' : 'CSV 실시간 시연'}</strong>
      {fixed ? <button className="text-button" onClick={onClearFocus}>최근 값 따라가기</button> : <ThemedSelect label="실시간 그래프 표시 기간" value={String(seconds)} onChange={value => setSeconds(Number(value))}
        options={[60, 300, 900].map(value => ({ value: String(value), label: `최근 ${value / 60}분` }))} />}</div>
    <p className="muted">도착한 값만 표시함. 보라색 띠는 CSV의 LABEL=1이며 모델 예측과는 별개임.</p>
    {fixed ? <>
      {focusQuery.error && <p className="form-error" role="alert">{focusQuery.error.message}</p>}
      <ChannelCharts live channels={channels} series={focusQuery.data?.series ?? []} view={fixed} fullRange={fixed}
        selectedChannel={selectedChannel} selection={null} cursor={null} loading={focusQuery.isFetching}
        labelIntervals={focusQuery.data?.label_intervals ?? []} sourceCount={focusQuery.data?.source_count}
        onSelectChannel={onSelectChannel} onSelection={() => {}} onView={() => {}} onCursor={() => {}} />
    </> : data ? <ChannelCharts live channels={channels} series={data.series} view={data.view} fullRange={data.view}
      selectedChannel={selectedChannel} selection={null} cursor={frames.at(-1)?.time ?? null} loading={false}
      labelIntervals={data.labels} sourceCount={data.count} onSelectChannel={onSelectChannel}
      onSelection={() => {}} onView={() => {}} onCursor={() => {}} />
      : <div className="empty-state" role="status">첫 번째 행을 기다리는 중</div>}
  </div>;
}
