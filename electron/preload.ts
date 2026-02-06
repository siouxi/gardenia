import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    runWorkflow: (workflowData: any) => ipcRenderer.invoke('run-workflow', workflowData),

    // R Session APIs
    startRSession: () => ipcRenderer.invoke('start-r-session'),
    executeRCommand: (command: string) => ipcRenderer.invoke('execute-r-command', command),
    stopRSession: () => ipcRenderer.invoke('stop-r-session'),
    getRSessionStatus: () => ipcRenderer.invoke('r-session-status'),

    // Shell command API
    executeShellCommand: (command: string) => ipcRenderer.invoke('execute-shell-command', command),

    // Python Session APIs
    startPythonSession: () => ipcRenderer.invoke('start-python-session'),
    executePythonCommand: (command: string) => ipcRenderer.invoke('execute-python-command', command),
    stopPythonSession: () => ipcRenderer.invoke('stop-python-session'),
    // File Dialog API
    openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
});
