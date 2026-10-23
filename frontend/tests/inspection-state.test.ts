import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyInspection, inspectionState } from '../src/components/inspection-state.ts'

test('hover readings disappear on leaving; clicks lock the reading against other Zone hovers', () => {
  const hover = inspectionState(emptyInspection, { type: 'enter', zone: 'Z8' })
  assert.equal(hover.preview, 'Z8')
  assert.equal(inspectionState(hover, { type: 'leave' }).pinned, false)
  assert.equal(inspectionState(hover, { type: 'leave' }).preview, null)
  const clicked = inspectionState(hover, { type: 'pin' })
  const other = inspectionState(clicked, { type: 'enter', zone: 'Z7' })
  assert.equal(other.preview, null)
  assert.equal(other, clicked)
  const left = inspectionState(other, { type: 'leave' })
  assert.equal(left.preview, null)
  assert.equal(left.pinned, true)
})

test('X prevents same-Zone move events from reopening until a new hover', () => {
  const closed = inspectionState(inspectionState(emptyInspection, { type: 'enter', zone: 'Z2' }), { type: 'dismiss' })
  assert.equal(inspectionState(closed, { type: 'enter', zone: 'Z2' }).preview, null)
  assert.equal(inspectionState(closed, { type: 'enter', zone: 'Z3' }).preview, 'Z3')
  assert.equal(inspectionState(inspectionState(closed, { type: 'leave' }), { type: 'enter', zone: 'Z2' }).preview, 'Z2')
  assert.equal(inspectionState(closed, { type: 'pin' }).pinned, true)
})
