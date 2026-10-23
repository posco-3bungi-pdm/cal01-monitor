import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { matchSelectText, moveSelectIndex, placeSelectPopup } from './themed-select-logic'
import type { PopupPlacement, SelectOption } from './themed-select-logic'
import './ThemedSelect.css'

export type ThemedSelectProps = {
  label: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  disabled?: boolean
  id?: string
}

export default function ThemedSelect({ label, value, onChange, options, disabled = false, id }: ThemedSelectProps) {
  const generatedId = useId()
  const controlId = id ?? `select-${generatedId}`
  const listId = `${controlId}-list`
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const search = useRef({ text: '', time: 0 })
  const selected = options.findIndex(option => option.value === value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(Math.max(selected, 0))
  const [placement, setPlacement] = useState<PopupPlacement | null>(null)
  const unavailable = disabled || !options.length

  function close(restoreFocus = false) {
    setOpen(false)
    search.current = { text: '', time: 0 }
    if (restoreFocus) trigger.current?.focus({ preventScroll: true })
  }
  function choose(index: number) {
    const option = options[index]
    if (!option || unavailable) return
    onChange(option.value)
    close(true)
  }
  function show() {
    if (unavailable) return
    setActive(Math.max(selected, 0))
    setOpen(true)
  }

  useEffect(() => { if (unavailable) setOpen(false) }, [unavailable])
  useEffect(() => { setActive(Math.max(selected, 0)) }, [selected])
  useLayoutEffect(() => {
    if (!open || !trigger.current) return
    function update() {
      if (!trigger.current) return
      const next = placeSelectPopup(trigger.current.getBoundingClientRect(), {
        width: document.documentElement.clientWidth,
        height: window.innerHeight,
      }, popup.current?.scrollHeight ?? options.length * 38 + 12)
      setPlacement(previous => previous && Object.keys(next).every(
        key => previous[key as keyof PopupPlacement] === next[key as keyof PopupPlacement],
      ) ? previous : next)
    }
    function onScroll(event: Event) {
      if (event.target instanceof Node && popup.current?.contains(event.target)) return
      update()
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(trigger.current)
    if (popup.current) observer.observe(popup.current)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, options.length])

  useLayoutEffect(() => {
    if (!open || !popup.current) return
    const option = popup.current.querySelector<HTMLElement>(`[data-option-index="${active}"]`)
    if (!option) return
    // Scroll only this list, never the page or the 3D viewer behind it.
    const top = option.offsetTop, bottom = top + option.offsetHeight
    if (top < popup.current.scrollTop) popup.current.scrollTop = top
    else if (bottom > popup.current.scrollTop + popup.current.clientHeight) {
      popup.current.scrollTop = bottom - popup.current.clientHeight
    }
  }, [open, active, placement?.maxHeight])

  useEffect(() => {
    if (!open) return
    function outside(event: Event) {
      const path = event.composedPath()
      if (path.includes(trigger.current!) || path.includes(popup.current!)) return
      setOpen(false)
      search.current = { text: '', time: 0 }
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', outside, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', outside, true)
    }
  }, [open])

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (unavailable || event.nativeEvent.isComposing) return
    if (event.key === 'Tab') { close(); return }
    if (event.key === 'Escape') {
      if (open) { event.preventDefault(); event.stopPropagation(); close() }
      return
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      event.stopPropagation()
      if (!open) {
        show()
        if (event.key === 'Home' || event.key === 'End') setActive(moveSelectIndex(selected, options.length, event.key))
      } else setActive(index => moveSelectIndex(index, options.length, event.key))
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      if (open) choose(active)
      else show()
      return
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault()
      event.stopPropagation()
      const now = performance.now()
      const previous = now - search.current.time < 700 ? search.current.text : ''
      const typed = previous + event.key
      const query = [...typed].every(character => character === typed[0]) ? event.key : typed
      search.current = { text: typed, time: now }
      if (!open) setOpen(true)
      setActive(matchSelectText(options, query, open ? active : selected))
    }
  }

  return <>
    <button ref={trigger} id={controlId} type="button" className="themed-select"
      role="combobox" aria-label={label} aria-expanded={open} aria-haspopup="listbox"
      aria-controls={open ? listId : undefined}
      aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
      disabled={unavailable} onClick={() => open ? close() : show()} onKeyDown={keyDown}>
      <span>{options[selected]?.label ?? (options.length ? '선택해 주세요' : '목록 없음')}</span>
      <ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && !unavailable && createPortal(
      <div ref={popup} id={listId} role="listbox" aria-label={label}
        className="themed-select-list" style={{
          left: placement?.left ?? 0, top: placement?.top ?? 0,
          width: placement?.width ?? 168, maxHeight: placement?.maxHeight ?? 288,
          visibility: placement ? 'visible' : 'hidden',
        }}
        onPointerDown={event => event.stopPropagation()}>
        {options.map((option, index) => <div key={option.value} id={`${listId}-${index}`}
          role="option" aria-selected={option.value === value} data-option-index={index}
          className={`themed-select-option${index === active ? ' is-active' : ''}`}
          onMouseDown={event => event.preventDefault()}
          onPointerMove={() => setActive(index)} onClick={() => choose(index)}>
          <span>{option.label}</span>{option.value === value && <Check size={15} aria-hidden="true" />}
        </div>)}
      </div>, document.body,
    )}
  </>
}
