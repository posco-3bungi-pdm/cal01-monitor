import { useEffect, useRef } from 'react'
import { PLAYBACK_INTERACTIVE_TARGETS, playbackShortcut } from './playback-shortcuts'

type Props = {
  enabled: boolean
  onToggle: () => void
  onStep: (seconds: number) => void
  arrowButtonScope?: string
}

export default function PlaybackShortcuts({ enabled, onToggle, onStep, arrowButtonScope }: Props) {
  const callbacks = useRef({ onToggle, onStep })
  callbacks.current = { onToggle, onStep }

  useEffect(() => {
    if (!enabled) return
    const keyDown = (event: KeyboardEvent) => {
      const element = event.target instanceof Element ? event.target : null
      const dialogOpen = [...document.querySelectorAll('dialog[open],[role="dialog"]:not([aria-modal="false"])')]
        .some(dialog => dialog.getClientRects().length > 0 && dialog.getAttribute('aria-hidden') !== 'true')
      const action = playbackShortcut({
        key: event.key, enabled, defaultPrevented: event.defaultPrevented,
        isComposing: event.isComposing, ctrlKey: event.ctrlKey, metaKey: event.metaKey,
        altKey: event.altKey, shiftKey: event.shiftKey, repeat: event.repeat,
        targetIsInteractive: Boolean(element?.closest(PLAYBACK_INTERACTIVE_TARGETS)), dialogOpen,
        targetIsStepButton: Boolean(arrowButtonScope && element?.closest(arrowButtonScope) && element?.closest('button:not([role])')),
      })
      if (!action) return
      event.preventDefault()
      if (action.type === 'toggle') callbacks.current.onToggle()
      else callbacks.current.onStep(action.seconds)
    }
    window.addEventListener('keydown', keyDown)
    return () => window.removeEventListener('keydown', keyDown)
  }, [enabled, arrowButtonScope])
  return null
}
