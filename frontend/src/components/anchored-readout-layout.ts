import type { LabelAnchor, LabelRect } from './scene-label-layout.ts'

export type AnchoredSeat = { x: number; y: number; box: LabelRect }
type Options = {
  boxWidth: number; boxHeight: number; gap: number; top: number; bottom: number
  exclusions: LabelRect[]; previous?: ReadonlyMap<string, AnchoredSeat>
}

// Preserve each card's offset from its own projected Zone, not its screen seat.
// A changed hover/alert state never changes the placement order.
export function layoutAnchoredReadouts(items: LabelAnchor[], width: number, height: number, options: Options): Map<string, LabelRect> {
  const { boxWidth, boxHeight, gap, top, bottom, exclusions, previous } = options
  const placed = new Map<string, LabelRect>()
  const maxX = width - boxWidth - gap, maxY = height - boxHeight - bottom
  if (maxX < gap || maxY < top) return placed
  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
  const horizontalLimit = boxWidth * .7
  const tether = Math.max(240, boxHeight * 2.6)
  const near = (box: LabelRect, item: LabelAnchor) => Math.abs(box.x + boxWidth / 2 - item.x) <= horizontalLimit + .01
    && Math.hypot(box.x + boxWidth / 2 - item.x, box.y + boxHeight / 2 - item.y) <= tether
  const free = (box: LabelRect) => [...exclusions, ...placed.values()].every(other =>
    box.x + boxWidth + gap <= other.x || box.x >= other.x + other.width + gap
    || box.y + boxHeight + gap <= other.y || box.y >= other.y + other.height + gap)
  const boxAt = (x: number, y: number): LabelRect => ({ x: clamp(x, gap, maxX), y: clamp(y, top, maxY), width: boxWidth, height: boxHeight })
  const desired = new Map<string, LabelRect>()
  for (const item of items) {
    const old = previous?.get(item.id)
    const box = old ? boxAt(old.box.x + item.x - old.x, old.box.y + item.y - old.y) : boxAt(item.x + item.dx, item.y + item.dy)
    desired.set(item.id, box)
    if (old && near(box, item) && free(box)) placed.set(item.id, box)
  }
  const order = [...items].sort((a, b) => {
    const aHigh = a.y + a.dy < height * .35, bHigh = b.y + b.dy < height * .35
    return Number(bHigh) - Number(aHigh) || (aHigh ? (a.y + a.dy) - (b.y + b.dy) : 0) || a.x - b.x
  })
  for (const item of order) {
    if (placed.has(item.id)) continue
    const wanted = desired.get(item.id)!
    const preferred = boxAt(item.x + item.dx, item.y + item.dy)
    if (near(wanted, item) && free(wanted)) { placed.set(item.id, wanted); continue }
    const obstacles = [...exclusions, ...placed.values()]
    const xs = [wanted.x, preferred.x, item.x - boxWidth / 2,
      item.x - boxWidth / 2 - horizontalLimit, item.x - boxWidth / 2 + horizontalLimit,
      ...obstacles.flatMap(box => [box.x - boxWidth - gap, box.x + box.width + gap])]
    const ys = [wanted.y, preferred.y, item.y + 20, top, maxY,
      ...obstacles.flatMap(box => [box.y - boxHeight - gap, box.y + box.height + gap])]
    let best: LabelRect | undefined, score = Infinity
    for (const x of xs) for (const y of ys) {
      const box = boxAt(x, y)
      const cost = Math.hypot(box.x - wanted.x, box.y - wanted.y) + .5 * Math.hypot(box.x - preferred.x, box.y - preferred.y)
        + Math.abs(box.x + boxWidth / 2 - item.x)
      if (cost < score && near(box, item) && free(box)) { best = box; score = cost }
    }
    if (best) placed.set(item.id, best)
  }
  // After a large zoom, release a detour only when its original nearby spot is
  // clearly better and free. Small camera changes retain their old attachment.
  for (let pass = 0; pass < 2; pass++) for (const item of items) {
    const current = placed.get(item.id)
    if (!current) continue
    const preferred = boxAt(item.x + item.dx, item.y + item.dy)
    const distance = (box: LabelRect) => Math.hypot(box.x + boxWidth / 2 - item.x, box.y + boxHeight / 2 - item.y)
    if (Math.hypot(current.x - preferred.x, current.y - preferred.y) < boxWidth * .65 || distance(preferred) + 60 >= distance(current)) continue
    placed.delete(item.id)
    placed.set(item.id, free(preferred) ? preferred : current)
  }
  // A newly revealed alarm can occupy an old seat. If keeping every other
  // seat would hide a Zone, retry the nearby layout and use it only if it fits more.
  if (previous?.size && placed.size < items.length) {
    const fresh = layoutAnchoredReadouts(items, width, height, { ...options, previous: undefined })
    if (fresh.size > placed.size) return fresh
  }
  return placed
}

// While the Zone lies within the card's width, attach straight to its top or
// bottom edge. Choosing a side edge there swapped the leader across the whole
// card whenever a moving camera nudged the Zone past the card's centre.
export function leaderPoints(x: number, y: number, box: LabelRect) {
  const inset = 16
  if (x >= box.x + inset && x <= box.x + box.width - inset) {
    const edgeY = y > box.y + box.height / 2 ? box.y + box.height : box.y
    return `${x},${y} ${x},${edgeY + (edgeY === box.y ? -10 : 10)} ${x},${edgeY}`
  }
  const edgeX = x < box.x + box.width / 2 ? box.x : box.x + box.width
  const edgeY = Math.max(box.y + inset, Math.min(box.y + box.height - inset, y))
  return `${x},${y} ${edgeX + (edgeX === box.x ? -14 : 14)},${edgeY} ${edgeX},${edgeY}`
}

export function followAnchoredReadout(old: AnchoredSeat | undefined, x: number, y: number, target: LabelRect, seconds: number, reducedMotion = false): LabelRect {
  if (!old || reducedMotion) return target
  const elapsed = Math.min(.05, Math.max(0, seconds))
  const blend = 1 - Math.exp(-elapsed / .1)
  const trackedX = old.box.x + x - old.x, trackedY = old.box.y + y - old.y
  const dx = (target.x - trackedX) * blend, dy = (target.y - trackedY) * blend
  const distance = Math.hypot(dx, dy), limit = 320 * elapsed
  const scale = distance > limit ? limit / distance : 1
  return { ...target, x: trackedX + dx * scale, y: trackedY + dy * scale }
}
