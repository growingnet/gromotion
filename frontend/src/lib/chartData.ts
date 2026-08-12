import type { ChartAxis, RunBundle, StepDoc } from "../types";

/**
 * Metrics arrive on two different x-axes (epoch for training curves, growth
 * step for growth diagnostics) and we want to offer a third (parameter count).
 * These helpers build the lookup tables that let any series be re-expressed on
 * any of the three axes.
 */

export interface AxisMaps {
  /** epoch index -> growth step it was trained under. */
  epochToStep: Map<number, number>;
  /** growth step -> total parameters after that step. */
  stepToParams: Map<number, number>;
  /** growth step -> [firstEpoch, lastEpoch]. */
  stepToEpochs: Map<number, [number, number]>;
  /**
   * Timeline index -> growth step number.
   *
   * These are NOT interchangeable. A run opens with a pre-growth baseline
   * logged at step -1, so the timeline is offset from the step numbering (and
   * any gap in logged steps would widen that offset). Playback addresses the
   * timeline by index; everything user-facing must report the real step.
   */
  indexToStep: number[];
}

export function buildAxisMaps(steps: StepDoc[]): AxisMaps {
  const epochToStep = new Map<number, number>();
  const stepToParams = new Map<number, number>();
  const stepToEpochs = new Map<number, [number, number]>();
  const indexToStep = steps.map((s) => s.step);

  for (const step of steps) {
    if (step.n_params != null) stepToParams.set(step.step, step.n_params);
    if (step.epoch_range) {
      const [first, last] = step.epoch_range;
      stepToEpochs.set(step.step, [first, last]);
      for (let epoch = first; epoch <= last; epoch++) {
        epochToStep.set(epoch, step.step);
      }
    }
  }
  return { epochToStep, stepToParams, stepToEpochs, indexToStep };
}

/**
 * Growth step at a fractional timeline position, interpolating between the
 * neighbouring steps so the cursor glides rather than jumping.
 */
export function stepAtPosition(position: number, maps: AxisMaps): number {
  const { indexToStep } = maps;
  if (indexToStep.length === 0) return 0;

  const index = Math.floor(position);
  const fraction = position - index;
  const current = indexToStep[Math.min(index, indexToStep.length - 1)];
  const next = indexToStep[Math.min(index + 1, indexToStep.length - 1)];
  return current + fraction * (next - current);
}

/**
 * Nearest step at or below `step` that has an epoch range.
 *
 * Not every growth step trains: once growth stops finding actions the loop
 * still runs (and still logs growth-step diagnostics) but `growth/epochs` logs
 * nothing, so those steps have no epoch span. Falling back to the raw step
 * number there would put a growth-step value on an epoch axis -- the cursor
 * would leap backwards from epoch ~300 to "23" and then crawl. Holding the last
 * real epoch keeps the cursor parked at the end of the curves, which is exactly
 * where playback is while nothing is being trained.
 */
function epochsAtStep(maps: AxisMaps, step: number): [number, number] | undefined {
  const lowest = maps.indexToStep.length ? maps.indexToStep[0] : 0;
  for (let s = Math.floor(step); s >= lowest; s--) {
    const value = maps.stepToEpochs.get(s);
    if (value != null) return value;
  }
  return undefined;
}

/** Nearest step at or below `step` that has a parameter count. */
function paramsAtStep(maps: AxisMaps, step: number): number | undefined {
  // Steps can start below zero (the pre-growth baseline is logged at -1), so
  // the search floor comes from the data rather than being assumed to be 0.
  const lowest = maps.indexToStep.length ? maps.indexToStep[0] : 0;
  for (let s = Math.floor(step); s >= lowest; s--) {
    const value = maps.stepToParams.get(s);
    if (value != null) return value;
  }
  return undefined;
}

/** Convert one point's x value from its native axis to the requested axis. */
function projectX(
  x: number,
  nativeAxis: "epoch" | "growth_step",
  target: ChartAxis,
  maps: AxisMaps,
): number | undefined {
  if (nativeAxis === target) return x;

  const step =
    nativeAxis === "epoch" ? maps.epochToStep.get(Math.round(x)) : Math.round(x);
  if (step == null) return undefined;

  if (target === "growth_step") return step;
  if (target === "n_params") return paramsAtStep(maps, step);

  // target === "epoch": take the first epoch of that growth step.
  return maps.stepToEpochs.get(step)?.[0];
}

export interface ChartRow {
  x: number;
  [seriesKey: string]: number;
}

/**
 * Build recharts rows for the given series keys on the given x-axis.
 * Points that cannot be projected onto the target axis are dropped.
 */
export function buildChartRows(
  bundle: RunBundle,
  seriesKeys: string[],
  axis: ChartAxis,
  maps: AxisMaps,
): ChartRow[] {
  const byX = new Map<number, ChartRow>();

  for (const key of seriesKeys) {
    const series = bundle.series.find((s) => s.key === key);
    if (!series) continue;

    for (const [rawX, y] of series.points) {
      const x = projectX(rawX, series.axis, axis, maps);
      if (x == null || !Number.isFinite(x)) continue;

      let row = byX.get(x);
      if (!row) {
        row = { x };
        byX.set(x, row);
      }
      // Several epochs can collapse onto one growth step or parameter count;
      // the last value in the step is the representative one.
      row[key] = y;
    }
  }

  return [...byX.values()].sort((a, b) => a.x - b.x);
}

/**
 * Where the playback cursor sits, expressed in the chart's x units.
 *
 * `position` is a *timeline index*, which is not the growth step number, so it
 * is translated before being used against any axis. Within a step the cursor
 * interpolates, so it glides across the epoch axis instead of jumping once per
 * growth step.
 */
export function cursorX(position: number, axis: ChartAxis, maps: AxisMaps): number {
  const index = Math.floor(position);
  const fraction = position - index;
  const step = maps.indexToStep[Math.min(index, maps.indexToStep.length - 1)] ?? 0;

  if (axis === "growth_step") return stepAtPosition(position, maps);

  if (axis === "n_params") return paramsAtStep(maps, step) ?? 0;

  const range = maps.stepToEpochs.get(step);
  if (range) {
    const [first, last] = range;
    return first + fraction * (last - first + 1);
  }

  // This step trained nothing, so there is no span to glide across: hold at the
  // last epoch actually reached rather than emitting a growth-step number.
  return epochsAtStep(maps, step)?.[1] ?? 0;
}

export const AXIS_LABELS: Record<ChartAxis, string> = {
  epoch: "epoch",
  growth_step: "growth step",
  n_params: "parameters",
};

export function formatParams(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return String(Math.round(value));
}
