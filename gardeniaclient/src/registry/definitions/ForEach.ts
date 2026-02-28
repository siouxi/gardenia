import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('foreach', 'ForEach')
    .setCategory('Utilities')
    .setDescription('Iterate over rows, groups, or chunks of a dataset. Each iteration produces the current item as output.')
    .addInput('data', 'dataset', 'Input dataset to iterate over')
    .withResultOutput()
    .addSelect('iterate_by', 'Iterate By', ['rows', 'groups', 'chunks'], 'rows')
    .addString('group_column', 'Group Column', '', 'Column to group by (when iterate_by = groups)')
    .addNumber('chunk_size', 'Chunk Size', 100, 'Number of rows per chunk (when iterate_by = chunks)')
    .setPythonCode(`# ForEach / Loop Node
# Splits data and processes each part sequentially
# The result is the concatenation of all iterations


iterate_by = params.get('iterate_by', 'rows')
group_col = params.get('group_column', '')
chunk_size = int(params.get('chunk_size', 100))

if 'data' not in dir():
    raise ValueError("Connect a dataset to the 'data' input")

results = []

if iterate_by == 'rows':
    total = len(data)
    for i, (_, row) in enumerate(data.iterrows()):
        item = pd.DataFrame([row])
        results.append(item)
        if (i + 1) % max(1, total // 10) == 0:
            print(f"Processing row {i+1}/{total}...")
    print(f"✅ Processed {total} rows")

elif iterate_by == 'groups':
    if not group_col:
        raise ValueError("Specify a 'Group Column' for group iteration")
    groups = data.groupby(group_col)
    total = len(groups)
    for i, (name, group_df) in enumerate(groups):
        results.append(group_df)
        print(f"Processing group '{name}' ({i+1}/{total})...")
    print(f"✅ Processed {total} groups")

elif iterate_by == 'chunks':
    total_chunks = (len(data) + chunk_size - 1) // chunk_size
    for i in range(0, len(data), chunk_size):
        chunk = data.iloc[i:i+chunk_size]
        results.append(chunk)
        print(f"Processing chunk {i//chunk_size + 1}/{total_chunks} ({len(chunk)} rows)...")
    print(f"✅ Processed {total_chunks} chunks")

# Combine all results
result = pd.concat(results, ignore_index=True) if results else pd.DataFrame()
print(f"Output: {len(result)} rows")
`, ['pandas'])
    .build();
