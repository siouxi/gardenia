import React, { useEffect, useRef } from 'react';

interface NodeContextMenuProps {
    nodeId: string;
    nodeLabel: string;
    x: number;
    y: number;
    selectedCount: number;
    onRunFrom: (nodeId: string) => void;
    onRunOnly: (nodeId: string) => void;
    onDelete: (nodeId: string) => void;
    onGroup?: () => void;
    onUngroup?: (nodeId: string) => void;
    isGrouped?: boolean;
    onClose: () => void;
}

export const NodeContextMenu: React.FC<NodeContextMenuProps> = ({
    nodeId,
    nodeLabel,
    x,
    y,
    selectedCount,
    onRunFrom,
    onRunOnly,
    onDelete,
    onGroup,
    onUngroup,
    isGrouped,
    onClose,
}) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
        }, 50);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    const adjustedX = Math.min(x, window.innerWidth - 220);
    const adjustedY = Math.min(y, window.innerHeight - 260);

    return (
        <div
            ref={menuRef}
            className="fixed z-[100] min-w-[200px] bg-[#2a2a2e] border border-[#444] rounded-lg shadow-2xl py-1.5 select-none"
            style={{ left: adjustedX, top: adjustedY }}
        >
            {/* Header */}
            <div className="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-[#333] mb-1">
                {selectedCount > 1 ? `${selectedCount} nodes selected` : nodeLabel}
            </div>

            {/* Run from here */}
            <button
                className="w-full px-3 py-2 text-xs text-left hover:bg-[#3e3e42] flex items-center gap-2.5 text-gray-200 transition-colors"
                onClick={() => { onRunFrom(nodeId); onClose(); }}
            >
                <span className="text-emerald-400 text-sm">▶</span>
                Run from here
                <span className="ml-auto text-[10px] text-gray-500">downstream</span>
            </button>

            {/* Run only this */}
            <button
                className="w-full px-3 py-2 text-xs text-left hover:bg-[#3e3e42] flex items-center gap-2.5 text-gray-200 transition-colors"
                onClick={() => { onRunOnly(nodeId); onClose(); }}
            >
                <span className="text-amber-400 text-sm">⚡</span>
                Run only this node
                <span className="ml-auto text-[10px] text-gray-500">single</span>
            </button>

            {/* Group/Ungroup */}
            {selectedCount > 1 && onGroup && (
                <>
                    <div className="h-px bg-[#444] my-1.5" />
                    <button
                        className="w-full px-3 py-2 text-xs text-left hover:bg-[#3e3e42] flex items-center gap-2.5 text-blue-300 transition-colors"
                        onClick={() => { onGroup(); onClose(); }}
                    >
                        <span className="text-sm">📦</span>
                        Group selected nodes
                        <span className="ml-auto text-[10px] text-gray-500">{selectedCount}</span>
                    </button>
                </>
            )}
            {isGrouped && onUngroup && (
                <>
                    <div className="h-px bg-[#444] my-1.5" />
                    <button
                        className="w-full px-3 py-2 text-xs text-left hover:bg-[#3e3e42] flex items-center gap-2.5 text-blue-300 transition-colors"
                        onClick={() => { onUngroup(nodeId); onClose(); }}
                    >
                        <span className="text-sm">📤</span>
                        Ungroup nodes
                    </button>
                </>
            )}

            {/* Divider */}
            <div className="h-px bg-[#444] my-1.5" />

            {/* Delete */}
            <button
                className="w-full px-3 py-2 text-xs text-left hover:bg-red-900/30 flex items-center gap-2.5 text-red-400 transition-colors"
                onClick={() => { onDelete(nodeId); onClose(); }}
            >
                <span className="text-sm">✂</span>
                {selectedCount > 1 ? `Delete ${selectedCount} nodes` : 'Delete node'}
            </button>
        </div>
    );
};
