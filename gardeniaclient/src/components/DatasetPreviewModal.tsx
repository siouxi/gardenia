import { useState, useEffect } from 'react';
import { X, Database, BarChart3, Clock, HardDrive, FileSpreadsheet } from 'lucide-react';
import { Dataset } from '../stores/workflowStore';

interface DatasetPreviewModalProps {
    dataset: Dataset | null;
    onClose: () => void;
}

interface PreviewData {
    columns: string[];
    rows: any[];
    stats?: Record<string, any>;
}

export const DatasetPreviewModal = ({ dataset, onClose }: DatasetPreviewModalProps) => {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<PreviewData | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (dataset) {
            loadPreview();
        } else {
            setData(null);
            setError(null);
        }
    }, [dataset]);

    // Close on escape key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    const loadPreview = async () => {
        if (!dataset) return;
        setLoading(true);
        setError(null);
        try {
            // @ts-ignore - electronAPI is exposed in preload
            const result = await window.electronAPI.previewDataset(dataset.name);

            if (result.status === 'success' && result.preview) {
                setData({
                    columns: result.preview.columns || [],
                    rows: result.preview.rows || [],
                    stats: result.preview.stats
                });
            } else {
                setError(result.error || 'Failed to load dataset preview');
            }
        } catch (err) {
            setError('Error communicating with backend');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (!dataset) return null;

    // Formatting helpers
    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                className="bg-[#18181b] border border-[#333] w-full max-w-[95vw] h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#333] bg-[#1f1f23]">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#d97706]/20 flex items-center justify-center">
                            <FileSpreadsheet className="w-5 h-5 text-[#d97706]" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-100">{dataset.name}</h2>
                            <p className="text-xs text-gray-500 font-mono">{dataset.path}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-[#333] rounded-lg transition-colors text-gray-400 hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Main Logic */}
                    <div className="flex-1 flex flex-col min-w-0">
                        {loading ? (
                            <div className="flex-1 flex items-center justify-center flex-col gap-3">
                                <div className="w-8 h-8 border-2 border-[#d97706] border-t-transparent rounded-full animate-spin" />
                                <p className="text-sm text-gray-500">Loading preview...</p>
                            </div>
                        ) : error ? (
                            <div className="flex-1 flex items-center justify-center text-red-400 gap-2">
                                <span>⚠️</span>
                                <p>{error}</p>
                            </div>
                        ) : data ? (
                            <div className="flex-1 overflow-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-[#252525] z-10 shadow-sm">
                                        <tr>
                                            <th className="w-12 px-4 py-2 text-xs font-medium text-gray-500 border-b border-[#333] bg-[#252525]">#</th>
                                            {data.columns.map(col => (
                                                <th key={col} className="px-4 py-2 text-xs font-semibold text-gray-300 border-b border-[#333] whitespace-nowrap min-w-[100px]">
                                                    {col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#2a2a2a]">
                                        {data.rows.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-[#2a2a2a]/50 transition-colors">
                                                <td className="px-4 py-2 text-xs text-gray-600 font-mono border-r border-[#2a2a2a]">{idx + 1}</td>
                                                {data.columns.map(col => (
                                                    <td key={`${idx}-${col}`} className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap max-w-[300px] truncate">
                                                        {row[col] !== null ? String(row[col]) : <span className="text-gray-700 italic">null</span>}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {data.rows.length === 0 && (
                                    <div className="p-8 text-center text-gray-500 text-sm">
                                        Empty dataset
                                    </div>
                                )}
                            </div>
                        ) : null}

                        {/* Footer */}
                        <div className="px-4 py-2 border-t border-[#333] bg-[#1f1f23] text-xs text-gray-500 flex justify-between">
                            <span>Showing first {data?.rows.length || 0} rows</span>
                            {/* Pagination controls could go here */}
                        </div>
                    </div>

                    {/* Sidebar Metadata */}
                    <div className="w-64 bg-[#1f1f23] border-l border-[#333] p-6 flex flex-col gap-6 overflow-y-auto">
                        <div>
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Metadata</h3>
                            <div className="space-y-3">
                                <div className="flex items-center gap-3 text-sm text-gray-300">
                                    <div className="w-8 h-8 rounded bg-[#2a2a2a] flex items-center justify-center text-[#d97706]">
                                        <BarChart3 className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="font-medium">{dataset.num_rows.toLocaleString()}</p>
                                        <p className="text-xs text-gray-500">Rows</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-300">
                                    <div className="w-8 h-8 rounded bg-[#2a2a2a] flex items-center justify-center text-[#d97706]">
                                        <Database className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="font-medium">{dataset.num_columns}</p>
                                        <p className="text-xs text-gray-500">Columns</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-300">
                                    <div className="w-8 h-8 rounded bg-[#2a2a2a] flex items-center justify-center text-[#d97706]">
                                        <HardDrive className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="font-medium">{formatSize(dataset.size_bytes)}</p>
                                        <p className="text-xs text-gray-500">Size</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-300">
                                    <div className="w-8 h-8 rounded bg-[#2a2a2a] flex items-center justify-center text-[#d97706]">
                                        <Clock className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="font-medium">{formatDate(dataset.created_at)}</p>
                                        <p className="text-xs text-gray-500">Created</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {data?.stats && (
                            <div>
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Statistics</h3>
                                <div className="text-xs text-gray-400 bg-[#252525] p-3 rounded-lg font-mono whitespace-pre-wrap overflow-auto max-h-40">
                                    {JSON.stringify(data.stats, null, 2)}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
