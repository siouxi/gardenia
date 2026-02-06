import { Handle, Position, NodeProps } from '@xyflow/react';
import {
    InputIcon,
    QCIcon,
    PreprocessingIcon,
    StatisticalAnalysisIcon,
    VisualizationIcon,
    UtilitiesIcon
} from './BioinformaticsIcons';

const iconMap: Record<string, any> = {
    'Input': InputIcon,
    'QC': QCIcon,
    'Preprocessing': PreprocessingIcon,
    'Statistical Analysis': StatisticalAnalysisIcon,
    'Visualization': VisualizationIcon,
    'Utilities': UtilitiesIcon
};

export const ResolveNode = ({ data, selected }: NodeProps) => {
    const Icon = iconMap[String(data.category)] || iconMap['QC'];
    const toolData = data.toolData as any;

    // Default to at least one IO if missing definition, for backward compat or generic nodes
    // Default to at least one IO if missing definition, for backward compat or generic nodes
    const inputs = toolData?.inputs || [];

    // Explicitly handle outputs. If defined (even if empty), use them.
    const outputs = toolData?.outputs || [];

    // Fallback for generic/legacy nodes
    // Only show default IO if not explicitly defined (undefined).
    // If explicitly defined as [] (empty), do not show default.
    const showDefaultInput = (!toolData?.inputs) && data.type !== 'input';
    const showDefaultOutput = (!toolData?.outputs);

    // Determine border color based on execution state
    const getExecutionStateStyle = () => {
        switch (data.executionState) {
            case 'running':
                return 'border-yellow-500 shadow-lg shadow-yellow-500/50 animate-pulse';
            case 'success':
                return 'border-green-500 shadow-lg shadow-green-500/30';
            case 'error':
                return 'border-red-500 shadow-lg shadow-red-500/30';
            default:
                return 'border-[#2a2a2a]';
        }
    };

    return (
        <div className={`
            group relative bg-[#18181b] rounded-[5px] border-5 ${getExecutionStateStyle()} transition-all duration-300 min-w-[180px] hover:border-[#34d399] hover:shadow-lg hover:shadow-[#34d399]/20
            ${selected ? 'ring-1 ring-[#34d399] border-[#34d399]' : 'hover:border-[#404040]'}
        `}>
            {/* Header */}
            <div className="bg-[#252525] rounded-t-[5px] px-3 py-2 flex items-center justify-between border-b border-[#2a2a2a] gap-2">
                <div className="flex items-center gap-2 overflow-hidden">
                    <Icon size={14} className="text-[#34d399] shrink-0" />
                    <span className="text-[12px] font-bold text-[#e1e1e1] tracking-wide truncate max-w-[100px]">
                        {String(data.label)}
                    </span>
                </div>
                {/* Language Badge */}
                {data.toolId !== 'flow-start' && data.toolId !== 'flow-end' && (
                    <div className={`
                        px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold tracking-wider
                        ${data.language === 'r'
                            ? 'bg-[#1e3a8a] text-blue-200 border border-[#3b82f6]/30'
                            : 'bg-[#3f3f46] text-yellow-200 border border-yellow-500/30'
                        }
                    `}>
                        {data.language === 'r' ? 'R' : 'PY'}
                    </div>
                )}
            </div>

            {/* Content Body with IO Ports */}
            <div className="p-2 space-y-1">
                {/* Inputs Stack */}
                <div className="flex flex-col gap-2">
                    {inputs.map((input: any) => (
                        <div key={input.name} className="relative flex items-center h-4">
                            <Handle
                                type="target"
                                position={Position.Left}
                                id={input.name}
                                className="!w-2.5 !h-2.5 !bg-[#666] !border-[#2a2a2a] !border-2 !rounded-full !-left-3.5 hover:!bg-[#34d399] transition-colors"
                            />
                            <span className="text-[10px] text-[#aaa] font-medium ml-1 capitalize">{input.name}</span>
                        </div>
                    ))}
                    {showDefaultInput && (
                        <div className="relative flex items-center h-4">
                            <Handle
                                type="target"
                                position={Position.Left}
                                className="!w-2.5 !h-2.5 !bg-[#666] !border-[#2a2a2a] !border-2 !rounded-full !-left-3.5 hover:!bg-[#34d399] transition-colors"
                            />
                            <span className="text-[10px] text-[#aaa] font-medium ml-1">In</span>
                        </div>
                    )}
                </div>

                {/* Parameters (File Picker, etc.) */}
                {toolData?.parameters && toolData.parameters.length > 0 && (
                    <div className="py-2 space-y-2">
                        {toolData.parameters.map((param: any) => {
                            if (param.type === 'file') {
                                const currentValue = (data.parameterValues as any)?.[param.name] || '';
                                const fileName = currentValue ? currentValue.split(/[/\\]/).pop() : 'Select File';

                                const handleFileClick = async () => {
                                    if ((window as any).electronAPI) {
                                        const path = await (window as any).electronAPI.openFileDialog();
                                        if (path) {
                                            // Update node data using ReactFlow hook would be ideal, 
                                            // but we need to pass setNodes or similar. 
                                            // For now, let's assume we can update local state or trigger a change up the chain.
                                            // Actually, in a Node component, we don't strictly have access to setNodes unless passed or via hook.
                                            // Let's rely on an event or property update if possible.
                                            // Since we are inside the Node, we can use useReactFlow to update.
                                            // But I need to import it. I'll do that in a separate edit if needed, or assume it behaves like a standard node.

                                            // Note: In React Flow v11+, useReactFlow is available.
                                            // I added import at top, so I should use it.

                                            // Dispatch custom event for the parent flow to catch (simple approach) or direct update
                                            const event = new CustomEvent('node:update-parameter', {
                                                detail: { nodeId: data.id, paramName: param.name, value: path }
                                            });
                                            window.dispatchEvent(event);
                                        }
                                    }
                                };

                                return (
                                    <div key={param.name} className="flex flex-col gap-1">
                                        <span className="text-[9px] text-[#888] font-bold uppercase tracking-wider">{param.label}</span>
                                        <button
                                            onClick={handleFileClick}
                                            className="bg-[#2a2a2a] hover:bg-[#333] text-white text-[10px] py-1 px-2 rounded-sm border border-[#404040] flex items-center gap-2 transition-colors truncate w-full text-left"
                                            title={currentValue}
                                        >
                                            <span className="truncate flex-1">{fileName}</span>
                                            <span className="text-[#666] text-[9px] shrink-0">📂</span>
                                        </button>
                                    </div>
                                );
                            }
                            return null;
                        })}
                    </div>
                )}

                {/* Divider if both exist */}
                {(inputs.length > 0 && outputs.length > 0) && <div className="h-2" />}

                {/* Outputs Stack */}
                <div className="flex flex-col gap-2 items-end">
                    {outputs.map((output: any) => (
                        <div key={output.name} className="relative flex items-center justify-end h-4 w-full">
                            <span className="text-[10px] text-[#aaa] font-medium mr-1 capitalize">{output.name}</span>
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={output.name}
                                className="!w-2.5 !h-2.5 !bg-[#666] !border-[#2a2a2a] !border-2 !rounded-full !-right-3.5 hover:!bg-[#34d399] transition-colors"
                            />
                        </div>
                    ))}
                    {showDefaultOutput && (
                        <div className="relative flex items-center justify-end h-4 w-full">
                            <span className="text-[10px] text-[#aaa] font-medium mr-1">Out</span>
                            <Handle
                                type="source"
                                position={Position.Right}
                                className="!w-2.5 !h-2.5 !bg-[#666] !border-[#2a2a2a] !border-2 !rounded-full !-right-3.5 hover:!bg-[#34d399] transition-colors"
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
