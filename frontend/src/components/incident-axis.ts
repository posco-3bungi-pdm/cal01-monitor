export function incidentAxis(values: number[]) {
  const finite = values.filter(Number.isFinite)
  const low = Math.min(...finite), high = Math.max(...finite)
  const spread = high - low
  const padding = spread > 0 ? spread * .12 : Math.max(Math.abs(high) * .001, high === 0 ? 1 : Number.MIN_VALUE)
  const min = low - padding, max = high + padding
  return { min, max, ticks: [min, (min + max) / 2, max] }
}

export function incidentTick(value: number, step: number) {
  if (value !== 0 && Math.abs(value) < .01) return value.toExponential(3).replace('e-', 'e−')
  const decimals = Math.max(0, Math.min(8, 1 - Math.floor(Math.log10(Math.abs(step) || 1))))
  return value.toFixed(decimals)
}
