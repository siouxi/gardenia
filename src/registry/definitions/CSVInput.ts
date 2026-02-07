import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'csv-input',
    name: 'CSV Input',
    description: 'Load a CSV file from the local file system using Pandas',
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
            label: 'CSV File',
            required: true
        },
        {
            name: 'sep',
            type: 'string', // Should be changed to 'text' if we want editable text, or 'select' for common separators
            label: 'Separator',
            default: ',',
            required: false
        },
        {
            name: 'header',
            type: 'boolean',
            label: 'Has Header',
            default: true,
            required: false
        }
    ],
    defaultCode: `# CSV Input Node
import pandas as pd
import os

path = params.get('path', '')
sep = params.get('sep', ',')
has_header = 0 if params.get('header', True) else None

if path and os.path.exists(path):
    print(f"Loading CSV from: {path}")
    try:
        data = pd.read_csv(path, sep=sep, header=has_header)
        print(f"Loaded {len(data)} rows and {len(data.columns)} columns")
        print(data.head())
    except Exception as e:
        print(f"Error loading CSV: {e}")
        raise e
else:
    print("Error: Invalid file path or file not found")
    raise FileNotFoundError(f"File not found: {path}")
`,
    language: 'python',
    libraries: ['pandas']
};

export default tool;
