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
            // Start R with --vanilla flag to prevent loading .Rprofile
            // --interactive for interactive mode, --no-save to not save workspace
            this.rProcess = (0, child_process_1.spawn)('R', ['--vanilla', '--interactive', '--no-save', '--quiet']);
            let initialOutput = '';
            const onData = (data) => {
                const output = data.toString();
                initialOutput += output;
                // Check if R is ready (when we see the prompt)
                if (output.includes('>')) {
                    this.rProcess.stdout.off('data', onData);
                    // Extract version if available
                    const versionMatch = initialOutput.match(/R version ([\d.]+)/);
                    const version = versionMatch ? versionMatch[1] : undefined;
                    resolve({ success: true, version });
                }
            };
            this.rProcess.stdout.on('data', onData);
            this.rProcess.stderr.on('data', (data) => {
                console.error('R stderr:', data.toString());
            });
            this.rProcess.on('error', (error) => {
                console.error('R process error:', error);
                this.rProcess = null;
                resolve({ success: false, error: error.message });
            });
            this.rProcess.on('close', (code) => {
                console.log('R process exited with code:', code);
                this.rProcess = null;
            });
            // Timeout after 5 seconds
            setTimeout(() => {
                if (this.rProcess && !this.rProcess.killed) {
                    resolve({ success: false, error: 'R startup timeout' });
                }
            }, 5000);
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
        // Here we would dump the data to a file and run the python engine
        try {
            const result = yield runPythonScript();
            return { status: 'success', output: result };
        }
        catch (error) {
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
});
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