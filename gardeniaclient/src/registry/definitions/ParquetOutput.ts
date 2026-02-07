import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'parquet-output',
    name: 'Parquet Output',
    description: 'Save DataFrame to a Parquet file',
    category: 'Utilities',
    version: '1.0.0',
    inputs: [
        { name: 'data', type: 'dataset', description: 'DataFrame to save' }
    ],
    outputs: [
        { name: 'path', type: 'file', description: 'Path to saved file' }
    ],
    parameters: [
        {
            name: 'path',
            type: 'save-file',
            label: 'Output Path',
            required: true
        },
        {
            name: 'compression',
            type: 'select',
            label: 'Compression',
            required: false,
            default: 'snappy',
            options: ['snappy', 'gzip', 'brotli', 'none']
        }
    ],
    defaultCode: `# Parquet Output Node
import pandas as pd
import os

path = params.get('path', '')
compression = params.get('compression', 'snappy')

# 'data' variable is injected from input connection
if 'data' in locals() and isinstance(data, pd.DataFrame):
    if path:
        print(f"Saving DataFrame to Parquet: {path}")
        try:
            # Create directory if needed
            os.makedirs(os.path.dirname(path), exist_ok=True)
            
            # Save data
            data.to_parquet(path, compression=compression)
            print("Successfully saved file.")
            
        except Exception as e:
            print(f"Error saving Parquet file: {e}")
            raise e
    else:
        print("Error: No output path specified")
        raise ValueError("Output path not specified")
else:
    print("Error: No valid DataFrame received in 'data' input")
    raise ValueError("Input 'data' is not a DataFrame")
`,
    language: 'python',
    libraries: ['pandas', 'pyarrow']
};

export default tool;