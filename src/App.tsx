import { useCallback, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, addEdge, Connection, NodeTypes, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Sidebar } from './components/Sidebar';
import { Terminal } from './components/Terminal';
import { Inspector } from './components/Inspector';
import { GardeniasLogo } from './components/GardeniasLogo';
import { ResolveNode } from './components/ResolveNode';
import { ToolRegistry } from './registry/tools';
import { Node } from '@xyflow/react';

// Define the custom node type for our app
export type NodeData = {
    label: string;
    category?: string;
    toolId?: string;
    toolData?: any;
    parameterValues?: Record<string, any>;
    [key: string]: any;
};

export type AppNode = Node<NodeData>;

const initialNodes: AppNode[] = [
    { id: '1', position: { x: 100, y: 100 }, data: { label: 'Input', category: 'Input' }, type: 'resolve' },
];
const initialEdges: any[] = [];

// Wrapper component to use the ReactFlow hook
const Flow = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const { screenToFlowPosition } = useReactFlow();
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    const nodeTypes = useMemo<NodeTypes>(() => ({ resolve: ResolveNode }), []);

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

            const newNode: AppNode = {
                id: `${toolId}-${Date.now()}`,
                type: 'resolve',
                position,
                data: {
                    label: tool.name,
                    category: tool.category,
                    toolId: tool.id,
                    toolData: tool,
                    parameterValues: {} // Initialize empty params
                },
            };

            setNodes((nds) => nds.concat(newNode));
        },
        [screenToFlowPosition, setNodes],
    );

    const onNodeClick = useCallback((_: React.MouseEvent, node: AppNode) => {
        setSelectedNodeId(node.id);
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

    const runWorkflow = () => {
        (window as any).electronAPI?.runWorkflow({ nodes, edges })
            .then((res: any) => console.log(res))
            .catch((err: any) => console.error(err));
    };

    // Derived state for the inspector
    const selectedNode = useMemo(() =>
        nodes.find((n) => n.id === selectedNodeId) || null,
        [nodes, selectedNodeId]);

    return (
        <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#18181b] text-[#ccc] font-sans">
            {/* Top Bar */}
            <header className="h-14 bg-[#1f1f23] border-b border-[#000] flex items-center px-4 justify-between shrink-0 select-none">
                <GardeniasLogo variant="full" theme="dark" className="h-10" />

                <div className="flex bg-[#121212] rounded p-0.5 gap-0.5">
                    <button className="px-3 py-0.5 text-[11px] font-medium bg-[#333] text-white rounded-[2px] shadow-sm">WORKFLOWS</button>
                    <button className="px-3 py-0.5 text-[11px] font-medium hover:bg-[#222] text-[#888] rounded-[2px] transition-colors">PLOTTING</button>
                    <button className="px-3 py-0.5 text-[11px] font-medium hover:bg-[#222] text-[#888] rounded-[2px] transition-colors">CODE</button>
                    <button className="px-3 py-0.5 text-[11px] font-medium bg-[#d97706] text-black rounded-[2px] shadow-sm">REPORT</button>
                </div>

                <button
                    className="flex items-center gap-2 bg-[#2a2a2a] hover:bg-[#333] text-[#ccc] px-3 py-1 rounded-[3px] text-xs transition-colors border border-[#333]"
                    onClick={runWorkflow}
                >
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    RUN
                </button>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Left Panel: Media Pool / Effects */}
                <div className="w-[320px] flex flex-col border-r border-[#000] bg-[#1f1f23]">
                    <div className="h-8 bg-[#2a2a2a] flex items-center px-3 border-b border-[#121212] text-xs font-semibold text-[#bbb]">
                        GARDENS
                    </div>
                    <Sidebar />
                </div>

                {/* Center: Node Graph */}
                <div className="flex-1 bg-[#121212] flex flex-col overflow-hidden">
                    <div className="flex-1 relative overflow-hidden" onDrop={onDrop} onDragOver={onDragOver}>
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onNodeClick={onNodeClick}
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

                    {/* Bottom Time/Log Panel */}
                    <Terminal />
                </div>

                {/* Right Panel: Inspector */}
                <Inspector
                    node={selectedNode}
                    onUpdate={updateNodeData}
                />
            </div>
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
