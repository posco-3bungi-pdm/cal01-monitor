import test from 'node:test'
import assert from 'node:assert/strict'
import { matchSelectText, moveSelectIndex, placeSelectPopup } from '../src/components/themed-select-logic.ts'

test('popup flips above the playback bar and fits narrow screens', () => {
  const below = placeSelectPopup({ left: 40, top: 20, bottom: 54, width: 200 }, { width: 588, height: 720 }, 544)
  assert.equal(below.top, 59)
  assert.equal(below.maxHeight, 288)
  const above = placeSelectPopup({ left: 532, top: 650, bottom: 684, width: 66 }, { width: 588, height: 720 }, 192)
  assert.equal(above.top, 453)
  assert.equal(above.width, 168)
  assert.ok(above.left + above.width <= 580)
  for (const height of [80, 160, 400]) {
    const bounds = placeSelectPopup({ left: 280, top: height / 2, bottom: height / 2 + 34, width: 250 }, { width: 320, height }, 600)
    assert.ok(bounds.left >= 8 && bounds.top >= 8)
    assert.ok(bounds.left + bounds.width <= 312)
    assert.ok(bounds.top + bounds.maxHeight <= height - 8)
  }
})

test('keyboard moves through all options and empty options remain unselectable', () => {
  assert.equal(moveSelectIndex(0, 5, 'ArrowUp'), 4)
  assert.equal(moveSelectIndex(4, 5, 'ArrowDown'), 0)
  assert.equal(moveSelectIndex(2, 5, 'Home'), 0)
  assert.equal(moveSelectIndex(2, 5, 'End'), 4)
  assert.equal(moveSelectIndex(-1, 0, 'ArrowDown'), -1)
})

test('typeahead finds LOT or speed prefixes and cycles repeated first characters', () => {
  const lots = ['240001 · SGCC', '240038 · SPCEN', '240058 · DP590', '240061 · SPCC']
    .map(label => ({ value: label.slice(0, 6), label }))
  assert.equal(matchSelectText(lots, '240058', 0), 2)
  assert.equal(matchSelectText(lots, '240061', 2), 3)
  assert.equal(matchSelectText(lots, 'missing', 2), 2)
  const speeds = ['1×', '10×', '30×', '60×', '300×'].map(label => ({ value: label, label }))
  assert.equal(matchSelectText(speeds, '3', 0), 2)
  assert.equal(matchSelectText(speeds, '3', 2), 4)
  assert.equal(matchSelectText(speeds, '300', 2), 4)
})
