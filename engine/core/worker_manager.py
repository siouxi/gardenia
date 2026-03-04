"""
Worker Manager
==============

Manages execution workers for different languages (Python, R).
Features:
- Worker pool management
- Code execution with variable injection
- Output capture and error handling
- Resource cleanup
"""

from __future__ import annotations
import asyncio
import io
import json
import sys
import traceback
import tempfile
import os
import shutil
from contextlib import redirect_stdout, redirect_stderr
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Dict, Optional, Set, List
import logging
from pathlib import Path

# Try importing pyarrow
try:
    import pyarrow as pa
    import pyarrow.ipc
    ARROW_AVAILABLE = True
except ImportError:
    ARROW_AVAILABLE = False

from .variable_registry import VariableRegistry, VariableScope, get_registry
from .plasma_store import get_plasma_store, PlasmaStore
from .errors import GardeniaError, parse_python_error, parse_r_error, ErrorCategory

log = logging.getLogger(__name__)


class WorkerType(Enum):
    """Supported worker types"""
    PYTHON = "python"
    R = "r"


@dataclass
class ExecutionResult:
    """Result of code execution"""
    status: str  # 'success' | 'error' | 'timeout'
    output: str
    error: Optional[str] = None
    error_data: Optional[GardeniaError] = None  # Structured error info
    variables_created: Optional[Set[str]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        result = {
            "status": self.status,
            "output": self.output,
            "error": self.error,
            "variables_created": list(self.variables_created) if self.variables_created else [],
        }
        if self.error_data:
            result["error_data"] = self.error_data.to_dict()
        return result


class PythonWorker:
    """
    Executes Python code with variable injection and extraction.
    Supports timeout and memory limits.
    """
    
    def __init__(self, registry: Optional[VariableRegistry] = None):
        self.registry = registry or get_registry()
        self._namespace: Dict[str, Any] = {}
        self._initial_keys: Set[str] = set()
    
    def execute(
        self,
        code: str,
        node_id: str,
        parameters: Optional[Dict[str, Any]] = None,
        timeout: int = 60,
        memory_limit_mb: int = 512,
        upstream_nodes: Optional[list] = None,
        downstream_nodes: Optional[list] = None,
    ) -> ExecutionResult:
        """
        Execute Python code with variable injection.
        
        Args:
            code: Python code to execute
            node_id: ID of the executing node
            parameters: Node parameters to inject as variables
            timeout: Maximum execution time in seconds (default: 60)
            memory_limit_mb: Maximum memory usage in MB (default: 512)
        
        Returns:
            ExecutionResult with output and created variables
        """
        import threading
        import ctypes
        
        # Prepare namespace
        self._namespace = {}
        
        # Inject parameters as variables
        safe_params = parameters or {}
        self._namespace['params'] = safe_params
        
        # CREATE INPUTS DICTIONARY
        # Start with parameters
        self._namespace['inputs'] = safe_params.copy()
        
        for key, value in safe_params.items():
            if value is not None:
                self._namespace[key] = value
        
        # Inject registry variables
        self.registry.inject_into_namespace(self._namespace, node_id)
        
        # Populate inputs with registry variables (excluding internals)
        for key, value in self._namespace.items():
            if key not in ['params', 'inputs', '__builtins__'] and not key.startswith('_'):
                self._namespace['inputs'][key] = value
        
        # Record initial keys to detect new variables
        self._initial_keys = set(self._namespace.keys())
        
        # Inject stream_input helper for consumer nodes
        _inject_stream_input(self._namespace, node_id, upstream_nodes)
        self._initial_keys.add('stream_input')
        
        # Capture output
        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()
        
        # Execution state for thread communication
        execution_result = {"completed": False, "error": None}
        
        def execute_code():
            try:
                with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
                    exec(code, self._namespace)
                execution_result["completed"] = True
                    
            except SystemExit:
                pass # Killed by timeout
            except Exception as e:
                execution_result["error"] = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        
        # Run in thread with timeout
        thread = threading.Thread(target=execute_code, daemon=True)
        thread.start()
        thread.join(timeout=timeout)
        
        if thread.is_alive():
            # Timeout occurred - thread is still running
            try:
                if thread.ident:
                    tid = ctypes.c_long(thread.ident)
                    exc = ctypes.py_object(SystemExit)
                    res = ctypes.pythonapi.PyThreadState_SetAsyncExc(tid, exc)
                    if res > 1:
                        ctypes.pythonapi.PyThreadState_SetAsyncExc(tid, None)
            except Exception as e:
                log.warning(f"Failed to kill timed out python thread: {e}")
                
            error_data = GardeniaError(
                category=ErrorCategory.TIMEOUT,
                message=f"Execution timed out after {timeout} seconds",
                language="python",
                node_id=node_id,
                recoverable=True,
            )
            return ExecutionResult(
                status="timeout",
                output=stdout_capture.getvalue(),
                error=error_data.message,
                error_data=error_data,
            )
        
        # Check for errors
        if execution_result["error"]:
            error_data = parse_python_error(execution_result["error"], node_id)
            return ExecutionResult(
                status="error",
                output=stdout_capture.getvalue(),
                error=execution_result["error"],
                error_data=error_data,
            )
        
        # Success - extract new variables to registry
        new_keys = set(self._namespace.keys()) - self._initial_keys
        self.registry.extract_from_namespace(
            self._namespace,
            node_id=node_id,
            exclude=self._initial_keys,
        )
        
        # ── PlasmaStore: move DataFrames to shared memory ──
        if ARROW_AVAILABLE:
            plasma = get_plasma_store()
            for var_name in new_keys:
                val = self._namespace.get(var_name)
                if val is None:
                    continue
                # Check if it's a DataFrame-like object
                is_df = False
                if hasattr(val, 'to_parquet'):  # pandas DataFrame
                    is_df = True
                elif isinstance(val, pa.Table):
                    is_df = True
                
                if is_df:
                    try:
                        plasma_key = f"{node_id}_{var_name}"
                        ref = plasma.put(plasma_key, val)
                        # Update registry to use plasma_key instead of in-memory value
                        self.registry.set(
                            name=var_name,
                            value=None,
                            scope=VariableScope.WORKFLOW,
                            node_id=node_id,
                            type_hint="DataFrame",
                            is_dataframe=True,
                            plasma_key=plasma_key,
                            preview=ref.preview_str(),
                        )
                        log.info(f"PlasmaStore: Python var '{var_name}' → shared memory ({ref.byte_size / 1024:.1f} KB)")
                    except Exception as e:
                        log.warning(f"PlasmaStore: failed to store '{var_name}': {e} (kept in registry)")
        # ── End PlasmaStore ──
        
        output = stdout_capture.getvalue()
        stderr = stderr_capture.getvalue()
        
        if stderr:
            output += f"\n[stderr]\n{stderr}"
        
        return ExecutionResult(
            status="success",
            output=output,
            variables_created=new_keys,
        )
    
    def get_namespace(self) -> Dict[str, Any]:
        """Get current namespace (for debugging)"""
        if self._namespace:
            return self._namespace.copy()
        else:
            return {}


class RWorkerBridge:
    """
    Bridge to execute R code via subprocess.
    Spawns and manages an R process using r_bridge.R protocol.
    """
    
    def __init__(self, registry: Optional[VariableRegistry] = None):
        self.registry = registry or get_registry()
        self._process: Optional[Any] = None
        self._r_path: str = "Rscript"
        self._bridge_script: Optional[str] = None
        self._pending_data: str = ""
        self._is_ready: bool = False
        self._temp_dir = tempfile.mkdtemp(prefix="gardenia_r_ipc_")
        self._stderr_task: Optional[asyncio.Task] = None
    
    def __del__(self):
        # Cleanup temp dir
        self.stop()
        if os.path.exists(self._temp_dir):
            shutil.rmtree(self._temp_dir, ignore_errors=True)
            
    def _find_bridge_script(self) -> Optional[str]:
        """Find the r_bridge.R script"""
        import os
        
        # Get the directory where this module is located
        module_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Look for r_bridge.R in several locations
        possible_paths = [
            # Relative to engine/core/ -> go up to gardeniaclient/electron
            os.path.join(module_dir, "..", "..", "gardeniaclient", "electron", "r_bridge.R"),
            # Or if running from gardeniaclient
            os.path.join(module_dir, "..", "..", "..", "gardeniaclient", "electron", "r_bridge.R"),
            # Direct path
            os.path.join(module_dir, "..", "electron", "r_bridge.R"),
        ]
        
        for path in possible_paths:
            normalized = os.path.normpath(path)
            if os.path.exists(normalized):
                return normalized
        
        return None
    
    async def start(self) -> bool:
        """Start the R subprocess"""
        if self._process is not None and self._process.returncode is None:
            return True
            
        bridge_script = self._find_bridge_script()
        if not bridge_script:
            log.error("Could not find r_bridge.R script")
            return False
            
        import asyncio.subprocess
        try:
            self._process = await asyncio.create_subprocess_exec(
                self._r_path, "--vanilla", bridge_script,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                limit=1024 * 1024 * 128  # 128 MB limit for large JSON lines
            )
            
            async def consume_stderr():
                import re
                buffer = ""
                while self._process and self._process.returncode is None:
                    try:
                        # Read chunks to prevent memory/CPU exhaustion from \r (progress bars)
                        chunk = await self._process.stderr.read(4096)
                        if not chunk:
                            break
                        
                        buffer += chunk.decode('utf-8', errors='replace')
                        
                        while True:
                            match = re.search(r'[\r\n]', buffer)
                            if not match:
                                if len(buffer) > 8192:
                                    log.debug(f"[R stderr] {buffer[:8192]}")
                                    buffer = buffer[8192:]
                                break
                                
                            line = buffer[:match.start()].strip()
                            if line:
                                log.debug(f"[R stderr] {line}")
                            buffer = buffer[match.end():]
                            
                    except Exception as e:
                        log.debug(f"[R stderr] reader exception: {e}")
                        break
                
                if buffer.strip():
                    log.debug(f"[R stderr] {buffer.strip()}")
                        
            self._stderr_task = asyncio.create_task(consume_stderr())
            self._is_ready = True
            return True
        except Exception as e:
            log.error(f"Failed to start R process: {e}")
            return False
    
    def stop(self) -> None:
        """Stop the R subprocess"""
        if self._process:
            try:
                self._process.terminate()
            except ProcessLookupError:
                pass
            self._process = None
            self._is_ready = False
        if getattr(self, '_stderr_task', None):
            self._stderr_task.cancel()
            self._stderr_task = None
    
    def is_running(self) -> bool:
        """Check if R process is running"""
        return self._process is not None and self._process.returncode is None
    
    def _create_input_ipcs(self, node_id: str, parameters: Optional[Dict[str, Any]] = None) -> List[Dict[str, str]]:
        """ 
        Create Arrow IPC file references for all input dataframes for R.
        Returns list of {name, path}.
        
        Priority: PlasmaStore (shared memory path) > in-memory DF > dict of lists.
        """
        if not ARROW_AVAILABLE:
            return []
        
        plasma = get_plasma_store()
        ipc_files = []
        
        # --- 1. Check PlasmaStore for shared-memory references ---
        # Scan workflow-level variables for plasma_key references
        from .variable_registry import Variable
        with self.registry._lock:
            for var_name, var in self.registry._workflow.items():
                if var.is_dataframe and var.plasma_key:
                    ref = plasma.get_ref(var.plasma_key)
                    if ref and os.path.exists(ref.shm_path):
                        # R can read /dev/shm/ directly via arrow::read_ipc_file
                        ipc_files.append({"name": var_name, "path": ref.shm_path})
                        log.debug(f"PlasmaStore → R: '{var_name}' via shm_path {ref.shm_path}")
                        continue
        
        # --- 2. Fallback: materialize in-memory DataFrames to IPC files ---
        workflow_vars = self.registry.get_all_workflow_vars()
        all_inputs = {**(parameters or {}), **workflow_vars}
        
        # Skip vars already handled via PlasmaStore
        already_handled = {item["name"] for item in ipc_files}
        
        for name, target_df in all_inputs.items():
            if target_df is None or name in already_handled:
                continue
                
            is_df = False
            if isinstance(target_df, pa.Table):
                is_df = True
            elif hasattr(target_df, 'to_parquet'): # Pandas
                is_df = True
            elif isinstance(target_df, dict) and all(isinstance(v, list) for v in target_df.values()):
                is_df = True

            if is_df:
                try:
                    if isinstance(target_df, pa.Table):
                        table = target_df
                    elif hasattr(target_df, 'to_parquet'): 
                         try: 
                             table = pa.Table.from_pandas(target_df)
                         except:
                             continue
                    else:
                         try:
                             table = pa.table(target_df)
                         except:
                             continue

                    fname = f"{node_id}_input_{name}.arrow"
                    fpath = os.path.join(self._temp_dir, fname)
                    
                    with pa.OSFile(fpath, 'wb') as sink:
                        with pa.ipc.new_file(sink, table.schema) as writer:
                            writer.write(table)
                            
                    ipc_files.append({"name": name, "path": fpath})
                except Exception as e:
                    log.warning(f"Failed to create Arrow IPC for {name}: {e}")
                
        return ipc_files

    def _prepare_request(
        self,
        code: str,
        node_id: str,
        parameters: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Prepare JSON command"""
        # Create input IPC if applicable
        input_ipc = self._create_input_ipcs(node_id, parameters)
        
        # Also inject simple parameters as code for fallback/hybrid
        param_code = ""
        
        # NEW: Inject 'inputs' list for unified access in R too
        inputs_code = 'if (!exists("inputs")) inputs <- list()\n'
        
        all_data = {**(parameters or {}), **self.registry.get_all_workflow_vars()}
        
        for key, value in all_data.items():
            if value is None: continue
            # Skip complex objects
            if hasattr(value, 'shape') or isinstance(value, (list, dict)): continue
            
            if isinstance(value, str):
                val_json = json.dumps(value)
                param_code += f'{key} <- {val_json}\n'
                inputs_code += f'inputs[["{key}"]] <- {val_json}\n'
            elif isinstance(value, (int, float, bool)):
                 val_str = str(value).upper() if isinstance(value, bool) else str(value)
                 param_code += f'{key} <- {val_str}\n'
                 inputs_code += f'inputs[["{key}"]] <- {val_str}\n'
                 
        full_code = param_code + inputs_code + code
        
        cmd = {
            "id": node_id,
            "code": full_code,
            "output_dir": self._temp_dir,
            "input_ipcs": input_ipc
        }
        return json.dumps(cmd)

    async def execute(
        self,
        code: str,
        node_id: str,
        parameters: Optional[Dict[str, Any]] = None,
        r_executor: Optional[Callable] = None,
        timeout: int = 60,
    ) -> ExecutionResult:
        """
        Execute R code.
        """
        if not self.is_running():
            success = await self.start()
            if not success:
                return ExecutionResult(status="error", output="", error="Could not start R process")

        try:
            request_json = self._prepare_request(code, node_id, parameters)
            
            self._process.stdin.write((request_json + "\n").encode('utf-8'))
            await self._process.stdin.drain()
            
            stdout_str = ""
            while True:
                try:
                    stdout_data = await asyncio.wait_for(
                        self._process.stdout.readline(),
                        timeout=timeout
                    )
                except asyncio.TimeoutError:
                    self.stop()
                    return ExecutionResult(status="timeout", output="", error="Execution timed out")
                
                if not stdout_data:
                    self.stop()
                    return ExecutionResult(status="error", output=stdout_str, error="R process died/empty response")
                
                line = stdout_data.decode('utf-8').strip()
                if not line:
                    continue
                    
                try:
                    response = json.loads(line)
                    break
                except json.JSONDecodeError:
                    log.debug(f"[R stdout unexpected] {line}")
                    # Accumulate limited stdout to avoid RAM exhaustion / UI freeze
                    if len(stdout_str) < 1024 * 512: # Max 512KB of raw printouts
                        stdout_str += line + "\n"
                    elif len(stdout_str) == 1024 * 512:
                        stdout_str += "\n... [Output truncated due to size limits]\n"
            
            status = response.get("status", "error")
            output = response.get("output", "")
            error = response.get("error")
            variables = response.get("variables", [])
            
            created_vars = set()
            plasma = get_plasma_store()
            
            # Process returned vars
            for v in variables:
                name = v.get("name")
                if not name: continue
                
                val = v.get("value")
                ipc_path = None
                plasma_key = None
                
                # Check for IPC file from R
                if v.get("is_dataframe") and v.get("ipc_path") and ARROW_AVAILABLE:
                    ipc_path = v.get("ipc_path")
                    if os.path.exists(ipc_path):
                        val = None
                        log.debug(f"Received Arrow IPC reference for {name}: {ipc_path}")
                        
                        # Register R output in PlasmaStore for zero-copy access
                        try:
                            plasma_key = f"{node_id}_{name}"
                            # Read into Arrow Table and store in shared memory
                            with pa.ipc.open_file(ipc_path) as reader:
                                table = reader.read_all()
                            ref = plasma.put(plasma_key, table)
                            log.info(
                                f"PlasmaStore: R var '{name}' → shared memory "
                                f"({ref.byte_size / 1024:.1f} KB)"
                            )
                        except Exception as e:
                            log.warning(f"PlasmaStore: failed to store R var '{name}': {e}")
                            plasma_key = None
                        finally:
                            # Always delete the source IPC file from /dev/shm (prevent leak
                            # even if PlasmaStore ingestion failed).
                            try:
                                os.remove(ipc_path)
                                ipc_path = None  # Data is now in PlasmaStore (or was discarded)
                                log.debug(f"PlasmaStore: deleted R IPC file after ingestion")
                            except OSError:
                                pass
                    else:
                        ipc_path = None
                
                if val is not None or ipc_path is not None or plasma_key is not None:
                    created_vars.add(name)
                    self.registry.set(
                        name=name,
                        value=val,
                        scope=VariableScope.WORKFLOW,
                        node_id=node_id,
                        type_hint=v.get("type_hint"),
                        is_dataframe=v.get("is_dataframe", False),
                        ipc_path=ipc_path,
                        plasma_key=plasma_key,
                        preview=v.get("preview"),
                    )

            if stdout_str.strip():
                output = f"{stdout_str.strip()}\n{output}"

            return ExecutionResult(
                status=status,
                output=output,
                error=error,
                variables_created=created_vars
            )
        
        except Exception as e:
            return ExecutionResult(status="error", output="", error=f"Execution exception: {e}")


class WorkerManager:
    """
    Manages multiple worker types and routes execution.
    """
    
    def __init__(self, registry: Optional[VariableRegistry] = None):
        self.registry = registry or get_registry()
        self._python_worker = PythonWorker(self.registry)
        self._r_worker = RWorkerBridge(self.registry)
        self._r_executor: Optional[Callable] = None
    
    def set_r_executor(self, executor: Callable) -> None:
        """Set external R executor function"""
        self._r_executor = executor
    
    async def execute(
        self,
        code: str,
        language: str,
        node_id: str,
        parameters: Optional[Dict[str, Any]] = None,
        timeout: int = 60,
        memory_limit_mb: int = 512,
        dependencies: Optional[list] = None,
        upstream_nodes: Optional[list] = None,
        downstream_nodes: Optional[list] = None,
        outputs: Optional[List[Dict[str, Any]]] = None,
    ) -> ExecutionResult:
        """
        Execute code in the appropriate worker.
        If dependencies are specified for Python, runs in a sandboxed micro-venv.
        If code contains `yield`, runs in streaming/generator mode.
        """
        if language == "python" and dependencies:
            # --- Isolated venv subprocess execution ---
            import asyncio
            return await asyncio.to_thread(
                self._execute_in_venv,
                code, node_id, parameters or {},
                dependencies, timeout,
            )
        elif language == "python" and _code_has_yield(code):
            # --- Streaming generator execution ---
            import asyncio
            loop = asyncio.get_running_loop()
            return await asyncio.to_thread(
                self._execute_streaming,
                code, node_id, parameters,
                timeout, memory_limit_mb,
                upstream_nodes, downstream_nodes, outputs,
                loop=loop,
            )
        elif language == "python":
            import asyncio
            return await asyncio.to_thread(
                self._python_worker.execute,
                code, node_id, parameters,
                timeout, memory_limit_mb,
                upstream_nodes, downstream_nodes
            )
        elif language == "r":
            return await self._r_worker.execute(
                code, node_id, parameters, self._r_executor,
                timeout=timeout
            )
        else:
            return ExecutionResult(
                status="error",
                output="",
                error=f"Unsupported language: {language}",
            )

    def _execute_streaming(
        self,
        code: str,
        node_id: str,
        parameters: Optional[Dict[str, Any]] = None,
        timeout: int = 60,
        memory_limit_mb: int = 512,
        upstream_nodes: Optional[list] = None,
        downstream_nodes: Optional[list] = None,
        outputs: Optional[List[Dict[str, Any]]] = None,
        loop: Optional[Any] = None,
    ) -> ExecutionResult:
        """
        Execute Python code that uses `yield` as a streaming generator.
        
        1. Wraps user code in a generator function
        2. Iterates the generator, pushing each yielded DataFrame to a StreamChannel
        3. Returns total chunk/row stats
        """
        import threading
        import traceback

        from .stream_channel import get_stream_registry, _to_record_batch

        registry_stream = get_stream_registry()

        # Prepare namespace (same as PythonWorker.execute)
        namespace: Dict[str, Any] = {}
        safe_params = parameters or {}
        namespace['params'] = safe_params
        namespace['inputs'] = safe_params.copy()

        for key, value in safe_params.items():
            if value is not None:
                namespace[key] = value

        self._python_worker.registry.inject_into_namespace(namespace, node_id)

        for key, value in namespace.items():
            if key not in ['params', 'inputs', '__builtins__'] and not key.startswith('_'):
                namespace['inputs'][key] = value

        # Inject stream_input helper for consumers
        _inject_stream_input(namespace, node_id, upstream_nodes)

        initial_keys = set(namespace.keys())

        # Wrap user code in a generator function
        wrapped_code = f"def __gardenia_generator__():\n"
        for line in code.splitlines():
            wrapped_code += f"    {line}\n"

        # Capture output
        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()

        # Execution state
        exec_state = {"error": None, "chunks": 0, "total_rows": 0}

        # Shared stop signal — set when we give up waiting for the thread
        stop_event = threading.Event()

        def run_generator():
            channel = None
            try:
                with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
                    exec(wrapped_code, namespace)
                    gen = namespace['__gardenia_generator__']()

                    # Determine output variable name (default to 'data')
                    var_name = "data"
                    if outputs:
                        for out in outputs:
                            if out.get("type") == "dataset":
                                var_name = out.get("name", "data")
                                break
                        else:
                            var_name = outputs[0].get("name", "data")

                    channel = registry_stream.get_or_create_channel(node_id, var_name=var_name)
                    if loop:
                        channel.set_loop(loop)

                    if downstream_nodes:
                        for dst in downstream_nodes:
                            try:
                                channel.subscribe(dst)
                            except Exception:
                                pass

                    for chunk in gen:
                        # ── Cooperative kill-switch ──────────────────────────
                        # If the orchestrator gave up waiting (timeout), exit
                        # the generator so this thread can die cleanly.
                        if stop_event.is_set():
                            log.warning(
                                f"Stream: {node_id} generator interrupted by stop_event"
                            )
                            break
                        # ─────────────────────────────────────────────────────

                        if chunk is None:
                            continue
                        try:
                            channel.write_batch(chunk)
                            exec_state["chunks"] += 1
                            try:
                                num_rows = len(chunk)
                            except Exception:
                                num_rows = 0
                            exec_state["total_rows"] += num_rows
                            log.info(
                                f"Stream: {node_id} yielded chunk "
                                f"#{exec_state['chunks']} ({num_rows} rows)"
                            )
                        except Exception as e:
                            log.warning(
                                f"Stream: failed to convert chunk: {e}\n"
                                f"{traceback.format_exc()}"
                            )
                            exec_state["error"] = (
                                f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
                            )
                            break

            except Exception as e:
                exec_state["error"] = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
            finally:
                if channel:
                    channel.close()

        # Run in thread with timeout
        thread = threading.Thread(target=run_generator, daemon=True)
        thread.start()
        thread.join(timeout=timeout)

        if thread.is_alive():
            # Signal the generator to stop after the next chunk, then give it
            # a short grace period to clean up (close channel etc.) before
            # we return. The thread is daemon=True so it won't prevent shutdown.
            stop_event.set()
            thread.join(timeout=5)  # brief grace period for cleanup
            log.warning(
                f"Stream: {node_id} timed out after {timeout}s — "
                f"stop_event sent (thread {'stopped' if not thread.is_alive() else 'still running'})"
            )
            return ExecutionResult(
                status="timeout",
                output=stdout_capture.getvalue(),
                error=f"Streaming execution timed out after {timeout} seconds",
            )

        if exec_state["error"]:
            from .errors import parse_python_error
            error_data = parse_python_error(exec_state["error"], node_id)
            return ExecutionResult(
                status="error",
                output=stdout_capture.getvalue(),
                error=exec_state["error"],
                error_data=error_data,
            )

        # Extract new variables
        new_keys = set(namespace.keys()) - initial_keys - {'__gardenia_generator__'}
        self._python_worker.registry.extract_from_namespace(
            namespace,
            node_id=node_id,
            exclude=initial_keys | {'__gardenia_generator__'},
        )

        # Default streaming variable name for UI registration
        var_name = "data"
        if outputs:
            for out in outputs:
                if out.get("type") == "dataset":
                    var_name = out.get("name", "data")
                    break
            else:
                var_name = outputs[0].get("name", "data")
                
        # Register a placeholder value in the variable registry for UI previews and state 
        # so downstream nodes know this variable was correctly produced
        if var_name not in new_keys:
            self._python_worker.registry.set(
                name=var_name,
                value=None,
                scope=VariableScope.WORKFLOW,
                node_id=node_id,
                type_hint="DataFrame",
                is_dataframe=True,
                plasma_key=None,
                preview=f"⟨ Stream of {exec_state['chunks']} chunks, {exec_state['total_rows']:,} rows ⟩"
            )
            if not new_keys:
                new_keys = set()
            new_keys.add(var_name)

        return ExecutionResult(
            status="streaming",
            output=stdout_capture.getvalue(),
            variables_created=new_keys if new_keys else None,
            error_data=None, # Add error_data internally needed by execution_result
        )

    def _execute_in_venv(
        self,
        code: str,
        node_id: str,
        parameters: Dict[str, Any],
        dependencies: list,
        timeout: int = 60,
    ) -> ExecutionResult:
        """
        Execute Python code inside a micro-venv subprocess.
        
        1. Ensure venv exists (VenvManager handles caching)
        2. Serialize inputs (parameters + registry variables)
        3. Run code via subprocess with the venv's python
        4. Parse outputs and extract variables back
        """
        import subprocess as sp
        import tempfile

        from .venv_manager import get_venv_manager

        mgr = get_venv_manager()

        # 1. Ensure venv
        try:
            venv_python = str(mgr.ensure_venv(dependencies))
        except RuntimeError as e:
            return ExecutionResult(
                status="error",
                output="",
                error=f"Failed to create venv for dependencies {dependencies}: {e}",
            )

        # 2. Prepare inputs from parameters + registry
        inputs = dict(parameters) if parameters else {}

        # Inject registry variables
        namespace: Dict[str, Any] = {}
        self._python_worker.registry.inject_into_namespace(namespace, node_id)
        for k, v in namespace.items():
            if k not in ('__builtins__',) and not k.startswith('_'):
                inputs[k] = v

        # 3. Build the wrapper script
        #    We serialize inputs as JSON, run user code, then output variables as JSON
        wrapper = _build_venv_wrapper(code, inputs, node_id)

        # 4. Execute in subprocess
        try:
            result = sp.run(
                [venv_python, "-c", wrapper],
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except sp.TimeoutExpired:
            return ExecutionResult(
                status="timeout",
                output="",
                error=f"Execution timed out after {timeout} seconds (venv subprocess)",
            )

        # 5. Parse output
        stdout = result.stdout
        stderr = result.stderr

        if result.returncode != 0:
            error_msg = stderr.strip() or stdout.strip() or f"Process exited with code {result.returncode}"
            return ExecutionResult(
                status="error",
                output=stdout,
                error=error_msg,
            )

        # Extract the __GARDENIA_VARS__ JSON block from the end of stdout
        output_lines = stdout.split("\n")
        user_output_lines = []
        vars_json = None

        for line in output_lines:
            if line.startswith("__GARDENIA_VARS__:"):
                vars_json = line[len("__GARDENIA_VARS__:"):]
            else:
                user_output_lines.append(line)

        user_output = "\n".join(user_output_lines).rstrip()

        # 6. Extract variables back into registry
        new_var_names: set = set()
        if vars_json:
            try:
                extracted = json.loads(vars_json)
                for name, value in extracted.items():
                    self._python_worker.registry.set(
                        name=name,
                        value=value,
                        scope=VariableScope.WORKFLOW,
                        node_id=node_id,
                    )
                    new_var_names.add(name)
            except json.JSONDecodeError:
                pass  # Couldn't parse vars, not fatal

        return ExecutionResult(
            status="success",
            output=user_output,
            variables_created=new_var_names if new_var_names else None,
        )
    
    def get_registry(self) -> VariableRegistry:
        """Get the variable registry"""
        return self.registry
    
    def reset(self) -> None:
        """Reset workers, registry, and shared memory"""
        self.registry.clear_workflow()
        self._python_worker = PythonWorker(self.registry)
        # Clear all shared memory segments
        try:
            get_plasma_store().clear()
        except Exception as e:
            log.warning(f"Failed to clear PlasmaStore: {e}")


# Module-level instance
_worker_manager: Optional[WorkerManager] = None


def _code_has_yield(code: str) -> bool:
    """
    Detect if user code contains a `yield` statement.
    Uses AST parsing to avoid false positives from comments/strings.
    """
    import ast
    try:
        tree = ast.parse(code)
        for node in ast.walk(tree):
            if isinstance(node, (ast.Yield, ast.YieldFrom)):
                return True
        return False
    except SyntaxError:
        # If code won't parse, fall back to simple text check
        return False


def _inject_stream_input(namespace: Dict[str, Any], node_id: str, upstream_nodes: Optional[list] = None) -> None:
    """
    Inject a `stream_input(var_name)` helper into the execution namespace.
    Consumer nodes call this to iterate over chunks from an upstream producer.
    
    Currently returns a list with the full variable value (backward compat).
    When a StreamChannel exists, it will iterate over live chunks.
    """
    from .stream_channel import get_stream_registry

    def stream_input(var_name: str = "data"):
        """
        Iterate over chunks from an upstream streaming node.
        If no stream is active, wraps the existing variable as a single chunk.
        """
        registry = get_stream_registry()

        # Check for any active channel that targets this node
        channels = registry.get_channels_for_consumer(node_id)
        matching_channels = []
        for ch in channels:
            if ch.var_name == var_name and ch.source_node != node_id:
                if upstream_nodes is not None and ch.source_node not in upstream_nodes:
                    continue
                matching_channels.append(ch)

        if matching_channels:
            # We want to yield from all matching channels.
            def combined_generator():
                for ch in matching_channels:
                    yield from ch.read_batches_sync(subscriber_id=node_id)
            return combined_generator()

        # Fallback: wrap existing variable as a single-element list
        val = namespace.get(var_name)
        if val is not None:
            return iter([val])
        return iter([])

    namespace['stream_input'] = stream_input


def _build_venv_wrapper(code: str, inputs: Dict[str, Any], node_id: str) -> str:
    """
    Build a self-contained Python script that:
    1. Deserializes input variables from embedded JSON
    2. Runs the user's code
    3. Serializes new variables back as __GARDENIA_VARS__ JSON line
    
    Only JSON-serializable variables are passed back. Non-serializable
    objects (DataFrames, models, etc.) are silently skipped.
    """
    # Filter inputs to only JSON-serializable values
    safe_inputs: Dict[str, Any] = {}
    for k, v in inputs.items():
        try:
            json.dumps(v)
            safe_inputs[k] = v
        except (TypeError, ValueError):
            pass  # Skip non-serializable inputs

    inputs_json = json.dumps(safe_inputs)
    # Escape for embedding inside a Python string
    inputs_escaped = inputs_json.replace("\\", "\\\\").replace("'", "\\'")

    wrapper = f"""
import json, sys

# --- Inject input variables ---
_inputs = json.loads('{inputs_escaped}')
_initial_vars = set(dir())
_initial_vars.update({{'_inputs', '_initial_vars', '__builtins__'}})

for _k, _v in _inputs.items():
    globals()[_k] = _v

# Also expose params and inputs dicts
params = _inputs.copy()
inputs = _inputs.copy()
_initial_vars.update({{'params', 'inputs', '_k', '_v'}})

# --- User code ---
{code}

# --- Extract new variables ---
_new_vars = {{}}
for _name in set(dir()) - _initial_vars:
    if _name.startswith('_'):
        continue
    _val = globals().get(_name)
    if _val is None or callable(_val):
        continue
    try:
        json.dumps(_val)
        _new_vars[_name] = _val
    except (TypeError, ValueError):
        pass  # Skip non-serializable

print("__GARDENIA_VARS__:" + json.dumps(_new_vars))
"""
    return wrapper


def get_worker_manager() -> WorkerManager:
    """Get or create the global worker manager"""
    global _worker_manager
    if _worker_manager is None:
        _worker_manager = WorkerManager()
    return _worker_manager


def execute_in_worker(
    code: str,
    language: str,
    node_id: str,
    parameters: Optional[Dict[str, Any]] = None,
    timeout: int = 60,
    memory_limit_mb: int = 512,
    registry: Optional[VariableRegistry] = None,
) -> ExecutionResult:
    """
    Standalone execution function for use inside Ray remote tasks.

    Creates a fresh worker (PythonWorker or RWorkerBridge), executes the code,
    and returns the result. Unlike WorkerManager.execute(), this is synchronous
    for Python and runs its own event loop for R.

    Args:
        code: Source code to execute
        language: 'python' or 'r'
        node_id: Unique node identifier
        parameters: Node parameters to inject
        timeout: Max execution time in seconds
        memory_limit_mb: Memory limit (Python only)
        registry: Optional VariableRegistry (creates fresh one if None)

    Returns:
        ExecutionResult
    """
    if registry is None:
        registry = VariableRegistry()

    if language == "python":
        worker = PythonWorker(registry)
        return worker.execute(code, node_id, parameters, timeout, memory_limit_mb)
    elif language == "r":
        worker = RWorkerBridge(registry)
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(
                worker.execute(code, node_id, parameters, timeout=timeout)
            )
        finally:
            loop.close()
            worker.stop()
    else:
        return ExecutionResult(
            status="error",
            output="",
            error=f"Unsupported language: {language}",
        )
