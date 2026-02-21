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

if 'data' in dir() and isinstance(data, pd.DataFrame):
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
else:
    raise ValueError("Connect a dataset to the input")
`, ['scikit-learn', 'pandas'])
    .build();
