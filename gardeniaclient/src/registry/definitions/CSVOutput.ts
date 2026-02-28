import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'csv-output',
    name: 'CSV Output',
    description: 'Save DataFrame to a CSV file',
    category: 'Input/Output',
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
            name: 'index',
            type: 'boolean',
            label: 'Include Index',
            required: false,
            default: false
        }
    ],
    defaultCode: `# CSV Output Node

import os

path = params.get('path', '')
include_index = params.get('index', False)

# 'data' variable is injected from input connection
if 'data' in locals() and isinstance(data, pd.DataFrame):
    if path:
        print(f"Saving DataFrame to CSV: {path}")
        try:
            # Create directory if needed
            os.makedirs(os.path.dirname(path), exist_ok=True)
            
            # Save data
            data.to_csv(path, index=include_index)
            print("Successfully saved file.")
            
        except Exception as e:
            print(f"Error saving CSV file: {e}")
            raise e
    else:
        print("Error: No output path specified")
        raise ValueError("Output path not specified")
else:
    print("Error: No valid DataFrame received in 'data' input")
    raise ValueError("Input 'data' is not a DataFrame")
`,
    language: 'python',
    libraries: ['pandas']
};

export default tool;
