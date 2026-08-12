/** Mirrors backend/app/models.py. Keep the two in sync. */

export type Axis = "epoch" | "growth_step";

/** X-axis options offered by the chart panel. */
export type ChartAxis = "epoch" | "growth_step" | "n_params";

export interface NodeSnapshot {
  id: string;
  label: string;
  size: number;
  type: string;
  activation: string | null;
  shape: number[] | null;
  kernel_size: number[] | null;
  use_layer_norm: boolean | null;
}

export interface EdgeSnapshot {
  id: string;
  source: string;
  target: string;
  type: string;
  use_bias: boolean | null;
  kernel_size: number[] | null;
}

export interface GraphSnapshot {
  nodes: NodeSnapshot[];
  edges: EdgeSnapshot[];
  /** New structure this step, from diffing consecutive snapshots. */
  added_nodes: string[];
  added_edges: string[];
  /** Existing nodes whose channel count rose (capacity, not topology). */
  widened_nodes: string[];
  /** Edges refit by the expansion: every edge of a graph that grew. */
  updated_edges: string[];
}

export interface StepDoc {
  step: number;
  epoch_range: [number, number] | null;
  n_params: number | null;
  dags: Record<string, GraphSnapshot>;
  metrics: Record<string, number>;
}

export interface SeriesDoc {
  key: string;
  axis: Axis;
  points: [number, number][];
}

export interface RunSummary {
  run_id: string;
  name: string;
  project: string | null;
  dataset: string | null;
  created_at: string | null;
  n_steps: number;
  dag_names: string[];
  summary: Record<string, unknown>;
}

export interface RunBundle {
  run: RunSummary;
  config: Record<string, unknown>;
  steps: StepDoc[];
  series: SeriesDoc[];
}
