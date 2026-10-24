import { useEffect } from 'react'
import type { RefObject } from 'react'

// Keep both bottom controls readable as the pointer approaches either one.
export function useBottomControls(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = root.current
    if (!node) return
    let frame = 0, x = -1000, y = -1000
    const update = () => {
      frame = 0
      const near = [...node.querySelectorAll('.zone-navigation, .playback-control')].some(control => {
        const box = control.getBoundingClientRect()
        const dx = Math.max(box.left - x, 0, x - box.right)
        const dy = Math.max(box.top - y, 0, y - box.bottom)
        return Math.hypot(dx, dy) <= 72
      })
      node.dataset.bottomControlsNear = String(near)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      x = event.clientX; y = event.clientY
      if (!frame) frame = requestAnimationFrame(update)
    }
    const leave = () => { cancelAnimationFrame(frame); frame = 0; x = -1000; y = -1000; node.dataset.bottomControlsNear = 'false' }
    node.addEventListener('pointermove', move)
    node.addEventListener('pointerleave', leave)
    return () => { cancelAnimationFrame(frame); node.removeEventListener('pointermove', move); node.removeEventListener('pointerleave', leave) }
  }, [root])
}
