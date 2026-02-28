import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, addEdge, Connection, NodeTypes, EdgeTypes, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Sidebar } from './components/Sidebar';
import { NodesSidebar } from './components/NodesSidebar';
import { Terminal } from './components/Terminal';
import { Inspector } from './components/Inspector';
import { GardeniasLogo } from './components/GardeniasLogo';
import { ResolveNode } from './components/ResolveNode';
import { PostItNode } from './components/PostItNode';
import { CodeEditor } from './components/CodeEditor';
import { NodeContextMenu } from './components/NodeContextMenu';
import { CustomMiniMap } from './components/CustomMiniMap';
import { StreamEdge } from './components/StreamEdge';
import { ToolRegistry } from './registry/tools';
import { Node } from '@xyflow/react';
import { PackageManager } from './components/PackageManager';
import { EnginePreferences } from './components/EnginePreferences';
import { exportToJson, importFromJson } from './utils/fileHandler';
import { getLayoutedElements } from './utils/layout';
import { validateWorkflowLibraries, installMissingLibraries } from './utils/LibraryValidator';
import { useWorkflowStore, initWorkflowEventListeners } from './stores/workflowStore';
import { Download, Upload, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Settings } from 'lucide-react';
import { ProgressBar } from './components/ProgressBar';
import { useUndoRedo } from './hooks/useUndoRedo';
import { DataView } from './components/DataView';

export interface NodeData {
    label: string;
    category?: string;
    toolId?: string;
    toolData?: any;
    parameterValues?: Record<string, any>;
    code?: string; // Python/R code for execution
    language?: 'python' | 'r'; // Execution language
    executionState?: 'pending' | 'queued' | 'running' | 'success' | 'error' | 'skipped' | 'cancelled' | 'timeout'; // Visual feedback
    timeout?: number;        // Execution timeout in seconds (default: 60)
    memoryLimit?: number;    // Memory limit in MB (Python only, default: 512)
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
    const [inspectorTab, setInspectorTab] = useState<'inspector' | 'agent' | 'code' | 'variables'>('inspector');
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

    // --- Workflow Auto-Persistence ---
    const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>('saved');
    const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isInitialized = useRef(false);

    // Restore from localStorage on mount
    const getInitialNodes = (): AppNode[] => {
        try {
            const saved = localStorage.getItem('gardenia:autosave');
            if (saved) {
                const data = JSON.parse(saved);
                if (data.nodes?.length > 0) {
                    console.log(`[AutoSave] Restored ${data.nodes.length} nodes, ${data.edges?.length || 0} edges`);
                    return data.nodes;
                }
            }
        } catch (e) {
            console.warn('[AutoSave] Failed to restore:', e);
        }
        return initialNodes;
    };

    const getInitialEdges = () => {
        try {
            const saved = localStorage.getItem('gardenia:autosave');
            if (saved) {
                const data = JSON.parse(saved);
                return data.edges || initialEdges;
            }
        } catch (e) { /* fall through */ }
        return initialEdges;
    };

    const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>(getInitialNodes());
    const [edges, setEdges, onEdgesChange] = useEdgesState(getInitialEdges());

    // Undo/Redo hook
    const { pushSnapshot, undo, redo, canUndo, canRedo, past } = useUndoRedo();

    // Undo/Redo handlers
    const handleUndo = useCallback(() => {
        const snapshot = undo(nodes, edges);
        if (snapshot) {
            setNodes(snapshot.nodes as AppNode[]);
            setEdges(snapshot.edges);
        }
    }, [nodes, edges, undo, setNodes, setEdges]);

    const handleRedo = useCallback(() => {
        const snapshot = redo(nodes, edges);
        if (snapshot) {
            setNodes(snapshot.nodes as AppNode[]);
            setEdges(snapshot.edges);
        }
    }, [nodes, edges, redo, setNodes, setEdges]);

    // Auto-save to localStorage on changes (debounced 1s)
    useEffect(() => {
        if (!isInitialized.current) {
            isInitialized.current = true;
            return; // Skip first render (it's the restore)
        }
        setSaveStatus('unsaved');
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => {
            try {
                const saveData = {
                    nodes: nodes.map(n => ({
                        ...n,
                        data: { ...n.data, executionState: undefined },
                    })),
                    edges,
                    savedAt: new Date().toISOString(),
                };
                localStorage.setItem('gardenia:autosave', JSON.stringify(saveData));
                setSaveStatus('saved');
            } catch (e) {
                console.warn('[AutoSave] Failed to save:', e);
            }
        }, 1000);
        return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
    }, [nodes, edges]);

    // Undo/Redo keyboard shortcuts - always active
    useEffect(() => {
        const onUndoRedoKeyDown = (e: KeyboardEvent) => {
            // Undo: Ctrl+Z (without shift)
            if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                handleUndo();
            }
            // Redo: Ctrl+Shift+Z or Ctrl+Y
            if ((e.ctrlKey && e.key === 'z' && e.shiftKey) || (e.ctrlKey && e.key === 'y')) {
                e.preventDefault();
                handleRedo();
            }
        };

        window.addEventListener('keydown', onUndoRedoKeyDown);
        return () => window.removeEventListener('keydown', onUndoRedoKeyDown);
    }, [handleUndo, handleRedo]);

    // --- Copy/Paste ---
    const clipboard = useRef<{ nodes: AppNode[]; edges: any[] } | null>(null);

    useEffect(() => {
        const onCopyPaste = (e: KeyboardEvent) => {
            // Skip if user is typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

            // Copy: Ctrl+C
            if (e.ctrlKey && e.key === 'c' && !e.shiftKey) {
                const selectedNodes = nodes.filter(n => n.selected);
                if (selectedNodes.length === 0) return;
                const selectedIds = new Set(selectedNodes.map(n => n.id));
                const selectedEdges = edges.filter(e => selectedIds.has(e.source) && selectedIds.has(e.target));
                clipboard.current = { nodes: selectedNodes, edges: selectedEdges };
                console.log(`[Clipboard] Copied ${selectedNodes.length} nodes, ${selectedEdges.length} edges`);
            }

            // Paste: Ctrl+V
            if (e.ctrlKey && e.key === 'v' && !e.shiftKey) {
                if (!clipboard.current || clipboard.current.nodes.length === 0) return;
                e.preventDefault();
                pushSnapshot(nodes, edges, 'Paste nodes');

                const idMap = new Map<string, string>();
                const offset = 50;

                const newNodes = clipboard.current.nodes.map(n => {
                    const newId = `${n.id.split('-')[0]}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                    idMap.set(n.id, newId);
                    return {
                        ...n,
                        id: newId,
                        position: { x: n.position.x + offset, y: n.position.y + offset },
                        selected: true,
                        data: { ...n.data, executionState: undefined },
                    };
                });

                const newEdges = clipboard.current.edges.map(e => ({
                    ...e,
                    id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    source: idMap.get(e.source) || e.source,
                    target: idMap.get(e.target) || e.target,
                }));

                // Deselect current nodes, add new ones
                setNodes(nds => [
                    ...nds.map(n => ({ ...n, selected: false })),
                    ...newNodes,
                ]);
                setEdges(eds => [...eds, ...newEdges]);
            }
        };

        window.addEventListener('keydown', onCopyPaste);
        return () => window.removeEventListener('keydown', onCopyPaste);
    }, [nodes, edges, pushSnapshot, setNodes, setEdges]);

    // Attach global listeners for resize and node parameters
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') stopResizing();
        };

        const onNodeUpdateParameter = (e: any) => {
            const { nodeId, paramName, value } = e.detail;
            log(`[App] Update param: ${nodeId} -> ${paramName} = ${value}`);
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
            window.addEventListener('click', stopResizing);
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
    const { screenToFlowPosition, fitView } = useReactFlow();
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ type: 'node' | 'edge'; id: string; x: number; y: number } | null>(null);

    // Workflow orchestrator state (used for execution visualization)
    // const workflowStatus = useWorkflowStore((state) => state.status);
    // const updateNodeExecutionState = useWorkflowStore((state) => state.updateNodeState);
    // const setWorkflowStatus = useWorkflowStore((state) => state.setStatus);
    const addWorkflowLog = useWorkflowStore((state) => state.addLog);
    const nodeStates = useWorkflowStore((state) => state.nodeStates);

    // Initialize workflow event listeners on mount
    useEffect(() => {
        initWorkflowEventListeners((msg) => log(msg));
    }, []);

    // Listen for dynamic variable creation to update node ports
    useEffect(() => {
        const api = (window as any).electronAPI;
        if (!api?.onNodeVariables) return;

        api.onNodeVariables(({ nodeId, variables }: { nodeId: string, variables: string[] }) => {
            log(`[App] Node ${nodeId} created variables: ${variables.join(', ')}`);

            setNodes((nds) => nds.map((node) => {
                if (node.id === nodeId && node.data.toolId === 'variables') {
                    const newOutputs = variables.map(v => ({
                        name: v,
                        type: 'dataset',
                        description: `Variable: ${v}`
                    }));

                    return {
                        ...node,
                        data: {
                            ...node.data,
                            toolData: {
                                ...node.data.toolData,
                                outputs: newOutputs.length > 0 ? newOutputs : node.data.toolData.outputs
                            }
                        }
                    };
                }
                return node;
            }));
        });
    }, [setNodes]);

    // Sync workflowStore node states to canvas nodes for real-time visualization
    useEffect(() => {
        if (nodeStates.size === 0) return;

        setNodes((nds) =>
            nds.map((n) => {
                const stateInfo = nodeStates.get(n.id);
                if (stateInfo) {
                    return { ...n, data: { ...n.data, executionState: stateInfo.state } };
                }
                return n;
            })
        );
    }, [nodeStates, setNodes]);

    // Console logging ref
    const logToConsoleRef = useRef<((log: string) => void) | null>(null);

    const log = (message: string) => {
        console.log(message);
        if (logToConsoleRef.current) {
            logToConsoleRef.current(message);
        }
        // Also add to workflow store
        addWorkflowLog(message);
    };

    const nodeTypes = useMemo<NodeTypes>(() => ({
        resolve: ResolveNode,
        postit: PostItNode
    }), []);

    const edgeTypes = useMemo<EdgeTypes>(() => ({
        default: StreamEdge,
    }), []);

    const onConnect = useCallback(
        (params: Connection) => {
            pushSnapshot(nodes, edges, 'Connect nodes'); // Save state before connecting
            setEdges((eds) => addEdge(params, eds));
        },
        [setEdges, pushSnapshot, nodes, edges],
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

            // Save state before adding node
            pushSnapshot(nodes, edges, `Add ${tool.name} node`);

            setNodes((nds) => nds.concat(newNode));
        },
        [screenToFlowPosition, setNodes, pushSnapshot, nodes, edges],
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
        setContextMenu(null);
    }, []);

    // Right-click context menu on nodes
    const onNodeContextMenu = useCallback((event: React.MouseEvent, node: AppNode) => {
        event.preventDefault();
        // Don't show for start/end/postit nodes
        if (node.data.toolId === 'flow-start' || node.data.toolId === 'flow-end' || node.type === 'postit') return;
        setContextMenu({ type: 'node', id: node.id, x: event.clientX, y: event.clientY });
    }, []);

    const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: any) => {
        event.preventDefault();
        setContextMenu({ type: 'edge', id: edge.id, x: event.clientX, y: event.clientY });
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

    // --- Workflow data builder (reused by full, partial, and only execution) ---
    const buildWorkflowData = useCallback(() => {
        const backend = localStorage.getItem('gardenia_backend') || 'local';
        return {
            backend,
            nodes: nodes.map(n => ({
                id: n.id,
                type: n.type,
                data: {
                    label: n.data.label,
                    toolId: n.data.toolId,
                    code: n.data.code || '',
                    language: n.data.language || 'python',
                    parameterValues: n.data.parameterValues || {},
                    dependencies: n.data.dependencies || [],
                }
            })),
            edges: edges.map(e => ({
                id: e.id,
                source: e.source,
                target: e.target,
                sourceHandle: e.sourceHandle,
                targetHandle: e.targetHandle,
            })),
        };
    }, [nodes, edges]);

    // --- Partial execution handlers ---
    const executeFromNode = useCallback(async (nodeId: string) => {
        log(`=== PARTIAL EXECUTION: Run from ${nodeId} ===`);
        useWorkflowStore.getState().reset();
        useWorkflowStore.getState().setStatus('running');
        const api = (window as any).electronAPI;
        if (!api?.executeWorkflowFrom) { log('❌ executeWorkflowFrom API not available'); return; }
        try {
            const result = await api.executeWorkflowFrom(buildWorkflowData(), nodeId);
            if (result.status === 'success') log('=== PARTIAL EXECUTION COMPLETED ===');
            else log(`❌ Partial execution failed: ${result.error}`);
        } catch (error) {
            log(`❌ Partial execution error: ${error}`);
        } finally {
            setTimeout(() => {
                setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, executionState: undefined } })));
            }, 2000);
        }
    }, [buildWorkflowData, setNodes]);

    const executeOnlyNode = useCallback(async (nodeId: string) => {
        log(`=== SINGLE NODE EXECUTION: ${nodeId} ===`);
        useWorkflowStore.getState().reset();
        useWorkflowStore.getState().setStatus('running');
        const api = (window as any).electronAPI;
        if (!api?.executeWorkflowOnly) { log('❌ executeWorkflowOnly API not available'); return; }
        try {
            const result = await api.executeWorkflowOnly(buildWorkflowData(), nodeId);
            if (result.status === 'success') log('=== SINGLE NODE EXECUTION COMPLETED ===');
            else log(`❌ Single node execution failed: ${result.error}`);
        } catch (error) {
            log(`❌ Single node execution error: ${error}`);
        } finally {
            setTimeout(() => {
                setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, executionState: undefined } })));
            }, 2000);
        }
    }, [buildWorkflowData, setNodes]);

    const deleteNode = useCallback((nodeId: string) => {
        pushSnapshot(nodes, edges, 'Delete node');
        const selectedNodes = nodes.filter(n => n.selected);
        if (selectedNodes.length > 1) {
            const selectedIds = new Set(selectedNodes.map(n => n.id));
            setNodes(nds => nds.filter(n => !selectedIds.has(n.id)));
            setEdges(eds => eds.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target)));
        } else {
            setNodes(nds => nds.filter(n => n.id !== nodeId));
            setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
        }
    }, [pushSnapshot, nodes, edges, setNodes, setEdges]);

    const deleteEdge = useCallback((edgeId: string) => {
        pushSnapshot(nodes, edges, 'Delete edge');
        setEdges(eds => eds.filter(e => e.id !== edgeId));
    }, [pushSnapshot, nodes, edges, setEdges]);

    // --- Node Grouping ---
    const groupSelectedNodes = useCallback(() => {
        const selectedNodes = nodes.filter(n => n.selected && n.type !== 'group');
        if (selectedNodes.length < 2) return;

        pushSnapshot(nodes, edges, 'Group nodes');

        // Calculate bounding box of selected nodes
        const padding = 40;
        const headerHeight = 30;
        const minX = Math.min(...selectedNodes.map(n => n.position.x)) - padding;
        const minY = Math.min(...selectedNodes.map(n => n.position.y)) - padding - headerHeight;
        const maxX = Math.max(...selectedNodes.map(n => n.position.x + 180)) + padding;
        const maxY = Math.max(...selectedNodes.map(n => n.position.y + 100)) + padding;

        const groupId = `group-${Date.now()}`;
        const groupNode: AppNode = {
            id: groupId,
            type: 'group',
            position: { x: minX, y: minY },
            data: { label: 'Group' },
            style: {
                width: maxX - minX,
                height: maxY - minY,
                backgroundColor: 'rgba(52, 211, 153, 0.05)',
                border: '1px dashed rgba(52, 211, 153, 0.3)',
                borderRadius: '8px',
            },
        };

        // Re-position children relative to group and set parentId
        const updatedNodes = nodes.map(n => {
            if (n.selected && n.type !== 'group') {
                return {
                    ...n,
                    position: { x: n.position.x - minX, y: n.position.y - minY },
                    parentId: groupId,
                    extent: 'parent' as const,
                    selected: false,
                };
            }
            return n;
        });

        // Insert group node before its children
        setNodes([groupNode, ...updatedNodes]);
    }, [nodes, edges, pushSnapshot, setNodes]);

    const ungroupNodes = useCallback((groupId: string) => {
        pushSnapshot(nodes, edges, 'Ungroup nodes');
        const groupNode = nodes.find(n => n.id === groupId);
        if (!groupNode) return;

        setNodes(nds => {
            const updated = nds.map(n => {
                if (n.parentId === groupId) {
                    return {
                        ...n,
                        position: {
                            x: n.position.x + groupNode.position.x,
                            y: n.position.y + groupNode.position.y,
                        },
                        parentId: undefined,
                        extent: undefined,
                    };
                }
                return n;
            });
            return updated.filter(n => n.id !== groupId);
        });
    }, [nodes, edges, pushSnapshot, setNodes]);

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

            // Validate required libraries before execution
            log('Checking required libraries...');
            try {
                const missing = await validateWorkflowLibraries(nodes);

                if (missing.python.length > 0 || missing.r.length > 0) {
                    // Show missing libraries
                    if (missing.python.length > 0) {
                        log(`⚠️  Missing Python packages: ${missing.python.join(', ')}`);
                    }
                    if (missing.r.length > 0) {
                        log(`⚠️  Missing R packages: ${missing.r.join(', ')}`);
                    }

                    // Prompt user for installation
                    const shouldInstall = window.confirm(
                        `Some required libraries are missing:\n\n` +
                        (missing.python.length > 0 ? `Python: ${missing.python.join(', ')}\n` : '') +
                        (missing.r.length > 0 ? `R: ${missing.r.join(', ')}\n` : '') +
                        `\nDo you want to install them now?`
                    );

                    if (shouldInstall) {
                        log('Installing missing libraries...');
                        await installMissingLibraries(missing, log);
                        log('✅ All libraries installed successfully');
                    } else {
                        log('⚠️  Workflow execution cancelled - missing libraries not installed');
                        return; // Stop execution
                    }
                } else {
                    log('✅ All required libraries are installed');
                }
            } catch (error) {
                log(`❌ Error checking libraries: ${error}`);
                const proceed = window.confirm(
                    'Failed to verify library installation. Do you want to proceed anyway?'
                );
                if (!proceed) {
                    log('⚠️  Workflow execution cancelled');
                    return;
                }
            }

            // Reset workflow store state
            useWorkflowStore.getState().reset();
            useWorkflowStore.getState().setStatus('running');

            const workflowData = buildWorkflowData();

            log('[DAG Engine] Sending workflow for execution...');

            // Check if orchestrator API is available
            const api = (window as any).electronAPI;
            if (api?.executeWorkflow) {
                // Use new DAG orchestrator
                try {
                    const result = await api.executeWorkflow(workflowData);

                    if (result.status === 'success') {
                        log('=== WORKFLOW EXECUTION COMPLETED ===');
                    } else {
                        log(`❌ Workflow failed: ${result.error || 'Unknown error'}`);
                    }
                } catch (error) {
                    log(`❌ DAG execution error: ${error}`);
                    useWorkflowStore.getState().setStatus('error');
                }
            } else {
                // Fallback to legacy execution
                log('[Fallback] Using legacy execution (DAG orchestrator not available)');
                await runWorkflowLegacy();
            }

        } finally {
            // Reset node execution states after delay
            setTimeout(() => {
                setNodes((nds) =>
                    nds.map((n) => ({
                        ...n,
                        data: { ...n.data, executionState: undefined }
                    }))
                );
            }, 2000);
        }
    };

    // Legacy workflow execution (fallback)
    const runWorkflowLegacy = async () => {
        // Get execution order using Topological Sort (Kahn's Algorithm)
        const getExecutionOrder = (startNodeId: string): string[] => {
            const inDegree = new Map<string, number>();
            const order: string[] = [];
            const queue: string[] = [];

            nodes.forEach(node => {
                inDegree.set(node.id, 0);
            });

            edges.forEach(edge => {
                const target = edge.target;
                inDegree.set(target, (inDegree.get(target) || 0) + 1);
            });

            if (inDegree.get(startNodeId) === 0) {
                queue.push(startNodeId);
            } else {
                nodes.forEach(node => {
                    if (inDegree.get(node.id) === 0) {
                        if (!queue.includes(node.id)) queue.push(node.id);
                    }
                });
            }

            while (queue.length > 0) {
                const nodeId = queue.shift()!;
                order.push(nodeId);

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

        const startNodes = nodes.filter(n => n.data.toolId === 'flow-start');
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

            if (toolId === 'flow-start') {
                log(`[START] Workflow initiated`);
                continue;
            }

            if (toolId === 'flow-end') {
                log(`[END] Workflow completed successfully ✅`);
                break;
            }

            const code = node.data.code || '# No code defined';
            const language = node.data.language || 'python';
            const params = node.data.parameterValues || {};

            log(`[${node.data.label}] Params: ${JSON.stringify(params)}`);

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

                    setNodes((nds) =>
                        nds.map((n) =>
                            n.id === nodeId
                                ? { ...n, data: { ...n.data, executionState: 'success' } }
                                : n
                        )
                    );
                } else {
                    log(`[${node.data.label}] ❌ Error:\n${result.error || result.output}`);

                    setNodes((nds) =>
                        nds.map((n) =>
                            n.id === nodeId
                                ? { ...n, data: { ...n.data, executionState: 'error' } }
                                : n
                        )
                    );

                    return;
                }
            } catch (error) {
                log(`[${node.data.label}] ❌ Exception:\n${error}`);

                setNodes((nds) =>
                    nds.map((n) =>
                        n.id === nodeId
                            ? { ...n, data: { ...n.data, executionState: 'error' } }
                            : n
                    )
                );

                return;
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        log('=== WORKFLOW EXECUTION COMPLETED ===');
    };
    const onExport = useCallback(() => {
        const workflowData = {
            nodes,
            edges,
            version: '1.0.0'
        };
        exportToJson(workflowData, `workflow-${Date.now()}.gardenia`);
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
    const [isEditMenuOpen, setIsEditMenuOpen] = useState(false);
    const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
    const [preferencesTab, setPreferencesTab] = useState<'engine' | 'libraries'>('engine');
    const [showMiniMap, setShowMiniMap] = useState(true);

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
                <div className="relative">
                    <button
                        className={`px-3 py-1 text-xs hover:bg-[#333] rounded-sm transition-colors ${isFileMenuOpen ? 'bg-[#333]' : ''}`} // Logic for isEditMenuOpen handled below
                        onClick={() => { setIsEditMenuOpen(!isEditMenuOpen); setIsFileMenuOpen(false); }}
                    >
                        Edit
                    </button>
                    {isEditMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsEditMenuOpen(false)} />
                            <div className="absolute top-full left-0 mt-1 w-56 bg-[#2a2a2a] border border-[#333] rounded-md shadow-xl py-1 z-50 flex flex-col">
                                <button
                                    className={`px-4 py-2 text-xs text-left flex items-center justify-between hover:bg-[#3e3e3e] ${!canUndo ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    onClick={() => {
                                        if (canUndo) handleUndo();
                                        setIsEditMenuOpen(false);
                                    }}
                                    disabled={!canUndo}
                                >
                                    <span>Undo {canUndo && past.length > 0 ? `"${past[past.length - 1].description.slice(0, 15)}..."` : ''}</span>
                                    <span className="text-gray-500 ml-4">Ctrl+Z</span>
                                </button>
                                <button
                                    className={`px-4 py-2 text-xs text-left flex items-center justify-between hover:bg-[#3e3e3e] ${!canRedo ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    onClick={() => {
                                        if (canRedo) handleRedo();
                                        setIsEditMenuOpen(false);
                                    }}
                                    disabled={!canRedo}
                                >
                                    <span>Redo</span>
                                    <span className="text-gray-500 ml-4">Ctrl+Y</span>
                                </button>

                                <div className="h-[1px] bg-[#333] my-1" />

                                <div className="px-4 py-1 text-[10px] font-bold text-gray-500 uppercase">History</div>
                                {past.length === 0 ? (
                                    <div className="px-4 py-1 text-xs text-gray-600 italic">No changes yet</div>
                                ) : (
                                    <div className="flex flex-col max-h-40 overflow-y-auto">
                                        {past.slice().reverse().slice(0, 5).map((snapshot, i) => (
                                            <div key={snapshot.timestamp} className="px-4 py-1 text-xs text-gray-400 flex justify-between">
                                                <span>{snapshot.description}</span>
                                                <span className="text-[10px] text-gray-600">{i === 0 ? '(Latest)' : ''}</span>
                                            </div>
                                        ))}
                                        {past.length > 5 && (
                                            <div className="px-4 py-1 text-[10px] text-gray-600 italic text-center">
                                                + {past.length - 5} more
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
                <button className="px-3 py-1 text-xs hover:bg-[#333] rounded-sm transition-colors opacity-50 cursor-not-allowed">View</button>
                <button className="px-3 py-1 text-xs hover:bg-[#333] rounded-sm transition-colors opacity-50 cursor-not-allowed">Help</button>

                {/* Save Status Indicator */}
                <div className="flex items-center gap-1.5 ml-3 px-2">
                    <div className={`w-1.5 h-1.5 rounded-full transition-colors ${saveStatus === 'saved' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                    <span className="text-[10px] text-gray-500">{saveStatus === 'saved' ? 'Saved' : 'Unsaved'}</span>
                </div>

                {/* Window Drag Region (fake) */}
                <div className="flex-1 h-full drag-region" style={{ WebkitAppRegion: 'drag' } as any} />
            </div>

            {/* Top Bar */}
            <header className="h-14 bg-[#1f1f23] border-b border-[#000] flex items-center px-4 justify-between shrink-0 select-none relative">
                <div className="flex items-center gap-4 z-10">
                    <button
                        onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
                        className="text-[#666] hover:text-[#ccc] transition-colors"
                        title={isLeftPanelOpen ? "Close Sidebar" : "Open Sidebar"}
                    >
                        {isLeftPanelOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
                    </button>
                    <GardeniasLogo variant="full" theme="dark" className="h-10" />
                </div>

                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex bg-[#121212] rounded p-0.5 gap-0.5">
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

                <div className="flex items-center gap-4 z-10">
                    <ProgressBar />
                    <button
                        className="flex items-center gap-2 bg-[#2a2a2a] hover:bg-[#333] text-[#ccc] px-3 py-1 rounded-[3px] text-xs transition-colors border border-[#333]"
                        onClick={() => { }}
                    >
                        VALIDATE
                    </button>
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
                                onNodeContextMenu={onNodeContextMenu}
                                onEdgeContextMenu={onEdgeContextMenu}
                                onPaneClick={onPaneClick}
                                nodeTypes={nodeTypes}
                                edgeTypes={edgeTypes}
                                fitView
                                colorMode="dark"
                                proOptions={{ hideAttribution: true }}
                            >
                                <Background gap={15} size={1} color="#222" />
                                <Controls className="!bg-[#2a2a2a] !border-[#000] !fill-[#888] !rounded-[2px]" />
                                {showMiniMap && <CustomMiniMap />}
                                {/* MiniMap toggle button */}
                                <button
                                    onClick={() => setShowMiniMap(!showMiniMap)}
                                    className={`absolute z-10 w-7 h-7 rounded-md flex items-center justify-center transition-all text-xs
                                        ${showMiniMap
                                            ? 'bottom-[165px] right-3 bg-transparent text-[#555] hover:text-[#aaa]'
                                            : 'bottom-3 right-3 bg-[#2a2a2e] border border-[#444] text-[#888] hover:text-white hover:border-[#34d399] shadow-lg'
                                        }`}
                                    title={showMiniMap ? 'Hide minimap' : 'Show minimap'}
                                >
                                    {showMiniMap ? '✕' : '🗺'}
                                </button>
                            </ReactFlow>
                            {contextMenu && contextMenu.type === 'node' && (
                                <NodeContextMenu
                                    nodeId={contextMenu.id}
                                    nodeLabel={nodes.find(n => n.id === contextMenu.id)?.data.label || 'Node'}
                                    x={contextMenu.x}
                                    y={contextMenu.y}
                                    selectedCount={nodes.filter(n => n.selected).length || 1}
                                    onRunFrom={executeFromNode}
                                    onRunOnly={executeOnlyNode}
                                    onDelete={deleteNode}
                                    onGroup={groupSelectedNodes}
                                    onUngroup={ungroupNodes}
                                    isGrouped={nodes.find(n => n.id === contextMenu.id)?.type === 'group'}
                                    onClose={() => setContextMenu(null)}
                                />
                            )}
                            {contextMenu && contextMenu.type === 'edge' && (
                                <div
                                    className="fixed z-[100] min-w-[150px] bg-[#2a2a2e] border border-[#444] rounded-lg shadow-2xl py-1.5 select-none"
                                    style={{ left: Math.min(contextMenu.x, window.innerWidth - 180), top: Math.min(contextMenu.y, window.innerHeight - 100) }}
                                >
                                    <div className="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-[#333] mb-1">
                                        Connection
                                    </div>
                                    <button
                                        className="w-full px-3 py-2 text-xs text-left hover:bg-red-900/30 flex items-center gap-2.5 text-red-400 transition-colors"
                                        onClick={() => { deleteEdge(contextMenu.id); setContextMenu(null); }}
                                    >
                                        <span className="text-sm">✂</span>
                                        Delete Connection
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {viewMode === 'data' && (
                        <DataView />
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
                    <div className="bg-[#1f1f23] border border-[#333] rounded-lg shadow-2xl w-[850px] max-w-full transform scale-100 transition-all flex flex-col" style={{ height: '580px' }}>
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 pt-5 pb-0">
                            <h2 className="text-xl font-bold text-[#ccc] flex items-center gap-2">
                                <Settings size={20} />
                                Preferences
                            </h2>
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-1 px-6 pt-3 pb-0">
                            <button
                                onClick={() => setPreferencesTab('engine')}
                                className={`px-4 py-1.5 text-xs font-medium rounded-t-md transition-colors ${preferencesTab === 'engine'
                                    ? 'bg-[#2a2a2a] text-emerald-400 border border-[#333] border-b-[#2a2a2a]'
                                    : 'text-[#888] hover:text-[#ccc] hover:bg-[#252528]'
                                    }`}
                            >
                                ⚡ Engine
                            </button>
                            <button
                                onClick={() => setPreferencesTab('libraries')}
                                className={`px-4 py-1.5 text-xs font-medium rounded-t-md transition-colors ${preferencesTab === 'libraries'
                                    ? 'bg-[#2a2a2a] text-emerald-400 border border-[#333] border-b-[#2a2a2a]'
                                    : 'text-[#888] hover:text-[#ccc] hover:bg-[#252528]'
                                    }`}
                            >
                                📦 Libraries
                            </button>
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-hidden px-6 pt-4 pb-2">
                            <div className="h-full bg-[#2a2a2a] rounded-lg border border-[#333] p-4 overflow-hidden">
                                {preferencesTab === 'engine' && <EnginePreferences />}
                                {preferencesTab === 'libraries' && <PackageManager />}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex justify-end px-6 py-3">
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
