import test from 'node:test'
import assert from 'node:assert/strict'
import { outstandingCandidates, candidatesInLot, reachedCandidates, advanceReplayAttention } from '../src/components/attention-state.ts'
import { timeMs } from '../src/time.ts'
import type { DetectionCandidate } from '../src/review-types'

const item = { id: 'example', dataset_id: 'example-data', lot_no: 'EXAMPLE01', start: '2026-10-01T08:10:00', end: '2026-10-01T08:12:00', acknowledged: false } as DetectionCandidate
test('reading an event leaves it outstanding; only recorded completion clears it', () => {
  assert.equal(outstandingCandidates([item, { ...item, id: 'read', acknowledged: true }]).length, 2)
  assert.equal(outstandingCandidates([{ ...item, resolved: true }]).length, 0)
})
test('historical pending events stay tied to their LOT without depending on the replay clock', () => {
  const events = [item, { ...item, id: 'other', lot_no: 'EXAMPLE02' }, { ...item, id: 'done', resolved: true }]
  assert.deepEqual(candidatesInLot(events, 'example-data', 'EXAMPLE01').map(row => row.id), ['example'])
  assert.equal(candidatesInLot(events, 'another-dataset', 'EXAMPLE01').length, 0)
})

test('playback starts without future candidates and reveals them in occurrence order at the exact boundary', () => {
  const later = { ...item, id: 'later', start: '2026-10-01T08:20:00' }
  assert.deepEqual(reachedCandidates([later, item], timeMs('2026-10-01T08:00:00')), [])
  assert.deepEqual(reachedCandidates([later, item], timeMs('2026-10-01T08:10:00')).map(row => row.id), ['example'])
  assert.deepEqual(reachedCandidates([later, item], timeMs(later.start)).map(row => row.id), ['example', 'later'])
  assert.deepEqual(reachedCandidates([item], NaN), [])
})

test('seeking backwards keeps encountered unhandled events; completion removes them and another LOT resets the window', () => {
  const start = { context: 'data:LOT1', through: timeMs('2026-10-01T08:00:00') }
  const reached = advanceReplayAttention(start, start.context, timeMs('2026-10-01T08:11:00'))
  const rewound = advanceReplayAttention(reached, start.context, start.through)
  assert.equal(rewound, reached)
  assert.equal(reachedCandidates([item], rewound.through).length, 1)
  assert.equal(reachedCandidates([{ ...item, resolved: true }], rewound.through).length, 0)
  const next = advanceReplayAttention(reached, 'data:LOT2', start.through)
  assert.equal(reachedCandidates([item], next.through).length, 0)
})
