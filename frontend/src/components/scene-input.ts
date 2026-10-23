// One gesture can end where it began; compare its greatest movement, not just
// pointer-up distance. This also applies to the DOM labels above the canvas.
export class SceneGesture {
  private pointers = new Set<number>()
  private origin = { x: 0, y: 0 }
  private maximum = 0
  private rejected = true
  private completed = false

  down(id: number, x: number, y: number, button = 0) {
    if (this.pointers.size === 0) {
      this.origin = { x, y }
      this.maximum = 0
      this.rejected = button !== 0
      this.completed = false
    } else this.rejected = true
    this.pointers.add(id)
  }

  move(id: number, x: number, y: number) {
    if (!this.pointers.has(id)) return
    this.maximum = Math.max(this.maximum, Math.hypot(x - this.origin.x, y - this.origin.y))
  }

  up(id: number, x: number, y: number) {
    this.move(id, x, y)
    if (!this.pointers.delete(id)) return
    this.completed = this.pointers.size === 0
  }

  cancel() {
    this.pointers.clear()
    this.rejected = true
    this.completed = false
  }

  allowClick(keyboard = false) {
    return keyboard || (this.completed && !this.rejected && this.maximum <= 5)
  }
}

export const SCENE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown'])

export function movementForKeys(keys: ReadonlySet<string>, fast: boolean, seconds: number) {
  const x = Number(keys.has('KeyD')) - Number(keys.has('KeyA'))
  const z = Number(keys.has('KeyW')) - Number(keys.has('KeyS'))
  const y = Number(keys.has('KeyE') || keys.has('ArrowUp')) - Number(keys.has('KeyQ') || keys.has('ArrowDown'))
  const length = Math.hypot(x, y, z)
  const speed = (fast ? 20 : 7) * Math.min(Math.max(seconds, 0), 0.05)
  return length ? { x: x / length * speed, y: y / length * speed, z: z / length * speed }
    : { x: 0, y: 0, z: 0 }
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(
    'input,textarea,select,button,a[href],[contenteditable]:not([contenteditable="false"]),'
    + '[role="textbox"],[role="combobox"],[role="listbox"],[role="option"],'
    + '[role="radio"],[role="radiogroup"],[role="slider"],[role="tab"],[role="tablist"],'
    + '[role="menu"],[role="menuitem"],[role="tree"],[role="treeitem"],[data-scene-ui]',
  ))
}
