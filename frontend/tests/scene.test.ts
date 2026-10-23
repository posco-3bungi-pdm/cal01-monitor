import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { SceneGesture, movementForKeys, SCENE_KEYS } from '../src/components/scene-input.ts'
import { anchorOccluded, labelOccluders } from '../src/components/scene-occlusion.ts'
import { layoutReadouts } from '../src/components/scene-label-layout.ts'
import {
  COIL_CENTRE_Y, COIL_RADIUS, FURNACE_ZONES, STRIP_HALF_THICKNESS, STRIP_HALF_WIDTH,
  STRIP_TRANSFER_Y, createStripGeometry, createStripLayout, housingPanels,
  overviewForViewport, workViewForViewport, partViewForViewport,
} from '../src/components/furnace-model.ts'

test('click guard rejects out-and-back drags, multi-touch and cancellation', () => {
  const gesture = new SceneGesture()
  gesture.down(1, 100, 100)
  gesture.move(1, 104, 100)
  gesture.up(1, 104, 100)
  assert.equal(gesture.allowClick(), true)
  gesture.down(1, 100, 100)
  gesture.move(1, 180, 100)
  gesture.up(1, 100, 100)
  assert.equal(gesture.allowClick(), false)
  gesture.down(1, 100, 100)
  gesture.down(2, 120, 100)
  gesture.up(1, 100, 100)
  gesture.up(2, 120, 100)
  assert.equal(gesture.allowClick(), false)
  gesture.down(1, 100, 100)
  gesture.cancel()
  gesture.up(1, 100, 100)
  assert.equal(gesture.allowClick(), false)
  assert.equal(gesture.allowClick(true), true, 'keyboard activation remains accessible')
  gesture.down(1, 10, 10, 2)
  gesture.up(1, 10, 10)
  assert.equal(gesture.allowClick(), false)
  gesture.down(1, 10, 10)
  gesture.up(1, 10, 10)
  assert.equal(gesture.allowClick(), true, 'the next independent click is usable')
})

test('keyboard movement is frame-rate independent and normalizes diagonals', () => {
  const forward = new Set(['KeyW'])
  const slow = movementForKeys(forward, false, 1 / 60)
  assert.ok(Math.abs(slow.z * 60 - 7) < 1e-10)
  assert.ok(Math.abs(movementForKeys(forward, false, 1 / 20).z * 20 - 7) < 1e-10)
  const diagonal = movementForKeys(new Set(['KeyW', 'KeyD', 'KeyE']), false, 1 / 60)
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y, diagonal.z) - slow.z) < 1e-10)
  assert.equal(movementForKeys(new Set(['KeyW', 'KeyS']), false, 0.02).z, 0)
  assert.equal(movementForKeys(new Set(['KeyQ']), false, 0.02).y, -0.14)
  assert.ok(movementForKeys(forward, true, 1 / 60).z > slow.z)
  assert.ok(movementForKeys(forward, true, 10).z <= 1, 'resume after a long pause cannot teleport')
  assert.ok(Math.abs(movementForKeys(forward, true, 1 / 60).z * 60 - 20) < 1e-10)
})

test('up and down arrows change height, without doubling the Q/E aliases', () => {
  assert.ok(SCENE_KEYS.has('ArrowUp') && SCENE_KEYS.has('ArrowDown'))
  const up = movementForKeys(new Set(['ArrowUp']), false, 0.02)
  const down = movementForKeys(new Set(['ArrowDown']), false, 0.02)
  assert.deepEqual(up, { x: 0, y: 0.14, z: 0 })
  assert.deepEqual(down, { x: 0, y: -0.14, z: 0 })
  assert.deepEqual(movementForKeys(new Set(['ArrowUp', 'KeyE']), false, 0.02), up)
  assert.deepEqual(movementForKeys(new Set(['ArrowDown', 'KeyQ']), false, 0.02), down)
  assert.deepEqual(movementForKeys(new Set(['ArrowDown', 'KeyE']), false, 0.02), { x: 0, y: 0, z: 0 })
  const diagonal = movementForKeys(new Set(['KeyW', 'KeyD', 'ArrowUp']), false, 0.02)
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y, diagonal.z) - up.y) < 1e-10)
})

function segmentMeetsBox(a: THREE.Vector2, b: THREE.Vector2, minX: number, maxX: number, minY: number, maxY: number) {
  let low = 0, high = 1
  for (const [origin, delta, minimum, maximum] of [
    [a.x, b.x - a.x, minX, maxX], [a.y, b.y - a.y, minY, maxY],
  ]) {
    if (Math.abs(delta) < 1e-12) {
      if (origin < minimum || origin > maximum) return false
    } else {
      const first = (minimum - origin) / delta, second = (maximum - origin) / delta
      low = Math.max(low, Math.min(first, second))
      high = Math.min(high, Math.max(first, second))
      if (low > high) return false
    }
  }
  return true
}

test('the complete ribbon clears every housing wall, roof and side opening', () => {
  const { points } = createStripLayout()
  for (const zone of FURNACE_ZONES) for (const panel of housingPanels(zone)) {
    const [x, y, z] = panel.position
    const [width, height, depth] = panel.size
    if (z - depth / 2 > STRIP_HALF_WIDTH || z + depth / 2 < -STRIP_HALF_WIDTH) continue
    for (let index = 1; index < points.length; index++) {
      assert.equal(segmentMeetsBox(points[index - 1], points[index],
        x - width / 2 - STRIP_HALF_THICKNESS, x + width / 2 + STRIP_HALF_THICKNESS,
        y - height / 2 - STRIP_HALF_THICKNESS, y + height / 2 + STRIP_HALF_THICKNESS),
      false, `${zone.id} ${panel.side} intersects strip segment ${index}`)
    }
  }
})

test('coils meet horizontal ribbon tangentially and rollers do not penetrate its thickness', () => {
  const { points, rollers } = createStripLayout()
  assert.equal(points[0].x, -18.1)
  assert.equal(points.at(-1)!.x, 18.1)
  assert.equal(points[0].y, STRIP_TRANSFER_Y)
  assert.equal(points.at(-1)!.y, STRIP_TRANSFER_Y)
  assert.ok(Math.abs(COIL_CENTRE_Y + COIL_RADIUS + STRIP_HALF_THICKNESS - STRIP_TRANSFER_Y) < 1e-12)
  assert.ok(Math.abs(points[1].y - points[0].y) < 1e-12)
  assert.ok(Math.abs(points.at(-2)!.y - points.at(-1)!.y) < 1e-12)
  for (const roller of rollers) {
    const center = new THREE.Vector2(roller.x, roller.y)
    let minimum = Infinity
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1], b = points[index]
      const delta = b.clone().sub(a)
      const t = THREE.MathUtils.clamp(center.clone().sub(a).dot(delta) / delta.lengthSq(), 0, 1)
      minimum = Math.min(minimum, a.clone().addScaledVector(delta, t).distanceTo(center) - roller.radius)
    }
    assert.ok(minimum >= STRIP_HALF_THICKNESS - 0.0001, `roller ${roller.x} intersects inner ribbon`)
    assert.ok(minimum < 0.016, `roller ${roller.x} floats away from ribbon`)
  }
})

test('strip travel attribute is continuous, finite and shared by the four cross-section vertices', () => {
  const { points } = createStripLayout()
  const geometry = createStripGeometry(points)
  const distances = geometry.getAttribute('stripDistance')
  const vertices = geometry.getAttribute('position')
  assert.equal(distances.count, vertices.count)
  let expected = 0
  for (let index = 0; index < points.length; index++) {
    if (index) expected += points[index].distanceTo(points[index - 1])
    for (let side = 0; side < 4; side++) {
      assert.ok(Math.abs(distances.getX(index * 4 + side) - expected) < 0.0001)
      assert.ok(Number.isFinite(vertices.getX(index * 4 + side)))
    }
  }
  geometry.dispose()
})

test('work view is closer than full view; full view contains its actual bounds on narrow and wide screens', () => {
  for (const [width, height] of [[588, 850], [1440, 900], [2560, 1080]]) {
    const full = overviewForViewport(width, height)
    const work = workViewForViewport(width, height, 'Z3')
    assert.ok(work.distance < full.distance * 0.8)
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 500)
    camera.position.set(...full.position)
    camera.lookAt(...full.target)
    camera.updateMatrixWorld()
    for (const x of [-19.2, 19.2]) for (const y of [-0.1, 12.6]) for (const z of [-5, 3.4]) {
      const point = new THREE.Vector3(x, y, z).project(camera)
      assert.ok(Math.abs(point.x) < 0.91 && Math.abs(point.y) < 0.91)
    }
  }
})

test('zone buttons use a front view consistently, with the inspector clear of the reserved bottom row', () => {
  for (const zone of FURNACE_ZONES) {
    const work = workViewForViewport(1280, 720, zone.id)
    assert.equal(work.position[0], work.target[0], `${zone.id} must not turn diagonally`)
    assert.ok(Math.abs(work.position[1] - work.target[1]) < Math.abs(work.position[2] - work.target[2]) * 0.1)
  }
  const placements = layoutReadouts([{ id: 'CP-Z4M', x: 500, y: 650, dx: 22, dy: 14, selected: true }], 1280, 720)
  const value = placements.get('CP-Z4M')!
  assert.ok(value.y + value.height <= 720 - 230, 'a readout cannot cover the process navigation')
})

test('readouts sharing an anchor are placed without overlap and remain inside the viewport', () => {
  for (const [width, height, count] of [[588, 850, 6], [1280, 720, 22]]) {
    const entries = Array.from({ length: count }, (_, index) => ({
      id: String(index), x: width / 2, y: height / 2, dx: 22, dy: -78, selected: index === 4,
    }))
    const placements = layoutReadouts(entries, width, height)
    assert.equal(placements.size, count)
    for (const [id, a] of placements) {
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= width && a.y + a.height <= height)
      for (const [other, b] of placements) if (id !== other) {
        assert.ok(a.x + a.width <= b.x || a.x >= b.x + b.width || a.y + a.height <= b.y || a.y >= b.y + b.height)
      }
    }
  }
})

test('solid housing occludes an anchor, an actual opening does not, and hidden housings are ignored', () => {
  const scene = new THREE.Scene()
  const shell = new THREE.Group()
  shell.name = 'SHELL_TEST'
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.1), new THREE.MeshBasicMaterial())
  shell.add(wall)
  scene.add(shell)
  scene.updateMatrixWorld(true)
  const ray = new THREE.Raycaster()
  const origin = new THREE.Vector3(0, 0, 5)
  assert.equal(anchorOccluded(origin, new THREE.Vector3(0, 0, -1), labelOccluders(scene), ray), true)
  assert.equal(anchorOccluded(origin, new THREE.Vector3(0, 0, 1), labelOccluders(scene), ray), false)
  wall.position.x = 3
  scene.updateMatrixWorld(true)
  assert.equal(anchorOccluded(origin, new THREE.Vector3(0, 0, -1), labelOccluders(scene), ray), false)
  wall.position.x = 0
  shell.visible = false
  scene.updateMatrixWorld(true)
  assert.equal(labelOccluders(scene).length, 0)
  wall.geometry.dispose()
  ;(wall.material as THREE.Material).dispose()
})

test('explicit part work view fits a small assembly without forcing the whole-furnace minimum distance', () => {
  const position: [number, number, number] = [-4.65, 1.76, 2.25]
  const radius = 0.85
  for (const [width, height] of [[588, 850], [1280, 720]]) {
    const fit = partViewForViewport(width, height, position, radius)
    assert.ok(fit.distance >= 1.25 && fit.distance < workViewForViewport(width, height, 'Z4').distance / 2)
    if (width >= height) assert.ok(fit.distance < 5)
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100)
    camera.position.set(...fit.position)
    camera.lookAt(...fit.target)
    camera.updateMatrixWorld()
    for (const dx of [-radius, radius]) for (const dy of [-radius, radius]) for (const dz of [-radius, radius]) {
      const projected = new THREE.Vector3(position[0] + dx, position[1] + dy, position[2] + dz).project(camera)
      assert.ok(Math.abs(projected.x) < 0.91 && Math.abs(projected.y) < 0.91 && projected.z > -1)
    }
  }
})
