import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('select-columns', 'Select Columns')
    .setCategory('Data Wrangling')
    .setDescription('Select or drop columns from a DataFrame')
    .withDataInput()
    .withResultOutput()
    .addString('columns', 'Columns', '', 'Comma-separated column names to keep')
    .addToggle('drop_mode', 'Drop Instead of Keep', false, 'If enabled, drops the listed columns instead')
    .setPythonCode(`# Select Columns Node


cols = [c.strip() for c in params.get('columns', '').split(',') if c.strip()]
drop_mode = params.get('drop_mode', False)

if 'data' in dir() and isinstance(data, pd.DataFrame):
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

`, ['pandas'])
    .build();
