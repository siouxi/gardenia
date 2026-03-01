# 🛠️ Creating Nodes in Gardenia: The Complete Guide

Gardenia is a high-performance visual workflow engine designed to process massive datasets (like Single-Cell RNA seq or large CSVs) natively without memory duplication. 

This guide details exactly how to create new nodes, how to configure their inputs and outputs, and how data moves securely and quickly between them using Arrow and Plasma Store.

---

## 🏗️ Structure of a Node Definition

In Gardenia, nodes are defined as `ToolDefinition` objects in TypeScript (usually placed inside `gardeniaclient/src/registry/definitions/`).

Every node needs a definition file that exports an object like this:

```typescript
import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'my-custom-node',
    name: 'My Custom Node',
    description: 'This is what my node does.',
    category: 'Data Processing',
    version: '1.0.0',
    language: 'python', // Can be 'python' or 'r'
    
    // UI Connections (Ports)
    inputs: [
        { name: 'data', type: 'dataset', description: 'Input data table' }
    ],
    outputs: [
        { name: 'result', type: 'dataset', description: 'Output data table' }
    ],
    
    // Configuration UI (Side panel)
    parameters: [
        {
            name: 'multiplier',
            type: 'number',
            label: 'Value Multiplier',
            default: 10,
            required: true
        }
    ],
    
    // The actual functional code
    defaultCode: `
# Your python or R code here
result = data * params['multiplier']
`,
};

export default tool;
```

---

## 📥 Receiving Inputs

Unlike traditional programming where you pass arguments to a function, **Gardenia injects data directly into your node's global environment**. You do not need to write `load_csv()` or `read_parquet()` to move data between nodes. 

### 1. Node Parameters (UI Settings)
When you define a parameter in the `parameters` array (e.g., `multiplier`), the Engine automatically injects it in two ways inside Python:
1. As a global variable with the exact name: `multiplier`
2. Inside the `params` dictionary: `params['multiplier']`

In R, parameters are injected directly as global variables: `multiplier`.

### 2. Upstream Data (Edges/Connections)
If a previous node outputs a table named `processed_data`, and you connect that node to your new node, **that table is instantly available as a variable named `processed_data`** in your code.

Behind the scenes, the Motor (`worker_manager.py`) maps the Zero-Copy Apache Plasma shared memory segment to that variable name so you can start manipulating it instantly.

*Example:*
```python
# 'processed_data' is already in RAM, injected by the engine
filtered_df = processed_data[processed_data['value'] > 100]
```

### 3. The `inputs` Dictionary
For convenience, Python nodes also receive an `inputs` dictionary containing all parameters and upstream variables.
```python
x = inputs['processed_data']
y = inputs['multiplier']
```

---

## 📤 Sending Outputs

Sending data to the next node is even easier than receiving it. 

**Any new variable you create in your node's global scope is automatically extracted** by the Engine's `VariableRegistry` when the node finishes executing.

If your code says:
```python
# We grabbed the injected variable 'data' and created a new one called 'result'
result = data.groupby('Category').sum()
```

Gardenia detects that `result` is a new pandas DataFrame or Arrow Table. It immediately moves it into the Apache Plasma Shared Memory Store, and exposes `result` as an output port for the next nodes to consume without copying the RAM.

### Important Output Rules:
- **Never use `to_csv()` or `to_parquet()`** to pass data between nodes. The engine handles memory automatically.
- Only variables created *during* the execution are extracted.
- If you want a specific variable to link to the UI's output port, use that exact variable name in the `outputs` array of your TypeScript definition (e.g., `{ name: 'result', type: 'dataset' }`).

---

## ⚡ Streaming Nodes (Chunk-by-Chunk)

When processing files larger than your RAM (e.g., a 50GB fastq or massive CSV file), standard zero-copy is not enough because the entire file simply won't fit into memory at once. Gardenia handles this via **Generators** and **Arrow StreamChannels**.

### How Streaming Works Under the Hood
1. Instead of storing a full dataset in Plasma shared memory, the Engine detects a `yield` in your code and automatically creates a `StreamChannel`.
2. A `StreamChannel` acts like a pipe using Arrow IPC streaming format.
3. Every time your producer node yields a DataFrame chunk, it is serialized into an Arrow RecordBatch and pushed into the pipe.
4. Downstream consumer nodes connected to this port *start executing immediately*, pulling from the pipe concurrently as chunks become available, without waiting for the producer to finish.
5. This limits the total RAM usage to just the size of the current chunks in transit (e.g. 10,000 rows at a time).

### Creating a Streaming Output
To make a node stream data instead of sending it all at once, simply use the `yield` keyword in Python. The engine will detect this and switch the node connection to animated Streaming Mode (⚡).

```python
import pandas as pd
import numpy as np

# Choose an appropriate chunk size that balances overhead vs memory
chunk_size = 10000 
for i in range(0, 100000, chunk_size):
    chunk_df = pd.DataFrame({
        'id': range(i, i + chunk_size),
        'value': np.random.rand(chunk_size)
    })
    
    # YIELD the chunk instead of storing it all in memory
    # The engine intercepts this and pushes it to the StreamChannel
    yield chunk_df
```

### Consuming a Stream
Downstream nodes consume streams using the special injected `stream_input()` function, which acts as a standard iterator.

```python
# stream_input is injected automatically. Give it the name of the upstream variable.
stream = stream_input('chunk_df')

# The loop halts and waits whenever the pipe is empty, continuing as chunks arrive
for chunk in stream:
    # Process just this chunk
    chunk['processed'] = chunk['value'] * 100
    
    # You can yield it again to keep the stream going to the next node!
    yield chunk
```

---

## 🔀 Advanced: Conditional Routing (Branching)

Sometimes a node needs to decide which path the workflow should take (e.g., If data is valid, go to Node A; if invalid, go to Node B).

To do this, you assign a value to the special global variable `__branch_handle__`.

### Typescript Definition
Define outputs that act as branches.
```typescript
outputs: [
    { name: 'valid_data', type: 'dataset' },
    { name: 'error_log', type: 'dataset' }
]
```

### Python Code
```python
if len(data) > 0:
    valid_data = data
    # Tell the orchestrator to only execute the nodes connected to the 'valid_data' port
    __branch_handle__ = 'valid_data'
else:
    error_log = "Data was empty!"
    # Tell the orchestrator to route execution down the 'error_log' branch
    __branch_handle__ = 'error_log'
```

---

## 📦 R Nodes Support
Creating nodes in R is highly supported. R nodes run in a persistent bridge subprocess.
- **Inputs**: Upstream DataFrames are converted securely via Arrow IPC files or Plasma Shared Memory and loaded into R as native `data.frame` objects automatically. Parameters are injected as standalone R variables.
- **Outputs**: Any new `data.frame` created in R is serialized back to Arrow automatically and injected into the Python Orchestrator for downstream nodes.
- *Note:* R nodes currently do not support the `yield` streaming generator pattern manually; they consume and produce full `data.frame`s.

```R
# R Node Example
# 'data' (DataFrame) and 'multiplier' (Numeric) are already in the global environment

result <- data
result$value <- result$value * multiplier

# 'result' is automatically intercepted and sent to the next node
```
