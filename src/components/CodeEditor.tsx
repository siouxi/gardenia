import { NodeData } from '../App';
import { Code } from 'lucide-react';

interface CodeEditorProps {
    node: { id: string; data: NodeData } | null;
    onUpdate: (nodeId: string, data: NodeData) => void;
}

export const CodeEditor = ({ node, onUpdate }: CodeEditorProps) => {
    if (!node) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-[#666] p-8 text-center bg-[#121212]">
                <Code size={48} className="mb-4 opacity-50" />
                <span className="text-sm font-medium">Select a node to edit its code</span>
                <span className="text-xs mt-2 text-[#444]">Double-click a node in the workflow view</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] border-l border-[#000]">
            <div className="h-9 flex shrink-0 items-center px-4 justify-between border-b border-[#121212] bg-[#1f1f23]">
                <div className="flex items-center gap-2">
                    <Code size={14} className="text-[#34d399]" />
                    <span className="text-xs font-bold text-[#e1e1e1] uppercase tracking-wide">
                        {node.data.label}
                    </span>
                    <span className="text-[10px] text-[#555] font-mono ml-2">
                        {node.id}
                    </span>
                </div>
                <div className="text-[10px] text-[#666]">
                    Python Script
                </div>
            </div>
            <div className="flex-1 relative bg-[#121212]">
                <textarea
                    className="w-full h-full bg-[#121212] text-[#d4d4d4] font-mono text-sm p-6 outline-none resize-none leading-relaxed border-none focus:ring-0"
                    spellCheck={false}
                    value={node.data.code || ''}
                    onChange={(e) => onUpdate(node.id, { ...node.data, code: e.target.value })}
                    placeholder="# Start typing your Python code here..."
                />
            </div>
        </div>
    );
};
