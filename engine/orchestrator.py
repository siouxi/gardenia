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
from core.variable_registry import get_registry, reset_registry, VariableScope
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
    
    def __init__(self, backend: str = "local"):
        self.registry = get_registry()
        self.worker = get_worker_manager()
        self.storage = get_storage()
        self._current_executor: Optional[DAGExecutor] = None
        self._backend = backend  # "local" | "ray"
    
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
    
    async def execute_workflow(self, workflow_data: Dict[str, Any],
                               start_from: Optional[str] = None,
                               only_node: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute a workflow.
        
        Args:
            workflow_data: Workflow with nodes and edges
            start_from: If set, execute only this node and its downstream descendants
            only_node: If set, execute only this single node
        
        Returns:
            Execution results
        """
        is_partial = bool(start_from or only_node)
        
        # Clear workflow-scope variables from previous run (skip for partial runs
        # so upstream data remains available)
        if not is_partial:
            self.registry.clear_workflow()
        
        # Parse workflow
        nodes, edges = self._parse_workflow(workflow_data)
        
        if not nodes:
            return {"status": "error", "error": "No nodes in workflow"}
        
        # Create executor
        self._current_executor = DAGExecutor(
            nodes,
            edges,
            on_state_change=lambda n_id, state: self._send_message({
                "type": "state_change",
                "node_id": n_id,
                "state": state.value
            }),
            on_output=lambda n_id, text: self._send_message({
                "type": "output",
                "node_id": n_id,
                "output": text
            }),
            on_variables=lambda n_id, vars_list: self._send_message({
                "type": "node_variables",
                "node_id": n_id,
                "variables": vars_list
            })
        )
        
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

            # Auto-save datasets to storage
            if result.variables_created:
                for var_name in result.variables_created:
                    var = self.registry._get_from_scope(var_name, VariableScope.WORKFLOW, None)
                    if not var: continue
                    
                    # We can auto-save if it's explicitly marked as a dataframe 
                    # OR if duck typing says it's a pandas/arrow table in memory
                    val = var.value
                    is_df = var.is_dataframe
                    
                    if not is_df and val is not None:
                         if hasattr(val, 'to_parquet'): is_df = True
                         if hasattr(val, 'schema') and hasattr(val, 'num_rows'): is_df = True
                    
                    if is_df:
                        try:
                            # If it's a lazy IPC reference from R, we need to read it to convert to Parquet storage
                            if var.ipc_path and val is None:
                                import pyarrow.parquet as pq
                                import pyarrow.ipc as ipc
                                if var.ipc_path.endswith('.parquet'):
                                    data_to_save = pq.read_table(var.ipc_path)
                                else:
                                    import pyarrow as pa
                                    with pa.ipc.open_file(var.ipc_path) as reader:
                                        data_to_save = reader.read_all()
                                self.storage.write(var_name, data_to_save, source_node_id=node.id)
                            else:
                                # Normal memory dataframe
                                self.storage.write(var_name, val, source_node_id=node.id)
                                
                            log.info(f"Auto-saved dataset '{var_name}' to storage")
                        except Exception as e:
                            log.warning(f"Failed to auto-save dataset '{var_name}': {e}")

            return result.to_dict()
        
        async def execute_node_wrapper(node: DAGNode) -> Dict[str, Any]:
            """Wrapper that captures branch_handle for conditional routing."""
            result_dict = await execute_node(node)
            
            # Check if the node set __branch_handle__ (conditional routing)
            branch_var = self.registry._get_from_scope('__branch_handle__', VariableScope.WORKFLOW, None)
            if branch_var and branch_var.value:
                result_dict['branch_handle'] = branch_var.value
                # Clear it for the next node
                self.registry._workflow.pop('__branch_handle__', None)
            
            return result_dict
        
        try:
            # Use backend from request or default
            backend = workflow_data.get("backend", self._backend)
            results = await self._current_executor.execute(
                execute_node_wrapper, parallel=True, backend=backend,
                start_from=start_from, only_node=only_node
            )
            
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
            start_from = payload.get("start_from")
            only_node = payload.get("only_node")
            return await self.execute_workflow(payload, start_from=start_from,
                                              only_node=only_node)
            
        elif msg_type == "test_node":
            # AI Agent feedback loop: test a single node's code without entire DAG
            code = payload.get("code", "")
            language = payload.get("language", "python")
            parameters = payload.get("parameters", {})
            timeout = payload.get("timeout", 10)
            
            result = await self.worker.execute(
                code=code,
                language=language,
                node_id="test_node_sandbox",
                parameters=parameters,
                timeout=timeout,
            )
            return {"status": "success", "result": result.to_dict()}
            
        elif msg_type == "get_llm_context":
            # AI Agent context injection
            vars_info = self.get_variables()
            datasets = self.list_datasets()
            
            context_str = "Current Memory / Variables:\n"
            for v in vars_info:
                if v.get('is_dataframe'):
                    context_str += f"- DataFrame '{v['name']}': {v.get('preview', 'unknown shape')}\n"
                else:
                    context_str += f"- Variable '{v['name']}' ({v.get('type_hint')}): {v.get('value')}\n"
                    
            if not vars_info:
                context_str += "- (Empty)\n"
                
            return {"status": "success", "context": context_str, "raw_datasets": datasets}
        
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
        
        elif msg_type == "clear_datasets":
            self.storage.clear_all()
            return {"status": "success", "datasets": []}
        
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


# --- HTTP + WebSocket Server Setup ---
import aiohttp
from aiohttp import web

# Global sets of connected client queues (SSE and WebSocket share the same queue model)
sse_clients = set()
ws_clients = set()

# Monkey-patch _send_message so it pushes to all connected clients (SSE + WS)
def _queue_message(self, msg: Dict[str, Any]) -> None:
    for queue in sse_clients | ws_clients:
        try:
            queue.put_nowait(msg)
        except asyncio.QueueFull:
            pass

Orchestrator._send_message = _queue_message

async def handle_post_message(request):
    """Handle incoming JSON-RPC from Electron."""
    try:
        msg = await request.json()
        orchestrator = request.app['orchestrator']
        result = await orchestrator.handle_message(msg)
        return web.json_response({"type": "response", **(result or {})})
    except json.JSONDecodeError as e:
        return web.json_response({"type": "error", "error": f"Invalid JSON: {e}"}, status=400)
    except Exception as e:
        log.error(f"Error processing message: {e}")
        return web.json_response({"type": "error", "error": str(e)}, status=500)

async def handle_ws(request):
    """WebSocket endpoint for real-time bidirectional communication with Electron."""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    log.debug("WebSocket client connected")
    
    # Create a queue for this connection
    client_queue = asyncio.Queue(maxsize=1000)
    ws_clients.add(client_queue)
    
    # Send ready signal
    await ws.send_json({"type": "ready", "version": "1.0.0"})
    
    # Task to forward queued messages to the WebSocket
    async def forward_events():
        try:
            while not ws.closed:
                msg = await client_queue.get()
                if not ws.closed:
                    await ws.send_json(msg)
        except (asyncio.CancelledError, ConnectionResetError):
            pass
    
    forward_task = asyncio.create_task(forward_events())
    
    try:
        async for ws_msg in ws:
            if ws_msg.type == aiohttp.WSMsgType.TEXT:
                # Handle incoming messages from Electron over WebSocket
                try:
                    data = json.loads(ws_msg.data)
                    orchestrator = request.app['orchestrator']
                    result = await orchestrator.handle_message(data)
                    await ws.send_json({"type": "response", **(result or {})})
                except json.JSONDecodeError:
                    await ws.send_json({"type": "error", "error": "Invalid JSON"})
                except Exception as e:
                    await ws.send_json({"type": "error", "error": str(e)})
            elif ws_msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSE):
                break
    except Exception as e:
        log.warning(f"WebSocket error: {e}")
    finally:
        forward_task.cancel()
        ws_clients.discard(client_queue)
        log.debug("WebSocket client disconnected")
    
    return ws

async def handle_sse(request):
    """Server-Sent Events endpoint (fallback) to stream real-time updates back to Electron."""
    response = web.StreamResponse()
    response.headers['Content-Type'] = 'text/event-stream'
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['Connection'] = 'keep-alive'
    
    await response.prepare(request)
    
    client_queue = asyncio.Queue(maxsize=1000)
    sse_clients.add(client_queue)
    
    ready_msg = json.dumps({"type": "ready", "version": "1.0.0"})
    await response.write(f"data: {ready_msg}\n\n".encode('utf-8'))
    
    try:
        while True:
            msg = await client_queue.get()
            data_str = json.dumps(msg)
            await response.write(f"data: {data_str}\n\n".encode('utf-8'))
    except asyncio.CancelledError:
        pass
    except Exception as e:
        log.warning(f"SSE client disconnected: {e}")
    finally:
        sse_clients.remove(client_queue)
        
    return response

async def init_app(backend: str = "local"):
    app = web.Application()
    app['orchestrator'] = Orchestrator(backend=backend)
    app.router.add_post('/message', handle_post_message)
    app.router.add_get('/ws', handle_ws)
    app.router.add_get('/events', handle_sse)
    return app

async def start_server(backend: str = "local"):
    # Initialize Ray if Ray backend is selected
    if backend == "ray":
        from core.ray_backend import ensure_ray
        ensure_ray()
        log.info("Ray backend enabled — nodes will run as distributed tasks")

    app = await init_app(backend=backend)
    runner = web.AppRunner(app)
    await runner.setup()
    
    # Bind to port 0 to get an OS-assigned available port
    site = web.TCPSite(runner, '127.0.0.1', 0)
    await site.start()
    
    actual_port = site._server.sockets[0].getsockname()[1]
    log.info(f"Starting Orchestrator HTTP IPC server on dynamic port {actual_port}")
    
    # Print the port so the Electron host knows where to connect
    print(json.dumps({"type": "server_started", "port": actual_port, "backend": backend}), flush=True)
    
    # Keep the server running
    await asyncio.Event().wait()

def main():
    """Main entry point - run an internal HTTP server on an ephemeral port"""
    import argparse
    parser = argparse.ArgumentParser(description="Gardenia DAG Engine")
    parser.add_argument(
        "--backend", choices=["local", "ray"], default="local",
        help="Execution backend: 'local' (asyncio) or 'ray' (distributed)"
    )
    args = parser.parse_args()
    asyncio.run(start_server(backend=args.backend))


if __name__ == "__main__":
    main()
