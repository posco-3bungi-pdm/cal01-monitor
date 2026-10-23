import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { FURNACE_ZONES, STRIP_HALF_WIDTH, STRIP_TRANSFER_Y } from '../src/components/furnace-model.ts'
import {
  createHeatingLayout, createRadiantTubeGeometry, cylinderForSegment, HEATING_PART_VIEWS,
} from '../src/components/heating-equipment-layout.ts'

test('radiant tubes on both faces leave the complete strip width clear', () => {
  const geometry = createRadiantTubeGeometry()
  const vertices = geometry.getAttribute('position')
  const layout = createHeatingLayout(FURNACE_ZONES)
  assert.equal(layout.banks.length, 4)
  for (const bank of layout.banks) {
    assert.equal(bank.tubes.length, 8)
    for (const tube of bank.tubes) {
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(...tube.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(tube.rotation ?? [0, 0, 0]))),
        new THREE.Vector3(...tube.scale),
      )
      for (let i = 0; i < vertices.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(matrix)
        assert.ok(Math.abs(point.z) > STRIP_HALF_WIDTH + 0.25,
          `${bank.id} tube intersects the strip travel envelope`)
        assert.ok(Number.isFinite(point.x + point.y + point.z))
      }
    }
  }
  geometry.dispose()
})

test('plumbing crosses between the front and rear only below the transfer path', () => {
  const layout = createHeatingLayout(FURNACE_ZONES)
  const segments = [...layout.air, ...layout.fuel, ...layout.exhaust]
  const seen = new Set<string>()
  for (const segment of segments) {
    const key = `${segment.from.join(',')}>${segment.to.join(',')}:${segment.radius}`
    assert.equal(seen.has(key), false, 'duplicate pipes waste draws and can cause surface flicker')
    seen.add(key)
    const minZ = Math.min(segment.from[2], segment.to[2]) - segment.radius
    const maxZ = Math.max(segment.from[2], segment.to[2]) + segment.radius
    if (minZ < STRIP_HALF_WIDTH && maxZ > -STRIP_HALF_WIDTH) {
      assert.ok(Math.max(segment.from[1], segment.to[1]) + segment.radius < STRIP_TRANSFER_Y - 0.4)
    }
    const instance = cylinderForSegment(segment)
    assert.ok(instance.scale[1] > 0)
    assert.ok(instance.position.every(Number.isFinite))
  }
})

test('every selectable heating assembly has one canonical camera anchor', () => {
  const layout = createHeatingLayout(FURNACE_ZONES)
  const ids = [...layout.banks.map(bank => bank.id), 'HEAT-AIR', 'HEAT-RECUP', 'HEAT-LINING']
  assert.deepEqual(HEATING_PART_VIEWS.map(view => view.id), ids)
  for (const view of HEATING_PART_VIEWS) {
    assert.ok(view.viewRadius > 0 && Number.isFinite(view.viewRadius))
    assert.ok(view.position.every(Number.isFinite))
  }
})

test('cold-air duct clears the existing gas-analysis cabinet without moving it', () => {
  // INS-006 at [-3.2, 1.7, 4.15], with the existing 1.16 × 2.22 × 0.65 shell.
  const cabinet = new THREE.Box3(
    new THREE.Vector3(-3.78, 0.59, 3.825),
    new THREE.Vector3(-2.62, 2.81, 4.475),
  )
  const coldDucts = createHeatingLayout(FURNACE_ZONES).air.filter(segment => segment.radius === 0.14)
  assert.equal(coldDucts.length, 4)
  for (const segment of coldDucts) {
    const bounds = cabinet.clone().expandByScalar(segment.radius + 0.03)
    const start = new THREE.Vector3(...segment.from)
    const delta = new THREE.Vector3(...segment.to).sub(start)
    let entry = 0
    let exit = 1
    for (const axis of ['x', 'y', 'z'] as const) {
      if (Math.abs(delta[axis]) < 1e-12) {
        if (start[axis] < bounds.min[axis] || start[axis] > bounds.max[axis]) {
          entry = Infinity
          break
        }
      } else {
        const first = (bounds.min[axis] - start[axis]) / delta[axis]
        const last = (bounds.max[axis] - start[axis]) / delta[axis]
        entry = Math.max(entry, Math.min(first, last))
        exit = Math.min(exit, Math.max(first, last))
      }
    }
    assert.ok(entry > exit, 'cold-air pipe penetrates the preserved analyzer cabinet or its clearance')
  }
})
