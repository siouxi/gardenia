import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('venn-diagram', 'Venn Diagram')
    .setCategory('Visualization')
    .setDescription('Generate a Venn diagram showing overlap between two datasets')
    .addInput('set_a', 'dataset', 'First dataset (Set A)')
    .addInput('set_b', 'dataset', 'Second dataset (Set B)')
    .withResultOutput()
    .addString('id_column', 'ID Column', '', 'Column containing unique identifiers')
    .addString('label_a', 'Label A', 'Set A', 'Label for first set')
    .addString('label_b', 'Label B', 'Set B', 'Label for second set')
    .setPythonCode(`# Venn Diagram Node

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

id_col = params.get('id_column', '')
label_a = params.get('label_a', 'Set A')
label_b = params.get('label_b', 'Set B')

if 'set_a' not in dir() or 'set_b' not in dir():
    raise ValueError("Connect two datasets to 'set_a' and 'set_b' inputs")

if not id_col:
    raise ValueError("Please specify an ID column")

ids_a = set(set_a[id_col].dropna().unique())
ids_b = set(set_b[id_col].dropna().unique())

only_a = ids_a - ids_b
only_b = ids_b - ids_a
both = ids_a & ids_b

print(f"=== Venn Diagram ===")
print(f"{label_a} only: {len(only_a)}")
print(f"{label_b} only: {len(only_b)}")
print(f"Intersection: {len(both)}")

try:
    from matplotlib_venn import venn2
    fig, ax = plt.subplots(figsize=(8, 6))
    v = venn2(
        subsets=(len(only_a), len(only_b), len(both)),
        set_labels=(label_a, label_b),
        ax=ax
    )
    ax.set_title(f'{label_a} vs {label_b}')
    plt.tight_layout()
    plt.savefig('venn_diagram.png', dpi=150, bbox_inches='tight')
    plt.close()
    print("Saved: venn_diagram.png")
except ImportError:
    print("Note: Install 'matplotlib-venn' for visual diagram (pip install matplotlib-venn)")

# Intersection table as result
intersection_ids = sorted(both)
result = pd.DataFrame({id_col: intersection_ids})
if len(intersection_ids) > 0:
    # Merge with original data for full rows
    result = set_a[set_a[id_col].isin(both)].copy()
    
print(f"Intersection table: {len(result)} rows")
`, ['pandas', 'matplotlib', 'matplotlib-venn'])
    .build();
