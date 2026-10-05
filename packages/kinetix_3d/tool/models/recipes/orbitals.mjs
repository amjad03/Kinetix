// Atomic orbitals (s, p, d), built in code. Each lobe is the polar plot of
// the square of the orbital's angular part (the usual textbook boundary
// shapes), split by the sign of the wave function. Chemistry's z axis is
// up (the viewer's y); its y axis points away from the viewer.
import { blob, rod } from '../lib/shapes.mjs';
import { t, polarLobes, box } from '../lib/teaching.mjs';

const R = 0.06; // the length of a lobe
const L = 0.07; // half the length of an axis

// Chemistry's (x, y, z) from the viewer's direction [X, Y, Z].
const chem = ([X, Y, Z]) => [X, -Z, Y];

const POS = '#e5533d', NEG = '#3d7be5';

/** [id, name, f(x, y, z) on the unit sphere, nodal planes as normals in chemistry's axes] */
const P = [
  ['px', 'px', ([x]) => x, [[1, 0, 0]]],
  ['py', 'py', ([, y]) => y, [[0, 1, 0]]],
  ['pz', 'pz', ([, , z]) => z, [[0, 0, 1]]],
];
const D = [
  ['dxy', 'dxy', ([x, y]) => 2 * x * y, [[1, 0, 0], [0, 1, 0]]],
  ['dyz', 'dyz', ([, y, z]) => 2 * y * z, [[0, 1, 0], [0, 0, 1]]],
  ['dxz', 'dxz', ([x, , z]) => 2 * x * z, [[1, 0, 0], [0, 0, 1]]],
  ['dx2y2', 'dx²−y²', ([x, y]) => x * x - y * y, [[1, 1, 0], [1, -1, 0]]],
  ['dz2', 'dz²', ([, , z]) => (3 * z * z - 1) / 2, []],
];

/** A see-through square through the nucleus, at right angles to [n] (chemistry's axes). */
function nodalPlane(THREE, n) {
  const [x, y, z] = n;
  const normal = new THREE.Vector3(x, z, -y).normalize();
  const g = box(THREE, [L * 1.7, L * 1.7, 0.0006], [0, 0, 0]);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal));
  return g;
}

const lobeInfo = {
  p: t(
    'A p orbital (l = 1) has two lobes on opposite sides of the nucleus. The wave function has opposite signs in the two lobes. The three p orbitals point along the x, y and z axes.',
    'p कक्षक (l = 1) की नाभिक के दोनों ओर दो पालियाँ होती हैं। दोनों पालियों में तरंग फलन के चिह्न विपरीत होते हैं। तीनों p कक्षक x, y और z अक्षों की दिशा में होते हैं।',
    'p ಕಕ್ಷೀಯಕ್ಕೆ (l = 1) ಬೀಜಕೇಂದ್ರದ ಎರಡೂ ಬದಿಗಳಲ್ಲಿ ಎರಡು ಹಾಲೆಗಳಿವೆ. ಎರಡು ಹಾಲೆಗಳಲ್ಲಿ ತರಂಗ ಫಲನದ ಚಿಹ್ನೆಗಳು ವಿರುದ್ಧವಾಗಿವೆ. ಮೂರು p ಕಕ್ಷೀಯಗಳು x, y ಮತ್ತು z ಅಕ್ಷಗಳ ದಿಕ್ಕಿನಲ್ಲಿವೆ.',
  ),
  d: t(
    'A d orbital (l = 2). Four of the five have four lobes, with signs alternating round the nucleus; dz² has two lobes and a ring. There are five d orbitals in each shell from n = 3.',
    'd कक्षक (l = 2)। पाँच में से चार की चार पालियाँ होती हैं, जिनके चिह्न नाभिक के चारों ओर बारी-बारी से बदलते हैं; dz² की दो पालियाँ और एक वलय होता है। n = 3 से हर कोश में पाँच d कक्षक होते हैं।',
    'd ಕಕ್ಷೀಯ (l = 2). ಐದರಲ್ಲಿ ನಾಲ್ಕಕ್ಕೆ ನಾಲ್ಕು ಹಾಲೆಗಳಿವೆ, ಬೀಜಕೇಂದ್ರದ ಸುತ್ತ ಚಿಹ್ನೆಗಳು ಪರ್ಯಾಯವಾಗಿ ಬದಲಾಗುತ್ತವೆ; dz² ಗೆ ಎರಡು ಹಾಲೆಗಳು ಮತ್ತು ಒಂದು ಉಂಗುರ. n = 3 ರಿಂದ ಪ್ರತಿ ಕವಚದಲ್ಲಿ ಐದು d ಕಕ್ಷೀಯಗಳಿವೆ.',
  ),
};
const posName = t('Lobes with + sign', '+ चिह्न वाली पालियाँ', '+ ಚಿಹ್ನೆಯ ಹಾಲೆಗಳು');
const negName = t('Lobes with − sign', '− चिह्न वाली पालियाँ', '− ಚಿಹ್ನೆಯ ಹಾಲೆಗಳು');
const posOne = t('Lobe with + sign', '+ चिह्न वाली पालि', '+ ಚಿಹ್ನೆಯ ಹಾಲೆ');
const negOne = t('Lobe with − sign', '− चिह्न वाली पालि', '− ಚಿಹ್ನೆಯ ಹಾಲೆ');
const planeName = t('Nodal plane', 'नोडीय तल', 'ನೋಡಲ್ ಸಮತಲ');
const planeInfo = (n) =>
  n === 1
    ? t(
        'The electron is never found on this plane through the nucleus: the wave function is zero here. A p orbital has one nodal plane.',
        'नाभिक से होकर जाने वाले इस तल पर इलेक्ट्रॉन कभी नहीं मिलता: यहाँ तरंग फलन शून्य है। p कक्षक का एक नोडीय तल होता है।',
        'ಬೀಜಕೇಂದ್ರದ ಮೂಲಕ ಹಾದುಹೋಗುವ ಈ ಸಮತಲದಲ್ಲಿ ಎಲೆಕ್ಟ್ರಾನ್ ಎಂದೂ ಸಿಗುವುದಿಲ್ಲ: ಇಲ್ಲಿ ತರಂಗ ಫಲನ ಶೂನ್ಯ. p ಕಕ್ಷೀಯಕ್ಕೆ ಒಂದು ನೋಡಲ್ ಸಮತಲವಿದೆ.',
      )
    : t(
        'Two planes through the nucleus where the wave function is zero: a d orbital has two nodal surfaces.',
        'नाभिक से होकर जाने वाले दो तल जहाँ तरंग फलन शून्य है: d कक्षक की दो नोडीय सतहें होती हैं।',
        'ತರಂಗ ಫಲನ ಶೂನ್ಯವಾಗಿರುವ, ಬೀಜಕೇಂದ್ರದ ಮೂಲಕ ಹಾದುಹೋಗುವ ಎರಡು ಸಮತಲಗಳು: d ಕಕ್ಷೀಯಕ್ಕೆ ಎರಡು ನೋಡಲ್ ಮೇಲ್ಮೈಗಳಿವೆ.',
      );

const name = (label) => t(`${label} orbital`, `${label} कक्षक`, `${label} ಕಕ್ಷೀಯ`);

export default {
  id: 'orbitals',
  version: 1,
  order: 3,
  source: 'procedural',
  subject: 'Chemistry',
  classes: [11, 12],
  title: t('Atomic orbitals (s, p, d)', 'परमाणु कक्षक (s, p, d)', 'ಪರಮಾಣು ಕಕ್ಷೀಯಗಳು (s, p, d)'),
  summary: t(
    'The shapes of s, p and d orbitals: the regions round the nucleus where an electron is most likely to be found. Colours show the sign of the wave function.',
    's, p और d कक्षकों की आकृतियाँ: नाभिक के चारों ओर वे क्षेत्र जहाँ इलेक्ट्रॉन के मिलने की संभावना सबसे अधिक है। रंग तरंग फलन का चिह्न दिखाते हैं।',
    's, p ಮತ್ತು d ಕಕ್ಷೀಯಗಳ ಆಕಾರಗಳು: ಬೀಜಕೇಂದ್ರದ ಸುತ್ತ ಎಲೆಕ್ಟ್ರಾನ್ ಸಿಗುವ ಸಾಧ್ಯತೆ ಹೆಚ್ಚಿರುವ ಪ್ರದೇಶಗಳು. ಬಣ್ಣಗಳು ತರಂಗ ಫಲನದ ಚಿಹ್ನೆಯನ್ನು ತೋರಿಸುತ್ತವೆ.',
  ),
  keywords: ['orbital', 'orbitals', 'atomic orbital', 's orbital', 'p orbital', 'd orbital', 'quantum numbers', 'structure of atom', 'nodal plane', 'shapes of orbitals', 'azimuthal quantum number'],
  credit: 'Model built by KINETIX',
  thumb: 'dxy',
  variants: [
    { id: 's1', name: t('1s', '1s', '1s') },
    { id: 's2', name: t('2s', '2s', '2s') },
    ...P.map(([id, label]) => ({ id, name: t(label, label, label) })),
    { id: 'pall', name: t('All three p', 'तीनों p', 'ಮೂರೂ p') },
    ...D.map(([id, label]) => ({ id, name: t(label, label, label) })),
  ],
  groups: [
    { id: 'orbital', name: t('Orbital', 'कक्षक', 'ಕಕ್ಷೀಯ') },
    { id: 'nodes', name: t('Nodes', 'नोड', 'ನೋಡ್‌ಗಳು') },
    { id: 'frame', name: t('Nucleus and axes', 'नाभिक और अक्ष', 'ಬೀಜಕೇಂದ್ರ ಮತ್ತು ಅಕ್ಷಗಳು') },
  ],
  build(THREE) {
    const out = {
      nucleus: blob(THREE, [0, 0, 0], 0.0032, 0.0032, 0.0032, 3),
      axis_x: rod(THREE, [-L, 0, 0], [L, 0, 0], 0.0005, 8),
      axis_y: rod(THREE, [0, 0, L], [0, 0, -L], 0.0005, 8),
      axis_z: rod(THREE, [0, -L, 0], [0, L, 0], 0.0005, 8),
      s1_lobe: blob(THREE, [0, 0, 0], 0.034, 0.034, 0.034, 5),
      s2_inner: blob(THREE, [0, 0, 0], 0.016, 0.016, 0.016, 4),
      s2_node: blob(THREE, [0, 0, 0], 0.024, 0.024, 0.024, 5),
      s2_outer: blob(THREE, [0, 0, 0], 0.046, 0.046, 0.046, 5),
    };
    for (const [id, , f, planes] of [...P, ...D]) {
      const g = (d) => f(chem(d));
      out[`${id}_pos`] = polarLobes(THREE, g, R, 1);
      out[`${id}_neg`] = polarLobes(THREE, g, R, -1);
      if (planes.length) out[`${id}_planes`] = planes.map((n) => nodalPlane(THREE, n));
    }
    for (const [id, , f] of P) out[`pall_${id}`] = [polarLobes(THREE, (d) => f(chem(d)), R, 1), polarLobes(THREE, (d) => f(chem(d)), R, -1)];
    return out;
  },
  get parts() {
    const list = [
      {
        id: 'nucleus', group: 'frame', color: '#f4f1ea', explode: [0, 0, 0],
        name: t('Nucleus', 'नाभिक', 'ಬೀಜಕೇಂದ್ರ'),
        info: t('The orbital is centred on the nucleus.', 'कक्षक का केंद्र नाभिक पर होता है।', 'ಕಕ್ಷೀಯದ ಕೇಂದ್ರ ಬೀಜಕೇಂದ್ರದಲ್ಲಿದೆ.'),
      },
      ...['x', 'y', 'z'].map((a) => ({
        id: `axis_${a}`, group: 'frame', color: '#9aa3ad', minor: true, explode: [0, 0, 0],
        labelAt: a === 'x' ? [L, 0, 0] : a === 'y' ? [0, 0, -L] : [0, L, 0],
        name: t(`${a} axis`, `${a} अक्ष`, `${a} ಅಕ್ಷ`),
        info: t(`The ${a} axis through the nucleus.`, `नाभिक से होकर जाने वाला ${a} अक्ष।`, `ಬೀಜಕೇಂದ್ರದ ಮೂಲಕ ಹಾದುಹೋಗುವ ${a} ಅಕ್ಷ.`),
      })),
      {
        id: 's1_lobe', variant: 's1', group: 'orbital', color: POS, opacity: 0.8, explode: [0, 0, 0],
        name: name('1s'),
        info: t(
          'An s orbital (l = 0) is a sphere: the electron is equally likely in every direction. 1s is the smallest, closest to the nucleus.',
          's कक्षक (l = 0) एक गोला है: इलेक्ट्रॉन हर दिशा में समान संभावना से मिलता है। 1s सबसे छोटा है, नाभिक के सबसे पास।',
          's ಕಕ್ಷೀಯ (l = 0) ಒಂದು ಗೋಳ: ಎಲೆಕ್ಟ್ರಾನ್ ಎಲ್ಲಾ ದಿಕ್ಕುಗಳಲ್ಲೂ ಸಮಾನ ಸಾಧ್ಯತೆಯಿಂದ ಸಿಗುತ್ತದೆ. 1s ಅತಿ ಚಿಕ್ಕದು, ಬೀಜಕೇಂದ್ರಕ್ಕೆ ಅತಿ ಹತ್ತಿರ.',
        ),
      },
      {
        id: 's2_inner', variant: 's2', group: 'orbital', color: POS, explode: [0, 0, 0],
        name: t('Inner region of 2s', '2s का भीतरी भाग', '2s ನ ಒಳಭಾಗ'),
        info: t('Close to the nucleus the 2s wave function has one sign…', 'नाभिक के पास 2s तरंग फलन का एक चिह्न होता है…', 'ಬೀಜಕೇಂದ್ರದ ಹತ್ತಿರ 2s ತರಂಗ ಫಲನಕ್ಕೆ ಒಂದು ಚಿಹ್ನೆ…'),
      },
      {
        id: 's2_node', variant: 's2', group: 'nodes', color: '#f4f1ea', opacity: 0.25, explode: [0, 0, 0],
        name: t('Radial node', 'त्रिज्य नोड', 'ತ್ರಿಜ್ಯೀಯ ನೋಡ್'),
        info: t(
          'A sphere where the electron is never found. An ns orbital has n − 1 radial nodes, so 2s has one. Cut the model to see inside.',
          'एक गोला जहाँ इलेक्ट्रॉन कभी नहीं मिलता। ns कक्षक में n − 1 त्रिज्य नोड होते हैं, इसलिए 2s में एक। अंदर देखने के लिए मॉडल को काटें।',
          'ಎಲೆಕ್ಟ್ರಾನ್ ಎಂದೂ ಸಿಗದ ಒಂದು ಗೋಳ. ns ಕಕ್ಷೀಯದಲ್ಲಿ n − 1 ತ್ರಿಜ್ಯೀಯ ನೋಡ್‌ಗಳಿವೆ, ಹಾಗಾಗಿ 2s ನಲ್ಲಿ ಒಂದು. ಒಳಗೆ ನೋಡಲು ಮಾದರಿಯನ್ನು ಕತ್ತರಿಸಿ.',
        ),
      },
      {
        id: 's2_outer', variant: 's2', group: 'orbital', color: NEG, opacity: 0.45, explode: [0, 0, 0],
        name: t('Outer region of 2s', '2s का बाहरी भाग', '2s ನ ಹೊರಭಾಗ'),
        info: t(
          '…and beyond the radial node, the other sign. 2s is larger than 1s and has more energy.',
          '…और त्रिज्य नोड के बाहर दूसरा चिह्न। 2s, 1s से बड़ा है और उसकी ऊर्जा अधिक है।',
          '…ತ್ರಿಜ್ಯೀಯ ನೋಡ್‌ನ ಆಚೆ ಇನ್ನೊಂದು ಚಿಹ್ನೆ. 2s, 1s ಗಿಂತ ದೊಡ್ಡದು ಮತ್ತು ಹೆಚ್ಚು ಶಕ್ತಿ ಹೊಂದಿದೆ.',
        ),
      },
    ];
    for (const [id, label, , planes] of [...P, ...D]) {
      const kind = id.startsWith('p') ? 'p' : 'd';
      const info = lobeInfo[kind];
      const ring = id === 'dz2';
      list.push(
        {
          id: `${id}_pos`, variant: id, group: 'orbital', color: POS, explode: [0, 0, 0],
          name: kind === 'p' ? posOne : posName,
          info: t(`${name(label).en}. ${info.en}`, `${name(label).hi}। ${info.hi}`, `${name(label).kn}. ${info.kn}`),
        },
        {
          id: `${id}_neg`, variant: id, group: 'orbital', color: NEG, explode: [0, 0, 0],
          name: ring ? t('Ring with − sign', '− चिह्न वाला वलय', '− ಚಿಹ್ನೆಯ ಉಂಗುರ') : kind === 'p' ? negOne : negName,
          info: ring
            ? t(
                'A doughnut-shaped ring round the middle, in the xy plane, with the opposite sign to the two lobes. Its nodal surfaces are two cones.',
                'बीच में xy तल में डोनट जैसा वलय, जिसका चिह्न दोनों पालियों के विपरीत है। इसकी नोडीय सतहें दो शंकु हैं।',
                'ಮಧ್ಯದಲ್ಲಿ xy ಸಮತಲದಲ್ಲಿ ಡೋನಟ್ ಆಕಾರದ ಉಂಗುರ, ಎರಡು ಹಾಲೆಗಳಿಗೆ ವಿರುದ್ಧ ಚಿಹ್ನೆ. ಇದರ ನೋಡಲ್ ಮೇಲ್ಮೈಗಳು ಎರಡು ಶಂಕುಗಳು.',
              )
            : t(`${name(label).en}. ${info.en}`, `${name(label).hi}। ${info.hi}`, `${name(label).kn}. ${info.kn}`),
        },
      );
      if (planes.length) list.push({ id: `${id}_planes`, variant: id, group: 'nodes', color: '#f2b33d', opacity: 0.3, hidden: true, explode: [0, 0, 0], name: planeName, info: planeInfo(planes.length) });
    }
    for (const [id, label] of P) {
      list.push({
        id: `pall_${id}`, variant: 'pall', group: 'orbital', color: { px: '#e5533d', py: '#3fb56a', pz: '#3d7be5' }[id], opacity: 0.85, explode: [0, 0, 0],
        name: name(label),
        info: t(
          'The three p orbitals have the same shape and energy and point along the three axes, at right angles to each other.',
          'तीनों p कक्षकों की आकृति और ऊर्जा समान है और वे तीनों अक्षों की दिशा में, एक-दूसरे से समकोण पर होते हैं।',
          'ಮೂರು p ಕಕ್ಷೀಯಗಳ ಆಕಾರ ಮತ್ತು ಶಕ್ತಿ ಒಂದೇ; ಅವು ಮೂರು ಅಕ್ಷಗಳ ದಿಕ್ಕಿನಲ್ಲಿ, ಪರಸ್ಪರ ಲಂಬ ಕೋನದಲ್ಲಿವೆ.',
        ),
      });
    }
    return list;
  },
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.55, 0.4, 1] },
    { id: 'top', name: t('Down the z axis', 'z अक्ष की दिशा से', 'z ಅಕ್ಷದ ದಿಕ್ಕಿನಿಂದ'), dir: [0, 1, 0.02] },
    { id: 'side', name: t('Along the x axis', 'x अक्ष की दिशा से', 'x ಅಕ್ಷದ ದಿಕ್ಕಿನಿಂದ'), dir: [1, 0.15, 0.02] },
  ],
  slices: [{ id: 'half', name: t('Cut in half', 'आधा काटें', 'ಅರ್ಧ ಕತ್ತರಿಸಿ'), normal: [0, 0, -1], offset: 0, view: 'front' }],
  animations: [],
};
