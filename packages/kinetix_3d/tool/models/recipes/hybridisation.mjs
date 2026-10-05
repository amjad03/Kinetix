// Hybridisation: s, p and d orbitals of a central atom mixed into equal
// hybrid orbitals, built in code. Each hybrid is a big lobe and a small
// back lobe along its direction; the angles between them are the shapes
// of VSEPR (linear, trigonal planar, tetrahedral, trigonal bipyramidal,
// octahedral).
import { blob } from '../lib/shapes.mjs';
import { t, polarLobes, arcPoints, wire } from '../lib/teaching.mjs';

const R = 0.05; // the length of a hybrid's big lobe
const ARC = 0.022; // radius of the bond-angle arcs
const POS = '#e5533d', NEG = '#3d7be5';

const c = Math.cos, s = Math.sin, deg = Math.PI / 180;
const tetra = 109.47 * deg;
const around = (a) => [c(a), 0, s(a)];

/** [id, name, directions, unhybridised p axes, angle arcs [from, to, via?, name], info, keywords] */
const KINDS = [
  [
    'sp', 'sp',
    [[1, 0, 0], [-1, 0, 0]],
    [[0, 1, 0], [0, 0, 1]],
    [[[1, 0, 0], [-1, 0, 0], [0, 0, 1], '180°']],
    t(
      'One s and one p orbital mix into two sp hybrid orbitals pointing opposite ways, 180° apart: a linear shape (50% s character). Two p orbitals are left over for π bonds. Examples: BeCl₂, CO₂, each carbon in ethyne (C₂H₂).',
      'एक s और एक p कक्षक मिलकर दो sp संकर कक्षक बनाते हैं जो विपरीत दिशाओं में, 180° पर होते हैं: रेखीय आकृति (50% s गुण)। π बंधों के लिए दो p कक्षक बचते हैं। उदाहरण: BeCl₂, CO₂, एथाइन (C₂H₂) का हर कार्बन।',
      'ಒಂದು s ಮತ್ತು ಒಂದು p ಕಕ್ಷೀಯ ಸೇರಿ ವಿರುದ್ಧ ದಿಕ್ಕುಗಳಲ್ಲಿ, 180° ಅಂತರದಲ್ಲಿ ಎರಡು sp ಸಂಕರ ಕಕ್ಷೀಯಗಳಾಗುತ್ತವೆ: ರೇಖೀಯ ಆಕಾರ (50% s ಗುಣ). π ಬಂಧಗಳಿಗೆ ಎರಡು p ಕಕ್ಷೀಯಗಳು ಉಳಿಯುತ್ತವೆ. ಉದಾಹರಣೆ: BeCl₂, CO₂, ಈಥೈನ್ (C₂H₂) ನ ಪ್ರತಿ ಕಾರ್ಬನ್.',
    ),
  ],
  [
    'sp2', 'sp²',
    [around(0), around(120 * deg), around(240 * deg)],
    [[0, 1, 0]],
    [[around(0), around(120 * deg), null, '120°']],
    t(
      'One s and two p orbitals mix into three sp² hybrids in one plane, 120° apart: trigonal planar (33% s character). The p orbital left over, above and below the plane, makes the π bond. Examples: BF₃, each carbon in ethene (C₂H₄).',
      'एक s और दो p कक्षक मिलकर एक तल में 120° पर तीन sp² संकर बनाते हैं: त्रिकोणीय समतलीय (33% s गुण)। तल के ऊपर-नीचे बचा p कक्षक π बंध बनाता है। उदाहरण: BF₃, एथीन (C₂H₄) का हर कार्बन।',
      'ಒಂದು s ಮತ್ತು ಎರಡು p ಕಕ್ಷೀಯಗಳು ಸೇರಿ ಒಂದೇ ಸಮತಲದಲ್ಲಿ 120° ಅಂತರದಲ್ಲಿ ಮೂರು sp² ಸಂಕರಗಳಾಗುತ್ತವೆ: ತ್ರಿಕೋನೀಯ ಸಮತಲ (33% s ಗುಣ). ಸಮತಲದ ಮೇಲೆ-ಕೆಳಗೆ ಉಳಿದ p ಕಕ್ಷೀಯ π ಬಂಧ ಮಾಡುತ್ತದೆ. ಉದಾಹರಣೆ: BF₃, ಈಥೀನ್ (C₂H₄) ನ ಪ್ರತಿ ಕಾರ್ಬನ್.',
    ),
  ],
  [
    'sp3', 'sp³',
    [[0, 1, 0], ...[0, 120, 240].map((a) => [s(tetra) * c(a * deg), c(tetra), s(tetra) * s(a * deg)])],
    [],
    [[[0, 1, 0], [s(tetra), c(tetra), 0], null, '109.5°']],
    t(
      'One s and three p orbitals mix into four sp³ hybrids pointing to the corners of a tetrahedron, 109.5° apart (25% s character). Examples: CH₄; in NH₃ and H₂O some hybrids hold lone pairs, which squeeze the angles to 107° and 104.5°.',
      'एक s और तीन p कक्षक मिलकर चार sp³ संकर बनाते हैं जो चतुष्फलक के कोनों की ओर, 109.5° पर होते हैं (25% s गुण)। उदाहरण: CH₄; NH₃ और H₂O में कुछ संकरों में एकाकी युग्म होते हैं, जो कोणों को 107° और 104.5° तक दबा देते हैं।',
      'ಒಂದು s ಮತ್ತು ಮೂರು p ಕಕ್ಷೀಯಗಳು ಸೇರಿ ಚತುಷ್ಫಲಕದ ಮೂಲೆಗಳತ್ತ, 109.5° ಅಂತರದಲ್ಲಿ ನಾಲ್ಕು sp³ ಸಂಕರಗಳಾಗುತ್ತವೆ (25% s ಗುಣ). ಉದಾಹರಣೆ: CH₄; NH₃ ಮತ್ತು H₂O ನಲ್ಲಿ ಕೆಲವು ಸಂಕರಗಳಲ್ಲಿ ಏಕಾಂಗಿ ಜೋಡಿಗಳಿದ್ದು ಕೋನಗಳನ್ನು 107° ಮತ್ತು 104.5° ಗೆ ಒತ್ತುತ್ತವೆ.',
    ),
  ],
  [
    'sp3d', 'sp³d',
    [[0, 1, 0], [0, -1, 0], around(0), around(120 * deg), around(240 * deg)],
    [],
    [[around(0), around(120 * deg), null, '120°'], [[0, 1, 0], around(0), null, '90°']],
    t(
      'One s, three p and one d orbital mix into five sp³d hybrids: trigonal bipyramidal. Three lie round the middle at 120°; two point up and down at 90° to them. Example: PCl₅.',
      'एक s, तीन p और एक d कक्षक मिलकर पाँच sp³d संकर बनाते हैं: त्रिकोणीय द्विपिरामिडी। तीन बीच में 120° पर होते हैं; दो उनसे 90° पर ऊपर और नीचे। उदाहरण: PCl₅।',
      'ಒಂದು s, ಮೂರು p ಮತ್ತು ಒಂದು d ಕಕ್ಷೀಯ ಸೇರಿ ಐದು sp³d ಸಂಕರಗಳಾಗುತ್ತವೆ: ತ್ರಿಕೋನೀಯ ದ್ವಿಪಿರಮಿಡ್. ಮೂರು ಮಧ್ಯದಲ್ಲಿ 120° ಅಂತರದಲ್ಲಿ; ಎರಡು ಅವುಗಳಿಗೆ 90° ನಲ್ಲಿ ಮೇಲೆ ಮತ್ತು ಕೆಳಗೆ. ಉದಾಹರಣೆ: PCl₅.',
    ),
  ],
  [
    'sp3d2', 'sp³d²',
    [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
    [],
    [[[1, 0, 0], [0, 1, 0], null, '90°']],
    t(
      'One s, three p and two d orbitals mix into six sp³d² hybrids, all at 90° to their neighbours: octahedral. Example: SF₆.',
      'एक s, तीन p और दो d कक्षक मिलकर छह sp³d² संकर बनाते हैं, सभी अपने पड़ोसियों से 90° पर: अष्टफलकीय। उदाहरण: SF₆।',
      'ಒಂದು s, ಮೂರು p ಮತ್ತು ಎರಡು d ಕಕ್ಷೀಯಗಳು ಸೇರಿ ಆರು sp³d² ಸಂಕರಗಳಾಗುತ್ತವೆ, ಎಲ್ಲವೂ ನೆರೆಯವುಗಳಿಗೆ 90° ನಲ್ಲಿ: ಅಷ್ಟಫಲಕೀಯ. ಉದಾಹರಣೆ: SF₆.',
    ),
  ],
];

const shape = {
  sp: t('linear', 'रेखीय', 'ರೇಖೀಯ'),
  sp2: t('trigonal planar', 'त्रिकोणीय समतलीय', 'ತ್ರಿಕೋನೀಯ ಸಮತಲ'),
  sp3: t('tetrahedral', 'चतुष्फलकीय', 'ಚತುಷ್ಫಲಕೀಯ'),
  sp3d: t('trigonal bipyramidal', 'त्रिकोणीय द्विपिरामिडी', 'ತ್ರಿಕೋನೀಯ ದ್ವಿಪಿರಮಿಡ್'),
  sp3d2: t('octahedral', 'अष्टफलकीय', 'ಅಷ್ಟಫಲಕೀಯ'),
};

const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The middle of an arc: where its label goes. */
function arcMiddle([a, b, via]) {
  const m = via ?? norm(a.map((x, k) => x + b[k]));
  return m.map((x) => x * ARC * 1.15);
}

export default {
  id: 'hybridisation',
  version: 1,
  order: 4,
  source: 'procedural',
  subject: 'Chemistry',
  classes: [11, 12],
  title: t('Hybridisation of orbitals', 'कक्षकों का संकरण', 'ಕಕ್ಷೀಯಗಳ ಸಂಕರಣ'),
  summary: t(
    'Orbitals of a central atom mix into equal hybrid orbitals that point as far apart as they can. The number of hybrids sets the shape of the molecule.',
    'केंद्रीय परमाणु के कक्षक मिलकर समान संकर कक्षक बनाते हैं जो एक-दूसरे से यथासंभव दूर होते हैं। संकरों की संख्या अणु की आकृति तय करती है।',
    'ಕೇಂದ್ರ ಪರಮಾಣುವಿನ ಕಕ್ಷೀಯಗಳು ಸೇರಿ ಸಾಧ್ಯವಾದಷ್ಟು ದೂರ ತೋರುವ ಸಮಾನ ಸಂಕರ ಕಕ್ಷೀಯಗಳಾಗುತ್ತವೆ. ಸಂಕರಗಳ ಸಂಖ್ಯೆ ಅಣುವಿನ ಆಕಾರವನ್ನು ನಿರ್ಧರಿಸುತ್ತದೆ.',
  ),
  keywords: ['hybridisation', 'hybridization', 'hybrid orbitals', 'sp3', 'sp2', 'sp', 'vsepr', 'chemical bonding and molecular structure', 'molecular geometry', 'bond angle', 'tetrahedral', 'trigonal planar', 'octahedral'],
  credit: 'Model built by KINETIX',
  thumb: 'sp3',
  variants: KINDS.map(([id, label]) => ({ id, name: t(label, label, label) })),
  groups: [
    { id: 'hybrids', name: t('Hybrid orbitals', 'संकर कक्षक', 'ಸಂಕರ ಕಕ್ಷೀಯಗಳು') },
    { id: 'left', name: t('Left-over p orbitals', 'बचे हुए p कक्षक', 'ಉಳಿದ p ಕಕ್ಷೀಯಗಳು') },
    { id: 'angles', name: t('Bond angles', 'बंध कोण', 'ಬಂಧ ಕೋನಗಳು') },
    { id: 'atom', name: t('Central atom', 'केंद्रीय परमाणु', 'ಕೇಂದ್ರ ಪರಮಾಣು') },
  ],
  build(THREE) {
    const out = {};
    for (const [id, , dirs, pAxes, arcs] of KINDS) {
      out[`${id}_atom`] = blob(THREE, [0, 0, 0], 0.006, 0.006, 0.006, 3);
      // A hybrid: big along its direction, a small lobe of the other sign behind.
      const lobe = (a, sign) => polarLobes(THREE, (d) => (0.3 + dot(d, norm(a))) / 1.3, R, sign, { power: 3, nt: 28, np: 40 });
      out[`${id}_lobes`] = dirs.map((a) => lobe(a, 1));
      out[`${id}_back`] = dirs.map((a) => lobe(a, -1));
      if (pAxes.length) {
        out[`${id}_p`] = pAxes.flatMap((a) => [1, -1].map((sg) => polarLobes(THREE, (d) => dot(d, a), R * 0.8, sg, { nt: 28, np: 40 })));
      }
      arcs.forEach((arc, i) => {
        const [a, b, via] = arc;
        const pts = via ? [...arcPoints(THREE, [0, 0, 0], a, via, ARC, 16), ...arcPoints(THREE, [0, 0, 0], via, b, ARC, 16).slice(1)] : arcPoints(THREE, [0, 0, 0], a, b, ARC, 24);
        out[`${id}_angle${i ? i + 1 : ''}`] = [wire(THREE, pts, 0.0008, 48), ...[pts[0], pts[pts.length - 1]].map((p) => blob(THREE, p, 0.0014, 0.0014, 0.0014, 2))];
      });
    }
    return out;
  },
  get parts() {
    const list = [];
    for (const [id, label, dirs, pAxes, arcs, info] of KINDS) {
      const sh = shape[id];
      list.push(
        {
          id: `${id}_lobes`, variant: id, group: 'hybrids', color: POS, opacity: 0.85, explode: [0, 0, 0],
          name: t(`${dirs.length} ${label} hybrid orbitals`, `${dirs.length} ${label} संकर कक्षक`, `${dirs.length} ${label} ಸಂಕರ ಕಕ್ಷೀಯಗಳು`),
          info,
        },
        {
          id: `${id}_back`, variant: id, group: 'hybrids', color: NEG, minor: true, explode: [0, 0, 0],
          name: t('Small back lobes', 'छोटी पिछली पालियाँ', 'ಸಣ್ಣ ಹಿಂಬದಿ ಹಾಲೆಗಳು'),
          info: t(
            'Each hybrid also has a small lobe of the opposite sign behind the nucleus. The big lobe overlaps with other atoms to make strong σ bonds.',
            'हर संकर की नाभिक के पीछे विपरीत चिह्न की एक छोटी पालि भी होती है। बड़ी पालि दूसरे परमाणुओं से अतिव्यापन करके मज़बूत σ बंध बनाती है।',
            'ಪ್ರತಿ ಸಂಕರಕ್ಕೂ ಬೀಜಕೇಂದ್ರದ ಹಿಂದೆ ವಿರುದ್ಧ ಚಿಹ್ನೆಯ ಸಣ್ಣ ಹಾಲೆ ಇದೆ. ದೊಡ್ಡ ಹಾಲೆ ಇತರ ಪರಮಾಣುಗಳೊಂದಿಗೆ ಅತಿವ್ಯಾಪಿಸಿ ಬಲವಾದ σ ಬಂಧ ಮಾಡುತ್ತದೆ.',
          ),
        },
        {
          id: `${id}_atom`, variant: id, group: 'atom', color: '#3c3f44', explode: [0, 0, 0],
          name: t(`Central atom (${sh.en})`, `केंद्रीय परमाणु (${sh.hi})`, `ಕೇಂದ್ರ ಪರಮಾಣು (${sh.kn})`),
          info: t(`The atom whose orbitals mix. With ${label} hybrids its bonds make a ${sh.en} shape.`, `वह परमाणु जिसके कक्षक मिलते हैं। ${label} संकरों के साथ इसके बंध ${sh.hi} आकृति बनाते हैं।`, `ಕಕ್ಷೀಯಗಳು ಸೇರುವ ಪರಮಾಣು. ${label} ಸಂಕರಗಳೊಂದಿಗೆ ಇದರ ಬಂಧಗಳು ${sh.kn} ಆಕಾರ ಮಾಡುತ್ತವೆ.`),
        },
      );
      if (pAxes.length) {
        list.push({
          id: `${id}_p`, variant: id, group: 'left', color: '#b48ce0', opacity: 0.5, explode: [0, 0, 0],
          name: pAxes.length > 1 ? t('Unhybridised p orbitals', 'असंकरित p कक्षक', 'ಸಂಕರಗೊಳ್ಳದ p ಕಕ್ಷೀಯಗಳು') : t('Unhybridised p orbital', 'असंकरित p कक्षक', 'ಸಂಕರಗೊಳ್ಳದ p ಕಕ್ಷೀಯ'),
          info: t(
            'Not mixed in. Side-on overlap of these p orbitals with a neighbour makes π bonds (the second and third bonds of double and triple bonds).',
            'ये मिश्रित नहीं होते। पड़ोसी परमाणु के साथ इन p कक्षकों के पार्श्व अतिव्यापन से π बंध बनते हैं (द्विबंध और त्रिबंध के दूसरे और तीसरे बंध)।',
            'ಇವು ಸೇರುವುದಿಲ್ಲ. ನೆರೆಯ ಪರಮಾಣುವಿನೊಂದಿಗೆ ಈ p ಕಕ್ಷೀಯಗಳ ಪಾರ್ಶ್ವ ಅತಿವ್ಯಾಪನೆಯಿಂದ π ಬಂಧಗಳಾಗುತ್ತವೆ (ದ್ವಿ ಮತ್ತು ತ್ರಿಬಂಧಗಳ ಎರಡನೇ ಮತ್ತು ಮೂರನೇ ಬಂಧ).',
          ),
        });
      }
      arcs.forEach((arc, i) => {
        list.push({
          id: `${id}_angle${i ? i + 1 : ''}`, variant: id, group: 'angles', color: '#f2b33d', glow: 0.2, explode: [0, 0, 0],
          labelAt: arcMiddle(arc),
          name: t(`Bond angle ${arc[3]}`, `बंध कोण ${arc[3]}`, `ಬಂಧ ಕೋನ ${arc[3]}`),
          info: t(
            `The angle between two hybrid orbitals: ${arc[3]}. Electron pairs repel each other, so the hybrids spread out as far as they can.`,
            `दो संकर कक्षकों के बीच का कोण: ${arc[3]}। इलेक्ट्रॉन युग्म एक-दूसरे को प्रतिकर्षित करते हैं, इसलिए संकर यथासंभव दूर फैलते हैं।`,
            `ಎರಡು ಸಂಕರ ಕಕ್ಷೀಯಗಳ ನಡುವಿನ ಕೋನ: ${arc[3]}. ಎಲೆಕ್ಟ್ರಾನ್ ಜೋಡಿಗಳು ಪರಸ್ಪರ ವಿಕರ್ಷಿಸುವುದರಿಂದ ಸಂಕರಗಳು ಸಾಧ್ಯವಾದಷ್ಟು ದೂರ ಹರಡುತ್ತವೆ.`,
          ),
        });
      });
    }
    return list;
  },
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.5, 0.35, 1] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.02] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0.15, 0.05] },
  ],
  slices: [],
  animations: [],
};
