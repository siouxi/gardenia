"""
DAG Execution Engine
====================

Implements topological execution of workflow graphs with:
- Kahn's algorithm for execution order
- Parallel execution of independent nodes
- Real-time state tracking and event emission
"""

from __future__ import annotations
import asyncio
import json
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set
import logging

logging.basicConfig(level=logging.INFO, format='%(message)s')
log = logging.getLogger(__name__)


class ExecutionState(Enum):
    """Node execution states"""
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    ERROR = "error"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


@dataclass
class DAGNode:
    """Represents a node in the execution DAG"""
    id: str
    label: str
    tool_id: str
    code: str = ""
    language: str = "python"  # 'python' | 'r'
    parameters: Dict[str, Any] = field(default_factory=dict)
    state: ExecutionState = ExecutionState.PENDING
    output: str = ""
    error: Optional[str] = None
    timeout: int = 60  # Execution timeout in seconds
    memory_limit: int = 512  # Memory limit in MB (Python only)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "tool_id": self.tool_id,
            "code": self.code,
            "language": self.language,
            "parameters": self.parameters,
            "state": self.state.value,
            "output": self.output,
            "error": self.error,
            "timeout": self.timeout,
            "memory_limit": self.memory_limit,
        }


@dataclass
class DAGEdge:
    """Represents an edge (connection) in the DAG"""
    source: str
    target: str
    source_handle: Optional[str] = None
    target_handle: Optional[str] = None


class DAGExecutor:
    """
    Executes a workflow DAG with topological ordering.
    
    Features:
    - Topological sort using Kahn's algorithm
    - Async execution with parallel independent nodes
    - State tracking and event callbacks
    - Cancellation support
    """
    
    def __init__(
        self,
        nodes: List[DAGNode],
        edges: List[DAGEdge],
        on_state_change: Optional[Callable[[str, ExecutionState], None]] = None,
        on_output: Optional[Callable[[str, str], None]] = None,
        on_variables: Optional[Callable[[str, List[str]], None]] = None,
    ):
        self.nodes: Dict[str, DAGNode] = {n.id: n for n in nodes}
        self.edges: List[DAGEdge] = edges
        self.on_state_change = on_state_change
        self.on_output = on_output
        self.on_variables = on_variables
        
        # Build adjacency lists
        self._adjacency: Dict[str, List[str]] = defaultdict(list)  # node -> successors
        self._reverse_adjacency: Dict[str, List[str]] = defaultdict(list)  # node -> predecessors
        self._in_degree: Dict[str, int] = defaultdict(int)
        
        # Handle-aware edge lookup: source_id -> [(target_id, source_handle)]
        self._edges_by_source: Dict[str, List[tuple]] = defaultdict(list)
        
        for edge in edges:
            self._adjacency[edge.source].append(edge.target)
            self._reverse_adjacency[edge.target].append(edge.source)
            self._in_degree[edge.target] += 1
            self._edges_by_source[edge.source].append((edge.target, edge.source_handle))
        
        # Ensure all nodes have an in_degree entry
        for node_id in self.nodes:
            if node_id not in self._in_degree:
                self._in_degree[node_id] = 0
        
        self._cancelled = False
        self._cancel_event = asyncio.Event()
        self._active_tasks: Set[asyncio.Task] = set()
        self._execute_node_fn: Optional[Callable] = None
        self._branch_results: Dict[str, str] = {}  # node_id -> chosen branch handle
    
    def get_downstream_nodes(self, start_id: str) -> Set[str]:
        """
        BFS from start_id to find all downstream (descendant) node IDs.
        Does NOT include start_id itself.
        """
        visited: Set[str] = set()
        queue: List[str] = [start_id]
        while queue:
            current = queue.pop(0)
            for successor in self._adjacency.get(current, []):
                if successor not in visited:
                    visited.add(successor)
                    queue.append(successor)
        return visited
    
    def get_topological_order(self) -> List[str]:
        """
        Compute execution order using Kahn's algorithm.
        Returns list of node IDs in topological order.
        """
        in_degree = self._in_degree.copy()
        queue: List[str] = []
        order: List[str] = []
        
        # Start with nodes having 0 in-degree
        for node_id, degree in in_degree.items():
            if degree == 0:
                queue.append(node_id)
        
        while queue:
            node_id = queue.pop(0)
            order.append(node_id)
            
            for successor in self._adjacency[node_id]:
                in_degree[successor] -= 1
                if in_degree[successor] == 0:
                    queue.append(successor)
        
        # Check for cycles
        if len(order) != len(self.nodes):
            cycle_nodes = set(self.nodes.keys()) - set(order)
            raise ValueError(f"Cycle detected in DAG involving nodes: {cycle_nodes}")
        
        return order
    
    def get_parallel_batches(self) -> List[List[str]]:
        """
        Group nodes into parallel execution batches.
        Nodes in the same batch can run concurrently.
        """
        in_degree = self._in_degree.copy()
        batches: List[List[str]] = []
        remaining = set(self.nodes.keys())
        
        while remaining:
            # Find all nodes with 0 in-degree
            batch = [n for n in remaining if in_degree[n] == 0]
            if not batch:
                raise ValueError("Cycle detected in DAG")
            
            batches.append(batch)
            
            # Remove batch nodes and update in-degrees
            for node_id in batch:
                remaining.remove(node_id)
                for successor in self._adjacency[node_id]:
                    in_degree[successor] -= 1
        
        return batches
    
    def _update_state(self, node_id: str, state: ExecutionState) -> None:
        """Update node state and emit callback"""
        self.nodes[node_id].state = state
        if self.on_state_change:
            self.on_state_change(node_id, state)
    
    def _emit_output(self, node_id: str, output: str) -> None:
        """Emit node output via callback"""
        self.nodes[node_id].output = output
        if self.on_output:
            self.on_output(node_id, output)

    def _emit_variables(self, node_id: str, variables: List[str]) -> None:
        """Emit created variables via callback"""
        if getattr(self, 'on_variables', None):
            self.on_variables(node_id, variables)
    
    async def _execute_single_wrapper(self, node_id: str) -> Dict[str, Any]:
        """Wrapper to catch cancellation properly"""
        try:
            return await self._execute_single(node_id)
        except asyncio.CancelledError:
            self._update_state(node_id, ExecutionState.CANCELLED)
            return {"status": "cancelled", "error": "Execution cancelled"}

    async def execute(
        self,
        execute_node_fn: Callable[[DAGNode], Any],
        parallel: bool = False,
        start_from: Optional[str] = None,
        only_node: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute the DAG.
        
        Args:
            execute_node_fn: Async function to execute a single node
            parallel: If True, run independent nodes in parallel using an event-driven queue
            start_from: If set, skip all nodes upstream of this node and execute only
                        this node + its downstream descendants.
            only_node: If set, execute ONLY this single node (all others are skipped).
        """
        self._execute_node_fn = execute_node_fn
        results: Dict[str, Any] = {}
        
        # --- Partial execution filtering ---
        skip_ids: Set[str] = set()
        if only_node:
            # Execute only the specified node, skip everything else
            skip_ids = set(self.nodes.keys()) - {only_node}
        elif start_from:
            # Execute start_from + all downstream, skip everything else
            downstream = self.get_downstream_nodes(start_from)
            execute_ids = {start_from} | downstream
            skip_ids = set(self.nodes.keys()) - execute_ids
        
        # Mark skipped nodes
        for sid in skip_ids:
            self._update_state(sid, ExecutionState.SKIPPED)
            results[sid] = {"status": "skipped", "output": "Skipped (partial execution)"}
        
        try:
            if parallel:
                in_degree = self._in_degree.copy()
                ready_queue = asyncio.Queue()
                
                for node_id, degree in in_degree.items():
                    if degree == 0:
                        ready_queue.put_nowait(node_id)
                        
                self._active_tasks.clear()
                processed_count = len(skip_ids)  # Already-skipped nodes count as processed
                total_nodes = len(self.nodes)
                
                if total_nodes > 0 and ready_queue.empty():
                    raise ValueError("Cycle detected in DAG")
                
                error_occurred = False
                
                while processed_count < total_nodes and not (self._cancelled or error_occurred):
                    # Drain queue and start tasks
                    while not ready_queue.empty() and not (self._cancelled or error_occurred):
                        node_id = ready_queue.get_nowait()
                        # Skip nodes already marked as SKIPPED (partial execution)
                        if node_id in skip_ids:
                            # Still unlock successors
                            for successor in self._adjacency[node_id]:
                                in_degree[successor] -= 1
                                if in_degree[successor] == 0:
                                    ready_queue.put_nowait(successor)
                            continue
                        self._update_state(node_id, ExecutionState.QUEUED)
                        task = asyncio.create_task(self._execute_single_wrapper(node_id))
                        setattr(task, "node_id", node_id)
                        self._active_tasks.add(task)
                    
                    if not self._active_tasks:
                        if processed_count < total_nodes:
                            raise ValueError(f"Cycle detected or unreachable nodes remaining. Processed {processed_count}/{total_nodes}")
                        break
                        
                    # Wait for tasks or cancellation
                    cancel_task = asyncio.create_task(self._cancel_event.wait())
                    wait_tasks = [cancel_task] + list(self._active_tasks)
                    
                    done, pending = await asyncio.wait(wait_tasks, return_when=asyncio.FIRST_COMPLETED)
                    
                    if cancel_task in done:
                        # Cancelled from outside
                        break
                    else:
                        cancel_task.cancel()
                        
                    for task in done:
                        if task == cancel_task: continue
                        self._active_tasks.remove(task)
                        node_id = getattr(task, "node_id")
                        result = task.result()
                        results[node_id] = result
                        processed_count += 1
                        
                        node = self.nodes[node_id]
                        if node.state == ExecutionState.ERROR and node.tool_id not in ('flow-start', 'flow-end'):
                            error_occurred = True
                            break
                            
                        # Unlock successors (branch-aware)
                        if not (self._cancelled or error_occurred):
                            active_targets = self._get_branch_successors(node_id)
                            skipped_targets = set(self._adjacency[node_id]) - active_targets
                            
                            for successor in active_targets:
                                in_degree[successor] -= 1
                                if in_degree[successor] == 0:
                                    ready_queue.put_nowait(successor)
                            
                            # Mark skipped branch targets
                            for skipped_id in skipped_targets:
                                if skipped_id not in skip_ids:
                                    self._update_state(skipped_id, ExecutionState.SKIPPED)
                                    results[skipped_id] = {"status": "skipped", "output": "Branch not taken"}
                                    processed_count += 1
                                    # Also propagate skip to their successors' in_degree
                                    in_degree[skipped_id] -= 1
                                    
                # Cleanup and mark remaining as skipped/cancelled
                if self._cancelled or error_occurred:
                    for task in self._active_tasks:
                        task.cancel()
                        
                    if self._active_tasks:
                        await asyncio.gather(*self._active_tasks, return_exceptions=True)
                        self._active_tasks.clear()
                        
                    for node_id, node in self.nodes.items():
                        if node.state in (ExecutionState.PENDING, ExecutionState.QUEUED):
                            new_state = ExecutionState.CANCELLED if self._cancelled else ExecutionState.SKIPPED
                            self._update_state(node_id, new_state)
                            
            else:
                # Sequential execution
                order = self.get_topological_order()
                for node_id in order:
                    if self._cancelled:
                        self._update_state(node_id, ExecutionState.CANCELLED)
                        continue
                    
                    # Skip nodes already marked as SKIPPED (partial execution)
                    if node_id in skip_ids:
                        continue
                    
                    result = await self._execute_single(node_id)
                    results[node_id] = result
                    
                    # Handle branch-aware skipping in sequential mode
                    node = self.nodes[node_id]
                    if node_id in self._branch_results:
                        skipped_targets = set(self._adjacency[node_id]) - self._get_branch_successors(node_id)
                        for skipped_id in skipped_targets:
                            skip_ids.add(skipped_id)
                            self._update_state(skipped_id, ExecutionState.SKIPPED)
                            results[skipped_id] = {"status": "skipped", "output": "Branch not taken"}
                    
                    # Stop on error (unless it's START/END)
                    node = self.nodes[node_id]
                    if node.state == ExecutionState.ERROR:
                        if node.tool_id not in ('flow-start', 'flow-end'):
                            # Mark remaining nodes as skipped
                            remaining_idx = order.index(node_id) + 1
                            for remaining_id in order[remaining_idx:]:
                                self._update_state(remaining_id, ExecutionState.SKIPPED)
                            break
        
        except Exception as e:
            log.error(f"DAG execution failed: {e}")
            raise
        
        return results
    
    async def _execute_single(self, node_id: str) -> Dict[str, Any]:
        """Execute a single node"""
        node = self.nodes[node_id]
        
        # Skip START and END nodes
        if node.tool_id == 'flow-start':
            self._update_state(node_id, ExecutionState.SUCCESS)
            self._emit_output(node_id, "Workflow started")
            return {"status": "success", "output": "started"}
        
        if node.tool_id == 'flow-end':
            self._update_state(node_id, ExecutionState.SUCCESS)
            self._emit_output(node_id, "Workflow completed")
            return {"status": "success", "output": "completed"}
        
        self._update_state(node_id, ExecutionState.RUNNING)
        
        try:
            result = await self._execute_node_fn(node)
            
            # Capture branch_handle for conditional routing
            if 'branch_handle' in result:
                self._branch_results[node_id] = result['branch_handle']
            
            status = result.get("status")
            if status == "success":
                self._update_state(node_id, ExecutionState.SUCCESS)
                self._emit_output(node_id, result.get("output", ""))
                
                # Emit created variables if any
                created_vars = result.get("variables_created")
                if created_vars:
                    # Convert set to list for JSON serialization
                    var_list = list(created_vars) if isinstance(created_vars, set) else created_vars
                    self._emit_variables(node_id, var_list)
            elif status == "timeout":
                self._update_state(node_id, ExecutionState.TIMEOUT)
                node.error = result.get("error", "Execution timed out")
                self._emit_output(node_id, f"Timeout: {node.error}")
            else:
                self._update_state(node_id, ExecutionState.ERROR)
                node.error = result.get("error", "Unknown error")
                self._emit_output(node_id, f"Error: {node.error}")
            
            return result
        
        except Exception as e:
            self._update_state(node_id, ExecutionState.ERROR)
            node.error = str(e)
            self._emit_output(node_id, f"Exception: {e}")
            return {"status": "error", "error": str(e)}
    
    def _get_branch_successors(self, node_id: str) -> Set[str]:
        """Get valid successors for a node, respecting branch routing.
        If the node has a branch_handle, only return successors connected
        via edges matching that handle. Otherwise, return all successors.
        """
        if node_id not in self._branch_results:
            return set(self._adjacency[node_id])
        
        chosen_handle = self._branch_results[node_id]
        valid_targets = set()
        for target, handle in self._edges_by_source[node_id]:
            if handle == chosen_handle:
                valid_targets.add(target)
        return valid_targets
    
    def cancel(self) -> None:
        """Cancel ongoing execution"""
        self._cancelled = True
        self._cancel_event.set()
        for task in self._active_tasks:
            task.cancel()
        for node_id, node in self.nodes.items():
            if node.state in (ExecutionState.PENDING, ExecutionState.QUEUED):
                self._update_state(node_id, ExecutionState.CANCELLED)
    
    def get_state_summary(self) -> Dict[str, Any]:
        """Get summary of all node states"""
        return {
            node_id: {
                "label": node.label,
                "state": node.state.value,
                "output": node.output,
                "error": node.error,
            }
            for node_id, node in self.nodes.items()
        }


# CLI entry point for testing
if __name__ == "__main__":
    async def mock_execute(node: DAGNode):
        await asyncio.sleep(0.1)  # Simulate work
        return {"status": "success", "output": f"Executed {node.label}"}
    
    # Example DAG
    nodes = [
        DAGNode("1", "START", "flow-start"),
        DAGNode("2", "Process", "python-node", code="print('hello')"),
        DAGNode("3", "END", "flow-end"),
    ]
    edges = [
        DAGEdge("1", "2"),
        DAGEdge("2", "3"),
    ]
    
    executor = DAGExecutor(nodes, edges)
    print(f"Execution order: {executor.get_topological_order()}")
    
    asyncio.run(executor.execute(mock_execute))
