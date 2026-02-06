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
