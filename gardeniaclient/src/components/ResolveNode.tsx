import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
    InputIcon,
    QCIcon,
    StatisticalAnalysisIcon,
    VisualizationIcon,
    UtilitiesIcon,
    DataWranglingIcon,
    NormalizationIcon,
    DifferentialExpressionIcon,
    MachineLearningIcon,
    SequenceAnalysisIcon
} from './BioinformaticsIcons';
import { useWorkflowStore } from '../stores/workflowStore';

const iconMap: Record<string, any> = {
    'Input/Output': InputIcon,
    'Data Wrangling': DataWranglingIcon,
    'Quality Control': QCIcon,
    'Normalization': NormalizationIcon,
    'Statistical Analysis': StatisticalAnalysisIcon,
    'Differential Expression': DifferentialExpressionIcon,
    'Machine Learning': MachineLearningIcon,
    'Sequence Analysis': SequenceAnalysisIcon,
    'Visualization': VisualizationIcon,
    'Utilities': UtilitiesIcon
};

// Helper component for individual parameters to handle local state
const NodeParameter = ({ param, initialValue, nodeId }: { param: any, initialValue: any, nodeId: string }) => {
    const [value, setValue] = React.useState(initialValue);

    React.useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    const commitChange = (newValue: any) => {
        const event = new CustomEvent('node:update-parameter', {
            detail: { nodeId, paramName: param.name, value: newValue }
        });
        window.dispatchEvent(event);
    };

    if (param.type === 'string' || param.type === 'text' || param.type === 'number') {
        return (
            <div className="flex flex-col gap-1">
                <span className="text-[9px] text-[#888] font-bold uppercase tracking-wider">{param.label}</span>
                <input
                    type={param.type === 'number' ? 'number' : 'text'}
                    className="nodrag nopan bg-[#2a2a2a] text-white text-[10px] py-1 px-2 rounded-sm border border-[#404040] focus:border-[#34d399] outline-none w-full"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={() => {
                        const val = param.type === 'number' ? parseFloat(value) : value;
                        commitChange(val);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            const val = param.type === 'number' ? parseFloat(value) : value;
                            commitChange(val);
                            (e.target as HTMLInputElement).blur();
                        }
                        e.stopPropagation();
                    }}
                    placeholder={String(param.default || '')}
                />
            </div>
        );
    }

    if (param.type === 'select') {
        return (
            <div className="flex flex-col gap-1">
                <span className="text-[9px] text-[#888] font-bold uppercase tracking-wider">{param.label}</span>
                <select
                    className="nodrag nopan bg-[#2a2a2a] text-white text-[10px] py-1 px-2 rounded-sm border border-[#404040] focus:border-[#34d399] outline-none w-full"
                    value={value}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                        setValue(e.target.value);
                        commitChange(e.target.value);
                    }}
                >
                    {param.options?.map((opt: string) => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            </div>
        );
    }

    if (param.type === 'slider') {
        return (
            <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                    <span className="text-[9px] text-[#888] font-bold uppercase tracking-wider">{param.label}</span>
                    <span className="text-[9px] text-[#34d399]">{value}</span>
                </div>
                <input
                    type="range"
                    min={param.min ?? 0}
                    max={param.max ?? 100}
                    step={param.step ?? 1}
                    className="nodrag nopan w-full h-1 bg-[#404040] rounded-lg appearance-none cursor-pointer accent-[#34d399]"
                    value={value}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => setValue(parseFloat(e.target.value))}
                    onMouseUp={() => commitChange(parseFloat(value))}
                    onTouchEnd={() => commitChange(parseFloat(value))}
                />
            </div>
        );
    }

    if (param.type === 'boolean' || param.type === 'toggle') {
        return (
            <div className="flex items-center gap-2 mt-1">
                <input
                    type="checkbox"
                    className="nodrag nopan rounded border-[#404040] bg-[#2a2a2a] text-[#34d399] focus:ring-0 w-3 h-3"
                    checked={Boolean(value)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                        const newVal = e.target.checked;
                        setValue(newVal);
                        commitChange(newVal);
                    }}
                />
                <span className="text-[9px] text-[#888] font-bold uppercase tracking-wider">{param.label}</span>
            </div>
        );
    }

    if (param.type === 'file' || param.type === 'save-file') {
        const fileName = value ? String(value).split(/[/\\]/).pop() : (param.type === 'save-file' ? 'Save As...' : 'Select File');

        const handleFileClick = async () => {
            if ((window as any).electronAPI) {
                let path;
                if (param.type === 'save-file') {
                    path = await (window as any).electronAPI.saveFileDialog({
                        title: 'Save Output File',
                        defaultPath: 'output.csv',
                        filters: [
                            { name: 'CSV Files', extensions: ['csv'] },
                            { name: 'Parquet Files', extensions: ['parquet'] },
                            { name: 'All Files', extensions: ['*'] }
                        ]
                    });
                } else {
                    path = await (window as any).electronAPI.openFileDialog();
                }

                if (path) {
                    setValue(path);
                    commitChange(path);
                }
            }
        };

        return (
            <div className="flex flex-col gap-1">
                <span className="text-[9px] text-[#888] font-bold uppercase tracking-wider">{param.label}</span>
                <button
                    onClick={handleFileClick}
                    className="nodrag nopan bg-[#2a2a2a] hover:bg-[#333] text-white text-[10px] py-1 px-2 rounded-sm border border-[#404040] flex items-center gap-2 transition-colors truncate w-full text-left"
                    title={String(value)}
                >
                    <span className="truncate flex-1">{fileName}</span>
                    <span className="text-[#666] text-[9px] shrink-0">{param.type === 'save-file' ? '💾' : '📂'}</span>
                </button>
            </div>
        );
    }

    return null;
};

// Format elapsed time
const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
};

export const ResolveNode = React.memo(({ id, data, selected }: NodeProps) => {
    const Icon = iconMap[String(data.category)] || iconMap['QC'];
    const toolData = data.toolData as any;

    // Get execution state from store for timing and output
    const nodeExecState = useWorkflowStore(state => state.nodeStates.get(id));
    const elapsedTime = nodeExecState?.startTime && nodeExecState?.endTime
        ? nodeExecState.endTime - nodeExecState.startTime
        : null;
    const outputPreview = nodeExecState?.output
        ? nodeExecState.output.trim().split('\n').filter(Boolean).slice(-2).join('\n')
        : null;

    const inputs = toolData?.inputs || [];
    const outputs = toolData?.outputs || [];
    const showDefaultInput = (!toolData?.inputs) && data.type !== 'input';
    const showDefaultOutput = (!toolData?.outputs);

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
                <div className="flex items-center gap-1.5">
                    {/* Execution Timing */}
                    {elapsedTime !== null && data.executionState === 'success' && (
                        <span className="text-[9px] text-emerald-400/70 font-mono">
                            {formatTime(elapsedTime)}
                        </span>
                    )}
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

                {/* Parameters */}
                {toolData?.parameters && toolData.parameters.length > 0 && (
                    <div className="py-2 space-y-2">
                        {toolData.parameters.map((param: any) => (
                            <NodeParameter
                                key={param.name}
                                param={param}
                                initialValue={(data.parameterValues as any)?.[param.name] ?? param.default ?? ''}
                                nodeId={id}
                            />
                        ))}
                    </div>
                )}

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

            {/* Inline Output Preview */}
            {outputPreview && (data.executionState === 'success' || data.executionState === 'error') && (
                <div className="border-t border-[#2a2a2a] px-2 py-1.5 bg-[#111] rounded-b-[5px]">
                    <pre className="text-[9px] text-[#888] font-mono leading-tight max-h-[32px] overflow-hidden whitespace-pre-wrap break-all">
                        {outputPreview.slice(0, 120)}{outputPreview.length > 120 ? '…' : ''}
                    </pre>
                </div>
            )}
        </div>
    );
});
