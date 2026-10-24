import { useCallback, useEffect, useRef, useState } from 'react'
import type { SimulationFrame } from './live-simulation'
import { emptyArrivalTracker, observeCoil } from './coil-arrival'
import type { CoilArrival } from './coil-arrival'

export function useCoilArrival(session: string, frame: SimulationFrame | null, enabled: boolean) {
  const tracker = useRef(emptyArrivalTracker())
  const [arrival, setArrival] = useState<CoilArrival | null>(null)
  useEffect(() => {
    const previous = tracker.current, next = observeCoil(previous, session, frame)
    tracker.current = next
    if (!enabled || previous.session !== session) setArrival(null)
    if (enabled && next.arrival && next.arrival !== previous.arrival) setArrival(next.arrival)
  }, [session, frame, enabled])
  const dismiss = useCallback((id: string) => setArrival(current => current?.id === id ? null : current), [])
  return { arrival: enabled ? arrival : null, dismiss }
}
