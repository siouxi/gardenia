import { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, ChevronUp, ChevronDown, Monitor, Play, X, Eraser } from 'lucide-react';
import { RCommandResult, PythonCommandResult } from '../types/r-types';

type TabType = 'console' | 'terminal' | 'r' | 'python';

interface RHistoryEntry {
    command: string;
    output: string;
    status: 'success' | 'error';
    timestamp: Date;
}

declare global {
    interface Window {
        electronAPI: {
            runWorkflow: (workflowData: any) => Promise<any>;
            startRSession: () => Promise<{ success: boolean; version?: string; error?: string }>;
            executeRCommand: (command: string) => Promise<RCommandResult>;
            stopRSession: () => Promise<{ success: boolean }>;
            getRSessionStatus: () => Promise<{ active: boolean }>;
            executeShellCommand: (command: string) => Promise<RCommandResult>;
            startPythonSession: () => Promise<{ success: boolean; version?: string; error?: string }>;
            executePythonCommand: (command: string) => Promise<PythonCommandResult>;
            stopPythonSession: () => Promise<{ success: boolean }>;
            getPythonSessionStatus: () => Promise<{ active: boolean }>;
        };
    }
}

export const Terminal = () => {
    const [isOpen, setIsOpen] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('console');
    const [rInput, setRInput] = useState('');
    const [rHistory, setRHistory] = useState<RHistoryEntry[]>([]);
    const [rSessionActive, setRSessionActive] = useState(false);
    const [rSessionLoading, setRSessionLoading] = useState(false);
    const [rVersion, setRVersion] = useState<string>('');
    const [shellInput, setShellInput] = useState('');
    const [shellHistory, setShellHistory] = useState<RHistoryEntry[]>([]);

    // Python State
    const [pythonInput, setPythonInput] = useState('');
    const [pythonHistory, setPythonHistory] = useState<RHistoryEntry[]>([]);
    const [pythonSessionActive, setPythonSessionActive] = useState(false);
    const [pythonSessionLoading, setPythonSessionLoading] = useState(false);
    const [pythonVersion, setPythonVersion] = useState<string>('');

    const clearRHistory = () => {
        setRHistory([]);
    };

    const clearPythonHistory = () => {
        setPythonHistory([]);
    };

    const outputRef = useRef<HTMLDivElement>(null);

    const [consoleLogs, setConsoleLogs] = useState<string[]>([
        "[System] Gardenia Engine Ready..."
    ]);

    // Auto-start R and Python sessions on mount
    useEffect(() => {
        const startSessions = async () => {
            // Start R
            try {
                const result = await window.electronAPI.startRSession();
                if (result.success) {
                    setRVersion(result.version || 'Detected');
                    setRSessionActive(true); // Keep session active
                    setConsoleLogs(prev => [
                        ...prev.slice(0, -1), // Remove "Detecting R installation..."
                        `[System] R ${result.version || 'Session'} detected and session started`,
                    ]);

                    // Get R working directory
                    try {
                        const wdResult = await window.electronAPI.executeRCommand('getwd()');
                        if (wdResult.status === 'success' && wdResult.output) {
                            // Extract the working directory from R output (usually in quotes)
                            const wdMatch = wdResult.output.match(/\[1\]\s+"(.+)"/);
                            const workingDir = wdMatch ? wdMatch[1] : wdResult.output.trim();

                            setConsoleLogs(prev => [
                                ...prev,
                                `[Info] R working directory: ${workingDir}`
                            ]);
                        }
                    } catch (wdError) {
                        console.error('Failed to get R working directory:', wdError);
                    }
                } else {
                    setConsoleLogs(prev => [
                        ...prev.slice(0, -1),
                        "[Warning] R not detected or failed to start",
                    ]);
                }
            } catch (error) {
                console.error('Failed to start R session:', error);
                setConsoleLogs(prev => [
                    ...prev.slice(0, -1),
                    "[Warning] R session auto-start failed",
                ]);
            }

            // Start Python
            try {
                setConsoleLogs(prev => [...prev, "[Info] Detecting Python installation..."]);
                const result = await window.electronAPI.startPythonSession();
                if (result.success && result.version) {
                    setPythonVersion(result.version);
                    setPythonSessionActive(true);
                    setConsoleLogs(prev => [
                        ...prev,
                        `[System] Python ${result.version} detected and session started`,
                        "[Info] Engines ready for workflow execution..."
                    ]);
                } else {
                    setConsoleLogs(prev => [
                        ...prev,
                        "[Warning] Python not detected or failed to start",
                        "[Info] Ready for workflow execution (limited functionality)..."
                    ]);
                }
            } catch (error) {
                console.error('Failed to start Python session:', error);
                setConsoleLogs(prev => [
                    ...prev,
                    "[Warning] Python session auto-start failed",
                    "[Info] Ready for workflow execution (limited functionality)..."
                ]);
            }
        };
        startSessions();
    }, []);

    // Auto-scroll to bottom when new output arrives
    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [rHistory, pythonHistory, shellHistory]);

    const startRSession = async () => {
        setRSessionLoading(true);
        try {
            const result = await window.electronAPI.startRSession();
            if (result.success) {
                setRSessionActive(true);
                const version = result.version || rVersion;
                if (version) {
                    setRVersion(version);
                }
                setRHistory([{
                    command: '# Session Started',
                    output: `R session initialized successfully${version ? ` (R ${version})` : ''}`,
                    status: 'success',
                    timestamp: new Date()
                }]);
            } else {
                setRHistory([{
                    command: '# Session Start Failed',
                    output: `Failed to start R: ${result.error}`,
                    status: 'error',
                    timestamp: new Date()
                }]);
            }
        } catch (error) {
            console.error('Failed to start R session:', error);
        } finally {
            setRSessionLoading(false);
        }
    };

    const stopRSession = async () => {
        try {
            await window.electronAPI.stopRSession();
            setRSessionActive(false);
            setRHistory(prev => [...prev, {
                command: '# Session Stopped',
                output: 'R session terminated',
                status: 'success',
                timestamp: new Date()
            }]);
        } catch (error) {
            console.error('Failed to stop R session:', error);
        }
    };

    const executeRCommand = async () => {
        if (!rInput.trim() || !rSessionActive) return;

        const command = rInput.trim();
        setRInput('');

        try {
            const result = await window.electronAPI.executeRCommand(command);

            setRHistory(prev => [...prev, {
                command,
                output: result.output || (result.error ? `Error: ${result.error}` : ''),
                status: result.status,
                timestamp: new Date()
            }]);
        } catch (error) {
            setRHistory(prev => [...prev, {
                command,
                output: `Error: ${error}`,
                status: 'error',
                timestamp: new Date()
            }]);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            executeRCommand();
        }
    };

    const executeShellCommand = async () => {
        if (!shellInput.trim()) return;

        const command = shellInput.trim();
        setShellInput('');

        // Add command to history immediately
        setShellHistory(prev => [...prev, {
            command: `$ ${command}`,
            output: 'Executing...',
            status: 'success',
            timestamp: new Date()
        }]);

        try {
            const result = await window.electronAPI.executeShellCommand(command);

            // Update the last entry with actual result
            setShellHistory(prev => {
                const newHistory = [...prev];
                newHistory[newHistory.length - 1] = {
                    command: `$ ${command}`,
                    output: result.output || (result.error ? `Error: ${result.error}` : 'Command completed'),
                    status: result.status,
                    timestamp: new Date()
                };
                return newHistory;
            });
        } catch (error) {
            setShellHistory(prev => {
                const newHistory = [...prev];
                newHistory[newHistory.length - 1] = {
                    command: `$ ${command}`,
                    output: `Error: ${error}`,
                    status: 'error',
                    timestamp: new Date()
                };
                return newHistory;
            });
        }
    };

    const handleShellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            executeShellCommand();
        }
    };

    // Python Functions
    const startPythonSession = async () => {
        setPythonSessionLoading(true);
        try {
            const result = await window.electronAPI.startPythonSession();
            if (result.success) {
                setPythonSessionActive(true);
                const version = result.version || pythonVersion;
                if (version) {
                    setPythonVersion(version);
                }
                setPythonHistory([{
                    command: '# Session Started',
                    output: `Python session initialized successfully${version ? ` (Python ${version})` : ''}`,
                    status: 'success',
                    timestamp: new Date()
                }]);
            } else {
                setPythonHistory([{
                    command: '# Session Start Failed',
                    output: `Failed to start Python: ${result.error}`,
                    status: 'error',
                    timestamp: new Date()
                }]);
            }
        } catch (error) {
            console.error('Failed to start Python session:', error);
        } finally {
            setPythonSessionLoading(false);
        }
    };

    const stopPythonSession = async () => {
        try {
            await window.electronAPI.stopPythonSession();
            setPythonSessionActive(false);
            setPythonHistory(prev => [...prev, {
                command: '# Session Stopped',
                output: 'Python session terminated',
                status: 'success',
                timestamp: new Date()
            }]);
        } catch (error) {
            console.error('Failed to stop Python session:', error);
        }
    };

    const executePythonCommand = async () => {
        if (!pythonInput.trim() || !pythonSessionActive) return;

        const command = pythonInput.trim();
        setPythonInput('');

        try {
            const result = await window.electronAPI.executePythonCommand(command);

            setPythonHistory(prev => [...prev, {
                command,
                output: result.output || (result.error ? `Error: ${result.error}` : ''),
                status: result.status,
                timestamp: new Date()
            }]);
        } catch (error) {
            setPythonHistory(prev => [...prev, {
                command,
                output: `Error: ${error}`,
                status: 'error',
                timestamp: new Date()
            }]);
        }
    };

    const handlePythonKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            executePythonCommand();
        }
    };

    return (
        <div
            className={`bg-[#1f1f23] border-t border-[#000] transition-all duration-300 flex flex-col shrink-0 ${isOpen ? 'h-72' : 'h-9'}`}
        >
            <div
                className="h-9 bg-slate-800 flex items-center justify-between px-4 cursor-pointer select-none border-b border-slate-700"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-4 text-slate-300 text-sm font-mono">
                    <div className="flex items-center gap-2">
                        <TerminalIcon size={14} />
                        <span>Output Panel</span>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => setActiveTab('console')}
                            className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'console'
                                ? 'bg-[#2a2a2a] text-emerald-400 border border-slate-600'
                                : 'bg-transparent text-slate-400 hover:text-slate-300'
                                }`}
                        >
                            <div className="flex items-center gap-1.5">
                                <Monitor size={12} />
                                Console
                            </div>
                        </button>
                        <button
                            onClick={() => setActiveTab('terminal')}
                            className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'terminal'
                                ? 'bg-[#2a2a2a] text-emerald-400 border border-slate-600'
                                : 'bg-transparent text-slate-400 hover:text-slate-300'
                                }`}
                        >
                            <div className="flex items-center gap-1.5">
                                <TerminalIcon size={12} />
                                Terminal
                            </div>
                        </button>
                        <button
                            onClick={() => setActiveTab('r')}
                            className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'r'
                                ? 'bg-[#2a2a2a] text-blue-400 border border-slate-600'
                                : 'bg-transparent text-slate-400 hover:text-slate-300'
                                }`}
                        >
                            <div className="flex items-center gap-1.5">
                                <span className="font-bold">R</span>
                                {rSessionActive && <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>}
                            </div>
                        </button>
                        <button
                            onClick={() => setActiveTab('python')}
                            className={`px-3 py-1 text-xs rounded transition-colors ${activeTab === 'python'
                                ? 'bg-[#2a2a2a] text-yellow-400 border border-slate-600'
                                : 'bg-transparent text-slate-400 hover:text-slate-300'
                                }`}
                        >
                            <div className="flex items-center gap-1.5">
                                <span className="font-bold">PY</span>
                                {pythonSessionActive && <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>}
                            </div>
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                    {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4 font-mono text-xs space-y-1" ref={outputRef}>
                {activeTab === 'console' && consoleLogs.map((log, i) => (
                    <div key={i} className="text-emerald-400 border-b border-slate-800/50 pb-0.5 mb-0.5 last:border-0">
                        <span className="opacity-50 mr-2">[{new Date().toLocaleTimeString()}]</span>
                        {log}
                    </div>
                ))}

                {activeTab === 'terminal' && (
                    <>
                        {shellHistory.length === 0 && (
                            <div className="text-slate-400 text-center py-8">
                                <p>Interactive shell terminal</p>
                                <p className="text-xs mt-2">Type commands below to execute</p>
                            </div>
                        )}

                        {shellHistory.map((entry, i) => (
                            <div key={i} className="mb-2">
                                <div className="text-green-400">
                                    {entry.command}
                                </div>
                                {entry.output && (
                                    <div className={`whitespace-pre-wrap font-mono ${entry.status === 'error' ? 'text-red-400' : 'text-slate-300'
                                        }`}>
                                        {entry.output}
                                    </div>
                                )}
                            </div>
                        ))}
                    </>
                )}

                {activeTab === 'r' && (
                    <>
                        {!rSessionActive && rHistory.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                                <div className="text-center">
                                    <p className="mb-2">R session not started</p>
                                    <button
                                        onClick={startRSession}
                                        disabled={rSessionLoading}
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
                                    >
                                        <Play size={14} />
                                        {rSessionLoading ? 'Starting R...' : 'Start R Session'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {rHistory.map((entry, i) => (
                            <div key={i} className="mb-2">
                                <div className="text-blue-400">
                                    <span className="text-slate-500 mr-2">R&gt;</span>
                                    {entry.command}
                                </div>
                                {entry.output && (
                                    <div className={`ml-4 whitespace-pre-wrap ${entry.status === 'error' ? 'text-red-400' : 'text-slate-300'
                                        }`}>
                                        {entry.output}
                                    </div>
                                )}
                            </div>
                        ))}
                    </>
                )}

                {activeTab === 'python' && (
                    <>
                        {!pythonSessionActive && pythonHistory.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                                <div className="text-center">
                                    <p className="mb-2">Python session not started</p>
                                    <button
                                        onClick={startPythonSession}
                                        disabled={pythonSessionLoading}
                                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
                                    >
                                        <Play size={14} />
                                        {pythonSessionLoading ? 'Starting Python...' : 'Start Python Session'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {pythonHistory.map((entry, i) => (
                            <div key={i} className="mb-2">
                                <div className="text-yellow-400">
                                    <span className="text-slate-500 mr-2">PY&gt;</span>
                                    {entry.command}
                                </div>
                                {entry.output && (
                                    <div className={`ml-4 whitespace-pre-wrap ${entry.status === 'error' ? 'text-red-400' : 'text-slate-300'
                                        }`}>
                                        {entry.output}
                                    </div>
                                )}
                            </div>
                        ))}
                    </>
                )}
            </div>

            {/* R Input Field */}
            {activeTab === 'r' && rSessionActive && (
                <div className="border-t border-slate-700 p-2 bg-slate-800/50 flex items-center gap-2">
                    <div className="flex items-center gap-2 flex-1">
                        <span className="text-blue-400 font-mono text-xs">R&gt;</span>
                        <input
                            type="text"
                            value={rInput}
                            onChange={(e) => setRInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Enter R command..."
                            className="flex-1 bg-transparent text-slate-300 text-xs font-mono outline-none"
                            autoFocus
                        />
                    </div>
                    <button
                        onClick={executeRCommand}
                        disabled={!rInput.trim()}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Run
                    </button>
                    <button
                        onClick={clearRHistory}
                        className="px-3 py-1 bg-slate-600 hover:bg-slate-700 text-white text-xs rounded transition-colors flex items-center gap-1"
                        title="Clear Output"
                    >
                        <Eraser size={12} />
                        Clear
                    </button>
                    <button
                        onClick={stopRSession}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors flex items-center gap-1"
                    >
                        <X size={12} />
                        Stop
                    </button>
                </div>
            )}

            {/* Shell Input Field */}
            {activeTab === 'terminal' && (
                <div className="border-t border-slate-700 p-2 bg-slate-800/50 flex items-center gap-2">
                    <div className="flex items-center gap-2 flex-1">
                        <span className="text-green-400 font-mono text-xs">$</span>
                        <input
                            type="text"
                            value={shellInput}
                            onChange={(e) => setShellInput(e.target.value)}
                            onKeyDown={handleShellKeyDown}
                            placeholder="Enter shell command..."
                            className="flex-1 bg-transparent text-slate-300 text-xs font-mono outline-none"
                            autoFocus
                        />
                    </div>
                    <button
                        onClick={executeShellCommand}
                        disabled={!shellInput.trim()}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Run
                    </button>
                </div>
            )}

            {/* Python Input Field */}
            {activeTab === 'python' && pythonSessionActive && (
                <div className="border-t border-slate-700 p-2 bg-slate-800/50 flex items-center gap-2">
                    <div className="flex items-center gap-2 flex-1">
                        <span className="text-yellow-400 font-mono text-xs">PY&gt;</span>
                        <input
                            type="text"
                            value={pythonInput}
                            onChange={(e) => setPythonInput(e.target.value)}
                            onKeyDown={handlePythonKeyDown}
                            placeholder="Enter Python command..."
                            className="flex-1 bg-transparent text-slate-300 text-xs font-mono outline-none"
                            autoFocus
                        />
                    </div>
                    <button
                        onClick={executePythonCommand}
                        disabled={!pythonInput.trim()}
                        className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Run
                    </button>
                    <button
                        onClick={clearPythonHistory}
                        className="px-3 py-1 bg-slate-600 hover:bg-slate-700 text-white text-xs rounded transition-colors flex items-center gap-1"
                        title="Clear Output"
                    >
                        <Eraser size={12} />
                        Clear
                    </button>
                    <button
                        onClick={stopPythonSession}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors flex items-center gap-1"
                    >
                        <X size={12} />
                        Stop
                    </button>
                </div>
            )}
        </div>
    );
};
