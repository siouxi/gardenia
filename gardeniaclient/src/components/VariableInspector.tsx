/**
 * Variable Inspector Component
 * ============================
 * 
 * Displays current workflow variables from the registry.
 * Shows variable names, types, and expandable values.
 */

import { useState } from 'react';
import { useWorkflowStore, Variable, refreshVariables, clearVariables } from '../stores/workflowStore';
import { ChevronDown, ChevronRight, Database, Code, Hash, ToggleLeft, RefreshCw, Trash2 } from 'lucide-react';

interface VariableRowProps {
    variable: Variable;
}

function VariableRow({ variable }: VariableRowProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const getTypeIcon = () => {
        switch (variable.type_hint) {
            case 'str':
                return <Code className="w-3 h-3 text-green-400" />;
            case 'int':
            case 'float':
                return <Hash className="w-3 h-3 text-blue-400" />;
            case 'bool':
                return <ToggleLeft className="w-3 h-3 text-yellow-400" />;
            case 'DataFrame':
            case 'Table':
                return <Database className="w-3 h-3 text-purple-400" />;
            default:
                return <Code className="w-3 h-3 text-gray-400" />;
        }
    };

    const formatValue = () => {
        if (variable.is_dataframe) {
            return '[DataFrame]';
        }
        if (typeof variable.value === 'object') {
            return JSON.stringify(variable.value, null, 2);
        }
        return String(variable.value);
    };

    const isExpandable = typeof variable.value === 'object' && variable.value !== null;

    return (
        <div className="border-b border-[#333] last:border-0">
            <div
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#2a2a2a] cursor-pointer"
                onClick={() => isExpandable && setIsExpanded(!isExpanded)}
            >
                {isExpandable ? (
                    isExpanded ?
                        <ChevronDown className="w-3 h-3 text-gray-400" /> :
                        <ChevronRight className="w-3 h-3 text-gray-400" />
                ) : (
                    <span className="w-3" />
                )}

                {getTypeIcon()}

                <span className="text-xs font-medium text-[#ccc] flex-1 truncate">
                    {variable.name}
                </span>

                <span className="text-xs text-[#666] font-mono">
                    {variable.type_hint}
                </span>
            </div>

            {isExpanded && (
                <div className="px-4 py-2 bg-[#1a1a1a] text-xs font-mono text-[#888] whitespace-pre-wrap max-h-32 overflow-auto">
                    {formatValue()}
                </div>
            )}

            {!isExpandable && (
                <div className="px-8 pb-1 text-xs font-mono text-[#888] truncate">
                    {formatValue()}
                </div>
            )}
        </div>
    );
}

export function VariableInspector() {
    const variables = useWorkflowStore((state) => state.variables);
    const [scopeFilter, setScopeFilter] = useState<'all' | 'workflow' | 'global'>('all');
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await refreshVariables();
        } finally {
            setIsRefreshing(false);
        }
    };

    const filteredVariables = variables.filter((v) => {
        if (scopeFilter === 'all') return true;
        return v.scope === scopeFilter;
    });

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="h-8 bg-[#2a2a2a] flex items-center justify-between px-3 border-b border-[#121212]">
                <span className="text-xs font-semibold text-[#bbb]">VARIABLES</span>

                <div className="flex items-center gap-2">
                    <button
                        onClick={clearVariables}
                        className="text-[#666] hover:text-[#ccc] transition-colors"
                        title="Clear variables"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className="text-[#666] hover:text-[#ccc] transition-colors disabled:opacity-50"
                        title="Refresh variables"
                    >
                        <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>

                    <select
                        value={scopeFilter}
                        onChange={(e) => setScopeFilter(e.target.value as any)}
                        className="text-xs bg-[#1f1f23] text-[#888] border-none rounded px-1.5 py-0.5"
                    >
                        <option value="all">All</option>
                        <option value="workflow">Workflow</option>
                        <option value="global">Global</option>
                    </select>
                </div>
            </div>

            {/* Variable List */}
            <div className="flex-1 overflow-y-auto">
                {filteredVariables.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-xs text-[#444] font-mono">
                        No variables
                    </div>
                ) : (
                    filteredVariables.map((variable) => (
                        <VariableRow key={`${variable.scope}-${variable.name}`} variable={variable} />
                    ))
                )}
            </div>

            {/* Footer Stats */}
            <div className="h-6 bg-[#1a1a1a] flex items-center px-3 text-[10px] text-[#555] border-t border-[#333]">
                {variables.length} variable{variables.length !== 1 ? 's' : ''}
            </div>
        </div>
    );
}
