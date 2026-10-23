import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import type { Channel, Theme } from '../types'
import type { ChannelLabelBridge } from './ChannelLabels'
import type { SceneGesture } from './scene-input'
import type { ZoneAttentionMap } from './zone-attention'
import { zoneForChannel } from './furnace-model'
import { processReadoutGroups, measurementName, PROCESS_READOUT_WIDTH, PROCESS_READOUT_HEIGHT } from './process-readouts'
import ReadingValue from './ReadingValue'
import './ProcessReadouts.css'

export function ProcessReadouts({ target, bridge, channels, visibleIds, values, selected, theme, measuredAt,
  attention, gesture, onSelect, onPreviewZone, focusedZone }: {
  target: HTMLElement | null; bridge: ChannelLabelBridge; channels: Channel[]; visibleIds?: string[]
  values: Record<string, number | null>; selected: string; theme: Theme; measuredAt: string | null
  attention: ZoneAttentionMap; gesture: SceneGesture; onSelect: (id: string) => void; onPreviewZone?: (id: string) => void; focusedZone?: string
}) {
  if (!target) return null
  const selectedChannel = channels.find(channel => channel.id === selected)
  const selectedZone = selectedChannel ? zoneForChannel(selectedChannel) : ''
  return createPortal(<>{processReadoutGroups(channels, visibleIds, focusedZone).map(group => {
    const pending = attention[group.zone]?.unacknowledged ?? 0
    const alert = (attention[group.zone]?.count ?? 0) > 0
    const focused = group.id === 'CP' ? selected.startsWith('CP-') : selectedZone === group.zone && !selected.startsWith('CP-')
    const dx = -PROCESS_READOUT_WIDTH / 2, dy = -PROCESS_READOUT_HEIGHT - 20
    return <div key={group.id} className="process-readout-anchor" data-process-readout={group.id} data-theme={theme}
      ref={node => {
        if (node) bridge.current.entries.set(group.id, { node, position: group.position, offset: [dx, dy], selected: focused || pending > 0 })
        else bridge.current.entries.delete(group.id)
        bridge.current.revision++; bridge.current.invalidate?.()
      }}>
      <svg width="1" height="1" aria-hidden="true"><polyline fill="none" /><circle r="3" /></svg>
      <button type="button" data-scene-ui className={`process-readout${alert ? ' is-alert' : ''}${pending ? ' is-pending' : ''}${focused ? ' is-focused' : ''}`}
        aria-label={`${group.label} 계측${pending ? ' · 이상 후보 확인 필요' : ''}`}
        onPointerEnter={event => { if (event.pointerType !== 'touch') onPreviewZone?.(group.id) }}
        onFocus={() => onPreviewZone?.(group.id)}
        onClick={event => { if (gesture.allowClick(event.detail === 0)) onSelect(group.channels[0].id) }}>
        <span className="process-readout-heading"><strong>{group.label}</strong>{pending > 0 && <span><AlertTriangle size={12} />확인 필요</span>}</span>
        <span className="process-readout-values">{group.channels.map(channel => <span key={channel.id} data-process-channel={channel.id} title={channel.id}>
          <small>{measurementName(channel.id)}</small><span className="process-reading"><ReadingValue channelId={channel.id} value={values[channel.id]} unit={channel.unit} /></span>
        </span>)}</span>
        <time>{measuredAt?.replace('T', ' ').slice(11, 19) || '관측 없음'}</time>
      </button>
    </div>
  })}</>, target)
}
