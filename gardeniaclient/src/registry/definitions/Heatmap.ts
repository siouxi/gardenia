import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('heatmap', 'Heatmap')
    .setCategory('Visualization')
    .setDescription('Generate a clustered heatmap using pheatmap')
    .withDataInput()
    .addOutput('plot', 'image', 'Heatmap image')
    .addToggle('cluster_rows', 'Cluster Rows', true)
    .addToggle('cluster_cols', 'Cluster Cols', true)
    .addToggle('scale_rows', 'Scale by Row', true)
    .setRCode(`# Heatmap Node
library(pheatmap)

cluster_rows <- as.logical(params$cluster_rows)
cluster_cols <- as.logical(params$cluster_cols)
scale_opt <- ifelse(as.logical(params$scale_rows), "row", "none")

if (exists("data") && is.data.frame(data)) {
    mat <- as.matrix(data[, sapply(data, is.numeric)])
    
    if (!is.null(rownames(data))) rownames(mat) <- rownames(data)
    
    # Limit size for performance
    if (nrow(mat) > 500) {
        vars <- apply(mat, 1, var, na.rm=TRUE)
        top_idx <- order(vars, decreasing=TRUE)[1:500]
        mat <- mat[top_idx, ]
        print(paste("Showing top 500 most variable rows out of", nrow(data)))
    }
    
    pheatmap(mat,
             cluster_rows=cluster_rows,
             cluster_cols=cluster_cols,
             scale=scale_opt,
             show_rownames=(nrow(mat) <= 50),
             main="Heatmap",
             color=colorRampPalette(c("#3498db", "white", "#e74c3c"))(100))
    
    print(paste("Heatmap:", nrow(mat), "rows ×", ncol(mat), "columns"))
} else {
    stop("No input data. Connect a dataset.")
}
`, ['pheatmap'])
    .build();
