// Dispersion of white light by a glass prism, built in code. The rays are
// traced with Snell's law; the spread between colours is made larger than
// in real glass (as textbook pictures do) so that it can be seen.
import { rod } from '../lib/shapes.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

// The prism: an equilateral triangle (apex up) 0.09 wide, 0.05 deep.
const A = [-0.045, -0.026], B = [0.045, -0.026], C = [0, 0.052];
const DEPTH = 0.05;
const SCREEN_X = 0.17;
const START = [-0.15, -0.024];
const ENTRY = [A[0] + (C[0] - A[0]) * 0.42, A[1] + (C[1] - A[1]) * 0.42];

// Refractive index per colour, red to violet (exaggerated).
const COLOURS = [
  ['red', '#ff3b30', 1.45, t('Red', 'लाल', 'ಕೆಂಪು'), t('Bends least: its speed in glass changes least.', 'सबसे कम मुड़ता है: काँच में इसकी चाल सबसे कम बदलती है।', 'ಅತಿ ಕಡಿಮೆ ಬಾಗುತ್ತದೆ: ಗಾಜಿನಲ್ಲಿ ಇದರ ವೇಗ ಅತಿ ಕಡಿಮೆ ಬದಲಾಗುತ್ತದೆ.')],
  ['orange', '#ff9500', 1.475, t('Orange', 'नारंगी', 'ಕಿತ್ತಳೆ'), t('Between red and yellow.', 'लाल और पीले के बीच।', 'ಕೆಂಪು ಮತ್ತು ಹಳದಿಯ ನಡುವೆ.')],
  ['yellow', '#ffe11a', 1.5, t('Yellow', 'पीला', 'ಹಳದಿ'), t('Between orange and green.', 'नारंगी और हरे के बीच।', 'ಕಿತ್ತಳೆ ಮತ್ತು ಹಸಿರಿನ ನಡುವೆ.')],
  ['green', '#34c759', 1.525, t('Green', 'हरा', 'ಹಸಿರು'), t('In the middle of the spectrum.', 'स्पेक्ट्रम के बीच में।', 'ವರ್ಣಪಟಲದ ಮಧ್ಯದಲ್ಲಿ.')],
  ['blue', '#1e90ff', 1.55, t('Blue', 'नीला', 'ನೀಲಿ'), t('Between green and indigo.', 'हरे और जामुनी के बीच।', 'ಹಸಿರು ಮತ್ತು ಇಂಡಿಗೋ ನಡುವೆ.')],
  ['indigo', '#4b3cd6', 1.575, t('Indigo', 'जामुनी', 'ಇಂಡಿಗೋ'), t('Between blue and violet.', 'नीले और बैंगनी के बीच।', 'ನೀಲಿ ಮತ್ತು ನೇರಳೆಯ ನಡುವೆ.')],
  ['violet', '#a23cf0', 1.6, t('Violet', 'बैंगनी', 'ನೇರಳೆ'), t('Bends most: its speed in glass changes most.', 'सबसे अधिक मुड़ता है: काँच में इसकी चाल सबसे अधिक बदलती है।', 'ಅತಿ ಹೆಚ್ಚು ಬಾಗುತ್ತದೆ: ಗಾಜಿನಲ್ಲಿ ಇದರ ವೇಗ ಅತಿ ಹೆಚ್ಚು ಬದಲಾಗುತ್ತದೆ.')],
];

const norm = ([x, y]) => {
  const l = Math.hypot(x, y);
  return [x / l, y / l];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
/** Snell's law: direction [d] meeting a surface with normal [n] (against d), index ratio [r] = n1 / n2. */
function refract(d, n, r) {
  const cosi = -dot(n, d);
  const k = 1 - r * r * (1 - cosi * cosi);
  if (k < 0) throw new Error('total internal reflection');
  const c = r * cosi - Math.sqrt(k);
  return norm([r * d[0] + c * n[0], r * d[1] + c * n[1]]);
}
/** Where the ray from [p] along [d] meets the line through [a] and [b]. */
function meet(p, d, a, b) {
  const e = [b[0] - a[0], b[1] - a[1]];
  const den = d[0] * -e[1] + d[1] * e[0];
  const s = ((a[0] - p[0]) * -e[1] + (a[1] - p[1]) * e[0]) / den;
  return [p[0] + d[0] * s, p[1] + d[1] * s];
}
const outward = (a, b) => norm([b[1] - a[1], -(b[0] - a[0])]);
const leftNormal = outward(C, A); // points out of the left face
const rightNormal = outward(B, C); // points out of the right face

const d0 = norm([ENTRY[0] - START[0], ENTRY[1] - START[1]]);
const rays = COLOURS.map(([id, color, n]) => {
  const inside = refract(d0, leftNormal, 1 / n);
  const exit = meet(ENTRY, inside, B, C);
  const out = refract(inside, [-rightNormal[0], -rightNormal[1]], n);
  const hit = [SCREEN_X - 0.003, exit[1] + ((SCREEN_X - 0.003 - exit[0]) * out[1]) / out[0]];
  return { id, color, n, exit, hit };
});

export default {
  id: 'prism',
  version: 1,
  order: 2,
  source: 'procedural',
  subject: 'Physics',
  classes: [10, 12],
  title: t('Dispersion by a prism', 'प्रिज़्म द्वारा वर्ण-विक्षेपण', 'ಪಟ್ಟಕದಿಂದ ವರ್ಣ ವಿಭಜನೆ'),
  summary: t(
    'White light is a mix of colours. Entering glass, each colour bends by a different amount, so a prism spreads white light into a spectrum: VIBGYOR.',
    'श्वेत प्रकाश रंगों का मिश्रण है। काँच में प्रवेश करने पर हर रंग अलग मात्रा में मुड़ता है, इसलिए प्रिज़्म श्वेत प्रकाश को स्पेक्ट्रम (बैं जा नी ह पी ना ला) में फैला देता है।',
    'ಬಿಳಿ ಬೆಳಕು ಬಣ್ಣಗಳ ಮಿಶ್ರಣ. ಗಾಜನ್ನು ಪ್ರವೇಶಿಸುವಾಗ ಪ್ರತಿ ಬಣ್ಣ ಬೇರೆ ಬೇರೆ ಪ್ರಮಾಣದಲ್ಲಿ ಬಾಗುತ್ತದೆ; ಹಾಗಾಗಿ ಪಟ್ಟಕ ಬಿಳಿ ಬೆಳಕನ್ನು ವರ್ಣಪಟಲವಾಗಿ (VIBGYOR) ಹರಡುತ್ತದೆ.',
  ),
  keywords: ['prism', 'dispersion', 'spectrum', 'vibgyor', 'white light', 'refraction', 'rainbow', 'the human eye and the colourful world', 'light', 'ray optics'],
  credit: 'Model built by KINETIX',
  groups: [
    { id: 'setup', name: t('Prism and screen', 'प्रिज़्म और पर्दा', 'ಪಟ್ಟಕ ಮತ್ತು ಪರದೆ') },
    { id: 'light', name: t('Light', 'प्रकाश', 'ಬೆಳಕು') },
  ],
  build(THREE) {
    const s = new THREE.Shape();
    s.moveTo(...A);
    s.lineTo(...B);
    s.lineTo(...C);
    s.closePath();
    const prism = new THREE.ExtrudeGeometry(s, { depth: DEPTH, bevelEnabled: false }).translate(0, 0, -DEPTH / 2);
    const out = {
      prism,
      screen: new THREE.BoxGeometry(0.004, 0.11, 0.07).translate(SCREEN_X, -0.04, 0),
      white_light: rod(THREE, [...START, 0], [...ENTRY, 0], 0.0022, 16),
    };
    for (const r of rays) {
      // The ray inside and after the prism, and its band of colour on the screen.
      const band = new THREE.BoxGeometry(0.0012, 0.0062, 0.036).translate(SCREEN_X - 0.0026, r.hit[1], 0);
      out[r.id] = [rod(THREE, [...ENTRY, 0], [...r.exit, 0], 0.0011, 10), rod(THREE, [...r.exit, 0], [...r.hit, 0], 0.0013, 10), band];
    }
    return out;
  },
  parts: [
    {
      id: 'prism', group: 'setup', color: '#bfe3ff', opacity: 0.32, explode: [0, 0, 0],
      name: t('Glass prism', 'काँच का प्रिज़्म', 'ಗಾಜಿನ ಪಟ್ಟಕ'),
      info: t('A triangular block of glass. Light bends at both slanting faces, towards the base.', 'काँच का त्रिकोणीय टुकड़ा। प्रकाश दोनों तिरछे फलकों पर आधार की ओर मुड़ता है।', 'ತ್ರಿಕೋನಾಕಾರದ ಗಾಜಿನ ತುಂಡು. ಬೆಳಕು ಎರಡೂ ಓರೆ ಮುಖಗಳಲ್ಲಿ ತಳದ ಕಡೆಗೆ ಬಾಗುತ್ತದೆ.'),
    },
    {
      id: 'screen', group: 'setup', color: '#eceae4', matte: true, explode: [0, 0, 0],
      name: t('White screen', 'सफ़ेद पर्दा', 'ಬಿಳಿ ಪರದೆ'),
      info: t('The band of colours seen on it is the spectrum of white light.', 'इस पर दिखने वाली रंगों की पट्टी श्वेत प्रकाश का स्पेक्ट्रम है।', 'ಇದರ ಮೇಲೆ ಕಾಣುವ ಬಣ್ಣಗಳ ಪಟ್ಟಿಯೇ ಬಿಳಿ ಬೆಳಕಿನ ವರ್ಣಪಟಲ.'),
    },
    {
      id: 'white_light', group: 'light', color: '#ffffff', glow: 0.8, explode: [0, 0, 0],
      name: t('White light', 'श्वेत प्रकाश', 'ಬಿಳಿ ಬೆಳಕು'),
      info: t('Sunlight: all the colours travelling together.', 'सूर्य का प्रकाश: सभी रंग एक साथ चलते हुए।', 'ಸೂರ್ಯನ ಬೆಳಕು: ಎಲ್ಲಾ ಬಣ್ಣಗಳು ಒಟ್ಟಿಗೆ ಸಾಗುತ್ತವೆ.'),
    },
    ...COLOURS.map(([id, color, , name, info], k) => {
      const r = rays[k];
      // Labelled where the ray is in open air, two-thirds of the way to the screen.
      const at = [r.exit[0] + (r.hit[0] - r.exit[0]) * 0.7, r.exit[1] + (r.hit[1] - r.exit[1]) * 0.7, 0];
      return { id, group: 'light', color, glow: 0.75, explode: [0, 0, (k - 3) * 0.5], labelAt: at, name, info };
    }),
  ],
  views: [
    { id: 'front', name: t('Front (as in the book)', 'सामने से (पुस्तक जैसा)', 'ಮುಂಭಾಗ (ಪುಸ್ತಕದಂತೆ)'), dir: [0, 0.05, 1] },
    { id: 'angle', name: t('At an angle', 'तिरछे', 'ಓರೆಯಾಗಿ'), dir: [-0.45, 0.4, 1] },
    { id: 'above', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0.1, 1, 0.45] },
  ],
  slices: [],
  animations: [
    {
      id: 'dispersion', kind: 'flow',
      name: t('Splitting white light', 'श्वेत प्रकाश का विभाजन', 'ಬಿಳಿ ಬೆಳಕಿನ ವಿಭಜನೆ'),
      steps: [
        {
          color: '#ffffff', highlight: ['white_light', 'prism'],
          text: t('A narrow beam of white light falls on one face of the prism.', 'श्वेत प्रकाश की एक पतली किरण प्रिज़्म के एक फलक पर पड़ती है।', 'ಬಿಳಿ ಬೆಳಕಿನ ಕಿರಿದಾದ ಕಿರಣ ಪಟ್ಟಕದ ಒಂದು ಮುಖದ ಮೇಲೆ ಬೀಳುತ್ತದೆ.'),
          paths: [[[...START, 0], [...ENTRY, 0]]],
        },
        {
          color: '#c9a7ff', highlight: COLOURS.map((c) => c[0]),
          text: t('Inside the glass each colour bends by a different amount: violet most, red least. The colours separate.', 'काँच के अंदर हर रंग अलग मात्रा में मुड़ता है: बैंगनी सबसे अधिक, लाल सबसे कम। रंग अलग हो जाते हैं।', 'ಗಾಜಿನೊಳಗೆ ಪ್ರತಿ ಬಣ್ಣ ಬೇರೆ ಪ್ರಮಾಣದಲ್ಲಿ ಬಾಗುತ್ತದೆ: ನೇರಳೆ ಅತಿ ಹೆಚ್ಚು, ಕೆಂಪು ಅತಿ ಕಡಿಮೆ. ಬಣ್ಣಗಳು ಬೇರ್ಪಡುತ್ತವೆ.'),
          paths: rays.map((r) => [[...ENTRY, 0], [...r.exit, 0]]),
        },
        {
          color: '#ffe066', highlight: [...COLOURS.map((c) => c[0]), 'screen'],
          text: t('They bend again leaving the prism and fall on the screen as a band: violet, indigo, blue, green, yellow, orange, red (VIBGYOR).', 'प्रिज़्म से निकलते समय वे फिर मुड़ते हैं और पर्दे पर पट्टी बनाते हैं: बैंगनी, जामुनी, नीला, हरा, पीला, नारंगी, लाल।', 'ಪಟ್ಟಕದಿಂದ ಹೊರಡುವಾಗ ಮತ್ತೆ ಬಾಗಿ ಪರದೆಯ ಮೇಲೆ ಪಟ್ಟಿಯಾಗಿ ಬೀಳುತ್ತವೆ: ನೇರಳೆ, ಇಂಡಿಗೋ, ನೀಲಿ, ಹಸಿರು, ಹಳದಿ, ಕಿತ್ತಳೆ, ಕೆಂಪು (VIBGYOR).'),
          paths: rays.map((r) => [[...r.exit, 0], [...r.hit, 0]]),
        },
      ],
    },
  ],
};
