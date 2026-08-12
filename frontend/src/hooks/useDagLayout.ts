import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { useEffect, useMemo, useState } from "react";

import type { StepDoc } from "../types";

/** Fixed layout footprint per node. */
export const NODE_SIZE = 64;

export interface DagLayout {
  positions: Record<string, { x: number; y: number }>;
  width: number;
  height: number;
}

const elk = new ELK();

/**
 * Layout the *union* of every step's graph, once.
 *
 * This is the single most important decision in the visualization. If layout
 * were recomputed per step, adding one node would shift every other node and
 * the eye would lose track of what actually changed -- the growth would read as
 * noise. By laying out the final (largest) graph up front and rendering each
 * step as a subset of those fixed positions, existing structure stays nailed
 * in place and new nodes visibly appear in the gap reserved for them.
 *
 * Node boxes are a constant size for the same reason: channel count is shown by
 * scaling an inner disc, so a widening node never perturbs the layout.
 */
export function useDagLayout(steps: StepDoc[], dagName: string): DagLayout | null {
  const union = useMemo(() => {
    const nodeIds = new Set<string>();
    const edges = new Map<string, { source: string; target: string }>();

    for (const step of steps) {
      const graph = step.dags[dagName];
      if (!graph) continue;
      for (const node of graph.nodes) nodeIds.add(node.id);
      for (const edge of graph.edges) {
        edges.set(edge.id, { source: edge.source, target: edge.target });
      }
    }
    return {
      nodeIds: [...nodeIds],
      edges: [...edges.entries()].map(([id, e]) => ({ id, ...e })),
    };
  }, [steps, dagName]);

  const [layout, setLayout] = useState<DagLayout | null>(null);

  useEffect(() => {
    if (union.nodeIds.length === 0) {
      setLayout(null);
      return;
    }
    let cancelled = false;

    const graph: ElkNode = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        // Left-to-right reads as data flow from `start` to `end`.
        "elk.direction": "RIGHT",
        "elk.layered.spacing.nodeNodeBetweenLayers": "90",
        "elk.spacing.nodeNode": "36",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.layered.crossingMinimization.semiInteractive": "true",
      },
      children: union.nodeIds.map((id) => ({
        id,
        width: NODE_SIZE,
        height: NODE_SIZE,
      })),
      edges: union.edges.map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
    };

    elk
      .layout(graph)
      .then((result) => {
        if (cancelled) return;
        const positions: Record<string, { x: number; y: number }> = {};
        for (const child of result.children ?? []) {
          positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
        }
        setLayout({
          positions,
          width: result.width ?? 0,
          height: result.height ?? 0,
        });
      })
      .catch((error) => {
        console.error(`ELK layout failed for ${dagName}:`, error);
      });

    return () => {
      cancelled = true;
    };
  }, [union, dagName]);

  return layout;
}
