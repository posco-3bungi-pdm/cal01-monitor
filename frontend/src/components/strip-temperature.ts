// One fixed teaching scale across every zone and playback time, not alarm limits.
export const STRIP_TEMPERATURE_STOPS = [
  { value: 0, color: '#385bfa' },
  { value: 200, color: '#08bce8' },
  { value: 400, color: '#42d6a4' },
  { value: 600, color: '#ffda48' },
  { value: 800, color: '#ff872e' },
  { value: 1000, color: '#ed4055' },
] as const

export const MISSING_STRIP_TEMPERATURE_COLOR = '#7c8995'

export function stripTemperatureColor(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return MISSING_STRIP_TEMPERATURE_COLOR
  const stops = STRIP_TEMPERATURE_STOPS
  if (value <= stops[0].value) return stops[0].color
  for (let index = 1; index < stops.length; index++) {
    const low = stops[index - 1], high = stops[index]
    if (value > high.value) continue
    const fraction = (value - low.value) / (high.value - low.value)
    const rgb = [1, 3, 5].map(offset => {
      const a = parseInt(low.color.slice(offset, offset + 2), 16)
      const b = parseInt(high.color.slice(offset, offset + 2), 16)
      return Math.round(a + (b - a) * fraction).toString(16).padStart(2, '0')
    })
    return `#${rgb.join('')}`
  }
  return stops[stops.length - 1].color
}

export function stripTemperatureBands(zones: readonly { id: string; x: number }[], values: Record<string, number | null>) {
  return zones.flatMap(zone => zone.id === 'OUT'
    ? [{ x: zone.x - .7, channel: 'TC-OUT1' }, { x: zone.x + .7, channel: 'TC-OUT2' }]
    : [{ x: zone.x, channel: zone.id === 'CLN' ? 'CLN-IN' : `TC-${zone.id}` }])
    .map(band => ({ ...band, color: stripTemperatureColor(values[band.channel]) }))
}
