import { useMemo, useState } from 'react';
import type { Channel } from './types';
import type { SimulationFrame } from './live-simulation';
import { receivedSeries } from './live-simulation';
import ChannelCharts from './components/ChannelCharts';
import ThemedSelect from './components/ThemedSelect';

export default function LiveSimulationCharts({ frames, channels, selectedChannel, onSelectChannel }: {
  frames: SimulationFrame[]; channels: Channel[]; selectedChannel: string; onSelectChannel: (id: string) => void;
}) {
  const [seconds, setSeconds] = useState(300);
  const data = useMemo(() => receivedSeries(frames, channels, seconds), [frames, channels, seconds]);
  return <div className="simulation-trends">
    <div className="simulation-chart-heading"><strong>CSV 실시간 시연</strong>
      <ThemedSelect label="실시간 그래프 표시 기간" value={String(seconds)} onChange={value => setSeconds(Number(value))}
        options={[60, 300, 900].map(value => ({ value: String(value), label: `최근 ${value / 60}분` }))} /></div>
    <p className="muted">도착한 값만 이어서 표시함. 보라색 띠는 CSV의 LABEL=1이며 경고 판정과는 별개임.</p>
    {data ? <ChannelCharts live channels={channels} series={data.series} view={data.view} fullRange={data.view}
      selectedChannel={selectedChannel} selection={null} cursor={frames.at(-1)?.time ?? null} loading={false}
      labelIntervals={data.labels} sourceCount={data.count} onSelectChannel={onSelectChannel}
      onSelection={() => {}} onView={() => {}} onCursor={() => {}} />
      : <div className="empty-state" role="status">첫 번째 행을 기다리는 중</div>}
  </div>;
}
