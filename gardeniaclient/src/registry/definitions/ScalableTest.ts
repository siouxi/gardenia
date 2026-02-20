import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('scalable-test', 'Scalability Test')
    .setCategory('Utilities')
    .setDescription('A test node verifying all dynamic UI controls (sliders, toggles, selects) render correctly without modifying React code.')
    .withDataInput()
    .addInput('aux_data', 'dataset', 'Auxiliary data input')
    .withResultOutput()
    .addOutput('plot', 'image', 'A generated plot output')

    // Test the new UI parameters
    .addSlider('threshold', 'Filter Threshold', 0, 100, 50, 5, 'Adjust to filter out values below threshold')
    .addSelect('algorithm', 'Algorithm', ['Random Forest', 'SVM', 'Neural Network'], 'Random Forest', 'Choose the algorithm to apply')
    .addToggle('normalize', 'Normalize Data', true, 'Toggle feature normalization')

    // Legacy tests
    .addString('tag', 'Dataset Tag', 'experiment_1')
    .addNumber('runs', 'Number of Runs', 10)

    .setPythonCode(`
# Scalable UI Test Node
print(f"Algorithm Selected: {params.get('algorithm')}")
print(f"Threshold Set: {params.get('threshold')}")
print(f"Normalization enabled: {params.get('normalize')}")

# Create dummy output data
import pandas as pd
result = pd.DataFrame({"dummy": [1, 2, 3]})
print("Dummy dataset created.")
`)
    .build();
