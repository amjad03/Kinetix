// A plug flow (tubular) reactor built in code: a long jacketed tube, cut
// away to show "plugs" of fluid that move along without mixing with each
// other, coloured from feed (blue) to product (orange) as the conversion
// rises along the length. Proportions simplified.
import { t, box, arrow } from '../lib/teaching.mjs';
import { rod } from '../lib/shapes.mjs';
import { shell, plate, layX, pipe } from '../lib/process.mjs';

const L = 0.3, R = 0.022; // tube length (x from -L/2 to L/2) and inner radius
const PLUGS = 9;

export default {
  id: 'pfr_reactor',
  version: 1,
  order: 18,
  source: 'procedural',
  subject: 'Engineering',
  classes: [12],
  title: t('Plug flow (tubular) reactor (PFR)', 'प्लग प्रवाह (नलिकाकार) रिएक्टर (PFR)', 'ಪ್ಲಗ್ ಹರಿವು (ನಳಿಕೆ) ರಿಯಾಕ್ಟರ್ (PFR)'),
  summary: t(
    'Fluid moves through a long tube in plugs that do not mix with the ones ahead or behind, so the concentration falls steadily along the length. Design equation: V = F₀∫dX/(−rA); for a first-order reaction X = 1 − e^(−kτ).',
    'द्रव एक लंबी नली में प्लगों में चलता है जो आगे-पीछे वालों से नहीं मिलते, इसलिए सांद्रता लंबाई के साथ लगातार घटती है। डिज़ाइन समीकरण: V = F₀∫dX/(−rA); प्रथम कोटि अभिक्रिया के लिए X = 1 − e^(−kτ)।',
    'ದ್ರವ ಉದ್ದ ನಳಿಕೆಯಲ್ಲಿ ಮುಂದಿನ-ಹಿಂದಿನವುಗಳೊಂದಿಗೆ ಬೆರೆಯದ ಪ್ಲಗ್‌ಗಳಾಗಿ ಚಲಿಸುತ್ತದೆ, ಹಾಗಾಗಿ ಸಾಂದ್ರತೆ ಉದ್ದಕ್ಕೂ ಕ್ರಮವಾಗಿ ಇಳಿಯುತ್ತದೆ. ವಿನ್ಯಾಸ ಸಮೀಕರಣ: V = F₀∫dX/(−rA); ಪ್ರಥಮ ಕ್ರಮದ ಕ್ರಿಯೆಗೆ X = 1 − e^(−kτ).',
  ),
  keywords: ['pfr', 'plug flow reactor', 'tubular reactor', 'chemical reactor', 'reaction engineering', 'residence time', 'space time', 'conversion', 'chemical engineering'],
  credit: 'Model built by KINETIX (proportions simplified)',
  crease: 35,
  build(THREE) {
    const plugs = { feed: [], middle: [], product: [] };
    const w = L / PLUGS;
    for (let k = 0; k < PLUGS; k++) {
      const x = -L / 2 + w * (k + 0.5);
      const g = layX(plate(THREE, R - 0.002, 0, w * 0.82, 28)).translate(x, 0, 0);
      (k < 3 ? plugs.feed : k < 6 ? plugs.middle : plugs.product).push(g);
    }
    return {
      tube: layX(shell(THREE, R, R + 0.003, -L / 2, L / 2, 40)),
      jacket: layX(shell(THREE, R + 0.008, R + 0.012, -L / 2 + 0.03, L / 2 - 0.03, 40)),
      flanges: [layX(shell(THREE, R, R + 0.012, -L / 2 - 0.006, -L / 2, 40)), layX(shell(THREE, R, R + 0.012, L / 2, L / 2 + 0.006, 40))],
      plugs_feed: plugs.feed,
      plugs_middle: plugs.middle,
      plugs_product: plugs.product,
      inlet: pipe(THREE, [[-L / 2 - 0.06, 0, 0], [-L / 2 - 0.006, 0, 0]], 0.009),
      outlet: pipe(THREE, [[L / 2 + 0.006, 0, 0], [L / 2 + 0.06, 0, 0]], 0.009),
      coolant: [...pipe(THREE, [[L / 2 - 0.05, -R - 0.012, 0], [L / 2 - 0.05, -R - 0.04, 0]], 0.004), ...pipe(THREE, [[-L / 2 + 0.05, R + 0.012, 0], [-L / 2 + 0.05, R + 0.04, 0]], 0.004)],
      flow: [...arrow(THREE, [-0.06, R + 0.06, 0], [0.06, R + 0.06, 0], 0.003)],
      supports: [box(THREE, [0.012, 0.05, 0.05], [-L / 3, -R - 0.035, 0]), box(THREE, [0.012, 0.05, 0.05], [L / 3, -R - 0.035, 0]), rod(THREE, [-L / 2, -R - 0.06, 0], [L / 2, -R - 0.06, 0], 0.004, 8)],
    };
  },
  groups: [
    { id: 'reactor', name: t('Reactor', 'रिएक्टर', 'ರಿಯಾಕ್ಟರ್') },
    { id: 'plugs', name: t('Plugs of fluid', 'द्रव के प्लग', 'ದ್ರವದ ಪ್ಲಗ್‌ಗಳು') },
    { id: 'flows', name: t('Flows', 'प्रवाह', 'ಹರಿವುಗಳು') },
  ],
  parts: [
    {
      id: 'tube', group: 'reactor', color: '#9fb3c4', metal: true, opacity: 0.55, explode: [0, 0, -0.6],
      name: t('Reactor tube', 'रिएक्टर नली', 'ರಿಯಾಕ್ಟರ್ ನಳಿಕೆ'),
      info: t('Long and narrow, so the flow is close to ideal plug flow (L/D large, turbulent).', 'लंबी और पतली, ताकि प्रवाह आदर्श प्लग प्रवाह के क़रीब रहे (L/D अधिक, विक्षुब्ध)।', 'ಉದ್ದ ಮತ್ತು ಕಿರಿದು, ಹಾಗಾಗಿ ಹರಿವು ಆದರ್ಶ ಪ್ಲಗ್ ಹರಿವಿಗೆ ಹತ್ತಿರ (L/D ಹೆಚ್ಚು, ಪ್ರಕ್ಷುಬ್ಧ).'),
    },
    {
      id: 'jacket', group: 'reactor', color: '#d08a3e', metal: true, opacity: 0.4, explode: [0, 0, 1],
      name: t('Heating or cooling jacket', 'तापन या शीतलन जैकेट', 'ಬಿಸಿ ಅಥವಾ ತಂಪು ಜಾಕೆಟ್'),
      info: t('Keeps the temperature along the tube under control: hot spots near the inlet are the usual danger.', 'नली के साथ ताप नियंत्रित रखता है: प्रवेश के पास गर्म बिंदु सामान्य ख़तरा है।', 'ನಳಿಕೆಯ ಉದ್ದಕ್ಕೂ ತಾಪ ನಿಯಂತ್ರಿಸುತ್ತದೆ: ಒಳಹರಿವಿನ ಬಳಿ ಬಿಸಿ ಬಿಂದುಗಳು ಸಾಮಾನ್ಯ ಅಪಾಯ.'),
    },
    {
      id: 'flanges', group: 'reactor', color: '#6f7c88', metal: true, minor: true, explode: [0, 0, 0],
      name: t('Flanges', 'फ़्लैंज', 'ಫ್ಲ್ಯಾಂಜ್‌ಗಳು'),
      info: t('Bolted joints to the feed and product lines.', 'फ़ीड और उत्पाद लाइनों से बोल्ट वाले जोड़।', 'ಫೀಡ್ ಮತ್ತು ಉತ್ಪನ್ನ ಮಾರ್ಗಗಳಿಗೆ ಬೋಲ್ಟ್ ಜೋಡಣೆಗಳು.'),
    },
    {
      id: 'plugs_feed', group: 'plugs', color: '#2f6fd6', explode: [0, 0.3, 0],
      name: t('Plugs near the inlet: mostly reactant', 'प्रवेश के पास प्लग: अधिकतर अभिकारक', 'ಒಳಹರಿವಿನ ಬಳಿ ಪ್ಲಗ್‌ಗಳು: ಹೆಚ್ಚಾಗಿ ಕ್ರಿಯಾಕಾರಕ'),
      info: t('Concentration is highest here, so the rate (−rA = kCA) is highest too.', 'यहाँ सांद्रता सबसे अधिक है, इसलिए दर (−rA = kCA) भी सबसे अधिक है।', 'ಇಲ್ಲಿ ಸಾಂದ್ರತೆ ಅತಿ ಹೆಚ್ಚು, ಹಾಗಾಗಿ ದರ (−rA = kCA) ಕೂಡ ಅತಿ ಹೆಚ್ಚು.'),
    },
    {
      id: 'plugs_middle', group: 'plugs', color: '#9a6fb0', explode: [0, 0.3, 0],
      name: t('Plugs in the middle: reacting', 'बीच के प्लग: अभिक्रिया जारी', 'ಮಧ್ಯದ ಪ್ಲಗ್‌ಗಳು: ಕ್ರಿಯೆ ನಡೆಯುತ್ತಿದೆ'),
      info: t('Each plug is a little batch reactor: its age is its distance along the tube divided by the velocity.', 'हर प्लग एक छोटा बैच रिएक्टर है: उसकी आयु नली में उसकी दूरी को वेग से भाग देने पर मिलती है।', 'ಪ್ರತಿ ಪ್ಲಗ್ ಒಂದು ಸಣ್ಣ ಬ್ಯಾಚ್ ರಿಯಾಕ್ಟರ್: ಅದರ ವಯಸ್ಸು ನಳಿಕೆಯಲ್ಲಿನ ದೂರವನ್ನು ವೇಗದಿಂದ ಭಾಗಿಸಿದಷ್ಟು.'),
    },
    {
      id: 'plugs_product', group: 'plugs', color: '#e8710a', explode: [0, 0.3, 0],
      name: t('Plugs near the outlet: mostly product', 'निकास के पास प्लग: अधिकतर उत्पाद', 'ಹೊರಹರಿವಿನ ಬಳಿ ಪ್ಲಗ್‌ಗಳು: ಹೆಚ್ಚಾಗಿ ಉತ್ಪನ್ನ'),
      info: t('After the space time τ = V/v₀ the conversion is X = 1 − e^(−kτ) for a first-order reaction.', 'स्पेस टाइम τ = V/v₀ के बाद प्रथम कोटि अभिक्रिया के लिए रूपांतरण X = 1 − e^(−kτ) होता है।', 'ಸ್ಪೇಸ್ ಟೈಮ್ τ = V/v₀ ನಂತರ ಪ್ರಥಮ ಕ್ರಮದ ಕ್ರಿಯೆಗೆ ಪರಿವರ್ತನೆ X = 1 − e^(−kτ).'),
    },
    {
      id: 'inlet', group: 'flows', color: '#2e7d32', explode: [-0.8, 0, 0],
      name: t('Feed inlet', 'फ़ीड प्रवेश', 'ಫೀಡ್ ಒಳಹರಿವು'),
      info: t('Reactant enters at the volumetric flow v₀ and concentration CA0.', 'अभिकारक आयतनी प्रवाह v₀ और सांद्रता CA0 पर प्रवेश करता है।', 'ಕ್ರಿಯಾಕಾರಕ ಗಾತ್ರ ಹರಿವು v₀ ಮತ್ತು ಸಾಂದ್ರತೆ CA0 ನಲ್ಲಿ ಪ್ರವೇಶಿಸುತ್ತದೆ.'),
    },
    {
      id: 'outlet', group: 'flows', color: '#c62828', explode: [0.8, 0, 0],
      name: t('Product outlet', 'उत्पाद निकास', 'ಉತ್ಪನ್ನ ಹೊರಹರಿವು'),
      info: t('For the same conversion a PFR needs less volume than a CSTR (for positive-order reactions).', 'समान रूपांतरण के लिए PFR को CSTR से कम आयतन चाहिए (धनात्मक कोटि की अभिक्रियाओं में)।', 'ಅದೇ ಪರಿವರ್ತನೆಗೆ PFRಗೆ CSTRಗಿಂತ ಕಡಿಮೆ ಗಾತ್ರ ಸಾಕು (ಧನಾತ್ಮಕ ಕ್ರಮದ ಕ್ರಿಯೆಗಳಲ್ಲಿ).'),
    },
    {
      id: 'coolant', group: 'flows', color: '#1565c0', explode: [0, 0, 1.2],
      name: t('Coolant in and out (counter-current)', 'शीतलक प्रवेश और निकास (प्रतिधारा)', 'ಶೀತಕ ಒಳ ಮತ್ತು ಹೊರ (ಪ್ರತಿಪ್ರವಾಹ)'),
      info: t('Coolant runs the opposite way to the reacting fluid.', 'शीतलक अभिक्रियाशील द्रव की उल्टी दिशा में बहता है।', 'ಶೀತಕ ಕ್ರಿಯೆಯ ದ್ರವದ ವಿರುದ್ಧ ದಿಕ್ಕಿನಲ್ಲಿ ಹರಿಯುತ್ತದೆ.'),
    },
    {
      id: 'flow', group: 'flows', color: '#7fc3ff', glow: 0.4, explode: [0, 0.6, 0],
      name: t('Direction of flow', 'प्रवाह की दिशा', 'ಹರಿವಿನ ದಿಕ್ಕು'),
      info: t('No mixing along the flow direction; perfect mixing across each plug.', 'प्रवाह की दिशा में कोई मिश्रण नहीं; हर प्लग के आर-पार पूर्ण मिश्रण।', 'ಹರಿವಿನ ದಿಕ್ಕಿನಲ್ಲಿ ಮಿಶ್ರಣವಿಲ್ಲ; ಪ್ರತಿ ಪ್ಲಗ್‌ನ ಅಡ್ಡಲಾಗಿ ಸಂಪೂರ್ಣ ಮಿಶ್ರಣ.'),
    },
    {
      id: 'supports', group: 'reactor', color: '#5b6670', metal: true, minor: true, explode: [0, -1, 0],
      name: t('Supports', 'आधार', 'ಆಧಾರಗಳು'),
      info: t('Hold the tube level.', 'नली को समतल रखते हैं।', 'ನಳಿಕೆಯನ್ನು ಸಮತಲದಲ್ಲಿಡುತ್ತವೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.3, 0.45, 1] },
    { id: 'end', name: t('Along the tube', 'नली की दिशा से', 'ನಳಿಕೆಯ ದಿಕ್ಕಿನಿಂದ'), dir: [1, 0.15, 0.1] },
  ],
  slices: [
    { id: 'half', name: t('Cut along the tube', 'नली के साथ काटकर', 'ನಳಿಕೆಯ ಉದ್ದಕ್ಕೆ ಕತ್ತರಿಸಿ'), normal: [0, 0, -1], offset: 0, view: 'front' },
  ],
  animations: [],
};
