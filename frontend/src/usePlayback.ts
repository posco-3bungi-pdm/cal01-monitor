import { useCallback, useEffect, useRef, useState } from "react";
import { api, queryString } from "./api";
import { frameAt, nextPlaybackPosition } from "./playback";
import type { PlaybackFrame, PlaybackPage } from "./playback";
import type { Lot } from "./types";
import { timeIso, timeMs } from "./time";

export function usePlayback(datasetId: string, lot: Lot | undefined, onTime: (time: string) => void) {
  const [engaged, setEngaged] = useState(false);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [position, setPosition] = useState(0);
  const [frame, setFrame] = useState<PlaybackFrame | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const buffer = useRef<PlaybackFrame[]>([]);
  const nextCursor = useRef<string | null>(null);
  const clock = useRef(0);
  const bounds = useRef({ start: 0, end: 0 });
  const requestRange = useRef({ start: "", end: "" });
  const fetchController = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const onTimeRef = useRef(onTime);
  onTimeRef.current = onTime;

  const publish = useCallback((value: number) => {
    const result = frameAt(buffer.current, value);
    clock.current = value;
    setPosition(value);
    setFrame(result.frame);
    onTimeRef.current(timeIso(value));
    if (result.index > 2000) buffer.current = buffer.current.slice(result.index - 1);
    return result;
  }, []);

  const clear = useCallback(() => {
    generation.current++;
    fetchController.current?.abort();
    pending.current = false;
    buffer.current = [];
    nextCursor.current = null;
    setEngaged(false); setRunning(false); setLoading(false); setFrame(null); setError("");
  }, []);

  useEffect(() => {
    clear();
    if (lot) bounds.current = { start: timeMs(lot.start), end: timeMs(lot.end) };
    return () => { generation.current++; fetchController.current?.abort(); };
  }, [datasetId, lot?.lot_no, lot?.start, lot?.end, clear]);

  const fetchPage = useCallback(async (start?: number) => {
    if (!lot || pending.current) return;
    const epoch = generation.current;
    const controller = new AbortController();
    fetchController.current = controller;
    pending.current = true; setLoading(true);
    try {
      const page = await api<PlaybackPage>(`/api/playback-frames?${queryString({
        dataset: datasetId, lot: String(lot.lot_no), limit: 1000,
        // Keep the range fixed for all pages; the opaque cursor includes it.
        start: requestRange.current.start, end: requestRange.current.end,
        cursor: start === undefined ? nextCursor.current ?? undefined : undefined,
      })}`, { signal: controller.signal });
      if (epoch !== generation.current) return;
      buffer.current = start === undefined ? [...buffer.current, ...page.frames] : page.frames;
      nextCursor.current = page.has_more ? page.next_cursor : null;
      publish(clock.current);
    } catch (reason) {
      if (!controller.signal.aborted && epoch === generation.current) {
        setError(reason instanceof Error ? reason.message : "재생할 자료를 불러오지 못했습니다.");
        setRunning(false);
      }
    } finally {
      if (epoch === generation.current) { pending.current = false; setLoading(false); }
    }
  }, [datasetId, lot, publish]);

  const seek = useCallback((time: string, resume = false) => {
    if (!lot) return;
    clear();
    const requested = Math.min(timeMs(lot.end), Math.max(timeMs(lot.start), timeMs(time)));
    if (!Number.isFinite(requested)) return;
    // Include a preceding row for the frame at a scrub position.
    bounds.current = { start: Math.max(timeMs(lot.start), requested - 30_000), end: timeMs(lot.end) };
    requestRange.current = {
      start: bounds.current.start === timeMs(lot.start) ? lot.start : timeIso(bounds.current.start),
      end: lot.end,
    };
    clock.current = requested;
    setEngaged(true); setRunning(resume); setPosition(requested);
    onTimeRef.current(timeIso(requested));
    void fetchPage(requested);
  }, [lot, clear, fetchPage]);

  useEffect(() => {
    if (!engaged || !running) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now(), elapsed = Math.min(now - last, 300);
      last = now;
      const frames = buffer.current;
      if (!frames.length || pending.current && frames.length < 2) return;
      const tail = timeMs(frames[frames.length - 1].time);
      const step = nextPlaybackPosition(clock.current, elapsed * speed, bounds.current.end, tail, !!nextCursor.current);
      if (step.waiting) {
        if (!pending.current) void fetchPage();
        return;
      }
      const result = publish(step.position);
      if (nextCursor.current && result.index > frames.length - 250 && !pending.current) void fetchPage();
      if (step.finished && !pending.current) setRunning(false);
    }, 100);
    return () => window.clearInterval(timer);
  }, [engaged, running, speed, publish, fetchPage]);

  const play = (from: string) => {
    if (!engaged || clock.current >= bounds.current.end) seek(clock.current >= bounds.current.end && lot ? lot.start : from, true);
    else if (!error) setRunning(true);
    else seek(timeIso(clock.current), true);
  };
  const pause = () => setRunning(false);
  const nextRecord = () => {
    const next = frameAt(buffer.current, clock.current).next;
    if (next) publish(timeMs(next.time));
    else if (nextCursor.current) void fetchPage();
  };
  return { engaged, running, speed, setSpeed, position, frame, loading, error, seek, play, pause, clear, nextRecord };
}
