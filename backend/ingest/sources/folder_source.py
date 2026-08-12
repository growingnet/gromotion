"""Read a run from the canonical export folder layout.

    <export>/
      run.json                          {run_id, name, project, created_at,
                                         dataset, config, summary}
      metrics.json                      {metric_key: [[x, y], ...]}
      dags/<dag_name>/step_<NNNN>.json  export_dag_parameters() output
      growth_history/<dag_name>.json    {step: {key: 0|1|2}}

This is the same layout ``ingest wandb --dump-dir`` writes, so an export folder
can be committed, shared, or replayed offline with no wandb dependency.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from ..raw import RawRun

_STEP_FILE_RE = re.compile(r"step_(\d+)\.json$")


def _load_json(path: Path) -> Any:
    with path.open() as handle:
        return json.load(handle)


def load_folder(export_dir: str | Path) -> RawRun:
    root = Path(export_dir)
    if not root.is_dir():
        raise FileNotFoundError(f"Export directory not found: {root}")

    meta_path = root / "run.json"
    if not meta_path.is_file():
        raise FileNotFoundError(f"Missing {meta_path}; is this an export folder?")
    meta = _load_json(meta_path)

    run = RawRun(
        run_id=str(meta["run_id"]),
        name=str(meta.get("name") or meta["run_id"]),
        project=meta.get("project"),
        created_at=meta.get("created_at"),
        dataset=meta.get("dataset"),
        config=meta.get("config") or {},
        summary=meta.get("summary") or {},
    )

    metrics_path = root / "metrics.json"
    if metrics_path.is_file():
        for key, points in _load_json(metrics_path).items():
            run.metrics[key] = [(float(x), float(y)) for x, y in points if y is not None]

    # Recorded at dump time. Without it the loader falls back to guessing each
    # metric's axis from its name, which is not reliable.
    axes_path = root / "metric_axes.json"
    if axes_path.is_file():
        run.metric_axes = {str(k): str(v) for k, v in _load_json(axes_path).items()}

    dags_dir = root / "dags"
    if dags_dir.is_dir():
        for dag_dir in sorted(p for p in dags_dir.iterdir() if p.is_dir()):
            per_step: dict[int, dict[str, Any]] = {}
            for step_file in sorted(dag_dir.glob("step_*.json")):
                match = _STEP_FILE_RE.search(step_file.name)
                if not match:
                    continue
                per_step[int(match.group(1))] = _load_json(step_file)
            if per_step:
                run.dag_snapshots[dag_dir.name] = per_step

    history_dir = root / "growth_history"
    if history_dir.is_dir():
        for history_file in sorted(history_dir.glob("*.json")):
            raw = _load_json(history_file)
            run.growth_history[history_file.stem] = {
                int(step): entries for step, entries in raw.items()
            }

    return run


def dump_folder(run: RawRun, export_dir: str | Path) -> Path:
    """Write a ``RawRun`` out in the canonical layout."""
    root = Path(export_dir)
    (root / "dags").mkdir(parents=True, exist_ok=True)
    (root / "growth_history").mkdir(parents=True, exist_ok=True)

    (root / "run.json").write_text(
        json.dumps(
            {
                "run_id": run.run_id,
                "name": run.name,
                "project": run.project,
                "created_at": run.created_at,
                "dataset": run.dataset,
                "config": run.config,
                "summary": run.summary,
            },
            indent=2,
            default=str,
        )
    )
    (root / "metrics.json").write_text(
        json.dumps({k: [[x, y] for x, y in v] for k, v in run.metrics.items()})
    )
    if run.metric_axes:
        (root / "metric_axes.json").write_text(json.dumps(run.metric_axes, indent=2))

    for dag_name, per_step in run.dag_snapshots.items():
        dag_dir = root / "dags" / dag_name
        dag_dir.mkdir(parents=True, exist_ok=True)
        for step, params in per_step.items():
            (dag_dir / f"step_{step:04d}.json").write_text(json.dumps(params))

    for dag_name, history in run.growth_history.items():
        (root / "growth_history" / f"{dag_name}.json").write_text(
            json.dumps({str(k): v for k, v in history.items()})
        )

    return root
