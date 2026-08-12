import {
  Background,
  BackgroundVariant,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useDagLayout } from "../hooks/useDagLayout";
import type { StepDoc } from "../types";
import { GrowingNode, type GrowingNodeData } from "./GrowingNode";

const nodeTypes = { growing: GrowingNode };

interface DagViewProps {
  steps: StepDoc[];
  dagName: string;
  stepIndex: number;
  interactive?: boolean;
  /**
   * Node ids to render as widened on top of the step's own `widened_nodes`.
   * Used to mirror a neighbouring DAG's terminal growth onto this one -- the
   * two are the same tensor, so only marking one side understates the change.
   */
  extraWidened?: string[];
}

/**
 * One GrowingGraphNetwork, rendered at a single growth step.
 *
 * Every node and edge that will *ever* exist is mounted from the start;
 * elements not yet present are simply transparent. Two things fall out of this:
 * `fitView` frames the final architecture once and the camera never drifts as
 * the network grows, and appearing elements animate in place instead of
 * triggering a React Flow re-fit.
 */
const FIT_OPTIONS = { padding: 0.18 };

export function DagView({
  steps,
  dagName,
  stepIndex,
  interactive = false,
  extraWidened,
}: DagViewProps) {
  const layout = useDagLayout(steps, dagName);

  // `fitView` as a prop only frames the graph on mount. Focusing a DAG hands
  // this view a much larger box, and without re-fitting it keeps the transform
  // it was given while it was one cell of the grid -- small and off-centre.
  // Watching the wrapper covers focus, un-focus and plain window resizes alike.
  const flow = useRef<ReactFlowInstance | null>(null);
  const wrapper = useRef<HTMLDivElement | null>(null);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    flow.current = instance;
    instance.fitView(FIT_OPTIONS);
  }, []);

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;

    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      // Re-fit after the browser has settled on the new box, otherwise the fit
      // is computed against the size being animated away from.
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        flow.current?.fitView({ ...FIT_OPTIONS, duration: 220 });
      });
    });

    observer.observe(element);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [layout]);

  // Peak channel count per node, so disc scaling is comparable across steps.
  const maxSizes = useMemo(() => {
    const peaks: Record<string, number> = {};
    for (const step of steps) {
      for (const node of step.dags[dagName]?.nodes ?? []) {
        peaks[node.id] = Math.max(peaks[node.id] ?? 0, node.size);
      }
    }
    return peaks;
  }, [steps, dagName]);

  const globalPeak = useMemo(
    () => Math.max(1, ...Object.values(maxSizes)),
    [maxSizes],
  );

  const current = steps[Math.min(stepIndex, steps.length - 1)]?.dags[dagName];

  // Every edge that ever exists, so each step can be drawn as a subset of a
  // fixed set. Depends only on the run, so it must not be rebuilt whenever the
  // playback cursor moves to another step.
  const allEdges = useMemo(() => {
    const out = new Map<string, { source: string; target: string }>();
    for (const step of steps) {
      for (const edge of step.dags[dagName]?.edges ?? []) {
        out.set(edge.id, { source: edge.source, target: edge.target });
      }
    }
    return out;
  }, [steps, dagName]);

  const { nodes, edges } = useMemo(() => {
    if (!layout) return { nodes: [] as Node[], edges: [] as Edge[] };

    const present = new Map((current?.nodes ?? []).map((n) => [n.id, n]));
    const addedNodes = new Set(current?.added_nodes ?? []);
    const widenedNodes = new Set([
      ...(current?.widened_nodes ?? []),
      ...(extraWidened ?? []),
    ]);
    const previous = stepIndex > 0 ? steps[stepIndex - 1]?.dags[dagName] : undefined;
    const previousSizes = new Map((previous?.nodes ?? []).map((n) => [n.id, n.size]));
    const addedEdges = new Set(current?.added_edges ?? []);
    const updatedEdges = new Set(current?.updated_edges ?? []);
    const presentEdges = new Set((current?.edges ?? []).map((e) => e.id));

    const flowNodes: Node[] = Object.entries(layout.positions).map(([id, position]) => {
      const node = present.get(id);
      const visible = node != null;
      const label = id.split("@")[0];

      const data: GrowingNodeData = {
        label,
        size: node?.size ?? 0,
        maxSize: globalPeak,
        status: addedNodes.has(id)
          ? "added"
          : widenedNodes.has(id)
            ? "widened"
            : "idle",
        isTerminal: label === "start" || label === "end",
        activation: node?.activation ?? null,
        present: visible,
        previousSize: previousSizes.get(id) ?? null,
      };

      return {
        id,
        type: "growing",
        position,
        data,
        draggable: false,
        selectable: false,
        connectable: false,
      } satisfies Node;
    });

    const flowEdges: Edge[] = [...allEdges.entries()].map(([id, edge]) => {
      const visible = presentEdges.has(id);
      const added = addedEdges.has(id);
      const updated = updatedEdges.has(id);
      // Retrained edges stay neutral. gromo refits *every* edge of a graph
      // whenever that graph grows, so colouring them would drown out the few
      // genuinely new connections; a small opacity lift is enough to show which
      // graph was touched. Colour is reserved for added (green) and widened
      // (amber) so each hue means exactly one thing.
      const color = added ? "var(--color-grown)" : "var(--color-idle)";

      return {
        id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        animated: added,
        selectable: false,
        style: {
          stroke: color,
          strokeWidth: added ? 2.6 : 1.2,
          opacity: visible ? (added ? 1 : updated ? 0.42 : 0.28) : 0,
          transition: "opacity 260ms ease, stroke 260ms ease",
        },
      } satisfies Edge;
    });

    return { nodes: flowNodes, edges: flowEdges };
  }, [layout, current, steps, dagName, globalPeak, extraWidened, stepIndex, allEdges]);

  if (!layout) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[var(--color-ink-2)]">
        laying out {dagName}…
      </div>
    );
  }

  return (
    <div ref={wrapper} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={onInit}
        fitView
        fitViewOptions={FIT_OPTIONS}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={interactive}
        zoomOnScroll={interactive}
        zoomOnPinch={interactive}
        zoomOnDoubleClick={false}
        preventScrolling={interactive}
        minZoom={0.1}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1}
          color="var(--color-border)"
        />
      </ReactFlow>
    </div>
  );
}
