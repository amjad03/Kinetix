// Molecules as ball-and-stick models (CPK colours), built in code from
// their real geometry. Distances in ångström, scaled for the viewer.
import { blob, rod } from '../lib/shapes.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });
const S = 0.028; // metres per ångström in the model

const ELEMENT = {
  H: { r: 0.36, color: '#f2f2f2', name: t('Hydrogen', 'हाइड्रोजन', 'ಹೈಡ್ರೋಜನ್') },
  C: { r: 0.62, color: '#3c3f44', name: t('Carbon', 'कार्बन', 'ಕಾರ್ಬನ್') },
  N: { r: 0.6, color: '#3f66d6', name: t('Nitrogen', 'नाइट्रोजन', 'ನೈಟ್ರೋಜನ್') },
  O: { r: 0.6, color: '#e0443c', name: t('Oxygen', 'ऑक्सीजन', 'ಆಮ್ಲಜನಕ') },
  F: { r: 0.52, color: '#8fd16a', name: t('Fluorine', 'फ्लोरीन', 'ಫ್ಲೋರಿನ್') },
  Cl: { r: 0.72, color: '#3fc25a', name: t('Chlorine', 'क्लोरीन', 'ಕ್ಲೋರಿನ್') },
  B: { r: 0.58, color: '#f2a07a', name: t('Boron', 'बोरॉन', 'ಬೋರಾನ್') },
  P: { r: 0.7, color: '#f29a2e', name: t('Phosphorus', 'फॉस्फोरस', 'ರಂಜಕ') },
  S: { r: 0.7, color: '#e8d23a', name: t('Sulphur', 'सल्फर', 'ಗಂಧಕ') },
  Na: { r: 0.62, color: '#9b5de0', name: t('Sodium ion', 'सोडियम आयन', 'ಸೋಡಿಯಂ ಅಯಾನು') },
};

const tet = 0.629; // CH4 hydrogens at (±a, ±a, ±a)
const ring = (n, r, z = 0, phase = 0) => Array.from({ length: n }, (_, k) => [r * Math.cos(phase + (2 * Math.PI * k) / n), r * Math.sin(phase + (2 * Math.PI * k) / n), z]);

/** [id, name, info, atoms [[el, x, y, z]], bonds [[i, j, order]], keywords] */
const MOLECULES = [
  ['h2', t('Hydrogen (H₂)', 'हाइड्रोजन (H₂)', 'ಹೈಡ್ರೋಜನ್ (H₂)'), t('Two hydrogen atoms share one pair of electrons: a single covalent bond.', 'दो हाइड्रोजन परमाणु इलेक्ट्रॉनों का एक युग्म साझा करते हैं: एकल सहसंयोजक बंध।', 'ಎರಡು ಹೈಡ್ರೋಜನ್ ಪರಮಾಣುಗಳು ಒಂದು ಜೋಡಿ ಎಲೆಕ್ಟ್ರಾನ್ ಹಂಚಿಕೊಳ್ಳುತ್ತವೆ: ಏಕ ಸಹವೇಲೆನ್ಸೀಯ ಬಂಧ.'),
    [['H', -0.37, 0, 0], ['H', 0.37, 0, 0]], [[0, 1, 1]]],
  ['o2', t('Oxygen (O₂)', 'ऑक्सीजन (O₂)', 'ಆಮ್ಲಜನಕ (O₂)'), t('A double bond: two shared pairs of electrons.', 'द्विबंध: इलेक्ट्रॉनों के दो साझा युग्म।', 'ದ್ವಿಬಂಧ: ಎರಡು ಹಂಚಿಕೊಂಡ ಎಲೆಕ್ಟ್ರಾನ್ ಜೋಡಿಗಳು.'),
    [['O', -0.6, 0, 0], ['O', 0.6, 0, 0]], [[0, 1, 2]]],
  ['n2', t('Nitrogen (N₂)', 'नाइट्रोजन (N₂)', 'ನೈಟ್ರೋಜನ್ (N₂)'), t('A triple bond: three shared pairs, one of the strongest bonds.', 'त्रिबंध: तीन साझा युग्म, सबसे मज़बूत बंधों में से एक।', 'ತ್ರಿಬಂಧ: ಮೂರು ಹಂಚಿಕೊಂಡ ಜೋಡಿಗಳು, ಅತಿ ಬಲವಾದ ಬಂಧಗಳಲ್ಲೊಂದು.'),
    [['N', -0.55, 0, 0], ['N', 0.55, 0, 0]], [[0, 1, 3]]],
  ['hcl', t('Hydrogen chloride (HCl)', 'हाइड्रोजन क्लोराइड (HCl)', 'ಹೈಡ್ರೋಜನ್ ಕ್ಲೋರೈಡ್ (HCl)'), t('A single bond between hydrogen and chlorine. In water it forms hydrochloric acid.', 'हाइड्रोजन और क्लोरीन के बीच एकल बंध। पानी में यह हाइड्रोक्लोरिक अम्ल बनाता है।', 'ಹೈಡ್ರೋಜನ್ ಮತ್ತು ಕ್ಲೋರಿನ್ ನಡುವೆ ಏಕ ಬಂಧ. ನೀರಿನಲ್ಲಿ ಹೈಡ್ರೋಕ್ಲೋರಿಕ್ ಆಮ್ಲ ಆಗುತ್ತದೆ.'),
    [['H', -0.64, 0, 0], ['Cl', 0.64, 0, 0]], [[0, 1, 1]]],
  ['h2o', t('Water (H₂O)', 'पानी (H₂O)', 'ನೀರು (H₂O)'), t('Bent shape; the H–O–H angle is 104.5°, pushed in by oxygen\'s two lone pairs.', 'मुड़ी हुई आकृति; H–O–H कोण 104.5° है, ऑक्सीजन के दो एकाकी युग्म इसे अंदर दबाते हैं।', 'ಬಾಗಿದ ಆಕಾರ; H–O–H ಕೋನ 104.5°, ಆಮ್ಲಜನಕದ ಎರಡು ಏಕಾಂಗಿ ಜೋಡಿಗಳು ಅದನ್ನು ಒಳಗೆ ಒತ್ತುತ್ತವೆ.'),
    [['O', 0, -0.2, 0], ['H', 0.757, 0.386, 0], ['H', -0.757, 0.386, 0]], [[0, 1, 1], [0, 2, 1]]],
  ['nh3', t('Ammonia (NH₃)', 'अमोनिया (NH₃)', 'ಅಮೋನಿಯಾ (NH₃)'), t('Pyramid shape: three hydrogens below the nitrogen; H–N–H angle 107°.', 'पिरामिड आकृति: नाइट्रोजन के नीचे तीन हाइड्रोजन; H–N–H कोण 107°।', 'ಪಿರಮಿಡ್ ಆಕಾರ: ನೈಟ್ರೋಜನ್ ಕೆಳಗೆ ಮೂರು ಹೈಡ್ರೋಜನ್; H–N–H ಕೋನ 107°.'),
    [['N', 0, 0.12, 0], ['H', 0, -0.26, 0.94], ['H', 0.812, -0.26, -0.469], ['H', -0.812, -0.26, -0.469]], [[0, 1, 1], [0, 2, 1], [0, 3, 1]]],
  ['ch4', t('Methane (CH₄)', 'मेथेन (CH₄)', 'ಮೀಥೇನ್ (CH₄)'), t('Tetrahedral: four C–H bonds as far apart as possible, 109.5° from each other.', 'चतुष्फलकीय: चार C–H बंध एक-दूसरे से यथासंभव दूर, आपस में 109.5° पर।', 'ಚತುಷ್ಫಲಕೀಯ: ನಾಲ್ಕು C–H ಬಂಧಗಳು ಸಾಧ್ಯವಾದಷ್ಟು ದೂರ, ಪರಸ್ಪರ 109.5°.'),
    [['C', 0, 0, 0], ['H', tet, tet, tet], ['H', -tet, -tet, tet], ['H', -tet, tet, -tet], ['H', tet, -tet, -tet]], [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]]],
  ['co2', t('Carbon dioxide (CO₂)', 'कार्बन डाइऑक्साइड (CO₂)', 'ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ (CO₂)'), t('Linear, 180°: carbon forms a double bond with each oxygen.', 'रेखीय, 180°: कार्बन हर ऑक्सीजन के साथ द्विबंध बनाता है।', 'ರೇಖೀಯ, 180°: ಕಾರ್ಬನ್ ಪ್ರತಿ ಆಮ್ಲಜನಕದೊಂದಿಗೆ ದ್ವಿಬಂಧ ರೂಪಿಸುತ್ತದೆ.'),
    [['C', 0, 0, 0], ['O', 1.16, 0, 0], ['O', -1.16, 0, 0]], [[0, 1, 2], [0, 2, 2]]],
  ['c2h6', t('Ethane (C₂H₆)', 'एथेन (C₂H₆)', 'ಈಥೇನ್ (C₂H₆)'), t('Two carbons joined by a single bond, each with three hydrogens: a saturated hydrocarbon.', 'एकल बंध से जुड़े दो कार्बन, हर एक पर तीन हाइड्रोजन: संतृप्त हाइड्रोकार्बन।', 'ಏಕ ಬಂಧದಿಂದ ಸೇರಿದ ಎರಡು ಕಾರ್ಬನ್‌ಗಳು, ಪ್ರತಿಯೊಂದಕ್ಕೂ ಮೂರು ಹೈಡ್ರೋಜನ್: ಸಂತೃಪ್ತ ಹೈಡ್ರೋಕಾರ್ಬನ್.'),
    [['C', -0.765, 0, 0], ['C', 0.765, 0, 0],
      ...ring(3, 1.03, 0, 0).map(([y, z]) => ['H', -1.16, y, z]), ...ring(3, 1.03, 0, Math.PI / 3).map(([y, z]) => ['H', 1.16, y, z])],
    [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [1, 5, 1], [1, 6, 1], [1, 7, 1]]],
  ['c2h4', t('Ethene (C₂H₄)', 'एथीन (C₂H₄)', 'ಈಥೀನ್ (C₂H₄)'), t('A carbon–carbon double bond: an unsaturated hydrocarbon. All six atoms lie flat in one plane.', 'कार्बन–कार्बन द्विबंध: असंतृप्त हाइड्रोकार्बन। सभी छह परमाणु एक समतल में होते हैं।', 'ಕಾರ್ಬನ್–ಕಾರ್ಬನ್ ದ್ವಿಬಂಧ: ಅಸಂತೃಪ್ತ ಹೈಡ್ರೋಕಾರ್ಬನ್. ಎಲ್ಲಾ ಆರು ಪರಮಾಣುಗಳು ಒಂದೇ ಸಮತಲದಲ್ಲಿವೆ.'),
    [['C', -0.665, 0, 0], ['C', 0.665, 0, 0], ['H', -1.23, 0.92, 0], ['H', -1.23, -0.92, 0], ['H', 1.23, 0.92, 0], ['H', 1.23, -0.92, 0]],
    [[0, 1, 2], [0, 2, 1], [0, 3, 1], [1, 4, 1], [1, 5, 1]]],
  ['c2h2', t('Ethyne (C₂H₂)', 'एथाइन (C₂H₂)', 'ಈಥೈನ್ (C₂H₂)'), t('A carbon–carbon triple bond; the molecule is a straight line. It is burnt in welding torches.', 'कार्बन–कार्बन त्रिबंध; अणु एक सीधी रेखा है। वेल्डिंग में इसे जलाया जाता है।', 'ಕಾರ್ಬನ್–ಕಾರ್ಬನ್ ತ್ರಿಬಂಧ; ಅಣು ನೇರ ರೇಖೆ. ವೆಲ್ಡಿಂಗ್‌ನಲ್ಲಿ ಇದನ್ನು ಉರಿಸಲಾಗುತ್ತದೆ.'),
    [['C', -0.6, 0, 0], ['C', 0.6, 0, 0], ['H', -1.66, 0, 0], ['H', 1.66, 0, 0]], [[0, 1, 3], [0, 2, 1], [1, 3, 1]]],
  ['c6h6', t('Benzene (C₆H₆)', 'बेंज़ीन (C₆H₆)', 'ಬೆಂಜೀನ್ (C₆H₆)'), t('A flat ring of six carbons with alternating single and double bonds, each carbon with one hydrogen.', 'छह कार्बनों का समतल वलय जिसमें एकल और द्विबंध बारी-बारी से होते हैं; हर कार्बन पर एक हाइड्रोजन।', 'ಏಕ ಮತ್ತು ದ್ವಿಬಂಧಗಳು ಪರ್ಯಾಯವಾಗಿರುವ ಆರು ಕಾರ್ಬನ್‌ಗಳ ಸಮತಲ ಉಂಗುರ; ಪ್ರತಿ ಕಾರ್ಬನ್‌ಗೆ ಒಂದು ಹೈಡ್ರೋಜನ್.'),
    [...ring(6, 1.39).map((p) => ['C', ...p]), ...ring(6, 2.48).map((p) => ['H', ...p])],
    [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1], [0, 6, 1], [1, 7, 1], [2, 8, 1], [3, 9, 1], [4, 10, 1], [5, 11, 1]]],
  ['bf3', t('Boron trifluoride (BF₃)', 'बोरॉन ट्राइफ्लोराइड (BF₃)', 'ಬೋರಾನ್ ಟ್ರೈಫ್ಲೋರೈಡ್ (BF₃)'), t('Trigonal planar: three bonds in one plane, 120° apart.', 'त्रिकोणीय समतलीय: एक समतल में तीन बंध, 120° के अंतर पर।', 'ತ್ರಿಕೋನೀಯ ಸಮತಲ: ಒಂದೇ ಸಮತಲದಲ್ಲಿ 120° ಅಂತರದಲ್ಲಿ ಮೂರು ಬಂಧಗಳು.'),
    [['B', 0, 0, 0], ...ring(3, 1.31, 0, Math.PI / 2).map((p) => ['F', ...p])], [[0, 1, 1], [0, 2, 1], [0, 3, 1]]],
  ['pcl5', t('Phosphorus pentachloride (PCl₅)', 'फॉस्फोरस पेंटाक्लोराइड (PCl₅)', 'ಫಾಸ್ಫರಸ್ ಪೆಂಟಾಕ್ಲೋರೈಡ್ (PCl₅)'), t('Trigonal bipyramidal: three chlorines around the middle at 120°, two above and below at 90°.', 'त्रिकोणीय द्विपिरामिडी: बीच में 120° पर तीन क्लोरीन, ऊपर-नीचे 90° पर दो।', 'ತ್ರಿಕೋನೀಯ ದ್ವಿಪಿರಮಿಡ್: ಮಧ್ಯದಲ್ಲಿ 120° ನಲ್ಲಿ ಮೂರು ಕ್ಲೋರಿನ್, ಮೇಲೆ-ಕೆಳಗೆ 90° ನಲ್ಲಿ ಎರಡು.'),
    [['P', 0, 0, 0], ...ring(3, 2.02).map(([x, y]) => ['Cl', x, 0, y]), ['Cl', 0, 2.14, 0], ['Cl', 0, -2.14, 0]], [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [0, 5, 1]]],
  ['sf6', t('Sulphur hexafluoride (SF₆)', 'सल्फर हेक्साफ्लोराइड (SF₆)', 'ಸಲ್ಫರ್ ಹೆಕ್ಸಾಫ್ಲೋರೈಡ್ (SF₆)'), t('Octahedral: six bonds at right angles (90°) to each other.', 'अष्टफलकीय: छह बंध एक-दूसरे से समकोण (90°) पर।', 'ಅಷ್ಟಫಲಕೀಯ: ಆರು ಬಂಧಗಳು ಪರಸ್ಪರ ಲಂಬ ಕೋನದಲ್ಲಿ (90°).'),
    [['S', 0, 0, 0], ['F', 1.56, 0, 0], ['F', -1.56, 0, 0], ['F', 0, 1.56, 0], ['F', 0, -1.56, 0], ['F', 0, 0, 1.56], ['F', 0, 0, -1.56]], [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [0, 5, 1], [0, 6, 1]]],
];

// A small salt crystal: sodium and chloride ions alternating in a cube.
{
  const n = 3, d = 2.82;
  const atoms = [], bonds = [], idx = new Map();
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    idx.set(`${i},${j},${k}`, atoms.length);
    atoms.push([(i + j + k) % 2 ? 'Cl' : 'Na', (i - 1) * d, (j - 1) * d, (k - 1) * d]);
  }
  for (const [key, a] of idx) {
    const [i, j, k] = key.split(',').map(Number);
    for (const [di, dj, dk] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      const b = idx.get(`${i + di},${j + dj},${k + dk}`);
      if (b !== undefined) bonds.push([a, b, 0]);
    }
  }
  MOLECULES.push(['nacl', t('Salt crystal (NaCl)', 'नमक का क्रिस्टल (NaCl)', 'ಉಪ್ಪಿನ ಹರಳು (NaCl)'), t('Not molecules but a lattice: each sodium ion (Na⁺) is surrounded by six chloride ions (Cl⁻) and each chloride by six sodium ions, held by ionic bonds.', 'अणु नहीं बल्कि एक जालक: हर सोडियम आयन (Na⁺) छह क्लोराइड आयनों (Cl⁻) से घिरा है और हर क्लोराइड छह सोडियम आयनों से, आयनिक बंधों द्वारा।', 'ಅಣುಗಳಲ್ಲ, ಜಾಲಕ: ಪ್ರತಿ ಸೋಡಿಯಂ ಅಯಾನು (Na⁺) ಆರು ಕ್ಲೋರೈಡ್ ಅಯಾನುಗಳಿಂದ (Cl⁻) ಸುತ್ತುವರಿದಿದೆ, ಅಯಾನಿಕ ಬಂಧಗಳಿಂದ.'), atoms, bonds]);
}

const bondNames = {
  1: t('Single bonds', 'एकल बंध', 'ಏಕ ಬಂಧಗಳು'),
  2: t('Double bonds', 'द्विबंध', 'ದ್ವಿಬಂಧಗಳು'),
  3: t('Triple bond', 'त्रिबंध', 'ತ್ರಿಬಂಧ'),
  0: t('Ionic attraction', 'आयनिक आकर्षण', 'ಅಯಾನಿಕ ಆಕರ್ಷಣೆ'),
};
const bondInfo = {
  1: t('One pair of shared electrons.', 'इलेक्ट्रॉनों का एक साझा युग्म।', 'ಒಂದು ಹಂಚಿಕೊಂಡ ಎಲೆಕ್ಟ್ರಾನ್ ಜೋಡಿ.'),
  2: t('Two pairs of shared electrons: shorter and stronger than a single bond.', 'इलेक्ट्रॉनों के दो साझा युग्म: एकल बंध से छोटा और मज़बूत।', 'ಎರಡು ಹಂಚಿಕೊಂಡ ಎಲೆಕ್ಟ್ರಾನ್ ಜೋಡಿಗಳು: ಏಕ ಬಂಧಕ್ಕಿಂತ ಚಿಕ್ಕದು ಮತ್ತು ಬಲವಾದದ್ದು.'),
  3: t('Three pairs of shared electrons: the shortest and strongest.', 'इलेक्ट्रॉनों के तीन साझा युग्म: सबसे छोटा और मज़बूत।', 'ಮೂರು ಹಂಚಿಕೊಂಡ ಎಲೆಕ್ಟ್ರಾನ್ ಜೋಡಿಗಳು: ಅತಿ ಚಿಕ್ಕದು ಮತ್ತು ಬಲವಾದದ್ದು.'),
  0: t('Opposite charges attract; no electrons are shared.', 'विपरीत आवेश आकर्षित होते हैं; कोई इलेक्ट्रॉन साझा नहीं होता।', 'ವಿರುದ್ಧ ಆವೇಶಗಳು ಆಕರ್ಷಿಸುತ್ತವೆ; ಎಲೆಕ್ಟ್ರಾನ್ ಹಂಚಿಕೆ ಇಲ್ಲ.'),
};

export default {
  id: 'molecules',
  version: 1,
  order: 2,
  source: 'procedural',
  subject: 'Chemistry',
  classes: [9, 10, 11],
  title: t('Molecules and their shapes', 'अणु और उनकी आकृतियाँ', 'ಅಣುಗಳು ಮತ್ತು ಅವುಗಳ ಆಕಾರಗಳು'),
  summary: t(
    'Ball-and-stick models: atoms as balls, bonds as sticks, at their real angles. Turn them to see why water is bent and methane is a tetrahedron.',
    'गेंद-छड़ी मॉडल: परमाणु गेंद, बंध छड़ें, अपने असली कोणों पर। घुमाकर देखें कि पानी मुड़ा क्यों है और मेथेन चतुष्फलक क्यों।',
    'ಚೆಂಡು-ಕಡ್ಡಿ ಮಾದರಿಗಳು: ಪರಮಾಣುಗಳು ಚೆಂಡುಗಳು, ಬಂಧಗಳು ಕಡ್ಡಿಗಳು, ನೈಜ ಕೋನಗಳಲ್ಲಿ. ತಿರುಗಿಸಿ ನೀರು ಏಕೆ ಬಾಗಿದೆ, ಮೀಥೇನ್ ಏಕೆ ಚತುಷ್ಫಲಕ ಎಂದು ನೋಡಿ.',
  ),
  keywords: ['molecule', 'molecules', 'chemical bonding', 'covalent bond', 'ionic bond', 'molecular shape', 'vsepr', 'methane', 'water', 'benzene', 'carbon and its compounds', 'hydrocarbon', 'ethene', 'ethyne', 'sodium chloride'],
  credit: 'Model built by KINETIX',
  thumb: 'c6h6', // the library picture shows benzene
  variants: MOLECULES.map(([id, name]) => ({ id, name })),
  groups: [
    { id: 'atoms', name: t('Atoms', 'परमाणु', 'ಪರಮಾಣುಗಳು') },
    { id: 'bonds', name: t('Bonds', 'बंध', 'ಬಂಧಗಳು') },
  ],
  build(THREE) {
    const out = {};
    for (const [id, , , atoms, bonds] of MOLECULES) {
      for (const [el, x, y, z] of atoms) (out[`${id}_${el}`] ??= []).push(blob(THREE, [x * S, y * S, z * S], ELEMENT[el].r * S * 0.62, ELEMENT[el].r * S * 0.62, ELEMENT[el].r * S * 0.62, 4));
      for (const [i, j, order] of bonds) {
        const a = new THREE.Vector3(...atoms[i].slice(1)).multiplyScalar(S), b = new THREE.Vector3(...atoms[j].slice(1)).multiplyScalar(S);
        const dir = b.clone().sub(a).normalize();
        const side = Math.abs(dir.z) < 0.9 ? new THREE.Vector3(0, 0, 1).cross(dir).normalize() : new THREE.Vector3(1, 0, 0).cross(dir).normalize();
        const n = Math.max(1, order);
        for (let k = 0; k < n; k++) {
          const off = side.clone().multiplyScalar((k - (n - 1) / 2) * S * 0.2);
          const g = rod(THREE, a.clone().add(off).toArray(), b.clone().add(off).toArray(), order === 0 ? S * 0.035 : S * 0.075, 12);
          (out[`${id}_bonds${order}`] ??= []).push(g);
        }
      }
    }
    return out;
  },
  get parts() {
    const list = [];
    for (const [id, name, info, atoms, bonds] of MOLECULES) {
      const counts = {};
      for (const [el] of atoms) counts[el] = (counts[el] || 0) + 1;
      for (const [el, n] of Object.entries(counts)) {
        const e = ELEMENT[el];
        list.push({
          id: `${id}_${el}`, variant: id, group: 'atoms', color: e.color,
          name: n > 1 ? t(`${e.name.en} atoms (${n})`, `${e.name.hi} परमाणु (${n})`, `${e.name.kn} ಪರಮಾಣುಗಳು (${n})`) : t(`${e.name.en} atom`, `${e.name.hi} परमाणु`, `${e.name.kn} ಪರಮಾಣು`),
          info: t(`${name.en}. ${info.en}`, `${name.hi}। ${info.hi}`, `${name.kn}. ${info.kn}`),
        });
      }
      for (const order of new Set(bonds.map((b) => b[2]))) {
        list.push({
          id: `${id}_bonds${order}`, variant: id, group: 'bonds', color: order === 0 ? '#c9c9c9' : '#b8bec6', minor: order === 1,
          name: bondNames[order], info: bondInfo[order],
        });
      }
    }
    return list;
  },
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.35, 0.3, 1] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0.2, 0.2] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.1] },
  ],
  slices: [],
  animations: [],
};
