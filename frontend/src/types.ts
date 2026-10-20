export type Theme = "dark" | "light";
export type User = {
  username: string;
  display_name: string;
  team: string;
  is_admin: boolean;
  can_edit_layout: boolean;
};
export type Dataset = { id: string; name: string; row_count: number; status: string };
export type Lot = { lot_no: string; grade: string; start: string; end: string; count: number };
export type Channel = { id: string; label: string; unit: string | null; zone: string; kind: string };
export type Placement = { channel_id: string; zone_id: string; position: [number, number, number] };
export type EquipmentLayout = { model_version: string; revision: number; placements: Placement[] };
export type TimeRange = { start: string; end: string };
export type SeriesPoint = {
  time: string;
  value: number | null;
  min?: number | null;
  max?: number | null;
  count?: number;
  label?: number | null;
  gap_before?: boolean;
};
export type ChannelSeries = { channel_id: string; unit: string | null; points: SeriesPoint[] };
export type SeriesResponse = TimeRange & {
  series: ChannelSeries[];
  mode: string;
  aggregation_seconds: number;
  source_count: number;
  label_intervals: (TimeRange & { count: number })[];
};
export type CurrentFrame = {
  anchor_time: string;
  channels: { channel_id: string; value: number | null; measured_at: string | null; quality_status: string }[];
};
