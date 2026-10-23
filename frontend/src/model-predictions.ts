import type { SimulationFrame } from './live-simulation.ts';
import { timeMs } from './time.ts';

export type LiveModel = 'randomforest' | 'zscore' | 'none';
export type ZonePrediction = {
  zone_id: string; model_id: string; kind: 'RandomForest' | 'Z-score'; label_version: string;
  status: 'ready' | 'warming_up' | 'no_data'; minute: string | null;
  prediction: 0 | 1 | null; probability: number | null; evidence: string; channel_ids: string[]; reason: string;
};
export type ModelEvent = {
  id: string; zone_id: string; model_id: string; kind: 'RandomForest' | 'Z-score';
  start: string; end: string; channel_ids: string[]; probability: number | null; evidence?: string; lot_no?: string;
};
export type ModelPredictions = {
  through_source_row: number; through: string; lot_no: string; predictions: ZonePrediction[];
  events: ModelEvent[]; closed_minutes: number; event_count?: number; events_truncated?: boolean;
};

export function predictionJob(dataset: string, frame: SimulationFrame | null, model: LiveModel, ended = false) {
  if (!dataset || !frame || model === 'none' || !Number.isFinite(timeMs(frame.time))) return null;
  return {
    key: `${Math.floor(timeMs(frame.time) / 60_000)}:${ended ? 'last' : 'open'}`,
    payload: { dataset, lot_no: frame.lot_no, through_source_row: frame.source_row, model, end_of_stream: ended },
  };
}

// A zone classifier identifies a zone, never the channel that caused it.
export function liveAttention(events: ModelEvent[]) {
  const zones: Record<string, { count: number; unacknowledged: number }> = {};
  for (const event of events) {
    const group = event.kind === 'Z-score' && event.channel_ids.some(id => id.startsWith('CP-')) ? 'CP'
      : event.zone_id === 'CLN-IN' ? 'CLN' : event.zone_id.startsWith('OUT') ? 'OUT' : event.zone_id;
    const item = zones[group] ??= { count: 0, unacknowledged: 0 };
    item.count++; item.unacknowledged++;
  }
  return zones;
}

export function modelName(kind: string) {
  return kind === 'RandomForest' ? 'RandomForestClassifier' : 'Z-score';
}
