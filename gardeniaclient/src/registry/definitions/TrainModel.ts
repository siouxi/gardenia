import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('train-model', 'Train Model')
    .setCategory('Machine Learning')
    .setDescription('Train a scikit-learn classification or regression model')
    .withDataInput()
    .withResultOutput()
    .addString('target', 'Target Column', '', 'Column name for the target variable')
    .addSelect('model', 'Model', ['RandomForest', 'LogisticRegression', 'SVM', 'GradientBoosting', 'KNN'], 'RandomForest')
    .addSelect('task', 'Task', ['classification', 'regression'], 'classification')
    .addSlider('test_size', 'Test Split %', 10, 50, 20, 5)
    .setPythonCode(`# Train Model Node

from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, r2_score

target_col = params.get('target', '')
model_name = params.get('model', 'RandomForest')
task = params.get('task', 'classification')
test_size = params.get('test_size', 20) / 100

if 'data' not in dir() or not isinstance(data, pd.DataFrame):
    raise ValueError("Connect a dataset to the input")
if target_col not in data.columns:
    raise ValueError(f"Target '{target_col}' not found. Available: {list(data.columns)}")

X = data.drop(columns=[target_col]).select_dtypes(include='number')
y = data[target_col]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, random_state=42)

# Model selection
if task == 'classification':
    if model_name == 'RandomForest':
        from sklearn.ensemble import RandomForestClassifier
        model = RandomForestClassifier(n_estimators=100, random_state=42)
    elif model_name == 'LogisticRegression':
        from sklearn.linear_model import LogisticRegression
        model = LogisticRegression(max_iter=1000)
    elif model_name == 'SVM':
        from sklearn.svm import SVC
        model = SVC()
    elif model_name == 'GradientBoosting':
        from sklearn.ensemble import GradientBoostingClassifier
        model = GradientBoostingClassifier(random_state=42)
    elif model_name == 'KNN':
        from sklearn.neighbors import KNeighborsClassifier
        model = KNeighborsClassifier()
else:
    if model_name == 'RandomForest':
        from sklearn.ensemble import RandomForestRegressor
        model = RandomForestRegressor(n_estimators=100, random_state=42)
    elif model_name == 'GradientBoosting':
        from sklearn.ensemble import GradientBoostingRegressor
        model = GradientBoostingRegressor(random_state=42)
    else:
        from sklearn.linear_model import LinearRegression
        model = LinearRegression()

model.fit(X_train, y_train)
y_pred = model.predict(X_test)

if task == 'classification':
    score = accuracy_score(y_test, y_pred)
    print(f"Accuracy: {score:.4f}")
else:
    score = r2_score(y_test, y_pred)
    print(f"R² Score: {score:.4f}")

print(f"Model: {model_name} ({task})")
print(f"Features: {len(X.columns)}, Train: {len(X_train)}, Test: {len(X_test)}")

result = pd.DataFrame({'actual': y_test.values, 'predicted': y_pred})
`, ['scikit-learn', 'pandas'])
    .build();
