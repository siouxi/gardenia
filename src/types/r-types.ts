export interface RCommandResult {
    status: 'success' | 'error';
    output: string;
    error?: string;
}

export interface RSessionStatus {
    active: boolean;
    version?: string;
}

export interface RHistoryEntry {
    command: string;
    output: string;
    timestamp: Date;
    status: 'success' | 'error';
}

export interface PythonCommandResult {
    status: 'success' | 'error';
    output: string;
    error?: string;
}

export interface BashCommandResult {
    status: 'success' | 'error';
    output: string;
    prompt?: string;
    error?: string;
}
