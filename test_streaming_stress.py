import asyncio
import pandas as pd
import numpy as np
import time
from engine.orchestrator import Orchestrator

async def run_scenario(name, workflow_data):
    print(f"\n{'='*50}")
    print(f"--- RUNNING SCENARIO: {name} ---")
    print(f"{'='*50}")
    
    orchestrator = Orchestrator()
    result = await orchestrator.execute_workflow(workflow_data)
    
    print(f"\nStatus: {result.get('status')}")
    if "error" in result:
        print(f"Workflow Error: {result['error']}")
        
    if "results" in result:
        print("\n--- Node Logs ---")
        for node_id, node_res in result["results"].items():
            print(f"\\nNode {node_id}:")
            if "status" in node_res:
                print(f"Status: {node_res['status']}")
            if "output" in node_res:
                print(node_res["output"].strip())
            if "error" in node_res and node_res["error"]:
                print(f"ERROR: {node_res['error']}")
    return result

async def test_streaming_branching():
    # Scenario 3: Branching (1 Producer -> 2 Consumers)
    # Testing if a single stream can be reliably consumed by multiple downstream nodes
    # (Note: Current StreamChannel architecture is 1:1, so we expect the orchestrator to either 
    # create multiple channels, or fail gracefully. Let's see how it behaves.)
    
    producer = """
import pandas as pd
for i in range(2):
    df = pd.DataFrame({'val': [i, i+10]})
    yield df
"""

    consumer_a = """
import pandas as pd
stream = stream_input('data')
total = 0
for idx, chunk in enumerate(stream):
    print(f"Consumer A got chunk {idx} sum {chunk['val'].sum()}")
    total += chunk['val'].sum()
print(f"A Final Sum: {total}")
"""

    consumer_b = """
import pandas as pd
stream = stream_input('data')
total = 0
for idx, chunk in enumerate(stream):
    print(f"Consumer B got chunk {idx} sum {chunk['val'].sum()}")
    total += chunk['val'].sum()
print(f"B Final Sum: {total}")
"""

    workflow = {
        "nodes": [
            {"id": "prod1", "data": {"toolId": "prod", "code": producer, "language": "python", "parameterValues": {"variable_name": "data"}}},
            {"id": "consA", "data": {"toolId": "consA", "code": consumer_a, "language": "python", "parameterValues": {}}},
            {"id": "consB", "data": {"toolId": "consB", "code": consumer_b, "language": "python", "parameterValues": {}}}
        ],
        "edges": [
            {"source": "prod1", "target": "consA"},
            {"source": "prod1", "target": "consB"}
        ]
    }
    
    await run_scenario("Branching (1 Producer -> 2 Consumers)", workflow)


async def test_large_memory_stream():
    # Scenario 4: High memory / High throughput stream
    # Testing if the system can process millions of rows in small memory footprints
    
    producer_large = """
import pandas as pd
import numpy as np
# 10 chunks of 100k rows each = 1M rows
for i in range(10):
    df = pd.DataFrame({'val': np.random.rand(100000)})
    yield df
"""

    consumer_agg = """
import pandas as pd
stream = stream_input('data')
total_rows = 0
global_mean = 0.0

for idx, chunk in enumerate(stream):
    chunk_len = len(chunk)
    total_rows += chunk_len
    # Incremental mean
    global_mean += (chunk['val'].sum() - global_mean * chunk_len) / total_rows

print(f"Processed {total_rows} rows.")
print(f"Global mean: {global_mean:.4f}")
"""
    
    workflow = {
        "nodes": [
            {"id": "prod_mem", "data": {"toolId": "prod_mem", "code": producer_large, "language": "python", "parameterValues": {"variable_name": "data"}}},
            {"id": "cons_agg", "data": {"toolId": "cons_agg", "code": consumer_agg, "language": "python", "parameterValues": {}}}
        ],
        "edges": [
            {"source": "prod_mem", "target": "cons_agg"}
        ]
    }
    
    await run_scenario("Large Data Stream (1M rows incremental mean)", workflow)

if __name__ == "__main__":
    async def main():
        await test_streaming_branching()
        await test_large_memory_stream()
    asyncio.run(main())
