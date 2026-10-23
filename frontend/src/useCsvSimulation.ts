import { useCallback, useEffect, useRef, useState } from 'react';
import { api, queryString } from './api';
import type { TimeRange } from './types';
import type { SimulationFrame } from './live-simulation';
import { releaseRows } from './live-simulation';

type Snapshot = { key: string; frames: SimulationFrame[]; count: number };
const emptySnapshot = (key: string): Snapshot => ({ key, frames: [], count: 0 });

export function useCsvSimulation(datasetId: string, range: TimeRange | null) {
  const key = `${datasetId}:${range?.start ?? ''}:${range?.end ?? ''}`;
  const [snapshot, setSnapshot] = useState<Snapshot>(() => emptySnapshot(key));
  const [engaged, setEngaged] = useState(false), [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(0);
  const [speed, setSpeed] = useState(1), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const queue = useRef<SimulationFrame[]>([]), next = useRef<string | null>(null);
  const hasMore = useRef(true), pending = useRef(false), active = useRef(false), currentKey = useRef(key);
  const received = useRef(0), epoch = useRef(0), controller = useRef<AbortController | null>(null), credit = useRef(0);

  const reset = useCallback(() => {
    epoch.current++; setRunId(value => value + 1); controller.current?.abort(); queue.current = []; next.current = null;
    hasMore.current = true; pending.current = false; active.current = false; received.current = 0; credit.current = 0;
    currentKey.current = key; setSnapshot(emptySnapshot(key));
    setEngaged(false); setRunning(false); setLoading(false); setError('');
  }, [key]);
  useEffect(() => { reset(); return () => { epoch.current++; controller.current?.abort(); }; }, [reset]);

  const publish = useCallback((count: number) => {
    const result = releaseRows(queue.current, count);
    queue.current = result.waiting;
    if (!result.arrived.length) return;
    received.current += result.arrived.length;
    setSnapshot(previous => ({ key, count: received.current,
      frames: [...(previous.key === key ? previous.frames : []), ...result.arrived].slice(-1801) }));
  }, [key]);

  const fetchPage = useCallback(async () => {
    if (!datasetId || !range || pending.current || !hasMore.current) return;
    const version = epoch.current, abort = new AbortController(); controller.current = abort;
    pending.current = true; setLoading(true);
    try {
      const page = await api<{ frames: SimulationFrame[]; next_cursor: string | null; has_more: boolean }>(
        `/api/playback-frames?${queryString({ dataset: datasetId, start: range.start, end: range.end, limit: 1000, cursor: next.current ?? undefined })}`,
        { signal: abort.signal });
      if (version !== epoch.current) return;
      queue.current.push(...page.frames); next.current = page.next_cursor; hasMore.current = page.has_more;
      if (received.current === 0 && active.current) { credit.current = 0; publish(1); }
    } catch (reason) {
      if (!abort.signal.aborted && version === epoch.current) {
        setError(reason instanceof Error ? reason.message : '시연 자료를 불러오지 못했습니다.'); setRunning(false);
      }
    } finally { if (version === epoch.current) { pending.current = false; setLoading(false); } }
  }, [datasetId, range?.start, range?.end, publish]);

  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now(), elapsed = Math.min(1000, now - last); last = now;
      if (document.hidden) return;
      if (!queue.current.length) {
        credit.current = 0;
        if (hasMore.current) void fetchPage(); else if (!pending.current) setRunning(false);
        return;
      }
      credit.current += elapsed * speed;
      const count = Math.floor(credit.current / 1000);
      if (count > 0) {
        const available = queue.current.length; publish(count);
        credit.current = count >= available ? 0 : credit.current - count * 1000;
      }
      if (queue.current.length < 250 && hasMore.current) void fetchPage();
      if (!queue.current.length && !hasMore.current && !pending.current) setRunning(false);
    }, 100);
    return () => window.clearInterval(timer);
  }, [running, speed, publish, fetchPage]);

  const play = useCallback(() => {
    if (!datasetId || !range) return;
    if (currentKey.current !== key || received.current > 0 && !hasMore.current && !queue.current.length) reset();
    active.current = true; setEngaged(true); setRunning(true); setError('');
    if (!queue.current.length) void fetchPage();
  }, [datasetId, range?.start, range?.end, key, reset, fetchPage]);
  const pause = useCallback(() => { active.current = false; setRunning(false); }, []);
  const visible = snapshot.key === key ? snapshot : emptySnapshot(key);
  return { ...visible, frame: visible.frames.at(-1) ?? null, engaged: snapshot.key === key && engaged,
    runId, running, speed, setSpeed, loading, error, play, pause, reset,
    ended: visible.count > 0 && !running && !hasMore.current && queue.current.length === 0 && !pending.current };
}
