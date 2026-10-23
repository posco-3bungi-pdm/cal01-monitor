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

export function numberText(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value !== 0 && Math.abs(value) < 0.01) {
    const [coefficient, exponent] = value.toExponential(3).split("e");
    return `${coefficient}e^${Number(exponent)}`;
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}
