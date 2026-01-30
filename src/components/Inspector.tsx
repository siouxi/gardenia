import { ToolParameter } from '../types/ToolDefinition';
import { Settings, Sliders, FileText, Type, Hash, List } from 'lucide-react';

interface InspectorProps {
    node: any; // Using any for now to avoid circular deps, but technically AppNode
    onUpdate: (nodeId: string, data: any) => void;
}

export const Inspector = ({ node, onUpdate }: InspectorProps) => {
    if (!node) {
        return (
            <div className="w-[280px] flex flex-col border-l border-[#000] bg-[#1f1f23] text-[#666] items-center justify-center p-8 text-center">
                <Settings size={24} className="mb-2 opacity-50" />
                <span className="text-xs">Select a node to inspect parameters</span>
            </div>
        );
    }

    const { label, toolData, parameterValues = {} } = node.data;
    const parameters: ToolParameter[] = toolData?.parameters || [];

    const handleParamChange = (paramName: string, value: any) => {
        const newValues = { ...parameterValues, [paramName]: value };
        onUpdate(node.id, {
            ...node.data,
            parameterValues: newValues
        });
    };

    return (
        <div className="w-[280px] flex flex-col border-l border-[#000] bg-[#1f1f23]">
            <div className="h-8 bg-[#2a2a2a] flex items-center px-3 justify-between border-b border-[#121212]">
                <span className="text-xs font-semibold text-[#bbb] uppercase truncate pr-2">
                    {label}
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
                                value={label}
                                onChange={(e) => onUpdate(node.id, { ...node.data, label: e.target.value })}
                                className="w-full bg-[#1f1f23] border border-[#333] rounded-[2px] px-2 py-1 text-xs text-[#ccc] focus:border-[#d97706] outline-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Parameters Form */}
                {parameters.length > 0 && (
                    <div className="space-y-3">
                        <label className="text-[10px] uppercase font-bold text-[#555] flex items-center gap-1.5">
                            <Sliders size={10} /> Parameters
                        </label>

                        {parameters.map((param) => (
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
                                            value={parameterValues[param.name] ?? param.default ?? ''}
                                            onChange={(e) => handleParamChange(param.name, e.target.value)}
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
                                            value={parameterValues[param.name] ?? param.default ?? 0}
                                            onChange={(e) => handleParamChange(param.name, Number(e.target.value))}
                                            className="w-full bg-[#121212] border border-[#333] rounded-[2px] pl-7 pr-2 py-1.5 text-xs text-[#d97706] focus:border-[#d97706] outline-none transition-colors"
                                        />
                                    </div>
                                )}

                                {/* Boolean Toggle */}
                                {param.type === 'boolean' && (
                                    <div
                                        onClick={() => handleParamChange(param.name, !(parameterValues[param.name] ?? param.default ?? false))}
                                        className="flex items-center gap-2 cursor-pointer group"
                                    >
                                        <div className={`w-8 h-4 rounded-full relative transition-colors ${parameterValues[param.name] ?? param.default ? 'bg-[#34d399]' : 'bg-[#333]'}`}>
                                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${parameterValues[param.name] ?? param.default ? 'left-4.5' : 'left-0.5'}`} style={{ left: parameterValues[param.name] ?? param.default ? 'calc(100% - 14px)' : '2px' }} />
                                        </div>
                                        <span className="text-[10px] text-[#666] group-hover:text-[#999]">
                                            {parameterValues[param.name] ?? param.default ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </div>
                                )}

                                {/* Select Dropdown */}
                                {param.type === 'select' && (
                                    <div className="relative">
                                        <List size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#555]" />
                                        <select
                                            value={parameterValues[param.name] ?? param.default ?? ''}
                                            onChange={(e) => handleParamChange(param.name, e.target.value)}
                                            className="w-full bg-[#121212] border border-[#333] rounded-[2px] pl-7 pr-2 py-1.5 text-xs text-[#ccc] focus:border-[#34d399] outline-none appearance-none cursor-pointer hover:bg-[#1a1a1a]"
                                        >
                                            {param.options?.map(opt => (
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
                                                value={parameterValues[param.name] || 'No file selected'}
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

                {!parameters.length && (
                    <div className="text-[10px] text-[#444] italic p-2 border border-[#222] border-dashed rounded text-center">
                        No parameters available for this tool.
                    </div>
                )}
            </div>
        </div>
    );
};
