import { BaseEdge, EdgeProps, getBezierPath, useReactFlow } from '@xyflow/react';
import { useState, useMemo } from 'react';

/**
 * Custom edge that detects streaming connections.
 * If the source node's code contains `yield`, shows:
 * - Animated dashed line (cyan/purple)
 * - ⚡ icon on hover with tooltip
 * Otherwise renders as a normal edge.
 */
export const StreamEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    source,
    style = {},
    markerEnd,
    selected,
}: EdgeProps) => {
    const [hovered, setHovered] = useState(false);
    const { getNode } = useReactFlow();

    const sourceNode = getNode(source);
    const code = sourceNode?.data?.code as string || '';

    // Detect if source node uses yield (simple check — engine does AST)
    const isStreaming = useMemo(() => {
        if (!code) return false;
        // Quick check: look for yield keyword (not in comments/strings - good enough for UI hint)
        const lines = code.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('#')) continue;
            if (/\byield\b/.test(trimmed)) return true;
        }
        return false;
    }, [code]);

    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

    if (!isStreaming) {
        // Normal edge
        return (
            <BaseEdge
                id={id}
                path={edgePath}
                markerEnd={markerEnd}
                style={{
                    stroke: selected ? '#34d399' : '#555',
                    strokeWidth: selected ? 3 : 1.5,
                    cursor: 'pointer',
                    ...style
                }}
            />
        );
    }

    // Streaming edge — animated dashes with glow
    const active = hovered || selected;
    return (
        <g
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Invisible wider hit area for hover */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                style={{ cursor: 'pointer' }}
            />

            {/* Glow layer */}
            <path
                d={edgePath}
                fill="none"
                stroke="url(#stream-gradient)"
                strokeWidth={active ? 5 : 2.5}
                strokeOpacity={active ? 0.8 : 0.3}
                filter="blur(3px)"
            />

            {/* Main animated dashed line */}
            <path
                d={edgePath}
                fill="none"
                stroke="url(#stream-gradient)"
                strokeWidth={active ? 3 : 1.8}
                strokeDasharray="8 4"
                markerEnd={markerEnd as string}
                style={{
                    animation: 'streamFlow 1s linear infinite',
                }}
            />

            {/* Streaming badge at midpoint */}
            {active && (
                <g transform={`translate(${labelX}, ${labelY})`}>
                    <rect
                        x={-52}
                        y={-14}
                        width={104}
                        height={28}
                        rx={6}
                        fill="#1a1a2e"
                        stroke="#7c3aed"
                        strokeWidth={1}
                        opacity={0.95}
                    />
                    <text
                        x={0}
                        y={4}
                        textAnchor="middle"
                        fill="#c4b5fd"
                        fontSize={10}
                        fontWeight={600}
                        fontFamily="ui-monospace, monospace"
                    >
                        ⚡ Streaming
                    </text>
                </g>
            )}

            {/* Always-visible small icon at midpoint */}
            {!active && (
                <g transform={`translate(${labelX}, ${labelY})`}>
                    <circle r={8} fill="#1a1a2e" stroke="#7c3aed" strokeWidth={1} opacity={0.9} />
                    <text
                        x={0}
                        y={4}
                        textAnchor="middle"
                        fontSize={9}
                    >
                        ⚡
                    </text>
                </g>
            )}

            {/* SVG gradient definition */}
            <defs>
                <linearGradient id="stream-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#06b6d4" />
                    <stop offset="50%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
            </defs>
        </g>
    );
};
