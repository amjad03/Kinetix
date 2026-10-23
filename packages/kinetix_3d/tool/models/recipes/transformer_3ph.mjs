// A three-phase core-type transformer built in code: three stepped limbs on
// common yokes, each with its LV winding inside and its HV winding outside,
// in the phase colours (R, Y, B), and the HV and LV bushings.
import { t } from '../lib/teaching.mjs';
import { limb, yoke, winding, bushing } from '../lib/transformers.mjs';

const P = 0.11, W = 0.03, H = 0.075, YH = 0.028;
const XS = [-P, 0, P];
const phases = [
  ['r', '#c62828', t('R phase', 'R कला', 'R ಹಂತ')],
  ['y', '#d4a017', t('Y phase', 'Y कला', 'Y ಹಂತ')],
  ['b', '#1565c0', t('B phase', 'B कला', 'B ಹಂತ')],
];

export default {
  id: 'transformer_3ph',
  version: 1,
  order: 13,
  source: 'procedural',
  subject: 'Engineering',
  classes: [12],
  title: t('Three-phase core-type transformer', 'त्रि-कला कोर-प्रकार ट्रांसफ़ॉर्मर', 'ಮೂರು-ಹಂತದ ಕೋರ್-ಮಾದರಿ ಪರಿವರ್ತಕ'),
  summary: t(
    'One limb per phase on common yokes. The three fluxes are 120° apart, so they add up to zero at every instant and no return limb is needed. The windings can be connected star or delta on each side (Dyn11 for distribution).',
    'हर कला के लिए एक भुजा, साझा योक पर। तीनों फ्लक्स 120° के अंतर पर हैं, इसलिए हर क्षण उनका योग शून्य है और लौटने वाली भुजा नहीं चाहिए। हर ओर कुंडलियाँ स्टार या डेल्टा में जोड़ी जा सकती हैं (वितरण के लिए Dyn11)।',
    'ಪ್ರತಿ ಹಂತಕ್ಕೆ ಒಂದು ಕಂಬ, ಹಂಚಿಕೆಯ ಯೋಕ್‌ಗಳ ಮೇಲೆ. ಮೂರು ಫ್ಲಕ್ಸ್‌ಗಳು 120° ಅಂತರದಲ್ಲಿವೆ, ಹಾಗಾಗಿ ಪ್ರತಿ ಕ್ಷಣ ಅವುಗಳ ಮೊತ್ತ ಸೊನ್ನೆ; ಮರಳುವ ಕಂಬ ಬೇಕಿಲ್ಲ. ಪ್ರತಿ ಬದಿಯ ಸುರುಳಿಗಳನ್ನು ಸ್ಟಾರ್ ಅಥವಾ ಡೆಲ್ಟಾ ಆಗಿ ಜೋಡಿಸಬಹುದು (ವಿತರಣೆಗೆ Dyn11).',
  ),
  keywords: ['three phase transformer', 'core type transformer', 'distribution transformer', 'star delta', 'dyn11', 'vector group', 'hv winding', 'lv winding', 'electrical machines', 'power systems', 'substation'],
  credit: 'Model built by Zynetix (proportions simplified)',
  crease: 35,
  build(THREE) {
    const out = {
      core: [...XS.flatMap((x) => limb(THREE, x, W, -H, H)), ...yoke(THREE, -P - W / 2, P + W / 2, H + YH / 2, W, YH), ...yoke(THREE, -P - W / 2, P + W / 2, -H - YH / 2, W, YH)],
      lv_windings: XS.map((x) => winding(THREE, x, 0.0205, 0.028, -H + 0.006, H - 0.006)),
      hv_bushings: XS.flatMap((x) => bushing(THREE, [x, H + YH, 0.022], 0.05)),
      lv_bushings: XS.flatMap((x) => bushing(THREE, [x + 0.028, H + YH, -0.02], 0.026)),
    };
    for (const [p] of phases) {
      const x = XS[{ r: 0, y: 1, b: 2 }[p]];
      out[`hv_${p}`] = winding(THREE, x, 0.031, 0.045, -H + 0.012, H - 0.012);
    }
    return out;
  },
  groups: [
    { id: 'core', name: t('Core', 'क्रोड', 'ಕೋರ್') },
    { id: 'windings', name: t('Windings', 'कुंडलियाँ', 'ಸುರುಳಿಗಳು') },
  ],
  parts: [
    {
      id: 'core', group: 'core', color: '#7d8791', metal: true, explode: [0, 0, -1],
      name: t('Three-limb laminated core', 'तीन-भुजा पटलित क्रोड', 'ಮೂರು-ಕಂಬದ ಪದರಗೊಳಿಸಿದ ಕೋರ್'),
      info: t('Stepped limbs and yokes of CRGO sheets; the middle limb\'s flux path is a little shorter, so its magnetising current is a little smaller.', 'CRGO चादरों की सोपानी भुजाएँ और योक; बीच वाली भुजा का फ्लक्स पथ थोड़ा छोटा है, इसलिए उसकी चुंबकन धारा थोड़ी कम है।', 'CRGO ಹಾಳೆಗಳ ಮೆಟ್ಟಿಲು ಕಂಬಗಳು ಮತ್ತು ಯೋಕ್‌ಗಳು; ನಡುವಿನ ಕಂಬದ ಫ್ಲಕ್ಸ್ ಮಾರ್ಗ ಸ್ವಲ್ಪ ಚಿಕ್ಕದು, ಹಾಗಾಗಿ ಅದರ ಕಾಂತೀಕರಣ ವಿದ್ಯುತ್ ಸ್ವಲ್ಪ ಕಡಿಮೆ.'),
    },
    {
      id: 'lv_windings', group: 'windings', color: '#d98a2b', explode: [0, 0, 0.5],
      name: t('LV windings (inner)', 'निम्न-वोल्टता कुंडलियाँ (भीतरी)', 'ಕಡಿಮೆ-ವೋಲ್ಟೇಜ್ ಸುರುಳಿಗಳು (ಒಳಗಿನ)'),
      info: t('Often star-connected with the neutral brought out (the "yn" of Dyn11) for a 415 V, four-wire supply.', 'प्रायः स्टार में, उदासीन बाहर निकाला हुआ (Dyn11 का "yn"), 415 V चार-तार आपूर्ति के लिए।', 'ಸಾಮಾನ್ಯವಾಗಿ ಸ್ಟಾರ್ ಸಂಪರ್ಕ, ತಟಸ್ಥ ಹೊರತಂದು (Dyn11 ನ "yn"), 415 V ನಾಲ್ಕು-ತಂತಿ ಪೂರೈಕೆಗೆ.'),
    },
    ...phases.map(([p, color, name], i) => ({
      id: `hv_${p}`, group: 'windings', color, opacity: 0.92, explode: [i - 1, 0, 1.1],
      name: t(`HV winding, ${name.en}`, `उच्च-वोल्टता कुंडली, ${name.hi}`, `ಹೆಚ್ಚು-ವೋಲ್ಟೇಜ್ ಸುರುಳಿ, ${name.kn}`),
      info: t('Outer winding of this phase; the three HV windings are often delta-connected (the "D" of Dyn11).', 'इस कला की बाहरी कुंडली; तीनों उच्च-वोल्टता कुंडलियाँ प्रायः डेल्टा में जुड़ी होती हैं (Dyn11 का "D")।', 'ಈ ಹಂತದ ಹೊರ ಸುರುಳಿ; ಮೂರು ಹೆಚ್ಚು-ವೋಲ್ಟೇಜ್ ಸುರುಳಿಗಳು ಸಾಮಾನ್ಯವಾಗಿ ಡೆಲ್ಟಾ ಸಂಪರ್ಕ (Dyn11 ನ "D").'),
    })),
    {
      id: 'hv_bushings', group: 'windings', color: '#c9b79c', explode: [0, 1, 0.4],
      name: t('HV bushings', 'उच्च-वोल्टता बुशिंग', 'ಹೆಚ್ಚು-ವೋಲ್ಟೇಜ್ ಬುಶಿಂಗ್‌ಗಳು'),
      info: t('One per phase: the 11 kV side of a distribution transformer.', 'हर कला के लिए एक: वितरण ट्रांसफ़ॉर्मर का 11 kV पक्ष।', 'ಪ್ರತಿ ಹಂತಕ್ಕೆ ಒಂದು: ವಿತರಣಾ ಪರಿವರ್ತಕದ 11 kV ಬದಿ.'),
    },
    {
      id: 'lv_bushings', group: 'windings', color: '#c9b79c', minor: true, explode: [0, 1, -0.4],
      name: t('LV bushings', 'निम्न-वोल्टता बुशिंग', 'ಕಡಿಮೆ-ವೋಲ್ಟೇಜ್ ಬುಶಿಂಗ್‌ಗಳು'),
      info: t('The 433 V side (no-load), with the neutral.', '433 V पक्ष (बिना भार), उदासीन सहित।', '433 V ಬದಿ (ಹೊರೆ ಇಲ್ಲದೆ), ತಟಸ್ಥದೊಂದಿಗೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.45, 0.4, 1] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.35] },
  ],
  slices: [
    { id: 'front_cut', name: t('Cut through the windings', 'कुंडलियों के बीच से काट', 'ಸುರುಳಿಗಳ ಮೂಲಕ ಕತ್ತರಿಸಿ'), normal: [0, 0, -1], offset: 0, view: 'front' },
    { id: 'plan_cut', name: t('Plan: concentric windings', 'ऊपरी काट: संकेंद्री कुंडलियाँ', 'ಮೇಲ್ನೋಟ ಕತ್ತರಿಸು: ಏಕಕೇಂದ್ರ ಸುರುಳಿಗಳು'), normal: [0, -1, 0], offset: 0, view: 'top' },
  ],
  animations: [],
};
