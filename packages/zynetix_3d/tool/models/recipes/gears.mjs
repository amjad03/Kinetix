// A gear train built in code with true involute teeth (module 4 mm, 20°
// pressure angle, the shape real gears are cut to): a 12-tooth driver, a
// 24-tooth driven gear and a 12-tooth third gear on steel shafts in a frame.
// "Turn" spins them at the speeds the teeth set: 2:1, opposite ways.
import { rod } from '../lib/shapes.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const M = 0.004; // module: pitch diameter = M x teeth
const PRESSURE = (20 * Math.PI) / 180;
const WIDTH = 0.016;

/** The outline of an involute spur gear of [n] teeth, as points round it. */
function gearOutline(n) {
  const rp = (M * n) / 2, rb = rp * Math.cos(PRESSURE), ra = rp + M, rf = Math.max(rp - 1.25 * M, rb * 0.98);
  const inv = (a) => Math.tan(a) - a;
  // Half the tooth's angular thickness at the pitch circle, and the involute angle there.
  const half = Math.PI / (2 * n) + inv(PRESSURE);
  const flank = [];
  for (let i = 0; i <= 10; i++) {
    const r = Math.max(rb, rf) + ((ra - Math.max(rb, rf)) * i) / 10;
    const a = Math.acos(Math.min(1, rb / r));
    flank.push([r, half - inv(a)]);
  }
  const pts = [];
  for (let k = 0; k < n; k++) {
    const c = (2 * Math.PI * k) / n;
    // Root, up one flank, across the tip, down the other flank.
    pts.push([rf, c - half - Math.PI / (2 * n) * 0.6]);
    for (const [r, a] of flank) pts.push([r, c - a]);
    for (const [r, a] of flank.slice().reverse()) pts.push([r, c + a]);
    pts.push([rf, c + half + Math.PI / (2 * n) * 0.6]);
  }
  return pts.map(([r, a]) => [r * Math.cos(a), r * Math.sin(a)]);
}

/** A gear: toothed rim with lightening holes, a hub and a bore, [WIDTH] thick, axis along z. */
function gear(THREE, n, { holes = 0 } = {}) {
  const shape = new THREE.Shape(gearOutline(n).map(([x, y]) => new THREE.Vector2(x, y)));
  const rp = (M * n) / 2;
  shape.holes.push(new THREE.Path().absarc(0, 0, 0.006, 0, Math.PI * 2, true));
  for (let i = 0; i < holes; i++) {
    const a = (2 * Math.PI * i) / holes, rr = rp * 0.55;
    shape.holes.push(new THREE.Path().absarc(rr * Math.cos(a), rr * Math.sin(a), rp * 0.2, 0, Math.PI * 2, true));
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: WIDTH, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0006, bevelSegments: 2, curveSegments: 20 });
  g.translate(0, 0, -WIDTH / 2);
  const hub = new THREE.CylinderGeometry(0.013, 0.013, WIDTH + 0.01, 40).rotateX(Math.PI / 2);
  return [g, hub];
}

// Centres along x: the driver (12) meshes with the driven (24), which meshes with the third (12).
const C = [-(M * 36) / 2, 0, (M * 36) / 2];
const SPEED = 60; // the driver, degrees a second

export default {
  id: 'gears',
  version: 1,
  order: 2,
  source: 'procedural',
  subject: 'Engineering',
  classes: [7, 8, 9, 11],
  title: t('Gears and gear train', 'गियर और गियर-गाड़ी', 'ಗೇರ್‌ಗಳು ಮತ್ತು ಗೇರ್ ಸರಣಿ'),
  summary: t(
    'Meshing gears turn in opposite directions. A gear with twice the teeth turns half as fast but with twice the turning force: the speed ratio is the ratio of the teeth.',
    'आपस में फँसे गियर उलटी दिशाओं में घूमते हैं। दुगुने दाँतों वाला गियर आधी गति से पर दुगुने घूर्णन बल से घूमता है: गति अनुपात दाँतों का अनुपात है।',
    'ಹೊಂದಿಕೊಂಡ ಗೇರ್‌ಗಳು ವಿರುದ್ಧ ದಿಕ್ಕುಗಳಲ್ಲಿ ತಿರುಗುತ್ತವೆ. ಎರಡರಷ್ಟು ಹಲ್ಲುಗಳ ಗೇರ್ ಅರ್ಧ ವೇಗದಲ್ಲಿ ಆದರೆ ಎರಡರಷ್ಟು ತಿರುಗುಬಲದಿಂದ ತಿರುಗುತ್ತದೆ: ವೇಗ ಅನುಪಾತ ಹಲ್ಲುಗಳ ಅನುಪಾತ.',
  ),
  keywords: ['gear', 'gears', 'gear ratio', 'gear train', 'machines', 'speed ratio', 'torque', 'simple machines', 'bicycle', 'mechanical advantage', 'rotation'],
  credit: 'Model built by ZYNETIX (involute spur gears, module 4 mm)',
  crease: 40,
  build(THREE) {
    const at = (gs, x) => gs.map((g) => g.translate(x, 0, 0));
    const shafts = C.map((x) => rod(THREE, [x, 0, -0.05], [x, 0, 0.03], 0.006, 24));
    const plate = new THREE.BoxGeometry(0.3, 0.16, 0.008).translate(0, -0.005, -0.05);
    const feet = [-0.13, 0.13].map((x) => new THREE.BoxGeometry(0.02, 0.012, 0.07).translate(x, -0.091, -0.02));
    const base = new THREE.BoxGeometry(0.32, 0.008, 0.08).translate(0, -0.101, -0.02);
    // Turn each gear so its teeth fit into the next one's gaps.
    const driver = at(gear(THREE, 12, { holes: 0 }), C[0]);
    const driven = at(gear(THREE, 24, { holes: 6 }).map((g) => g.rotateZ(Math.PI / 24)), C[1]);
    const third = at(gear(THREE, 12, { holes: 0 }), C[2]);
    const handle = [rod(THREE, [C[0], 0, 0.02], [C[0], 0.028, 0.02], 0.0035, 12), rod(THREE, [C[0], 0.028, 0.02], [C[0], 0.028, 0.045], 0.004, 16)];
    return {
      driver: [...driver, ...handle],
      driven,
      third,
      shafts,
      frame: [plate, ...feet, base],
    };
  },
  groups: [
    { id: 'gears', name: t('Gears', 'गियर', 'ಗೇರ್‌ಗಳು') },
    { id: 'frame', name: t('Frame and shafts', 'ढाँचा और धुरियाँ', 'ಚೌಕಟ್ಟು ಮತ್ತು ಅಚ್ಚುಗಳು') },
  ],
  parts: [
    {
      id: 'driver', group: 'gears', color: '#d98a2b', metal: true, explode: [-0.5, 0, 1],
      spin: { axis: [0, 0, 1], speed: SPEED, centre: [C[0], 0, 0] },
      name: t('Driver gear (12 teeth)', 'चालक गियर (12 दाँते)', 'ಚಾಲಕ ಗೇರ್ (12 ಹಲ್ಲುಗಳು)'),
      info: t('Turned by the handle (or a motor); it drives the others.', 'हैंडल (या मोटर) से घूमता है; यह बाकी गियरों को चलाता है।', 'ಹಿಡಿಕೆಯಿಂದ (ಅಥವಾ ಮೋಟಾರ್‌ನಿಂದ) ತಿರುಗುತ್ತದೆ; ಇತರ ಗೇರ್‌ಗಳನ್ನು ಚಲಿಸುತ್ತದೆ.'),
    },
    {
      id: 'driven', group: 'gears', color: '#4a86c5', metal: true, explode: [0, 0, 1.4],
      spin: { axis: [0, 0, 1], speed: -SPEED / 2, centre: [C[1], 0, 0] },
      name: t('Driven gear (24 teeth)', 'चालित गियर (24 दाँते)', 'ಚಾಲಿತ ಗೇರ್ (24 ಹಲ್ಲುಗಳು)'),
      info: t('Twice the teeth, so it turns half as fast and the opposite way, with twice the turning force (torque): ratio 2:1.', 'दुगुने दाँते, इसलिए आधी गति से और उलटी दिशा में, दुगुने घूर्णन बल (बल-आघूर्ण) से घूमता है: अनुपात 2:1।', 'ಎರಡರಷ್ಟು ಹಲ್ಲುಗಳು, ಆದ್ದರಿಂದ ಅರ್ಧ ವೇಗದಲ್ಲಿ, ವಿರುದ್ಧ ದಿಕ್ಕಿನಲ್ಲಿ, ಎರಡರಷ್ಟು ತಿರುಗುಬಲದಿಂದ ತಿರುಗುತ್ತದೆ: ಅನುಪಾತ 2:1.'),
    },
    {
      id: 'third', group: 'gears', color: '#4f9e58', metal: true, explode: [0.5, 0, 1],
      spin: { axis: [0, 0, 1], speed: SPEED, centre: [C[2], 0, 0] },
      name: t('Third gear (12 teeth)', 'तीसरा गियर (12 दाँते)', 'ಮೂರನೇ ಗೇರ್ (12 ಹಲ್ಲುಗಳು)'),
      info: t('Turns the same way and as fast as the driver: a gear in between (an idler) changes the direction back but not the overall ratio.', 'चालक की दिशा में और उसी गति से घूमता है: बीच का गियर दिशा फिर से बदल देता है, पर कुल अनुपात नहीं।', 'ಚಾಲಕದ ದಿಕ್ಕಿನಲ್ಲೇ ಹಾಗೂ ಅದೇ ವೇಗದಲ್ಲಿ ತಿರುಗುತ್ತದೆ: ನಡುವಿನ ಗೇರ್ ದಿಕ್ಕನ್ನು ಮತ್ತೆ ಬದಲಿಸುತ್ತದೆ, ಒಟ್ಟು ಅನುಪಾತವನ್ನಲ್ಲ.'),
    },
    {
      id: 'shafts', group: 'frame', color: '#b8bec4', metal: true, minor: true, explode: [0, 0, -0.6],
      name: t('Shafts (axles)', 'धुरियाँ', 'ಅಚ್ಚುಗಳು'),
      info: t('Each gear turns on its own shaft.', 'हर गियर अपनी धुरी पर घूमता है।', 'ಪ್ರತಿ ಗೇರ್ ತನ್ನದೇ ಅಚ್ಚಿನ ಮೇಲೆ ತಿರುಗುತ್ತದೆ.'),
    },
    {
      id: 'frame', group: 'frame', color: '#2f3a44', metal: true, minor: true, explode: [0, -0.4, -1],
      name: t('Frame', 'ढाँचा', 'ಚೌಕಟ್ಟು'),
      info: t('Holds the shafts the right distance apart so the teeth mesh.', 'धुरियों को सही दूरी पर रखता है ताकि दाँते आपस में फँसें।', 'ಹಲ್ಲುಗಳು ಹೊಂದಿಕೊಳ್ಳುವಂತೆ ಅಚ್ಚುಗಳನ್ನು ಸರಿಯಾದ ಅಂತರದಲ್ಲಿ ಹಿಡಿಯುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.25, 0.35, 1] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0.4, 0.6] },
  ],
  slices: [],
  animations: [{ id: 'turn', kind: 'orbit', name: t('Turn the handle', 'हैंडल घुमाएँ', 'ಹಿಡಿಕೆ ತಿರುಗಿಸಿ') }],
};
