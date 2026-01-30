import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'fastqc',
    name: 'FastQC',
    description: 'A quality control tool for high throughput sequence data',
    category: 'QC',
    version: '0.12.1',
    inputs: [
        { name: 'reads', type: 'fastq' }
    ],
    outputs: [
        { name: 'report_html', type: 'html' },
        { name: 'report_zip', type: 'zip' }
    ],
    parameters: [
        {
            name: 'adapters',
            type: 'file',
            label: 'Adapters File',
            description: 'Optional file containing adapters'
        },
        {
            name: 'threads',
            type: 'number',
            label: 'Threads',
            default: 1
        }
    ]
};

export default tool;
