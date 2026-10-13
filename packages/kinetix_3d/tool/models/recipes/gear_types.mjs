// Helical and bevel gears built in code (module 4 mm, 20° pressure angle): a
// helical pair on parallel shafts (helix angle 20°, opposite hands) and a
// straight bevel pair turning the drive through 90° (16 and 24 teeth). "Turn"
// spins each pair at the speeds its teeth set.
import { rod } from '../lib/shapes.mjs';
import { loft, gearOutline } from '../lib/structures.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const M = 0.004;
const HELIX = (20 * Math.PI) / 180;
const FACE = 0.018;
const SPEED = 50;

/** A helical gear: the spur outline turned along the face width; [hand] +1 right, -1 left. */
function helical(THREE, n, hand) {
  const rp = (M * n) / 2;
  const stations = [];
  for (let i = 0; i <= 8; i++) {
    const z = -FACE / 2 + (FACE * i) / 8;
    stations.push({ z, turn: (hand * z * Math.tan(HELIX)) / rp });
  }
  return [loft(THREE, gearOutline(n, M), stations), new THREE.CylinderGeometry(0.011, 0.011, FACE + 0.008, 32).rotateX(Math.PI / 2)];
}

/**
 * A straight bevel gear of [n] teeth meshing with one of [mate] teeth at 90°:
 * axis along z, the cone's apex at the origin, the back face at z = -back.
 */
function bevel(THREE, n, mate) {
  const rp = (M * n) / 2, back = (M * mate) / 2;
  const A = Math.hypot(rp, back); // cone distance
  const s = 1 - FACE / A; // the small end's scale
  const outline = gearOutline(n, M);
  const g = loft(THREE, outline, [{ z: -back, scale: 1 }, { z: -back * s, scale: s }]);
  const hub = new THREE.CylinderGeometry(0.01, 0.012, 0.016, 32).rotateX(Math.PI / 2).translate(0, 0, -back - 0.008);
  return [g, hub];
}

const N1 = 16, N2 = 24; // the bevel pair
const H1 = 14, H2 = 21; // the helical pair
const HC = (M * (H1 + H2)) / 2; // centre distance (pitch circles touching; helical module taken as transverse)
const HY = -0.12; // the helical pair sits below the bevel pair

export default {
  id: 'gear_types',
  version: 1,
  order: 4,
  source: 'procedural',
  subject: 'Engineering',
  classes: [11, 12],
  title: t('Helical and bevel gears', 'हेलिकल और बेवल गियर', 'ಹೆಲಿಕಲ್ ಮತ್ತು ಬೆವೆಲ್ ಗೇರ್‌ಗಳು'),
  summary: t(
    'Helical gears have teeth cut at an angle, so they engage gradually and run quietly between parallel shafts. Bevel gears are cones and turn the drive through an angle, usually 90°.',
    'हेलिकल गियर के दाँते तिरछे कटे होते हैं, इसलिए वे धीरे-धीरे फँसते हैं और समानांतर धुरियों के बीच शांत चलते हैं। बेवल गियर शंकु होते हैं और गति को एक कोण से, प्रायः 90° से, मोड़ते हैं।',
    'ಹೆಲಿಕಲ್ ಗೇರ್‌ಗಳ ಹಲ್ಲುಗಳು ಓರೆಯಾಗಿ ಕತ್ತರಿಸಲ್ಪಟ್ಟಿವೆ; ಅವು ಕ್ರಮೇಣ ಹೊಂದಿಕೊಂಡು ಸಮಾನಾಂತರ ಅಚ್ಚುಗಳ ನಡುವೆ ಸದ್ದಿಲ್ಲದೆ ಓಡುತ್ತವೆ. ಬೆವೆಲ್ ಗೇರ್‌ಗಳು ಶಂಕುಗಳು; ಚಲನೆಯನ್ನು ಒಂದು ಕೋನದಲ್ಲಿ, ಸಾಮಾನ್ಯವಾಗಿ 90° ಯಲ್ಲಿ, ತಿರುಗಿಸುತ್ತವೆ.',
  ),
  keywords: ['gear', 'helical gear', 'bevel gear', 'helix angle', 'gear pair', 'pitch cone', 'gear ratio', 'differential', 'machines', 'kinematics', 'theory of machines', 'machine design', 'power transmission'],
  credit: 'Model built by KINETIX (involute profiles, module 4 mm; bevel teeth simplified)',
  crease: 40,
  build(THREE) {
    // Bevel pair: gear 1 on the z axis, gear 2 on the x axis, cones meeting at the origin.
    const g1 = bevel(THREE, N1, N2);
    if (N1 % 2 === 0) for (const g of g1) g.rotateZ(Math.PI / N1); // a gap where gear 2's tooth comes in
    const g2 = bevel(THREE, N2, N1).map((g) => g.rotateY(Math.PI / 2));
    const b1 = (M * N2) / 2, b2 = (M * N1) / 2;
    const bevelShafts = [rod(THREE, [0, 0, -b1 - 0.06], [0, 0, -b1 * 0.4], 0.005, 20), rod(THREE, [-b2 - 0.07, 0, 0], [-b2 * 0.4, 0, 0], 0.005, 20)];
    // Helical pair below, on parallel shafts along z.
    const p1 = helical(THREE, H1, 1).map((g) => g.translate(-HC / 2, HY, -0.02));
    // Gear 2 meets gear 1 at its own 180°: a gap must be there (an odd count has one; an even one turns half a tooth).
    const p2 = helical(THREE, H2, -1).map((g) => (H2 % 2 === 0 ? g.rotateZ(Math.PI / H2) : g).translate(HC / 2, HY, -0.02));
    const helShafts = [-1, 1].map((s) => rod(THREE, [(s * HC) / 2, HY, -0.06], [(s * HC) / 2, HY, 0.01], 0.005, 20));
    const frame = [
      new THREE.BoxGeometry(0.26, 0.008, 0.12).translate(-0.02, HY - 0.06, -0.03),
      new THREE.BoxGeometry(0.008, 0.2, 0.06).translate(-0.12, -0.05, -0.05),
      new THREE.BoxGeometry(0.14, 0.008, 0.02).translate(-0.06, -0.04, -0.075),
    ];
    return { bevel_pinion: g1, bevel_gear: g2, helical_pinion: p1, helical_gear: p2, shafts: [...bevelShafts, ...helShafts], frame };
  },
  groups: [
    { id: 'bevel', name: t('Bevel pair (90°)', 'बेवल जोड़ी (90°)', 'ಬೆವೆಲ್ ಜೋಡಿ (90°)') },
    { id: 'helical', name: t('Helical pair', 'हेलिकल जोड़ी', 'ಹೆಲಿಕಲ್ ಜೋಡಿ') },
    { id: 'frame', name: t('Shafts and frame', 'धुरियाँ और ढाँचा', 'ಅಚ್ಚುಗಳು ಮತ್ತು ಚೌಕಟ್ಟು') },
  ],
  parts: [
    {
      id: 'bevel_pinion', group: 'bevel', color: '#d98a2b', metal: true, explode: [0, 0.3, 1],
      spin: { axis: [0, 0, 1], speed: SPEED, centre: [0, 0, 0] },
      name: t('Bevel pinion (16 teeth)', 'बेवल पिनियन (16 दाँते)', 'ಬೆವೆಲ್ ಪಿನಿಯನ್ (16 ಹಲ್ಲುಗಳು)'),
      info: t('Its pitch cone angle is tan⁻¹(16/24) ≈ 33.7°; the two cones share one apex.', 'इसका पिच शंकु कोण tan⁻¹(16/24) ≈ 33.7° है; दोनों शंकुओं का शीर्ष एक ही है।', 'ಇದರ ಪಿಚ್ ಶಂಕು ಕೋನ tan⁻¹(16/24) ≈ 33.7°; ಎರಡೂ ಶಂಕುಗಳಿಗೆ ಒಂದೇ ಶೃಂಗ.'),
    },
    {
      id: 'bevel_gear', group: 'bevel', color: '#4a86c5', metal: true, explode: [-1, 0.3, 0],
      spin: { axis: [1, 0, 0], speed: (-SPEED * N1) / N2, centre: [0, 0, 0] },
      name: t('Bevel gear (24 teeth)', 'बेवल गियर (24 दाँते)', 'ಬೆವೆಲ್ ಗೇರ್ (24 ಹಲ್ಲುಗಳು)'),
      info: t('Turns at 16/24 of the pinion\'s speed about an axis at 90°, as in a car\'s differential or a hand drill.', 'पिनियन की गति के 16/24 पर, 90° पर रखी धुरी के चारों ओर घूमता है, जैसे कार के डिफ़रेंशियल या हैंड ड्रिल में।', 'ಪಿನಿಯನ್ ವೇಗದ 16/24 ರಲ್ಲಿ, 90° ಯಲ್ಲಿರುವ ಅಚ್ಚಿನ ಸುತ್ತ ತಿರುಗುತ್ತದೆ; ಕಾರಿನ ಡಿಫರೆನ್ಷಿಯಲ್ ಅಥವಾ ಕೈ ಡ್ರಿಲ್‌ನಂತೆ.'),
    },
    {
      id: 'helical_pinion', group: 'helical', color: '#4f9e58', metal: true, explode: [-0.6, -0.4, 1],
      spin: { axis: [0, 0, 1], speed: SPEED, centre: [-HC / 2, HY, 0] },
      name: t('Helical pinion (14 teeth, right hand)', 'हेलिकल पिनियन (14 दाँते, दायाँ हाथ)', 'ಹೆಲಿಕಲ್ ಪಿನಿಯನ್ (14 ಹಲ್ಲುಗಳು, ಬಲಗೈ)'),
      info: t('Teeth at a 20° helix angle: several teeth share the load at once, but the angle makes an end thrust on the shaft.', '20° हेलिक्स कोण पर दाँते: एक साथ कई दाँते भार बाँटते हैं, पर यह कोण धुरी पर अक्षीय धक्का (एंड थ्रस्ट) बनाता है।', '20° ಹೆಲಿಕ್ಸ್ ಕೋನದ ಹಲ್ಲುಗಳು: ಒಮ್ಮೆಗೆ ಹಲವು ಹಲ್ಲುಗಳು ಭಾರ ಹಂಚುತ್ತವೆ; ಆದರೆ ಕೋನವು ಅಚ್ಚಿನ ಮೇಲೆ ಅಕ್ಷೀಯ ತಳ್ಳುವಿಕೆ ಉಂಟುಮಾಡುತ್ತದೆ.'),
    },
    {
      id: 'helical_gear', group: 'helical', color: '#8e5fb5', metal: true, explode: [0.6, -0.4, 1],
      spin: { axis: [0, 0, 1], speed: (-SPEED * H1) / H2, centre: [HC / 2, HY, 0] },
      name: t('Helical gear (21 teeth, left hand)', 'हेलिकल गियर (21 दाँते, बायाँ हाथ)', 'ಹೆಲಿಕಲ್ ಗೇರ್ (21 ಹಲ್ಲುಗಳು, ಎಡಗೈ)'),
      info: t('Parallel helical gears mesh only with opposite hands; ratio 21:14 = 1.5.', 'समानांतर हेलिकल गियर केवल उलटे हाथ वाले से फँसते हैं; अनुपात 21:14 = 1.5।', 'ಸಮಾನಾಂತರ ಹೆಲಿಕಲ್ ಗೇರ್‌ಗಳು ವಿರುದ್ಧ ಕೈಯದರೊಂದಿಗೆ ಮಾತ್ರ ಹೊಂದುತ್ತವೆ; ಅನುಪಾತ 21:14 = 1.5.'),
    },
    {
      id: 'shafts', group: 'frame', color: '#b8bec4', metal: true, minor: true, explode: [0, 0, -0.6],
      name: t('Shafts', 'धुरियाँ', 'ಅಚ್ಚುಗಳು'),
      info: t('Each gear is keyed to its shaft.', 'हर गियर अपनी धुरी पर चाबी (की) से जुड़ा है।', 'ಪ್ರತಿ ಗೇರ್ ತನ್ನ ಅಚ್ಚಿಗೆ ಕೀ ಮೂಲಕ ಜೋಡಿಸಲಾಗಿದೆ.'),
    },
    {
      id: 'frame', group: 'frame', color: '#2f3a44', metal: true, minor: true, explode: [0, -0.4, -1],
      name: t('Frame', 'ढाँचा', 'ಚೌಕಟ್ಟು'),
      info: t('Holds the shafts at the right angles and distances.', 'धुरियों को सही कोण और दूरी पर रखता है।', 'ಅಚ್ಚುಗಳನ್ನು ಸರಿಯಾದ ಕೋನ ಮತ್ತು ಅಂತರದಲ್ಲಿ ಹಿಡಿಯುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.5, 0.4, 1] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [-1, 0.4, 0.5] },
  ],
  slices: [],
  animations: [{ id: 'turn', kind: 'orbit', name: t('Turn the gears', 'गियर घुमाएँ', 'ಗೇರ್‌ಗಳನ್ನು ತಿರುಗಿಸಿ') }],
};
