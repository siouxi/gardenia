import { useState } from 'react';
import { Terminal as TerminalIcon, ChevronUp, ChevronDown, Monitor } from 'lucide-react';

type TabType = 'console' | 'terminal';

export const Terminal = () => {
    const [isOpen, setIsOpen] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('console');

    const [consoleLogs] = useState<string[]>([
        "[System] Gardenia Engine Ready...",
        "[System] Connected to Python 3.10.12",
        "[Info] Waiting for workflow execution..."
    ]);

    const [terminalOutput] = useState<string[]>([
        "$ npm run dev",
        "Starting development server...",
        "Server running at http://localhost:5173"
    ]);

    return (
        <div
            className={`bg-[#1f1f23] border-t border-[#000] transition-all duration-300 flex flex-col shrink-0 ${isOpen ? 'h-48' : 'h-9'}`}
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
                    </div>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                    {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4 font-mono text-xs space-y-1">
                {activeTab === 'console' && consoleLogs.map((log, i) => (
                    <div key={i} className="text-emerald-400 border-b border-slate-800/50 pb-0.5 mb-0.5 last:border-0">
                        <span className="opacity-50 mr-2">[{new Date().toLocaleTimeString()}]</span>
                        {log}
                    </div>
                ))}

                {activeTab === 'terminal' && terminalOutput.map((line, i) => (
                    <div key={i} className="text-slate-300 border-b border-slate-800/50 pb-0.5 mb-0.5 last:border-0">
                        {line}
                    </div>
                ))}

                <div className="animate-pulse text-emerald-500/50">_</div>
            </div>
        </div>
    );
};
