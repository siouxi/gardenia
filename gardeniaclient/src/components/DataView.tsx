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
            <div className="h-32 bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[linear-gradient(45deg,#333_25%,transparent_25%,transparent_75%,#333_75%,#333),linear-gradient(45deg,#333_25%,transparent_25%,transparent_75%,#333_75%,#333)] bg-[length:16px_16px] bg-[position:0_0,8px_8px]" />

                {/* Table Preview Grid */}
                <div className="relative z-10 w-3/4 bg-[#18181b] rounded-md p-2 shadow-md">
                    <div className="flex gap-1 mb-1">
                        {dataset.columns.slice(0, 4).map((col, i) => (
                            <div key={i} className="flex-1 h-3 bg-[#d97706]/30 rounded-[2px] text-[6px] text-[#d97706] flex items-center justify-center truncate px-0.5">
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

                {/* Icon Badge */}
                <div className="absolute top-2 right-2 w-8 h-8 bg-[#d97706] rounded-lg flex items-center justify-center shadow-lg">
                    <Table className="w-4 h-4 text-black" />
                </div>
            </div>

            {/* Content */}
            <div className="p-3">
                <h3 className="font-semibold text-sm text-white truncate group-hover:text-[#d97706] transition-colors">
                    {dataset.name}
                </h3>

                <div className="mt-2 flex flex-wrap gap-2">
                    <div className="flex items-center gap-1 text-[10px] text-[#888] bg-[#2a2a2a] px-2 py-0.5 rounded-full">
                        <BarChart3 className="w-3 h-3" />
                        {dataset.num_rows.toLocaleString()} rows
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-[#888] bg-[#2a2a2a] px-2 py-0.5 rounded-full">
                        <Database className="w-3 h-3" />
                        {dataset.num_columns} cols
                    </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-[9px] text-[#555]">
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

export const DataView = () => {
    const datasets = useWorkflowStore((state) => state.datasets);

    if (datasets.length === 0) {
        return <EmptyState />;
    }

    return (
        <div className="flex-1 overflow-auto p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[#888]">
                    DATASETS <span className="text-[#555] font-normal">({datasets.length})</span>
                </h2>
            </div>

            {/* Pinterest Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {datasets.map((dataset, index) => (
                    <DataCard
                        key={dataset.path || index}
                        dataset={dataset}
                        onClick={() => {
                            // TODO: Open dataset detail view
                            console.log('Open dataset:', dataset.name);
                        }}
                    />
                ))}
            </div>
        </div>
    );
};
