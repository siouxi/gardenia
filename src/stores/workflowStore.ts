/**
 * Workflow Execution Store
 * =========================
 * 
 * Zustand store for managing workflow execution state.
 * Handles real-time updates from the orchestrator.
 */

import { create } from 'zustand';

// Types matching the orchestrator
export type ExecutionState =
    | 'pending'
    | 'queued'
    | 'running'
    | 'success'
    | 'error'
    | 'skipped'
    | 'cancelled';

export type WorkflowStatus = 'idle' | 'running' | 'completed' | 'error' | 'cancelled';

export interface NodeExecutionState {
    nodeId: string;
    state: ExecutionState;
    output?: string;
    error?: string;
    startTime?: number;
    endTime?: number;
}

export interface Variable {
    name: string;
    value: any;
    scope: 'global' | 'workflow' | 'node';
    type_hint: string;
    node_id?: string;
    is_dataframe: boolean;
}

export interface Dataset {
    name: string;
    path: string;
    num_rows: number;
    num_columns: number;
    columns: Array<{ name: string; type: string }>;
    size_bytes: number;
    created_at: string;
    source_node_id?: string;
}

interface WorkflowStore {
    // Execution state
    status: WorkflowStatus;
    nodeStates: Map<string, NodeExecutionState>;
    executionOrder: string[];
    logs: string[];

    // Variables
    variables: Variable[];
    datasets: Dataset[];

    // Orchestrator ready state
    isOrchestratorReady: boolean;

    // Actions
    setStatus: (status: WorkflowStatus) => void;
    updateNodeState: (nodeId: string, state: ExecutionState) => void;
    appendNodeOutput: (nodeId: string, output: string) => void;
    setExecutionOrder: (order: string[]) => void;
    setVariables: (variables: Variable[]) => void;
    setDatasets: (datasets: Dataset[]) => void;
    addLog: (message: string) => void;
    reset: () => void;
    setOrchestratorReady: (ready: boolean) => void;

    // Get computed states
    getNodeState: (nodeId: string) => ExecutionState;
    isRunning: () => boolean;
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
    // Initial state
    status: 'idle',
    nodeStates: new Map(),
    executionOrder: [],
    logs: [],
    variables: [],
    datasets: [],
    isOrchestratorReady: false,

    // Actions
    setStatus: (status) => set({ status }),

    updateNodeState: (nodeId, state) => set((prev) => {
        const newStates = new Map(prev.nodeStates);
        const existing = newStates.get(nodeId) || { nodeId, state: 'pending' };
        newStates.set(nodeId, {
            ...existing,
            state,
            startTime: state === 'running' ? Date.now() : existing.startTime,
            endTime: (state === 'success' || state === 'error') ? Date.now() : existing.endTime,
        });
        return { nodeStates: newStates };
    }),

    appendNodeOutput: (nodeId, output) => set((prev) => {
        const newStates = new Map(prev.nodeStates);
        const existing = newStates.get(nodeId) || { nodeId, state: 'pending' };
        newStates.set(nodeId, {
            ...existing,
            output: (existing.output || '') + output,
        });
        return { nodeStates: newStates };
    }),

    setExecutionOrder: (order) => set({ executionOrder: order }),

    setVariables: (variables) => set({ variables }),

    setDatasets: (datasets) => set({ datasets }),

    addLog: (message) => set((prev) => ({
        logs: [...prev.logs.slice(-100), message] // Keep last 100 logs
    })),

    reset: () => set({
        status: 'idle',
        nodeStates: new Map(),
        executionOrder: [],
        logs: [],
    }),

    setOrchestratorReady: (ready) => set({ isOrchestratorReady: ready }),

    // Getters
    getNodeState: (nodeId) => {
        const state = get().nodeStates.get(nodeId);
        return state?.state || 'pending';
    },

    isRunning: () => get().status === 'running',
}));

/**
 * Initialize workflow store with orchestrator event listeners.
 * Call this once when the app starts.
 */
export function initWorkflowEventListeners(): void {
    const api = (window as any).electronAPI;
    if (!api) {
        console.warn('electronAPI not available');
        return;
    }

    // Listen for node state changes
    api.onNodeStateChange?.((data: { nodeId: string; state: string }) => {
        useWorkflowStore.getState().updateNodeState(data.nodeId, data.state as ExecutionState);
        useWorkflowStore.getState().addLog(`[${data.nodeId}] State: ${data.state}`);
    });

    // Listen for node output
    api.onNodeOutput?.((data: { nodeId: string; output: string }) => {
        useWorkflowStore.getState().appendNodeOutput(data.nodeId, data.output);
        if (data.output.trim()) {
            useWorkflowStore.getState().addLog(`[${data.nodeId}] ${data.output}`);
        }
    });

    // Listen for execution order
    api.onExecutionOrder?.((data: { order: string[]; labels: string[] }) => {
        useWorkflowStore.getState().setExecutionOrder(data.order);
        useWorkflowStore.getState().addLog(`Execution order: ${data.labels.join(' → ')}`);
    });

    // Listen for workflow completion
    api.onWorkflowComplete?.((result: any) => {
        const newStatus = result.status === 'success' ? 'completed' : 'error';
        useWorkflowStore.getState().setStatus(newStatus);
        useWorkflowStore.getState().addLog(`Workflow ${newStatus}`);

        // Update variables
        if (result.variables) {
            useWorkflowStore.getState().setVariables(result.variables);
        }
    });

    // Check orchestrator status
    api.getWorkflowStatus?.().then((result: any) => {
        useWorkflowStore.getState().setOrchestratorReady(result.ready);
    });

    console.log('Workflow event listeners initialized');
}
