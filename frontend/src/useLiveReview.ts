import { useCallback, useEffect, useRef, useState } from 'react'
import { advanceLiveReview, LIVE_REVIEW_INITIAL } from './live-review'
import type { LiveReviewAction, LiveReviewState } from './live-review'
import { timeIso, timeMs } from './time'

export function useLiveReview(context: string, firstTime?: string, latestTime?: string, enabled = true) {
  const [stored, setStored] = useState<{ context: string; state: LiveReviewState }>({ context, state: LIVE_REVIEW_INITIAL })
  const state = stored.context === context ? stored.state : LIVE_REVIEW_INITIAL
  const first = firstTime ? timeMs(firstTime) : NaN, latest = latestTime ? timeMs(latestTime) : NaN
  const bounds = useRef({ first, latest }); bounds.current = { first, latest }
  const act = useCallback((action: LiveReviewAction) => setStored(previous => ({ context,
    state: advanceLiveReview(previous.context === context ? previous.state : LIVE_REVIEW_INITIAL, action, bounds.current) })), [context])
  useEffect(() => { setStored({ context, state: LIVE_REVIEW_INITIAL }) }, [context])
  useEffect(() => {
    if (!enabled || !state.playing) return
    let previous = performance.now()
    const timer = window.setInterval(() => { const now = performance.now(); act({ type: 'tick', elapsed: now - previous }); previous = now }, 100)
    return () => window.clearInterval(timer)
  }, [enabled, state.playing, act])
  const following = state.cursor === null
  const position = following ? latest : Math.max(first, Math.min(latest, state.cursor!))
  return { ...state, following, first, latest, position,
    time: Number.isFinite(position) ? timeIso(Math.floor(position / 1000) * 1000) : null,
    goLive: () => act({ type: 'live' }), back: (seconds = 30) => act({ type: 'back', seconds }),
    step: (seconds: number) => act({ type: 'step', seconds }),
    seek: (time: string | number) => act({ type: 'seek', time: typeof time === 'number' ? time : timeMs(time) }),
    toggle: () => act({ type: 'toggle' }), setSpeed: (speed: number) => act({ type: 'speed', speed }),
  }
}
export type LiveReview = ReturnType<typeof useLiveReview>
