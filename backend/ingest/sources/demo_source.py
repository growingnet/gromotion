"""Generate a SYNTHETIC run so the showcase is runnable without real data.

This is not gromo output. It imitates the shape of a real run -- several DAGs
that gain nodes and channels over growth steps, with loss curves that step down
after each growth event -- purely so the UI can be developed and verified before
any wandb export exists. Ingested runs are named "(synthetic demo)" so they are
never mistaken for experimental results.
"""

from __future__ import annotations

import math
import random

from ..raw import RawRun


def _dag_params(nodes: dict[str, int], edges: list[tuple[str, str]], dag: str) -> dict:
    return {
        "edges": [[s, t] for s, t in edges],
        "node_attributes": {
            node: {
                "type": "convolution",
                "size": size,
                "shape": [32, 32],
                "kernel_size": [3, 3],
                "activation": "id" if node.startswith("start") else "selu",
                "use_layer_norm": not node.startswith("start"),
            }
            for node, size in nodes.items()
        },
        "edge_attributes": {
            str((s, t)): {"type": "convolution", "use_bias": True, "kernel_size": [3, 3]}
            for s, t in edges
        },
    }


def make_demo_run(
    run_id: str = "demo001",
    n_dags: int = 4,
    n_steps: int = 24,
    epochs_per_step: int = 3,
    seed: int = 7,
) -> RawRun:
    rng = random.Random(seed)
    run = RawRun(
        run_id=run_id,
        name="(synthetic demo)",
        project="gromotion",
        dataset="synthetic",
        created_at="2026-01-01T00:00:00+00:00",
        config={"note": "Synthetic data for UI development. Not a real gromo run.",
                "growth": {"steps": n_steps}, "training": {"epochs": epochs_per_step}},
    )

    for d in range(1, n_dags + 1):
        dag = f"dag{d}"
        start, end = f"start@{dag}", f"end@{dag}"
        nodes = {start: 3, end: 10 * d}
        edges = [(start, end)]
        next_node = 1

        for step in range(n_steps):
            grew = False
            # Roughly every third step this DAG gains a node; other steps it
            # widens an existing one.
            if step > 0 and rng.random() < 0.45:
                new_node = f"{next_node}@{dag}"
                next_node += 1
                nodes[new_node] = rng.choice([10, 20, 30])
                candidates = [n for n in nodes if n not in (new_node, end)]
                source = rng.choice(candidates)
                edges.append((source, new_node))
                edges.append((new_node, end))
                grew = True
                added = {str((source, new_node)): 2, str((new_node, end)): 2, new_node: 2}
            elif step > 0 and rng.random() < 0.5:
                target = rng.choice([n for n in nodes if n not in (start, end)] or [end])
                nodes[target] += rng.choice([8, 16, 24])
                grew = True
                added = {}
            else:
                added = {}

            if grew or step == 0:
                run.dag_snapshots.setdefault(dag, {})[step] = _dag_params(
                    dict(nodes), list(edges), dag
                )
                history = {str(e): 1 for e in edges}
                history.update({n: 0 for n in nodes})
                history.update(added)
                run.growth_history.setdefault(dag, {})[step] = history

    # Metrics: loss decays and dips at each growth step; accuracy mirrors it.
    total_epochs = n_steps * epochs_per_step
    train_loss, val_loss = [], []
    train_acc, val_acc = [], []
    for epoch in range(total_epochs):
        base = 2.2 * math.exp(-epoch / (total_epochs / 3.2)) + 0.18
        jitter = rng.uniform(-0.02, 0.02)
        train_loss.append((float(epoch), round(base + jitter, 4)))
        val_loss.append((float(epoch), round(base * 1.12 + rng.uniform(-0.03, 0.05), 4)))
        acc = 100 * (1 - base / 2.5) + rng.uniform(-1.0, 1.0)
        train_acc.append((float(epoch), round(min(99.0, max(8.0, acc)), 3)))
        val_acc.append((float(epoch), round(min(97.0, max(7.0, acc - 2.5)), 3)))

    run.metrics["training/train loss"] = train_loss
    run.metrics["training/val loss"] = val_loss
    run.metrics["training/train accuracy"] = train_acc
    run.metrics["training/val accuracy"] = val_acc
    run.metrics["growth/epochs"] = [(float(s), float(epochs_per_step)) for s in range(n_steps)]

    params = 12000
    neurons, nb_params = [], []
    for step in range(n_steps):
        added_now = rng.choice([0, 10, 20, 30])
        params += added_now * rng.randint(200, 900)
        neurons.append((float(step), float(added_now)))
        nb_params.append((float(step), float(params)))
    run.metrics["growth/neurons"] = neurons
    run.metrics["complexity/nb of parameters"] = nb_params

    run.summary = {
        "final val accuracy": val_acc[-1][1],
        "final val loss": val_loss[-1][1],
        "nb of parameters": params,
    }
    return run
