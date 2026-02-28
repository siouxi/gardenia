import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('blast-search', 'BLAST Search')
    .setCategory('Sequence Analysis')
    .setDescription('Run a local BLAST search against NCBI databases using BioPython')
    .addInput('sequences', 'dataset', 'Input sequences (from FASTA Input)')
    .withResultOutput()
    .addSelect('program', 'BLAST Program', ['blastn', 'blastp', 'blastx', 'tblastn'], 'blastn')
    .addString('database', 'Database', 'nt', 'BLAST database name (e.g., nt, nr, swissprot)')
    .addNumber('evalue', 'E-value Threshold', 0.001)
    .addNumber('max_hits', 'Max Hits', 10)
    .setPythonCode(`# BLAST Search Node
from Bio.Blast.Applications import NcbiblastnCommandline, NcbiblastpCommandline
from Bio.Blast import NCBIXML
from Bio import SeqIO

import tempfile, os

program = params.get('program', 'blastn')
database = params.get('database', 'nt')
evalue = float(params.get('evalue', 0.001))
max_hits = int(params.get('max_hits', 10))

if 'sequences' in dir() and sequences:
    # Write sequences to temp FASTA
    tmp_in = tempfile.NamedTemporaryFile(suffix='.fasta', delete=False, mode='w')
    for rec in sequences[:10]:  # Limit to first 10
        tmp_in.write(f">{rec.id}\\n{str(rec.seq)}\\n")
    tmp_in.close()
    
    tmp_out = tmp_in.name + '.xml'
    
    print(f"Running {program} against {database} ({len(sequences)} sequences)")
    print(f"E-value cutoff: {evalue}")
    
    try:
        cmd = NcbiblastnCommandline(query=tmp_in.name, db=database, evalue=evalue,
                                     outfmt=5, out=tmp_out, max_target_seqs=max_hits)
        stdout, stderr = cmd()
        
        with open(tmp_out) as f:
            records = NCBIXML.parse(f)
            rows = []
            for blast_rec in records:
                for alignment in blast_rec.alignments[:max_hits]:
                    hsp = alignment.hsps[0]
                    rows.append({
                        'query': blast_rec.query, 'hit': alignment.title[:80],
                        'score': hsp.score, 'evalue': hsp.expect,
                        'identity': hsp.identities / hsp.align_length * 100
                    })
            result = pd.DataFrame(rows)
            print(f"Found {len(result)} hits")
            print(result.head(10))
    finally:
        os.unlink(tmp_in.name)
        if os.path.exists(tmp_out): os.unlink(tmp_out)
else:
    raise ValueError("No sequences provided. Connect FASTA Input.")
`, ['biopython'])
    .build();
