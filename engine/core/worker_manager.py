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
from contextlib import redirect_stdout, redirect_stderr
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Dict, Optional, Set
import logging

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
        
        for key, value in safe_params.items():
            if value is not None:
                self._namespace[key] = value
        
        # Inject registry variables
        self.registry.inject_into_namespace(self._namespace, node_id)
        
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
        return self._namespace.copy()


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
        
        Args:
            code: R code to execute
            node_id: ID of the executing node
            parameters: Node parameters to inject
            r_executor: External R executor function (optional, for Electron integration)
            timeout: Maximum execution time in seconds (default: 60)
        
        Returns:
            ExecutionResult
        """
        import asyncio
        
        # If external executor provided (Electron R session), use it
        if r_executor:
            try:
                # Prepare parameter injection code
                full_code = self._prepare_code(code, parameters)
                # Apply timeout using asyncio.wait_for
                result = await asyncio.wait_for(r_executor(full_code), timeout=timeout)
                
                # Check if error in result
                if result.get("status") == "error":
                    error_data = parse_r_error(result.get("error", "Unknown error"), node_id)
                    return ExecutionResult(
                        status="error",
                        output=result.get("output", ""),
                        error=result.get("error"),
                        error_data=error_data,
                    )
                
                return ExecutionResult(
                    status=result.get("status", "success"),
                    output=result.get("output", ""),
                    error=result.get("error"),
                )
            except asyncio.TimeoutError:
                error_data = GardeniaError(
                    category=ErrorCategory.TIMEOUT,
                    message=f"R execution timed out after {timeout} seconds",
                    language="r",
                    node_id=node_id,
                    recoverable=True,
                )
                return ExecutionResult(
                    status="timeout",
                    output="",
                    error=error_data.message,
                    error_data=error_data,
                )
            except Exception as e:
                error_data = parse_r_error(str(e), node_id)
                return ExecutionResult(
                    status="error",
                    output="",
                    error=str(e),
                    error_data=error_data,
                )
        
        # Otherwise use our own subprocess
        if not self.is_running():
            started = await self.start()
            if not started:
                error_data = GardeniaError(
                    category=ErrorCategory.SESSION,
                    message="Failed to start R process. Is Rscript installed?",
                    language="r",
                    node_id=node_id,
                )
                return ExecutionResult(
                    status="error",
                    output="",
                    error=error_data.message,
                    error_data=error_data,
                )
        
        # Prepare code with parameter injection
        full_code = self._prepare_code(code, parameters)
        
        # Send to R process
        try:
            # Escape code for JSON
            escaped_code = full_code.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\t", "\\t").replace("\r", "\\r")
            request = f'{{"command": "{escaped_code}"}}\n'
            
            self._process.stdin.write(request)
            self._process.stdin.flush()
            
            # Read response (with timeout)
            import select
            import sys
            
            # Simple blocking read for now
            response_line = self._process.stdout.readline()
            
            if not response_line:
                return ExecutionResult(
                    status="error",
                    output="",
                    error="R process returned empty response",
                )
            
            # Parse JSON response
            try:
                response = json.loads(response_line.strip())
                
                # Extract and register variables if present
                variables = response.get("variables", [])
                variable_names = set()
                
                if variables and isinstance(variables, list):
                    for v in variables:
                        name = v.get("name")
                        if name:
                            variable_names.add(name)
                            # Register execution result variables in workflow scope (or node scope?)
                            # R session is persistent for the workflow, so WORKFLOW scope makes sense.
                            # But if it's node-specific, maybe NODE scope?
                            # For now use WORKFLOW scope as R environment is shared.
                            self.registry.set(
                                name=name,
                                value=v.get("value"),
                                scope=VariableScope.WORKFLOW,
                                node_id=node_id,
                                type_hint=v.get("type_hint"),
                                is_dataframe=v.get("is_dataframe", False),
                            )
                
                return ExecutionResult(
                    status=response.get("status", "error"),
                    output=response.get("output", ""),
                    error=response.get("error"),
                    variables_created=variable_names,
                )
            except json.JSONDecodeError as e:
                return ExecutionResult(
                    status="error",
                    output=response_line,
                    error=f"Failed to parse R response: {e}",
                )
        
        except Exception as e:
            log.error(f"Error executing R code: {e}")
            return ExecutionResult(
                status="error",
                output="",
                error=str(e),
            )
    
    def _prepare_code(
        self,
        code: str,
        parameters: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Prepare R code with parameter injection"""
        param_code = ""
        
        # Inject parameters
        if parameters:
            for key, value in parameters.items():
                if value is None:
                    continue
                if isinstance(value, str):
                    param_code += f'{key} <- {json.dumps(value)}\n'
                elif isinstance(value, bool):
                    param_code += f'{key} <- {"TRUE" if value else "FALSE"}\n'
                elif isinstance(value, (int, float)):
                    param_code += f'{key} <- {value}\n'
                elif isinstance(value, list):
                    # Convert list to R vector
                    r_values = ", ".join(
                        json.dumps(v) if isinstance(v, str) else str(v)
                        for v in value
                    )
                    param_code += f'{key} <- c({r_values})\n'
        
        # Inject workflow variables (only simple types)
        workflow_vars = self.registry.get_all_workflow_vars()
        for name, value in workflow_vars.items():
            if isinstance(value, str):
                param_code += f'{name} <- {json.dumps(value)}\n'
            elif isinstance(value, bool):
                param_code += f'{name} <- {"TRUE" if value else "FALSE"}\n'
            elif isinstance(value, (int, float)):
                param_code += f'{name} <- {value}\n'
        
        return param_code + code


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
        
        Args:
            code: Source code to execute
            language: 'python' or 'r'
            node_id: ID of the executing node
            parameters: Node parameters
            timeout: Maximum execution time in seconds (default: 60)
            memory_limit_mb: Maximum memory usage in MB for Python (default: 512)
        
        Returns:
            ExecutionResult
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
