"""MongoDB access.

Synchronous pymongo on purpose. The read path is a handful of small documents
per request, and FastAPI runs ``def`` endpoints in a worker threadpool, so the
event loop is never blocked. Swapping to pymongo's async driver later is a
local change to this module plus the endpoint signatures.
"""

from collections.abc import Iterator
from contextlib import contextmanager

from pymongo import ASCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.database import Database

from .config import get_settings

_client: MongoClient | None = None

# Collection names, shared with the ingest tool so both sides agree.
RUNS = "runs"
STEPS = "steps"
SERIES = "series"


def get_client() -> MongoClient:
    global _client
    if _client is None:
        settings = get_settings()
        _client = MongoClient(settings.mongo_uri, tz_aware=True)
    return _client


def get_db() -> Database:
    return get_client()[get_settings().mongo_db]


def collection(name: str) -> Collection:
    return get_db()[name]


def ensure_indexes(db: Database | None = None) -> None:
    """Create the indexes the read path depends on. Safe to call repeatedly."""
    db = db if db is not None else get_db()
    db[RUNS].create_index([("run_id", ASCENDING)], unique=True)
    db[STEPS].create_index([("run_id", ASCENDING), ("step", ASCENDING)], unique=True)
    db[SERIES].create_index([("run_id", ASCENDING), ("key", ASCENDING)], unique=True)


@contextmanager
def ingest_db(mongo_uri: str, mongo_db: str) -> Iterator[Database]:
    """Standalone connection for the offline ingest CLI."""
    client: MongoClient = MongoClient(mongo_uri, tz_aware=True)
    try:
        db = client[mongo_db]
        ensure_indexes(db)
        yield db
    finally:
        client.close()
