# 🛠️ Node Development Guide: Zero-Copy & Streaming 🌊

Welcome to Gardenia node development! Gardenia is designed to process massive datasets (like Single-Cell RNA seq or large CSVs) without duplicating memory. 

This guide explains how to write code for your nodes to take advantage of these features.

---

## 🚀 1. Standard Nodes (Zero-Copy Transfer)

By default, any `pandas.DataFrame` or `pyarrow.Table` your node creates is automatically captured by Gardenia and stored in a shared memory space (Apache Plasma). 

When a downstream node needs that data, it reads it directly from RAM without copying it.

### **Producer Node (Code)**
```python
import pandas as pd
import numpy as np

# Just create your dataframe
data = pd.DataFrame({
    'gene': ['BRCA1', 'TP53', 'EGFR'],
    'expression': np.random.randn(3)
})

# The engine automatically detects the 'data' variable
# and pushes it to Shared Memory instantly.
```

### **Consumer Node (Code)**
```python
# 'data' is magically available in this node's global scope!
# It is a zero-copy PyArrow table or Pandas DataFrame.

filtered_df = data[data['expression'] > 0]
result = filtered_df
```

---

## 🌊 2. Streaming Nodes (Chunk-by-Chunk Processing)

If you are dealing with a 50GB file on a laptop with 16GB of RAM, Zero-Copy isn't enough; you will still run out of memory trying to load the whole file. 

**Solution:** Gardenia supports generator-based streaming. Nodes can process data in chunks. As soon as the first chunk is ready, downstream nodes can start working on it, simultaneously!

### **How to enable Streaming:**
Just use the `yield` keyword in your Python code. The engine will detect it and automatically switch the connection to **Streaming Mode** (indicated by an animated dashed line ⚡ in the UI).

### **Streaming Producer Node:**
```python
import pandas as pd
import numpy as np

chunk_size = 10000
total_rows = 100000

for i in range(0, total_rows, chunk_size):
    # Generate or read a chunk of data
    chunk_df = pd.DataFrame({
        'id': range(i, i + chunk_size),
        'value': np.random.rand(chunk_size)
    })
    
    # YIELD the chunk instead of storing it all in memory
    yield chunk_df
```

### **Streaming Consumer Node:**
Downstream nodes consume streams using the special injected `stream_input()` function.

```python
import pandas as pd

# The engine injects `stream_input`. Pass it the name of the expected variable.
# It acts as a standard Python iterator yielding chunks as they arrive.
stream = stream_input('data')

results = []
for chunk in stream:
    # Process just this chunk
    chunk['processed_value'] = chunk['value'] * 100
    
    # You can yield it again to keep the stream going!
    yield chunk
```

## 🧠 Key Takeaways
1. **Never use `to_csv()` or `to_parquet()`** to pass data between nodes. The engine handles memory automatically.
2. Use standard variables for data that fits in RAM (Zero-Copy).
3. Use `yield` and `stream_input()` for pipelines that exceed available RAM (Streaming).
