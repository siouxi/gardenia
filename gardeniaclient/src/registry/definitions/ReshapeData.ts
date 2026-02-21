import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('reshape-data', 'Reshape Data (tidyr)')
    .setCategory('Data Wrangling')
    .setDescription('Pivot data between wide and long format using tidyr')
    .withDataInput()
    .withResultOutput()
    .addSelect('operation', 'Operation', ['pivot_longer', 'pivot_wider'], 'pivot_longer')
    .addString('cols', 'Columns', '', 'Comma-separated columns to pivot')
    .addString('names_to', 'Names To', 'name', 'Column name for pivoted names')
    .addString('values_to', 'Values To', 'value', 'Column name for pivoted values')
    .setRCode(`# Reshape Data Node (tidyr)
library(tidyr)
library(dplyr)

operation <- params$operation
cols_str <- params$cols
names_to <- params$names_to
values_to <- params$values_to

if (exists("data") && is.data.frame(data)) {
    if (operation == "pivot_longer") {
        cols <- trimws(unlist(strsplit(cols_str, ",")))
        cols <- cols[cols %in% names(data)]
        if (length(cols) > 0) {
            result <- pivot_longer(data, cols=all_of(cols), names_to=names_to, values_to=values_to)
        } else {
            result <- pivot_longer(data, cols=where(is.numeric), names_to=names_to, values_to=values_to)
        }
        print(paste("Pivoted longer:", nrow(data), "→", nrow(result), "rows"))
    } else {
        result <- pivot_wider(data, names_from=names_to, values_from=values_to)
        print(paste("Pivoted wider:", ncol(data), "→", ncol(result), "columns"))
    }
    print(head(result))
} else {
    stop("No input data. Connect a dataset.")
}
`, ['tidyr', 'dplyr'])
    .build();
