# Ingest

Offline, one-off tool that turns a saved gromo run into the MongoDB documents
the web app serves. **Run it by hand.** The web app never imports this package
and holds no wandb credentials.

```
   wandb run ──┐
               ├──► ingest ──► MongoDB
 export folder ┘         └───► export folder (--dump-dir)
```

Re-ingesting a run replaces it, so ingest is idempotent.

---

## From wandb

Requires `WANDB_API_KEY` or `~/.netrc`.

```bash
cd backend
uv sync --extra ingest
uv run python -m ingest wandb --entity YOUR_ENTITY --project Sunset --run cn0e5zl3
```

This reads, for one run:

| what | from |
| --- | --- |
| metric history | `run.scan_history()`, using the `epoch` / `growth step` columns the logger writes as the x-axis |
| DAG snapshots | artifacts named `graph_<dag>_<run_id>`, each tagged `metadata={"step": …}` |
| growth diffs | the `growth_history_<run_id>` artifact (`gh.json`) |

## From an export folder

Add `--dump-dir` to any ingest command to also write a self-contained folder:

```bash
uv run python -m ingest wandb --entity ME --project Sunset --run cn0e5zl3 \
    --dump-dir ../exports/cn0e5zl3
```

That folder can be committed, shared, or replayed anywhere, with no wandb
dependency:

```bash
uv run python -m ingest folder ../exports/cn0e5zl3
```

```
exports/<run>/
  run.json                          metadata + config
  metrics.json                      {metric_key: [[x, y], …]}
  metric_axes.json                  {metric_key: "epoch" | "growth_step"}
  dags/<dag_name>/step_<NNNN>.json  export_dag_parameters() per exported step
  growth_history/<dag_name>.json    {step: {key: 0|1|2}}
```

> **Why the step is in the filename.** Artifact `metadata={"step": …}` lives in
> wandb's server-side record, not in the downloaded files, and versions are cut
> only when content changes — so version index ≠ growth step. The export layout
> writes the step down explicitly.

## A synthetic run

```bash
uv run python -m ingest demo
```

No wandb, no export folder — useful for checking the app end to end.

---

## Writing to a remote database

**Pass `--mongo-uri` explicitly.** `backend/.env` is not read here — that file
holds the app's *read-only* credential, and ingest needs write access. Without
the flag the CLI falls back to `$MONGO_URI` and then to
`mongodb://localhost:27017`, so a forgotten flag writes to a local mongo rather
than to your cluster.

Keep the two credentials separate — the read-write one should never live in the
server's environment:

```bash
# Paste the readWrite connection string; nothing echoes or lands in shell history.
read -rs MONGO_RW_URI
uv run python -m ingest folder ../exports/cn0e5zl3 \
    --mongo-uri "$MONGO_RW_URI" --mongo-db gromotion
```

| user | role | used by |
| --- | --- | --- |
| app | `read` on the showcase DB | FastAPI backend |
| ingest | `readWrite` on the showcase DB | this tool, from your machine |

On Atlas the built-in roles are cluster-wide; scoping to one database is done
under **Specific Privileges** when creating the user (leave *Collection* empty
so it covers all collections), or via
`atlas dbusers create --role read@gromotion`.

---

## Other flags

| flag | effect |
| --- | --- |
| `--mongo-db` | target database (default `gromotion`) |
| `--dump-dir` | also write an export folder |
| `--no-write` | skip MongoDB entirely; useful with `--dump-dir` |
| `--keep-all-series` | keep verbose per-neuron diagnostic series, dropped by default |
| `--cache-dir` | where wandb artifacts are downloaded (`wandb` only, default `.wandb_ingest_cache`) |

---

## Data quirks worth knowing

Properties of real gromo/wandb runs that the ingester has to work around. Each
one produced a visible bug before it was handled.

**A snapshot's step is when that state *stopped* being current.** The graph
artifact is logged every step, but wandb does not cut a new version when the
content is identical, so a version's `step` metadata marks the last step that
state was current — not the first. Read literally, every DAG appears to grow
three steps late and in the wrong order: dag1 grows at step 0 but is stamped 3,
while dag2 already has an (ungrown) export stamped 0. `align_snapshots_to_growth`
inverts this — consecutive versions partition the run, so a snapshot stamped `S`
became current one step after the previous stamp. That is derived from the
stamps alone, which matters because a DAG's content also changes *off-turn*:
`end@dagN` widens whenever its neighbour grows.

**The first and last nodes always exist.** Every DAG starts as `start → end`
joined by one convolution; growth only inserts nodes between them. A DAG that
had already grown by its first export has no versioned opening state, so
`terminal_baseline` reconstructs it — otherwise that DAG blinks into existence
mid-run instead of being on screen from the start.

**A metric's name does not tell you its axis.** `complexity/nb of parameters`
reads like a growth-step quantity but is logged with `step_name="epoch"`. The
ingester records the axis each metric was *observed* on and stores it in
`metric_axes.json`; name-based classification is only a fallback. Points
carrying no axis column at all — the `time/*` profiling timers — are dropped
rather than guessed at. Falling back to wandb's internal `_step` counter once
turned a 60-step run into a 2331-step one.

**`growth_history` cannot be trusted for what was added.** It records candidate
expansion ids such as `1@dag1_a` and `2@dag1_b`, which are renamed before they
land in the graph — and are frequently rejected outright, so its "added" flags
routinely name nodes that appear in no snapshot. Additions come from diffing
consecutive snapshots; the history is used only for which edges were refit, and
for which DAG had its turn at which step.

**Growth is not only structural.** Widening an existing node raises its channel
count without touching the topology, so a purely structural diff misses it. In
the multnist run, 6 of 13 growth events are widenings.

**Every edge is "retrained" on a growth step.** `update_growth_history` sets
`neurons_updated = list(self.dag.edges)`, so highlighting retrained edges
drowns out the few genuinely new ones.

**The run does not end when growth does.** Once no actions are found the loop
keeps spinning without training an epoch, and the pipeline then runs one long
post-loop fit that wandb logs against the *final* growth step — in the multnist
runs, 36 idle steps followed by 100 epochs stamped at step 59.
`_truncate_at_training_gap` ends the timeline at the first break in epoch
coverage and trims the series to match, so both axes stop together. Everything
dropped is post-growth by construction.

**Step number ≠ timeline index.** Runs open with a pre-growth baseline logged at
step `-1`, so the timeline is offset by one. Playback addresses the timeline by
index; anything user-facing reads `step`.

---

## Tests

```bash
cd backend && uv run --extra dev pytest tests -q
```

Covers the parts that are easy to get subtly wrong: sparse snapshots
forward-filled across steps, additions surviving candidate ids in
`growth_history`, widening without topology change, observed-axis precedence,
epoch-range accumulation, and parameter counts resolved from either axis.
