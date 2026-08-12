"""Turn a ``RawRun`` into the MongoDB documents the API serves."""

from __future__ import annotations

from typing import Any

from .normalize import (
    align_snapshots_to_growth,
    build_steps,
    epoch_ranges_from_growth_epochs,
    snapshot_from_dag_params,
    split_series,
)
from .raw import RawRun

GROWTH_EPOCHS_KEY = "growth/epochs"
NB_PARAMS_KEY = "complexity/nb of parameters"


def _attach_param_counts(
    steps: list[dict[str, Any]],
    run: RawRun,
    step_metrics: dict[str, list[tuple[float, float]]],
) -> None:
    """Give every step a parameter count so curves can be drawn against size.

    The count may be logged on either axis depending on the pipeline version:
    against the growth step, or (as the current pipeline does) against the
    epoch. For the epoch case we take the value at the last epoch of each
    growth step, which is the model size that step finished at. Missing values
    are forward-filled, since the count only moves when the model grows.
    """
    by_step: dict[int, float] = {}

    if NB_PARAMS_KEY in step_metrics:
        by_step = {int(x): y for x, y in step_metrics[NB_PARAMS_KEY]}
    elif NB_PARAMS_KEY in run.metrics:
        epoch_points = sorted(run.metrics[NB_PARAMS_KEY])
        for step in steps:
            epoch_range = step.get("epoch_range")
            if not epoch_range:
                continue
            last_epoch = epoch_range[1]
            candidates = [y for x, y in epoch_points if x <= last_epoch]
            if candidates:
                by_step[step["step"]] = candidates[-1]

    last: int | None = None
    for step in steps:
        value = by_step.get(step["step"])
        if value is not None:
            last = int(value)
        step["n_params"] = last


def _truncate_at_training_gap(
    steps: list[dict[str, Any]], series: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """End the run where continuous training ends.

    Once growth stops finding actions the loop keeps spinning without training a
    single epoch, and the pipeline then runs one long post-loop fit that wandb
    logs against the *final* growth step. Replayed literally that is dozens of
    identical steps followed by a training block that has nothing to do with
    growth -- the playback cursor sits still through the first and then leaps
    across the second.

    This showcase is about the growth phase, so the timeline stops at the first
    break in epoch coverage and the curves are trimmed to match. Everything
    dropped is post-growth by construction.
    """
    cut = None
    training_started = False
    for index, step in enumerate(steps):
        if step.get("epoch_range") is not None:
            training_started = True
        elif training_started:
            cut = index
            break

    if cut is None:
        return steps, series

    kept = steps[:cut]
    last_step = kept[-1]["step"]
    last_epoch = kept[-1]["epoch_range"][1]

    trimmed = []
    for entry in series:
        limit = last_epoch if entry["axis"] == "epoch" else last_step
        points = [point for point in entry["points"] if point[0] <= limit]
        if points:
            trimmed.append({**entry, "points": points})

    return kept, trimmed


def build_documents(
    run: RawRun, keep_all_series: bool = False
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """Return ``(run_doc, step_docs, series_docs)`` ready for insertion."""
    series, step_metrics = split_series(
        run.metrics, keep_all=keep_all_series, observed_axes=run.metric_axes
    )

    epoch_ranges = None
    if GROWTH_EPOCHS_KEY in run.metrics:
        epoch_ranges = epoch_ranges_from_growth_epochs(run.metrics[GROWTH_EPOCHS_KEY])

    dag_snapshots = {
        dag_name: {
            step: snapshot_from_dag_params(params) for step, params in per_step.items()
        }
        for dag_name, per_step in run.dag_snapshots.items()
    }

    # Snapshots are exported once per round-robin cycle, so their own step
    # numbers lag the growth they show; re-key them before building the timeline.
    dag_snapshots = align_snapshots_to_growth(dag_snapshots, run.growth_history)

    steps = build_steps(
        dag_snapshots=dag_snapshots,
        growth_history=run.growth_history,
        step_metrics=step_metrics,
        epoch_ranges=epoch_ranges,
    )

    _attach_param_counts(steps, run, step_metrics)

    steps, series = _truncate_at_training_gap(steps, series)

    dag_names = sorted(dag_snapshots)
    run_doc = {
        "run_id": run.run_id,
        "name": run.name,
        "project": run.project,
        "dataset": run.dataset,
        "created_at": run.created_at,
        "config": run.config,
        "summary": run.summary,
        "dag_names": dag_names,
        "n_steps": len(steps),
        "status": "complete",
    }

    step_docs = [{"run_id": run.run_id, **step} for step in steps]
    series_docs = [{"run_id": run.run_id, **s} for s in series]

    return run_doc, step_docs, series_docs
