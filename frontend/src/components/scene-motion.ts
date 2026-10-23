// Source-record playback and the explanatory cleaning equipment have separate switches.
export function sceneMotion(recordPlaying: boolean, cleaningEnabled: boolean, blocked: boolean) {
  return { strip: !blocked && (recordPlaying || cleaningEnabled), cleaning: !blocked && cleaningEnabled }
}
