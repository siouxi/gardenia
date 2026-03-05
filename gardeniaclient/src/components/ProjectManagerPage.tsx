/**
 * Project Manager Page
 * =====================
 *
 * DaVinci Resolve-style project selection screen.
 * Shows on startup — user picks or creates a project.
 * Supports drag-and-drop folders to organize projects.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, FolderOpen, Trash2, Clock, Pencil, ChevronLeft, FolderPlus } from 'lucide-react';

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

interface ProjectFolder {
    id: string;
    name: string;
    projectPaths: string[];
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

// ── Project Card Component ─────────────────────────────────────────
function ProjectCard({
    project,
    onOpen,
    onContextMenu,
    onDragStart,
    onDragOver,
    onDrop,
    onDragLeave,
    isDragOver,
    renamingPath,
    renameValue,
    setRenameValue,
    onRename,
    onCancelRename,
    deletingPath,
    onDelete,
    onCancelDelete,
    formatDate,
}: {
    project: ProjectEntry;
    onOpen: (path: string) => void;
    onContextMenu: (e: React.MouseEvent, project: ProjectEntry) => void;
    onDragStart: (e: React.DragEvent, projectPath: string) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent, targetPath: string) => void;
    onDragLeave: (e: React.DragEvent) => void;
    isDragOver: boolean;
    renamingPath: string | null;
    renameValue: string;
    setRenameValue: (v: string) => void;
    onRename: (path: string) => void;
    onCancelRename: () => void;
    deletingPath: string | null;
    onDelete: (path: string) => void;
    onCancelDelete: () => void;
    formatDate: (iso: string) => string;
}) {
    return (
        <div
            draggable
            onDragStart={(e) => onDragStart(e, project.path)}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, project.path)}
            onDragLeave={onDragLeave}
            style={{
                aspectRatio: '4/3',
                background: isDragOver
                    ? 'rgba(52, 211, 153, 0.1)'
                    : 'rgba(255,255,255,0.02)',
                border: isDragOver
                    ? '2px solid rgba(52, 211, 153, 0.5)'
                    : '1px solid rgba(255,255,255,0.06)',
                borderRadius: '14px',
                display: 'flex',
                flexDirection: 'column',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                overflow: 'hidden',
                position: 'relative',
            }}
            onClick={() => onOpen(project.path)}
            onContextMenu={(e) => onContextMenu(e, project)}
            onMouseEnter={(e) => {
                if (!isDragOver) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                    e.currentTarget.style.borderColor = 'rgba(52, 211, 153, 0.25)';
                }
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.3)';
            }}
            onMouseLeave={(e) => {
                if (!isDragOver) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                }
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
                                onClick={(e) => { e.stopPropagation(); onDelete(project.path); }}
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
                                onClick={(e) => { e.stopPropagation(); onCancelDelete(); }}
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
                            if (e.key === 'Enter') onRename(project.path);
                            if (e.key === 'Escape') onCancelRename();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => onRename(project.path)}
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
    );
}

// ── Folder Card Component ──────────────────────────────────────────
function FolderCard({
    folder,
    folderProjects,
    onClickFolder,
    onContextMenu,
    onDragOver,
    onDrop,
    onDragLeave,
    isDragOver,
    renamingFolderId,
    folderRenameValue,
    setFolderRenameValue,
    onRenameFolder,
    onCancelRenameFolder,
}: {
    folder: ProjectFolder;
    folderProjects: ProjectEntry[];
    onClickFolder: (folderId: string) => void;
    onContextMenu: (e: React.MouseEvent, folder: ProjectFolder) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent, folderId: string) => void;
    onDragLeave: (e: React.DragEvent) => void;
    isDragOver: boolean;
    renamingFolderId: string | null;
    folderRenameValue: string;
    setFolderRenameValue: (v: string) => void;
    onRenameFolder: (folderId: string) => void;
    onCancelRenameFolder: () => void;
}) {
    // Show up to 4 mini previews in a 2x2 grid
    const previews = folderProjects.slice(0, 4);

    return (
        <div
            onClick={() => onClickFolder(folder.id)}
            onContextMenu={(e) => onContextMenu(e, folder)}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, folder.id)}
            onDragLeave={onDragLeave}
            style={{
                aspectRatio: '4/3',
                background: isDragOver
                    ? 'rgba(52, 211, 153, 0.1)'
                    : 'rgba(255,255,255,0.02)',
                border: isDragOver
                    ? '2px solid rgba(52, 211, 153, 0.5)'
                    : '1px solid rgba(255,255,255,0.06)',
                borderRadius: '14px',
                display: 'flex',
                flexDirection: 'column',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                overflow: 'hidden',
                position: 'relative',
            }}
            onMouseEnter={(e) => {
                if (!isDragOver) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                    e.currentTarget.style.borderColor = 'rgba(52, 211, 153, 0.25)';
                }
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.3)';
            }}
            onMouseLeave={(e) => {
                if (!isDragOver) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                }
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
            }}
        >
            {/* 2x2 mini preview grid */}
            <div
                style={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gridTemplateRows: '1fr 1fr',
                    gap: '2px',
                    padding: '6px',
                    background: 'linear-gradient(135deg, rgba(5, 10, 15, 0.5), rgba(10, 15, 20, 0.3))',
                    overflow: 'hidden',
                }}
            >
                {previews.map((project, i) => (
                    <div
                        key={i}
                        style={{
                            borderRadius: '6px',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(255,255,255,0.04)',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <WorkflowPreview nodes={project.nodePreview} />
                    </div>
                ))}
                {/* Fill remaining slots */}
                {Array.from({ length: Math.max(0, 4 - previews.length) }).map((_, i) => (
                    <div
                        key={`empty-${i}`}
                        style={{
                            borderRadius: '6px',
                            background: 'rgba(0,0,0,0.15)',
                            border: '1px solid rgba(255,255,255,0.02)',
                        }}
                    />
                ))}
            </div>

            {/* Folder info bar */}
            <div
                style={{
                    padding: '10px 14px',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                    background: 'rgba(0,0,0,0.2)',
                }}
            >
                {renamingFolderId === folder.id ? (
                    <input
                        autoFocus
                        type="text"
                        value={folderRenameValue}
                        onChange={(e) => setFolderRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') onRenameFolder(folder.id);
                            if (e.key === 'Escape') onCancelRenameFolder();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => onRenameFolder(folder.id)}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FolderPlus size={14} style={{ color: '#34d399', flexShrink: 0 }} />
                        <div
                            style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#ddd',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {folder.name}
                        </div>
                    </div>
                )}
                <div
                    style={{
                        fontSize: '11px',
                        color: '#555',
                        marginTop: '4px',
                    }}
                >
                    {folder.projectPaths.length} projects
                </div>
            </div>
        </div>
    );
}

// ── Context Menu Button ────────────────────────────────────────────
function ContextMenuItem({
    icon,
    label,
    onClick,
    danger,
}: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    danger?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            style={{
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: danger ? '#f87171' : '#ccc',
                fontSize: '12px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.background = danger
                    ? 'rgba(248,113,113,0.08)'
                    : 'rgba(255,255,255,0.06)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
            }}
        >
            {icon}
            {label}
        </button>
    );
}

// ══════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════
export function ProjectManagerPage() {
    const [projects, setProjects] = useState<ProjectEntry[]>([]);
    const [folders, setFolders] = useState<ProjectFolder[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [contextMenu, setContextMenu] = useState<{
        x: number; y: number;
        project?: ProjectEntry;
        folder?: ProjectFolder;
    } | null>(null);
    const [renamingPath, setRenamingPath] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
    const [folderRenameValue, setFolderRenameValue] = useState('');
    const [deletingPath, setDeletingPath] = useState<string | null>(null);
    const [openFolderId, setOpenFolderId] = useState<string | null>(null);
    const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
    const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const api = (window as any).electronAPI;

    // Load recent projects + folders
    const loadProjects = useCallback(async () => {
        if (!api?.listRecentProjects) return;
        const data = await api.listRecentProjects();
        // Handle both old format (array) and new format ({ projects, folders })
        if (Array.isArray(data)) {
            setProjects(data || []);
            setFolders([]);
        } else {
            setProjects(data.projects || []);
            setFolders(data.folders || []);
        }
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

    // ── Helpers ────────────────────────────────────────────────────

    const getProjectByPath = (path: string) => projects.find(p => p.path === path);

    /** Get list of project paths that are inside any folder */
    const folderedPaths = new Set(folders.flatMap(f => f.projectPaths));

    /** Projects not inside any folder (shown at root level) */
    const rootProjects = projects.filter(p => !folderedPaths.has(p.path));

    /** Get the folder a project belongs to */
    const getFolderForProject = (projectPath: string) =>
        folders.find(f => f.projectPaths.includes(projectPath));

    // ── Actions ───────────────────────────────────────────────────

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

    const handleRenameFolder = async (folderId: string) => {
        if (!folderRenameValue.trim()) { setRenamingFolderId(null); return; }
        await api.renameFolder(folderId, folderRenameValue.trim());
        setRenamingFolderId(null);
        loadProjects();
    };

    // ── Drag & Drop ───────────────────────────────────────────────

    const handleDragStart = (e: React.DragEvent, projectPath: string) => {
        e.dataTransfer.setData('text/plain', projectPath);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
        setDragOverTarget(targetId);
    };

    const handleDragLeave = (_e: React.DragEvent) => {
        // Small delay to avoid flickering
        dragTimerRef.current = setTimeout(() => setDragOverTarget(null), 50);
    };

    /** Drop on a project card → create folder or add to existing folder */
    const handleDropOnProject = async (e: React.DragEvent, targetPath: string) => {
        e.preventDefault();
        setDragOverTarget(null);

        const draggedPath = e.dataTransfer.getData('text/plain');
        if (!draggedPath || draggedPath === targetPath) return;

        // If target is already in a folder, add dragged to that folder
        const targetFolder = getFolderForProject(targetPath);
        if (targetFolder) {
            // Remove dragged from its old folder if it was in one
            const draggedFolder = getFolderForProject(draggedPath);
            if (draggedFolder && draggedFolder.id !== targetFolder.id) {
                await api.removeProjectFromFolder(draggedFolder.id, draggedPath);
            }
            await api.addProjectToFolder(targetFolder.id, draggedPath);
        } else {
            // Also remove dragged from its old folder if needed
            const draggedFolder = getFolderForProject(draggedPath);
            if (draggedFolder) {
                await api.removeProjectFromFolder(draggedFolder.id, draggedPath);
            }
            // Create new folder from both projects
            const targetProject = getProjectByPath(targetPath);
            const draggedProject = getProjectByPath(draggedPath);
            const folderName = targetProject?.name && draggedProject?.name
                ? `${draggedProject.name} & ${targetProject.name}`
                : 'New Folder';
            await api.createFolder(folderName, [targetPath, draggedPath]);
        }

        loadProjects();
    };

    /** Drop on a folder card → add project to folder */
    const handleDropOnFolder = async (e: React.DragEvent, folderId: string) => {
        e.preventDefault();
        setDragOverTarget(null);

        const draggedPath = e.dataTransfer.getData('text/plain');
        if (!draggedPath) return;

        // Remove from old folder if it was in one
        const draggedFolder = getFolderForProject(draggedPath);
        if (draggedFolder) {
            if (draggedFolder.id === folderId) return; // Already in this folder
            await api.removeProjectFromFolder(draggedFolder.id, draggedPath);
        }

        await api.addProjectToFolder(folderId, draggedPath);
        loadProjects();
    };

    /** Drop on the root grid background → remove from folder */
    const handleDropOnRoot = async (e: React.DragEvent) => {
        e.preventDefault();
        setDragOverTarget(null);

        const draggedPath = e.dataTransfer.getData('text/plain');
        if (!draggedPath) return;

        const draggedFolder = getFolderForProject(draggedPath);
        if (draggedFolder) {
            await api.removeProjectFromFolder(draggedFolder.id, draggedPath);
            loadProjects();
        }
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

    // ── Folder View ───────────────────────────────────────────────

    const currentOpenFolder = folders.find(f => f.id === openFolderId);
    const folderViewProjects = currentOpenFolder
        ? currentOpenFolder.projectPaths.map(p => getProjectByPath(p)).filter(Boolean) as ProjectEntry[]
        : [];

    // ── Total project count (including foldered) ──────────────────
    const totalCount = projects.length;

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

            {/* Folder breadcrumb */}
            {openFolderId && currentOpenFolder && (
                <div
                    style={{
                        padding: '16px 40px 0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexShrink: 0,
                    }}
                >
                    <button
                        onClick={() => setOpenFolderId(null)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '8px',
                            color: '#aaa',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 500,
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                            e.currentTarget.style.color = '#ddd';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                            e.currentTarget.style.color = '#aaa';
                        }}
                    >
                        <ChevronLeft size={14} />
                        Back
                    </button>
                    <span style={{ color: '#555', fontSize: '12px' }}>/</span>
                    <span style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#34d399',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}>
                        <FolderPlus size={14} />
                        {currentOpenFolder.name}
                    </span>
                </div>
            )}

            {/* Project Grid */}
            <div
                style={{
                    flex: 1,
                    padding: '28px 40px',
                    overflowY: 'auto',
                }}
                onDragOver={(e) => {
                    if (!openFolderId) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                    }
                }}
                onDrop={(e) => {
                    if (!openFolderId) {
                        handleDropOnRoot(e);
                    }
                }}
            >
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: '16px',
                    }}
                >
                    {/* New Project Card — only show at root level */}
                    {!openFolderId && (
                        <>
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
                        </>
                    )}

                    {/* Root view: Show folders + root projects */}
                    {!openFolderId && (
                        <>
                            {/* Folder cards */}
                            {folders.map((folder) => {
                                const folderProjects = folder.projectPaths
                                    .map(p => getProjectByPath(p))
                                    .filter(Boolean) as ProjectEntry[];

                                return (
                                    <FolderCard
                                        key={`folder-${folder.id}`}
                                        folder={folder}
                                        folderProjects={folderProjects}
                                        onClickFolder={(id) => setOpenFolderId(id)}
                                        onContextMenu={(e, f) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setContextMenu({ x: e.clientX, y: e.clientY, folder: f });
                                        }}
                                        onDragOver={(e) => handleDragOver(e, `folder:${folder.id}`)}
                                        onDrop={(e) => handleDropOnFolder(e, folder.id)}
                                        onDragLeave={handleDragLeave}
                                        isDragOver={dragOverTarget === `folder:${folder.id}`}
                                        renamingFolderId={renamingFolderId}
                                        folderRenameValue={folderRenameValue}
                                        setFolderRenameValue={setFolderRenameValue}
                                        onRenameFolder={handleRenameFolder}
                                        onCancelRenameFolder={() => setRenamingFolderId(null)}
                                    />
                                );
                            })}

                            {/* Root-level project cards */}
                            {rootProjects.map((project) => (
                                <ProjectCard
                                    key={project.path}
                                    project={project}
                                    onOpen={handleOpen}
                                    onContextMenu={(e, p) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setContextMenu({ x: e.clientX, y: e.clientY, project: p });
                                    }}
                                    onDragStart={handleDragStart}
                                    onDragOver={(e) => handleDragOver(e, `project:${project.path}`)}
                                    onDrop={(e) => handleDropOnProject(e, project.path)}
                                    onDragLeave={handleDragLeave}
                                    isDragOver={dragOverTarget === `project:${project.path}`}
                                    renamingPath={renamingPath}
                                    renameValue={renameValue}
                                    setRenameValue={setRenameValue}
                                    onRename={handleRename}
                                    onCancelRename={() => setRenamingPath(null)}
                                    deletingPath={deletingPath}
                                    onDelete={handleDelete}
                                    onCancelDelete={() => setDeletingPath(null)}
                                    formatDate={formatDate}
                                />
                            ))}
                        </>
                    )}

                    {/* Folder interior view */}
                    {openFolderId && folderViewProjects.map((project) => (
                        <ProjectCard
                            key={project.path}
                            project={project}
                            onOpen={handleOpen}
                            onContextMenu={(e, p) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setContextMenu({ x: e.clientX, y: e.clientY, project: p });
                            }}
                            onDragStart={handleDragStart}
                            onDragOver={(e) => handleDragOver(e, `project:${project.path}`)}
                            onDrop={(e) => handleDropOnProject(e, project.path)}
                            onDragLeave={handleDragLeave}
                            isDragOver={dragOverTarget === `project:${project.path}`}
                            renamingPath={renamingPath}
                            renameValue={renameValue}
                            setRenameValue={setRenameValue}
                            onRename={handleRename}
                            onCancelRename={() => setRenamingPath(null)}
                            deletingPath={deletingPath}
                            onDelete={handleDelete}
                            onCancelDelete={() => setDeletingPath(null)}
                            formatDate={formatDate}
                        />
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
                        {/* Project context menu */}
                        {contextMenu.project && (
                            <>
                                <ContextMenuItem
                                    icon={<FolderOpen size={14} />}
                                    label="Open Project"
                                    onClick={() => {
                                        handleOpen(contextMenu.project!.path);
                                        setContextMenu(null);
                                    }}
                                />
                                <ContextMenuItem
                                    icon={<Pencil size={14} />}
                                    label="Rename Project"
                                    onClick={() => {
                                        setRenameValue(contextMenu.project!.name);
                                        setRenamingPath(contextMenu.project!.path);
                                        setContextMenu(null);
                                    }}
                                />
                                {/* If project is inside a folder, show "Remove from Folder" */}
                                {getFolderForProject(contextMenu.project.path) && (
                                    <ContextMenuItem
                                        icon={<ChevronLeft size={14} />}
                                        label="Remove from Folder"
                                        onClick={async () => {
                                            const folder = getFolderForProject(contextMenu.project!.path);
                                            if (folder) {
                                                await api.removeProjectFromFolder(folder.id, contextMenu.project!.path);
                                                // If the folder got dissolved, go back to root
                                                const result = folders.find(f => f.id === folder.id);
                                                if (result && result.projectPaths.length <= 2) {
                                                    setOpenFolderId(null);
                                                }
                                                loadProjects();
                                            }
                                            setContextMenu(null);
                                        }}
                                    />
                                )}
                                <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                                <ContextMenuItem
                                    icon={<Trash2 size={14} />}
                                    label="Delete Project"
                                    danger
                                    onClick={() => {
                                        setDeletingPath(contextMenu.project!.path);
                                        setContextMenu(null);
                                    }}
                                />
                            </>
                        )}

                        {/* Folder context menu */}
                        {contextMenu.folder && (
                            <>
                                <ContextMenuItem
                                    icon={<FolderOpen size={14} />}
                                    label="Open Folder"
                                    onClick={() => {
                                        setOpenFolderId(contextMenu.folder!.id);
                                        setContextMenu(null);
                                    }}
                                />
                                <ContextMenuItem
                                    icon={<Pencil size={14} />}
                                    label="Rename Folder"
                                    onClick={() => {
                                        setFolderRenameValue(contextMenu.folder!.name);
                                        setRenamingFolderId(contextMenu.folder!.id);
                                        setContextMenu(null);
                                    }}
                                />
                            </>
                        )}
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
                <span>{totalCount} project{totalCount !== 1 ? 's' : ''}{folders.length > 0 ? ` · ${folders.length} folder${folders.length !== 1 ? 's' : ''}` : ''}</span>
                <span>Gardenia v0.1.0</span>
            </div>
        </div>
    );
}
