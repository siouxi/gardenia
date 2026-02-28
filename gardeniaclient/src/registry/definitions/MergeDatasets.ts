import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('merge-datasets', 'Merge Datasets')
    .setCategory('Data Wrangling')
    .setDescription('Merge two DataFrames using a join operation')
    .addInput('left', 'dataset', 'Left DataFrame')
    .addInput('right', 'dataset', 'Right DataFrame')
    .withResultOutput()
    .addString('on', 'Join Column', '', 'Column name to join on')
    .addSelect('how', 'Join Type', ['inner', 'left', 'right', 'outer'], 'inner')
    .setPythonCode(`# Merge Datasets Node


on_col = params.get('on', '')
how = params.get('how', 'inner')

if 'left' in dir() and 'right' in dir():
    if on_col:
        result = pd.merge(left, right, on=on_col, how=how)
    else:
        result = pd.merge(left, right, left_index=True, right_index=True, how=how)
    print(f"Merged: {len(left)} + {len(right)} → {len(result)} rows ({how} join)")
    print(result.head())
else:
    raise ValueError("Connect two datasets to 'left' and 'right' inputs")
`, ['pandas'])
    .build();
