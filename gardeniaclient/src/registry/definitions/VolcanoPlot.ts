import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('volcano-plot', 'Volcano Plot')
    .setCategory('Visualization')
    .setDescription('Volcano plot for differential expression results using ggplot2')
    .withDataInput()
    .addOutput('plot', 'image', 'Volcano plot')
    .addNumber('fc_thresh', 'Log2 FC Threshold', 1.0)
    .addNumber('pval_thresh', 'p-value Threshold', 0.05)
    .setRCode(`# Volcano Plot Node
library(ggplot2)

fc_thresh <- as.numeric(params$fc_thresh)
pval_thresh <- as.numeric(params$pval_thresh)

if (exists("data") && is.data.frame(data)) {
    # Expect columns: log2FoldChange, pvalue or padj
    if ("log2FoldChange" %in% names(data)) {
        lfc_col <- "log2FoldChange"
    } else {
        lfc_col <- names(data)[sapply(data, is.numeric)][1]
    }
    
    if ("padj" %in% names(data)) {
        p_col <- "padj"
    } else if ("pvalue" %in% names(data)) {
        p_col <- "pvalue"
    } else {
        p_col <- names(data)[sapply(data, is.numeric)][2]
    }
    
    df <- data
    df$neg_log10_p <- -log10(df[[p_col]])
    df$significance <- ifelse(abs(df[[lfc_col]]) > fc_thresh & df[[p_col]] < pval_thresh,
                              ifelse(df[[lfc_col]] > 0, "Up", "Down"), "NS")
    
    p <- ggplot(df, aes_string(x=lfc_col, y="neg_log10_p", color="significance")) +
        geom_point(alpha=0.6, size=1.5) +
        scale_color_manual(values=c("Up"="#e74c3c", "Down"="#3498db", "NS"="grey70")) +
        geom_vline(xintercept=c(-fc_thresh, fc_thresh), linetype="dashed", color="grey40") +
        geom_hline(yintercept=-log10(pval_thresh), linetype="dashed", color="grey40") +
        theme_minimal(base_size=14) +
        labs(x="Log2 Fold Change", y="-Log10 p-value", title="Volcano Plot")
    
    print(p)
    
    n_up <- sum(df$significance == "Up", na.rm=TRUE)
    n_down <- sum(df$significance == "Down", na.rm=TRUE)
    print(paste("Upregulated:", n_up, "| Downregulated:", n_down))
} else {
    stop("No input data. Connect DE results.")
}
`, ['ggplot2'])
    .build();
