"""
Gardenia Main Orchestrator
==========================

Entry point for the DAG execution engine.
Communicates with Electron via JSON-RPC style protocol over stdin/stdout.

Protocol:
- Input: JSON lines with {type, payload}
- Output: JSON lines with {type, node_id, state, output, etc.}
"""

from __future__ import annotations
import asyncio
import json
import sys
from typing import Any, Dict, List, Optional
import logging

# Add parent directory to path for imports
sys.path.insert(0, str(__file__).rsplit('/', 2)[0])

from core.dag_engine import DAGExecutor, DAGNode, DAGEdge, ExecutionState
from core.variable_registry import get_registry, reset_registry
from core.worker_manager import get_worker_manager, WorkerManager
from core.storage import get_storage, ArrowStorage

logging.basicConfig(
    level=logging.INFO,
    format='%(message)s',
    stream=sys.stderr  # Use stderr for logs, stdout for protocol
)
log = logging.getLogger(__name__)


class Orchestrator:
    """
    Main orchestrator that coordinates DAG execution.
    
    Bridges Node.js and Python execution:
    - Receives workflow data from Electron
    - Constructs DAG and executes it
    - Reports progress back via stdout
    """
    
    def __init__(self):
        self.registry = get_registry()
        self.worker = get_worker_manager()
        self.storage = get_storage()
        self._current_executor: Optional[DAGExecutor] = None
    
    def _send_message(self, msg: Dict[str, Any]) -> None:
        """Send JSON message to stdout"""
        print(json.dumps(msg), flush=True)
    
    def _parse_workflow(
        self,
        workflow_data: Dict[str, Any]
    ) -> tuple[List[DAGNode], List[DAGEdge]]:
        """Parse workflow data into DAG nodes and edges"""
        nodes = []
        for n in workflow_data.get("nodes", []):
            data = n.get("data", {})
            node = DAGNode(
                id=n["id"],
                label=data.get("label", "Unknown"),
                tool_id=data.get("toolId", ""),
                code=data.get("code", ""),
                language=data.get("language", "python"),
                parameters=data.get("parameterValues", {}),
                timeout=data.get("timeout", 60),
                memory_limit=data.get("memoryLimit", 512),
            )
            nodes.append(node)
        
        edges = []
        for e in workflow_data.get("edges", []):
            edge = DAGEdge(
                source=e["source"],
                target=e["target"],
                source_handle=e.get("sourceHandle"),
                target_handle=e.get("targetHandle"),
            )
            edges.append(edge)
        
        return nodes, edges
    
    async def execute_workflow(self, workflow_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a workflow.
        
        Args:
            workflow_data: Workflow with nodes and edges
        
        Returns:
            Execution results
        """
        # Clear workflow-scope variables from previous run
        self.registry.clear_workflow()
        
        # Parse workflow
        nodes, edges = self._parse_workflow(workflow_data)
        
        if not nodes:
            return {"status": "error", "error": "No nodes in workflow"}
        
        # Create executor
        self._current_executor = DAGExecutor(nodes, edges)
        
        # Send execution order
        try:
            order = self._current_executor.get_topological_order()
            self._send_message({
                "type": "execution_order",
                "order": order,
                "labels": [self._current_executor.nodes[n].label for n in order]
            })
        except ValueError as e:
            return {"status": "error", "error": str(e)}
        
        # Execute
        async def execute_node(node: DAGNode) -> Dict[str, Any]:
            result = await self.worker.execute(
                code=node.code,
                language=node.language,
                node_id=node.id,
                parameters=node.parameters,
                timeout=node.timeout,
                memory_limit_mb=node.memory_limit,
            )
            return result.to_dict()
        
        try:
            results = await self._current_executor.execute(execute_node, parallel=False)
            
            # Get final variable state
            variables = self.registry.list_variables()
            
            self._send_message({
                "type": "execution_complete",
                "status": "success",
                "variables": variables,
            })
            
            return {
                "status": "success",
                "results": {k: v for k, v in results.items()},
                "variables": variables,
            }
        
        except Exception as e:
            log.error(f"Execution failed: {e}")
            self._send_message({
                "type": "execution_complete",
                "status": "error",
                "error": str(e),
            })
            return {"status": "error", "error": str(e)}
        
        finally:
            self._current_executor = None
    
    def cancel(self) -> None:
        """Cancel current execution"""
        if self._current_executor:
            self._current_executor.cancel()
            self._send_message({"type": "cancelled"})
    
    def get_variables(self) -> List[Dict[str, Any]]:
        """Get current variable state"""
        return self.registry.list_variables()
    
    def list_datasets(self) -> List[Dict[str, Any]]:
        """List stored datasets"""
        return [m.to_dict() for m in self.storage.list_datasets()]
    
    def preview_dataset(
        self,
        name: str,
        n_rows: int = 10,
        include_stats: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """Get a preview of a stored dataset"""
        return self.storage.preview(name, n_rows, include_stats)
    
    def read_dataset(self, name: str) -> Optional[Dict[str, Any]]:
        """Read a dataset and return as JSON-serializable format"""
        data = self.storage.read(name)
        if data is None:
            return None
        
        # Convert to JSON-serializable format
        try:
            import pandas as pd
            if isinstance(data, pd.DataFrame):
                return {
                    "columns": list(data.columns),
                    "rows": data.to_dict(orient='records'),
                    "shape": list(data.shape),
                }
        except ImportError:
            pass
        
        # Arrow Table fallback
        return {
            "columns": [f.name for f in data.schema],
            "rows": data.to_pylist(),
        }
    
    async def handle_message(self, msg: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Handle incoming message from Node.js"""
        msg_type = msg.get("type")
        payload = msg.get("payload", {})
        
        if msg_type == "execute":
            return await self.execute_workflow(payload)
        
        elif msg_type == "cancel":
            self.cancel()
            return {"status": "cancelled"}
        
        elif msg_type == "get_variables":
            return {"status": "success", "variables": self.get_variables()}
        
        elif msg_type == "clear_variables":
            self.registry.clear()
            return {"status": "success", "variables": []}
        
        elif msg_type == "list_datasets":
            return {"status": "success", "datasets": self.list_datasets()}
        
        elif msg_type == "preview_dataset":
            name = payload.get("name")
            n_rows = payload.get("n_rows", 10)
            include_stats = payload.get("include_stats", False)
            
            preview = self.preview_dataset(name, n_rows, include_stats)
            if preview:
                return {"status": "success", "preview": preview}
            else:
                return {"status": "error", "error": f"Dataset '{name}' not found"}
        
        elif msg_type == "read_dataset":
            name = payload.get("name")
            data = self.read_dataset(name)
            if data:
                return {"status": "success", "data": data}
            else:
                return {"status": "error", "error": f"Dataset '{name}' not found"}
        
        elif msg_type == "ping":
            return {"status": "pong"}
        
        else:
            return {"status": "error", "error": f"Unknown message type: {msg_type}"}


async def main():
    """Main entry point - read JSON messages from stdin"""
    orchestrator = Orchestrator()
    
    # Send ready signal
    print(json.dumps({"type": "ready", "version": "1.0.0"}), flush=True)
    
    # Read messages from stdin
    loop = asyncio.get_event_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)
    
    while True:
        try:
            line = await reader.readline()
            if not line:
                break  # EOF
            
            try:
                msg = json.loads(line.decode().strip())
                result = await orchestrator.handle_message(msg)
                
                if result:
                    print(json.dumps({"type": "response", **result}), flush=True)
            
            except json.JSONDecodeError as e:
                print(json.dumps({
                    "type": "error",
                    "error": f"Invalid JSON: {e}"
                }), flush=True)
        
        except Exception as e:
            log.error(f"Error processing message: {e}")
            print(json.dumps({
                "type": "error", 
                "error": str(e)
            }), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
