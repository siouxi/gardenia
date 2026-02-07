/**
 * Workflow Orchestrator
 * =====================
 * 
 * Manages workflow execution by spawning a Python DAG engine process
 * and communicating via JSON-RPC style protocol.
 * 
 * Architecture:
 *   React UI <-> IPC <-> Orchestrator <-> Python Engine
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import {
    Workflow,
    WorkflowExecutionState,
    NodeExecutionState,
    ExecutionState,
    OrchestratorMessage,
    OrchestratorEvent,
    Variable,
    DatasetMetadata,
} from './types';

export class WorkflowOrchestrator extends EventEmitter {
    private pythonProcess: ChildProcess | null = null;
    private pendingData: string = '';
    private isReady: boolean = false;
    private executionState: WorkflowExecutionState | null = null;
    private messageQueue: Array<{ message: OrchestratorMessage; resolve: Function; reject: Function }> = [];
    private currentPromise: { resolve: Function; reject: Function } | null = null;
    private activePythonPath: string;

    constructor(pythonPath: string = 'python3') {
        super();
        this.activePythonPath = pythonPath;
    }

    /**
     * Start the Python orchestrator process
     */
    async start(): Promise<boolean> {
        if (this.pythonProcess) {
            return true;
        }

        return new Promise((resolve) => {
            try {
                // Find orchestrator.py
                let scriptPath = this.findOrchestratorScript();
                if (!scriptPath) {
                    console.error('Could not find orchestrator.py');
                    resolve(false);
                    return;
                }

                console.log(`Starting Python orchestrator: ${scriptPath}`);

                this.pythonProcess = spawn(this.activePythonPath, ['-u', scriptPath], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                });

                // Handle stdout (protocol messages)
                this.pythonProcess.stdout!.on('data', (chunk: Buffer) => {
                    this.handleData(chunk.toString());
                });

                // Handle stderr (logs)
                this.pythonProcess.stderr!.on('data', (chunk: Buffer) => {
                    console.log('[Orchestrator]', chunk.toString().trim());
                });

                this.pythonProcess.on('error', (err) => {
                    console.error('Orchestrator process error:', err);
                    this.emit('error', err);
                    resolve(false);
                });

                this.pythonProcess.on('close', (code) => {
                    console.log('Orchestrator process exited with code:', code);
                    this.pythonProcess = null;
                    this.isReady = false;
                    this.emit('close', code);
                });

                // Wait for ready signal
                const readyTimeout = setTimeout(() => {
                    if (!this.isReady) {
                        console.error('Orchestrator failed to start (timeout)');
                        resolve(false);
                    }
                }, 5000);

                this.once('ready', () => {
                    clearTimeout(readyTimeout);
                    this.isReady = true;
                    console.log('Orchestrator ready');
                    resolve(true);
                });

            } catch (error) {
                console.error('Failed to start orchestrator:', error);
                resolve(false);
            }
        });
    }

    /**
     * Find the orchestrator.py script
     */
    private findOrchestratorScript(): string | null {
        const possiblePaths = [
            path.join(__dirname, '../../engine/orchestrator.py'),
            path.join(__dirname, '../../../engine/orchestrator.py'),
            path.join(process.cwd(), 'engine/orchestrator.py'),
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
        return null;
    }

    /**
     * Handle incoming data from Python process
     */
    private handleData(data: string): void {
        this.pendingData += data;

        // Process complete JSON lines
        let newlineIndex: number;
        while ((newlineIndex = this.pendingData.indexOf('\n')) !== -1) {
            const line = this.pendingData.substring(0, newlineIndex);
            this.pendingData = this.pendingData.substring(newlineIndex + 1);

            if (line.trim()) {
                try {
                    const event = JSON.parse(line) as OrchestratorEvent;
                    this.handleEvent(event);
                } catch (e) {
                    console.error('Failed to parse orchestrator message:', line);
                }
            }
        }
    }

    /**
     * Handle parsed event from Python
     */
    private handleEvent(event: OrchestratorEvent): void {
        switch (event.type) {
            case 'ready':
                this.emit('ready', event);
                break;

            case 'state_change':
                if (event.node_id && event.state) {
                    this.updateNodeState(event.node_id, event.state);
                    this.emit('nodeStateChange', event.node_id, event.state);
                }
                break;

            case 'output':
                if (event.node_id) {
                    this.emit('nodeOutput', event.node_id, event.output || '');
                }
                break;

            case 'node_variables':
                if (event.node_id && event.variables) {
                    // Emit to main process
                    this.emit('nodeVariables', event.node_id, event.variables);
                }
                break;

            case 'execution_order':
                if (this.executionState && event.order) {
                    this.executionState.executionOrder = event.order;
                }
                this.emit('executionOrder', event.order, event.labels);
                break;

            case 'execution_complete':
                if (this.executionState) {
                    this.executionState.status = event.status === 'success' ? 'completed' : 'error';
                    this.executionState.endTime = Date.now();
                    if (event.error) {
                        this.executionState.error = event.error;
                    }
                }
                this.emit('executionComplete', event);

                // Resolve pending promise
                if (this.currentPromise) {
                    this.currentPromise.resolve(event);
                    this.currentPromise = null;
                }
                break;

            case 'response':
                // Generic response to a command
                if (this.currentPromise) {
                    this.currentPromise.resolve(event);
                    this.currentPromise = null;
                }
                break;

            case 'error':
                this.emit('error', new Error(event.error || 'Unknown error'));
                if (this.currentPromise) {
                    this.currentPromise.reject(new Error(event.error));
                    this.currentPromise = null;
                }
                break;

            case 'cancelled':
                if (this.executionState) {
                    this.executionState.status = 'cancelled';
                }
                this.emit('cancelled');
                break;

            default:
                console.log('Unknown orchestrator event:', event);
        }
    }

    /**
     * Update node execution state
     */
    private updateNodeState(nodeId: string, state: ExecutionState): void {
        if (!this.executionState) return;

        let nodeState = this.executionState.nodeStates.get(nodeId);
        if (!nodeState) {
            nodeState = {
                nodeId,
                state: 'pending',
            };
            this.executionState.nodeStates.set(nodeId, nodeState);
        }

        nodeState.state = state;
        if (state === 'running') {
            nodeState.startTime = Date.now();
        } else if (state === 'success' || state === 'error') {
            nodeState.endTime = Date.now();
        }
    }

    /**
     * Send a message to the Python process
     */
    private sendMessage(message: OrchestratorMessage): Promise<OrchestratorEvent> {
        return new Promise((resolve, reject) => {
            if (!this.pythonProcess || !this.isReady) {
                reject(new Error('Orchestrator not ready'));
                return;
            }

            this.currentPromise = { resolve, reject };

            const json = JSON.stringify(message) + '\n';
            this.pythonProcess.stdin!.write(json);
        });
    }

    /**
     * Execute a workflow
     */
    async execute(workflow: Workflow): Promise<OrchestratorEvent> {
        // Initialize execution state
        this.executionState = {
            workflowId: `wf-${Date.now()}`,
            status: 'running',
            nodeStates: new Map(),
            startTime: Date.now(),
        };

        // Initialize node states
        for (const node of workflow.nodes) {
            this.executionState.nodeStates.set(node.id, {
                nodeId: node.id,
                state: 'pending',
            });
        }

        this.emit('executionStart', this.executionState);

        return this.sendMessage({
            type: 'execute',
            payload: workflow,
        });
    }

    /**
     * Cancel current execution
     */
    async cancel(): Promise<void> {
        if (!this.pythonProcess || !this.executionState) return;

        await this.sendMessage({ type: 'cancel' });
    }

    /**
     * Force stop the Python process (kills it immediately)
     */
    forceStop(): void {
        if (this.pythonProcess) {
            console.log('Force stopping orchestrator process');
            this.pythonProcess.kill('SIGKILL');
            this.pythonProcess = null;
            this.isReady = false;

            if (this.executionState) {
                this.executionState.status = 'cancelled';
                this.executionState.endTime = Date.now();
            }

            this.emit('forceStop');
        }
    }

    /**
     * Get current variables from registry
     */
    async getVariables(): Promise<Variable[]> {
        const response = await this.sendMessage({ type: 'get_variables' });
        return response.variables || [];
    }

    /**
     * Clear all variables
     */
    async clearVariables(): Promise<void> {
        await this.sendMessage({ type: 'clear_variables' });
    }

    /**
     * List stored datasets
     */
    async listDatasets(): Promise<DatasetMetadata[]> {
        const response = await this.sendMessage({ type: 'list_datasets' });
        return (response as any).datasets || [];
    }

    async clearDatasets(): Promise<any> {
        return await this.sendMessage({ type: 'clear_datasets' });
    }

    /**
     * Get a preview of a dataset
     */
    async previewDataset(name: string, nRows: number = 100): Promise<any> {
        return await this.sendMessage({
            type: 'preview_dataset',
            payload: { name, n_rows: nRows, include_stats: true }
        });
    }

    /**
     * Get current execution state
     */
    getExecutionState(): WorkflowExecutionState | null {
        return this.executionState;
    }

    /**
     * Check if orchestrator is ready
     */
    isOrchestratorReady(): boolean {
        return this.isReady;
    }

    /**
     * Set the Python path to use
     */
    setPythonPath(pythonPath: string): void {
        this.activePythonPath = pythonPath;
    }

    /**
     * Stop the orchestrator
     */
    stop(): void {
        if (this.pythonProcess) {
            this.pythonProcess.kill();
            this.pythonProcess = null;
            this.isReady = false;
        }
    }
}

// Singleton instance
let orchestratorInstance: WorkflowOrchestrator | null = null;

export function getOrchestrator(pythonPath?: string): WorkflowOrchestrator {
    if (!orchestratorInstance) {
        orchestratorInstance = new WorkflowOrchestrator(pythonPath);
    }
    return orchestratorInstance;
}
