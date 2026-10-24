import { useEffect, useLayoutEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'
import type { CoilArrival } from '../coil-arrival'
import { clockTime } from '../time'

export default function CoilArrivalNotice({ arrival, onDone }: { arrival: CoilArrival; onDone: (id: string) => void }) {
  const reduced = useReducedMotion()
  const track = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = track.current
    const button = element?.closest('nav')?.querySelector('.zone-nav-button')
    if (!element || !button) return
    const measure = () => {
      const height = Math.max(18, button.getBoundingClientRect().height - 6)
      element.style.setProperty('--coil-arrival-height', `${height}px`)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(button); measure()
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    // Fallback also dismisses while the document is backgrounded or motion is reduced.
    const timer = window.setTimeout(() => onDone(arrival.id), reduced ? 6500 : 10500)
    return () => window.clearTimeout(timer)
  }, [arrival.id, onDone, reduced])
  return <div className="coil-arrival-track" ref={track}>
    <span className="visually-hidden" role="status">새 코일 수신. LOT {arrival.lot}, {arrival.grade || '강종 미기록'}, {clockTime(arrival.time, true)}</span>
    <div className="coil-arrival-caravan" aria-hidden="true">
      <span className="coil-arrival-tag"><strong>새 코일 · LOT {arrival.lot}</strong><span>{arrival.grade || '강종 미기록'} · {clockTime(arrival.time, true)}</span></span>
      <img src="/mascot/poseokho-coil-train.png" alt="" draggable={false} />
    </div>
  </div>
}
