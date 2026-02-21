import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('ggplot-custom', 'ggplot2 Custom')
    .setCategory('Visualization')
    .setDescription('Create custom plots using ggplot2 R syntax')
    .withDataInput()
    .addOutput('plot', 'image', 'Custom ggplot')
    .addSelect('geom', 'Geometry', ['point', 'line', 'bar', 'boxplot', 'violin', 'histogram', 'density'], 'point')
    .addString('x', 'X Variable', '', 'Column for x aesthetic')
    .addString('y', 'Y Variable', '', 'Column for y aesthetic (optional for histogram)')
    .addString('color', 'Color By', '', 'Column to color by (optional)')
    .setRCode(`# ggplot2 Custom Plot Node
library(ggplot2)

geom_type <- params$geom
x_var <- params$x
y_var <- params$y
color_var <- params$color

if (exists("data") && is.data.frame(data)) {
    if (x_var == "" || !(x_var %in% names(data))) x_var <- names(data)[1]
    
    # Build aes
    if (color_var != "" && color_var %in% names(data)) {
        if (y_var != "" && y_var %in% names(data)) {
            p <- ggplot(data, aes_string(x=x_var, y=y_var, color=color_var))
        } else {
            p <- ggplot(data, aes_string(x=x_var, color=color_var))
        }
    } else {
        if (y_var != "" && y_var %in% names(data)) {
            p <- ggplot(data, aes_string(x=x_var, y=y_var))
        } else {
            p <- ggplot(data, aes_string(x=x_var))
        }
    }
    
    # Add geometry
    p <- switch(geom_type,
        "point" = p + geom_point(alpha=0.7, size=2),
        "line" = p + geom_line(),
        "bar" = p + geom_bar(stat="identity"),
        "boxplot" = p + geom_boxplot(fill="#3498db", alpha=0.7),
        "violin" = p + geom_violin(fill="#3498db", alpha=0.7),
        "histogram" = p + geom_histogram(fill="#3498db", alpha=0.7, bins=30),
        "density" = p + geom_density(fill="#3498db", alpha=0.5),
        p + geom_point()
    )
    
    p <- p + theme_minimal(base_size=14) +
        labs(title=paste("ggplot2:", geom_type))
    
    print(p)
    print(paste("Plot generated:", geom_type, "with", nrow(data), "observations"))
} else {
    stop("No input data. Connect a dataset.")
}
`, ['ggplot2'])
    .build();
