import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('summary-stats', 'Summary Statistics')
    .setCategory('Quality Control')
    .setDescription('Generate descriptive statistics for all columns in a dataset')
    .withDataInput()
    .withResultOutput()
    .setPythonCode(`# Summary Statistics Node
import pandas as pd

# 🛡️ ARCHITECTURE COMPLIANT NODE (Zero-Copy & Streaming)
import pandas as pd

def process_chunk(data: pd.DataFrame) -> pd.DataFrame:
    print(f"Dataset shape: {data.shape[0]} rows × {data.shape[1]} columns")
    print(f"\\nColumn types:\\n{data.dtypes.value_counts().to_string()}")
    print(f"\\nMemory usage: {data.memory_usage(deep=True).sum() / 1024:.1f} KB")
    result = data.describe(include='all').T
    result['missing'] = data.isnull().sum()
    result['missing_pct'] = (data.isnull().sum() / len(data) * 100).round(2)
    print(f"\\nDescriptive Statistics:")
    print(result)
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
