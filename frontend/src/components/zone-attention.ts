export type ZoneAttention = { count: number; unacknowledged: number }
export type ZoneAttentionMap = Record<string, ZoneAttention>
type AttentionCandidate = { zone_id: string; channel_id: string; acknowledged: boolean; resolved?: boolean }

export function normalizeZoneId(zoneId: string): string | null {
  if (zoneId === 'CLN' || zoneId === 'CLN-IN') return 'CLN'
  if (zoneId === 'OUT' || zoneId === 'OUT1' || zoneId === 'OUT2') return 'OUT'
  if (zoneId === 'Z4M') return 'Z4'
  return /^Z[1-9]$/.test(zoneId) ? zoneId : null
}

// Channel-level review candidates, not confirmed equipment failures.
export function summarizeZoneAttention(candidates: readonly { zone_id: string; acknowledged: boolean; resolved?: boolean }[]): ZoneAttentionMap {
  const zones: ZoneAttentionMap = {}
  for (const candidate of candidates) {
    if (candidate.resolved) continue
    const id = normalizeZoneId(candidate.zone_id)
    if (!id) continue
    const status = zones[id] ??= { count: 0, unacknowledged: 0 }
    status.count++
    if (!candidate.acknowledged) status.unacknowledged++
  }
  return zones
}

// CP shares the Z4 housing, but belongs to its own measurement and review group.
export function measurementGroupId(candidate: Pick<AttentionCandidate, 'channel_id' | 'zone_id'>): string | null {
  return candidate.channel_id.startsWith('CP-') ? 'CP' : normalizeZoneId(candidate.zone_id)
}

export function summarizeMeasurementAttention(candidates: readonly AttentionCandidate[]): ZoneAttentionMap {
  const groups: ZoneAttentionMap = {}
  for (const candidate of candidates) {
    if (candidate.resolved) continue
    const id = measurementGroupId(candidate)
    if (!id) continue
    const status = groups[id] ??= { count: 0, unacknowledged: 0 }
    status.count++
    if (!candidate.acknowledged) status.unacknowledged++
  }
  return groups
}

export function zoneViewAfterClick(mode: 'work' | 'full' | 'custom', currentZone: string, clickedZone: string): 'work' | 'full' {
  return mode === 'work' && currentZone === clickedZone ? 'full' : 'work'
}

export type AttentionBox = { x: number; y: number; width: number; height: number }
export function placeAttentionBox(box: AttentionBox, placed: readonly AttentionBox[], minimumY: number, maximumY: number): AttentionBox {
  const gap = 10
  const overlaps = (candidate: AttentionBox) => placed.some(other => candidate.x < other.x + other.width + gap
    && candidate.x + candidate.width + gap > other.x && candidate.y < other.y + other.height + gap
    && candidate.y + candidate.height + gap > other.y)
  const preferred = { ...box, y: Math.max(minimumY, Math.min(maximumY - box.height, box.y)) }
  const candidates = [preferred.y, minimumY, maximumY - box.height,
    ...placed.flatMap(other => [other.y - box.height - gap, other.y + other.height + gap])]
    .filter(y => y >= minimumY && y + box.height <= maximumY)
    .sort((a, b) => Math.abs(a - preferred.y) - Math.abs(b - preferred.y) || a - b)
  return candidates.map(y => ({ ...preferred, y })).find(candidate => !overlaps(candidate)) ?? preferred
}
