import test from 'node:test'
import assert from 'node:assert/strict'
import { sceneMotion } from '../src/components/scene-motion.ts'

test('record playback must not force the cleaning switch on', () => {
  assert.deepEqual(sceneMotion(true, false, false), { strip: true, cleaning: false })
  assert.deepEqual(sceneMotion(true, true, false), { strip: true, cleaning: true })
  assert.deepEqual(sceneMotion(false, true, false), { strip: true, cleaning: true })
  assert.deepEqual(sceneMotion(false, false, false), { strip: false, cleaning: false })
})
test('editing and reduced motion stop both explanatory motions', () => {
  assert.deepEqual(sceneMotion(true, true, true), { strip: false, cleaning: false })
})
