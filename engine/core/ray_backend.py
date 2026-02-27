"""
Ray Distributed Backend
========================

Provides a Ray-based execution backend for DAG workflows.
Independent nodes are dispatched as @ray.remote tasks, enabling:
- True multi-core parallelism via Ray worker processes
- Future scale-out to remote Ray clusters
- Automatic task scheduling and resource management

Usage:
    from core.ray_backend import RayDAGRunner, ensure_ray

    ensure_ray()  # Initialize Ray (idempotent)
    runner = RayDAGRunner(nodes, edges, callbacks...)
    results = await runner.execute(skip_ids)
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any, Callable, Dict, List, Optional, Set

log = logging.getLogger(__name__)

# Lazy imports — Ray is optional
_ray = None


def _get_ray():
    """Lazy-import Ray to avoid hard dependency at module level."""
    global _ray
    if _ray is None:
        try:
            import ray
            _ray = ray
        except ImportError:
            raise ImportError(
                "Ray is required for the distributed backend. "
                "Install it with: pip install 'ray>=2.9.0'"
            )
    return _ray


def ensure_ray(**kwargs) -> None:
    """
    Initialize Ray if not already running.

    Args:
        **kwargs: Forwarded to ray.init() (e.g. num_cpus, address).
                  Default: local mode with all available CPUs.
    """
    ray = _get_ray()
    if not ray.is_initialized():
        init_kwargs = {"ignore_reinit_error": True}
        init_kwargs.update(kwargs)
        ray.init(**init_kwargs)
        log.info(
            f"Ray initialized — resources: {ray.cluster_resources()}"
        )


def shutdown_ray() -> None:
    """Shutdown Ray if running."""
    ray = _get_ray()
    if ray.is_initialized():
        ray.shutdown()
        log.info("Ray shut down")


# ---------------------------------------------------------------------------
# Ray remote task — executes a single node in a Ray worker process
# ---------------------------------------------------------------------------

def _get_remote_execute_node():
    """
    Returns a @ray.remote decorated function for node execution.
    Defined as a factory to defer decoration until Ray is loaded.
    """
    ray = _get_ray()

    @ray.remote
    def execute_node_remote(
        code: str,
        language: str,
        node_id: str,
        parameters: Dict[str, Any],
        timeout: int = 60,
        memory_limit_mb: int = 512,
        upstream_vars: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Execute a single node's code inside a Ray worker process.

        This function runs in an isolated Ray worker. It creates a fresh
        PythonWorker or RWorkerBridge, injects upstream variables, runs the
        code, and returns the result as a serializable dict.

        Args:
            code: Source code to execute
            language: 'python' or 'r'
            node_id: Unique node identifier
            parameters: Node parameters to inject
            timeout: Max execution time in seconds
            memory_limit_mb: Memory limit (Python only)
            upstream_vars: Variables from upstream nodes to inject

        Returns:
            Dict with 'status', 'output', 'error', 'variables_created'
        """
        import asyncio as _asyncio
        from core.variable_registry import VariableRegistry, VariableScope
        from core.worker_manager import PythonWorker, RWorkerBridge

        # Create a fresh registry for this task
        registry = VariableRegistry()

        # Inject upstream variables into the registry
        if upstream_vars:
            for name, value in upstream_vars.items():
                registry.set(
                    name=name,
                    value=value,
                    scope=VariableScope.WORKFLOW,
                    node_id="upstream",
                )

        if language == "python":
            worker = PythonWorker(registry)
            result = worker.execute(
                code, node_id, parameters, timeout, memory_limit_mb
            )
        elif language == "r":
            worker = RWorkerBridge(registry)
            loop = _asyncio.new_event_loop()
            try:
                result = loop.run_until_complete(
                    worker.execute(code, node_id, parameters, timeout=timeout)
                )
            finally:
                loop.close()
                worker.stop()
        else:
            from core.worker_manager import ExecutionResult
            result = ExecutionResult(
                status="error",
                output="",
                error=f"Unsupported language: {language}",
            )

        result_dict = result.to_dict()

        # Collect new variables created by this node
        created_vars = {}
        if result.variables_created:
            for var_name in result.variables_created:
                var = registry._get_from_scope(
                    var_name, VariableScope.WORKFLOW, None
                )
                if var and var.value is not None:
                    created_vars[var_name] = var.value

        result_dict["_created_vars"] = created_vars
        return result_dict

    return execute_node_remote


# ---------------------------------------------------------------------------
# RayDAGRunner — event-driven DAG execution via Ray
# ---------------------------------------------------------------------------

class RayDAGRunner:
    """
    Executes a DAG using Ray remote tasks.

    Mirrors the event-driven parallel execution logic from DAGExecutor,
    but dispatches each node as a Ray remote task instead of an asyncio
    coroutine. Supports:
    - Branch-aware successor management
    - Cancellation
    - State change and output callbacks
    """

    def __init__(
        self,
        nodes: Dict[str, Any],          # node_id -> DAGNode
        edges: List[Any],               # DAGEdge list
        adjacency: Dict[str, List[str]],
        in_degree: Dict[str, int],
        edges_by_source: Dict[str, List[tuple]],
        on_state_change: Optional[Callable] = None,
        on_output: Optional[Callable] = None,
        on_variables: Optional[Callable] = None,
    ):
        self.nodes = nodes
        self.edges = edges
        self._adjacency = adjacency
        self._in_degree = in_degree
        self._edges_by_source = edges_by_source
        self.on_state_change = on_state_change
        self.on_output = on_output
        self.on_variables = on_variables

        self._cancelled = False
        self._branch_results: Dict[str, str] = {}  # node_id -> chosen branch
        self._node_vars: Dict[str, Dict[str, Any]] = {}  # node_id -> vars created
        self._pending_refs: Dict[str, Any] = {}  # node_id -> ray.ObjectRef

    def _update_state(self, node_id: str, state) -> None:
        """Update node state and emit callback."""
        from core.dag_engine import ExecutionState
        self.nodes[node_id].state = state
        if self.on_state_change:
            self.on_state_change(node_id, state)

    def _emit_output(self, node_id: str, output: str) -> None:
        """Emit node output via callback."""
        self.nodes[node_id].output = output
        if self.on_output:
            self.on_output(node_id, output)

    def _emit_variables(self, node_id: str, variables: List[str]) -> None:
        """Emit created variables via callback."""
        if self.on_variables:
            self.on_variables(node_id, variables)

    def _get_branch_successors(self, node_id: str) -> Set[str]:
        """Get valid successors respecting branch routing."""
        if node_id not in self._branch_results:
            return set(self._adjacency.get(node_id, []))

        chosen_handle = self._branch_results[node_id]
        valid_targets = set()
        for target, handle in self._edges_by_source.get(node_id, []):
            if handle == chosen_handle:
                valid_targets.add(target)
        return valid_targets

    def _collect_upstream_vars(self, node_id: str) -> Dict[str, Any]:
        """
        Gather variables from all upstream nodes that have completed.
        These will be injected into the Ray task's fresh registry.
        """
        # Walk all predecessor nodes (transitive) and collect their vars
        upstream = {}
        visited = set()
        queue = list(self._get_predecessors(node_id))

        while queue:
            pred = queue.pop(0)
            if pred in visited:
                continue
            visited.add(pred)
            if pred in self._node_vars:
                upstream.update(self._node_vars[pred])
            # Also traverse their predecessors
            for pp in self._get_predecessors(pred):
                if pp not in visited:
                    queue.append(pp)

        return upstream

    def _get_predecessors(self, node_id: str) -> List[str]:
        """Get direct predecessors of a node."""
        preds = []
        for src, targets in self._adjacency.items():
            if node_id in targets:
                preds.append(src)
        return preds

    async def execute(
        self,
        skip_ids: Set[str],
        execute_node_fn: Optional[Callable] = None,
    ) -> Dict[str, Any]:
        """
        Execute the DAG using Ray remote tasks.

        Args:
            skip_ids: Node IDs to skip (partial execution)
            execute_node_fn: Optional callback for special nodes
                            (flow-start, flow-end). If None, handled internally.

        Returns:
            Dict of node_id -> execution result
        """
        from core.dag_engine import ExecutionState

        ray = _get_ray()
        ensure_ray()
        execute_remote = _get_remote_execute_node()

        results: Dict[str, Any] = {}
        in_degree = self._in_degree.copy()

        # Initialize ready queue with zero in-degree nodes
        ready_queue: List[str] = []
        for node_id, degree in in_degree.items():
            if degree == 0:
                ready_queue.append(node_id)

        processed_count = len(skip_ids)
        total_nodes = len(self.nodes)
        error_occurred = False

        while processed_count < total_nodes and not (self._cancelled or error_occurred):
            # Dispatch ready nodes
            newly_dispatched = []
            while ready_queue and not (self._cancelled or error_occurred):
                node_id = ready_queue.pop(0)

                if node_id in skip_ids:
                    # Still unlock successors
                    for successor in self._adjacency.get(node_id, []):
                        in_degree[successor] -= 1
                        if in_degree[successor] == 0:
                            ready_queue.append(successor)
                    continue

                node = self.nodes[node_id]

                # Handle flow-start and flow-end locally (no need for Ray)
                if node.tool_id == 'flow-start':
                    self._update_state(node_id, ExecutionState.SUCCESS)
                    self._emit_output(node_id, "Workflow started")
                    results[node_id] = {"status": "success", "output": "started"}
                    processed_count += 1
                    for successor in self._adjacency.get(node_id, []):
                        in_degree[successor] -= 1
                        if in_degree[successor] == 0:
                            ready_queue.append(successor)
                    continue

                if node.tool_id == 'flow-end':
                    self._update_state(node_id, ExecutionState.SUCCESS)
                    self._emit_output(node_id, "Workflow completed")
                    results[node_id] = {"status": "success", "output": "completed"}
                    processed_count += 1
                    for successor in self._adjacency.get(node_id, []):
                        in_degree[successor] -= 1
                        if in_degree[successor] == 0:
                            ready_queue.append(successor)
                    continue

                # Dispatch real nodes to Ray
                self._update_state(node_id, ExecutionState.QUEUED)

                upstream_vars = self._collect_upstream_vars(node_id)

                ref = execute_remote.remote(
                    code=node.code,
                    language=node.language,
                    node_id=node.id,
                    parameters=node.parameters,
                    timeout=node.timeout,
                    memory_limit_mb=node.memory_limit,
                    upstream_vars=upstream_vars if upstream_vars else None,
                )
                self._pending_refs[node_id] = ref
                newly_dispatched.append(node_id)
                self._update_state(node_id, ExecutionState.RUNNING)

            if not self._pending_refs:
                if processed_count < total_nodes:
                    # Check if remaining nodes are all flow nodes handled above
                    break
                break

            # Wait for any task to complete
            ready_refs, _ = ray.wait(
                list(self._pending_refs.values()),
                num_returns=1,
                timeout=1.0,  # Poll every second for cancellation
            )

            if not ready_refs:
                # Timeout on ray.wait — check cancellation and loop
                continue

            # Process completed tasks
            for ref in ready_refs:
                # Find which node this ref belongs to
                completed_node_id = None
                for nid, r in self._pending_refs.items():
                    if r == ref:
                        completed_node_id = nid
                        break

                if completed_node_id is None:
                    continue

                del self._pending_refs[completed_node_id]

                try:
                    result = ray.get(ref)
                except Exception as e:
                    result = {"status": "error", "error": str(e), "output": ""}

                results[completed_node_id] = result
                processed_count += 1

                # Store created variables for downstream injection
                created_vars = result.pop("_created_vars", {})
                if created_vars:
                    self._node_vars[completed_node_id] = created_vars

                node = self.nodes[completed_node_id]
                status = result.get("status")

                if status == "success":
                    self._update_state(completed_node_id, ExecutionState.SUCCESS)
                    self._emit_output(completed_node_id, result.get("output", ""))

                    # Emit variables
                    vars_created = result.get("variables_created", [])
                    if vars_created:
                        self._emit_variables(completed_node_id, vars_created)

                elif status == "timeout":
                    self._update_state(completed_node_id, ExecutionState.TIMEOUT)
                    node.error = result.get("error", "Execution timed out")
                    self._emit_output(completed_node_id, f"Timeout: {node.error}")
                else:
                    self._update_state(completed_node_id, ExecutionState.ERROR)
                    node.error = result.get("error", "Unknown error")
                    self._emit_output(completed_node_id, f"Error: {node.error}")

                # Check for branch routing
                if "branch_handle" in result:
                    self._branch_results[completed_node_id] = result["branch_handle"]

                # Handle error — stop pipeline
                if node.state == ExecutionState.ERROR and node.tool_id not in ('flow-start', 'flow-end'):
                    error_occurred = True
                    break

                # Unlock successors (branch-aware)
                if not (self._cancelled or error_occurred):
                    active_targets = self._get_branch_successors(completed_node_id)
                    skipped_targets = set(self._adjacency.get(completed_node_id, [])) - active_targets

                    for successor in active_targets:
                        in_degree[successor] -= 1
                        if in_degree[successor] == 0:
                            ready_queue.append(successor)

                    # Mark skipped branch targets
                    for skipped_id in skipped_targets:
                        if skipped_id not in skip_ids:
                            self._update_state(skipped_id, ExecutionState.SKIPPED)
                            results[skipped_id] = {"status": "skipped", "output": "Branch not taken"}
                            processed_count += 1
                            in_degree[skipped_id] -= 1

        # Cleanup: cancel remaining Ray tasks
        if self._cancelled or error_occurred:
            for nid, ref in self._pending_refs.items():
                try:
                    ray.cancel(ref, force=True)
                except Exception:
                    pass
            self._pending_refs.clear()

            for node_id, node in self.nodes.items():
                if node.state in (ExecutionState.PENDING, ExecutionState.QUEUED):
                    new_state = ExecutionState.CANCELLED if self._cancelled else ExecutionState.SKIPPED
                    self._update_state(node_id, new_state)

        return results

    def cancel(self) -> None:
        """Cancel ongoing execution."""
        ray = _get_ray()
        self._cancelled = True
        for nid, ref in self._pending_refs.items():
            try:
                ray.cancel(ref, force=True)
            except Exception:
                pass
