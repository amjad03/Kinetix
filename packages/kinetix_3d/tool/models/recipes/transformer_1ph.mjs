// A single-phase core-type transformer built in code: a stepped (cruciform)
// laminated core of two limbs and two yokes, with the low-voltage winding
// next to each limb and the high-voltage winding over it (concentric), the
// HV and LV terminals, and the flux path round the core.
import { t, wire } from '../lib/teaching.mjs';
import { limb, yoke, winding, bushing } from '../lib/transformers.mjs';

const X = 0.06, W = 0.03, H = 0.07; // limbs at x = ±X, limb width, half window height
const YH = 0.026; // yoke height
const FLUX = [[-X, -0.03, 0.02], [-X, 0.05, 0.02], [-X + 0.01, H + YH / 2, 0.02], [X - 0.01, H + YH / 2, 0.02], [X, 0.05, 0.02], [X, -0.05, 0.02], [X - 0.01, -H - YH / 2, 0.02], [-X + 0.01, -H - YH / 2, 0.02], [-X, -0.05, 0.02]];

export default {
  id: 'transformer_1ph',
  version: 1,
  order: 12,
  source: 'procedural',
  subject: 'Engineering',
  classes: [12],
  title: t('Single-phase transformer (core type)', 'एकल-कला ट्रांसफ़ॉर्मर (कोर प्रकार)', 'ಏಕ-ಹಂತದ ಪರಿವರ್ತಕ (ಕೋರ್ ಮಾದರಿ)'),
  summary: t(
    'The windings surround the core\'s limbs: the low-voltage winding next to the core, the high-voltage winding over it. The same flux links both, so V1/V2 = N1/N2 and the EMF E = 4.44 f N Φm.',
    'कुंडलियाँ क्रोड की भुजाओं को घेरती हैं: निम्न-वोल्टता कुंडली क्रोड के पास, उच्च-वोल्टता कुंडली उसके ऊपर। एक ही फ्लक्स दोनों से जुड़ता है, इसलिए V1/V2 = N1/N2 और विद्युत वाहक बल E = 4.44 f N Φm।',
    'ಸುರುಳಿಗಳು ಕೋರ್‌ನ ಕಂಬಗಳನ್ನು ಸುತ್ತುವರಿಯುತ್ತವೆ: ಕಡಿಮೆ-ವೋಲ್ಟೇಜ್ ಸುರುಳಿ ಕೋರ್‌ನ ಪಕ್ಕ, ಹೆಚ್ಚು-ವೋಲ್ಟೇಜ್ ಸುರುಳಿ ಅದರ ಮೇಲೆ. ಒಂದೇ ಫ್ಲಕ್ಸ್ ಎರಡನ್ನೂ ಹೆಣೆಯುತ್ತದೆ, ಹಾಗಾಗಿ V1/V2 = N1/N2 ಮತ್ತು EMF E = 4.44 f N Φm.',
  ),
  keywords: ['transformer', 'single phase transformer', 'core type', 'emf equation', 'turns ratio', 'hv winding', 'lv winding', 'laminated core', 'electrical machines', 'mutual induction', 'core loss'],
  credit: 'Model built by Zynetix (proportions simplified)',
  crease: 35,
  build(THREE) {
    return {
      core: [...limb(THREE, -X, W, -H, H), ...limb(THREE, X, W, -H, H), ...yoke(THREE, -X - W / 2, X + W / 2, H + YH / 2, W, YH), ...yoke(THREE, -X - W / 2, X + W / 2, -H - YH / 2, W, YH)],
      lv_winding: [winding(THREE, -X, 0.0205, 0.028, -H + 0.006, H - 0.006), winding(THREE, X, 0.0205, 0.028, -H + 0.006, H - 0.006)],
      hv_winding: [winding(THREE, -X, 0.031, 0.04, -H + 0.012, H - 0.012), winding(THREE, X, 0.031, 0.04, -H + 0.012, H - 0.012)],
      hv_terminals: [...bushing(THREE, [-X - 0.012, H + YH, 0.026]), ...bushing(THREE, [X + 0.012, H + YH, 0.026])],
      lv_terminals: [...bushing(THREE, [-X + 0.012, H + YH, -0.026], 0.024), ...bushing(THREE, [X - 0.012, H + YH, -0.026], 0.024)],
      leads: [
        wire(THREE, [[-X - 0.036, H - 0.012, 0.016], [-X - 0.03, H + 0.01, 0.024], [-X - 0.012, H + YH + 0.002, 0.026]], 0.0014),
        wire(THREE, [[X + 0.036, H - 0.012, 0.016], [X + 0.03, H + 0.01, 0.024], [X + 0.012, H + YH + 0.002, 0.026]], 0.0014),
      ],
      flux: wire(THREE, FLUX, 0.0022, 96),
    };
  },
  groups: [
    { id: 'core', name: t('Core', 'क्रोड', 'ಕೋರ್') },
    { id: 'windings', name: t('Windings', 'कुंडलियाँ', 'ಸುರುಳಿಗಳು') },
    { id: 'ideas', name: t('Flux', 'फ्लक्स', 'ಫ್ಲಕ್ಸ್') },
  ],
  parts: [
    {
      id: 'core', group: 'core', color: '#7d8791', metal: true, explode: [0, 0, -1],
      name: t('Laminated core (stepped limbs, yokes)', 'पटलित क्रोड (सोपानी भुजाएँ, योक)', 'ಪದರಗೊಳಿಸಿದ ಕೋರ್ (ಮೆಟ್ಟಿಲು ಕಂಬಗಳು, ಯೋಕ್‌ಗಳು)'),
      info: t('Thin CRGO silicon-steel sheets: little hysteresis and eddy-current loss. Stepped limbs fill the round windings better.', 'पतली CRGO सिलिकॉन-इस्पात चादरें: कम शैथिल्य और भँवर-धारा हानि। सोपानी भुजाएँ गोल कुंडलियों को बेहतर भरती हैं।', 'ತೆಳು CRGO ಸಿಲಿಕಾನ್-ಉಕ್ಕಿನ ಹಾಳೆಗಳು: ಕಡಿಮೆ ಹಿಸ್ಟರಿಸಿಸ್ ಮತ್ತು ಸುಳಿ-ವಿದ್ಯುತ್ ನಷ್ಟ. ಮೆಟ್ಟಿಲು ಕಂಬಗಳು ದುಂಡು ಸುರುಳಿಗಳನ್ನು ಚೆನ್ನಾಗಿ ತುಂಬುತ್ತವೆ.'),
    },
    {
      id: 'lv_winding', group: 'windings', color: '#d98a2b', explode: [0, 0, 0.6],
      name: t('LV winding (inner)', 'निम्न-वोल्टता कुंडली (भीतरी)', 'ಕಡಿಮೆ-ವೋಲ್ಟೇಜ್ ಸುರುಳಿ (ಒಳಗಿನ)'),
      info: t('Fewer turns of thicker conductor; next to the core because it needs the least insulation.', 'मोटे चालक के कम फेरे; क्रोड के पास, क्योंकि इसे सबसे कम विद्युतरोधन चाहिए।', 'ದಪ್ಪ ವಾಹಕದ ಕಡಿಮೆ ಸುತ್ತುಗಳು; ಕಡಿಮೆ ನಿರೋಧನ ಸಾಕಾದ್ದರಿಂದ ಕೋರ್‌ನ ಪಕ್ಕ.'),
    },
    {
      id: 'hv_winding', group: 'windings', color: '#8e5fb5', opacity: 0.92, explode: [0, 0, 1.1],
      name: t('HV winding (outer)', 'उच्च-वोल्टता कुंडली (बाहरी)', 'ಹೆಚ್ಚು-ವೋಲ್ಟೇಜ್ ಸುರುಳಿ (ಹೊರಗಿನ)'),
      info: t('More turns of thinner conductor, outside the LV winding.', 'पतले चालक के अधिक फेरे, निम्न-वोल्टता कुंडली के बाहर।', 'ತೆಳು ವಾಹಕದ ಹೆಚ್ಚು ಸುತ್ತುಗಳು, ಕಡಿಮೆ-ವೋಲ್ಟೇಜ್ ಸುರುಳಿಯ ಹೊರಗೆ.'),
    },
    {
      id: 'hv_terminals', group: 'windings', color: '#c9b79c', explode: [0, 1, 0.4],
      name: t('HV bushings', 'उच्च-वोल्टता बुशिंग', 'ಹೆಚ್ಚು-ವೋಲ್ಟೇಜ್ ಬುಶಿಂಗ್‌ಗಳು'),
      info: t('Porcelain bushings bring the HV leads out, taller for more insulation.', 'चीनी मिट्टी के बुशिंग उच्च-वोल्टता सिरों को बाहर लाते हैं; अधिक विद्युतरोधन के लिए ऊँचे।', 'ಪಿಂಗಾಣಿ ಬುಶಿಂಗ್‌ಗಳು ಹೆಚ್ಚು-ವೋಲ್ಟೇಜ್ ತುದಿಗಳನ್ನು ಹೊರತರುತ್ತವೆ; ಹೆಚ್ಚು ನಿರೋಧನಕ್ಕಾಗಿ ಎತ್ತರ.'),
    },
    {
      id: 'lv_terminals', group: 'windings', color: '#c9b79c', minor: true, explode: [0, 1, -0.4],
      name: t('LV terminals', 'निम्न-वोल्टता टर्मिनल', 'ಕಡಿಮೆ-ವೋಲ್ಟೇಜ್ ಟರ್ಮಿನಲ್‌ಗಳು'),
      info: t('The LV leads come out here.', 'निम्न-वोल्टता सिरे यहाँ से निकलते हैं।', 'ಕಡಿಮೆ-ವೋಲ್ಟೇಜ್ ತುದಿಗಳು ಇಲ್ಲಿಂದ ಹೊರಬರುತ್ತವೆ.'),
    },
    {
      id: 'leads', group: 'windings', color: '#d8d2c4', minor: true, explode: [0, 0.8, 0.8],
      name: t('Leads', 'सिरे', 'ತುದಿ ತಂತಿಗಳು'),
      info: t('Join the HV winding to its bushings.', 'उच्च-वोल्टता कुंडली को बुशिंग से जोड़ते हैं।', 'ಹೆಚ್ಚು-ವೋಲ್ಟೇಜ್ ಸುರುಳಿಯನ್ನು ಬುಶಿಂಗ್‌ಗಳಿಗೆ ಜೋಡಿಸುತ್ತವೆ.'),
    },
    {
      id: 'flux', group: 'ideas', color: '#7fc3ff', glow: 0.5, hidden: true,
      name: t('Mutual flux Φ', 'परस्पर फ्लक्स Φ', 'ಪರಸ್ಪರ ಫ್ಲಕ್ಸ್ Φ'),
      info: t('Alternates at the supply frequency round the core and links both windings.', 'आपूर्ति आवृत्ति पर क्रोड के चारों ओर प्रत्यावर्तित होता है और दोनों कुंडलियों से जुड़ता है।', 'ಪೂರೈಕೆ ಆವರ್ತನದಲ್ಲಿ ಕೋರ್‌ನ ಸುತ್ತ ಪರ್ಯಾಯಿಸುತ್ತದೆ ಮತ್ತು ಎರಡೂ ಸುರುಳಿಗಳನ್ನು ಹೆಣೆಯುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.5, 0.45, 1] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.35] },
  ],
  slices: [
    { id: 'front_cut', name: t('Cut through the windings', 'कुंडलियों के बीच से काट', 'ಸುರುಳಿಗಳ ಮೂಲಕ ಕತ್ತರಿಸಿ'), normal: [0, 0, -1], offset: 0, view: 'front' },
    { id: 'plan_cut', name: t('Plan: concentric windings', 'ऊपरी काट: संकेंद्री कुंडलियाँ', 'ಮೇಲ್ನೋಟ ಕತ್ತರಿಸು: ಏಕಕೇಂದ್ರ ಸುರುಳಿಗಳು'), normal: [0, -1, 0], offset: 0, view: 'top' },
  ],
  animations: [
    {
      id: 'how', kind: 'flow',
      name: t('How it works', 'यह कैसे काम करता है', 'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ'),
      steps: [
        {
          color: '#ffb36b', highlight: ['lv_winding'],
          text: t('An alternating voltage on one winding drives a small magnetising current.', 'एक कुंडली पर प्रत्यावर्ती वोल्टता एक छोटी चुंबकन धारा चलाती है।', 'ಒಂದು ಸುರುಳಿಯ ಮೇಲಿನ ಪರ್ಯಾಯ ವೋಲ್ಟೇಜ್ ಸಣ್ಣ ಕಾಂತೀಕರಣ ವಿದ್ಯುತ್ ಹರಿಸುತ್ತದೆ.'),
          paths: [[[-X - 0.03, -H + 0.01, 0.022], [-X, -H + 0.01, 0.03], [-X + 0.03, -H + 0.01, 0.022]]],
        },
        {
          color: '#7fc3ff', highlight: ['core', 'flux'],
          text: t('It sets up an alternating flux in the core, which links the other winding.', 'यह क्रोड में प्रत्यावर्ती फ्लक्स बनाती है, जो दूसरी कुंडली से जुड़ता है।', 'ಅದು ಕೋರ್‌ನಲ್ಲಿ ಪರ್ಯಾಯ ಫ್ಲಕ್ಸ್ ಸ್ಥಾಪಿಸುತ್ತದೆ, ಅದು ಇನ್ನೊಂದು ಸುರುಳಿಯನ್ನು ಹೆಣೆಯುತ್ತದೆ.'),
          paths: [FLUX],
        },
        {
          color: '#c79bff', highlight: ['hv_winding', 'hv_terminals'],
          text: t('Each turn gets the same EMF, so the voltages are in the turns ratio: E = 4.44 f N Φm.', 'हर फेरे को समान विद्युत वाहक बल मिलता है, इसलिए वोल्टताएँ फेरों के अनुपात में होती हैं: E = 4.44 f N Φm।', 'ಪ್ರತಿ ಸುತ್ತಿಗೆ ಒಂದೇ EMF ಸಿಗುತ್ತದೆ, ಹಾಗಾಗಿ ವೋಲ್ಟೇಜ್‌ಗಳು ಸುತ್ತುಗಳ ಅನುಪಾತದಲ್ಲಿರುತ್ತವೆ: E = 4.44 f N Φm.'),
          paths: [[[X - 0.04, H - 0.014, 0.02], [X, H - 0.014, 0.042], [X + 0.04, H - 0.014, 0.02], [X + 0.012, H + YH + 0.004, 0.026]]],
        },
      ],
    },
  ],
};
