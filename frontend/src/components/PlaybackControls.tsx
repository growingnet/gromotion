import { usePlayback } from "../store/playback";
import { formatParams } from "../lib/chartData";
import type { StepDoc } from "../types";

const SPEEDS = [0.5, 1, 2, 4, 8];

interface PlaybackControlsProps {
  steps: StepDoc[];
}

export function PlaybackControls({ steps }: PlaybackControlsProps) {
  const { position, maxStep, playing, speed, setPosition, setSpeed, toggle, stepBy, restart } =
    usePlayback();

  const index = Math.min(Math.floor(position), steps.length - 1);
  const current = steps[index];

  // The slider addresses the timeline by index, but the label must show the
  // run's own growth-step number: runs open with a pre-growth baseline at
  // step -1, so index and step differ.
  const stepNumber = current?.step ?? index;
  const lastStep = steps[steps.length - 1]?.step ?? 0;

  const added =
    current != null &&
    Object.values(current.dags).some(
      (g) => g.added_nodes.length > 0 || g.added_edges.length > 0,
    );
  const widened =
    current != null &&
    Object.values(current.dags).some((g) => g.widened_nodes.length > 0);

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-3 rounded-lg border px-3 py-2"
      style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}
    >
      <div className="flex items-center gap-1">
        <ControlButton onClick={() => stepBy(-1)} label="Previous step">
          ◀◀
        </ControlButton>
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="w-16 cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-85"
          style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <ControlButton onClick={() => stepBy(1)} label="Next step">
          ▶▶
        </ControlButton>
        <ControlButton onClick={restart} label="Restart">
          ↻
        </ControlButton>
      </div>

      <div className="flex min-w-[220px] flex-1 items-center gap-2">
        <input
          type="range"
          min={0}
          max={Math.max(maxStep, 0.001)}
          step={0.01}
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          aria-label="Growth step"
          className="h-1 flex-1 cursor-pointer accent-[var(--color-grown)]"
        />
        <span className="w-28 shrink-0 text-right text-xs tabular-nums">
          step{" "}
          <strong
            style={{
              color: added
                ? "var(--color-grown)"
                : widened
                  ? "var(--color-updated)"
                  : "inherit",
            }}
          >
            {stepNumber < 0 ? "init" : stepNumber}
          </strong>
          <span className="text-[var(--color-ink-2)]"> / {lastStep}</span>
        </span>
      </div>

      <div className="flex items-center gap-1 text-[11px]">
        <span className="text-[var(--color-ink-2)]">speed</span>
        {SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setSpeed(value)}
            className="cursor-pointer rounded px-1.5 py-0.5 tabular-nums transition-colors"
            style={{
              background: speed === value ? "var(--color-ink)" : "transparent",
              color: speed === value ? "var(--color-surface)" : "var(--color-ink-2)",
            }}
          >
            {value}×
          </button>
        ))}
      </div>

      <div className="flex gap-3 text-[11px] tabular-nums text-[var(--color-ink-2)]">
        {current?.n_params != null && (
          <span>
            params <strong className="text-[var(--color-ink)]">{formatParams(current.n_params)}</strong>
          </span>
        )}
        {current?.epoch_range && (
          <span>
            epoch{" "}
            <strong className="text-[var(--color-ink)]">
              {current.epoch_range[0]}–{current.epoch_range[1]}
            </strong>
          </span>
        )}
      </div>
    </div>
  );
}

function ControlButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="cursor-pointer rounded-md border px-2 py-1.5 text-[10px] transition-colors hover:bg-[var(--color-surface)]"
      style={{ borderColor: "var(--color-border)", color: "var(--color-ink-2)" }}
    >
      {children}
    </button>
  );
}
