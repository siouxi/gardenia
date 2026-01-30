import { ToolParameter } from '../types/ToolDefinition';
import { Settings, Sliders, FileText, Type, Hash, List } from 'lucide-react';
import { useState } from 'react';

interface InspectorProps {
    node: any; // Using any for now to avoid circular deps, but technically AppNode
    onUpdate: (nodeId: string, data: any) => void;
}

export const Inspector = ({ node, onUpdate }: InspectorProps) => {
    const [activeTab, setActiveTab] = useState<'inspector' | 'agent'>('inspector');
    const [chatInput, setChatInput] = useState('');
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([
        { role: 'assistant', content: 'Hello! I am Carmilla, your assistant. How can I help you with your workflow today?' }
    ]);

    const handleSendMessage = () => {
        if (!chatInput.trim()) return;
        setMessages([...messages, { role: 'user', content: chatInput }]);
        setChatInput('');
        // Mock response for now
        setTimeout(() => {
            setMessages(prev => [...prev, { role: 'assistant', content: 'I am a UI demo for now. Logic coming soon!' }]);
        }, 1000);
    };

    return (
        <div className="w-full flex flex-col border-l border-[#000] bg-[#1f1f23] h-full">
            {/* Tabs Header */}
            <div className="h-9 bg-[#2a2a2a] flex items-center border-b border-[#121212] select-none">
                <button
                    onClick={() => setActiveTab('inspector')}
                    className={`flex-1 h-full text-[10px] font-bold uppercase tracking-wide flex items-center justify-center transition-colors ${activeTab === 'inspector' ? 'bg-[#1f1f23] text-[#ddd] border-t-2 border-t-[#d97706]' : 'text-[#666] hover:bg-[#252529] hover:text-[#999]'}`}
                >
                    Inspector
                </button>
                <div className="w-[1px] h-4 bg-[#111]" />
                <button
                    onClick={() => setActiveTab('agent')}
                    className={`flex-1 h-full text-[10px] font-bold uppercase tracking-wide flex items-center justify-center transition-colors ${activeTab === 'agent' ? 'bg-[#1f1f23] text-[#ddd] border-t-2 border-t-[#3b82f6]' : 'text-[#666] hover:bg-[#252529] hover:text-[#999]'}`}
                >
                    Carmilla
                </button>
            </div>

            <div className="flex-1 overflow-hidden relative flex flex-col">
                {/* INSPECTOR TAB */}
                {activeTab === 'inspector' && (
                    !node ? (
                        <div className="flex flex-col items-center justify-center h-full text-[#666] p-8 text-center bg-[#1f1f23]">
                            <Settings size={24} className="mb-2 opacity-50" />
                            <span className="text-xs">Select a node to inspect parameters</span>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full">
                            <div className="h-8 flex shrink-0 items-center px-3 justify-between border-b border-[#121212] bg-[#1f1f23]">
                                <span className="text-xs font-semibold text-[#bbb] uppercase truncate pr-2">
                                    {node.data.label}
                                </span>
                                <span className="text-[10px] text-[#555] font-mono">{node.id.split('-')[0]}</span>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-5">
                                {/* Node Info */}
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold text-[#555] flex items-center gap-1.5">
                                        <Settings size={10} /> Configuration
                                    </label>
                                    <div className="bg-[#121212] rounded border border-[#333] p-2 space-y-2">
                                        <div>
                                            <label className="text-[10px] text-[#666] block mb-1">Custom Label</label>
                                            <input
                                                type="text"
                                                value={node.data.label}
                                                onChange={(e) => onUpdate(node.id, { ...node.data, label: e.target.value })}
                                                className="w-full bg-[#1f1f23] border border-[#333] rounded-[2px] px-2 py-1 text-xs text-[#ccc] focus:border-[#d97706] outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Parameters Form */}
                                {(node.data.toolData?.parameters || []).length > 0 && (
                                    <div className="space-y-3">
                                        <label className="text-[10px] uppercase font-bold text-[#555] flex items-center gap-1.5">
                                            <Sliders size={10} /> Parameters
                                        </label>

                                        {(node.data.toolData?.parameters || []).map((param: ToolParameter) => (
                                            <div key={param.name} className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-[11px] text-[#999] font-medium" title={param.description}>
                                                        {param.label}
                                                    </label>
                                                    <span className="text-[9px] text-[#444] capitalize">{param.type}</span>
                                                </div>

                                                {/* String Input */}
                                                {param.type === 'string' && (
                                                    <div className="relative">
                                                        <Type size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#555]" />
                                                        <input
                                                            type="text"
                                                            value={node.data.parameterValues?.[param.name] ?? param.default ?? ''}
                                                            onChange={(e) => {
                                                                const newValues = { ...node.data.parameterValues, [param.name]: e.target.value };
                                                                onUpdate(node.id, { ...node.data, parameterValues: newValues });
                                                            }}
                                                            className="w-full bg-[#121212] border border-[#333] rounded-[2px] pl-7 pr-2 py-1.5 text-xs text-[#ccc] focus:border-[#34d399] outline-none transition-colors"
                                                        />
                                                    </div>
                                                )}

                                                {/* Number Input */}
                                                {param.type === 'number' && (
                                                    <div className="relative">
                                                        <Hash size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#555]" />
                                                        <input
                                                            type="number"
                                                            value={node.data.parameterValues?.[param.name] ?? param.default ?? 0}
                                                            onChange={(e) => {
                                                                const newValues = { ...node.data.parameterValues, [param.name]: Number(e.target.value) };
                                                                onUpdate(node.id, { ...node.data, parameterValues: newValues });
                                                            }}
                                                            className="w-full bg-[#121212] border border-[#333] rounded-[2px] pl-7 pr-2 py-1.5 text-xs text-[#d97706] focus:border-[#d97706] outline-none transition-colors"
                                                        />
                                                    </div>
                                                )}

                                                {/* Boolean Toggle */}
                                                {param.type === 'boolean' && (
                                                    <div
                                                        onClick={() => {
                                                            const currentVal = node.data.parameterValues?.[param.name] ?? param.default ?? false;
                                                            const newValues = { ...node.data.parameterValues, [param.name]: !currentVal };
                                                            onUpdate(node.id, { ...node.data, parameterValues: newValues });
                                                        }}
                                                        className="flex items-center gap-2 cursor-pointer group"
                                                    >
                                                        <div className={`w-8 h-4 rounded-full relative transition-colors ${node.data.parameterValues?.[param.name] ?? param.default ? 'bg-[#34d399]' : 'bg-[#333]'}`}>
                                                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${node.data.parameterValues?.[param.name] ?? param.default ? 'left-4.5' : 'left-0.5'}`} style={{ left: node.data.parameterValues?.[param.name] ?? param.default ? 'calc(100% - 14px)' : '2px' }} />
                                                        </div>
                                                        <span className="text-[10px] text-[#666] group-hover:text-[#999]">
                                                            {node.data.parameterValues?.[param.name] ?? param.default ? 'Enabled' : 'Disabled'}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Select Dropdown */}
                                                {param.type === 'select' && (
                                                    <div className="relative">
                                                        <List size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#555]" />
                                                        <select
                                                            value={node.data.parameterValues?.[param.name] ?? param.default ?? ''}
                                                            onChange={(e) => {
                                                                const newValues = { ...node.data.parameterValues, [param.name]: e.target.value };
                                                                onUpdate(node.id, { ...node.data, parameterValues: newValues });
                                                            }}
                                                            className="w-full bg-[#121212] border border-[#333] rounded-[2px] pl-7 pr-2 py-1.5 text-xs text-[#ccc] focus:border-[#34d399] outline-none appearance-none cursor-pointer hover:bg-[#1a1a1a]"
                                                        >
                                                            {param.options?.map((opt: string) => (
                                                                <option key={opt} value={opt}>{opt}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}

                                                {/* File Input (Mockup for now) */}
                                                {param.type === 'file' && (
                                                    <div className="flex gap-1">
                                                        <div className="relative flex-1">
                                                            <FileText size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#555]" />
                                                            <input
                                                                type="text"
                                                                readOnly
                                                                value={node.data.parameterValues?.[param.name] || 'No file selected'}
                                                                className="w-full bg-[#121212] border border-[#333] rounded-[2px] pl-7 pr-2 py-1.5 text-xs text-[#666] italic outline-none cursor-not-allowed"
                                                            />
                                                        </div>
                                                        <button
                                                            onClick={() => alert('File picker not implemented in prototype')}
                                                            className="bg-[#333] hover:bg-[#444] text-white px-2 rounded-[2px] border border-[#444] flex items-center justify-center transition-colors"
                                                        >
                                                            ...
                                                        </button>
                                                    </div>
                                                )}

                                            </div>
                                        ))}
                                    </div>
                                )}

                                {!(node.data.toolData?.parameters || []).length && (
                                    <div className="text-[10px] text-[#444] italic p-2 border border-[#222] border-dashed rounded text-center">
                                        No parameters available for this tool.
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                )}

                {/* AI AGENT TAB */}
                {activeTab === 'agent' && (
                    <div className="flex flex-col h-full bg-[#18181b]">
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {messages.map((msg, idx) => (
                                <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div
                                        className={`max-w-[85%] rounded px-3 py-2 text-xs leading-relaxed ${msg.role === 'user'
                                            ? 'bg-[#333] text-[#eee] rounded-tr-none'
                                            : 'bg-[#2a2a2a] text-[#ccc] rounded-tl-none border border-[#333]'
                                            }`}
                                    >
                                        {msg.content}
                                    </div>
                                    <span className="text-[9px] text-[#444] mt-1 uppercase tracking-wider">{msg.role}</span>
                                </div>
                            ))}
                        </div>

                        <div className="p-3 border-t border-[#111] bg-[#1f1f23]">
                            <div className="relative">
                                <textarea
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                    placeholder="Ask about your workflow..."
                                    className="w-full bg-[#121212] text-[#ccc] text-xs p-2 pr-8 rounded border border-[#333] focus:border-[#3b82f6] outline-none resize-none h-20 scrollbar-hide placeholder:text-[#444]"
                                />
                                <button
                                    onClick={handleSendMessage}
                                    disabled={!chatInput.trim()}
                                    className="absolute bottom-2 right-2 text-[#555] hover:text-[#3b82f6] disabled:opacity-30 disabled:hover:text-[#555] transition-colors"
                                >
                                    <span className="text-[10px] font-bold uppercase">Send</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
