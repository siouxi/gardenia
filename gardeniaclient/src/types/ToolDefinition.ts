export type ToolCategory =
    | 'Input'
    | 'QC'
    | 'Preprocessing'
    | 'Statistical Analysis'
    | 'Visualization'
    | 'Utilities';

export interface ToolParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'select' | 'file' | 'save-file' | 'text' | 'slider' | 'toggle';
    label: string;
    description?: string;
    default?: any;
    options?: string[]; // For 'select' type
    required?: boolean;
    // For slider/number
    min?: number;
    max?: number;
    step?: number;
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
    hidden?: boolean; // If true, not shown in sidebar
    author?: string;

    // Connectivity
    inputs: ToolIO[];
    outputs: ToolIO[];

    // Configuration
    parameters: ToolParameter[];

    // Execution
    defaultCode?: string;
    language?: 'python' | 'r';
    libraries?: string[]; // Required libraries/packages (e.g., ['ggplot2', 'dplyr'] for R or ['pandas', 'numpy'] for Python)
}
