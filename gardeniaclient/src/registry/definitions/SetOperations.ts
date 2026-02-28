import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('set-operations', 'Set Operations')
    .setCategory('Data Wrangling')
    .setDescription('Perform set operations (intersect, union, difference, symmetric difference) on two datasets')
    .addInput('left', 'dataset', 'Left DataFrame')
    .addInput('right', 'dataset', 'Right DataFrame')
    .withResultOutput()
    .addSelect('operation', 'Operation', ['intersect', 'union', 'difference', 'symmetric_difference'], 'intersect')
    .addString('key_column', 'Key Column', '', 'Column to use as key (leave empty to compare all columns)')
    .setPythonCode(`# Set Operations Node


operation = params.get('operation', 'intersect')
key_col = params.get('key_column', '')

if 'left' not in dir() or 'right' not in dir():
    raise ValueError("Connect two datasets to 'left' and 'right' inputs")

if key_col:
    left_keys = set(left[key_col].dropna())
    right_keys = set(right[key_col].dropna())
    
    if operation == 'intersect':
        result_keys = left_keys & right_keys
        result = left[left[key_col].isin(result_keys)].copy()
    elif operation == 'union':
        result_keys = left_keys | right_keys
        result = pd.concat([left, right]).drop_duplicates(subset=[key_col]).reset_index(drop=True)
    elif operation == 'difference':
        result_keys = left_keys - right_keys
        result = left[left[key_col].isin(result_keys)].copy()
    elif operation == 'symmetric_difference':
        result_keys = left_keys ^ right_keys
        left_part = left[left[key_col].isin(result_keys)]
        right_part = right[right[key_col].isin(result_keys)]
        result = pd.concat([left_part, right_part]).reset_index(drop=True)
    else:
        raise ValueError(f"Unknown operation: {operation}")
else:
    # Compare entire rows
    left_tuples = set(left.apply(tuple, axis=1))
    right_tuples = set(right.apply(tuple, axis=1))
    
    if operation == 'intersect':
        result = pd.merge(left, right, how='inner')
    elif operation == 'union':
        result = pd.concat([left, right]).drop_duplicates().reset_index(drop=True)
    elif operation == 'difference':
        merged = pd.merge(left, right, how='left', indicator=True)
        result = merged[merged['_merge'] == 'left_only'].drop('_merge', axis=1)
    elif operation == 'symmetric_difference':
        merged = pd.merge(left, right, how='outer', indicator=True)
        result = merged[merged['_merge'] != 'both'].drop('_merge', axis=1)
    else:
        raise ValueError(f"Unknown operation: {operation}")

print(f"=== Set Operation: {operation} ===")
print(f"Left: {len(left)} rows | Right: {len(right)} rows")
print(f"Result: {len(result)} rows")
print(result.head(10))
`, ['pandas'])
    .build();
