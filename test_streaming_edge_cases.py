import json
import logging
import asyncio
import time
import sys
import os

from engine.orchestrator import Orchestrator

# Setup basic logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# NODE CODE FRAGMENTS
# ---------------------------------------------------------------------------

# Scenario 1: Producer Crashes Halfway
# Yields 2 chunks, then raises an Exception
producer_crash_code = """
import pandas as pd
for i in range(2):
    print(f"Producer Crash: yielding chunk {i}")
    df = pd.DataFrame({"val": [1, 2, 3]})
    yield df

print("Producer Crash: ABORTING!")
raise ValueError("Simulated Producer Crash")
"""

# Consumer for Scenario 1
consumer_normal = """
import pandas as pd

total_chunks = 0
total_sum = 0
try:
    for chunk in stream_input("data"):
        total_chunks += 1
        total_sum += chunk["val"].sum()
        print(f"Consumer got chunk {total_chunks}")
    
    print(f"Consumer finished normally. Read {total_chunks} chunks. Total sum: {total_sum}")
except Exception as e:
    print(f"Consumer caught exception: {e}")
"""

# Scenario 2: Consumer Crashes Halfway
# Reads 2 chunks, then raises an Exception
producer_normal_code = """
import pandas as pd
import time
for i in range(5):
    print(f"Producer Normal: yielding chunk {i}")
    df = pd.DataFrame({"val": [1, 2, 3]})
    yield df
    # give consumer time to process and crash
    time.sleep(0.5)
print("Producer Normal finished yielding all 5 chunks.")
"""

consumer_crash_code = """
import pandas as pd

total_chunks = 0
for chunk in stream_input("data"):
    total_chunks += 1
    print(f"Consumer Crash: got chunk {total_chunks}")
    if total_chunks == 2:
        print("Consumer Crash: ABORTING!")
        raise ValueError("Simulated Consumer Crash")

print("Consumer Crash: this should never print")
"""

# Scenario 3: Multiple Producers
# Joining streams from prodA and prodB
prod_a_code = """
import pandas as pd
for i in range(2):
    df = pd.DataFrame({"source": ["A", "A"], "val": [10, 20]})
    yield df
"""

prod_b_code = """
import pandas as pd
for i in range(2):
    df = pd.DataFrame({"source": ["B", "B"], "val": [100, 200]})
    yield df
"""

consumer_join_code = """
import pandas as pd

# The consumer reads from two streams. It has to know which stream is which.
# Currently stream_input("data") just gets all channels matching the var name.
# It's better to read them sequentially or handle them inside the node.
# Let's read from both and print.

all_data = []

print("Consumer Join: gathering data...")
try:
    # This reads interleaved chunks from ANY upstream source mapped to 'data'
    for chunk in stream_input("data"):
        all_data.append(chunk)
        print(f"Got chunk from {chunk['source'].iloc[0]}")
except Exception as e:
    print(f"Consumer Join error: {e}")

if all_data:
    final_df = pd.concat(all_data, ignore_index=True)
    print(f"Final combined shape: {final_df.shape}")
    print(f"Sum of A: {final_df[final_df['source'] == 'A']['val'].sum()}")
    print(f"Sum of B: {final_df[final_df['source'] == 'B']['val'].sum()}")
"""

# Scenario 4: Backpressure (Fast Producer, Slow Consumer)
producer_fast_code = """
import pandas as pd
for i in range(10):
    print(f"Fast producer: queuing chunk {i}")
    df = pd.DataFrame({"idx": range(1000)})
    yield df
print("Fast producer finished queuing.")
"""

consumer_slow_code = """
import pandas as pd
import time
for i, chunk in enumerate(stream_input("data")):
    print(f"Slow consumer: reading chunk {i}")
    time.sleep(1) # simulate heavy processing
print("Slow consumer finished.")
"""

async def run_scenario(name, workflow, expect_error=False):
    print(f"\\n{'='*50}")
    print(f"--- RUNNING SCENARIO: {name} ---")
    print(f"{'='*50}")

    orch = Orchestrator()
    results = await orch.execute_workflow(workflow)
    
    print(f"\\nStatus: {results.get('status')}")
    
    if expect_error:
        if results.get('status') != 'error':
            print("WARNING: Expected an error but got success!")
    else:
        if results.get('status') == 'error':
            print("WARNING: Expected success but got an error!")
            
    print("\\n--- Node Logs ---")
    for node_id, data in results.items():
        if node_id in ("status", "variables", "error"): continue
        print(f"\\nNode {node_id}:")
        print(f"Status: {data.get('status')}")
        if data.get('error'):
            print(f"ERROR: {data.get('error')}")
        if data.get('output'):
            print(f"Output:\\n{data.get('output')}")

async def main():
    # 1. Producer Crash Halfway
    w1 = {
        "nodes": [
            {"id": "prod_crash", "data": {"toolId": "prod", "code": producer_crash_code, "language": "python", "parameterValues": {"variable_name": "data"}}},
            {"id": "cons_norm", "data": {"toolId": "cons1", "code": consumer_normal, "language": "python", "parameterValues": {}}}
        ],
        "edges": [
            {"source": "prod_crash", "target": "cons_norm"}
        ]
    }
    await run_scenario("Producer Crashes Halfway", w1, expect_error=True)

    # 2. Consumer Crashes Halfway
    w2 = {
        "nodes": [
            {"id": "prod_norm", "data": {"toolId": "prod", "code": producer_normal_code, "language": "python", "parameterValues": {"variable_name": "data"}}},
            {"id": "cons_crash", "data": {"toolId": "cons2", "code": consumer_crash_code, "language": "python", "parameterValues": {}}}
        ],
        "edges": [
            {"source": "prod_norm", "target": "cons_crash"}
        ]
    }
    await run_scenario("Consumer Crashes Halfway", w2, expect_error=True)
    
    # 3. Multiple Producers
    w3 = {
        "nodes": [
            {"id": "prod_A", "data": {"toolId": "prodA", "code": prod_a_code, "language": "python", "parameterValues": {"variable_name": "data"}}},
            {"id": "prod_B", "data": {"toolId": "prodB", "code": prod_b_code, "language": "python", "parameterValues": {"variable_name": "data"}}},
            {"id": "cons_join", "data": {"toolId": "cons_join", "code": consumer_join_code, "language": "python", "parameterValues": {}}}
        ],
        "edges": [
            {"source": "prod_A", "target": "cons_join"},
            {"source": "prod_B", "target": "cons_join"}
        ]
    }
    await run_scenario("Multiple Producers Join", w3, expect_error=False)
    
    # 4. Fast Producer / Slow Consumer
    w4 = {
        "nodes": [
            {"id": "prod_fast", "data": {"toolId": "prod", "code": producer_fast_code, "language": "python", "parameterValues": {"variable_name": "data"}}},
            {"id": "cons_slow", "data": {"toolId": "cons", "code": consumer_slow_code, "language": "python", "parameterValues": {}}}
        ],
        "edges": [
            {"source": "prod_fast", "target": "cons_slow"}
        ]
    }
    await run_scenario("Backpressure (Fast Producer, Slow Consumer)", w4, expect_error=False)

if __name__ == "__main__":
    asyncio.run(main())
