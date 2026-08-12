"""Tests for the parts of ingest that are easy to get subtly wrong."""

from ingest.build import build_documents
from ingest.normalize import (
    axis_for_metric,
    build_steps,
    epoch_ranges_from_growth_epochs,
    parse_history_key,
    snapshot_from_dag_params,
)
from ingest.raw import RawRun


def dag_params(nodes: dict[str, int], edges: list[tuple[str, str]]) -> dict:
    return {
        "edges": [list(e) for e in edges],
        "node_attributes": {n: {"type": "convolution", "size": s} for n, s in nodes.items()},
        "edge_attributes": {str(e): {"type": "convolution", "use_bias": True} for e in edges},
    }


def test_parse_history_key_distinguishes_nodes_from_edges():
    assert parse_history_key("('a@dag1', 'b@dag1')") == ("a@dag1", "b@dag1")
    assert parse_history_key("3@dag1") == "3@dag1"


def test_axis_assignment():
    assert axis_for_metric("training/val loss") == "epoch"
    assert axis_for_metric("complexity/size/node 2") == "epoch"
    assert axis_for_metric("growth/neurons") == "growth_step"
    # Logged with step_name="epoch" by the pipeline despite the name.
    assert axis_for_metric("complexity/nb of parameters") == "epoch"


def test_snapshot_parses_nodes_and_edges():
    snap = snapshot_from_dag_params(
        dag_params({"start@dag1": 3, "end@dag1": 10}, [("start@dag1", "end@dag1")])
    )
    assert {n["id"] for n in snap["nodes"]} == {"start@dag1", "end@dag1"}
    assert snap["nodes"][0]["label"] == "start"
    assert snap["edges"][0]["id"] == "start@dag1->end@dag1"


def test_sparse_snapshots_are_forward_filled():
    """A DAG that does not grow at a step must still be rendered at that step."""
    snapshots = {
        "dag1": {
            0: snapshot_from_dag_params(
                dag_params({"start@dag1": 3, "end@dag1": 10}, [("start@dag1", "end@dag1")])
            ),
            3: snapshot_from_dag_params(
                dag_params(
                    {"start@dag1": 3, "end@dag1": 10, "1@dag1": 20},
                    [("start@dag1", "end@dag1"), ("start@dag1", "1@dag1"), ("1@dag1", "end@dag1")],
                )
            ),
        }
    }
    steps = build_steps(snapshots, None, {"growth/neurons": [(s, 1.0) for s in range(5)]})

    assert [s["step"] for s in steps] == [0, 1, 2, 3, 4]
    # Steps 1 and 2 carry step 0's graph forward with no highlight.
    assert len(steps[1]["dags"]["dag1"]["nodes"]) == 2
    assert steps[1]["dags"]["dag1"]["added_nodes"] == []
    # Step 3 grows, step 4 carries it forward without re-highlighting.
    assert steps[3]["dags"]["dag1"]["added_nodes"] == ["1@dag1"]
    assert len(steps[4]["dags"]["dag1"]["nodes"]) == 3
    assert steps[4]["dags"]["dag1"]["added_nodes"] == []


def test_growth_history_supplies_retrained_edges():
    """growth_history contributes "retrained"; additions come from the diff."""
    before = snapshot_from_dag_params(
        dag_params({"start@dag1": 3, "end@dag1": 10}, [("start@dag1", "end@dag1")])
    )
    after = snapshot_from_dag_params(
        dag_params(
            {"start@dag1": 3, "end@dag1": 10, "1@dag1": 20},
            [("start@dag1", "end@dag1"), ("start@dag1", "1@dag1")],
        )
    )
    history = {
        "dag1": {
            1: {
                "('start@dag1', 'end@dag1')": 1,  # retrained
                "('start@dag1', '1@dag1')": 2,  # added
                "1@dag1": 2,
                "start@dag1": 0,
            }
        }
    }
    steps = build_steps({"dag1": {0: before, 1: after}}, history, {})
    graph = steps[1]["dags"]["dag1"]

    assert graph["added_nodes"] == ["1@dag1"]
    assert graph["added_edges"] == ["start@dag1->1@dag1"]
    # An edge counted as added must not also be listed as merely retrained.
    assert graph["updated_edges"] == ["start@dag1->end@dag1"]


def test_first_appearance_is_not_reported_as_growth():
    """The initial graph is context, not a growth event."""
    snap = snapshot_from_dag_params(
        dag_params({"start@dag1": 3, "end@dag1": 10}, [("start@dag1", "end@dag1")])
    )
    steps = build_steps({"dag1": {0: snap}}, None, {})
    assert steps[0]["dags"]["dag1"]["added_nodes"] == []
    assert steps[0]["dags"]["dag1"]["added_edges"] == []


def test_widening_is_detected_without_topology_change():
    """Raising a node's channel count is growth even though the graph is identical."""
    before = snapshot_from_dag_params(
        dag_params({"start@dag1": 3, "end@dag1": 64}, [("start@dag1", "end@dag1")])
    )
    after = snapshot_from_dag_params(
        dag_params({"start@dag1": 3, "end@dag1": 164}, [("start@dag1", "end@dag1")])
    )
    steps = build_steps({"dag1": {0: before, 1: after}}, None, {})
    graph = steps[1]["dags"]["dag1"]

    assert graph["added_nodes"] == []
    assert graph["added_edges"] == []
    assert graph["widened_nodes"] == ["end@dag1"]


def test_widening_does_not_persist_into_quiet_steps():
    before = snapshot_from_dag_params(
        dag_params({"start@dag1": 3, "end@dag1": 64}, [("start@dag1", "end@dag1")])
    )
    after = snapshot_from_dag_params(
        dag_params({"start@dag1": 3, "end@dag1": 164}, [("start@dag1", "end@dag1")])
    )
    steps = build_steps(
        {"dag1": {0: before, 1: after}}, None, {"growth/neurons": [(s, 0.0) for s in range(4)]}
    )
    assert steps[1]["dags"]["dag1"]["widened_nodes"] == ["end@dag1"]
    # Steps 2 and 3 carry the graph forward and must not re-flag the widening.
    assert steps[2]["dags"]["dag1"]["widened_nodes"] == []
    assert steps[3]["dags"]["dag1"]["widened_nodes"] == []


def test_epoch_ranges_accumulate():
    ranges = epoch_ranges_from_growth_epochs([(0, 3), (1, 2), (2, 4)])
    assert ranges == {0: [0, 2], 1: [3, 4], 2: [5, 8]}


def test_params_are_forward_filled_onto_steps():
    """A growth-step-axis parameter count fills forward across quiet steps."""
    run = RawRun(run_id="r1", name="r1")
    run.dag_snapshots = {
        "dag1": {
            0: dag_params({"start@dag1": 3, "end@dag1": 10}, [("start@dag1", "end@dag1")])
        }
    }
    run.metrics = {
        "complexity/nb of parameters": [(0.0, 1000.0), (2.0, 2500.0)],
        "growth/neurons": [(0.0, 0.0), (1.0, 0.0), (2.0, 10.0)],
    }
    # Older pipelines logged this against the growth step.
    run.metric_axes = {"complexity/nb of parameters": "growth_step"}
    _, steps, _ = build_documents(run)

    assert [s["n_params"] for s in steps] == [1000, 1000, 2500]


def test_build_documents_shape():
    run = RawRun(run_id="r2", name="r2", project="p")
    run.dag_snapshots = {
        "dag1": {0: dag_params({"start@dag1": 3, "end@dag1": 10}, [("start@dag1", "end@dag1")])},
        "dag2": {0: dag_params({"start@dag2": 3, "end@dag2": 10}, [("start@dag2", "end@dag2")])},
    }
    run.metrics = {"training/train loss": [(0.0, 1.0), (1.0, 0.5)]}
    run_doc, steps, series = build_documents(run)

    assert run_doc["dag_names"] == ["dag1", "dag2"]
    assert run_doc["n_steps"] == len(steps)
    assert all(s["run_id"] == "r2" for s in steps)
    assert series[0]["axis"] == "epoch"


def test_observed_axis_overrides_name_heuristic():
    """A metric's logged axis wins over any guess made from its name."""
    run = RawRun(run_id="r4", name="r4")
    run.dag_snapshots = {
        "dag1": {0: dag_params({"start@dag1": 3, "end@dag1": 10}, [("start@dag1", "end@dag1")])}
    }
    run.metrics = {"growth/neurons": [(0.0, 5.0), (1.0, 7.0)]}
    run.metric_axes = {"growth/neurons": "epoch"}

    _, _, series = build_documents(run)
    assert series[0]["axis"] == "epoch"


def test_nb_of_parameters_is_an_epoch_metric():
    """Regression: reads like a growth-step quantity, but is logged per epoch."""
    assert axis_for_metric("complexity/nb of parameters") == "epoch"


def test_params_resolved_from_epoch_axis_series():
    """n_params must reach every step even when logged against epochs."""
    run = RawRun(run_id="r5", name="r5")
    run.dag_snapshots = {
        "dag1": {0: dag_params({"start@dag1": 3, "end@dag1": 10}, [("start@dag1", "end@dag1")])}
    }
    run.metrics = {
        # 3 growth steps of 2 epochs each -> epochs 0..5
        "growth/epochs": [(0.0, 2.0), (1.0, 2.0), (2.0, 2.0)],
        "complexity/nb of parameters": [
            (0.0, 100.0),
            (1.0, 100.0),
            (2.0, 250.0),
            (3.0, 250.0),
            (4.0, 900.0),
            (5.0, 900.0),
        ],
    }
    run.metric_axes = {"complexity/nb of parameters": "epoch"}

    _, steps, _ = build_documents(run)
    assert [s["epoch_range"] for s in steps] == [[0, 1], [2, 3], [4, 5]]
    assert [s["n_params"] for s in steps] == [100, 250, 900]


def test_candidate_ids_in_growth_history_do_not_suppress_real_additions():
    """Regression: growth_history names candidates such as "1@dag1_a".

    Those ids never appear in any snapshot, so trusting growth_history for
    additions loses the growth entirely. Snapshot diffing must win.
    """
    before = snapshot_from_dag_params(
        dag_params({"start@dag1": 3, "end@dag1": 10}, [("start@dag1", "end@dag1")])
    )
    after = snapshot_from_dag_params(
        dag_params(
            {"start@dag1": 3, "end@dag1": 10, "1@dag1": 20},
            [("start@dag1", "end@dag1"), ("start@dag1", "1@dag1"), ("1@dag1", "end@dag1")],
        )
    )
    history = {
        "dag1": {
            1: {
                "('start@dag1', 'end@dag1')": 1,
                "('start@dag1', '1@dag1_a')": 2,  # candidate id, never lands
                "1@dag1_a": 2,
            }
        }
    }
    steps = build_steps({"dag1": {0: before, 1: after}}, history, {})
    graph = steps[1]["dags"]["dag1"]

    assert graph["added_nodes"] == ["1@dag1"]
    assert set(graph["added_edges"]) == {"start@dag1->1@dag1", "1@dag1->end@dag1"}
    assert graph["updated_edges"] == ["start@dag1->end@dag1"]


def test_verbose_series_are_dropped_by_default():
    run = RawRun(run_id="r3", name="r3")
    run.dag_snapshots = {
        "dag1": {0: dag_params({"start@dag1": 3, "end@dag1": 10}, [("start@dag1", "end@dag1")])}
    }
    run.metrics = {
        "neurons/alpha/1@dag1": [(0.0, 1.0)],
        "training/train loss": [(0.0, 1.0)],
    }
    _, _, series = build_documents(run)
    assert [s["key"] for s in series] == ["training/train loss"]

    _, _, all_series = build_documents(run, keep_all_series=True)
    assert len(all_series) == 2
