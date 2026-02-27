import asyncio
from engine.orchestrator import Orchestrator
from engine.core.dag_engine import ExecutionState

async def test_streaming_pipeline():
    # 1. Initialize orchestrator
    print("\n--- Initializing Orchestrator ---")
    orchestrator = Orchestrator()

    print("Session ready! Defining streaming DAG...")

    # 2. Define a mock workflow
    # Producer: Generates 3 chunks and yields them
    producer_code = """
import pandas as pd
import time

print("Producer: Starting data generation...")
for i in range(3):
    print(f"Producer: Yielding chunk {i+1}/3")
    df = pd.DataFrame({'chunk_id': [i], 'data': [100 * i]})
    time.sleep(1) # Simulate slow generation
    yield df
print("Producer: Finished.")
"""

    # Consumer: Reads from the stream
    consumer_code = """
import pandas as pd
import time

print("Consumer: Waiting for stream...")
stream = stream_input('data')

results = []
for idx, chunk in enumerate(stream):
    print(f"\\nConsumer: Received chunk {idx+1}")
    print(chunk)
    results.append(chunk)
    time.sleep(0.5) # Simulate processing time

print("Consumer: Stream exhausted. Compiling final result.")
if results:
    final_df = pd.concat(results)
    result = final_df
"""

    workflow_data = {
        "nodes": [
            {
                "id": "node-1",
                "data": {
                    "toolId": "producer-node",
                    "code": producer_code,
                    "language": "python",
                    "parameters": {"variable_name": "data"}
                }
            },
            {
                "id": "node-2",
                "data": {
                    "toolId": "consumer-node",
                    "code": consumer_code,
                    "language": "python",
                    "parameters": {}
                }
            }
        ],
        "edges": [
            {
                "source": "node-1",
                "target": "node-2"
            }
        ]
    }

    print("\n--- Executing Streaming Workflow ---")
    # 3. Execute Workflow
    # Orchestrator sends events via stdout JSONs, but the execute module also returns the final result
    result = await orchestrator.execute_workflow(workflow_data)
    
    print("\n--- Execution Finished ---")
    print(f"Status: {result['status']}")

    if "results" in result:
        print("\n--- Node Logs ---")
        for node_id, node_res in result["results"].items():
            print(f"\\nNode {node_id}:")
            if "output" in node_res:
                print(node_res["output"].strip())
            if "error" in node_res and node_res["error"]:
                print(f"ERROR: {node_res['error']}")

if __name__ == "__main__":
    asyncio.run(test_streaming_pipeline())
