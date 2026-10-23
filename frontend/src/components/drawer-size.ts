export type DrawerSize = { width: number; height: number }
export type DrawerLimits = { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number }
export type ResizeAxis = 'width' | 'height' | 'both'

export function drawerLimits(width: number, height: number, top: number, right: number, bottom: number): DrawerLimits {
  const maxWidth = Math.max(1, width - right - 12)
  const maxHeight = Math.max(1, height - top - bottom)
  return { minWidth: Math.min(360, maxWidth), maxWidth, minHeight: Math.min(260, maxHeight), maxHeight }
}
export function clampDrawerSize(size: DrawerSize, limits: DrawerLimits): DrawerSize {
  return { width: Math.max(limits.minWidth, Math.min(limits.maxWidth, size.width)),
    height: Math.max(limits.minHeight, Math.min(limits.maxHeight, size.height)) }
}
export function resizeDrawer(size: DrawerSize, dx: number, dy: number, axis: ResizeAxis, limits: DrawerLimits): DrawerSize {
  // The panel is anchored at the upper right; its left edge moves left to grow.
  return clampDrawerSize({ width: size.width - (axis === 'height' ? 0 : dx),
    height: size.height + (axis === 'width' ? 0 : dy) }, limits)
}
