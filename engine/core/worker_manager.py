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
from typing import Any, Callable, Dict, Optional, Set
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
                while self._process and self._process.returncode is None:
                    try:
                        line = await self._process.stderr.readline()
                        if not line:
                            break
                        line_str = line.decode('utf-8').strip()
                        if line_str:
                            log.debug(f"[R stderr] {line_str}")
                    except Exception:
                        break
                        
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
                    stdout_str += line + "\n"
            
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
    ) -> ExecutionResult:
        """
        Execute code in the appropriate worker.
        """
        if language == "python":
            import asyncio
            return await asyncio.to_thread(
                self._python_worker.execute,
                code, node_id, parameters,
                timeout, memory_limit_mb
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


def get_worker_manager() -> WorkerManager:
    """Get or create the global worker manager"""
    global _worker_manager
    if _worker_manager is None:
        _worker_manager = WorkerManager()
    return _worker_manager
