import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('fasta-input', 'FASTA Input')
    .setCategory('Input/Output')
    .setDescription('Load FASTA/FASTQ sequence files using BioPython')
    .addFile('path', 'FASTA File', 'Path to .fasta or .fq file')
    .addString('variable_name', 'Variable Name', 'sequences')
    .addSelect('format', 'File Format', ['fasta', 'fastq', 'genbank'], 'fasta')
    .withResultOutput()
    .setPythonCode(`# FASTA Input Node
from Bio import SeqIO
import os

path = params.get('path', '')
var_name = params.get('variable_name', 'sequences')
fmt = params.get('format', 'fasta')

if path and os.path.exists(path):
    records = list(SeqIO.parse(path, fmt))
    print(f"Loaded {len(records)} sequences from {os.path.basename(path)}")
    for r in records[:5]:
        print(f"  > {r.id} | length={len(r.seq)}")
    globals()[var_name] = records
else:
    raise FileNotFoundError(f"File not found: {path}")
`, ['biopython'])
    .build();
