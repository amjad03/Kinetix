// A tray distillation column built in code, cut away: the shell, sieve
// trays with their downcomers on alternate sides, the feed tray, the
// overhead condenser and reflux drum, and the kettle reboiler at the
// bottom. Proportions simplified.
import { t, box, arrow } from '../lib/teaching.mjs';
import { rod } from '../lib/shapes.mjs';
import { vessel, tray, layX, pipe } from '../lib/process.mjs';

const R = 0.045, H = 0.42, TRAYS = 10;
const trayY = (k) => 0.04 + ((k + 0.5) * (H - 0.08)) / TRAYS;
const FEED = 5; // the feed enters above this tray (counted from the bottom)

export default {
  id: 'distillation_column',
  version: 1,
  order: 21,
  source: 'procedural',
  subject: 'Engineering',
  classes: [12],
  title: t('Tray distillation column', 'ट्रे आसवन स्तंभ', 'ಟ್ರೇ ಆಸವನ ಸ್ತಂಭ'),
  summary: t(
    'Vapour rises through holes in each tray and bubbles through the liquid flowing across it; on every tray the more volatile component moves into the vapour. The condenser and reflux at the top and the reboiler at the bottom keep it going. The McCabe–Thiele diagram counts the trays.',
    'वाष्प हर ट्रे के छिद्रों से ऊपर उठती है और उस पर बहते द्रव में बुलबुले बनाती है; हर ट्रे पर अधिक वाष्पशील घटक वाष्प में जाता है। ऊपर संघनित्र और रिफ़्लक्स तथा नीचे रीबॉयलर इसे चालू रखते हैं। मैकेब–थीले आरेख ट्रे गिनता है।',
    'ಆವಿ ಪ್ರತಿ ಟ್ರೇಯ ರಂಧ್ರಗಳ ಮೂಲಕ ಮೇಲೇರಿ ಅದರ ಮೇಲೆ ಹರಿಯುವ ದ್ರವದಲ್ಲಿ ಗುಳ್ಳೆಯಾಗುತ್ತದೆ; ಪ್ರತಿ ಟ್ರೇಯಲ್ಲಿ ಹೆಚ್ಚು ಬಾಷ್ಪಶೀಲ ಘಟಕ ಆವಿಗೆ ಸರಿಯುತ್ತದೆ. ಮೇಲಿನ ಸಾಂದ್ರಕ ಮತ್ತು ರಿಫ್ಲಕ್ಸ್, ಕೆಳಗಿನ ರೀಬಾಯ್ಲರ್ ಇದನ್ನು ನಡೆಸುತ್ತವೆ. ಮೆಕೇಬ್–ಥೀಲೆ ರೇಖಾಚಿತ್ರ ಟ್ರೇಗಳನ್ನು ಎಣಿಸುತ್ತದೆ.',
  ),
  keywords: ['distillation', 'distillation column', 'fractionating column', 'tray column', 'sieve tray', 'downcomer', 'reflux', 'condenser', 'reboiler', 'mccabe thiele', 'mass transfer', 'separation', 'chemical engineering', 'fractional distillation'],
  credit: 'Model built by KINETIX (proportions simplified)',
  crease: 35,
  build(THREE) {
    const trays = [], downcomers = [];
    for (let k = 0; k < TRAYS; k++) {
      const side = k % 2 ? 1 : -1, y = trayY(k);
      trays.push(tray(THREE, R - 0.002, y, 0.0025, 0.72, 36).rotateY(side > 0 ? 0 : Math.PI));
      // The downcomer: a plate hanging from the tray's open edge almost to the tray below.
      const w = 2 * Math.sqrt((R - 0.002) ** 2 - (0.72 * (R - 0.002)) ** 2);
      downcomers.push(box(THREE, [0.002, (H - 0.08) / TRAYS * 0.8, w], [side * 0.72 * (R - 0.002), y - ((H - 0.08) / TRAYS) * 0.4, 0]));
    }
    const top = H + R * 0.5, cx = 0.13;
    return {
      shell: vessel(THREE, R, 0.0025, 0, H),
      trays,
      downcomers,
      feed: pipe(THREE, [[-0.14, trayY(FEED) + 0.012, 0], [-R, trayY(FEED) + 0.012, 0]], 0.005),
      overhead: pipe(THREE, [[0, top, 0], [0, top + 0.04, 0], [cx, top + 0.04, 0], [cx, top + 0.015, 0]], 0.006),
      condenser: [layX(vessel(THREE, 0.018, 0.002, -0.04, 0.04, { dish: 0.4, seg: 24 })).translate(cx, top, 0)],
      reflux_drum: [layX(vessel(THREE, 0.016, 0.002, -0.03, 0.03, { dish: 0.4, seg: 24 })).translate(cx, top - 0.07, 0), ...pipe(THREE, [[cx, top - 0.018, 0], [cx, top - 0.054, 0]], 0.004)],
      reflux: pipe(THREE, [[cx - 0.03, top - 0.07, 0], [0.07, top - 0.07, 0], [0.07, trayY(TRAYS - 1) + 0.012, 0], [R, trayY(TRAYS - 1) + 0.012, 0]], 0.004),
      distillate: pipe(THREE, [[cx + 0.03, top - 0.07, 0], [cx + 0.08, top - 0.07, 0]], 0.004),
      reboiler: [layX(vessel(THREE, 0.024, 0.002, -0.045, 0.045, { dish: 0.4, seg: 24 })).translate(cx, -0.03, 0), ...pipe(THREE, [[0, -R * 0.5, 0], [0, -0.03, 0], [cx - 0.06, -0.03, 0]], 0.005), ...pipe(THREE, [[cx, -0.006, 0], [cx, 0.03, 0], [R, 0.03, 0]], 0.006)],
      bottoms: pipe(THREE, [[cx + 0.06, -0.03, 0], [cx + 0.11, -0.03, 0]], 0.004),
      vapour: [...arrow(THREE, [-0.075, 0.08, 0.0], [-0.075, H - 0.06, 0], 0.003)],
      skirt: [rod(THREE, [0, -R * 0.5, 0], [0, -0.07, 0], R * 0.9, 32)],
    };
  },
  groups: [
    { id: 'column', name: t('Column', 'स्तंभ', 'ಸ್ತಂಭ') },
    { id: 'top', name: t('Condenser and reflux', 'संघनित्र और रिफ़्लक्स', 'ಸಾಂದ್ರಕ ಮತ್ತು ರಿಫ್ಲಕ್ಸ್') },
    { id: 'bottom', name: t('Reboiler', 'रीबॉयलर', 'ರೀಬಾಯ್ಲರ್') },
  ],
  parts: [
    {
      id: 'shell', group: 'column', color: '#9fb3c4', metal: true, opacity: 0.75, explode: [0, 0, -1],
      name: t('Column shell', 'स्तंभ कवच', 'ಸ್ತಂಭದ ಕವಚ'),
      info: t('A tall vessel; its diameter is set by the vapour flow (flooding), its height by the number of trays.', 'एक ऊँचा पात्र; इसका व्यास वाष्प प्रवाह (फ़्लडिंग) से और ऊँचाई ट्रे की संख्या से तय होती है।', 'ಎತ್ತರದ ಪಾತ್ರೆ; ಅದರ ವ್ಯಾಸ ಆವಿಯ ಹರಿವಿನಿಂದ (ಪ್ರವಾಹ), ಎತ್ತರ ಟ್ರೇಗಳ ಸಂಖ್ಯೆಯಿಂದ ನಿರ್ಧಾರ.'),
    },
    {
      id: 'trays', group: 'column', color: '#c99a45', metal: true, explode: [0, 0, 0],
      name: t('Sieve trays', 'छलनी ट्रे', 'ಜರಡಿ ಟ್ರೇಗಳು'),
      info: t('Perforated plates. Each one is a stage where vapour and liquid come close to equilibrium; real trays reach 50–80% of it (tray efficiency).', 'छिद्रित प्लेटें। हर एक एक चरण है जहाँ वाष्प और द्रव साम्यावस्था के क़रीब आते हैं; असली ट्रे इसका 50–80% पाती हैं (ट्रे दक्षता)।', 'ರಂಧ್ರ ಫಲಕಗಳು. ಪ್ರತಿಯೊಂದೂ ಆವಿ ಮತ್ತು ದ್ರವ ಸಮತೋಲನದ ಹತ್ತಿರ ಬರುವ ಹಂತ; ನಿಜವಾದ ಟ್ರೇಗಳು ಅದರ 50–80% ತಲುಪುತ್ತವೆ (ಟ್ರೇ ದಕ್ಷತೆ).'),
    },
    {
      id: 'downcomers', group: 'column', color: '#7d8a96', metal: true, explode: [0, 0, 0.6],
      name: t('Downcomers', 'डाउनकमर', 'ಡೌನ್‌ಕಮರ್‌ಗಳು'),
      info: t('Liquid flows across a tray, over the weir and down the downcomer to the tray below, on alternate sides.', 'द्रव ट्रे के आर-पार बहकर वियर के ऊपर से डाउनकमर द्वारा नीचे की ट्रे पर जाता है, बारी-बारी से दोनों ओर।', 'ದ್ರವ ಟ್ರೇಯ ಅಡ್ಡಲಾಗಿ ಹರಿದು ಅಣೆಯ ಮೇಲಿಂದ ಡೌನ್‌ಕಮರ್ ಮೂಲಕ ಕೆಳಗಿನ ಟ್ರೇಗೆ, ಪರ್ಯಾಯ ಬದಿಗಳಲ್ಲಿ, ಇಳಿಯುತ್ತದೆ.'),
    },
    {
      id: 'feed', group: 'column', color: '#2e7d32', explode: [-0.8, 0, 0],
      name: t('Feed', 'फ़ीड', 'ಫೀಡ್'),
      info: t('The mixture enters at the feed tray: above it is the rectifying section, below it the stripping section.', 'मिश्रण फ़ीड ट्रे पर आता है: उसके ऊपर परिशोधन खंड, नीचे स्ट्रिपिंग खंड।', 'ಮಿಶ್ರಣ ಫೀಡ್ ಟ್ರೇಯಲ್ಲಿ ಬರುತ್ತದೆ: ಅದರ ಮೇಲೆ ಶುದ್ಧೀಕರಣ ವಿಭಾಗ, ಕೆಳಗೆ ಸ್ಟ್ರಿಪ್ಪಿಂಗ್ ವಿಭಾಗ.'),
    },
    {
      id: 'vapour', group: 'column', color: '#7fc3ff', glow: 0.4, explode: [-0.6, 0, 0],
      name: t('Vapour rises, liquid falls', 'वाष्प ऊपर, द्रव नीचे', 'ಆವಿ ಮೇಲಕ್ಕೆ, ದ್ರವ ಕೆಳಕ್ಕೆ'),
      info: t('Counter-current contact: the vapour gets richer in the light component going up, the liquid richer in the heavy one going down.', 'प्रतिधारा संपर्क: ऊपर जाते हुए वाष्प में हल्का घटक बढ़ता है, नीचे आते द्रव में भारी घटक।', 'ಪ್ರತಿಪ್ರವಾಹ ಸಂಪರ್ಕ: ಮೇಲೇರುವ ಆವಿಯಲ್ಲಿ ಹಗುರ ಘಟಕ, ಕೆಳಗಿಳಿಯುವ ದ್ರವದಲ್ಲಿ ಭಾರ ಘಟಕ ಹೆಚ್ಚುತ್ತದೆ.'),
    },
    {
      id: 'overhead', group: 'top', color: '#e57373', minor: true, explode: [0, 0.6, 0],
      name: t('Overhead vapour line', 'ऊपरी वाष्प लाइन', 'ಮೇಲಿನ ಆವಿ ಮಾರ್ಗ'),
      info: t('Carries the top vapour to the condenser.', 'ऊपरी वाष्प को संघनित्र तक ले जाती है।', 'ಮೇಲಿನ ಆವಿಯನ್ನು ಸಾಂದ್ರಕಕ್ಕೆ ಒಯ್ಯುತ್ತದೆ.'),
    },
    {
      id: 'condenser', group: 'top', color: '#3d6fa8', metal: true, explode: [0.6, 0.8, 0],
      name: t('Condenser', 'संघनित्र', 'ಸಾಂದ್ರಕ'),
      info: t('Cooling water turns the top vapour back into liquid.', 'ठंडा पानी ऊपरी वाष्प को फिर द्रव में बदलता है।', 'ತಂಪು ನೀರು ಮೇಲಿನ ಆವಿಯನ್ನು ಮತ್ತೆ ದ್ರವವಾಗಿಸುತ್ತದೆ.'),
    },
    {
      id: 'reflux_drum', group: 'top', color: '#5b84b1', metal: true, explode: [0.8, 0.4, 0],
      name: t('Reflux drum', 'रिफ़्लक्स ड्रम', 'ರಿಫ್ಲಕ್ಸ್ ಡ್ರಮ್'),
      info: t('Holds the condensate; part goes back as reflux, the rest is the distillate.', 'संघनित द्रव रखता है; कुछ रिफ़्लक्स बनकर लौटता है, बाक़ी आसुत है।', 'ಸಾಂದ್ರಿತ ದ್ರವ ಹಿಡಿದಿಡುತ್ತದೆ; ಒಂದು ಭಾಗ ರಿಫ್ಲಕ್ಸ್ ಆಗಿ ಮರಳುತ್ತದೆ, ಉಳಿದದ್ದು ಡಿಸ್ಟಿಲೇಟ್.'),
    },
    {
      id: 'reflux', group: 'top', color: '#ef6c00', explode: [0.4, 0.3, 0],
      name: t('Reflux back to the top tray', 'ऊपरी ट्रे पर लौटता रिफ़्लक्स', 'ಮೇಲಿನ ಟ್ರೇಗೆ ಮರಳುವ ರಿಫ್ಲಕ್ಸ್'),
      info: t('Reflux ratio R = L/D. More reflux means fewer trays but more energy; at total reflux the trays are fewest (Nmin, Fenske).', 'रिफ़्लक्स अनुपात R = L/D। अधिक रिफ़्लक्स से कम ट्रे पर अधिक ऊर्जा; पूर्ण रिफ़्लक्स पर सबसे कम ट्रे (Nmin, फ़ेंस्के)।', 'ರಿಫ್ಲಕ್ಸ್ ಅನುಪಾತ R = L/D. ಹೆಚ್ಚು ರಿಫ್ಲಕ್ಸ್ ಎಂದರೆ ಕಡಿಮೆ ಟ್ರೇ, ಹೆಚ್ಚು ಶಕ್ತಿ; ಪೂರ್ಣ ರಿಫ್ಲಕ್ಸ್‌ನಲ್ಲಿ ಅತಿ ಕಡಿಮೆ ಟ್ರೇ (Nmin, ಫೆನ್ಸ್ಕೆ).'),
    },
    {
      id: 'distillate', group: 'top', color: '#f9a825', explode: [1, 0.4, 0],
      name: t('Distillate (top product)', 'आसुत (ऊपरी उत्पाद)', 'ಡಿಸ್ಟಿಲೇಟ್ (ಮೇಲಿನ ಉತ್ಪನ್ನ)'),
      info: t('Rich in the more volatile component (mole fraction xD).', 'अधिक वाष्पशील घटक से भरपूर (मोल अंश xD)।', 'ಹೆಚ್ಚು ಬಾಷ್ಪಶೀಲ ಘಟಕ ಸಮೃದ್ಧ (ಮೋಲ್ ಭಿನ್ನ xD).'),
    },
    {
      id: 'reboiler', group: 'bottom', color: '#b23c17', metal: true, explode: [0.8, -0.6, 0],
      name: t('Reboiler', 'रीबॉयलर', 'ರೀಬಾಯ್ಲರ್'),
      info: t('Steam boils part of the bottom liquid; the vapour goes back into the column and drives the separation.', 'भाप तली के द्रव का कुछ भाग उबालती है; वाष्प स्तंभ में लौटकर पृथक्करण चलाती है।', 'ಹಬೆ ಕೆಳಗಿನ ದ್ರವದ ಒಂದು ಭಾಗ ಕುದಿಸುತ್ತದೆ; ಆವಿ ಸ್ತಂಭಕ್ಕೆ ಮರಳಿ ಬೇರ್ಪಡಿಕೆಯನ್ನು ನಡೆಸುತ್ತದೆ.'),
    },
    {
      id: 'bottoms', group: 'bottom', color: '#6d4c41', explode: [1, -0.6, 0],
      name: t('Bottoms (bottom product)', 'तली उत्पाद', 'ಕೆಳಗಿನ ಉತ್ಪನ್ನ'),
      info: t('Rich in the less volatile component (mole fraction xW).', 'कम वाष्पशील घटक से भरपूर (मोल अंश xW)।', 'ಕಡಿಮೆ ಬಾಷ್ಪಶೀಲ ಘಟಕ ಸಮೃದ್ಧ (ಮೋಲ್ ಭಿನ್ನ xW).'),
    },
    {
      id: 'skirt', group: 'column', color: '#5b6670', metal: true, minor: true, explode: [0, -1, 0],
      name: t('Skirt support', 'स्कर्ट आधार', 'ಸ್ಕರ್ಟ್ ಆಧಾರ'),
      info: t('Carries the column on its foundation.', 'स्तंभ को उसकी नींव पर टिकाता है।', 'ಸ್ತಂಭವನ್ನು ಅಡಿಪಾಯದ ಮೇಲೆ ಹೊರುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.5, 0.35, 1] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0.1, 1, 0.15] },
  ],
  slices: [
    { id: 'half', name: t('Cut in half', 'आधा काटकर', 'ಅರ್ಧ ಕತ್ತರಿಸಿ'), normal: [0, 0, -1], offset: 0, view: 'front' },
  ],
  animations: [],
};
