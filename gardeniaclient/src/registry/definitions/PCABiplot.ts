import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('pca-biplot', 'PCA Biplot')
    .setCategory('Visualization')
    .setDescription('Interactive PCA scatter plot colored by group')
    .withDataInput()
    .addOutput('plot', 'image', 'PCA biplot')
    .addString('group_col', 'Color By', '', 'Column to color points by (optional)')
    .addNumber('n_components', 'Components', 2)
    .setPythonCode(`# PCA Biplot Node

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

group_col = params.get('group_col', '')
n_comp = int(params.get('n_components', 2))

if 'data' in dir() and isinstance(data, pd.DataFrame):
numeric = data.select_dtypes(include='number')
X = StandardScaler().fit_transform(numeric)

pca = PCA(n_components=min(n_comp, X.shape[1]))
coords = pca.fit_transform(X)

fig, ax = plt.subplots(figsize=(10, 8))

if group_col and group_col in data.columns:
    groups = data[group_col].astype(str)
    for g in groups.unique():
        mask = groups == g
        ax.scatter(coords[mask, 0], coords[mask, 1], label=g, alpha=0.7, s=50)
    ax.legend(title=group_col)
else:
    ax.scatter(coords[:, 0], coords[:, 1], alpha=0.7, s=50, c='#3498db')

ax.set_xlabel(f"PC1 ({pca.explained_variance_ratio_[0]*100:.1f}%)")
ax.set_ylabel(f"PC2 ({pca.explained_variance_ratio_[1]*100:.1f}%)")
ax.set_title("PCA Biplot")
ax.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('pca_biplot.png', dpi=150)
plt.close()
print("PCA biplot saved to pca_biplot.png")

result = pd.DataFrame(coords[:, :2], columns=['PC1', 'PC2'], index=data.index)

`, ['pandas'])
    .build();
