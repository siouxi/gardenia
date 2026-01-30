export type ToolCategory =
    | 'Input'
    | 'QC'
    | 'Preprocessing'
    | 'Statistical Analysis'
    | 'Visualization'
    | 'Utilities';

export interface ToolParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'select' | 'file';
    label: string;
    description?: string;
    default?: any;
    options?: string[]; // For 'select' type
    required?: boolean;
}

export interface ToolIO {
    name: string;
    type: string; // e.g., 'fastq', 'bam', 'dataset'
    description?: string;
}

export interface ToolDefinition {
    id: string;      // Unique identifier (e.g., 'fastqc')
    name: string;    // Display name (e.g., 'FastQC')
    description: string;
    category: ToolCategory;
    version: string;
    author?: string;

    // Connectivity
    inputs: ToolIO[];
    outputs: ToolIO[];

    // Configuration
    parameters: ToolParameter[];
}
