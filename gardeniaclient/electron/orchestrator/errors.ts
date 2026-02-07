/**
 * Gardenia Error Classes
 * ======================
 * 
 * Typed error classes for consistent error handling in TypeScript.
 */

export enum ErrorCategory {
    SYNTAX = 'syntax',
    RUNTIME = 'runtime',
    TIMEOUT = 'timeout',
    MEMORY = 'memory',
    DEPENDENCY = 'dependency',
    FILE = 'file',
    SESSION = 'session',
    CONNECTION = 'connection',
}

export const ERROR_SUGGESTIONS: Record<ErrorCategory, string[]> = {
    [ErrorCategory.SYNTAX]: [
        'Check syntax on the indicated line',
        'Look for missing brackets, quotes, or colons',
    ],
    [ErrorCategory.DEPENDENCY]: [
        'Install the missing package',
        'Check package name spelling',
    ],
    [ErrorCategory.TIMEOUT]: [
        'Increase timeout in Advanced Settings',
        'Optimize code to run faster',
    ],
    [ErrorCategory.MEMORY]: [
        'Increase memory limit in Advanced Settings',
        'Process data in smaller batches',
    ],
    [ErrorCategory.FILE]: [
        'Verify the file path is correct',
        'Check if file exists',
    ],
    [ErrorCategory.SESSION]: [
        'Restart the R/Python session',
    ],
    [ErrorCategory.RUNTIME]: [
        'Review the error traceback',
    ],
    [ErrorCategory.CONNECTION]: [
        'Restart the application',
    ],
};

export interface GardeniaErrorData {
    category: ErrorCategory;
    message: string;
    language: 'python' | 'r';
    nodeId?: string;
    lineNumber?: number;
    suggestions: string[];
    recoverable: boolean;
}

export class NodeExecutionError extends Error {
    category: ErrorCategory;
    nodeId: string;
    language: 'python' | 'r';
    suggestions: string[];
    lineNumber?: number;
    recoverable: boolean;

    constructor(data: GardeniaErrorData) {
        super(data.message);
        this.name = 'NodeExecutionError';
        this.category = data.category;
        this.nodeId = data.nodeId || '';
        this.language = data.language;
        this.suggestions = data.suggestions;
        this.lineNumber = data.lineNumber;
        this.recoverable = data.recoverable;
    }
}

export class WorkflowError extends Error {
    nodeErrors: NodeExecutionError[];

    constructor(message: string, nodeErrors: NodeExecutionError[] = []) {
        super(message);
        this.name = 'WorkflowError';
        this.nodeErrors = nodeErrors;
    }
}

export class ConnectionError extends Error {
    language: 'python' | 'r';

    constructor(message: string, language: 'python' | 'r') {
        super(message);
        this.name = 'ConnectionError';
        this.language = language;
    }
}

/**
 * Parse error data from Python engine into typed error
 */
export function parseErrorFromResult(
    errorData: any,
    nodeId?: string,
    language: 'python' | 'r' = 'python'
): NodeExecutionError {
    // If already structured error from Python
    if (errorData && typeof errorData === 'object' && errorData.category) {
        return new NodeExecutionError({
            category: errorData.category as ErrorCategory,
            message: errorData.message || 'Unknown error',
            language: errorData.language || language,
            nodeId: errorData.node_id || nodeId,
            lineNumber: errorData.line_number,
            suggestions: errorData.suggestions || [],
            recoverable: errorData.recoverable || false,
        });
    }

    // Fallback for string errors
    const message = typeof errorData === 'string' ? errorData : String(errorData);

    return new NodeExecutionError({
        category: ErrorCategory.RUNTIME,
        message,
        language,
        nodeId,
        suggestions: ERROR_SUGGESTIONS[ErrorCategory.RUNTIME],
        recoverable: false,
    });
}
