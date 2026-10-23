import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HologramMaterial, IndustrialMaterial, PartSelectionContext, type FurnaceAppearance } from './furnace-appearance'
import { PART_CATALOG } from './part-catalog'

type Position = [number, number, number]
type EquipmentProps = {
  simulationActive: boolean
  showInterior: boolean
  appearance: FurnaceAppearance
  selectedPartId?: string | null
  onSelectPart?: (id: string) => void
}

function Metal({ appearance, color = '#aab8bd' }: { appearance: FurnaceAppearance; color?: string }) {
  return appearance === 'hologram'
    ? <HologramMaterial color="#68cadd" opacity={0.56} />
    : <IndustrialMaterial color={color} />
}

function Box({ position, size, appearance, color }: {
  position: Position; size: Position; appearance: FurnaceAppearance; color?: string
}) {
  return <mesh position={position} castShadow receiveShadow>
    <boxGeometry args={size} /><Metal appearance={appearance} color={color} />
  </mesh>
}

function Pipe({ points, appearance, radius = 0.035, color = '#aab8bd' }: {
  points: Position[]; appearance: FurnaceAppearance; radius?: number; color?: string
}) {
  // Parents can rerender for each source frame; coordinate equality keeps the
  // same tube instead of allocating it again for an equivalent array literal.
  const key = points.map(point => point.join(',')).join(';')
  const geometry = useMemo(() => {
    const path = new THREE.CurvePath<THREE.Vector3>()
    const coordinates = key.split(';').map(point => point.split(',').map(Number) as Position)
    for (let index = 1; index < coordinates.length; index++) {
      path.add(new THREE.LineCurve3(new THREE.Vector3(...coordinates[index - 1]), new THREE.Vector3(...coordinates[index])))
    }
    return new THREE.TubeGeometry(path, Math.max(8, coordinates.length * 6), radius, 8, false)
  }, [key, radius])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} castShadow><Metal appearance={appearance} color={color} /></mesh>
}

function Cylinder({ position, radius, length, appearance, color, rotation = [Math.PI / 2, 0, 0] }: {
  position: Position; radius: number; length: number; appearance: FurnaceAppearance;
  color?: string; rotation?: Position
}) {
  return <mesh position={position} rotation={rotation} castShadow>
    <cylinderGeometry args={[radius, radius, length, 20]} /><Metal appearance={appearance} color={color} />
  </mesh>
}

function BrushPair({ active, appearance }: { active: boolean; appearance: FurnaceAppearance }) {
  const upper = useRef<THREE.Group>(null)
  const lower = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (!active || !upper.current || !lower.current) return
    const turn = Math.min(delta, 0.05) * 1.2
    upper.current.rotation.z += turn
    lower.current.rotation.z -= turn
  })
  return <group name="ILLUSTRATIVE_BRUSH">
    {([-1, 1] as const).map(side => <group key={side} position={[-15.7, 1.7 + side * 0.22, 0]}
      ref={side === 1 ? upper : lower}>
      <Cylinder position={[0, 0, 0]} radius={0.207} length={1.55} appearance={appearance} color="#46545a" />
      <Cylinder position={[0, 0, 0]} radius={0.065} length={2.15} appearance={appearance} />
      {Array.from({ length: 14 }, (_, index) => {
        const a = index * Math.PI / 7
        return <mesh key={index} position={[Math.cos(a) * 0.21, Math.sin(a) * 0.21, 0]} rotation={[0, 0, a]}>
          <boxGeometry args={[0.022, 0.045, 1.45]} />
          {appearance === 'hologram' ? <HologramMaterial color="#68cadd" opacity={0.48} /> : <meshStandardMaterial color="#708183" roughness={0.92} />}
        </mesh>
      })}
    </group>)}
    {[-1, 1].map(side => <Box key={side} position={[-15.7, 1.7, side * 1.08]}
      size={[0.5, 1.12, 0.16]} appearance={appearance} color="#52616b" />)}
  </group>
}

function Wringer({ active, appearance }: { active: boolean; appearance: FurnaceAppearance }) {
  const rolls = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (!active || !rolls.current) return
    for (const roll of rolls.current.children) roll.rotation.z += Math.min(delta, 0.05) * (roll.position.y > 1.7 ? 1 : -1)
  })
  return <group name="ILLUSTRATIVE_WRINGER">
    <group ref={rolls}>{[-1, 1].map(side => <group key={side} position={[-13.95, 1.7 + side * 0.245, 0]}>
      <Cylinder position={[0, 0, 0]} radius={0.231} length={1.54} appearance={appearance} color="#263b41" />
      <Cylinder position={[0, 0, 0]} radius={0.07} length={2.05} appearance={appearance} />
      <mesh position={[0.225, 0, 0]}><boxGeometry args={[0.012, 0.025, 1.5]} />
        {appearance === 'hologram' ? <HologramMaterial color="#68cadd" opacity={0.48} /> : <meshStandardMaterial color="#779397" roughness={0.8} />}</mesh>
    </group>)}</group>
    {[-1, 1].map(side => <Box key={side} position={[-13.95, 1.48, side * 1.06]}
      size={[0.3, 1.4, 0.17]} appearance={appearance} />)}
    <Box position={[-13.95, 1.11, 0]} size={[0.62, 0.08, 1.75]} appearance={appearance} />
  </group>
}

function Spray({ x, active, appearance }: { x: number; active: boolean; appearance: FurnaceAppearance }) {
  const particles = useRef<THREE.Points>(null)
  const count = 120
  const positions = useMemo(() => new Float32Array(count * 3), [])
  const phase = useRef(0)
  useFrame((_, delta) => {
    if (!active || !particles.current) return
    phase.current += Math.min(delta, 0.05)
    for (let index = 0; index < count; index++) {
      const row = index % 10
      const p = (index * 0.618034 + phase.current * 1.65) % 1
      const side = index % 2 === 0 ? 1 : -1
      positions[index * 3] = x + Math.sin(index * 12.31) * p * 0.14
      positions[index * 3 + 1] = 1.7 + side * (0.4 * (1 - p) + 0.025)
      positions[index * 3 + 2] = (row / 9 - 0.5) * 1.48 + Math.cos(index * 1.7) * p * 0.055
    }
    particles.current.geometry.attributes.position.needsUpdate = true
  })
  return <group name="ILLUSTRATIVE_SPRAY">
    {[-1, 1].map(side => <group key={side}>
      <Cylinder position={[x, 1.7 + side * 0.48, 0]} radius={0.055} length={1.85} appearance={appearance} />
      {Array.from({ length: 8 }, (_, index) => <Cylinder key={index}
        position={[x, 1.7 + side * 0.39, (index / 7 - 0.5) * 1.4]}
        radius={0.023} length={0.13} rotation={[0, 0, 0]} appearance={appearance} color="#677e87" />)}
    </group>)}
    <points ref={particles} visible={active} frustumCulled={false} raycast={() => {}}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color={appearance === 'realistic' ? '#b8e6ee' : '#80f0ef'}
        size={0.027} transparent opacity={0.65} depthWrite={false} sizeAttenuation />
    </points>
  </group>
}

function AirDryer({ x, active, appearance }: { x: number; active: boolean; appearance: FurnaceAppearance }) {
  const jets = useRef<THREE.Group>(null)
  const phase = useRef(0)
  useFrame((_, delta) => {
    if (!active || !jets.current) return
    phase.current += Math.min(delta, 0.05)
    for (let i = 0; i < jets.current.children.length; i++) {
      const jet = jets.current.children[i]
      const side = i % 2 ? -1 : 1
      jet.position.y = 1.7 + side * (0.08 + (1 - ((phase.current * 1.8 + i * 0.17) % 1)) * 0.42)
    }
  })
  return <group name="ILLUSTRATIVE_AIR_DRYER">
    {[-1, 1].map(side => <group key={side}>
      <Box position={[x, 1.7 + side * 0.6, 0]} size={[0.27, 0.21, 1.95]} appearance={appearance} />
      <Box position={[x, 1.7 + side * 0.47, 0]} size={[0.045, 0.06, 1.45]} appearance={appearance} color="#345060" />
      <Pipe points={[[x, 1.7 + side * 0.6, -1.0], [x, 2.8, -1.05], [x + 0.35, 2.8, -1.05]]}
        appearance={appearance} radius={0.095} />
    </group>)}
    <group ref={jets} visible={active}>
      {Array.from({ length: 16 }, (_, index) => <mesh key={index}
        position={[x, 1.7, (Math.floor(index / 2) / 7 - 0.5) * 1.35]} raycast={() => {}}>
        <boxGeometry args={[0.012, 0.09, 0.012]} />
        <meshBasicMaterial color="#b4dae2" transparent opacity={0.3} depthWrite={false} />
      </mesh>)}
    </group>
  </group>
}

function CleaningEquipment({ simulationActive, appearance }: Pick<EquipmentProps, 'simulationActive' | 'appearance'>) {
  return <group name="ILLUSTRATIVE_CLEANING_EQUIPMENT">
    <Box position={[-15.35, 0.98, 0]} size={[3.4, 0.13, 2.45]} appearance={appearance} color="#687d83" />
    {[-1, 1].map(side => <Box key={side} position={[-15.35, 1.17, side * 1.2]}
      size={[3.4, 0.4, 0.09]} appearance={appearance} />)}
    <mesh position={[-15.35, 1.13, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[3.2, 2.3]} />
      {appearance === 'hologram' ? <HologramMaterial color="#68cadd" opacity={0.48} /> : <meshStandardMaterial color="#426b70" metalness={0.25} roughness={0.18} transparent opacity={0.48} />}
    </mesh>
    <Spray x={-16.5} active={simulationActive} appearance={appearance} />
    <BrushPair active={simulationActive} appearance={appearance} />
    <Spray x={-14.8} active={simulationActive} appearance={appearance} />
    <Wringer active={simulationActive} appearance={appearance} />
    <AirDryer x={-12.65} active={simulationActive} appearance={appearance} />
    <AirDryer x={-10.9} active={simulationActive} appearance={appearance} />
    <Pipe points={[[-16.5, 2.18, -0.95], [-16.5, 2.32, -1.15], [-14.8, 2.32, -1.15], [-14.8, 2.18, -0.95]]}
      appearance={appearance} radius={0.045} />
  </group>
}

function Analyzer({ appearance, selected }: { appearance: FurnaceAppearance; selected: boolean }) {
  return <group>
    <Box position={[0, 0, 0]} size={[1.16, 2.22, 0.65]} appearance={appearance} color="#aab9bd" />
    <Box position={[0, 0.54, 0.345]} size={[0.76, 0.47, 0.035]} appearance={appearance} color="#193239" />
    <Box position={[0.4, -0.15, 0.36]} size={[0.035, 0.25, 0.04]} appearance={appearance} color="#6e7f87" />
    {[-0.25, 0, 0.25].map(x => <Cylinder key={x} position={[x, -0.42, 0.36]} radius={0.07}
      length={0.045} appearance={appearance} color="#283f45" />)}
    {Array.from({ length: 6 }, (_, i) => <Box key={i} position={[0, -0.77 + i * 0.04, 0.34]}
      size={[0.65, 0.012, 0.025]} appearance={appearance} color="#586b72" />)}
    {selected && <group position={[0, 0, 0.67]}>
      <Cylinder position={[0, -0.02, 0]} radius={0.16} length={0.63} rotation={[0, 0, Math.PI / 2]} appearance={appearance} color="#819b9d" />
      <Cylinder position={[-0.38, -0.02, 0]} radius={0.045} length={0.18} rotation={[0, 0, Math.PI / 2]} appearance={appearance} />
      <Cylinder position={[0.38, -0.02, 0]} radius={0.045} length={0.18} rotation={[0, 0, Math.PI / 2]} appearance={appearance} />
    </group>}
  </group>
}

function ShaftSeal({ appearance, selected }: { appearance: FurnaceAppearance; selected: boolean }) {
  return <group>
    <Cylinder position={[0, 0, 0]} radius={0.13} length={0.95} appearance={appearance} />
    <Box position={[0, -0.1, -0.08]} size={[0.7, 0.6, 0.28]} appearance={appearance} color="#566e7b" />
    <mesh position={[0, 0, selected ? 0.4 : 0.1]}><torusGeometry args={[0.205, 0.065, 10, 36]} />
      {appearance === 'hologram' ? <HologramMaterial color="#68cadd" opacity={0.48} /> : <meshStandardMaterial color="#1a2529" roughness={0.82} />}</mesh>
    <mesh position={[0, 0, selected ? 0.44 : 0.12]}><torusGeometry args={[0.155, 0.012, 6, 40]} />
      {appearance === 'hologram' ? <HologramMaterial color="#68cadd" opacity={0.48} /> : <meshStandardMaterial color="#c3bfa9" metalness={0.8} roughness={0.3} />}</mesh>
    <mesh position={[0, 0, selected ? 0.28 : 0.06]}><torusGeometry args={[0.27, 0.026, 8, 32]} />
      <Metal appearance={appearance} /></mesh>
  </group>
}

function ORing({ appearance, selected }: { appearance: FurnaceAppearance; selected: boolean }) {
  const spread = selected ? 0.22 : 0.045
  return <group>
    {[-1, 1].map(side => <group key={side} position={[0, 0, side * spread]}>
      <Cylinder position={[0, 0, side * 0.13]} radius={0.105} length={0.22} appearance={appearance} />
      <mesh><ringGeometry args={[0.11, 0.27, 32]} />{appearance === 'hologram' ? <HologramMaterial color="#68cadd" opacity={0.48} /> : <meshStandardMaterial color="#9aaeb5" metalness={0.7} side={THREE.DoubleSide} />}</mesh>
      {Array.from({ length: 6 }, (_, index) => <Cylinder key={index}
        position={[Math.cos(index * Math.PI / 3) * 0.21, Math.sin(index * Math.PI / 3) * 0.21, side * 0.035]}
        radius={0.025} length={0.06} appearance={appearance} color="#5f7784" />)}
    </group>)}
    <mesh><torusGeometry args={[0.153, 0.025, 12, 36]} />
      {appearance === 'hologram' ? <HologramMaterial color="#68cadd" opacity={0.48} /> : <meshStandardMaterial color="#242c2c" roughness={0.88} />}</mesh>
  </group>
}

function Probe({ appearance, oxygen }: { appearance: FurnaceAppearance; oxygen: boolean }) {
  return <group>
    <Cylinder position={[0, 0, -0.43]} radius={oxygen ? 0.065 : 0.038} length={0.95} appearance={appearance} color="#b5b8ad" />
    <Cylinder position={[0, 0, 0]} radius={0.16} length={0.12} appearance={appearance} />
    <Box position={[0, 0.04, 0.22]} size={[oxygen ? 0.32 : 0.22, 0.25, 0.3]}
      appearance={appearance} color={oxygen ? '#657c76' : '#677d91'} />
    <Pipe points={[[0.1, 0.04, 0.35], [0.23, 0.04, 0.4], [0.23, -0.4, 0.4]]}
      appearance={appearance} radius={0.019} color="#424e51" />
  </group>
}

export default function ProcessEquipment({
  simulationActive, showInterior, appearance, selectedPartId, onSelectPart,
}: EquipmentProps) {
  return <group name="REPRESENTATIVE_PROCESS_EQUIPMENT" userData={{ illustrative: true }}>
    <group visible={showInterior || simulationActive || appearance === 'hologram'}>
      <CleaningEquipment simulationActive={simulationActive} appearance={appearance} />
    </group>
    <Pipe points={[[-3.2, 6.4, 1.7], [-3.2, 6.4, 2.05], [-3.2, 3.1, 2.05], [-3.2, 3.1, 4.15], [-3.2, 2.78, 4.15]]}
      appearance={appearance} radius={0.035} color="#778e90" />
    <Pipe points={[[-2.42, 2.14, 3.2], [-2.42, 2.14, 4.0], [-2.62, 2.14, 4.0]]}
      appearance={appearance} radius={0.05} />
    {PART_CATALOG.filter(part => part.evidence !== 'manufacturer-example').map(part => {
      const selected = selectedPartId === part.id
      const partAppearance = selected ? 'hologram' : appearance
      return <PartSelectionContext.Provider key={part.id} value={selected}>
        <group name={`PART_${part.id}`} position={part.position}
          userData={{ partCode: part.partCode, representativePosition: true, selected }}
          onClick={event => { event.stopPropagation(); onSelectPart?.(part.id) }}>
          {part.id === 'INS-006' && <Analyzer appearance={partAppearance} selected={selected} />}
          {part.id === 'SEL-006' && <ShaftSeal appearance={partAppearance} selected={selected} />}
          {part.id === 'SEL-009' && <ORing appearance={partAppearance} selected={selected} />}
          {part.id === 'HTR-006' && <Probe appearance={partAppearance} oxygen={false} />}
          {part.id === 'HTR-008' && <Probe appearance={partAppearance} oxygen />}
        </group>
      </PartSelectionContext.Provider>
    })}
  </group>
}
