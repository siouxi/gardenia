import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'csv-input',
    name: 'CSV Input',
    description: 'Load a CSV file from the local file system',
    category: 'Input',
    version: '1.0.0',
    inputs: [
        { name: 'trigger', type: 'signal', description: 'Trigger to execute this node' }
    ],
    outputs: [
        { name: 'data', type: 'dataset', description: 'Loaded data' }
    ],
    parameters: [
        {
            name: 'path',
            type: 'file',
            label: 'CSV File',
            required: true
        }
    ],
    defaultCode: `# CSV Input Node
# Parameter 'path' is injected automatically

if (exists("path") && path != "") {
    print(paste("Loading CSV from:", path))
    if (file.exists(path)) {
        data <- read.csv(path)
        print(paste("Rows:", nrow(data), "Columns:", ncol(data)))
        print(head(data))
    } else {
        print(paste("Error: File not found at", path))
    }
} else {
    print("No file selected. Please choose a CSV file.")
}
`,
    language: 'r',
    libraries: ['utils'] // Base R CSV reading functions
};

export default tool;
