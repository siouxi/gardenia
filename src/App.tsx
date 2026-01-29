import { useCallback, useMemo } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, addEdge, Connection, NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Sidebar } from './components/Sidebar';
import { Terminal } from './components/Terminal';
import { GardeniasLogo } from './components/GardeniasLogo';
import { ResolveNode } from './components/ResolveNode';
import { Settings, Sliders } from 'lucide-react';
const initialNodes = [
    { id: '1', position: { x: 100, y: 100 }, data: { label: 'Input', toolType: 'default', type: 'input' }, type: 'resolve' },
];
const initialEdges: any[] = [];

export default function App() {
    const [nodes, , onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    const nodeTypes = useMemo<NodeTypes>(() => ({ resolve: ResolveNode }), []);

    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge(params, eds)),
        [setEdges],
    );

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
                    onClick={() => {
                        (window as any).electronAPI?.runWorkflow({ nodes, edges })
                            .then((res: any) => console.log(res))
                            .catch((err: any) => console.error(err));
                    }}
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
                    <div className="flex-1 relative overflow-hidden">
                        <ReactFlow
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
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
                <div className="w-[280px] flex flex-col border-l border-[#000] bg-[#1f1f23]">
                    <div className="h-8 bg-[#2a2a2a] flex items-center px-3 justify-between border-b border-[#121212]">
                        <span className="text-xs font-semibold text-[#bbb]">INSPECTOR</span>
                        <Settings size={12} className="text-[#666]" />
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase font-bold text-[#666]">Node Name</label>
                            <input type="text" value="Input Node" className="w-full bg-[#121212] border border-[#333] rounded-[2px] px-2 py-1 text-xs text-[#ccc] focus:border-[#d97706] outline-none" disabled />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] uppercase font-bold text-[#666]">Parameters</label>
                            <div className="bg-[#18181b] p-2 rounded border border-[#222] space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-[#999]">Threshold</span>
                                    <span className="text-xs text-[#d97706]">0.85</span>
                                </div>
                                <div className="h-1 bg-[#333] rounded-full overflow-hidden">
                                    <div className="w-[85%] h-full bg-[#d97706]" />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-[#999] hover:text-[#ccc] cursor-pointer">
                                <Sliders size={12} /> <span>Advanced Settings</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
