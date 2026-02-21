import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('translate-seq', 'Translate Sequence')
    .setCategory('Sequence Analysis')
    .setDescription('Translate DNA/RNA sequences to protein using BioPython')
    .addInput('sequences', 'dataset', 'Input nucleotide sequences')
    .withResultOutput()
    .addSelect('table', 'Genetic Code', ['Standard', 'Vertebrate Mitochondrial', 'Bacterial'], 'Standard')
    .setPythonCode(`# Translate Sequence Node
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
import pandas as pd

table = params.get('table', 'Standard')

if 'sequences' in dir() and sequences:
    rows = []
    translated = []
    for rec in sequences:
        try:
            protein = rec.seq.translate(table=table)
            translated.append(SeqRecord(protein, id=rec.id + "_protein", description="translated"))
            rows.append({
                'id': rec.id, 'nt_length': len(rec.seq),
                'aa_length': len(protein), 'protein': str(protein)[:50] + '...'
            })
            print(f"  {rec.id}: {len(rec.seq)} nt → {len(protein)} aa")
        except Exception as e:
            print(f"  {rec.id}: Translation error - {e}")
    
    result = pd.DataFrame(rows)
    print(f"\\nTranslated {len(rows)} sequences (table: {table})")
else:
    raise ValueError("No sequences. Connect a FASTA Input.")
`, ['biopython'])
    .build();
