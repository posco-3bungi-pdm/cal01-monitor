import test from 'node:test'
import assert from 'node:assert/strict'
import { investigationGuide, investigationWindow, relatedRecords } from '../src/incident-investigation.ts'
import type { ContextRecord } from '../src/incident-investigation.ts'

const range = { start: '2024-01-02T07:00:00', end: '2024-01-02T07:01:00' }
const record = (id: string, type: ContextRecord['type'], start: string, end: string | null = null, precision = 'second'): ContextRecord =>
  ({ id, type, start, end, precision, title: id, equipment: 'CAL01', description: '', source: 'test', sourceId: id, details: {} })

test('actual work overlaps inclusive boundaries while nearby work stays separate', () => {
  const groups = relatedRecords([
    record('before', 'maintenance', '2024-01-02T06:40:00', range.start),
    record('at', 'operation', range.end),
    record('nearby', 'maintenance', '2024-01-02T07:10:00'),
    record('outside', 'maintenance', '2024-01-02T09:00:00'),
  ], range)
  assert.deepEqual(groups.overlapping.map(item => item.id), ['before', 'at'])
  assert.deepEqual(groups.nearby.map(item => item.id), ['nearby'])
})

test('date-only plans include their final calendar day without becoming actual work', () => {
  const groups = relatedRecords([
    record('plan', 'plan', '2024-01-01', '2024-01-02', 'date'),
    record('old', 'plan', '2023-12-30', '2024-01-01', 'date'),
    record('timed-plan', 'plan', range.start, range.end),
  ], range)
  assert.deepEqual(groups.plans.map(item => item.id), ['plan', 'timed-plan'])
  assert.equal(groups.overlapping.length, 0)
})

test('a logged alarm and linked parts work retain different evidence meanings', () => {
  const groups = relatedRecords([
    record('alarm', 'detection', range.start),
    record('part', 'parts', range.start, range.end, 'linked-work'),
  ], range)
  assert.deepEqual(groups.detections.map(item => item.id), ['alarm'])
  assert.equal(groups.overlapping[0].precision, 'linked-work')
  assert.equal(groups.overlapping[0].id, 'part')
})

test('date-only actual work is not relabeled as a plan or an exact time overlap', () => {
  const groups = relatedRecords([record('date-work', 'maintenance', '2024-01-02', '2024-01-02', 'date')], range)
  assert.deepEqual(groups.dated.map(item => item.id), ['date-work'])
  assert.equal(groups.plans.length, 0)
  assert.equal(groups.overlapping.length, 0)
})

test('live review excludes later actual records and caps the review window at reception', () => {
  const through = '2024-01-02T07:02:00'
  assert.equal(investigationWindow(range, through).end, '2024-01-02T07:02:00.000')
  assert.equal(investigationWindow(range).end, '2024-01-02T07:31:00.000')
  const groups = relatedRecords([
    record('received', 'operation', through),
    record('future', 'maintenance', '2024-01-02T07:02:01'),
  ], range, through)
  assert.deepEqual(groups.nearby.map(item => item.id), ['received'])
})

test('empty or invalid context never manufactures a maintenance explanation', () => {
  assert.deepEqual(relatedRecords([], range).overlapping, [])
  const groups = relatedRecords([record('bad', 'maintenance', 'invalid')], range)
  assert.equal(Object.values(groups).flat().length, 0)
})

test('CP-only review stays distinct from a zone model with CP among its inputs', () => {
  const cp = investigationGuide('Z4', ['CP-Z4', 'CP-Z4M'])
  const zone = investigationGuide('Z4', ['TC-Z4', 'OP-Z4', 'CP-Z4'])
  assert.match(cp.teams.find(item => item.team === '계측·제어 담당')!.data, /환산식/)
  assert.match(zone.checks[0], /TC와 OP/)
  assert.match(investigationGuide('OUT', ['TC-OUT1']).checks[0], /출측 1·2/)
})
