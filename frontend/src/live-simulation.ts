import type { PlaybackFrame } from './playback.ts';
import type { Channel, ChannelSeries, TimeRange } from './types.ts';
import { timeIso, timeMs } from './time.ts';

export type SimulationFrame = PlaybackFrame & { lot_no: string; grade: string };

// Arrival is separate from prefetch: only these rows reach the graphs and 3D.
export function releaseRows(queue: SimulationFrame[], seconds: number) {
  const count = Math.min(queue.length, Math.max(0, Math.floor(seconds)));
  return { arrived: queue.slice(0, count), waiting: queue.slice(count) };
}

export function receivedSeries(frames: SimulationFrame[], channels: Channel[], windowSeconds: number) {
  const latest = frames.at(-1);
  if (!latest) return null;
  const end = timeMs(latest.time), start = end - windowSeconds * 1000;
  const rows = frames.filter(frame => timeMs(frame.time) >= start && timeMs(frame.time) <= end);
  const series: ChannelSeries[] = channels.map(channel => ({
    channel_id: channel.id, unit: channel.unit,
    points: rows.map((frame, index) => ({
      time: frame.time, value: frame.values[channel.id] ?? null,
      gap_before: index > 0 && (timeMs(frame.time) - timeMs(rows[index - 1].time) > 1500
        || frame.lot_no !== rows[index - 1].lot_no),
    })),
  }));
  const labels: TimeRange[] = [];
  rows.forEach((frame, index) => {
    if (frame.annotations.LABEL !== 1 && frame.annotations.LABEL !== '1') return;
    const previous = rows[index - 1], last = labels.at(-1);
    if (last && previous && last.end === previous.time && timeMs(frame.time) - timeMs(previous.time) <= 1500
      && previous.lot_no === frame.lot_no) last.end = frame.time;
    else labels.push({ start: frame.time, end: frame.time });
  });
  return { series, labels, view: { start: timeIso(start), end: latest.time }, count: rows.length };
}
