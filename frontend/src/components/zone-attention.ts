export type ZoneAttention = { count: number; unacknowledged: number }
export type ZoneAttentionMap = Record<string, ZoneAttention>

export function normalizeZoneId(zoneId: string): string | null {
  if (zoneId === 'CLN' || zoneId === 'CLN-IN') return 'CLN'
  if (zoneId === 'OUT' || zoneId === 'OUT1' || zoneId === 'OUT2') return 'OUT'
  if (zoneId === 'Z4M') return 'Z4'
  return /^Z[1-9]$/.test(zoneId) ? zoneId : null
}

// Channel-level review candidates, not confirmed equipment failures.
export function summarizeZoneAttention(candidates: readonly { zone_id: string; acknowledged: boolean }[]): ZoneAttentionMap {
  const zones: ZoneAttentionMap = {}
  for (const candidate of candidates) {
    const id = normalizeZoneId(candidate.zone_id)
    if (!id) continue
    const status = zones[id] ??= { count: 0, unacknowledged: 0 }
    status.count++
    if (!candidate.acknowledged) status.unacknowledged++
  }
  return zones
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
