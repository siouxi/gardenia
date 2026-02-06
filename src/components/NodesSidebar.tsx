import { Search, FileCode } from 'lucide-react';
import { useState } from 'react';
import { AppNode } from '../App';

interface NodesSidebarProps {
    nodes: AppNode[];
    onNodeSelect: (nodeId: string) => void;
    selectedNodeId: string | null;
}

export const NodesSidebar = ({ nodes, onNodeSelect, selectedNodeId }: NodesSidebarProps) => {
    const [searchTerm, setSearchTerm] = useState('');

    // Filter nodes to show only code-editable ones (exclude Start, End, Post-it)
    const codeNodes = nodes.filter(node =>
        node.type !== 'postit' &&
        node.data.toolId !== 'flow-start' &&
        node.data.toolId !== 'flow-end'
    );

    // Filter by search term
    const filteredNodes = codeNodes.filter(node =>
        (node.data.label || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex-1 overflow-y-auto bg-[#1f1f23] flex flex-col">
            {/* Search Bar */}
            <div className="p-3 border-b border-[#121212]">
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-[#666]" size={14} />
                    <input
                        type="text"
                        placeholder="Search nodes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-[#121212] border border-[#333] rounded-[2px] pl-8 pr-2 py-1.5 text-xs text-[#ccc] placeholder-[#666] focus:border-[#34d399] focus:outline-none transition-colors"
                    />
                </div>
            </div>

            {/* Nodes List */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-2 space-y-1">
                    {filteredNodes.length === 0 ? (
                        <div className="text-center text-[#666] text-xs py-4 italic">
                            {nodes.length === 0 ? "No nodes on canvas" : "No editable nodes found"}
                        </div>
                    ) : (
                        filteredNodes.map(node => (
                            <div
                                key={node.id}
                                onClick={() => onNodeSelect(node.id)}
                                className={`group flex items-center gap-3 px-3 py-2 rounded-[2px] cursor-pointer transition-colors border border-transparent
                                    ${selectedNodeId === node.id
                                        ? 'bg-[#2a2a2a] border-[#34d399]/30'
                                        : 'hover:bg-[#2a2a2a] hover:border-[#333]'
                                    }
                                `}
                            >
                                <div className={`
                                    w-8 h-8 rounded border flex items-center justify-center font-mono text-[10px] transition-all
                                    ${selectedNodeId === node.id
                                        ? 'bg-[#34d399]/10 border-[#34d399] text-[#34d399]'
                                        : 'bg-[#18181b] border-[#2a2a2a] text-[#666] group-hover:text-[#34d399] group-hover:border-[#34d399]/50'
                                    }
                                `}>
                                    <FileCode size={14} />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className={`text-[12px] font-medium leading-none truncate
                                        ${selectedNodeId === node.id ? 'text-white' : 'text-[#ccc] group-hover:text-white'}
                                    `}>
                                        {node.data.label}
                                    </span>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[9px] px-1 rounded-[2px] font-bold
                                            ${node.data.language === 'r'
                                                ? 'bg-[#1e3a8a] text-blue-200'
                                                : 'bg-[#3f3f46] text-yellow-200'
                                            }
                                        `}>
                                            {node.data.language === 'r' ? 'R' : 'PY'}
                                        </span>
                                        <span className="text-[10px] text-[#555] truncate max-w-[80px]">
                                            {node.id}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
