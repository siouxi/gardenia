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

accession <- params$accession

if (is.null(accession) || accession == "") {
    stop("Error: No GEO Accession ID provided.")
}

print(sprintf("Fetching data for GEO Accession: %s", accession))

# Ensure GEOquery is loaded
if (!requireNamespace("GEOquery", quietly = TRUE)) {
    stop("Bioconductor package 'GEOquery' is required. Please install it.")
}
library(GEOquery)

# Download supplementary files
# This creates a directory named after the accession in the current working directory
# and downloads the files into it.
print("Downloading supplementary files...")
supp_files_info <- tryCatch({
    getGEOSuppFiles(accession, makeDirectory = TRUE, baseDir = getwd())
}, error = function(e) {
    print(sprintf("Failed to download supplementary files: %s", e$message))
    return(NULL)
})

# Get series matrix file (contains metadata/phenodata if we need it)
# print("Downloading Series Matrix...")
# gse <- getGEO(accession, GSEMatrix = TRUE)

if (!is.null(supp_files_info)) {
    print("Successfully downloaded files:")
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
