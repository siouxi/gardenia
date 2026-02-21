import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import { getOrchestrator, WorkflowOrchestrator } from './orchestrator/Orchestrator';

let mainWindow: BrowserWindow | null;
let activePythonPath = 'python3'; // Default

// Determine if we are in development mode
const isDev = process.env.NODE_ENV === 'development';

// R Session Manager
class RSessionManager {
    private rProcess: ChildProcess | null = null;
    // Buffer to handle split chunks of JSON response
    private pendingData: string = '';

    start(): Promise<{ success: boolean; version?: string; error?: string }> {
        return new Promise((resolve) => {
            if (this.rProcess) {
                resolve({ success: true, version: 'already running' });
                return;
            }

            console.log('Starting R session...');

            try {
                // Robust path resolution for r_bridge.R
                let scriptPath = path.join(__dirname, 'r_bridge.R');

                // If not found in current dir (production/dist), try dev path
                if (!fs.existsSync(scriptPath)) {
                    const devPath = path.join(__dirname, '../electron/r_bridge.R');
                    if (fs.existsSync(devPath)) {
                        scriptPath = devPath;
                    } else {
                        console.error('Could not find r_bridge.R in:', scriptPath, 'or', devPath);
                    }
                }

                console.log(`Using R bridge script at: ${scriptPath}`);

                // Spawn the bridge script using Rscript
                // Using "Rscript" assuming it is in PATH
                this.rProcess = spawn('Rscript', [scriptPath]);

                this.rProcess.on('error', (error) => {
                    console.error('R process error:', error);
                    this.rProcess = null;
                    resolve({ success: false, error: error.message });
                });

                this.rProcess.on('close', (code) => {
                    console.log('R process exited with code:', code);
                    this.rProcess = null;
                });

                // Give it a moment to spawn then verify by running a test command
                setTimeout(async () => {
                    if (this.rProcess) {
                        try {
                            const verRes = await this.executeCommand('cat(R.version$major, ".", R.version$minor, sep="")');
                            const version = verRes.output.trim();
                            console.log('R session started successfully, version:', version);
                            resolve({ success: true, version });
                        } catch (e: any) {
                            resolve({ success: false, error: 'Failed to verify R session: ' + e.message });
                        }
                    } else {
                        resolve({ success: false, error: 'Process exited immediately' });
                    }
                }, 500);

            } catch (error: any) {
                console.error('Failed to spawn R process:', error);
                resolve({ success: false, error: error.message });
            }
        });
    }

    executeCommand(command: string): Promise<{ status: 'success' | 'error'; output: string; error?: string; variables?: any[] }> {
        return new Promise((resolve, reject) => {
            if (!this.rProcess) {
                resolve({ status: 'error', output: '', error: 'R session not started' });
                return;
            }

            // Prepare the one-time listener for the response
            const onData = (chunk: Buffer) => {
                const str = chunk.toString();
                this.pendingData += str;

                // Check if we have a complete newline-terminated JSON object
                if (this.pendingData.includes('\n')) {
                    const lines = this.pendingData.split('\n');
                    // Process the first line as our response
                    const responseLine = lines[0];
                    // Keep the rest in buffer (rare edge case of rapid firing)
                    this.pendingData = lines.slice(1).join('\n');

                    cleanup();

                    try {
                        const res = JSON.parse(responseLine);
                        resolve({
                            status: res.status === 'success' ? 'success' : 'error',
                            output: res.output || '',
                            error: res.error || (res.status === 'error' ? res.output : undefined),
                            variables: res.variables || []
                        });
                    } catch (e) {
                        console.error('Failed to parse R response:', responseLine);
                        resolve({
                            status: 'error',
                            output: this.pendingData, // Return raw as output for debug
                            error: 'Protocol Error: Invalid JSON from R bridge'
                        });
                    }
                }
            };

            // Attach 'data' listener
            this.rProcess.stdout!.on('data', onData);

            const cleanup = () => {
                this.rProcess?.stdout?.off('data', onData);
            };

            // Send command as JSON
            try {
                let completed = false;
                const payload = JSON.stringify({ code: command });
                this.rProcess.stdin!.write(payload + '\n');

                // Timeout safety
                setTimeout(() => {
                    if (!completed) {
                        completed = true;
                        cleanup();
                        resolve({
                            status: 'error',
                            output: '',
                            error: 'Command execution timed out (30s)'
                        });
                    }
                }, 30000);

                // Wrap original resolve to set completed flag
                const originalResolve = resolve;
                resolve = (value) => {
                    if (!completed) {
                        completed = true;
                        originalResolve(value);
                    }
                };

            } catch (e) {
                cleanup();
                reject(e);
            }
        });
    }

    stop() {
        if (this.rProcess) {
            this.rProcess.kill();
            this.rProcess = null;
        }
    }

    isActive(): boolean {
        return this.rProcess !== null && !this.rProcess.killed;
    }
}


const rSession = new RSessionManager();

function createWindow() {
    const iconPath = isDev
        ? path.join(__dirname, '../public/icon.svg')
        : path.join(__dirname, '../dist/icon.svg');

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: iconPath,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        // Emerald theme dark background color to avoid white flash
        backgroundColor: '#020617',
        autoHideMenuBar: true,
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

const PY_DIST_FOLDER = 'py_engine';
const PY_MODULE = 'orchestrator'; // without .py suffix

// Example of running a python script
const runPythonScript = () => {
    return new Promise((resolve, reject) => {
        // In dev, python script is in parent/engine
        // In prod, it should be bundled (todo)
        const scriptPath = path.join(__dirname, '../../engine/orchestrator.py');
        const pythonProcess = spawn('python3', [scriptPath]);

        let data = '';
        pythonProcess.stdout.on('data', (chunk) => {
            data += chunk.toString();
        });

        pythonProcess.stderr.on('data', (chunk) => {
            console.error(`Python Error: ${chunk}`);
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) resolve(data);
            else reject(`Process exited with code ${code}`);
        });
    });
};

app.on('ready', () => {
    createWindow();

    ipcMain.handle('run-workflow', async (event, workflowData) => {
        console.log('Received workflow:', workflowData);

        const { nodes, edges } = workflowData;

        // Find START nodes
        const startNodes = nodes.filter((n: any) => n.data?.toolId === 'flow-start');

        if (startNodes.length > 0) {
            for (const startNode of startNodes) {
                // Check if this start node has any outgoing edges
                const isConnected = edges.some((e: any) => e.source === startNode.id);

                if (!isConnected) {
                    // Unconnected START node found - trigger the welcome message
                    const welcomeScript = 'print("Create a workflow to get started")';
                    return await pythonSession.executeCommand(welcomeScript);
                }
            }
        }

        // Standard execution flow - Execute in the persistent session
        try {
            console.log('Executing workflow in persistent session');

            // 1. Announce start
            await pythonSession.executeCommand('print("\\n[System] Initializing workflow engine...")');

            // 2. Pass workflow data (mocking the handoff for now)
            // In a real scenario, we would serialize nodes/edges to a JSON string or Python dict
            const nodeCount = nodes.length;
            const edgeCount = edges.length;

            await pythonSession.executeCommand(`print("Loaded workflow with ${nodeCount} nodes and ${edgeCount} connections.")`);

            // 3. Simulate execution step by step (placeholder)
            await pythonSession.executeCommand('print("Validating graph topology... OK")');
            await pythonSession.executeCommand('print("Starting execution...")');

            // Simulate a small delay or just print completion
            await pythonSession.executeCommand('print("Workflow execution completed successfully.")');

            return { status: 'success', output: 'Workflow started in session' };
        } catch (error) {
            console.error('Workflow execution error:', error);
            return { status: 'error', message: String(error) };
        }
    });

    // NEW: DAG-based workflow execution handlers
    const orchestrator = getOrchestrator(activePythonPath);

    // Start orchestrator when app is ready
    orchestrator.start().then((ready) => {
        if (ready) {
            console.log('DAG Orchestrator started successfully');
        } else {
            console.warn('DAG Orchestrator failed to start');
        }
    });

    // Forward orchestrator events to renderer
    orchestrator.on('nodeStateChange', (nodeId: string, state: string) => {
        mainWindow?.webContents.send('workflow:node-state', { nodeId, state });
    });

    orchestrator.on('nodeOutput', (nodeId: string, output: string) => {
        mainWindow?.webContents.send('workflow:node-output', { nodeId, output });
    });

    orchestrator.on('nodeVariables', (nodeId: string, variables: string[]) => {
        mainWindow?.webContents.send('workflow:node-variables', { nodeId, variables });
    });

    orchestrator.on('executionOrder', (order: string[], labels: string[]) => {
        mainWindow?.webContents.send('workflow:execution-order', { order, labels });
    });

    orchestrator.on('executionComplete', (result: any) => {
        mainWindow?.webContents.send('workflow:complete', result);
    });

    // New IPC handler for DAG execution
    ipcMain.handle('workflow:execute', async (event, workflowData) => {
        console.log('DAG Execute workflow:', workflowData.nodes?.length, 'nodes');
        try {
            const result = await orchestrator.execute(workflowData);
            return { status: 'success', result };
        } catch (error) {
            console.error('Workflow execution error:', error);
            return { status: 'error', error: String(error) };
        }
    });

    ipcMain.handle('workflow:execute-from', async (event, workflowData, nodeId) => {
        console.log('DAG Execute from node:', nodeId);
        try {
            const result = await orchestrator.executeFrom(workflowData, nodeId);
            return { status: 'success', result };
        } catch (error) {
            console.error('Partial execution error:', error);
            return { status: 'error', error: String(error) };
        }
    });

    ipcMain.handle('workflow:execute-only', async (event, workflowData, nodeId) => {
        console.log('DAG Execute only node:', nodeId);
        try {
            const result = await orchestrator.executeOnly(workflowData, nodeId);
            return { status: 'success', result };
        } catch (error) {
            console.error('Single node execution error:', error);
            return { status: 'error', error: String(error) };
        }
    });

    ipcMain.handle('workflow:cancel', async () => {
        await orchestrator.cancel();
        return { status: 'cancelled' };
    });

    ipcMain.handle('workflow:force-stop', async () => {
        orchestrator.forceStop();
        // Restart orchestrator after force stop
        await orchestrator.start();
        return { status: 'stopped' };
    });

    ipcMain.handle('workflow:variables', async () => {
        try {
            const variables = await orchestrator.getVariables();
            return { status: 'success', variables };
        } catch (error) {
            return { status: 'error', error: String(error) };
        }
    });

    ipcMain.handle('workflow:clear-variables', async () => {
        try {
            await orchestrator.clearVariables();
            return { status: 'success' };
        } catch (error) {
            return { status: 'error', error: String(error) };
        }
    });

    ipcMain.handle('workflow:datasets', async () => {
        try {
            const datasets = await orchestrator.listDatasets();
            return { status: 'success', datasets };
        } catch (error) {
            return { status: 'error', error: String(error) };
        }
    });

    ipcMain.handle('workflow:clear-datasets', async () => {
        try {
            return await orchestrator.clearDatasets();
        } catch (error) {
            return { status: 'error', error: String(error) };
        }
    });

    ipcMain.handle('workflow:preview-dataset', async (event, name: string) => {
        try {
            const result = await orchestrator.previewDataset(name, 100);
            return result;
        } catch (error) {
            return { status: 'error', error: String(error) };
        }
    });

    ipcMain.handle('workflow:status', async () => {
        const state = orchestrator.getExecutionState();
        return {
            status: 'success',
            ready: orchestrator.isOrchestratorReady(),
            executionState: state ? {
                workflowId: state.workflowId,
                status: state.status,
                executionOrder: state.executionOrder,
            } : null,
        };
    });

    // R Session IPC Handlers
    ipcMain.handle('start-r-session', async () => {
        const result = await rSession.start();
        return result;
    });

    ipcMain.handle('execute-r-command', async (event, command: string) => {
        const result = await rSession.executeCommand(command);

        // Emit R variables to renderer for workflowStore
        if (result.variables && Array.isArray(result.variables)) {
            mainWindow?.webContents.send('r-variables-update', {
                variables: result.variables.map((v: any) => ({
                    name: v.name,
                    value: v.value,
                    scope: 'workflow',
                    type_hint: v.type_hint || 'any',
                    is_dataframe: v.is_dataframe || false,
                    source: 'R'
                }))
            });
        }

        return result;
    });

    ipcMain.handle('stop-r-session', async () => {
        rSession.stop();
        return { success: true };
    });

    ipcMain.handle('r-session-status', async () => {
        return { active: rSession.isActive() };
    });

    // Bash Session IPC Handlers
    ipcMain.handle('start-bash-session', async () => {
        return await bashSession.start();
    });

    ipcMain.handle('execute-bash-command', async (event, command: string) => {
        return await bashSession.executeCommand(command);
    });

    ipcMain.handle('stop-bash-session', async () => {
        bashSession.stop();
        return { success: true };
    });

    ipcMain.handle('get-bash-session-status', async () => {
        return { active: bashSession.isActive() };
    });

    // Python Session IPC Handlers
    ipcMain.handle('start-python-session', async () => {
        const result = await pythonSession.start();
        return result;
    });

    ipcMain.handle('execute-python-command', async (event, command: string) => {
        const result = await pythonSession.executeCommand(command);
        return result;
    });

    ipcMain.handle('stop-python-session', async () => {
        pythonSession.stop();
        return { success: true };
    });

    // File Dialog IPC
    ipcMain.handle('dialog:openFile', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
            properties: ['openFile'],
            filters: [
                { name: 'CSV Files', extensions: ['csv'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        if (canceled) {
            return null;
        } else {
            return filePaths[0];
        }
    });

    ipcMain.handle('dialog:saveFile', async (event, options) => {
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
            ...options,
            properties: ['showOverwriteConfirmation', 'createDirectory']
        });
        if (canceled) {
            return null;
        } else {
            return filePath;
        }
    });

    // Package Manager IPC Handlers
    // PYTHON
    ipcMain.handle('package:list-python', async () => {
        return new Promise((resolve) => {
            // Determine prefix from activePythonPath
            let args = ['list', '--json'];
            if (activePythonPath && path.isAbsolute(activePythonPath)) {
                // activePythonPath is usually .../bin/python. Prefix is .../
                const prefix = path.dirname(path.dirname(activePythonPath));
                args.push('-p', prefix);
            }

            const proc = spawn('conda', args);
            let data = '';
            proc.stdout.on('data', d => data += d);
            proc.on('close', () => {
                try {
                    // Conda list --json returns array of objects with "name" and "version" fields
                    resolve(JSON.parse(data));
                } catch {
                    resolve([]);
                }
            });
        });
    });

    ipcMain.handle('package:install-python', async (event, name) => {
        return new Promise((resolve) => {
            let args = ['install', name, '-y'];
            if (activePythonPath && path.isAbsolute(activePythonPath)) {
                const prefix = path.dirname(path.dirname(activePythonPath));
                args.push('-p', prefix);
            }

            const proc = spawn('conda', args);
            let output = '';
            proc.stdout.on('data', d => output += d);
            proc.stderr.on('data', d => output += d);
            proc.on('close', (code) => {
                resolve({ success: code === 0, output });
            });
        });
    });

    ipcMain.handle('package:uninstall-python', async (event, name) => {
        return new Promise((resolve) => {
            let args = ['remove', name, '-y'];
            if (activePythonPath && path.isAbsolute(activePythonPath)) {
                const prefix = path.dirname(path.dirname(activePythonPath));
                args.push('-p', prefix);
            }

            const proc = spawn('conda', args);
            let output = '';
            proc.stdout.on('data', d => output += d);
            proc.stderr.on('data', d => output += d);
            proc.on('close', (code) => {
                resolve({ success: code === 0, output });
            });
        });
    });

    // R
    ipcMain.handle('package:list-r', async () => {
        return new Promise((resolve) => {
            // R script to list installed packages as JSON
            const rScript = `
                installed <- installed.packages()[,c("Package", "Version")]
                json <- jsonlite::toJSON(as.data.frame(installed), auto_unbox=TRUE)
                cat(json)
            `;
            const proc = spawn('Rscript', ['-e', rScript]);
            let data = '';
            proc.stdout.on('data', d => data += d);
            proc.on('close', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    console.error('Failed to parse R package list:', e);
                    resolve([]); // Likely jsonlite not installed
                }
            });
        });
    });

    ipcMain.handle('package:install-r', async (event, name) => {
        return new Promise((resolve) => {
            // Choose a CRAN mirror
            const rScript = `install.packages('${name}', repos='http://cran.rstudio.com')`;
            const proc = spawn('Rscript', ['-e', rScript]);
            let output = '';
            proc.stdout.on('data', d => output += d);
            proc.stderr.on('data', d => output += d);
            proc.on('close', (code) => {
                resolve({ success: code === 0, output });
            });
        });
    });

    ipcMain.handle('package:uninstall-r', async (event, name) => {
        return new Promise((resolve) => {
            const rScript = `remove.packages('${name}')`;
            const proc = spawn('Rscript', ['-e', rScript]);
            let output = '';
            proc.stdout.on('data', d => output += d);
            proc.stderr.on('data', d => output += d);
            proc.on('close', (code) => {
                resolve({ success: code === 0, output });
            });
        });
    });

    // Environment Manager IPC Handlers
    ipcMain.handle('env:list-conda', async () => {
        return new Promise((resolve) => {
            const proc = spawn('conda', ['env', 'list', '--json']);
            let data = '';
            proc.stdout.on('data', d => data += d);
            proc.on('close', () => {
                try {
                    const parsed = JSON.parse(data);
                    // Transform to nicer format
                    const envs = parsed.envs.map((envPath: string) => {
                        const name = path.basename(envPath); // Simple name derivation
                        return { name, path: envPath };
                    });
                    resolve(envs);
                } catch {
                    resolve([]);
                }
            });
        });
    });

    ipcMain.handle('env:create-conda', async (event, envName: string) => {
        return new Promise((resolve) => {
            // Default libraries for Gardenia
            const packages = ['python', 'pip', 'pandas', 'numpy', 'matplotlib', 'scikit-learn'];
            console.log(`Creating Conda env: ${envName} with packages: ${packages.join(', ')}`);

            const proc = spawn('conda', ['create', '-n', envName, ...packages, '-y']);

            let output = '';
            proc.stdout.on('data', d => output += d);
            proc.stderr.on('data', d => output += d);

            proc.on('close', (code) => {
                resolve({
                    success: code === 0,
                    output,
                    error: code !== 0 ? 'Creation failed' : undefined
                });
            });

            proc.on('error', (err) => {
                resolve({ success: false, output: '', error: err.message });
            });
        });
    });

    ipcMain.handle('env:set-python', async (event, pythonPath) => {
        activePythonPath = pythonPath;
        return { success: true, current: activePythonPath };
    });

    ipcMain.handle('env:get-python', async () => {
        return activePythonPath;
    });
});

// Python Session Manager
class PythonSessionManager {
    private pythonProcess: ChildProcess | null = null;
    // Buffer to handle split chunks of JSON response
    private pendingData: string = '';

    start(): Promise<{ success: boolean; version?: string; error?: string }> {
        return new Promise((resolve) => {
            if (this.pythonProcess) {
                resolve({ success: true, version: 'already running' });
                return;
            }

            console.log('Starting Python bridge session...');

            try {
                // Robust path resolution for python_bridge.py
                let scriptPath = path.join(__dirname, 'python_bridge.py');

                // If not found in current dir (production/dist), try dev path
                if (!fs.existsSync(scriptPath)) {
                    const devPath = path.join(__dirname, '../electron/python_bridge.py');
                    if (fs.existsSync(devPath)) {
                        scriptPath = devPath;
                    } else {
                        console.error('Could not find python_bridge.py in:', scriptPath, 'or', devPath);
                    }
                }

                console.log(`Using Python bridge script at: ${scriptPath}`);

                // Spawn the bridge script
                // Using "python3" assuming it is in PATH. 
                this.pythonProcess = spawn(activePythonPath, ['-u', scriptPath]);

                this.pythonProcess.on('error', (error) => {
                    console.error('Python process error:', error);
                    this.pythonProcess = null;
                    resolve({ success: false, error: error.message });
                });

                this.pythonProcess.on('close', (code) => {
                    console.log('Python process exited with code:', code);
                    this.pythonProcess = null;
                });

                // In this bridge mode, we don't naturally get a version printout on startup.
                // We can run a quick command to check health and version.

                // Give it a moment to spawn then verify
                setTimeout(async () => {
                    if (this.pythonProcess) {
                        try {
                            const verRes = await this.executeCommand('import sys; print(f"Python {sys.version.split()[0]}")');
                            const version = verRes.output.replace('Python ', '').trim();
                            console.log('Python session started successfully, version:', version);
                            resolve({ success: true, version });
                        } catch (e: any) {
                            resolve({ success: false, error: 'Failed to verify python session: ' + e.message });
                        }
                    } else {
                        resolve({ success: false, error: 'Process exited immediately' });
                    }
                }, 500);

            } catch (error: any) {
                console.error('Failed to spawn Python process:', error);
                resolve({ success: false, error: error.message });
            }
        });
    }

    executeCommand(command: string): Promise<{ status: 'success' | 'error'; output: string; error?: string }> {
        return new Promise((resolve, reject) => {
            if (!this.pythonProcess) {
                resolve({ status: 'error', output: '', error: 'Python session not started' });
                return;
            }

            // Prepare the one-time listener for the response
            const onData = (chunk: Buffer) => {
                const str = chunk.toString();
                this.pendingData += str;

                // Check if we have a complete newline-terminated JSON object
                if (this.pendingData.includes('\n')) {
                    const lines = this.pendingData.split('\n');
                    // Process the first line as our response
                    const responseLine = lines[0];
                    // Keep the rest in buffer (rare edge case of rapid firing)
                    this.pendingData = lines.slice(1).join('\n');

                    cleanup();

                    try {
                        const res = JSON.parse(responseLine);
                        resolve({
                            status: res.status === 'success' ? 'success' : 'error',
                            output: res.output || '',
                            error: res.error || (res.status === 'error' ? res.output : undefined)
                        });
                    } catch (e) {
                        console.error('Failed to parse Python response:', responseLine);
                        resolve({
                            status: 'error',
                            output: this.pendingData, // Return raw as output for debug
                            error: 'Protocol Error: Invalid JSON from Python bridge'
                        });
                    }
                }
            };

            // Should ideally not use 'once' if we expect fragmented packets, but for now logic above handles it.
            // We attach 'data' listener.
            this.pythonProcess.stdout!.on('data', onData);

            const cleanup = () => {
                this.pythonProcess?.stdout?.off('data', onData);
            };

            // Send command as JSON
            try {
                let completed = false;
                const payload = JSON.stringify({ command });
                this.pythonProcess.stdin!.write(payload + '\n');

                // Timeout safety
                setTimeout(() => {
                    if (!completed) {
                        completed = true;
                        cleanup();
                        resolve({
                            status: 'error',
                            output: '',
                            error: 'Command execution timed out (30s)'
                        });
                    }
                }, 30000);

                // Wrap original resolve to set completed flag
                const originalResolve = resolve;
                resolve = (value) => {
                    if (!completed) {
                        completed = true;
                        originalResolve(value);
                    }
                };

            } catch (e) {
                cleanup();
                reject(e);
            }
        });
    }

    stop() {
        if (this.pythonProcess) {
            this.pythonProcess.kill();
            this.pythonProcess = null;
        }
    }

    isActive(): boolean {
        return this.pythonProcess !== null && !this.pythonProcess.killed;
    }
}

const pythonSession = new PythonSessionManager();

// Bash Session Manager
class BashSessionManager {
    private bashProcess: ChildProcess | null = null;
    private pendingData: string = '';

    start(): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            if (this.bashProcess) {
                resolve({ success: true });
                return;
            }

            console.log('Starting Bash bridge session...');

            try {
                let scriptPath = path.join(__dirname, 'bash_bridge.py');
                if (!fs.existsSync(scriptPath)) {
                    const devPath = path.join(__dirname, '../electron/bash_bridge.py');
                    if (fs.existsSync(devPath)) {
                        scriptPath = devPath;
                    } else {
                        console.error('Could not find bash_bridge.py');
                        resolve({ success: false, error: 'Bridge script not found' });
                        return;
                    }
                }

                // We use the active python to run the bash bridge (since it's a python script)
                // This ensures we have a valid runner.
                this.bashProcess = spawn(activePythonPath, ['-u', scriptPath]);

                this.bashProcess.on('error', (error) => {
                    console.error('Bash process error:', error);
                    this.bashProcess = null;
                    resolve({ success: false, error: error.message });
                });

                this.bashProcess.on('close', (code) => {
                    console.log('Bash process exited with code:', code);
                    this.bashProcess = null;
                });

                // Wait for initial prompt
                const onData = (chunk: Buffer) => {
                    const str = chunk.toString();
                    if (str.includes('\n')) {
                        this.bashProcess?.stdout?.off('data', onData);
                        resolve({ success: true });
                    }
                };
                this.bashProcess.stdout!.on('data', onData);

            } catch (error: any) {
                console.error('Failed to spawn Bash process:', error);
                resolve({ success: false, error: error.message });
            }
        });
    }

    executeCommand(command: string): Promise<{ status: 'success' | 'error'; output: string; prompt?: string; error?: string }> {
        return new Promise((resolve, reject) => {
            if (!this.bashProcess) {
                resolve({ status: 'error', output: '', error: 'Bash session not started' });
                return;
            }

            const onData = (chunk: Buffer) => {
                const str = chunk.toString();
                this.pendingData += str;

                if (this.pendingData.includes('\n')) {
                    const lines = this.pendingData.split('\n');
                    const responseLine = lines[0];
                    this.pendingData = lines.slice(1).join('\n');

                    cleanup();

                    try {
                        const res = JSON.parse(responseLine);
                        resolve({
                            status: res.status === 'success' ? 'success' : 'error',
                            output: res.output || '',
                            prompt: res.prompt,
                            error: res.error
                        });
                    } catch (e) {
                        console.error('Failed to parse Bash response:', responseLine);
                        resolve({
                            status: 'error',
                            output: this.pendingData,
                            error: 'Protocol Error'
                        });
                    }
                }
            };

            this.bashProcess.stdout!.on('data', onData);
            const cleanup = () => {
                this.bashProcess?.stdout?.off('data', onData);
            };

            try {
                const payload = JSON.stringify({ command });
                this.bashProcess.stdin!.write(payload + '\n');
            } catch (e) {
                cleanup();
                reject(e);
            }
        });
    }

    stop() {
        if (this.bashProcess) {
            this.bashProcess.kill();
            this.bashProcess = null;
        }
    }

    isActive(): boolean {
        return this.bashProcess !== null && !this.bashProcess.killed;
    }
}

const bashSession = new BashSessionManager();

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
