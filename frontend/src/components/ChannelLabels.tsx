import { useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Channel, Theme } from '../types'
import type { Position3 } from './furnace-model'
import ReadingValue from './ReadingValue'
import type { SceneGesture } from './scene-input'
import { anchorOccluded, labelOccluders } from './scene-occlusion'
import { layoutReadouts, READOUT_WIDTH, READOUT_HEIGHT } from './scene-label-layout'
import type { LabelAnchor, LabelRect } from './scene-label-layout'
import { PROCESS_READOUT_WIDTH, PROCESS_READOUT_HEIGHT } from './process-readouts'
import { layoutAnchoredReadouts, followAnchoredReadout } from './anchored-readout-layout'
import type { AnchoredSeat } from './anchored-readout-layout'

type LabelEntry = { node: HTMLDivElement; position: Position3; offset: [number, number]; selected: boolean }
export type ChannelLabelBridge = RefObject<{ entries: Map<string, LabelEntry>; leaders: Map<string, SVGGElement>; revision: number; invalidate?: () => void; status?: HTMLDivElement | null }>
export function useChannelLabelBridge(): ChannelLabelBridge {
  return useRef({ entries: new Map(), leaders: new Map(), revision: 0 })
}

export function ChannelLabels({ target, bridge, channels, positions, values, selected, theme, measuredAt, gesture, onSelect }: {
  target: HTMLElement | null; bridge: ChannelLabelBridge; channels: Channel[]
  positions: Map<string, Position3>; values: Record<string, number | null>
  selected: string; theme: Theme; measuredAt: string | null; gesture: SceneGesture
  onSelect: (id: string) => void
}) {
  if (!target) return null
  return createPortal(<>{channels.map(channel => {
    const position = positions.get(channel.id)
    if (!position) return null
    const output = channel.id.startsWith('OP-')
    const value = values[channel.id]
    const focused = channel.id === selected
    const x = output ? 22 : -174
    const y = channel.id.startsWith('CP-') ? 16 : -70
    const color = channel.id === 'CP-Z4'
      ? (theme === 'dark' ? '#d4b6f3' : '#755093') : (theme === 'dark' ? '#8ce6ed' : '#236978')
    const kind = channel.id === 'CP-Z4' ? '채널 표시 위치 · 실제 설치 위치와 부품 연결은 확인 전'
      : output ? '제어 출력' : channel.id.startsWith('CP-') ? '공정 채널' : '온도 측정'
    return <div key={channel.id} data-channel-readout={channel.id}
      ref={node => {
        if (node) bridge.current.entries.set(channel.id, { node, position, offset: [x, y], selected: focused })
        else bridge.current.entries.delete(channel.id)
        bridge.current.revision++
        bridge.current.invalidate?.()
      }}
      style={{ position: 'absolute', top: 0, left: 0, visibility: 'hidden', pointerEvents: 'none' }}>
      <svg width="1" height="1" aria-hidden="true" style={{ overflow: 'visible', position: 'absolute', pointerEvents: 'none' }}>
        <polyline points={`0,0 ${x < 0 ? -14 : 14},${y + 28} ${x < 0 ? x + READOUT_WIDTH : x},${y + 28}`}
          fill="none" stroke={color} strokeWidth="1" />
        <circle cx="0" cy="0" r="3" fill={color} />
      </svg>
      <button type="button" aria-label={`${channel.id} 채널 선택`}
        onClick={event => { if (gesture.allowClick(event.detail === 0)) onSelect(channel.id) }}
        title={`${kind}${channel.unit ? '' : ' · 단위 미확인'} · ${measuredAt?.replace('T', ' ') ?? '선택 시각에 기록 없음'}`}
        style={{ position: 'absolute', left: x, top: y, width: READOUT_WIDTH, height: READOUT_HEIGHT, boxSizing: 'border-box', pointerEvents: 'auto',
          padding: '6px 8px', textAlign: 'left', fontSize: 13, cursor: 'pointer',
          color: theme === 'dark' ? '#e6f7fa' : '#173c4a',
          background: theme === 'dark' ? '#0b2632e8' : '#f3fbffed',
          border: 0, borderRadius: 12,
          boxShadow: focused ? '0 0 0 2px #a4ce6388, 0 5px 18px #0002'
            : theme === 'dark' ? '0 5px 20px #0005' : '0 5px 20px #14394120',
        }}>
        <strong style={{ fontSize: 13, fontFamily: 'ui-monospace,monospace' }}>{channel.id}</strong>
        <div style={{ fontSize: 16, lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' }}>
          {value == null || !Number.isFinite(value) ? '기록 없음'
            : <ReadingValue channelId={channel.id} value={value} unit={channel.unit} />}
        </div>
        <span style={{ fontSize: 11, opacity: 0.75 }}>{measuredAt?.replace('T', ' ').slice(11, 19) || '기록 시각 없음'}</span>
      </button>
    </div>
  })}
    <div ref={node => { bridge.current.status = node }} style={{ position: 'absolute', bottom: 124, left: 16,
      display: 'none', fontSize: 12, padding: '4px 8px', borderRadius: 8, pointerEvents: 'none',
      color: theme === 'dark' ? '#dbe6ea' : '#29404a', background: theme === 'dark' ? '#14232ce8' : '#f6f9faed' }} />
  </>, target)
}

export function ChannelLabelProjection({ bridge, occlude, occlusionRevision, process = false }: {
  bridge: ChannelLabelBridge; occlude: boolean; occlusionRevision: unknown; process?: boolean
}) {
  const { camera, size, scene, invalidate } = useThree()
  const point = useMemo(() => new THREE.Vector3(), [])
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const lastMatrix = useMemo(() => new THREE.Matrix4(), [])
  const lastRevision = useRef(-1)
  const lastSize = useRef('')
  const lastGroups = useRef('')
  const processTargets = useRef(new Map<string, AnchoredSeat>())
  const processDisplay = useRef(new Map<string, AnchoredSeat>())
  const settling = useRef(false)
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)'), [])
  const origin = useMemo(() => new THREE.Vector3(), [])
  const worldPoint = useMemo(() => new THREE.Vector3(), [])
  const ray = useMemo(() => new THREE.Raycaster(), [])
  useLayoutEffect(() => {
    bridge.current.invalidate = invalidate
    invalidate()
    return () => { if (bridge.current.invalidate === invalidate) bridge.current.invalidate = undefined }
  }, [bridge, invalidate])
  useLayoutEffect(() => {
    lastRevision.current = -1
    if (!process) { processTargets.current.clear(); processDisplay.current.clear(); settling.current = false }
    invalidate()
  }, [occlude, occlusionRevision, process, invalidate])
  useFrame((_, delta) => {
    camera.updateMatrixWorld()
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    const key = `${size.width}:${size.height}`
    const groups = [...bridge.current.entries.keys()].sort().join(',')
    if (matrix.equals(lastMatrix) && lastRevision.current === bridge.current.revision && key === lastSize.current && !settling.current) return
    lastMatrix.copy(matrix)
    lastRevision.current = bridge.current.revision
    if (key !== lastSize.current || groups !== lastGroups.current) { processTargets.current.clear(); processDisplay.current.clear() }
    lastSize.current = key
    lastGroups.current = groups
    settling.current = false
    const walls = occlude ? labelOccluders(scene) : []
    camera.getWorldPosition(origin)
    const visibleAnchors: LabelAnchor[] = []
    for (const [id, { node, position, offset, selected }] of bridge.current.entries) {
      if (!node.isConnected) continue
      worldPoint.set(...position)
      point.copy(worldPoint).applyMatrix4(matrix)
      const x = (point.x + 1) * size.width / 2
      const y = (1 - point.y) * size.height / 2
      const margin = process ? 80 : 0
      const inView = point.z >= -1 && point.z <= 1 && x >= -margin && x <= size.width + margin && y >= -margin && y <= size.height + margin
      const visible = inView && (!occlude || !anchorOccluded(origin, worldPoint, walls, ray))
      node.style.visibility = 'hidden'
      const leader = process ? bridge.current.leaders.get(id) : node.querySelector('svg')
      if (leader) leader.style.display = visible ? '' : 'none'
      if (visible) visibleAnchors.push({ id, x, y, dx: offset[0], dy: offset[1], selected })
    }
    const exclusions: LabelRect[] = []
    if (process) {
      const node = bridge.current.entries.values().next().value?.node
      const host = node?.parentElement?.parentElement
      const root = node?.closest('.immersive')
      if (host && root) {
        const bounds = host.getBoundingClientRect()
        for (const panel of root.querySelectorAll<HTMLElement>('.scene-data-control, .coil-product-popover, .scene-view-controls, .channel-inspector, .part-inspector, .scene-tools, .equipment-alert, .scene-alert-chip, .pending-alert-banner, .scene-toolbar, .workspace-drawer:not([hidden])')) {
          const rect = panel.getBoundingClientRect()
          if (rect.width && rect.height) exclusions.push({ x: rect.left - bounds.left - 4, y: rect.top - bounds.top - 4, width: rect.width + 8, height: rect.height + 8 })
        }
      }
    }
    const placements = process ? layoutAnchoredReadouts(visibleAnchors, size.width, size.height, {
      boxWidth: PROCESS_READOUT_WIDTH, boxHeight: PROCESS_READOUT_HEIGHT, gap: 6,
      top: 90, bottom: 164, exclusions, previous: processTargets.current,
    }) : layoutReadouts(visibleAnchors, size.width, size.height)
    for (const anchor of visibleAnchors) {
      const target = placements.get(anchor.id)
      if (target) {
        const node = bridge.current.entries.get(anchor.id)?.node
        if (!node?.isConnected) continue
        node.style.visibility = 'visible'
        if (process) {
          const next = followAnchoredReadout(processDisplay.current.get(anchor.id), anchor.x, anchor.y, target, delta, reducedMotion.matches)
          const moving = Math.hypot(next.x - target.x, next.y - target.y) > .35
          const box = moving ? { ...next, x: Math.max(10, Math.min(size.width - next.width - 10, next.x)), y: Math.max(90, Math.min(size.height - next.height - 164, next.y)) } : target
          settling.current ||= moving
          processTargets.current.set(anchor.id, { x: anchor.x, y: anchor.y, box: target })
          processDisplay.current.set(anchor.id, { x: anchor.x, y: anchor.y, box })
          node.style.transform = `translate3d(${box.x.toFixed(2)}px,${box.y.toFixed(2)}px,0)`
          const button = node.querySelector('button')
          if (!button) continue
          button.style.left = '0px'; button.style.top = '0px'
          const edgeX = anchor.x < box.x + box.width / 2 ? box.x : box.x + box.width
          const edgeY = Math.max(box.y + 16, Math.min(box.y + box.height - 16, anchor.y))
          const leader = bridge.current.leaders.get(anchor.id)
          if (leader) {
            leader.querySelector('polyline')?.setAttribute('points', `${anchor.x},${anchor.y} ${edgeX + (edgeX === box.x ? -14 : 14)},${edgeY} ${edgeX},${edgeY}`)
            const circle = leader.querySelector('circle')
            circle?.setAttribute('cx', String(anchor.x)); circle?.setAttribute('cy', String(anchor.y))
          }
          continue
        }
        const box = target
        node.style.transform = `translate3d(${anchor.x.toFixed(2)}px,${anchor.y.toFixed(2)}px,0)`
        const dx = box.x - anchor.x, dy = box.y - anchor.y
        const button = node.querySelector('button')
        if (!button) continue
        button.style.left = `${dx}px`
        button.style.top = `${dy}px`
        node.querySelector('polyline')?.setAttribute('points', `0,0 ${dx < 0 ? -14 : 14},${dy + 28} ${dx < 0 ? dx + (process ? PROCESS_READOUT_WIDTH : READOUT_WIDTH) : dx},${dy + 28}`)
      } else if (process) {
        const leader = bridge.current.leaders.get(anchor.id)
        if (leader) leader.style.display = 'none'
      }
    }
    if (bridge.current.status) {
      const hidden = visibleAnchors.length - placements.size
      bridge.current.status.style.display = hidden ? 'block' : 'none'
      bridge.current.status.textContent = hidden ? process ? `겹치는 계측 ${hidden}개 · 아래 Zone을 선택해 확인하세요.` : `라벨 ${hidden}개를 더 보려면 표시할 채널을 줄여 주세요.` : ''
    }
    if (settling.current) invalidate()
  })
  return null
}
