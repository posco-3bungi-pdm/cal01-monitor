import test from 'node:test'
import assert from 'node:assert/strict'
import { numberText, readingParts } from '../src/time.ts'

test('small observations preserve their exponent with the requested e notation', () => {
  assert.equal(numberText(1.15176e-10), '1.152e⁻¹⁰')
  assert.equal(numberText(-1.15176e-10), '-1.152e⁻¹⁰')
  assert.equal(numberText(5e-7), '5.000e⁻⁷')
  assert.equal(numberText(Number.MIN_VALUE), '4.941e⁻³²⁴')
})

test('CP magnitude separates the exponent without changing other channels or filling missing values', () => {
  assert.deepEqual(readingParts('CP-Z4M', 1.15176e-10), { value: '1.152', exponent: 'e⁻¹⁰' })
  assert.deepEqual(readingParts('CP-Z4M', -5e-9), { value: '-5.000', exponent: 'e⁻⁹' })
  assert.deepEqual(readingParts('CP-Z4M', Number.MIN_VALUE), { value: '4.941', exponent: 'e⁻³²⁴' })
  assert.deepEqual(readingParts('CP-Z4M', 0), { value: '0', exponent: 'e⁻¹⁰' })
  assert.deepEqual(readingParts('CP-Z4M', null), { value: '—', exponent: null })
  assert.deepEqual(readingParts('CP-Z4', 0.45), { value: '0.45', exponent: null })
})

test('real zero, absent observations and ordinary process values remain distinct', () => {
  assert.equal(numberText(0), '0')
  assert.equal(numberText(null), '—')
  assert.equal(numberText(Number.NaN), '—')
  assert.equal(numberText(859.68), '859.68')
  assert.equal(numberText(0.01), '0.01')
})
