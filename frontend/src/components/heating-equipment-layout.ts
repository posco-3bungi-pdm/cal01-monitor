import * as THREE from 'three'
import type { FurnaceZone, Position3 } from './furnace-model'
export { HEATING_PART_VIEWS } from './heating-equipment-data.ts'

export type EquipmentInstance = {
  position: Position3
  scale: Position3
  rotation?: Position3
}
export type EquipmentSegment = { from: Position3; to: Position3; radius: number }
export type HeatingBank = {
  id: string
  zoneId: string
  tubes: EquipmentInstance[]
  burnerBodies: EquipmentInstance[]
  flanges: EquipmentInstance[]
  returns: EquipmentInstance[]
}

// Teaching dimensions only. The CSV does not establish the installed burner
// type, number, fuel circuit, or radiant-tube wall temperature.
export const RADIANT_TUBE_RADIUS = 0.085
export const RADIANT_TUBE_PLANE = 1.12

export function radiantTubePath() {
  const path = new THREE.CurvePath<THREE.Vector3>()
  const v = (x: number, y: number, z = RADIANT_TUBE_PLANE) => new THREE.Vector3(x, y, z)
  const line = (a: THREE.Vector3, b: THREE.Vector3) => path.add(new THREE.LineCurve3(a, b))
  const bend = (a: THREE.Vector3, control: THREE.Vector3, b: THREE.Vector3) =>
    path.add(new THREE.QuadraticBezierCurve3(a, control, b))
  // Both ends return to the outside. Combustion products stay inside the tube;
  // the open centre of the furnace remains free for the strip.
  line(v(-1.5, -0.2, 1.94), v(-1.5, -0.2, 1.25))
  bend(v(-1.5, -0.2, 1.25), v(-1.5, -0.2), v(-1.37, -0.2))
  line(v(-1.37, -0.2), v(1.35, -0.2))
  path.add(new THREE.CubicBezierCurve3(v(1.35, -0.2), v(1.46, -0.2), v(1.55, -0.11), v(1.55, 0)))
  path.add(new THREE.CubicBezierCurve3(v(1.55, 0), v(1.55, 0.11), v(1.46, 0.2), v(1.35, 0.2)))
  line(v(1.35, 0.2), v(-1.37, 0.2))
  bend(v(-1.37, 0.2), v(-1.5, 0.2), v(-1.5, 0.2, 1.25))
  line(v(-1.5, 0.2, 1.25), v(-1.5, 0.2, 1.94))
  return path
}

export function createRadiantTubeGeometry() {
  return new THREE.TubeGeometry(radiantTubePath(), 112, RADIANT_TUBE_RADIUS, 10, false)
}

export function cylinderForSegment(segment: EquipmentSegment): EquipmentInstance {
  const start = new THREE.Vector3(...segment.from)
  const end = new THREE.Vector3(...segment.to)
  const direction = end.clone().sub(start)
  const rotation = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()),
  )
  return {
    position: start.add(end).multiplyScalar(0.5).toArray() as Position3,
    scale: [segment.radius, direction.length(), segment.radius],
    rotation: [rotation.x, rotation.y, rotation.z],
  }
}

export function createHeatingLayout(zones: FurnaceZone[]) {
  const heatingZones = zones.filter(zone => /^Z[3-6]$/.test(zone.id))
  const air: EquipmentSegment[] = []
  const fuel: EquipmentSegment[] = []
  const exhaust: EquipmentSegment[] = []
  const lining: EquipmentInstance[] = []
  const banks: HeatingBank[] = []
  const pipe = (list: EquipmentSegment[], from: Position3, to: Position3, radius: number) =>
    list.push({ from, to, radius })

  for (const zone of heatingZones) {
    // Avoid the existing access beam at y=5.2 and the top/bottom strip rollers.
    const rows = zone.height > 10 ? [3.25, 4.45, 6.55, 8.75] : [3.25, 4.45, 6.15, 7.65]
    const bank: HeatingBank = {
      id: `HEAT-${zone.id}`, zoneId: zone.id, tubes: [], burnerBodies: [], flanges: [], returns: [],
    }
    for (const side of [1, -1]) {
      const x = zone.x - side * 1.5
      const airX = x - side * 0.3
      const fuelX = x - side * 0.52
      const exhaustX = x + side * 0.38
      pipe(air, [airX, 2.65, side * 3.05], [airX, 2.65, side * 2.65], 0.065)
      pipe(air, [airX, 2.65, side * 2.65], [airX, rows.at(-1)! - 0.2, side * 2.65], 0.065)
      pipe(fuel, [fuelX, 2.35, side * 3.28], [fuelX, 2.35, side * 2.46], 0.033)
      pipe(fuel, [fuelX, 2.35, side * 2.46], [fuelX, rows.at(-1)! - 0.32, side * 2.46], 0.033)
      pipe(exhaust, [exhaustX, 2.75, side * 3.65], [exhaustX, 2.75, side * 2.88], 0.095)
      pipe(exhaust, [exhaustX, 2.75, side * 2.88], [exhaustX, rows.at(-1)! + 0.2, side * 2.88], 0.095)
      for (const y of rows) {
        bank.tubes.push({
          position: [zone.x, y, 0], scale: [1, 1, 1], rotation: [0, side === 1 ? 0 : Math.PI, 0],
        })
        bank.burnerBodies.push({
          position: [x, y - 0.2, side * 2.11], scale: [0.17, 0.48, 0.17], rotation: [Math.PI / 2, 0, 0],
        })
        bank.returns.push({
          position: [x, y + 0.2, side * 2.08], scale: [0.13, 0.42, 0.13], rotation: [Math.PI / 2, 0, 0],
        })
        for (const dy of [-0.2, 0.2]) bank.flanges.push({
          position: [x, y + dy, side * 1.65], scale: [0.215, 0.13, 0.215], rotation: [Math.PI / 2, 0, 0],
        })
        pipe(air, [airX, y - 0.2, side * 2.65], [x, y - 0.2, side * 2.65], 0.047)
        pipe(air, [x, y - 0.2, side * 2.65], [x, y - 0.2, side * 2.34], 0.047)
        pipe(fuel, [fuelX, y - 0.32, side * 2.46], [x, y - 0.32, side * 2.46], 0.026)
        pipe(fuel, [x, y - 0.32, side * 2.46], [x, y - 0.32, side * 2.20], 0.026)
        pipe(exhaust, [x, y + 0.2, side * 2.28], [x, y + 0.2, side * 2.88], 0.075)
        pipe(exhaust, [x, y + 0.2, side * 2.88], [exhaustX, y + 0.2, side * 2.88], 0.075)
      }
    }
    banks.push(bank)
    const tiles = Math.ceil((zone.height - 1.4) / 1.35)
    const tileHeight = (zone.height - 1.4) / tiles
    for (let row = 0; row < tiles; row++) for (let col = 0; col < 3; col++) {
      lining.push({
        position: [zone.x + (col - 1) * 1.29, 1.15 + (row + 0.5) * tileHeight, -1.44],
        scale: [1.275, tileHeight - 0.018, 0.08],
      })
    }
  }
  // Front/rear headers join below the strip transfer path, never through it.
  for (const side of [1, -1]) {
    pipe(air, [-10.7, 2.65, side * 3.05], [7.4, 2.65, side * 3.05], 0.10)
    pipe(fuel, [-10.7, 2.35, side * 3.28], [7.4, 2.35, side * 3.28], 0.055)
    pipe(exhaust, [-9.5, 2.75, side * 3.65], [7.4, 2.75, side * 3.65], 0.15)
    pipe(air, [-10.7, 0.45, side * 3.05], [-10.7, 2.65, side * 3.05], 0.10)
    pipe(exhaust, [7.4, 0.45, side * 3.65], [7.4, 2.75, side * 3.65], 0.15)
  }
  pipe(air, [-10.7, 0.45, -3.05], [-10.7, 0.45, 3.05], 0.10)
  // Route around the existing gas-analysis cabinet; its location is preserved.
  pipe(air, [-10.7, 1.28, 3.65], [-10.7, 1.28, 4.75], 0.14)
  pipe(air, [-10.7, 1.28, 4.75], [7.4, 1.28, 4.75], 0.14)
  pipe(air, [7.4, 1.28, 4.75], [7.4, 2.20, 4.75], 0.14)
  pipe(air, [7.4, 2.20, 4.75], [7.4, 2.20, 3.65], 0.14)
  pipe(exhaust, [7.4, 0.45, -3.65], [7.4, 0.45, 3.65], 0.15)
  pipe(air, [7.4, 2.65, 3.05], [7.4, 2.65, 3.45], 0.10)
  // Two distinct passages through the conceptual recuperator: exhaust and air.
  pipe(exhaust, [7.4, 4.0, 3.65], [7.4, 5.1, 3.65], 0.17)
  return { banks, air, fuel, exhaust, lining }
}
