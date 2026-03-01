import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'ncbi-geo-loader',
    name: 'NCBI GEO Loader',
    description: 'Download metadata and supplementary files from NCBI GEO using Bioconductor GEOquery.',
    category: 'Input/Output',
    version: '1.0.0',
    inputs: [
        { name: 'trigger', type: 'signal', description: 'Trigger to execute this node' }
    ],
    outputs: [
        { name: 'geo_data', type: 'dataset', description: 'List of downloaded file details' }
    ],
    parameters: [
        {
            name: 'accession',
            type: 'string',
            label: 'GEO Accession ID',
            default: 'GSE189903',
            required: true
        }
    ],
    defaultCode: `# NCBI GEO Loader Node
# Uses Bioconductor's GEOquery to download series metadata and supplementary files

# 'accession' is automatically injected into the global environment by Gardenia's execution engine
if (!exists("accession") || is.null(accession) || accession == "") {
    stop("Error: No GEO Accession ID provided.")
}

print(sprintf("Fetching data for GEO Accession: %s", accession))

# Ensure GEOquery is loaded
if (!requireNamespace("GEOquery", quietly = TRUE)) {
    stop("Bioconductor package 'GEOquery' is required. Please install it.")
}
library(GEOquery)

# Change download method for better compatibility and to show progress occasionally
options('download.file.method' = 'auto')

# Download supplementary files
# This creates a directory named after the accession in the current working directory
# and downloads the files into it.
print(sprintf("[%s] Connecting to NCBI GEO to download supplementary files...", Sys.time()))
supp_files_info <- tryCatch({
    res <- getGEOSuppFiles(accession, makeDirectory = TRUE, baseDir = getwd(), fetch_files = TRUE)
    print(sprintf("[%s] Finished downloading supplementary files.", Sys.time()))
    res
}, error = function(e) {
    print(sprintf("Failed to download supplementary files: %s", e$message))
    return(NULL)
})

# Get series matrix file (contains metadata/phenodata if we need it)
# print("Downloading Series Matrix...")
# gse <- getGEO(accession, GSEMatrix = TRUE)

if (!is.null(supp_files_info)) {
    print(sprintf("[%s] Successfully retrieved files:", Sys.time()))
    print(rownames(supp_files_info))
    
    # Expose the downloaded paths as a summary table
    geo_data <- data.frame(
        file_path = rownames(supp_files_info),
        size_bytes = supp_files_info$size
    )
    
} else {
    print("No supplementary files found or download failed.")
    geo_data <- data.frame(file_path=character(), size_bytes=numeric())
}
`,
    language: 'r',
    libraries: ['GEOquery'] // Note: this is a Bioconductor package, might need special handling during install
};

export default tool;
