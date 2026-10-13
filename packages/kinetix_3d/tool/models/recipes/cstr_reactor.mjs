// A continuous stirred-tank reactor (CSTR) built in code, cut away: a
// jacketed vessel with dished heads, four baffles, a motor and gearbox
// driving a shaft with a Rushton turbine and a pitched-blade impeller, the
// feed dip pipe, the product outlet and the coolant nozzles. "Run" turns the
// agitator. Proportions simplified.
import { t, box } from '../lib/teaching.mjs';
import { rod } from '../lib/shapes.mjs';
import { vessel, filled, shell, plate, pipe } from '../lib/process.mjs';

const R = 0.06, H = 0.15; // vessel radius and straight side (y 0..H)
const agitator = { axis: [0, 1, 0], speed: 140, centre: [0, 0, 0] };

function rushton(THREE, y) {
  const out = [plate(THREE, 0.017, y, 0.002, 24), plate(THREE, 0.005, y, 0.008, 12)];
  for (let k = 0; k < 6; k++) out.push(box(THREE, [0.011, 0.01, 0.0015], [0.019, y, 0]).rotateY((k * Math.PI) / 3));
  return out;
}

function pitched(THREE, y) {
  const out = [plate(THREE, 0.005, y, 0.01, 12)];
  for (let k = 0; k < 4; k++) out.push(box(THREE, [0.018, 0.009, 0.0015], [0.013, 0, 0]).rotateX(Math.PI / 4).translate(0, y, 0).rotateY((k * Math.PI) / 2));
  return out;
}

export default {
  id: 'cstr_reactor',
  version: 1,
  order: 17,
  source: 'procedural',
  subject: 'Engineering',
  classes: [12],
  title: t('Continuous stirred-tank reactor (CSTR)', 'सतत विलोडित टैंक रिएक्टर (CSTR)', 'ನಿರಂತರ ಕಲಕುವ ತೊಟ್ಟಿ ರಿಯಾಕ್ಟರ್ (CSTR)'),
  summary: t(
    'Feed flows in, the agitator keeps the tank perfectly mixed, and product leaves at the composition of the tank. A jacket carries coolant to take away the heat of reaction. Design equation: V = F₀X / (−rA).',
    'फ़ीड अंदर आती है, विलोडक टैंक को पूरी तरह मिला रखता है, और उत्पाद टैंक के संघटन पर बाहर निकलता है। जैकेट में शीतलक अभिक्रिया की ऊष्मा हटाता है। डिज़ाइन समीकरण: V = F₀X / (−rA)।',
    'ಫೀಡ್ ಒಳಗೆ ಬರುತ್ತದೆ, ಕಲಕಿ ತೊಟ್ಟಿಯನ್ನು ಸಂಪೂರ್ಣ ಮಿಶ್ರಣದಲ್ಲಿಡುತ್ತದೆ, ಉತ್ಪನ್ನ ತೊಟ್ಟಿಯ ಸಂಯೋಜನೆಯಲ್ಲೇ ಹೊರಹೋಗುತ್ತದೆ. ಜಾಕೆಟ್‌ನ ಶೀತಕ ಕ್ರಿಯೆಯ ಶಾಖ ತೆಗೆಯುತ್ತದೆ. ವಿನ್ಯಾಸ ಸಮೀಕರಣ: V = F₀X / (−rA).',
  ),
  keywords: ['cstr', 'continuous stirred tank reactor', 'stirred tank', 'mixed flow reactor', 'backmix reactor', 'chemical reactor', 'reaction engineering', 'agitator', 'impeller', 'rushton turbine', 'baffles', 'jacketed vessel', 'chemical engineering'],
  credit: 'Model built by KINETIX (proportions simplified)',
  crease: 35,
  build(THREE) {
    const baffles = [];
    for (let k = 0; k < 4; k++) baffles.push(box(THREE, [0.004, H * 0.85, 0.009], [R - 0.009, H * 0.48, 0]).rotateY((k * Math.PI) / 2 + Math.PI / 4));
    return {
      vessel: vessel(THREE, R, 0.0025, 0, H),
      jacket: shell(THREE, R + 0.004, R + 0.011, 0.004, H * 0.72),
      liquid: filled(THREE, R - 0.003, 0, H * 0.75),
      baffles,
      shaft: rod(THREE, [0, 0.01, 0], [0, H + 0.075, 0], 0.0028, 12),
      impeller_bottom: rushton(THREE, 0.025),
      impeller_top: pitched(THREE, H * 0.55),
      drive: [
        rod(THREE, [0, H + 0.03, 0], [0, H + 0.05, 0], 0.022, 24),
        box(THREE, [0.04, 0.026, 0.034], [0, H + 0.063, 0]),
        rod(THREE, [0, H + 0.076, 0], [0, H + 0.126, 0], 0.019, 24),
      ],
      feed: pipe(THREE, [[-0.12, H + 0.05, 0.02], [-0.032, H + 0.05, 0.02], [-0.032, H * 0.4, 0.02]], 0.0035),
      outlet: pipe(THREE, [[0, -0.03, 0], [0, -0.055, 0], [0.12, -0.055, 0]], 0.0045),
      coolant: [
        ...pipe(THREE, [[0, 0.012, R + 0.01], [0, 0.012, R + 0.05]], 0.003),
        ...pipe(THREE, [[0, H * 0.66, -R - 0.01], [0, H * 0.66, -R - 0.05]], 0.003),
      ],
      legs: [0, 1, 2].map((k) => rod(THREE, [R * 0.95 * Math.cos((k * 2 * Math.PI) / 3 + 0.5), 0.02, R * 0.95 * Math.sin((k * 2 * Math.PI) / 3 + 0.5)], [R * 1.1 * Math.cos((k * 2 * Math.PI) / 3 + 0.5), -0.075, R * 1.1 * Math.sin((k * 2 * Math.PI) / 3 + 0.5)], 0.003, 8)),
    };
  },
  groups: [
    { id: 'vessel', name: t('Vessel', 'पात्र', 'ಪಾತ್ರೆ') },
    { id: 'agitator', name: t('Agitator', 'विलोडक', 'ಕಲಕಿ') },
    { id: 'flows', name: t('Flows', 'प्रवाह', 'ಹರಿವುಗಳು') },
  ],
  parts: [
    {
      id: 'vessel', group: 'vessel', color: '#9fb3c4', metal: true, explode: [0, 0, 0],
      name: t('Vessel with dished heads', 'डिश्ड सिरों वाला पात्र', 'ಡಿಶ್ ತಲೆಗಳ ಪಾತ್ರೆ'),
      info: t('Stainless steel; the curved (2:1 elliptical) heads take the pressure better than flat ends.', 'स्टेनलेस स्टील; वक्र (2:1 दीर्घवृत्तीय) सिरे सपाट सिरों से बेहतर दाब सहते हैं।', 'ಸ್ಟೇನ್‌ಲೆಸ್ ಉಕ್ಕು; ಬಾಗಿದ (2:1 ದೀರ್ಘವೃತ್ತ) ತಲೆಗಳು ಚಪ್ಪಟೆ ತುದಿಗಳಿಗಿಂತ ಒತ್ತಡವನ್ನು ಚೆನ್ನಾಗಿ ತಡೆಯುತ್ತವೆ.'),
    },
    {
      id: 'jacket', group: 'vessel', color: '#d08a3e', metal: true, opacity: 0.85, explode: [0, 0, 1],
      name: t('Cooling jacket', 'शीतलन जैकेट', 'ತಂಪಾಗಿಸುವ ಜಾಕೆಟ್'),
      info: t('Coolant flows between the jacket and the wall and removes the heat of an exothermic reaction: Q = UA·ΔT.', 'शीतलक जैकेट और दीवार के बीच बहता है और ऊष्माक्षेपी अभिक्रिया की ऊष्मा हटाता है: Q = UA·ΔT।', 'ಶೀತಕ ಜಾಕೆಟ್ ಮತ್ತು ಗೋಡೆಯ ನಡುವೆ ಹರಿದು ಉಷ್ಣವಿಸರ್ಜಕ ಕ್ರಿಯೆಯ ಶಾಖ ತೆಗೆಯುತ್ತದೆ: Q = UA·ΔT.'),
    },
    {
      id: 'liquid', group: 'vessel', color: '#5aa9e6', opacity: 0.35, cap: false,
      name: t('Reacting liquid (well mixed)', 'अभिक्रियाशील द्रव (अच्छी तरह मिश्रित)', 'ಕ್ರಿಯೆಯ ದ್ರವ (ಚೆನ್ನಾಗಿ ಮಿಶ್ರ)'),
      info: t('Perfect mixing: the concentration and temperature are the same everywhere, and equal to the outlet\'s.', 'पूर्ण मिश्रण: सांद्रता और ताप हर जगह समान, और निकास के बराबर।', 'ಸಂಪೂರ್ಣ ಮಿಶ್ರಣ: ಸಾಂದ್ರತೆ ಮತ್ತು ತಾಪ ಎಲ್ಲೆಡೆ ಒಂದೇ, ಹೊರಹರಿವಿನದಕ್ಕೆ ಸಮ.'),
    },
    {
      id: 'baffles', group: 'vessel', color: '#7d8a96', metal: true, explode: [0, 0, 0.6],
      name: t('Baffles (4)', 'बैफ़ल (4)', 'ಬ್ಯಾಫಲ್‌ಗಳು (4)'),
      info: t('Strips on the wall that stop the liquid swirling round as one body, so the impeller really mixes it.', 'दीवार पर पट्टियाँ जो द्रव को एक साथ घूमने से रोकती हैं, ताकि इंपेलर उसे सचमुच मिलाए।', 'ದ್ರವ ಒಂದೇ ಸುತ್ತು ತಿರುಗದಂತೆ ತಡೆಯುವ ಗೋಡೆಯ ಪಟ್ಟಿಗಳು; ಹೀಗೆ ಇಂಪೆಲ್ಲರ್ ನಿಜವಾಗಿ ಮಿಶ್ರಮಾಡುತ್ತದೆ.'),
    },
    {
      id: 'shaft', group: 'agitator', color: '#b8bec4', metal: true, minor: true, explode: [0, 1.2, 0], spin: agitator,
      name: t('Agitator shaft', 'विलोडक शाफ़्ट', 'ಕಲಕಿ ಶಾಫ್ಟ್'),
      info: t('Carries the impellers; sealed where it passes through the top head.', 'इंपेलरों को थामता है; ऊपरी सिरे से निकलने की जगह सील किया जाता है।', 'ಇಂಪೆಲ್ಲರ್‌ಗಳನ್ನು ಹೊತ್ತಿದೆ; ಮೇಲಿನ ತಲೆಯ ಮೂಲಕ ಹಾದುಹೋಗುವಲ್ಲಿ ಸೀಲ್ ಮಾಡಲಾಗಿದೆ.'),
    },
    {
      id: 'impeller_bottom', group: 'agitator', color: '#e0a93a', metal: true, explode: [0, 0.4, 0], spin: agitator,
      name: t('Rushton turbine', 'रशटन टर्बाइन', 'ರಶ್ಟನ್ ಟರ್ಬೈನ್'),
      info: t('Six flat blades on a disc: pushes liquid outwards (radial flow) and breaks up gas bubbles.', 'डिस्क पर छह सपाट ब्लेड: द्रव को बाहर की ओर धकेलता है (त्रिज्य प्रवाह) और गैस के बुलबुले तोड़ता है।', 'ಬಿಲ್ಲೆಯ ಮೇಲೆ ಆರು ಚಪ್ಪಟೆ ಬ್ಲೇಡ್‌ಗಳು: ದ್ರವವನ್ನು ಹೊರಕ್ಕೆ ತಳ್ಳುತ್ತದೆ (ತ್ರಿಜ್ಯ ಹರಿವು), ಅನಿಲ ಗುಳ್ಳೆಗಳನ್ನು ಒಡೆಯುತ್ತದೆ.'),
    },
    {
      id: 'impeller_top', group: 'agitator', color: '#e0a93a', metal: true, explode: [0, 0.8, 0], spin: agitator,
      name: t('Pitched-blade impeller', 'तिरछे ब्लेड वाला इंपेलर', 'ಓರೆ ಬ್ಲೇಡ್ ಇಂಪೆಲ್ಲರ್'),
      info: t('Blades at 45° pump the liquid up and down (axial flow), mixing the top with the bottom.', '45° पर ब्लेड द्रव को ऊपर-नीचे पंप करते हैं (अक्षीय प्रवाह), ऊपर और नीचे को मिलाते हैं।', '45° ಬ್ಲೇಡ್‌ಗಳು ದ್ರವವನ್ನು ಮೇಲೆ-ಕೆಳಗೆ ತಳ್ಳುತ್ತವೆ (ಅಕ್ಷೀಯ ಹರಿವು), ಮೇಲು-ಕೆಳಗನ್ನು ಬೆರೆಸುತ್ತವೆ.'),
    },
    {
      id: 'drive', group: 'agitator', color: '#3d6fa8', metal: true, explode: [0, 1.6, 0],
      name: t('Motor and gearbox', 'मोटर और गियरबॉक्स', 'ಮೋಟಾರ್ ಮತ್ತು ಗೇರ್‌ಬಾಕ್ಸ್'),
      info: t('An electric motor; the gearbox brings it down to the agitator speed (about 50–300 rpm).', 'विद्युत मोटर; गियरबॉक्स उसकी चाल विलोडक की चाल (लगभग 50–300 rpm) तक घटाता है।', 'ವಿದ್ಯುತ್ ಮೋಟಾರ್; ಗೇರ್‌ಬಾಕ್ಸ್ ವೇಗವನ್ನು ಕಲಕಿಯ ವೇಗಕ್ಕೆ (ಸುಮಾರು 50–300 rpm) ಇಳಿಸುತ್ತದೆ.'),
    },
    {
      id: 'feed', group: 'flows', color: '#2e7d32', explode: [-0.8, 0.4, 0],
      name: t('Feed inlet (dip pipe)', 'फ़ीड प्रवेश (डिप पाइप)', 'ಫೀಡ್ ಒಳಹರಿವು (ಡಿಪ್ ಪೈಪ್)'),
      info: t('Fresh reactant at F₀ and CA0 enters below the surface, near the impeller, and is mixed in at once.', 'F₀ और CA0 पर ताज़ा अभिकारक सतह के नीचे, इंपेलर के पास आता है और तुरंत मिल जाता है।', 'F₀ ಮತ್ತು CA0 ನಲ್ಲಿ ಹೊಸ ಕ್ರಿಯಾಕಾರಕ ಮೇಲ್ಮೈ ಕೆಳಗೆ, ಇಂಪೆಲ್ಲರ್ ಬಳಿ ಬಂದು ತಕ್ಷಣ ಬೆರೆಯುತ್ತದೆ.'),
    },
    {
      id: 'outlet', group: 'flows', color: '#c62828', explode: [0.6, -0.6, 0],
      name: t('Product outlet', 'उत्पाद निकास', 'ಉತ್ಪನ್ನ ಹೊರಹರಿವು'),
      info: t('Leaves at the tank\'s own concentration CA = CA0(1 − X): this is why a CSTR needs more volume than a PFR for the same conversion.', 'टैंक की अपनी सांद्रता CA = CA0(1 − X) पर निकलता है: इसीलिए समान रूपांतरण के लिए CSTR को PFR से अधिक आयतन चाहिए।', 'ತೊಟ್ಟಿಯದೇ ಸಾಂದ್ರತೆ CA = CA0(1 − X) ನಲ್ಲಿ ಹೊರಹೋಗುತ್ತದೆ: ಹಾಗಾಗಿ ಅದೇ ಪರಿವರ್ತನೆಗೆ CSTRಗೆ PFRಗಿಂತ ಹೆಚ್ಚು ಗಾತ್ರ ಬೇಕು.'),
    },
    {
      id: 'coolant', group: 'flows', color: '#1565c0', explode: [0, 0, 1.3],
      name: t('Coolant in and out', 'शीतलक प्रवेश और निकास', 'ಶೀತಕ ಒಳ ಮತ್ತು ಹೊರ'),
      info: t('Cooling water enters at the bottom of the jacket and leaves warmer at the top.', 'ठंडा पानी जैकेट के नीचे से आता है और ऊपर से गर्म होकर निकलता है।', 'ತಂಪು ನೀರು ಜಾಕೆಟ್‌ನ ಕೆಳಗಿನಿಂದ ಬಂದು ಮೇಲಿನಿಂದ ಬಿಸಿಯಾಗಿ ಹೊರಹೋಗುತ್ತದೆ.'),
    },
    {
      id: 'legs', group: 'vessel', color: '#5b6670', metal: true, minor: true, explode: [0, -1, 0],
      name: t('Support legs', 'आधार पाद', 'ಆಧಾರ ಕಾಲುಗಳು'),
      info: t('Hold the vessel above the floor so the bottom outlet can drain.', 'पात्र को फ़र्श से ऊपर रखते हैं ताकि नीचे का निकास खाली हो सके।', 'ಕೆಳಗಿನ ಹೊರಹರಿವು ಖಾಲಿಯಾಗಲು ಪಾತ್ರೆಯನ್ನು ನೆಲದಿಂದ ಮೇಲೆ ಹಿಡಿಯುತ್ತವೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.9, 0.55, 1.1] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0.1, 1, 0.15] },
  ],
  slices: [
    { id: 'cutaway', name: t('Cut away (a quarter out)', 'काटकर (एक चौथाई हटाकर)', 'ಕತ್ತರಿಸಿ (ಕಾಲು ಭಾಗ ತೆಗೆದು)'), normal: [-1, 0, 0], offset: 0, normal2: [0, 0, -1], view: 'front' },
    { id: 'half', name: t('Cut in half', 'आधा काटकर', 'ಅರ್ಧ ಕತ್ತರಿಸಿ'), normal: [0, 0, -1], offset: 0, view: 'front' },
  ],
  animations: [{ id: 'run', kind: 'orbit', name: t('Run the agitator', 'विलोडक चलाएँ', 'ಕಲಕಿ ಚಲಾಯಿಸಿ') }],
};
