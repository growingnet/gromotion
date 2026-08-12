"""Pull a run from the Weights & Biases public API.

Run OFFLINE, by hand. The web application never imports this module and never
holds wandb credentials -- ingest is a one-way step that ends at MongoDB (or at
an export folder, via ``--dump-dir``).

Conventions this relies on, from ``tools/logger.py`` in the experiment repo:
  * metrics are logged with their x-axis as an extra column, either ``"epoch"``
    or ``"growth step"``, rather than relying on wandb's implicit ``_step``;
  * artifacts are named ``<name>_<run_id>`` with ``metadata={"step": global_step}``,
    so ``graph_dag1_ab12cd34`` versioned N times gives N graph snapshots, each
    tagged with the growth step it belongs to;
  * the growth history is logged as an artifact named ``growth_history_<run_id>``
    containing ``gh.json``.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from ..raw import RawRun

# Column names the logger injects to carry the x-axis.
EPOCH_COLUMN = "epoch"
GROWTH_STEP_COLUMN = "growth step"
_AXIS_COLUMNS = {EPOCH_COLUMN, GROWTH_STEP_COLUMN}

_GRAPH_ARTIFACT_RE = re.compile(r"^graph_(?P<dag>.+?)_(?P<run>[^_]+)$")
_GRAPH_FILE_RE = re.compile(r"^graph_params_(?P<dag>.+)\.json$")


def _axis_column_for(key: str) -> str:
    from ..normalize import axis_for_metric

    return EPOCH_COLUMN if axis_for_metric(key) == "epoch" else GROWTH_STEP_COLUMN


def _collect_metrics(
    wandb_run: Any,
) -> tuple[dict[str, list[tuple[float, float]]], dict[str, str]]:
    """Read metric history, taking each point's x-axis from the row itself.

    The logger emits one ``wandb.log()`` call per metric and stamps the row with
    the axis column it belongs to, so the row *tells us* the axis -- it must not
    be inferred from the metric's name. Guessing is actively harmful here:
    ``complexity/nb of parameters`` is logged against ``epoch`` despite reading
    like a growth-step quantity, and falling back to wandb's internal ``_step``
    counter for it manufactured thousands of phantom growth steps.

    Points carrying neither axis column are dropped rather than guessed at.
    """
    metrics: dict[str, list[tuple[float, float]]] = {}
    axis_votes: dict[str, dict[str, int]] = {}
    skipped: set[str] = set()

    for row in wandb_run.scan_history():
        epoch = row.get(EPOCH_COLUMN)
        growth_step = row.get(GROWTH_STEP_COLUMN)

        if epoch is not None:
            x, axis = float(epoch), "epoch"
        elif growth_step is not None:
            x, axis = float(growth_step), "growth_step"
        else:
            x, axis = None, None

        for key, value in row.items():
            if key in _AXIS_COLUMNS or key.startswith("_"):
                continue
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                continue
            if x is None or axis is None:
                skipped.add(key)
                continue
            metrics.setdefault(key, []).append((x, float(value)))
            axis_votes.setdefault(key, {})
            axis_votes[key][axis] = axis_votes[key].get(axis, 0) + 1

    # Metrics are logged one call at a time, so several rows can share an x;
    # keep the last value per x and sort.
    for key, points in metrics.items():
        deduped: dict[float, float] = {}
        for x, y in points:
            deduped[x] = y
        metrics[key] = sorted(deduped.items())

    axes = {key: max(votes, key=votes.__getitem__) for key, votes in axis_votes.items()}

    lost = sorted(skipped - set(metrics))
    if lost:
        print(
            f"  ! {len(lost)} metric(s) had no axis column and were dropped: "
            f"{', '.join(lost[:5])}" + (" …" if len(lost) > 5 else "")
        )

    return metrics, axes


def _collect_artifacts(wandb_run: Any, run_id: str, cache_dir: Path) -> tuple[dict, dict]:
    """Download graph + growth-history artifacts, keyed by growth step."""
    dag_snapshots: dict[str, dict[int, dict[str, Any]]] = {}
    growth_history: dict[str, dict[int, dict[str, int]]] = {}

    for artifact in wandb_run.logged_artifacts():
        base_name = artifact.name.split(":", 1)[0]
        step = (artifact.metadata or {}).get("step")

        is_graph = _GRAPH_ARTIFACT_RE.match(base_name) and base_name.startswith("graph_")
        is_history = base_name.startswith("growth_history")
        if not (is_graph or is_history):
            continue
        if is_graph and step is None:
            print(f"  ! {artifact.name} has no step metadata, skipping")
            continue

        try:
            local_dir = Path(artifact.download(root=str(cache_dir / artifact.name)))
        except Exception as exc:  # pragma: no cover - network/permission issues
            print(f"  ! failed to download {artifact.name}: {exc}")
            continue

        if is_graph:
            for path in local_dir.glob("graph_params_*.json"):
                match = _GRAPH_FILE_RE.match(path.name)
                if not match:
                    continue
                dag_name = match.group("dag")
                with path.open() as handle:
                    dag_snapshots.setdefault(dag_name, {})[int(step)] = json.load(handle)
        else:
            # gh.json holds the whole history dict {step: {key: 0|1|2}} for the
            # DAG that was grown. Later versions supersede earlier ones, so the
            # highest-step artifact carries the most complete record.
            for path in local_dir.glob("*.json"):
                with path.open() as handle:
                    raw = json.load(handle)
                if not isinstance(raw, dict):
                    continue
                for hist_step, entries in raw.items():
                    if not isinstance(entries, dict):
                        continue
                    dag_name = _infer_dag_name(entries)
                    if dag_name is None:
                        continue
                    growth_history.setdefault(dag_name, {})[int(hist_step)] = entries

    return dag_snapshots, growth_history


def _dataset_name(config: dict[str, Any]) -> str | None:
    """Recover the dataset name from either config layout.

    wandb stores the pipeline config flattened into dotted keys
    (``"dataset.name"``), but a nested ``{"dataset": {"name": ...}}`` shape
    shows up too depending on how the run was launched.
    """
    flat = config.get("dataset.name")
    if isinstance(flat, str):
        return flat

    nested = config.get("dataset")
    if isinstance(nested, dict):
        name = nested.get("name")
        return str(name) if name is not None else None
    if isinstance(nested, str):
        return nested
    return None


def _infer_dag_name(entries: dict[str, Any]) -> str | None:
    """gromo node ids look like ``"3@dag2"``; recover the DAG name from them."""
    for key in entries:
        if "@" in key:
            return key.rsplit("@", 1)[-1].rstrip("')\"")
    return None


def load_wandb(
    entity: str,
    project: str,
    run_id: str,
    cache_dir: str | Path = ".wandb_ingest_cache",
) -> RawRun:
    try:
        import wandb
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "wandb is not installed. Install the ingest extra:\n"
            "    pip install -e 'backend[ingest]'"
        ) from exc

    api = wandb.Api()
    wandb_run = api.run(f"{entity}/{project}/{run_id}")
    cache = Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)

    print(f"  fetching metric history for {wandb_run.name} ...")
    metrics, metric_axes = _collect_metrics(wandb_run)
    print(f"  {len(metrics)} metric series")

    print("  fetching graph artifacts ...")
    dag_snapshots, growth_history = _collect_artifacts(wandb_run, run_id, cache)
    for dag_name, per_step in sorted(dag_snapshots.items()):
        print(f"  {dag_name}: {len(per_step)} snapshots")

    config = {k: v for k, v in dict(wandb_run.config).items() if not k.startswith("_")}
    summary = {
        k: v
        for k, v in dict(wandb_run.summary).items()
        if not k.startswith("_") and isinstance(v, (int, float, str, bool))
    }

    return RawRun(
        run_id=run_id,
        name=wandb_run.name or run_id,
        project=project,
        created_at=str(wandb_run.created_at) if wandb_run.created_at else None,
        dataset=_dataset_name(config),
        config=config,
        summary=summary,
        metrics=metrics,
        metric_axes=metric_axes,
        dag_snapshots=dag_snapshots,
        growth_history=growth_history,
    )
