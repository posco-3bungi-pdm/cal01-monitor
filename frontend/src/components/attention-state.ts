import type { DetectionCandidate } from '../review-types'
import { timeMs } from '../time.ts'

// Saved historical candidates remain actionable across playback seeks and run changes.
// This queue does not claim that the condition is present at the current replay time.
export function outstandingCandidates(items: readonly DetectionCandidate[]) {
  return items.filter(item => !item.resolved)
}

export function candidatesInLot(items: readonly DetectionCandidate[], dataset: string, lot: string) {
  return outstandingCandidates(items).filter(item => item.dataset_id === dataset && String(item.lot_no) === lot)
}

export type ReplayAttentionWindow = { context: string; through: number }
export function advanceReplayAttention(previous: ReplayAttentionWindow, context: string, now: number): ReplayAttentionWindow {
  const through = previous.context === context && Number.isFinite(previous.through)
    ? Math.max(previous.through, now) : now
  return previous.context === context && previous.through === through ? previous : { context, through }
}

// An offline analysis can cover a whole LOT. Playback only reveals events once
// their start has been reached; rewinding keeps already encountered open items.
export function reachedCandidates(items: readonly DetectionCandidate[], through: number) {
  if (!Number.isFinite(through)) return []
  return outstandingCandidates(items).filter(item => timeMs(item.start) <= through)
    .sort((a, b) => timeMs(a.start) - timeMs(b.start) || a.id.localeCompare(b.id))
}
