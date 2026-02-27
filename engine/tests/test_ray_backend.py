"""
Integration Tests for Ray Backend
===================================

Tests the Ray distributed execution backend for DAG workflows.
Covers:
- Simple linear DAG (START → Process → END)
- Parallel fan-out DAG (START → [A, B, C] → END)
- Local (asyncio) backend still works
- Error handling
"""

import asyncio
import sys
import os

# Add parent for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from core.dag_engine import DAGExecutor, DAGNode, DAGEdge, ExecutionState
from core.worker_manager import WorkerManager, get_worker_manager


# ---------- Helpers ----------

def make_executor(nodes, edges):
    """Create a DAGExecutor with state tracking callbacks."""
    state_log = []
    output_log = []

    def on_state(n_id, state):
        state_log.append((n_id, state))

    def on_output(n_id, text):
        output_log.append((n_id, text))

    executor = DAGExecutor(
        nodes, edges,
        on_state_change=on_state,
        on_output=on_output,
    )
    return executor, state_log, output_log


async def mock_execute_node(node: DAGNode):
    """Simple execute_node_fn for testing: runs code via WorkerManager."""
    worker = get_worker_manager()
    result = await worker.execute(
        code=node.code,
        language=node.language,
        node_id=node.id,
        parameters=node.parameters,
        timeout=node.timeout,
        memory_limit_mb=node.memory_limit,
    )
    return result.to_dict()


# ---------- Test Cases ----------

async def test_linear_dag_ray():
    """Test: START → Python Node → END  with Ray backend"""
    print("\n[TEST] Linear DAG with Ray backend...")

    nodes = [
        DAGNode("1", "START", "flow-start"),
        DAGNode("2", "Process", "python-node", code="result = 2 + 2\nprint(f'Result: {result}')"),
        DAGNode("3", "END", "flow-end"),
    ]
    edges = [
        DAGEdge("1", "2"),
        DAGEdge("2", "3"),
    ]

    executor, state_log, output_log = make_executor(nodes, edges)
    results = await executor.execute(mock_execute_node, parallel=True, backend="ray")

    # Verify all nodes completed
    assert "1" in results, "START node missing from results"
    assert "2" in results, "Process node missing from results"
    assert "3" in results, "END node missing from results"

    assert results["1"]["status"] == "success", f"START failed: {results['1']}"
    assert results["2"]["status"] == "success", f"Process failed: {results['2']}"
    assert results["3"]["status"] == "success", f"END failed: {results['3']}"

    # Check output contains our print
    process_output = results["2"].get("output", "")
    assert "Result: 4" in process_output, f"Expected 'Result: 4' in output, got: {process_output}"

    print("  ✅ Linear DAG with Ray backend PASSED")
    return True


async def test_parallel_fanout_ray():
    """Test: START → [A, B, C] → END  with Ray backend (parallel fan-out)"""
    print("\n[TEST] Parallel fan-out DAG with Ray backend...")

    nodes = [
        DAGNode("start", "START", "flow-start"),
        DAGNode("a", "Node A", "python-node", code="print('A done')"),
        DAGNode("b", "Node B", "python-node", code="print('B done')"),
        DAGNode("c", "Node C", "python-node", code="print('C done')"),
        DAGNode("end", "END", "flow-end"),
    ]
    edges = [
        DAGEdge("start", "a"),
        DAGEdge("start", "b"),
        DAGEdge("start", "c"),
        DAGEdge("a", "end"),
        DAGEdge("b", "end"),
        DAGEdge("c", "end"),
    ]

    executor, state_log, output_log = make_executor(nodes, edges)
    results = await executor.execute(mock_execute_node, parallel=True, backend="ray")

    for nid in ["start", "a", "b", "c", "end"]:
        assert nid in results, f"Node '{nid}' missing from results"
        assert results[nid]["status"] == "success", f"Node '{nid}' failed: {results[nid]}"

    print("  ✅ Parallel fan-out DAG with Ray backend PASSED")
    return True


async def test_linear_dag_local():
    """Test: Same DAG with local (asyncio) backend — backward compat check"""
    print("\n[TEST] Linear DAG with local backend (backward compat)...")

    nodes = [
        DAGNode("1", "START", "flow-start"),
        DAGNode("2", "Process", "python-node", code="x = 10\nprint(x)"),
        DAGNode("3", "END", "flow-end"),
    ]
    edges = [
        DAGEdge("1", "2"),
        DAGEdge("2", "3"),
    ]

    executor, state_log, output_log = make_executor(nodes, edges)
    results = await executor.execute(mock_execute_node, parallel=True, backend="local")

    for nid in ["1", "2", "3"]:
        assert nid in results, f"Node '{nid}' missing from results"
        assert results[nid]["status"] == "success", f"Node '{nid}' failed: {results[nid]}"

    print("  ✅ Linear DAG with local backend PASSED")
    return True


async def test_error_handling_ray():
    """Test: Node with error stops downstream execution (Ray backend)"""
    print("\n[TEST] Error handling with Ray backend...")

    nodes = [
        DAGNode("1", "START", "flow-start"),
        DAGNode("2", "Bad Node", "python-node", code="raise ValueError('intentional error')"),
        DAGNode("3", "After Error", "python-node", code="print('should not run')"),
        DAGNode("4", "END", "flow-end"),
    ]
    edges = [
        DAGEdge("1", "2"),
        DAGEdge("2", "3"),
        DAGEdge("3", "4"),
    ]

    executor, state_log, output_log = make_executor(nodes, edges)
    results = await executor.execute(mock_execute_node, parallel=True, backend="ray")

    assert results["2"]["status"] == "error", f"Bad Node should have errored: {results['2']}"

    print("  ✅ Error handling with Ray backend PASSED")
    return True


# ---------- Main ----------

async def run_all_tests():
    results = []

    tests = [
        test_linear_dag_ray,
        test_parallel_fanout_ray,
        test_linear_dag_local,
        test_error_handling_ray,
    ]

    for test_fn in tests:
        try:
            ok = await test_fn()
            results.append((test_fn.__name__, ok))
        except Exception as e:
            print(f"  ❌ {test_fn.__name__} FAILED: {e}")
            import traceback
            traceback.print_exc()
            results.append((test_fn.__name__, False))

    print("\n" + "=" * 50)
    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    print(f"Results: {passed}/{total} tests passed")

    for name, ok in results:
        status = "✅" if ok else "❌"
        print(f"  {status} {name}")

    print("=" * 50)
    return all(ok for _, ok in results)


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
