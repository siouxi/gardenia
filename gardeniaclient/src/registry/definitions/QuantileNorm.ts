import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('quantile-norm', 'Quantile Normalization')
    .setCategory('Normalization')
    .setDescription('Quantile normalization for expression matrices using preprocessCore')
    .withDataInput()
    .withResultOutput()
    .setRCode(`# Quantile Normalization Node
library(preprocessCore)

if (exists("data") && is.data.frame(data)) {
    # Extract numeric columns for normalization
    numeric_data <- data[, sapply(data, is.numeric), drop=FALSE]
    
    if (ncol(numeric_data) > 1) {
        mat <- as.matrix(numeric_data)
        norm_mat <- normalize.quantiles(mat)
        colnames(norm_mat) <- colnames(numeric_data)
        
        result <- data
        result[, colnames(norm_mat)] <- as.data.frame(norm_mat)
        
        print(paste("Quantile normalized", ncol(numeric_data), "columns"))
        print(head(result))
    } else {
        result <- data
        print("Need at least 2 numeric columns for quantile normalization")
    }
} else {
    stop("No input data. Connect a dataset.")
}
`, ['preprocessCore'])
    .build();
