<p align="center">
  <img alt="GroMotion" src="docs/logo.svg" width="220">
</p>

<h1 align="center">GroMotion</h1>

<p align="center"><strong>Watch your network grow.</strong></p>

<p align="center">
  <a href="https://github.com/growingnet/gromotion/actions/workflows/deploy.yml">
    <img alt="Deploy frontend to GitHub Pages" src="https://github.com/growingnet/gromotion/actions/workflows/deploy.yml/badge.svg?branch=master">
  </a>
</p>

An interactive replay of [gromo](https://github.com/growingnet/gromo) training runs: the
network's architecture grows step by step, alongside the training curves.

Saved runs are ingested once, offline, into MongoDB. The website then replays them -
scrub, pause, and change speed over the global growth step.

```
   wandb run ──┐
               ├──► ingest (offline, one-off) ──► MongoDB ──► FastAPI ──► React
 export folder ┘
```

The web app **never talks to wandb** and holds no wandb credentials.

Running it locally or adding to it? See **[CONTRIBUTING.md](CONTRIBUTING.md)**.

---

## Deployment

| | URL | Host |
| --- | --- | --- |
| Frontend | https://growingnet.github.io/gromotion/ | GitHub Pages |
| Backend | https://gromotion-production.up.railway.app | Railway |

### Frontend - GitHub Pages

Deploys automatically. `.github/workflows/deploy.yml` builds and publishes on
every push to `master` that touches `frontend/`, and can be run by hand from the
Actions tab.

The backend URL comes from the `VITE_API_BASE` repository variable
(Settings → Secrets and variables → Actions → **Variables**), so it can be
changed without touching the code. It is a public URL, not a secret - Vite
inlines every `VITE_*` value into the JavaScript served to the browser. The
build fails with a clear error if the variable is unset, rather than shipping a
bundle that quietly calls the wrong host.

Because the value is baked in at build time, changing it needs a rebuild, not
just a restart.

Pages serves the site from `/gromotion/`, which is why `vite.config.ts` sets
`base` for builds.

### Backend - Railway

**Must be redeployed manually from the Railway dashboard after any change** -
pushing to `master` does not deploy it.

The service's root directory is `backend/`, and it builds from
`backend/Dockerfile`. Its variables:

```ini
MONGO_URI=mongodb+srv://app_readonly:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
MONGO_DB=gromotion
CORS_ORIGINS=http://localhost:5173,https://growingnet.github.io
```

`CORS_ORIGINS` must list the deployed frontend origin - scheme and host only, no
path and no trailing slash. The allowed origins are read once at startup, so a
change to this variable takes effect only after a redeploy.

The container binds the `$PORT` Railway assigns it. `/api/health` is the
healthcheck path; it deliberately touches nothing but the process itself, so a
green healthcheck says the service is up, not that MongoDB is reachable.

---

## Using the player

**Deep links**: `?run=demo001&step=17&axis=n_params&play=1`

**Keyboard**: `space` play/pause, `←` / `→` step.

**Chart x-axis** can be epoch, growth step, or **parameters** - the last plots
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
mounted from the start - future ones are transparent, leaving a dashed ring to
show the space held open for them - so the camera is framed once and never
drifts.

**Node boxes are a fixed size.** Channel count is shown by scaling an inner
disc, so a widening layer never perturbs the layout.

Colour is reserved almost entirely for growth events: green for structural
additions, amber for a widened node. Note that gromo marks *every* edge of a
graph as retrained whenever that graph grows, so "retrained" is deliberately
understated - otherwise it would drown out the handful of genuinely new
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
  app/          FastAPI service - reads MongoDB only, never imports wandb or torch
    routers/
      runs.py       GET /api/runs, GET /api/runs/{id}/bundle
      training.py   planned live-training endpoints (501 - see below)
  ingest/       offline CLI; sources: wandb, folder, demo - see its README
  tests/
frontend/
  src/
    hooks/useDagLayout.ts   ELK layout of the union graph
    store/playback.ts       playback clock (rAF, delta-time)
    lib/chartData.ts        axis projection incl. the parameters axis
    components/
```

A whole run is served as one `bundle` response (a few hundred KB - the graphs are
small), so scrubbing and speed changes never touch the network.

---

## Planned: training in the browser

Not implemented. The shape it slots into is already in place -
see `backend/app/routers/training.py`, which returns 501 with the intended contract:

- a live run writes into the same `runs` / `steps` / `series` collections with
  `status="running"`, so the player needs no new rendering path - a live run is
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
