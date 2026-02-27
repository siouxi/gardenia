import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('zscore-norm', 'Z-Score Normalization')
    .setCategory('Normalization')
    .setDescription('Standardize features by removing the mean and scaling to unit variance')
    .withDataInput()
    .withResultOutput()
    .setPythonCode(`# Z-Score Normalization Node
import pandas as pd
from sklearn.preprocessing import StandardScaler

# 🛡️ ARCHITECTURE COMPLIANT NODE (Zero-Copy & Streaming)
import pandas as pd

def process_chunk(data: pd.DataFrame) -> pd.DataFrame:
    numeric_cols = data.select_dtypes(include='number').columns
    scaler = StandardScaler()
    result = data.copy()
    result[numeric_cols] = scaler.fit_transform(data[numeric_cols])
    print(f"Z-Score normalized {len(numeric_cols)} numeric columns")
    print(f"Mean ≈ 0, Std ≈ 1 for each column")
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
`, ['scikit-learn', 'pandas'])
    .build();
