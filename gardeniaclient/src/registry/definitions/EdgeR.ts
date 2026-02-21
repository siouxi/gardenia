import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('edger', 'edgeR Analysis')
    .setCategory('Differential Expression')
    .setDescription('Differential expression analysis using edgeR')
    .addInput('counts', 'dataset', 'Raw count matrix (genes × samples)')
    .withResultOutput()
    .addString('group', 'Group Labels', '1,1,2,2', 'Comma-separated group labels for each sample')
    .addNumber('fdr', 'FDR Threshold', 0.05)
    .setRCode(`# edgeR Differential Expression Analysis
library(edgeR)

fdr_thresh <- as.numeric(params$fdr)
group_str <- params$group

if (exists("counts") && is.data.frame(counts)) {
    count_mat <- as.matrix(counts[, sapply(counts, is.numeric)])
    group <- factor(trimws(unlist(strsplit(group_str, ","))))
    
    if (length(group) != ncol(count_mat)) {
        stop(paste("Group labels (", length(group), ") must match number of samples (", ncol(count_mat), ")"))
    }
    
    y <- DGEList(counts=count_mat, group=group)
    keep <- filterByExpr(y)
    y <- y[keep, , keep.lib.sizes=FALSE]
    y <- calcNormFactors(y)
    design <- model.matrix(~group)
    y <- estimateDisp(y, design)
    
    fit <- glmQLFit(y, design)
    qlf <- glmQLFTest(fit, coef=2)
    res <- topTags(qlf, n=nrow(y), sort.by="PValue")
    
    result <- as.data.frame(res)
    sig <- result[result$FDR < fdr_thresh, ]
    
    print(paste("edgeR analysis complete"))
    print(paste("Genes tested:", nrow(result)))
    print(paste("Significant (FDR <", fdr_thresh, "):", nrow(sig)))
    print(head(result))
} else {
    stop("No count matrix. Connect a counts dataset.")
}
`, ['edgeR'])
    .build();
