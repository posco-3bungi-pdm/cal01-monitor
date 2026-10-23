export type ChannelBaseline = {
  count: number; mean: number | null; std: number | null; lower: number | null; upper: number | null;
  status: "ready" | "insufficient_samples" | "constant" | "unusable_statistics";
};
export type DetectionRun = {
  id: string; dataset_id: string; lot_no: string; mode: "historical"; status: string;
  config: { channels: string[]; threshold: number; ddof: number; max_gap_seconds: number; min_valid_samples: number };
  stats: Record<string, ChannelBaseline>;
  summary: {
    source_count: number; candidate_count: number; exceedance_count: number;
    analyzed_channels: string[]; skipped_channels: Record<string, string>; interpretation: string;
  };
  created_by: unknown; created_at: string;
};
export type DetectionCandidate = {
  id: string; run_id: string; dataset_id: string; lot_no: string; mode: "historical";
  channel_id: string; zone_id: string; start: string; end: string;
  peak_at: string; peak_value: number; peak_z: number; point_count: number;
  baseline: ChannelBaseline;
  acknowledged: boolean; acknowledged_by: unknown; acknowledged_at: string | null;
  resolved?: boolean; resolved_at?: string | null; resolved_by?: string | null; resolution_note?: string;
  open_request?: { id: string; status: string } | null;
};
export type TeamPerson = { username: string; display_name: string };
export type FieldRequest = {
  id: string; candidate_id: string | null; run_id: string | null; dataset_id: string; lot_no: string;
  source?: 'candidate' | 'manual';
  channel_id: string; zone_id: string; start: string; end: string; title: string;
  message: string; status: "requested" | "accepted" | "completed" | "closed"; revision: number;
  requested_by: TeamPerson; assigned_to: TeamPerson | null; created_at: string; updated_at: string; result: string;
};
export type TeamNotification = {
  id: number; kind: string; candidate_id: string | null; request_id: string | null;
  title: string; actor: TeamPerson | null; created_at: string;
  dataset_id?: string; lot_no?: string; run_id?: string; channel_id?: string; start?: string; end?: string;
};
export type ManualRequestContext = { dataset_id: string; lot_no: string; channel_id: string; start: string; end: string };
export type CandidateLocation = { candidate_id: string; dataset_id: string; lot_no: string; run_id?: string };

export function activityTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(date)
    : value;
}
