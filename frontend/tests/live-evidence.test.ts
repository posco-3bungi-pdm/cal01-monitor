import test from 'node:test'
import assert from 'node:assert/strict'
import { observedEventChanges } from '../src/live-evidence.ts'
import type { ModelEvent } from '../src/model-predictions.ts'

const event: ModelEvent = { id: 'event', zone_id: 'Z4', model_id: 'rf', kind: 'RandomForest', start: '2024-01-02T03:40:00', end: '2024-01-02T03:40:59', channel_ids: ['TC-Z4'], probability: .8 }
test('event evidence separates previous readings, anomaly interval and later data', () => {
  const [row] = observedEventChanges([{ channel_id: 'TC-Z4', unit: '°C', points: [
    { time: '2024-01-02T03:39:59', value: 860 }, { time: event.start, value: 859 },
    { time: '2024-01-02T03:40:30', value: 850 }, { time: event.end, value: 858 },
    { time: '2024-01-02T03:41:00', value: 1200 },
  ] }], event)
  assert.equal(row.before, 860); assert.equal(row.min, 850); assert.equal(row.max, 859)
  assert.equal(row.peak?.time, '2024-01-02T03:40:30'); assert.equal(row.change, -10)
})
test('missing observations do not become zero or a fabricated cause; real zero remains visible', () => {
  const rows = observedEventChanges([
    { channel_id: 'OP-Z4', unit: '%', points: [{ time: event.start, value: 0 }] },
    { channel_id: 'TC-Z4', unit: '°C', points: [{ time: event.start, value: null }] },
  ], event)
  assert.equal(rows[0].min, 0); assert.equal(rows[0].before, null); assert.equal(rows[0].change, null)
  assert.equal(rows[1].min, null); assert.equal(rows[1].peak, null)
})
