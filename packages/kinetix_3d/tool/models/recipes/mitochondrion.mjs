// A mitochondrion, built in code from textbook structure (simplified): the
// smooth outer membrane, the inner membrane folded into shelf-like cristae,
// the matrix with its own DNA and ribosomes. Built in micrometres, shown about
// 20,000 times larger; the ready-made cut opens it lengthwise. Downloaded on
// first use.
import { blob, seeded } from '../lib/shapes.mjs';
import { ring } from '../lib/teaching.mjs';
import { capsule, capsuleRadius } from '../lib/micro.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });
const HALF = 1.15;
const R = { outer: 0.86, outerIn: 0.81, inner: 0.74, innerIn: 0.7 };

/**
 * A crista: a thin shelf across the matrix at [x], growing from the inner
 * membrane on one side ([side] +1 top, -1 bottom) to [reach] of the way across.
 */
function crista(THREE, x, side, reach) {
  const r = capsuleRadius(HALF, R.innerIn + 0.01, x);
  const tip = r * (1 - 2 * reach);
  // Its outline across the matrix (z, y): the part of the round cross-section beyond the tip, with a rounded edge.
  const shape = new THREE.Shape();
  const a0 = Math.asin(Math.max(-1, Math.min(1, tip / r)));
  const pts = [];
  for (let i = 0; i <= 32; i++) {
    const a = a0 + ((Math.PI - 2 * a0) * i) / 32;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  shape.moveTo(pts[0][0], pts[0][1]);
  for (const [u, v] of pts.slice(1)) shape.lineTo(u, v);
  // The free edge, bulging a little towards the middle.
  const w = pts[0][0];
  shape.quadraticCurveTo(0, tip - 0.08, w, tip);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelOffset: -0.02, bevelSegments: 3, curveSegments: 12 });
  g.translate(0, 0, -0.0175);
  if (side < 0) g.rotateZ(Math.PI);
  // The shape lies in (z, y); its thickness runs along the mitochondrion.
  g.rotateY(Math.PI / 2);
  return g.translate(x, 0, 0);
}

export default {
  id: 'mitochondrion',
  version: 1,
  order: 1.7,
  source: 'procedural',
  remote: true,
  topic: 'cell',
  license: 'Same as the app',
  subject: 'Biology',
  classes: [9, 11],
  title: t('Mitochondrion', 'माइटोकॉन्ड्रिया (सूत्रकणिका)', 'ಮೈಟೊಕಾಂಡ್ರಿಯಾ'),
  summary: t(
    'The powerhouse of the cell, 1 to 2 µm long. Here food (glucose) is broken down with oxygen in cellular respiration, and the energy is stored as ATP. Simplified model, about 20,000 times larger than life.',
    'कोशिका का ऊर्जा घर, 1 से 2 µm लंबा। यहाँ कोशिकीय श्वसन में भोजन (ग्लूकोज़) ऑक्सीजन की मदद से टूटता है और ऊर्जा ATP के रूप में जमा होती है। सरलीकृत मॉडल, असल से लगभग 20,000 गुना बड़ा।',
    'ಕೋಶದ ಶಕ್ತಿಕೇಂದ್ರ, 1 ರಿಂದ 2 µm ಉದ್ದ. ಇಲ್ಲಿ ಕೋಶೀಯ ಉಸಿರಾಟದಲ್ಲಿ ಆಹಾರ (ಗ್ಲೂಕೋಸ್) ಆಮ್ಲಜನಕದೊಂದಿಗೆ ವಿಭಜನೆಯಾಗಿ ಶಕ್ತಿ ATP ಆಗಿ ಸಂಗ್ರಹವಾಗುತ್ತದೆ. ಸರಳೀಕೃತ ಮಾದರಿ, ನಿಜಕ್ಕಿಂತ ಸುಮಾರು 20,000 ಪಟ್ಟು ದೊಡ್ಡದು.',
  ),
  keywords: ['mitochondrion', 'mitochondria', 'powerhouse of the cell', 'cristae', 'matrix', 'atp', 'respiration', 'cellular respiration', 'organelle', 'cell organelles', 'the fundamental unit of life', 'cell the unit of life', 'respiration in organisms'],
  credit: 'Simplified model built by Zynetix from textbook structure',
  size: 0.07,
  groups: [
    { id: 'membranes', name: t('Membranes', 'झिल्लियाँ', 'ಪೊರೆಗಳು') },
    { id: 'matrix', name: t('Matrix', 'आधात्री (मैट्रिक्स)', 'ಮಾತೃಕೆ (ಮ್ಯಾಟ್ರಿಕ್ಸ್)') },
  ],
  build(THREE) {
    const rnd = seeded(3);
    const cristae = [];
    const xs = [-1.62, -1.25, -0.88, -0.5, -0.12, 0.26, 0.64, 1.02, 1.4];
    xs.forEach((x, i) => cristae.push(crista(THREE, x, i % 2 ? -1 : 1, 0.36 + 0.06 * Math.sin(i * 2.1))));
    // DNA rings and ribosomes in the matrix, near the middle plane so a cut shows them.
    const dna = [[-0.7, -0.05, 0.0, [0.1, 0.2, 1]], [0.45, 0.12, 0.0, [0.2, -0.1, 1]], [1.25, -0.02, 0.0, [0, 0.3, 1]]].map(([x, y, z, axis]) => ring(THREE, [x, y, z], axis, 0.1, 0.022));
    const ribosomes = [];
    for (let k = 0; ribosomes.length < 70 && k < 4000; k++) {
      const x = (rnd() * 2 - 1) * 1.7, y = (rnd() * 2 - 1) * 0.55, z = (rnd() * 2 - 1) * 0.05;
      if (Math.hypot(y, z) > capsuleRadius(HALF, R.innerIn - 0.08, x)) continue;
      if (xs.some((c) => Math.abs(c - x) < 0.07)) continue;
      ribosomes.push(blob(THREE, [x, y, z], 0.032, 0.032, 0.032, 1));
    }
    return {
      outer_membrane: capsule(THREE, HALF, R.outer, R.outerIn, 64),
      inner_membrane: capsule(THREE, HALF, R.inner, R.innerIn, 64),
      matrix: capsule(THREE, HALF, R.innerIn - 0.003, 0, 64),
      cristae,
      dna,
      ribosomes,
    };
  },
  parts: [
    {
      id: 'outer_membrane', group: 'membranes', color: '#e86f4a', inside: '#d65a37', explode: [0, 0.55, 0],
      name: t('Outer membrane', 'बाहरी झिल्ली', 'ಹೊರ ಪೊರೆ'),
      info: t('A smooth covering that lets small molecules pass in and out.', 'चिकना आवरण जो छोटे अणुओं को अंदर-बाहर जाने देता है।', 'ಸಣ್ಣ ಅಣುಗಳನ್ನು ಒಳ-ಹೊರಗೆ ಹೋಗಲು ಬಿಡುವ ನಯವಾದ ಹೊದಿಕೆ.'),
    },
    {
      id: 'inner_membrane', group: 'membranes', color: '#f0a04b', inside: '#e08b36', explode: [0, 0.28, 0],
      name: t('Inner membrane', 'भीतरी झिल्ली', 'ಒಳ ಪೊರೆ'),
      info: t('A second membrane inside the first, with a narrow space between them. It carries the enzymes that make ATP.', 'पहली झिल्ली के भीतर दूसरी झिल्ली, दोनों के बीच संकरा स्थान। इसमें ATP बनाने वाले एंजाइम होते हैं।', 'ಮೊದಲನೆಯದರ ಒಳಗಿನ ಎರಡನೇ ಪೊರೆ, ಎರಡರ ನಡುವೆ ಕಿರಿದಾದ ಜಾಗ. ATP ತಯಾರಿಸುವ ಕಿಣ್ವಗಳು ಇದರಲ್ಲಿವೆ.'),
    },
    {
      id: 'cristae', group: 'membranes', color: '#f4b860', inside: '#e6a24a', explode: [0, 0, 0.55],
      name: t('Cristae', 'क्रिस्टी (वलन)', 'ಕ್ರಿಸ್ಟೇ (ಮಡಿಕೆಗಳು)'),
      info: t('Deep folds of the inner membrane. Folding gives it a much bigger surface, so it can make more ATP.', 'भीतरी झिल्ली के गहरे वलन। वलन से इसकी सतह बहुत बढ़ जाती है, जिससे यह अधिक ATP बना सकती है।', 'ಒಳ ಪೊರೆಯ ಆಳವಾದ ಮಡಿಕೆಗಳು. ಮಡಿಕೆಗಳಿಂದ ಅದರ ಮೇಲ್ಮೈ ಬಹಳ ಹೆಚ್ಚಾಗಿ ಹೆಚ್ಚು ATP ತಯಾರಿಸಬಲ್ಲದು.'),
    },
    {
      id: 'matrix', group: 'matrix', color: '#fbd9b0', inside: '#f9d0a0', minor: true, explode: [0, -0.1, 0.25],
      name: t('Matrix', 'आधात्री (मैट्रिक्स)', 'ಮಾತೃಕೆ (ಮ್ಯಾಟ್ರಿಕ್ಸ್)'),
      info: t('The thick fluid inside, where the food molecules are broken down step by step (the Krebs cycle).', 'भीतर का गाढ़ा द्रव, जहाँ भोजन के अणु चरण दर चरण टूटते हैं (क्रेब्स चक्र)।', 'ಒಳಗಿನ ದಪ್ಪ ದ್ರವ; ಇಲ್ಲಿ ಆಹಾರದ ಅಣುಗಳು ಹಂತ ಹಂತವಾಗಿ ವಿಭಜನೆಯಾಗುತ್ತವೆ (ಕ್ರೆಬ್ಸ್ ಚಕ್ರ).'),
    },
    {
      id: 'dna', group: 'matrix', color: '#5a4fcf', explode: [0, -0.35, 0.6],
      name: t('Mitochondrial DNA', 'माइटोकॉन्ड्रियल डीएनए', 'ಮೈಟೊಕಾಂಡ್ರಿಯಲ್ ಡಿಎನ್‌ಎ'),
      info: t('Small rings of its own DNA, like a bacterium\'s: a clue that mitochondria came from bacteria that started living inside other cells long ago. We inherit them only from our mother.', 'अपने डीएनए के छोटे छल्ले, जीवाणु के जैसे: यह संकेत कि माइटोकॉन्ड्रिया उन जीवाणुओं से बने जो बहुत पहले दूसरी कोशिकाओं के भीतर रहने लगे। ये हमें केवल माँ से मिलते हैं।', 'ತನ್ನದೇ ಡಿಎನ್‌ಎಯ ಸಣ್ಣ ಉಂಗುರಗಳು, ಬ್ಯಾಕ್ಟೀರಿಯಾದಂತೆ: ಬಹಳ ಹಿಂದೆ ಇತರ ಕೋಶಗಳ ಒಳಗೆ ಬದುಕಲು ಆರಂಭಿಸಿದ ಬ್ಯಾಕ್ಟೀರಿಯಾದಿಂದ ಮೈಟೊಕಾಂಡ್ರಿಯಾ ಬಂದವು ಎಂಬ ಸುಳಿವು. ಇವು ನಮಗೆ ತಾಯಿಯಿಂದ ಮಾತ್ರ ಬರುತ್ತವೆ.'),
    },
    {
      id: 'ribosomes', group: 'matrix', color: '#7a46b0', minor: true, explode: [0, -0.25, 0.45],
      name: t('Ribosomes', 'राइबोसोम', 'ರೈಬೋಸೋಮ್‌ಗಳು'),
      info: t('Its own small ribosomes make some of its proteins.', 'इसके अपने छोटे राइबोसोम इसके कुछ प्रोटीन बनाते हैं।', 'ಇದರ ಸ್ವಂತ ಸಣ್ಣ ರೈಬೋಸೋಮ್‌ಗಳು ಇದರ ಕೆಲವು ಪ್ರೋಟೀನ್‌ಗಳನ್ನು ತಯಾರಿಸುತ್ತವೆ.'),
    },
  ],
  views: [
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [0.15, 0.3, 1] },
    { id: 'angle', name: t('At an angle', 'तिरछे', 'ಓರೆಯಾಗಿ'), dir: [0.7, 0.6, 1] },
  ],
  slices: [
    { id: 'half', name: t('Cut open lengthwise', 'लंबाई में खोला गया', 'ಉದ್ದಕ್ಕೆ ತೆರೆದದ್ದು'), normal: [0, 0, -1], offset: 0, view: 'side' },
  ],
  animations: [],
};
