import test from 'node:test'
import assert from 'node:assert/strict'
import { MISSING_STRIP_TEMPERATURE_COLOR, STRIP_TEMPERATURE_STOPS, stripTemperatureBands, stripTemperatureColor } from '../src/components/strip-temperature.ts'

test('temperature colors distinguish real zero, missing values and temperatures beyond the display scale', () => {
  const cold = STRIP_TEMPERATURE_STOPS[0].color, hot = STRIP_TEMPERATURE_STOPS.at(-1)!.color
  assert.equal(stripTemperatureColor(0), cold)
  assert.equal(stripTemperatureColor(-10), cold)
  assert.equal(stripTemperatureColor(1200), hot)
  for (const value of [null, undefined, NaN, Infinity]) assert.equal(stripTemperatureColor(value), MISSING_STRIP_TEMPERATURE_COLOR)
  assert.notEqual(stripTemperatureColor(100), stripTemperatureColor(330))
  assert.notEqual(stripTemperatureColor(330), stripTemperatureColor(860))
})

test('each zone follows its TC, keeps both outlet readings distinct, and updates without using OP or CP', () => {
  const zones = [{ id: 'CLN', x: -15 }, { id: 'Z4', x: -3.5 }, { id: 'OUT', x: 16.3 }]
  const values = { 'CLN-IN': 70, 'TC-Z4': 860, 'OP-Z4': 0, 'CP-Z4': .45, 'TC-OUT1': 300, 'TC-OUT2': null }
  const bands = stripTemperatureBands(zones, values)
  assert.deepEqual(bands.map(band => band.channel), ['CLN-IN', 'TC-Z4', 'TC-OUT1', 'TC-OUT2'])
  assert.equal(bands[1].color, stripTemperatureColor(860))
  assert.notEqual(bands[2].color, bands[3].color)
  assert.equal(bands[3].color, MISSING_STRIP_TEMPERATURE_COLOR)
  const updated = stripTemperatureBands(zones, { ...values, 'TC-Z4': 100, 'TC-OUT2': 0 })
  assert.notEqual(updated[1].color, bands[1].color)
  assert.equal(updated[3].color, stripTemperatureColor(0))
})
