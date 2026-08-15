import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { DagGrid } from "../components/DagGrid";
import { MethodExplainer } from "../components/MethodExplainer";
import { MetricCharts } from "../components/MetricCharts";
import { PlaybackControls } from "../components/PlaybackControls";
import { RunSelector } from "../components/RunSelector";
import { SiteHeader } from "../components/SiteHeader";
import { fetchRunBundle, listRuns } from "../lib/api";
import { usePlayback, usePlaybackClock, usePlaybackKeys } from "../store/playback";
import type { ChartAxis } from "../types";

/**
 * Deep-link state: ?run=…&step=…&axis=…&play=1
 * Lets a specific growth step be linked directly from slides or a paper.
 */
function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const step = Number(params.get("step"));
  return {
    run: params.get("run"),
    step: Number.isFinite(step) && params.get("step") ? step : null,
    axis: (params.get("axis") as ChartAxis | null) ?? null,
    play: params.get("play") === "1",
  };
}

export function Player() {
  usePlaybackClock();
  usePlaybackKeys();

  const initial = useRef(readUrlState()).current;
  const [selectedRun, setSelectedRun] = useState<string | null>(initial.run);
  const [axis, setAxis] = useState<ChartAxis>(initial.axis ?? "epoch");
  const setMaxStep = usePlayback((state) => state.setMaxStep);
  const setPosition = usePlayback((state) => state.setPosition);
  const pause = usePlayback((state) => state.pause);
  const play = usePlayback((state) => state.play);
  const position = usePlayback((state) => state.position);

  const runsQuery = useQuery({ queryKey: ["runs"], queryFn: listRuns });

  useEffect(() => {
    if (!selectedRun && runsQuery.data?.length) {
      setSelectedRun(runsQuery.data[0].run_id);
    }
  }, [runsQuery.data, selectedRun]);

  const bundleQuery = useQuery({
    queryKey: ["bundle", selectedRun],
    queryFn: () => fetchRunBundle(selectedRun as string),
    enabled: Boolean(selectedRun),
  });

  const bundle = bundleQuery.data;

  // Reset the transport whenever a different run loads, honouring any
  // step/play requested in the URL the first time round.
  const appliedInitial = useRef(false);
  useEffect(() => {
    if (!bundle) return;
    setMaxStep(Math.max(0, bundle.steps.length - 1));

    if (!appliedInitial.current && initial.run === bundle.run.run_id) {
      appliedInitial.current = true;
      // ?step= names a growth step, which is not the timeline index (runs open
      // with a pre-growth baseline at step -1), so resolve it against the data.
      const index =
        initial.step == null
          ? 0
          : Math.max(0, bundle.steps.findIndex((s) => s.step === initial.step));
      setPosition(index);
      if (initial.play) play();
      return;
    }
    pause();
    setPosition(0);
  }, [bundle, pause, play, setPosition, setMaxStep, initial]);

  // Keep the URL in sync with run + axis so the view is shareable. The hash
  // carries the route, so it has to be written back or the player would
  // navigate itself to the landing page on the first state change.
  useEffect(() => {
    if (!selectedRun) return;
    const params = new URLSearchParams(window.location.search);
    params.set("run", selectedRun);
    params.set("axis", axis);
    window.history.replaceState(null, "", `?${params.toString()}${window.location.hash}`);
  }, [selectedRun, axis]);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <SiteHeader current="player">
        {runsQuery.data && runsQuery.data.length > 0 && (
          <RunSelector
            runs={runsQuery.data}
            selected={selectedRun}
            onSelect={setSelectedRun}
          />
        )}
      </SiteHeader>

      <MethodExplainer />

      {runsQuery.isError && (
        <Notice tone="error">
          Could not reach the API. Is the backend running on port 8000?
          <div className="mt-1 font-mono text-[11px] opacity-80">
            {String(runsQuery.error)}
          </div>
        </Notice>
      )}

      {runsQuery.isSuccess && runsQuery.data.length === 0 && (
        <Notice>
          No runs ingested yet. From <code>backend/</code> run{" "}
          <code>uv run python -m ingest demo</code> to load a synthetic run, or{" "}
          <code>uv run python -m ingest wandb --entity … --project … --run …</code>{" "}
          for a real one.
        </Notice>
      )}

      {bundleQuery.isLoading && <Notice>Loading run…</Notice>}

      {bundle && bundle.steps.length > 0 && (
        <>
          <main className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.35fr_1fr]">
            <section className="flex min-h-0 flex-col gap-2">
              <h2 className="shrink-0 text-xs font-semibold tracking-wide uppercase text-[var(--color-ink-2)]">
                Architecture
              </h2>
              <div className="min-h-0 flex-1">
                <DagGrid
                  steps={bundle.steps}
                  dagNames={bundle.run.dag_names}
                  stepIndex={Math.floor(position)}
                />
              </div>
            </section>

            <section className="min-h-0">
              <MetricCharts
                bundle={bundle}
                position={position}
                axis={axis}
                onAxisChange={setAxis}
              />
            </section>
          </main>

          <PlaybackControls steps={bundle.steps} />
        </>
      )}
    </div>
  );
}

function Notice({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "error";
}) {
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs"
      style={{
        background: "var(--color-surface-2)",
        borderColor: tone === "error" ? "var(--color-val)" : "var(--color-border)",
        color: "var(--color-ink-2)",
      }}
    >
      {children}
    </div>
  );
}
