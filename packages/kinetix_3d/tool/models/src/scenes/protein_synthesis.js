// Protein synthesis: a gene copied into mRNA (transcription), the mRNA read
// by a ribosome three bases at a time while tRNAs bring amino acids
// (translation), and the chain folding into a protein. Built in code.
import { THREE, seeded, mat, smooth, lerp, clamp01, fract, GlowPoints, atomCluster } from './kit.js';
import { C, glowProtein } from './bio.js';
import { Nucleotides, PAIR, RNA_PAIR, BACKBONE, RISE, R, strandQuat, sequence } from './dnakit.js';

const t = (en, hi, kn) => ({ en, hi, kn });

export const script = {
  id: 'protein_synthesis',
  subject: 'Biology',
  classes: [10, 12],
  thumb: { step: 'trna', u: 0.4 },
  title: t('How a cell makes a protein', 'कोशिका प्रोटीन कैसे बनाती है', 'ಕೋಶ ಪ್ರೋಟೀನ್ ತಯಾರಿಸುವುದು ಹೇಗೆ'),
  summary: t(
    'From gene to protein: the DNA is copied into messenger RNA, and a ribosome reads the mRNA, joining amino acids brought by tRNAs into a chain that folds into a protein.',
    'जीन से प्रोटीन तक: DNA की प्रतिलिपि संदेशवाहक RNA में बनती है, और राइबोसोम mRNA को पढ़कर tRNA द्वारा लाए गए अमीनो अम्लों को एक शृंखला में जोड़ता है, जो मुड़कर प्रोटीन बनती है।',
    'ಜೀನ್‌ನಿಂದ ಪ್ರೋಟೀನ್‌ವರೆಗೆ: DNA ಸಂದೇಶವಾಹಕ RNA ಆಗಿ ನಕಲಾಗುತ್ತದೆ; ರೈಬೋಸೋಮ್ mRNA ಅನ್ನು ಓದಿ tRNAಗಳು ತಂದ ಅಮೈನೋ ಆಮ್ಲಗಳನ್ನು ಸರಪಳಿಯಾಗಿ ಜೋಡಿಸುತ್ತದೆ; ಆ ಸರಪಳಿ ಮಡಚಿ ಪ್ರೋಟೀನ್ ಆಗುತ್ತದೆ.',
  ),
  keywords: ['protein synthesis', 'transcription', 'translation', 'mRNA', 'tRNA', 'ribosome', 'codon', 'anticodon', 'amino acids', 'gene', 'genetic code', 'central dogma', 'RNA polymerase', 'molecular basis of inheritance'],
  credit: 'Model built by KINETIX',
  look: {
    background: ['#1e2128', '#07080b'],
    keyAt: [3, 6, 7],
    envTop: '#2c3038',
    stages: { gene: { fog: [12, 30] }, ribosome: { fog: [12, 30] } },
  },
  groups: [
    { id: 'transcription', name: t('Transcription', 'अनुलेखन', 'ಪ್ರತಿಲೇಖನ') },
    { id: 'translation', name: t('Translation', 'स्थानांतरण (अनुवादन)', 'ಭಾಷಾಂತರ (ಅನುವಾದ)') },
  ],
  parts: [
    { id: 'dna', group: 'transcription', color: '#c99a5a', name: t('DNA', 'DNA', 'DNA'), info: t('Stays safely in the nucleus.', 'केंद्रक में सुरक्षित रहता है।', 'ಕೋಶಕೇಂದ್ರದಲ್ಲಿ ಸುರಕ್ಷಿತವಾಗಿರುತ್ತದೆ.') },
    { id: 'gene', group: 'transcription', color: '#e0b860', name: t('Gene', 'जीन', 'ಜೀನ್'), info: t('A stretch of DNA with the instructions for one protein.', 'DNA का एक भाग जिसमें एक प्रोटीन के निर्देश होते हैं।', 'ಒಂದು ಪ್ರೋಟೀನ್‌ನ ಸೂಚನೆಗಳಿರುವ DNAಯ ಒಂದು ಭಾಗ.') },
    { id: 'rna_polymerase', group: 'transcription', color: '#6f8fbf', name: t('RNA polymerase', 'RNA पॉलिमरेज़', 'RNA ಪಾಲಿಮರೇಸ್'), info: t('The enzyme that copies a gene into RNA.', 'वह एंज़ाइम जो जीन की RNA में प्रतिलिपि बनाता है।', 'ಜೀನ್ ಅನ್ನು RNA ಆಗಿ ನಕಲಿಸುವ ಕಿಣ್ವ.') },
    { id: 'mrna', group: 'transcription', color: '#8cc48a', name: t('Messenger RNA (mRNA)', 'संदेशवाहक RNA (mRNA)', 'ಸಂದೇಶವಾಹಕ RNA (mRNA)'), info: t('A single-stranded copy of the gene that carries its message out of the nucleus.', 'जीन की एकल-लड़ी प्रति, जो उसका संदेश केंद्रक से बाहर ले जाती है।', 'ಜೀನ್‌ನ ಒಂದೇ ಎಳೆಯ ಪ್ರತಿ; ಅದರ ಸಂದೇಶವನ್ನು ಕೋಶಕೇಂದ್ರದಿಂದ ಹೊರಗೆ ಒಯ್ಯುತ್ತದೆ.') },
    { id: 'uracil', group: 'transcription', color: '#b98ac8', name: t('Uracil (U)', 'यूरेसिल (U)', 'ಯುರಾಸಿಲ್ (U)'), info: t('Takes the place of thymine in RNA; it pairs with adenine.', 'RNA में थाइमीन की जगह लेता है; यह एडेनीन से जुड़ता है।', 'RNAಯಲ್ಲಿ ಥೈಮಿನ್ ಸ್ಥಾನದಲ್ಲಿರುತ್ತದೆ; ಅಡೆನಿನ್ ಜೊತೆ ಜೋಡಿಯಾಗುತ್ತದೆ.') },
    { id: 'ribosome', group: 'translation', color: '#7f6aa8', name: t('Ribosome', 'राइबोसोम', 'ರೈಬೋಸೋಮ್'), info: t('The cell’s protein factory: two subunits of RNA and protein.', 'कोशिका का प्रोटीन कारखाना: RNA और प्रोटीन की दो उप-इकाइयाँ।', 'ಕೋಶದ ಪ್ರೋಟೀನ್ ಕಾರ್ಖಾನೆ: RNA ಮತ್ತು ಪ್ರೋಟೀನ್‌ನ ಎರಡು ಉಪಘಟಕಗಳು.') },
    { id: 'codon', group: 'translation', color: '#ffe0a0', name: t('Codon', 'कोडॉन', 'ಕೋಡಾನ್'), info: t('Three bases of mRNA that stand for one amino acid.', 'mRNA के तीन क्षारक जो एक अमीनो अम्ल को दर्शाते हैं।', 'ಒಂದು ಅಮೈನೋ ಆಮ್ಲವನ್ನು ಸೂಚಿಸುವ mRNAಯ ಮೂರು ಪ್ರತ್ಯಾಮ್ಲಗಳು.') },
    { id: 'trna', group: 'translation', color: '#7fb07a', name: t('Transfer RNA (tRNA)', 'स्थानांतरण RNA (tRNA)', 'ವರ್ಗಾವಣೆ RNA (tRNA)'), info: t('Carries one kind of amino acid to the ribosome.', 'एक प्रकार का अमीनो अम्ल राइबोसोम तक लाता है।', 'ಒಂದು ಬಗೆಯ ಅಮೈನೋ ಆಮ್ಲವನ್ನು ರೈಬೋಸೋಮ್‌ಗೆ ತರುತ್ತದೆ.') },
    { id: 'anticodon', group: 'translation', color: '#b98ac8', name: t('Anticodon', 'प्रतिकोडॉन', 'ಪ್ರತಿಕೋಡಾನ್'), info: t('Three bases on the tRNA that pair with the codon.', 'tRNA के तीन क्षारक जो कोडॉन से जुड़ते हैं।', 'ಕೋಡಾನ್ ಜೊತೆ ಜೋಡಿಯಾಗುವ tRNAಯ ಮೂರು ಪ್ರತ್ಯಾಮ್ಲಗಳು.') },
    { id: 'amino_acid', group: 'translation', color: '#d08d78', name: t('Amino acid', 'अमीनो अम्ल', 'ಅಮೈನೋ ಆಮ್ಲ'), info: t('There are 20 kinds; their order makes each protein different.', '20 प्रकार होते हैं; इनका क्रम हर प्रोटीन को अलग बनाता है।', '20 ಬಗೆಗಳಿವೆ; ಅವುಗಳ ಕ್ರಮ ಪ್ರತಿ ಪ್ರೋಟೀನ್ ಅನ್ನು ಭಿನ್ನವಾಗಿಸುತ್ತದೆ.') },
    { id: 'polypeptide', group: 'translation', color: '#c9a86a', name: t('Polypeptide chain', 'पॉलीपेप्टाइड शृंखला', 'ಪಾಲಿಪೆಪ್ಟೈಡ್ ಸರಪಳಿ'), info: t('The growing chain of amino acids.', 'अमीनो अम्लों की बढ़ती शृंखला।', 'ಬೆಳೆಯುತ್ತಿರುವ ಅಮೈನೋ ಆಮ್ಲಗಳ ಸರಪಳಿ.') },
  ],
  steps: [
    {
      id: 'gene', stage: 'gene', seconds: 13,
      camera: { pos: [1.2, 2.0, 13.5], target: [0, 0, 0], from: [3, 4, 22], drift: 0.03 },
      highlight: ['gene'], labels: ['dna', 'gene'],
      title: t('A gene: instructions for a protein', 'जीन: प्रोटीन के निर्देश', 'ಜೀನ್: ಪ್ರೋಟೀನ್‌ಗಾಗಿ ಸೂಚನೆಗಳು'),
      caption: t(
        'A gene is a stretch of DNA that carries the instructions for one protein, written in the order of its bases. But the DNA stays in the nucleus, and proteins are made outside it.',
        'जीन DNA का एक भाग है जिसमें एक प्रोटीन के निर्देश उसके क्षारकों के क्रम में लिखे होते हैं। पर DNA केंद्रक में रहता है, और प्रोटीन उसके बाहर बनते हैं।',
        'ಜೀನ್ ಎಂಬುದು ಒಂದು ಪ್ರೋಟೀನ್‌ನ ಸೂಚನೆಗಳನ್ನು ತನ್ನ ಪ್ರತ್ಯಾಮ್ಲಗಳ ಕ್ರಮದಲ್ಲಿ ಬರೆದಿರುವ DNAಯ ಒಂದು ಭಾಗ. ಆದರೆ DNA ಕೋಶಕೇಂದ್ರದಲ್ಲೇ ಇರುತ್ತದೆ; ಪ್ರೋಟೀನ್‌ಗಳು ಅದರ ಹೊರಗೆ ತಯಾರಾಗುತ್ತವೆ.',
      ),
    },
    {
      id: 'transcription', stage: 'gene', seconds: 15,
      camera: { pos: [-1.0, 2.6, 14.5], target: [-0.6, -0.6, 0.4], drift: -0.02 },
      highlight: ['rna_polymerase'], labels: ['rna_polymerase', 'mrna', 'uracil', 'dna'],
      title: t('Transcription: copying the gene', 'अनुलेखन: जीन की प्रतिलिपि', 'ಪ್ರತಿಲೇಖನ: ಜೀನ್‌ನ ನಕಲು'),
      caption: t(
        'First the gene is copied into a messenger, mRNA. RNA polymerase opens the DNA and builds a matching strand of RNA, in which uracil (U) takes the place of thymine. The mRNA then leaves the nucleus.',
        'पहले जीन की प्रतिलिपि एक संदेशवाहक, mRNA, में बनती है। RNA पॉलिमरेज़ DNA को खोलकर RNA की एक मेल खाती लड़ी बनाता है, जिसमें थाइमीन की जगह यूरेसिल (U) होता है। फिर mRNA केंद्रक से बाहर जाता है।',
        'ಮೊದಲು ಜೀನ್ mRNA ಎಂಬ ಸಂದೇಶವಾಹಕವಾಗಿ ನಕಲಾಗುತ್ತದೆ. RNA ಪಾಲಿಮರೇಸ್ DNA ಅನ್ನು ತೆರೆದು ಹೊಂದುವ RNA ಎಳೆಯನ್ನು ಕಟ್ಟುತ್ತದೆ; ಅದರಲ್ಲಿ ಥೈಮಿನ್ ಬದಲು ಯುರಾಸಿಲ್ (U) ಇರುತ್ತದೆ. ನಂತರ mRNA ಕೋಶಕೇಂದ್ರದಿಂದ ಹೊರಬರುತ್ತದೆ.',
      ),
    },
    {
      id: 'ribosome', stage: 'ribosome', seconds: 14,
      camera: { pos: [2.4, 1.8, 15.0], target: [0, 0.5, 0], from: [4, 4, 24], drift: 0.03 },
      highlight: ['ribosome'], labels: ['ribosome', 'mrna', 'codon'],
      title: t('Translation: reading the message', 'स्थानांतरण: संदेश पढ़ना', 'ಭಾಷಾಂತರ: ಸಂದೇಶ ಓದುವುದು'),
      caption: t(
        'In the cytoplasm, a ribosome clamps onto the mRNA and reads its bases three at a time. Each group of three, a codon, stands for one amino acid.',
        'कोशिकाद्रव्य में एक राइबोसोम mRNA को पकड़कर उसके क्षारकों को तीन-तीन करके पढ़ता है। तीन क्षारकों का हर समूह, कोडॉन, एक अमीनो अम्ल को दर्शाता है।',
        'ಕೋಶದ್ರವ್ಯದಲ್ಲಿ ರೈಬೋಸೋಮ್ mRNA ಅನ್ನು ಹಿಡಿದು ಅದರ ಪ್ರತ್ಯಾಮ್ಲಗಳನ್ನು ಮೂರು ಮೂರಾಗಿ ಓದುತ್ತದೆ. ಮೂರರ ಪ್ರತಿ ಗುಂಪು, ಕೋಡಾನ್, ಒಂದು ಅಮೈನೋ ಆಮ್ಲವನ್ನು ಸೂಚಿಸುತ್ತದೆ.',
      ),
    },
    {
      id: 'trna', stage: 'ribosome', seconds: 16,
      camera: { pos: [-1.8, 1.6, 14.0], target: [0, 0.9, 0], drift: -0.02 },
      highlight: ['trna'], labels: ['trna', 'anticodon', 'amino_acid', 'polypeptide'],
      title: t('tRNA brings the amino acids', 'tRNA अमीनो अम्ल लाता है', 'tRNA ಅಮೈನೋ ಆಮ್ಲಗಳನ್ನು ತರುತ್ತದೆ'),
      caption: t(
        'Transfer RNAs bring the amino acids. Each tRNA has an anticodon that fits just one codon, so the right amino acid arrives. The ribosome joins it to the growing chain and moves on to the next codon.',
        'स्थानांतरण RNA अमीनो अम्ल लाते हैं। हर tRNA में एक प्रतिकोडॉन होता है जो केवल एक कोडॉन से मेल खाता है, इसलिए सही अमीनो अम्ल पहुँचता है। राइबोसोम उसे बढ़ती शृंखला से जोड़कर अगले कोडॉन पर बढ़ता है।',
        'ವರ್ಗಾವಣೆ RNAಗಳು ಅಮೈನೋ ಆಮ್ಲಗಳನ್ನು ತರುತ್ತವೆ. ಪ್ರತಿ tRNAಯಲ್ಲಿ ಒಂದೇ ಕೋಡಾನ್‌ಗೆ ಹೊಂದುವ ಪ್ರತಿಕೋಡಾನ್ ಇರುವುದರಿಂದ ಸರಿಯಾದ ಅಮೈನೋ ಆಮ್ಲ ಬರುತ್ತದೆ. ರೈಬೋಸೋಮ್ ಅದನ್ನು ಬೆಳೆಯುತ್ತಿರುವ ಸರಪಳಿಗೆ ಜೋಡಿಸಿ ಮುಂದಿನ ಕೋಡಾನ್‌ಗೆ ಸಾಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'folding', stage: 'ribosome', seconds: 13,
      camera: { pos: [1.6, 4.6, 18.5], target: [-1.6, 3.2, 0], drift: 0.03 },
      highlight: ['polypeptide'], labels: ['polypeptide', 'ribosome'],
      title: t('The chain folds into a protein', 'शृंखला मुड़कर प्रोटीन बनती है', 'ಸರಪಳಿ ಮಡಚಿ ಪ್ರೋಟೀನ್ ಆಗುತ್ತದೆ'),
      caption: t(
        'At a stop codon the chain is released. It folds into a precise shape, and that shape decides the protein’s job: an enzyme, a hormone, or part of a muscle.',
        'रुकने वाले कोडॉन पर शृंखला छूट जाती है। यह एक निश्चित आकार में मुड़ती है, और वही आकार प्रोटीन का काम तय करता है: एंज़ाइम, हॉर्मोन, या पेशी का भाग।',
        'ನಿಲುಗಡೆ ಕೋಡಾನ್‌ನಲ್ಲಿ ಸರಪಳಿ ಬಿಡುಗಡೆಯಾಗುತ್ತದೆ. ಅದು ನಿಖರವಾದ ಆಕಾರಕ್ಕೆ ಮಡಚಿಕೊಳ್ಳುತ್ತದೆ; ಆ ಆಕಾರವೇ ಪ್ರೋಟೀನ್‌ನ ಕೆಲಸವನ್ನು ನಿರ್ಧರಿಸುತ್ತದೆ: ಕಿಣ್ವ, ಹಾರ್ಮೋನ್, ಅಥವಾ ಸ್ನಾಯುವಿನ ಭಾಗ.',
      ),
    },
  ],
};

export async function build(k) {
  const stages = { gene: buildGene(k), ribosome: buildRibosome(k) };
  return { update: (s) => stages[s.stage]?.(s) };
}

const AMINO = ['#d08d78', '#8fa0cf', '#c9a86a', '#7fb07a', '#b98ac8', '#d9b44a', '#6fa3a0'];

// ------------------------------------------------------------------ transcription

function buildGene(k) {
  const stage = k.stage('gene');
  const rnd = seeded(601);
  const N = 60;
  const X0 = -((N - 1) * RISE) / 2;
  const xAt = (i) => X0 + i * RISE;
  const seq = sequence(N, rnd);
  const G0 = 14, G1 = 50; // the gene
  const nuc = new Nucleotides(N * 3 + 10);
  stage.add(nuc);
  const pol = atomCluster([[0, 0, 0, 1.25, 1.2, 1.15], [0.7, 0.8, 0.3, 0.7], [-0.8, 0.7, -0.4, 0.65], [0.3, -0.9, 0.6, 0.6], [-0.4, -0.6, -0.8, 0.6]], '#6f8fbf', { seed: 61 });
  stage.add(pol);
  k.part('rna_polymerase', pol, { anchor: () => pol.position.clone().add({ x: 0.3, y: 1.6, z: 0.5 }) });
  const at = { dna: new THREE.Vector3(), gene: new THREE.Vector3(), mrna: new THREE.Vector3(), uracil: new THREE.Vector3() };
  for (const id of Object.keys(at)) k.marker(id, stage, (out) => (at[id].lengthSq() ? out.copy(at[id]) : null), 0.25);
  const glow = new GlowPoints(200, { size: 0.35 });
  stage.add(glow);
  const geneGlow = C('#ffd27a');
  const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), o = new THREE.Vector3(), Y = new THREE.Vector3();
  return (s) => {
    const T = s.T;
    for (const key in at) at[key].set(0, 0, 0);
    const tx = s.is('transcription');
    // RNA polymerase moves along the gene; the bubble is open round it.
    const px = tx ? lerp(xAt(G0), xAt(G1), smooth(s.u * 1.05)) : -100;
    const bubble = (x) => (tx ? smooth(clamp01(1 - Math.abs(x - (px - 0.8)) / 2.2) * 1.6) : 0);
    nuc.begin();
    for (let i = 0; i < N; i++) {
      const x = xAt(i), b = bubble(x);
      for (const st of [0, 1]) {
        o.set(x, (st ? -1 : 1) * 0.9 * b, 0);
        strandQuat(i, st, q, s.is('gene') ? T * 0.2 : 0);
        const inGene = i >= G0 && i <= G1;
        const col = inGene && s.is('gene') ? new THREE.Color(BACKBONE.old).lerp(C('#ffd27a'), 0.45 + 0.25 * Math.sin(T * 2)) : BACKBONE.old;
        nuc.put(st ? PAIR[seq[i]] : seq[i], o, q, col);
        if (i === 6 && st === 0) at.dna.copy(Y.set(0, R + 0.2, 0).applyQuaternion(q).add(o));
        if (i === (G0 + G1) >> 1 && st === 0) at.gene.copy(Y.set(0, R + 0.2, 0).applyQuaternion(q).add(o));
      }
      // The mRNA: paired with the template strand (strand 1) inside the bubble, peeling away behind it.
      if (tx && x < px && i >= G0) {
        const behind = px - 0.6 - x;
        const tmpl = PAIR[seq[i]]; // strand 1's base
        const base = RNA_PAIR[tmpl];
        strandQuat(i, 0, q2, 0);
        if (behind < 1.6) {
          o.set(x, -0.9 * bubble(x), 0);
        } else {
          const d = behind - 1.6;
          o.set(x + d * 0.25, -0.9 * bubble(x) - 0.5 * d, 0.9 * d);
          q2.multiply(q.setFromAxisAngle(Y.set(0, 0, 1), d * 0.15));
        }
        nuc.put(base, o, q2, BACKBONE.rna);
        if (i === G0 + 2) at.mrna.copy(Y.set(0, R + 0.2, 0).applyQuaternion(q2).add(o));
        if (base === 'U' && !at.uracil.lengthSq() && behind > 0.2 && behind < 4) at.uracil.copy(Y.set(0, R * 0.5, 0).applyQuaternion(q2).add(o));
      }
    }
    nuc.end();
    pol.visible = tx;
    pol.position.set(px, -0.3, 0.1);
    pol.rotation.x = 0.1 * Math.sin(T);
    glowProtein(pol, 0.03, 0.05, 0.08);
    glow.begin();
    if (s.is('gene')) {
      for (let i = G0; i <= G1; i += 2) glow.push(xAt(i), 0, 0, 1.6, geneGlow, 0.05 + 0.03 * Math.sin(T * 2 + i * 0.3));
    }
    glow.done();
  };
}

// ------------------------------------------------------------------ translation

function buildRibosome(k) {
  const stage = k.stage('ribosome');
  const rnd = seeded(607);
  const NB = 54; // mRNA bases
  const seq = sequence(NB, rnd).map((b) => (b === 'T' ? 'U' : b));
  const nuc = new Nucleotides(NB + 30);
  stage.add(nuc);
  // The ribosome: a large and a small subunit round the mRNA.
  const large = atomCluster([[0, 1.1, 0, 2.0, 1.25, 1.6], [-1.2, 1.6, 0.4, 1.0], [1.3, 1.5, -0.3, 1.0], [0, 2.1, -0.6, 0.9]], '#7f6aa8', { seed: 71, atom: 0.1 });
  const small = atomCluster([[0, -1.55, 0, 1.75, 0.75, 1.35], [-1.0, -1.7, 0.4, 0.7], [1.1, -1.6, -0.2, 0.7]], '#a58ac0', { seed: 72, atom: 0.1 });
  const ribosome = new THREE.Group();
  ribosome.add(large, small);
  stage.add(ribosome);
  k.part('ribosome', ribosome, { anchor: [-1.6, 2.6, 0.6] });
  // tRNAs: an L-shaped molecule, anticodon below, amino acid on top.
  const trnaShape = [[0, 0, 0, 0.2, 0.7, 0.22], [0.36, 0.62, 0, 0.45, 0.2, 0.22], [0, -0.75, 0, 0.26, 0.14, 0.2]];
  const trnas = [0, 1, 2].map((i) => {
    const g = new THREE.Group();
    g.add(atomCluster(trnaShape, '#7fb07a', { seed: 80 + i, atom: 0.07 }));
    const aa = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 16), mat({ color: AMINO[i], rough: 0.4, clearcoat: 0.5, rim: 0.2 }));
    aa.position.set(0.75, 0.75, 0);
    g.add(aa);
    g.userData.aa = aa;
    stage.add(g);
    return g;
  });
  k.part('trna', trnas[0], { anchor: () => trnas[0].position.clone().add({ x: -0.4, y: 0.4, z: 0.3 }) });
  // The chain: beads of amino acids from the exit tunnel; extended, then folded.
  const NC = 46;
  const chainMats = AMINO.map((c) => mat({ color: c, rough: 0.45, clearcoat: 0.4, sheen: 0.3, rim: 0.18 }));
  const chainGeo = new THREE.SphereGeometry(0.26, 20, 14);
  const chain = new THREE.Group();
  const beads = Array.from({ length: NC }, (_, i) => {
    const m = new THREE.Mesh(chainGeo, chainMats[(i * 3 + (i >> 2)) % AMINO.length]);
    chain.add(m);
    return m;
  });
  stage.add(chain);
  k.part('polypeptide', chain, { anchor: () => (beads[Math.min(beads.length - 1, 8)].visible ? beads[8].position.clone().add({ x: 0.4, y: 0.3, z: 0.3 }) : new THREE.Vector3(0, 3.2, 0)) });
  // Where bead j sits along the extended chain, and in the folded protein.
  const exit = new THREE.Vector3(-0.4, 2.6, -0.2);
  const extended = (j, out) => out.set(exit.x - 0.2 * j + 0.35 * Math.sin(j * 1.1), exit.y + 0.42 * j, exit.z + 0.35 * Math.cos(j * 1.1));
  const folded = [];
  {
    // A compact path: a random walk held inside a sphere, with a couple of helices.
    const p = new THREE.Vector3(0, 0, 0);
    for (let j = 0; j < NC; j++) {
      if (j % 15 < 8) p.add(new THREE.Vector3(Math.cos(j * 1.75) * 0.32, 0.17, Math.sin(j * 1.75) * 0.32).applyAxisAngle(new THREE.Vector3(1, 0, 0), (j / 15) | 0));
      else p.add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(0.48));
      if (p.length() > 1.4) p.multiplyScalar(1.3 / p.length());
      folded.push(p.clone());
    }
  }
  const foldCentre = new THREE.Vector3(-3.4, 3.4, 1.0);
  const at = { codon: new THREE.Vector3(), anticodon: new THREE.Vector3(), amino_acid: new THREE.Vector3(), mrna: new THREE.Vector3() };
  for (const id of Object.keys(at)) k.marker(id, stage, (out) => (at[id].lengthSq() ? out.copy(at[id]) : null), 0.2);
  const glow = new GlowPoints(60, { size: 0.5 });
  stage.add(glow);
  const read = C('#ffe0a0');
  const q = new THREE.Quaternion(), o = new THREE.Vector3(), v = new THREE.Vector3(), w = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0);
  const P = 2.8; // seconds per codon
  const CODON = 3 * RISE;
  return (s) => {
    const T = s.T;
    for (const key in at) at[key].set(0, 0, 0);
    const n = Math.floor(T / P), ph = fract(T / P);
    // The mRNA slides one codon left per cycle (during 0.6–0.85 of it).
    const slide = (n + smooth(clamp01((ph - 0.6) / 0.25))) * CODON;
    nuc.begin();
    for (let i = 0; i < NB; i++) {
      const x = ((i - NB / 2) * RISE - slide) % (NB * RISE);
      const xx = x < -NB * RISE / 2 ? x + NB * RISE : x;
      o.set(xx, -1.0, 0);
      // A single strand, bases pointing up into the ribosome.
      q.setFromAxisAngle(X, Math.PI + 0.25 * Math.sin(i * 0.9));
      nuc.put(seq[i], o.clone().add({ x: 0, y: 0, z: 0 }), q, BACKBONE.rna, 1, 0.85);
      if (Math.abs(xx - 4.5) < RISE / 2) at.mrna.copy(o).add({ x: 0, y: -1.1, z: 0 });
    }
    nuc.end();
    at.codon.set(0.55 * CODON, -0.35, 0.9);
    glow.begin();
    // The codon being read glows faintly at the A site.
    for (let j = 0; j < 3; j++) glow.push((j - 1) * RISE + 0.5 * CODON, -0.4, 0.2, 0.9, read, 0.18 + 0.1 * Math.sin(T * 3));
    glow.done();

    // tRNAs: arrive at the A site, shift to the P site, leave from the E site.
    trnas.forEach((g, i) => {
      // tRNA i serves codons n where n % 3 === i; its cycle age in codons.
      let age = ((n - i) % 3 + 3) % 3 + ph; // 0..3
      const A = new THREE.Vector3(0.5 * CODON, 0.05, 0), Pp = new THREE.Vector3(-0.5 * CODON, 0.05, 0), E = new THREE.Vector3(-1.5 * CODON, 0.05, 0);
      const inFrom = new THREE.Vector3(3.5, 3.6, 3.2), outTo = new THREE.Vector3(-4.5, 3.0, 3.0);
      let a = 1;
      if (age < 0.45) v.copy(inFrom).lerp(A, smooth(age / 0.45));
      else if (age < 0.6) v.copy(A);
      else if (age < 0.85) v.copy(A).lerp(Pp, smooth((age - 0.6) / 0.25));
      else if (age < 1.6) v.copy(Pp);
      else if (age < 1.85) v.copy(Pp).lerp(E, smooth((age - 1.6) / 0.25));
      else {
        v.copy(E).lerp(outTo, smooth((age - 1.85) / 1.0));
        a = 1 - smooth((age - 2.4) / 0.5);
      }
      g.position.copy(v);
      g.rotation.set(0, 0, age < 0.45 ? 0.6 * (1 - age / 0.45) : 0);
      g.scale.setScalar(Math.max(0.01, a));
      // Its amino acid joins the chain when it reaches the P site.
      g.userData.aa.visible = age < 0.7;
      if (i === n % 3 && age < 0.6) {
        at.anticodon.copy(v).add({ x: 0, y: -0.75, z: 0.3 });
        g.userData.aa.getWorldPosition(at.amino_acid);
      }
    });

    // The chain: one bead per codon read so far, from the exit tunnel; in the folding step it is released and folds.
    const fold = s.is('folding') ? smooth(clamp01((s.t - 1.5) / 7)) : 0;
    const count = s.is('folding') ? NC : Math.min(NC, 3 + Math.floor((T / P) % (NC - 3)));
    beads.forEach((b, j) => {
      b.visible = j < count;
      if (!b.visible) return;
      const jj = count - 1 - j; // newest nearest the ribosome
      extended(jj, v);
      w.copy(folded[j]).multiplyScalar(1.55).add(foldCentre);
      b.position.copy(v).lerp(w, fold);
      b.position.y += 0.04 * Math.sin(T * 1.3 + j);
    });
    ribosome.position.x = 0;
    ribosome.rotation.y = 0.04 * Math.sin(T * 0.4);
  };
}
