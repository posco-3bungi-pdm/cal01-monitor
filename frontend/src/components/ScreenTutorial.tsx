import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, MousePointer2, X } from 'lucide-react'
import { tutorialCardPosition } from '../tutorial-data'
import type { Box, TutorialStep } from '../tutorial-data'

export default function ScreenTutorial({ steps, index, onStep, onClose }: {
  steps: TutorialStep[]; index: number; onStep: (index: number) => void; onClose: () => void
}) {
  const step = steps[index]
  const card = useRef<HTMLElement>(null)
  const [target, setTarget] = useState<Box | null>(null)
  const [position, setPosition] = useState({ left: 16, top: 100 })
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.workspace')
    const previous = root?.inert ?? false
    if (root) root.inert = true
    return () => { if (root) root.inert = previous }
  }, [])
  useLayoutEffect(() => {
    let highlighted: HTMLElement | null = null
    let frame = 0
    const measure = () => {
      const element = document.querySelector<HTMLElement>(step.target)
      if (highlighted !== element) { highlighted?.classList.remove('tutorial-target'); highlighted = element; highlighted?.classList.add('tutorial-target') }
      const bounds = element?.getBoundingClientRect()
      const visible = bounds && bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < innerHeight && bounds.right > 0 && bounds.left < innerWidth
      const rect: Box | null = visible ? { left: Math.max(4, bounds.left - 6), top: Math.max(4, bounds.top - 6), width: Math.max(0, Math.min(innerWidth - 4, bounds.right + 6) - Math.max(4, bounds.left - 6)), height: Math.max(0, Math.min(innerHeight - 4, bounds.bottom + 6) - Math.max(4, bounds.top - 6)) } : null
      setTarget(rect)
      const size = card.current?.getBoundingClientRect()
      if (size) setPosition(tutorialCardPosition(rect, size, { width: innerWidth, height: innerHeight }))
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    const observer = new ResizeObserver(schedule)
    const root = document.querySelector('.workspace'), element = document.querySelector(step.target)
    if (root) observer.observe(root)
    if (element) observer.observe(element)
    if (card.current) observer.observe(card.current)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    schedule()
    card.current?.focus()
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); highlighted?.classList.remove('tutorial-target') }
  }, [step])
  const last = index === steps.length - 1
  return createPortal(<div className="screen-tutorial" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" aria-describedby="tutorial-body"
    onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}
    onKeyDown={event => {
      event.stopPropagation()
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key === 'Tab') {
        const buttons = [...card.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []]
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = current < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
        event.preventDefault(); buttons[next]?.focus()
      }
    }}>
    {target ? <div className="tutorial-spotlight" style={target} aria-hidden="true" /> : <div className="tutorial-dim" />}
    <section ref={card} className="tutorial-card" style={position} tabIndex={-1}>
      <header><span><MousePointer2 size={16} />화면 사용 튜토리얼</span><button className="icon-button" aria-label="튜토리얼 종료" onClick={onClose}><X size={18} /></button></header>
      <div className="tutorial-progress" aria-label={`${steps.length}단계 중 ${index + 1}단계`}>{steps.map((item, i) => <span key={item.id} data-done={i <= index} />)}</div>
      <span className="tutorial-count" aria-live="polite">{String(index + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</span>
      <h2 id="tutorial-title">{step.title}</h2><p id="tutorial-body">{step.body}</p>
      {!target && <p className="tutorial-unavailable">현재 자료에서는 이 영역이 표시되지 않습니다. 설명을 읽고 다음 단계로 이동하세요.</p>}
      <p className="tutorial-tip">{step.action}</p>
      <footer><button className="subtle-button" disabled={index === 0} onClick={() => onStep(index - 1)}><ArrowLeft size={16} />이전</button><button className="text-button" onClick={onClose}>건너뛰기</button><button className="primary-button compact" onClick={() => last ? onClose() : onStep(index + 1)}>{last ? '마치기' : '다음'}<ArrowRight size={16} /></button></footer>
    </section>
  </div>, document.body)
}
