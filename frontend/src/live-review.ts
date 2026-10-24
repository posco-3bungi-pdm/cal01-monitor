export type LiveReviewState = { cursor: number | null; playing: boolean; speed: number }
export type LiveReviewBounds = { first: number; latest: number }
export type LiveReviewAction = { type: 'live' } | { type: 'seek'; time: number } | { type: 'back'; seconds: number }
  | { type: 'step'; seconds: number }
  | { type: 'toggle' } | { type: 'speed'; speed: number } | { type: 'tick'; elapsed: number }
export const LIVE_REVIEW_INITIAL: LiveReviewState = { cursor: null, playing: false, speed: 1 }

// Reception has its own clock. This state controls only the view of received data.
export function advanceLiveReview(state: LiveReviewState, action: LiveReviewAction, bounds: LiveReviewBounds): LiveReviewState {
  if (action.type === 'live' || !Number.isFinite(bounds.first) || !Number.isFinite(bounds.latest)) return LIVE_REVIEW_INITIAL
  if (action.type === 'seek' || action.type === 'back' || action.type === 'step') {
    const target = action.type === 'seek' ? action.time : (state.cursor ?? bounds.latest) + action.seconds * (action.type === 'back' ? -1000 : 1000)
    if (!Number.isFinite(target) || target >= bounds.latest) return LIVE_REVIEW_INITIAL
    return { cursor: Math.max(bounds.first, target), playing: action.type === 'step' && state.cursor !== null ? state.playing : false, speed: state.cursor === null ? 1 : state.speed }
  }
  if (state.cursor === null) return LIVE_REVIEW_INITIAL
  if (action.type === 'toggle') return { ...state, playing: !state.playing }
  if (action.type === 'speed') return { ...state, speed: [1, 2, 4, 8, 16].includes(action.speed) ? action.speed : 1 }
  if (!state.playing || action.elapsed <= 0 || !Number.isFinite(action.elapsed)) return state
  const cursor = state.cursor + action.elapsed * state.speed
  // Catching the moving reception edge always cancels review speed and follows live.
  return cursor >= bounds.latest ? LIVE_REVIEW_INITIAL : { ...state, cursor }
}
