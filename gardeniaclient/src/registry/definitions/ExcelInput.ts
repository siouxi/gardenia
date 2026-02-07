import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'excel-input',
    name: 'Excel Input',
    description: 'Load an Excel file (.xlsx) into a DataFrame',
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
            label: 'Excel File',
            required: true
        },
        {
            name: 'sheet_name',
            type: 'text',
            label: 'Sheet Name (Optional)',
            required: false,
            default: '0'
        }
    ],
    defaultCode: `# Excel Input Node
import pandas as pd
import os

path = params.get('path', '')
sheet = params.get('sheet_name', 0)

if path and os.path.exists(path):
    print(f"Loading Excel file: {path}")
    try:
        # Load data
        df = pd.read_excel(path, sheet_name=sheet if sheet != '0' else 0)
        
        # Output info
        print(f"Loaded {len(df)} rows and {len(df.columns)} columns")
        print(df.head())
        
        # Assign to output variable 'data'
        data = df
    except Exception as e:
        print(f"Error reading Excel file: {e}")
        raise e
else:
    print("Error: Invalid file path")
    raise FileNotFoundError(f"File not found: {path}")
`,
    language: 'python',
    libraries: ['pandas', 'openpyxl']
};

export default tool;
