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
# Receives a dataset and makes each column available as a separate variable

if (exists("data") && is.data.frame(data)) {
    print(paste("Processing dataset with", ncol(data), "columns"))
    print(paste("Column names:", paste(names(data), collapse=", ")))
    
    # Each column is now accessible as data$columnName
    # For example, if dataset has columns: age, height, weight
    # You can access them as: data$age, data$height, data$weight
    
    # List all variables
    for (col in names(data)) {
        print(paste("Variable:", col))
        print(paste("  Type:", class(data[[col]])))
        print(paste("  Sample values:", paste(head(data[[col]], 3), collapse=", ")))
    }
    
    # Store column names for downstream nodes
    variables <- names(data)
    print("Variables extracted successfully")
} else {
    print("Error: No valid dataset received. Please connect to a data source.")
}
`,
    language: 'r',
    libraries: ['base'] // Base R data manipulation
};

export default tool;
