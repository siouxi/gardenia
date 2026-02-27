import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('train-test-split', 'Train/Test Split')
    .setCategory('Machine Learning')
    .setDescription('Split a dataset into training and testing subsets')
    .withDataInput()
    .addOutput('train', 'dataset', 'Training subset')
    .addOutput('test', 'dataset', 'Testing subset')
    .addSlider('test_size', 'Test Size %', 5, 50, 20, 5)
    .addToggle('shuffle', 'Shuffle', true)
    .addNumber('random_state', 'Random Seed', 42)
    .setPythonCode(`# Train/Test Split Node
import pandas as pd
from sklearn.model_selection import train_test_split

test_pct = params.get('test_size', 20) / 100
shuffle = params.get('shuffle', True)
seed = int(params.get('random_state', 42))

# 🛡️ ARCHITECTURE COMPLIANT NODE (Zero-Copy & Streaming)
import pandas as pd

def process_chunk(data: pd.DataFrame) -> pd.DataFrame:
    train, test = train_test_split(data, test_size=test_pct, shuffle=shuffle, random_state=seed)
    print(f"Split: {len(data)} → Train: {len(train)}, Test: {len(test)}")
    print(f"Train ratio: {len(train)/len(data)*100:.0f}%, Test ratio: {len(test)/len(data)*100:.0f}%")
    return result if 'result' in locals() else data

# 1. STREAMING MODE SUPPORT
if 'stream_input' in dir() and hasattr(stream_input('data'), '__iter__'):
    stream = stream_input('data')
    for chunk in stream:
        yield process_chunk(chunk)

# 2. ZERO-COPY FULL MEMORY MODE SUPPORT
elif 'data' in dir() and isinstance(data, pd.DataFrame):
    result = process_chunk(data)
    print("Zero-Copy block processed successfully.")
else:
    raise ValueError("Connect a dataset (Zero-Copy) or stream (Streaming) to the input.")
`, ['scikit-learn', 'pandas'])
    .build();
