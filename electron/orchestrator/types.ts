/**
 * Workflow Orchestrator Types
 * ===========================
 * 
 * Shared TypeScript types for the workflow orchestration system.
 */

// ============================================================================
// Workflow Definition Types
// ============================================================================

export interface WorkflowNode {
    id: string;
    type: string;
    position: { x: number; y: number };
    data: NodeData;
}

export interface NodeData {
    label: string;
    category?: string;
    toolId?: string;
    toolData?: any;
    parameterValues?: Record<string, any>;
    code?: string;
    language?: 'python' | 'r';
    executionState?: ExecutionState;
}

export interface WorkflowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
}

export interface Workflow {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    version?: string;
}

// ============================================================================
// Execution Types
// ============================================================================

export type ExecutionState =
    | 'pending'
    | 'queued'
    | 'running'
    | 'success'
    | 'error'
    | 'skipped'
    | 'cancelled';

export interface ExecutionResult {
    status: 'success' | 'error';
    output: string;
    error?: string;
    variables_created?: string[];
}

export interface NodeExecutionState {
    nodeId: string;
    state: ExecutionState;
    output?: string;
    error?: string;
    startTime?: number;
    endTime?: number;
}

export interface WorkflowExecutionState {
    workflowId: string;
    status: 'idle' | 'running' | 'completed' | 'error' | 'cancelled';
    nodeStates: Map<string, NodeExecutionState>;
    executionOrder?: string[];
    startTime?: number;
    endTime?: number;
    error?: string;
}

// ============================================================================
// Variable Registry Types
// ============================================================================

export type VariableScope = 'global' | 'workflow' | 'node';

export interface Variable {
    name: string;
    value: any;
    scope: VariableScope;
    type_hint: string;
    node_id?: string;
    is_dataframe: boolean;
}

// ============================================================================
// Storage Types
// ============================================================================

export interface DatasetMetadata {
    name: string;
    path: string;
    num_rows: number;
    num_columns: number;
    columns: Array<{ name: string; type: string }>;
    size_bytes: number;
    created_at: string;
    source_node_id?: string;
}

// ============================================================================
// IPC Message Types
// ============================================================================

export type OrchestratorMessageType =
    | 'execute'
    | 'cancel'
    | 'get_variables'
    | 'list_datasets'
    | 'ping';

export interface OrchestratorMessage {
    type: OrchestratorMessageType;
    payload?: any;
}

export type OrchestratorEventType =
    | 'ready'
    | 'state_change'
    | 'output'
    | 'execution_order'
    | 'execution_complete'
    | 'cancelled'
    | 'error'
    | 'response';

export interface OrchestratorEvent {
    type: OrchestratorEventType;
    node_id?: string;
    state?: ExecutionState;
    output?: string;
    error?: string;
    status?: string;
    variables?: Variable[];
    order?: string[];
    labels?: string[];
}
