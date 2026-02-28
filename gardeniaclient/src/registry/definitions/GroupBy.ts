import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('group-by', 'Group By')
    .setCategory('Data Wrangling')
    .setDescription('Group data by column and compute aggregate statistics')
    .withDataInput()
    .withResultOutput()
    .addString('group_col', 'Group Column', '', 'Column to group by')
    .addSelect('agg_func', 'Aggregation', ['mean', 'sum', 'count', 'median', 'min', 'max', 'std'], 'mean')
    .setPythonCode(`# Group By Node


group_col = params.get('group_col', '')
agg_func = params.get('agg_func', 'mean')

if 'data' in dir() and isinstance(data, pd.DataFrame):
if group_col and group_col in data.columns:
    numeric_cols = data.select_dtypes(include='number').columns.tolist()
    result = data.groupby(group_col)[numeric_cols].agg(agg_func).reset_index()
    print(f"Grouped by '{group_col}' with {agg_func}: {len(result)} groups")
    print(result.head(10))
else:
    raise ValueError(f"Column '{group_col}' not found. Available: {list(data.columns)}")

`, ['pandas'])
    .build();
