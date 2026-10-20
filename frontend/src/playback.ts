import { timeMs } from "./time.ts";

export type PlaybackFrame = {
  source_row: number;
  source_record_id: string;
  time: string;
  recorded_at_raw: string;
  values: Record<string, number | null>;
  annotations: Record<string, unknown>;
};
export type PlaybackPage = {
  frames: PlaybackFrame[];
  next_cursor: string | null;
  has_more: boolean;
};

// A recorded row is held until the next record, for at most 30 seconds.
// No values are interpolated and a missing channel stays missing.
export function frameAt(frames: PlaybackFrame[], position: number) {
  let low = 0, high = frames.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (timeMs(frames[mid].time) <= position) low = mid + 1;
    else high = mid;
  }
  const index = low - 1;
  const recorded = frames[index] ?? null;
  const frame = recorded && position - timeMs(recorded.time) <= 30_000 ? recorded : null;
  return { index, frame, next: frames[low] ?? null };
}

export function nextPlaybackPosition(current: number, elapsed: number, end: number, tail: number, hasMore: boolean) {
  // A dense page may end before the requested seek position.
  const waiting = hasMore && tail < current;
  const position = waiting ? current : Math.min(current + elapsed, end, hasMore ? tail : end);
  return { position, waiting, finished: position >= end && !hasMore };
}
