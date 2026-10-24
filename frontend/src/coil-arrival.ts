import type { SimulationFrame } from './live-simulation.ts'

export type CoilArrival = { id: string; lot: string; grade: string; time: string }
export type ArrivalTracker = { session: string; lot: string; arrival: CoilArrival | null }
export const emptyArrivalTracker = (): ArrivalTracker => ({ session: '', lot: '', arrival: null })

// Observe the live reception head, never the historical playback cursor.
export function observeCoil(previous: ArrivalTracker, session: string, frame: SimulationFrame | null): ArrivalTracker {
  const current = previous.session === session ? previous : { session, lot: '', arrival: null }
  if (!frame?.lot_no.trim() || frame.lot_no === current.lot) return current
  return { session, lot: frame.lot_no, arrival: {
    id: `${session}:${frame.source_row}:${frame.lot_no}`, lot: frame.lot_no, grade: frame.grade, time: frame.time,
  } }
}
