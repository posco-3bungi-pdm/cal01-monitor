import { useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Theme } from '../types'
import type { FurnaceZone } from './furnace-model'
import type { SceneGesture } from './scene-input'

type ZoneLabelBridge = {
  elements: Map<string, HTMLDivElement>
  selectZone: ((zoneId: string) => void) | null
  requestFrame: (() => void) | null
  revision: number
}

export type ZoneLabelBridgeRef = RefObject<ZoneLabelBridge>

export function useZoneLabelBridge(): ZoneLabelBridgeRef {
  return useRef<ZoneLabelBridge>({
    elements: new Map(),
    selectZone: null,
    requestFrame: null,
    revision: 0,
  })
}

const labelOffset = (zoneId: string) =>
  zoneId === 'CLN' ? -36 : zoneId === 'Z1' ? 14 : zoneId === 'Z2' ? -14 : 0

// Render this outside Canvas: the application DOM root owns every label.
export function ZoneLabels({ zones, target, bridge, theme, selectedZone, alertZones, gesture }: {
  zones: readonly FurnaceZone[]
  target: HTMLElement | null
  bridge: ZoneLabelBridgeRef
  theme: Theme
  selectedZone: string
  alertZones: ReadonlySet<string>
  gesture: SceneGesture
}) {
  if (!target) return null
  return createPortal(zones.map(zone => {
    const selected = selectedZone === zone.id
    const alert = alertZones.has(zone.id)
    return <div key={zone.id} data-scene-zone={zone.id}
      ref={node => {
        if (node) {
          bridge.current.elements.set(zone.id, node)
          bridge.current.requestFrame?.()
        } else {
          bridge.current.elements.delete(zone.id)
        }
        bridge.current.revision++
      }}
      style={{
        position: 'absolute', left: 0, top: 0,
        visibility: 'hidden', pointerEvents: 'none',
        zIndex: selected ? 2 : 1,
      }}>
      <button type="button" aria-label={`${zone.label}${alert ? ' · 이상 후보' : ''}`}
        aria-pressed={selected}
        title={alert ? '이 LOT에 이상 후보가 있는 구역' : zone.label}
        onClick={event => {
          if (gesture.allowClick(event.detail === 0)) bridge.current.selectZone?.(zone.id)
        }}
        style={{
          pointerEvents: 'auto',
          color: selected ? '#17240a' : theme === 'dark' ? '#dae4e6' : '#253943',
          background: selected ? '#c9ee78' : theme === 'dark' ? '#172127e8' : '#f4f7f4ed',
          border: `1px solid ${selected ? '#c9ee78' : theme === 'dark' ? '#4e626a' : '#acb9bd'}`,
          font: '600 13px ui-monospace, monospace',
          letterSpacing: '0.02em', padding: '5px 7px',
          cursor: 'pointer', whiteSpace: 'nowrap', borderRadius: 2,
          display: 'flex', alignItems: 'center', gap: 5,
          transform: `translate(${zone.id === 'CLN' ? -26 : 0}px, ${labelOffset(zone.id)}px)`,
        }}>
        {zone.label}
        {alert && <span aria-hidden="true" style={{
          width: 6, height: 6, background: '#df5146', borderRadius: '50%',
        }} />}
      </button>
    </div>
  }), target)
}

// Render this inside Canvas. Each frame only updates the existing DOM positions.
export function ZoneLabelProjection({ zones, bridge, onSelectZone }: {
  zones: readonly FurnaceZone[]
  bridge: ZoneLabelBridgeRef
  onSelectZone: (zoneId: string) => void
}) {
  const { camera, size, invalidate } = useThree()
  const points = useMemo(() => zones.map(zone => ({
    id: zone.id,
    world: new THREE.Vector3(zone.x, zone.height + 0.7, 0),
    offset: labelOffset(zone.id),
  })), [zones])
  const projected = useMemo(() => new THREE.Vector3(), [])
  const viewPoint = useMemo(() => new THREE.Vector3(), [])
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const previous = useMemo(() => new THREE.Matrix4(), [])
  const revision = useRef(-1)
  const previousSize = useRef('')

  useLayoutEffect(() => {
    const state = bridge.current
    state.selectZone = onSelectZone
    state.requestFrame = invalidate
    invalidate()
    return () => {
      if (state.selectZone === onSelectZone) state.selectZone = null
      if (state.requestFrame === invalidate) state.requestFrame = null
    }
  }, [bridge, onSelectZone, invalidate])

  useFrame(() => {
    if (!size.width || !size.height) return
    camera.updateMatrixWorld()
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    const sizeKey = `${size.width}:${size.height}`
    if (matrix.equals(previous) && revision.current === bridge.current.revision && previousSize.current === sizeKey) return
    previous.copy(matrix)
    revision.current = bridge.current.revision
    previousSize.current = sizeKey
    for (const point of points) {
      const element = bridge.current.elements.get(point.id)
      if (!element) continue
      viewPoint.copy(point.world).applyMatrix4(camera.matrixWorldInverse)
      projected.copy(point.world).applyMatrix4(matrix)
      const x = (projected.x + 1) * size.width / 2
      const y = (1 - projected.y) * size.height / 2
      const visible = Number.isFinite(x) && Number.isFinite(y)
        && viewPoint.z < 0 && projected.z >= -1 && projected.z <= 1
        && x >= -100 && x <= size.width + 100
        && y + point.offset >= -60 && y + point.offset <= size.height + 60
      element.style.visibility = visible ? 'visible' : 'hidden'
      if (visible) {
        element.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`
      }
    }
  })
  return null
}
