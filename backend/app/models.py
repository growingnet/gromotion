"""Wire schemas shared by the ingest tool, the API and (mirrored) the frontend.

Design note: a run is served as a single *bundle*. Growth graphs are tiny
(single-digit node counts, a few dozen steps), so the whole timeline is a few
hundred KB. Sending it once means playback never waits on the network, which is
what makes scrubbing and speed changes feel instant.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field

Axis = Literal["epoch", "growth_step"]


class NodeSnapshot(BaseModel):
    """A node in a GrowingGraphNetwork at one growth step."""

    id: str  # full gromo id, e.g. "1@dag1"
    label: str  # display label, e.g. "1"
    size: int  # channel / feature count -> drives node radius
    type: str = "convolution"
    activation: str | None = None
    shape: list[int] | None = None
    kernel_size: list[int] | None = None
    use_layer_norm: bool | None = None


class EdgeSnapshot(BaseModel):
    id: str  # "source->target"
    source: str
    target: str
    type: str = "convolution"
    use_bias: bool | None = None
    kernel_size: list[int] | None = None


class GraphSnapshot(BaseModel):
    """One DAG at one growth step, plus what changed to get here.

    The ``added_*`` / ``updated_*`` fields come from gromo's ``growth_history``
    (2 = added, 1 = weights updated) and are what the UI highlights.
    """

    nodes: list[NodeSnapshot] = Field(default_factory=list)
    edges: list[EdgeSnapshot] = Field(default_factory=list)
    added_nodes: list[str] = Field(default_factory=list)
    added_edges: list[str] = Field(default_factory=list)
    #: Existing nodes whose channel count rose this step -- capacity added
    #: without any topology change, which a structural diff alone would miss.
    widened_nodes: list[str] = Field(default_factory=list)
    updated_edges: list[str] = Field(default_factory=list)


class StepDoc(BaseModel):
    """The state of every DAG at a single global growth step."""

    step: int
    epoch_range: list[int] | None = None  # [first_epoch, last_epoch] inclusive
    #: Total parameter count after this step. Promoted out of ``metrics`` so the
    #: frontend can plot any curve against model size without re-deriving it.
    n_params: int | None = None
    dags: dict[str, GraphSnapshot] = Field(default_factory=dict)
    metrics: dict[str, float] = Field(default_factory=dict)


class SeriesDoc(BaseModel):
    """A metric time series on either the epoch or growth-step axis."""

    key: str
    axis: Axis
    points: list[list[float]] = Field(default_factory=list)  # [[x, y], ...]


class RunSummary(BaseModel):
    run_id: str
    name: str
    project: str | None = None
    dataset: str | None = None
    created_at: str | None = None
    n_steps: int = 0
    dag_names: list[str] = Field(default_factory=list)
    summary: dict[str, Any] = Field(default_factory=dict)


class RunBundle(BaseModel):
    """Everything the player needs for one run, in one response."""

    run: RunSummary
    config: dict[str, Any] = Field(default_factory=dict)
    steps: list[StepDoc] = Field(default_factory=list)
    series: list[SeriesDoc] = Field(default_factory=list)
