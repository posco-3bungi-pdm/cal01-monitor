import { Component, Suspense, createContext, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  workViewForViewport, partViewForViewport, housingPanels, COIL_RADIUS, COIL_CENTRE_Y,
} from './furnace-model'
import type { FurnaceZone, Position3 } from './furnace-model'
import { HeatHaze, HeatHazeLayer, HologramMaterial, HologramThemeContext, IndustrialMaterial, SteelSurfaceMaterial, heatLevel, temperatureForZone } from './furnace-appearance'
import ProcessEquipment from './ProcessEquipment'
import HeatingEquipment from './HeatingEquipment'
import { PART_CATALOG } from './part-catalog'
import { Focus, Maximize2 } from 'lucide-react'
import type { FurnaceAppearance } from './furnace-appearance'
import { ZoneLabels, ZoneLabelProjection, useZoneLabelBridge } from './ZoneLabels'
import type { ZoneLabelBridgeRef } from './ZoneLabels'
import { SceneGesture } from './scene-input'
import { KeyboardNavigation, SceneDiagnostics, ShadowPolicy } from './SceneRuntime'
import { ChannelLabels, ChannelLabelProjection, useChannelLabelBridge } from './ChannelLabels'
import { zoneViewAfterClick } from './zone-attention'
import type { ZoneAttentionMap } from './zone-attention'
import type { ChannelLabelBridge } from './ChannelLabels'
import { CpChannelProbe } from './CpChannelProbe'
import { ProcessReadouts } from './ProcessReadouts'
import { processReadoutGroups } from './process-readouts'

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
  zoneAttention?: ZoneAttentionMap // Measurement groups; CP is independent of the Z4 TC/OP group.
  motionPlaying?: boolean
  overlayOpen?: boolean
  overlaySide?: 'left' | 'right' | null
  overlayWidth?: number
  appearance: FurnaceAppearance
  showLabels?: boolean
  visibleLabelIds?: string[]
  showDiagnostics?: boolean
  onClearSelection?: () => void
  measuredAt?: string | null
  simulationActive?: boolean
  temperatureColors?: boolean
  selectedPartId?: string | null
  onSelectPart?: (partId: string) => void
  showZoneReadouts?: boolean
  onToggleZoneReadouts?: () => void
  cpReadoutsSelected?: boolean
  onToggleCPReadouts?: () => void
  onCPViewChange?: (active: boolean) => void
  readoutsDisabled?: boolean
  onCloseViewChange?: (close: boolean) => void
  onPreviewZone?: (zoneId: string) => void
  onPreviewLeave?: () => void
  onInspectZoneAlert?: (zoneId: string) => void
  sceneFocus?: { zoneId: string; channelId?: string; mode?: 'work' | 'full'; serial: number } | null
}

type BeamSpec = { position: Position3; scale: Position3; rotation?: Position3 }
const AppearanceContext = createContext({ appearance: 'realistic' as FurnaceAppearance, theme: 'light' as Theme })
const GestureContext = createContext<SceneGesture | null>(null)

function ModelMaterial({ weathered = false, attention = false, ...props }: {
  color?: string; metalness?: number; roughness?: number; emissive?: string;
  emissiveIntensity?: number; side?: THREE.Side; weathered?: boolean; attention?: boolean
}) {
  const { appearance, theme } = useContext(AppearanceContext)
  if (appearance === 'hologram') {
    return <HologramMaterial color={attention ? '#ff695c' : theme === 'dark' ? '#4ae2ff' : '#00748b'} opacity={attention ? 0.65 : weathered ? 0.15 : 0.42} emphasis={attention} />
  }
  return weathered ? <IndustrialMaterial color={props.color} emissive={props.emissive}
    emissiveIntensity={props.emissiveIntensity} /> : <meshStandardMaterial {...props} />
}

function SceneViewport({ overlayOpen, overlaySide, overlayWidth }: { overlayOpen: boolean; overlaySide?: 'left' | 'right' | null; overlayWidth?: number }) {
  const { camera, size, invalidate } = useThree()
  useLayoutEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || !size.width || !size.height) return
    if (overlayOpen) {
      const mobile = size.width <= 760
      camera.setViewOffset(size.width, size.height,
        mobile ? 0 : overlaySide === 'left' ? -size.width * .25 : overlayWidth !== undefined ? overlayWidth / 2 : size.width * .3, mobile ? size.height * 0.3 : 0,
        size.width, size.height)
    } else camera.clearViewOffset()
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size.width, size.height, overlayOpen, overlaySide, overlayWidth, invalidate])
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

function RollerBank({ rollers, motion, onSelect }: {
  rollers: ReturnType<typeof createStripLayout>['rollers']; motion: StripMotion;
  onSelect: (event: ThreeEvent<MouseEvent>) => void
}) {
  const metal = useRef<THREE.InstancedMesh>(null)
  const spokes = useRef<THREE.InstancedMesh>(null)
  const lastMotion = useRef(Number.NaN)
  const transform = useMemo(() => new THREE.Object3D(), [])
  const supports = useMemo<BeamSpec[]>(() => rollers.flatMap(roller => [-1, 1].map(side => ({
    position: [roller.x, roller.y, side * 1.7] as Position3,
    scale: [0.39, 0.36, 0.32] as Position3,
  }))), [rollers])
  useLayoutEffect(() => {
    if (!metal.current) return
    rollers.forEach((roller, index) => {
      const parts = [
        { z: 0, radius: roller.radius, depth: 1.7 },
        { z: 0, radius: 0.115, depth: 3.55 },
        { z: -1.88, radius: 0.18, depth: 0.15 },
        { z: 1.88, radius: 0.18, depth: 0.15 },
      ]
      parts.forEach((part, partIndex) => {
        transform.position.set(roller.x, roller.y, part.z)
        transform.rotation.set(Math.PI / 2, 0, 0)
        transform.scale.set(part.radius, part.depth, part.radius)
        transform.updateMatrix()
        metal.current!.setMatrixAt(index * 4 + partIndex, transform.matrix)
      })
    })
    metal.current.instanceMatrix.needsUpdate = true
    metal.current.computeBoundingSphere()
  }, [rollers, transform])
  useFrame(() => {
    if (!spokes.current || lastMotion.current === motion.current) return
    lastMotion.current = motion.current
    rollers.forEach((roller, index) => {
      const rotation = roller.direction * motion.current / roller.radius
      for (let side = 0; side < 2; side++) for (let axis = 0; axis < 2; axis++) {
        transform.position.set(roller.x, roller.y, (side === 0 ? -1 : 1) * 0.857)
        transform.rotation.set(0, 0, rotation + axis * Math.PI / 2)
        transform.scale.set(roller.radius * 1.65, 0.042, 0.012)
        transform.updateMatrix()
        spokes.current!.setMatrixAt(index * 4 + side * 2 + axis, transform.matrix)
      }
    })
    spokes.current.instanceMatrix.needsUpdate = true
    if (!spokes.current.boundingSphere) spokes.current.computeBoundingSphere()
  })
  return <group name="ROLLERS" onClick={onSelect}>
    <instancedMesh ref={metal} args={[undefined, undefined, rollers.length * 4]} castShadow>
      <cylinderGeometry args={[1, 1, 1, 24]} />
      <ModelMaterial color="#a8b6bf" metalness={0.86} roughness={0.24} />
    </instancedMesh>
    <instancedMesh ref={spokes} args={[undefined, undefined, rollers.length * 4]}>
      <boxGeometry />
      <ModelMaterial color="#344952" metalness={0.35} roughness={0.6} />
    </instancedMesh>
    <StructuralBeams beams={supports} color="#46555d" />
  </group>
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

function ZoneHousing({ zone, selected, interior, onSelect, theme, alert, openService = false }: {
  zone: FurnaceZone; selected: boolean; interior: boolean; onSelect: () => void; theme: Theme; alert: boolean; openService?: boolean
}) {
  const { appearance } = useContext(AppearanceContext)
  const gesture = useContext(GestureContext)
  const shell = useRef<THREE.InstancedMesh>(null)
  const shellColor = alert ? '#b84d44' : theme === 'dark' ? '#a4aaa5' : '#9ba29f'
  const panels = useMemo(() => housingPanels(zone).filter(panel =>
    !(openService && (panel.side === 'front' || panel.side === 'roof'))), [zone, openService])
  useLayoutEffect(() => {
    if (!shell.current) return
    const transform = new THREE.Object3D()
    panels.forEach((panel, index) => {
      transform.position.set(...panel.position)
      transform.scale.set(...panel.size)
      transform.updateMatrix()
      shell.current!.setMatrixAt(index, transform.matrix)
    })
    shell.current.instanceMatrix.needsUpdate = true
    shell.current.computeBoundingSphere()
  }, [panels])
  const members = useMemo<BeamSpec[]>(() => [
    ...[-1, 1].flatMap(side => [-1, 1].map(front => ({
      position: [zone.x + side * zone.width / 2, zone.height / 2 + 0.4, front * zone.depth / 2] as Position3,
      scale: [0.08, zone.height - 0.8, 0.08] as Position3,
    }))),
    { position: [zone.x, 0.83, 0], scale: [zone.width, 0.2, zone.depth + 0.13] },
    ...[-1, 1].flatMap(side => [
      { position: [zone.x, zone.height + 0.02, side * zone.depth / 2] as Position3, scale: [zone.width + 0.1, 0.15, 0.1] as Position3 },
      { position: [zone.x + side * zone.width / 2, zone.height + 0.02, 0] as Position3, scale: [0.1, 0.15, zone.depth] as Position3 },
    ]),
  ], [zone])
  const pick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (gesture?.allowClick()) onSelect()
  }
  return <group name={`ZONE_${zone.id}`} userData={{ zone_id: zone.id, model_version: MODEL_VERSION }}>
    <group name={`SHELL_${zone.id}`} visible={!interior} onClick={pick}>
      <instancedMesh key={panels.length} ref={shell} args={[undefined, undefined, panels.length]} castShadow receiveShadow>
        <boxGeometry />
        <ModelMaterial weathered attention={alert} color={shellColor} emissive={alert ? '#d94436' : selected ? '#a3d334' : '#000000'} emissiveIntensity={alert ? 0.35 : selected ? 0.1 : 0} />
      </instancedMesh>
      {!openService && <>
        <mesh position={[zone.x - zone.width * 0.15, 2.1, zone.depth / 2 + 0.075]}>
          <boxGeometry args={[Math.min(0.85, zone.width * 0.5), 1.25, 0.07]} />
          <ModelMaterial weathered color="#637983" metalness={0.65} roughness={0.38} />
        </mesh>
        <mesh position={[zone.x - zone.width * 0.15 + 0.2, 2.1, zone.depth / 2 + 0.13]}>
          <boxGeometry args={[0.045, 0.22, 0.055]} />
          <ModelMaterial color="#d9dedc" metalness={0.8} roughness={0.25} />
        </mesh>
      </>}
    </group>
    <group name={`ZONE_FRAME_${zone.id}`}><StructuralBeams beams={members} color="#526773" /></group>
    <mesh position={[zone.x, 0.69, 0]} onClick={pick}>
      <boxGeometry args={[zone.width, 0.14, zone.depth + 0.12]} />
      <ModelMaterial attention={alert} color={alert ? '#d84e3e' : selected ? '#c8ed77' : '#3a4a52'} metalness={0.5} roughness={0.4}
        emissive={alert ? '#d94436' : selected ? '#abda47' : '#000000'} emissiveIntensity={alert ? 0.4 : 0.12} />
    </mesh>
    {(alert || appearance === 'hologram') && <mesh position={[zone.x, zone.height / 2 + 0.4, 0]} raycast={() => {}}>
      <boxGeometry args={[zone.width + 0.15, zone.height - 0.65, zone.depth + 0.2]} />
      <meshBasicMaterial color="#ed5145" transparent opacity={alert ? 0.12 : 0} depthWrite={false} visible={alert} />
      <Edges color={alert ? '#f16d64' : theme === 'dark' ? '#57cde7' : '#238296'} lineWidth={alert ? 1.6 : 0.65} />
    </mesh>}
  </group>
}

function Coil({ x, motion }: { x: number; motion: StripMotion }) {
  const radius = COIL_RADIUS
  const centreY = COIL_CENTRE_Y
  const rotor = useRef<THREE.Group>(null)
  const previousMotion = useRef(Number.NaN)
  useFrame(() => {
    if (rotor.current && previousMotion.current !== motion.current) {
      previousMotion.current = motion.current
      rotor.current.rotation.z = (-motion.current / radius) % (2 * Math.PI)
    }
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
      {[-1, 1].map(side => <mesh key={side} position={[0, -centreY / 2, side * 1.05]} receiveShadow>
        <boxGeometry args={[1.1, centreY, 0.4]} />
        <ModelMaterial color="#4d626e" metalness={0.62} roughness={0.4} />
      </mesh>)}
    </group>
  )
}

function StripTravelMarks({ points, motion }: { points: THREE.Vector2[]; motion: StripMotion }) {
  const marks = useRef<THREE.InstancedMesh>(null)
  const previousMotion = useRef(Number.NaN)
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
    if (!marks.current || previousMotion.current === motion.current) return
    previousMotion.current = motion.current
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

function ChannelMarker({ channel, position, selected, value, onSelect, theme, editing, onChange, alert, hasReadout }: {
  channel: Channel; position: Position3; selected: boolean; value: number | null | undefined;
  onSelect: () => void; theme: Theme; editing: boolean; onChange?: (position: Position3) => void; alert: boolean; hasReadout: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const object = useRef<THREE.Group>(null)
  const { invalidate } = useThree()
  const output = channel.id.startsWith('OP-')
  const process = channel.id.startsWith('CP-')
  const cpLocation = channel.id === 'CP-Z4'
  const gesture = useContext(GestureContext)
  const labelVisible = (!hasReadout && hovered) || (editing && selected)
  const color = alert ? '#f5746b' : selected ? '#c9f07b' : value == null ? '#879397'
    : cpLocation ? '#b49bd1' : output ? '#b2c4e0' : '#dce6e8'
  const readout = value == null || !Number.isFinite(value) ? '기록 없음' : `${numberText(value)}${channel.unit ? ` ${channel.unit}` : ''}`
  useEffect(() => { object.current?.position.set(...position); invalidate() }, [position, invalidate])
  const marker = (
    <group ref={object} position={position} name={`CHANNEL_${channel.id}`} userData={{ channel_id: channel.id }}>
      <group onClick={event => { event.stopPropagation(); if (gesture?.allowClick()) onSelect() }}
        onPointerOver={event => { event.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}>
        {cpLocation ? <CpChannelProbe color={color} theme={theme} /> : output || process ? <>
          <mesh castShadow><boxGeometry args={process ? [0.4, 0.46, 0.22] : [0.36, 0.42, 0.18]} />
            <meshStandardMaterial color={color} metalness={0.45} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.07, process ? 0.12 : 0.10]}>
            <boxGeometry args={[0.24, 0.13, 0.015]} />
            <meshStandardMaterial color="#173f49" emissive="#2fa9b6" emissiveIntensity={0.35} />
          </mesh>
          <mesh position={[0.08, -0.11, 0.13]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.03, 10]} /><meshStandardMaterial color="#dfe8e7" />
          </mesh>
        </> : <>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.17, 0.17, 0.22, 16]} />
            <meshStandardMaterial color={color} metalness={0.65} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, -0.27]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.38, 10]} />
            <meshStandardMaterial color="#aebcc0" metalness={0.8} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0, 0.12]}><circleGeometry args={[0.11, 16]} />
            <meshStandardMaterial color="#244f5b" emissive={selected ? '#53aeb7' : '#173946'} emissiveIntensity={0.3} />
          </mesh>
        </>}
        {/* Generous picking area; only the physical marker writes depth. */}
        <mesh position={cpLocation ? [0, 0.2, 0.05] : [0, 0, 0]}>
          <boxGeometry args={cpLocation ? [1.1, 1.2, 0.8] : [0.7, 0.75, 0.5]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      {selected && <mesh position={[0, 0, 0.3]} rotation={[0, 0, Math.PI / 4]} raycast={() => {}}>
        <ringGeometry args={[0.35, 0.38, 4]} />
        <meshBasicMaterial color="#c9f07b" side={THREE.DoubleSide} />
      </mesh>}
      {labelVisible && <Html position={[0.38, 0.16, 0]} zIndexRange={[40, 25]} style={{ pointerEvents: 'none' }}>
        <div style={{ background: theme === 'dark' ? '#131e24f5' : '#fffffffa',
          borderLeft: `3px solid ${selected ? '#b6dc65' : '#9aabb2'}`, padding: '7px 10px',
          boxShadow: '0 4px 20px #0002', color: theme === 'dark' ? '#ecf2f3' : '#142d3a',
          minWidth: 112, whiteSpace: 'nowrap', fontSize: 14, lineHeight: 1.6 }}>
          <strong style={{ font: '600 14px ui-monospace, monospace' }}>{channel.id}</strong>
          <span style={{ marginLeft: 7, fontSize: 12, opacity: 0.85 }}>{cpLocation ? '채널 표시 위치' : output ? '제어 출력' : process ? '공정 채널' : '온도 측정'}</span>
          <div style={{ marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{readout}</div>
          {cpLocation && <div style={{ opacity: 0.75, fontSize: 12 }}>실제 설치 위치·부품 연결은 확인 전</div>}
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

function Lighting({ theme, realistic }: { theme: Theme; realistic: boolean }) {
  const { gl, scene } = useThree()
  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const target = generator.fromScene(room, 0.04)
    scene.environment = target.texture
    return () => {
      scene.environment = null
      target.dispose()
      room.dispose()
      generator.dispose()
    }
  }, [gl, scene])
  useEffect(() => { scene.environmentIntensity = theme === 'dark' ? 0.65 : 0.85 }, [scene, theme])
  return <>
    <ambientLight intensity={theme === 'dark' ? 0.45 : 0.65} />
    <hemisphereLight args={['#c4dceb', '#5d6c69', 1.25]} />
    <directionalLight position={[-10, 25, 18]} intensity={2.2} castShadow={realistic}
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-24} shadow-camera-right={24}
      shadow-camera-top={18} shadow-camera-bottom={-18} shadow-camera-near={1} shadow-camera-far={70}
      shadow-normalBias={0.04} />
    <directionalLight position={[18, 14, -12]} intensity={1.6} color="#d0e0ef" />
  </>
}

type ViewCommand = { mode: 'work' | 'full'; serial: number }

function Facility({ props, viewCommand, animateHeat, zoneLabelBridge, channelLabelBridge, host, onZoneViewChange }: {
  props: FurnaceSceneProps; viewCommand: ViewCommand; animateHeat: boolean;
  zoneLabelBridge: ZoneLabelBridgeRef; channelLabelBridge: ChannelLabelBridge; host: RefObject<HTMLDivElement | null>
  onZoneViewChange: (zoneId: string) => void
}) {
  const { channels, selectedChannel, onSelectChannel, placements, values, showInterior, theme, appearance, editing = false, onPlacementChange } = props
  const controls = useRef<CameraControls>(null)
  const currentView = useRef<'work' | 'full' | 'custom'>('full')
  const workZone = useRef('Z3')
  const workPart = useRef<string | null>(null)
  const workChannel = useRef<string | null>(null)
  const gesture = useContext(GestureContext)
  const { camera, size, scene, invalidate } = useThree()
  const motion = useRef(0)
  const proximityTarget = useMemo(() => new THREE.Vector3(), [])
  const wasClose = useRef(false)
  const overviewDistance = useMemo(() => overviewForViewport(size.width || 1, size.height || 1,
    camera instanceof THREE.PerspectiveCamera ? camera.fov : 40).distance, [size.width, size.height, camera])
  useFrame((_, delta) => {
    if (props.motionPlaying || props.simulationActive) motion.current += Math.min(delta, 0.05) * 1.6
    if (controls.current && size.width && size.height) {
      controls.current.getTarget(proximityTarget)
      const close = currentView.current === 'work' || camera.position.distanceTo(proximityTarget) < overviewDistance * 0.72
      if (close !== wasClose.current) { wasClose.current = close; props.onCloseViewChange?.(close) }
    }
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
  const setView = (mode: 'work' | 'full', zoneId: string, animate: boolean,
    partId: string | null | undefined = props.selectedPartId,
    channelId: string | null = selectedChannel) => {
    if (!controls.current || !(camera instanceof THREE.PerspectiveCamera) || !size.width || !size.height) return
    const shiftX = camera.view?.enabled ? -2 * camera.view.offsetX / camera.view.width : 0
    const shiftY = camera.view?.enabled ? 2 * camera.view.offsetY / camera.view.height : 0
    const part = mode === 'work' ? PART_CATALOG.find(item => item.id === partId) : undefined
    const cpPosition = mode === 'work' && !part && channelId === 'CP-Z4' ? positions.get(channelId) : undefined
    const fit = mode === 'full'
      ? overviewForViewport(size.width, size.height, camera.fov, shiftX, shiftY)
      : part ? partViewForViewport(size.width, size.height, part.position, part.viewRadius ?? (part.id === 'INS-006' ? 1.5 : 0.85),
        camera.fov, shiftX, shiftY)
        : cpPosition ? partViewForViewport(size.width, size.height,
          [cpPosition[0], cpPosition[1], cpPosition[2] - 0.15], 1.2, camera.fov, shiftX, shiftY)
        : workViewForViewport(size.width, size.height, zoneId, camera.fov, shiftX, shiftY)
    currentView.current = mode
    props.onCPViewChange?.(Boolean(cpPosition))
    onZoneViewChange(mode === 'work' ? zoneId : '')
    workZone.current = zoneId
    workPart.current = part?.id ?? null
    workChannel.current = cpPosition ? channelId : null
    controls.current.minDistance = part || cpPosition ? 1.25 : 5
    controls.current.maxDistance = Math.max(85, fit.distance * 1.2)
    camera.far = Math.max(180, fit.distance + 80)
    camera.updateProjectionMatrix()
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = Math.max(65, fit.distance + 15)
      scene.fog.far = Math.max(130, fit.distance + 80)
    }
    void controls.current.setLookAt(...fit.position, ...fit.target, animate).catch(() => {})
  }
  const selectZone = (zoneId: string) => {
    if (!editing && (props.zoneAttention?.[zoneId]?.count ?? 0) > 0 && props.onInspectZoneAlert) { props.onInspectZoneAlert(zoneId); return }
    if (zoneId === 'CP') { props.onToggleCPReadouts?.(); return }
    const mode = workChannel.current ? 'work' : zoneViewAfterClick(currentView.current, workZone.current, zoneId)
    const inZone = channels.filter(channel => !channel.id.startsWith('CP-') && zoneForChannel(channel) === zoneId)
    const match = inZone.find(channel => alertedChannels.has(channel.id)) ?? inZone[0]
    if (mode === 'full') props.onClearSelection?.()
    else if (match) onSelectChannel(match.id)
    setView(mode, zoneId, !window.matchMedia('(prefers-reduced-motion: reduce)').matches, null, null)
  }
  const selectNearest = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (!gesture?.allowClick()) return
    const zone = FURNACE_ZONES.reduce((previous, item) =>
      Math.abs(item.x - event.point.x) < Math.abs(previous.x - event.point.x) ? item : previous)
    const channel = channels.find(item => !item.id.startsWith('CP-') && zoneForChannel(item) === zone.id)
    if (channel) onSelectChannel(channel.id)
  }
  const previewNearest = (event: ThreeEvent<PointerEvent>) => {
    if (props.editing || event.buttons) return
    const zone = FURNACE_ZONES.reduce((nearest, item) => Math.abs(item.x - event.point.x) < Math.abs(nearest.x - event.point.x) ? item : nearest)
    props.onPreviewZone?.(zone.id)
  }
  useEffect(() => () => ribbonGeometry.dispose(), [ribbonGeometry])
  useEffect(() => {
    controls.current?.setBoundary(new THREE.Box3(new THREE.Vector3(-40, 0.5, -35), new THREE.Vector3(40, 20, 35)))
  }, [])
  useEffect(() => {
    setView(viewCommand.mode, selectedZone || workZone.current, viewCommand.serial > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [viewCommand])
  useEffect(() => {
    if (currentView.current !== 'custom') setView(currentView.current, workZone.current, false, workPart.current, workChannel.current)
  }, [size.width, size.height, props.overlayOpen, props.overlaySide, props.overlayWidth])
  useEffect(() => {
    if (props.sceneFocus) setView(props.sceneFocus.mode ?? 'work', props.sceneFocus.zoneId.replace(/^(OUT)[12]$/, '$1'), !window.matchMedia('(prefers-reduced-motion: reduce)').matches, null, props.sceneFocus.channelId ?? null)
  }, [props.sceneFocus?.serial])
  const shadowRevision = useMemo(() => [placements, showInterior, props.simulationActive, props.selectedPartId],
    [placements, showInterior, props.simulationActive, props.selectedPartId])
  return <AppearanceContext.Provider value={{ appearance, theme }}><HologramThemeContext.Provider value={theme}>
    <ZoneLabelProjection zones={FURNACE_ZONES} bridge={zoneLabelBridge} onSelectZone={selectZone} cpPosition={positions.get('CP-Z4')} />
    <ChannelLabelProjection bridge={channelLabelBridge} occlude={!props.showZoneReadouts && appearance === 'realistic' && !showInterior}
      occlusionRevision={shadowRevision} process={Boolean(props.showZoneReadouts)} />
    <KeyboardNavigation controls={controls} host={host} disabled={editing} onMove={() => { currentView.current = 'custom'; onZoneViewChange('') }} />
    <Lighting theme={theme} realistic={appearance === 'realistic'} />
    <ShadowPolicy realistic={appearance === 'realistic'} moving={editing} revision={shadowRevision} />
    <CameraControls ref={controls} makeDefault minDistance={5} maxDistance={85}
      minPolarAngle={0.15} maxPolarAngle={Math.PI / 2 - 0.025} smoothTime={0.3} draggingSmoothTime={0.12}
      onControlStart={() => controls.current?.stop()} onControl={() => { currentView.current = 'custom' }} />
    <group name="CAL01_ROOT" onPointerMove={previewNearest} onPointerOver={previewNearest}
      onPointerOut={() => props.onPreviewLeave?.()} userData={{ model_version: MODEL_VERSION, coordinates: 'concept-layout' }}>
      <FrameAndWalkways />
      {FURNACE_ZONES.map((zone) => <ZoneHousing key={zone.id} zone={zone}
        selected={selectedZone === zone.id} interior={showInterior} theme={theme}
        alert={alertedZones.has(zone.id)} openService={Boolean(props.simulationActive && zone.id === 'CLN')}
        onSelect={() => selectZone(zone.id)} />)}
      {appearance === 'realistic' && <HeatHazeLayer active={animateHeat}>
        {FURNACE_ZONES.map(zone => <HeatHaze key={zone.id} zone={zone}
          temperature={zoneTemperatures.get(zone.id) ?? null} animate={animateHeat} interior={showInterior} />)}
      </HeatHazeLayer>}
      <RollerBank rollers={strip.rollers} motion={motion} onSelect={selectNearest} />
      <mesh geometry={ribbonGeometry} name="CONTINUOUS_STEEL_STRIP" castShadow onClick={selectNearest}>
        {appearance === 'hologram' && !props.temperatureColors
          ? <HologramMaterial color={theme === 'dark' ? '#b0f9ff' : '#005b75'} opacity={0.8} />
          : <SteelSurfaceMaterial simulationActive={Boolean(props.simulationActive || props.motionPlaying)} motion={motion} temperatureColors={Boolean(props.temperatureColors)} />}
      </mesh>
      <StripTravelMarks points={strip.points} motion={motion} />
      <HeatingEquipment showInterior={showInterior} appearance={appearance}
        selectedPartId={props.selectedPartId ?? undefined}
        onSelectPart={id => { if (gesture?.allowClick()) props.onSelectPart?.(id) }} />
      <ProcessEquipment simulationActive={Boolean(props.simulationActive)} showInterior={showInterior}
        appearance={appearance} selectedPartId={props.selectedPartId ?? undefined}
        onSelectPart={id => { if (gesture?.allowClick()) props.onSelectPart?.(id) }} />
      <Coil x={-18.1} motion={motion} /><Coil x={18.1} motion={motion} />
      <group name="CHANNEL_MARKERS">
        {channels.map((channel) => <ChannelMarker key={channel.id} channel={channel}
          position={positions.get(channel.id)!} selected={selectedChannel === channel.id}
          value={values[channel.id]} onSelect={() => {
            onSelectChannel(channel.id)
          }}
          theme={theme} editing={editing} alert={alertedChannels.has(channel.id)}
          hasReadout={props.showLabels !== false && (!props.visibleLabelIds || props.visibleLabelIds.includes(channel.id))}
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
  </HologramThemeContext.Provider></AppearanceContext.Provider>
}

class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('3D view could not load', error, info.componentStack) }
  render() {
    if (this.state.failed) return <div style={{ padding: 24, lineHeight: 1.7 }}>
      <strong>3D 화면을 열지 못했습니다.</strong>
      <div>채널 목록과 그래프에서 값을 확인하십시오. 브라우저의 하드웨어 가속 설정도 확인하십시오.</div>
    </div>
    return this.props.children
  }
}

function FurnaceScene(props: FurnaceSceneProps) {
  const [viewCommand, setViewCommand] = useState<ViewCommand>({ mode: 'full', serial: 0 })
  const [zoomedZone, setZoomedZone] = useState('')
  const host = useRef<HTMLDivElement>(null)
  const gesture = useMemo(() => new SceneGesture(), [])
  const zoneLabelBridge = useZoneLabelBridge()
  const channelLabelBridge = useChannelLabelBridge()
  const [zoneLabelTarget, setZoneLabelTarget] = useState<HTMLDivElement | null>(null)
  const [diagnosticsTarget, setDiagnosticsTarget] = useState<HTMLDivElement | null>(null)
  const alertChannels = new Set(props.alertChannelIds ?? [])
  const alertZones = new Set([
    ...(props.alertZoneIds ?? []).map(id => id === 'OUT1' || id === 'OUT2' ? 'OUT' : id),
    ...props.channels.filter(channel => alertChannels.has(channel.id)).map(zoneForChannel),
  ])
  const labelChannels = props.showLabels === false || props.showZoneReadouts ? [] : props.channels.filter(channel =>
    !props.visibleLabelIds || props.visibleLabelIds.includes(channel.id))
  const labelPositions = useMemo(() => new Map(defaultPlacements(props.channels).map(fallback => {
    const saved = props.placements.find(item => item.channel_id === fallback.channel_id)
    const valid = saved?.position?.length === 3 && saved.position.every(Number.isFinite)
    return [fallback.channel_id, valid ? saved!.position : fallback.position] as const
  })), [props.channels, props.placements])
  const reducedMotion = useReducedMotion()
  const motionPlaying = Boolean(props.motionPlaying && !reducedMotion)
  const simulationActive = Boolean(props.simulationActive && !reducedMotion)
  const animateHeat = (motionPlaying || simulationActive) && !props.editing && props.appearance === 'realistic'
    && FURNACE_ZONES.some(zone => heatLevel(temperatureForZone(zone.id, props.values)) > 0)
  const continuous = motionPlaying || simulationActive || animateHeat
  const background = props.appearance === 'hologram'
    ? (props.theme === 'dark' ? '#07151e' : '#dcebef')
    : (props.theme === 'dark' ? '#16202a' : '#dce2e4')
  useEffect(() => {
    const element = host.current
    if (!element) return
    const down = (event: PointerEvent) => {
      gesture.down(event.pointerId, event.clientX, event.clientY, event.button)
      if (event.target instanceof HTMLCanvasElement) element.focus({ preventScroll: true })
    }
    const move = (event: PointerEvent) => gesture.move(event.pointerId, event.clientX, event.clientY)
    const up = (event: PointerEvent) => gesture.up(event.pointerId, event.clientX, event.clientY)
    const cancel = () => gesture.cancel()
    const click = (event: MouseEvent) => {
      if (gesture.allowClick(event.detail === 0)) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    element.addEventListener('pointerdown', down, true)
    element.addEventListener('click', click, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('blur', cancel)
    return () => {
      element.removeEventListener('pointerdown', down, true)
      element.removeEventListener('click', click, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('blur', cancel)
    }
  }, [gesture])
  const buttonStyle = { padding: '9px 10px', display: 'flex', alignItems: 'center', gap: 6,
    cursor: 'pointer', background: props.theme === 'dark' ? '#1c2c34ed' : '#f7faf7f2',
    color: props.theme === 'dark' ? '#dde8eb' : '#253f4c', fontSize: 13, borderRadius: 14,
    border: 0, boxShadow: '0 4px 18px #0002' }
  return <div ref={host} tabIndex={0} onPointerLeave={props.onPreviewLeave} data-cleaning-motion={simulationActive ? 'running' : 'stopped'} data-strip-motion={motionPlaying ? 'running' : 'stopped'} aria-label="3D 설비 화면. 드래그로 회전, 휠로 확대. W A S D 이동, 위 화살표 또는 E 상승, 아래 화살표 또는 Q 하강, Shift 더 빠르게."
    style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320, outlineOffset: -2,
      background, overflow: 'hidden' }}>
    <GestureContext.Provider value={gesture}>
      <SceneErrorBoundary>
        <Canvas shadows={{ type: THREE.PCFShadowMap }} frameloop={continuous ? 'always' : 'demand'} dpr={[1, 1.5]} camera={{
          position: OVERVIEW_CAMERA.position, fov: 40, near: 0.1, far: 180,
        }} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          onPointerMissed={() => { if (!props.editing && gesture.allowClick()) props.onClearSelection?.() }}
          onCreated={({ camera, gl }) => {
            camera.lookAt(...OVERVIEW_CAMERA.target)
            gl.setClearColor(background)
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.05
          }}>
          <color attach="background" args={[background]} />
          <fog attach="fog" args={[background, 65, 130]} />
          <SceneViewport overlayOpen={Boolean(props.overlayOpen)} overlaySide={props.overlaySide} overlayWidth={props.overlayWidth} />
          {props.showDiagnostics && <SceneDiagnostics target={diagnosticsTarget} continuous={continuous} />}
          <Suspense fallback={null}><Facility props={{ ...props, motionPlaying, simulationActive }} viewCommand={viewCommand}
            animateHeat={animateHeat} zoneLabelBridge={zoneLabelBridge} channelLabelBridge={channelLabelBridge} host={host}
            onZoneViewChange={setZoomedZone} /></Suspense>
        </Canvas>
      </SceneErrorBoundary>
    </GestureContext.Provider>
    <div ref={setZoneLabelTarget} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }} />
    <ZoneLabels zones={FURNACE_ZONES} target={zoneLabelTarget} bridge={zoneLabelBridge}
      theme={props.theme} selectedZone={zoomedZone} alertZones={alertZones} attention={props.zoneAttention ?? {}} gesture={gesture}
      channels={props.channels} values={props.values} visibleIds={props.visibleLabelIds} measuredAt={props.measuredAt}
      showReadouts={props.showZoneReadouts} onToggleReadouts={props.onToggleZoneReadouts} onSelectChannel={props.onSelectChannel} cpSelected={props.cpReadoutsSelected} onToggleCP={props.onToggleCPReadouts} disabled={props.readoutsDisabled} onPreviewZone={props.onPreviewZone} onPreviewLeave={props.onPreviewLeave}
      onInspectZoneAlert={props.onInspectZoneAlert}
      readoutZones={props.showZoneReadouts ? processReadoutGroups(props.channels, props.visibleLabelIds, zoomedZone).map(group => group.id) : []} />
    {props.showZoneReadouts && <ProcessReadouts target={zoneLabelTarget} bridge={channelLabelBridge}
      channels={props.channels} visibleIds={props.visibleLabelIds} values={props.values} selected={props.selectedChannel}
      theme={props.theme} measuredAt={props.measuredAt ?? null} attention={props.zoneAttention ?? {}}
      gesture={gesture} onSelect={id => { props.onSelectChannel(id); setViewCommand(previous => ({ mode: 'work', serial: previous.serial + 1 })) }} onPreviewZone={props.onPreviewZone} onPreviewLeave={props.onPreviewLeave} onInspectZoneAlert={props.onInspectZoneAlert} focusedZone={zoomedZone} positions={labelPositions} />}
    <ChannelLabels target={zoneLabelTarget} bridge={channelLabelBridge} channels={labelChannels}
      positions={labelPositions} values={props.values} selected={props.selectedChannel} theme={props.theme}
      measuredAt={props.measuredAt ?? null} gesture={gesture} onSelect={props.onSelectChannel} />
    <div data-scene-ui className="scene-view-controls" style={{ position: 'absolute', top: 140, right: 14, display: 'flex', gap: 5, zIndex: 22 }}>
      <button type="button" style={buttonStyle} data-hint="선택한 구역을 정면에서 보기" onClick={() => setViewCommand(previous => ({ mode: 'work', serial: previous.serial + 1 }))}>
        <Focus size={16} />작업 보기</button>
      <button type="button" style={buttonStyle} data-hint="입측·출측 코일과 공정 전체 보기" onClick={() => { props.onClearSelection?.(); setViewCommand(previous => ({ mode: 'full', serial: previous.serial + 1 })) }}>
        <Maximize2 size={16} />전체 보기</button>
    </div>
    {props.showDiagnostics && <div ref={setDiagnosticsTarget} data-scene-diagnostics="true" role="status"
      style={{ position: 'absolute', left: 16, bottom: 128, maxWidth: 'min(430px, 70%)', zIndex: 24,
        padding: '8px 10px', color: props.theme === 'dark' ? '#dce8e8' : '#223c46',
        background: props.theme === 'dark' ? '#14202bed' : '#f5f8f5ed', fontSize: 12,
        whiteSpace: 'pre-line', pointerEvents: 'none', overflowWrap: 'anywhere' }} />}
  </div>
}

export default memo(FurnaceScene)
