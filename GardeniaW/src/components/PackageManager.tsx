import React, { useState, useEffect } from 'react';
import { Trash2, RefreshCw, Send, Terminal, Plus, X } from 'lucide-react';
import * as path from 'path-browserify'; // We need browser compatible path join

interface InstalledPackage {
    Package: string; // R
    Version: string;
    name?: string; // Python
    version?: string; // Python
    [key: string]: any;
}

interface CondaEnv {
    name: string;
    path: string;
}

export const PackageManager: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'python' | 'r'>('python');
    const [packages, setPackages] = useState<InstalledPackage[]>([]);
    const [envs, setEnvs] = useState<CondaEnv[]>([]);
    const [currentEnv, setCurrentEnv] = useState<string>(''); // Path
    const [searchQuery, setSearchQuery] = useState('');
    const [installName, setInstallName] = useState('');
    const [isCreatingEnv, setIsCreatingEnv] = useState(false);
    const [newEnvName, setNewEnvName] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string>('');
    const [consoleOutput, setConsoleOutput] = useState<string>('');

    const fetchEnvs = async () => {
        try {
            const envList = await (window as any).electronAPI.listCondaEnvs();
            setEnvs(envList);
            const current = await (window as any).electronAPI.getPythonEnv();
            // If current matches one of our envs, select it
            // If it's a raw path (like 'python3'), show it or handle it?
            // Conda list returns full paths, so we should try to match.
            // If no match (default 'python3'), maybe we can't select in dropdown easily?
            // Let's assume user starts fresh or we default to finding one.
            setCurrentEnv(current);
        } catch (e) {
            console.error("Failed to fetch envs", e);
        }
    };

    const fetchPackages = async () => {
        setLoading(true);
        setStatus('Fetching packages...');
        try {
            let result;
            if (activeTab === 'python') {
                result = await (window as any).electronAPI.listPythonPackages();
                // Normalize Python pip JSON output
                // Pip returns [{ "name": "pkg", "version": "1.0" }]
                setPackages(result.map((p: any) => ({ Package: p.name, Version: p.version })));
            } else {
                result = await (window as any).electronAPI.listRPackages();
                // R returns [{ "Package": "pkg", "Version": "1.0" }]
                setPackages(result);
            }
            setStatus('');
        } catch (error) {
            console.error(error);
            setStatus('Failed to list packages.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'python') {
            fetchEnvs();
        }
        fetchPackages();
    }, [activeTab]);

    const handleEnvChange = async (newPath: string) => {
        setCurrentEnv(newPath);
        await (window as any).electronAPI.setPythonEnv(newPath);
        fetchPackages(); // Reload packages for new env
    };

    const handleCreateEnv = async () => {
        if (!newEnvName.trim()) return;
        setLoading(true);
        setStatus(`Creating environment '${newEnvName}'... This may take a few minutes.`);
        setConsoleOutput(''); // Clear old output

        try {
            const result = await (window as any).electronAPI.createCondaEnv(newEnvName);
            setConsoleOutput(result.output || '');

            if (result.success) {
                setStatus(`Environment '${newEnvName}' created successfully.`);
                setNewEnvName('');
                setIsCreatingEnv(false);
                await fetchEnvs(); // Refresh list to see new env
            } else {
                setStatus(`Failed to create environment '${newEnvName}'. See logs.`);
            }
        } catch (e) {
            setStatus(`Error creating environment: ${e}`);
        } finally {
            setLoading(false);
        }
    };

    const handleInstall = async () => {
        if (!installName) return;
        setLoading(true);
        setStatus(`Installing ${installName}...`);
        setConsoleOutput('');

        try {
            let result;
            if (activeTab === 'python') {
                result = await (window as any).electronAPI.installPythonPackage(installName);
            } else {
                result = await (window as any).electronAPI.installRPackage(installName);
            }

            setConsoleOutput(result.output || '');

            if (result.success) {
                setStatus(`Successfully installed ${installName}`);
                setInstallName('');
                fetchPackages();
            } else {
                setStatus(`Failed to install ${installName}`);
            }
        } catch (error) {
            setStatus(`Error installing ${installName}: ${error}`);
        } finally {
            setLoading(false);
        }
    };

    const handleUninstall = async (name: string) => {
        if (!window.confirm(`Are you sure you want to uninstall ${name}?`)) return;

        setLoading(true);
        setStatus(`Uninstalling ${name}...`);
        setConsoleOutput('');

        try {
            let result;
            if (activeTab === 'python') {
                result = await (window as any).electronAPI.uninstallPythonPackage(name);
            } else {
                result = await (window as any).electronAPI.uninstallRPackage(name);
            }

            setConsoleOutput(result.output || '');

            if (result.success) {
                setStatus(`Successfully uninstalled ${name}`);
                fetchPackages();
            } else {
                setStatus(`Failed to uninstall ${name}`);
            }
        } catch (error) {
            setStatus(`Error uninstalling ${name}: ${error}`);
        } finally {
            setLoading(false);
        }
    };

    const filteredPackages = packages.filter(p =>
        p.Package.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] text-[#ccc] rounded-md overflow-hidden">
            {/* Header / Tabs */}
            <div className="flex items-center gap-1 p-2 border-b border-[#333] bg-[#252526]">
                <button
                    onClick={() => setActiveTab('python')}
                    className={`px-4 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-2 ${activeTab === 'python' ? 'bg-[#37373d] text-white' : 'hover:bg-[#2a2a2d] text-[#888]'}`}
                >
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    Python (Conda)
                </button>
                <button
                    onClick={() => setActiveTab('r')}
                    className={`px-4 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-2 ${activeTab === 'r' ? 'bg-[#37373d] text-white' : 'hover:bg-[#2a2a2d] text-[#888]'}`}
                >
                    <span className="w-2 h-2 rounded-full bg-blue-300"></span>
                    R System
                </button>
                <div className="flex-1" />
                <button
                    onClick={fetchPackages}
                    disabled={loading}
                    className="p-1.5 hover:bg-[#333] rounded text-[#888] hover:text-[#ccc] transition-colors"
                    title="Refresh List"
                >
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {/* Environment Selector (Python Only) */}
            {activeTab === 'python' && (
                <div className="flex items-center gap-2 p-2 bg-[#1a1a1a] border-b border-[#333]">
                    <span className="text-xs text-[#888] font-medium uppercase tracking-wide">Environment:</span>
                    <select
                        value={currentEnv}
                        onChange={(e) => handleEnvChange(e.target.value)}
                        className="bg-[#111] text-[#ccc] border border-[#333] rounded px-2 py-1 text-xs outline-none focus:border-[#007fd4] flex-1 max-w-[300px]"
                    >
                        {/* Always offer 'System' or current default if it's not in the list */}
                        <option value="python3">System (Default)</option>
                        {envs.map((env) => (
                            <option key={env.path} value={path.join(env.path, 'bin', 'python3')}>
                                {env.name} ({env.path})
                            </option>
                        ))}
                    </select>

                    {/* Create New Env UI */}
                    {isCreatingEnv ? (
                        <div className="flex items-center gap-2 bg-[#252526] p-1 rounded border border-[#007fd4] animate-in fade-in slide-in-from-left-2">
                            <input
                                type="text"
                                placeholder="Env Name"
                                value={newEnvName}
                                onChange={e => setNewEnvName(e.target.value)}
                                className="bg-[#111] text-xs px-2 py-0.5 rounded outline-none w-24 border border-[#444]"
                                autoFocus
                                onKeyDown={e => {
                                    if (e.key === 'Enter') handleCreateEnv();
                                    if (e.key === 'Escape') setIsCreatingEnv(false);
                                }}
                            />
                            <button onClick={handleCreateEnv} disabled={loading} className="text-green-400 hover:text-green-300"><Plus size={14} /></button>
                            <button onClick={() => setIsCreatingEnv(false)} className="text-red-400 hover:text-red-300"><X size={14} /></button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsCreatingEnv(true)}
                            className="p-1 hover:bg-[#333] rounded text-[#888] hover:text-[#ccc]"
                            title="Create New Conda Environment"
                        >
                            <Plus size={14} />
                        </button>
                    )}
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Package List */}
                <div className="flex-1 flex flex-col border-r border-[#333] w-2/3">
                    {/* Search Bar */}
                    <div className="p-2 border-b border-[#333]">
                        <input
                            type="text"
                            placeholder="Search installed packages..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#111] text-[#ccc] px-3 py-1.5 text-xs rounded border border-[#333] focus:border-[#007fd4] outline-none"
                        />
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-[#252526] sticky top-0">
                                <tr>
                                    <th className="p-2 font-medium text-[#888] border-b border-[#333]">Package</th>
                                    <th className="p-2 font-medium text-[#888] border-b border-[#333]">Version</th>
                                    <th className="p-2 font-medium text-[#888] border-b border-[#333] text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPackages.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="p-8 text-center text-[#555] italic">
                                            {loading ? 'Loading...' : 'No packages found.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredPackages.map((pkg) => (
                                        <tr key={pkg.Package} className="border-b border-[#2a2a2a] hover:bg-[#2a2d2e] group">
                                            <td className="p-2 font-medium text-[#ddd]">{pkg.Package}</td>
                                            <td className="p-2 text-[#888] font-mono">{pkg.Version}</td>
                                            <td className="p-2 text-right">
                                                <button
                                                    onClick={() => handleUninstall(pkg.Package)}
                                                    className="p-1 text-[#666] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title="Uninstall"
                                                    disabled={loading}
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right: Install & Status */}
                <div className="w-1/3 flex flex-col bg-[#1e1e1e]">
                    <div className="p-4 border-b border-[#333]">
                        <h3 className="text-xs font-bold text-[#888] mb-2 uppercase tracking-wider">Install New Package</h3>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={installName}
                                onChange={(e) => setInstallName(e.target.value)}
                                placeholder="Package name..."
                                className="flex-1 bg-[#111] text-[#ccc] px-3 py-1.5 text-xs rounded border border-[#333] focus:border-[#007fd4] outline-none"
                                onKeyDown={(e) => e.key === 'Enter' && handleInstall()}
                            />
                            <button
                                onClick={handleInstall}
                                disabled={loading || !installName}
                                className="bg-[#007fd4] hover:bg-[#0060a0] disabled:opacity-50 disabled:cursor-not-allowed text-white p-1.5 rounded flex items-center justify-center transition-colors px-3"
                            >
                                <Send size={14} />
                            </button>
                        </div>
                        <p className="text-[10px] text-[#666]">
                            Installing via {activeTab === 'python' ? 'conda install' : 'install.packages()'}
                        </p>
                    </div>

                    <div className="flex-1 flex flex-col p-2 overflow-hidden bg-[#111]">
                        <div className="flex items-center gap-2 mb-2">
                            <Terminal size={12} className="text-[#888]" />
                            <span className="text-[10px] font-bold text-[#888]">OUTPUT</span>
                        </div>
                        <div className="flex-1 overflow-auto p-2 bg-[#000] rounded border border-[#333] text-[10px] font-mono whitespace-pre-wrap text-[#aaa]">
                            {status && <div className="text-blue-400 mb-2">-- {status}</div>}
                            {consoleOutput}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
