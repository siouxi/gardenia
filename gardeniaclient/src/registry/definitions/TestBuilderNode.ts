import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('test-builder', 'Test Builder Node')
    .setDescription('Verifies the new NodeBuilder system and dynamic inputs')
    .setCategory('Utilities')
    .addInput('data', 'dataset', 'Input Data')
    .addOutput('result', 'dataset', 'Result Data')
    .addSlider('multiplier', 'Multiplier', 1, 10, 2, 0.5, 'Multiplies the input data')
    .addToggle('filter_positives', 'Filter Positives', false, 'Keep only positive values')
    .setPythonCode(`


# Access input data via generic 'inputs' dictionary
# This proves we don't need to know the variable name 'data' specifically, 
# as long as the port is named 'data'
df = inputs['data']

# Access parameters via 'params' (or 'inputs' which merges them)
mult = params['multiplier']
filter_pos = params['filter_positives']

print(f"Applying multiplier: {mult}")
print(f"Filter positives: {filter_pos}")

# Simple operation
if isinstance(df, pd.DataFrame):
    # Multiply numeric columns
    numeric_cols = df.select_dtypes(include=['number']).columns
    df[numeric_cols] = df[numeric_cols] * mult
    
    if filter_pos:
        df = df[df[numeric_cols].ge(0).all(1)]
        
    result = df
else:
    print("Input is not a dataframe")
    result = df
`)
    .build();
