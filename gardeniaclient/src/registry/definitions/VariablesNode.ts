import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'variables',
    name: 'Variables',
    description: 'Splits a dataset into individual column variables for downstream processing',
    category: 'Preprocessing',
    version: '1.0.0',
    inputs: [
        { name: 'data', type: 'dataset', description: 'Input dataset to split into variables' }
    ],
    outputs: [
        { name: 'variables', type: 'dataset', description: 'Individual variables extracted from dataset' }
    ],
    parameters: [],
    defaultCode: `# Variables Node
# Receives a dataset (via Arrow IPC) and makes each column available as a separate variable

if (exists("data") && is.data.frame(data)) {
    print(paste("Processing dataset with", ncol(data), "columns"))
    print(paste("Column names:", paste(names(data), collapse=", ")))
    
    # Each column is now accessible as data$columnName
    # With Arrow IPC, 'data' is a native R DataFrame (zero-copy from Python/Parquet)
    
    # List all variables
    for (col in names(data)) {
        print(paste("Variable:", col))
        print(paste("  Type:", class(data[[col]])))
        # Sample values
        vals <- head(data[[col]], 3)
        print(paste("  Sample:", paste(vals, collapse=", ")))
    }
    
    # Store column names for downstream nodes
    variables <- names(data)
    print("Variables extracted successfully via Arrow IPC")
} else {
    print("Error: No valid dataset received. Please connect to a data source.")
}
`,
    language: 'r',
    libraries: ['base', 'arrow'] // Arrow is implicitly used by the bridge but good to document
};

export default tool;
