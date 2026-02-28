"""
test_r_interop.py
Tests for Python → R → Python zero-copy data sharing:
  1. Complex type coercion (dates, nulls, categoricals, booleans)
  2. Shared memory leak detection  
  3. R crash in the middle of execution
  4. Empty DataFrame
  5. Large DataFrame performance
"""

import asyncio
import glob
import os
import sys
import pandas as pd
import numpy as np

PYTHONPATH = os.path.join(os.path.dirname(__file__), "engine")
sys.path.insert(0, PYTHONPATH)

from engine.orchestrator import Orchestrator


def list_shm_gardenia_files():
    """List all gardenia_ files in /dev/shm."""
    return glob.glob("/dev/shm/gardenia_*")


def check_rscript_available():
    """Return the Rscript path or None if not found."""
    import shutil
    return shutil.which("Rscript")


async def run_r_workflow(py_code, r_code, parameters=None):
    orch = Orchestrator()
    workflow = {
        "nodes": [
            {
                "id": "py_node",
                "data": {
                    "toolId": "pynode",
                    "code": py_code,
                    "language": "python",
                    "parameterValues": parameters or {}
                }
            },
            {
                "id": "r_node",
                "data": {
                    "toolId": "rnode",
                    "code": r_code,
                    "language": "r",
                    "parameterValues": {}
                }
            }
        ],
        "edges": [{"source": "py_node", "target": "r_node"}]
    }
    return await orch.execute_workflow(workflow)


async def test_complex_types():
    """Test complex Python types through the R bridge."""
    print("\n" + "="*50)
    print("TEST 1: Complex Datatype Coercion")
    print("="*50)

    shm_before = set(list_shm_gardenia_files())

    py_code = """
import pandas as pd
import numpy as np

df_out = pd.DataFrame({
    "dates": pd.date_range("2023-01-01", periods=5, tz="UTC"),
    "texts": ["hello", "world", "with", "unicode: ok", None],
    "int_nulls": pd.array([1, 2, None, 4, 5], dtype="Int64"),
    "cats": pd.Categorical(["A", "B", "A", "C", "A"]),
    "bools": pd.array([True, False, None, True, False], dtype="boolean")
})
print("Python created df_out with dtypes:")
print(df_out.dtypes.to_string())
"""

    r_code = """
# Verify that the DataFrame arrived intact
cat("R received df_out with", nrow(df_out), "rows and", ncol(df_out), "columns\\n")
cat("R column types:\\n")
print(sapply(df_out, class))

# Write it back as a result
df_result <- df_out
cat("R df_result shape:", nrow(df_result), "x", ncol(df_result), "\\n")
"""

    results = await run_r_workflow(py_code, r_code)

    shm_after = set(list_shm_gardenia_files())
    new_files = shm_after - shm_before

    for node_id, data in results.get('results', {}).items():
        print(f"\n[{node_id}] status={data.get('status')}")
        if data.get("output"):
            print(f"  output: {data.get('output').strip()}")
        if data.get("error"):
            print(f"  ERROR: {data.get('error')}")

    print(f"\nStatus: {results.get('status')}")
    if new_files:
        print(f"  LEAK DETECTED: {len(new_files)} new /dev/shm files created:")
        for f in new_files:
            sz = os.path.getsize(f) / 1024
            print(f"  - {os.path.basename(f)}  ({sz:.1f} KB)")
    else:
        print("  No /dev/shm leaks detected.")

    return results


async def test_r_crash():
    """Test R node crashing mid-execution — Python side should not hang."""
    print("\n" + "="*50)
    print("TEST 2: R Node Crash Recovery")
    print("="*50)

    py_code = """
import pandas as pd
df_for_r = pd.DataFrame({"a": [1, 2, 3]})
"""

    r_code = """
# Intentional crash in R
cat("R is about to crash...\\n")
stop("Simulated R crash!")
df_result <- df_for_r  # Should never run
"""

    results = await run_r_workflow(py_code, r_code)
    print(f"Workflow status: {results.get('status')}")
    for node_id, data in results.get('results', {}).items():
        if isinstance(data, dict):
            print(f"\n[{node_id}] status={data.get('status')}")
            if data.get("error"):
                print(f"  error: {data.get('error')[:200]}")
            if data.get("output"):
                print(f"  output: {data.get('output').strip()[:200]}")


async def test_empty_dataframe():
    """Test empty DataFrame through the bridge."""
    print("\n" + "="*50)
    print("TEST 3: Empty DataFrame Round-Trip")
    print("="*50)

    py_code = """
import pandas as pd
df_empty = pd.DataFrame({"col1": pd.Series([], dtype='float64'), "col2": pd.Series([], dtype='str')})
print(f"Python sent empty df: {df_empty.shape}")
"""

    r_code = """
cat("R received df_empty:", nrow(df_empty), "rows x", ncol(df_empty), "cols\\n")
df_processed <- df_empty
"""

    results = await run_r_workflow(py_code, r_code)
    print(f"Status: {results.get('status')}")
    for node_id, data in results.get('results', {}).items():
        if isinstance(data, dict):
            print(f"[{node_id}] status={data.get('status')} | output={repr(data.get('output', '')[:100])}")
            if data.get("error"):
                print(f"  ERROR: {data.get('error')[:200]}")


async def test_large_dataframe():
    """Test larger DataFrame zero-copy transfer performance."""
    print("\n" + "="*50)
    print("TEST 4: Large DataFrame Performance")
    print("="*50)

    import time

    py_code = """
import pandas as pd
import numpy as np
n = 200_000
df_big = pd.DataFrame({
    "a": np.random.randn(n),
    "b": np.random.randint(0, 100, n),
    "c": np.random.choice(["foo", "bar", "baz"], n),
})
print(f"Python sent df_big: {df_big.shape}")
"""

    r_code = """
cat("R received df_big:", nrow(df_big), "rows\\n")
avg_a <- mean(df_big$a)
cat("mean(a):", avg_a, "\\n")

df_summary <- data.frame(n = nrow(df_big), mean_a = avg_a)
"""

    t0 = time.perf_counter()
    results = await run_r_workflow(py_code, r_code)
    elapsed = time.perf_counter() - t0

    print(f"Status: {results.get('status')} | Time: {elapsed:.2f}s")
    for node_id, data in results.get('results', {}).items():
        if isinstance(data, dict):
            print(f"[{node_id}] status={data.get('status')}")
            if data.get("output"):
                print(f"  output: {data.get('output').strip()[:200]}")
            if data.get("error"):
                print(f"  ERROR: {data.get('error')[:200]}")


async def test_stale_shm_cleanup():
    """Report stale gardenia_ files in /dev/shm that are older than the current session."""
    print("\n" + "="*50)
    print("TEST 5: Stale /dev/shm Cleanup Check")
    print("="*50)

    import time
    now = time.time()
    files = list_shm_gardenia_files()

    stale = []
    for f in files:
        try:
            age = now - os.path.getmtime(f)
            if age > 300:  # older than 5 minutes
                stale.append((f, age))
        except Exception:
            pass

    if stale:
        total_size_kb = sum(
            os.path.getsize(f) / 1024 for f, _ in stale if os.path.exists(f)
        )
        print(f"  FOUND {len(stale)} stale /dev/shm files ({total_size_kb:.0f} KB total):")
        for f, age in sorted(stale, key=lambda x: -x[1])[:10]:
            print(f"  - {os.path.basename(f)} ({age/60:.1f} min old)")
    else:
        print("  No stale /dev/shm files found.")

    return stale


async def test_direct_r_types():
    """Direct RWorkerBridge test for complex Arrow type coercion."""
    print("\n" + "="*50)
    print("TEST 0: Direct R Bridge — Complex Type Round-trip")
    print("="*50)

    from engine.core.worker_manager import RWorkerBridge
    from engine.core.variable_registry import get_registry, reset_registry, VariableScope

    reset_registry()
    registry = get_registry()

    # Put a complex DataFrame in the registry so R picks it up
    df_complex = pd.DataFrame({
        "dates": pd.date_range("2023-01-01", periods=4, tz="UTC"),
        "texts": ["hello", "world", "null_next", None],
        "int_nulls": pd.array([1, 2, None, 4], dtype="Int64"),
        "cats": pd.Categorical(["A", "B", "A", "C"]),
        "bools": pd.array([True, False, None, True], dtype="boolean"),
    })
    registry.set("df_complex", df_complex, scope=VariableScope.WORKFLOW, node_id="test_direct")

    bridge = RWorkerBridge(registry)
    r_code = """
cat("Columns:", paste(names(df_complex), collapse=", "), "\\n")
cat("Rows:", nrow(df_complex), "\\n")
cat("Types:\\n")
print(sapply(df_complex, class))

# Check for any NA values that should be present
cat("NA counts:\\n")
print(colSums(is.na(df_complex)))

# Output a processed version
df_result <- df_complex
"""
    result = await bridge.execute(r_code, "test_direct")
    print(f"  Status: {result.status}")
    if result.output:
        print("  R output:")
        for line in result.output.strip().split("\n"):
            print("    " + line)
    if result.error and result.error != "{}":
        print(f"  ERROR: {result.error}")
    bridge.stop()
    print("  PASS" if result.status == "success" else "  FAIL")


async def main():
    rscript = check_rscript_available()
    if not rscript:
        print("SKIP: Rscript not found on PATH. Skipping R interop tests.")
        return

    print(f"Rscript found at: {rscript}")

    # Run all tests
    await test_direct_r_types()
    await test_stale_shm_cleanup()
    await test_complex_types()
    await test_r_crash()
    await test_empty_dataframe()
    await test_large_dataframe()

    # Final cleanup report
    print("\n" + "="*50)
    print("Final /dev/shm state:")
    files = list_shm_gardenia_files()
    print(f"  {len(files)} gardenia_ files in /dev/shm")
    for f in files:
        print(f"  - {os.path.basename(f)} ({os.path.getsize(f)//1024} KB)")


if __name__ == "__main__":
    asyncio.run(main())
