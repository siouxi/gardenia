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

if 'data' in dir() and isinstance(data, pd.DataFrame):
    numeric = data.select_dtypes(include='number')
    result = numeric.corr(method=method)
    print(f"Correlation matrix ({method}) for {len(numeric.columns)} columns:")
    print(result.round(3))
else:
    raise ValueError("Connect a dataset to the input")
`, ['pandas'])
    .build();
