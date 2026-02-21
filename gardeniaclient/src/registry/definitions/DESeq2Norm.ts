import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('deseq2-norm', 'DESeq2 Normalization')
    .setCategory('Normalization')
    .setDescription('Compute DESeq2 size factors and return normalized counts')
    .withDataInput()
    .addInput('coldata', 'dataset', 'Sample metadata with condition column')
    .withResultOutput()
    .addString('design', 'Design Formula', '~ condition', 'DESeq2 design formula')
    .setRCode(`# DESeq2 Normalization Node
library(DESeq2)

if (exists("data") && is.data.frame(data)) {
    count_mat <- as.matrix(data[, sapply(data, is.numeric)])
    rownames(count_mat) <- rownames(data)
    
    # Build colData
    if (exists("coldata") && is.data.frame(coldata)) {
        cd <- coldata
    } else {
        cd <- data.frame(condition=factor(rep(c("A","B"), length.out=ncol(count_mat))))
        rownames(cd) <- colnames(count_mat)
        print("No coldata provided, using dummy conditions")
    }
    
    design_formula <- as.formula(params$design)
    dds <- DESeqDataSetFromMatrix(countData=round(count_mat),
                                  colData=cd,
                                  design=design_formula)
    dds <- estimateSizeFactors(dds)
    result <- as.data.frame(counts(dds, normalized=TRUE))
    
    print(paste("Normalized", nrow(result), "genes across", ncol(result), "samples"))
    print(paste("Size factors:", paste(round(sizeFactors(dds), 3), collapse=", ")))
    print(head(result))
} else {
    stop("No count matrix provided. Connect a dataset.")
}
`, ['DESeq2'])
    .build();
