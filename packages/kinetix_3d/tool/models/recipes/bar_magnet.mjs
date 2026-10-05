// A bar magnet and its magnetic field, built in code. The field lines are
// traced from the field of two poles near the ends of the bar, so their
// shape is the real one: out of the north pole, round, and into the south.
import { taperTube, curveThrough, rod } from '../lib/shapes.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const HALF = 0.04, THICK = 0.009; // bar half-length (x) and half-thickness
const POLE = 0.032; // the poles sit a little inside the ends
const BOUND = 0.165;

/** The direction of the field at [p]: out of the north pole (the +x end), into the south pole. */
function field([x, y, z]) {
  let bx = 0, by = 0, bz = 0;
  for (const [px, q] of [[POLE, 1], [-POLE, -1]]) {
    const dx = x - px, dy = y, dz = z;
    const r3 = Math.pow(dx * dx + dy * dy + dz * dz, 1.5) + 1e-12;
    bx += (q * dx) / r3;
    by += (q * dy) / r3;
    bz += (q * dz) / r3;
  }
  const l = Math.hypot(bx, by, bz);
  return [bx / l, by / l, bz / l];
}

/** A field line from near the north pole, leaving in direction [a] (radians from the axis) in the plane at angle [phi]. */
function trace(a, phi) {
  const r0 = 0.006;
  let p = [POLE + r0 * Math.cos(a), r0 * Math.sin(a) * Math.cos(phi), r0 * Math.sin(a) * Math.sin(phi)];
  const pts = [p];
  const h = 0.0015;
  for (let i = 0; i < 2000; i++) {
    // Midpoint steps along the field.
    const d1 = field(p);
    const m = [p[0] + (d1[0] * h) / 2, p[1] + (d1[1] * h) / 2, p[2] + (d1[2] * h) / 2];
    const d2 = field(m);
    p = [p[0] + d2[0] * h, p[1] + d2[1] * h, p[2] + d2[2] * h];
    pts.push(p);
    if (Math.hypot(p[0] + POLE, p[1], p[2]) < r0) break; // reached the south pole
    if (Math.hypot(...p) > BOUND) return null;
  }
  // Keep only the part outside the bar.
  const outside = pts.filter(([x, y, z]) => !(Math.abs(x) < HALF + 0.001 && Math.abs(y) < THICK + 0.001 && Math.abs(z) < THICK + 0.001));
  return outside.length > 8 ? outside : null;
}

// Lines in the plane of the page (z = 0), and more all round for the 3D view.
const ANGLES = [24, 34, 46, 60, 76, 96, 122].map((d) => (d * Math.PI) / 180);
const flat = [], round = [];
for (const a of ANGLES) {
  // phi is the angle round the bar from +y: 0 and 180° are the page.
  for (const phi of [0, Math.PI]) {
    const l = trace(a, phi);
    if (l) flat.push(l);
  }
  for (const phi of [Math.PI / 2, -Math.PI / 2, Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const l = trace(a, phi);
    if (l) round.push(l);
  }
}
// The lines along the axis run off to the edge of the picture.
const axisLine = (dir) => {
  const pts = [];
  for (let x = HALF + 0.002; x < BOUND; x += 0.01) pts.push([dir * x, 0, 0]);
  return pts;
};

const every = (pts, n) => pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / n)) === 0).concat([pts[pts.length - 1]]);

// Compasses round the magnet: the needle lines up with the field.
const COMPASSES = [[0, 0.05, 0], [0, -0.05, 0], [0.07, 0.03, 0], [-0.07, 0.03, 0], [0.075, -0.035, 0], [-0.075, -0.035, 0], [0.085, 0, 0], [-0.085, 0, 0]];

export default {
  id: 'bar_magnet',
  version: 1,
  order: 3,
  source: 'procedural',
  subject: 'Physics',
  classes: [6, 10, 12],
  title: t('Magnetic field of a bar magnet', 'छड़ चुंबक का चुंबकीय क्षेत्र', 'ದಂಡ ಕಾಂತದ ಕಾಂತಕ್ಷೇತ್ರ'),
  summary: t(
    'Field lines leave the north pole, curve round and enter the south pole. Where they crowd together (near the poles) the field is strongest. A compass needle lines up along them.',
    'क्षेत्र रेखाएँ उत्तरी ध्रुव से निकलकर मुड़ती हैं और दक्षिणी ध्रुव में प्रवेश करती हैं। जहाँ वे पास-पास हैं (ध्रुवों के पास) वहाँ क्षेत्र सबसे प्रबल है। दिक्सूचक की सुई इनके अनुदिश रहती है।',
    'ಕ್ಷೇತ್ರ ರೇಖೆಗಳು ಉತ್ತರ ಧ್ರುವದಿಂದ ಹೊರಟು ಬಾಗಿ ದಕ್ಷಿಣ ಧ್ರುವವನ್ನು ಪ್ರವೇಶಿಸುತ್ತವೆ. ಅವು ದಟ್ಟವಾಗಿರುವಲ್ಲಿ (ಧ್ರುವಗಳ ಬಳಿ) ಕ್ಷೇತ್ರ ಅತಿ ಪ್ರಬಲ. ದಿಕ್ಸೂಚಿಯ ಸೂಜಿ ಅವುಗಳ ಉದ್ದಕ್ಕೂ ನಿಲ್ಲುತ್ತದೆ.',
  ),
  keywords: ['magnet', 'bar magnet', 'magnetic field', 'field lines', 'compass', 'north pole', 'south pole', 'fun with magnets', 'magnetic effects of electric current', 'magnetism and matter'],
  credit: 'Model built by KINETIX',
  groups: [
    { id: 'magnet', name: t('Magnet', 'चुंबक', 'ಕಾಂತ') },
    { id: 'field', name: t('Field', 'क्षेत्र', 'ಕ್ಷೇತ್ರ') },
    { id: 'compasses', name: t('Compasses', 'दिक्सूचक', 'ದಿಕ್ಸೂಚಿಗಳು') },
  ],
  build(THREE) {
    const line = (pts) => taperTube(THREE, curveThrough(THREE, every(pts, 60)), 0.0007, 0.0007, { segments: 90, radial: 6 });
    const arrowAt = (pts) => {
      const i = Math.floor(pts.length / 2);
      const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[Math.min(pts.length - 1, i + 3)]);
      const d = b.clone().sub(a).normalize();
      const cone = new THREE.ConeGeometry(0.0024, 0.007, 12).translate(0, 0.0035, 0);
      cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
      return cone.translate(a.x, a.y, a.z);
    };
    const lines = (list) => list.flatMap((pts) => [line(pts), arrowAt(pts)]);
    const needles = { north: [], south: [], body: [] };
    for (const c of COMPASSES) {
      const d = new THREE.Vector3(...field(c));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      const half = (dir) => {
        const g = new THREE.ConeGeometry(0.0022, 0.009, 4).translate(0, 0.0045, 0);
        if (dir < 0) g.rotateZ(Math.PI);
        return g.applyQuaternion(q).translate(c[0], c[1], c[2] + 0.004);
      };
      needles.north.push(half(1));
      needles.south.push(half(-1));
      needles.body.push(new THREE.CylinderGeometry(0.0085, 0.0085, 0.002, 32).rotateX(Math.PI / 2).translate(c[0], c[1], c[2] + 0.001));
    }
    return {
      north_pole: new THREE.BoxGeometry(HALF, THICK * 2, THICK * 2).translate(HALF / 2, 0, 0),
      south_pole: new THREE.BoxGeometry(HALF, THICK * 2, THICK * 2).translate(-HALF / 2, 0, 0),
      field_lines: [...lines(flat), ...lines([axisLine(1), axisLine(-1).reverse()])],
      field_all_round: lines(round),
      needle_north: needles.north,
      needle_south: needles.south,
      compass: needles.body,
    };
  },
  parts: [
    {
      id: 'north_pole', group: 'magnet', explode: [0, 0, 0], color: '#c93a3a', matte: true,
      name: t('North pole (N)', 'उत्तरी ध्रुव (N)', 'ಉತ್ತರ ಧ್ರುವ (N)'),
      info: t('Freely hung, this end points north. Field lines come out of it.', 'स्वतंत्र लटकाने पर यह सिरा उत्तर की ओर रहता है। क्षेत्र रेखाएँ इससे निकलती हैं।', 'ಮುಕ್ತವಾಗಿ ತೂಗುಬಿಟ್ಟಾಗ ಈ ತುದಿ ಉತ್ತರಕ್ಕೆ ತೋರುತ್ತದೆ. ಕ್ಷೇತ್ರ ರೇಖೆಗಳು ಇದರಿಂದ ಹೊರಬರುತ್ತವೆ.'),
    },
    {
      id: 'south_pole', group: 'magnet', explode: [0, 0, 0], color: '#3561c4', matte: true,
      name: t('South pole (S)', 'दक्षिणी ध्रुव (S)', 'ದಕ್ಷಿಣ ಧ್ರುವ (S)'),
      info: t('Points south when hung freely. Field lines go into it. Like poles repel, unlike poles attract.', 'स्वतंत्र लटकाने पर दक्षिण की ओर रहता है। क्षेत्र रेखाएँ इसमें जाती हैं। समान ध्रुव प्रतिकर्षित, असमान आकर्षित करते हैं।', 'ಮುಕ್ತವಾಗಿ ತೂಗಿದಾಗ ದಕ್ಷಿಣಕ್ಕೆ ತೋರುತ್ತದೆ. ಕ್ಷೇತ್ರ ರೇಖೆಗಳು ಇದರೊಳಗೆ ಹೋಗುತ್ತವೆ. ಸಮಾನ ಧ್ರುವಗಳು ವಿಕರ್ಷಿಸುತ್ತವೆ, ಅಸಮಾನ ಆಕರ್ಷಿಸುತ್ತವೆ.'),
    },
    {
      id: 'field_lines', group: 'field', explode: [0, 0, 0], color: '#7fc3ff', glow: 0.25,
      name: t('Magnetic field lines', 'चुंबकीय क्षेत्र रेखाएँ', 'ಕಾಂತ ಕ್ಷೇತ್ರ ರೇಖೆಗಳು'),
      info: t('Closed curves from N to S outside the magnet. They never cross each other; closer lines mean a stronger field.', 'चुंबक के बाहर N से S तक बंद वक्र। ये कभी एक-दूसरे को नहीं काटतीं; पास-पास रेखाएँ मतलब प्रबल क्षेत्र।', 'ಕಾಂತದ ಹೊರಗೆ N ನಿಂದ S ವರೆಗಿನ ಮುಚ್ಚಿದ ವಕ್ರಗಳು. ಇವು ಎಂದೂ ಪರಸ್ಪರ ಛೇದಿಸುವುದಿಲ್ಲ; ಹತ್ತಿರದ ರೇಖೆಗಳು ಎಂದರೆ ಪ್ರಬಲ ಕ್ಷೇತ್ರ.'),
    },
    {
      id: 'field_all_round', group: 'field', explode: [0, 0, 0], color: '#9fd0ff', opacity: 0.55, hidden: true,
      name: t('Field all round', 'चारों ओर क्षेत्र', 'ಸುತ್ತಲೂ ಕ್ಷೇತ್ರ'),
      info: t('The field is not flat like the page: it fills the space all round the magnet.', 'क्षेत्र पन्ने की तरह सपाट नहीं है: यह चुंबक के चारों ओर पूरे स्थान में फैला है।', 'ಕ್ಷೇತ್ರ ಪುಟದಂತೆ ಚಪ್ಪಟೆಯಲ್ಲ: ಅದು ಕಾಂತದ ಸುತ್ತಲಿನ ಎಲ್ಲಾ ಜಾಗವನ್ನು ತುಂಬುತ್ತದೆ.'),
    },
    {
      id: 'needle_north', group: 'compasses', explode: [0, 0, 0], color: '#e53935', glow: 0.1,
      name: t('Compass needle', 'दिक्सूचक सुई', 'ದಿಕ್ಸೂಚಿ ಸೂಜಿ'),
      info: t('A tiny magnet. Its north end (red) points along the field line, away from N and towards S.', 'एक छोटा चुंबक। इसका उत्तरी सिरा (लाल) क्षेत्र रेखा के अनुदिश, N से दूर और S की ओर रहता है।', 'ಒಂದು ಸಣ್ಣ ಕಾಂತ. ಇದರ ಉತ್ತರ ತುದಿ (ಕೆಂಪು) ಕ್ಷೇತ್ರ ರೇಖೆಯ ಉದ್ದಕ್ಕೂ, N ನಿಂದ ದೂರ ಮತ್ತು S ಕಡೆಗೆ ತೋರುತ್ತದೆ.'),
    },
    {
      id: 'needle_south', group: 'compasses', explode: [0, 0, 0], color: '#f1efe9', minor: true,
      name: t('Needle (south end)', 'सुई (दक्षिणी सिरा)', 'ಸೂಜಿ (ದಕ್ಷಿಣ ತುದಿ)'),
      info: t('The other end of the compass needle.', 'दिक्सूचक सुई का दूसरा सिरा।', 'ದಿಕ್ಸೂಚಿ ಸೂಜಿಯ ಇನ್ನೊಂದು ತುದಿ.'),
    },
    {
      id: 'compass', group: 'compasses', explode: [0, 0, 0], color: '#5b6470', minor: true, matte: true,
      name: t('Compass', 'दिक्सूचक', 'ದಿಕ್ಸೂಚಿ'),
      info: t('Move a compass round a magnet and mark where its needle points to draw the field lines.', 'दिक्सूचक को चुंबक के चारों ओर घुमाकर सुई की दिशा अंकित करने से क्षेत्र रेखाएँ बनती हैं।', 'ದಿಕ್ಸೂಚಿಯನ್ನು ಕಾಂತದ ಸುತ್ತ ಸರಿಸಿ ಸೂಜಿಯ ದಿಕ್ಕನ್ನು ಗುರುತಿಸಿದರೆ ಕ್ಷೇತ್ರ ರೇಖೆಗಳು ಮೂಡುತ್ತವೆ.'),
    },
  ],
  views: [
    { id: 'page', name: t('As on the page', 'पन्ने जैसा', 'ಪುಟದಂತೆ'), dir: [0, 0.02, 1] },
    { id: 'angle', name: t('At an angle', 'तिरछे', 'ಓರೆಯಾಗಿ'), dir: [0.5, 0.6, 1] },
    { id: 'end', name: t('From the north end', 'उत्तरी सिरे से', 'ಉತ್ತರ ತುದಿಯಿಂದ'), dir: [1, 0.2, 0.3] },
  ],
  slices: [],
  animations: [
    {
      id: 'follow', kind: 'flow',
      name: t('Follow the field', 'क्षेत्र के साथ चलें', 'ಕ್ಷೇತ್ರವನ್ನು ಹಿಂಬಾಲಿಸಿ'),
      steps: [
        {
          color: '#bfe4ff', highlight: ['field_lines', 'north_pole', 'south_pole'],
          text: t('Outside the magnet the field runs from the north pole round to the south pole.', 'चुंबक के बाहर क्षेत्र उत्तरी ध्रुव से घूमकर दक्षिणी ध्रुव तक जाता है।', 'ಕಾಂತದ ಹೊರಗೆ ಕ್ಷೇತ್ರ ಉತ್ತರ ಧ್ರುವದಿಂದ ಸುತ್ತಿ ದಕ್ಷಿಣ ಧ್ರುವಕ್ಕೆ ಸಾಗುತ್ತದೆ.'),
          paths: flat.slice(0, 8).map((l) => every(l, 14)),
        },
        {
          color: '#bfe4ff', highlight: ['north_pole', 'south_pole'],
          text: t('Inside the magnet it runs from S back to N, so every field line is a closed loop.', 'चुंबक के अंदर यह S से वापस N तक जाता है, इसलिए हर क्षेत्र रेखा एक बंद लूप है।', 'ಕಾಂತದೊಳಗೆ ಅದು S ನಿಂದ ಮತ್ತೆ N ಗೆ ಸಾಗುತ್ತದೆ; ಹಾಗಾಗಿ ಪ್ರತಿ ಕ್ಷೇತ್ರ ರೇಖೆ ಮುಚ್ಚಿದ ಕುಣಿಕೆ.'),
          paths: [[[-HALF, 0, THICK + 0.003], [0, 0, THICK + 0.003], [HALF, 0, THICK + 0.003]]],
        },
        {
          color: '#ff6b6b', highlight: ['needle_north', 'needle_south', 'compass', 'field_lines'],
          text: t('A compass needle anywhere near the magnet lines up along the field line there.', 'चुंबक के पास कहीं भी दिक्सूचक की सुई वहाँ की क्षेत्र रेखा के अनुदिश हो जाती है।', 'ಕಾಂತದ ಬಳಿ ಎಲ್ಲಿಯಾದರೂ ದಿಕ್ಸೂಚಿಯ ಸೂಜಿ ಅಲ್ಲಿನ ಕ್ಷೇತ್ರ ರೇಖೆಯ ಉದ್ದಕ್ಕೂ ನಿಲ್ಲುತ್ತದೆ.'),
          paths: flat.slice(2, 6).map((l) => every(l, 14)),
        },
        {
          color: '#bfe4ff', highlight: ['field_all_round'],
          text: t('The field fills all the space round the magnet, not just the page.', 'क्षेत्र केवल पन्ने पर नहीं, चुंबक के चारों ओर पूरे स्थान में फैला है।', 'ಕ್ಷೇತ್ರ ಪುಟದಲ್ಲಿ ಮಾತ್ರವಲ್ಲ, ಕಾಂತದ ಸುತ್ತಲಿನ ಎಲ್ಲಾ ಜಾಗದಲ್ಲೂ ಇದೆ.'),
          paths: round.slice(0, 10).map((l) => every(l, 14)),
        },
      ],
    },
  ],
};
