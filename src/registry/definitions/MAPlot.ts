import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'ma-plot',
    name: 'MA Plot',
    description: 'Visualizes differences between measurements in two samples',
    category: 'Visualization',
    version: '1.0.0',
    inputs: [
        { name: 'control', type: 'dataset', description: 'Control sample dataset' },
        { name: 'treatment', type: 'dataset', description: 'Treatment sample dataset' }
    ],
    outputs: [
        { name: 'plot', type: 'image', description: 'Generated MA Plot' }
    ],
    parameters: [
        {
            name: 'alpha',
            type: 'number',
            label: 'Significance Level',
            default: 0.05
        }
    ],
    defaultCode: `# MA Plot Generation
# Expected inputs: 'control' and 'treatment' dataframes
# Output: Saves plot to 'ma_plot.png'

# 1. Load Data (Simulated for template if inputs missing)
if (!exists("control")) control <- data.frame(mean=runif(100, 0, 100))
if (!exists("treatment")) treatment <- data.frame(mean=runif(100, 0, 100))

# 2. Calculate M (log ratio) and A (mean average)
# Assuming data has 'expression' column or similar. Adjust as needed.
# For demo: just random data
M <- log2(treatment$mean / control$mean)
A <- 0.5 * log2(treatment$mean * control$mean)

# 3. Create Plot
png("ma_plot.png", width=800, height=600)
plot(A, M, main="MA Plot", pch=19, col=rgb(0,0,0,0.5), xlab="A (Log Intensity)", ylab="M (Log Ratio)")
abline(h=0, col="red", lwd=2)
dev.off()

print("MA Plot generated successfully")
`,
    language: 'r',
    libraries: ['grDevices'] // Base R graphics library
};

export default tool;
