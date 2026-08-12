import { useMemo, useState } from "react";

import type { StepDoc } from "../types";
import { DagView } from "./DagView";

interface DagGridProps {
  steps: StepDoc[];
  dagNames: string[];
  stepIndex: number;
}

/**
 * Column count for an arbitrary number of DAGs.
 *
 * The model currently has four graphs, but deeper architectures for harder
 * datasets will have more, so nothing here is hard-coded to four -- the grid
 * stays roughly square as the count grows.
 */
function columnsFor(count: number): number {
  if (count <= 1) return 1;
  if (count <= 2) return 2;
  if (count <= 6) return Math.ceil(count / 2);
  return Math.ceil(Math.sqrt(count));
}

export function DagGrid({ steps, dagNames, stepIndex }: DagGridProps) {
  const [focused, setFocused] = useState<string | null>(null);

  const current = steps[Math.min(stepIndex, steps.length - 1)];
  const visible = focused ? [focused] : dagNames;
  const columns = columnsFor(visible.length);

  /**
   * The DAGs are chained: `end` of one graph is physically the same tensor as
   * `start` of the next, so widening one widens both. Only the graph that was
   * grown records it, which reads as a one-sided change. Mirror it onto the
   * neighbour so the hand-off is visible on both sides.
   */
  const pairedWidened = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (let i = 0; i < dagNames.length - 1; i++) {
      const graph = current?.dags[dagNames[i]];
      if (!graph?.widened_nodes.some((id) => id.split("@")[0] === "end")) continue;

      const next = dagNames[i + 1];
      const startId = current?.dags[next]?.nodes.find(
        (n) => n.id.split("@")[0] === "start",
      )?.id;
      if (startId) out[next] = [startId];
    }
    return out;
  }, [current, dagNames]);

  const stats = useMemo(() => {
    const out: Record<
      string,
      { nodes: number; edges: number; channels: number; added: boolean; widened: boolean }
    > = {};
    for (const name of dagNames) {
      const graph = current?.dags[name];
      out[name] = {
        nodes: graph?.nodes.length ?? 0,
        edges: graph?.edges.length ?? 0,
        channels: graph?.nodes.reduce((sum, n) => sum + n.size, 0) ?? 0,
        added: (graph?.added_nodes.length ?? 0) + (graph?.added_edges.length ?? 0) > 0,
        widened:
          (graph?.widened_nodes.length ?? 0) + (pairedWidened[name]?.length ?? 0) > 0,
      };
    }
    return out;
  }, [current, dagNames, pairedWidened]);

  return (
    <div
      className="grid h-full min-h-0 gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {visible.map((name) => {
        const stat = stats[name];
        return (
          <button
            key={name}
            type="button"
            onClick={() => setFocused(focused === name ? null : name)}
            title={focused ? "Click to show all graphs" : "Click to focus this graph"}
            className="group relative flex min-h-0 min-w-0 cursor-pointer flex-col overflow-hidden rounded-lg border text-left transition-colors"
            style={{
              background: "var(--color-surface-2)",
              borderColor: stat?.added
                ? "var(--color-grown)"
                : stat?.widened
                  ? "var(--color-updated)"
                  : "var(--color-border)",
            }}
          >
            <div className="flex shrink-0 items-baseline justify-between px-3 pt-2 pb-1">
              <span className="text-xs font-semibold tracking-wide">{name}</span>
              <span className="text-[10px] tabular-nums text-[var(--color-ink-2)]">
                {stat?.nodes ?? 0} nodes · {stat?.edges ?? 0} edges ·{" "}
                {stat?.channels ?? 0} ch
              </span>
            </div>

            <div className="min-h-0 flex-1">
              <DagView
                steps={steps}
                dagName={name}
                stepIndex={stepIndex}
                interactive={focused === name}
                extraWidened={pairedWidened[name]}
              />
            </div>

            <span className="pointer-events-none absolute right-2 bottom-2 rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-2)] opacity-0 transition-opacity group-hover:opacity-100">
              {focused === name ? "show all" : "focus"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
