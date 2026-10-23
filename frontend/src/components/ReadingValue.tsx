import { readingParts } from '../time'

export default function ReadingValue({ channelId, value, unit }: {
  channelId: string; value: number | null | undefined; unit?: string | null
}) {
  const parts = readingParts(channelId, value)
  return <><strong>{parts.value}</strong>{parts.exponent && <span className="reading-exponent" title="10의 지수 · 측정 단위와 별개">{parts.exponent}</span>}{unit && <span className="reading-unit">{unit}</span>}</>
}
