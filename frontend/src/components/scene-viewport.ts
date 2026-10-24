export function sceneOverlayOffset(width: number, height: number, open: boolean,
  side?: 'left' | 'right' | null, panelWidth?: number) {
  if (!open) return { x: 0, y: 0 }
  if (width <= 760) return { x: 0, y: height * .3 }
  const occupied = Math.min(width * .8, Math.max(0, panelWidth ?? (side === 'left' ? 300 : width * .6)))
  return { x: (side === 'left' ? -1 : 1) * occupied / 2, y: 0 }
}
