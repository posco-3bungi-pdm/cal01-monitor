import type { Channel } from '../types'

export type SceneLabelGroup = 'all' | 'TC' | 'OP' | 'CP' | 'selected'
export type SceneLabelState = { group: SceneLabelGroup | null; shown: boolean }

export function toggleSceneLabelGroup(previous: SceneLabelState, group: SceneLabelGroup): SceneLabelState {
  return { group, shown: !(previous.shown && previous.group === group) }
}

export function sceneChannelIds(channels: Channel[], group: SceneLabelGroup, selected: string): string[] {
  return channels.filter(channel => group === 'all'
    || (group === 'TC' && (channel.kind === 'temperature' || channel.id.startsWith('TC-') || channel.id === 'CLN-IN'))
    || (group === 'OP' && channel.id.startsWith('OP-'))
    || (group === 'CP' && channel.id.startsWith('CP-'))
    || (group === 'selected' && channel.id === selected)).map(channel => channel.id)
}
