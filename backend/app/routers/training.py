"""Placeholder for live, in-browser gromo training.

NOT IMPLEMENTED. This module exists so the eventual feature slots into a shape
the frontend and data model already accommodate, rather than forcing a rewrite:

  * A live run writes into the same ``runs`` / ``steps`` / ``series``
    collections the player already reads, with ``status="running"``. The player
    therefore needs no new rendering path -- a live run is just a run whose
    step list keeps growing.
  * ``POST /api/training/jobs`` would accept an uploaded dataset plus a growth
    config, enqueue a job, and return a job id. Training itself must run in a
    separate worker process (it needs torch + gromo + a GPU); the API server
    stays a thin Mongo reader and must never import torch.
  * ``GET /api/training/jobs/{id}/events`` would stream progress over SSE or a
    WebSocket, and the frontend appends arriving steps to the same bundle.

Endpoints below intentionally return 501 so the contract is visible and
callable, but nothing pretends to work.
"""

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/training", tags=["training (planned)"])

_NOT_YET = "Live training is not implemented yet; the showcase replays ingested runs."


@router.post("/jobs", status_code=501)
def create_job() -> None:
    raise HTTPException(status_code=501, detail=_NOT_YET)


@router.get("/jobs/{job_id}", status_code=501)
def get_job(job_id: str) -> None:
    raise HTTPException(status_code=501, detail=_NOT_YET)
