import test from 'node:test';
import assert from 'node:assert/strict';
import { liveAttention, predictionJob } from '../src/model-predictions.ts';
import type { ModelEvent } from '../src/model-predictions.ts';
import type { SimulationFrame } from '../src/live-simulation.ts';

const frame: SimulationFrame = { source_row: 19, source_record_id: 'arrived', lot_no: '260001', grade: 'SPHC',
  time: '2026-10-26T00:32:15', recorded_at_raw: '2026-10-26 00:32:15',
  values: { 'TC-Z4': 700 }, annotations: { LABEL: 1, EXCLUDED: true } };

test('model request carries only the arrived-frame watermark, never raw labels or feature values', () => {
  const first = predictionJob('simulation', frame, 'randomforest')!;
  assert.deepEqual(first.payload, { dataset: 'simulation', lot_no: '260001', through_source_row: 19, model: 'randomforest', end_of_stream: false });
  assert.equal(predictionJob('simulation', { ...frame, time: '2026-10-26T00:32:59' }, 'randomforest')!.key, first.key);
  assert.notEqual(predictionJob('simulation', { ...frame, time: '2026-10-26T00:33:00' }, 'randomforest')!.key, first.key);
  assert.notEqual(predictionJob('simulation', frame, 'randomforest', true)!.key, first.key);
  assert.equal(predictionJob('simulation', null, 'randomforest'), null);
  assert.equal(predictionJob('simulation', frame, 'none'), null);
});

test('RandomForest zone alarm does not accuse CP when CP is one of its inputs', () => {
  const event: ModelEvent = { id: '1', model_id: 'rf-v6-Z4', kind: 'RandomForest', zone_id: 'Z4',
    start: frame.time, end: frame.time, channel_ids: ['TC-Z4', 'OP-Z4', 'CP-Z4'], probability: .8 };
  assert.deepEqual(liveAttention([event]), { Z4: { count: 1, unacknowledged: 1 } });
  assert.deepEqual(liveAttention([{ ...event, kind: 'Z-score', channel_ids: ['CP-Z4'] }]), { CP: { count: 1, unacknowledged: 1 } });
});
