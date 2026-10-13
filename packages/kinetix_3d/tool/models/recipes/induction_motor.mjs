// A three-phase squirrel-cage induction motor built in code, cut away: the
// finned frame, the slotted stator core with its three phase windings (R, Y,
// B), and the rotor's bars and end rings on the shaft. "Run" turns the
// rotating magnetic field at synchronous speed and the rotor a little slower
// (the slip).
import { t, box, arrow } from '../lib/teaching.mjs';
import { tube, disc, slottedCore, slotBars, ringZ } from '../lib/machines.mjs';

const L = 0.055;
const SLOTS = 24, BARS = 20;
const NS = 100; // synchronous speed, degrees a second
const SLIP = 0.05;
const rotor = { axis: [0, 0, 1], speed: NS * (1 - SLIP), centre: [0, 0, 0] };
const phases = [
  ['r', '#c62828', t('R phase', 'R कला', 'R ಹಂತ')],
  ['y', '#d4a017', t('Y phase', 'Y कला', 'Y ಹಂತ')],
  ['b', '#1565c0', t('B phase', 'B कला', 'B ಹಂತ')],
];

export default {
  id: 'induction_motor',
  version: 1,
  order: 11,
  source: 'procedural',
  subject: 'Engineering',
  classes: [12],
  title: t('Three-phase induction motor', 'त्रि-कला प्रेरण मोटर', 'ಮೂರು-ಹಂತದ ಪ್ರೇರಣ ಮೋಟಾರ್'),
  summary: t(
    'Three windings 120° apart, fed with three-phase current, make a magnetic field that rotates at synchronous speed Ns = 120f/P. It induces currents in the rotor\'s cage, which follows a little slower: slip s = (Ns − N)/Ns.',
    '120° के अंतर पर रखी तीन कुंडलियाँ त्रि-कला धारा से एक चुंबकीय क्षेत्र बनाती हैं जो तुल्यकाली चाल Ns = 120f/P से घूमता है। यह रोटर के पिंजरे में धारा प्रेरित करता है, जो थोड़ा धीमे पीछे-पीछे घूमता है: सर्पण s = (Ns − N)/Ns।',
    '120° ಅಂತರದ ಮೂರು ಸುರುಳಿಗಳು ಮೂರು-ಹಂತದ ವಿದ್ಯುತ್ತಿನಿಂದ ಸಮಕಾಲಿಕ ವೇಗ Ns = 120f/P ನಲ್ಲಿ ತಿರುಗುವ ಕಾಂತಕ್ಷೇತ್ರ ಮಾಡುತ್ತವೆ. ಅದು ರೋಟರ್‌ನ ಪಂಜರದಲ್ಲಿ ವಿದ್ಯುತ್ ಪ್ರೇರಿಸುತ್ತದೆ; ರೋಟರ್ ಸ್ವಲ್ಪ ನಿಧಾನವಾಗಿ ಹಿಂಬಾಲಿಸುತ್ತದೆ: ಸ್ಲಿಪ್ s = (Ns − N)/Ns.',
  ),
  keywords: ['induction motor', 'squirrel cage', 'three phase motor', 'rotating magnetic field', 'slip', 'synchronous speed', 'stator winding', 'rotor bars', 'end ring', 'electrical machines', 'asynchronous motor'],
  credit: 'Model built by KINETIX (proportions simplified)',
  crease: 35,
  build(THREE) {
    const fins = [];
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI * 2) / 16;
      if (Math.abs(Math.sin(a) + 1) < 0.2) continue; // no fins over the feet
      fins.push(new THREE.BoxGeometry(0.012, 0.004, 2 * L + 0.02).translate(0.112, 0, 0).rotateZ(a));
    }
    const out = {
      frame: [tube(THREE, 0.1, 0.106, -L - 0.012, L + 0.012, 56), ...fins],
      feet: [box(THREE, [0.18, 0.012, 0.12], [0, -0.118, 0]), box(THREE, [0.03, 0.02, 0.12], [-0.07, -0.104, 0]), box(THREE, [0.03, 0.02, 0.12], [0.07, -0.104, 0])],
      terminal_box: [box(THREE, [0.05, 0.03, 0.06], [0, 0.12, 0]), box(THREE, [0.056, 0.006, 0.066], [0, 0.137, 0])],
      stator_core: slottedCore(THREE, 0.056, 0.1, SLOTS, 0.016, 0.5, -L, L),
      rotor_core: slottedCore(THREE, 0.012, 0.054, BARS, 0.006, 0.4, -L, L, { inner: false }),
      rotor_bars: [...slotBars(THREE, 0.0505, BARS, [...Array(BARS).keys()], 0.005, -L - 0.006, L + 0.006, { skew: 0.25 })],
      end_rings: [tube(THREE, 0.042, 0.055, L, L + 0.008, 40), tube(THREE, 0.042, 0.055, -L - 0.008, -L, 40)],
      shaft: disc(THREE, 0.011, -0.12, 0.14, 24),
      field: [...arrow(THREE, [0, -0.035, 0.0], [0, 0.035, 0.0], 0.004), ...arrow(THREE, [-0.012, -0.03, 0], [-0.012, 0.03, 0], 0.0015), ...arrow(THREE, [0.012, -0.03, 0], [0.012, 0.03, 0], 0.0015)],
    };
    // Each phase: two groups of four slots, 180° apart (a 2-pole winding), the groups of the phases 120° apart; end turns as arcs.
    for (const [p, , ] of phases) {
      const k0 = { r: 0, y: 8, b: 16 }[p];
      const which = [0, 1, 2, 3].flatMap((i) => [(k0 + i) % SLOTS, (k0 + 12 + i) % SLOTS]);
      const a0 = ((k0 + 1.5) * 2 * Math.PI) / SLOTS;
      out[`winding_${p}`] = [
        ...slotBars(THREE, 0.066, SLOTS, which, 0.009, -L - 0.008, L + 0.008),
        ringZ(THREE, 0.068 + { r: 0, y: 0.006, b: 0.012 }[p], 0.004, L + 0.012 + { r: 0, y: 0.004, b: 0.008 }[p], { arc: Math.PI, start: a0, seg: 20 }),
        ringZ(THREE, 0.068 + { r: 0, y: 0.006, b: 0.012 }[p], 0.004, -L - 0.012 - { r: 0, y: 0.004, b: 0.008 }[p], { arc: Math.PI, start: a0, seg: 20 }),
      ];
    }
    return out;
  },
  groups: [
    { id: 'stator', name: t('Stator', 'स्टेटर', 'ಸ್ಟೇಟರ್') },
    { id: 'rotor', name: t('Squirrel-cage rotor', 'पिंजरा रोटर', 'ಪಂಜರ ರೋಟರ್') },
    { id: 'ideas', name: t('Rotating field', 'घूर्णी क्षेत्र', 'ತಿರುಗುವ ಕ್ಷೇತ್ರ') },
  ],
  parts: [
    {
      id: 'frame', group: 'stator', color: '#4f6170', metal: true, explode: [0, 0, -1.4],
      name: t('Frame with cooling fins', 'शीतलन पंखों वाला ढाँचा', 'ತಂಪಾಗಿಸುವ ರೆಕ್ಕೆಗಳ ಚೌಕಟ್ಟು'),
      info: t('Holds the stator core; the fins carry the heat away (a fan on the shaft blows air over them).', 'स्टेटर क्रोड को थामता है; पंख ऊष्मा बाहर ले जाते हैं (शाफ़्ट पर लगा पंखा उन पर हवा फेंकता है)।', 'ಸ್ಟೇಟರ್ ತಿರುಳನ್ನು ಹಿಡಿಯುತ್ತದೆ; ರೆಕ್ಕೆಗಳು ಶಾಖವನ್ನು ಹೊರಹಾಕುತ್ತವೆ (ಶಾಫ್ಟ್ ಮೇಲಿನ ಫ್ಯಾನ್ ಅವುಗಳ ಮೇಲೆ ಗಾಳಿ ಬೀಸುತ್ತದೆ).'),
    },
    {
      id: 'feet', group: 'stator', color: '#37434e', metal: true, minor: true, explode: [0, -1, 0],
      name: t('Feet', 'पाद', 'ಪಾದಗಳು'),
      info: t('Bolt the motor down.', 'मोटर को नीचे कसते हैं।', 'ಮೋಟಾರ್ ಅನ್ನು ಕೆಳಗೆ ಬಿಗಿಯುತ್ತವೆ.'),
    },
    {
      id: 'terminal_box', group: 'stator', color: '#37434e', metal: true, explode: [0, 1, 0],
      name: t('Terminal box', 'टर्मिनल बॉक्स', 'ಟರ್ಮಿನಲ್ ಪೆಟ್ಟಿಗೆ'),
      info: t('Six winding ends: linked for star or delta.', 'कुंडली के छह सिरे: स्टार या डेल्टा के लिए जोड़े जाते हैं।', 'ಸುರುಳಿಯ ಆರು ತುದಿಗಳು: ಸ್ಟಾರ್ ಅಥವಾ ಡೆಲ್ಟಾಗೆ ಜೋಡಿಸಲಾಗುತ್ತದೆ.'),
    },
    {
      id: 'stator_core', group: 'stator', color: '#8b949e', metal: true, explode: [0, 0, -0.9],
      name: t('Stator core', 'स्टेटर क्रोड', 'ಸ್ಟೇಟರ್ ತಿರುಳು'),
      info: t('Laminated silicon steel with slots on the inside for the windings.', 'भीतर कुंडलियों के लिए खाँचों वाला पटलित सिलिकॉन इस्पात।', 'ಒಳಗೆ ಸುರುಳಿಗಳಿಗೆ ಕಚ್ಚುಗಳಿರುವ ಪದರಗೊಳಿಸಿದ ಸಿಲಿಕಾನ್ ಉಕ್ಕು.'),
    },
    ...phases.map(([p, color, name], i) => ({
      id: `winding_${p}`, group: 'stator', color, explode: [Math.cos((i * 2 * Math.PI) / 3), Math.sin((i * 2 * Math.PI) / 3), -0.6],
      name: t(`Stator winding, ${name.en}`, `स्टेटर कुंडली, ${name.hi}`, `ಸ್ಟೇಟರ್ ಸುರುಳಿ, ${name.kn}`),
      info: t('One of three windings 120° apart in space; their currents are 120° apart in time.', 'स्थान में 120° के अंतर पर रखी तीन कुंडलियों में से एक; उनकी धाराएँ समय में 120° के अंतर पर हैं।', 'ಸ್ಥಳದಲ್ಲಿ 120° ಅಂತರದ ಮೂರು ಸುರುಳಿಗಳಲ್ಲಿ ಒಂದು; ಅವುಗಳ ವಿದ್ಯುತ್ ಸಮಯದಲ್ಲಿ 120° ಅಂತರದಲ್ಲಿದೆ.'),
    })),
    {
      id: 'rotor_core', group: 'rotor', color: '#6f7c88', metal: true, explode: [0, 0, 0.5], spin: rotor,
      name: t('Rotor core', 'रोटर क्रोड', 'ರೋಟರ್ ತಿರುಳು'),
      info: t('Laminated, with slots for the bars; the air gap to the stator is kept very small.', 'पटलित, छड़ों के लिए खाँचों सहित; स्टेटर से वायु अंतराल बहुत कम रखा जाता है।', 'ಪದರಗೊಳಿಸಿದ, ಸಲಾಕೆಗಳಿಗೆ ಕಚ್ಚುಗಳೊಂದಿಗೆ; ಸ್ಟೇಟರ್‌ಗೆ ಗಾಳಿ ಅಂತರ ಬಹಳ ಕಡಿಮೆ.'),
    },
    {
      id: 'rotor_bars', group: 'rotor', color: '#b9852f', metal: true, explode: [0, 0, 0.8], spin: rotor,
      name: t('Rotor bars (skewed)', 'रोटर छड़ें (तिरछी)', 'ರೋಟರ್ ಸಲಾಕೆಗಳು (ಓರೆ)'),
      info: t('Aluminium or copper bars; skewing them makes the motor run smoothly and quietly.', 'ऐलुमिनियम या ताँबे की छड़ें; तिरछा रखने से मोटर सहज और शांत चलती है।', 'ಅಲ್ಯೂಮಿನಿಯಂ ಅಥವಾ ತಾಮ್ರದ ಸಲಾಕೆಗಳು; ಓರೆಯಾಗಿಸುವುದರಿಂದ ಮೋಟಾರ್ ಸುಗಮವಾಗಿ ಮತ್ತು ಸದ್ದಿಲ್ಲದೆ ಓಡುತ್ತದೆ.'),
    },
    {
      id: 'end_rings', group: 'rotor', color: '#c99a45', metal: true, explode: [0, 0, 1.1], spin: rotor,
      name: t('End rings', 'सिरा वलय', 'ತುದಿ ಉಂಗುರಗಳು'),
      info: t('Short-circuit the bars at both ends: with the bars they form the "squirrel cage".', 'दोनों सिरों पर छड़ों को लघुपथित करते हैं: छड़ों के साथ "पिंजरा" बनाते हैं।', 'ಎರಡೂ ತುದಿಗಳಲ್ಲಿ ಸಲಾಕೆಗಳನ್ನು ಶಾರ್ಟ್ ಮಾಡುತ್ತವೆ: ಸಲಾಕೆಗಳೊಂದಿಗೆ "ಪಂಜರ" ರೂಪಿಸುತ್ತವೆ.'),
    },
    {
      id: 'shaft', group: 'rotor', color: '#b8bec4', metal: true, minor: true, explode: [0, 0, 1.6], spin: rotor,
      name: t('Shaft', 'शाफ़्ट', 'ಶಾಫ್ಟ್'),
      info: t('Turns at N = Ns(1 − s): about 1440 rpm for a 4-pole, 50 Hz motor (Ns = 1500 rpm).', 'N = Ns(1 − s) पर घूमती है: 4-ध्रुव, 50 Hz मोटर में लगभग 1440 rpm (Ns = 1500 rpm)।', 'N = Ns(1 − s) ನಲ್ಲಿ ತಿರುಗುತ್ತದೆ: 4-ಧ್ರುವ, 50 Hz ಮೋಟಾರಿನಲ್ಲಿ ಸುಮಾರು 1440 rpm (Ns = 1500 rpm).'),
    },
    {
      id: 'field', group: 'ideas', color: '#7fc3ff', glow: 0.4, opacity: 0.85, spin: { axis: [0, 0, 1], speed: NS, centre: [0, 0, 0] },
      name: t('Rotating magnetic field', 'घूर्णी चुंबकीय क्षेत्र', 'ತಿರುಗುವ ಕಾಂತಕ್ಷೇತ್ರ'),
      info: t('The resultant field of the three windings: constant in strength, turning at synchronous speed. The rotor lags it by the slip.', 'तीनों कुंडलियों का परिणामी क्षेत्र: सामर्थ्य में स्थिर, तुल्यकाली चाल से घूमता। रोटर सर्पण जितना पीछे रहता है।', 'ಮೂರು ಸುರುಳಿಗಳ ಫಲಿತ ಕ್ಷೇತ್ರ: ಬಲದಲ್ಲಿ ಸ್ಥಿರ, ಸಮಕಾಲಿಕ ವೇಗದಲ್ಲಿ ತಿರುಗುತ್ತದೆ. ರೋಟರ್ ಸ್ಲಿಪ್‌ನಷ್ಟು ಹಿಂದುಳಿಯುತ್ತದೆ.'),
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
  animations: [{ id: 'run', kind: 'orbit', name: t('Run: field and rotor (with slip)', 'चलाएँ: क्षेत्र और रोटर (सर्पण सहित)', 'ಚಲಾಯಿಸಿ: ಕ್ಷೇತ್ರ ಮತ್ತು ರೋಟರ್ (ಸ್ಲಿಪ್ ಸಹಿತ)') }],
};
