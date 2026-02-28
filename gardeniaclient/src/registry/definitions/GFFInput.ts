import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('gff-input', 'GFF/GTF Input')
    .setCategory('Input/Output')
    .setDescription('Load GFF3 or GTF annotation files into a DataFrame')
    .addFile('path', 'GFF/GTF File', 'Path to annotation file')
    .addString('variable_name', 'Variable Name', 'annotations')
    .withResultOutput()
    .setPythonCode(`# GFF/GTF Input Node

import os

path = params.get('path', '')
var_name = params.get('variable_name', 'annotations')

if path and os.path.exists(path):
    cols = ['seqid', 'source', 'type', 'start', 'end', 'score', 'strand', 'phase', 'attributes']
    df = pd.read_csv(path, sep='\\t', comment='#', header=None, names=cols)
    print(f"Loaded {len(df)} features from {os.path.basename(path)}")
    print(f"Feature types: {df['type'].value_counts().head().to_dict()}")
    globals()[var_name] = df
else:
    raise FileNotFoundError(f"File not found: {path}")
`, ['pandas'])
    .build();
