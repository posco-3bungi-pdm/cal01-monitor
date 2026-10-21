import { useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Channel, Theme } from '../types'
import type { Position3 } from './furnace-model'
import { numberText } from '../time'
import type { SceneGesture } from './scene-input'
import { anchorOccluded, labelOccluders } from './scene-occlusion'
import { layoutReadouts } from './scene-label-layout'
import type { LabelAnchor } from './scene-label-layout'

type LabelEntry = { node: HTMLDivElement; position: Position3; offset: [number, number]; selected: boolean }
export type ChannelLabelBridge = RefObject<{ entries: Map<string, LabelEntry>; revision: number; invalidate?: () => void; status?: HTMLDivElement | null }>
export function useChannelLabelBridge(): ChannelLabelBridge {
  return useRef({ entries: new Map(), revision: 0 })
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
    const x = output ? 22 : -142
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
        <polyline points={`0,0 ${x < 0 ? -14 : 14},${y + 28} ${x < 0 ? x + 122 : x},${y + 28}`}
          fill="none" stroke={color} strokeWidth="1" />
        <circle cx="0" cy="0" r="3" fill={color} />
      </svg>
      <button type="button" aria-label={`${channel.id} 채널 선택`}
        onClick={event => { if (gesture.allowClick(event.detail === 0)) onSelect(channel.id) }}
        title={`${kind} · ${measuredAt?.replace('T', ' ') ?? '선택 시각에 기록 없음'}`}
        style={{ position: 'absolute', left: x, top: y, width: 122, height: 74, boxSizing: 'border-box', pointerEvents: 'auto',
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
            : `${numberText(value)}${channel.unit ? ` ${channel.unit}` : ''}`}
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

export function ChannelLabelProjection({ bridge, occlude, occlusionRevision }: {
  bridge: ChannelLabelBridge; occlude: boolean; occlusionRevision: unknown
}) {
  const { camera, size, scene, invalidate } = useThree()
  const point = useMemo(() => new THREE.Vector3(), [])
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const lastMatrix = useMemo(() => new THREE.Matrix4(), [])
  const lastRevision = useRef(-1)
  const lastSize = useRef('')
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
    invalidate()
  }, [occlude, occlusionRevision, invalidate])
  useFrame(() => {
    camera.updateMatrixWorld()
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    const key = `${size.width}:${size.height}`
    if (matrix.equals(lastMatrix) && lastRevision.current === bridge.current.revision && key === lastSize.current) return
    lastMatrix.copy(matrix)
    lastRevision.current = bridge.current.revision
    lastSize.current = key
    const walls = occlude ? labelOccluders(scene) : []
    camera.getWorldPosition(origin)
    const visibleAnchors: LabelAnchor[] = []
    for (const [id, { node, position, offset, selected }] of bridge.current.entries) {
      worldPoint.set(...position)
      point.copy(worldPoint).applyMatrix4(matrix)
      const x = (point.x + 1) * size.width / 2
      const y = (1 - point.y) * size.height / 2
      const inView = point.z >= -1 && point.z <= 1 && x >= 0 && x <= size.width && y >= 0 && y <= size.height
      const visible = inView && (!occlude || !anchorOccluded(origin, worldPoint, walls, ray))
      node.style.visibility = 'hidden'
      if (visible) visibleAnchors.push({ id, x, y, dx: offset[0], dy: offset[1], selected })
    }
    const placements = layoutReadouts(visibleAnchors, size.width, size.height)
    for (const anchor of visibleAnchors) {
      const box = placements.get(anchor.id)
      if (box) {
        const { node } = bridge.current.entries.get(anchor.id)!
        node.style.visibility = 'visible'
        node.style.transform = `translate3d(${anchor.x.toFixed(2)}px,${anchor.y.toFixed(2)}px,0)`
        const dx = box.x - anchor.x, dy = box.y - anchor.y
        const button = node.querySelector('button')!
        button.style.left = `${dx}px`
        button.style.top = `${dy}px`
        node.querySelector('polyline')!.setAttribute('points', `0,0 ${dx < 0 ? -14 : 14},${dy + 28} ${dx < 0 ? dx + 122 : dx},${dy + 28}`)
      }
    }
    if (bridge.current.status) {
      const hidden = visibleAnchors.length - placements.size
      bridge.current.status.style.display = hidden ? 'block' : 'none'
      bridge.current.status.textContent = hidden ? `라벨 ${hidden}개를 더 보려면 표시할 채널을 줄여 주세요.` : ''
    }
  })
  return null
}
