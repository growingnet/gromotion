"""FastAPI entrypoint for the gromo growth showcase."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pymongo.errors import PyMongoError

from .config import get_settings
from .db import ensure_indexes
from .routers import runs, training


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        ensure_indexes()
    except PyMongoError as exc:  # pragma: no cover - startup convenience
        # A read-only Atlas user cannot create indexes; that is fine, they were
        # created at ingest time. Don't take the API down over it.
        print(f"[startup] skipping index creation: {exc}")
    yield


app = FastAPI(
    title="gromo growth showcase",
    description="Replays saved gromo training runs as an animated network-growth timeline.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(runs.router)
app.include_router(training.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
