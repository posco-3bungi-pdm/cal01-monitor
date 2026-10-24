// 원자료의 시간대는 확인되지 않았다. 날짜 구성요소를 임시 UTC 숫자축에 놓고
// 같은 구성요소를 표시한다. 원자료를 한국 시각이나 UTC 실측 시각으로 확정하지 않는다.
export function timeMs(value: string): number {
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?/);
  if (!parts) return Number.NaN;
  return Date.UTC(+parts[1], +parts[2] - 1, +parts[3], +parts[4], +parts[5], +(parts[6] ?? 0), +((parts[7] ?? "").padEnd(3, "0").slice(0, 3)));
}

export function timeIso(value: number): string {
  return new Date(value).toISOString().slice(0, 23);
}

export function clockTime(value: string | number, seconds = false): string {
  const ms = typeof value === "number" ? value : timeMs(value);
  if (!Number.isFinite(ms)) return "시각 없음";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", hour: "2-digit", minute: "2-digit",
    ...(seconds ? { second: "2-digit" as const } : {}),
    hour12: false,
  }).format(ms);
}

export function dateTime(value: string | number, seconds = false): string {
  const ms = typeof value === "number" ? value : timeMs(value);
  if (!Number.isFinite(ms)) return "시각 없음";
  const date = new Date(ms).toISOString().slice(0, 10);
  return `${date} ${clockTime(ms, seconds)}`;
}

export function observationRangeText(start: string, end: string): string {
  const first = timeMs(start), latest = timeMs(end)
  if (!Number.isFinite(first) || !Number.isFinite(latest)) return '관측 대기'
  const sameDate = new Date(first).toISOString().slice(0, 10) === new Date(latest).toISOString().slice(0, 10)
  return `${dateTime(first, true)} ~ ${sameDate ? clockTime(latest, true) : dateTime(latest, true)}`
}

export function numberText(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value !== 0 && Math.abs(value) < 0.01) {
    const [coefficient, exponent] = value.toExponential(3).split("e");
    return `${coefficient}e${superscript(String(Number(exponent)))}`;
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function superscript(value: string) {
  const glyphs: Record<string, string> = { '-': '⁻', '+': '⁺', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
  return [...value].map(char => glyphs[char] ?? char).join('')
}

export function readingParts(channelId: string, value: number | null | undefined) {
  const text = numberText(value)
  if (channelId !== 'CP-Z4M' || value == null || !Number.isFinite(value)) return { value: text, exponent: null }
  if (value === 0) return { value: '0', exponent: 'e⁻¹⁰' }
  const [coefficient, exponent] = value.toExponential(3).split('e')
  return { value: coefficient, exponent: `e${superscript(String(Number(exponent)))}` }
}
