<p align="center">
  <img alt="GroMotion" src="docs/logo.svg" width="220">
</p>

<h1 align="center">GroMotion</h1>

<p align="center"><strong>Watch your network grow.</strong></p>

An interactive replay of [gromo](https://github.com/growingnet/gromo) training runs: the
network's architecture grows step by step, alongside the training curves.

Saved runs are ingested once, offline, into MongoDB. The website then replays them —
scrub, pause, and change speed over the global growth step.

```
   wandb run ──┐
               ├──► ingest (offline, one-off) ──► MongoDB ──► FastAPI ──► React
 export folder ┘
```

The web app **never talks to wandb** and holds no wandb credentials.

---

## Quick start

The runs live in a hosted MongoDB cluster; the app only reads from it. Point it
at yours:

```bash
cp backend/.env.example backend/.env
# set MONGO_URI to your cluster, using a read-only database user
```

### With Docker

```bash
docker compose up -d        # backend + frontend
```

http://localhost:5173. Source directories are bind-mounted, so backend reload
and frontend HMR both work against your working tree, and `backend/.env` is read
at run time rather than baked into the image.

> Needs docker daemon access. On a permission error, either
> `sudo usermod -aG docker $USER` and log out and back in, or run compose with `sudo`.

### Without Docker

```bash
cd backend
uv sync --extra dev
uv run uvicorn app.main:app --reload --port 8000

cd ../frontend
npm install
npm run dev            # http://localhost:5173
```

Vite proxies `/api` to port 8000, so the browser stays same-origin in development.

You will see `[startup] skipping index creation: …` in the backend log. That is
expected: it is the read-only user correctly being refused `createIndex`.

---

## Loading runs

Ingest is a separate, offline step that you run **from your machine**, with a
read-write user — never from the deployed app. It handles wandb runs, shareable
export folders, and a synthetic demo run.

See **[backend/ingest/README.md](backend/ingest/README.md)**.

---

## Database

The app reads one MongoDB database and nothing else, so `MONGO_URI` is the only
thing that changes between deployments.

Two users, because the app should never be able to write:

| user | role | used by |
| --- | --- | --- |
| app | `read` on the showcase DB | the backend, via `backend/.env` |
| ingest | `readWrite` on the showcase DB | the ingest CLI, passed on the command line |

The browser never sees either connection string — it only calls the FastAPI
backend, which holds the credential server-side.

### Working offline

If you need to run without the hosted cluster, either start the bundled mongo:

```bash
docker compose --profile local-db up -d     # then MONGO_URI=mongodb://mongo:27017
```

or run a local `mongod` with no root required — download the MongoDB community
tarball and `bin/mongod --dbpath <dir> --port 27017`, then point `MONGO_URI` at
`mongodb://localhost:27017`. Either way you will need to ingest a run into it,
and the same connection string can act as both users.

---

## Configuration

`backend/.env` (see `.env.example`) — read both by the backend directly and by
docker compose, so there is one source of truth:

```ini
MONGO_URI=mongodb+srv://app_readonly:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
MONGO_DB=gromotion
CORS_ORIGINS=http://localhost:5173
```

It is gitignored and excluded from the Docker image.

---

## Using the player

**Deep links**: `?run=demo001&step=17&axis=n_params&play=1`

**Keyboard**: `space` play/pause, `←` / `→` step.

**Chart x-axis** can be epoch, growth step, or **parameters** — the last plots
accuracy against model size, which is the view that shows whether growing
reaches a given accuracy more cheaply.

Click any graph to focus it; click again to show all four.

---

## How the visualization works

Two decisions do most of the work:

**Layout is computed once, on the union of every step.** ELK lays out the final
(largest) graph, and each step renders a subset at those fixed coordinates. If
layout were recomputed per step, adding one node would shift every other node
and growth would read as noise. Every node and edge that will ever exist is
mounted from the start — future ones are transparent, leaving a dashed ring to
show the space held open for them — so the camera is framed once and never
drifts.

**Node boxes are a fixed size.** Channel count is shown by scaling an inner
disc, so a widening layer never perturbs the layout.

Colour is reserved almost entirely for growth events: green for structural
additions, amber for a widened node. Note that gromo marks *every* edge of a
graph as retrained whenever that graph grows, so "retrained" is deliberately
understated — otherwise it would drown out the handful of genuinely new
connections. Because consecutive DAGs share a tensor, widening one graph's `end`
node is mirrored onto the next graph's `start` node.

**Playback** runs on a single fractional cursor over the growth-step axis. The
DAG renders at `floor(position)` since it can only change at integer steps,
while the training curves reveal at the exact fractional position. Charts always
draw the full curve faintly so the axis domain never rescales mid-playback.

---

## Layout

```
backend/
  app/          FastAPI service — reads MongoDB only, never imports wandb or torch
    routers/
      runs.py       GET /api/runs, GET /api/runs/{id}/bundle
      training.py   planned live-training endpoints (501 — see below)
  ingest/       offline CLI; sources: wandb, folder, demo — see its README
  tests/
frontend/
  src/
    hooks/useDagLayout.ts   ELK layout of the union graph
    store/playback.ts       playback clock (rAF, delta-time)
    lib/chartData.ts        axis projection incl. the parameters axis
    components/
```

A whole run is served as one `bundle` response (a few hundred KB — the graphs are
small), so scrubbing and speed changes never touch the network.

---

## Planned: training in the browser

Not implemented. The shape it slots into is already in place —
see `backend/app/routers/training.py`, which returns 501 with the intended contract:

- a live run writes into the same `runs` / `steps` / `series` collections with
  `status="running"`, so the player needs no new rendering path — a live run is
  just a run whose step list keeps growing;
- `POST /api/training/jobs` accepts an uploaded dataset plus a growth config and
  returns a job id;
- training runs in a **separate worker process** (it needs torch, gromo, and a
  GPU); the API server stays a thin Mongo reader and must never import torch;
- progress streams over SSE/WebSocket and the frontend appends arriving steps.

---

## Tests

```bash
cd backend  && uv run --extra dev pytest tests -q
cd frontend && npx tsc -b && npx oxlint src
```
