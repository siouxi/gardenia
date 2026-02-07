import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'flow-end',
    name: 'END',
    description: 'Marks the end of a workflow',
    category: 'Utilities',
    version: '1.0.0',
    inputs: [
        { name: 'end_signal', type: 'signal' }
    ],
    outputs: [],
    parameters: [],
    libraries: [] // Workflow control node, no libraries needed
};

export default tool;
