import assert from "node:assert/strict";
import test from "node:test";
import { frameAt, nextPlaybackPosition } from "../src/playback.ts";
import { timeMs } from "../src/time.ts";

const row = (time: string, value: number | null, source_row = 1) => ({
  source_row, source_record_id: String(source_row), time, recorded_at_raw: time,
  values: { "OP-Z3": value }, annotations: {},
});
const frames = [
  row("2024-01-02T00:00:00", 0),
  row("2024-01-02T00:00:05", null, 2),
  row("2024-01-02T00:00:05", 42, 3),
  row("2024-01-02T00:02:00", 50, 4),
];
test("replay holds actual records, keeps zero and chooses the final equal-time row", () => {
  assert.equal(frameAt(frames, timeMs("2024-01-02T00:00:03")).frame?.values["OP-Z3"], 0);
  assert.equal(frameAt(frames, timeMs("2024-01-02T00:00:05")).frame?.source_row, 3);
  assert.equal(frameAt([frames[1]], timeMs("2024-01-02T00:00:05")).frame?.values["OP-Z3"], null);
});
test("unrecorded gaps are blank and future records are never shown early", () => {
  assert.equal(frameAt(frames, timeMs("2024-01-01T23:59:59")).frame, null);
  assert.equal(frameAt(frames, timeMs("2024-01-02T00:01:00")).frame, null);
  assert.equal(frameAt(frames, timeMs("2024-01-02T00:01:00")).next?.source_row, 4);
  assert.equal(frameAt(frames, timeMs("2024-01-02T00:02:00")).frame?.values["OP-Z3"], 50);
});
test("seeking into dense records never moves the clock backwards", () => {
  assert.deepEqual(nextPlaybackPosition(100, 10, 200, 90, true), { position: 100, waiting: true, finished: false });
});
test("equal-time final records spanning pages are drained before completion", () => {
  assert.deepEqual(nextPlaybackPosition(100, 10, 100, 100, true), { position: 100, waiting: false, finished: false });
  assert.deepEqual(nextPlaybackPosition(100, 10, 100, 100, false), { position: 100, waiting: false, finished: true });
  const pages = [1000, 1000, 500].map((count, batch) =>
    Array.from({ length: count }, (_, index) => row("2024-01-02T00:00:05", batch * 1000 + index, batch * 1000 + index + 1)));
  const all = pages.flat();
  assert.equal(frameAt(all, timeMs("2024-01-02T00:00:05")).frame?.source_row, 2500);
});
