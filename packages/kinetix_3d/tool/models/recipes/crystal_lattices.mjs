// Cubic unit cells, built in code: simple cubic, body-centred cubic,
// face-centred cubic and rock salt (NaCl). Atoms are drawn small (not
// touching) so that the inside of the cell can be seen.
import { blob, rod } from '../lib/shapes.mjs';
import { t } from '../lib/teaching.mjs';

const A = 0.08; // the edge of the unit cell
const h = A / 2;
const R = 0.0085; // an atom
const still = [0, 0, 0];

const corners = [];
for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) corners.push([x, y, z]);
const faces = [[h, 0, 0], [-h, 0, 0], [0, h, 0], [0, -h, 0], [0, 0, h], [0, 0, -h]];
const edgeMiddles = [];
for (const a of [-h, h]) for (const b of [-h, h]) edgeMiddles.push([0, a, b], [a, 0, b], [a, b, 0]);
const edges = [];
for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
  const d = corners[i].reduce((s, v, k) => s + (v !== corners[j][k] ? 1 : 0), 0);
  if (d === 1) edges.push([corners[i], corners[j]]);
}

const cellEdges = (THREE) => edges.map(([a, b]) => rod(THREE, a, b, 0.0006, 8));
const balls = (THREE, points, r) => points.map((p) => blob(THREE, p, r, r, r, 3));

const KINDS = [
  ['sc', t('Simple cubic', 'सरल घनीय', 'ಸರಳ ಘನೀಯ'), t('1 atom per cell · coordination number 6 · 52.4% of space filled', 'प्रति कोष्ठिका 1 परमाणु · उपसहसंयोजन संख्या 6 · 52.4% स्थान भरा', 'ಪ್ರತಿ ಕೋಶಕ್ಕೆ 1 ಪರಮಾಣು · ಸಮನ್ವಯ ಸಂಖ್ಯೆ 6 · 52.4% ಜಾಗ ತುಂಬಿದೆ')],
  ['bcc', t('Body-centred cubic', 'अंतःकेंद्रित घनीय', 'ಕಾಯ ಕೇಂದ್ರಿತ ಘನೀಯ'), t('2 atoms per cell · coordination number 8 · 68% of space filled', 'प्रति कोष्ठिका 2 परमाणु · उपसहसंयोजन संख्या 8 · 68% स्थान भरा', 'ಪ್ರತಿ ಕೋಶಕ್ಕೆ 2 ಪರಮಾಣು · ಸಮನ್ವಯ ಸಂಖ್ಯೆ 8 · 68% ಜಾಗ ತುಂಬಿದೆ')],
  ['fcc', t('Face-centred cubic', 'फलक-केंद्रित घनीय', 'ಮುಖ ಕೇಂದ್ರಿತ ಘನೀಯ'), t('4 atoms per cell · coordination number 12 · 74% of space filled (cubic close packing)', 'प्रति कोष्ठिका 4 परमाणु · उपसहसंयोजन संख्या 12 · 74% स्थान भरा (घनीय निविड संकुलन)', 'ಪ್ರತಿ ಕೋಶಕ್ಕೆ 4 ಪರಮಾಣು · ಸಮನ್ವಯ ಸಂಖ್ಯೆ 12 · 74% ಜಾಗ ತುಂಬಿದೆ (ಘನೀಯ ನಿಬಿಡ ಸಂಕುಲನ)')],
  ['nacl', t('Rock salt (NaCl)', 'सेंधा नमक (NaCl)', 'ಕಲ್ಲುಪ್ಪು (NaCl)'), t('4 Na⁺ and 4 Cl⁻ per cell · coordination 6 : 6', 'प्रति कोष्ठिका 4 Na⁺ और 4 Cl⁻ · उपसहसंयोजन 6 : 6', 'ಪ್ರತಿ ಕೋಶಕ್ಕೆ 4 Na⁺ ಮತ್ತು 4 Cl⁻ · ಸಮನ್ವಯ 6 : 6')],
];

const cornerInfo = t(
  'An atom at each of the 8 corners. Each corner is shared by 8 unit cells, so the corners give 8 × ⅛ = 1 atom to this cell.',
  '8 कोनों में से हर एक पर एक परमाणु। हर कोना 8 एकक कोष्ठिकाओं में साझा होता है, इसलिए कोने इस कोष्ठिका को 8 × ⅛ = 1 परमाणु देते हैं।',
  '8 ಮೂಲೆಗಳಲ್ಲಿ ಪ್ರತಿಯೊಂದರಲ್ಲೂ ಒಂದು ಪರಮಾಣು. ಪ್ರತಿ ಮೂಲೆಯನ್ನು 8 ಏಕಕ ಕೋಶಗಳು ಹಂಚಿಕೊಳ್ಳುತ್ತವೆ, ಹಾಗಾಗಿ ಮೂಲೆಗಳು ಈ ಕೋಶಕ್ಕೆ 8 × ⅛ = 1 ಪರಮಾಣು ನೀಡುತ್ತವೆ.',
);
const edgeInfo = t(
  'The edges of the unit cell, the smallest repeating unit of the crystal. Repeated in all three directions it builds the whole lattice. All edges are equal (a) and meet at 90°.',
  'एकक कोष्ठिका के किनारे, क्रिस्टल की सबसे छोटी दोहराई जाने वाली इकाई। तीनों दिशाओं में दोहराने पर पूरा जालक बनता है। सभी किनारे बराबर (a) हैं और 90° पर मिलते हैं।',
  'ಏಕಕ ಕೋಶದ ಅಂಚುಗಳು, ಹರಳಿನ ಅತಿ ಚಿಕ್ಕ ಪುನರಾವರ್ತಿಸುವ ಘಟಕ. ಮೂರೂ ದಿಕ್ಕುಗಳಲ್ಲಿ ಪುನರಾವರ್ತಿಸಿದರೆ ಇಡೀ ಜಾಲಕ ಆಗುತ್ತದೆ. ಎಲ್ಲಾ ಅಂಚುಗಳು ಸಮ (a) ಮತ್ತು 90° ನಲ್ಲಿ ಸೇರುತ್ತವೆ.',
);

export default {
  id: 'crystal_lattices',
  version: 1,
  order: 5,
  source: 'procedural',
  subject: 'Chemistry',
  classes: [12],
  title: t('Cubic crystal lattices', 'घनीय क्रिस्टल जालक', 'ಘನೀಯ ಹರಳು ಜಾಲಕಗಳು'),
  summary: t(
    'Unit cells of cubic crystals: simple cubic, body-centred, face-centred and rock salt. Count the atoms each cell really holds, and each atom\'s nearest neighbours.',
    'घनीय क्रिस्टलों की एकक कोष्ठिकाएँ: सरल घनीय, अंतःकेंद्रित, फलक-केंद्रित और सेंधा नमक। गिनें कि हर कोष्ठिका में वास्तव में कितने परमाणु हैं, और हर परमाणु के निकटतम पड़ोसी।',
    'ಘನೀಯ ಹರಳುಗಳ ಏಕಕ ಕೋಶಗಳು: ಸರಳ ಘನೀಯ, ಕಾಯ ಕೇಂದ್ರಿತ, ಮುಖ ಕೇಂದ್ರಿತ ಮತ್ತು ಕಲ್ಲುಪ್ಪು. ಪ್ರತಿ ಕೋಶದಲ್ಲಿ ನಿಜವಾಗಿ ಎಷ್ಟು ಪರಮಾಣುಗಳಿವೆ, ಪ್ರತಿ ಪರಮಾಣುವಿನ ಹತ್ತಿರದ ನೆರೆಯವು ಯಾವುವು ಎಂದು ಎಣಿಸಿ.',
  ),
  keywords: ['crystal lattice', 'unit cell', 'solid state', 'the solid state', 'simple cubic', 'body centred cubic', 'face centred cubic', 'bcc', 'fcc', 'packing efficiency', 'coordination number', 'sodium chloride', 'close packing'],
  credit: 'Model built by KINETIX',
  thumb: 'fcc',
  variants: KINDS.map(([id, name]) => ({ id, name })),
  groups: [
    { id: 'atoms', name: t('Atoms and ions', 'परमाणु और आयन', 'ಪರಮಾಣುಗಳು ಮತ್ತು ಅಯಾನುಗಳು') },
    { id: 'cell', name: t('Unit cell', 'एकक कोष्ठिका', 'ಏಕಕ ಕೋಶ') },
  ],
  build(THREE) {
    const out = {};
    for (const [id] of KINDS) out[`${id}_edges`] = cellEdges(THREE);
    out.sc_corners = balls(THREE, corners, R);
    out.bcc_corners = balls(THREE, corners, R);
    out.bcc_centre = balls(THREE, [[0, 0, 0]], R);
    out.bcc_neighbours = corners.map((p) => rod(THREE, [0, 0, 0], p, 0.0007, 8));
    out.fcc_corners = balls(THREE, corners, R);
    out.fcc_faces = balls(THREE, faces, R);
    // Rock salt: Na⁺ on the corners and face centres, Cl⁻ on the edge middles and the body centre.
    out.nacl_na = balls(THREE, [...corners, ...faces], R * 0.75);
    out.nacl_cl = balls(THREE, [...edgeMiddles, [0, 0, 0]], R * 1.25);
    out.nacl_neighbours = faces.map((p) => rod(THREE, [0, 0, 0], p, 0.0007, 8));
    return out;
  },
  get parts() {
    const list = [];
    for (const [id, name, facts] of KINDS) {
      list.push({
        id: `${id}_edges`, variant: id, group: 'cell', color: '#c9cfd6', explode: still,
        name: t(`Unit cell: ${name.en}`, `एकक कोष्ठिका: ${name.hi}`, `ಏಕಕ ಕೋಶ: ${name.kn}`),
        info: t(`${edgeInfo.en} ${facts.en}.`, `${edgeInfo.hi} ${facts.hi}।`, `${edgeInfo.kn} ${facts.kn}.`),
      });
    }
    list.push(
      { id: 'sc_corners', variant: 'sc', group: 'atoms', color: '#4f8edc', explode: still, name: t('Corner atoms', 'कोने के परमाणु', 'ಮೂಲೆಯ ಪರಮಾಣುಗಳು'), info: t(`${cornerInfo.en} Simple cubic has atoms only at the corners: 1 atom per cell, each touching 6 neighbours.`, `${cornerInfo.hi} सरल घनीय में परमाणु केवल कोनों पर होते हैं: प्रति कोष्ठिका 1 परमाणु, हर एक 6 पड़ोसियों को छूता है।`, `${cornerInfo.kn} ಸರಳ ಘನೀಯದಲ್ಲಿ ಪರಮಾಣುಗಳು ಮೂಲೆಗಳಲ್ಲಿ ಮಾತ್ರ: ಪ್ರತಿ ಕೋಶಕ್ಕೆ 1 ಪರಮಾಣು, ಪ್ರತಿಯೊಂದೂ 6 ನೆರೆಯವನ್ನು ಮುಟ್ಟುತ್ತದೆ.`) },
      { id: 'bcc_corners', variant: 'bcc', group: 'atoms', color: '#4f8edc', explode: still, name: t('Corner atoms', 'कोने के परमाणु', 'ಮೂಲೆಯ ಪರಮಾಣುಗಳು'), info: cornerInfo },
      {
        id: 'bcc_centre', variant: 'bcc', group: 'atoms', color: '#e5533d', explode: still,
        name: t('Body-centre atom', 'अंतःकेंद्र का परमाणु', 'ಕಾಯ ಕೇಂದ್ರದ ಪರಮಾಣು'),
        info: t('One atom at the centre of the cube, belonging wholly to this cell: 1 + 1 = 2 atoms per cell. Examples: iron, sodium, potassium.', 'घन के केंद्र में एक परमाणु, जो पूरी तरह इसी कोष्ठिका का है: 1 + 1 = 2 परमाणु प्रति कोष्ठिका। उदाहरण: लोहा, सोडियम, पोटैशियम।', 'ಘನದ ಕೇಂದ್ರದಲ್ಲಿ ಒಂದು ಪರಮಾಣು, ಪೂರ್ತಿಯಾಗಿ ಈ ಕೋಶಕ್ಕೆ ಸೇರಿದೆ: 1 + 1 = 2 ಪರಮಾಣು ಪ್ರತಿ ಕೋಶಕ್ಕೆ. ಉದಾಹರಣೆ: ಕಬ್ಬಿಣ, ಸೋಡಿಯಂ, ಪೊಟ್ಯಾಸಿಯಂ.'),
      },
      {
        id: 'bcc_neighbours', variant: 'bcc', group: 'cell', color: '#f2b33d', hidden: true, glow: 0.3, explode: still,
        name: t('8 nearest neighbours', '8 निकटतम पड़ोसी', '8 ಹತ್ತಿರದ ನೆರೆಯವು'),
        info: t('The centre atom touches the 8 corner atoms along the body diagonals: coordination number 8.', 'केंद्र का परमाणु काय विकर्णों पर 8 कोने के परमाणुओं को छूता है: उपसहसंयोजन संख्या 8।', 'ಕೇಂದ್ರದ ಪರಮಾಣು ಕಾಯ ಕರ್ಣಗಳ ಉದ್ದಕ್ಕೂ 8 ಮೂಲೆಯ ಪರಮಾಣುಗಳನ್ನು ಮುಟ್ಟುತ್ತದೆ: ಸಮನ್ವಯ ಸಂಖ್ಯೆ 8.'),
      },
      { id: 'fcc_corners', variant: 'fcc', group: 'atoms', color: '#4f8edc', explode: still, name: t('Corner atoms', 'कोने के परमाणु', 'ಮೂಲೆಯ ಪರಮಾಣುಗಳು'), info: cornerInfo },
      {
        id: 'fcc_faces', variant: 'fcc', group: 'atoms', color: '#3fb56a', explode: still,
        name: t('Face-centre atoms', 'फलक-केंद्र के परमाणु', 'ಮುಖ ಕೇಂದ್ರದ ಪರಮಾಣುಗಳು'),
        info: t('An atom at the centre of each of the 6 faces, each shared by 2 cells: 6 × ½ = 3, so 1 + 3 = 4 atoms per cell. Examples: copper, silver, gold, aluminium.', '6 फलकों में से हर एक के केंद्र पर एक परमाणु, हर एक 2 कोष्ठिकाओं में साझा: 6 × ½ = 3, इसलिए 1 + 3 = 4 परमाणु प्रति कोष्ठिका। उदाहरण: ताँबा, चाँदी, सोना, एल्युमिनियम।', '6 ಮುಖಗಳಲ್ಲಿ ಪ್ರತಿಯೊಂದರ ಕೇಂದ್ರದಲ್ಲಿ ಒಂದು ಪರಮಾಣು, ಪ್ರತಿಯೊಂದನ್ನು 2 ಕೋಶಗಳು ಹಂಚಿಕೊಳ್ಳುತ್ತವೆ: 6 × ½ = 3, ಹಾಗಾಗಿ 1 + 3 = 4 ಪರಮಾಣು ಪ್ರತಿ ಕೋಶಕ್ಕೆ. ಉದಾಹರಣೆ: ತಾಮ್ರ, ಬೆಳ್ಳಿ, ಚಿನ್ನ, ಅಲ್ಯೂಮಿನಿಯಂ.'),
      },
      {
        id: 'nacl_na', variant: 'nacl', group: 'atoms', color: '#9b5de0', explode: still,
        name: t('Sodium ions (Na⁺)', 'सोडियम आयन (Na⁺)', 'ಸೋಡಿಯಂ ಅಯಾನುಗಳು (Na⁺)'),
        info: t('The smaller Na⁺ ions sit on the corners and face centres, an fcc pattern: 8 × ⅛ + 6 × ½ = 4 per cell.', 'छोटे Na⁺ आयन कोनों और फलक-केंद्रों पर होते हैं, fcc प्रतिरूप: 8 × ⅛ + 6 × ½ = 4 प्रति कोष्ठिका।', 'ಚಿಕ್ಕ Na⁺ ಅಯಾನುಗಳು ಮೂಲೆಗಳು ಮತ್ತು ಮುಖ ಕೇಂದ್ರಗಳಲ್ಲಿವೆ, fcc ವಿನ್ಯಾಸ: 8 × ⅛ + 6 × ½ = 4 ಪ್ರತಿ ಕೋಶಕ್ಕೆ.'),
      },
      {
        id: 'nacl_cl', variant: 'nacl', group: 'atoms', color: '#3fc25a', explode: still,
        name: t('Chloride ions (Cl⁻)', 'क्लोराइड आयन (Cl⁻)', 'ಕ್ಲೋರೈಡ್ ಅಯಾನುಗಳು (Cl⁻)'),
        info: t('The larger Cl⁻ ions sit at the middle of each edge and at the body centre: 12 × ¼ + 1 = 4 per cell, so the formula is NaCl.', 'बड़े Cl⁻ आयन हर किनारे के बीच और अंतःकेंद्र पर होते हैं: 12 × ¼ + 1 = 4 प्रति कोष्ठिका, इसलिए सूत्र NaCl है।', 'ದೊಡ್ಡ Cl⁻ ಅಯಾನುಗಳು ಪ್ರತಿ ಅಂಚಿನ ಮಧ್ಯದಲ್ಲಿ ಮತ್ತು ಕಾಯ ಕೇಂದ್ರದಲ್ಲಿವೆ: 12 × ¼ + 1 = 4 ಪ್ರತಿ ಕೋಶಕ್ಕೆ, ಹಾಗಾಗಿ ಸೂತ್ರ NaCl.'),
      },
      {
        id: 'nacl_neighbours', variant: 'nacl', group: 'cell', color: '#f2b33d', hidden: true, glow: 0.3, explode: still,
        name: t('6 nearest neighbours', '6 निकटतम पड़ोसी', '6 ಹತ್ತಿರದ ನೆರೆಯವು'),
        info: t('The Cl⁻ ion at the centre is surrounded by 6 Na⁺ ions at the corners of an octahedron (and each Na⁺ by 6 Cl⁻): coordination 6 : 6.', 'केंद्र का Cl⁻ आयन अष्टफलक के कोनों पर 6 Na⁺ आयनों से घिरा है (और हर Na⁺, 6 Cl⁻ से): उपसहसंयोजन 6 : 6।', 'ಕೇಂದ್ರದ Cl⁻ ಅಯಾನು ಅಷ್ಟಫಲಕದ ಮೂಲೆಗಳಲ್ಲಿರುವ 6 Na⁺ ಅಯಾನುಗಳಿಂದ ಸುತ್ತುವರಿದಿದೆ (ಪ್ರತಿ Na⁺ 6 Cl⁻ ನಿಂದ): ಸಮನ್ವಯ 6 : 6.'),
      },
    );
    return list;
  },
  views: [
    { id: 'corner', name: t('Corner view', 'कोने से', 'ಮೂಲೆಯಿಂದ'), dir: [0.7, 0.5, 1] },
    { id: 'face', name: t('Face on', 'फलक के सामने से', 'ಮುಖದ ಎದುರಿನಿಂದ'), dir: [0, 0, 1] },
    { id: 'diagonal', name: t('Down a body diagonal', 'काय विकर्ण की दिशा से', 'ಕಾಯ ಕರ್ಣದ ದಿಕ್ಕಿನಿಂದ'), dir: [1, 1, 1] },
  ],
  slices: [{ id: 'middle', name: t('Through the middle', 'बीच से', 'ಮಧ್ಯದ ಮೂಲಕ'), normal: [0, 0, -1], offset: 0, view: 'face' }],
  animations: [],
};
