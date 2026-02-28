import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('sequence-alignment', 'Sequence Alignment')
    .setCategory('Sequence Analysis')
    .setDescription('Pairwise or multiple sequence alignment using BioPython')
    .addInput('sequences', 'dataset', 'Input sequences')
    .withResultOutput()
    .addSelect('mode', 'Mode', ['pairwise', 'global', 'local'], 'pairwise')
    .setPythonCode(`# Sequence Alignment Node
from Bio import pairwise2
from Bio.pairwise2 import format_alignment


mode = params.get('mode', 'pairwise')

if 'sequences' in dir() and sequences and len(sequences) >= 2:
    seq1, seq2 = str(sequences[0].seq), str(sequences[1].seq)
    
    print(f"Aligning: {sequences[0].id} ({len(seq1)} bp) vs {sequences[1].id} ({len(seq2)} bp)")
    
    if mode == 'local':
        alignments = pairwise2.align.localxx(seq1, seq2, one_alignment_only=True)
    else:
        alignments = pairwise2.align.globalxx(seq1, seq2, one_alignment_only=True)
    
    if alignments:
        best = alignments[0]
        print(f"\\nScore: {best.score}")
        print(format_alignment(*best))
        
        # Calculate identity
        matches = sum(a == b for a, b in zip(best.seqA, best.seqB) if a != '-')
        length = max(len(best.seqA), len(best.seqB))
        identity = matches / length * 100
        print(f"Identity: {identity:.1f}%")
        
        result = pd.DataFrame([{
            'seq1': sequences[0].id, 'seq2': sequences[1].id,
            'score': best.score, 'identity_pct': round(identity, 2),
            'alignment_length': length
        }])
else:
    raise ValueError("Need at least 2 sequences. Connect a FASTA Input.")
`, ['biopython'])
    .build();
