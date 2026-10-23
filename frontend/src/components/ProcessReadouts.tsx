import { createPortal } from 'react-dom'
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { Channel, Theme } from '../types'
import type { ChannelLabelBridge } from './ChannelLabels'
import type { SceneGesture } from './scene-input'
import type { ZoneAttentionMap } from './zone-attention'
import { zoneForChannel } from './furnace-model'
import type { Position3 } from './furnace-model'
import { processReadoutGroups, measurementName, PROCESS_READOUT_WIDTH, PROCESS_READOUT_HEIGHT } from './process-readouts'
import ReadingValue from './ReadingValue'
import './ProcessReadouts.css'

export function ProcessReadouts({ target, bridge, channels, visibleIds, values, selected, theme, measuredAt,
  attention, gesture, onSelect, onPreviewZone, onPreviewLeave, onInspectZoneAlert, focusedZone, positions }: {
  target: HTMLElement | null; bridge: ChannelLabelBridge; channels: Channel[]; visibleIds?: string[]
  values: Record<string, number | null>; selected: string; theme: Theme; measuredAt: string | null
  attention: ZoneAttentionMap; gesture: SceneGesture; onSelect: (id: string) => void; onPreviewZone?: (id: string) => void; onPreviewLeave?: () => void; focusedZone?: string; onInspectZoneAlert?: (zoneId: string) => void
  positions?: ReadonlyMap<string, Position3>
}) {
  const [activeLeader, setActiveLeader] = useState<string | null>(null)
  if (!target) return null
  const selectedChannel = channels.find(channel => channel.id === selected)
  const selectedZone = selectedChannel ? zoneForChannel(selectedChannel) : ''
  const groups = processReadoutGroups(channels, visibleIds, focusedZone, positions)
  return createPortal(<>
    <svg className="process-readout-leaders" aria-hidden="true">{groups.map(group => <g key={group.id}
      className={(attention[group.id]?.count ?? 0) > 0 ? 'is-alert' : undefined}
      data-active={activeLeader ? activeLeader === group.id : group.id === (selected.startsWith('CP-') ? 'CP' : selectedZone)}
      ref={node => { if (node) bridge.current.leaders.set(group.id, node); else bridge.current.leaders.delete(group.id); bridge.current.revision++; bridge.current.invalidate?.() }}>
      <polyline fill="none" /><circle r="3" />
    </g>)}</svg>
    {groups.map(group => {
    const pending = attention[group.id]?.count ?? 0
    const alert = pending > 0
    const focused = group.id === 'CP' ? selected.startsWith('CP-') : selectedZone === group.zone && !selected.startsWith('CP-')
    const dx = -PROCESS_READOUT_WIDTH / 2, dy = group.id === 'CP' ? 22 : -PROCESS_READOUT_HEIGHT - 24
    return <div key={group.id} className="process-readout-anchor" data-process-readout={group.id} data-theme={theme}
      ref={node => {
        if (node) bridge.current.entries.set(group.id, { node, position: group.position, offset: [dx, dy], selected: focused || pending > 0 })
        else bridge.current.entries.delete(group.id)
        bridge.current.revision++; bridge.current.invalidate?.()
      }}>
      <button type="button" data-scene-ui className={`process-readout${alert ? ' is-alert' : ''}${pending ? ' is-pending' : ''}${focused ? ' is-focused' : ''}`}
        aria-label={`${group.label} 계측${pending ? ' · 이상 후보 확인 필요' : ''}`}
        onPointerEnter={event => { if (event.pointerType !== 'touch') { setActiveLeader(group.id); onPreviewZone?.(group.id) } }}
        onPointerLeave={() => { setActiveLeader(null); onPreviewLeave?.() }}
        onFocus={() => { setActiveLeader(group.id); onPreviewZone?.(group.id) }} onBlur={() => { setActiveLeader(null); onPreviewLeave?.() }}
        onClick={event => { if (gesture.allowClick(event.detail === 0)) { if (pending && onInspectZoneAlert) onInspectZoneAlert(group.id); else onSelect(group.channels[0].id) } }}>
        <span className="process-readout-heading"><strong>{group.label}</strong>{pending > 0 && <span><AlertTriangle size={12} />확인 필요</span>}</span>
        <span className="process-readout-values">{group.channels.map(channel => <span key={channel.id} data-process-channel={channel.id} title={channel.id}>
          <small>{measurementName(channel.id)}</small><span className="process-reading"><ReadingValue channelId={channel.id} value={values[channel.id]} unit={channel.unit} /></span>
        </span>)}</span>
        <time>{measuredAt?.replace('T', ' ').slice(11, 19) || '관측 없음'}</time>
      </button>
    </div>
  })}</>, target)
}
