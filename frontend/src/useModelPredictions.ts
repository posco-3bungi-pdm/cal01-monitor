import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { SimulationFrame } from './live-simulation';
import { predictionJob } from './model-predictions';
import type { LiveModel, ModelPredictions } from './model-predictions';
import { timeMs } from './time';

export function useModelPredictions(dataset: string, frame: SimulationFrame | null, model: LiveModel, enabled: boolean, ended: boolean, runId: number) {
  const context = enabled && frame && model !== 'none' ? `${dataset}:${runId}:${frame.lot_no}:${model}` : '';
  const source = context ? `${dataset}:${runId}:${model}` : '';
  const [state, setState] = useState<{ context: string; result: ModelPredictions | null; error: string; pending: boolean }>({ context: '', result: null, error: '', pending: false });
  const generation = useRef(0), pending = useRef(false), controller = useRef<AbortController | null>(null);
  const latest = useRef<ReturnType<typeof predictionJob>>(null), completed = useRef('');
  const priorFrame = useRef<SimulationFrame | null>(null), finalizers = useRef<AbortController[]>([]), sourceEpoch = useRef(0);
  const [finalized, setFinalized] = useState<{ source: string; results: ModelPredictions[] }>({ source: '', results: [] });
  const requestGate = useRef<Promise<void>>(Promise.resolve()), nextRequestAt = useRef(0);
  const reserveRequest = useCallback(() => {
    const next = requestGate.current.then(async () => {
      const wait = Math.max(0, nextRequestAt.current - performance.now());
      if (wait > 0) await new Promise(resolve => window.setTimeout(resolve, wait));
      nextRequestAt.current = performance.now() + 1000;
    });
    requestGate.current = next.catch(() => {});
    return next;
  }, []);

  const drain = useCallback(async () => {
    if (!context || pending.current || !latest.current || latest.current.key === completed.current) return;
    const epoch = generation.current;
    pending.current = true; setState(previous => ({ ...previous, context, pending: true, error: '' }));
    try {
      while (latest.current && latest.current.key !== completed.current && epoch === generation.current) {
        await reserveRequest();
        if (epoch !== generation.current || !latest.current) return;
        const job = latest.current, abort = new AbortController(); controller.current = abort;
        try {
          const result = await api<ModelPredictions>('/api/model-predictions', {
            method: 'POST', signal: abort.signal, body: JSON.stringify(job.payload),
          });
          if (epoch !== generation.current) return;
          completed.current = job.key;
          setState({ context, result: { ...result, events: result.events.map(event => ({ ...event, lot_no: result.lot_no })) }, pending: true, error: '' });
        } catch (error) {
          if (abort.signal.aborted || epoch !== generation.current) return;
          completed.current = job.key;
          setState(previous => ({ ...previous, context, error: error instanceof Error ? error.message : '모델 예측을 불러오지 못했습니다.' }));
          break;
        }
      }
    } finally {
      if (epoch === generation.current) {
        pending.current = false; setState(previous => ({ ...previous, pending: false }));
      }
    }
  }, [context, reserveRequest]);

  useEffect(() => {
    generation.current++; controller.current?.abort(); pending.current = false; latest.current = null; completed.current = '';
    setState({ context, result: null, error: '', pending: false });
    return () => { generation.current++; controller.current?.abort(); };
  }, [context]);
  useEffect(() => {
    sourceEpoch.current++; priorFrame.current = null; finalizers.current.forEach(item => item.abort()); finalizers.current = [];
    setFinalized({ source, results: [] });
    return () => { sourceEpoch.current++; finalizers.current.forEach(item => item.abort()); };
  }, [source]);
  useEffect(() => {
    if (!source || !frame) return;
    const previous = priorFrame.current; priorFrame.current = frame;
    if (!previous || previous.lot_no === frame.lot_no) return;
    const abort = new AbortController(), epoch = sourceEpoch.current;
    finalizers.current.push(abort);
    // The first row of the next LOT closes the previous LOT's last minute.
    void reserveRequest().then(() => {
      if (abort.signal.aborted || epoch !== sourceEpoch.current) return null;
      return api<ModelPredictions>('/api/model-predictions', { method: 'POST', signal: abort.signal,
        body: JSON.stringify({ dataset, lot_no: previous.lot_no, through_source_row: frame.source_row, model, end_of_stream: false }),
      });
    }).then(result => {
      if (!result) return;
      if (epoch !== sourceEpoch.current) return;
      setFinalized(current => ({ source, results: [...current.results.filter(item => item.lot_no !== result.lot_no),
        { ...result, events: result.events.map(event => ({ ...event, lot_no: result.lot_no })) }].slice(-14) }));
    }).catch(error => {
      if (!abort.signal.aborted && epoch === sourceEpoch.current) setState(current => ({ ...current,
        error: `이전 LOT ${previous.lot_no}의 마지막 분을 계산하지 못했습니다. ${error instanceof Error ? error.message : ''}` }));
    }).finally(() => { finalizers.current = finalizers.current.filter(item => item !== abort); });
  }, [source, dataset, frame?.source_row, frame?.lot_no, model, reserveRequest]);
  useEffect(() => {
    latest.current = context ? predictionJob(dataset, frame, model, ended) : null;
    void drain();
  }, [context, dataset, frame?.source_row, frame?.time, model, ended, drain]);
  const retry = useCallback(() => { completed.current = ''; void drain(); }, [drain]);
  const result = state.context === context && frame && state.result && timeMs(state.result.through) <= timeMs(frame.time)
    ? state.result : null;
  return { result, previous: finalized.source === source ? finalized.results : [],
    error: state.context === context ? state.error : '', pending: state.context === context && state.pending, retry };
}
