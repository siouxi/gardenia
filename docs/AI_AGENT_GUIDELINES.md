# ⛔️ STRICT AI AGENT GUIDELINES ⛔️

**CRITICAL INSTRUCTION FOR ALL AI AGENTS ASSISTING WITH THIS PROJECT:**
You are working on **Gardenia**, a high-performance visual workflow engine for data science and bioinformatics.

## 1. DO NOT MODIFY THE CORE ARCHITECTURE
The core engine (`engine/core/`) has been heavily optimized for performance, zero-copy data sharing, and stream processing. 
**UNDER NO CIRCUMSTANCES should you modify the following files without EXPLICIT, direct permission from the user:**
- `engine/core/dag_engine.py` (DAG Execution & Orchestration)
- `engine/core/worker_manager.py` (Subprocess & Execution Sandboxing)
- `engine/core/plasma_store.py` (Zero-copy memory management via Apache Plasma/Arrow)
- `engine/core/stream_channel.py` (Yield-based streaming chunk architecture)
- `engine/orchestrator.py` (WebSocket & IPC communication)

## 2. THE DATA SHARING MODEL
Gardenia uses **Apache Arrow & Plasma Store** for zero-copy memory sharing and asynchronous streaming, NOT standard Pandas DataFrames passing or disk saving.
- **Do NOT** suggest or implement saving intermediate CSV/Parquet files to disk to pass data between nodes.
- **Do NOT** attempt to use `pickle` for large dataframes.
- Nodes communicate by returning `pd.DataFrame` or `pa.Table`, which the engine automatically intercepts, pushes to the Plasma store, and makes available to the next node via memory addresses.
- Streaming nodes communicate by using the `yield` keyword, which the engine automatically wraps in an Arrow `StreamChannel`.

## 3. CREATING NEW NODES
When the user asks you to "create a new node" or "add a new tool":
1. You only need to write the **functional code** that runs inside the node.
2. The code will be executed in an isolated environment.
3. Access upstream data via the injected global variables (e.g., if the previous node outputs `_df`, the current node can just use `_df`).
4. To stream data, use the injected `stream_input('var_name')` iterator.
5. To output data, simply declare a variable (e.g. `result = df`) or use `yield chunk`.

## 4. UI COMPONENTS (ReactFlow)
- Modifying React components in `gardeniaclient/src/components/` is allowed, but **do not** break the existing `NodeTypes` or `EdgeTypes` (`StreamEdge` is used for visual streaming feedback).
- If adding a new node type to the UI, ensure it maps correctly to the backend tool ID.

**Violating these architectural constraints will break the zero-memory-copy pipeline and cause OOM (Out of Memory) crashes on large genomic datasets.**
