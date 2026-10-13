// An optical bench with a candle, a lens and a screen, built in code with the
// image where the lens formula puts it (1/v - 1/u = 1/f, f = 10 cm, candle
// 30 cm away) and the textbook rays drawn in light. Two versions: a convex
// lens makes a real, inverted, smaller image on the screen; a concave lens a
// virtual, upright, smaller one on the candle's side.
import { revolve, rod } from '../lib/shapes.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const AXIS = 0.12; // height of the principal axis
const F = 0.1;
const U = -0.3; // the candle
const TIP = AXIS + 0.075; // top of the flame
// Convex: v = 0.15, m = -0.5. Concave: v = -0.075, m = +0.25.
const IMG = { convex: { x: 0.15, h: -0.0375 }, concave: { x: -0.075, h: 0.01875 } };

/** A lens of aperture radius [a], axis along x: [convex] thicker in the middle, else at the edge. */
function lens(THREE, convex, a = 0.05) {
  const pts = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const h = (a * i) / n;
    const s = (h / a) ** 2;
    const half = convex ? 0.0015 + 0.0065 * (1 - s) : 0.0018 + 0.0065 * s;
    pts.push([h, half]);
  }
  const loop = [...pts.map(([h, y]) => [h, y]), ...pts.slice().reverse().map(([h, y]) => [h, -y])];
  return revolve(THREE, loop.filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1]), 72).rotateZ(Math.PI / 2).translate(0, AXIS, 0);
}

/** A candle at [x] with its flame tip at [tip]; [k] scales it about the axis (negative: upside down). */
function candle(THREE, x, k = 1) {
  const body = new THREE.CylinderGeometry(0.012, 0.012, 0.05, 32).translate(0, 0.025, 0);
  const wick = new THREE.CylinderGeometry(0.0012, 0.0012, 0.006, 8).translate(0, 0.053, 0);
  const flame = revolve(THREE, [[0, 0.054], [0.006, 0.058], [0.0065, 0.064], [0.004, 0.07], [0, 0.075]], 32);
  const s = (g) => g.scale(Math.abs(k), k, Math.abs(k)).translate(x, AXIS, 0);
  return { body: s(body), wick: s(wick), flame: s(flame) };
}

export default {
  id: 'lens_bench',
  version: 1,
  order: 3,
  source: 'procedural',
  subject: 'Physics',
  classes: [7, 8, 10, 12],
  title: t('Lenses on an optical bench', 'प्रकाशीय बेंच पर लेंस', 'ಆಪ್ಟಿಕಲ್ ಬೆಂಚ್ ಮೇಲೆ ಮಸೂರಗಳು'),
  summary: t(
    'A candle 30 cm from a lens of focal length 10 cm. The convex lens bends the light together to a real, upside-down image on the screen; the concave lens spreads it out, so the image seems to come from behind the lens.',
    '10 सेमी फ़ोकस दूरी वाले लेंस से 30 सेमी दूर एक मोमबत्ती। उत्तल लेंस प्रकाश को मोड़कर पर्दे पर वास्तविक, उलटा प्रतिबिंब बनाता है; अवतल लेंस प्रकाश को फैलाता है, इसलिए प्रतिबिंब लेंस के पीछे से आता लगता है।',
    '10 ಸೆಂಮೀ ನಾಭಿದೂರದ ಮಸೂರದಿಂದ 30 ಸೆಂಮೀ ದೂರದಲ್ಲಿ ಒಂದು ಮೇಣದಬತ್ತಿ. ಪೀನ ಮಸೂರ ಬೆಳಕನ್ನು ಒಟ್ಟುಗೂಡಿಸಿ ಪರದೆಯ ಮೇಲೆ ನೈಜ, ತಲೆಕೆಳಗಾದ ಪ್ರತಿಬಿಂಬ ಮಾಡುತ್ತದೆ; ನಿಮ್ನ ಮಸೂರ ಬೆಳಕನ್ನು ಹರಡುತ್ತದೆ, ಆದ್ದರಿಂದ ಪ್ರತಿಬಿಂಬ ಮಸೂರದ ಹಿಂದಿನಿಂದ ಬಂದಂತೆ ಕಾಣುತ್ತದೆ.',
  ),
  keywords: ['lens', 'convex lens', 'concave lens', 'optics', 'ray diagram', 'image formation', 'focal length', 'light', 'refraction', 'real image', 'virtual image', 'lens formula', 'magnification', 'light reflection and refraction'],
  credit: 'Model built by KINETIX (image placed by the lens formula)',
  crease: 50,
  variants: [
    { id: 'convex', name: t('Convex lens', 'उत्तल लेंस', 'ಪೀನ ಮಸೂರ') },
    { id: 'concave', name: t('Concave lens', 'अवतल लेंस', 'ನಿಮ್ನ ಮಸೂರ') },
  ],
  thumb: 'convex',
  build(THREE) {
    const rail = new THREE.BoxGeometry(0.9, 0.018, 0.05).translate(0, 0.009, 0);
    const scale = [];
    for (let i = -8; i <= 8; i++) scale.push(new THREE.BoxGeometry(0.0012, 0.0006, i % 5 === 0 ? 0.03 : 0.018).translate(i * 0.05, 0.0183, 0.0));
    const feet = [-0.4, 0.4].map((x) => new THREE.BoxGeometry(0.03, 0.012, 0.09).translate(x, -0.006, 0));
    const carriage = (x, h) => [new THREE.BoxGeometry(0.035, 0.012, 0.055).translate(x, 0.024, 0), rod(THREE, [x, 0.03, 0], [x, h, 0], 0.0035, 16)];
    const obj = candle(THREE, U);
    const holder = [...carriage(0, AXIS - 0.05), new THREE.TorusGeometry(0.052, 0.0035, 10, 72).rotateY(Math.PI / 2).translate(0, AXIS, 0)];
    const screen = [...carriage(IMG.convex.x + 0.004, AXIS - 0.07), new THREE.BoxGeometry(0.004, 0.15, 0.13).translate(IMG.convex.x + 0.004, AXIS - 0.0, 0)];
    const ray = (pts) => pts.slice(1).map((p, i) => rod(THREE, [...pts[i], 0], [...p, 0], 0.0011, 8));
    const dashed = (a, b, n = 7) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const u0 = i / n, u1 = (i + 0.55) / n;
        out.push(rod(THREE, [a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0, 0], [a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1, 0], 0.0009, 8));
      }
      return out;
    };
    const P = [U, TIP];
    const ci = [IMG.convex.x, AXIS + IMG.convex.h];
    const convexRays = [
      ...ray([P, [0, TIP], ci, [0.2, AXIS - 0.075 * 1.0]]),
      ...ray([P, [0, AXIS], [0.2, AXIS - 0.05]]),
      ...ray([P, [0, ci[1]], [0.2, ci[1]]]),
    ];
    const concaveRays = [
      ...ray([P, [0, TIP], [0.2, TIP + 0.75 * 0.2]]),
      ...ray([P, [0, AXIS], [0.2, AXIS - 0.05]]),
      ...dashed([0, TIP], [-F, AXIS]),
    ];
    const ic = candle(THREE, IMG.convex.x - 0.002, -0.5);
    const iv = candle(THREE, IMG.concave.x, 0.25);
    const foci = [-2 * F, -F, F, 2 * F].map((x) => new THREE.SphereGeometry(x === F || x === -F ? 0.0045 : 0.0032, 16, 12).translate(x, AXIS, 0));
    const axisLine = rod(THREE, [-0.42, AXIS, 0], [0.42, AXIS, 0], 0.0006, 6);
    return {
      bench: [rail, ...feet, ...scale],
      candle: [obj.body, obj.wick, ...carriage(U, AXIS - 0.002)],
      flame: obj.flame,
      lens_convex: lens(THREE, true),
      lens_concave: lens(THREE, false),
      holder,
      screen,
      rays_convex: convexRays,
      rays_concave: concaveRays,
      image_real: [ic.body, ic.wick, ic.flame],
      image_virtual: [iv.body, iv.wick, iv.flame],
      foci,
      axis: axisLine,
    };
  },
  groups: [
    { id: 'optics', name: t('Lens and light', 'लेंस और प्रकाश', 'ಮಸೂರ ಮತ್ತು ಬೆಳಕು') },
    { id: 'bench', name: t('Bench, candle and screen', 'बेंच, मोमबत्ती और पर्दा', 'ಬೆಂಚ್, ಮೇಣದಬತ್ತಿ ಮತ್ತು ಪರದೆ') },
  ],
  parts: [
    {
      id: 'lens_convex', variant: 'convex', group: 'optics', color: '#a9dcf2', opacity: 0.45, explode: [0, 0.6, 1],
      name: t('Convex lens (converging), f = 10 cm', 'उत्तल लेंस (अभिसारी), f = 10 सेमी', 'ಪೀನ ಮಸೂರ (ಒಮ್ಮುಖ), f = 10 ಸೆಂಮೀ'),
      info: t('Thicker in the middle. It bends parallel rays together through the principal focus.', 'बीच में मोटा। यह समांतर किरणों को मोड़कर मुख्य फ़ोकस से गुज़ारता है।', 'ಮಧ್ಯದಲ್ಲಿ ದಪ್ಪ. ಸಮಾಂತರ ಕಿರಣಗಳನ್ನು ಬಾಗಿಸಿ ಪ್ರಧಾನ ನಾಭಿಯ ಮೂಲಕ ಹಾಯಿಸುತ್ತದೆ.'),
    },
    {
      id: 'lens_concave', variant: 'concave', group: 'optics', color: '#a9dcf2', opacity: 0.45, explode: [0, 0.6, 1],
      name: t('Concave lens (diverging), f = -10 cm', 'अवतल लेंस (अपसारी), f = -10 सेमी', 'ನಿಮ್ನ ಮಸೂರ (ಅಪಸರಣ), f = -10 ಸೆಂಮೀ'),
      info: t('Thinner in the middle. Parallel rays spread out as if they came from the principal focus in front of it.', 'बीच में पतला। समांतर किरणें ऐसे फैलती हैं मानो सामने के मुख्य फ़ोकस से आ रही हों।', 'ಮಧ್ಯದಲ್ಲಿ ತೆಳು. ಸಮಾಂತರ ಕಿರಣಗಳು ಮುಂದಿನ ಪ್ರಧಾನ ನಾಭಿಯಿಂದ ಬಂದಂತೆ ಹರಡುತ್ತವೆ.'),
    },
    {
      id: 'rays_convex', variant: 'convex', group: 'optics', color: '#ffd84a', glow: 0.8, cap: false,
      name: t('Light rays', 'प्रकाश किरणें', 'ಬೆಳಕಿನ ಕಿರಣಗಳು'),
      info: t('A ray parallel to the axis passes through F; a ray through the centre goes straight on; a ray through F comes out parallel. They meet at the image.', 'अक्ष के समांतर किरण F से गुज़रती है; केंद्र से होकर जाने वाली किरण सीधी जाती है; F से होकर जाने वाली किरण समांतर निकलती है। ये प्रतिबिंब पर मिलती हैं।', 'ಅಕ್ಷಕ್ಕೆ ಸಮಾಂತರ ಕಿರಣ F ಮೂಲಕ ಹೋಗುತ್ತದೆ; ಕೇಂದ್ರದ ಮೂಲಕದ ಕಿರಣ ನೇರವಾಗಿ ಸಾಗುತ್ತದೆ; F ಮೂಲಕದ ಕಿರಣ ಸಮಾಂತರವಾಗಿ ಹೊರಬರುತ್ತದೆ. ಅವು ಪ್ರತಿಬಿಂಬದಲ್ಲಿ ಸೇರುತ್ತವೆ.'),
    },
    {
      id: 'rays_concave', variant: 'concave', group: 'optics', color: '#ffd84a', glow: 0.8, cap: false,
      name: t('Light rays', 'प्रकाश किरणें', 'ಬೆಳಕಿನ ಕಿರಣಗಳು'),
      info: t('The rays spread out after the lens. Traced back (dashed), they seem to meet in front of it: that is the virtual image.', 'लेंस के बाद किरणें फैलती हैं। पीछे बढ़ाने पर (बिंदीदार) वे सामने मिलती प्रतीत होती हैं: वही आभासी प्रतिबिंब है।', 'ಮಸೂರದ ನಂತರ ಕಿರಣಗಳು ಹರಡುತ್ತವೆ. ಹಿಂದಕ್ಕೆ ವಿಸ್ತರಿಸಿದರೆ (ಚುಕ್ಕೆ ಗೆರೆ) ಮುಂದೆ ಸೇರುವಂತೆ ಕಾಣುತ್ತವೆ: ಅದೇ ಮಿಥ್ಯಾ ಪ್ರತಿಬಿಂಬ.'),
    },
    {
      id: 'image_real', variant: 'convex', group: 'optics', color: '#ff9f43', glow: 0.35,
      name: t('Real, inverted, smaller image (v = 15 cm)', 'वास्तविक, उलटा, छोटा प्रतिबिंब (v = 15 सेमी)', 'ನೈಜ, ತಲೆಕೆಳಗಾದ, ಚಿಕ್ಕ ಪ್ರತಿಬಿಂಬ (v = 15 ಸೆಂಮೀ)'),
      info: t('Light really reaches this point, so the image forms on a screen. Magnification = v/u = -0.5.', 'प्रकाश सचमुच यहाँ पहुँचता है, इसलिए प्रतिबिंब पर्दे पर बनता है। आवर्धन = v/u = -0.5।', 'ಬೆಳಕು ನಿಜವಾಗಿ ಇಲ್ಲಿಗೆ ತಲುಪುತ್ತದೆ, ಆದ್ದರಿಂದ ಪ್ರತಿಬಿಂಬ ಪರದೆಯ ಮೇಲೆ ಮೂಡುತ್ತದೆ. ವರ್ಧನೆ = v/u = -0.5.'),
    },
    {
      id: 'image_virtual', variant: 'concave', group: 'optics', color: '#ff9f43', opacity: 0.5, glow: 0.3,
      name: t('Virtual, upright, smaller image (v = -7.5 cm)', 'आभासी, सीधा, छोटा प्रतिबिंब (v = -7.5 सेमी)', 'ಮಿಥ್ಯಾ, ನೇರ, ಚಿಕ್ಕ ಪ್ರತಿಬಿಂಬ (v = -7.5 ಸೆಂಮೀ)'),
      info: t('Seen by looking through the lens, but it cannot be caught on a screen. Magnification = v/u = +0.25.', 'लेंस से देखने पर दिखता है, पर पर्दे पर नहीं बनाया जा सकता। आवर्धन = v/u = +0.25।', 'ಮಸೂರದ ಮೂಲಕ ನೋಡಿದಾಗ ಕಾಣುತ್ತದೆ, ಆದರೆ ಪರದೆಯ ಮೇಲೆ ಹಿಡಿಯಲಾಗದು. ವರ್ಧನೆ = v/u = +0.25.'),
    },
    {
      id: 'flame', group: 'bench', color: '#ffb33d', glow: 0.9,
      name: t('Object: candle flame (u = -30 cm)', 'वस्तु: मोमबत्ती की लौ (u = -30 सेमी)', 'ವಸ್ತು: ಮೇಣದಬತ್ತಿಯ ಜ್ವಾಲೆ (u = -30 ಸೆಂಮೀ)'),
      info: t('Distances are measured from the optical centre of the lens; the object is on the left, so u is negative.', 'दूरियाँ लेंस के प्रकाशिक केंद्र से मापी जाती हैं; वस्तु बाईं ओर है, इसलिए u ऋणात्मक है।', 'ದೂರಗಳನ್ನು ಮಸೂರದ ದೃಕ್‌ಕೇಂದ್ರದಿಂದ ಅಳೆಯುತ್ತಾರೆ; ವಸ್ತು ಎಡಕ್ಕಿದೆ, ಆದ್ದರಿಂದ u ಋಣಾತ್ಮಕ.'),
    },
    {
      id: 'candle', group: 'bench', color: '#f3ead7', minor: true,
      name: t('Candle', 'मोमबत्ती', 'ಮೇಣದಬತ್ತಿ'),
      info: t('Its flame is the bright object.', 'इसकी लौ चमकीली वस्तु है।', 'ಇದರ ಜ್ವಾಲೆಯೇ ಹೊಳೆಯುವ ವಸ್ತು.'),
    },
    {
      id: 'screen', variant: 'convex', group: 'bench', color: '#f5f5f2', explode: [1, 0, 0],
      name: t('Screen', 'पर्दा', 'ಪರದೆ'),
      info: t('Moved until the image is sharp: then it is at the image distance v.', 'प्रतिबिंब स्पष्ट होने तक खिसकाया जाता है: तब यह प्रतिबिंब दूरी v पर होता है।', 'ಪ್ರತಿಬಿಂಬ ಸ್ಪಷ್ಟವಾಗುವವರೆಗೆ ಸರಿಸಲಾಗುತ್ತದೆ: ಆಗ ಅದು ಪ್ರತಿಬಿಂಬ ದೂರ v ನಲ್ಲಿರುತ್ತದೆ.'),
    },
    {
      id: 'foci', group: 'optics', color: '#ff5a5a', minor: true,
      name: t('Principal foci F and 2F', 'मुख्य फ़ोकस F और 2F', 'ಪ್ರಧಾನ ನಾಭಿಗಳು F ಮತ್ತು 2F'),
      info: t('F is 10 cm from the lens on each side; 2F is twice as far.', 'F लेंस के दोनों ओर 10 सेमी पर है; 2F दुगुनी दूरी पर।', 'F ಮಸೂರದ ಎರಡೂ ಬದಿ 10 ಸೆಂಮೀ ದೂರದಲ್ಲಿದೆ; 2F ಎರಡರಷ್ಟು ದೂರದಲ್ಲಿ.'),
    },
    {
      id: 'axis', group: 'optics', color: '#9fb3c8', minor: true, cap: false,
      name: t('Principal axis', 'मुख्य अक्ष', 'ಪ್ರಧಾನ ಅಕ್ಷ'),
      info: t('The line through the centre of the lens at right angles to it.', 'लेंस के केंद्र से होकर उसके लंबवत रेखा।', 'ಮಸೂರದ ಕೇಂದ್ರದ ಮೂಲಕ ಅದಕ್ಕೆ ಲಂಬವಾದ ರೇಖೆ.'),
    },
    {
      id: 'holder', group: 'bench', color: '#59626b', metal: true, minor: true, explode: [0, -0.6, 0],
      name: t('Lens holder', 'लेंस धारक', 'ಮಸೂರ ಹಿಡಿಕೆ'),
      info: t('Holds the lens upright on the bench.', 'लेंस को बेंच पर सीधा थामता है।', 'ಮಸೂರವನ್ನು ಬೆಂಚ್ ಮೇಲೆ ನೇರವಾಗಿ ಹಿಡಿಯುತ್ತದೆ.'),
    },
    {
      id: 'bench', group: 'bench', color: '#3a434c', metal: true, minor: true, explode: [0, -1, 0],
      name: t('Optical bench with a metre scale', 'मीटर पैमाने वाली प्रकाशीय बेंच', 'ಮೀಟರ್ ಅಳತೆಪಟ್ಟಿಯ ಆಪ್ಟಿಕಲ್ ಬೆಂಚ್'),
      info: t('A rail with a scale, so the distances u and v can be read.', 'पैमाने वाली पटरी, जिससे दूरियाँ u और v पढ़ी जा सकें।', 'ಅಳತೆಪಟ್ಟಿಯಿರುವ ಹಳಿ; u ಮತ್ತು v ದೂರಗಳನ್ನು ಓದಲು.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front (the ray diagram)', 'सामने (किरण आरेख)', 'ಮುಂಭಾಗ (ಕಿರಣ ರೇಖಾಚಿತ್ರ)'), dir: [0, 0.12, 1] },
    { id: 'angle', name: t('At an angle', 'तिरछा', 'ಓರೆಯಾಗಿ'), dir: [-0.55, 0.4, 1] },
  ],
  slices: [],
  animations: [],
};
