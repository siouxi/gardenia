"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    runWorkflow: (workflowData) => electron_1.ipcRenderer.invoke('run-workflow', workflowData),
    // R Session APIs
    startRSession: () => electron_1.ipcRenderer.invoke('start-r-session'),
    executeRCommand: (command) => electron_1.ipcRenderer.invoke('execute-r-command', command),
    stopRSession: () => electron_1.ipcRenderer.invoke('stop-r-session'),
    getRSessionStatus: () => electron_1.ipcRenderer.invoke('r-session-status'),
    // Shell command API
    executeShellCommand: (command) => electron_1.ipcRenderer.invoke('execute-shell-command', command),
    // Python Session APIs
    startPythonSession: () => electron_1.ipcRenderer.invoke('start-python-session'),
    executePythonCommand: (command) => electron_1.ipcRenderer.invoke('execute-python-command', command),
    stopPythonSession: () => electron_1.ipcRenderer.invoke('stop-python-session'),
    // File Dialog API
    openFileDialog: () => electron_1.ipcRenderer.invoke('dialog:openFile'),
});
//# sourceMappingURL=preload.js.map