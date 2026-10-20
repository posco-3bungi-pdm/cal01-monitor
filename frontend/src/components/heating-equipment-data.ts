import type { Position3 } from './furnace-model'

// Camera anchors for the explanatory model, not measured plant coordinates.
export const HEATING_PART_VIEWS = [
  { id: 'HEAT-Z3', position: [-7.9, 5.45, 0] as Position3, viewRadius: 4.65 },
  { id: 'HEAT-Z4', position: [-3.5, 6.05, 0] as Position3, viewRadius: 5.25 },
  { id: 'HEAT-Z5', position: [0.9, 6.05, 0] as Position3, viewRadius: 5.25 },
  { id: 'HEAT-Z6', position: [5.3, 5.45, 0] as Position3, viewRadius: 4.65 },
  { id: 'HEAT-AIR', position: [-10.7, 1.25, 3.65] as Position3, viewRadius: 1.8 },
  { id: 'HEAT-RECUP', position: [7.4, 3.05, 3.65] as Position3, viewRadius: 1.8 },
  { id: 'HEAT-LINING', position: [-3.5, 6.0, -1.43] as Position3, viewRadius: 4.8 },
]
