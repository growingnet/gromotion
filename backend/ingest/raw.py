"""Source-independent representation of one training run.

Every ingest source produces a ``RawRun``; the normalizer consumes it. Adding a
new source (a live gromo trainer, an mlflow export) means producing one of
these and nothing else changes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class RawRun:
    run_id: str
    name: str
    project: str | None = None
    created_at: str | None = None
    dataset: str | None = None
    config: dict[str, Any] = field(default_factory=dict)
    summary: dict[str, Any] = field(default_factory=dict)

    #: ``{metric_key: [(x, y), ...]}`` -- x is epoch or growth step per metric.
    metrics: dict[str, list[tuple[float, float]]] = field(default_factory=dict)

    #: ``{metric_key: "epoch" | "growth_step"}`` as *observed* at log time.
    #: Authoritative when present; metric names alone are not reliable
    #: indicators of axis, so sources should populate this whenever they can.
    metric_axes: dict[str, str] = field(default_factory=dict)

    #: ``{dag_name: {growth_step: export_dag_parameters() dict}}``, sparse.
    dag_snapshots: dict[str, dict[int, dict[str, Any]]] = field(default_factory=dict)

    #: ``{dag_name: {growth_step: {key: 0|1|2}}}`` from ``growth_history``.
    growth_history: dict[str, dict[int, dict[str, int]]] = field(default_factory=dict)
