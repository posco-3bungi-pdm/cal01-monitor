import test from 'node:test'
import assert from 'node:assert/strict'
import { drawerLimits, resizeDrawer, clampDrawerSize } from '../src/components/drawer-size.ts'

test('right-anchored request panel resizes from its left and bottom edges independently', () => {
  const limits = drawerLimits(1280, 900, 80, 16, 174)
  const size = { width: 700, height: 600 }
  assert.deepEqual(resizeDrawer(size, 120, -100, 'both', limits), { width: 580, height: 500 })
  assert.deepEqual(resizeDrawer(size, 120, -100, 'width', limits), { width: 580, height: 600 })
  assert.deepEqual(resizeDrawer(size, 120, -100, 'height', limits), { width: 700, height: 500 })
})
test('resizing stays inside the viewport and leaves navigation reachable after a screen resize', () => {
  const limits = drawerLimits(1280, 900, 80, 16, 174)
  assert.deepEqual(clampDrawerSize({ width: 2000, height: 2000 }, limits), { width: 1252, height: 646 })
  assert.deepEqual(clampDrawerSize({ width: 10, height: 10 }, limits), { width: 360, height: 260 })
  assert.deepEqual(clampDrawerSize({ width: 900, height: 700 }, drawerLimits(320, 480, 80, 12, 174)), { width: 296, height: 226 })
})
