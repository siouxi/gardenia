import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('phylo-tree', 'Phylogenetic Tree')
    .setCategory('Sequence Analysis')
    .setDescription('Build a neighbor-joining phylogenetic tree from aligned sequences')
    .addInput('sequences', 'dataset', 'Input aligned sequences')
    .withResultOutput()
    .addOutput('tree', 'image', 'Phylogenetic tree visualization')
    .setPythonCode(`# Phylogenetic Tree Node
from Bio import Phylo
from Bio.Phylo.TreeConstruction import DistanceCalculator, DistanceTreeConstructor
from Bio.Align import MultipleSeqAlignment
from Bio.SeqRecord import SeqRecord
from Bio.Seq import Seq


if 'sequences' in dir() and sequences and len(sequences) >= 3:
    # Pad sequences to same length for alignment
    max_len = max(len(r.seq) for r in sequences)
    aligned_recs = []
    for r in sequences:
        padded = str(r.seq) + '-' * (max_len - len(r.seq))
        aligned_recs.append(SeqRecord(Seq(padded), id=r.id))
    
    alignment = MultipleSeqAlignment(aligned_recs)
    
    calculator = DistanceCalculator('identity')
    dm = calculator.get_distance(alignment)
    
    constructor = DistanceTreeConstructor()
    tree = constructor.nj(dm)
    
    print("Neighbor-Joining Phylogenetic Tree:")
    Phylo.draw_ascii(tree)
    
    # Extract branch info
    rows = []
    for clade in tree.find_clades():
        if clade.name:
            rows.append({'taxon': clade.name, 'branch_length': clade.branch_length or 0})
    result = pd.DataFrame(rows)
    print(f"\\nTree with {len(rows)} terminal nodes")
else:
    raise ValueError("Need at least 3 sequences. Connect a FASTA Input.")
`, ['biopython'])
    .build();
