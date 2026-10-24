import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceLiveReview, LIVE_REVIEW_INITIAL } from '../src/live-review.ts'

const bounds = { first: 1000, latest: 61_000 }
test('live follows reception at 1x; speed controls cannot accelerate the receiver', () => {
  assert.deepEqual(advanceLiveReview(LIVE_REVIEW_INITIAL, { type: 'speed', speed: 16 }, bounds), LIVE_REVIEW_INITIAL)
  assert.deepEqual(advanceLiveReview(LIVE_REVIEW_INITIAL, { type: 'tick', elapsed: 10_000 }, bounds), LIVE_REVIEW_INITIAL)
})
test('review can rewind only through already received times and preserves a real zero time', () => {
  const state = advanceLiveReview(LIVE_REVIEW_INITIAL, { type: 'back', seconds: 30 }, bounds)
  assert.equal(state.cursor, 31_000)
  assert.equal(state.playing, false)
  assert.equal(advanceLiveReview(state, { type: 'seek', time: -1000 }, bounds).cursor, bounds.first)
  assert.deepEqual(advanceLiveReview(state, { type: 'seek', time: 99_000 }, bounds), LIVE_REVIEW_INITIAL)
  assert.equal(advanceLiveReview(state, { type: 'seek', time: 0 }, { first: 0, latest: 10 }).cursor, 0)
})
test('faster review catches the moving live edge and automatically cancels speed', () => {
  let state = advanceLiveReview(LIVE_REVIEW_INITIAL, { type: 'seek', time: 31_000 }, bounds)
  state = advanceLiveReview(state, { type: 'speed', speed: 16 }, bounds)
  state = advanceLiveReview(state, { type: 'toggle' }, bounds)
  state = advanceLiveReview(state, { type: 'tick', elapsed: 1000 }, { ...bounds, latest: 62_000 })
  assert.equal(state.cursor, 47_000)
  state = advanceLiveReview(state, { type: 'tick', elapsed: 1000 }, { ...bounds, latest: 63_000 })
  assert.deepEqual(state, LIVE_REVIEW_INITIAL)
})
test('paused review remains fixed as reception advances; current always restores 1x', () => {
  const state = { cursor: 20_000, speed: 8, playing: false }
  assert.deepEqual(advanceLiveReview(state, { type: 'tick', elapsed: 5000 }, { ...bounds, latest: 66_000 }), state)
  assert.deepEqual(advanceLiveReview(state, { type: 'live' }, bounds), LIVE_REVIEW_INITIAL)
})

test('arrow steps preserve past playback, clamp to arrived records, and restore live 1x at the edge', () => {
  const playing = { cursor: 31_000, playing: true, speed: 8 }
  assert.deepEqual(advanceLiveReview(playing, { type: 'step', seconds: -5 }, bounds), { ...playing, cursor: 26_000 })
  assert.deepEqual(advanceLiveReview(playing, { type: 'step', seconds: 5 }, bounds), { ...playing, cursor: 36_000 })
  assert.deepEqual(advanceLiveReview(playing, { type: 'step', seconds: -30 }, bounds), { ...playing, cursor: bounds.first })
  assert.deepEqual(advanceLiveReview(playing, { type: 'step', seconds: 30 }, bounds), LIVE_REVIEW_INITIAL)
  assert.deepEqual(advanceLiveReview(LIVE_REVIEW_INITIAL, { type: 'step', seconds: -5 }, bounds), { cursor: 56_000, playing: false, speed: 1 })
  assert.deepEqual(advanceLiveReview(LIVE_REVIEW_INITIAL, { type: 'step', seconds: 5 }, bounds), LIVE_REVIEW_INITIAL)
})
