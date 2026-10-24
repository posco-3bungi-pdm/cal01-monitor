import assert from 'node:assert/strict'
import test from 'node:test'
import { playbackShortcut } from '../src/playback-shortcuts.ts'
import type { PlaybackKeyContext } from '../src/playback-shortcuts.ts'

const key = (key: string, extra: Partial<PlaybackKeyContext> = {}) => playbackShortcut({ enabled: true, key, ...extra })

test('space toggles once, while left and right move the recording five seconds', () => {
  assert.deepEqual(key(' '), { type: 'toggle' })
  assert.deepEqual(key('ArrowLeft'), { type: 'step', seconds: -5 })
  assert.deepEqual(key('ArrowRight'), { type: 'step', seconds: 5 })
})

test('shift changes only left and right to thirty-second steps', () => {
  assert.deepEqual(key('ArrowLeft', { shiftKey: true }), { type: 'step', seconds: -30 })
  assert.deepEqual(key('ArrowRight', { shiftKey: true }), { type: 'step', seconds: 30 })
  assert.equal(key(' ', { shiftKey: true }), null)
})

test('held space cannot alternate play and pause, but held arrows can continue stepping', () => {
  assert.equal(key(' ', { repeat: true }), null)
  assert.deepEqual(key('ArrowRight', { repeat: true }), { type: 'step', seconds: 5 })
  assert.deepEqual(key('ArrowLeft', { repeat: true, shiftKey: true }), { type: 'step', seconds: -30 })
})

test('typing, buttons, dialogs and disabled playback never consume recording shortcuts', () => {
  for (const context of [{ targetIsInteractive: true }, { dialogOpen: true }, { enabled: false }, { isComposing: true }, { defaultPrevented: true }]) {
    for (const name of [' ', 'ArrowLeft', 'ArrowRight']) assert.equal(key(name, context), null)
  }
})

test('browser and operating-system shortcuts keep their modifier combinations', () => {
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const) {
    for (const name of [' ', 'ArrowLeft', 'ArrowRight']) {
      assert.equal(key(name, { [modifier]: true }), null)
      assert.equal(key(name, { [modifier]: true, shiftKey: true }), null)
    }
  }
})

test('live review buttons accept time arrows while keeping native space and modifier actions', () => {
  const liveButton = { targetIsInteractive: true, targetIsStepButton: true }
  assert.deepEqual(key('ArrowLeft', liveButton), { type: 'step', seconds: -5 })
  assert.deepEqual(key('ArrowRight', { ...liveButton, shiftKey: true }), { type: 'step', seconds: 30 })
  assert.equal(key(' ', liveButton), null)
  assert.equal(key('ArrowLeft', { ...liveButton, ctrlKey: true }), null)
  assert.equal(key('ArrowRight', { ...liveButton, dialogOpen: true }), null)
  assert.equal(key('ArrowRight', { targetIsInteractive: true, targetIsStepButton: false }), null)
})

test('camera height, WASD movement and unrelated keys are untouched', () => {
  for (const name of ['ArrowUp', 'ArrowDown', 'w', 'a', 's', 'd', 'q', 'e', 'Enter', 'Escape', 'Tab']) {
    assert.equal(key(name), null)
    assert.equal(key(name, { shiftKey: true }), null)
  }
})
