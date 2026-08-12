"""Turn raw gromo/wandb run artifacts into the documents the API serves.

Inputs (whatever a source can provide):
  * ``graph_params_dagN.json``  -- ``GrowableDAG.export_dag_parameters()`` output,
    one file per DAG per growth step at which that DAG actually grew.
  * ``gh.json``                 -- ``growing_dag.growth_history``, a dict of
    ``{step: {"('a','b')": 0|1|2, "node": 0|2}}`` where 2 = added and
    1 = weights updated.
  * metric history              -- ``{key: [(x, y), ...]}`` per logged metric.

Four details drive most of the code here:

1. A DAG artifact is only versioned on steps where that DAG grew, so snapshots
   are sparse. Each snapshot is placed at its recorded step and forward-filled,
   so every step has a complete picture of every DAG.
2. Additions are derived by diffing consecutive snapshots, *not* from
   ``growth_history``. The history records candidate expansion ids such as
   ``"1@dag1_a"`` that are renamed before they land in the graph, so its
   "added" flags routinely name nodes that appear in no snapshot. It is also
   written only for the DAG being grown, covering a few steps per run. It is
   therefore used for one thing only: which edges were refit.
3. Growth is not only structural. Widening an existing node (raising its
   channel count) leaves the topology identical, so it is detected separately
   by comparing per-node sizes.
4. Step numbers are not timeline indices. Runs open with a pre-growth baseline
   logged at step -1, so consumers must read ``step`` rather than assuming it
   equals a position in the list.
"""

from __future__ import annotations

import ast
import re
from typing import Any, Iterable

# Metric prefixes logged against the epoch axis rather than the growth step.
# Only a *fallback* for sources that cannot report the axis they observed --
# `complexity/nb of parameters` in particular reads like a growth-step quantity
# but the pipeline logs it per epoch, so name-based guessing is unreliable.
_EPOCH_AXIS_PREFIXES = ("training/",)
_EPOCH_AXIS_EXACT_RE = re.compile(
    r"^complexity/((size|in-degree|out-degree)/node |nb of parameters)"
)

# Series that are noisy per-node diagnostics; kept out of the default bundle to
# keep the payload small. Anything matching is dropped unless keep_all is set.
_VERBOSE_RE = re.compile(
    r"^(neurons/|growth/(foi|foi_bott|neuron_foi_bott_hist|neuron_foi_loss_hist|desired update)/)"
)


def axis_for_metric(key: str) -> str:
    """Which x-axis a logged metric belongs to."""
    if key.startswith(_EPOCH_AXIS_PREFIXES) or _EPOCH_AXIS_EXACT_RE.match(key):
        return "epoch"
    return "growth_step"


def strip_dag_suffix(node_id: str) -> str:
    """``"1@dag1"`` -> ``"1"``; ids without a suffix pass through."""
    return node_id.split("@", 1)[0]


def edge_id(source: str, target: str) -> str:
    return f"{source}->{target}"


def parse_history_key(key: str) -> tuple[str, str] | str:
    """growth_history keys are either a node name or ``repr((src, dst))``."""
    if key.startswith("(") and key.endswith(")"):
        try:
            value = ast.literal_eval(key)
        except (ValueError, SyntaxError):
            return key
        if isinstance(value, tuple) and len(value) == 2:
            return (str(value[0]), str(value[1]))
    return key


def snapshot_from_dag_params(params: dict[str, Any]) -> dict[str, Any]:
    """Convert ``export_dag_parameters()`` output into a GraphSnapshot dict."""
    node_attrs: dict[str, dict] = params.get("node_attributes", {}) or {}
    edge_attrs_raw: dict[str, dict] = params.get("edge_attributes", {}) or {}

    # Edge attribute keys are repr'd tuples; re-key them by (src, dst).
    edge_attrs: dict[tuple[str, str], dict] = {}
    for raw_key, attrs in edge_attrs_raw.items():
        parsed = parse_history_key(raw_key)
        if isinstance(parsed, tuple):
            edge_attrs[parsed] = attrs or {}

    nodes = []
    for node_id, attrs in node_attrs.items():
        attrs = attrs or {}
        nodes.append(
            {
                "id": node_id,
                "label": strip_dag_suffix(node_id),
                "size": int(attrs.get("size", 0) or 0),
                "type": attrs.get("type", "convolution"),
                "activation": attrs.get("activation"),
                "shape": list(attrs["shape"]) if attrs.get("shape") else None,
                "kernel_size": (
                    list(attrs["kernel_size"]) if attrs.get("kernel_size") else None
                ),
                "use_layer_norm": attrs.get("use_layer_norm"),
            }
        )

    edges = []
    for pair in params.get("edges", []) or []:
        source, target = str(pair[0]), str(pair[1])
        attrs = edge_attrs.get((source, target), {})
        edges.append(
            {
                "id": edge_id(source, target),
                "source": source,
                "target": target,
                "type": attrs.get("type", "convolution"),
                "use_bias": attrs.get("use_bias"),
                "kernel_size": (
                    list(attrs["kernel_size"]) if attrs.get("kernel_size") else None
                ),
            }
        )

    return {
        "nodes": nodes,
        "edges": edges,
        "added_nodes": [],
        "added_edges": [],
        "widened_nodes": [],
        "updated_edges": [],
    }


def diff_snapshots(
    previous: dict[str, Any] | None, current: dict[str, Any]
) -> tuple[list[str], list[str], list[str]]:
    """What changed between two snapshots: added nodes, added edges, widened nodes.

    gromo grows a network two ways: by adding new nodes and connections, and by
    widening an existing node (raising its channel count). Widening leaves the
    topology untouched, so a purely structural diff misses it entirely -- yet it
    is just as much a growth event, and in some runs the more common one.
    """
    if previous is None:
        # First appearance of a DAG: everything is structural context, not a
        # growth event. Highlighting the entire initial graph would wash out
        # the actual growth signal.
        return [], [], []

    prev_nodes = {n["id"] for n in previous["nodes"]}
    prev_edges = {e["id"] for e in previous["edges"]}
    prev_sizes = {n["id"]: n["size"] for n in previous["nodes"]}

    added_nodes = [n["id"] for n in current["nodes"] if n["id"] not in prev_nodes]
    added_edges = [e["id"] for e in current["edges"] if e["id"] not in prev_edges]
    widened_nodes = [
        n["id"]
        for n in current["nodes"]
        if n["id"] in prev_sizes and n["size"] > prev_sizes[n["id"]]
    ]
    return added_nodes, added_edges, widened_nodes


def diff_from_growth_history(
    step_history: dict[str, int], node_ids: Iterable[str], edge_ids: Iterable[str]
) -> dict[str, list[str]]:
    """Read one step of ``growth_history`` into added/updated lists.

    Values: 2 = added this step, 1 = weights updated, 0 = untouched.
    """
    node_ids, edge_ids = set(node_ids), set(edge_ids)
    added_nodes: list[str] = []
    added_edges: list[str] = []
    updated_edges: list[str] = []

    for raw_key, value in (step_history or {}).items():
        parsed = parse_history_key(raw_key)
        if isinstance(parsed, tuple):
            eid = edge_id(*parsed)
            if eid not in edge_ids:
                continue
            if value == 2:
                added_edges.append(eid)
            elif value == 1:
                updated_edges.append(eid)
        else:
            if value == 2 and parsed in node_ids:
                added_nodes.append(parsed)

    return {
        "added_nodes": added_nodes,
        "added_edges": added_edges,
        "updated_edges": updated_edges,
    }


#: Highlight fields reset to empty when carrying a graph across a quiet step.
_NO_CHANGE = {
    "added_nodes": [],
    "added_edges": [],
    "widened_nodes": [],
    "updated_edges": [],
}


_TERMINAL_LABELS = ("start", "end")


def terminal_baseline(snapshot: dict[str, Any]) -> dict[str, Any]:
    """The ungrown form of a graph: its ``start`` and ``end`` nodes and the edge
    between them.

    Every DAG begins life with both terminals already in place, joined by a
    single convolution -- growth only ever inserts nodes *between* them. So when
    a DAG's earliest export already contains grown structure, its opening state
    is not unknown: it is this snapshot with the intermediate nodes removed.
    Reconstructing it keeps the DAG on screen from the first frame instead of
    letting it blink into existence at whatever step it happened to be exported.
    """
    nodes = [n for n in snapshot.get("nodes", []) if n.get("label") in _TERMINAL_LABELS]
    kept = {n["id"] for n in nodes}
    edges = [
        e
        for e in snapshot.get("edges", [])
        if e.get("source") in kept and e.get("target") in kept
    ]
    return {**snapshot, "nodes": nodes, "edges": edges, **_NO_CHANGE}


def align_snapshots_to_growth(
    dag_snapshots: dict[str, dict[int, dict[str, Any]]],
    growth_history: dict[str, dict[int, dict[str, int]]] | None,
) -> dict[str, dict[int, dict[str, Any]]]:
    """Re-key each DAG's snapshots to the step its state *began* at.

    The graph artifact is logged every step, but wandb does not create a new
    version when the content is identical, so a version's ``step`` metadata ends
    up marking the **last** step that state was current -- not the first. Read
    literally, every change lands late: dag1 grows at step 0 but its version is
    stamped 3, the last step before it grew again.

    Inverting that is exact and needs no other source: consecutive versions
    partition the run, so a snapshot stamped ``S`` became current one step after
    the previous snapshot's stamp. On this run that recovers 0/4/8/12 for dag1
    and 1/5/9 for dag2 -- precisely the turns ``growth_history`` records.

    Deriving it from the stamps rather than from ``growth_history`` also keeps
    off-turn changes honest: ``end@dagN`` widens whenever its *neighbour* grows,
    which cuts a new version on a step that is not this DAG's turn at all.

    ``growth_history`` is used for one thing only -- the first turn of a DAG
    whose earliest version is already grown, whose opening state wandb never
    versioned. That state is rebuilt by ``terminal_baseline`` so the DAG is on
    screen from the start instead of blinking into existence mid-run.
    """
    turns = {
        name: sorted(steps) for name, steps in (growth_history or {}).items() if steps
    }

    all_steps = [s for per_step in dag_snapshots.values() for s in per_step]
    all_steps += [t for steps in turns.values() for t in steps]
    if not all_steps:
        return dag_snapshots
    baseline = min(all_steps) - 1 if turns else min(all_steps)

    aligned: dict[str, dict[int, dict[str, Any]]] = {}
    for name, per_step in dag_snapshots.items():
        stamps = sorted(per_step)
        if not stamps:
            aligned[name] = dict(per_step)
            continue

        remapped: dict[int, dict[str, Any]] = {}

        # Every version after the first starts one step past its predecessor.
        for previous, stamp in zip(stamps, stamps[1:]):
            remapped[previous + 1] = per_step[stamp]

        first = per_step[stamps[0]]
        grown = sum(1 for n in first.get("nodes", []) if n.get("label") not in _TERMINAL_LABELS)
        if not grown:
            # The opening state was captured: it holds from the very beginning.
            remapped[baseline] = first
        else:
            # It was not -- this DAG had already grown by its first export. Show
            # the reconstructed opening state, then this one from its first turn.
            remapped[baseline] = terminal_baseline(first)
            dag_turns = turns.get(name)
            remapped[dag_turns[0] if dag_turns else baseline + 1] = first

        aligned[name] = remapped

    return aligned


def build_steps(
    dag_snapshots: dict[str, dict[int, dict[str, Any]]],
    growth_history: dict[str, dict[int, dict[str, int]]] | None,
    step_metrics: dict[str, list[tuple[float, float]]],
    epoch_ranges: dict[int, list[int]] | None = None,
) -> list[dict[str, Any]]:
    """Assemble the per-step timeline.

    Parameters
    ----------
    dag_snapshots
        ``{dag_name: {step: snapshot}}``, sparse -- only steps where that DAG grew.
    growth_history
        ``{dag_name: {step: {key: 0|1|2}}}``, may be missing or partial.
    step_metrics
        growth-step-axis metrics as ``{key: [(step, value), ...]}``.
    epoch_ranges
        ``{step: [first_epoch, last_epoch]}`` if derivable.
    """
    growth_history = growth_history or {}
    dag_names = sorted(dag_snapshots)

    all_steps = {s for per_step in dag_snapshots.values() for s in per_step}
    all_steps.update(s for series in step_metrics.values() for s, _ in series)
    for per_dag in growth_history.values():
        all_steps.update(per_dag)
    if not all_steps:
        return []
    ordered_steps = sorted(all_steps)

    # Fast lookup of growth-step metrics by step.
    metrics_by_step: dict[int, dict[str, float]] = {}
    for key, points in step_metrics.items():
        for step, value in points:
            metrics_by_step.setdefault(int(step), {})[key] = value

    steps: list[dict[str, Any]] = []
    last_snapshot: dict[str, dict[str, Any] | None] = {name: None for name in dag_names}

    for step in ordered_steps:
        dags: dict[str, Any] = {}
        for name in dag_names:
            fresh = dag_snapshots[name].get(step)
            previous = last_snapshot[name]

            if fresh is None:
                # This DAG did not grow at this step: carry the last state
                # forward with an empty diff so nothing is highlighted.
                if previous is None:
                    continue
                carried = {**previous, **_NO_CHANGE}
                dags[name] = carried
                continue

            snapshot = dict(fresh)

            # Additions always come from comparing consecutive snapshots.
            # growth_history cannot be trusted for this: it records *candidate*
            # expansion ids such as "1@dag1_a" / "2@dag1_b" that are renamed
            # before landing in the graph, so its "added" flags routinely refer
            # to nodes that never appear in any snapshot. It is also written
            # only for the DAG being grown, covering a handful of steps per run.
            added_nodes, added_edges, widened_nodes = diff_snapshots(previous, snapshot)
            snapshot["added_nodes"] = added_nodes
            snapshot["added_edges"] = added_edges
            snapshot["widened_nodes"] = widened_nodes

            # growth_history is still the only source for "retrained", so use it
            # for that alone, restricted to edges that really exist.
            hist = growth_history.get(name, {}).get(step)
            if hist:
                enriched = diff_from_growth_history(
                    hist,
                    (n["id"] for n in snapshot["nodes"]),
                    (e["id"] for e in snapshot["edges"]),
                )
                added = set(added_edges)
                snapshot["updated_edges"] = [
                    e for e in enriched["updated_edges"] if e not in added
                ]
            else:
                # No history for this step: everything already present in a
                # graph that just grew was refit by the expansion.
                snapshot["updated_edges"] = (
                    [e["id"] for e in snapshot["edges"] if e["id"] not in set(added_edges)]
                    if (added_nodes or added_edges)
                    else []
                )

            dags[name] = snapshot
            last_snapshot[name] = {**snapshot, **_NO_CHANGE}

        steps.append(
            {
                "step": int(step),
                "epoch_range": (epoch_ranges or {}).get(int(step)),
                "dags": dags,
                "metrics": metrics_by_step.get(int(step), {}),
            }
        )

    return steps


def epoch_ranges_from_growth_epochs(
    growth_epochs: list[tuple[float, float]],
) -> dict[int, list[int]]:
    """Map each growth step to the epoch span trained during it.

    ``growth/epochs`` logs how many epochs ran at each growth step; epochs
    accumulate globally, so a running sum recovers the span. This is what lets
    the epoch-axis training curves advance in lockstep with the step-indexed
    growth animation.
    """
    ranges: dict[int, list[int]] = {}
    cursor = 0
    for step, count in sorted(growth_epochs):
        count = int(count or 0)
        if count <= 0:
            ranges[int(step)] = [cursor, cursor]
            continue
        ranges[int(step)] = [cursor, cursor + count - 1]
        cursor += count
    return ranges


def split_series(
    metrics: dict[str, list[tuple[float, float]]],
    keep_all: bool = False,
    observed_axes: dict[str, str] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, list[tuple[float, float]]]]:
    """Split logged metrics into series documents and growth-step metrics.

    ``observed_axes`` records the axis each metric was actually logged against
    and always wins over the name-based heuristic when available.
    """
    series: list[dict[str, Any]] = []
    step_metrics: dict[str, list[tuple[float, float]]] = {}
    observed_axes = observed_axes or {}

    for key, points in sorted(metrics.items()):
        if not points:
            continue
        if not keep_all and _VERBOSE_RE.match(key):
            continue
        axis = observed_axes.get(key) or axis_for_metric(key)
        clean = [[float(x), float(y)] for x, y in points if y is not None]
        if not clean:
            continue
        series.append({"key": key, "axis": axis, "points": clean})
        if axis == "growth_step":
            step_metrics[key] = [(x, y) for x, y in clean]

    return series, step_metrics
