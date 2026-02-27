import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const isWindows = os.platform() === 'win32';
const isMac = os.platform() === 'darwin';

/**
 * Common paths where Python might be installed depending on the OS
 */
function getCommonPythonPaths(): string[] {
    const homedir = os.homedir();
    const paths: string[] = [];

    if (isWindows) {
        // Windows common paths (Conda, local app data, Program Files)
        paths.push(
            path.join(homedir, 'miniconda3', 'python.exe'),
            path.join(homedir, 'anaconda3', 'python.exe'),
            path.join(homedir, 'miniforge3', 'python.exe'),
            'C:\\ProgramData\\Miniconda3\\python.exe',
            'C:\\ProgramData\\Anaconda3\\python.exe',
            path.join(homedir, 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'python.exe'),
            path.join(homedir, 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'python.exe'),
            path.join(homedir, 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'python.exe'),
            path.join(homedir, 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'python.exe')
        );
    } else {
        // macOS / Linux common paths (Conda, Homebrew, Unix standard)
        paths.push(
            path.join(homedir, 'miniconda3', 'bin', 'python3'),
            path.join(homedir, 'miniconda3', 'bin', 'python'),
            path.join(homedir, 'anaconda3', 'bin', 'python3'),
            path.join(homedir, 'anaconda3', 'bin', 'python'),
            path.join(homedir, 'miniforge3', 'bin', 'python3'),
            '/opt/homebrew/bin/python3', // Mac Apple Silicon
            '/usr/local/bin/python3',    // Mac Intel
            '/usr/bin/python3'
        );
    }

    return paths;
}

/**
 * Common paths where Rscript might be installed depending on the OS
 */
function getCommonRPaths(): string[] {
    const paths: string[] = [];

    if (isWindows) {
        // Windows standard R installations (assumes latest versions)
        paths.push(
            'C:\\Program Files\\R\\R-4.4.0\\bin\\Rscript.exe',
            'C:\\Program Files\\R\\R-4.3.3\\bin\\Rscript.exe',
            'C:\\Program Files\\R\\R-4.3.2\\bin\\Rscript.exe',
            'C:\\Program Files\\R\\R-4.3.1\\bin\\Rscript.exe',
            'C:\\Program Files\\R\\R-4.3.0\\bin\\Rscript.exe',
            'C:\\Program Files\\R\\R-4.2.3\\bin\\Rscript.exe'
        );
    } else if (isMac) {
        // macOS standard R installation and Homebrew
        paths.push(
            '/Library/Frameworks/R.framework/Resources/bin/Rscript',
            '/opt/homebrew/bin/Rscript',
            '/usr/local/bin/Rscript'
        );
    } else {
        // Linux standard
        paths.push(
            '/usr/bin/Rscript',
            '/usr/local/bin/Rscript'
        );
    }

    return paths;
}

/**
 * Checks if a command exists in the system PATH
 */
function findInPath(command: string): string | null {
    try {
        const checkCmd = isWindows ? 'where' : 'which';
        const result = execSync(`${checkCmd} ${command}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();

        if (result) {
            // 'where' on Windows can return multiple lines, take the first one
            const firstMatch = result.split(/\r?\n/)[0].trim();
            if (fs.existsSync(firstMatch)) {
                return firstMatch;
            }
        }
    } catch (e) {
        // Command not found in PATH
    }
    return null;
}

/**
 * Detect the best available Python executable path.
 * 1. Checks system PATH (which python3 / where python)
 * 2. Checks common installation directories (Conda, Homebrew, etc.)
 * 3. Fallbacks to simply 'python3' (or 'python' on Windows)
 */
export function detectPythonPath(): string {
    // 1. Try finding it in PATH first (giving preference to user's active environment context)
    const cmds = isWindows ? ['python', 'python3'] : ['python3', 'python'];
    for (const cmd of cmds) {
        const found = findInPath(cmd);
        if (found) {
            console.log(`[EnvDetector] Found Python in PATH: ${found}`);
            return found;
        }
    }

    // 2. Try common installation paths
    const commonPaths = getCommonPythonPaths();
    for (const p of commonPaths) {
        if (fs.existsSync(p)) {
            console.log(`[EnvDetector] Found Python in common path: ${p}`);
            return p;
        }
    }

    // 3. Fallback to generic command
    const fallback = isWindows ? 'python' : 'python3';
    console.warn(`[EnvDetector] Python not found via detection, falling back to: ${fallback}`);
    return fallback;
}

/**
 * Detect the best available Rscript executable path.
 * 1. Checks system PATH (which Rscript / where Rscript)
 * 2. Checks common installation directories
 * 3. Fallbacks to simply 'Rscript'
 */
export function detectRPath(): string {
    // 1. Try finding it in PATH first
    const found = findInPath('Rscript');
    if (found) {
        console.log(`[EnvDetector] Found Rscript in PATH: ${found}`);
        return found;
    }

    // 2. Try common installation paths
    const commonPaths = getCommonRPaths();
    for (const p of commonPaths) {
        if (fs.existsSync(p)) {
            console.log(`[EnvDetector] Found Rscript in common path: ${p}`);
            return p;
        }
    }

    // 3. Fallback to generic command
    console.warn('[EnvDetector] Rscript not found via detection, falling back to: Rscript');
    return 'Rscript';
}

/**
 * Utility to verify if a given executable path is valid and working.
 */
export function verifyExecutable(execPath: string, testCommand: string): boolean {
    try {
        if (execPath.includes('/') || execPath.includes('\\')) {
            if (!fs.existsSync(execPath)) {
                return false;
            }
        }
        execSync(`"${execPath}" ${testCommand}`, { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}
