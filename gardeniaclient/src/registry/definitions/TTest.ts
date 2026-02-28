import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('ttest', 'T-Test')
    .setCategory('Statistical Analysis')
    .setDescription('Perform independent or paired t-test between two groups')
    .withDataInput()
    .withResultOutput()
    .addString('col_a', 'Group A Column', '', 'Column name for group A')
    .addString('col_b', 'Group B Column', '', 'Column name for group B')
    .addSelect('test_type', 'Test Type', ['independent', 'paired', 'one_sample'], 'independent')
    .addToggle('equal_var', 'Assume Equal Variance', true)
    .setPythonCode(`# T-Test Node

from scipy import stats

col_a = params.get('col_a', '')
col_b = params.get('col_b', '')
test_type = params.get('test_type', 'independent')
equal_var = params.get('equal_var', True)

if 'data' in dir() and isinstance(data, pd.DataFrame):
if col_a not in data.columns:
    raise ValueError(f"Column '{col_a}' not found. Available: {list(data.columns)}")

a = data[col_a].dropna()

if test_type == 'one_sample':
    stat, pval = stats.ttest_1samp(a, 0)
    print(f"One-sample t-test on '{col_a}'")
else:
    if col_b not in data.columns:
        raise ValueError(f"Column '{col_b}' not found")
    b = data[col_b].dropna()
    if test_type == 'paired':
        stat, pval = stats.ttest_rel(a, b)
        print(f"Paired t-test: '{col_a}' vs '{col_b}'")
    else:
        stat, pval = stats.ttest_ind(a, b, equal_var=equal_var)
        print(f"Independent t-test: '{col_a}' vs '{col_b}'")

print(f"  t-statistic: {stat:.4f}")
print(f"  p-value: {pval:.6f}")
print(f"  Significant (α=0.05): {'Yes ✓' if pval < 0.05 else 'No'}")

result = pd.DataFrame({'statistic': [stat], 'p_value': [pval], 'significant': [pval < 0.05]})

`, ['pandas'])
    .build();
