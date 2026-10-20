export type SelectOption = { value: string; label: string }
export type PopupPlacement = { left: number; top: number; width: number; maxHeight: number }

export function placeSelectPopup(
  anchor: { left: number; top: number; bottom: number; width: number },
  viewport: { width: number; height: number },
  contentHeight: number,
): PopupPlacement {
  const margin = 8, gap = 5
  const usableHeight = Math.max(0, viewport.height - margin * 2)
  const width = Math.min(Math.max(anchor.width, 168), Math.max(0, viewport.width - margin * 2))
  const below = Math.max(0, viewport.height - margin - anchor.bottom - gap)
  const above = Math.max(0, anchor.top - gap - margin)
  const desired = Math.min(contentHeight, 288, usableHeight)
  const upwards = below < Math.min(desired, 144) && above > below
  const maxHeight = Math.min(desired, upwards ? above : below)
  const top = upwards ? anchor.top - gap - maxHeight : anchor.bottom + gap
  return {
    left: Math.max(margin, Math.min(anchor.left, viewport.width - margin - width)),
    top: Math.max(margin, Math.min(top, viewport.height - margin - maxHeight)),
    width, maxHeight,
  }
}

export function moveSelectIndex(index: number, length: number, key: string): number {
  if (!length) return -1
  if (key === 'Home') return 0
  if (key === 'End') return length - 1
  if (key === 'ArrowDown') return (index + 1 + length) % length
  if (key === 'ArrowUp') return (index - 1 + length) % length
  return index
}

export function matchSelectText(options: SelectOption[], text: string, current: number): number {
  const query = text.normalize('NFKC').toLocaleLowerCase()
  if (!query) return current
  const start = query.length === 1 ? current + 1 : current
  for (let offset = 0; offset < options.length; offset++) {
    const index = (Math.max(0, start) + offset) % options.length
    if (options[index].label.normalize('NFKC').trimStart().toLocaleLowerCase().startsWith(query)) return index
  }
  return current
}
