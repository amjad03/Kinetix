// A transformer, built in code: two coils on a soft-iron core, an AC
// supply and a bulb. Two versions: step-up (more turns on the secondary)
// and step-down (fewer).
import { rod, blob } from '../lib/shapes.mjs';
import { t, arrow, helix, box, straightWire } from '../lib/teaching.mjs';

const CW = 0.1, CH = 0.08, LIMB = 0.016; // core outer width and height, limb width
const LX = CW / 2 - LIMB / 2; // the limbs' centres at x = ±LX
const COIL_R = 0.0125, COIL_Y = 0.023;
const FEW = 5, MANY = 12;
const Z = COIL_R; // the coils' leads, the supply and the bulb are this far in front
const SUPPLY = [-0.1, 0, Z], LOAD = [0.1, 0, Z];

/** The ends of a coil on the limb at x = [x] (where its leads start): its turns start and end at the front. */
const ends = (x) => [[x, -COIL_Y, Z], [x, COIL_Y, Z]];

// The magnetic flux's way round the core (clockwise from the front).
const FLUX = [[-LX, -0.025, 0], [-LX, 0.025, 0], [-LX + 0.008, CH / 2 - LIMB / 2, 0], [0, CH / 2 - LIMB / 2, 0], [LX - 0.008, CH / 2 - LIMB / 2, 0], [LX, 0.025, 0], [LX, -0.025, 0], [LX - 0.008, -CH / 2 + LIMB / 2, 0], [0, -CH / 2 + LIMB / 2, 0], [-LX + 0.008, -CH / 2 + LIMB / 2, 0], [-LX, -0.026, 0]];

export default {
  id: 'transformer',
  version: 1,
  order: 4,
  source: 'procedural',
  subject: 'Physics',
  classes: [12],
  title: t('Transformer', 'ट्रांसफ़ॉर्मर', 'ಪರಿವರ್ತಕ (ಟ್ರಾನ್ಸ್‌ಫಾರ್ಮರ್)'),
  summary: t(
    'An alternating current in the primary coil makes a changing magnetic flux in the iron core, which induces a voltage in the secondary coil. Vs / Vp = Ns / Np.',
    'प्राथमिक कुंडली में प्रत्यावर्ती धारा लोहे के क्रोड में बदलता चुंबकीय फ्लक्स बनाती है, जो द्वितीयक कुंडली में वोल्टता प्रेरित करता है। Vs / Vp = Ns / Np।',
    'ಪ್ರಾಥಮಿಕ ಸುರುಳಿಯಲ್ಲಿನ ಪರ್ಯಾಯ ವಿದ್ಯುತ್ ಕಬ್ಬಿಣದ ಕೋರ್‌ನಲ್ಲಿ ಬದಲಾಗುವ ಕಾಂತೀಯ ಫ್ಲಕ್ಸ್ ಉಂಟುಮಾಡುತ್ತದೆ, ಅದು ದ್ವಿತೀಯ ಸುರುಳಿಯಲ್ಲಿ ವೋಲ್ಟೇಜ್ ಪ್ರೇರಿಸುತ್ತದೆ. Vs / Vp = Ns / Np.',
  ),
  keywords: ['transformer', 'step up transformer', 'step down transformer', 'mutual induction', 'electromagnetic induction', 'alternating current', 'turns ratio', 'primary coil', 'secondary coil', 'power transmission'],
  credit: 'Model built by KINETIX',
  variants: [
    { id: 'step_up', name: t('Step-up', 'उच्चायी', 'ಏರಿಕೆ') },
    { id: 'step_down', name: t('Step-down', 'अपचायी', 'ಇಳಿಕೆ') },
  ],
  groups: [
    { id: 'core', name: t('Core and coils', 'क्रोड और कुंडलियाँ', 'ಕೋರ್ ಮತ್ತು ಸುರುಳಿಗಳು') },
    { id: 'circuit', name: t('Supply and load', 'स्रोत और भार', 'ಮೂಲ ಮತ್ತು ಹೊರೆ') },
    { id: 'ideas', name: t('Magnetic flux', 'चुंबकीय फ्लक्स', 'ಕಾಂತೀಯ ಫ್ಲಕ್ಸ್') },
  ],
  build(THREE) {
    const d = LIMB;
    const out = {
      core: [
        box(THREE, [LIMB, CH, d], [-LX, 0, 0]),
        box(THREE, [LIMB, CH, d], [LX, 0, 0]),
        box(THREE, [CW - 2 * LIMB, LIMB, d], [0, CH / 2 - LIMB / 2, 0]),
        box(THREE, [CW - 2 * LIMB, LIMB, d], [0, -CH / 2 + LIMB / 2, 0]),
      ],
      supply: [box(THREE, [0.022, 0.034, 0.02], SUPPLY), rod(THREE, [SUPPLY[0], SUPPLY[1], Z + 0.01], [SUPPLY[0], SUPPLY[1], Z + 0.0115], 0.007, 24)],
      bulb: [blob(THREE, [LOAD[0], LOAD[1] + 0.006, Z], 0.01, 0.012, 0.01, 4), rod(THREE, [LOAD[0], LOAD[1] - 0.014, Z], [LOAD[0], LOAD[1] - 0.004, Z], 0.005, 20)],
      flux: [],
    };
    for (let i = 1; i < FLUX.length; i += 2) out.flux.push(...arrow(THREE, FLUX[i - 1], FLUX[i], 0.0009));
    for (const [v, np, ns] of [['step_up', FEW, MANY], ['step_down', MANY, FEW]]) {
      out[`${v}_primary`] = helix(THREE, [-LX, -COIL_Y, 0], [-LX, COIL_Y, 0], COIL_R, np, 0.0016);
      out[`${v}_secondary`] = helix(THREE, [LX, -COIL_Y, 0], [LX, COIL_Y, 0], COIL_R, ns, 0.0016);
    }
    const [p0, p1] = ends(-LX), [s0, s1] = ends(LX);
    out.wires = [
      ...straightWire(THREE, [p1, [SUPPLY[0] + 0.004, COIL_Y, Z], [SUPPLY[0] + 0.004, 0.017, Z]], 0.0011),
      ...straightWire(THREE, [p0, [SUPPLY[0] + 0.004, -COIL_Y, Z], [SUPPLY[0] + 0.004, -0.017, Z]], 0.0011),
      ...straightWire(THREE, [s1, [LOAD[0] + 0.012, COIL_Y, Z], [LOAD[0] + 0.012, -0.009, Z], [LOAD[0] + 0.005, -0.009, Z]], 0.0011),
      ...straightWire(THREE, [s0, [LOAD[0] - 0.012, -COIL_Y, Z], [LOAD[0] - 0.012, -0.012, Z], [LOAD[0] - 0.005, -0.012, Z]], 0.0011),
    ];
    return out;
  },
  parts: [
    {
      id: 'core', group: 'core', color: '#5d6670', matte: true, explode: [0, 0, -0.6],
      name: t('Soft-iron core', 'नर्म लोहे का क्रोड', 'ಮೃದು ಕಬ್ಬಿಣದ ಕೋರ್'),
      info: t('Links the two coils: almost all the magnetic flux of the primary passes through the secondary. It is made of thin insulated sheets (laminated) to cut energy lost as heat.', 'दोनों कुंडलियों को जोड़ता है: प्राथमिक का लगभग पूरा चुंबकीय फ्लक्स द्वितीयक से गुज़रता है। ऊष्मा में ऊर्जा हानि घटाने के लिए यह पतली विद्युतरोधी पट्टियों (पटलित) से बना होता है।', 'ಎರಡು ಸುರುಳಿಗಳನ್ನು ಜೋಡಿಸುತ್ತದೆ: ಪ್ರಾಥಮಿಕದ ಬಹುತೇಕ ಎಲ್ಲಾ ಕಾಂತೀಯ ಫ್ಲಕ್ಸ್ ದ್ವಿತೀಯದ ಮೂಲಕ ಹೋಗುತ್ತದೆ. ಉಷ್ಣವಾಗಿ ಶಕ್ತಿ ನಷ್ಟ ಕಡಿಮೆ ಮಾಡಲು ಇದು ತೆಳು ನಿರೋಧಿತ ಹಾಳೆಗಳಿಂದ (ಪದರಗಳಿಂದ) ಮಾಡಲ್ಪಟ್ಟಿದೆ.'),
    },
    {
      id: 'step_up_primary', variant: 'step_up', group: 'core', color: '#c8783a', explode: [-0.8, 0, 0.5],
      name: t(`Primary coil (${FEW} turns)`, `प्राथमिक कुंडली (${FEW} फेरे)`, `ಪ್ರಾಥಮಿಕ ಸುರುಳಿ (${FEW} ಸುತ್ತುಗಳು)`),
      info: t('Joined to the AC supply. Its changing current makes a changing magnetic flux in the core.', 'AC स्रोत से जुड़ी। इसकी बदलती धारा क्रोड में बदलता चुंबकीय फ्लक्स बनाती है।', 'AC ಮೂಲಕ್ಕೆ ಜೋಡಿಸಲಾಗಿದೆ. ಇದರ ಬದಲಾಗುವ ವಿದ್ಯುತ್ ಕೋರ್‌ನಲ್ಲಿ ಬದಲಾಗುವ ಕಾಂತೀಯ ಫ್ಲಕ್ಸ್ ಉಂಟುಮಾಡುತ್ತದೆ.'),
    },
    {
      id: 'step_up_secondary', variant: 'step_up', group: 'core', color: '#e0a93a', explode: [0.8, 0, 0.5],
      name: t(`Secondary coil (${MANY} turns)`, `द्वितीयक कुंडली (${MANY} फेरे)`, `ದ್ವಿತೀಯ ಸುರುಳಿ (${MANY} ಸುತ್ತುಗಳು)`),
      info: t(`More turns than the primary, so the voltage is stepped up: Vs = Vp × ${MANY}/${FEW}. The current is stepped down by the same ratio, so the power stays (almost) the same. Power stations step up the voltage to send electricity far with little loss.`, `प्राथमिक से अधिक फेरे, इसलिए वोल्टता बढ़ती है: Vs = Vp × ${MANY}/${FEW}। धारा उसी अनुपात में घटती है, इसलिए शक्ति (लगभग) वही रहती है। बिजलीघर कम हानि से दूर तक बिजली भेजने के लिए वोल्टता बढ़ाते हैं।`, `ಪ್ರಾಥಮಿಕಕ್ಕಿಂತ ಹೆಚ್ಚು ಸುತ್ತುಗಳು, ಹಾಗಾಗಿ ವೋಲ್ಟೇಜ್ ಏರುತ್ತದೆ: Vs = Vp × ${MANY}/${FEW}. ವಿದ್ಯುತ್ ಅದೇ ಅನುಪಾತದಲ್ಲಿ ಇಳಿಯುತ್ತದೆ, ಹಾಗಾಗಿ ಸಾಮರ್ಥ್ಯ (ಬಹುತೇಕ) ಅದೇ. ಕಡಿಮೆ ನಷ್ಟದಲ್ಲಿ ದೂರಕ್ಕೆ ವಿದ್ಯುತ್ ಕಳುಹಿಸಲು ವಿದ್ಯುತ್ ಸ್ಥಾವರಗಳು ವೋಲ್ಟೇಜ್ ಏರಿಸುತ್ತವೆ.`),
    },
    {
      id: 'step_down_primary', variant: 'step_down', group: 'core', color: '#c8783a', explode: [-0.8, 0, 0.5],
      name: t(`Primary coil (${MANY} turns)`, `प्राथमिक कुंडली (${MANY} फेरे)`, `ಪ್ರಾಥಮಿಕ ಸುರುಳಿ (${MANY} ಸುತ್ತುಗಳು)`),
      info: t('Joined to the AC supply. Its changing current makes a changing magnetic flux in the core.', 'AC स्रोत से जुड़ी। इसकी बदलती धारा क्रोड में बदलता चुंबकीय फ्लक्स बनाती है।', 'AC ಮೂಲಕ್ಕೆ ಜೋಡಿಸಲಾಗಿದೆ. ಇದರ ಬದಲಾಗುವ ವಿದ್ಯುತ್ ಕೋರ್‌ನಲ್ಲಿ ಬದಲಾಗುವ ಕಾಂತೀಯ ಫ್ಲಕ್ಸ್ ಉಂಟುಮಾಡುತ್ತದೆ.'),
    },
    {
      id: 'step_down_secondary', variant: 'step_down', group: 'core', color: '#e0a93a', explode: [0.8, 0, 0.5],
      name: t(`Secondary coil (${FEW} turns)`, `द्वितीयक कुंडली (${FEW} फेरे)`, `ದ್ವಿತೀಯ ಸುರುಳಿ (${FEW} ಸುತ್ತುಗಳು)`),
      info: t(`Fewer turns than the primary, so the voltage is stepped down: Vs = Vp × ${FEW}/${MANY}. Phone chargers and the transformers near our homes step the voltage down.`, `प्राथमिक से कम फेरे, इसलिए वोल्टता घटती है: Vs = Vp × ${FEW}/${MANY}। फ़ोन चार्जर और घरों के पास लगे ट्रांसफ़ॉर्मर वोल्टता घटाते हैं।`, `ಪ್ರಾಥಮಿಕಕ್ಕಿಂತ ಕಡಿಮೆ ಸುತ್ತುಗಳು, ಹಾಗಾಗಿ ವೋಲ್ಟೇಜ್ ಇಳಿಯುತ್ತದೆ: Vs = Vp × ${FEW}/${MANY}. ಫೋನ್ ಚಾರ್ಜರ್‌ಗಳು ಮತ್ತು ಮನೆಗಳ ಹತ್ತಿರದ ಪರಿವರ್ತಕಗಳು ವೋಲ್ಟೇಜ್ ಇಳಿಸುತ್ತವೆ.`),
    },
    {
      id: 'supply', group: 'circuit', color: '#2f9e6a', explode: [-1, 0, 0],
      name: t('AC supply', 'AC स्रोत', 'AC ಮೂಲ'),
      info: t('A transformer works only with alternating current: a steady (DC) current makes no change in flux, so nothing is induced.', 'ट्रांसफ़ॉर्मर केवल प्रत्यावर्ती धारा से काम करता है: स्थिर (DC) धारा से फ्लक्स नहीं बदलता, इसलिए कुछ प्रेरित नहीं होता।', 'ಪರಿವರ್ತಕ ಪರ್ಯಾಯ ವಿದ್ಯುತ್ತಿನಿಂದ ಮಾತ್ರ ಕೆಲಸ ಮಾಡುತ್ತದೆ: ಸ್ಥಿರ (DC) ವಿದ್ಯುತ್ ಫ್ಲಕ್ಸ್ ಬದಲಿಸುವುದಿಲ್ಲ, ಹಾಗಾಗಿ ಏನೂ ಪ್ರೇರಿತವಾಗುವುದಿಲ್ಲ.'),
    },
    {
      id: 'bulb', group: 'circuit', color: '#ffe58a', glow: 0.6, explode: [1, 0, 0],
      name: t('Bulb (load)', 'बल्ब (भार)', 'ಬಲ್ಬ್ (ಹೊರೆ)'),
      info: t('Lit by the current induced in the secondary. The two coils are not joined by any wire.', 'द्वितीयक में प्रेरित धारा से जलता है। दोनों कुंडलियाँ किसी तार से जुड़ी नहीं हैं।', 'ದ್ವಿತೀಯದಲ್ಲಿ ಪ್ರೇರಿತ ವಿದ್ಯುತ್ತಿನಿಂದ ಉರಿಯುತ್ತದೆ. ಎರಡು ಸುರುಳಿಗಳನ್ನು ಯಾವ ತಂತಿಯೂ ಜೋಡಿಸಿಲ್ಲ.'),
    },
    {
      id: 'wires', group: 'circuit', color: '#d8d2c4', minor: true, explode: [0, 0, 0],
      name: t('Connecting wires', 'संयोजक तार', 'ಸಂಪರ್ಕ ತಂತಿಗಳು'),
      info: t('Join the supply to the primary, and the secondary to the bulb.', 'स्रोत को प्राथमिक से, और द्वितीयक को बल्ब से जोड़ते हैं।', 'ಮೂಲವನ್ನು ಪ್ರಾಥಮಿಕಕ್ಕೆ, ದ್ವಿತೀಯವನ್ನು ಬಲ್ಬ್‌ಗೆ ಜೋಡಿಸುತ್ತವೆ.'),
    },
    {
      id: 'flux', group: 'ideas', color: '#7fc3ff', hidden: true, glow: 0.3, explode: [0, 0, 0.8],
      name: t('Magnetic flux', 'चुंबकीय फ्लक्स', 'ಕಾಂತೀಯ ಫ್ಲಕ್ಸ್'),
      info: t('Runs round the core, through both coils. It changes direction with the alternating current, and this changing flux induces the voltage in the secondary (mutual induction).', 'क्रोड में घूमता है, दोनों कुंडलियों से होकर। यह प्रत्यावर्ती धारा के साथ दिशा बदलता है, और यही बदलता फ्लक्स द्वितीयक में वोल्टता प्रेरित करता है (अन्योन्य प्रेरण)।', 'ಕೋರ್‌ನ ಸುತ್ತ, ಎರಡೂ ಸುರುಳಿಗಳ ಮೂಲಕ ಸಾಗುತ್ತದೆ. ಪರ್ಯಾಯ ವಿದ್ಯುತ್ತಿನೊಂದಿಗೆ ದಿಕ್ಕು ಬದಲಿಸುತ್ತದೆ, ಈ ಬದಲಾಗುವ ಫ್ಲಕ್ಸ್ ದ್ವಿತೀಯದಲ್ಲಿ ವೋಲ್ಟೇಜ್ ಪ್ರೇರಿಸುತ್ತದೆ (ಪರಸ್ಪರ ಪ್ರೇರಣೆ).'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.2, 0.25, 1] },
    { id: 'above', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.4] },
  ],
  slices: [],
  animations: [
    {
      id: 'how', kind: 'flow',
      name: t('How it works', 'यह कैसे काम करता है', 'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ'),
      steps: [
        {
          color: '#ffe066', highlight: ['supply', 'step_up_primary', 'step_down_primary'],
          text: t('Alternating current from the supply flows round the primary coil.', 'स्रोत से प्रत्यावर्ती धारा प्राथमिक कुंडली में बहती है।', 'ಮೂಲದಿಂದ ಪರ್ಯಾಯ ವಿದ್ಯುತ್ ಪ್ರಾಥಮಿಕ ಸುರುಳಿಯಲ್ಲಿ ಹರಿಯುತ್ತದೆ.'),
          paths: [[[SUPPLY[0] + 0.004, 0.017, Z], [SUPPLY[0] + 0.004, COIL_Y, Z], [-LX, COIL_Y, Z], [-LX - COIL_R, 0, 0], [-LX, -COIL_Y, Z], [SUPPLY[0] + 0.004, -COIL_Y, Z], [SUPPLY[0] + 0.004, -0.017, Z]]],
        },
        {
          color: '#7fc3ff', highlight: ['core', 'flux'],
          text: t('It makes a magnetic flux in the core that keeps changing size and direction.', 'यह क्रोड में चुंबकीय फ्लक्स बनाती है जिसका परिमाण और दिशा बदलते रहते हैं।', 'ಇದು ಕೋರ್‌ನಲ್ಲಿ ಗಾತ್ರ ಮತ್ತು ದಿಕ್ಕು ಬದಲಾಗುತ್ತಲೇ ಇರುವ ಕಾಂತೀಯ ಫ್ಲಕ್ಸ್ ಉಂಟುಮಾಡುತ್ತದೆ.'),
          paths: [FLUX],
        },
        {
          color: '#ffe066', highlight: ['step_up_secondary', 'step_down_secondary', 'bulb'],
          text: t('The changing flux through the secondary induces an alternating voltage there, and the bulb lights. Vs / Vp = Ns / Np.', 'द्वितीयक से गुज़रता बदलता फ्लक्स उसमें प्रत्यावर्ती वोल्टता प्रेरित करता है, और बल्ब जल उठता है। Vs / Vp = Ns / Np।', 'ದ್ವಿತೀಯದ ಮೂಲಕ ಬದಲಾಗುವ ಫ್ಲಕ್ಸ್ ಅಲ್ಲಿ ಪರ್ಯಾಯ ವೋಲ್ಟೇಜ್ ಪ್ರೇರಿಸುತ್ತದೆ, ಬಲ್ಬ್ ಉರಿಯುತ್ತದೆ. Vs / Vp = Ns / Np.'),
          paths: [[[LX, COIL_Y, Z], [LOAD[0] + 0.012, COIL_Y, Z], [LOAD[0] + 0.012, -0.009, Z], [LOAD[0], 0, Z], [LOAD[0] - 0.012, -0.012, Z], [LOAD[0] - 0.012, -COIL_Y, Z], [LX, -COIL_Y, Z]]],
        },
      ],
    },
  ],
};
