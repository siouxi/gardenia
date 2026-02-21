import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('compare-datasets', 'Compare Datasets')
    .setCategory('Data Wrangling')
    .setDescription('Compare two datasets: find common rows, exclusive rows, and overlap statistics')
    .addInput('left', 'dataset', 'Left DataFrame')
    .addInput('right', 'dataset', 'Right DataFrame')
    .withResultOutput()
    .addString('key_column', 'Key Column', '', 'Column to compare on (leave empty for index)')
    .addSelect('comparison_type', 'Comparison Type', ['rows', 'columns', 'values'], 'rows')
    .setPythonCode(`# Compare Datasets Node
import pandas as pd

key_col = params.get('key_column', '')
comp_type = params.get('comparison_type', 'rows')

if 'left' not in dir() or 'right' not in dir():
    raise ValueError("Connect two datasets to 'left' and 'right' inputs")

if comp_type == 'rows':
    if key_col:
        merged = pd.merge(left, right, on=key_col, how='outer', indicator=True)
    else:
        merged = pd.merge(left, right, left_index=True, right_index=True, how='outer', indicator=True)
    
    common = merged[merged['_merge'] == 'both'].drop('_merge', axis=1)
    left_only = merged[merged['_merge'] == 'left_only'].drop('_merge', axis=1)
    right_only = merged[merged['_merge'] == 'right_only'].drop('_merge', axis=1)
    
    total = len(left) + len(right)
    overlap_pct = (len(common) * 2 / total * 100) if total > 0 else 0
    
    print(f"=== Dataset Comparison (rows) ===")
    print(f"Left:  {len(left)} rows")
    print(f"Right: {len(right)} rows")
    print(f"Common: {len(common)} rows")
    print(f"Left only: {len(left_only)} rows")
    print(f"Right only: {len(right_only)} rows")
    print(f"Overlap: {overlap_pct:.1f}%")
    
    result = common

elif comp_type == 'columns':
    left_cols = set(left.columns)
    right_cols = set(right.columns)
    common_cols = left_cols & right_cols
    left_only_cols = left_cols - right_cols
    right_only_cols = right_cols - left_cols
    
    print(f"=== Column Comparison ===")
    print(f"Common columns ({len(common_cols)}): {sorted(common_cols)}")
    print(f"Left only ({len(left_only_cols)}): {sorted(left_only_cols)}")
    print(f"Right only ({len(right_only_cols)}): {sorted(right_only_cols)}")
    
    result = pd.DataFrame({
        'column': sorted(left_cols | right_cols),
        'in_left': [c in left_cols for c in sorted(left_cols | right_cols)],
        'in_right': [c in right_cols for c in sorted(left_cols | right_cols)],
    })

elif comp_type == 'values':
    if not key_col:
        raise ValueError("Key column required for value comparison")
    common_keys = set(left[key_col]) & set(right[key_col])
    l = left[left[key_col].isin(common_keys)].set_index(key_col).sort_index()
    r = right[right[key_col].isin(common_keys)].set_index(key_col).sort_index()
    shared_cols = [c for c in l.columns if c in r.columns]
    diffs = (l[shared_cols] != r[shared_cols]).sum()
    
    print(f"=== Value Comparison on '{key_col}' ===")
    print(f"Common keys: {len(common_keys)}")
    print(f"Differences per column:")
    print(diffs[diffs > 0].to_string() if diffs.sum() > 0 else "No differences found!")
    
    result = diffs.reset_index()
    result.columns = ['column', 'diff_count']
`, ['pandas'])
    .build();
