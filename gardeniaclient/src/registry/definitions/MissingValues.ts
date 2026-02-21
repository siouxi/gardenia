import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('missing-values', 'Missing Values Report')
    .setCategory('Quality Control')
    .setDescription('Detect and report missing values, with optional imputation')
    .withDataInput()
    .withResultOutput()
    .addSelect('action', 'Action', ['report', 'drop_rows', 'drop_cols', 'fill_mean', 'fill_median', 'fill_zero'], 'report')
    .setPythonCode(`# Missing Values Node
import pandas as pd

action = params.get('action', 'report')

if 'data' in dir() and isinstance(data, pd.DataFrame):
    missing = data.isnull().sum()
    total_missing = missing.sum()
    print(f"Total missing values: {total_missing} / {data.size} ({total_missing/data.size*100:.2f}%)")
    print(f"\\nMissing per column:")
    for col in missing[missing > 0].index:
        print(f"  {col}: {missing[col]} ({missing[col]/len(data)*100:.1f}%)")

    if action == 'report':
        result = data
    elif action == 'drop_rows':
        result = data.dropna()
        print(f"\\nDropped {len(data) - len(result)} rows with missing values")
    elif action == 'drop_cols':
        result = data.dropna(axis=1)
        print(f"\\nDropped {len(data.columns) - len(result.columns)} columns")
    elif action == 'fill_mean':
        result = data.fillna(data.select_dtypes(include='number').mean())
        print("\\nFilled numeric missing values with column means")
    elif action == 'fill_median':
        result = data.fillna(data.select_dtypes(include='number').median())
        print("\\nFilled numeric missing values with column medians")
    elif action == 'fill_zero':
        result = data.fillna(0)
        print("\\nFilled all missing values with 0")
    print(result.head())
else:
    raise ValueError("Connect a dataset to the input")
`, ['pandas'])
    .build();
