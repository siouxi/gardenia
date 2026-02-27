import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('group-by', 'Group By')
    .setCategory('Data Wrangling')
    .setDescription('Group data by column and compute aggregate statistics')
    .withDataInput()
    .withResultOutput()
    .addString('group_col', 'Group Column', '', 'Column to group by')
    .addSelect('agg_func', 'Aggregation', ['mean', 'sum', 'count', 'median', 'min', 'max', 'std'], 'mean')
    .setPythonCode(`# Group By Node
import pandas as pd

group_col = params.get('group_col', '')
agg_func = params.get('agg_func', 'mean')

# 🛡️ ARCHITECTURE COMPLIANT NODE (Zero-Copy & Streaming)
import pandas as pd

def process_chunk(data: pd.DataFrame) -> pd.DataFrame:
    if group_col and group_col in data.columns:
        numeric_cols = data.select_dtypes(include='number').columns.tolist()
        result = data.groupby(group_col)[numeric_cols].agg(agg_func).reset_index()
        print(f"Grouped by '{group_col}' with {agg_func}: {len(result)} groups")
        print(result.head(10))
    else:
        raise ValueError(f"Column '{group_col}' not found. Available: {list(data.columns)}")
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
