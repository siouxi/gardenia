"""
Gardenia Core Engine
====================

Scalable DAG-based execution engine with:
- Topological workflow execution
- Scoped variable registry
- Multi-language worker support (Python, R)
- Arrow/Parquet data storage

Architecture:
    React UI → Node Orchestrator → DAG Engine → Worker Manager → Workers
                                      ↓
                              Variable Registry
                                      ↓
                              Arrow Storage
"""

from .dag_engine import DAGExecutor, DAGNode, ExecutionState
from .variable_registry import VariableRegistry, VariableScope
from .worker_manager import WorkerManager, WorkerType
from .storage import ArrowStorage
from .plasma_store import PlasmaStore, get_plasma_store
from .stream_channel import StreamChannel, StreamRegistry, get_stream_registry
from .ray_backend import RayDAGRunner, ensure_ray, shutdown_ray

__all__ = [
    'DAGExecutor',
    'DAGNode', 
    'ExecutionState',
    'VariableRegistry',
    'VariableScope',
    'WorkerManager',
    'WorkerType',
    'ArrowStorage',
    'PlasmaStore',
    'get_plasma_store',
    'StreamChannel',
    'StreamRegistry',
    'get_stream_registry',
    'RayDAGRunner',
    'ensure_ray',
    'shutdown_ray',
]

__version__ = '1.0.0'
