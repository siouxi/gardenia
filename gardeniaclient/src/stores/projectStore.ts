/**
 * Project Store
 * ==============
 *
 * Zustand store for the active project state.
 * Tracks current project metadata, modification status, and view routing.
 */

import { create } from 'zustand';

export interface ProjectMeta {
    name: string;
    createdAt: string;
    modifiedAt: string;
    version: string;
}

interface ProjectStore {
    // Current view: 'projects' (project manager) or 'workflow' (main editor)
    view: 'projects' | 'workflow';

    // Active project data
    activeProject: {
        meta: ProjectMeta;
        leafPath: string;
    } | null;

    // Workflow data loaded from project
    projectWorkflow: any | null;

    isModified: boolean;

    // Actions
    setView: (view: 'projects' | 'workflow') => void;
    openProject: (meta: ProjectMeta, leafPath: string, workflow: any) => void;
    closeProject: () => void;
    markModified: () => void;
    markSaved: () => void;
}

export const useProjectStore = create<ProjectStore>((set) => ({
    view: 'projects',
    activeProject: null,
    projectWorkflow: null,
    isModified: false,

    setView: (view) => set({ view }),

    openProject: (meta, leafPath, workflow) =>
        set({
            view: 'workflow',
            activeProject: { meta, leafPath },
            projectWorkflow: workflow,
            isModified: false,
        }),

    closeProject: () =>
        set({
            view: 'projects',
            activeProject: null,
            projectWorkflow: null,
            isModified: false,
        }),

    markModified: () => set({ isModified: true }),
    markSaved: () => set({ isModified: false }),
}));
