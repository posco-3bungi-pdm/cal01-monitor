import type { ChannelSeries } from './types.ts'
import type { ModelEvent } from './model-predictions.ts'
import { timeMs } from './time.ts'

// Observed differences support human review; they are not model attribution.
export function observedEventChanges(series: ChannelSeries[], event: ModelEvent) {
  const start = timeMs(event.start), end = timeMs(event.end)
  return series.map(channel => {
    const points = channel.points.filter(point => point.value != null && Number.isFinite(point.value))
    const before = points.filter(point => timeMs(point.time) < start).at(-1)
    const inside = points.filter(point => timeMs(point.time) >= start && timeMs(point.time) <= end)
    const reference = before ?? inside[0]
    const peak = inside.reduce<(typeof points)[number] | undefined>((best, point) => !best || Math.abs(point.value! - reference!.value!) > Math.abs(best.value! - reference!.value!) ? point : best, undefined)
    return { channelId: channel.channel_id, before: before?.value ?? null,
      min: inside.length ? Math.min(...inside.map(point => point.min ?? point.value!)) : null,
      max: inside.length ? Math.max(...inside.map(point => point.max ?? point.value!)) : null,
      peak: peak ? { time: peak.time, value: peak.value!, label: '감지 구간에서 비교값과 가장 차이 나는 관측값' } : null,
      change: before && peak ? peak.value! - before.value! : null }
  })
}
