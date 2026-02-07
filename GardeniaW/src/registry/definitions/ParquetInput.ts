import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'parquet-input',
    name: 'Parquet Input',
    description: 'Load a Parquet file into a DataFrame',
    category: 'Input',
    version: '1.0.0',
    inputs: [
        { name: 'trigger', type: 'signal', description: 'Trigger to execute this node' }
    ],
    outputs: [
        { name: 'data', type: 'dataset', description: 'Loaded DataFrame' }
    ],
    parameters: [
        {
            name: 'path',
            type: 'file',
            label: 'Parquet File',
            required: true
        }
    ],
    defaultCode: `# Parquet Input Node
import pandas as pd
import os

path = params.get('path', '')

if path and os.path.exists(path):
    print(f"Loading Parquet file: {path}")
    try:
        # Load data
        df = pd.read_parquet(path)
        
        # Output info
        print(f"Loaded {len(df)} rows and {len(df.columns)} columns")
        print(df.head())
        
        # Assign to output variable 'data'
        data = df
    except Exception as e:
        print(f"Error reading Parquet file: {e}")
        raise e
else:
    print("Error: Invalid file path")
    raise FileNotFoundError(f"File not found: {path}")
`,
    language: 'python',
    libraries: ['pandas', 'pyarrow']
};

export default tool;
