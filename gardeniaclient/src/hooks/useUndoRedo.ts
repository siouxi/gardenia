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
    description: string;
}

interface UseUndoRedoReturn {
    // Save current state before making changes
    pushSnapshot: (nodes: Node[], edges: Edge[], description: string) => void;

    // Undo last change, returns the previous state
    undo: (currentNodes: Node[], currentEdges: Edge[]) => WorkflowSnapshot | null;

    // Redo last undone change
    redo: (currentNodes: Node[], currentEdges: Edge[]) => WorkflowSnapshot | null;

    // Check if undo/redo is available
    canUndo: boolean;
    canRedo: boolean;

    // History info
    historyLength: number;
    past: WorkflowSnapshot[];
    future: WorkflowSnapshot[];
}

const MAX_HISTORY = 20; // Increased history size

export function useUndoRedo(): UseUndoRedoReturn {
    const [past, setPast] = useState<WorkflowSnapshot[]>([]);
    const [future, setFuture] = useState<WorkflowSnapshot[]>([]);

    const pushSnapshot = useCallback((nodes: Node[], edges: Edge[], description: string = 'Unknown action') => {
        const snapshot: WorkflowSnapshot = {
            nodes: JSON.parse(JSON.stringify(nodes)), // Deep clone
            edges: JSON.parse(JSON.stringify(edges)),
            timestamp: Date.now(),
            description,
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
        // We use the description of the *undone* action as the redo description
        const currentSnapshot: WorkflowSnapshot = {
            nodes: JSON.parse(JSON.stringify(currentNodes)),
            edges: JSON.parse(JSON.stringify(currentEdges)),
            timestamp: Date.now(),
            description: previousState.description, // Re-use description for redo
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
            description: nextState.description,
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
        past,
        future
    };
}
