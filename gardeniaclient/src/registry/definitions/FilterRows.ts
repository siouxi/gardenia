import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('filter-rows', 'Filter Rows')
    .setCategory('Data Wrangling')
    .setDescription('Filter DataFrame rows using a Python expression')
    .withDataInput()
    .withResultOutput()
    .addString('condition', 'Filter Condition', 'data["column"] > 0', 'Python expression that evaluates to a boolean mask')
    .setPythonCode(`# Filter Rows Node
import pandas as pd

condition = params.get('condition', '')

# 🛡️ ARCHITECTURE COMPLIANT NODE (Zero-Copy & Streaming)
import pandas as pd

def process_chunk(data: pd.DataFrame) -> pd.DataFrame:
    before = len(data)
    result = data.query(condition) if condition else data
    print(f"Filtered: {before} → {len(result)} rows")
    print(result.head())
    return result if 'result' in locals() else data

# 1. STREAMING MODE SUPPORT
if 'stream_input' in dir() and hasattr(stream_input('data'), '__iter__'):
    stream = stream_input('data')
    for chunk in stream:
        yield process_chunk(chunk)

# 2. ZERO-COPY FULL MEMORY MODE SUPPORT
elif 'data' in dir() and isinstance(data, pd.DataFrame):
    result = process_chunk(data)
    print("Zero-Copy block processed successfully.")
else:
    raise ValueError("Connect a dataset (Zero-Copy) or stream (Streaming) to the input.")
`, ['pandas'])
    .build();
