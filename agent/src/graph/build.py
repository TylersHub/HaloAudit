"""Build and execute the LangGraph audit pipeline."""

import logging
from typing import Callable

from langgraph.graph import END, StateGraph

from ..config import Config
from ..edge_client import EdgeClient
from ..gemini import GeminiClient
from ..r2 import R2Client
from ..state import RunState
from . import nodes

logger = logging.getLogger(__name__)


def build_graph(config: Config) -> Callable[[RunState], RunState]:
    """
    Build the LangGraph audit pipeline.

    Args:
        config: Application configuration

    Returns:
        Callable that executes the graph
    """
    # Initialize clients
    r2_client = R2Client(config)
    edge_client = EdgeClient(config)
    gemini_client = GeminiClient(config, edge_client)

    # Create the graph
    workflow = StateGraph(RunState)

    # Add nodes with dependencies injected
    workflow.add_node("ingest", lambda state: nodes.ingest(state, r2_client, edge_client))
    workflow.add_node(
        "extract",
        lambda state: nodes.extract_text_with_gemini(state, gemini_client, edge_client),
    )
    workflow.add_node("chunk", lambda state: nodes.chunk(state, edge_client))
    workflow.add_node("embed", lambda state: nodes.embed(state, gemini_client, edge_client))
    workflow.add_node("index", lambda state: nodes.index(state, edge_client))
    workflow.add_node("checks", lambda state: nodes.checks(state, edge_client))
    workflow.add_node(
        "analyze", lambda state: nodes.analyze(state, gemini_client, edge_client)
    )
    workflow.add_node("report", lambda state: nodes.report(state, r2_client, edge_client))
    workflow.add_node("persist", lambda state: nodes.persist(state, edge_client))

    # Define edges (linear pipeline)
    workflow.set_entry_point("ingest")
    workflow.add_edge("ingest", "extract")
    workflow.add_edge("extract", "chunk")
    workflow.add_edge("chunk", "embed")
    workflow.add_edge("embed", "index")
    workflow.add_edge("index", "checks")
    workflow.add_edge("checks", "analyze")
    workflow.add_edge("analyze", "report")
    workflow.add_edge("report", "persist")
    workflow.add_edge("persist", END)

    # Compile the graph
    app = workflow.compile()

    def run_pipeline(state: RunState) -> RunState:
        """
        Execute the pipeline for a given state.

        Args:
            state: Initial run state

        Returns:
            Final run state after all nodes
        """
        logger.info(f"Starting pipeline for run {state.run_id}")

        try:
            # Run the graph
            final_state = app.invoke(state)
            if isinstance(final_state, dict):
                final_state = RunState.model_validate(final_state)
            logger.info(f"Pipeline completed for run {state.run_id}")
            return final_state

        except Exception as e:
            logger.error(f"Pipeline failed for run {state.run_id}: {e}", exc_info=True)
            state.error = str(e)
            # Attempt to persist error state
            try:
                nodes.persist(state, edge_client)
            except Exception as persist_error:
                logger.error(f"Failed to persist error state: {persist_error}")
            return state

    return run_pipeline


class PipelineRunner:
    """Runner for the audit pipeline with resource management."""

    def __init__(self, config: Config):
        self.config = config
        self.pipeline = build_graph(config)

    def run(self, run_id: str, tenant_id: str, r2_key: str) -> RunState:
        """
        Run the pipeline for a given job.

        Args:
            run_id: Unique run identifier
            tenant_id: Tenant identifier
            r2_key: R2 object key

        Returns:
            Final run state
        """
        # Create initial state
        state = RunState(
            run_id=run_id,
            tenant_id=tenant_id,
            r2_key=r2_key,
        )

        # Execute pipeline
        return self.pipeline(state)

