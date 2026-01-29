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

    return (
        <div className={`
            relative min-w-[120px] bg-[#2a2a2a] rounded-[4px] shadow-xl 
            border border-[#1a1a1a] overflow-hidden group transition-all
            ${selected ? 'ring-1 ring-[#34d399]' : 'hover:border-[#404040]'}
        `}>
            {/* Node Header - Color Coded Stripe */}
            <div className="h-1 w-full bg-[#34d399]" />

            <div className="flex flex-col">
                {/* Preview Area */}
                <div className="h-10 bg-[#161616] flex items-center justify-center border-b border-[#333]">
                    <Icon size={16} className="text-[#34d399]" />
                </div>

                {/* Label Area */}
                <div className="p-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium text-[#ccc] tracking-wide uppercase truncate max-w-[80px]">
                        {String(data.label)}
                    </span>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#333]" />
                </div>
            </div>

            {/* Handles */}
            <Handle
                type="target"
                position={Position.Left}
                className="!w-2.5 !h-2.5 !bg-[#666] !border-none !rounded-full !-left-1.5 hover:!bg-[#34d399] transition-colors"
            />
            <Handle
                type="source"
                position={Position.Right}
                className="!w-2.5 !h-2.5 !bg-[#666] !border-none !rounded-full !-right-1.5 hover:!bg-[#34d399] transition-colors"
            />
        </div>
    );
};
