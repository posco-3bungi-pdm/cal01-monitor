import test from 'node:test'
import assert from 'node:assert/strict'
import { GUIDE_CATEGORIES, GUIDE_STEPS, searchGuide } from '../src/guide-data.ts'
import { screenTutorial, tutorialCardPosition } from '../src/tutorial-data.ts'

test('six topics contain readable content and exercises stay in signs', () => {
  assert.deepEqual(GUIDE_CATEGORIES.map(item => item.label), ['공정 흐름', '운전·센서', '이상 징후', '강종·품질', '정비·조업', '설비·용어'])
  for (const category of GUIDE_CATEGORIES) assert.ok(GUIDE_STEPS.some(step => (step.category ?? 'process') === category.id))
  assert.equal(new Set(GUIDE_STEPS.map(step => step.id)).size, GUIDE_STEPS.length)
  for (const step of GUIDE_STEPS.filter(step => step.practice)) {
    assert.equal(step.category, 'signs')
    assert.equal(step.practice!.options.filter(option => option.correct).length, 1)
  }
})
test('search finds codes case insensitively, Korean glossary and multiple terms', () => {
  assert.deepEqual(searchGuide('  '), [])
  assert.deepEqual(searchGuide('없는용어123'), [])
  assert.ok(searchGuide('cp-z4m').some(item => item.step.id === 'carbon-potential'))
  assert.ok(searchGuide('균열').some(item => item.step.id === 'term-dictionary'))
  assert.ok(searchGuide('정비 재가동').length)
  for (const result of searchGuide('TC')) assert.equal(GUIDE_STEPS[result.index], result.step)
})
test('tutorial explains the active playback mode and only opens reading panels', () => {
  const history = screenTutorial(false), live = screenTutorial(true)
  assert.match(history.find(step => step.id === 'playback')!.body, /5초/)
  assert.match(live.find(step => step.id === 'playback')!.body, /현재로/)
  assert.match(live.find(step => step.id === 'alerts')!.body, /과거 LOT/)
  assert.equal(history.length, new Set(history.map(step => step.id)).size)
  assert.ok(history.every(step => !step.panel || ['channels', 'requests'].includes(step.panel)))
})
test('tutorial card fits beside a drawer and above bottom controls without overlap', () => {
  const card = { width: 390, height: 400 }, viewport = { width: 1440, height: 900 }
  const drawer = { left: 920, top: 90, width: 500, height: 700 }
  const position = tutorialCardPosition(drawer, card, viewport)
  assert.ok(position.left + card.width < drawer.left)
  const dock = { left: 100, top: 820, width: 1240, height: 60 }
  const above = tutorialCardPosition(dock, card, viewport)
  assert.ok(above.top + card.height < dock.top)
  const phone = tutorialCardPosition(null, { width: 328, height: 600 }, { width: 360, height: 640 })
  assert.ok(phone.left >= 16 && phone.left + 328 <= 344)
  assert.ok(phone.top >= 16 && phone.top + 600 <= 624)
})
