import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('select-columns', 'Select Columns')
    .setCategory('Data Wrangling')
    .setDescription('Select or drop columns from a DataFrame')
    .withDataInput()
    .withResultOutput()
    .addString('columns', 'Columns', '', 'Comma-separated column names to keep')
    .addToggle('drop_mode', 'Drop Instead of Keep', false, 'If enabled, drops the listed columns instead')
    .setPythonCode(`# Select Columns Node
import pandas as pd

cols = [c.strip() for c in params.get('columns', '').split(',') if c.strip()]
drop_mode = params.get('drop_mode', False)

# 🛡️ ARCHITECTURE COMPLIANT NODE (Zero-Copy & Streaming)
import pandas as pd

def process_chunk(data: pd.DataFrame) -> pd.DataFrame:
    if cols:
        if drop_mode:
            result = data.drop(columns=[c for c in cols if c in data.columns])
            print(f"Dropped {len(cols)} columns → {len(result.columns)} remaining")
        else:
            valid = [c for c in cols if c in data.columns]
            result = data[valid]
            print(f"Selected {len(valid)} columns")
    else:
        result = data
        print("No columns specified, passing through all data")
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
