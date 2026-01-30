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
});
