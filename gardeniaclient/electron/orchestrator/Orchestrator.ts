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

import http from 'http';

// Use require() instead of import to avoid interfering with Electron's module resolution
const WebSocket = require('ws');

export class WorkflowOrchestrator extends EventEmitter {
    private pythonProcess: ChildProcess | null = null;
    private isReady: boolean = false;
    private executionState: WorkflowExecutionState | null = null;
    private currentPromise: { resolve: Function; reject: Function } | null = null;
    private activePythonPath: string;
    private serverPort: number | null = null;
    private ws: any = null;
    private connectionAttempts: number = 0;

    constructor(pythonPath: string = 'python3') {
        super();
        this.activePythonPath = pythonPath;
    }

    /**
     * Start the Python orchestrator process
     */
    async start(): Promise<boolean> {
        if (this.pythonProcess && this.isReady) {
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

                let buffer = '';
                // Handle stdout to catch the server_started message
                this.pythonProcess.stdout!.on('data', (chunk: Buffer) => {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // Keep incomplete line

                    for (const line of lines) {
                        try {
                            const msg = JSON.parse(line.trim());
                            if (msg.type === 'server_started' && msg.port) {
                                this.serverPort = msg.port;
                                console.log(`[Orchestrator] Server started on port ${this.serverPort}`);
                                this.connectWebSocket();
                            } else {
                                // Forward other standard prints to console
                                console.log(`[Orchestrator Log]`, line.trim());
                            }
                        } catch (e) {
                            // Not JSON, just standard print
                            console.log(`[Orchestrator Log]`, line.trim());
                        }
                    }
                });

                // Handle stderr (logs)
                this.pythonProcess.stderr!.on('data', (chunk: Buffer) => {
                    console.error('[Orchestrator Error]', chunk.toString().trim());
                });

                this.pythonProcess.on('error', (err) => {
                    console.error('Orchestrator process error:', err);
                    this.emit('error', err);
                    resolve(false);
                });

                this.pythonProcess.on('close', (code) => {
                    console.log('Orchestrator process exited with code:', code);
                    this.cleanup();
                    this.emit('close', code);
                });

                // Wait for ready signal via WebSocket
                const readyTimeout = setTimeout(() => {
                    if (!this.isReady) {
                        console.error('Orchestrator failed to start (timeout)');
                        this.cleanup();
                        resolve(false);
                    }
                }, 10000);

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
     * Connect to Python orchestrator via WebSocket (primary channel)
     */
    private connectWebSocket(): void {
        if (!this.serverPort) return;

        const url = `ws://127.0.0.1:${this.serverPort}/ws`;
        console.log(`[Orchestrator] Connecting WebSocket to ${url}...`);

        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            console.log('[Orchestrator] WebSocket connected');
            this.connectionAttempts = 0;
        });

        this.ws.on('message', (data: any) => {
            try {
                const event = JSON.parse(data.toString()) as OrchestratorEvent;

                // Check if this is a response to a pending request
                if (event.type === 'response') {
                    // Route to the appropriate pending request
                    this.handleEvent(event);
                } else {
                    this.handleEvent(event);
                }
            } catch (e) {
                console.error('[Orchestrator] Failed to parse WS message:', data.toString());
            }
        });

        this.ws.on('close', () => {
            console.log('[Orchestrator] WebSocket closed');
            this.retryWebSocket();
        });

        this.ws.on('error', (err: any) => {
            console.error(`[Orchestrator] WebSocket error: ${err.message}`);
            this.retryWebSocket();
        });
    }

    private retryWebSocket(): void {
        this.connectionAttempts++;
        if (this.connectionAttempts <= 5 && this.pythonProcess && !this.pythonProcess.killed) {
            console.log(`[Orchestrator] Retrying WebSocket in 1s (Attempt ${this.connectionAttempts})...`);
            setTimeout(() => this.connectWebSocket(), 1000);
        } else {
            console.error(`[Orchestrator] Max WebSocket retries reached or process dead.`);
        }
    }

    private cleanup(): void {
        if (this.ws) {
            try { this.ws.close(); } catch (e) { /* ignore */ }
            this.ws = null;
        }
        this.pythonProcess = null;
        this.isReady = false;
        this.serverPort = null;
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
     * Handle parsed event from Python
     */
    private handleEvent(event: OrchestratorEvent): void {
        switch (event.type) {
            case 'ready':
                this.emit('ready', event);
                break;

            case 'response':
                // Response type events handled by HTTP POST sendMessage
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
                break;

            case 'error':
                this.emit('error', new Error(event.error || 'Unknown error'));
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
     * Send a message to the Python orchestrator via HTTP POST.
     * WebSocket is used for streaming events (state_change, output, etc.)
     * but request-response calls use HTTP for reliable 1:1 matching.
     */
    private sendMessage(message: OrchestratorMessage): Promise<OrchestratorEvent> {
        return new Promise((resolve, reject) => {
            if (!this.serverPort) {
                reject(new Error('Orchestrator server not started'));
                return;
            }

            const payload = JSON.stringify(message);
            const options = {
                hostname: '127.0.0.1',
                port: this.serverPort,
                path: '/message',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data) as OrchestratorEvent;
                        if (parsed.status === 'error' || parsed.type === 'error') {
                            reject(new Error(parsed.error || 'Unknown orchestrator error'));
                        } else {
                            resolve(parsed);
                        }
                    } catch (e) {
                        reject(new Error('Invalid JSON response from orchestrator'));
                    }
                });
            });

            req.on('error', (e) => {
                reject(e);
            });

            req.write(payload);
            req.end();
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
     * Execute a workflow starting from a specific node (node + all downstream)
     */
    async executeFrom(workflow: Workflow, nodeId: string): Promise<OrchestratorEvent> {
        this.executionState = {
            workflowId: `wf-partial-${Date.now()}`,
            status: 'running',
            nodeStates: new Map(),
            startTime: Date.now(),
        };

        for (const node of workflow.nodes) {
            this.executionState.nodeStates.set(node.id, {
                nodeId: node.id,
                state: 'pending',
            });
        }

        this.emit('executionStart', this.executionState);

        return this.sendMessage({
            type: 'execute',
            payload: { ...workflow, start_from: nodeId } as any,
        });
    }

    /**
     * Execute only a single node (using cached upstream data)
     */
    async executeOnly(workflow: Workflow, nodeId: string): Promise<OrchestratorEvent> {
        this.executionState = {
            workflowId: `wf-only-${Date.now()}`,
            status: 'running',
            nodeStates: new Map(),
            startTime: Date.now(),
        };

        for (const node of workflow.nodes) {
            this.executionState.nodeStates.set(node.id, {
                nodeId: node.id,
                state: 'pending',
            });
        }

        this.emit('executionStart', this.executionState);

        return this.sendMessage({
            type: 'execute',
            payload: { ...workflow, only_node: nodeId } as any,
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
