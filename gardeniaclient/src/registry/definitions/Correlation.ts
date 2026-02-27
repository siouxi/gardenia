import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('correlation', 'Correlation Matrix')
    .setCategory('Statistical Analysis')
    .setDescription('Compute pairwise correlation between all numeric columns')
    .withDataInput()
    .withResultOutput()
    .addSelect('method', 'Method', ['pearson', 'spearman', 'kendall'], 'pearson')
    .setPythonCode(`# Correlation Matrix Node
import pandas as pd

method = params.get('method', 'pearson')

# 🛡️ ARCHITECTURE COMPLIANT NODE (Zero-Copy & Streaming)
import pandas as pd

def process_chunk(data: pd.DataFrame) -> pd.DataFrame:
    numeric = data.select_dtypes(include='number')
    result = numeric.corr(method=method)
    print(f"Correlation matrix ({method}) for {len(numeric.columns)} columns:")
    print(result.round(3))
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
