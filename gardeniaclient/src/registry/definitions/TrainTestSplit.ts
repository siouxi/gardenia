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

from sklearn.model_selection import train_test_split

test_pct = params.get('test_size', 20) / 100
shuffle = params.get('shuffle', True)
seed = int(params.get('random_state', 42))

if 'data' in dir() and isinstance(data, pd.DataFrame):
train, test = train_test_split(data, test_size=test_pct, shuffle=shuffle, random_state=seed)
print(f"Split: {len(data)} → Train: {len(train)}, Test: {len(test)}")
print(f"Train ratio: {len(train)/len(data)*100:.0f}%, Test ratio: {len(test)/len(data)*100:.0f}%")

`, ['pandas'])
    .build();
