import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { processReadoutGroups, PROCESS_READOUT_WIDTH, PROCESS_READOUT_HEIGHT } from '../src/components/process-readouts.ts'
import { FURNACE_ZONES, workViewForViewport, overviewForViewport } from '../src/components/furnace-model.ts'
import { layoutReadouts } from '../src/components/scene-label-layout.ts'
import { layoutAnchoredReadouts, followAnchoredReadout, leaderPoints } from '../src/components/anchored-readout-layout.ts'

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

test('CP leader uses the saved CP device placement rather than the middle of the Z4 housing', () => {
  const positions = new Map<string, [number, number, number]>([['CP-Z4', [-4.7, 4.9, 2.1]]])
  assert.deepEqual(processReadoutGroups(channels, undefined, 'Z4', positions).find(group => group.id === 'CP')!.position, [-4.7, 4.9, 2.1])
})

test('a Zone sliding under its card never swaps the leader between the card sides', () => {
  const box = { x: 300, y: 200, width: PROCESS_READOUT_WIDTH, height: PROCESS_READOUT_HEIGHT }
  const ends = Array.from({ length: 41 }, (_, step) => leaderPoints(300 + step * 3.7, 360, box).split(' ').at(-1)!.split(',').map(Number))
  for (let step = 1; step < ends.length; step++) {
    assert.ok(Math.hypot(ends[step][0] - ends[step - 1][0], ends[step][1] - ends[step - 1][1]) < 30, `leader end jumped at step ${step}`)
  }
  assert.equal(leaderPoints(374, 360, box), '374,360 374,304 374,294')
  assert.equal(leaderPoints(250, 240, box), '250,240 286,240 300,240')
  assert.equal(leaderPoints(500, 240, box), '500,240 462,240 448,240')
})

test('cards follow their own Zone while retaining the same attachment offset and ignoring hover priority', () => {
  const anchors = Array.from({ length: 4 }, (_, index) => ({ id: String(index), x: 350 + index * 190,
    y: 340, dx: -74, dy: -118, selected: index === 0 }))
  const options = { boxWidth: PROCESS_READOUT_WIDTH, boxHeight: PROCESS_READOUT_HEIGHT, gap: 10, top: 90, bottom: 164, exclusions: [] }
  const first = layoutAnchoredReadouts(anchors, 1280, 720, options)
  const previous = new Map(anchors.map(item => [item.id, { x: item.x, y: item.y, box: first.get(item.id)! }]))
  const moved = anchors.map((item, index) => ({ ...item, x: item.x + 18, y: item.y + 12, selected: index === 3 }))
  const after = layoutAnchoredReadouts(moved, 1280, 720, { ...options, previous })
  assert.equal(after.size, 4)
  for (const [id, box] of first) assert.deepEqual(after.get(id), { ...box, x: box.x + 18, y: box.y + 12 })
  const unchanged = layoutAnchoredReadouts(anchors.map(item => ({ ...item, selected: !item.selected })), 1280, 720, { ...options, previous })
  for (const [id, box] of first) assert.deepEqual(unchanged.get(id), box)
})

test('a newly opened panel only displaces cards whose old seats it covers', () => {
  const anchors = Array.from({ length: 4 }, (_, index) => ({ id: String(index), x: 450 + index * 190, y: 250, dx: -84, dy: -148 }))
  const options = { boxWidth: PROCESS_READOUT_WIDTH, boxHeight: PROCESS_READOUT_HEIGHT, gap: 10, top: 90, bottom: 164, exclusions: [] }
  const first = layoutAnchoredReadouts(anchors, 1280, 720, options)
  const blocked = first.get('3')!
  const previous = new Map(anchors.map(item => [item.id, { x: item.x, y: item.y, box: first.get(item.id)! }]))
  const after = layoutAnchoredReadouts(anchors, 1280, 720, { ...options, exclusions: [blocked], previous })
  assert.equal(after.size, 4)
  for (const [id, box] of first) if (id !== '3') assert.deepEqual(after.get(id), box)
  assert.notDeepEqual(after.get('3'), blocked)
})

test('an end-on projection hides crowded cards instead of moving them onto unrelated Zones', () => {
  const anchors = Array.from({ length: 12 }, (_, index) => ({ id: String(index), x: 720 + index * 2, y: 440 + index % 3 * 4, dx: -74, dy: -118 }))
  const panel = { x: 20, y: 300, width: 332, height: 260 }
  const boxes = layoutAnchoredReadouts(anchors, 1440, 900, { boxWidth: PROCESS_READOUT_WIDTH, boxHeight: PROCESS_READOUT_HEIGHT, gap: 10, top: 90, bottom: 164, exclusions: [panel] })
  assert.ok(boxes.size > 0 && boxes.size < anchors.length)
  for (const [id, box] of boxes) {
    const anchor = anchors.find(item => item.id === id)!
    assert.ok(Math.abs(box.x + box.width / 2 - anchor.x) <= PROCESS_READOUT_WIDTH * .7 + .01)
    for (const other of [panel, ...[...boxes].filter(([key]) => key !== id).map(([, value]) => value)]) {
      assert.ok(box.x + box.width <= other.x || box.x >= other.x + other.width || box.y + box.height <= other.y || box.y >= other.y + other.height)
    }
  }
})

test('full furnace overview keeps all twelve readouts aligned near their own Zone after returning from a zoom', () => {
  for (const [width, height] of [[1280, 720], [1330, 871], [1700, 1000]]) {
    const fit = overviewForViewport(width, height)
    const camera = new THREE.PerspectiveCamera(40, width / height, .1, 180)
    camera.position.set(...fit.position); camera.lookAt(...fit.target); camera.updateMatrixWorld()
    const anchors = processReadoutGroups(channels).map(group => {
      const point = new THREE.Vector3(...group.position).project(camera)
      return { id: group.id, x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2,
        dx: -PROCESS_READOUT_WIDTH / 2, dy: group.id === 'CP' ? 22 : -PROCESS_READOUT_HEIGHT - 24 }
    })
    const exclusions = [{ x: 18, y: 76, width: 290, height: 140 }, { x: 16, y: 226, width: 306, height: 134 }]
    const previous = new Map(anchors.map(item => [item.id, { x: item.x, y: item.y,
      box: { x: item.x + 200, y: item.y + 80, width: PROCESS_READOUT_WIDTH, height: PROCESS_READOUT_HEIGHT } }]))
    const boxes = layoutAnchoredReadouts(anchors, width, height, { boxWidth: PROCESS_READOUT_WIDTH,
      boxHeight: PROCESS_READOUT_HEIGHT, gap: 6, top: 90, bottom: 164, exclusions, previous })
    assert.equal(boxes.size, 12, `${width}×${height}`)
    const beforeAlarm = layoutAnchoredReadouts(anchors, width, height, { boxWidth: PROCESS_READOUT_WIDTH,
      boxHeight: PROCESS_READOUT_HEIGHT, gap: 6, top: 90, bottom: 164, exclusions: exclusions.slice(0, 1) })
    const priorSeats = new Map(anchors.map(item => [item.id, { x: item.x, y: item.y, box: beforeAlarm.get(item.id)! }]))
    const afterAlarm = layoutAnchoredReadouts(anchors, width, height, { boxWidth: PROCESS_READOUT_WIDTH,
      boxHeight: PROCESS_READOUT_HEIGHT, gap: 6, top: 90, bottom: 164, exclusions, previous: priorSeats })
    assert.equal(afterAlarm.size, 12, `new alarm at ${width}×${height}`)
    for (const [id, box] of boxes) {
      const anchor = anchors.find(item => item.id === id)!
      assert.ok(Math.abs(box.x + box.width / 2 - anchor.x) <= PROCESS_READOUT_WIDTH * .7 + .01, id)
      for (const other of [...exclusions, ...[...boxes].filter(([key]) => key !== id).map(([, value]) => value)]) {
        assert.ok(box.x + box.width <= other.x || box.x >= other.x + other.width || box.y + box.height <= other.y || box.y >= other.y + other.height, id)
      }
    }
  }
})

test('collision corrections ease gradually while ordinary camera movement tracks the Zone directly', () => {
  const box = { x: 300, y: 250, width: PROCESS_READOUT_WIDTH, height: PROCESS_READOUT_HEIGHT }
  const old = { x: 380, y: 390, box }
  assert.deepEqual(followAnchoredReadout(old, 400, 400, { ...box, x: 320, y: 260 }, 1 / 60), { ...box, x: 320, y: 260 })
  const target = { ...box, x: 500 }
  const next = followAnchoredReadout(old, 380, 390, target, 1 / 60)
  assert.ok(next.x > 300 && next.x <= 300 + 320 / 60)
  let state = old
  for (let index = 0; index < 100; index++) state = { ...state, box: followAnchoredReadout(state, 380, 390, target, 1 / 60) }
  assert.ok(Math.abs(state.box.x - target.x) < .01)
  assert.deepEqual(followAnchoredReadout(old, 380, 390, target, 1 / 60, true), target)
})

test('returning from a large zoom releases a distant detour when the original Zone-adjacent spot is free', () => {
  const anchor = { id: 'Z5', x: 500, y: 320, dx: -74, dy: -118 }
  const previous = new Map([['Z5', { x: 500, y: 320, box: { x: 426, y: 462, width: PROCESS_READOUT_WIDTH, height: PROCESS_READOUT_HEIGHT } }]])
  const boxes = layoutAnchoredReadouts([anchor], 1280, 720, { boxWidth: PROCESS_READOUT_WIDTH, boxHeight: PROCESS_READOUT_HEIGHT, gap: 10, top: 90, bottom: 164, exclusions: [], previous })
  assert.equal(boxes.get('Z5')!.y, 202)
})

test('low housings zoom closer while heating towers retain their surrounding context', () => {
  for (const zone of FURNACE_ZONES) {
    const fit = workViewForViewport(1280, 720, zone.id)
    const compact = !['Z3', 'Z4', 'Z5', 'Z6'].includes(zone.id)
    assert.ok(compact ? fit.distance < workViewForViewport(1280, 720, 'Z4').distance * .85 : fit.distance >= 26, `${zone.id} does not fit its height`)
    assert.ok(fit.distance >= 13)
    assert.equal(fit.position[0], fit.target[0])
  }
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
