import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('zscore-norm', 'Z-Score Normalization')
    .setCategory('Normalization')
    .setDescription('Standardize features by removing the mean and scaling to unit variance')
    .withDataInput()
    .withResultOutput()
    .setPythonCode(`# Z-Score Normalization Node
import pandas as pd
from sklearn.preprocessing import StandardScaler

if 'data' in dir() and isinstance(data, pd.DataFrame):
    numeric_cols = data.select_dtypes(include='number').columns
    scaler = StandardScaler()
    result = data.copy()
    result[numeric_cols] = scaler.fit_transform(data[numeric_cols])
    print(f"Z-Score normalized {len(numeric_cols)} numeric columns")
    print(f"Mean ≈ 0, Std ≈ 1 for each column")
    print(result.head())
else:
    raise ValueError("Connect a dataset to the input")
`, ['scikit-learn', 'pandas'])
    .build();
