import { useWorkflowStore } from '../stores/workflowStore';

export const ProgressBar = () => {
    const status = useWorkflowStore(state => state.status);
    const nodeStates = useWorkflowStore(state => state.nodeStates);
    const executionOrder = useWorkflowStore(state => state.executionOrder);

    if (status === 'idle' && nodeStates.size === 0) return null;

    // Calculate progress
    const totalNodes = executionOrder.length || nodeStates.size;

    if (totalNodes === 0) return null;

    const completedNodes = Array.from(nodeStates.values()).filter(
        n => n.state === 'success' || n.state === 'error' || n.state === 'skipped'
    ).length;

    const progress = Math.min(100, Math.round((completedNodes / totalNodes) * 100));

    // Determine color based on status
    let barColor = 'bg-emerald-500';
    if (status === 'error') barColor = 'bg-red-500';
    else if (status === 'cancelled') barColor = 'bg-yellow-500';

    return (
        <div className="flex items-center gap-2 mr-4 min-w-[150px]">
            <div className="flex-1 h-1.5 bg-[#333] rounded-full overflow-hidden">
                <div
                    className={`h-full ${barColor} transition-all duration-300 ease-out`}
                    style={{ width: `${progress}%` }}
                />
            </div>
            <span className="text-[10px] text-[#666] font-mono w-8 text-right">
                {progress}%
            </span>
        </div>
    );
};
