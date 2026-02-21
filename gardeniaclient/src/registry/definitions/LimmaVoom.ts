import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('limma-voom', 'Limma-Voom')
    .setCategory('Differential Expression')
    .setDescription('Differential expression using limma-voom for RNA-seq')
    .addInput('counts', 'dataset', 'Raw count matrix (genes × samples)')
    .withResultOutput()
    .addString('group', 'Group Labels', '1,1,2,2', 'Comma-separated group labels for each sample')
    .addNumber('adj_p', 'Adjusted p-value Threshold', 0.05)
    .setRCode(`# Limma-Voom Differential Expression
library(limma)
library(edgeR)

adj_p_thresh <- as.numeric(params$adj_p)
group_str <- params$group

if (exists("counts") && is.data.frame(counts)) {
    count_mat <- as.matrix(counts[, sapply(counts, is.numeric)])
    group <- factor(trimws(unlist(strsplit(group_str, ","))))
    
    design <- model.matrix(~group)
    dge <- DGEList(counts=count_mat)
    keep <- filterByExpr(dge, design)
    dge <- dge[keep, , keep.lib.sizes=FALSE]
    dge <- calcNormFactors(dge)
    
    v <- voom(dge, design, plot=FALSE)
    fit <- lmFit(v, design)
    fit <- eBayes(fit)
    
    result <- topTable(fit, coef=2, number=Inf, sort.by="P")
    sig <- result[result$adj.P.Val < adj_p_thresh, ]
    
    print("Limma-Voom analysis complete")
    print(paste("Genes tested:", nrow(result)))
    print(paste("Significant (adj.P <", adj_p_thresh, "):", nrow(sig)))
    print(head(result))
} else {
    stop("No count matrix. Connect a counts dataset.")
}
`, ['limma', 'edgeR'])
    .build();
