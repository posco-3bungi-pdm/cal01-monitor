import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { CameraControls } from '@react-three/drei'
import { isTypingTarget, movementForKeys, SCENE_KEYS } from './scene-input'

export function KeyboardNavigation({ controls, host, disabled, onMove }: {
  controls: RefObject<CameraControls | null>
  host: RefObject<HTMLDivElement | null>
  disabled: boolean
  onMove: () => void
}) {
  const keys = useRef(new Set<string>())
  const fast = useRef(false)
  const { invalidate } = useThree()
  const allowed = () => !disabled && host.current?.contains(document.activeElement)
    && !isTypingTarget(document.activeElement)
    && ![...document.querySelectorAll('[role="dialog"][aria-modal="true"],dialog[open]')]
      .some(element => element.getClientRects().length > 0)

  useEffect(() => {
    const clear = () => { keys.current.clear(); fast.current = false }
    const down = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || !allowed() || isTypingTarget(event.target)) {
        clear()
        return
      }
      fast.current = event.shiftKey
      if (!SCENE_KEYS.has(event.code)) return
      event.preventDefault()
      if (!keys.current.size) controls.current?.stop()
      keys.current.add(event.code)
      invalidate()
    }
    const up = (event: KeyboardEvent) => {
      keys.current.delete(event.code)
      fast.current = event.shiftKey
    }
    const focus = () => { if (!allowed()) clear() }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    document.addEventListener('focusin', focus)
    return () => {
      clear()
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
      document.removeEventListener('focusin', focus)
    }
  }, [disabled, host, controls, invalidate])

  useFrame((_, delta) => {
    if (!controls.current || !keys.current.size) return
    if (!allowed()) { keys.current.clear(); return }
    const movement = movementForKeys(keys.current, fast.current, delta)
    if (movement.x) void controls.current.truck(movement.x, 0, false)
    if (movement.z) void controls.current.forward(movement.z, false)
    if (movement.y) void controls.current.elevate(movement.y, false)
    onMove()
    invalidate()
  }, -2)
  return null
}

export function ShadowPolicy({ realistic, moving, revision }: {
  realistic: boolean; moving: boolean; revision: unknown
}) {
  const { gl, invalidate } = useThree()
  useEffect(() => {
    gl.shadowMap.enabled = realistic
    gl.shadowMap.autoUpdate = realistic && moving
    gl.shadowMap.needsUpdate = realistic
    invalidate()
  }, [gl, realistic, moving, revision, invalidate])
  return null
}

export function SceneDiagnostics({ target, continuous }: {
  target: HTMLElement | null; continuous: boolean
}) {
  const { gl } = useThree()
  const sample = useRef({ frames: 0, started: performance.now(), durations: [] as number[] })
  useFrame((_, delta) => {
    sample.current.frames += 1
    if (continuous || delta < 0.25) sample.current.durations.push(delta * 1000)
  })
  useEffect(() => {
    if (!target) return
    const context = gl.getContext()
    const extension = context.getExtension('WEBGL_debug_renderer_info')
    const renderer = extension
      ? String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL))
      : String(context.getParameter(context.RENDERER))
    const update = () => {
      const now = performance.now()
      const elapsed = Math.max(1, now - sample.current.started)
      const fps = sample.current.frames * 1000 / elapsed
      const durations = sample.current.durations.sort((a, b) => a - b)
      const p95 = durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))].toFixed(1) : '—'
      const activity = sample.current.frames < 2 && !continuous ? '정지 화면 · 필요할 때만 렌더' : `${fps.toFixed(1)} FPS`
      target.textContent = `${activity} · p95 ${p95} ms\n그리기 ${gl.info.render.calls}회 · 삼각형 ${gl.info.render.triangles.toLocaleString()} · DPR ${gl.getPixelRatio().toFixed(2)}\n${renderer}`
      target.dataset.fps = fps.toFixed(1)
      target.dataset.drawCalls = String(gl.info.render.calls)
      target.dataset.renderer = renderer
      target.dataset.p95 = p95
      sample.current = { frames: 0, started: now, durations: [] }
    }
    sample.current = { frames: 0, started: performance.now(), durations: [] }
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [gl, target, continuous])
  return null
}
