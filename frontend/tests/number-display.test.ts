import test from 'node:test'
import assert from 'node:assert/strict'
import { numberText } from '../src/time.ts'

test('small observations preserve their exponent with the requested e notation', () => {
  assert.equal(numberText(1.15176e-10), '1.152e^-10')
  assert.equal(numberText(-1.15176e-10), '-1.152e^-10')
  assert.equal(numberText(5e-7), '5.000e^-7')
  assert.equal(numberText(Number.MIN_VALUE), '4.941e^-324')
})

test('real zero, absent observations and ordinary process values remain distinct', () => {
  assert.equal(numberText(0), '0')
  assert.equal(numberText(null), '—')
  assert.equal(numberText(Number.NaN), '—')
  assert.equal(numberText(859.68), '859.68')
  assert.equal(numberText(0.01), '0.01')
})
