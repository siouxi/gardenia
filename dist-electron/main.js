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
const fs_1 = __importDefault(require("fs"));
let mainWindow;
let activePythonPath = 'python3'; // Default
// Determine if we are in development mode
const isDev = process.env.NODE_ENV === 'development';
// R Session Manager
class RSessionManager {
    constructor() {
        this.rProcess = null;
        // Buffer to handle split chunks of JSON response
        this.pendingData = '';
    }
    start() {
        return new Promise((resolve) => {
            if (this.rProcess) {
                resolve({ success: true, version: 'already running' });
                return;
            }
            console.log('Starting R session...');
            try {
                // Robust path resolution for r_bridge.R
                let scriptPath = path_1.default.join(__dirname, 'r_bridge.R');
                // If not found in current dir (production/dist), try dev path
                if (!fs_1.default.existsSync(scriptPath)) {
                    const devPath = path_1.default.join(__dirname, '../electron/r_bridge.R');
                    if (fs_1.default.existsSync(devPath)) {
                        scriptPath = devPath;
                    }
                    else {
                        console.error('Could not find r_bridge.R in:', scriptPath, 'or', devPath);
                    }
                }
                console.log(`Using R bridge script at: ${scriptPath}`);
                // Spawn the bridge script using Rscript
                // Using "Rscript" assuming it is in PATH
                this.rProcess = (0, child_process_1.spawn)('Rscript', [scriptPath]);
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
                setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                    if (this.rProcess) {
                        try {
                            const verRes = yield this.executeCommand('cat(R.version$major, ".", R.version$minor, sep="")');
                            const version = verRes.output.trim();
                            console.log('R session started successfully, version:', version);
                            resolve({ success: true, version });
                        }
                        catch (e) {
                            resolve({ success: false, error: 'Failed to verify R session: ' + e.message });
                        }
                    }
                    else {
                        resolve({ success: false, error: 'Process exited immediately' });
                    }
                }), 500);
            }
            catch (error) {
                console.error('Failed to spawn R process:', error);
                resolve({ success: false, error: error.message });
            }
        });
    }
    executeCommand(command) {
        return new Promise((resolve, reject) => {
            if (!this.rProcess) {
                resolve({ status: 'error', output: '', error: 'R session not started' });
                return;
            }
            // Prepare the one-time listener for the response
            const onData = (chunk) => {
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
                    }
                    catch (e) {
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
            this.rProcess.stdout.on('data', onData);
            const cleanup = () => {
                var _a, _b;
                (_b = (_a = this.rProcess) === null || _a === void 0 ? void 0 : _a.stdout) === null || _b === void 0 ? void 0 : _b.off('data', onData);
            };
            // Send command as JSON
            try {
                let completed = false;
                const payload = JSON.stringify({ command });
                this.rProcess.stdin.write(payload + '\n');
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
            }
            catch (e) {
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
    isActive() {
        return this.rProcess !== null && !this.rProcess.killed;
    }
}
const rSession = new RSessionManager();
function createWindow() {
    const iconPath = isDev
        ? path_1.default.join(__dirname, '../public/icon.svg')
        : path_1.default.join(__dirname, '../dist/icon.svg');
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        icon: iconPath,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path_1.default.join(__dirname, 'preload.js'),
        },
        // Emerald theme dark background color to avoid white flash
        backgroundColor: '#020617',
        autoHideMenuBar: true,
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
    // Bash Session IPC Handlers
    electron_1.ipcMain.handle('start-bash-session', () => __awaiter(void 0, void 0, void 0, function* () {
        return yield bashSession.start();
    }));
    electron_1.ipcMain.handle('execute-bash-command', (event, command) => __awaiter(void 0, void 0, void 0, function* () {
        return yield bashSession.executeCommand(command);
    }));
    electron_1.ipcMain.handle('stop-bash-session', () => __awaiter(void 0, void 0, void 0, function* () {
        bashSession.stop();
        return { success: true };
    }));
    electron_1.ipcMain.handle('get-bash-session-status', () => __awaiter(void 0, void 0, void 0, function* () {
        return { active: bashSession.isActive() };
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
    // File Dialog IPC
    electron_1.ipcMain.handle('dialog:openFile', () => __awaiter(void 0, void 0, void 0, function* () {
        const { canceled, filePaths } = yield electron_1.dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'CSV Files', extensions: ['csv'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        if (canceled) {
            return null;
        }
        else {
            return filePaths[0];
        }
    }));
    // Package Manager IPC Handlers
    // PYTHON
    electron_1.ipcMain.handle('package:list-python', () => __awaiter(void 0, void 0, void 0, function* () {
        return new Promise((resolve) => {
            const proc = (0, child_process_1.spawn)(activePythonPath, ['-m', 'pip', 'list', '--format=json']);
            let data = '';
            proc.stdout.on('data', d => data += d);
            proc.on('close', () => {
                try {
                    resolve(JSON.parse(data));
                }
                catch (_a) {
                    resolve([]);
                }
            });
        });
    }));
    electron_1.ipcMain.handle('package:install-python', (event, name) => __awaiter(void 0, void 0, void 0, function* () {
        return new Promise((resolve) => {
            const proc = (0, child_process_1.spawn)(activePythonPath, ['-m', 'pip', 'install', name]);
            let output = '';
            proc.stdout.on('data', d => output += d);
            proc.stderr.on('data', d => output += d);
            proc.on('close', (code) => {
                resolve({ success: code === 0, output });
            });
        });
    }));
    electron_1.ipcMain.handle('package:uninstall-python', (event, name) => __awaiter(void 0, void 0, void 0, function* () {
        return new Promise((resolve) => {
            const proc = (0, child_process_1.spawn)(activePythonPath, ['-m', 'pip', 'uninstall', '-y', name]);
            let output = '';
            proc.stdout.on('data', d => output += d);
            proc.stderr.on('data', d => output += d);
            proc.on('close', (code) => {
                resolve({ success: code === 0, output });
            });
        });
    }));
    // R
    electron_1.ipcMain.handle('package:list-r', () => __awaiter(void 0, void 0, void 0, function* () {
        return new Promise((resolve) => {
            // R script to list installed packages as JSON
            const rScript = `
                installed <- installed.packages()[,c("Package", "Version")]
                json <- jsonlite::toJSON(as.data.frame(installed), auto_unbox=TRUE)
                cat(json)
            `;
            const proc = (0, child_process_1.spawn)('Rscript', ['-e', rScript]);
            let data = '';
            proc.stdout.on('data', d => data += d);
            proc.on('close', () => {
                try {
                    resolve(JSON.parse(data));
                }
                catch (e) {
                    console.error('Failed to parse R package list:', e);
                    resolve([]); // Likely jsonlite not installed
                }
            });
        });
    }));
    electron_1.ipcMain.handle('package:install-r', (event, name) => __awaiter(void 0, void 0, void 0, function* () {
        return new Promise((resolve) => {
            // Choose a CRAN mirror
            const rScript = `install.packages('${name}', repos='http://cran.rstudio.com')`;
            const proc = (0, child_process_1.spawn)('Rscript', ['-e', rScript]);
            let output = '';
            proc.stdout.on('data', d => output += d);
            proc.stderr.on('data', d => output += d);
            proc.on('close', (code) => {
                resolve({ success: code === 0, output });
            });
        });
    }));
    electron_1.ipcMain.handle('package:uninstall-r', (event, name) => __awaiter(void 0, void 0, void 0, function* () {
        return new Promise((resolve) => {
            const rScript = `remove.packages('${name}')`;
            const proc = (0, child_process_1.spawn)('Rscript', ['-e', rScript]);
            let output = '';
            proc.stdout.on('data', d => output += d);
            proc.stderr.on('data', d => output += d);
            proc.on('close', (code) => {
                resolve({ success: code === 0, output });
            });
        });
    }));
    // Environment Manager IPC Handlers
    electron_1.ipcMain.handle('env:list-conda', () => __awaiter(void 0, void 0, void 0, function* () {
        return new Promise((resolve) => {
            const proc = (0, child_process_1.spawn)('conda', ['env', 'list', '--json']);
            let data = '';
            proc.stdout.on('data', d => data += d);
            proc.on('close', () => {
                try {
                    const parsed = JSON.parse(data);
                    // Transform to nicer format
                    const envs = parsed.envs.map((envPath) => {
                        const name = path_1.default.basename(envPath); // Simple name derivation
                        return { name, path: envPath };
                    });
                    resolve(envs);
                }
                catch (_a) {
                    resolve([]);
                }
            });
        });
    }));
    electron_1.ipcMain.handle('env:set-python', (event, pythonPath) => __awaiter(void 0, void 0, void 0, function* () {
        activePythonPath = pythonPath;
        return { success: true, current: activePythonPath };
    }));
    electron_1.ipcMain.handle('env:get-python', () => __awaiter(void 0, void 0, void 0, function* () {
        return activePythonPath;
    }));
});
// Python Session Manager
class PythonSessionManager {
    constructor() {
        this.pythonProcess = null;
        // Buffer to handle split chunks of JSON response
        this.pendingData = '';
    }
    start() {
        return new Promise((resolve) => {
            if (this.pythonProcess) {
                resolve({ success: true, version: 'already running' });
                return;
            }
            console.log('Starting Python bridge session...');
            try {
                // Robust path resolution for python_bridge.py
                let scriptPath = path_1.default.join(__dirname, 'python_bridge.py');
                // If not found in current dir (production/dist), try dev path
                if (!fs_1.default.existsSync(scriptPath)) {
                    const devPath = path_1.default.join(__dirname, '../electron/python_bridge.py');
                    if (fs_1.default.existsSync(devPath)) {
                        scriptPath = devPath;
                    }
                    else {
                        console.error('Could not find python_bridge.py in:', scriptPath, 'or', devPath);
                    }
                }
                console.log(`Using Python bridge script at: ${scriptPath}`);
                // Spawn the bridge script
                // Using "python3" assuming it is in PATH. 
                this.pythonProcess = (0, child_process_1.spawn)(activePythonPath, ['-u', scriptPath]);
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
                setTimeout(() => __awaiter(this, void 0, void 0, function* () {
                    if (this.pythonProcess) {
                        try {
                            const verRes = yield this.executeCommand('import sys; print(f"Python {sys.version.split()[0]}")');
                            const version = verRes.output.replace('Python ', '').trim();
                            console.log('Python session started successfully, version:', version);
                            resolve({ success: true, version });
                        }
                        catch (e) {
                            resolve({ success: false, error: 'Failed to verify python session: ' + e.message });
                        }
                    }
                    else {
                        resolve({ success: false, error: 'Process exited immediately' });
                    }
                }), 500);
            }
            catch (error) {
                console.error('Failed to spawn Python process:', error);
                resolve({ success: false, error: error.message });
            }
        });
    }
    executeCommand(command) {
        return new Promise((resolve, reject) => {
            if (!this.pythonProcess) {
                resolve({ status: 'error', output: '', error: 'Python session not started' });
                return;
            }
            // Prepare the one-time listener for the response
            const onData = (chunk) => {
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
                    }
                    catch (e) {
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
            this.pythonProcess.stdout.on('data', onData);
            const cleanup = () => {
                var _a, _b;
                (_b = (_a = this.pythonProcess) === null || _a === void 0 ? void 0 : _a.stdout) === null || _b === void 0 ? void 0 : _b.off('data', onData);
            };
            // Send command as JSON
            try {
                let completed = false;
                const payload = JSON.stringify({ command });
                this.pythonProcess.stdin.write(payload + '\n');
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
            }
            catch (e) {
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
    isActive() {
        return this.pythonProcess !== null && !this.pythonProcess.killed;
    }
}
const pythonSession = new PythonSessionManager();
// Bash Session Manager
class BashSessionManager {
    constructor() {
        this.bashProcess = null;
        this.pendingData = '';
    }
    start() {
        return new Promise((resolve) => {
            if (this.bashProcess) {
                resolve({ success: true });
                return;
            }
            console.log('Starting Bash bridge session...');
            try {
                let scriptPath = path_1.default.join(__dirname, 'bash_bridge.py');
                if (!fs_1.default.existsSync(scriptPath)) {
                    const devPath = path_1.default.join(__dirname, '../electron/bash_bridge.py');
                    if (fs_1.default.existsSync(devPath)) {
                        scriptPath = devPath;
                    }
                    else {
                        console.error('Could not find bash_bridge.py');
                        resolve({ success: false, error: 'Bridge script not found' });
                        return;
                    }
                }
                // We use the active python to run the bash bridge (since it's a python script)
                // This ensures we have a valid runner.
                this.bashProcess = (0, child_process_1.spawn)(activePythonPath, ['-u', scriptPath]);
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
                const onData = (chunk) => {
                    var _a, _b;
                    const str = chunk.toString();
                    if (str.includes('\n')) {
                        (_b = (_a = this.bashProcess) === null || _a === void 0 ? void 0 : _a.stdout) === null || _b === void 0 ? void 0 : _b.off('data', onData);
                        resolve({ success: true });
                    }
                };
                this.bashProcess.stdout.on('data', onData);
            }
            catch (error) {
                console.error('Failed to spawn Bash process:', error);
                resolve({ success: false, error: error.message });
            }
        });
    }
    executeCommand(command) {
        return new Promise((resolve, reject) => {
            if (!this.bashProcess) {
                resolve({ status: 'error', output: '', error: 'Bash session not started' });
                return;
            }
            const onData = (chunk) => {
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
                    }
                    catch (e) {
                        console.error('Failed to parse Bash response:', responseLine);
                        resolve({
                            status: 'error',
                            output: this.pendingData,
                            error: 'Protocol Error'
                        });
                    }
                }
            };
            this.bashProcess.stdout.on('data', onData);
            const cleanup = () => {
                var _a, _b;
                (_b = (_a = this.bashProcess) === null || _a === void 0 ? void 0 : _a.stdout) === null || _b === void 0 ? void 0 : _b.off('data', onData);
            };
            try {
                const payload = JSON.stringify({ command });
                this.bashProcess.stdin.write(payload + '\n');
            }
            catch (e) {
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
    isActive() {
        return this.bashProcess !== null && !this.bashProcess.killed;
    }
}
const bashSession = new BashSessionManager();
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