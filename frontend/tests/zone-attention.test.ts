import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeZoneId, summarizeZoneAttention, zoneViewAfterClick, placeAttentionBox } from '../src/components/zone-attention.ts'

test('acknowledging one candidate leaves other candidates in that zone needing attention', () => {
  const before = summarizeZoneAttention([
    { zone_id: 'Z3', acknowledged: false }, { zone_id: 'Z3', acknowledged: true },
    { zone_id: 'Z4', acknowledged: true },
  ])
  assert.deepEqual(before.Z3, { count: 2, unacknowledged: 1 })
  assert.deepEqual(before.Z4, { count: 1, unacknowledged: 0 })
  const after = summarizeZoneAttention([
    { zone_id: 'Z3', acknowledged: true }, { zone_id: 'Z3', acknowledged: true },
  ])
  assert.deepEqual(after.Z3, { count: 2, unacknowledged: 0 }, 'acknowledgement stops attention, but does not erase candidates')
})

test('outlet and cleaning tags share the correct model zone; unknown zones create no alerts', () => {
  assert.deepEqual(summarizeZoneAttention([
    { zone_id: 'OUT1', acknowledged: false }, { zone_id: 'OUT2', acknowledged: true },
    { zone_id: 'CLN-IN', acknowledged: false }, { zone_id: 'Z4M', acknowledged: false },
    { zone_id: 'Z10', acknowledged: false },
  ]), { OUT: { count: 2, unacknowledged: 1 }, CLN: { count: 1, unacknowledged: 1 }, Z4: { count: 1, unacknowledged: 1 } })
  assert.equal(normalizeZoneId('Z9'), 'Z9')
  assert.deepEqual(summarizeZoneAttention([]), {})
})

test('same-zone repeat click restores overview; another zone and a manually moved view zoom in', () => {
  assert.equal(zoneViewAfterClick('full', 'Z3', 'Z3'), 'work')
  assert.equal(zoneViewAfterClick('work', 'Z3', 'Z3'), 'full')
  assert.equal(zoneViewAfterClick('work', 'Z3', 'Z4'), 'work')
  assert.equal(zoneViewAfterClick('custom', 'Z3', 'Z3'), 'work')
})

test('adjacent warning buttons avoid covering each other while staying within the scene', () => {
  const first = { x: 275, y: 260, width: 100, height: 61 }
  const second = placeAttentionBox({ x: 353, y: 228, width: 100, height: 61 }, [first], 30, 540)
  assert.ok(second.y + second.height + 10 <= first.y || second.y >= first.y + first.height + 10)
  assert.ok(second.y >= 30 && second.y + second.height <= 540)
})
