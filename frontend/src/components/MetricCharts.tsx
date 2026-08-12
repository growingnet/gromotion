import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AXIS_LABELS,
  buildAxisMaps,
  buildChartRows,
  cursorX,
  formatParams,
  type ChartRow,
} from "../lib/chartData";
import type { ChartAxis, RunBundle } from "../types";

const LOSS_SERIES = [
  { key: "training/train loss", label: "train", color: "var(--color-train)" },
  { key: "training/val loss", label: "val", color: "var(--color-val)" },
];

const ACCURACY_SERIES = [
  { key: "training/train accuracy", label: "train", color: "var(--color-train)" },
  { key: "training/val accuracy", label: "val", color: "var(--color-val)" },
];

const AXIS_OPTIONS: ChartAxis[] = ["epoch", "growth_step", "n_params"];

interface MetricChartsProps {
  bundle: RunBundle;
  position: number;
  axis: ChartAxis;
  onAxisChange: (axis: ChartAxis) => void;
}

export function MetricCharts({ bundle, position, axis, onAxisChange }: MetricChartsProps) {
  const maps = useMemo(() => buildAxisMaps(bundle.steps), [bundle.steps]);
  const cursor = cursorX(position, axis, maps);

  const available = useMemo(
    () => new Set(bundle.series.map((s) => s.key)),
    [bundle.series],
  );

  // Memoised so the arrays keep their identity between frames -- they are memo
  // dependencies further down, and a fresh array every render would defeat the
  // row cache that keeps playback cheap.
  const lossKeys = useMemo(
    () => LOSS_SERIES.filter((s) => available.has(s.key)),
    [available],
  );
  const accKeys = useMemo(
    () => ACCURACY_SERIES.filter((s) => available.has(s.key)),
    [available],
  );

  // Some runs log accuracy as a 0-1 fraction, others as a percentage. Label the
  // axis from the data rather than asserting a unit the run may not use.
  const accuracyIsFraction = useMemo(() => {
    const peak = Math.max(
      0,
      ...bundle.series
        .filter((s) => ACCURACY_SERIES.some((a) => a.key === s.key))
        .flatMap((s) => s.points.map(([, y]) => y)),
    );
    return peak > 0 && peak <= 1.5;
  }, [bundle.series]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide uppercase text-[var(--color-ink-2)]">
          Training
        </h2>
        <div
          className="flex items-center gap-0.5 rounded-md border p-0.5 text-[11px]"
          style={{ borderColor: "var(--color-border)" }}
          role="group"
          aria-label="Chart x-axis"
        >
          <span className="px-1.5 text-[var(--color-ink-2)]">x:</span>
          {AXIS_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onAxisChange(option)}
              className="cursor-pointer rounded px-2 py-0.5 transition-colors"
              style={{
                background: axis === option ? "var(--color-ink)" : "transparent",
                color: axis === option ? "var(--color-surface)" : "var(--color-ink-2)",
              }}
            >
              {AXIS_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      <MetricChart
        title="Loss"
        bundle={bundle}
        series={lossKeys}
        axis={axis}
        maps={maps}
        cursor={cursor}
        logY
      />
      <MetricChart
        title={accuracyIsFraction ? "Accuracy" : "Accuracy (%)"}
        bundle={bundle}
        series={accKeys}
        axis={axis}
        maps={maps}
        cursor={cursor}
      />
    </div>
  );
}

interface MetricChartProps {
  title: string;
  bundle: RunBundle;
  series: { key: string; label: string; color: string }[];
  axis: ChartAxis;
  maps: ReturnType<typeof buildAxisMaps>;
  cursor: number;
  /** Draw the y-axis on a log scale. Ignored if the data is not strictly positive. */
  logY?: boolean;
}

/** Compact tick labels for a log axis, which spans several orders of magnitude. */
function formatLogTick(value: number): string {
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude < 0.01 || magnitude >= 10000) return value.toExponential(0);
  return String(Number(value.toPrecision(2)));
}

/**
 * Each series is drawn twice: the full curve faintly, and the portion up to the
 * playback cursor at full strength. Drawing the whole curve keeps the axis
 * domain fixed, so the plot never rescales mid-playback -- a progressive reveal
 * that also grows its own axes is very hard to read.
 */
function MetricChart({ title, bundle, series, axis, maps, cursor, logY }: MetricChartProps) {
  // The full curves never change during playback, so build them once per run.
  const base = useMemo(
    () =>
      buildChartRows(
        bundle,
        series.map((s) => s.key),
        axis,
        maps,
      ),
    [bundle, series, axis, maps],
  );

  // The reveal only changes when the cursor crosses a data point, but the
  // cursor moves every animation frame. Snapping the dependency to the number
  // of revealed points rebuilds these rows a few dozen times per run instead of
  // sixty times a second -- which is what made playback drag as the revealed
  // section (and so the work per frame) grew towards the end.
  const revealed = useMemo(() => {
    let count = 0;
    while (count < base.length && base[count].x <= cursor) count++;
    return count;
  }, [base, cursor]);

  const rows = useMemo(
    () =>
      base.map((row, index) => {
        if (index >= revealed) return row;
        const next: ChartRow = { ...row };
        for (const s of series) {
          if (row[s.key] != null) next[`${s.key}__past`] = row[s.key];
        }
        return next;
      }),
    [base, revealed, series],
  );

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border text-xs text-[var(--color-ink-2)]"
        style={{ borderColor: "var(--color-border)" }}>
        no {title.toLowerCase()} series in this run
      </div>
    );
  }

  const formatX = axis === "n_params" ? formatParams : (v: number) => String(Math.round(v));

  // A log axis cannot render zero or negative values, and loss legitimately
  // reaches 0 in some runs, so fall back to linear rather than blanking the
  // chart. Only plotted series are checked -- an unrelated series hitting 0
  // should not cost this chart its log scale.
  const logScale =
    logY &&
    rows.some((row) => series.some((s) => typeof row[s.key] === "number")) &&
    rows.every((row) =>
      series.every((s) => {
        const value = row[s.key];
        return typeof value !== "number" || value > 0;
      }),
    );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col rounded-lg border p-2"
      style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}
    >
      <div className="mb-1 flex shrink-0 items-baseline justify-between">
        <span className="text-[11px] font-medium">{title}</span>
        <span className="flex gap-2 text-[10px] text-[var(--color-ink-2)]">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1">
              <span
                className="inline-block h-[2px] w-3 rounded"
                style={{ background: s.color }}
              />
              {s.label}
            </span>
          ))}
        </span>
      </div>

      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 2, left: -18 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" />
            <XAxis
              dataKey="x"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={formatX}
              tick={{ fontSize: 10, fill: "var(--color-ink-2)" }}
              stroke="var(--color-border)"
            />
            <YAxis
              scale={logScale ? "log" : "auto"}
              domain={logScale ? ["auto", "auto"] : undefined}
              allowDataOverflow={false}
              tickFormatter={logScale ? formatLogTick : undefined}
              tick={{ fontSize: 10, fill: "var(--color-ink-2)" }}
              stroke="var(--color-border)"
              width={44}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                fontSize: 11,
              }}
              labelFormatter={(value) => `${AXIS_LABELS[axis]} ${formatX(Number(value))}`}
              formatter={(value, name) => [
                typeof value === "number" ? value.toFixed(3) : String(value ?? ""),
                String(name).replace("__past", ""),
              ]}
            />

            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                stroke={s.color}
                strokeOpacity={0.22}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
            {series.map((s) => (
              <Line
                key={`${s.key}__past`}
                dataKey={`${s.key}__past`}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}

            <ReferenceLine
              x={cursor}
              stroke="var(--color-ink)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
