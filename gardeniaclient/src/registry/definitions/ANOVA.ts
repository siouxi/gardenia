import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('anova', 'ANOVA')
    .setCategory('Statistical Analysis')
    .setDescription('One-way ANOVA to compare means across groups')
    .withDataInput()
    .withResultOutput()
    .addString('response', 'Response Variable', '', 'Numeric column to test')
    .addString('groups', 'Grouping Variable', '', 'Categorical column defining groups')
    .setRCode(`# ANOVA Node
response_col <- params$response
groups_col <- params$groups

if (exists("data") && is.data.frame(data)) {
    if (!(response_col %in% names(data))) stop(paste("Column not found:", response_col))
    if (!(groups_col %in% names(data))) stop(paste("Column not found:", groups_col))
    
    formula <- as.formula(paste(response_col, "~", groups_col))
    model <- aov(formula, data=data)
    s <- summary(model)
    
    print(paste("One-way ANOVA:", response_col, "~", groups_col))
    print(s)
    
    # Extract results
    f_val <- s[[1]][["F value"]][1]
    p_val <- s[[1]][["Pr(>F)"]][1]
    print(paste("F-statistic:", round(f_val, 4)))
    print(paste("p-value:", format(p_val, digits=6)))
    print(paste("Significant (α=0.05):", ifelse(p_val < 0.05, "Yes ✓", "No")))
    
    result <- as.data.frame(s[[1]])
} else {
    stop("No input data. Connect a dataset.")
}
`, ['stats'])
    .build();
