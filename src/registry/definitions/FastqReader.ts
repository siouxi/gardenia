import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'fastq-reader',
    name: 'FASTQ Reader',
    description: 'Specialized reader for FASTQ sequencing data',
    category: 'Input',
    version: '1.0.0',
    inputs: [
        { name: 'raw_file', type: 'file' }
    ],
    outputs: [
        { name: 'sequences', type: 'fastq' }
    ],
    parameters: [
        {
            name: 'interleaved',
            type: 'boolean',
            label: 'Interleaved Paired-End',
            default: false
        }
    ]
};

export default tool;
