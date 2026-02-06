import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'trimmomatic',
    name: 'Trimmomatic',
    description: 'A flexible read trimming tool for Illumina NGS data',
    category: 'Preprocessing',
    version: '0.39',
    inputs: [
        { name: 'reads_in', type: 'fastq' }
    ],
    outputs: [
        { name: 'reads_out', type: 'fastq' },
        { name: 'unpaired_out', type: 'fastq' }
    ],
    parameters: [
        {
            name: 'mode',
            type: 'select',
            label: 'Mode',
            options: ['PE', 'SE'],
            default: 'PE'
        },
        {
            name: 'c_crop',
            type: 'number',
            label: 'Sliding Window Size',
            default: 4
        },
        {
            name: 'quality',
            type: 'number',
            label: 'Quality Threshold',
            default: 20
        }
    ],
    libraries: [] // External Java tool, installed separately
};

export default tool;
