import type { Channel } from '../types'
import { FURNACE_ZONES, zoneForChannel } from './furnace-model.ts'
import type { Position3 } from './furnace-model'

export const PROCESS_READOUT_WIDTH = 168
export const PROCESS_READOUT_HEIGHT = 112

export function processReadoutGroups(channels: Channel[], visibleIds?: string[], focusedZone = '') {
  const visible = channels.filter(channel => !visibleIds || visibleIds.includes(channel.id))
  const focusedIndex = FURNACE_ZONES.findIndex(zone => zone.id === focusedZone)
  const shownZones = FURNACE_ZONES.filter((_, index) => focusedIndex < 0 || Math.abs(index - focusedIndex) <= 1)
  const groups = shownZones.map(zone => ({
    id: zone.id, label: zone.label, zone: zone.id,
    position: [zone.x, zone.height + 0.4, zone.depth / 2] as Position3,
    channels: visible.filter(channel => !channel.id.startsWith('CP-') && zoneForChannel(channel) === zone.id),
  })).filter(group => group.channels.length > 0)
  const cp = visible.filter(channel => channel.id.startsWith('CP-'))
  const z4 = FURNACE_ZONES.find(zone => zone.id === 'Z4')!
  if (cp.length && shownZones.some(zone => zone.id === 'Z4')) groups.push({ id: 'CP', label: 'Z4 · CP', zone: 'Z4',
    position: [z4.x, z4.height / 2, z4.depth / 2] as Position3, channels: cp })
  return groups
}

export function measurementName(id: string) {
  if (id.startsWith('CP-')) return id.endsWith('M') ? 'CP-Z4M' : 'CP-Z4'
  if (id === 'TC-OUT1') return '출측 1'
  if (id === 'TC-OUT2') return '출측 2'
  return id.startsWith('OP-') ? '제어출력' : '온도'
}
