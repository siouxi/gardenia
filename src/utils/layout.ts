
import dagre from 'dagre';
import { Node, Edge, Position } from '@xyflow/react';

const nodeWidth = 250;
const nodeHeight = 150;

/**
 * Auto-layouts the given nodes and edges using Dagre.
 * Returns the new list of nodes with updated positions.
 * 
 * @param nodes List of React Flow nodes
 * @param edges List of React Flow edges
 * @param direction 'TB' (Top-Bottom) or 'LR' (Left-Right)
 */
export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    // Check if direction is valid
    const isHorizontal = direction === 'LR';
    dagreGraph.setGraph({ rankdir: direction });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);

        // We are shifting the dagre node position (anchor=center center) to the top left
        // so it matches the React Flow node anchor point (top left).
        const x = nodeWithPosition.x - nodeWidth / 2;
        const y = nodeWithPosition.y - nodeHeight / 2;

        return {
            ...node,
            targetPosition: isHorizontal ? Position.Left : Position.Top,
            sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
            position: { x, y },
        };
    });

    return { nodes: layoutedNodes, edges };
};
