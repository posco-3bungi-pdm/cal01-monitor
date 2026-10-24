import type { SimulationFrame } from './live-simulation.ts'
import type { Channel, ChannelSeries, SeriesPoint, TimeRange } from './types.ts'
import { timeMs } from './time.ts'

export const LIVE_Z_THRESHOLD = 3
export const LIVE_Z_MIN_SAMPLES = 30
const MAX_BUCKETS = 512

type Moments = { count: number; mean: number; m2: number }
export type LiveScorePoint = SeriesPoint & {
  sourceRow: number; lot: string; z: number | null; mean: number | null; std: number | null;
  lower: number | null; upper: number | null; previousCount: number;
  status: 'ready' | 'warming_up' | 'constant' | 'missing'
}
export type LiveExceedance = TimeRange & { lot: string; peakZ: number; peakAt: string; count: number }
export type LiveScores = { points: LiveScorePoint[]; intervals: LiveExceedance[] }
type Envelope = { first: LiveScorePoint; last: LiveScorePoint; min: LiveScorePoint; max: LiveScorePoint;
  zMin: LiveScorePoint; zMax: LiveScorePoint; broken: boolean }
type Bucket = { first: SimulationFrame; last: SimulationFrame; count: number; channels: Record<string, Envelope> }
export type LiveTrendHistory = {
  count: number; first: SimulationFrame | null; last: SimulationFrame | null; bucketSize: number; buckets: Bucket[];
  moments: Record<string, Record<string, Moments>>; labels: TimeRange[]; exceedances: Record<string, LiveExceedance[]>
}

export function emptyLiveTrends(): LiveTrendHistory {
  return { count: 0, first: null, last: null, bucketSize: 1, buckets: [], moments: {}, labels: [], exceedances: {} }
}

const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const adjacent = (a: SimulationFrame, b: SimulationFrame) => a.lot_no === b.lot_no
  && timeMs(b.time) - timeMs(a.time) >= 0 && timeMs(b.time) - timeMs(a.time) <= 1500

function extreme(a: LiveScorePoint, b: LiveScorePoint, field: 'value' | 'z', max = false) {
  if (!valid(a[field])) return b
  if (!valid(b[field])) return a
  return (max ? b[field]! > a[field]! : b[field]! < a[field]!) ? b : a
}

function merge(a: Bucket, b: Bucket): Bucket {
  const channels: Record<string, Envelope> = {}
  for (const id of new Set([...Object.keys(a.channels), ...Object.keys(b.channels)])) {
    const left = a.channels[id], right = b.channels[id]
    channels[id] = !left ? { ...right, broken: true } : !right ? { ...left, broken: true } : {
      first: left.first, last: right.last, min: extreme(left.min, right.min, 'value'), max: extreme(left.max, right.max, 'value', true),
      zMin: extreme(left.zMin, right.zMin, 'z'), zMax: extreme(left.zMax, right.zMax, 'z', true), broken: left.broken || right.broken,
    }
  }
  return { first: a.first, last: b.last, count: a.count + b.count, channels }
}

// Welford's update runs once per ARRIVED observation, before any display reduction.
// Score the new value against earlier values only; a later arrival never rewrites its Z.
export function appendLiveTrends(previous: LiveTrendHistory, arrived: SimulationFrame[]): LiveTrendHistory {
  if (!arrived.length) return previous
  let result = previous
  for (const frame of arrived) {
    if (!Number.isFinite(timeMs(frame.time))) continue
    const priorLot = result.moments[frame.lot_no] ?? {}, lot = { ...priorLot }
    const channels: Record<string, Envelope> = {}, exceedances = { ...result.exceedances }
    const connected = !!result.last && adjacent(result.last, frame)
    for (const id of new Set([...Object.keys(priorLot), ...Object.keys(frame.values)])) {
      const value = valid(frame.values[id]) ? frame.values[id] : null
      const before = priorLot[id] ?? { count: 0, mean: 0, m2: 0 }
      const std = before.count >= LIVE_Z_MIN_SAMPLES ? Math.sqrt(Math.max(0, before.m2 / before.count)) : null
      const z = value !== null && std !== null && std > 0 ? (value - before.mean) / std : null
      const usable = z !== null && Number.isFinite(z)
      const point: LiveScorePoint = { time: frame.time, sourceRow: frame.source_row, lot: frame.lot_no, value,
        gap_before: !!result.last && !connected, z: usable ? z : null,
        mean: std !== null ? before.mean : null, std,
        lower: std !== null && std > 0 ? before.mean - LIVE_Z_THRESHOLD * std : null,
        upper: std !== null && std > 0 ? before.mean + LIVE_Z_THRESHOLD * std : null,
        previousCount: before.count, status: value === null ? 'missing' : std === null ? 'warming_up' : std === 0 ? 'constant' : 'ready' }
      channels[id] = { first: point, last: point, min: point, max: point, zMin: point, zMax: point, broken: value === null }
      if (value !== null) {
        const count = before.count + 1, delta = value - before.mean, mean = before.mean + delta / count
        lot[id] = { count, mean, m2: before.m2 + delta * (value - mean) }
      }
      if (usable && Math.abs(z) > LIVE_Z_THRESHOLD) {
        const intervals = [...(exceedances[id] ?? [])], last = intervals.at(-1)
        if (connected && last?.lot === frame.lot_no && last.end === result.last!.time) {
          const peak = Math.abs(z) > Math.abs(last.peakZ)
          intervals[intervals.length - 1] = { ...last, end: frame.time, count: last.count + 1,
            peakZ: peak ? z : last.peakZ, peakAt: peak ? frame.time : last.peakAt }
        } else intervals.push({ start: frame.time, end: frame.time, lot: frame.lot_no, peakZ: z, peakAt: frame.time, count: 1 })
        exceedances[id] = intervals
      }
    }
    const bucket: Bucket = { first: frame, last: frame, count: 1, channels }, buckets = [...result.buckets]
    const tail = buckets.at(-1)
    if (tail && connected && tail.count < result.bucketSize) buckets[buckets.length - 1] = merge(tail, bucket)
    else buckets.push(bucket)
    let bucketSize = result.bucketSize
    if (buckets.length > MAX_BUCKETS) {
      const compact: Bucket[] = [], nextSize = bucketSize * 2
      for (const item of buckets) {
        const last = compact.at(-1)
        if (last && last.count + item.count <= nextSize && adjacent(last.last, item.first)) compact[compact.length - 1] = merge(last, item)
        else compact.push(item)
      }
      if (compact.length < buckets.length) { buckets.splice(0, buckets.length, ...compact); bucketSize = nextSize }
    }
    let labels = result.labels
    if (frame.annotations.LABEL === 1 || frame.annotations.LABEL === '1') {
      labels = [...labels]
      const last = labels.at(-1)
      if (connected && last?.end === result.last!.time) labels[labels.length - 1] = { ...last, end: frame.time }
      else labels.push({ start: frame.time, end: frame.time })
    }
    result = { count: result.count + 1, first: result.first ?? frame, last: frame, bucketSize, buckets,
      moments: { ...result.moments, [frame.lot_no]: lot }, labels, exceedances }
  }
  return result
}

export function accumulatedLiveSeries(history: LiveTrendHistory, channels: Channel[], lotNo?: string) {
  const buckets = lotNo ? history.buckets.filter(bucket => bucket.first.lot_no === lotNo) : history.buckets
  const first = buckets[0]?.first, last = buckets.at(-1)?.last
  const series: ChannelSeries[] = [], scores: Record<string, LiveScores> = {}
  for (const channel of channels) {
    const points: LiveScorePoint[] = []
    for (const bucket of buckets) {
      const envelope = bucket.channels[channel.id]
      if (!envelope) continue
      // Keep both measurement and Z extrema, first/last timestamps and discontinuities.
      const retained = [...new Map([envelope.first, envelope.min, envelope.max, envelope.zMin, envelope.zMax, envelope.last]
        .map(point => [point.sourceRow, point])).values()].sort((a, b) => timeMs(a.time) - timeMs(b.time) || a.sourceRow - b.sourceRow)
      points.push(...retained.map(point => ({ ...point, gap_before: point.gap_before || envelope.broken })))
    }
    series.push({ channel_id: channel.id, unit: channel.unit, points })
    scores[channel.id] = { points, intervals: (history.exceedances[channel.id] ?? []).filter(interval => !lotNo || interval.lot === lotNo) }
  }
  const labels = lotNo ? history.labels.filter(interval => first && last
    && timeMs(interval.end) >= timeMs(first.time) && timeMs(interval.start) <= timeMs(last.time)) : history.labels
  return { series, scores, labels, count: lotNo ? buckets.reduce((sum, bucket) => sum + bucket.count, 0) : history.count,
    view: first && last ? { start: first.time, end: last.time } : null,
    reduced: buckets.some(bucket => bucket.count > 1) }
}

export function liveRangeLots(history: LiveTrendHistory, range: TimeRange | null) {
  if (!range) return []
  const start = timeMs(range.start), end = timeMs(range.end)
  return [...new Set(history.buckets.filter(bucket => timeMs(bucket.last.time) >= start && timeMs(bucket.first.time) <= end)
    .map(bucket => bucket.first.lot_no))]
}

export function liveCoilRange(history: LiveTrendHistory, lotNo = history.last?.lot_no): TimeRange | null {
  const buckets = history.buckets.filter(bucket => bucket.first.lot_no === lotNo)
  const first = buckets[0]?.first, last = buckets.at(-1)?.last
  return first && last ? { start: first.time, end: last.time } : null
}
