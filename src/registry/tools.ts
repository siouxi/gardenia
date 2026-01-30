import { ToolDefinition, ToolCategory } from '../types/ToolDefinition';

// Auto-load all tool definitions from the definitions directory (Vite specific)
const modules = import.meta.glob('./definitions/*.ts', { eager: true });

// Extract the default export from each module as a ToolDefinition
const allTools: ToolDefinition[] = Object.values(modules).map((mod: any) => mod.default);

export const ToolRegistry = {
    getAll: (): ToolDefinition[] => allTools,

    getByCategory: (category: string): ToolDefinition[] => {
        return allTools.filter(tool => tool.category === category);
    },

    getById: (id: string): ToolDefinition | undefined => {
        return allTools.find(tool => tool.id === id);
    },

    getCategories: (): string[] => {
        // Enforce the specific order from the original design
        const order = ['Input', 'QC', 'Preprocessing', 'Statistical Analysis', 'Visualization', 'Utilities'];
        const available = new Set(allTools.map(tool => tool.category));
        return order.filter(c => available.has(c as ToolCategory));
    }
};
