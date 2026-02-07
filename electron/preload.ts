import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    runWorkflow: (workflowData: any) => ipcRenderer.invoke('run-workflow', workflowData),

    // NEW: DAG-based Workflow Orchestrator APIs
    executeWorkflow: (workflowData: any) => ipcRenderer.invoke('workflow:execute', workflowData),
    cancelWorkflow: () => ipcRenderer.invoke('workflow:cancel'),
    getWorkflowVariables: () => ipcRenderer.invoke('workflow:variables'),
    getWorkflowDatasets: () => ipcRenderer.invoke('workflow:datasets'),
    getWorkflowStatus: () => ipcRenderer.invoke('workflow:status'),

    // Workflow event listeners
    onNodeStateChange: (callback: (data: { nodeId: string; state: string }) => void) => {
        ipcRenderer.on('workflow:node-state', (_, data) => callback(data));
    },
    onNodeOutput: (callback: (data: { nodeId: string; output: string }) => void) => {
        ipcRenderer.on('workflow:node-output', (_, data) => callback(data));
    },
    onExecutionOrder: (callback: (data: { order: string[]; labels: string[] }) => void) => {
        ipcRenderer.on('workflow:execution-order', (_, data) => callback(data));
    },
    onWorkflowComplete: (callback: (result: any) => void) => {
        ipcRenderer.on('workflow:complete', (_, result) => callback(result));
    },

    // R variables update listener
    onRVariablesUpdate: (callback: (data: { variables: any[] }) => void) => {
        ipcRenderer.on('r-variables-update', (_, data) => callback(data));
    },

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

    // Package Manager API
    listPythonPackages: () => ipcRenderer.invoke('package:list-python'),
    installPythonPackage: (name: string) => ipcRenderer.invoke('package:install-python', name),
    uninstallPythonPackage: (name: string) => ipcRenderer.invoke('package:uninstall-python', name),

    listRPackages: () => ipcRenderer.invoke('package:list-r'),
    installRPackage: (name: string) => ipcRenderer.invoke('package:install-r', name),
    uninstallRPackage: (name: string) => ipcRenderer.invoke('package:uninstall-r', name),

    // Environment API
    listCondaEnvs: () => ipcRenderer.invoke('env:list-conda'),
    createCondaEnv: (name: string) => ipcRenderer.invoke('env:create-conda', name),
    setPythonEnv: (path: string) => ipcRenderer.invoke('env:set-python', path),
    getPythonEnv: () => ipcRenderer.invoke('env:get-python'),
    // Bash API
    startBashSession: () => ipcRenderer.invoke('start-bash-session'),
    executeBashCommand: (command: string) => ipcRenderer.invoke('execute-bash-command', command),
    stopBashSession: () => ipcRenderer.invoke('stop-bash-session'),
    getBashSessionStatus: () => ipcRenderer.invoke('get-bash-session-status'),
});

