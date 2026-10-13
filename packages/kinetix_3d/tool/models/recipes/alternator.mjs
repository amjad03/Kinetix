// A salient-pole alternator (synchronous generator) built in code, cut away:
// the stator core with its three phase windings (R, Y, B), and the rotor's
// four poles with their field coils, fed with DC through two slip rings and
// brushes. "Run" turns the rotor at synchronous speed: Ns = 120f/P.
import { t, box } from '../lib/teaching.mjs';
import { tube, disc, sector, slottedCore, slotBars, ringZ } from '../lib/machines.mjs';

const L = 0.05;
const SLOTS = 24;
const spin = { axis: [0, 0, 1], speed: 90, centre: [0, 0, 0] };
const phases = [
  ['r', '#c62828', t('R phase', 'R कला', 'R ಹಂತ')],
  ['y', '#d4a017', t('Y phase', 'Y कला', 'Y ಹಂತ')],
  ['b', '#1565c0', t('B phase', 'B कला', 'B ಹಂತ')],
];

export default {
  id: 'alternator',
  version: 1,
  order: 14,
  source: 'procedural',
  subject: 'Engineering',
  classes: [12],
  title: t('Alternator (synchronous generator)', 'प्रत्यावर्तक (तुल्यकाली जनित्र)', 'ಆಲ್ಟರ್ನೇಟರ್ (ಸಮಕಾಲಿಕ ಜನಕ)'),
  summary: t(
    'The rotor\'s poles, magnetised with DC through slip rings, turn inside the stator and induce three EMFs 120° apart in its windings. The frequency is set by the speed: f = PN/120 (a 4-pole machine at 1500 rpm gives 50 Hz).',
    'स्लिप रिंगों से DC द्वारा चुंबकित रोटर के ध्रुव स्टेटर के भीतर घूमते हैं और उसकी कुंडलियों में 120° के अंतर पर तीन विद्युत वाहक बल प्रेरित करते हैं। आवृत्ति चाल से तय होती है: f = PN/120 (1500 rpm पर 4-ध्रुव मशीन 50 Hz देती है)।',
    'ಸ್ಲಿಪ್ ಉಂಗುರಗಳ ಮೂಲಕ DC ಯಿಂದ ಕಾಂತೀಕರಿಸಿದ ರೋಟರ್ ಧ್ರುವಗಳು ಸ್ಟೇಟರ್ ಒಳಗೆ ತಿರುಗಿ ಅದರ ಸುರುಳಿಗಳಲ್ಲಿ 120° ಅಂತರದ ಮೂರು EMF ಪ್ರೇರಿಸುತ್ತವೆ. ಆವರ್ತನ ವೇಗದಿಂದ ನಿರ್ಧಾರ: f = PN/120 (1500 rpm ನಲ್ಲಿ 4-ಧ್ರುವ ಯಂತ್ರ 50 Hz ನೀಡುತ್ತದೆ).',
  ),
  keywords: ['alternator', 'synchronous generator', 'salient pole', 'slip rings', 'field winding', 'three phase', 'stator winding', 'synchronous speed', 'electrical machines', 'power systems', 'excitation'],
  credit: 'Model built by KINETIX (proportions simplified)',
  crease: 35,
  build(THREE) {
    const poles = [], shoes = [], coils = [];
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      poles.push(new THREE.BoxGeometry(0.03, 0.024, 2 * L).translate(0.03, 0, 0).rotateZ(a));
      shoes.push(sector(THREE, 0.042, 0.052, a - 0.5, a + 0.5, -L, L, 8));
      coils.push(new THREE.BoxGeometry(0.022, 0.04, 2 * L + 0.014).translate(0.03, 0, 0).rotateZ(a));
    }
    const out = {
      frame: tube(THREE, 0.1, 0.108, -L - 0.012, L + 0.012, 56),
      feet: [box(THREE, [0.18, 0.012, 0.12], [0, -0.12, 0]), box(THREE, [0.03, 0.02, 0.12], [-0.07, -0.106, 0]), box(THREE, [0.03, 0.02, 0.12], [0.07, -0.106, 0])],
      stator_core: slottedCore(THREE, 0.055, 0.1, SLOTS, 0.016, 0.5, -L, L),
      rotor_poles: [disc(THREE, 0.018, -L, L, 24), ...poles, ...shoes],
      field_coils: coils,
      slip_rings: [tube(THREE, 0.012, 0.02, 0.075, 0.083, 28), tube(THREE, 0.012, 0.02, 0.09, 0.098, 28)],
      brushes: [box(THREE, [0.008, 0.014, 0.007], [0, 0.027, 0.079]), box(THREE, [0.008, 0.014, 0.007], [0, 0.027, 0.094])],
      shaft: disc(THREE, 0.011, -0.12, 0.12, 24),
    };
    for (const [p] of phases) {
      const k0 = { r: 0, y: 8, b: 16 }[p];
      const which = [0, 1, 2, 3].flatMap((i) => [(k0 + i) % SLOTS, (k0 + 12 + i) % SLOTS]);
      const a0 = ((k0 + 1.5) * 2 * Math.PI) / SLOTS, d = { r: 0, y: 1, b: 2 }[p];
      out[`winding_${p}`] = [
        ...slotBars(THREE, 0.065, SLOTS, which, 0.009, -L - 0.008, L + 0.008),
        ringZ(THREE, 0.068 + d * 0.006, 0.004, L + 0.012 + d * 0.004, { arc: Math.PI, start: a0, seg: 20 }),
        ringZ(THREE, 0.068 + d * 0.006, 0.004, -L - 0.012 - d * 0.004, { arc: Math.PI, start: a0, seg: 20 }),
      ];
    }
    return out;
  },
  groups: [
    { id: 'stator', name: t('Stator (armature)', 'स्टेटर (आर्मेचर)', 'ಸ್ಟೇಟರ್ (ಆರ್ಮೇಚರ್)') },
    { id: 'rotor', name: t('Rotor (field)', 'रोटर (क्षेत्र)', 'ರೋಟರ್ (ಕ್ಷೇತ್ರ)') },
  ],
  parts: [
    {
      id: 'frame', group: 'stator', color: '#4f6170', metal: true, explode: [0, 0, -1.4],
      name: t('Frame', 'ढाँचा', 'ಚೌಕಟ್ಟು'),
      info: t('Holds the stator core.', 'स्टेटर क्रोड को थामता है।', 'ಸ್ಟೇಟರ್ ತಿರುಳನ್ನು ಹಿಡಿಯುತ್ತದೆ.'),
    },
    {
      id: 'feet', group: 'stator', color: '#37434e', metal: true, minor: true, explode: [0, -1, 0],
      name: t('Feet', 'पाद', 'ಪಾದಗಳು'),
      info: t('Bolt the machine down.', 'मशीन को नीचे कसते हैं।', 'ಯಂತ್ರವನ್ನು ಕೆಳಗೆ ಬಿಗಿಯುತ್ತವೆ.'),
    },
    {
      id: 'stator_core', group: 'stator', color: '#8b949e', metal: true, explode: [0, 0, -0.9],
      name: t('Stator core', 'स्टेटर क्रोड', 'ಸ್ಟೇಟರ್ ತಿರುಳು'),
      info: t('Laminated and slotted; in an alternator the armature winding is on the stator, so the large output current needs no sliding contacts.', 'पटलित और खाँचेदार; प्रत्यावर्तक में आर्मेचर कुंडली स्टेटर पर होती है, इसलिए बड़ी निर्गत धारा को सर्पी संपर्क नहीं चाहिए।', 'ಪದರಗೊಳಿಸಿದ ಮತ್ತು ಕಚ್ಚುಗಳಿರುವ; ಆಲ್ಟರ್ನೇಟರ್‌ನಲ್ಲಿ ಆರ್ಮೇಚರ್ ಸುರುಳಿ ಸ್ಟೇಟರ್ ಮೇಲಿದೆ, ಹಾಗಾಗಿ ದೊಡ್ಡ ಹೊರ ವಿದ್ಯುತ್ತಿಗೆ ಜಾರು ಸಂಪರ್ಕ ಬೇಕಿಲ್ಲ.'),
    },
    ...phases.map(([p, color, name], i) => ({
      id: `winding_${p}`, group: 'stator', color, explode: [Math.cos((i * 2 * Math.PI) / 3), Math.sin((i * 2 * Math.PI) / 3), -0.6],
      name: t(`Armature winding, ${name.en}`, `आर्मेचर कुंडली, ${name.hi}`, `ಆರ್ಮೇಚರ್ ಸುರುಳಿ, ${name.kn}`),
      info: t('The turning poles induce an EMF E = 4.44 f Φ N Kw in it, 120° apart from the other phases.', 'घूमते ध्रुव इसमें E = 4.44 f Φ N Kw विद्युत वाहक बल प्रेरित करते हैं, अन्य कलाओं से 120° के अंतर पर।', 'ತಿರುಗುವ ಧ್ರುವಗಳು ಇದರಲ್ಲಿ E = 4.44 f Φ N Kw EMF ಪ್ರೇರಿಸುತ್ತವೆ, ಇತರ ಹಂತಗಳಿಂದ 120° ಅಂತರದಲ್ಲಿ.'),
    })),
    {
      id: 'rotor_poles', group: 'rotor', color: '#6f7c88', metal: true, explode: [0, 0, 0.5], spin,
      name: t('Salient poles', 'उभरे हुए ध्रुव', 'ಚಾಚಿದ ಧ್ರುವಗಳು'),
      info: t('Projecting poles for slow, many-pole machines (hydro); fast turbo-alternators have a smooth cylindrical rotor instead.', 'धीमी, बहु-ध्रुव मशीनों (जलविद्युत) के लिए उभरे ध्रुव; तेज़ टर्बो-प्रत्यावर्तकों में चिकना बेलनाकार रोटर होता है।', 'ನಿಧಾನ, ಹಲವು-ಧ್ರುವ ಯಂತ್ರಗಳಿಗೆ (ಜಲವಿದ್ಯುತ್) ಚಾಚಿದ ಧ್ರುವಗಳು; ವೇಗದ ಟರ್ಬೋ-ಆಲ್ಟರ್ನೇಟರ್‌ಗಳಲ್ಲಿ ನಯವಾದ ಸಿಲಿಂಡರ್ ರೋಟರ್.'),
    },
    {
      id: 'field_coils', group: 'rotor', color: '#c8783a', explode: [0, 0, 0.8], spin,
      name: t('Field coils', 'क्षेत्र कुंडलियाँ', 'ಕ್ಷೇತ್ರ ಸುರುಳಿಗಳು'),
      info: t('Carry the DC excitation current; changing it changes the EMF and the reactive power.', 'DC उत्तेजन धारा ले जाती हैं; इसे बदलने से विद्युत वाहक बल और प्रतिघाती शक्ति बदलती है।', 'DC ಉದ್ರೇಕ ವಿದ್ಯುತ್ ಒಯ್ಯುತ್ತವೆ; ಅದನ್ನು ಬದಲಿಸಿದರೆ EMF ಮತ್ತು ಪ್ರತಿಘಾತಿ ಶಕ್ತಿ ಬದಲಾಗುತ್ತವೆ.'),
    },
    {
      id: 'slip_rings', group: 'rotor', color: '#e0a93a', metal: true, explode: [0, 0, 1.2], spin,
      name: t('Slip rings', 'सर्पी वलय', 'ಜಾರು ಉಂಗುರಗಳು'),
      info: t('Two rings bring the DC field current in from the exciter.', 'दो वलय उत्तेजक से DC क्षेत्र धारा भीतर लाते हैं।', 'ಎರಡು ಉಂಗುರಗಳು ಉದ್ರೇಕಕದಿಂದ DC ಕ್ಷೇತ್ರ ವಿದ್ಯುತ್ತನ್ನು ಒಳತರುತ್ತವೆ.'),
    },
    {
      id: 'brushes', group: 'rotor', color: '#2f3237', matte: true, explode: [0, 0.6, 1.3],
      name: t('Brushes', 'ब्रश', 'ಬ್ರಷ್‌ಗಳು'),
      info: t('Fixed carbon brushes on the slip rings.', 'सर्पी वलयों पर स्थिर कार्बन ब्रश।', 'ಜಾರು ಉಂಗುರಗಳ ಮೇಲಿನ ಸ್ಥಿರ ಕಾರ್ಬನ್ ಬ್ರಷ್‌ಗಳು.'),
    },
    {
      id: 'shaft', group: 'rotor', color: '#b8bec4', metal: true, minor: true, explode: [0, 0, 1.6], spin,
      name: t('Shaft', 'शाफ़्ट', 'ಶಾಫ್ಟ್'),
      info: t('Driven by the prime mover (a turbine) at synchronous speed.', 'प्राइम मूवर (टरबाइन) द्वारा तुल्यकाली चाल से चलाई जाती है।', 'ಪ್ರೈಮ್ ಮೂವರ್ (ಟರ್ಬೈನ್) ನಿಂದ ಸಮಕಾಲಿಕ ವೇಗದಲ್ಲಿ ತಿರುಗಿಸಲಾಗುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.9, 0.7, 1.1] },
    { id: 'end', name: t('Along the shaft', 'शाफ़्ट की दिशा से', 'ಶಾಫ್ಟ್‌ನ ದಿಕ್ಕಿನಿಂದ'), dir: [0.05, 0.1, 1] },
  ],
  slices: [
    { id: 'cutaway', name: t('Cut away (a quarter out)', 'काटकर (एक चौथाई हटाकर)', 'ಕತ್ತರಿಸಿ (ಕಾಲು ಭಾಗ ತೆಗೆದು)'), normal: [-1, 0, 0], offset: 0, normal2: [0, -1, 0], view: 'front' },
    { id: 'cross', name: t('Cross-section', 'अनुप्रस्थ काट', 'ಅಡ್ಡ ಛೇದ'), normal: [0, 0, -1], offset: 0, view: 'end' },
  ],
  animations: [{ id: 'run', kind: 'orbit', name: t('Run the alternator', 'प्रत्यावर्तक चलाएँ', 'ಆಲ್ಟರ್ನೇಟರ್ ಚಲಾಯಿಸಿ') }],
};
