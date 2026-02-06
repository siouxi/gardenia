import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';

let mainWindow: BrowserWindow | null;

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

    executeCommand(command: string): Promise<{ status: 'success' | 'error'; output: string; error?: string }> {
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
                            error: res.error || (res.status === 'error' ? res.output : undefined)
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
                const payload = JSON.stringify({ command });
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

    // R Session IPC Handlers
    ipcMain.handle('start-r-session', async () => {
        const result = await rSession.start();
        return result;
    });

    ipcMain.handle('execute-r-command', async (event, command: string) => {
        const result = await rSession.executeCommand(command);
        return result;
    });

    ipcMain.handle('stop-r-session', async () => {
        rSession.stop();
        return { success: true };
    });

    ipcMain.handle('r-session-status', async () => {
        return { active: rSession.isActive() };
    });

    // Shell command execution
    ipcMain.handle('execute-shell-command', async (event, command: string) => {
        return new Promise((resolve) => {
            const cwd = process.env.HOME || '/';
            const shellProcess = spawn('bash', ['-c', command], { cwd });

            let output = '';
            let errorOutput = '';

            shellProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            shellProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            shellProcess.on('close', (code) => {
                resolve({
                    status: code === 0 ? 'success' : 'error',
                    output: output || errorOutput,
                    error: code !== 0 ? errorOutput : undefined
                });
            });

            // Timeout after 30 seconds
            setTimeout(() => {
                if (!shellProcess.killed) {
                    shellProcess.kill();
                    resolve({
                        status: 'error',
                        output: '',
                        error: 'Command timeout (30s)'
                    });
                }
            }, 30000);
        });
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
                this.pythonProcess = spawn('python3', ['-u', scriptPath]);

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
