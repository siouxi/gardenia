import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, addEdge, Connection, NodeTypes, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Sidebar } from './components/Sidebar';
import { NodesSidebar } from './components/NodesSidebar';
import { Terminal } from './components/Terminal';
import { Inspector } from './components/Inspector';
import { GardeniasLogo } from './components/GardeniasLogo';
import { ResolveNode } from './components/ResolveNode';
import { PostItNode } from './components/PostItNode';
import { CodeEditor } from './components/CodeEditor';
import { ToolRegistry } from './registry/tools';
import { Node } from '@xyflow/react';
import { exportToJson, importFromJson } from './utils/fileHandler';
import { getLayoutedElements } from './utils/layout';
import { Download, Upload, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Settings } from 'lucide-react';

export interface NodeData {
    label: string;
    category?: string;
    toolId?: string;
    toolData?: any;
    parameterValues?: Record<string, any>;
    code?: string; // Python/R code for execution
    language?: 'python' | 'r'; // Execution language
    executionState?: 'pending' | 'running' | 'success' | 'error'; // Visual feedback
    [key: string]: any; // Index signature for ReactFlow compatibility
}

export type AppNode = Node<NodeData>;

const initialNodes: AppNode[] = [
    {
        id: '1',
        position: { x: 100, y: 100 },
        type: 'resolve',
        data: {
            label: 'START',
            category: 'Utilities',
            toolId: 'flow-start',
            toolData: {
                id: 'flow-start',
                name: 'START',
                category: 'Utilities',
                inputs: [],
                outputs: [{ name: 'start_signal', type: 'signal' }]
            }
        }
    },
];
const initialEdges: any[] = [];

// Wrapper component to use the ReactFlow hook
const Flow = () => {
    // Layout State
    const [leftPanelWidth, setLeftPanelWidth] = useState(320);
    const [rightPanelWidth, setRightPanelWidth] = useState(320);
    const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
    const [isResizingLeft, setIsResizingLeft] = useState(false);
    const [isResizingRight, setIsResizingRight] = useState(false);

    // Inspector State
    const [inspectorTab, setInspectorTab] = useState<'inspector' | 'agent' | 'code'>('inspector'); // Keeping type but 'code' might be unused in inspector now
    const [viewMode, setViewMode] = useState<'workflow' | 'data' | 'gallery' | 'code' | 'report'>('workflow');

    // Resize Handlers
    const toggleResizingLeft = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsResizingLeft(prev => !prev);
        setIsResizingRight(false); // Ensure only one active
    }, []);

    const toggleResizingRight = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsResizingRight(prev => !prev);
        setIsResizingLeft(false); // Ensure only one active
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizingLeft(false);
        setIsResizingRight(false);
    }, []);

    const onMouseMove = useCallback((e: MouseEvent) => {
        if (isResizingLeft) {
            const newWidth = Math.max(200, Math.min(600, e.clientX));
            setLeftPanelWidth(newWidth);
        }
        if (isResizingRight) {
            const newWidth = Math.max(200, Math.min(600, window.innerWidth - e.clientX));
            setRightPanelWidth(newWidth);
        }
    }, [isResizingLeft, isResizingRight]);

    // Attach global listeners
    // Attach global listeners
    // Moved below useNodesState


    const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>(initialNodes);

    // Attach global listeners (Moved here to access setNodes)
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') stopResizing();
        };

        const onNodeUpdateParameter = (e: any) => {
            const { nodeId, paramName, value } = e.detail;
            setNodes((nds) =>
                nds.map((node) => {
                    if (node.id === nodeId) {
                        return {
                            ...node,
                            data: {
                                ...node.data,
                                parameterValues: {
                                    ...node.data.parameterValues,
                                    [paramName]: value
                                }
                            }
                        };
                    }
                    return node;
                })
            );
        };

        if (isResizingLeft || isResizingRight) {
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('click', stopResizing); // Click anywhere else stops it
            window.addEventListener('keydown', onKeyDown);
        }

        window.addEventListener('node:update-parameter', onNodeUpdateParameter);

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('click', stopResizing);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('node:update-parameter', onNodeUpdateParameter);
        };
    }, [isResizingLeft, isResizingRight, onMouseMove, stopResizing, setNodes]);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const { screenToFlowPosition, fitView } = useReactFlow();
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    // Console logging ref
    const logToConsoleRef = useRef<((log: string) => void) | null>(null);

    const log = (message: string) => {
        console.log(message);
        if (logToConsoleRef.current) {
            logToConsoleRef.current(message);
        }
    };

    const nodeTypes = useMemo<NodeTypes>(() => ({
        resolve: ResolveNode,
        postit: PostItNode
    }), []);

    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge(params, eds)),
        [setEdges],
    );

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            const toolId = event.dataTransfer.getData('application/reactflow');
            const tool = ToolRegistry.getById(toolId);

            // check if the dropped element is valid
            if (typeof toolId === 'undefined' || !toolId || !tool) {
                return;
            }

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            // Determine node type based on tool ID
            const nodeType = toolId === 'post-it' ? 'postit' : 'resolve';
            const nodeId = `${toolId}-${Date.now()}`;

            const newNode: AppNode = {
                id: nodeId,
                type: nodeType,
                position,
                data: {
                    label: tool.name,
                    category: tool.category,
                    toolId: tool.id,
                    toolData: tool,
                    parameterValues: {},
                    // Use default code and language from tool definition, or fallback
                    code: tool.defaultCode || '# Hola Mundo',
                    language: tool.language || 'python'
                },
            };

            setNodes((nds) => nds.concat(newNode));
        },
        [screenToFlowPosition, setNodes],
    );

    const onNodeClick = useCallback((_: React.MouseEvent, node: AppNode) => {
        setSelectedNodeId(node.id);
        if (!isRightPanelOpen) setIsRightPanelOpen(true);
    }, [isRightPanelOpen]);

    const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: AppNode) => {
        // Don't open code editor for post-it notes, start, or end nodes
        if (node.type === 'postit' ||
            node.data.toolId === 'flow-start' ||
            node.data.toolId === 'flow-end') {
            return;
        }

        setSelectedNodeId(node.id);
        setViewMode('code');
        // Ensure inspector is open but maybe on 'inspector' tab to see params while coding?
        // Or keep it as is.
        setIsRightPanelOpen(true);
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null);
    }, []);

    const updateNodeData = useCallback((nodeId: string, newData: NodeData) => {
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === nodeId) {
                    return { ...node, data: newData };
                }
                return node;
            })
        );
    }, [setNodes]);

    // Derived state for the inspector - moved up for usage in isCodeDisabled
    const selectedNode = useMemo(() =>
        nodes.find((n) => n.id === selectedNodeId) || null,
        [nodes, selectedNodeId]);

    const isCodeDisabled = useMemo(() => {
        if (!selectedNode) return false;
        return selectedNode.type === 'postit' ||
            selectedNode.data.toolId === 'flow-start' ||
            selectedNode.data.toolId === 'flow-end';
    }, [selectedNode]);

    const runWorkflow = async () => {
        log('=== WORKFLOW EXECUTION STARTED ===');

        try {
            // Validation: Check if Start Node exists and is connected
            const startNodes = nodes.filter(n => n.data.toolId === 'flow-start');

            if (startNodes.length === 0) {
                log("Please add a START node to your workflow.");
                return;
            }

            const hasUnconnectedStart = startNodes.some(node => {
                return !edges.some(edge => edge.source === node.id || edge.target === node.id);
            });

            if (hasUnconnectedStart) {
                log("Please create a workflow.");
                return;
            }

            // Get execution order using Topological Sort (Kahn's Algorithm)
            const getExecutionOrder = (startNodeId: string): string[] => {
                const inDegree = new Map<string, number>();
                const order: string[] = [];
                const queue: string[] = [];  // Nodes with in-degree 0

                // Initialize in-degrees
                nodes.forEach(node => {
                    inDegree.set(node.id, 0);
                });

                // Calculate in-degrees
                edges.forEach(edge => {
                    const target = edge.target;
                    inDegree.set(target, (inDegree.get(target) || 0) + 1);
                });

                // Start with nodes having 0 in-degree (should be START node)
                // We trust the provided startNodeId is valid, but verify in-degree
                if (inDegree.get(startNodeId) === 0) {
                    queue.push(startNodeId);
                } else {
                    // Fallback: If Start has incoming edges (loops?), force add it?
                    // For now, strict topology: find all 0 in-degrees relative to the reachable subgraph
                    // Actually, simpler: Push ALL 0-in-degree nodes initially.
                    nodes.forEach(node => {
                        if (inDegree.get(node.id) === 0) {
                            if (!queue.includes(node.id)) queue.push(node.id);
                        }
                    });
                }

                while (queue.length > 0) {
                    const nodeId = queue.shift()!;
                    order.push(nodeId);

                    // Find outgoing edges from this node
                    const outgoing = edges.filter(e => e.source === nodeId);

                    outgoing.forEach(edge => {
                        const target = edge.target;
                        const currentInDegree = inDegree.get(target)! - 1;
                        inDegree.set(target, currentInDegree);

                        if (currentInDegree === 0) {
                            queue.push(target);
                        }
                    });
                }

                return order;
            };

            const startNode = startNodes[0];
            const executionOrder = getExecutionOrder(startNode.id);

            log(`[Info] Execution order: ${executionOrder.map(id => {
                const n = nodes.find(node => node.id === id);
                return n?.data.label || id;
            }).join(' → ')}`);

            // Execute nodes sequentially
            for (let i = 0; i < executionOrder.length; i++) {
                const nodeId = executionOrder[i];
                const node = nodes.find(n => n.id === nodeId);
                if (!node) {
                    log(`[Error] Node ${nodeId} not found!`);
                    continue;
                }

                const toolId = node.data.toolId;

                // Skip START node (just triggers)
                if (toolId === 'flow-start') {
                    log(`[START] Workflow initiated`);
                    continue;
                }

                // Handle END node
                if (toolId === 'flow-end') {
                    log(`[END] Workflow completed successfully ✅`);
                    break;
                }

                const code = node.data.code || '# No code defined';
                const language = node.data.language || 'python';
                const params = node.data.parameterValues || {};

                // Inject parameters as variables
                let codeToExecute = code;
                let paramPrefix = '';

                Object.entries(params).forEach(([key, value]) => {
                    if (value === undefined || value === null) return;

                    if (language === 'r') {
                        if (typeof value === 'string') {
                            paramPrefix += `${key} <- ${JSON.stringify(value)}\n`;
                        } else if (typeof value === 'boolean') {
                            paramPrefix += `${key} <- ${value ? 'TRUE' : 'FALSE'}\n`;
                        } else {
                            paramPrefix += `${key} <- ${value}\n`;
                        }
                    } else {
                        // Python
                        if (typeof value === 'string') {
                            paramPrefix += `${key} = ${JSON.stringify(value)}\n`;
                        } else if (typeof value === 'boolean') {
                            paramPrefix += `${key} = ${value ? 'True' : 'False'}\n`;
                        } else {
                            paramPrefix += `${key} = ${value}\n`;
                        }
                    }
                });

                if (paramPrefix) {
                    codeToExecute = `${paramPrefix}\n${code}`;
                }

                log(`[${node.data.label}] Executing ${language} code...`);

                // Update node state to 'running'
                setNodes((nds) =>
                    nds.map((n) =>
                        n.id === nodeId
                            ? { ...n, data: { ...n.data, executionState: 'running' } }
                            : n
                    )
                );

                try {
                    let result;
                    if (language === 'python') {
                        result = await (window as any).electronAPI.executePythonCommand(codeToExecute);
                    } else {
                        result = await (window as any).electronAPI.executeRCommand(codeToExecute);
                    }

                    if (result.status === 'success') {
                        log(`[${node.data.label}] ✅ Output:\n${result.output}`);

                        // Update node state to 'success'
                        setNodes((nds) =>
                            nds.map((n) =>
                                n.id === nodeId
                                    ? { ...n, data: { ...n.data, executionState: 'success' } }
                                    : n
                            )
                        );
                    } else {
                        log(`[${node.data.label}] ❌ Error:\n${result.error || result.output}`);

                        // Update node state to 'error'
                        setNodes((nds) =>
                            nds.map((n) =>
                                n.id === nodeId
                                    ? { ...n, data: { ...n.data, executionState: 'error' } }
                                    : n
                            )
                        );

                        // Removed duplicate log here
                        return; // Stop execution on error
                    }
                } catch (error) {
                    log(`[${node.data.label}] ❌ Exception:\n${error}`);

                    // Update node state to 'error'
                    setNodes((nds) =>
                        nds.map((n) =>
                            n.id === nodeId
                                ? { ...n, data: { ...n.data, executionState: 'error' } }
                                : n
                        )
                    );

                    log(`[${node.data.label}] ❌ Exception: ${error}`); // Changed alert to log
                    return;
                }

                // Small delay between nodes to prevent session blocking
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            log('=== WORKFLOW EXECUTION COMPLETED ===');

            // Reset all node execution states after a short delay
            setTimeout(() => {
                setNodes((nds) =>
                    nds.map((n) => ({
                        ...n,
                        data: { ...n.data, executionState: undefined }
                    }))
                );
            }, 2000); // 2 second delay to show final states
        } finally {
            // Cleanup if needed
        }
    };
    const onExport = useCallback(() => {
        const workflowData = {
            nodes,
            edges,
            version: '1.0.0'
        };
        exportToJson(workflowData, `workflow-${Date.now()}.json`);
    }, [nodes, edges]);

    const onImport = useCallback(async () => {
        try {
            const data = await importFromJson();
            if (data.nodes && data.edges) {
                // Apply auto-layout
                const layouted = getLayoutedElements(data.nodes, data.edges);
                setNodes(layouted.nodes as AppNode[]);
                setEdges(layouted.edges);

                // Fit view after layout
                setTimeout(() => {
                    fitView({ duration: 800 });
                }, 100);
            }
        } catch (error) {
            console.error('Failed to import workflow:', error);
            alert('Failed to import workflow. Checked console for details.');
        }
    }, [setNodes, setEdges]);

    const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
    const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);

    return (
        <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#18181b] text-[#ccc] font-sans">
            {/* Menu Bar */}
            <div className="h-8 bg-[#1f1f23] border-b border-[#111] flex items-center px-1 shrink-0 select-none z-50">
                <div className="relative">
                    <button
                        className={`px-3 py-1 text-xs hover:bg-[#333] rounded-sm transition-colors ${isFileMenuOpen ? 'bg-[#333]' : ''}`}
                        onClick={() => setIsFileMenuOpen(!isFileMenuOpen)}
                    >
                        File
                    </button>
                    {isFileMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsFileMenuOpen(false)} />
                            <div className="absolute top-full left-0 mt-1 w-48 bg-[#2a2a2a] border border-[#333] rounded-md shadow-xl py-1 z-50 flex flex-col">
                                <button
                                    className="px-4 py-2 text-xs text-left hover:bg-[#3e3e3e] flex items-center gap-2"
                                    onClick={() => {
                                        onImport();
                                        setIsFileMenuOpen(false);
                                    }}
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Import Workflow...
                                </button>
                                <button
                                    className="px-4 py-2 text-xs text-left hover:bg-[#3e3e3e] flex items-center gap-2"
                                    onClick={() => {
                                        onExport();
                                        setIsFileMenuOpen(false);
                                    }}
                                >
                                    <Upload className="w-3.5 h-3.5" />
                                    Export Workflow
                                </button>
                                <div className="h-[1px] bg-[#333] my-1" />
                                <button
                                    className="px-4 py-2 text-xs text-left hover:bg-[#3e3e3e] flex items-center gap-2"
                                    onClick={() => {
                                        setIsPreferencesOpen(true);
                                        setIsFileMenuOpen(false);
                                    }}
                                >
                                    <Settings className="w-3.5 h-3.5" />
                                    Preferences
                                </button>
                            </div>
                        </>
                    )}
                </div>
                <button className="px-3 py-1 text-xs hover:bg-[#333] rounded-sm transition-colors opacity-50 cursor-not-allowed">Edit</button>
                <button className="px-3 py-1 text-xs hover:bg-[#333] rounded-sm transition-colors opacity-50 cursor-not-allowed">View</button>
                <button className="px-3 py-1 text-xs hover:bg-[#333] rounded-sm transition-colors opacity-50 cursor-not-allowed">Help</button>

                {/* Window Drag Region (fake) */}
                <div className="flex-1 h-full drag-region" style={{ WebkitAppRegion: 'drag' } as any} />
            </div>

            {/* Top Bar */}
            <header className="h-14 bg-[#1f1f23] border-b border-[#000] flex items-center px-4 justify-between shrink-0 select-none">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
                        className="text-[#666] hover:text-[#ccc] transition-colors"
                        title={isLeftPanelOpen ? "Close Sidebar" : "Open Sidebar"}
                    >
                        {isLeftPanelOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
                    </button>
                    <GardeniasLogo variant="full" theme="dark" className="h-10" />
                </div>

                <div className="flex bg-[#121212] rounded p-0.5 gap-0.5">
                    <button
                        onClick={() => setViewMode('workflow')}
                        className={`px-3 py-0.5 text-[11px] font-medium rounded-[2px] shadow-sm transition-colors ${viewMode === 'workflow' ? 'bg-[#333] text-white' : 'hover:bg-[#222] text-[#888]'}`}
                    >
                        WORKFLOWS
                    </button>
                    <button
                        onClick={() => setViewMode('data')}
                        className={`px-3 py-0.5 text-[11px] font-medium rounded-[2px] shadow-sm transition-colors ${viewMode === 'data' ? 'bg-[#333] text-white' : 'hover:bg-[#222] text-[#888]'}`}
                    >
                        DATA
                    </button>
                    <button
                        onClick={() => setViewMode('gallery')}
                        className={`px-3 py-0.5 text-[11px] font-medium rounded-[2px] shadow-sm transition-colors ${viewMode === 'gallery' ? 'bg-[#333] text-white' : 'hover:bg-[#222] text-[#888]'}`}
                    >
                        GALLERY
                    </button>
                    <button
                        onClick={() => !isCodeDisabled && setViewMode('code')}
                        disabled={isCodeDisabled}
                        className={`px-3 py-0.5 text-[11px] font-medium rounded-[2px] shadow-sm transition-colors ${viewMode === 'code'
                            ? 'bg-[#333] text-white'
                            : isCodeDisabled
                                ? 'bg-transparent text-[#444] cursor-not-allowed'
                                : 'hover:bg-[#222] text-[#888]'
                            }`}
                    >
                        CODE
                    </button>
                    <button className="px-3 py-0.5 text-[11px] font-medium bg-[#d97706] text-black rounded-[2px] shadow-sm">REPORT</button>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        className="flex items-center gap-2 bg-[#2a2a2a] hover:bg-[#333] text-[#ccc] px-3 py-1 rounded-[3px] text-xs transition-colors border border-[#333]"
                        onClick={runWorkflow}
                    >
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        RUN
                    </button>
                    <button
                        onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
                        className="text-[#666] hover:text-[#ccc] transition-colors"
                        title={isRightPanelOpen ? "Close Inspector" : "Open Inspector"}
                    >
                        {isRightPanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
                    </button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Left Panel: Media Pool / Effects */}
                {isLeftPanelOpen && (
                    <div
                        className="flex flex-col border-r border-[#000] bg-[#1f1f23] relative shrink-0"
                        style={{ width: leftPanelWidth }}
                    >
                        <div className="h-8 bg-[#2a2a2a] flex items-center px-3 border-b border-[#121212] text-xs font-semibold text-[#bbb]">
                            {viewMode === 'code' ? 'NODES' : 'GARDENS'}
                        </div>

                        {viewMode === 'code' ? (
                            <NodesSidebar
                                nodes={nodes}
                                onNodeSelect={(id) => setSelectedNodeId(id)}
                                selectedNodeId={selectedNodeId}
                            />
                        ) : (
                            <Sidebar />
                        )}

                        {/* Resize Handle Right */}
                        <div
                            className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[#d97706] transition-colors z-10 ${isResizingLeft ? 'bg-[#d97706] opacity-100' : 'opacity-0 hover:opacity-100'}`}
                            onClick={toggleResizingLeft}
                        />
                    </div>
                )}

                {/* Center: Node Graph or Code Editor */}
                <div className="flex-1 bg-[#121212] flex flex-col overflow-hidden min-w-0">

                    {viewMode === 'workflow' && (
                        <div className="flex-1 relative overflow-hidden" onDrop={onDrop} onDragOver={onDragOver}>
                            <ReactFlow
                                nodes={nodes}
                                edges={edges}
                                onNodesChange={onNodesChange}
                                onEdgesChange={onEdgesChange}
                                onConnect={onConnect}
                                onNodeClick={onNodeClick}
                                onNodeDoubleClick={onNodeDoubleClick}
                                onPaneClick={onPaneClick}
                                nodeTypes={nodeTypes}
                                fitView
                                colorMode="dark"
                                proOptions={{ hideAttribution: true }}
                            >
                                <Background gap={15} size={1} color="#222" />
                                <Controls className="!bg-[#2a2a2a] !border-[#000] !fill-[#888] !rounded-[2px]" />
                            </ReactFlow>
                        </div>
                    )}

                    {viewMode === 'data' && (
                        <div className="flex-1 flex items-center justify-center text-[#444] text-sm font-mono">
                            DATA VIEW - Coming Soon
                        </div>
                    )}

                    {viewMode === 'gallery' && (
                        <div className="flex-1 flex items-center justify-center text-[#444] text-sm font-mono">
                            GALLERY VIEW - Coming Soon
                        </div>
                    )}

                    {viewMode === 'code' && (
                        <div className="flex-1 relative overflow-hidden">
                            <CodeEditor
                                node={selectedNode}
                                onUpdate={updateNodeData}
                            />
                        </div>
                    )}


                    {/* Bottom Time/Log Panel */}
                    <Terminal
                        onLogToConsole={(callback) => {
                            logToConsoleRef.current = callback;
                        }}
                        onAddTestNode={() => {
                            const id = `test-${Date.now()}`;
                            const newNode: AppNode = {
                                id,
                                type: 'resolve',
                                position: { x: 300, y: 300 },
                                data: {
                                    label: 'TEST',
                                    category: 'Utilities',
                                    toolId: 'flow-test',
                                    code: 'print("Hello from TEST node")',
                                    language: 'python',
                                    toolData: {
                                        id: 'flow-test',
                                        name: 'TEST',
                                        category: 'Utilities',
                                        hidden: true,
                                        inputs: [{ name: 'input', type: 'any' }],
                                        outputs: [{ name: 'output', type: 'any' }]
                                    }
                                }
                            };
                            setNodes((nds) => nds.concat(newNode));
                        }} />
                </div>

                {/* Right Panel: Inspector */}
                {isRightPanelOpen && (
                    <div
                        className="flex flex-col border-l border-[#000] bg-[#1f1f23] relative shrink-0"
                        style={{ width: rightPanelWidth }}
                    >
                        {/* Resize Handle Left */}
                        <div
                            className={`absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-[#d97706] transition-colors z-10 -ml-0.5 ${isResizingRight ? 'bg-[#d97706] opacity-100' : 'opacity-0 hover:opacity-100'}`}
                            onClick={toggleResizingRight}
                        />

                        <Inspector
                            node={selectedNode}
                            onUpdate={updateNodeData}
                            activeTab={inspectorTab}
                            onTabChange={setInspectorTab}
                        />
                    </div>
                )}
            </div>

            {/* Preferences Modal */}
            {isPreferencesOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
                    <div className="bg-[#1f1f23] border border-[#333] rounded-lg shadow-2xl p-6 w-[400px] max-w-full transform scale-100 transition-all">
                        <h2 className="text-xl font-bold text-[#ccc] mb-4 flex items-center gap-2">
                            <Settings size={20} />
                            Preferences
                        </h2>

                        <div className="flex flex-col items-center justify-center py-8 text-[#666] bg-[#121212] rounded border border-[#2a2a2a] mb-6">
                            <Settings size={48} className="mb-4 opacity-50 animate-spin-slow" style={{ animationDuration: '10s' }} />
                            <p className="text-lg font-medium text-[#ccc]">Coming Soon</p>
                            <p className="text-sm mt-2 text-center max-w-[80%]">
                                Global application settings and configuration options will be available here.
                            </p>
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={() => setIsPreferencesOpen(false)}
                                className="px-4 py-2 bg-[#333] hover:bg-[#444] text-[#ccc] rounded text-sm transition-colors border border-[#444] hover:border-[#555]"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function App() {
    return (
        <ReactFlowProvider>
            <Flow />
        </ReactFlowProvider>
    );
}
