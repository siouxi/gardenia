"""
Variable Registry
==================

Scoped variable storage for workflow execution with:
- Global, workflow, and node-level scopes
- Type-aware serialization
- Thread-safe access
- Arrow table support for dataframes
"""

from __future__ import annotations
import json
import threading
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Set
import logging

log = logging.getLogger(__name__)


class VariableScope(Enum):
    """Variable scope levels"""
    GLOBAL = "global"      # Persists across workflows
    WORKFLOW = "workflow"  # Persists within a workflow run
    NODE = "node"          # Local to a single node execution


@dataclass
class Variable:
    """Represents a stored variable"""
    name: str
    value: Any
    scope: VariableScope
    type_hint: str = "any"  # Python type hint
    node_id: Optional[str] = None  # Source node for traceability
    is_dataframe: bool = False  # Flag for tabular data
    ipc_path: Optional[str] = None  # Path to Arrow IPC/Parquet file on disk if deferred
    plasma_key: Optional[str] = None  # Key in PlasmaStore (shared memory)
    preview: Optional[str] = None   # String preview for frontend
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "value": self._serialize_value(),
            "scope": self.scope.value,
            "type_hint": self.type_hint,
            "node_id": self.node_id,
            "is_dataframe": self.is_dataframe,
            "ipc_path": self.ipc_path,
            "plasma_key": self.plasma_key,
            "preview": self.preview,
        }
    
    def _serialize_value(self) -> Any:
        """Serialize value for JSON transport — never raises."""
        if self.is_dataframe:
            # Return preview metadata instead of dropping huge dataframes into JSON
            if self.preview:
                return self.preview
            if self.plasma_key:
                return f"[DataFrame in shared memory: {self.plasma_key}]"
            if hasattr(self.value, 'shape'):
                return f"DataFrame {self.value.shape}"
            return "[DataFrame]"

        # Basic JSON-safe scalars — no conversion needed
        if isinstance(self.value, (int, float, bool, type(None))):
            return self.value
        if isinstance(self.value, str):
            if len(self.value) > 1000:
                return self.value[:1000] + "... [truncated]"
            return self.value

        # bytes — not JSON-serializable, convert to readable hex preview
        if isinstance(self.value, (bytes, bytearray)):
            size = len(self.value)
            if size <= 32:
                return f"[bytes: {self.value.hex()}]"
            return f"[bytes: {size} bytes]"

        # Prevent freezing on huge lists and dicts
        if isinstance(self.value, list):
            if len(self.value) > 100:
                return f"[List with {len(self.value)} elements]"
            try:
                s = json.dumps(self.value)
                if len(s) > 5000:
                    return f"[Large List with {len(self.value)} elements]"
                return json.loads(s)
            except Exception:
                return f"[List with {len(self.value)} elements]"

        if isinstance(self.value, dict):
            if len(self.value) > 50:
                return f"{{{{Dictionary with {len(self.value)} keys}}}}"
            try:
                s = json.dumps(self.value)
                if len(s) > 5000:
                    return f"{{{{Large Dictionary with {len(self.value)} keys}}}}"
                return json.loads(s)
            except Exception:
                return f"{{{{Dictionary with {len(self.value)} keys}}}}"

        # sets, frozensets
        if isinstance(self.value, (set, frozenset)):
            return f"[{type(self.value).__name__} with {len(self.value)} elements]"

        try:
            # fallback for unhandled objects
            res = str(self.value)
            return res[:1000] + "... [truncated]" if len(res) > 1000 else res
        except Exception:
            return f"[{type(self.value).__name__}]"


class VariableRegistry:
    """
    Thread-safe variable storage with scoped access.
    
    Supports:
    - Hierarchical scopes (global > workflow > node)
    - Variable isolation between nodes
    - Type tracking and validation
    - Snapshot/restore for debugging
    """
    
    def __init__(self):
        self._lock = threading.RLock()
        self._global: Dict[str, Variable] = {}
        self._workflow: Dict[str, Variable] = {}
        self._nodes: Dict[str, Dict[str, Variable]] = {}  # node_id -> vars
        self._history: deque = deque(maxlen=500)  # Capped to prevent memory leak
    
    def set(
        self,
        name: str,
        value: Any,
        scope: VariableScope = VariableScope.WORKFLOW,
        node_id: Optional[str] = None,
        type_hint: Optional[str] = None,
        is_dataframe: Optional[bool] = None,
        ipc_path: Optional[str] = None,
        plasma_key: Optional[str] = None,
        preview: Optional[str] = None,
    ) -> Variable:
        """
        Store a variable in the registry (thread-safe).

        All type inference and Variable construction happen INSIDE the lock to
        eliminate the TOCTOU window where concurrent writers can interleave
        between type detection and the actual dict write.
        """
        if scope == VariableScope.NODE and not node_id:
            raise ValueError("node_id required for NODE scope")

        with self._lock:
            # Infer type hint if not provided
            if type_hint is None and value is not None:
                type_hint = type(value).__name__

            # Check if it's a dataframe-like object
            if is_dataframe is None and value is not None:
                is_dataframe = self._is_dataframe(value)
            elif is_dataframe is None and (ipc_path is not None or plasma_key is not None):
                is_dataframe = True  # IPC files and plasma refs are dataframes

            # DO NOT store the heavy dataframe in memory if we have it on disk/shm!
            if is_dataframe and (ipc_path or plasma_key) and value is not None:
                stored_value = None  # discard memory copy, keep only the reference
            else:
                stored_value = value

            var = Variable(
                name=name,
                value=stored_value,
                scope=scope,
                type_hint=type_hint or "dataframe",
                node_id=node_id,
                is_dataframe=is_dataframe,
                ipc_path=ipc_path,
                plasma_key=plasma_key,
                preview=preview,
            )

            if scope == VariableScope.GLOBAL:
                self._global[name] = var
            elif scope == VariableScope.WORKFLOW:
                self._workflow[name] = var
            else:  # NODE
                if node_id not in self._nodes:
                    self._nodes[node_id] = {}
                self._nodes[node_id][name] = var

            # Record history (cheap, inside lock is fine)
            self._history.append({
                "action": "set",
                "name": name,
                "scope": scope.value,
                "node_id": node_id,
            })

        return var
        
    def clear(self, scope: Optional[VariableScope] = None) -> None:
        """
        Clear variables from the registry.
        
        Args:
            scope: Optional scope to clear. If None, clears WORKFLOW and NODE scopes.
                   GLOBAL scope is only cleared if explicitly requested.
        """
        with self._lock:
            if scope == VariableScope.GLOBAL:
                self._global.clear()
            elif scope == VariableScope.WORKFLOW:
                self._workflow.clear()
            elif scope == VariableScope.NODE:
                self._nodes.clear()
            else:
                # Default behavior: Clear workflow and node variables, keep global
                self._workflow.clear()
                self._nodes.clear()
            
            # Record history
            self._history.append({
                "action": "clear",
                "scope": scope.value if scope else "all_local",
            })
    def get(
        self,
        name: str,
        scope: Optional[VariableScope] = None,
        node_id: Optional[str] = None,
    ) -> Optional[Any]:
        """
        Retrieve a variable value.
        
        If scope is not specified, searches in order: node -> workflow -> global
        
        Args:
            name: Variable name
            scope: Optional specific scope to search
            node_id: Required when searching node scope
        
        Returns:
            Variable value or None if not found
        """
        with self._lock:
            if scope:
                var = self._get_from_scope(name, scope, node_id)
                return var.value if var else None
            
            # Search hierarchy: node -> workflow -> global
            if node_id:
                var = self._get_from_scope(name, VariableScope.NODE, node_id)
                if var:
                    return var.value
            
            var = self._get_from_scope(name, VariableScope.WORKFLOW, None)
            if var:
                return var.value
            
            var = self._get_from_scope(name, VariableScope.GLOBAL, None)
            return var.value if var else None
    
    def _get_from_scope(
        self,
        name: str,
        scope: VariableScope,
        node_id: Optional[str],
    ) -> Optional[Variable]:
        """Get variable from specific scope"""
        if scope == VariableScope.GLOBAL:
            return self._global.get(name)
        elif scope == VariableScope.WORKFLOW:
            return self._workflow.get(name)
        else:  # NODE
            if node_id and node_id in self._nodes:
                return self._nodes[node_id].get(name)
            return None
    
    def _is_dataframe(self, value: Any) -> bool:
        """Check if value is a dataframe-like object"""
        type_name = type(value).__name__
        module = type(value).__module__
        
        # Check for common dataframe types
        if type_name in ('DataFrame', 'Table'):
            return True
        if 'pandas' in module or 'pyarrow' in module:
            return True
        
        return False
    
    def get_all_workflow_vars(self) -> Dict[str, Any]:
        """Get all workflow-scope variables as a dict"""
        with self._lock:
            return {name: var.value for name, var in self._workflow.items()}
    
    def get_all_for_node(self, node_id: str) -> Dict[str, Any]:
        """
        Get all variables accessible to a node.
        Includes workflow vars and node-specific vars.
        """
        with self._lock:
            # Start with workflow vars
            result = self.get_all_workflow_vars()
            
            # Add global vars (can be overridden by workflow)
            for name, var in self._global.items():
                if name not in result:
                    result[name] = var.value
            
            # Add node-specific vars (highest priority)
            if node_id in self._nodes:
                for name, var in self._nodes[node_id].items():
                    result[name] = var.value
            
            return result
    
    def clear_workflow(self) -> None:
        """Clear workflow and node scopes (called between runs)"""
        with self._lock:
            self._workflow.clear()
            self._nodes.clear()
            self._history.append({"action": "clear_workflow"})

    def clear_outputs_of_nodes(self, node_ids: set) -> int:
        """
        Clear workflow-scope variables that were produced by a specific
        set of nodes. Used during partial re-execution to remove stale
        outputs of nodes that are about to re-run, while keeping all
        other upstream variables intact.

        Args:
            node_ids: Set of node IDs whose outputs should be cleared.

        Returns:
            Number of variables removed.
        """
        removed = 0
        with self._lock:
            stale = [
                name
                for name, var in self._workflow.items()
                if var.node_id in node_ids
            ]
            for name in stale:
                del self._workflow[name]
                removed += 1
            # Also clear node-local scopes for those nodes
            for nid in node_ids:
                if nid in self._nodes:
                    del self._nodes[nid]
                    removed += 1
            if removed:
                self._history.append({
                    "action": "clear_outputs_of_nodes",
                    "node_ids": list(node_ids),
                    "removed": removed,
                })
        return removed
    
    def clear_all(self) -> None:
        """Clear all scopes"""
        with self._lock:
            self._global.clear()
            self._workflow.clear()
            self._nodes.clear()
            self._history.clear()
    
    def list_variables(self, scope: Optional[VariableScope] = None) -> List[Dict[str, Any]]:
        """List all variables, optionally filtered by scope."""
        with self._lock:
            result = []

            if scope is None or scope == VariableScope.GLOBAL:
                for var in self._global.values():
                    result.append(var.to_dict())

            if scope is None or scope == VariableScope.WORKFLOW:
                for var in self._workflow.values():
                    result.append(var.to_dict())

            if scope is None or scope == VariableScope.NODE:
                for node_id, vars_dict in self._nodes.items():
                    for var in vars_dict.values():  # .values() not .items() — was a bug
                        result.append(var.to_dict())

            return result
    
    def to_json(self) -> str:
        """Serialize registry state to JSON — never raises on unserializable values."""
        def _safe_encoder(obj: Any) -> str:
            """Last-resort encoder for objects that survive _serialize_value()."""
            if isinstance(obj, (bytes, bytearray)):
                return f"[bytes: {len(obj)} bytes]"
            if isinstance(obj, (set, frozenset)):
                return list(obj)
            # numpy/pandas scalars and other numeric types
            try:
                import numpy as np
                if isinstance(obj, np.integer):
                    return int(obj)
                if isinstance(obj, np.floating):
                    return float(obj)
                if isinstance(obj, np.ndarray):
                    return f"[ndarray shape={obj.shape}]"
            except ImportError:
                pass
            return f"[{type(obj).__name__}: not serializable]"

        with self._lock:
            payload = {
                "global": [v.to_dict() for v in self._global.values()],
                "workflow": [v.to_dict() for v in self._workflow.values()],
                "nodes": {
                    node_id: [v.to_dict() for v in vars_dict.values()]
                    for node_id, vars_dict in self._nodes.items()
                }
            }
        return json.dumps(payload, default=_safe_encoder)
    
    def inject_into_namespace(self, namespace: Dict[str, Any], node_id: Optional[str] = None) -> None:
        """
        Inject all accessible variables into a namespace dict.
        Used for code execution. Lazily loads DataFrames from PlasmaStore
        (shared memory) first, then falls back to IPC paths on disk.

        IMPORTANT: variable metadata is snapshotted under the lock, but all
        IO (PlasmaStore reads, file reads) is done OUTSIDE the lock to prevent
        blocking other threads that need to write to the registry.
        """
        from .plasma_store import get_plasma_store
        plasma = get_plasma_store()

        # ── Step 1: snapshot all Variable objects under the lock (fast) ──────
        with self._lock:
            snapshot: List[Variable] = []
            for var in self._global.values():
                snapshot.append(var)
            for var in self._workflow.values():
                snapshot.append(var)
            if node_id and node_id in self._nodes:
                for var in self._nodes[node_id].values():
                    snapshot.append(var)

        # ── Step 2: resolve values OUTSIDE the lock (IO may block) ───────────
        def _resolve_value(var: Variable) -> Any:
            # Priority 1: PlasmaStore (shared memory — zero-copy)
            if var.is_dataframe and var.plasma_key:
                try:
                    df = plasma.get_as_pandas(var.plasma_key)
                    if df is not None:
                        return df
                    log.warning(
                        f"PlasmaStore key '{var.plasma_key}' returned None, "
                        f"trying ipc_path fallback"
                    )
                except Exception as e:
                    log.warning(f"PlasmaStore read failed for {var.name}: {e}")

            # Priority 2: Disk-based IPC/Parquet path (fallback)
            if var.is_dataframe and var.ipc_path:
                try:
                    import pyarrow as pa
                    if var.ipc_path.endswith('.parquet'):
                        import pyarrow.parquet as pq
                        return pq.read_table(var.ipc_path).to_pandas()
                    else:
                        with pa.ipc.open_file(var.ipc_path) as reader:
                            return reader.read_all().to_pandas()
                except Exception as e:
                    log.error(
                        f"Failed to lazy-load dataframe {var.name} "
                        f"from {var.ipc_path}: {e}"
                    )
                    return None

            return var.value

        # Higher-priority sources come last so they win on name collision
        # (global < workflow < node-local)
        for var in snapshot:
            namespace[var.name] = _resolve_value(var)
    
    def extract_from_namespace(
        self,
        namespace: Dict[str, Any],
        node_id: str,
        exclude: Optional[Set[str]] = None,
    ) -> None:
        """
        Extract new variables from a namespace after code execution.
        Stores them at workflow scope for sharing between nodes.

        NOTE: We snapshot the namespace keys under a brief lock, but call
        self.set() outside the global lock. self.set() acquires _lock
        internally (it's an RLock so re-entrant), and taking the global lock
        here would cause unnecessary serialization for concurrent streaming nodes.
        """
        exclude = exclude or set()
        builtins = {
            '__builtins__', '__name__', '__doc__', '__package__',
            '__loader__', '__spec__',
        }
        exclude = exclude.union(builtins)

        # Snapshot namespace items (namespace dict lives in this thread only,
        # so no external locking needed — just copy the pairs we want)
        items_to_store = [
            (name, value)
            for name, value in namespace.items()
            if not name.startswith('_') and name not in exclude
        ]

        # Write each variable using the public set() API (which handles its own locking)
        for name, value in items_to_store:
            self.set(
                name=name,
                value=value,
                scope=VariableScope.WORKFLOW,
                node_id=node_id,
            )


# Singleton instance for the current workflow
_registry: Optional[VariableRegistry] = None
_registry_lock = __import__('threading').Lock()


def get_registry() -> VariableRegistry:
    """Get or create the global variable registry (thread-safe)."""
    global _registry
    if _registry is None:
        with _registry_lock:
            if _registry is None:
                _registry = VariableRegistry()
    return _registry


def reset_registry() -> None:
    """Reset the global registry (for testing)."""
    global _registry
    with _registry_lock:
        _registry = None
