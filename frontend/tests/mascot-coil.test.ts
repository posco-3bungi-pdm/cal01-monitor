import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyArrivalTracker, observeCoil } from '../src/coil-arrival.ts'
import { randomOther, idlePoses, reactionPoses, spiritMessages } from '../src/mascot-data.ts'
import type { SimulationFrame } from '../src/live-simulation.ts'

const frame = (row: number, lot = '240001', grade = 'SPCC'): SimulationFrame => ({ source_row: row,
  source_record_id: `${row}`, time: `2024-01-02T03:36:${String(row).padStart(2, '0')}`, recorded_at_raw: '',
  lot_no: lot, grade, values: {}, annotations: {} })

test('coil reception announces once per LOT entry, not on more rows or grade enrichment', () => {
  const first = observeCoil(emptyArrivalTracker(), 'dataset:1', frame(1))
  assert.equal(first.arrival?.lot, '240001')
  assert.equal(observeCoil(first, 'dataset:1', frame(2)), first)
  assert.equal(observeCoil(first, 'dataset:1', frame(2, '240001', 'SPCE')), first)
  const next = observeCoil(first, 'dataset:1', frame(3, '240002', 'SGCC'))
  assert.equal(next.arrival?.grade, 'SGCC')
  assert.notEqual(first.arrival?.id, next.arrival?.id)
  assert.equal(observeCoil(next, 'dataset:1', frame(4, '240002')), next)
})

test('run changes clear old announcements and blank/no observations do not invent a coil', () => {
  const first = observeCoil(emptyArrivalTracker(), 'dataset:1', frame(1))
  const reset = observeCoil(first, 'dataset:2', null)
  assert.equal(reset.arrival, null)
  assert.equal(observeCoil(reset, 'dataset:2', frame(1, ' ')), reset)
  const restarted = observeCoil(reset, 'dataset:2', frame(1))
  assert.notEqual(restarted.arrival?.id, first.arrival?.id)
  assert.equal(observeCoil(restarted, 'dataset:2', null), restarted)
})

test('random idle and click choices avoid repeating the previous pose and stay in their own group', () => {
  for (const poses of [idlePoses, reactionPoses]) {
    for (const previous of poses) for (const random of [0, .25, .5, .99]) {
      const next = randomOther<string>(poses, previous, () => random)
      assert.notEqual(next, previous)
      assert.ok((poses as readonly string[]).includes(next))
    }
  }
  assert.equal(randomOther(['only'], 'only'), 'only')
  assert.equal(randomOther([], 'fallback'), 'fallback')
  for (const previous of spiritMessages) assert.notEqual(randomOther(spiritMessages, previous, () => 0), previous)
})
