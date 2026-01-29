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