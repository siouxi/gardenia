import asyncio
import pandas as pd
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

async def test_streaming_chain():
    # Scenario 1: A -> B -> C (Producer -> Transform -> Consumer)
    # Using the exact process_chunk structure we injected into all nodes
    
    producer = """
import pandas as pd
for i in range(3):
    df = pd.DataFrame({'val': [i, i+10]})
    yield df
"""

    transform = """
import pandas as pd

def process_chunk(data: pd.DataFrame) -> pd.DataFrame:
    data['val_doubled'] = data['val'] * 2
    return data

if 'stream_input' in globals() and hasattr(stream_input('data'), '__iter__'):
    stream = stream_input('data')
    for chunk in stream:
        yield process_chunk(chunk)
elif 'data' in globals() and isinstance(globals()['data'], pd.DataFrame):
    result = process_chunk(globals()['data'])
else:
    raise ValueError("No input")
"""

    consumer = """
import pandas as pd
stream = stream_input('data')
total = 0
for idx, chunk in enumerate(stream):
    print(f"Consumer got chunk {idx} with {len(chunk)} rows")
    total += chunk['val_doubled'].sum()
print(f"Final Sum: {total}")
"""

    workflow = {
        "nodes": [
            {"id": "n1", "data": {"toolId": "prod", "code": producer, "language": "python", "parameterValues": {"variable_name": "data"}}},
            {"id": "n2", "data": {"toolId": "trans", "code": transform, "language": "python", "parameterValues": {"variable_name": "data"}}},
            {"id": "n3", "data": {"toolId": "cons", "code": consumer, "language": "python", "parameterValues": {}}}
        ],
        "edges": [
            {"source": "n1", "target": "n2"},
            {"source": "n2", "target": "n3"}
        ]
    }
    
    await run_scenario("Chain (Producer -> Transform -> Consumer)", workflow)


async def test_error_in_stream():
    # Scenario 2: Producer crashes halfway. Consumer should not hang forever.
    producer_crash = """
import pandas as pd
import time
for i in range(3):
    if i == 1:
        raise ValueError("Simulated Producer Crash!")
    df = pd.DataFrame({'val': [i]})
    time.sleep(0.5)
    yield df
"""

    consumer = """
import pandas as pd
stream = stream_input('data')
for chunk in stream:
    print(f"Consumer got chunk: {chunk.iloc[0]['val']}")
print("Consumer completed successfully.")
"""
    
    workflow = {
        "nodes": [
            {"id": "n1", "data": {"toolId": "prod", "code": producer_crash, "language": "python", "parameterValues": {"variable_name": "data"}}},
            {"id": "n2", "data": {"toolId": "cons", "code": consumer, "language": "python", "parameterValues": {}}}
        ],
        "edges": [
            {"source": "n1", "target": "n2"}
        ]
    }
    
    await run_scenario("Error middle of stream", workflow)

if __name__ == "__main__":
    async def main():
        await test_streaming_chain()
        await test_error_in_stream()
    asyncio.run(main())
