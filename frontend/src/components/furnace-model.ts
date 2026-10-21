import * as THREE from 'three'
import type { Channel, Placement } from '../types'

export const MODEL_VERSION = 'cal01-concept-v1'
export type Position3 = [number, number, number]

export type FurnaceZone = {
  id: string
  label: string
  x: number
  width: number
  height: number
  depth: number
}

// Display coordinates only. This layout does not establish measured equipment
// dimensions, installed channel positions, or material travel times.
export const FURNACE_ZONES: FurnaceZone[] = [
  { id: 'CLN', label: 'CLN-IN', x: -15.35, width: 3.5, height: 2.6, depth: 2.8 },
  { id: 'Z1', label: 'Z1', x: -12.6, width: 1.65, height: 3.6, depth: 2.7 },
  { id: 'Z2', label: 'Z2', x: -10.85, width: 1.55, height: 4.2, depth: 2.7 },
  { id: 'Z3', label: 'Z3', x: -7.9, width: 4.15, height: 9, depth: 3.15 },
  { id: 'Z4', label: 'Z4', x: -3.5, width: 4.15, height: 10.8, depth: 3.15 },
  { id: 'Z5', label: 'Z5', x: 0.9, width: 4.15, height: 10.8, depth: 3.15 },
  { id: 'Z6', label: 'Z6', x: 5.3, width: 4.15, height: 9, depth: 3.15 },
  { id: 'Z7', label: 'Z7', x: 8.7, width: 2.2, height: 6.9, depth: 2.95 },
  { id: 'Z8', label: 'Z8', x: 11.1, width: 2.2, height: 5.4, depth: 2.95 },
  { id: 'Z9', label: 'Z9', x: 13.5, width: 2.2, height: 4.1, depth: 2.7 },
  { id: 'OUT', label: 'OUT', x: 16.3, width: 2.65, height: 2.8, depth: 2.7 },
]

export function zoneForChannel(channel: Pick<Channel, 'id' | 'zone'>): string {
  if (channel.id === 'CLN-IN') return 'CLN'
  if (channel.id.startsWith('TC-OUT')) return 'OUT'
  const match = channel.id.match(/-Z(\d+)/)
  if (match) return `Z${match[1]}`
  return FURNACE_ZONES.some((zone) => zone.id === channel.zone) ? channel.zone : 'OUT'
}

export function defaultPlacements(channels: Channel[]): Placement[] {
  return channels.map((channel) => {
    const zoneId = zoneForChannel(channel)
    const zone = FURNACE_ZONES.find((item) => item.id === zoneId)!
    let x = zone.x
    let y = Math.min(zone.height - 0.25, zone.height * 0.68 + 0.25)
    if (channel.id.startsWith('OP-')) {
      x += zone.width * 0.2
      y = Math.max(1.5, zone.height * 0.29)
    }
    if (channel.id === 'CP-Z4') {
      x -= 1.08
      y = zone.height * 0.45
    }
    if (channel.id === 'CP-Z4M') {
      x += 1.08
      y = zone.height * 0.45
    }
    if (channel.id === 'TC-OUT1') x -= 0.7
    if (channel.id === 'TC-OUT2') x += 0.7
    return {
      channel_id: channel.id,
      // OUT1/OUT2 share a display housing, but keep their distinct API IDs.
      zone_id: channel.zone || (channel.id.startsWith('TC-OUT') ? channel.id.slice(3) : zoneId),
      position: [x, y, zone.depth / 2 + 0.2],
    }
  })
}

export type Roller = { x: number; y: number; radius: number }
export type StripLayout = { rollers: Roller[]; points: THREE.Vector2[] }

function upperRollerHeight(x: number): number {
  if (x < -5.7) return 8.25
  if (x < 3.1) return 10.05
  if (x < 7.5) return 8.25
  if (x < 9.9) return 6.15
  if (x < 12.3) return 4.65
  return 3.35
}

export function createStripLayout(): StripLayout {
  // Centreline radius includes half the strip thickness, so the inside face
  // rests on the roller instead of intersecting its surface.
  const radius = 0.52
  const rollerRadius = radius - 0.012
  const points: THREE.Vector2[] = [new THREE.Vector2(-18.1, 1.7)]
  const rollers: Roller[] = []
  const arc = (x: number, y: number, from: number, to: number, steps = 24) => {
    for (let i = 0; i <= steps; i += 1) {
      const angle = from + ((to - from) * i) / steps
      points.push(new THREE.Vector2(x + radius * Math.cos(angle), y + radius * Math.sin(angle)))
    }
  }

  // Each connecting line is vertical and tangent to both adjacent rollers.
  // The entry/exit quarter turns join horizontal portions tangentially.
  rollers.push({ x: -10.5, y: 2.22, radius: rollerRadius })
  arc(-10.5, 2.22, -Math.PI / 2, 0, 12)
  for (let i = 0; i < 24; i += 1) {
    const x = -9.46 + i * radius * 2
    const upper = i % 2 === 0
    const y = upper ? upperRollerHeight(x) : 1.72
    rollers.push({ x, y, radius: rollerRadius })
    arc(x, y, Math.PI, upper ? 0 : Math.PI * 2)
  }
  const exitX = rollers.at(-1)!.x + radius * 2
  rollers.push({ x: exitX, y: 1.72, radius: rollerRadius })
  arc(exitX, 1.72, Math.PI, Math.PI / 2, 12)
  points.push(new THREE.Vector2(18.1, 2.24))
  return { rollers, points: points.filter((point, index) =>
    index === 0 || point.distanceToSquared(points[index - 1]) > 1e-12,
  ) }
}

// A closed, thin ribbon: width is along Z; the centreline is the tangent path
// in XY. It is actual ribbon geometry, not a round pipe representing a strip.
export function createStripGeometry(points: THREE.Vector2[]): THREE.BufferGeometry {
  const vertices: number[] = []
  const indices: number[] = []
  const halfWidth = 0.68
  const halfThickness = 0.012
  points.forEach((point, index) => {
    const before = points[Math.max(0, index - 1)]
    const after = points[Math.min(points.length - 1, index + 1)]
    const tangent = after.clone().sub(before).normalize()
    const normal = new THREE.Vector2(-tangent.y, tangent.x)
    for (const side of [-1, 1]) {
      for (const z of [-halfWidth, halfWidth]) {
        vertices.push(
          point.x + normal.x * halfThickness * side,
          point.y + normal.y * halfThickness * side,
          z,
        )
      }
    }
    if (index > 0) {
      const a = (index - 1) * 4
      const b = index * 4
      indices.push(
        a, b, a + 1, a + 1, b, b + 1,
        a + 2, a + 3, b + 2, a + 3, b + 3, b + 2,
        a, a + 2, b, a + 2, b + 2, b,
        a + 1, b + 1, a + 3, a + 3, b + 1, b + 3,
      )
    }
  })
  const last = (points.length - 1) * 4
  indices.push(0, 1, 2, 1, 3, 2, last, last + 2, last + 1, last + 1, last + 2, last + 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

export const OVERVIEW_CAMERA = {
  position: [30, 20, 37] as Position3,
  target: [0, 4.4, 0] as Position3,
}

export function overviewForViewport(width: number, height: number, fov = 40, shiftX = 0, shiftY = 0) {
  const target = new THREE.Vector3(...OVERVIEW_CAMERA.target)
  const direction = new THREE.Vector3(...OVERVIEW_CAMERA.position).sub(target)
  let distance = direction.length()
  direction.normalize()
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize()
  const up = new THREE.Vector3().crossVectors(direction, right)
  const vertical = Math.tan(THREE.MathUtils.degToRad(fov) / 2)
  const horizontal = vertical * Math.max(1, width) / Math.max(1, height)
  // Display bounds include both coils, upper ducts and maintenance walkways.
  for (const x of [-19.2, 19.2]) for (const y of [-0.1, 12.6]) for (const z of [-5, 3.4]) {
    const corner = new THREE.Vector3(x, y, z).sub(target)
    const across = corner.dot(right), above = corner.dot(up), toward = corner.dot(direction)
    distance = Math.max(distance,
      toward + Math.abs(across) / (horizontal * Math.max(0.1, 0.9 - Math.sign(across) * shiftX)),
      toward + Math.abs(above) / (vertical * Math.max(0.1, 0.9 - Math.sign(above) * shiftY)))
  }
  return { position: target.clone().addScaledVector(direction, distance).toArray() as Position3, distance }
}
