import { useState } from "react";

/**
 * Short orientation for viewers who have never seen gromo. Collapsible, because
 * once you know how to read the animation it should get out of the way.
 */
export function MethodExplainer() {
  const [open, setOpen] = useState(true);

  return (
    <section
      className="shrink-0 rounded-lg border"
      style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold tracking-wide uppercase text-[var(--color-ink-2)]">
          How to read this
        </span>
        <span className="text-[10px] text-[var(--color-ink-2)]">{open ? "hide" : "show"}</span>
      </button>

      {open && (
        <div className="grid gap-4 px-3 pt-1 pb-3 text-[12px] leading-relaxed sm:grid-cols-3">
          <div>
            <p className="mb-1 font-semibold">Networks that grow</p>
            <p className="text-[var(--color-ink-2)]">
              Instead of fixing an architecture up front, <strong>gromo</strong> starts
              from a minimal network and adds capacity during training. At each{" "}
              <em>growth step</em> it measures where the model is held back by its own
              size — the <em>expressivity bottleneck</em> — and adds neurons exactly
              there.
            </p>
          </div>

          <div>
            <p className="mb-1 font-semibold">What you are looking at</p>
            <p className="text-[var(--color-ink-2)]">
              Each panel is one growing sub-network: a directed graph from{" "}
              <code>start</code> to <code>end</code>. A <strong>node</strong> is a layer
              and its disc scales with channel count; an <strong>edge</strong> is a
              convolution between layers. Faint dashed rings mark space reserved for
              structure that appears later.
            </p>
          </div>

          <div>
            <p className="mb-1 font-semibold">Colour</p>
            <p className="mb-1 text-[var(--color-ink-2)]">
              A network grows two ways, and each has its own colour:
            </p>
            <ul className="space-y-1 text-[var(--color-ink-2)]">
              <Legend color="var(--color-grown)">
                <strong>new structure</strong> — a node or connection that did not
                exist before
              </Legend>
              <Legend color="var(--color-updated)">
                <strong>widened</strong> — an existing node gained channels. Same
                topology, more capacity; the halo marks the step it happened.
              </Legend>
              <Legend color="var(--color-idle)">
                unchanged. Edges of a graph that grew are all refit, so they brighten
                slightly without taking on a colour of their own.
              </Legend>
            </ul>
            <p className="mt-2 text-[var(--color-ink-2)]">
              The panel border picks up the colour of whichever happened.
            </p>
            <p className="mt-2 text-[var(--color-ink-2)]">
              Switch the chart x-axis to <strong>parameters</strong> to see accuracy
              plotted against model size rather than time.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className="mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span>{children}</span>
    </li>
  );
}
