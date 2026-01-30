import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'ma-plot',
    name: 'MA Plot',
    description: 'Visualizes differences between measurements in two samples',
    category: 'Visualization',
    version: '1.0.0',
    inputs: [
        { name: 'control', type: 'dataset', description: 'Control sample dataset' },
        { name: 'treatment', type: 'dataset', description: 'Treatment sample dataset' }
    ],
    outputs: [
        { name: 'plot', type: 'image', description: 'Generated MA Plot' }
    ],
    parameters: [
        {
            name: 'alpha',
            type: 'number',
            label: 'Significance Level',
            default: 0.05
        }
    ]
};

export default tool;
