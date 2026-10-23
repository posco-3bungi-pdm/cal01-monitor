import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseRows, receivedSeries } from '../src/live-simulation.ts';
import type { SimulationFrame } from '../src/live-simulation.ts';
const frame = (n: number, extra = {}): SimulationFrame => ({ source_row: n + 1, source_record_id: String(n),
  time: `2026-10-26T00:00:${String(n).padStart(2, '0')}`, recorded_at_raw: '', lot_no: '260001', grade: 'SPHC',
  values: { 'TC-Z3': n, 'OP-Z3': n === 0 ? 0 : null }, annotations: { LABEL: n > 0 ? 1 : 0 }, ...extra });
const channels = [{ id: 'TC-Z3', label: 'TC-Z3', zone: 'Z3', kind: 'temperature', unit: '°C' }];
test('prefetched rows stay private until each arrival; page edges do not skip or repeat records', () => {
  const prefetched = Array.from({ length: 6 }, (_, n) => frame(n));
  const first = releaseRows(prefetched, 1), next = releaseRows(first.waiting, 2);
  assert.deepEqual(first.arrived.map(f => f.source_row), [1]);
  assert.deepEqual(next.arrived.map(f => f.source_row), [2, 3]);
  assert.deepEqual(releaseRows([...next.waiting, frame(6)], 99).arrived.map(f => f.source_row), [4, 5, 6, 7]);
  assert.equal(releaseRows(prefetched, .9).arrived.length, 0);
});
test('live graphs and label rails use only arrived rows and preserve actual zeros and missing channels', () => {
  const arrived = [frame(0), frame(1), frame(2)];
  const result = receivedSeries(arrived, [...channels, { ...channels[0], id: 'OP-Z3' }], 60)!;
  assert.equal(result.count, 3);
  assert.deepEqual(result.series[0].points.map(p => p.value), [0, 1, 2]);
  assert.deepEqual(result.series[1].points.map(p => p.value), [0, null, null]);
  assert.equal(result.view.end, arrived[2].time);
  assert.deepEqual(result.labels, [{ start: arrived[1].time, end: arrived[2].time }]);
});
test('time gaps and LOT switches break the graph instead of inventing a continuous process', () => {
  const data = receivedSeries([frame(0), frame(1, { lot_no: '260002' }), frame(5)], channels, 3)!;
  assert.equal(data.count, 1);
  const all = receivedSeries([frame(0), frame(1, { lot_no: '260002' }), frame(5)], channels, 60)!;
  assert.deepEqual(all.series[0].points.map(p => p.gap_before), [false, true, true]);
  assert.equal(receivedSeries([], channels, 60), null);
});
