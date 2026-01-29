import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    runWorkflow: (workflowData: any) => ipcRenderer.invoke('run-workflow', workflowData),
});
