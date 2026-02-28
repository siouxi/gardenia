import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('motif-search', 'Motif Search')
    .setCategory('Sequence Analysis')
    .setDescription('Search for sequence motifs and regulatory elements using BioPython')
    .addInput('sequences', 'dataset', 'Input sequences')
    .withResultOutput()
    .addString('motif', 'Motif Pattern', 'TATAAA', 'DNA/protein motif to search for (IUPAC)')
    .setPythonCode(`# Motif Search Node
from Bio import motifs, SeqIO
from Bio.Seq import Seq

import re

motif_str = params.get('motif', 'TATAAA')

if 'sequences' in dir() and sequences:
    rows = []
    for rec in sequences:
        seq_str = str(rec.seq).upper()
        pattern = motif_str.upper()
        
        # Find all occurrences
        positions = [m.start() for m in re.finditer(pattern, seq_str)]
        
        if positions:
            for pos in positions:
                rows.append({
                    'sequence_id': rec.id, 'motif': pattern,
                    'position': pos + 1, 'strand': '+',
                    'context': seq_str[max(0,pos-5):pos+len(pattern)+5]
                })
        
        # Also search reverse complement
        rc = str(Seq(pattern).reverse_complement())
        rc_positions = [m.start() for m in re.finditer(rc, seq_str)]
        for pos in rc_positions:
            rows.append({
                'sequence_id': rec.id, 'motif': pattern,
                'position': pos + 1, 'strand': '-',
                'context': seq_str[max(0,pos-5):pos+len(rc)+5]
            })
    
    result = pd.DataFrame(rows)
    print(f"Motif '{motif_str}': {len(result)} occurrences in {len(sequences)} sequences")
    if len(result) > 0:
        print(result.head(10))
    else:
        print("No matches found")
else:
    raise ValueError("No sequences. Connect a FASTA Input.")
`, ['biopython'])
    .build();
