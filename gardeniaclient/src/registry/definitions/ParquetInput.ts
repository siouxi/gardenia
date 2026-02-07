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
        },
        {
            name: 'variable_name',
            type: 'string',
            label: 'Dataset Name',
            default: 'data',
            required: true
        }
    ],
    defaultCode: `# Parquet Input Node
import pandas as pd
import os

path = params.get('path', '')
var_name = params.get('variable_name', 'data')

if path and os.path.exists(path):
    print(f"Loading Parquet file: {path} into '{var_name}'")
    try:
        # Load data
        _df = pd.read_parquet(path)
        
        # Output info
        print(f"Loaded {len(_df)} rows and {len(_df.columns)} columns")
        print(_df.head())
        
        # Assign to dynamic variable name
        globals()[var_name] = _df
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
