import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('bar-plot', 'Bar Plot')
    .setCategory('Visualization')
    .setDescription('Create bar plots with matplotlib')
    .withDataInput()
    .addOutput('plot', 'image', 'Bar plot')
    .addString('x', 'X Column', '', 'Column for x-axis categories')
    .addString('y', 'Y Column', '', 'Column for y-axis values')
    .addSelect('orientation', 'Orientation', ['vertical', 'horizontal'], 'vertical')
    .setPythonCode(`# Bar Plot Node
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

x_col = params.get('x', '')
y_col = params.get('y', '')
orientation = params.get('orientation', 'vertical')

# 🛡️ ARCHITECTURE COMPLIANT NODE (Zero-Copy & Streaming)
import pandas as pd

def process_chunk(data: pd.DataFrame) -> pd.DataFrame:
    if not x_col or x_col not in data.columns:
        x_col = data.columns[0]
    if not y_col or y_col not in data.columns:
        numeric = data.select_dtypes(include='number').columns
        y_col = numeric[0] if len(numeric) > 0 else data.columns[1]

    plot_data = data.head(30)  # Limit for readability

    fig, ax = plt.subplots(figsize=(10, 6))
    colors = plt.cm.viridis([i/len(plot_data) for i in range(len(plot_data))])

    if orientation == 'horizontal':
        ax.barh(plot_data[x_col].astype(str), plot_data[y_col], color=colors)
        ax.set_xlabel(y_col)
        ax.set_ylabel(x_col)
    else:
        ax.bar(plot_data[x_col].astype(str), plot_data[y_col], color=colors)
        ax.set_xlabel(x_col)
        ax.set_ylabel(y_col)
        plt.xticks(rotation=45, ha='right')

    ax.set_title(f"Bar Plot: {y_col} by {x_col}")
    plt.tight_layout()
    plt.savefig('bar_plot.png', dpi=150)
    plt.close()
    print(f"Bar plot saved ({len(plot_data)} categories)")
    result = data
    return result if 'result' in locals() else data

# 1. STREAMING MODE SUPPORT
if 'stream_input' in dir() and hasattr(stream_input('data'), '__iter__'):
    stream = stream_input('data')
    for chunk in stream:
        yield process_chunk(chunk)

# 2. ZERO-COPY FULL MEMORY MODE SUPPORT
el# 🛡️ ARCHITECTURE COMPLIANT NODE (Zero-Copy & Streaming)
import pandas as pd

def process_chunk(data: pd.DataFrame) -> pd.DataFrame:
    result = process_chunk(data)
    print("Zero-Copy block processed successfully.")
    return result if 'result' in locals() else data

# 1. STREAMING MODE SUPPORT
if 'stream_input' in globals() and hasattr(stream_input('data'), '__iter__'):
    stream = stream_input('data')
    for chunk in stream:
        yield process_chunk(chunk)

# 2. ZERO-COPY FULL MEMORY MODE SUPPORT
elif 'data' in globals() and isinstance(globals()['data'], pd.DataFrame):
    result = process_chunk(globals()['data'])
    print("Zero-Copy block processed successfully.")
else:
    raise ValueError("Connect a dataset (Zero-Copy) or stream (Streaming) to the input.")
`, ['matplotlib', 'pandas'])
    .build();
