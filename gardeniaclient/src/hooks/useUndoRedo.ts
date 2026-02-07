/**
 * useUndoRedo Hook
 * ================
 * 
 * Provides undo/redo functionality for workflow state.
 * Stores snapshots of nodes and edges with a max history of 10.
 */

import { useState, useCallback } from 'react';
import type { Node, Edge } from '@xyflow/react';

export interface WorkflowSnapshot {
    nodes: Node[];
    edges: Edge[];
    timestamp: number;
}

interface UseUndoRedoReturn {
    // Save current state before making changes
    pushSnapshot: (nodes: Node[], edges: Edge[]) => void;

    // Undo last change, returns the previous state
    undo: (currentNodes: Node[], currentEdges: Edge[]) => WorkflowSnapshot | null;

    // Redo last undone change
    redo: (currentNodes: Node[], currentEdges: Edge[]) => WorkflowSnapshot | null;

    // Check if undo/redo is available
    canUndo: boolean;
    canRedo: boolean;

    // History info
    historyLength: number;
}

const MAX_HISTORY = 10;

export function useUndoRedo(): UseUndoRedoReturn {
    const [past, setPast] = useState<WorkflowSnapshot[]>([]);
    const [future, setFuture] = useState<WorkflowSnapshot[]>([]);

    const pushSnapshot = useCallback((nodes: Node[], edges: Edge[]) => {
        const snapshot: WorkflowSnapshot = {
            nodes: JSON.parse(JSON.stringify(nodes)), // Deep clone
            edges: JSON.parse(JSON.stringify(edges)),
            timestamp: Date.now(),
        };

        setPast(prev => {
            const newPast = [...prev, snapshot];
            // Keep only last MAX_HISTORY items
            return newPast.slice(-MAX_HISTORY);
        });

        // Clear future on new action (can't redo after new change)
        setFuture([]);
    }, []);

    const undo = useCallback((currentNodes: Node[], currentEdges: Edge[]): WorkflowSnapshot | null => {
        if (past.length === 0) return null;

        const newPast = [...past];
        const previousState = newPast.pop()!;

        // Save current state to future for redo
        const currentSnapshot: WorkflowSnapshot = {
            nodes: JSON.parse(JSON.stringify(currentNodes)),
            edges: JSON.parse(JSON.stringify(currentEdges)),
            timestamp: Date.now(),
        };

        setPast(newPast);
        setFuture(prev => [...prev, currentSnapshot]);

        return previousState;
    }, [past]);

    const redo = useCallback((currentNodes: Node[], currentEdges: Edge[]): WorkflowSnapshot | null => {
        if (future.length === 0) return null;

        const newFuture = [...future];
        const nextState = newFuture.pop()!;

        // Save current state to past
        const currentSnapshot: WorkflowSnapshot = {
            nodes: JSON.parse(JSON.stringify(currentNodes)),
            edges: JSON.parse(JSON.stringify(currentEdges)),
            timestamp: Date.now(),
        };

        setFuture(newFuture);
        setPast(prev => [...prev, currentSnapshot]);

        return nextState;
    }, [future]);

    return {
        pushSnapshot,
        undo,
        redo,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
        historyLength: past.length,
    };
}
