import React, { useMemo, useState, useCallback, useRef } from 'react';
import { useReactFlow, useNodes, useEdges } from '@xyflow/react';

interface CustomMiniMapProps {
    width?: number;
    height?: number;
}

const defaultCategoryColors: Record<string, string> = {
    'Utilities': '#34d399',
    'Input/Output': '#60a5fa',
    'Data Wrangling': '#a78bfa',
    'Quality Control': '#f87171',
    'Normalization': '#38bdf8',
    'Statistical Analysis': '#818cf8',
    'Differential Expression': '#fb923c',
    'Machine Learning': '#c084fc',
    'Sequence Analysis': '#2dd4bf',
    'Visualization': '#fbbf24',
};

const getNodeColor = (node: any): string => {
    if (node.data?.executionState === 'running') return '#eab308';
    if (node.data?.executionState === 'success') return '#22c55e';
    if (node.data?.executionState === 'error') return '#ef4444';
    if (node.data?.executionState === 'skipped') return '#6b7280';

    const category = String(node.data?.category || '');
    return defaultCategoryColors[category] || '#4b5563';
};

export const CustomMiniMap: React.FC<CustomMiniMapProps> = ({
    width = 200,
    height = 150,
}) => {
    const nodes = useNodes();
    const edges = useEdges();
    const { setCenter } = useReactFlow();

    // Zoom & pan state for the minimap itself
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

    // Compute world-space geometry (unaffected by minimap zoom/pan)
    const { nodeRects, edgeLines } = useMemo(() => {
        if (nodes.length === 0) return { nodeRects: [], edgeLines: [], baseScale: 1 };

        const nodeW = 180;
        const nodeH = 60;
        const padding = 40;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const nodePositions = new Map<string, { x: number; y: number; w: number; h: number }>();

        for (const node of nodes) {
            if (node.type === 'group') continue;
            const x = node.position.x;
            const y = node.position.y;
            nodePositions.set(node.id, { x, y, w: nodeW, h: nodeH });
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + nodeW);
            maxY = Math.max(maxY, y + nodeH);
        }

        const worldW = maxX - minX + padding * 2;
        const worldH = maxY - minY + padding * 2;
        const scale = Math.min(width / worldW, height / worldH, 1);
        const offsetX = (width - worldW * scale) / 2 - minX * scale + padding * scale;
        const offsetY = (height - worldH * scale) / 2 - minY * scale + padding * scale;

        const rects = nodes
            .filter(n => n.type !== 'group')
            .map(node => {
                const pos = nodePositions.get(node.id)!;
                return {
                    id: node.id,
                    x: pos.x * scale + offsetX,
                    y: pos.y * scale + offsetY,
                    w: pos.w * scale,
                    h: pos.h * scale,
                    color: getNodeColor(node),
                    label: String(node.data?.label || ''),
                    origX: pos.x + pos.w / 2,
                    origY: pos.y + pos.h / 2,
                };
            });

        const lines = edges.map(edge => {
            const src = nodePositions.get(edge.source);
            const tgt = nodePositions.get(edge.target);
            if (!src || !tgt) return null;
            return {
                id: edge.id,
                x1: (src.x + src.w) * scale + offsetX,
                y1: (src.y + src.h / 2) * scale + offsetY,
                x2: tgt.x * scale + offsetX,
                y2: (tgt.y + tgt.h / 2) * scale + offsetY,
            };
        }).filter(Boolean) as { id: string; x1: number; y1: number; x2: number; y2: number }[];

        return { nodeRects: rects, edgeLines: lines, baseScale: scale };
    }, [nodes, edges, width, height]);


    // Scroll wheel → zoom minimap
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setZoom(prev => {
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            return Math.max(0.5, Math.min(4, prev * delta));
        });
    }, []);

    // Mouse drag → pan minimap (left or middle click)
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 0 || e.button === 1) {
            e.preventDefault();
            setIsPanning(true);
            panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        }
    }, [pan]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isPanning) return;
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
    }, [isPanning]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
    }, []);

    // Click node → navigate main canvas
    const handleNodeClick = useCallback((e: React.MouseEvent, origX: number, origY: number) => {
        e.stopPropagation();
        setCenter(origX, origY, { zoom: 1.5, duration: 400 });
    }, [setCenter]);

    // Double-click to reset zoom/pan
    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setZoom(1);
        setPan({ x: 0, y: 0 });
    }, []);

    // Show labels only when zoom is high enough
    const showLabels = zoom >= 0.8;

    return (
        <div
            className="absolute bottom-3 right-3 z-10 select-none"
            style={{ width, height }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
        >
            <svg
                width={width}
                height={height}
                className="rounded-md overflow-hidden"
                style={{
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #333',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    cursor: isPanning ? 'grabbing' : 'default',
                }}
            >
                {/* Zoom level indicator */}
                {zoom !== 1 && (
                    <text x={4} y={12} fill="#555" fontSize={8} fontFamily="ui-monospace, monospace">
                        {Math.round(zoom * 100)}%
                    </text>
                )}

                {/* Transformed group */}
                <g transform={`translate(${pan.x + width / 2}, ${pan.y + height / 2}) scale(${zoom}) translate(${-width / 2}, ${-height / 2})`}>
                    {/* Edges */}
                    {edgeLines.map((line) => (
                        <line
                            key={line.id}
                            x1={line.x1}
                            y1={line.y1}
                            x2={line.x2}
                            y2={line.y2}
                            stroke="#555"
                            strokeWidth={Math.max(0.5, 1 / zoom)}
                            strokeOpacity={0.6}
                        />
                    ))}

                    {/* Nodes */}
                    {nodeRects.map((rect) => (
                        <g
                            key={rect.id}
                            style={{ cursor: 'pointer' }}
                            onClick={(e) => handleNodeClick(e, rect.origX, rect.origY)}
                        >
                            <rect
                                x={rect.x}
                                y={rect.y}
                                width={rect.w}
                                height={rect.h}
                                rx={3}
                                fill={rect.color}
                                fillOpacity={0.25}
                                stroke={rect.color}
                                strokeWidth={Math.max(0.5, 1 / zoom)}
                                strokeOpacity={0.7}
                            />
                            {/* Hover highlight */}
                            <rect
                                x={rect.x}
                                y={rect.y}
                                width={rect.w}
                                height={rect.h}
                                rx={3}
                                fill="transparent"
                                className="hover:fill-white/10"
                            />
                            {/* Label — clipped to node bounds, hidden when zoomed out */}
                            {showLabels && (
                                <>
                                    <clipPath id={`clip-${rect.id}`}>
                                        <rect x={rect.x + 2} y={rect.y} width={rect.w - 4} height={rect.h} />
                                    </clipPath>
                                    <text
                                        x={rect.x + 3}
                                        y={rect.y + rect.h / 2 + 1}
                                        textAnchor="start"
                                        dominantBaseline="middle"
                                        fill="#ddd"
                                        fontSize={Math.min(7, rect.h * 0.5)}
                                        fontFamily="ui-monospace, monospace"
                                        fontWeight="600"
                                        clipPath={`url(#clip-${rect.id})`}
                                        style={{ pointerEvents: 'none' }}
                                    >
                                        {rect.label}
                                    </text>
                                </>
                            )}
                        </g>
                    ))}
                </g>
            </svg>
        </div>
    );
};
