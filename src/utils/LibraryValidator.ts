import { AppNode } from '../App';
import { ToolRegistry } from '../registry/tools';

export interface MissingLibraries {
    python: string[];
    r: string[];
}

/**
 * Validates that all required libraries for the workflow nodes are installed.
 * @param nodes - Array of workflow nodes
 * @returns Object containing lists of missing Python and R libraries
 */
export async function validateWorkflowLibraries(nodes: AppNode[]): Promise<MissingLibraries> {
    const requiredPythonLibs = new Set<string>();
    const requiredRLibs = new Set<string>();

    // Collect all required libraries from nodes
    for (const node of nodes) {
        const toolId = node.data.toolId;
        if (!toolId) continue;

        // Skip control flow nodes
        if (toolId === 'flow-start' || toolId === 'flow-end') continue;

        const tool = ToolRegistry.getById(toolId);
        if (!tool || !tool.libraries || tool.libraries.length === 0) continue;

        // Add libraries to the appropriate set based on language
        const language = tool.language || node.data.language || 'python';
        if (language === 'python') {
            tool.libraries.forEach(lib => requiredPythonLibs.add(lib));
        } else if (language === 'r') {
            tool.libraries.forEach(lib => requiredRLibs.add(lib));
        }
    }

    // If no libraries required, return empty
    if (requiredPythonLibs.size === 0 && requiredRLibs.size === 0) {
        return { python: [], r: [] };
    }

    // Check which libraries are installed
    const missingPython: string[] = [];
    const missingR: string[] = [];

    // Check Python libraries
    if (requiredPythonLibs.size > 0) {
        try {
            const installedPythonPackages = await (window as any).electronAPI.listPythonPackages();
            const installedNames = new Set(installedPythonPackages.map((p: any) => p.name.toLowerCase()));

            for (const lib of requiredPythonLibs) {
                if (!installedNames.has(lib.toLowerCase())) {
                    missingPython.push(lib);
                }
            }
        } catch (error) {
            console.error('Failed to check Python packages:', error);
            // If we can't check, assume all are missing to be safe
            missingPython.push(...Array.from(requiredPythonLibs));
        }
    }

    // Check R libraries
    if (requiredRLibs.size > 0) {
        try {
            const installedRPackages = await (window as any).electronAPI.listRPackages();
            const installedNames = new Set(installedRPackages.map((p: any) => p.Package.toLowerCase()));

            for (const lib of requiredRLibs) {
                if (!installedNames.has(lib.toLowerCase())) {
                    missingR.push(lib);
                }
            }
        } catch (error) {
            console.error('Failed to check R packages:', error);
            // If we can't check, assume all are missing to be safe
            missingR.push(...Array.from(requiredRLibs));
        }
    }

    return {
        python: missingPython,
        r: missingR
    };
}

/**
 * Installs missing libraries using the appropriate package manager.
 * @param missing - Object containing lists of missing Python and R libraries
 * @param logCallback - Callback function for logging progress
 */
export async function installMissingLibraries(
    missing: MissingLibraries,
    logCallback: (message: string) => void
): Promise<void> {
    // Install Python packages
    for (const pkg of missing.python) {
        logCallback(`Installing Python package: ${pkg}...`);
        try {
            const result = await (window as any).electronAPI.installPythonPackage(pkg);
            if (result.success) {
                logCallback(`✅ Successfully installed ${pkg}`);
            } else {
                logCallback(`❌ Failed to install ${pkg}: ${result.output || result.error}`);
                throw new Error(`Failed to install Python package: ${pkg}`);
            }
        } catch (error) {
            logCallback(`❌ Error installing ${pkg}: ${error}`);
            throw error;
        }
    }

    // Install R packages
    for (const pkg of missing.r) {
        logCallback(`Installing R package: ${pkg}...`);
        try {
            const result = await (window as any).electronAPI.installRPackage(pkg);
            if (result.success) {
                logCallback(`✅ Successfully installed ${pkg}`);
            } else {
                logCallback(`❌ Failed to install ${pkg}: ${result.output || result.error}`);
                throw new Error(`Failed to install R package: ${pkg}`);
            }
        } catch (error) {
            logCallback(`❌ Error installing ${pkg}: ${error}`);
            throw error;
        }
    }
}
