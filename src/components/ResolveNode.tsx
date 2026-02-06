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

    return (
        <div className={`
            relative min-w-[140px] bg-[#1e1e1e] rounded-[6px] shadow-xl 
            border border-[#2a2a2a] overflow-visible group transition-all
            ${selected ? 'ring-1 ring-[#34d399] border-[#34d399]' : 'hover:border-[#404040]'}
        `}>
            {/* Header */}
            <div className="bg-[#252525] rounded-t-[5px] px-3 py-2 flex items-center gap-2 border-b border-[#2a2a2a]">
                <Icon size={14} className="text-[#34d399]" />
                <span className="text-[12px] font-bold text-[#e1e1e1] tracking-wide truncate max-w-[100px]">
                    {String(data.label)}
                </span>
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
