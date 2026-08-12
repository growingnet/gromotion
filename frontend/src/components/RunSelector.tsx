import type { RunSummary } from "../types";

interface RunSelectorProps {
  runs: RunSummary[];
  selected: string | null;
  onSelect: (runId: string) => void;
}

export function RunSelector({ runs, selected, onSelect }: RunSelectorProps) {
  const active = runs.find((run) => run.run_id === selected);

  return (
    <div className="flex items-center gap-3">
      <label htmlFor="run-select" className="text-[11px] text-[var(--color-ink-2)]">
        run
      </label>
      <select
        id="run-select"
        value={selected ?? ""}
        onChange={(event) => onSelect(event.target.value)}
        className="cursor-pointer rounded-md border px-2 py-1 text-xs"
        style={{
          background: "var(--color-surface-2)",
          borderColor: "var(--color-border)",
          color: "var(--color-ink)",
        }}
      >
        {runs.map((run) => (
          <option key={run.run_id} value={run.run_id}>
            {run.name} ({run.run_id})
          </option>
        ))}
      </select>

      {active && (
        <span className="hidden gap-3 text-[11px] tabular-nums text-[var(--color-ink-2)] sm:flex">
          {active.dataset && <span>{active.dataset}</span>}
          <span>{active.dag_names.length} graphs</span>
          <span>{active.n_steps} growth steps</span>
        </span>
      )}
    </div>
  );
}
