// A fixed (packed) bed catalytic reactor built in code, cut away: a vertical
// vessel with an inlet distributor, a bed of catalyst pellets on a support
// grid, inert balls above and below, and the product outlet at the bottom.
// Proportions simplified.
import { t, arrow } from '../lib/teaching.mjs';
import { seeded } from '../lib/shapes.mjs';
import { vessel, plate, pipe } from '../lib/process.mjs';

const R = 0.05, H = 0.2;

/** Pellets packed in layers between y0 and y1: a loose hexagonal stack, jittered. */
function pellets(THREE, rnd, y0, y1, size, rMax) {
  const out = [];
  const step = size * 2.1;
  for (let y = y0 + size, row = 0; y < y1 - size * 0.5; y += step * 0.85, row++) {
    for (let x = -rMax; x <= rMax; x += step) {
      for (let z = -rMax; z <= rMax; z += step * 0.87) {
        const px = x + (row % 2 ? step / 2 : 0) + (rnd() - 0.5) * size * 0.3, pz = z + (rnd() - 0.5) * size * 0.3;
        if (Math.hypot(px, pz) > rMax) continue;
        out.push(new THREE.IcosahedronGeometry(size, 0).translate(px, y + (rnd() - 0.5) * size * 0.3, pz));
      }
    }
  }
  return out;
}

export default {
  id: 'packed_bed_reactor',
  version: 1,
  order: 19,
  source: 'procedural',
  subject: 'Engineering',
  classes: [12],
  title: t('Packed bed catalytic reactor', 'पैक्ड बेड उत्प्रेरकी रिएक्टर', 'ಪ್ಯಾಕ್ಡ್ ಬೆಡ್ ವೇಗವರ್ಧಕ ರಿಯಾಕ್ಟರ್'),
  summary: t(
    'Gas flows down through a fixed bed of catalyst pellets and reacts on their surface (ammonia, methanol, sulphuric acid plants). Design uses the catalyst weight: W = F₀∫dX/(−r′A); the Ergun equation gives the pressure drop.',
    'गैस उत्प्रेरक गोलियों के स्थिर बेड से नीचे बहती है और उनकी सतह पर अभिक्रिया करती है (अमोनिया, मेथनॉल, सल्फ़्यूरिक अम्ल संयंत्र)। डिज़ाइन उत्प्रेरक भार से: W = F₀∫dX/(−r′A); एर्गन समीकरण दाब-पतन देता है।',
    'ಅನಿಲ ವೇಗವರ್ಧಕ ಗುಳಿಗೆಗಳ ಸ್ಥಿರ ಹಾಸಿನ ಮೂಲಕ ಕೆಳಗೆ ಹರಿದು ಅವುಗಳ ಮೇಲ್ಮೈಯಲ್ಲಿ ಕ್ರಿಯೆ ನಡೆಸುತ್ತದೆ (ಅಮೋನಿಯಾ, ಮೆಥನಾಲ್, ಸಲ್ಫ್ಯೂರಿಕ್ ಆಮ್ಲ ಘಟಕಗಳು). ವಿನ್ಯಾಸ ವೇಗವರ್ಧಕ ತೂಕದಿಂದ: W = F₀∫dX/(−r′A); ಎರ್ಗನ್ ಸಮೀಕರಣ ಒತ್ತಡ ಕುಸಿತ ನೀಡುತ್ತದೆ.',
  ),
  keywords: ['packed bed reactor', 'fixed bed reactor', 'catalytic reactor', 'catalyst', 'heterogeneous catalysis', 'ergun equation', 'pressure drop', 'reaction engineering', 'chemical engineering', 'haber process'],
  credit: 'Model built by KINETIX (proportions simplified)',
  build(THREE) {
    const rnd = seeded(7);
    return {
      vessel: vessel(THREE, R, 0.0025, 0, H),
      distributor: [plate(THREE, R * 0.55, H + 0.005, 0.003, 32), ...pipe(THREE, [[0, H + 0.005, 0], [0, H + 0.03, 0]], 0.006)],
      inert_top: pellets(THREE, rnd, H * 0.78, H * 0.86, 0.0065, R - 0.008),
      catalyst: pellets(THREE, rnd, H * 0.14, H * 0.78, 0.0055, R - 0.007),
      inert_bottom: pellets(THREE, rnd, H * 0.06, H * 0.14, 0.0065, R - 0.008),
      grid: [plate(THREE, R - 0.003, H * 0.055, 0.003, 40)],
      inlet: pipe(THREE, [[-0.1, H + 0.06, 0], [0, H + 0.06, 0], [0, H + 0.03, 0]], 0.007),
      outlet: pipe(THREE, [[0, -R * 0.5, 0], [0, -0.05, 0], [0.1, -0.05, 0]], 0.007),
      flow: [...arrow(THREE, [R + 0.03, H * 0.8, 0], [R + 0.03, H * 0.2, 0], 0.003)],
    };
  },
  groups: [
    { id: 'vessel', name: t('Vessel', 'पात्र', 'ಪಾತ್ರೆ') },
    { id: 'bed', name: t('The bed', 'बेड', 'ಹಾಸು') },
    { id: 'flows', name: t('Flows', 'प्रवाह', 'ಹರಿವುಗಳು') },
  ],
  parts: [
    {
      id: 'vessel', crease: 35, group: 'vessel', color: '#9fb3c4', metal: true, explode: [0, 0, -0.6],
      name: t('Pressure vessel', 'दाब पात्र', 'ಒತ್ತಡ ಪಾತ್ರೆ'),
      info: t('Thick walls: many catalytic reactors run at high pressure (ammonia at 150–250 bar).', 'मोटी दीवारें: कई उत्प्रेरकी रिएक्टर उच्च दाब पर चलते हैं (अमोनिया 150–250 bar पर)।', 'ದಪ್ಪ ಗೋಡೆಗಳು: ಹಲವು ವೇಗವರ್ಧಕ ರಿಯಾಕ್ಟರ್‌ಗಳು ಅಧಿಕ ಒತ್ತಡದಲ್ಲಿ ನಡೆಯುತ್ತವೆ (ಅಮೋನಿಯಾ 150–250 bar).'),
    },
    {
      id: 'distributor', crease: 35, group: 'vessel', color: '#7d8a96', metal: true, explode: [0, 1, 0],
      name: t('Inlet distributor', 'प्रवेश वितरक', 'ಒಳಹರಿವಿನ ವಿತರಕ'),
      info: t('Spreads the gas evenly over the bed so no part of the catalyst is starved or bypassed.', 'गैस को बेड पर बराबर फैलाता है ताकि उत्प्रेरक का कोई भाग अछूता न रहे।', 'ಅನಿಲವನ್ನು ಹಾಸಿನ ಮೇಲೆ ಸಮವಾಗಿ ಹರಡುತ್ತದೆ, ವೇಗವರ್ಧಕದ ಯಾವ ಭಾಗವೂ ಬಿಟ್ಟುಹೋಗದಂತೆ.'),
    },
    {
      id: 'inert_top', group: 'bed', color: '#d9d4c7', explode: [0, 0.7, 0],
      name: t('Inert ceramic balls (top)', 'निष्क्रिय सिरेमिक गेंदें (ऊपर)', 'ನಿಷ್ಕ್ರಿಯ ಸೆರಾಮಿಕ್ ಚೆಂಡುಗಳು (ಮೇಲೆ)'),
      info: t('Hold the catalyst down and help spread the flow.', 'उत्प्रेरक को दबाए रखती हैं और प्रवाह फैलाने में मदद करती हैं।', 'ವೇಗವರ್ಧಕವನ್ನು ಒತ್ತಿ ಹಿಡಿದು ಹರಿವು ಹರಡಲು ಸಹಾಯ ಮಾಡುತ್ತವೆ.'),
    },
    {
      id: 'catalyst', group: 'bed', color: '#4c6b3c', explode: [0, 0.3, 0],
      name: t('Catalyst pellets', 'उत्प्रेरक गोलियाँ', 'ವೇಗವರ್ಧಕ ಗುಳಿಗೆಗಳು'),
      info: t('Porous pellets (e.g. iron for ammonia, V₂O₅ for SO₂ → SO₃); the reaction happens on the huge surface inside their pores.', 'छिद्रिल गोलियाँ (जैसे अमोनिया के लिए लोहा, SO₂ → SO₃ के लिए V₂O₅); अभिक्रिया उनके छिद्रों के भीतर विशाल सतह पर होती है।', 'ರಂಧ್ರಯುಕ್ತ ಗುಳಿಗೆಗಳು (ಉದಾ. ಅಮೋನಿಯಾಗೆ ಕಬ್ಬಿಣ, SO₂ → SO₃ ಗೆ V₂O₅); ಕ್ರಿಯೆ ಅವುಗಳ ರಂಧ್ರಗಳೊಳಗಿನ ವಿಶಾಲ ಮೇಲ್ಮೈಯಲ್ಲಿ ನಡೆಯುತ್ತದೆ.'),
    },
    {
      id: 'inert_bottom', group: 'bed', color: '#d9d4c7', minor: true, explode: [0, -0.3, 0],
      name: t('Inert ceramic balls (bottom)', 'निष्क्रिय सिरेमिक गेंदें (नीचे)', 'ನಿಷ್ಕ್ರಿಯ ಸೆರಾಮಿಕ್ ಚೆಂಡುಗಳು (ಕೆಳಗೆ)'),
      info: t('Stop the small catalyst pellets falling through the grid.', 'छोटी उत्प्रेरक गोलियों को ग्रिड से गिरने से रोकती हैं।', 'ಸಣ್ಣ ವೇಗವರ್ಧಕ ಗುಳಿಗೆಗಳು ಜಾಲರಿಯ ಮೂಲಕ ಬೀಳದಂತೆ ತಡೆಯುತ್ತವೆ.'),
    },
    {
      id: 'grid', crease: 35, group: 'bed', color: '#6f7c88', metal: true, explode: [0, -0.6, 0],
      name: t('Support grid', 'आधार ग्रिड', 'ಆಧಾರ ಜಾಲರಿ'),
      info: t('Carries the weight of the bed and lets the gas through.', 'बेड का भार उठाता है और गैस को जाने देता है।', 'ಹಾಸಿನ ಭಾರ ಹೊರುತ್ತದೆ ಮತ್ತು ಅನಿಲವನ್ನು ಹಾದುಹೋಗಲು ಬಿಡುತ್ತದೆ.'),
    },
    {
      id: 'inlet', group: 'flows', color: '#2e7d32', explode: [-0.6, 1, 0],
      name: t('Feed gas inlet', 'फ़ीड गैस प्रवेश', 'ಫೀಡ್ ಅನಿಲ ಒಳಹರಿವು'),
      info: t('Preheated reactant gas enters at the top.', 'पहले से गर्म अभिकारक गैस ऊपर से आती है।', 'ಮೊದಲೇ ಬಿಸಿಮಾಡಿದ ಕ್ರಿಯಾಕಾರಕ ಅನಿಲ ಮೇಲಿನಿಂದ ಬರುತ್ತದೆ.'),
    },
    {
      id: 'outlet', group: 'flows', color: '#c62828', explode: [0.6, -1, 0],
      name: t('Product outlet', 'उत्पाद निकास', 'ಉತ್ಪನ್ನ ಹೊರಹರಿವು'),
      info: t('Gas leaves at a lower pressure: the bed costs pressure drop (Ergun equation).', 'गैस कम दाब पर निकलती है: बेड में दाब-पतन होता है (एर्गन समीकरण)।', 'ಅನಿಲ ಕಡಿಮೆ ಒತ್ತಡದಲ್ಲಿ ಹೊರಹೋಗುತ್ತದೆ: ಹಾಸು ಒತ್ತಡ ಕುಸಿತ ಉಂಟುಮಾಡುತ್ತದೆ (ಎರ್ಗನ್ ಸಮೀಕರಣ).'),
    },
    {
      id: 'flow', group: 'flows', color: '#7fc3ff', glow: 0.4, explode: [0.6, 0, 0],
      name: t('Gas flows down through the bed', 'गैस बेड से नीचे बहती है', 'ಅನಿಲ ಹಾಸಿನ ಮೂಲಕ ಕೆಳಗೆ ಹರಿಯುತ್ತದೆ'),
      info: t('Down-flow keeps the bed from lifting (fluidising).', 'नीचे की ओर प्रवाह बेड को उठने (तरलीकरण) से रोकता है।', 'ಕೆಳಮುಖ ಹರಿವು ಹಾಸು ಮೇಲೇಳದಂತೆ (ದ್ರವೀಕರಣ) ತಡೆಯುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.9, 0.5, 1.1] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0.1, 1, 0.15] },
  ],
  slices: [
    { id: 'cutaway', name: t('Cut away (a quarter out)', 'काटकर (एक चौथाई हटाकर)', 'ಕತ್ತರಿಸಿ (ಕಾಲು ಭಾಗ ತೆಗೆದು)'), normal: [-1, 0, 0], offset: 0, normal2: [0, 0, -1], view: 'front' },
    { id: 'half', name: t('Cut in half', 'आधा काटकर', 'ಅರ್ಧ ಕತ್ತರಿಸಿ'), normal: [0, 0, -1], offset: 0, view: 'front' },
  ],
  animations: [],
};
