import { Handle, Position, type NodeProps } from "@xyflow/react";

import { NODE_SIZE } from "../hooks/useDagLayout";

export interface GrowingNodeData extends Record<string, unknown> {
  label: string;
  size: number;
  /** Largest channel count this node reaches, for relative scaling. */
  maxSize: number;
  status: "added" | "widened" | "idle";
  isTerminal: boolean;
  activation: string | null;
  /** Whether this node exists yet at the current step. */
  present: boolean;
  /** Channel count before this step, when the node widened. */
  previousSize: number | null;
}

const STATUS_FILL: Record<GrowingNodeData["status"], string> = {
  added: "var(--color-grown)",
  widened: "var(--color-updated)",
  idle: "var(--color-idle)",
};

/**
 * A node's *layout box* is fixed; only the inner disc scales with channel
 * count. That keeps the ELK layout valid for every step -- a node that widens
 * never pushes its neighbours around.
 */
export function GrowingNode({ data }: NodeProps) {
  const { label, size, maxSize, status, isTerminal, activation, present, previousSize } =
    data as GrowingNodeData;

  // sqrt so area, not radius, tracks channel count.
  const ratio = maxSize > 0 ? Math.sqrt(size / maxSize) : 0;
  const diameter = Math.max(16, Math.min(NODE_SIZE - 10, 16 + ratio * (NODE_SIZE - 26)));

  const title = !present
    ? `${label} — appears later`
    : status === "widened" && previousSize != null
      ? `${label} — widened ${previousSize} → ${size} channels`
      : `${label} — ${size} channels${activation ? ` — ${activation}` : ""}`;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: NODE_SIZE, height: NODE_SIZE }}
      title={title}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

      {/*
        The footprint ring stays visible even before the node exists: it is how
        the viewer sees that space is being held open for structure still to
        come, which is what makes the fixed camera legible rather than empty.
      */}
      <div
        className="absolute rounded-full border border-dashed"
        style={{
          width: NODE_SIZE - 8,
          height: NODE_SIZE - 8,
          borderColor: "var(--color-idle)",
          opacity: present ? 0.18 : 0.32,
        }}
      />

      {/*
        A widened node only changes diameter, which is far too quiet to catch
        while the animation is running. The halo makes the event legible without
        disturbing the layout.
      */}
      {present && status === "widened" && (
        <div
          className="grow-pulse absolute rounded-full"
          style={{
            width: diameter + 12,
            height: diameter + 12,
            border: "2px solid var(--color-updated)",
            opacity: 0.7,
          }}
        />
      )}

      <div
        className={`flex items-center justify-center rounded-full ${
          status === "added" ? "grow-pulse" : ""
        }`}
        style={{
          width: diameter,
          height: diameter,
          background: STATUS_FILL[status],
          border: isTerminal ? "2px solid var(--color-ink)" : "none",
          opacity: present ? 1 : 0,
          transition:
            "width 300ms ease, height 300ms ease, background 300ms ease, opacity 260ms ease",
        }}
      />

      <span
        className="absolute -bottom-0.5 text-[9px] leading-none font-medium tabular-nums"
        style={{ color: "var(--color-ink-2)", opacity: present ? 1 : 0.35 }}
      >
        {label}
      </span>

      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}
