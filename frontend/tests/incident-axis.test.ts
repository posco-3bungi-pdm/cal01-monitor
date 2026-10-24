import test from 'node:test'
import assert from 'node:assert/strict'
import { incidentAxis, incidentTick } from '../src/components/incident-axis.ts'

test('small temperature changes use the full plot instead of collapsing around the absolute value', () => {
  const axis = incidentAxis([859.45, 860.9, 861.31])
  assert.ok(axis.max - axis.min < 3)
  const y = (value: number) => 158 - (value - axis.min) / (axis.max - axis.min) * 132
  assert.ok(Math.abs(y(861.31) - y(859.45)) > 100)
  assert.deepEqual(axis.ticks.map(y).map(Math.round), [158, 92, 26])
})

test('constant readings, real zero and tiny CP values keep finite axes and distinct labels', () => {
  for (const values of [[860, 860], [0, 0], [1.14e-10, 1.16e-10], [.45001, .45002]]) {
    const axis = incidentAxis(values), step = (axis.max - axis.min) / 2
    assert.ok(Number.isFinite(axis.min) && axis.max > axis.min)
    assert.equal(new Set(axis.ticks.map(value => incidentTick(value, step))).size, 3)
  }
})
