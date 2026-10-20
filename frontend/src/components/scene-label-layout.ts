export type LabelAnchor = { id: string; x: number; y: number; dx: number; dy: number; selected?: boolean }
export type LabelRect = { x: number; y: number; width: number; height: number }

export function layoutReadouts(items: LabelAnchor[], width: number, height: number) {
  const placed = new Map<string, LabelRect>()
  const boxWidth = 122, boxHeight = 74, gap = 8
  const top = height > 500 ? 100 : 8
  const bottom = height > 500 ? 124 : 8
  const maxX = width - boxWidth - gap, maxY = height - boxHeight - bottom
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))
  const free = (x: number, y: number) => [...placed.values()].every(box =>
    x + boxWidth + gap <= box.x || x >= box.x + box.width + gap
    || y + boxHeight + gap <= box.y || y >= box.y + box.height + gap)
  for (const item of [...items].sort((a, b) => Number(b.selected) - Number(a.selected))) {
    if (maxX < gap || maxY < top) continue
    const offsets = [[item.dx, item.dy], [22, -78], [-144, -78], [22, 14], [-144, 14],
      [22, -160], [-144, -160], [22, 96], [-144, 96]]
    const nearby = offsets.map(([dx, dy]) => ({
      x: clamp(item.x + dx, gap, maxX), y: clamp(item.y + dy, top, maxY),
    }))
    const grid: { x: number; y: number }[] = []
    for (let y = top; y <= maxY; y += boxHeight + gap) {
      for (let x = gap; x <= maxX; x += boxWidth + gap) grid.push({ x, y })
    }
    grid.sort((a, b) => Math.hypot(a.x + boxWidth / 2 - item.x, a.y + boxHeight / 2 - item.y)
      - Math.hypot(b.x + boxWidth / 2 - item.x, b.y + boxHeight / 2 - item.y))
    const location = [...nearby, ...grid].find(point => free(point.x, point.y))
    if (location) placed.set(item.id, { ...location, width: boxWidth, height: boxHeight })
  }
  return placed
}
