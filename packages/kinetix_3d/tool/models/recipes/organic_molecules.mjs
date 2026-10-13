// More molecules for chemistry and chemical engineering, as ball-and-stick
// models in CPK colours (the simple ones, water to benzene and the salt
// crystal, are in molecules.mjs): methanol, ethanol, acetic acid and the
// glucose ring (β-D-glucopyranose, a chair with every OH equatorial).
// Positions in ångström, worked out from bond lengths and angles.
import { t } from '../lib/teaching.mjs';
import { ELEMENTS, ballAndStick } from '../lib/process.mjs';

const S = 0.028; // metres per ångström, as molecules.mjs

/** The glucose chair: ring O5, C1..C5 alternately up and down; substituents equatorial, H axial. */
function glucose() {
  const atoms = [], bonds = [];
  const add = (el, p) => (atoms.push([el, ...p]), atoms.length - 1);
  const ring = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3, z = k % 2 ? 0.25 : -0.25;
    ring.push(add(k === 0 ? 'O' : 'C', [1.45 * Math.cos(a), z, 1.45 * Math.sin(a)]));
  }
  for (let k = 0; k < 6; k++) bonds.push([ring[k], ring[(k + 1) % 6], 1]);
  const along = (p, d, len) => p.map((v, i) => v + d[i] * len);
  const norm = (d) => { const l = Math.hypot(...d); return d.map((v) => v / l); };
  for (let k = 1; k < 6; k++) {
    const a = (k * Math.PI) / 3, sign = k % 2 ? 1 : -1;
    const p = atoms[ring[k]].slice(1);
    const eq = norm([0.94 * Math.cos(a), -sign * 0.33, 0.94 * Math.sin(a)]);
    // Axial hydrogen straight up or down.
    bonds.push([ring[k], add('H', along(p, [0, sign, 0], 1.09)), 1]);
    if (k < 5) {
      // C1–C4: an OH group.
      const o = add('O', along(p, eq, 1.43));
      bonds.push([ring[k], o, 1]);
      bonds.push([o, add('H', along(atoms[o].slice(1), norm([eq[0], 0.6 * sign, eq[2]]), 0.96)), 1]);
    } else {
      // C5: the CH2OH group (C6).
      const c6p = along(p, eq, 1.52);
      const c6 = add('C', c6p);
      bonds.push([ring[k], c6, 1]);
      const o6 = add('O', along(c6p, norm([eq[0], 0.8, eq[2]]), 1.43));
      bonds.push([c6, o6, 1]);
      bonds.push([o6, add('H', along(atoms[o6].slice(1), norm([eq[0], 0.1, eq[2] + 0.6]), 0.96)), 1]);
      bonds.push([c6, add('H', along(c6p, norm([eq[0] * 0.3, -0.7, 0.7]), 1.09)), 1]);
      bonds.push([c6, add('H', along(c6p, norm([eq[0] * 0.3, -0.7, -0.7]), 1.09)), 1]);
    }
  }
  return [atoms, bonds];
}

const [gAtoms, gBonds] = glucose();

/** [id, name, info, atoms, bonds] */
const MOLECULES = [
  ['methanol', t('Methanol (CH₃OH)', 'मेथनॉल (CH₃OH)', 'ಮೆಥನಾಲ್ (CH₃OH)'),
    t('The simplest alcohol: an OH group on one carbon. Made from syngas (CO + 2H₂) and used as a fuel and solvent.', 'सबसे सरल ऐल्कोहॉल: एक कार्बन पर OH समूह। संश्लेषण गैस (CO + 2H₂) से बनता है; ईंधन और विलायक।', 'ಅತಿ ಸರಳ ಆಲ್ಕೋಹಾಲ್: ಒಂದು ಕಾರ್ಬನ್ ಮೇಲೆ OH ಗುಂಪು. ಸಿನ್‌ಗ್ಯಾಸ್‌ನಿಂದ (CO + 2H₂) ತಯಾರಿಕೆ; ಇಂಧನ ಮತ್ತು ದ್ರಾವಕ.'),
    [['C', -0.7, 0, 0], ['O', 0.7, 0.1, 0], ['H', 1.0, -0.8, 0], ['H', -1.05, -1.03, 0], ['H', -1.05, 0.5, 0.89], ['H', -1.05, 0.5, -0.89]],
    [[0, 1, 1], [1, 2, 1], [0, 3, 1], [0, 4, 1], [0, 5, 1]]],
  ['ethanol', t('Ethanol (C₂H₅OH)', 'एथेनॉल (C₂H₅OH)', 'ಎಥನಾಲ್ (C₂H₅OH)'),
    t('Two carbons and an OH group. Made by fermenting sugar (C₆H₁₂O₆ → 2C₂H₅OH + 2CO₂) and blended into petrol.', 'दो कार्बन और एक OH समूह। शर्करा के किण्वन से बनता है (C₆H₁₂O₆ → 2C₂H₅OH + 2CO₂) और पेट्रोल में मिलाया जाता है।', 'ಎರಡು ಕಾರ್ಬನ್ ಮತ್ತು ಒಂದು OH ಗುಂಪು. ಸಕ್ಕರೆಯ ಹುದುಗುವಿಕೆಯಿಂದ (C₆H₁₂O₆ → 2C₂H₅OH + 2CO₂) ತಯಾರಿಕೆ; ಪೆಟ್ರೋಲ್‌ಗೆ ಬೆರೆಸಲಾಗುತ್ತದೆ.'),
    [['C', -1.25, -0.2, 0], ['C', 0.1, 0.5, 0], ['O', 1.15, -0.45, 0], ['H', 1.95, 0.08, 0],
      ['H', -1.2, -1.29, 0], ['H', -1.78, 0.15, 0.89], ['H', -1.78, 0.15, -0.89], ['H', 0.13, 1.15, 0.88], ['H', 0.13, 1.15, -0.88]],
    [[0, 1, 1], [1, 2, 1], [2, 3, 1], [0, 4, 1], [0, 5, 1], [0, 6, 1], [1, 7, 1], [1, 8, 1]]],
  ['acetic_acid', t('Acetic acid (CH₃COOH)', 'ऐसीटिक अम्ल (CH₃COOH)', 'ಅಸಿಟಿಕ್ ಆಮ್ಲ (CH₃COOH)'),
    t('A carboxylic acid: the –COOH group has a C=O double bond and an OH. Vinegar is about 5% acetic acid.', 'कार्बोक्सिलिक अम्ल: –COOH समूह में C=O द्विबंध और एक OH होता है। सिरके में लगभग 5% ऐसीटिक अम्ल होता है।', 'ಕಾರ್ಬಾಕ್ಸಿಲಿಕ್ ಆಮ್ಲ: –COOH ಗುಂಪಿನಲ್ಲಿ C=O ದ್ವಿಬಂಧ ಮತ್ತು OH ಇದೆ. ವಿನೆಗರ್‌ನಲ್ಲಿ ಸುಮಾರು 5% ಅಸಿಟಿಕ್ ಆಮ್ಲ.'),
    [['C', -1.3, -0.1, 0], ['C', 0.2, 0.05, 0], ['O', 0.85, 1.08, 0], ['O', 0.85, -1.1, 0], ['H', 1.8, -0.95, 0],
      ['H', -1.6, -1.15, 0], ['H', -1.7, 0.42, 0.88], ['H', -1.7, 0.42, -0.88]],
    [[0, 1, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1], [0, 5, 1], [0, 6, 1], [0, 7, 1]]],
  ['glucose', t('Glucose (C₆H₁₂O₆), ring form', 'ग्लूकोज़ (C₆H₁₂O₆), वलय रूप', 'ಗ್ಲೂಕೋಸ್ (C₆H₁₂O₆), ಉಂಗುರ ರೂಪ'),
    t('β-D-glucose: five carbons and an oxygen in a chair-shaped ring; every OH group sticks out sideways (equatorial), which makes it the most stable sugar.', 'β-D-ग्लूकोज़: कुर्सी जैसी वलय में पाँच कार्बन और एक ऑक्सीजन; हर OH समूह बगल की ओर (विषुवतीय) निकला है, इसलिए यह सबसे स्थायी शर्करा है।', 'β-D-ಗ್ಲೂಕೋಸ್: ಕುರ್ಚಿ ಆಕಾರದ ಉಂಗುರದಲ್ಲಿ ಐದು ಕಾರ್ಬನ್ ಮತ್ತು ಒಂದು ಆಮ್ಲಜನಕ; ಪ್ರತಿ OH ಗುಂಪು ಪಕ್ಕಕ್ಕೆ (ಸಮಭಾಜಕೀಯ) ಚಾಚಿದೆ, ಹಾಗಾಗಿ ಇದು ಅತಿ ಸ್ಥಿರ ಸಕ್ಕರೆ.'),
    gAtoms, gBonds],
];

const bondNames = { 1: t('Single bonds', 'एकल बंध', 'ಏಕ ಬಂಧಗಳು'), 2: t('Double bond (C=O)', 'द्विबंध (C=O)', 'ದ್ವಿಬಂಧ (C=O)') };
const bondInfo = {
  1: t('One pair of shared electrons.', 'इलेक्ट्रॉनों का एक साझा युग्म।', 'ಒಂದು ಹಂಚಿಕೊಂಡ ಎಲೆಕ್ಟ್ರಾನ್ ಜೋಡಿ.'),
  2: t('Two pairs of shared electrons: shorter and stronger than a single bond.', 'इलेक्ट्रॉनों के दो साझा युग्म: एकल बंध से छोटा और मज़बूत।', 'ಎರಡು ಹಂಚಿಕೊಂಡ ಎಲೆಕ್ಟ್ರಾನ್ ಜೋಡಿಗಳು: ಏಕ ಬಂಧಕ್ಕಿಂತ ಚಿಕ್ಕದು ಮತ್ತು ಬಲವಾದದ್ದು.'),
};

export default {
  id: 'organic_molecules',
  version: 1,
  order: 16,
  source: 'procedural',
  subject: 'Chemistry',
  classes: [10, 11, 12],
  title: t('Alcohols, acids and sugars', 'ऐल्कोहॉल, अम्ल और शर्कराएँ', 'ಆಲ್ಕೋಹಾಲ್, ಆಮ್ಲ ಮತ್ತು ಸಕ್ಕರೆಗಳು'),
  summary: t(
    'Ball-and-stick models of methanol, ethanol, acetic acid and the glucose ring, in CPK colours: carbon black, oxygen red, hydrogen white.',
    'मेथनॉल, एथेनॉल, ऐसीटिक अम्ल और ग्लूकोज़ वलय के गेंद-छड़ी मॉडल, CPK रंगों में: कार्बन काला, ऑक्सीजन लाल, हाइड्रोजन सफ़ेद।',
    'ಮೆಥನಾಲ್, ಎಥನಾಲ್, ಅಸಿಟಿಕ್ ಆಮ್ಲ ಮತ್ತು ಗ್ಲೂಕೋಸ್ ಉಂಗುರದ ಚೆಂಡು-ಕಡ್ಡಿ ಮಾದರಿಗಳು, CPK ಬಣ್ಣಗಳಲ್ಲಿ: ಕಾರ್ಬನ್ ಕಪ್ಪು, ಆಮ್ಲಜನಕ ಕೆಂಪು, ಹೈಡ್ರೋಜನ್ ಬಿಳಿ.',
  ),
  keywords: ['ethanol', 'methanol', 'alcohol', 'acetic acid', 'ethanoic acid', 'carboxylic acid', 'glucose', 'sugar', 'carbohydrate', 'functional group', 'organic chemistry', 'carbon and its compounds', 'biomolecules', 'fermentation'],
  credit: 'Model built by KINETIX',
  thumb: 'glucose',
  variants: MOLECULES.map(([id, name]) => ({ id, name })),
  groups: [
    { id: 'atoms', name: t('Atoms', 'परमाणु', 'ಪರಮಾಣುಗಳು') },
    { id: 'bonds', name: t('Bonds', 'बंध', 'ಬಂಧಗಳು') },
  ],
  build(THREE) {
    const out = {};
    for (const [id, , , atoms, bonds] of MOLECULES) ballAndStick(THREE, id, atoms, bonds, S, out);
    return out;
  },
  get parts() {
    const list = [];
    for (const [id, name, info, atoms, bonds] of MOLECULES) {
      const counts = {};
      for (const [el] of atoms) counts[el] = (counts[el] || 0) + 1;
      for (const [el, n] of Object.entries(counts)) {
        const e = ELEMENTS[el];
        list.push({
          id: `${id}_${el}`, variant: id, group: 'atoms', color: e.color,
          name: n > 1 ? t(`${e.name.en} atoms (${n})`, `${e.name.hi} परमाणु (${n})`, `${e.name.kn} ಪರಮಾಣುಗಳು (${n})`) : t(`${e.name.en} atom`, `${e.name.hi} परमाणु`, `${e.name.kn} ಪರಮಾಣು`),
          info: t(`${name.en}. ${info.en}`, `${name.hi}। ${info.hi}`, `${name.kn}. ${info.kn}`),
        });
      }
      for (const order of new Set(bonds.map((b) => b[2]))) {
        list.push({ id: `${id}_bonds${order}`, variant: id, group: 'bonds', color: '#b8bec6', minor: order === 1, name: bondNames[order], info: bondInfo[order] });
      }
    }
    return list;
  },
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.35, 0.45, 1] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0.2, 0.2] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.1] },
  ],
  slices: [],
  animations: [],
};
