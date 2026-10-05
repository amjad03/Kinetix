// DNA, built in code, in two versions: the double helix, and the same
// ladder untwisted flat with its top unzipping (as when DNA copies itself),
// so the pairing A–T and G–C is easy to see.
import { taperTube, curveThrough, rod, blob } from '../lib/shapes.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const SEQ = 'ATGCGTACCTAGGATCCGTA';
const PAIR = { A: 'T', T: 'A', G: 'C', C: 'G' };
const BASE_ID = { A: 'adenine', T: 'thymine', G: 'guanine', C: 'cytosine' };
const N = SEQ.length;

// The helix: ten base pairs a turn, the two strands 150° apart round the
// axis (which gives the major and minor grooves).
const RISE = 0.0078, RADIUS = 0.02, TURN = (2 * Math.PI) / 10, OFFSET = (150 * Math.PI) / 180;
const helixPoint = (strand, i) => {
  const a = i * TURN + (strand === 2 ? OFFSET : 0);
  return [RADIUS * Math.cos(a), -((N - 1) * RISE) / 2 + i * RISE, RADIUS * Math.sin(a)];
};

// The ladder: rails 0.07 apart, zipped below FORK and opening above it.
const LN = 16, LSTEP = 0.0098, HALF = 0.034, FORK = 0.028;
const ladderY = (i) => -0.075 + i * LSTEP;
const railX = (y) => HALF + (y > FORK ? (y - FORK) * 0.62 : 0);

/** Bases, hydrogen bonds and backbones for a set of rungs. */
function strands(THREE, rungs, backbone1, backbone2) {
  const bases = { adenine: [], thymine: [], guanine: [], cytosine: [] };
  const bonds = [];
  for (const { p1, p2, b1, open } of rungs) {
    const P1 = new THREE.Vector3(...p1), P2 = new THREE.Vector3(...p2);
    const mid = P1.clone().add(P2).multiplyScalar(0.5);
    const d = P2.clone().sub(P1).normalize();
    const reach = open ? HALF - 0.004 : P1.distanceTo(mid) - 0.0013;
    const end1 = P1.clone().addScaledVector(d, reach), end2 = P2.clone().addScaledVector(d, -reach);
    bases[BASE_ID[b1]].push(rod(THREE, p1, end1.toArray(), 0.0028, 12));
    bases[BASE_ID[PAIR[b1]]].push(rod(THREE, p2, end2.toArray(), 0.0028, 12));
    if (open) continue;
    // Two hydrogen bonds hold A to T, three hold G to C.
    const n = b1 === 'A' || b1 === 'T' ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * 0.0019;
      bonds.push(blob(THREE, [mid.x, mid.y + off, mid.z], 0.0007, 0.0007, 0.0007, 1));
    }
  }
  const tube = (pts) => taperTube(THREE, curveThrough(THREE, pts), 0.0026, 0.0026, { segments: 240, radial: 12 });
  return { bases, bonds, s1: tube(backbone1), s2: tube(backbone2) };
}

const words = {
  strand_1: t('Sugar–phosphate backbone', 'शर्करा–फॉस्फेट आधार', 'ಸಕ್ಕರೆ–ಫಾಸ್ಫೇಟ್ ಬೆನ್ನೆಲುಬು'),
  strand_1_info: t('One strand: a chain of deoxyribose sugars joined by phosphates. The bases stick out from it.', 'एक सूत्र: फॉस्फेट से जुड़ी डीऑक्सीराइबोज़ शर्कराओं की श्रृंखला। क्षारक इससे निकले रहते हैं।', 'ಒಂದು ಎಳೆ: ಫಾಸ್ಫೇಟ್‌ಗಳಿಂದ ಜೋಡಿಸಲಾದ ಡಿಆಕ್ಸಿರೈಬೋಸ್ ಸಕ್ಕರೆಗಳ ಸರಪಳಿ. ಕ್ಷಾರಗಳು ಇದರಿಂದ ಚಾಚಿಕೊಂಡಿವೆ.'),
  strand_2: t('Second backbone', 'दूसरा आधार सूत्र', 'ಎರಡನೇ ಬೆನ್ನೆಲುಬು'),
  strand_2_info: t('The partner strand runs the opposite way (antiparallel). Its bases match the first strand\'s.', 'साथी सूत्र उल्टी दिशा में चलता है (प्रतिसमानांतर)। इसके क्षारक पहले सूत्र से मेल खाते हैं।', 'ಜೊತೆ ಎಳೆ ವಿರುದ್ಧ ದಿಕ್ಕಿನಲ್ಲಿ ಸಾಗುತ್ತದೆ (ಪ್ರತಿಸಮಾಂತರ). ಇದರ ಕ್ಷಾರಗಳು ಮೊದಲ ಎಳೆಯವುಗಳಿಗೆ ಹೊಂದುತ್ತವೆ.'),
  adenine: t('Adenine (A)', 'एडेनिन (A)', 'ಅಡೆನಿನ್ (A)'),
  adenine_info: t('A base that always pairs with thymine, by two hydrogen bonds.', 'एक क्षारक जो सदा थाइमिन से दो हाइड्रोजन बंधों द्वारा जुड़ता है।', 'ಯಾವಾಗಲೂ ಥೈಮಿನ್‌ನೊಂದಿಗೆ ಎರಡು ಹೈಡ್ರೋಜನ್ ಬಂಧಗಳಿಂದ ಜೋಡಿಯಾಗುವ ಕ್ಷಾರ.'),
  thymine: t('Thymine (T)', 'थाइमिन (T)', 'ಥೈಮಿನ್ (T)'),
  thymine_info: t('A base that always pairs with adenine. (In RNA, uracil takes its place.)', 'एक क्षारक जो सदा एडेनिन से जुड़ता है। (RNA में इसकी जगह यूरेसिल होता है।)', 'ಯಾವಾಗಲೂ ಅಡೆನಿನ್‌ನೊಂದಿಗೆ ಜೋಡಿಯಾಗುವ ಕ್ಷಾರ. (RNA ಯಲ್ಲಿ ಇದರ ಬದಲು ಯುರಾಸಿಲ್.)'),
  guanine: t('Guanine (G)', 'ग्वानिन (G)', 'ಗ್ವಾನಿನ್ (G)'),
  guanine_info: t('A base that always pairs with cytosine, by three hydrogen bonds.', 'एक क्षारक जो सदा साइटोसिन से तीन हाइड्रोजन बंधों द्वारा जुड़ता है।', 'ಯಾವಾಗಲೂ ಸೈಟೋಸಿನ್‌ನೊಂದಿಗೆ ಮೂರು ಹೈಡ್ರೋಜನ್ ಬಂಧಗಳಿಂದ ಜೋಡಿಯಾಗುವ ಕ್ಷಾರ.'),
  cytosine: t('Cytosine (C)', 'साइटोसिन (C)', 'ಸೈಟೋಸಿನ್ (C)'),
  cytosine_info: t('A base that always pairs with guanine.', 'एक क्षारक जो सदा ग्वानिन से जुड़ता है।', 'ಯಾವಾಗಲೂ ಗ್ವಾನಿನ್‌ನೊಂದಿಗೆ ಜೋಡಿಯಾಗುವ ಕ್ಷಾರ.'),
  h_bonds: t('Hydrogen bonds', 'हाइड्रोजन बंध', 'ಹೈಡ್ರೋಜನ್ ಬಂಧಗಳು'),
  h_bonds_info: t('Weak bonds between the paired bases. Being weak, they let the two strands unzip to be copied.', 'जुड़े क्षारकों के बीच कमज़ोर बंध। कमज़ोर होने से दोनों सूत्र प्रतिलिपि के लिए खुल सकते हैं।', 'ಜೋಡಿ ಕ್ಷಾರಗಳ ನಡುವಿನ ದುರ್ಬಲ ಬಂಧಗಳು. ದುರ್ಬಲವಾದ್ದರಿಂದ ನಕಲಿಗಾಗಿ ಎರಡು ಎಳೆಗಳು ಬಿಚ್ಚಿಕೊಳ್ಳಬಹುದು.'),
};
const COLOURS = { strand_1: '#8792a8', strand_2: '#a88fc4', adenine: '#e0473c', thymine: '#f2c230', guanine: '#3fae5a', cytosine: '#3b7bd9', h_bonds: '#f4f4f4' };
const GROUP = { strand_1: 'backbone', strand_2: 'backbone', adenine: 'bases', thymine: 'bases', guanine: 'bases', cytosine: 'bases', h_bonds: 'bases' };

/** The parts of one version ('' for the helix, '_l' for the ladder). */
const partsOf = (suffix, variant) =>
  Object.keys(COLOURS).map((id) => ({
    id: id + suffix,
    variant,
    group: GROUP[id],
    color: COLOURS[id],
    ...(id === 'h_bonds' ? { minor: true } : {}),
    // Taken apart, the two backbones move away from the bases between them.
    ...(id === 'strand_1' ? { explode: [-1, 0, 0] } : id === 'strand_2' ? { explode: [1, 0, 0] } : { explode: [0, 0, 0] }),
    name: words[id],
    info: words[`${id}_info`],
  }));

const both = (...ids) => ids.flatMap((id) => [id, `${id}_l`]);

export default {
  id: 'dna',
  version: 1,
  order: 11,
  source: 'procedural',
  subject: 'Biology',
  classes: [10, 12],
  title: t('DNA', 'डीएनए', 'ಡಿಎನ್‌ಎ'),
  summary: t(
    'Two strands twisted into a double helix. Their bases pair A with T and G with C, so each strand carries the code to rebuild the other.',
    'दो सूत्र द्विकुंडली में लिपटे हैं। क्षारक A–T और G–C जोड़े बनाते हैं, इसलिए हर सूत्र दूसरे को फिर से बनाने का कोड रखता है।',
    'ಎರಡು ಎಳೆಗಳು ಜೋಡಿ ಸುರುಳಿಯಾಗಿ ಹೆಣೆದಿವೆ. ಕ್ಷಾರಗಳು A ಯನ್ನು T ಯೊಂದಿಗೆ, G ಯನ್ನು C ಯೊಂದಿಗೆ ಜೋಡಿಸುತ್ತವೆ; ಹಾಗಾಗಿ ಪ್ರತಿ ಎಳೆ ಇನ್ನೊಂದನ್ನು ಮರುನಿರ್ಮಿಸುವ ಸಂಕೇತ ಹೊಂದಿದೆ.',
  ),
  keywords: ['dna', 'double helix', 'genes', 'heredity', 'nucleotide', 'base pairing', 'replication', 'molecular basis of inheritance', 'chromosome', 'adenine', 'thymine', 'guanine', 'cytosine'],
  credit: 'Model built by KINETIX',
  groups: [
    { id: 'backbone', name: t('Backbones', 'आधार सूत्र', 'ಬೆನ್ನೆಲುಬುಗಳು') },
    { id: 'bases', name: t('Bases', 'क्षारक', 'ಕ್ಷಾರಗಳು') },
  ],
  variants: [
    { id: 'helix', name: t('Double helix', 'द्विकुंडली', 'ಜೋಡಿ ಸುರುಳಿ') },
    { id: 'ladder', name: t('Untwisted, unzipping', 'खुली सीढ़ी, खुलते सूत्र', 'ಬಿಚ್ಚಿದ ಏಣಿ, ತೆರೆಯುವ ಎಳೆಗಳು') },
  ],
  build(THREE) {
    // The helix.
    const along = (strand) => {
      const pts = [];
      for (let k = 0; k <= (N - 1) * 6 + 6; k++) {
        const i = -0.5 + k / 6;
        pts.push(helixPoint(strand, i));
      }
      return pts;
    };
    const helix = strands(
      THREE,
      [...SEQ].map((b, i) => ({ p1: helixPoint(1, i), p2: helixPoint(2, i), b1: b })),
      along(1),
      along(2),
    );
    // The ladder, zipped below the fork and open above it.
    const rail = (side) => {
      const pts = [];
      for (let k = 0; k <= 40; k++) {
        const y = ladderY(-0.5) + (k / 40) * (ladderY(LN - 0.5) - ladderY(-0.5));
        pts.push([side * railX(y), y, 0]);
      }
      return pts;
    };
    const ladder = strands(
      THREE,
      Array.from({ length: LN }, (_, i) => {
        const y = ladderY(i);
        return { p1: [-railX(y), y, 0], p2: [railX(y), y, 0], b1: SEQ[i], open: y > FORK + 0.002 };
      }),
      rail(-1),
      rail(1),
    );
    const out = {};
    for (const [suffix, m] of [['', helix], ['_l', ladder]]) {
      out[`strand_1${suffix}`] = m.s1;
      out[`strand_2${suffix}`] = m.s2;
      for (const [id, list] of Object.entries(m.bases)) out[id + suffix] = list;
      out[`h_bonds${suffix}`] = m.bonds;
    }
    return out;
  },
  parts: [...partsOf('', 'helix'), ...partsOf('_l', 'ladder')],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0.1, 1] },
    { id: 'end', name: t('Down the helix', 'कुंडली के अक्ष से', 'ಸುರುಳಿಯ ಅಕ್ಷದಿಂದ'), dir: [0, 1, 0.05] },
    { id: 'angle', name: t('At an angle', 'तिरछे', 'ಓರೆಯಾಗಿ'), dir: [0.7, 0.35, 1] },
  ],
  slices: [],
  animations: [
    {
      id: 'pairs', kind: 'tour',
      name: t('Base pairs', 'क्षारक युग्म', 'ಕ್ಷಾರ ಜೋಡಿಗಳು'),
      steps: [
        {
          highlight: both('strand_1', 'strand_2'),
          text: t('Two backbones of sugar and phosphate form the sides of a twisted ladder.', 'शर्करा और फॉस्फेट के दो आधार सूत्र मुड़ी हुई सीढ़ी की भुजाएँ बनाते हैं।', 'ಸಕ್ಕರೆ ಮತ್ತು ಫಾಸ್ಫೇಟ್‌ನ ಎರಡು ಬೆನ್ನೆಲುಬುಗಳು ತಿರುಚಿದ ಏಣಿಯ ಬದಿಗಳಾಗಿವೆ.'),
        },
        {
          highlight: both('adenine', 'thymine'),
          text: t('Adenine always pairs with thymine (two hydrogen bonds).', 'एडेनिन सदा थाइमिन से जुड़ता है (दो हाइड्रोजन बंध)।', 'ಅಡೆನಿನ್ ಯಾವಾಗಲೂ ಥೈಮಿನ್‌ನೊಂದಿಗೆ ಜೋಡಿ (ಎರಡು ಹೈಡ್ರೋಜನ್ ಬಂಧ).'),
        },
        {
          highlight: both('guanine', 'cytosine'),
          text: t('Guanine always pairs with cytosine (three hydrogen bonds).', 'ग्वानिन सदा साइटोसिन से जुड़ता है (तीन हाइड्रोजन बंध)।', 'ಗ್ವಾನಿನ್ ಯಾವಾಗಲೂ ಸೈಟೋಸಿನ್‌ನೊಂದಿಗೆ ಜೋಡಿ (ಮೂರು ಹೈಡ್ರೋಜನ್ ಬಂಧ).'),
        },
        {
          highlight: both('h_bonds'),
          text: t('The weak hydrogen bonds let the strands unzip. Each strand then guides the building of a new partner.', 'कमज़ोर हाइड्रोजन बंध सूत्रों को खुलने देते हैं। फिर हर सूत्र नए साथी सूत्र के निर्माण का मार्गदर्शन करता है।', 'ದುರ್ಬಲ ಹೈಡ್ರೋಜನ್ ಬಂಧಗಳು ಎಳೆಗಳನ್ನು ಬಿಚ್ಚಲು ಬಿಡುತ್ತವೆ. ನಂತರ ಪ್ರತಿ ಎಳೆ ಹೊಸ ಜೊತೆ ಎಳೆಯ ನಿರ್ಮಾಣಕ್ಕೆ ದಾರಿ ತೋರುತ್ತದೆ.'),
        },
      ],
    },
  ],
};
