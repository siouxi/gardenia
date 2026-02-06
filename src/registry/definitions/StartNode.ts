import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'flow-start',
    name: 'START',
    description: 'Marks the beginning of a workflow',
    category: 'Utilities',
    version: '1.0.0',
    inputs: [],
    outputs: [
        { name: 'start_signal', type: 'signal' }
    ],
    parameters: []
};

export default tool;
