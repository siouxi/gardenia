import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('deseq2', 'DESeq2 Analysis')
    .setCategory('Differential Expression')
    .setDescription('Full DESeq2 differential expression analysis with results table')
    .addInput('counts', 'dataset', 'Raw count matrix (genes × samples)')
    .addInput('coldata', 'dataset', 'Sample metadata with condition column')
    .withResultOutput()
    .addOutput('significant', 'dataset', 'Significant genes (padj < alpha)')
    .addString('design', 'Design Formula', '~ condition')
    .addNumber('alpha', 'Significance Level', 0.05)
    .addNumber('lfc_threshold', 'Log2 FC Threshold', 1.0)
    .setRCode(`# DESeq2 Differential Expression Analysis
library(DESeq2)

alpha <- as.numeric(params$alpha)
lfc_thresh <- as.numeric(params$lfc_threshold)
design_formula <- as.formula(params$design)

if (exists("counts") && is.data.frame(counts)) {
    count_mat <- as.matrix(counts[, sapply(counts, is.numeric)])
    rownames(count_mat) <- rownames(counts)
    
    if (exists("coldata") && is.data.frame(coldata)) {
        cd <- coldata
    } else {
        cd <- data.frame(condition=factor(rep(c("control","treatment"), length.out=ncol(count_mat))))
        rownames(cd) <- colnames(count_mat)
        print("Warning: No coldata provided, using dummy conditions")
    }
    
    dds <- DESeqDataSetFromMatrix(countData=round(count_mat), colData=cd, design=design_formula)
    dds <- DESeq(dds)
    res <- results(dds, alpha=alpha)
    
    result <- as.data.frame(res)
    result <- result[order(result$padj), ]
    
    significant <- result[!is.na(result$padj) & result$padj < alpha & abs(result$log2FoldChange) > lfc_thresh, ]
    
    print(paste("Total genes:", nrow(result)))
    print(paste("Significant (padj <", alpha, "& |LFC| >", lfc_thresh, "):", nrow(significant)))
    print(paste("  Upregulated:", sum(significant$log2FoldChange > 0)))
    print(paste("  Downregulated:", sum(significant$log2FoldChange < 0)))
    print(head(significant))
} else {
    stop("No count matrix. Connect a counts dataset.")
}
`, ['DESeq2'])
    .build();
