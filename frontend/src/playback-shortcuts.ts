export type PlaybackShortcut = { type: 'toggle' } | { type: 'step'; seconds: number }

export type PlaybackKeyContext = {
  key: string
  enabled: boolean
  targetIsInteractive?: boolean
  dialogOpen?: boolean
  isComposing?: boolean
  defaultPrevented?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  repeat?: boolean
}

export const PLAYBACK_INTERACTIVE_TARGETS = [
  'input', 'textarea', 'select', 'button', 'a',
  '[contenteditable]:not([contenteditable="false"])',
  ...[
    'button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'option',
    'slider', 'spinbutton', 'checkbox', 'radio', 'radiogroup', 'switch',
    'tab', 'tablist', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox',
    'menuitemradio', 'tree', 'treeitem', 'treegrid', 'grid', 'gridcell',
    'scrollbar', 'toolbar', 'application',
  ].map(role => '[role="' + role + '"]'),
].join(',')

export function playbackShortcut(context: PlaybackKeyContext): PlaybackShortcut | null {
  if (!context.enabled || context.defaultPrevented || context.isComposing
    || context.ctrlKey || context.metaKey || context.altKey
    || context.targetIsInteractive || context.dialogOpen) return null
  if (context.key === ' ' || context.key === 'Spacebar') {
    return context.repeat || context.shiftKey ? null : { type: 'toggle' }
  }
  if (context.key !== 'ArrowLeft' && context.key !== 'ArrowRight') return null
  const seconds = context.shiftKey ? 30 : 5
  return { type: 'step', seconds: context.key === 'ArrowLeft' ? -seconds : seconds }
}
