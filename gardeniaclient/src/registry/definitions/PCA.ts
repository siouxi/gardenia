import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('pca', 'PCA')
    .setCategory('Statistical Analysis')
    .setDescription('Principal Component Analysis for dimensionality reduction')
    .withDataInput()
    .withResultOutput()
    .addNumber('n_components', 'Number of Components', 2)
    .addToggle('scale', 'Scale Data', true, 'Standardize features before PCA')
    .setPythonCode(`# PCA Node
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

n_components = int(params.get('n_components', 2))
scale = params.get('scale', True)

# 🛡️ ARCHITECTURE COMPLIANT NODE (Zero-Copy & Streaming)
import pandas as pd

def process_chunk(data: pd.DataFrame) -> pd.DataFrame:
    numeric = data.select_dtypes(include='number')

    if scale:
        X = StandardScaler().fit_transform(numeric)
    else:
        X = numeric.values

    pca = PCA(n_components=min(n_components, X.shape[1]))
    components = pca.fit_transform(X)

    cols = [f"PC{i+1}" for i in range(pca.n_components_)]
    result = pd.DataFrame(components, columns=cols, index=data.index)

    print(f"PCA: {numeric.shape[1]} features → {pca.n_components_} components")
    for i, var in enumerate(pca.explained_variance_ratio_):
        print(f"  PC{i+1}: {var*100:.1f}% variance explained")
    print(f"  Total: {sum(pca.explained_variance_ratio_)*100:.1f}%")
    print(result.head())
    return result if 'result' in locals() else data

# 1. STREAMING MODE SUPPORT
if 'stream_input' in dir() and hasattr(stream_input('data'), '__iter__'):
    stream = stream_input('data')
    for chunk in stream:
        yield process_chunk(chunk)

# 2. ZERO-COPY FULL MEMORY MODE SUPPORT
el# 🛡️ ARCHITECTURE COMPLIANT NODE (Zero-Copy & Streaming)
import pandas as pd

def process_chunk(data: pd.DataFrame) -> pd.DataFrame:
    result = process_chunk(data)
    print("Zero-Copy block processed successfully.")
    return result if 'result' in locals() else data

# 1. STREAMING MODE SUPPORT
if 'stream_input' in globals() and hasattr(stream_input('data'), '__iter__'):
    stream = stream_input('data')
    for chunk in stream:
        yield process_chunk(chunk)

# 2. ZERO-COPY FULL MEMORY MODE SUPPORT
elif 'data' in globals() and isinstance(globals()['data'], pd.DataFrame):
    result = process_chunk(globals()['data'])
    print("Zero-Copy block processed successfully.")
else:
    raise ValueError("Connect a dataset (Zero-Copy) or stream (Streaming) to the input.")
`, ['scikit-learn', 'pandas'])
    .build();
