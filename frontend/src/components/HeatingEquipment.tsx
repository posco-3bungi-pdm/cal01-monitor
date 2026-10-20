import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { FURNACE_ZONES } from './furnace-model'
import { HologramMaterial, type FurnaceAppearance } from './furnace-appearance'
import {
  createHeatingLayout, createRadiantTubeGeometry, cylinderForSegment,
  type EquipmentInstance,
} from './heating-equipment-layout'

type HeatingEquipmentProps = {
  showInterior: boolean
  appearance: FurnaceAppearance
  selectedPartId?: string | null
  onSelectPart?: (id: string) => void
}

function Instances({ geometry, entries, color, appearance, selected = false, roughness = 0.66 }: {
  geometry: THREE.BufferGeometry
  entries: EquipmentInstance[]
  color: string
  appearance: FurnaceAppearance
  selected?: boolean
  roughness?: number
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    if (!mesh.current) return
    const transform = new THREE.Object3D()
    entries.forEach((entry, index) => {
      transform.position.set(...entry.position)
      transform.rotation.set(...(entry.rotation ?? [0, 0, 0]))
      transform.scale.set(...entry.scale)
      transform.updateMatrix()
      mesh.current!.setMatrixAt(index, transform.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
    mesh.current.computeBoundingSphere()
  }, [entries])
  return <instancedMesh ref={mesh} args={[geometry, undefined, entries.length]}>
    {appearance === 'hologram'
      ? <HologramMaterial color={selected ? '#bde889' : '#80bac4'} opacity={selected ? 0.75 : 0.48} />
      : <meshStandardMaterial color={color} roughness={roughness} metalness={roughness > 0.9 ? 0 : 0.6}
        emissive={selected ? '#a8d577' : '#000000'} emissiveIntensity={selected ? 0.12 : 0} />}
  </instancedMesh>
}

const box = (position: [number, number, number], scale: [number, number, number]): EquipmentInstance => ({ position, scale })
const axisZ = (position: [number, number, number], radius: number, length: number): EquipmentInstance =>
  ({ position, scale: [radius, length, radius], rotation: [Math.PI / 2, 0, 0] })

// The layout is static. Neither a measured TC value nor playback speed is used
// to invent burner flames, fuel flow, tube temperature, or machine feedback.
function HeatingEquipment({ showInterior, appearance, selectedPartId, onSelectPart }: HeatingEquipmentProps) {
  const layout = useMemo(() => createHeatingLayout(FURNACE_ZONES), [])
  const resources = useMemo(() => ({
    tube: createRadiantTubeGeometry(),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 16),
    box: new THREE.BoxGeometry(),
  }), [])
  useEffect(() => () => Object.values(resources).forEach(geometry => geometry.dispose()), [resources])
  const plumbing = useMemo(() => ({
    air: layout.air.map(cylinderForSegment),
    fuel: layout.fuel.map(cylinderForSegment),
    exhaust: layout.exhaust.map(cylinderForSegment),
  }), [layout])
  const machinery = useMemo(() => ({
    fanShell: [axisZ([-10.7, 1.25, 3.65], 0.46, 0.48)],
    motor: [axisZ([-10.7, 1.25, 4.02], 0.25, 0.35)],
    fanIntake: [axisZ([-10.7, 1.25, 3.38], 0.28, 0.1)],
    fanFeet: [
      box([-10.7, 0.79, 3.65], [1.1, 0.13, 0.85]),
      box([-11.04, 0.61, 3.65], [0.11, 0.35, 0.65]),
      box([-10.36, 0.61, 3.65], [0.11, 0.35, 0.65]),
    ],
    exchangerShell: [
      box([7.4, 3.05, 3.65], [1.2, 1.9, 0.9]),
      box([7.4, 2.06, 3.65], [1.32, 0.16, 1.02]),
    ],
    exchangerFeet: [
      box([6.93, 1.24, 3.65], [0.12, 1.55, 0.75]),
      box([7.87, 1.24, 3.65], [0.12, 1.55, 0.75]),
    ],
    // Parallel ribs make the heat exchanger legible without animated arrows
    // suggesting an actual measured air/exhaust flow.
    exchangerRibs: Array.from({ length: 8 }, (_, index) =>
      box([7.4, 2.36 + index * 0.19, 4.116], [0.94, 0.035, 0.025])),
    fanGrille: Array.from({ length: 7 }, (_, index) => {
      const x = (index - 3) * 0.068
      return box([-10.7 + x, 1.25, 3.323], [0.016, 2 * Math.sqrt(0.27 ** 2 - x ** 2), 0.024])
    }),
  }), [])
  const pick = (id: string) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelectPart?.(id)
  }
  const common = { appearance }
  const internalVisible = showInterior || appearance === 'hologram'

  return <group name="ILLUSTRATIVE_RADIANT_HEATING" userData={{
    illustrative: true, placementBasis: 'manufacturer-examples', measuredInstallation: false,
  }}>
    {layout.banks.map(bank => <group key={bank.id} name={bank.id}
      userData={{ illustrative: true, zoneId: bank.zoneId }}
      onClick={pick(bank.id)}>
      <group visible={internalVisible}>
        <Instances geometry={resources.tube} entries={bank.tubes} color="#827064"
          selected={selectedPartId === bank.id} {...common} />
      </group>
      <Instances geometry={resources.cylinder} entries={bank.burnerBodies} color="#53616a"
        selected={selectedPartId === bank.id} {...common} />
      <Instances geometry={resources.cylinder} entries={bank.flanges} color="#a5a39a"
        selected={selectedPartId === bank.id} roughness={0.5} {...common} />
      <Instances geometry={resources.cylinder} entries={bank.returns} color="#8e8274"
        selected={selectedPartId === bank.id} {...common} />
    </group>)}
    <group name="HEAT-AIR" userData={{ illustrative: true }} onClick={pick('HEAT-AIR')}>
      <Instances geometry={resources.cylinder} entries={plumbing.air} color="#819197"
        selected={selectedPartId === 'HEAT-AIR'} {...common} />
      <Instances geometry={resources.cylinder} entries={plumbing.fuel} color="#a79864"
        selected={selectedPartId === 'HEAT-AIR'} {...common} />
      <Instances geometry={resources.cylinder} entries={machinery.fanShell} color="#5d7178"
        selected={selectedPartId === 'HEAT-AIR'} {...common} />
      <Instances geometry={resources.cylinder} entries={machinery.motor} color="#46585f" {...common} />
      <Instances geometry={resources.cylinder} entries={machinery.fanIntake} color="#253c43" {...common} />
      <Instances geometry={resources.box} entries={machinery.fanFeet} color="#58696f" {...common} />
      <Instances geometry={resources.box} entries={machinery.fanGrille} color="#a1aca8" {...common} />
    </group>
    <group name="HEAT-RECUP" userData={{ illustrative: true }} onClick={pick('HEAT-RECUP')}>
      <Instances geometry={resources.cylinder} entries={plumbing.exhaust} color="#8b827a"
        selected={selectedPartId === 'HEAT-RECUP'} {...common} />
      <Instances geometry={resources.box} entries={machinery.exchangerShell} color="#899294"
        selected={selectedPartId === 'HEAT-RECUP'} {...common} />
      <Instances geometry={resources.box} entries={machinery.exchangerFeet} color="#59676b" {...common} />
      <Instances geometry={resources.box} entries={machinery.exchangerRibs} color="#4f6268" {...common} />
    </group>
    <group name="HEAT-LINING" visible={internalVisible} userData={{ illustrative: true }}
      onClick={pick('HEAT-LINING')}>
      <Instances geometry={resources.box} entries={layout.lining} color="#c7c1a7" roughness={0.98}
        selected={selectedPartId === 'HEAT-LINING'} {...common} />
    </group>
  </group>
}

export default memo(HeatingEquipment)
