import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('summary-stats', 'Summary Statistics')
    .setCategory('Quality Control')
    .setDescription('Generate descriptive statistics for all columns in a dataset')
    .withDataInput()
    .withResultOutput()
    .setPythonCode(`# Summary Statistics Node


if 'data' in dir() and isinstance(data, pd.DataFrame):
print(f"Dataset shape: {data.shape[0]} rows × {data.shape[1]} columns")
print(f"\\nColumn types:\\n{data.dtypes.value_counts().to_string()}")
print(f"\\nMemory usage: {data.memory_usage(deep=True).sum() / 1024:.1f} KB")
result = data.describe(include='all').T
result['missing'] = data.isnull().sum()
result['missing_pct'] = (data.isnull().sum() / len(data) * 100).round(2)
print(f"\\nDescriptive Statistics:")
print(result)

`, ['pandas'])
    .build();
