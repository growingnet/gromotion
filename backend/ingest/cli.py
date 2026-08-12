"""Offline ingest CLI.

    python -m ingest demo
    python -m ingest folder ./exports/my_run
    python -m ingest wandb --entity ME --project Sunset --run cn0e5zl3
    python -m ingest wandb --entity ME --project Sunset --run cn0e5zl3 \
        --dump-dir ./exports/cn0e5zl3 --no-write

The web app never calls any of this; it only reads what lands in MongoDB.
"""

from __future__ import annotations

import argparse
import os
import sys

from app.db import RUNS, SERIES, STEPS, ingest_db

from .build import build_documents
from .raw import RawRun
from .sources.folder_source import dump_folder, load_folder

DEFAULT_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
DEFAULT_DB = os.environ.get("MONGO_DB", "gromotion")


def write_to_mongo(run: RawRun, mongo_uri: str, mongo_db: str, keep_all: bool) -> None:
    run_doc, step_docs, series_docs = build_documents(run, keep_all_series=keep_all)

    if not step_docs:
        raise SystemExit(
            f"Run {run.run_id!r} produced no timeline steps. "
            "Check that graph artifacts were found and carry step metadata."
        )

    with ingest_db(mongo_uri, mongo_db) as db:
        # Replace wholesale so re-ingesting a run is idempotent.
        db[STEPS].delete_many({"run_id": run.run_id})
        db[SERIES].delete_many({"run_id": run.run_id})
        db[RUNS].replace_one({"run_id": run.run_id}, run_doc, upsert=True)
        if step_docs:
            db[STEPS].insert_many(step_docs)
        if series_docs:
            db[SERIES].insert_many(series_docs)

    print(
        f"\n  wrote run {run.run_id!r} -> {mongo_db}\n"
        f"    {len(run_doc['dag_names'])} dags: {', '.join(run_doc['dag_names'])}\n"
        f"    {len(step_docs)} timeline steps\n"
        f"    {len(series_docs)} metric series"
    )


def _add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--mongo-uri", default=DEFAULT_URI)
    parser.add_argument("--mongo-db", default=DEFAULT_DB)
    parser.add_argument(
        "--keep-all-series",
        action="store_true",
        help="Keep verbose per-neuron diagnostic series (larger payload).",
    )
    parser.add_argument(
        "--dump-dir",
        default=None,
        help="Also write the run to this export folder (shareable, offline-replayable).",
    )
    parser.add_argument(
        "--no-write", action="store_true", help="Skip MongoDB; useful with --dump-dir."
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ingest", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p_demo = sub.add_parser("demo", help="Insert a synthetic run for UI development.")
    p_demo.add_argument("--run-id", default="demo001")
    p_demo.add_argument("--dags", type=int, default=4)
    p_demo.add_argument("--steps", type=int, default=24)
    _add_common(p_demo)

    p_folder = sub.add_parser("folder", help="Ingest a canonical export folder.")
    p_folder.add_argument("path")
    _add_common(p_folder)

    p_wandb = sub.add_parser("wandb", help="Pull a run from the wandb public API.")
    p_wandb.add_argument("--entity", required=True)
    p_wandb.add_argument("--project", required=True)
    p_wandb.add_argument("--run", required=True, dest="run_id")
    p_wandb.add_argument("--cache-dir", default=".wandb_ingest_cache")
    _add_common(p_wandb)

    args = parser.parse_args(argv)

    if args.command == "demo":
        from .sources.demo_source import make_demo_run

        run = make_demo_run(run_id=args.run_id, n_dags=args.dags, n_steps=args.steps)
    elif args.command == "folder":
        run = load_folder(args.path)
    else:
        from .sources.wandb_source import load_wandb

        print(f"Pulling {args.entity}/{args.project}/{args.run_id} from wandb ...")
        run = load_wandb(args.entity, args.project, args.run_id, args.cache_dir)

    if args.dump_dir:
        path = dump_folder(run, args.dump_dir)
        print(f"  exported folder -> {path}")

    if args.no_write:
        print("  --no-write set, skipping MongoDB")
        return 0

    write_to_mongo(run, args.mongo_uri, args.mongo_db, args.keep_all_series)
    return 0


if __name__ == "__main__":
    sys.exit(main())
