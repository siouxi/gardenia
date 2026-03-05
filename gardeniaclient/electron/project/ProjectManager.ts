/**
 * Project Manager
 * ================
 *
 * Manages .leaf project files (ZIP archives) and the recent projects index.
 *
 * .leaf internal structure:
 *   meta.json        – project name, timestamps, version
 *   workflow.json    – nodes, edges, positions
 *   datasets/        – parquet files from ArrowStorage
 */

import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import AdmZip from 'adm-zip';

export interface ProjectMeta {
    name: string;
    createdAt: string;
    modifiedAt: string;
    version: string;
}

export interface NodePreviewItem {
    x: number;
    y: number;
    label: string;
}

export interface ProjectEntry {
    name: string;
    path: string;         // absolute path to .leaf file
    modifiedAt: string;
    nodePreview?: NodePreviewItem[]; // simplified node positions for minimap
    edgePreview?: { source: string; target: string }[];
    nodeCount?: number;
    edgeCount?: number;
}

export interface ProjectData {
    meta: ProjectMeta;
    workflow: any;         // { nodes, edges, version }
    leafPath: string;      // absolute path to the .leaf file
}

export class ProjectManager {
    private indexPath: string;
    private projectsDir: string;

    constructor() {
        const userData = app.getPath('userData');
        this.projectsDir = path.join(app.getPath('documents'), 'Gardenia Projects');
        this.indexPath = path.join(userData, 'projects.json');

        // Ensure projects directory exists
        if (!fs.existsSync(this.projectsDir)) {
            fs.mkdirSync(this.projectsDir, { recursive: true });
        }
    }

    // ── Recent Projects Index ───────────────────────────────────────

    getRecentProjects(): ProjectEntry[] {
        try {
            if (!fs.existsSync(this.indexPath)) return [];
            const data = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
            // Filter out entries whose files no longer exist
            const valid = (data.projects || []).filter((p: ProjectEntry) =>
                fs.existsSync(p.path)
            );
            // Auto-populate previews if missing
            for (const entry of valid) {
                if (!entry.nodePreview) {
                    try {
                        const preview = this.extractPreview(entry.path);
                        Object.assign(entry, preview);
                    } catch { /* ignore corrupt files */ }
                }
            }
            return valid;
        } catch {
            return [];
        }
    }

    private extractPreview(leafPath: string): Partial<ProjectEntry> {
        const zip = new AdmZip(leafPath);
        const wfEntry = zip.getEntry('workflow.json');
        if (!wfEntry) return {};
        const wf = JSON.parse(wfEntry.getData().toString('utf-8'));
        const nodes = wf.nodes || [];
        const edges = wf.edges || [];
        return {
            nodePreview: nodes.map((n: any) => ({
                x: n.position?.x ?? 0,
                y: n.position?.y ?? 0,
                label: n.data?.label || '',
            })),
            edgePreview: edges.map((e: any) => ({
                source: e.source,
                target: e.target,
            })),
            nodeCount: nodes.length,
            edgeCount: edges.length,
        };
    }

    private saveIndex(projects: ProjectEntry[]): void {
        fs.writeFileSync(
            this.indexPath,
            JSON.stringify({ projects }, null, 2),
            'utf-8',
        );
    }

    private addToIndex(entry: ProjectEntry): void {
        const projects = this.getRecentProjects().filter(
            (p) => p.path !== entry.path,
        );
        projects.unshift(entry); // most recent first
        this.saveIndex(projects);
    }

    private removeFromIndex(leafPath: string): void {
        const projects = this.getRecentProjects().filter(
            (p) => p.path !== leafPath,
        );
        this.saveIndex(projects);
    }

    // ── Project CRUD ────────────────────────────────────────────────

    getProjectsDir(): string {
        return this.projectsDir;
    }

    createProject(name: string, directory?: string): ProjectData {
        const dir = directory || this.projectsDir;
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const safeName = name.replace(/[^a-zA-Z0-9_\-\s]/g, '_');
        const leafPath = path.join(dir, `${safeName}.leaf`);

        const now = new Date().toISOString();
        const meta: ProjectMeta = {
            name,
            createdAt: now,
            modifiedAt: now,
            version: '1.0.0',
        };

        const workflow = {
            nodes: [
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
                            outputs: [{ name: 'start_signal', type: 'signal' }],
                        },
                    },
                },
            ],
            edges: [],
            version: '1.0.0',
        };

        // Build ZIP
        const zip = new AdmZip();
        zip.addFile('meta.json', Buffer.from(JSON.stringify(meta, null, 2)));
        zip.addFile('workflow.json', Buffer.from(JSON.stringify(workflow, null, 2)));
        zip.writeZip(leafPath);

        // Update index
        this.addToIndex({ name, path: leafPath, modifiedAt: now });

        return { meta, workflow, leafPath };
    }

    openProject(leafPath: string): ProjectData {
        if (!fs.existsSync(leafPath)) {
            throw new Error(`Project file not found: ${leafPath}`);
        }

        const zip = new AdmZip(leafPath);

        // Read meta
        const metaEntry = zip.getEntry('meta.json');
        if (!metaEntry) throw new Error('Invalid .leaf file: missing meta.json');
        const meta: ProjectMeta = JSON.parse(metaEntry.getData().toString('utf-8'));

        // Read workflow
        const workflowEntry = zip.getEntry('workflow.json');
        if (!workflowEntry) throw new Error('Invalid .leaf file: missing workflow.json');
        const workflow = JSON.parse(workflowEntry.getData().toString('utf-8'));

        // Extract datasets to a temp area for the engine to use
        const dataDir = path.join(app.getPath('userData'), 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        zip.getEntries().forEach((entry) => {
            if (entry.entryName.startsWith('datasets/') && !entry.isDirectory) {
                const destPath = path.join(dataDir, path.basename(entry.entryName));
                fs.writeFileSync(destPath, entry.getData());
            }
        });

        // Update index
        this.addToIndex({
            name: meta.name,
            path: leafPath,
            modifiedAt: meta.modifiedAt,
        });

        return { meta, workflow, leafPath };
    }

    saveProject(
        leafPath: string,
        workflow: any,
        meta: ProjectMeta,
    ): void {
        meta.modifiedAt = new Date().toISOString();

        const zip = new AdmZip();
        zip.addFile('meta.json', Buffer.from(JSON.stringify(meta, null, 2)));
        zip.addFile('workflow.json', Buffer.from(JSON.stringify(workflow, null, 2)));

        // Bundle datasets from the data directory
        const dataDir = path.join(app.getPath('userData'), 'data');
        if (fs.existsSync(dataDir)) {
            const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.parquet'));
            for (const file of files) {
                const filePath = path.join(dataDir, file);
                zip.addLocalFile(filePath, 'datasets');
            }
        }

        zip.writeZip(leafPath);

        // Update index
        this.addToIndex({
            name: meta.name,
            path: leafPath,
            modifiedAt: meta.modifiedAt,
        });
    }

    saveProjectAs(
        newPath: string,
        workflow: any,
        meta: ProjectMeta,
    ): ProjectMeta {
        const updatedMeta = { ...meta, modifiedAt: new Date().toISOString() };
        this.saveProject(newPath, workflow, updatedMeta);
        return updatedMeta;
    }

    deleteProject(leafPath: string): void {
        if (fs.existsSync(leafPath)) {
            fs.unlinkSync(leafPath);
        }
        this.removeFromIndex(leafPath);
    }

    renameProject(leafPath: string, newName: string): ProjectEntry | null {
        if (!fs.existsSync(leafPath)) return null;

        // Read and update meta inside the ZIP
        const zip = new AdmZip(leafPath);
        const metaEntry = zip.getEntry('meta.json');
        if (!metaEntry) return null;

        const meta: ProjectMeta = JSON.parse(metaEntry.getData().toString('utf-8'));
        meta.name = newName;
        meta.modifiedAt = new Date().toISOString();

        zip.updateFile('meta.json', Buffer.from(JSON.stringify(meta, null, 2)));
        zip.writeZip(leafPath);

        const entry: ProjectEntry = {
            name: newName,
            path: leafPath,
            modifiedAt: meta.modifiedAt,
        };
        this.addToIndex(entry);
        return entry;
    }
}

// Singleton
let instance: ProjectManager | null = null;

export function getProjectManager(): ProjectManager {
    if (!instance) {
        instance = new ProjectManager();
    }
    return instance;
}
