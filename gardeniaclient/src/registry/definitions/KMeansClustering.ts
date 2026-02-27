import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('kmeans', 'K-Means Clustering')
    .setCategory('Machine Learning')
    .setDescription('K-Means clustering for unsupervised grouping of samples')
    .withDataInput()
    .withResultOutput()
    .addSlider('n_clusters', 'Number of Clusters', 2, 20, 3, 1)
    .addToggle('scale', 'Scale Features', true)
    .setPythonCode(`# K-Means Clustering Node
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

n_clusters = int(params.get('n_clusters', 3))
scale = params.get('scale', True)

# 🛡️ ARCHITECTURE COMPLIANT NODE (Zero-Copy & Streaming)
import pandas as pd

def process_chunk(data: pd.DataFrame) -> pd.DataFrame:
    numeric = data.select_dtypes(include='number')

    X = StandardScaler().fit_transform(numeric) if scale else numeric.values

    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(X)

    result = data.copy()
    result['cluster'] = labels

    print(f"K-Means clustering: {n_clusters} clusters")
    for i in range(n_clusters):
        count = (labels == i).sum()
        print(f"  Cluster {i}: {count} samples ({count/len(labels)*100:.1f}%)")
    print(f"Inertia: {kmeans.inertia_:.2f}")
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
