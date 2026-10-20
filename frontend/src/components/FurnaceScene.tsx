import { Component, Suspense, createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode, RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { CameraControls, Edges, Html, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { Channel, Placement, Theme } from '../types'
import { numberText } from '../time'
import {
  FURNACE_ZONES, MODEL_VERSION, OVERVIEW_CAMERA, createStripGeometry,
  createStripLayout, defaultPlacements, zoneForChannel, overviewForViewport,
} from './furnace-model'
import type { FurnaceZone, Position3 } from './furnace-model'
import { HeatHaze, HologramMaterial, IndustrialMaterial, heatLevel, temperatureForZone } from './furnace-appearance'
import type { FurnaceAppearance } from './furnace-appearance'
import { ZoneLabels, ZoneLabelProjection, useZoneLabelBridge } from './ZoneLabels'
import type { ZoneLabelBridgeRef } from './ZoneLabels'

export type FurnaceSceneProps = {
  channels: Channel[]
  selectedChannel: string
  onSelectChannel: (id: string) => void
  values: Record<string, number | null>
  placements: Placement[]
  onPlacementChange?: (channelId: string, position: Position3) => void
  editing?: boolean
  showInterior: boolean
  theme: Theme
  alertChannelIds?: string[]
  alertZoneIds?: string[]
  motionPlaying?: boolean
  overlayOpen?: boolean
  appearance: FurnaceAppearance
}

type BeamSpec = { position: Position3; scale: Position3; rotation?: Position3 }
const AppearanceContext = createContext({ appearance: 'realistic' as FurnaceAppearance, theme: 'light' as Theme })

function ModelMaterial({ weathered = false, ...props }: {
  color?: string; metalness?: number; roughness?: number; emissive?: string;
  emissiveIntensity?: number; side?: THREE.Side; weathered?: boolean
}) {
  const { appearance, theme } = useContext(AppearanceContext)
  if (appearance === 'hologram') {
    return <HologramMaterial color={theme === 'dark' ? '#4ae2ff' : '#00748b'} opacity={weathered ? 0.15 : 0.42} />
  }
  return weathered ? <IndustrialMaterial color={props.color} emissive={props.emissive}
    emissiveIntensity={props.emissiveIntensity} /> : <meshStandardMaterial {...props} />
}

function SceneViewport({ overlayOpen }: { overlayOpen: boolean }) {
  const { camera, size, invalidate } = useThree()
  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || !size.width || !size.height) return
    if (overlayOpen) {
      const mobile = size.width <= 760
      camera.setViewOffset(size.width, size.height,
        mobile ? 0 : size.width * 0.3, mobile ? size.height * 0.3 : 0,
        size.width, size.height)
    } else camera.clearViewOffset()
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size.width, size.height, overlayOpen, invalidate])
  return null
}
type StripMotion = RefObject<number>

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return reduced
}

function StructuralBeams({ beams, color = '#4c5960' }: { beams: BeamSpec[]; color?: string }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    if (!ref.current) return
    const transform = new THREE.Object3D()
    beams.forEach((beam, index) => {
      transform.position.set(...beam.position)
      transform.scale.set(...beam.scale)
      transform.rotation.set(...(beam.rotation ?? [0, 0, 0]))
      transform.updateMatrix()
      ref.current!.setMatrixAt(index, transform.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [beams])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, beams.length]} castShadow receiveShadow name="STRUCTURAL_MEMBERS">
      <boxGeometry />
      <ModelMaterial color={color} metalness={0.72} roughness={0.39} />
    </instancedMesh>
  )
}

function Pipe({ points, radius = 0.15, color = '#99a4aa' }: {
  points: Position3[]; radius?: number; color?: string
}) {
  const geometry = useMemo(() => new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), false, 'centripetal'),
    28, radius, 10, false,
  ), [points, radius])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} castShadow>
    <ModelMaterial color={color} roughness={0.34} metalness={0.78} />
  </mesh>
}

function Roller({ x, y, radius, direction, motion }: {
  x: number; y: number; radius: number; direction: number; motion: StripMotion
}) {
  const rotor = useRef<THREE.Group>(null)
  useFrame(() => {
    if (rotor.current) rotor.current.rotation.z = (direction * motion.current / radius) % (2 * Math.PI)
  })
  return (
    <group position={[x, y, 0]} name={`ROLLER_${x.toFixed(2).replace('.', '_')}`}>
      <group ref={rotor} name="ROTATING_ROLL_AND_SHAFT">
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[radius, radius, 1.7, 24]} />
          <ModelMaterial color="#a8b6bf" metalness={0.86} roughness={0.24} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.115, 0.115, 3.55, 12]} />
          <ModelMaterial color="#6d7d86" metalness={0.85} roughness={0.29} />
        </mesh>
        {[-1, 1].map((side) => <group key={side} position={[0, 0, side * 0.857]}>
          {[0, Math.PI / 2].map((angle) => <mesh key={angle} rotation={[0, 0, angle]}>
            <boxGeometry args={[radius * 1.65, 0.042, 0.012]} />
            <ModelMaterial color="#344952" metalness={0.35} roughness={0.6} />
          </mesh>)}
        </group>)}
      </group>
      {[-1, 1].map((side) => (
        <group key={side} position={[0, 0, side * 1.7]}>
          <mesh castShadow>
            <boxGeometry args={[0.39, 0.36, 0.32]} />
            <ModelMaterial color="#46555d" metalness={0.65} roughness={0.42} />
          </mesh>
          <mesh position={[0, 0, side * 0.18]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.18, 0.18, 0.15, 16]} />
            <ModelMaterial color="#b8c1c5" metalness={0.8} roughness={0.35} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function FrameAndWalkways() {
  const members = useMemo(() => {
    const beams: BeamSpec[] = []
    const add = (position: Position3, scale: Position3, rotation?: Position3) => beams.push({ position, scale, rotation })
    const columns = [-10.15, -5.7, -1.3, 3.1, 7.55, 10, 12.4, 14.75]
    columns.forEach((x, index) => {
      const h = index < 5 ? 11.7 : index === 5 ? 7.6 : index === 6 ? 6.1 : 4.9
      for (const z of [-2.05, 2.05]) {
        // I-section: the web and two flanges share one instanced draw.
        add([x, h / 2, z], [0.12, h, 0.35])
        add([x - 0.16, h / 2, z], [0.1, h, 0.47])
        add([x + 0.16, h / 2, z], [0.1, h, 0.47])
        add([x, 0.12, z], [0.76, 0.24, 0.8])
      }
      add([x, h - 0.12, 0], [0.34, 0.3, 4.55])
    })
    for (const y of [1.08, 5.2, 11.45]) {
      const length = y > 8 ? 17.7 : y > 2 ? 22.1 : 30.5
      const middle = y > 8 ? -1.3 : y > 2 ? 0.9 : 0
      for (const z of [-2.06, 2.06]) add([middle, y, z], [length, 0.28, 0.22])
    }
    // Maintenance walkway: deck, toe board and thin continuous handrails.
    for (const z of [2.65, -2.65]) {
      add([0.1, 1.12, z], [30.6, 0.16, 1])
      add([0.1, 1.3, z + Math.sign(z) * 0.43], [30.6, 0.2, 0.045])
      for (const y of [1.8, 2.28]) add([0.1, y, z + Math.sign(z) * 0.44], [30.6, 0.065, 0.065])
      for (let x = -15; x <= 15; x += 1.5) add([x, 1.73, z + Math.sign(z) * 0.44], [0.065, 1.15, 0.065])
    }
    // Upper access deck and guardrail, leaving the front of the furnace clear.
    add([-1.3, 10.98, -2.65], [17.5, 0.15, 1.2])
    for (const y of [11.55, 12.03]) add([-1.3, y, -3.18], [17.5, 0.06, 0.06])
    for (let x = -9.7; x < 7.5; x += 1.45) add([x, 11.5, -3.18], [0.06, 1.1, 0.06])
    // Two ladders: independent of the furnace walls.
    for (const x of [-9.5, 7]) {
      for (const dx of [-0.26, 0.26]) add([x + dx, 6, -3.35], [0.06, 10, 0.08])
      for (let y = 1.25; y < 11; y += 0.38) add([x, y, -3.35], [0.58, 0.055, 0.06])
    }
    return beams
  }, [])
  return <group name="FRAME_AND_WALKWAYS"><StructuralBeams beams={members} /></group>
}

function ZoneHousing({ zone, selected, interior, onSelect, theme, alert }: {
  zone: FurnaceZone; selected: boolean; interior: boolean; onSelect: () => void; theme: Theme; alert: boolean
}) {
  const { appearance } = useContext(AppearanceContext)
  const shellColor = theme === 'dark' ? '#a4aaa5' : '#9ba29f'
  const hologram = appearance === 'hologram'
  const floorY = 0.8
  const height = zone.height - floorY
  const hotSection = ['Z3', 'Z4', 'Z5', 'Z6'].includes(zone.id)
  const panelCount = hotSection ? 4 : 2
  const members = useMemo<BeamSpec[]>(() => [
    ...[-1, 1].flatMap((side) => [
      { position: [zone.x + side * (zone.width / 2), zone.height / 2 + 0.4, 0] as Position3,
        scale: [0.07, height, zone.depth + 0.07] as Position3 },
    ]),
    { position: [zone.x, 0.83, 0], scale: [zone.width, 0.2, zone.depth + 0.13] },
    { position: [zone.x, zone.height + 0.02, 0], scale: [zone.width + 0.1, 0.15, zone.depth + 0.12] },
  ], [height, zone])

  const pick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelect()
  }
  return (
    <group name={`ZONE_${zone.id}`} userData={{ zone_id: zone.id, model_version: MODEL_VERSION }}>
      <group name={`SHELL_${zone.id}`} visible={!interior} onClick={pick}>
        {Array.from({ length: panelCount }, (_, index) => {
          const panelY = floorY + (height / panelCount) * (index + 0.5)
          return (
            <group key={index}>
              <mesh position={[zone.x, panelY, zone.depth / 2]} castShadow receiveShadow>
                <boxGeometry args={[zone.width - 0.065, height / panelCount - 0.045, 0.11]} />
                <ModelMaterial weathered color={shellColor} metalness={0.55} roughness={0.42}
                  emissive={selected ? '#a3d334' : '#000000'} emissiveIntensity={selected ? 0.1 : 0} />
                {hologram && <Edges color={theme === 'dark' ? '#57cde7' : '#238296'} lineWidth={1} />}
              </mesh>
              <mesh position={[zone.x, panelY, -zone.depth / 2]} castShadow receiveShadow>
                <boxGeometry args={[zone.width - 0.065, height / panelCount - 0.045, 0.11]} />
                <ModelMaterial weathered color="#61737d" metalness={0.62} roughness={0.4} />
              </mesh>
            </group>
          )
        })}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[zone.x + side * (zone.width / 2), (height / 2) + floorY, 0]} castShadow>
            <boxGeometry args={[0.12, height, zone.depth]} />
            <ModelMaterial weathered color="#768c98" metalness={0.57} roughness={0.43} />
          </mesh>
        ))}
        <mesh position={[zone.x, zone.height, 0]} castShadow>
          <boxGeometry args={[zone.width, 0.12, zone.depth]} />
          <ModelMaterial weathered color="#bbc4c7" metalness={0.65} roughness={0.32} />
          {hologram && <Edges color={theme === 'dark' ? '#57cde7' : '#238296'} />}
        </mesh>
        {/* Service hatch and narrow trim give the shell its assembly scale. */}
        <mesh position={[zone.x - zone.width * 0.15, 2.1, zone.depth / 2 + 0.075]}>
          <boxGeometry args={[Math.min(0.85, zone.width * 0.5), 1.25, 0.07]} />
          <ModelMaterial weathered color="#637983" metalness={0.65} roughness={0.38} />
        </mesh>
        <mesh position={[zone.x - zone.width * 0.15 + 0.2, 2.1, zone.depth / 2 + 0.13]}>
          <boxGeometry args={[0.045, 0.22, 0.055]} />
          <ModelMaterial color="#d9dedc" metalness={0.8} roughness={0.25} />
        </mesh>
      </group>
      <group name={`ZONE_FRAME_${zone.id}`}><StructuralBeams beams={members} color="#526773" /></group>
      <mesh position={[zone.x, 0.69, 0]} onClick={pick}>
        <boxGeometry args={[zone.width, 0.14, zone.depth + 0.12]} />
        <ModelMaterial color={selected ? '#c8ed77' : '#3a4a52'} metalness={0.5} roughness={0.4}
          emissive={selected ? '#abda47' : '#000000'} emissiveIntensity={0.12} />
      </mesh>
      {alert && <mesh position={[zone.x, zone.height / 2 + 0.4, 0]}>
        <boxGeometry args={[zone.width + 0.15, zone.height - 0.65, zone.depth + 0.2]} />
        <meshBasicMaterial visible={false} />
        <Edges color="#f16d64" lineWidth={1.6} />
      </mesh>}
    </group>
  )
}

function Services() {
  const ducts = useMemo(() => [-7.9, -3.5, 0.9, 5.3].map((x, index) => {
    const h = index === 1 || index === 2 ? 10.8 : 9
    return { x, h, points: [[x, h + 0.05, -0.7], [x, h + 0.9, -0.7],
      [x, h + 1.18, -1.1], [x, h + 1.18, -3.9], [x, h + 0.8, -4.25], [x, 1.2, -4.25]] as Position3[] }
  }), [])
  const bus = useMemo<Position3[]>(() => [[-11, 3.25, -3.8], [-8, 3.25, -3.8], [5, 3.25, -3.8], [10, 3.25, -3.8]], [])
  return (
    <group name="DUCTS_AND_PIPES">
      {ducts.map(({ x, h, points }) => (
        <group key={x}>
          <Pipe points={points} radius={0.3} />
          <mesh position={[x, h + 0.15, -0.7]} rotation={[0, 0, 0]} castShadow>
            <cylinderGeometry args={[0.44, 0.44, 0.12, 20]} />
            <ModelMaterial color="#4e6470" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[x, 1.2, -4.25]} castShadow>
            <boxGeometry args={[1.05, 1.2, 1.1]} />
            <ModelMaterial color="#697d86" metalness={0.62} roughness={0.37} />
          </mesh>
        </group>
      ))}
      <Pipe points={bus} radius={0.13} color="#bac1b9" />
      <mesh position={[8.6, 0.45, -4.2]} receiveShadow>
        <boxGeometry args={[2.2, 0.7, 1.4]} /><ModelMaterial color="#3d515c" metalness={0.55} roughness={0.45} />
      </mesh>
      <mesh position={[8.6, 1.05, -4.2]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.48, 0.48, 1.6, 24]} /><ModelMaterial color="#8a9ba1" metalness={0.7} roughness={0.34} />
      </mesh>
    </group>
  )
}

function Coil({ x, motion }: { x: number; motion: StripMotion }) {
  const radius = 0.8 - 0.012
  const centreY = x < 0 ? 0.9 : 1.44
  const rotor = useRef<THREE.Group>(null)
  useFrame(() => {
    if (rotor.current) rotor.current.rotation.z = (-motion.current / radius) % (2 * Math.PI)
  })
  return (
    <group position={[x, centreY, 0]} name={x < 0 ? 'ENTRY_COIL' : 'EXIT_COIL'}>
      <group ref={rotor} name={x < 0 ? 'UNCOILER_ROTATION' : 'RECOILER_ROTATION'}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[radius, radius, 1.45, 48]} />
          <ModelMaterial color="#aab9c2" metalness={0.9} roughness={0.25} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side} position={[0, 0, side * 0.74]}>
            <mesh><ringGeometry args={[0.31, radius + 0.005, 48, 5]} />
              <ModelMaterial color="#ccd5d9" metalness={0.84} roughness={0.32} side={THREE.DoubleSide} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.29, 0.29, 0.12, 24]} />
              <ModelMaterial color="#263944" metalness={0.6} roughness={0.4} /></mesh>
            {[0.46, 0.6, 0.73].map((ringRadius) => <mesh key={ringRadius}>
              <torusGeometry args={[ringRadius, 0.008, 4, 48]} />
              <ModelMaterial color="#7a8c98" metalness={0.7} roughness={0.4} />
            </mesh>)}
            {[0, Math.PI * 2 / 3, Math.PI * 4 / 3].map((angle) => <group key={angle} rotation={[0, 0, angle]}>
              <mesh position={[radius * 0.66, 0, side * 0.014]}>
                <boxGeometry args={[radius * 0.6, 0.052, 0.012]} />
                <ModelMaterial color="#4e646f" metalness={0.45} roughness={0.5} />
              </mesh>
            </group>)}
          </group>
        ))}
      </group>
      <mesh position={[0, -centreY / 2, 0]} receiveShadow><boxGeometry args={[1.1, centreY, 2.1]} />
        <ModelMaterial color="#4d626e" metalness={0.62} roughness={0.4} /></mesh>
    </group>
  )
}

function StripTravelMarks({ points, motion }: { points: THREE.Vector2[]; motion: StripMotion }) {
  const marks = useRef<THREE.InstancedMesh>(null)
  const path = useMemo(() => {
    const distances = new Float64Array(points.length)
    for (let index = 1; index < points.length; index += 1) {
      distances[index] = distances[index - 1] + points[index].distanceTo(points[index - 1])
    }
    const length = distances.at(-1)!
    return { distances, length, count: Math.ceil(length / 5.2) }
  }, [points])
  const transform = useMemo(() => new THREE.Object3D(), [])
  useFrame(() => {
    if (!marks.current) return
    for (let index = 0; index < path.count; index += 1) {
      const distance = (motion.current + index * path.length / path.count) % path.length
      // Interpolate the existing tangent path; do not smooth across a roller.
      let low = 0
      let high = points.length - 1
      while (high - low > 1) {
        const middle = (low + high) >> 1
        if (path.distances[middle] <= distance) low = middle
        else high = middle
      }
      const before = points[low]
      const after = points[high]
      const segment = path.distances[high] - path.distances[low]
      const fraction = (distance - path.distances[low]) / segment
      const dx = after.x - before.x
      const dy = after.y - before.y
      transform.rotation.set(0, 0, Math.atan2(dy, dx))
      for (let side = 0; side < 2; side += 1) {
        const offset = side === 0 ? 0.018 : -0.018
        transform.position.set(
          before.x + dx * fraction - dy / segment * offset,
          before.y + dy * fraction + dx / segment * offset,
          0,
        )
        transform.updateMatrix()
        marks.current.setMatrixAt(index * 2 + side, transform.matrix)
      }
    }
    marks.current.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={marks} args={[undefined, undefined, path.count * 2]}
    name="ILLUSTRATIVE_STRIP_TRAVEL_MARKS" frustumCulled={false}>
    <boxGeometry args={[0.12, 0.008, 1.24]} />
    <ModelMaterial color="#ecf7d1" emissive="#b8d591" emissiveIntensity={0.13}
      metalness={0.35} roughness={0.4} />
  </instancedMesh>
}

function ChannelMarker({ channel, position, selected, value, onSelect, theme, editing, onChange, alert }: {
  channel: Channel; position: Position3; selected: boolean; value: number | null | undefined;
  onSelect: () => void; theme: Theme; editing: boolean; onChange?: (position: Position3) => void; alert: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const object = useRef<THREE.Group>(null)
  const { invalidate } = useThree()
  const output = channel.id.startsWith('OP-')
  const labelVisible = hovered || (editing && selected)
  const color = alert ? '#f5746b' : selected ? '#c9f07b' : value == null ? '#879397' : output ? '#b2c4e0' : '#dce6e8'
  const readout = value == null || !Number.isFinite(value) ? '값 없음' : `${numberText(value)}${channel.unit ? ` ${channel.unit}` : ''}`
  useEffect(() => { object.current?.position.set(...position); invalidate() }, [position, invalidate])
  const marker = (
    <group ref={object} position={position} name={`CHANNEL_${channel.id}`} userData={{ channel_id: channel.id }}>
      <mesh onClick={(event) => { event.stopPropagation(); onSelect() }}
        onPointerOver={(event) => { event.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}>
        {output ? <boxGeometry args={[0.27, 0.27, 0.12]} /> : <sphereGeometry args={[0.16, 16, 12]} />}
        <meshStandardMaterial color={color} metalness={0.25} roughness={0.35}
          emissive={selected ? '#a2cd47' : '#000000'} emissiveIntensity={0.35} depthTest={false} />
      </mesh>
      {selected && <mesh rotation={[0, 0, Math.PI / 4]}>
        <ringGeometry args={[0.23, 0.265, output ? 4 : 32]} />
        <meshBasicMaterial color="#c9f07b" side={THREE.DoubleSide} depthTest={false} />
      </mesh>}
      {labelVisible && <Html position={[0.38, 0.16, 0]} zIndexRange={[40, 25]} style={{ pointerEvents: 'none' }}>
        <div style={{ background: theme === 'dark' ? '#131e24f5' : '#fffffffa',
          borderLeft: `3px solid ${selected ? '#b6dc65' : '#9aabb2'}`, padding: '7px 10px',
          boxShadow: '0 4px 20px #0002', color: theme === 'dark' ? '#ecf2f3' : '#142d3a',
          minWidth: 112, whiteSpace: 'nowrap', fontSize: 14, lineHeight: 1.6 }}>
          <strong style={{ font: '600 14px ui-monospace, monospace' }}>{channel.id}</strong>
          {output && <span style={{ marginLeft: 7, fontSize: 12, opacity: 0.85 }}>출력</span>}
          <div style={{ marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{readout}</div>
          {alert && <div style={{ color: theme === 'dark' ? '#ff9a91' : '#ac342b', fontSize: 12 }}>
            이 LOT에 이상 후보 있음
          </div>}
          {editing && selected && <div style={{ opacity: 0.65, fontSize: 10, marginTop: 3 }}>축을 끌어 표시점 이동</div>}
        </div>
      </Html>}
    </group>
  )
  return <>
    {marker}
    {editing && selected && object.current && <TransformControls object={object as React.RefObject<THREE.Object3D>}
      mode="translate" size={0.75} showX showY showZ
      onMouseUp={() => {
        if (object.current) onChange?.(object.current.position.toArray() as Position3)
      }} />}
  </>
}

function Lighting({ theme }: { theme: Theme }) {
  const { gl, scene } = useThree()
  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const target = generator.fromScene(room, 0.04)
    scene.environment = target.texture
    scene.environmentIntensity = theme === 'dark' ? 0.65 : 0.85
    return () => {
      scene.environment = null
      target.dispose()
      room.dispose()
      generator.dispose()
    }
  }, [gl, scene, theme])
  return <>
    <ambientLight intensity={theme === 'dark' ? 0.45 : 0.65} />
    <hemisphereLight args={['#c4dceb', '#5d6c69', 1.25]} />
    <directionalLight position={[-10, 25, 18]} intensity={2.2} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-24} shadow-camera-right={24}
      shadow-camera-top={18} shadow-camera-bottom={-18} shadow-camera-near={1} shadow-camera-far={70}
      shadow-normalBias={0.04} />
    <directionalLight position={[18, 14, -12]} intensity={1.6} color="#d0e0ef" />
  </>
}

function Facility({ props, resetCounter, animateHeat, zoneLabelBridge }: {
  props: FurnaceSceneProps; resetCounter: number; animateHeat: boolean; zoneLabelBridge: ZoneLabelBridgeRef
}) {
  const { channels, selectedChannel, onSelectChannel, placements, values, showInterior, theme, appearance, editing = false, onPlacementChange } = props
  const controls = useRef<CameraControls>(null)
  const previousZone = useRef<string | null>(null)
  const showingOverview = useRef(true)
  const { camera, size, scene, invalidate } = useThree()
  const motion = useRef(0)
  // A single illustrative travel distance drives every moving part.
  // It is independent of channel values and the selected source timestamp.
  useFrame((_, delta) => {
    if (props.motionPlaying) motion.current += Math.min(delta, 0.05) * 1.6
  }, -1)
  const defaults = useMemo(() => defaultPlacements(channels), [channels])
  const selected = channels.find((channel) => channel.id === selectedChannel)
  const selectedZone = selected ? zoneForChannel(selected) : ''
  const alertedChannels = new Set(props.alertChannelIds ?? [])
  const alertedZones = new Set([
    ...(props.alertZoneIds ?? []).map((zoneId) => zoneId === 'OUT1' || zoneId === 'OUT2' ? 'OUT' : zoneId),
    ...channels.filter((channel) => alertedChannels.has(channel.id)).map(zoneForChannel),
  ])
  const positions = useMemo(() => new Map(defaults.map((fallback) => {
    const saved = placements.find((item) => item.channel_id === fallback.channel_id)
    const valid = saved?.position?.length === 3 && saved.position.every(Number.isFinite)
    return [fallback.channel_id, valid ? saved!.position : fallback.position] as const
  })), [defaults, placements])
  const strip = useMemo(createStripLayout, [])
  const ribbonGeometry = useMemo(() => createStripGeometry(strip.points), [strip])
  const zoneTemperatures = useMemo(() => new Map(FURNACE_ZONES.map(zone =>
    [zone.id, temperatureForZone(zone.id, values)])), [values])
  useLayoutEffect(() => {
    const positions = ribbonGeometry.getAttribute('position')
    const colors = new Float32Array(positions.count * 3)
    const cold = new THREE.Color('#aab9c0')
    const hot = new THREE.Color('#ffab52')
    const color = new THREE.Color()
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index)
      const zone = FURNACE_ZONES.reduce((closest, current) =>
        Math.abs(current.x - x) < Math.abs(closest.x - x) ? current : closest)
      color.copy(cold).lerp(hot, Math.pow(heatLevel(zoneTemperatures.get(zone.id) ?? null), 2))
      color.toArray(colors, index * 3)
    }
    ribbonGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    invalidate()
  }, [ribbonGeometry, zoneTemperatures, invalidate])
  const rollerGroups = useMemo(() => FURNACE_ZONES.map((zone) => ({
    zone,
    rollers: strip.rollers.map((roller, index) => ({
      ...roller, direction: index % 2 === 0 ? 1 : -1,
    })).filter((roller) => FURNACE_ZONES.reduce(
      (closest, current) => Math.abs(current.x - roller.x) < Math.abs(closest.x - roller.x) ? current : closest,
    ).id === zone.id),
  })), [strip])
  const focusZone = (zoneId: string) => {
    const zone = FURNACE_ZONES.find((item) => item.id === zoneId)
    if (!zone || !controls.current) return
    showingOverview.current = false
    const y = Math.max(2.4, zone.height * 0.5)
    const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    void controls.current.setLookAt(zone.x + 7.5, y + 4.8, 13.8, zone.x, y, 0, animate).catch(() => {})
  }
  const fitOverview = (animate: boolean) => {
    if (!controls.current || !(camera instanceof THREE.PerspectiveCamera) || !size.width || !size.height) return
    const shiftX = camera.view?.enabled ? -2 * camera.view.offsetX / camera.view.width : 0
    const shiftY = camera.view?.enabled ? 2 * camera.view.offsetY / camera.view.height : 0
    const fit = overviewForViewport(size.width, size.height, camera.fov, shiftX, shiftY)
    showingOverview.current = true
    controls.current.maxDistance = Math.max(85, fit.distance * 1.2)
    camera.far = Math.max(180, fit.distance + 80)
    camera.updateProjectionMatrix()
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = Math.max(65, fit.distance + 15)
      scene.fog.far = Math.max(130, fit.distance + 80)
    }
    void controls.current.setLookAt(...fit.position, ...OVERVIEW_CAMERA.target, animate).catch(() => {})
  }
  const selectZone = (zoneId: string) => {
    const inZone = channels.filter((channel) => zoneForChannel(channel) === zoneId)
    const match = inZone.find((channel) => alertedChannels.has(channel.id)) ?? inZone[0]
    if (match) onSelectChannel(match.id)
    focusZone(zoneId)
  }
  useEffect(() => () => ribbonGeometry.dispose(), [ribbonGeometry])
  useEffect(() => {
    if (!selectedZone || !controls.current) return
    if (previousZone.current === selectedZone) return
    const firstView = previousZone.current === null
    previousZone.current = selectedZone
    if (firstView) {
      fitOverview(false)
      return
    }
    focusZone(selectedZone)
  }, [selectedZone])
  useEffect(() => {
    if (resetCounter > 0) fitOverview(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [resetCounter])
  useEffect(() => {
    if (showingOverview.current) fitOverview(false)
  }, [size.width, size.height, props.overlayOpen])
  return <AppearanceContext.Provider value={{ appearance, theme }}>
    <ZoneLabelProjection zones={FURNACE_ZONES} bridge={zoneLabelBridge} onSelectZone={selectZone} />
    <Lighting theme={theme} />
    <CameraControls ref={controls} makeDefault minDistance={5} maxDistance={85}
      minPolarAngle={0.15} maxPolarAngle={Math.PI / 2 - 0.025} smoothTime={0.3} draggingSmoothTime={0.12}
      onControlStart={() => controls.current?.stop()} />
    <group name="CAL01_ROOT" userData={{ model_version: MODEL_VERSION, coordinates: 'concept-layout' }}>
      <FrameAndWalkways />
      {FURNACE_ZONES.map((zone) => <ZoneHousing key={zone.id} zone={zone}
        selected={selectedZone === zone.id} interior={showInterior} theme={theme}
        alert={alertedZones.has(zone.id)}
        onSelect={() => selectZone(zone.id)} />)}
      {appearance === 'realistic' && FURNACE_ZONES.map(zone => <HeatHaze key={zone.id} zone={zone}
        temperature={zoneTemperatures.get(zone.id) ?? null} animate={animateHeat} interior={showInterior} />)}
      <group name="ROLLERS">{rollerGroups.map(({ zone, rollers }) => (
        <group key={zone.id} name={`INTERNAL_${zone.id}`} userData={{ zone_id: zone.id }}
          onClick={(event) => { event.stopPropagation(); selectZone(zone.id) }}>
          {rollers.map((roller) => <Roller key={roller.x} {...roller} motion={motion} />)}
        </group>
      ))}</group>
      <mesh geometry={ribbonGeometry} name="CONTINUOUS_STEEL_STRIP" castShadow
        onClick={(event) => {
          event.stopPropagation()
          const closest = FURNACE_ZONES.reduce((previous, zone) =>
            Math.abs(zone.x - event.point.x) < Math.abs(previous.x - event.point.x) ? zone : previous)
          selectZone(closest.id)
        }}>
        {appearance === 'hologram'
          ? <HologramMaterial color={theme === 'dark' ? '#b0f9ff' : '#005b75'} opacity={0.8} />
          : <meshStandardMaterial vertexColors metalness={0.6} roughness={0.38} side={THREE.DoubleSide} />}
      </mesh>
      <StripTravelMarks points={strip.points} motion={motion} />
      <Services />
      <Coil x={-18.1} motion={motion} /><Coil x={18.1} motion={motion} />
      <group name="CHANNEL_MARKERS">
        {channels.map((channel) => <ChannelMarker key={channel.id} channel={channel}
          position={positions.get(channel.id)!} selected={selectedChannel === channel.id}
          value={values[channel.id]} onSelect={() => {
            onSelectChannel(channel.id)
            if (!editing) focusZone(zoneForChannel(channel))
          }}
          theme={theme} editing={editing} alert={alertedChannels.has(channel.id)}
          onChange={(position) => onPlacementChange?.(channel.id, position)} />)}
      </group>
    </group>
    {appearance === 'realistic'
      ? <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
        <planeGeometry args={[46, 14]} />
        <shaderMaterial transparent depthWrite={false}
          vertexShader={`varying vec2 vUv; void main() {
            vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`}
          fragmentShader={`varying vec2 vUv; void main() {
            float fade = 1.0 - smoothstep(0.16, 0.5, length(vUv - 0.5));
            gl_FragColor = vec4(0.02, 0.035, 0.045, fade * 0.32);
          }`} />
      </mesh>
      : <group name="HOLOGRAM_PROJECTION" rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} scale={[1, 0.45, 1]}>
        {[21, 22].map(radius => <mesh key={radius} raycast={() => {}}>
          <ringGeometry args={[radius, radius + 0.025, 96]} />
          <meshBasicMaterial color={theme === 'dark' ? '#3cc9e2' : '#397b8c'} transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>)}
      </group>}
  </AppearanceContext.Provider>
}

class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('3D view could not load', error, info.componentStack) }
  render() {
    if (this.state.failed) return <div style={{ padding: 24, lineHeight: 1.7 }}>
      <strong>이 브라우저에서 3D 화면을 열지 못했어요.</strong>
      <div>채널 목록과 그래프에서 계속 확인할 수 있어요. 브라우저의 하드웨어 가속도 확인해 주세요.</div>
    </div>
    return this.props.children
  }
}

export default function FurnaceScene(props: FurnaceSceneProps) {
  const [resetCounter, setResetCounter] = useState(0)
  const zoneLabelBridge = useZoneLabelBridge()
  const [zoneLabelTarget, setZoneLabelTarget] = useState<HTMLDivElement | null>(null)
  const selected = props.channels.find(channel => channel.id === props.selectedChannel)
  const selectedZone = selected ? zoneForChannel(selected) : ''
  const alertChannels = new Set(props.alertChannelIds ?? [])
  const alertZones = new Set([
    ...(props.alertZoneIds ?? []).map(id => id === 'OUT1' || id === 'OUT2' ? 'OUT' : id),
    ...props.channels.filter(channel => alertChannels.has(channel.id)).map(zoneForChannel),
  ])
  const reducedMotion = useReducedMotion()
  const motionPlaying = Boolean(props.motionPlaying && !reducedMotion)
  const animateHeat = !reducedMotion && !props.editing && props.appearance === 'realistic'
    && FURNACE_ZONES.some(zone => heatLevel(temperatureForZone(zone.id, props.values)) > 0)
  const background = props.appearance === 'hologram'
    ? (props.theme === 'dark' ? '#07151e' : '#dcebef')
    : (props.theme === 'dark' ? '#16202a' : '#dce2e4')
  return <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320,
    background, overflow: 'hidden' }}>
    <SceneErrorBoundary>
      <Canvas shadows={{ type: THREE.PCFShadowMap }} frameloop={motionPlaying || animateHeat ? 'always' : 'demand'} dpr={[1, 1.6]} camera={{
        position: OVERVIEW_CAMERA.position, fov: 40, near: 0.1, far: 180,
      }} gl={{ antialias: true, alpha: false }}
        onCreated={({ camera, gl }) => {
          camera.lookAt(...OVERVIEW_CAMERA.target)
          gl.setClearColor(background)
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
        }}>
        <color attach="background" args={[background]} />
        <fog attach="fog" args={[background, 65, 130]} />
        <SceneViewport overlayOpen={Boolean(props.overlayOpen)} />
        <Suspense fallback={null}><Facility props={{ ...props, motionPlaying }} resetCounter={resetCounter}
          animateHeat={animateHeat} zoneLabelBridge={zoneLabelBridge} /></Suspense>
      </Canvas>
    </SceneErrorBoundary>
    <div ref={setZoneLabelTarget} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }} />
    <ZoneLabels zones={FURNACE_ZONES} target={zoneLabelTarget} bridge={zoneLabelBridge}
      theme={props.theme} selectedZone={selectedZone} alertZones={alertZones} />
    <button type="button" className="scene-reset" onClick={() => setResetCounter((counter) => counter + 1)}
      style={{ position: 'absolute', right: 14, padding: '10px 12px', cursor: 'pointer',
        background: props.theme === 'dark' ? '#1c2c34e8' : '#f7faf7ef',
        color: props.theme === 'dark' ? '#dde8eb' : '#253f4c', fontSize: 13, borderRadius: 2,
        border: `1px solid ${props.theme === 'dark' ? '#4f626d' : '#a7b8be'}` }}>전체 설비</button>
  </div>
}
