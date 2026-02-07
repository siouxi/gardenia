import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'post-it',
    name: 'Post-it Note',
    description: 'Add text notes and annotations to your workflow for human comprehension',
    category: 'Utilities',
    version: '1.0.0',
    inputs: [],
    outputs: [],
    parameters: [
        {
            name: 'note',
            type: 'string',
            label: 'Note Content',
            required: false,
            default: 'Add your note here...'
        },
        {
            name: 'color',
            type: 'select',
            label: 'Note Color',
            required: false,
            default: 'yellow',
            options: ['yellow', 'pink', 'blue', 'green']
        }
    ],
    libraries: [] // No execution libraries needed for notes
};

export default tool;

