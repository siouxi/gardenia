import { useState, useEffect } from 'react';
import {
    Cpu, Server, Activity,
    Zap, HardDrive, MemoryStick,
    RefreshCw, CheckCircle2, XCircle, AlertTriangle,
    Monitor, Globe, ChevronRight, TerminalSquare, Save
} from 'lucide-react';

interface ClusterResources {
    cpu: number;
    memory: number;
    object_store_memory: number;
    nodes: number;
}

type Backend = 'local' | 'ray';

export function EnginePreferences() {
    const [backend, setBackend] = useState<Backend>(() => {
        return (localStorage.getItem('gardenia_backend') as Backend) || 'local';
    });
    const [rayAvailable, setRayAvailable] = useState<boolean | null>(null);
    const [clusterResources, setClusterResources] = useState<ClusterResources | null>(null);
    const [checking, setChecking] = useState(false);
    const [switching, setSwitching] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    const [pyPath, setPyPath] = useState('');
    const [rPath, setRPath] = useState('');
    const [savingPaths, setSavingPaths] = useState(false);
    const [pathMessage, setPathMessage] = useState({ text: '', type: '' });

    // Load paths on mount
    useEffect(() => {
        loadPaths();
        checkRayStatus();
    }, []);

    const loadPaths = async () => {
        try {
            const api = (window as any).electronAPI;
            if (api?.env) {
                const paths = await api.env.getPaths();
                setPyPath(paths.pythonPath || '');
                setRPath(paths.rPath || '');
            }
        } catch (e) {
            console.error('Failed to load env paths', e);
        }
    };

    const handleSavePaths = async () => {
        setSavingPaths(true);
        setPathMessage({ text: 'Verifying and saving...', type: 'info' });
        try {
            const api = (window as any).electronAPI;
            if (api?.env) {
                const result = await api.env.setPaths({ pythonPath: pyPath, rPath: rPath });
                if (result.success) {
                    setPathMessage({
                        text: `Saved! ${result.needsPythonRestart || result.needsRRestart ? 'Engines restarting...' : ''}`,
                        type: 'success'
                    });
                    setTimeout(() => setPathMessage({ text: '', type: '' }), 4000);
                } else {
                    setPathMessage({ text: 'Error: ' + result.errors.join(', '), type: 'error' });
                }
            }
        } catch (e: any) {
            setPathMessage({ text: 'Failed to save: ' + e.message, type: 'error' });
        } finally {
            setSavingPaths(false);
        }
    };

    const checkRayStatus = async () => {
        setChecking(true);
        setStatusMessage('Checking Ray availability...');

        try {
            const api = (window as any).electronAPI;
            if (api?.executeShellCommand) {
                const result = await api.executeShellCommand('python3 -c "import ray; ray.init(ignore_reinit_error=True); import json; r=ray.cluster_resources(); print(json.dumps({\'cpu\': r.get(\'CPU\',0), \'memory\': r.get(\'memory\',0), \'object_store_memory\': r.get(\'object_store_memory\',0), \'nodes\': len(ray.nodes())}))"');

                if (result.status === 'success' && result.output) {
                    try {
                        const lines = result.output.trim().split('\n');
                        const jsonLine = lines.find((l: string) => l.startsWith('{'));
                        if (jsonLine) {
                            const resources = JSON.parse(jsonLine);
                            setRayAvailable(true);
                            setClusterResources(resources);
                            setStatusMessage('');
                        } else {
                            setRayAvailable(true);
                            setStatusMessage('');
                        }
                    } catch {
                        setRayAvailable(true);
                        setStatusMessage('');
                    }
                } else {
                    setRayAvailable(false);
                    setStatusMessage('Ray not installed');
                }
            } else {
                // No shell command API — can't check
                setRayAvailable(null);
                setStatusMessage('Cannot check — shell API unavailable');
            }
        } catch (e) {
            setRayAvailable(false);
            setStatusMessage('Ray not available');
        } finally {
            setChecking(false);
        }
    };

    const switchBackend = async (newBackend: Backend) => {
        if (newBackend === backend) return;
        if (newBackend === 'ray' && !rayAvailable) return;

        setSwitching(true);
        setStatusMessage(`Switching to ${newBackend === 'ray' ? 'Ray (Distributed)' : 'Local (Asyncio)'}...`);

        // Store preference
        localStorage.setItem('gardenia_backend', newBackend);
        setBackend(newBackend);

        // The backend is selected per-workflow execution via the payload.
        // The stored preference will be read by the workflow execution code.
        setTimeout(() => {
            setSwitching(false);
            setStatusMessage(`Backend changed to ${newBackend === 'ray' ? 'Ray' : 'Local'}. Applied on next workflow execution.`);
            setTimeout(() => setStatusMessage(''), 4000);
        }, 500);
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const gb = bytes / (1024 * 1024 * 1024);
        if (gb >= 1) return `${gb.toFixed(1)} GB`;
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(0)} MB`;
    };

    return (
        <div className="flex flex-col gap-5 h-full overflow-y-auto pr-1">

            {/* Environment Paths Selection */}
            <div>
                <h3 className="text-sm font-semibold text-[#ddd] mb-3 flex items-center gap-2">
                    <TerminalSquare size={14} className="text-indigo-400" />
                    Interpreter Paths
                </h3>

                <div className="flex flex-col gap-3 p-4 rounded-lg border border-[#333] bg-[#1a1a1e]">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-[#aaa] font-medium flex justify-between">
                            Python Executable
                            <span className="text-[10px] text-[#555]">Conda / Homebrew / Env</span>
                        </label>
                        <input
                            type="text"
                            value={pyPath}
                            onChange={(e) => setPyPath(e.target.value)}
                            placeholder="e.g. /opt/homebrew/bin/python3"
                            className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-xs text-[#ddd] focus:outline-none focus:border-indigo-500/50 transition-colors font-mono"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5 mt-1">
                        <label className="text-xs text-[#aaa] font-medium flex justify-between">
                            Rscript Executable
                        </label>
                        <input
                            type="text"
                            value={rPath}
                            onChange={(e) => setRPath(e.target.value)}
                            placeholder="e.g. /usr/local/bin/Rscript"
                            className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-xs text-[#ddd] focus:outline-none focus:border-indigo-500/50 transition-colors font-mono"
                        />
                    </div>

                    {pathMessage.text && (
                        <div className={`text-[10px] py-1.5 px-2 rounded border mt-1 ${pathMessage.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                                pathMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                    'bg-blue-500/10 border-blue-500/20 text-blue-400'
                            }`}>
                            {pathMessage.text}
                        </div>
                    )}

                    <div className="flex justify-end mt-2">
                        <button
                            onClick={handleSavePaths}
                            disabled={savingPaths}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded text-xs text-indigo-400 font-medium transition-colors disabled:opacity-50"
                        >
                            {savingPaths ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                            Apply & Restart
                        </button>
                    </div>
                </div>
            </div>

            {/* Backend Selection */}
            <div>
                <h3 className="text-sm font-semibold text-[#ddd] mb-3 flex items-center gap-2">
                    <Cpu size={14} className="text-emerald-400" />
                    Execution Backend
                </h3>

                <div className="grid grid-cols-2 gap-3">
                    {/* Local Backend Card */}
                    <button
                        onClick={() => switchBackend('local')}
                        disabled={switching}
                        className={`p-4 rounded-lg border text-left transition-all duration-200 ${backend === 'local'
                            ? 'border-emerald-500/60 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                            : 'border-[#333] bg-[#1a1a1e] hover:border-[#555] hover:bg-[#222]'
                            }`}
                    >
                        <div className="flex items-center gap-2.5 mb-2">
                            <div className={`w-8 h-8 rounded-md flex items-center justify-center ${backend === 'local' ? 'bg-emerald-500/20' : 'bg-[#2a2a2e]'
                                }`}>
                                <Monitor size={16} className={backend === 'local' ? 'text-emerald-400' : 'text-[#888]'} />
                            </div>
                            <div>
                                <div className="text-xs font-bold text-[#ddd]">Local</div>
                                <div className="text-[10px] text-[#777]">Asyncio</div>
                            </div>
                            {backend === 'local' && (
                                <CheckCircle2 size={14} className="text-emerald-400 ml-auto" />
                            )}
                        </div>
                        <p className="text-[10px] text-[#888] leading-relaxed">
                            Single-process async execution. Good for development and small workflows.
                        </p>
                    </button>

                    {/* Ray Backend Card */}
                    <button
                        onClick={() => switchBackend('ray')}
                        disabled={switching || !rayAvailable}
                        className={`p-4 rounded-lg border text-left transition-all duration-200 ${backend === 'ray'
                            ? 'border-blue-500/60 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                            : !rayAvailable
                                ? 'border-[#2a2a2e] bg-[#161618] opacity-60 cursor-not-allowed'
                                : 'border-[#333] bg-[#1a1a1e] hover:border-[#555] hover:bg-[#222]'
                            }`}
                    >
                        <div className="flex items-center gap-2.5 mb-2">
                            <div className={`w-8 h-8 rounded-md flex items-center justify-center ${backend === 'ray' ? 'bg-blue-500/20' : 'bg-[#2a2a2e]'
                                }`}>
                                <Globe size={16} className={backend === 'ray' ? 'text-blue-400' : 'text-[#888]'} />
                            </div>
                            <div>
                                <div className="text-xs font-bold text-[#ddd]">Ray</div>
                                <div className="text-[10px] text-[#777]">Distributed</div>
                            </div>
                            {backend === 'ray' && (
                                <CheckCircle2 size={14} className="text-blue-400 ml-auto" />
                            )}
                            {!rayAvailable && rayAvailable !== null && (
                                <XCircle size={14} className="text-red-400/60 ml-auto" />
                            )}
                        </div>
                        <p className="text-[10px] text-[#888] leading-relaxed">
                            Multi-process distributed execution. Scales to clusters for heavy workloads.
                        </p>
                        {!rayAvailable && rayAvailable !== null && (
                            <p className="text-[10px] text-red-400/70 mt-1.5">
                                pip install 'ray&gt;=2.9.0'
                            </p>
                        )}
                    </button>
                </div>

                {/* Status message */}
                {statusMessage && (
                    <div className="mt-2 px-3 py-1.5 rounded bg-[#1a1a1e] border border-[#2a2a2e] text-[10px] text-[#888] flex items-center gap-2">
                        {(checking || switching) && (
                            <RefreshCw size={10} className="animate-spin text-emerald-400" />
                        )}
                        {statusMessage}
                    </div>
                )}
            </div>

            {/* Cluster Resources */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-[#ddd] flex items-center gap-2">
                        <Server size={14} className="text-amber-400" />
                        Cluster Resources
                    </h3>
                    <button
                        onClick={checkRayStatus}
                        disabled={checking}
                        className="text-[10px] text-[#777] hover:text-[#ccc] transition-colors flex items-center gap-1"
                    >
                        <RefreshCw size={10} className={checking ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>

                {clusterResources ? (
                    <div className="grid grid-cols-2 gap-2">
                        <ResourceCard
                            icon={<Cpu size={14} />}
                            label="CPUs"
                            value={`${clusterResources.cpu}`}
                            sub="cores available"
                            color="emerald"
                        />
                        <ResourceCard
                            icon={<MemoryStick size={14} />}
                            label="Memory"
                            value={formatBytes(clusterResources.memory)}
                            sub="total RAM"
                            color="blue"
                        />
                        <ResourceCard
                            icon={<HardDrive size={14} />}
                            label="Object Store"
                            value={formatBytes(clusterResources.object_store_memory)}
                            sub="shared memory"
                            color="purple"
                        />
                        <ResourceCard
                            icon={<Activity size={14} />}
                            label="Nodes"
                            value={`${clusterResources.nodes}`}
                            sub={clusterResources.nodes === 1 ? 'local node' : 'cluster nodes'}
                            color="amber"
                        />
                    </div>
                ) : (
                    <div className="p-6 rounded-lg border border-[#2a2a2e] bg-[#161618] text-center">
                        {checking ? (
                            <div className="flex flex-col items-center gap-2">
                                <RefreshCw size={18} className="animate-spin text-[#555]" />
                                <span className="text-xs text-[#666]">Detecting resources...</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <AlertTriangle size={18} className="text-[#555]" />
                                <span className="text-xs text-[#666]">
                                    {rayAvailable === false
                                        ? 'Install Ray to view cluster resources'
                                        : 'Click Refresh to detect resources'}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Remote Cluster (Future) */}
            <div>
                <h3 className="text-sm font-semibold text-[#ddd] mb-3 flex items-center gap-2">
                    <Zap size={14} className="text-purple-400" />
                    Remote Cluster
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#333] text-[#888] font-normal ml-1">COMING SOON</span>
                </h3>

                <div className="p-4 rounded-lg border border-dashed border-[#2a2a2e] bg-[#161618]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                            <Server size={18} className="text-purple-400/50" />
                        </div>
                        <div className="flex-1">
                            <div className="text-xs text-[#999] mb-0.5">Connect to a Ray cluster</div>
                            <div className="text-[10px] text-[#666]">
                                Distribute workflows across multiple machines for massive parallelization.
                            </div>
                        </div>
                        <ChevronRight size={14} className="text-[#444]" />
                    </div>
                </div>
            </div>
        </div>
    );
}

// Sub-component for resource cards
function ResourceCard({
    icon, label, value, sub, color,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    sub: string;
    color: 'emerald' | 'blue' | 'purple' | 'amber';
}) {
    const colorMap = {
        emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
        blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
        purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
        amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
    };
    const c = colorMap[color];

    return (
        <div className={`p-3 rounded-lg border ${c.border} ${c.bg}`}>
            <div className={`flex items-center gap-1.5 mb-1.5 ${c.text}`}>
                {icon}
                <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
            </div>
            <div className="text-lg font-bold text-[#eee] leading-none">{value}</div>
            <div className="text-[10px] text-[#777] mt-0.5">{sub}</div>
        </div>
    );
}
