import test from 'node:test'
import assert from 'node:assert/strict'
import { accumulatedLiveSeries, appendLiveTrends, emptyLiveTrends, liveCoilRange, liveRangeLots, LIVE_Z_MIN_SAMPLES } from '../src/live-trends.ts'
import type { SimulationFrame } from '../src/live-simulation.ts'
import { clockTime, observationRangeText, timeIso, timeMs } from '../src/time.ts'

const start = timeMs('2026-10-25T03:36:00')
const channels = [{ id: 'TC-Z3', label: 'TC-Z3', zone: 'Z3', unit: '°C', kind: 'temperature' }]
const frame = (n: number, value: number | null = n % 2, extra = {}): SimulationFrame => ({ source_row: n + 1,
  source_record_id: String(n), time: timeIso(start + n * 1000), recorded_at_raw: '', lot_no: '240001', grade: 'SPCE',
  values: { 'TC-Z3': value }, annotations: {}, ...extra })
const series = (rows: SimulationFrame[]) => accumulatedLiveSeries(appendLiveTrends(emptyLiveTrends(), rows), channels)

test('the first measurement and second-precision timestamps survive past five and thirty minutes', () => {
  const rows = Array.from({ length: 4000 }, (_, n) => frame(n))
  const result = series(rows)
  assert.deepEqual(result.view, { start: rows[0].time, end: rows.at(-1)!.time })
  assert.equal(result.count, rows.length)
  assert.equal(result.series[0].points[0].time, rows[0].time)
  assert.equal(result.series[0].points.at(-1)!.time, rows.at(-1)!.time)
  assert.equal(clockTime(result.view!.start, true), '03:36:00')
  assert.equal(clockTime(result.view!.end, true), '04:42:39')
  assert.equal(result.reduced, true)
})

test('new observations use only earlier values of the same LOT and cannot rewrite earlier Z values', () => {
  const initial = appendLiveTrends(emptyLiveTrends(), Array.from({ length: LIVE_Z_MIN_SAMPLES }, (_, n) => frame(n)))
  const measured = appendLiveTrends(initial, [frame(30, 5)])
  const point = accumulatedLiveSeries(measured, channels).scores['TC-Z3'].points.at(-1)!
  assert.equal(point.z, 9) // earlier mean .5, population std .5
  assert.equal(point.previousCount, 30)
  assert.equal(point.lower, -1)
  assert.equal(point.upper, 2)
  assert.equal(initial.count, 30)
  assert.equal(initial.moments['240001']['TC-Z3'].count, 30)
  const future = appendLiveTrends(measured, [frame(31, 1e6)])
  assert.equal(accumulatedLiveSeries(future, channels).scores['TC-Z3'].points.find(p => p.time === point.time)!.z, 9)
  const otherLot = appendLiveTrends(measured, [frame(31, 5, { lot_no: '240002' })])
  const newPoint = accumulatedLiveSeries(otherLot, channels).scores['TC-Z3'].points.at(-1)!
  assert.equal(newPoint.status, 'warming_up')
  assert.equal(newPoint.previousCount, 0)
  assert.equal(newPoint.z, null)
  assert.equal(newPoint.gap_before, true)
})

test('strictly greater than three is an exceedance, with exact boundaries and clickable peak evidence', () => {
  const rows = Array.from({ length: 30 }, (_, n) => frame(n))
  const exact = series([...rows, frame(30, 2)])
  assert.equal(exact.scores['TC-Z3'].points.at(-1)!.z, 3)
  assert.deepEqual(exact.scores['TC-Z3'].intervals, [])
  const result = series([...rows, frame(30, 5), frame(31, 5), frame(32, .5), frame(33, -5)])
  const intervals = result.scores['TC-Z3'].intervals
  assert.equal(intervals.length, 2)
  assert.equal(intervals[0].start, frame(30).time)
  assert.equal(intervals[0].end, frame(31).time)
  assert.equal(intervals[0].count, 2)
  assert.equal(intervals[0].peakZ, 9)
  assert.equal(intervals[1].start, frame(33).time)
})

test('missing, constant, tiny CP and real zero values are handled without an invented normal score', () => {
  const constant = series(Array.from({ length: 31 }, (_, n) => frame(n, 0)))
  assert.equal(constant.scores['TC-Z3'].points.at(-1)!.status, 'constant')
  assert.equal(constant.scores['TC-Z3'].points.at(-1)!.z, null)
  assert.equal(constant.series[0].points[0].value, 0)
  const missing = series([...Array.from({ length: 30 }, (_, n) => frame(n)), frame(30, null)])
  assert.equal(missing.scores['TC-Z3'].points.at(-1)!.status, 'missing')
  const tiny = series([...Array.from({ length: 30 }, (_, n) => frame(n, (n % 2 + 1) * 1e-10)), frame(30, 6e-10)])
  assert.ok(Math.abs(tiny.scores['TC-Z3'].points.at(-1)!.z! - 9) < 1e-10)
})

test('display compaction retains the first, last, raw extrema, Z peaks and early LABEL intervals', () => {
  const rows = Array.from({ length: 5000 }, (_, n) => frame(n, n === 101 ? 999 : n === 102 ? -999 : n % 2,
    { annotations: { LABEL: n < 2 ? 1 : 0 } }))
  const history = appendLiveTrends(emptyLiveTrends(), rows)
  const result = accumulatedLiveSeries(history, channels)
  assert.ok(history.buckets.length <= 512)
  assert.ok(result.series[0].points.length < rows.length)
  assert.equal(Math.max(...result.series[0].points.map(p => p.value!)), 999)
  assert.equal(Math.min(...result.series[0].points.map(p => p.value!)), -999)
  assert.ok(result.scores['TC-Z3'].points.some(p => p.time === rows[101].time && p.z! > 3))
  assert.equal(result.scores['TC-Z3'].intervals[0].start, rows[101].time)
  assert.deepEqual(result.labels, [{ start: rows[0].time, end: rows[1].time }])
})

test('source gaps, LOT transitions, missing readings and run resets never create a connecting line', () => {
  const rows = [frame(0), frame(1, null), frame(2), frame(10), frame(11, 1, { lot_no: '240002' })]
  const result = series(rows)
  assert.equal(result.series[0].points.find(p => p.time === frame(1).time)!.value, null)
  assert.equal(result.series[0].points.find(p => p.time === frame(10).time)!.gap_before, true)
  assert.equal(result.series[0].points.at(-1)!.gap_before, true)
  assert.equal(accumulatedLiveSeries(emptyLiveTrends(), channels).view, null)
  assert.deepEqual(accumulatedLiveSeries(emptyLiveTrends(), channels).scores['TC-Z3'].intervals, [])
})

test('a cumulative review spanning several LOTs does not replace earlier LOTs with only the latest one', () => {
  const rows = [frame(0), frame(1), frame(2, 0, { lot_no: '240002' }), frame(3, 1, { lot_no: '240002' })]
  const history = appendLiveTrends(emptyLiveTrends(), rows)
  assert.deepEqual(liveRangeLots(history, { start: rows[0].time, end: rows[3].time }), ['240001', '240002'])
  assert.deepEqual(liveRangeLots(history, { start: rows[2].time, end: rows[3].time }), ['240002'])
  assert.deepEqual(liveRangeLots(history, null), [])
})

test('the live coil starts at its own first arrival and keeps that left edge until the next LOT arrives', () => {
  const rows = Array.from({ length: 2000 }, (_, n) => frame(n))
  let history = appendLiveTrends(emptyLiveTrends(), rows)
  const original = accumulatedLiveSeries(history, channels, '240001')
  assert.equal(original.view!.start, rows[0].time)
  history = appendLiveTrends(history, [frame(2000), frame(2001)])
  assert.equal(accumulatedLiveSeries(history, channels, '240001').view!.start, rows[0].time)
  const newCoil = frame(2002, 700, { lot_no: '240002', annotations: { LABEL: 1 } })
  history = appendLiveTrends(history, [newCoil])
  const current = accumulatedLiveSeries(history, channels, '240002')
  assert.deepEqual(current.view, { start: newCoil.time, end: newCoil.time })
  assert.equal(current.count, 1)
  assert.equal(current.scores['TC-Z3'].points[0].previousCount, 0)
  assert.deepEqual(current.scores['TC-Z3'].intervals, [])
  history = appendLiveTrends(history, [frame(2003, 701, { lot_no: '240002' })])
  assert.equal(accumulatedLiveSeries(history, channels, '240002').view!.start, newCoil.time)
  assert.equal(accumulatedLiveSeries(history, channels, '240002').count, 2)
  assert.equal(accumulatedLiveSeries(history, channels, '240001').count, 2002)
  assert.equal(accumulatedLiveSeries(history, channels).count, 2004)
  assert.deepEqual(liveCoilRange(history), { start: newCoil.time, end: frame(2003).time })
  assert.deepEqual(liveCoilRange(history, '240001'), { start: rows[0].time, end: frame(2001).time })
  assert.equal(liveCoilRange(emptyLiveTrends()), null)
})

test('the observation clock fixes the start, advances seconds, and includes both dates across midnight', () => {
  assert.equal(observationRangeText('2024-01-02T03:36:00', '2024-01-02T04:17:50'), '2024-01-02 03:36:00 ~ 04:17:50')
  assert.equal(observationRangeText('2024-01-02T03:36:00', '2024-01-02T04:17:51'), '2024-01-02 03:36:00 ~ 04:17:51')
  assert.equal(observationRangeText('2024-01-02T23:59:58', '2024-01-03T00:00:01'), '2024-01-02 23:59:58 ~ 2024-01-03 00:00:01')
})
