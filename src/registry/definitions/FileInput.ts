import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'file-input',
    name: 'File Input',
    description: 'Load raw data files into the workflow',
    category: 'Input',
    version: '1.0.0',
    inputs: [],
    outputs: [
        { name: 'file', type: 'file', description: 'Loaded raw file' }
    ],
    parameters: [
        {
            name: 'path',
            type: 'file',
            label: 'File Path',
            required: true
        }
    ]
};

export default tool;
