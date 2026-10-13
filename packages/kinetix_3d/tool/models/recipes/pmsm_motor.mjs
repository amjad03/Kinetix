// A permanent-magnet synchronous motor (PMSM / BLDC) as used in electric
// vehicles, built in code and cut away: the housing with its cooling
// jacket, the slotted stator with three phase windings, the rotor with
// surface magnets of alternating poles, the shaft and the position sensor.
// "Run" turns the rotor in step with the rotating field (no slip).
import { t, arrow } from '../lib/teaching.mjs';
import { tube, disc, slottedCore, slotBars, ringZ, sector } from '../lib/machines.mjs';

const L = 0.05;
const SLOTS = 24, POLES = 4;
const SPEED = 90; // degrees a second
const rotor = { axis: [0, 0, 1], speed: SPEED, centre: [0, 0, 0] };
const phases = [
  ['u', '#c62828', t('Phase U', 'कला U', 'ಹಂತ U')],
  ['v', '#d4a017', t('Phase V', 'कला V', 'ಹಂತ V')],
  ['w', '#1565c0', t('Phase W', 'कला W', 'ಹಂತ W')],
];

export default {
  id: 'pmsm_motor',
  version: 1,
  order: 23,
  source: 'procedural',
  subject: 'Engineering',
  classes: [12],
  title: t('EV traction motor (PMSM / BLDC)', 'ईवी ट्रैक्शन मोटर (PMSM / BLDC)', 'ಇವಿ ಎಳೆತ ಮೋಟಾರ್ (PMSM / BLDC)'),
  summary: t(
    'Three stator windings fed by the inverter make a rotating field; the rotor\'s permanent magnets lock on to it and turn at exactly synchronous speed, N = 120f/P. No brushes, high efficiency (about 95%), and it works as a generator in regenerative braking.',
    'इन्वर्टर से पोषित तीन स्टेटर कुंडलियाँ घूर्णी क्षेत्र बनाती हैं; रोटर के स्थायी चुंबक उससे जुड़कर ठीक तुल्यकाली चाल N = 120f/P पर घूमते हैं। ब्रश नहीं, उच्च दक्षता (लगभग 95%), और पुनर्योजी ब्रेकिंग में यह जनित्र बनती है।',
    'ಇನ್ವರ್ಟರ್ ಪೂರೈಸುವ ಮೂರು ಸ್ಟೇಟರ್ ಸುರುಳಿಗಳು ತಿರುಗುವ ಕ್ಷೇತ್ರ ಮಾಡುತ್ತವೆ; ರೋಟರ್‌ನ ಶಾಶ್ವತ ಕಾಂತಗಳು ಅದಕ್ಕೆ ಅಂಟಿ ನಿಖರ ಸಮಕಾಲಿಕ ವೇಗ N = 120f/P ನಲ್ಲಿ ತಿರುಗುತ್ತವೆ. ಬ್ರಷ್ ಇಲ್ಲ, ಹೆಚ್ಚು ದಕ್ಷತೆ (ಸುಮಾರು 95%), ಪುನರುತ್ಪಾದಕ ಬ್ರೇಕಿಂಗ್‌ನಲ್ಲಿ ಜನರೇಟರ್.',
  ),
  keywords: ['pmsm', 'bldc', 'brushless dc motor', 'permanent magnet synchronous motor', 'traction motor', 'ev motor', 'electric vehicle', 'electric drives', 'rotating magnetic field', 'regenerative braking', 'ev technology'],
  credit: 'Model built by KINETIX (proportions simplified)',
  crease: 35,
  build(THREE) {
    const out = {
      housing: [tube(THREE, 0.1, 0.112, -L - 0.012, L + 0.012, 56)],
      cooling_jacket: [ringZ(THREE, 0.106, 0.004, -0.03, { seg: 48 }), ringZ(THREE, 0.106, 0.004, 0, { seg: 48 }), ringZ(THREE, 0.106, 0.004, 0.03, { seg: 48 })],
      stator_core: slottedCore(THREE, 0.058, 0.1, SLOTS, 0.016, 0.5, -L, L),
      rotor_core: tube(THREE, 0.012, 0.048, -L, L, 48),
      shaft: disc(THREE, 0.011, -0.11, 0.13, 24),
      resolver: [tube(THREE, 0.012, 0.026, -L - 0.03, -L - 0.022, 32)],
      field: [...arrow(THREE, [0, -0.035, 0], [0, 0.035, 0], 0.004)],
    };
    const n = [], s = [];
    for (let k = 0; k < POLES; k++) {
      const a0 = (k * 2 * Math.PI) / POLES + 0.06, a1 = ((k + 1) * 2 * Math.PI) / POLES - 0.06;
      (k % 2 ? s : n).push(sector(THREE, 0.048, 0.055, a0, a1, -L, L, 12));
    }
    out.magnets_n = n;
    out.magnets_s = s;
    for (const [p] of phases) {
      const k0 = { u: 0, v: 4, w: 8 }[p];
      const which = [0, 1].flatMap((i) => [(k0 + i) % SLOTS, (k0 + 12 + i) % SLOTS, (k0 + 6 + i + 12) % SLOTS, (k0 + 6 + i) % SLOTS]);
      const a0 = ((k0 + 0.5) * 2 * Math.PI) / SLOTS;
      out[`winding_${p}`] = [
        ...slotBars(THREE, 0.067, SLOTS, which, 0.009, -L - 0.008, L + 0.008),
        ringZ(THREE, 0.07 + { u: 0, v: 0.005, w: 0.01 }[p], 0.004, L + 0.012, { arc: Math.PI / 2, start: a0, seg: 12 }),
        ringZ(THREE, 0.07 + { u: 0, v: 0.005, w: 0.01 }[p], 0.004, -L - 0.012, { arc: Math.PI / 2, start: a0, seg: 12 }),
      ];
    }
    return out;
  },
  groups: [
    { id: 'stator', name: t('Stator', 'स्टेटर', 'ಸ್ಟೇಟರ್') },
    { id: 'rotor', name: t('Magnet rotor', 'चुंबक रोटर', 'ಕಾಂತ ರೋಟರ್') },
    { id: 'ideas', name: t('Field', 'क्षेत्र', 'ಕ್ಷೇತ್ರ') },
  ],
  parts: [
    {
      id: 'housing', group: 'stator', color: '#4f6170', metal: true, explode: [0, 0, -1.4],
      name: t('Housing', 'आवास', 'ಕವಚ'),
      info: t('Aluminium casing; it bolts to the gearbox.', 'ऐलुमिनियम आवरण; यह गियरबॉक्स से बोल्ट होता है।', 'ಅಲ್ಯೂಮಿನಿಯಂ ಕವಚ; ಗೇರ್‌ಬಾಕ್ಸ್‌ಗೆ ಬೋಲ್ಟ್ ಆಗುತ್ತದೆ.'),
    },
    {
      id: 'cooling_jacket', group: 'stator', color: '#7fb3d5', metal: true, explode: [0, 0, -1.1],
      name: t('Coolant channels', 'शीतलक चैनल', 'ಶೀತಕ ಕಾಲುವೆಗಳು'),
      info: t('Water-glycol or oil carries away the copper and iron losses.', 'जल-ग्लाइकॉल या तेल ताँबे और लोहे की हानियों की ऊष्मा हटाता है।', 'ನೀರು-ಗ್ಲೈಕಾಲ್ ಅಥವಾ ಎಣ್ಣೆ ತಾಮ್ರ ಮತ್ತು ಕಬ್ಬಿಣದ ನಷ್ಟದ ಶಾಖ ತೆಗೆಯುತ್ತದೆ.'),
    },
    {
      id: 'stator_core', group: 'stator', color: '#8b949e', metal: true, explode: [0, 0, -0.8],
      name: t('Stator core', 'स्टेटर क्रोड', 'ಸ್ಟೇಟರ್ ತಿರುಳು'),
      info: t('Thin laminations of silicon steel, slotted for the windings, to keep eddy-current losses small.', 'सिलिकॉन इस्पात की पतली परतें, कुंडलियों के लिए खाँचेदार, ताकि भँवर धारा हानि कम रहे।', 'ಸುಳಿ ಪ್ರವಾಹ ನಷ್ಟ ಕಡಿಮೆ ಮಾಡಲು ಸಿಲಿಕಾನ್ ಉಕ್ಕಿನ ತೆಳು ಪದರಗಳು, ಸುರುಳಿಗಳಿಗೆ ಕಚ್ಚುಗಳು.'),
    },
    ...phases.map(([p, color, name], i) => ({
      id: `winding_${p}`, group: 'stator', color, explode: [Math.cos((i * 2 * Math.PI) / 3), Math.sin((i * 2 * Math.PI) / 3), -0.5],
      name: t(`Stator winding, ${name.en}`, `स्टेटर कुंडली, ${name.hi}`, `ಸ್ಟೇಟರ್ ಸುರುಳಿ, ${name.kn}`),
      info: t('Fed by the inverter with currents 120° apart; their frequency sets the speed.', 'इन्वर्टर से 120° के अंतर वाली धाराएँ मिलती हैं; उनकी आवृत्ति चाल तय करती है।', 'ಇನ್ವರ್ಟರ್‌ನಿಂದ 120° ಅಂತರದ ವಿದ್ಯುತ್ ಪಡೆಯುತ್ತದೆ; ಅದರ ಆವೃತ್ತಿ ವೇಗ ನಿರ್ಧರಿಸುತ್ತದೆ.'),
    })),
    {
      id: 'rotor_core', group: 'rotor', color: '#6f7c88', metal: true, explode: [0, 0, 0.6], spin: rotor,
      name: t('Rotor core', 'रोटर क्रोड', 'ರೋಟರ್ ತಿರುಳು'),
      info: t('Laminated steel that carries the magnets and their flux.', 'पटलित इस्पात जो चुंबकों और उनके फ़्लक्स को थामता है।', 'ಕಾಂತಗಳು ಮತ್ತು ಅವುಗಳ ಫ್ಲಕ್ಸ್ ಹೊರುವ ಪದರ ಉಕ್ಕು.'),
    },
    {
      id: 'magnets_n', group: 'rotor', color: '#d84343', explode: [0, 0, 0.9], spin: rotor,
      name: t('Magnets, north poles', 'चुंबक, उत्तरी ध्रुव', 'ಕಾಂತಗಳು, ಉತ್ತರ ಧ್ರುವಗಳು'),
      info: t('Neodymium-iron-boron (NdFeB) magnets: strong fields with no current, so no rotor copper losses.', 'नियोडिमियम-आयरन-बोरॉन (NdFeB) चुंबक: बिना धारा के प्रबल क्षेत्र, इसलिए रोटर में ताँबा हानि नहीं।', 'ನಿಯೋಡಿಮಿಯಂ-ಕಬ್ಬಿಣ-ಬೋರಾನ್ (NdFeB) ಕಾಂತಗಳು: ವಿದ್ಯುತ್ ಇಲ್ಲದೆ ಬಲ ಕ್ಷೇತ್ರ, ರೋಟರ್ ತಾಮ್ರ ನಷ್ಟವಿಲ್ಲ.'),
    },
    {
      id: 'magnets_s', group: 'rotor', color: '#3561c4', explode: [0, 0, 0.9], spin: rotor,
      name: t('Magnets, south poles', 'चुंबक, दक्षिणी ध्रुव', 'ಕಾಂತಗಳು, ದಕ್ಷಿಣ ಧ್ರುವಗಳು'),
      info: t('Poles alternate N, S, N, S: this is a 4-pole rotor, so at 50 Hz it turns at 1500 rpm.', 'ध्रुव बारी-बारी N, S, N, S: यह 4-ध्रुव रोटर है, इसलिए 50 Hz पर 1500 rpm पर घूमता है।', 'ಧ್ರುವಗಳು ಪರ್ಯಾಯ N, S, N, S: ಇದು 4-ಧ್ರುವ ರೋಟರ್, 50 Hz ನಲ್ಲಿ 1500 rpm ನಲ್ಲಿ ತಿರುಗುತ್ತದೆ.'),
    },
    {
      id: 'shaft', group: 'rotor', color: '#b8bec4', metal: true, minor: true, explode: [0, 0, 1.4], spin: rotor,
      name: t('Shaft', 'शाफ़्ट', 'ಶಾಫ್ಟ್'),
      info: t('Drives the reduction gear to the wheels.', 'पहियों तक रिडक्शन गियर चलाता है।', 'ಚಕ್ರಗಳವರೆಗಿನ ರಿಡಕ್ಷನ್ ಗೇರ್ ನಡೆಸುತ್ತದೆ.'),
    },
    {
      id: 'resolver', group: 'rotor', color: '#2e7d32', explode: [0, 0, -1.6], spin: rotor,
      name: t('Position sensor (resolver)', 'स्थिति संवेदक (रिज़ॉल्वर)', 'ಸ್ಥಾನ ಸಂವೇದಕ (ರಿಸಾಲ್ವರ್)'),
      info: t('Tells the inverter the rotor angle so it can switch the phases at the right moment (field-oriented control).', 'इन्वर्टर को रोटर का कोण बताता है ताकि वह सही क्षण पर कलाएँ बदल सके (क्षेत्र-उन्मुख नियंत्रण)।', 'ಇನ್ವರ್ಟರ್‌ಗೆ ರೋಟರ್ ಕೋನ ತಿಳಿಸುತ್ತದೆ, ಸರಿಯಾದ ಕ್ಷಣದಲ್ಲಿ ಹಂತ ಬದಲಿಸಲು (ಕ್ಷೇತ್ರ-ಆಧಾರಿತ ನಿಯಂತ್ರಣ).'),
    },
    {
      id: 'field', group: 'ideas', color: '#7fc3ff', glow: 0.4, opacity: 0.85, spin: rotor,
      name: t('Rotating magnetic field', 'घूर्णी चुंबकीय क्षेत्र', 'ತಿರುಗುವ ಕಾಂತಕ್ಷೇತ್ರ'),
      info: t('The stator field turns at synchronous speed and the rotor turns with it, a little behind (the load angle), with no slip.', 'स्टेटर क्षेत्र तुल्यकाली चाल से घूमता है और रोटर उसके साथ थोड़ा पीछे (भार कोण) घूमता है, बिना सर्पण के।', 'ಸ್ಟೇಟರ್ ಕ್ಷೇತ್ರ ಸಮಕಾಲಿಕ ವೇಗದಲ್ಲಿ ತಿರುಗುತ್ತದೆ, ರೋಟರ್ ಸ್ವಲ್ಪ ಹಿಂದೆ (ಭಾರ ಕೋನ) ಅದರೊಂದಿಗೆ, ಸ್ಲಿಪ್ ಇಲ್ಲದೆ.'),
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
  animations: [{ id: 'run', kind: 'orbit', name: t('Run: rotor locked to the field', 'चलाएँ: क्षेत्र से बंधा रोटर', 'ಚಲಾಯಿಸಿ: ಕ್ಷೇತ್ರಕ್ಕೆ ಅಂಟಿದ ರೋಟರ್') }],
};
