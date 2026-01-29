import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { spawn } from 'child_process';

let mainWindow: BrowserWindow | null;

// Determine if we are in development mode
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        // Emerald theme dark background color to avoid white flash
        backgroundColor: '#020617',
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
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
        const scriptPath = path.join(__dirname, '../../engine/orchestrator.py');
        const pythonProcess = spawn('python3', [scriptPath]);

        let data = '';
        pythonProcess.stdout.on('data', (chunk) => {
            data += chunk.toString();
        });

        pythonProcess.stderr.on('data', (chunk) => {
            console.error(`Python Error: ${chunk}`);
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) resolve(data);
            else reject(`Process exited with code ${code}`);
        });
    });
};

app.on('ready', () => {
    createWindow();

    ipcMain.handle('run-workflow', async (event, workflowData) => {
        console.log('Received workflow:', workflowData);
        // Here we would dump the data to a file and run the python engine
        try {
            const result = await runPythonScript();
            return { status: 'success', output: result };
        } catch (error) {
            return { status: 'error', message: String(error) };
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
