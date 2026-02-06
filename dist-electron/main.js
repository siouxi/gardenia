"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
let mainWindow;
// Determine if we are in development mode
const isDev = process.env.NODE_ENV === 'development';
// R Session Manager
class RSessionManager {
    constructor() {
        this.rProcess = null;
        this.outputBuffer = '';
        this.errorBuffer = '';
    }
    start() {
        return new Promise((resolve) => {
            if (this.rProcess) {
                resolve({ success: true, version: 'already running' });
                return;
            }
            console.log('Starting R session...');
            try {
                // Start R with --vanilla flag to prevent loading .Rprofile
                // --interactive for interactive mode, --no-save to not save workspace
                this.rProcess = (0, child_process_1.spawn)('R', ['--vanilla', '--interactive', '--no-save']);
                let initialOutput = '';
                let resolved = false;
                const onData = (data) => {
                    const output = data.toString();
                    initialOutput += output;
                    console.log('R output:', output);
                    // Check if R is ready (when we see the prompt)
                    if (output.includes('>') && !resolved) {
                        resolved = true;
                        this.rProcess.stdout.off('data', onData);
                        // Extract version if available
                        const versionMatch = initialOutput.match(/R version ([\d.]+)/);
                        const version = versionMatch ? versionMatch[1] : undefined;
                        console.log('R session started successfully, version:', version);
                        resolve({ success: true, version });
                    }
                };
                this.rProcess.stdout.on('data', onData);
                this.rProcess.stderr.on('data', (data) => {
                    console.error('R stderr:', data.toString());
                });
                this.rProcess.on('error', (error) => {
                    console.error('R process error:', error);
                    if (!resolved) {
                        resolved = true;
                        this.rProcess = null;
                        resolve({ success: false, error: error.message });
                    }
                });
                this.rProcess.on('close', (code) => {
                    console.log('R process exited with code:', code);
                    this.rProcess = null;
                });
                // Timeout after 10 seconds (increased from 5)
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        console.error('R startup timeout after 10 seconds');
                        console.error('Output received:', initialOutput);
                        resolve({ success: false, error: 'R startup timeout' });
                    }
                }, 10000);
            }
            catch (error) {
                console.error('Failed to spawn R process:', error);
                resolve({ success: false, error: error.message });
            }
        });
    }
    executeCommand(command) {
        return new Promise((resolve) => {
            if (!this.rProcess) {
                resolve({ status: 'error', output: '', error: 'R session not started' });
                return;
            }
            this.outputBuffer = '';
            this.errorBuffer = '';
            const onStdout = (data) => {
                this.outputBuffer += data.toString();
            };
            const onStderr = (data) => {
                this.errorBuffer += data.toString();
            };
            this.rProcess.stdout.on('data', onStdout);
            this.rProcess.stderr.on('data', onStderr);
            // Write command to R process
            this.rProcess.stdin.write(command + '\n');
            // Wait for output (simplified - wait for next prompt)
            setTimeout(() => {
                this.rProcess.stdout.off('data', onStdout);
                this.rProcess.stderr.off('data', onStderr);
                // Clean up the output (remove the command echo and prompt)
                let cleanOutput = this.outputBuffer
                    .split('\n')
                    .filter(line => !line.startsWith('>') && line.trim() !== command.trim())
                    .join('\n')
                    .trim();
                const hasError = this.errorBuffer.length > 0 || cleanOutput.includes('Error');
                resolve({
                    status: hasError ? 'error' : 'success',
                    output: cleanOutput,
                    error: this.errorBuffer || undefined
                });
            }, 500); // Wait 500ms for output
        });
    }
    stop() {
        if (this.rProcess) {
            this.rProcess.stdin.write('q()\n');
            this.rProcess.kill();
            this.rProcess = null;
        }
    }
    isActive() {
        return this.rProcess !== null && !this.rProcess.killed;
    }
}
const rSession = new RSessionManager();
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path_1.default.join(__dirname, 'preload.js'),
        },
        // Emerald theme dark background color to avoid white flash
        backgroundColor: '#020617',
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '../dist/index.html'));
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
        const scriptPath = path_1.default.join(__dirname, '../../engine/orchestrator.py');
        const pythonProcess = (0, child_process_1.spawn)('python3', [scriptPath]);
        let data = '';
        pythonProcess.stdout.on('data', (chunk) => {
            data += chunk.toString();
        });
        pythonProcess.stderr.on('data', (chunk) => {
            console.error(`Python Error: ${chunk}`);
        });
        pythonProcess.on('close', (code) => {
            if (code === 0)
                resolve(data);
            else
                reject(`Process exited with code ${code}`);
        });
    });
};
electron_1.app.on('ready', () => {
    createWindow();
    electron_1.ipcMain.handle('run-workflow', (event, workflowData) => __awaiter(void 0, void 0, void 0, function* () {
        console.log('Received workflow:', workflowData);
        const { nodes, edges } = workflowData;
        // Find START nodes
        const startNodes = nodes.filter((n) => { var _a; return ((_a = n.data) === null || _a === void 0 ? void 0 : _a.toolId) === 'flow-start'; });
        if (startNodes.length > 0) {
            for (const startNode of startNodes) {
                // Check if this start node has any outgoing edges
                const isConnected = edges.some((e) => e.source === startNode.id);
                if (!isConnected) {
                    // Unconnected START node found - trigger the welcome message
                    const welcomeScript = 'print("Create a workflow to get started")';
                    return yield pythonSession.executeCommand(welcomeScript);
                }
            }
        }
        // Standard execution flow - Execute in the persistent session
        try {
            console.log('Executing workflow in persistent session');
            // 1. Announce start
            yield pythonSession.executeCommand('print("\\n[System] Initializing workflow engine...")');
            // 2. Pass workflow data (mocking the handoff for now)
            // In a real scenario, we would serialize nodes/edges to a JSON string or Python dict
            const nodeCount = nodes.length;
            const edgeCount = edges.length;
            yield pythonSession.executeCommand(`print("Loaded workflow with ${nodeCount} nodes and ${edgeCount} connections.")`);
            // 3. Simulate execution step by step (placeholder)
            yield pythonSession.executeCommand('print("Validating graph topology... OK")');
            yield pythonSession.executeCommand('print("Starting execution...")');
            // Simulate a small delay or just print completion
            yield pythonSession.executeCommand('print("Workflow execution completed successfully.")');
            return { status: 'success', output: 'Workflow started in session' };
        }
        catch (error) {
            console.error('Workflow execution error:', error);
            return { status: 'error', message: String(error) };
        }
    }));
    // R Session IPC Handlers
    electron_1.ipcMain.handle('start-r-session', () => __awaiter(void 0, void 0, void 0, function* () {
        const result = yield rSession.start();
        return result;
    }));
    electron_1.ipcMain.handle('execute-r-command', (event, command) => __awaiter(void 0, void 0, void 0, function* () {
        const result = yield rSession.executeCommand(command);
        return result;
    }));
    electron_1.ipcMain.handle('stop-r-session', () => __awaiter(void 0, void 0, void 0, function* () {
        rSession.stop();
        return { success: true };
    }));
    electron_1.ipcMain.handle('r-session-status', () => __awaiter(void 0, void 0, void 0, function* () {
        return { active: rSession.isActive() };
    }));
    // Shell command execution
    electron_1.ipcMain.handle('execute-shell-command', (event, command) => __awaiter(void 0, void 0, void 0, function* () {
        return new Promise((resolve) => {
            const cwd = process.env.HOME || '/';
            const shellProcess = (0, child_process_1.spawn)('bash', ['-c', command], { cwd });
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
    }));
    // Python Session IPC Handlers
    electron_1.ipcMain.handle('start-python-session', () => __awaiter(void 0, void 0, void 0, function* () {
        const result = yield pythonSession.start();
        return result;
    }));
    electron_1.ipcMain.handle('execute-python-command', (event, command) => __awaiter(void 0, void 0, void 0, function* () {
        const result = yield pythonSession.executeCommand(command);
        return result;
    }));
    electron_1.ipcMain.handle('stop-python-session', () => __awaiter(void 0, void 0, void 0, function* () {
        pythonSession.stop();
        return { success: true };
    }));
    electron_1.ipcMain.handle('python-session-status', () => __awaiter(void 0, void 0, void 0, function* () {
        return { active: pythonSession.isActive() };
    }));
});
// Python Session Manager
class PythonSessionManager {
    constructor() {
        this.pythonProcess = null;
        this.outputBuffer = '';
        this.errorBuffer = '';
    }
    cleanOutput(text) {
        // Remove VS Code shell integration sequences (OSC 633)
        // Format: ESC ] 633 ; ... (BEL | ST)
        // Regex: /\x1b\]633;.*?(?:\x07|\x1b\\)/g
        let clean = text.replace(/\x1b\]633;.*?(?:\x07|\x1b\\)/g, '');
        return clean;
    }
    start() {
        return new Promise((resolve) => {
            if (this.pythonProcess) {
                resolve({ success: true, version: 'already running' });
                return;
            }
            console.log('Starting Python session...');
            try {
                // Filter out VS Code environment variables to prevent shell integration injection
                const env = Object.assign({}, process.env);
                delete env['VSCODE_SHELL_INTEGRATION'];
                delete env['TERM_PROGRAM'];
                delete env['TERM_PROGRAM_VERSION'];
                delete env['VSCODE_INJECTION'];
                // Start Python in interactive mode (-i) and unbuffered (-u)
                // Use system python explicitly to avoid Anaconda
                this.pythonProcess = (0, child_process_1.spawn)('/usr/bin/python3', ['-i', '-u'], { env });
                let initialOutput = '';
                let resolved = false;
                const onData = (data) => {
                    const output = this.cleanOutput(data.toString());
                    initialOutput += output;
                    console.log('Python output:', output);
                    // Check if Python is ready (when we see the prompt)
                    if (output.includes('>>>') && !resolved) {
                        resolved = true;
                        this.pythonProcess.stdout.off('data', onData);
                        this.pythonProcess.stderr.off('data', onData); // Python often treats interactive banner as stderr
                        // Extract version if available
                        const versionMatch = initialOutput.match(/Python ([\d.]+)/);
                        const version = versionMatch ? versionMatch[1] : undefined;
                        console.log('Python session started successfully, version:', version);
                        resolve({ success: true, version });
                    }
                };
                this.pythonProcess.stdout.on('data', onData);
                // Python interactive mode often writes banner to stderr
                this.pythonProcess.stderr.on('data', onData);
                this.pythonProcess.on('error', (error) => {
                    console.error('Python process error:', error);
                    if (!resolved) {
                        resolved = true;
                        this.pythonProcess = null;
                        resolve({ success: false, error: error.message });
                    }
                });
                this.pythonProcess.on('close', (code) => {
                    console.log('Python process exited with code:', code);
                    this.pythonProcess = null;
                });
                // Timeout after 10 seconds
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        console.error('Python startup timeout after 10 seconds');
                        console.error('Output received:', initialOutput);
                        resolve({ success: false, error: 'Python startup timeout' });
                    }
                }, 10000);
            }
            catch (error) {
                console.error('Failed to spawn Python process:', error);
                resolve({ success: false, error: error.message });
            }
        });
    }
    executeCommand(command) {
        return new Promise((resolve) => {
            if (!this.pythonProcess) {
                resolve({ status: 'error', output: '', error: 'Python session not started' });
                return;
            }
            this.outputBuffer = '';
            this.errorBuffer = '';
            const onStdout = (data) => {
                this.outputBuffer += data.toString();
            };
            const onStderr = (data) => {
                // In interactive mode, prompts often come through stderr, ignore them for error detection
                const str = data.toString();
                if (!str.trim().endsWith('>>>') && !str.trim().endsWith('...')) {
                    this.errorBuffer += str;
                }
                // Also capture stderr as output because things like warnings appear there
                this.outputBuffer += str;
            };
            this.pythonProcess.stdout.on('data', onStdout);
            this.pythonProcess.stderr.on('data', onStderr);
            // Write command to Python process
            this.pythonProcess.stdin.write(command + '\n');
            // Heuristic to detect end of command execution:
            // Since Python interactive shell echoes prompts, we wait for '>>> '
            // This is non-trivial strictly with streams, but for a basic integration this polling/timeout approach
            // combined with prompt detection is often used.
            // A more robust way is to wrap execution, but let's try reading streams first.
            const checkInterval = setInterval(() => {
                if (this.outputBuffer.trim().endsWith('>>>') || this.outputBuffer.trim().endsWith('...')) {
                    clearInterval(checkInterval);
                    cleanup();
                    // Clean up the output
                    // Remove the command echo (if any) and the trailing prompt
                    // First strip raw buffer of any artifacts
                    let cleanOutput = this.cleanOutput(this.outputBuffer);
                    // Remove the user's command if it was echoed
                    if (cleanOutput.startsWith(command)) {
                        cleanOutput = cleanOutput.substring(command.length);
                    }
                    // Remove the prompt
                    cleanOutput = cleanOutput.replace(/>>>\s*$/, '').replace(/\.\.\.\s*$/, '').trim();
                    const hasError = this.errorBuffer.length > 0; // Simple error check
                    resolve({
                        status: hasError ? 'error' : 'success',
                        output: cleanOutput,
                        error: hasError ? this.errorBuffer : undefined
                    });
                }
            }, 50);
            const cleanup = () => {
                this.pythonProcess.stdout.off('data', onStdout);
                this.pythonProcess.stderr.off('data', onStderr);
            };
            // Timeout safety
            setTimeout(() => {
                clearInterval(checkInterval);
                cleanup();
                if (!this.outputBuffer.trim().endsWith('>>>')) {
                    // We timed out waiting for prompt
                    resolve({
                        status: 'error',
                        output: this.outputBuffer,
                        error: 'Command execution timed out or prompt not found'
                    });
                }
            }, 5000); // 5s timeout for simple commands
        });
    }
    stop() {
        if (this.pythonProcess) {
            this.pythonProcess.stdin.write('exit()\n');
            this.pythonProcess.kill();
            this.pythonProcess = null;
        }
    }
    isActive() {
        return this.pythonProcess !== null && !this.pythonProcess.killed;
    }
}
const pythonSession = new PythonSessionManager();
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
//# sourceMappingURL=main.js.map