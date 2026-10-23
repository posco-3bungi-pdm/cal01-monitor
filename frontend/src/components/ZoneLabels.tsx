import { useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useFrame, useThree } from '@react-three/fiber'
import { AlertTriangle, Tags } from 'lucide-react'
import * as THREE from 'three'
import type { Channel, Theme } from '../types'
import { clockTime, numberText } from '../time'
import { zoneForChannel } from './furnace-model'
import type { FurnaceZone } from './furnace-model'
import type { SceneGesture } from './scene-input'
import type { ZoneAttentionMap } from './zone-attention'
import { placeAttentionBox } from './zone-attention'
import type { AttentionBox } from './zone-attention'
import './ZoneLabels.css'

type ZoneLabelBridge = {
  elements: Map<string, HTMLDivElement>
  selectZone: ((zoneId: string) => void) | null
  requestFrame: (() => void) | null
  revision: number
}
export type ZoneLabelBridgeRef = RefObject<ZoneLabelBridge>
export function useZoneLabelBridge(): ZoneLabelBridgeRef {
  return useRef<ZoneLabelBridge>({ elements: new Map(), selectZone: null, requestFrame: null, revision: 0 })
}

// The fixed row stays in place; only unacknowledged candidates gain a
// second attention button projected above the relevant process zone.
export function ZoneLabels({ zones, target, bridge, theme, selectedZone, alertZones, attention, gesture,
  channels = [], values = {}, visibleIds, showReadouts = false, onToggleReadouts, onSelectChannel, disabled = false, measuredAt = null }: {
  zones: readonly FurnaceZone[]; target: HTMLElement | null; bridge: ZoneLabelBridgeRef
  theme: Theme; selectedZone: string; alertZones: ReadonlySet<string>
  attention: ZoneAttentionMap; gesture: SceneGesture
  channels?: Channel[]; values?: Record<string, number | null>; visibleIds?: string[]; showReadouts?: boolean
  onToggleReadouts?: () => void; onSelectChannel?: (id: string) => void; disabled?: boolean; measuredAt?: string | null
}) {
  if (!target) return null
  const select = (zoneId: string, keyboard: boolean) => {
    if (gesture.allowClick(keyboard)) bridge.current.selectZone?.(zoneId)
  }
  return createPortal(<>
    <nav className={`zone-navigation${showReadouts ? ' has-readouts' : ''}`} data-scene-ui data-theme={theme} aria-label="공정 구역 선택">
      <div className="zone-navigation-row">
        {onToggleReadouts && <button type="button" className="zone-readout-toggle" aria-label="전체 계측값 표시·숨기기" aria-pressed={showReadouts}
          disabled={disabled} onClick={onToggleReadouts} title="하단 구역별 전체 계측값 표시·숨기기"><Tags size={18} /></button>}
        {zones.map(zone => {
          const status = attention[zone.id]
          const alert = alertZones.has(zone.id)
          const pending = (status?.unacknowledged ?? 0) > 0
          const action = selectedZone === zone.id ? '전체 보기로 돌아가기' : '구역 확대'
          return <button type="button" key={zone.id} data-zone-nav={zone.id}
            className={`zone-nav-button${alert ? ' is-alert' : ''}`}
            aria-label={`${zone.label}${pending ? ` · 확인 필요 ${status.unacknowledged}개` : alert ? ' · 확인한 이상 후보' : ''} · ${action}`}
            aria-pressed={selectedZone === zone.id}
            title={`${zone.label} · ${action}${alert ? ' · 고장 확정 아님' : ''}`}
            onClick={event => select(zone.id, event.detail === 0)}>
            <span>{zone.label}</span>
            {alert && <span className="zone-nav-count" aria-label={`이상 후보 ${status?.count ?? 1}개`}>{status?.count ?? 1}</span>}
            {showReadouts && <span className="zone-metrics">{channels.filter(channel => zoneForChannel(channel) === zone.id && !channel.id.startsWith('CP-') && (!visibleIds || visibleIds.includes(channel.id))).map(channel =>
              <span key={channel.id} data-zone-reading={channel.id} title={`${channel.id} · ${channel.unit ?? '단위 미확인'} · ${measuredAt ?? '관측 없음'}`}><small>{channel.id === 'CLN-IN' ? 'TC' : channel.id.startsWith('OP-') ? 'OP' : channel.id.includes('OUT') ? channel.id.replace('TC-', '') : 'TC'}</small><strong>{numberText(values[channel.id])}</strong></span>)}</span>}
          </button>
        })}
        {onSelectChannel && channels.some(channel => channel.id.startsWith('CP-')) && <button type="button" className="zone-cp-button" aria-label="CP 추가 계측 보기" disabled={disabled} onClick={() => onSelectChannel('CP-Z4M')}>
          <span>CP</span>{showReadouts && <span className="zone-metrics">{channels.filter(channel => channel.id.startsWith('CP-') && (!visibleIds || visibleIds.includes(channel.id))).map(channel => <span key={channel.id} data-zone-reading={channel.id}><small>{channel.id.endsWith('M') ? 'Z4M' : 'Z4'}</small><strong>{numberText(values[channel.id])}</strong></span>)}</span>}
        </button>}
      </div>
      <p className="zone-navigation-hint">구역을 누르면 확대 · 다시 누르면 전체 보기
        {alertZones.size > 0 && <span className="zone-navigation-status">붉은색: 점검 후보 · 고장 확정 아님</span>}
      </p>
      {showReadouts && <p className="zone-navigation-hint">TC °C · OP % · CP 단위 미확인 · {measuredAt ? clockTime(measuredAt, true) : '관측 없음'}</p>}
    </nav>
    {zones.filter(zone => (attention[zone.id]?.unacknowledged ?? 0) > 0).map(zone => {
      const status = attention[zone.id]
      return <div key={zone.id} className="zone-attention-anchor" data-scene-zone={zone.id}
        ref={node => {
          if (node) bridge.current.elements.set(zone.id, node)
          else bridge.current.elements.delete(zone.id)
          bridge.current.revision++
          bridge.current.requestFrame?.()
        }}>
        <button type="button" className="zone-attention-button zone-attention-pulse" data-scene-ui
          aria-label={`${zone.label} · 이상 후보 확인 필요 ${status.unacknowledged}개 · ${selectedZone === zone.id ? '전체 보기로 돌아가기' : '구역 확대'}`}
          aria-pressed={selectedZone === zone.id}
          title="점검이 필요한 변화입니다. 구역 선택은 알림 확인이나 해결 처리가 아닙니다."
          onClick={event => select(zone.id, event.detail === 0)}>
          <span className="zone-attention-heading"><AlertTriangle size={16} aria-hidden="true" /><strong>{zone.label}</strong></span>
          <span className="zone-attention-detail">확인 필요 · {status.unacknowledged}개</span>
        </button>
      </div>
    })}
  </>, target)
}

export function ZoneLabelProjection({ zones, bridge, onSelectZone }: {
  zones: readonly FurnaceZone[]; bridge: ZoneLabelBridgeRef; onSelectZone: (zoneId: string) => void
}) {
  const { camera, size, invalidate } = useThree()
  const points = useMemo(() => zones.map(zone => ({ id: zone.id, world: new THREE.Vector3(zone.x, zone.height + 1.0, 0) })), [zones])
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
    previous.copy(matrix); revision.current = bridge.current.revision; previousSize.current = sizeKey
    const placed: AttentionBox[] = []
    for (const point of points) {
      const element = bridge.current.elements.get(point.id)
      if (!element) continue
      viewPoint.copy(point.world).applyMatrix4(camera.matrixWorldInverse)
      projected.copy(point.world).applyMatrix4(matrix)
      const x = (projected.x + 1) * size.width / 2
      const y = (1 - projected.y) * size.height / 2
      const visible = Number.isFinite(x) && Number.isFinite(y) && viewPoint.z < 0
        && projected.z >= -1 && projected.z <= 1 && x >= -60 && x <= size.width + 60 && y >= -60 && y <= size.height
      element.style.visibility = visible ? 'visible' : 'hidden'
      if (visible) {
        const width = element.offsetWidth, height = element.offsetHeight
        const box = placeAttentionBox({ x: Math.max(8, Math.min(size.width - width - 8, x - width / 2)),
          y: y - height / 2, width, height }, placed, 30, Math.max(100, size.height - 210))
        placed.push(box)
        element.style.transform = `translate3d(${box.x}px,${box.y}px,0)`
        element.style.setProperty('--zone-attention-stem-length', `${Math.max(12, y - box.y - height / 2 + 22)}px`)
      }
    }
  })
  return null
}
