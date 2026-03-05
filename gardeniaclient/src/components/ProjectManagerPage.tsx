/**
 * Project Manager Page
 * =====================
 *
 * DaVinci Resolve-style project selection screen.
 * Shows on startup — user picks or creates a project.
 */

import { useState, useEffect, useCallback } from 'react';
import { Plus, FolderOpen, Trash2, Clock, Pencil } from 'lucide-react';

interface NodePreviewItem {
    x: number;
    y: number;
    label: string;
    type?: string;
}

interface ProjectEntry {
    name: string;
    path: string;
    modifiedAt: string;
    nodePreview?: NodePreviewItem[];
    nodeCount?: number;
    edgeCount?: number;
}

// Gardenia logo SVG as inline component
function GardeniaIcon({ size = 40 }: { size?: number }) {
    return (
        <svg viewBox="0 0 100 100" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="12" fill="url(#g1)" />
            <path d="M 50 15 Q 35 20 35 35 Q 35 45 50 50 Q 35 55 35 65 Q 35 80 50 85" stroke="url(#g2)" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M 50 15 Q 65 20 65 35 Q 65 45 50 50 Q 65 55 65 65 Q 65 80 50 85" stroke="url(#g2)" strokeWidth="3" fill="none" strokeLinecap="round" />
            <ellipse cx="35" cy="25" rx="8" ry="12" fill="url(#g3)" transform="rotate(-30 35 25)" />
            <ellipse cx="65" cy="25" rx="8" ry="12" fill="url(#g3)" transform="rotate(30 65 25)" />
            <ellipse cx="25" cy="50" rx="8" ry="12" fill="url(#g3)" transform="rotate(-90 25 50)" />
            <ellipse cx="75" cy="50" rx="8" ry="12" fill="url(#g3)" transform="rotate(90 75 50)" />
            <ellipse cx="35" cy="75" rx="8" ry="12" fill="url(#g3)" transform="rotate(-150 35 75)" />
            <ellipse cx="65" cy="75" rx="8" ry="12" fill="url(#g3)" transform="rotate(150 65 75)" />
            <circle cx="35" cy="35" r="3" fill="#059669" />
            <circle cx="65" cy="35" r="3" fill="#059669" />
            <circle cx="35" cy="65" r="3" fill="#059669" />
            <circle cx="65" cy="65" r="3" fill="#059669" />
            <defs>
                <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#059669" />
                    <stop offset="100%" stopColor="#047857" />
                </linearGradient>
                <linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#059669" />
                    <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
                <linearGradient id="g3" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6ee7b7" />
                    <stop offset="100%" stopColor="#34d399" />
                </linearGradient>
            </defs>
        </svg>
    );
}

// Mini workflow preview — renders nodes as dots in a scaled minimap
function WorkflowPreview({ nodes }: { nodes?: NodePreviewItem[] }) {
    if (!nodes || nodes.length === 0) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <GardeniaIcon size={32} />
            </div>
        );
    }

    // Compute bounding box
    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const padding = 20;

    return (
        <svg viewBox={`0 0 100 100`} style={{ width: '100%', height: '100%' }}>
            {nodes.map((node, i) => {
                const nx = padding + ((node.x - minX) / rangeX) * (100 - padding * 2);
                const ny = padding + ((node.y - minY) / rangeY) * (100 - padding * 2);
                const isPostIt = node.type === 'postit';

                return (
                    <g key={i}>
                        {isPostIt ? (
                            <g>
                                <polygon
                                    points={`
                                        ${nx - 8},${ny - 8}
                                        ${nx + 8},${ny - 8}
                                        ${nx + 8},${ny + 4}
                                        ${nx + 4},${ny + 8}
                                        ${nx - 8},${ny + 8}
                                    `}
                                    fill="#fef08a"
                                    stroke="#ca8a04"
                                    strokeWidth={0.5}
                                />
                                <polygon
                                    points={`
                                        ${nx + 8},${ny + 4} 
                                        ${nx + 4},${ny + 4} 
                                        ${nx + 4},${ny + 8}
                                    `}
                                    fill="#eab308"
                                    stroke="#ca8a04"
                                    strokeWidth={0.5}
                                    strokeLinejoin="round"
                                />
                            </g>
                        ) : (
                            <rect
                                x={nx - 8}
                                y={ny - 4}
                                width={16}
                                height={8}
                                rx={2}
                                fill="rgba(52, 211, 153, 0.25)"
                                stroke="rgba(52, 211, 153, 0.5)"
                                strokeWidth={0.5}
                            />
                        )}
                        {!isPostIt && (
                            <text
                                x={nx}
                                y={ny + 1.5}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={3}
                                fill="rgba(52, 211, 153, 0.7)"
                                fontFamily="Inter, sans-serif"
                                fontWeight="400"
                            >
                                {node.label.length > 8 ? node.label.slice(0, 7) + '…' : node.label}
                            </text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}

export function ProjectManagerPage() {
    const [projects, setProjects] = useState<ProjectEntry[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; project: ProjectEntry } | null>(null);
    const [renamingPath, setRenamingPath] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [deletingPath, setDeletingPath] = useState<string | null>(null);
    const api = (window as any).electronAPI;

    // Load recent projects
    const loadProjects = useCallback(async () => {
        if (!api?.listRecentProjects) return;
        const list = await api.listRecentProjects();
        setProjects(list || []);
    }, [api]);

    useEffect(() => {
        loadProjects();
    }, [loadProjects]);

    // Close context menu on click outside
    useEffect(() => {
        const handler = () => setContextMenu(null);
        window.addEventListener('click', handler);
        return () => window.removeEventListener('click', handler);
    }, []);

    const handleCreate = async () => {
        if (!newProjectName.trim()) return;
        await api.createProject(newProjectName.trim());
    };

    const handleOpen = async (leafPath?: string) => {
        await api.openProject(leafPath);
    };

    const handleDelete = async (leafPath: string) => {
        await api.deleteProject(leafPath);
        setDeletingPath(null);
        loadProjects();
        window.focus();
    };

    const handleRename = async (leafPath: string) => {
        if (!renameValue.trim()) { setRenamingPath(null); return; }
        await api.renameProject(leafPath, renameValue.trim());
        setRenamingPath(null);
        loadProjects();
    };

    const formatDate = (iso: string) => {
        try {
            const d = new Date(iso);
            const now = new Date();
            const diffMs = now.getTime() - d.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHrs = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHrs < 24) return `${diffHrs}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;
            return d.toLocaleDateString();
        } catch {
            return '';
        }
    };

    return (
        <div
            style={{
                width: '100vw',
                height: '100vh',
                background: 'linear-gradient(145deg, #0a0a0f 0%, #111118 50%, #0d0d14 100%)',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                color: '#e0e0e0',
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: '32px 40px 0px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: '14px',
                            background: 'linear-gradient(135deg, rgba(52, 211, 153, 0.15), rgba(5, 150, 105, 0.1))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid rgba(52, 211, 153, 0.15)',
                        }}
                    >
                        <GardeniaIcon size={30} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>
                            Gardenia
                        </h1>
                        <p style={{ margin: 0, fontSize: '12px', color: '#666', fontWeight: 400 }}>
                            Project Manager
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => handleOpen()}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 18px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '10px',
                        color: '#aaa',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                        transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                        e.currentTarget.style.color = '#ddd';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                        e.currentTarget.style.color = '#aaa';
                    }}
                >
                    <FolderOpen size={16} />
                    Open .leaf File
                </button>
            </div>

            {/* Project Grid */}
            <div
                style={{
                    flex: 1,
                    padding: '28px 40px',
                    overflowY: 'auto',
                }}
            >
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: '16px',
                    }}
                >
                    {/* New Project Card */}
                    {!isCreating ? (
                        <button
                            onClick={() => setIsCreating(true)}
                            style={{
                                aspectRatio: '4/3',
                                background: 'rgba(52, 211, 153, 0.04)',
                                border: '2px dashed rgba(52, 211, 153, 0.2)',
                                borderRadius: '14px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.25s ease',
                                color: 'rgba(52, 211, 153, 0.6)',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(52, 211, 153, 0.08)';
                                e.currentTarget.style.borderColor = 'rgba(52, 211, 153, 0.4)';
                                e.currentTarget.style.color = '#34d399';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(52, 211, 153, 0.04)';
                                e.currentTarget.style.borderColor = 'rgba(52, 211, 153, 0.2)';
                                e.currentTarget.style.color = 'rgba(52, 211, 153, 0.6)';
                            }}
                        >
                            <Plus size={28} />
                            <span style={{ fontSize: '13px', fontWeight: 500 }}>New Project</span>
                        </button>
                    ) : (
                        <div
                            style={{
                                aspectRatio: '4/3',
                                background: 'rgba(52, 211, 153, 0.06)',
                                border: '2px solid rgba(52, 211, 153, 0.3)',
                                borderRadius: '14px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '14px',
                                padding: '20px',
                            }}
                        >
                            <GardeniaIcon size={28} />
                            <input
                                autoFocus
                                type="text"
                                placeholder="Project name..."
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreate();
                                    if (e.key === 'Escape') { setIsCreating(false); setNewProjectName(''); }
                                }}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    background: 'rgba(0,0,0,0.4)',
                                    border: '1px solid rgba(52, 211, 153, 0.3)',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    fontSize: '13px',
                                    outline: 'none',
                                    textAlign: 'center',
                                    userSelect: 'text',
                                    WebkitUserSelect: 'text',
                                }}
                            />
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={handleCreate}
                                    style={{
                                        padding: '6px 16px',
                                        background: 'linear-gradient(135deg, #34d399, #059669)',
                                        border: 'none',
                                        borderRadius: '6px',
                                        color: '#fff',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Create
                                </button>
                                <button
                                    onClick={() => { setIsCreating(false); setNewProjectName(''); }}
                                    style={{
                                        padding: '6px 14px',
                                        background: 'rgba(255,255,255,0.06)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '6px',
                                        color: '#999',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Existing Project Cards */}
                    {projects.map((project) => (
                        <div
                            key={project.path}
                            style={{
                                aspectRatio: '4/3',
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: '14px',
                                display: 'flex',
                                flexDirection: 'column',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                overflow: 'hidden',
                                position: 'relative',
                            }}
                            onClick={() => handleOpen(project.path)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setContextMenu({ x: e.clientX, y: e.clientY, project });
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                                e.currentTarget.style.borderColor = 'rgba(52, 211, 153, 0.25)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.3)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            {/* Workflow preview area */}
                            <div
                                style={{
                                    flex: 1,
                                    background: 'linear-gradient(135deg, rgba(5, 10, 15, 0.5), rgba(10, 15, 20, 0.3))',
                                    padding: '4px',
                                    overflow: 'hidden',
                                    position: 'relative',
                                }}
                            >
                                <WorkflowPreview nodes={project.nodePreview} />

                                {/* Delete confirmation overlay */}
                                {deletingPath === project.path && (
                                    <div
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            background: 'rgba(0,0,0,0.85)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '12px',
                                            borderRadius: '12px 12px 0 0',
                                        }}
                                    >
                                        <Trash2 size={20} style={{ color: '#f87171' }} />
                                        <span style={{ fontSize: '12px', color: '#ccc' }}>Delete this project?</span>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDelete(project.path); }}
                                                style={{
                                                    padding: '5px 14px',
                                                    background: '#dc2626',
                                                    border: 'none',
                                                    borderRadius: '6px',
                                                    color: '#fff',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Delete
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setDeletingPath(null); }}
                                                style={{
                                                    padding: '5px 14px',
                                                    background: 'rgba(255,255,255,0.08)',
                                                    border: '1px solid rgba(255,255,255,0.15)',
                                                    borderRadius: '6px',
                                                    color: '#aaa',
                                                    fontSize: '11px',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Info bar */}
                            <div
                                style={{
                                    padding: '10px 14px',
                                    borderTop: '1px solid rgba(255,255,255,0.04)',
                                    background: 'rgba(0,0,0,0.2)',
                                }}
                            >
                                {renamingPath === project.path ? (
                                    <input
                                        autoFocus
                                        type="text"
                                        value={renameValue}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                        onKeyDown={(e) => {
                                            e.stopPropagation();
                                            if (e.key === 'Enter') handleRename(project.path);
                                            if (e.key === 'Escape') setRenamingPath(null);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        onBlur={() => handleRename(project.path)}
                                        style={{
                                            width: '100%',
                                            padding: '4px 8px',
                                            background: 'rgba(0,0,0,0.5)',
                                            border: '1px solid rgba(52, 211, 153, 0.4)',
                                            borderRadius: '4px',
                                            color: '#fff',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            outline: 'none',
                                        }}
                                    />
                                ) : (
                                    <div
                                        style={{
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            color: '#ddd',
                                            marginBottom: '4px',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {project.name}
                                    </div>
                                )}
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        fontSize: '11px',
                                        color: '#555',
                                    }}
                                >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock size={10} />
                                        {formatDate(project.modifiedAt)}
                                    </span>
                                    {project.nodeCount != null && (
                                        <span>{project.nodeCount} nodes</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Empty state */}
                {projects.length === 0 && !isCreating && (
                    <div
                        style={{
                            textAlign: 'center',
                            padding: '60px 20px',
                            color: '#555',
                        }}
                    >
                        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center', opacity: 0.4 }}>
                            <GardeniaIcon size={56} />
                        </div>
                        <p style={{ fontSize: '14px', fontWeight: 500, margin: '0 0 8px' }}>No projects yet</p>
                        <p style={{ fontSize: '12px', color: '#444' }}>
                            Create a new project or open an existing .leaf file
                        </p>
                    </div>
                )}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <>
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 100 }}
                        onClick={() => setContextMenu(null)}
                    />
                    <div
                        style={{
                            position: 'fixed',
                            left: contextMenu.x,
                            top: contextMenu.y,
                            background: '#1e1e24',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '10px',
                            padding: '6px',
                            zIndex: 101,
                            minWidth: '160px',
                            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                        }}
                    >
                        <button
                            onClick={() => {
                                handleOpen(contextMenu.project.path);
                                setContextMenu(null);
                            }}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '6px',
                                color: '#ccc',
                                fontSize: '12px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                            <FolderOpen size={14} />
                            Open Project
                        </button>
                        <button
                            onClick={() => {
                                setRenameValue(contextMenu.project.name);
                                setRenamingPath(contextMenu.project.path);
                                setContextMenu(null);
                            }}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '6px',
                                color: '#ccc',
                                fontSize: '12px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                            <Pencil size={14} />
                            Rename Project
                        </button>
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                        <button
                            onClick={() => {
                                setDeletingPath(contextMenu.project.path);
                                setContextMenu(null);
                            }}
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '6px',
                                color: '#f87171',
                                fontSize: '12px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,113,113,0.08)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                            <Trash2 size={14} />
                            Delete Project
                        </button>
                    </div>
                </>
            )}

            {/* Footer */}
            <div
                style={{
                    padding: '12px 40px',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    color: '#444',
                    flexShrink: 0,
                }}
            >
                <span>{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
                <span>Gardenia v0.1.0</span>
            </div>
        </div>
    );
}
