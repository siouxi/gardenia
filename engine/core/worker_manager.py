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
        import tracemalloc
        
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
        memory_limit_bytes = memory_limit_mb * 1024 * 1024
        
        def execute_code():
            try:
                # Start memory tracking
                tracemalloc.start()
                
                with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
                    exec(code, self._namespace)
                
                # Check peak memory usage
                current, peak = tracemalloc.get_traced_memory()
                tracemalloc.stop()
                
                if peak > memory_limit_bytes:
                    execution_result["error"] = f"MemoryError: Peak memory usage ({peak // (1024*1024)}MB) exceeded limit ({memory_limit_mb}MB)"
                else:
                    execution_result["completed"] = True
                    
            except Exception as e:
                tracemalloc.stop()
                execution_result["error"] = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        
        # Run in thread with timeout
        thread = threading.Thread(target=execute_code)
        thread.start()
        thread.join(timeout=timeout)
        
        if thread.is_alive():
            # Timeout occurred - thread is still running
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
    
    def __del__(self):
        # Cleanup temp dir
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
        import subprocess
        
        if self._process is not None:
            return True
        
        # Find bridge script
        self._bridge_script = self._find_bridge_script()
        if not self._bridge_script:
            log.error("Could not find r_bridge.R script")
            return False
        
        try:
            self._process = subprocess.Popen(
                [self._r_path, "--vanilla", self._bridge_script],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,  # Line buffered
            )
            self._is_ready = True
            log.info(f"R process started with PID {self._process.pid}")
            return True
        except FileNotFoundError:
            log.error(f"Rscript not found at '{self._r_path}'")
            return False
        except Exception as e:
            log.error(f"Failed to start R process: {e}")
            return False
    
    def stop(self) -> None:
        """Stop the R subprocess"""
        if self._process:
            try:
                self._process.terminate()
                self._process.wait(timeout=5)
            except Exception:
                self._process.kill()
            finally:
                self._process = None
                self._is_ready = False
    
    def is_running(self) -> bool:
        """Check if R process is running"""
        return self._process is not None and self._process.poll() is None
    
    def _create_input_ipc(self, node_id: str, parameters: Optional[Dict[str, Any]] = None) -> Optional[str]:
        """ Create Arrow IPC file with input dataframe for R. """
        if not ARROW_AVAILABLE:
            return None
            
        data = {}
        
        # Only inject workflow variables that seem to be dataframes
        # Or inject parameters that are tables
        workflow_vars = self.registry.get_all_workflow_vars()
        all_inputs = {**(parameters or {}), **workflow_vars}
        
        target_df = None
        target_name = None
        
        # Prefer 'data' variable if exists
        if 'data' in all_inputs:
             v = all_inputs['data']
             # Check if it's dataframe-like
             if isinstance(v, (pa.Table, dict)) or hasattr(v, 'to_parquet'):
                 target_name = 'data'
                 target_df = v
        
        if target_df is None:
            # Find first dataframe-like
             for k, v in all_inputs.items():
                 if hasattr(v, 'to_parquet') or isinstance(v, pa.Table):
                     target_name = k
                     target_df = v
                     break
        
        if target_df is not None:
            try:
                if isinstance(target_df, pa.Table):
                    table = target_df
                elif hasattr(target_df, 'to_parquet') and ARROW_AVAILABLE: # Pandas
                     # Ensure we convert pandas to Arrow Table
                     try: 
                         table = pa.Table.from_pandas(target_df)
                     except:
                         # Fallback or already Table-like?
                         return None
                else: 
                     return None

                fname = f"{node_id}_input.arrow"
                fpath = os.path.join(self._temp_dir, fname)
                
                with pa.OSFile(fpath, 'wb') as sink:
                    with pa.ipc.new_file(sink, table.schema) as writer:
                        writer.write(table)
                        
                return fpath
            except Exception as e:
                log.warning(f"Failed to create Arrow IPC: {e}")
                return None
                
        return None

    def _prepare_request(
        self,
        code: str,
        node_id: str,
        parameters: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Prepare JSON command"""
        # Create input IPC if applicable
        input_ipc = self._create_input_ipc(node_id, parameters)
        
        # Also inject simple parameters as code for fallback/hybrid
        param_code = ""
        
        # NEW: Inject 'inputs' list for unified access in R too
        inputs_code = "inputs <- list()\n"
        
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
            "input_ipc": input_ipc
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
            if not await self.start():
                 return ExecutionResult(status="error", output="", error="Failed to start R process")

        try:
            request_json = self._prepare_request(code, node_id, parameters)
            
            self._process.stdin.write(request_json + "\n")
            self._process.stdin.flush()
            
            # Read response
            response_line = self._process.stdout.readline()
            if not response_line:
                 return ExecutionResult(status="error", output="", error="R process died/empty response")
            
            try:
                response = json.loads(response_line)
            except json.JSONDecodeError:
                 return ExecutionResult(status="error", output=response_line, error="Invalid JSON response")
            
            status = response.get("status", "error")
            output = response.get("output", "")
            error = response.get("error")
            variables = response.get("variables", [])
            
            created_vars = set()
            
            # Process returned vars
            for v in variables:
                name = v.get("name")
                if not name: continue
                
                val = v.get("value")
                
                # Check for IPC file
                if v.get("is_dataframe") and v.get("ipc_path") and ARROW_AVAILABLE:
                    ipc_path = v.get("ipc_path")
                    if os.path.exists(ipc_path):
                        try:
                            # Read Table back
                            with pa.ipc.open_file(ipc_path) as reader:
                                table = reader.read_all()
                                val = table.to_pandas() # Convert to pandas for Python ecosystem compatibility
                        except Exception as e:
                            log.error(f"Failed to read IPC from R: {e}")
                
                if val is not None:
                    created_vars.add(name)
                    self.registry.set(
                        name=name,
                        value=val,
                        scope=VariableScope.WORKFLOW,
                        node_id=node_id,
                        type_hint=v.get("type_hint"),
                        is_dataframe=v.get("is_dataframe", False)
                    )

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
            return self._python_worker.execute(
                code, node_id, parameters,
                timeout=timeout,
                memory_limit_mb=memory_limit_mb
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
        """Reset workers and registry"""
        self.registry.clear_workflow()
        self._python_worker = PythonWorker(self.registry)


# Module-level instance
_worker_manager: Optional[WorkerManager] = None


def get_worker_manager() -> WorkerManager:
    """Get or create the global worker manager"""
    global _worker_manager
    if _worker_manager is None:
        _worker_manager = WorkerManager()
    return _worker_manager
