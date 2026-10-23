export type InspectionState = {
  pinned: boolean
  preview: string | null
  hovered: string | null
  dismissed: string | null
}
export const emptyInspection: InspectionState = { pinned: false, preview: null, hovered: null, dismissed: null }
type InspectionAction = { type: 'enter'; zone: string } | { type: 'leave' | 'pin' | 'dismiss' | 'clear' }

// A click pins a reading and takes precedence over other Zone hovers. Closing
// suppresses repeated move events from the same hover until the pointer leaves.
export function inspectionState(state: InspectionState, action: InspectionAction): InspectionState {
  switch (action.type) {
    case 'enter': {
      if (state.pinned) return state
      const dismissed = state.hovered === action.zone ? state.dismissed : null
      if (state.hovered === action.zone && (state.preview === action.zone || dismissed === action.zone)) return state
      return { ...state, hovered: action.zone, dismissed, preview: dismissed === action.zone ? null : action.zone }
    }
    case 'leave': return { ...state, preview: null, hovered: null, dismissed: null }
    case 'pin': return { ...state, pinned: true, preview: null, dismissed: null }
    case 'dismiss': return { ...state, pinned: false, preview: null, dismissed: state.hovered }
    case 'clear': return emptyInspection
  }
}
