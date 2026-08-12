"""Read-only API over ingested runs."""

from fastapi import APIRouter, HTTPException

from ..db import RUNS, SERIES, STEPS, collection
from ..models import RunBundle, RunSummary, SeriesDoc, StepDoc

router = APIRouter(prefix="/api/runs", tags=["runs"])

_RUN_FIELDS = {
    "_id": 0,
    "run_id": 1,
    "name": 1,
    "project": 1,
    "dataset": 1,
    "created_at": 1,
    "n_steps": 1,
    "dag_names": 1,
    "summary": 1,
}


def _as_summary(doc: dict) -> RunSummary:
    created = doc.get("created_at")
    return RunSummary(
        run_id=doc["run_id"],
        name=doc.get("name") or doc["run_id"],
        project=doc.get("project"),
        dataset=doc.get("dataset"),
        created_at=created.isoformat() if hasattr(created, "isoformat") else created,
        n_steps=doc.get("n_steps", 0),
        dag_names=doc.get("dag_names", []),
        summary=doc.get("summary", {}),
    )


@router.get("", response_model=list[RunSummary])
def list_runs() -> list[RunSummary]:
    docs = collection(RUNS).find({}, _RUN_FIELDS).sort("created_at", -1)
    return [_as_summary(d) for d in docs]


@router.get("/{run_id}/bundle", response_model=RunBundle)
def get_run_bundle(run_id: str) -> RunBundle:
    """Return the full timeline for one run in a single response.

    Playback reads entirely from this payload, so scrubbing and speed changes
    never touch the network.
    """
    run = collection(RUNS).find_one({"run_id": run_id}, {"_id": 0})
    if run is None:
        raise HTTPException(status_code=404, detail=f"Unknown run {run_id!r}")

    steps = list(
        collection(STEPS).find({"run_id": run_id}, {"_id": 0, "run_id": 0}).sort("step", 1)
    )
    series = list(
        collection(SERIES).find({"run_id": run_id}, {"_id": 0, "run_id": 0}).sort("key", 1)
    )

    return RunBundle(
        run=_as_summary(run),
        config=run.get("config", {}),
        steps=[StepDoc(**s) for s in steps],
        series=[SeriesDoc(**s) for s in series],
    )
