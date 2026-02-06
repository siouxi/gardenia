import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'flow-compare',
    name: 'COMPARE',
    description: 'Compares two processes or nodes',
    category: 'Utilities',
    version: '1.0.0',
    inputs: [
        { name: 'source_a', type: 'any', description: 'First process to compare' },
        { name: 'source_b', type: 'any', description: 'Second process to compare' }
    ],
    outputs: [],
    parameters: []
};

export default tool;
