import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'flow-test',
    name: 'TEST',
    description: 'Hidden test node for debugging',
    category: 'Utilities',
    version: '1.0.0',
    hidden: true,
    inputs: [
        { name: 'input', type: 'any', description: 'Test input' }
    ],
    outputs: [
        { name: 'output', type: 'any', description: 'Test output' }
    ],
    parameters: [],
    libraries: [] // Test/debug node, no libraries needed
};

export default tool;
