import { readingParts } from '../time'

export default function ReadingValue({ channelId, value, unit, hideUnit = false, decimals }: {
  channelId: string; value: number | null | undefined; unit?: string | null; hideUnit?: boolean; decimals?: number
}) {
  const parts = readingParts(channelId, value)
  if (decimals !== undefined && value != null && Number.isFinite(value) && !parts.exponent) parts.value = value.toFixed(decimals)
  const shownUnit = hideUnit ? null : channelId === 'CP-Z4' ? '무차원' : unit
  return <><strong>{parts.value}</strong>{parts.exponent && <span className="reading-exponent" title="10의 지수 · 측정 단위와 별개">{parts.exponent}</span>}{shownUnit && <span className="reading-unit">{shownUnit}</span>}</>
}
