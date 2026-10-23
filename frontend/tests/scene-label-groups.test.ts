import test from 'node:test'
import assert from 'node:assert/strict'
import { sceneChannelIds, toggleSceneLabelGroup } from '../src/components/scene-label-groups.ts'

test('a second click hides the active label group; changing groups and reopening restores the chosen group', () => {
  let state = toggleSceneLabelGroup({ group: null, shown: true }, 'all')
  assert.deepEqual(state, { group: 'all', shown: true })
  state = toggleSceneLabelGroup(state, 'all')
  assert.equal(state.shown, false)
  state = toggleSceneLabelGroup(state, 'TC')
  assert.deepEqual(state, { group: 'TC', shown: true })
  assert.equal(toggleSceneLabelGroup(state, 'TC').shown, false)
  assert.deepEqual(toggleSceneLabelGroup(state, 'OP'), { group: 'OP', shown: true })
})

test('temperature labels include cleaning and outlets; output and CP tags keep their own meanings', () => {
  const channels = ['CLN-IN', 'TC-Z3', 'OP-Z3', 'CP-Z4M', 'TC-OUT1'].map(id => ({ id, label: id, kind: id.startsWith('TC-') || id === 'CLN-IN' ? 'temperature' : 'process', unit: null, zone: '' }))
  assert.deepEqual(sceneChannelIds(channels, 'TC', ''), ['CLN-IN', 'TC-Z3', 'TC-OUT1'])
  assert.deepEqual(sceneChannelIds(channels, 'OP', ''), ['OP-Z3'])
  assert.deepEqual(sceneChannelIds(channels, 'CP', ''), ['CP-Z4M'])
  assert.deepEqual(sceneChannelIds(channels, 'selected', 'CP-Z4M'), ['CP-Z4M'])
  assert.deepEqual(sceneChannelIds(channels, 'selected', 'unknown'), [])
})
