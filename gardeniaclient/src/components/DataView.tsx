/**
 * DataView Component
 * ==================
 * 
 * Pinterest-style grid displaying datasets created during workflow execution.
 * Shows preview, title, and metadata for each dataset.
 */

import { useWorkflowStore, Dataset } from '../stores/workflowStore';
import { Database, Table, FileSpreadsheet, BarChart3, Clock, HardDrive } from 'lucide-react';

interface DataCardProps {
    dataset: Dataset;
    onClick?: () => void;
}

const DataCard = ({ dataset, onClick }: DataCardProps) => {
    // Format file size
    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    // Format date
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div
            className="bg-[#1f1f23] rounded-xl overflow-hidden border border-[#2a2a2a] hover:border-[#444] transition-all cursor-pointer group hover:shadow-lg hover:shadow-black/20"
            onClick={onClick}
        >
            {/* Preview Area */}
            <div className="h-32 bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] flex items-center justify-center relative overflow-hidden group-hover:scale-[1.02] transition-transform duration-300">
                <div className="absolute inset-0 opacity-10 bg-[linear-gradient(45deg,#333_25%,transparent_25%,transparent_75%,#333_75%,#333),linear-gradient(45deg,#333_25%,transparent_25%,transparent_75%,#333_75%,#333)] bg-[length:16px_16px] bg-[position:0_0,8px_8px]" />

                {/* Table Preview Grid */}
                <div className="relative z-10 w-[85%] bg-[#18181b] rounded-md p-2 shadow-xl border border-[#333] overflow-hidden">
                    {dataset.preview && dataset.preview.length > 0 ? (
                        <div className="flex flex-col gap-0.5 w-full">
                            {/* Header */}
                            <div className="flex gap-1 mb-1 border-b border-[#333] pb-1">
                                {dataset.columns.slice(0, 4).map((col, i) => (
                                    <div key={i} className="flex-1 text-[6px] text-[#d97706] truncate font-medium text-center bg-[#2a2a2a]/50 rounded-[1px] px-0.5">
                                        {col.name}
                                    </div>
                                ))}
                            </div>
                            {/* Rows */}
                            {dataset.preview.slice(0, 5).map((row, r) => (
                                <div key={r} className="flex gap-1 items-center">
                                    {dataset.columns.slice(0, 4).map((col, c) => (
                                        <div key={c} className="flex-1 text-[5px] text-[#888] truncate h-2 bg-[#222] rounded-[1px] px-0.5 flex items-center">
                                            {String(row[col.name] ?? '')}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    ) : (
                        // Fallback Skeleton
                        <div className="w-full">
                            <div className="flex gap-1 mb-1">
                                {dataset.columns.slice(0, 4).map((col, i) => (
                                    <div key={i} className="flex-1 h-3 bg-[#d97706]/20 rounded-[2px] text-[6px] text-[#d97706] flex items-center justify-center truncate px-0.5">
                                        {col.name.slice(0, 6)}
                                    </div>
                                ))}
                                {dataset.columns.length > 4 && (
                                    <div className="w-6 h-3 bg-[#333] rounded-[2px] text-[6px] text-[#666] flex items-center justify-center">
                                        +{dataset.columns.length - 4}
                                    </div>
                                )}
                            </div>
                            {[0, 1, 2].map(row => (
                                <div key={row} className="flex gap-1 mb-0.5">
                                    {dataset.columns.slice(0, 4).map((_, i) => (
                                        <div key={i} className="flex-1 h-2 bg-[#2a2a2a] rounded-[1px]" />
                                    ))}
                                    {dataset.columns.length > 4 && <div className="w-6" />}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Icon Badge */}
                <div className="absolute top-2 right-2 w-7 h-7 bg-[#d97706] rounded-md flex items-center justify-center shadow-lg opacity-80 group-hover:opacity-100 transition-opacity">
                    <Table className="w-3.5 h-3.5 text-black" />
                </div>
            </div>

            {/* Content */}
            <div className="p-3 border-t border-[#2a2a2a]">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm text-gray-200 truncate group-hover:text-[#d97706] transition-colors max-w-[70%]">
                        {dataset.name}
                    </h3>
                    <span className="text-[10px] text-[#666] bg-[#252525] px-1.5 py-0.5 rounded">
                        {dataset.path.split('.').pop()?.toUpperCase()}
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="flex items-center gap-1.5 text-[10px] text-[#999] bg-[#252525] px-2 py-1 rounded">
                        <BarChart3 className="w-3 h-3 text-[#d97706]" />
                        {dataset.num_rows.toLocaleString()} rows
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-[#999] bg-[#252525] px-2 py-1 rounded">
                        <Database className="w-3 h-3 text-[#d97706]" />
                        {dataset.num_columns} cols
                    </div>
                </div>

                <div className="flex items-center justify-between text-[9px] text-[#555] border-t border-[#2a2a2a] pt-2 mt-2">
                    <div className="flex items-center gap-1">
                        <HardDrive className="w-3 h-3" />
                        {formatSize(dataset.size_bytes)}
                    </div>
                    <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(dataset.created_at)}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Empty state component
const EmptyState = () => (
    <div className="flex-1 flex flex-col items-center justify-center text-[#444] gap-4">
        <div className="w-20 h-20 rounded-2xl bg-[#1f1f23] flex items-center justify-center">
            <FileSpreadsheet className="w-10 h-10 text-[#333]" />
        </div>
        <div className="text-center">
            <p className="text-sm font-medium text-[#555]">No datasets yet</p>
            <p className="text-xs text-[#444] mt-1">Run a workflow to create datasets</p>
        </div>
    </div>
);

import { useState } from 'react';
import { DatasetPreviewModal } from './DatasetPreviewModal';
import { Trash2 } from 'lucide-react';

export const DataView = () => {
    const datasets = useWorkflowStore((state) => state.datasets);
    const setDatasets = useWorkflowStore((state) => state.setDatasets);
    const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
    const [clearing, setClearing] = useState(false);
    const [activeFilter, setActiveFilter] = useState<string>('all');

    // Debug logging
    console.log('DataView datasets:', datasets);

    const handleClearAll = async () => {
        if (!confirm('Are you sure you want to delete ALL datasets? This cannot be undone.')) return;

        setClearing(true);
        try {
            // @ts-ignore
            await window.electronAPI.clearDatasets();
            // Refresh list (should be empty)
            // @ts-ignore
            const result = await window.electronAPI.getWorkflowDatasets();
            if (result.status === 'success') {
                setDatasets(result.datasets);
            }
        } catch (error) {
            console.error('Failed to clear datasets:', error);
        } finally {
            setClearing(false);
        }
    };

    // Filter logic
    const filteredDatasets = datasets.filter((dataset) => {
        if (activeFilter === 'all') return true;
        if (activeFilter === 'large') return dataset.size_bytes > 1024 * 1024; // > 1MB
        if (activeFilter === 'today') {
            const today = new Date().toDateString();
            const dsDate = new Date(dataset.created_at).toDateString();
            return today === dsDate;
        }
        if (activeFilter === 'wide') return dataset.num_columns > 10;
        return true;
    });

    if (datasets.length === 0) {
        return <EmptyState />;
    }

    return (
        <div className="flex-1 overflow-auto p-4 bg-[#121212]">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-lg font-bold text-[#e5e5e5] tracking-tight">
                        My Datasets
                    </h2>
                    <p className="text-xs text-[#666] mt-0.5">
                        {datasets.length} datasets available
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleClearAll}
                        disabled={clearing}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[#2a2a2a] hover:bg-red-900/30 text-xs font-medium text-gray-400 hover:text-red-400 border border-[#333] hover:border-red-900/50 rounded-lg transition-all disabled:opacity-50"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        {clearing ? 'Clearing...' : 'Clear All'}
                    </button>
                </div>
            </div>

            {/* Quick Filters */}
            <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
                {[
                    { id: 'all', label: 'All Datasets' },
                    { id: 'today', label: 'Created Today' },
                    { id: 'large', label: 'Large (>1MB)' },
                    { id: 'wide', label: 'Wide (>10 cols)' },
                ].map(filter => (
                    <button
                        key={filter.id}
                        onClick={() => setActiveFilter(filter.id)}
                        className={`px-3 py-1 text-xs rounded-full border transition-colors whitespace-nowrap ${activeFilter === filter.id
                                ? 'bg-emerald-900/30 text-emerald-400 border-emerald-900/50'
                                : 'bg-[#1f1f23] text-[#888] border-[#333] hover:bg-[#2a2a2e] hover:text-[#ccc]'
                            }`}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            {/* Pinterest Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-8">
                {filteredDatasets.length > 0 ? (
                    filteredDatasets.map((dataset, index) => (
                        <DataCard
                            key={dataset.path || index}
                            dataset={dataset}
                            onClick={() => setSelectedDataset(dataset)}
                        />
                    ))
                ) : (
                    <div className="col-span-full py-10 text-center text-[#666] text-sm">
                        No datasets match this filter.
                    </div>
                )}
            </div>

            {/* Preview Modal */}
            <DatasetPreviewModal
                dataset={selectedDataset}
                onClose={() => setSelectedDataset(null)}
            />
        </div>
    );
};
