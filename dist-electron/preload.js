"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    runWorkflow: (workflowData) => electron_1.ipcRenderer.invoke('run-workflow', workflowData),
});
//# sourceMappingURL=preload.js.map