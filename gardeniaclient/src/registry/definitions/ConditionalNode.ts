import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('conditional', 'Conditional')
    .setCategory('Utilities')
    .setDescription('Route data to different branches based on a condition. Connect true_out and false_out to different downstream paths.')
    .addInput('data', 'dataset', 'Input data to evaluate')
    .addOutput('true_out', 'dataset', 'Data when condition is TRUE')
    .addOutput('false_out', 'dataset', 'Data when condition is FALSE')
    .addString('condition', 'Condition', 'len(data) > 1000', 'Python expression that evaluates to True or False')
    .setPythonCode(`# Conditional Branch Node
# The condition is evaluated and data is routed to true_out or false_out
import pandas as pd

condition_expr = params.get('condition', 'True')

if 'data' not in dir():
    raise ValueError("Connect a dataset to the 'data' input")

# Evaluate the condition
try:
    condition_result = eval(condition_expr)
except Exception as e:
    raise ValueError(f"Invalid condition '{condition_expr}': {e}")

if condition_result:
    print(f"✅ Condition TRUE: {condition_expr}")
    result = data
    __branch_handle__ = "true_out"
else:
    print(f"❌ Condition FALSE: {condition_expr}")
    result = data
    __branch_handle__ = "false_out"
`, ['pandas'])
    .build();
