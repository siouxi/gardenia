import { ToolDefinition, ToolCategory } from '../types/ToolDefinition';

/**
 * Fluent Builder for creating Gardenia Nodes
 */
export class NodeBuilder {
    private definition: ToolDefinition;

    constructor(id: string, name?: string) {
        this.definition = {
            id,
            name: name || id,
            description: '',
            category: 'Utilities',
            version: '1.0.0',
            inputs: [],
            outputs: [],
            parameters: [],
            language: 'python',
            libraries: []
        };
    }

    setName(name: string): NodeBuilder {
        this.definition.name = name;
        return this;
    }

    setDescription(desc: string): NodeBuilder {
        this.definition.description = desc;
        return this;
    }

    setCategory(category: ToolCategory): NodeBuilder {
        this.definition.category = category;
        return this;
    }

    setVersion(version: string): NodeBuilder {
        this.definition.version = version;
        return this;
    }

    setAuthor(author: string): NodeBuilder {
        this.definition.author = author;
        return this;
    }

    // --- Connectivity ---

    addInput(name: string, type: string = 'dataset', description?: string): NodeBuilder {
        this.definition.inputs.push({ name, type, description });
        return this;
    }

    addOutput(name: string, type: string = 'dataset', description?: string): NodeBuilder {
        this.definition.outputs.push({ name, type, description });
        return this;
    }

    // --- Inputs/Outputs (Shorthands) ---

    /** Adds a standard 'data' input */
    withDataInput(): NodeBuilder {
        return this.addInput('data', 'dataset', 'Input dataset');
    }

    /** Adds a standard 'result' output */
    withResultOutput(): NodeBuilder {
        return this.addOutput('result', 'dataset', 'Result dataset');
    }

    // --- Parameters ---

    addString(name: string, label: string, defaultValue: string = '', description?: string): NodeBuilder {
        this.definition.parameters.push({
            name,
            label,
            type: 'string',
            default: defaultValue,
            description
        });
        return this;
    }

    addNumber(name: string, label: string, defaultValue: number = 0, description?: string): NodeBuilder {
        this.definition.parameters.push({
            name,
            label,
            type: 'number',
            default: defaultValue,
            description
        });
        return this;
    }

    addBoolean(name: string, label: string, defaultValue: boolean = false, description?: string): NodeBuilder {
        this.definition.parameters.push({
            name,
            label,
            type: 'boolean',
            default: defaultValue,
            description
        });
        return this;
    }

    addSlider(name: string, label: string, min: number, max: number, defaultValue: number, step: number = 1, description?: string): NodeBuilder {
        this.definition.parameters.push({
            name,
            label,
            type: 'slider',
            default: defaultValue,
            min,
            max,
            step,
            description
        });
        return this;
    }

    addToggle(name: string, label: string, defaultValue: boolean = false, description?: string): NodeBuilder {
        this.definition.parameters.push({
            name,
            label,
            type: 'toggle',
            default: defaultValue,
            description
        });
        return this;
    }

    addSelect(name: string, label: string, options: string[], defaultValue?: string, description?: string): NodeBuilder {
        this.definition.parameters.push({
            name,
            label,
            type: 'select',
            options,
            default: defaultValue || options[0],
            description
        });
        return this;
    }

    addFile(name: string, label: string, description?: string): NodeBuilder {
        this.definition.parameters.push({
            name,
            label,
            type: 'file',
            description
        });
        return this;
    }

    addSaveFile(name: string, label: string, description?: string): NodeBuilder {
        this.definition.parameters.push({
            name,
            label,
            type: 'save-file',
            description
        });
        return this;
    }

    // --- Execution ---

    setPythonCode(code: string, libraries: string[] = []): NodeBuilder {
        this.definition.language = 'python';
        this.definition.defaultCode = code;
        this.definition.libraries = libraries;
        return this;
    }

    setRCode(code: string, libraries: string[] = []): NodeBuilder {
        this.definition.language = 'r';
        this.definition.defaultCode = code;
        this.definition.libraries = libraries;
        return this;
    }

    /**
     * Build the ToolDefinition
     */
    build(): ToolDefinition {
        return this.definition;
    }
}
