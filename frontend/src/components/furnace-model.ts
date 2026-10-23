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

export const STRIP_HALF_WIDTH = 0.68
export const STRIP_HALF_THICKNESS = 0.012
export const STRIP_TRANSFER_Y = 1.7
export const COIL_RADIUS = 0.8 - STRIP_HALF_THICKNESS
export const COIL_CENTRE_Y = STRIP_TRANSFER_Y - COIL_RADIUS - STRIP_HALF_THICKNESS
export type Roller = { x: number; y: number; radius: number; direction: number }
export type StripLayout = { rollers: Roller[]; points: THREE.Vector2[] }

export function createStripLayout(): StripLayout {
  // A conceptual strip route, not a claim about the installed roller count.
  // Each vertical pass stays inside its own housing. Adjacent housings connect
  // at one height through real openings, avoiding the old roof intersections.
  const points: THREE.Vector2[] = [new THREE.Vector2(-18.1, STRIP_TRANSFER_Y)]
  const rollers: Roller[] = []
  const arc = (x: number, y: number, radius: number, from: number, to: number, steps = 32) => {
    for (let i = 0; i <= steps; i += 1) {
      const angle = from + ((to - from) * i) / steps
      points.push(new THREE.Vector2(x + radius * Math.cos(angle), y + radius * Math.sin(angle)))
    }
  }
  for (const zone of FURNACE_ZONES.filter(zone => /^Z[3-9]$/.test(zone.id))) {
    const radius = Math.min(0.48, (zone.width - 0.5) / 6)
    const lowerY = STRIP_TRANSFER_Y + radius
    const upperY = zone.height - radius - 0.28
    const contactRadius = radius - STRIP_HALF_THICKNESS - 0.0015 // tessellated arc clearance
    rollers.push({ x: zone.x - 2 * radius, y: lowerY, radius: contactRadius, direction: 1 })
    arc(zone.x - 2 * radius, lowerY, radius, -Math.PI / 2, 0, 16)
    rollers.push({ x: zone.x, y: upperY, radius: contactRadius, direction: -1 })
    arc(zone.x, upperY, radius, Math.PI, 0)
    rollers.push({ x: zone.x + 2 * radius, y: lowerY, radius: contactRadius, direction: 1 })
    arc(zone.x + 2 * radius, lowerY, radius, Math.PI, Math.PI * 1.5, 16)
  }
  points.push(new THREE.Vector2(18.1, STRIP_TRANSFER_Y))
  return { rollers, points: points.filter((point, index) =>
    index === 0 || point.distanceToSquared(points[index - 1]) > 1e-12,
  ) }
}

export type HousingPanel = { position: Position3; size: Position3; side: 'front' | 'back' | 'side' | 'roof' }

// All wall pieces use this geometry contract. Side openings reserve a gap for
// the complete strip width and thickness, rather than hiding a solid wall.
export function housingPanels(zone: FurnaceZone): HousingPanel[] {
  const floor = 0.8
  const slotLow = STRIP_TRANSFER_Y - 0.18
  const slotHigh = STRIP_TRANSFER_Y + 0.18
  const slotHalfWidth = STRIP_HALF_WIDTH + 0.18
  const panels: HousingPanel[] = [
    { position: [zone.x, (floor + zone.height) / 2, zone.depth / 2], size: [zone.width, zone.height - floor, 0.11], side: 'front' },
    { position: [zone.x, (floor + zone.height) / 2, -zone.depth / 2], size: [zone.width, zone.height - floor, 0.11], side: 'back' },
    { position: [zone.x, zone.height, 0], size: [zone.width, 0.12, zone.depth], side: 'roof' },
  ]
  for (const direction of [-1, 1]) {
    const x = zone.x + direction * zone.width / 2
    panels.push(
      { position: [x, (floor + slotLow) / 2, 0], size: [0.12, slotLow - floor, zone.depth], side: 'side' },
      { position: [x, (slotHigh + zone.height) / 2, 0], size: [0.12, zone.height - slotHigh, zone.depth], side: 'side' },
    )
    const depth = zone.depth / 2 - slotHalfWidth
    for (const zDirection of [-1, 1]) {
      panels.push({ position: [x, STRIP_TRANSFER_Y, zDirection * (slotHalfWidth + depth / 2)],
        size: [0.12, slotHigh - slotLow, depth], side: 'side' })
    }
  }
  return panels
}

// A closed, thin ribbon: width is along Z; the centreline is the tangent path
// in XY. It is actual ribbon geometry, not a round pipe representing a strip.
export function createStripGeometry(points: THREE.Vector2[]): THREE.BufferGeometry {
  const vertices: number[] = []
  const indices: number[] = []
  const travelDistances: number[] = []
  const surfaceUv: number[] = []
  let distance = 0
  const halfWidth = STRIP_HALF_WIDTH
  const halfThickness = STRIP_HALF_THICKNESS
  points.forEach((point, index) => {
    if (index) distance += point.distanceTo(points[index - 1])
    const before = points[Math.max(0, index - 1)]
    const after = points[Math.min(points.length - 1, index + 1)]
    const tangent = after.clone().sub(before).normalize()
    const normal = new THREE.Vector2(-tangent.y, tangent.x)
    for (const side of [-1, 1]) {
      for (const z of [-halfWidth, halfWidth]) {
        travelDistances.push(distance)
        surfaceUv.push(distance, z > 0 ? 1 : 0)
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
  geometry.setAttribute('stripDistance', new THREE.Float32BufferAttribute(travelDistances, 1))
  for (let index = 0; index < surfaceUv.length; index += 2) surfaceUv[index] /= Math.max(distance, 1)
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(surfaceUv, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

export const OVERVIEW_CAMERA = {
  position: [14, 16, 42] as Position3,
  target: [0, 6, 0] as Position3,
}

function fitBounds(width: number, height: number, fov: number, shiftX: number, shiftY: number,
  targetPosition: Position3, cameraDirection: Position3, bounds: [Position3, Position3], minimumDistance = 5) {
  const target = new THREE.Vector3(...targetPosition)
  const direction = new THREE.Vector3(...cameraDirection)
  let distance = minimumDistance
  direction.normalize()
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize()
  const up = new THREE.Vector3().crossVectors(direction, right)
  const vertical = Math.tan(THREE.MathUtils.degToRad(fov) / 2)
  const horizontal = vertical * Math.max(1, width) / Math.max(1, height)
  // Display bounds include both coils, upper ducts and maintenance walkways.
  for (const x of [bounds[0][0], bounds[1][0]]) for (const y of [bounds[0][1], bounds[1][1]]) for (const z of [bounds[0][2], bounds[1][2]]) {
    const corner = new THREE.Vector3(x, y, z).sub(target)
    const across = corner.dot(right), above = corner.dot(up), toward = corner.dot(direction)
    distance = Math.max(distance,
      toward + Math.abs(across) / (horizontal * Math.max(0.1, 0.9 - Math.sign(across) * shiftX)),
      toward + Math.abs(above) / (vertical * Math.max(0.1, 0.9 - Math.sign(above) * shiftY)))
  }
  return { position: target.clone().addScaledVector(direction, distance).toArray() as Position3,
    target: targetPosition, distance }
}

export function overviewForViewport(width: number, height: number, fov = 40, shiftX = 0, shiftY = 0) {
  return fitBounds(width, height, fov, shiftX, shiftY, OVERVIEW_CAMERA.target, [14, 10, 42],
    [[-19.2, -0.1, -5], [19.2, 12.6, 3.4]])
}

export function workViewForViewport(width: number, height: number, zoneId = 'Z3', fov = 40, shiftX = 0, shiftY = 0) {
  const zone = FURNACE_ZONES.find(item => item.id === zoneId) ?? FURNACE_ZONES[3]
  // Keep neighbouring equipment in frame, including around the short entry/exit zones.
  const halfWidth = Math.max(7, zone.width * 1.4)
  const centreY = zone.height / 2 + 0.25
  return fitBounds(width, height, fov, shiftX, shiftY, [zone.x, centreY, 0], [0, 0.65, 14],
    [[zone.x - halfWidth, 0.1, -2.8], [zone.x + halfWidth, Math.max(11.8, zone.height + 1.8), 3.2]], 26)
}

export function partViewForViewport(width: number, height: number, position: Position3, radius: number,
  fov = 40, shiftX = 0, shiftY = 0) {
  return fitBounds(width, height, fov, shiftX, shiftY, position, [2.4, 1.3, 7],
    [[position[0] - radius, position[1] - radius, position[2] - radius],
      [position[0] + radius, position[1] + radius, position[2] + radius]], 1.25)
}
