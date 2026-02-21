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

if 'data' in dir() and isinstance(data, pd.DataFrame):
    before = len(data)
    result = data.query(condition) if condition else data
    print(f"Filtered: {before} → {len(result)} rows")
    print(result.head())
else:
    print("Error: No input DataFrame 'data'")
    raise ValueError("Connect a dataset to the input")
`, ['pandas'])
    .build();
