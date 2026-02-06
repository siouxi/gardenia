import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'multiqc',
    name: 'MultiQC',
    description: 'Aggregate results from bioinformatics analyses across many samples into a single report',
    category: 'QC',
    version: '1.21',
    inputs: [
        { name: 'reports', type: 'any' }
    ],
    outputs: [
        { name: 'multiqc_report', type: 'html' }
    ],
    parameters: [],
    libraries: [] // External Python tool (multiqc package), installed separately
};

export default tool;
