import test from 'node:test'
import assert from 'node:assert/strict'
import { processReadoutGroups, PROCESS_READOUT_WIDTH, PROCESS_READOUT_HEIGHT } from '../src/components/process-readouts.ts'
import { layoutReadouts } from '../src/components/scene-label-layout.ts'

const ids = ['CLN-IN', ...Array.from({ length: 9 }, (_, index) => `TC-Z${index + 1}`),
  ...Array.from({ length: 8 }, (_, index) => `OP-Z${index + 1}`), 'TC-OUT1', 'TC-OUT2', 'CP-Z4', 'CP-Z4M']
const channels = ids.map(id => ({ id, label: id, zone: '', kind: 'process', unit: null }))

test('process cards pair actual TC/OP channels, group outlets, and keep CP together without inventing OP-Z9', () => {
  const groups = processReadoutGroups(channels)
  assert.equal(groups.length, 12)
  assert.deepEqual(groups.find(group => group.id === 'Z3')!.channels.map(channel => channel.id), ['TC-Z3', 'OP-Z3'])
  assert.deepEqual(groups.find(group => group.id === 'Z9')!.channels.map(channel => channel.id), ['TC-Z9'])
  assert.deepEqual(groups.find(group => group.id === 'OUT')!.channels.map(channel => channel.id), ['TC-OUT1', 'TC-OUT2'])
  assert.deepEqual(groups.find(group => group.id === 'CP')!.channels.map(channel => channel.id), ['CP-Z4', 'CP-Z4M'])
  assert.deepEqual(processReadoutGroups(channels, ['OP-Z3']).map(group => group.channels.map(channel => channel.id)), [['OP-Z3']])
  assert.equal(processReadoutGroups(channels, []).length, 0)
})

test('zoomed cards show only neighbouring process sections while retaining both Z4 CP channels', () => {
  assert.deepEqual(processReadoutGroups(channels, undefined, 'Z4').map(group => group.id), ['Z3', 'Z4', 'Z5', 'CP'])
  assert.deepEqual(processReadoutGroups(channels, undefined, 'CLN').map(group => group.id), ['CLN', 'Z1'])
  assert.deepEqual(processReadoutGroups(channels, undefined, 'OUT').map(group => group.id), ['Z9', 'OUT'])
})

test('large process readings avoid the inspector and remain non-overlapping', () => {
  const inspector = { x: 12, y: 260, width: 332, height: 275 }
  const anchors = Array.from({ length: 4 }, (_, index) => ({ id: String(index), x: 440 + index * 80, y: 290,
    dx: -84, dy: -132, selected: index === 0 }))
  const boxes = layoutReadouts(anchors, 1280, 720, { boxWidth: PROCESS_READOUT_WIDTH, boxHeight: PROCESS_READOUT_HEIGHT,
    top: 90, bottom: 164, exclusions: [inspector] })
  assert.equal(boxes.size, 4)
  for (const [id, box] of boxes) {
    assert.ok(box.y >= 90 && box.y + box.height <= 556)
    for (const other of [inspector, ...[...boxes].filter(([key]) => key !== id).map(([, value]) => value)]) {
      assert.ok(box.x + box.width <= other.x || box.x >= other.x + other.width || box.y + box.height <= other.y || box.y >= other.y + other.height)
    }
  }
})

test('an open inspector does not unnecessarily hide the full set of process readings', () => {
  const anchors = Array.from({ length: 12 }, (_, index) => ({ id: String(index), x: 230 + index * 80,
    y: 180 + index % 3 * 80, dx: -84, dy: -132, selected: index === 3 }))
  const boxes = layoutReadouts(anchors, 1280, 720, { boxWidth: PROCESS_READOUT_WIDTH, boxHeight: PROCESS_READOUT_HEIGHT,
    top: 90, bottom: 164, exclusions: [
      { x: 20, y: 80, width: 284, height: 130 }, { x: 20, y: 292, width: 332, height: 260 },
      { x: 988, y: 80, width: 270, height: 80 },
    ] })
  assert.equal(boxes.size, 12)
})
