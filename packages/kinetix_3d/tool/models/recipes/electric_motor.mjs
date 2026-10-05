// A simple DC electric motor, built in code, as in the class 10 picture:
// a coil between the poles of a magnet, a split-ring commutator, carbon
// brushes and a cell. The field runs from N (left) to S (right); with the
// current shown, Fleming's left-hand rule pushes the left side down and the
// right side up, so the coil turns anticlockwise seen from the front.
import { taperTube, curveThrough, rod, blob } from '../lib/shapes.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const W = 0.03, L = 0.036; // coil half-width (x) and half-length (z)
const CZ = 0.058, CR = 0.0085; // commutator position and radius
const POLE = 0.047; // pole faces at x = ±POLE

/** A cone-headed arrow from [a] to [b]. */
function arrow(THREE, a, b, r = 0.0016) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const len = d.length();
  const head = Math.min(len * 0.35, r * 5);
  const shaftEnd = A.clone().addScaledVector(d.normalize(), len - head);
  const cone = new THREE.ConeGeometry(r * 2.4, head, 16);
  cone.translate(0, head / 2, 0);
  cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
  cone.translate(shaftEnd.x, shaftEnd.y, shaftEnd.z);
  return [rod(THREE, a, shaftEnd.toArray(), r, 12), cone];
}

/** Half of the split ring: an arc of a thick ring from angle a0 to a1 (degrees), around the z axis. */
function halfRing(THREE, a0, a1) {
  const s = new THREE.Shape();
  const r0 = CR - 0.0022, r1 = CR;
  const A0 = (a0 * Math.PI) / 180, A1 = (a1 * Math.PI) / 180;
  s.absarc(0, 0, r1, A0, A1, false);
  s.lineTo(Math.cos(A1) * r0, Math.sin(A1) * r0);
  s.absarc(0, 0, r0, A1, A0, true);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 24 });
  return g.translate(0, 0, CZ - 0.006);
}

export default {
  id: 'electric_motor',
  version: 1,
  order: 1,
  source: 'procedural',
  subject: 'Physics',
  classes: [10, 12],
  title: t('Electric motor', 'विद्युत मोटर', 'ವಿದ್ಯುತ್ ಮೋಟಾರ್'),
  summary: t(
    'A current-carrying coil in a magnetic field feels a force (Fleming\'s left-hand rule) and turns. The split-ring commutator reverses the current every half turn so it keeps turning.',
    'चुंबकीय क्षेत्र में धारावाही कुंडली पर बल लगता है (फ्लेमिंग का वामहस्त नियम) और वह घूमती है। विभक्त वलय दिक्परिवर्तक हर आधे चक्कर पर धारा उलट देता है ताकि वह घूमती रहे।',
    'ಕಾಂತಕ್ಷೇತ್ರದಲ್ಲಿರುವ ವಿದ್ಯುತ್ ಹರಿಯುವ ಸುರುಳಿಯ ಮೇಲೆ ಬಲ ಬೀಳುತ್ತದೆ (ಫ್ಲೆಮಿಂಗ್‌ನ ಎಡಗೈ ನಿಯಮ), ಅದು ತಿರುಗುತ್ತದೆ. ಸೀಳು ಉಂಗುರ ದಿಕ್ಪರಿವರ್ತಕ ಪ್ರತಿ ಅರ್ಧ ಸುತ್ತಿಗೆ ವಿದ್ಯುತ್ತನ್ನು ತಿರುಗಿಸುವುದರಿಂದ ಅದು ತಿರುಗುತ್ತಲೇ ಇರುತ್ತದೆ.',
  ),
  keywords: ['electric motor', 'motor', 'magnetic effects of electric current', 'fleming', 'left hand rule', 'commutator', 'split ring', 'armature', 'force on a current carrying conductor', 'moving charges and magnetism'],
  credit: 'Model built by KINETIX',
  groups: [
    { id: 'magnet', name: t('Magnet', 'चुंबक', 'ಕಾಂತ') },
    { id: 'rotor', name: t('Turning parts', 'घूमने वाले भाग', 'ತಿರುಗುವ ಭಾಗಗಳು') },
    { id: 'circuit', name: t('Circuit', 'परिपथ', 'ಮಂಡಲ') },
    { id: 'ideas', name: t('Field and force', 'क्षेत्र और बल', 'ಕ್ಷೇತ್ರ ಮತ್ತು ಬಲ') },
  ],
  build(THREE) {
    const box = (sx, sy, sz, x, y, z) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
    const tube = (pts, r, seg = 64) => taperTube(THREE, curveThrough(THREE, pts), r, r, { segments: seg, radial: 10 });
    // The coil: a rectangle lying flat (parallel to the field), its leads
    // running forward to the two halves of the split ring.
    const coil = tube(
      [
        [-CR, 0.0015, CZ - 0.004],
        [-W * 0.7, 0.001, L + 0.008],
        [-W, 0, L],
        [-W, 0, 0],
        [-W, 0, -L],
        [-W * 0.95, 0, -L - 0.002],
        [0, 0, -L - 0.003],
        [W * 0.95, 0, -L - 0.002],
        [W, 0, -L],
        [W, 0, 0],
        [W, 0, L],
        [W * 0.7, -0.001, L + 0.008],
        [CR, -0.0015, CZ - 0.004],
      ],
      0.0024,
      160,
    );
    const field = [];
    for (const [y, z] of [[0.016, 0.024], [0.016, -0.024], [-0.016, 0.024], [-0.016, -0.024], [0.0, 0.0]]) {
      field.push(rod(THREE, [-POLE, y, z], [POLE, y, z], 0.0006, 8));
      field.push(...arrow(THREE, [-0.006, y, z], [0.006, y, z], 0.0006));
    }
    return {
      north_pole: box(0.03, 0.05, 0.085, -POLE - 0.015, 0, 0),
      south_pole: box(0.03, 0.05, 0.085, POLE + 0.015, 0, 0),
      coil,
      commutator: [halfRing(THREE, 95, 265), halfRing(THREE, -85, 85)],
      axle: rod(THREE, [0, 0, -0.05], [0, 0, CZ + 0.014], 0.0022, 16),
      brushes: [box(0.007, 0.006, 0.009, -CR - 0.0035, 0, CZ), box(0.007, 0.006, 0.009, CR + 0.0035, 0, CZ)],
      battery: [rod(THREE, [-0.018, -0.058, CZ], [0.016, -0.058, CZ], 0.0075, 24), rod(THREE, [0.016, -0.058, CZ], [0.02, -0.058, CZ], 0.0028, 12)],
      wires: [
        tube([[-CR - 0.007, 0, CZ], [-0.028, -0.01, CZ], [-0.03, -0.045, CZ], [-0.018, -0.058, CZ]], 0.0011),
        tube([[CR + 0.007, 0, CZ], [0.028, -0.01, CZ], [0.03, -0.045, CZ], [0.021, -0.058, CZ]], 0.0011),
      ],
      field,
      force: [...arrow(THREE, [-W, -0.004, 0], [-W, -0.034, 0]), ...arrow(THREE, [W, 0.004, 0], [W, 0.034, 0])],
    };
  },
  parts: [
    {
      id: 'north_pole', group: 'magnet', color: '#c93a3a', matte: true, explode: [-1.2, 0, 0],
      name: t('North pole (N)', 'उत्तरी ध्रुव (N)', 'ಉತ್ತರ ಧ್ರುವ (N)'),
      info: t('One pole of a strong magnet. Field lines leave the north pole.', 'एक प्रबल चुंबक का एक ध्रुव। क्षेत्र रेखाएँ उत्तरी ध्रुव से निकलती हैं।', 'ಪ್ರಬಲ ಕಾಂತದ ಒಂದು ಧ್ರುವ. ಕ್ಷೇತ್ರ ರೇಖೆಗಳು ಉತ್ತರ ಧ್ರುವದಿಂದ ಹೊರಡುತ್ತವೆ.'),
    },
    {
      id: 'south_pole', group: 'magnet', color: '#3561c4', matte: true, explode: [1.2, 0, 0],
      name: t('South pole (S)', 'दक्षिणी ध्रुव (S)', 'ದಕ್ಷಿಣ ಧ್ರುವ (S)'),
      info: t('The other pole. Field lines enter the south pole.', 'दूसरा ध्रुव। क्षेत्र रेखाएँ दक्षिणी ध्रुव में प्रवेश करती हैं।', 'ಇನ್ನೊಂದು ಧ್ರುವ. ಕ್ಷೇತ್ರ ರೇಖೆಗಳು ದಕ್ಷಿಣ ಧ್ರುವವನ್ನು ಪ್ರವೇಶಿಸುತ್ತವೆ.'),
    },
    {
      id: 'coil', group: 'rotor', color: '#c8783a', explode: [0, 0.6, 0], spin: { axis: [0, 0, 1], speed: 90 },
      name: t('Coil (armature)', 'कुंडली (आर्मेचर)', 'ಸುರುಳಿ (ಆರ್ಮೇಚರ್)'),
      info: t('Many turns of insulated copper wire. The current in it is pushed by the field, and it turns.', 'विद्युतरोधी तांबे के तार के अनेक फेरे। क्षेत्र इसकी धारा पर बल लगाता है और यह घूमती है।', 'ನಿರೋಧಿತ ತಾಮ್ರದ ತಂತಿಯ ಅನೇಕ ಸುತ್ತುಗಳು. ಕ್ಷೇತ್ರ ಇದರ ವಿದ್ಯುತ್ತಿನ ಮೇಲೆ ಬಲ ಹಾಕುತ್ತದೆ, ಇದು ತಿರುಗುತ್ತದೆ.'),
    },
    {
      id: 'commutator', group: 'rotor', color: '#e0a93a', explode: [0, 0, 0.9], spin: { axis: [0, 0, 1], speed: 90 },
      name: t('Split-ring commutator', 'विभक्त वलय दिक्परिवर्तक', 'ಸೀಳು ಉಂಗುರ ದಿಕ್ಪರಿವರ್ತಕ'),
      info: t('Two half rings joined to the coil ends. Every half turn they swap brushes, reversing the current in the coil.', 'कुंडली के सिरों से जुड़े दो अर्ध वलय। हर आधे चक्कर पर ये ब्रश बदलते हैं और कुंडली में धारा उलट देते हैं।', 'ಸುರುಳಿಯ ತುದಿಗಳಿಗೆ ಜೋಡಿಸಿದ ಎರಡು ಅರ್ಧ ಉಂಗುರಗಳು. ಪ್ರತಿ ಅರ್ಧ ಸುತ್ತಿಗೆ ಬ್ರಷ್‌ಗಳನ್ನು ಬದಲಿಸಿ ಸುರುಳಿಯಲ್ಲಿ ವಿದ್ಯುತ್ತನ್ನು ತಿರುಗಿಸುತ್ತವೆ.'),
    },
    {
      id: 'axle', group: 'rotor', color: '#9aa3ad', minor: true, explode: [0, 0, -0.6], spin: { axis: [0, 0, 1], speed: 90 },
      name: t('Axle', 'धुरी', 'ಅಕ್ಷದಂಡ'),
      info: t('The shaft the coil turns on; it can drive a fan or a pump.', 'वह छड़ जिस पर कुंडली घूमती है; यह पंखा या पंप चला सकती है।', 'ಸುರುಳಿ ತಿರುಗುವ ದಂಡ; ಇದು ಫ್ಯಾನ್ ಅಥವಾ ಪಂಪ್ ನಡೆಸಬಹುದು.'),
    },
    {
      id: 'brushes', group: 'circuit', color: '#3c3f44', matte: true, explode: [0, -0.3, 1.1],
      name: t('Carbon brushes', 'कार्बन ब्रश', 'ಕಾರ್ಬನ್ ಬ್ರಷ್‌ಗಳು'),
      info: t('Fixed contacts that press on the turning split ring and carry current in and out.', 'स्थिर संपर्क जो घूमते विभक्त वलय पर दबे रहते हैं और धारा अंदर-बाहर ले जाते हैं।', 'ತಿರುಗುವ ಸೀಳು ಉಂಗುರದ ಮೇಲೆ ಒತ್ತಿರುವ ಸ್ಥಿರ ಸಂಪರ್ಕಗಳು; ವಿದ್ಯುತ್ತನ್ನು ಒಳಗೆ-ಹೊರಗೆ ಸಾಗಿಸುತ್ತವೆ.'),
    },
    {
      id: 'battery', group: 'circuit', color: '#2f9e6a', explode: [0, -0.8, 1.1],
      name: t('Cell', 'सेल', 'ಕೋಶ'),
      info: t('Supplies the current. Reverse it and the motor turns the other way.', 'धारा देता है। इसे उलटने पर मोटर उल्टी दिशा में घूमती है।', 'ವಿದ್ಯುತ್ ಒದಗಿಸುತ್ತದೆ. ಇದನ್ನು ತಿರುಗಿಸಿದರೆ ಮೋಟಾರ್ ವಿರುದ್ಧ ದಿಕ್ಕಿನಲ್ಲಿ ತಿರುಗುತ್ತದೆ.'),
    },
    {
      id: 'wires', group: 'circuit', color: '#d8d2c4', minor: true, explode: [0, -0.55, 1.1],
      name: t('Connecting wires', 'संयोजक तार', 'ಸಂಪರ್ಕ ತಂತಿಗಳು'),
      info: t('Join the cell to the brushes.', 'सेल को ब्रशों से जोड़ते हैं।', 'ಕೋಶವನ್ನು ಬ್ರಷ್‌ಗಳಿಗೆ ಜೋಡಿಸುತ್ತವೆ.'),
    },
    {
      id: 'field', group: 'ideas', color: '#7fc3ff', opacity: 0.75, explode: [0, 0, 0],
      name: t('Magnetic field', 'चुंबकीय क्षेत्र', 'ಕಾಂತಕ್ಷೇತ್ರ'),
      info: t('Field lines run from the north pole to the south pole, across the coil.', 'क्षेत्र रेखाएँ उत्तरी ध्रुव से दक्षिणी ध्रुव की ओर कुंडली के आर-पार चलती हैं।', 'ಕ್ಷೇತ್ರ ರೇಖೆಗಳು ಸುರುಳಿಯನ್ನು ದಾಟಿ ಉತ್ತರ ಧ್ರುವದಿಂದ ದಕ್ಷಿಣ ಧ್ರುವದತ್ತ ಸಾಗುತ್ತವೆ.'),
    },
    {
      id: 'force', group: 'ideas', color: '#ffd23f', hidden: true, glow: 0.4, spin: { axis: [0, 0, 1], speed: 90 },
      name: t('Force on the coil', 'कुंडली पर बल', 'ಸುರುಳಿಯ ಮೇಲಿನ ಬಲ'),
      info: t('Fleming\'s left-hand rule: field (first finger) × current (second finger) gives the force (thumb). One side is pushed down, the other up.', 'फ्लेमिंग का वामहस्त नियम: क्षेत्र (तर्जनी) और धारा (मध्यमा) से बल (अंगूठा) मिलता है। एक भुजा नीचे, दूसरी ऊपर धकेली जाती है।', 'ಫ್ಲೆಮಿಂಗ್‌ನ ಎಡಗೈ ನಿಯಮ: ಕ್ಷೇತ್ರ (ತೋರುಬೆರಳು), ವಿದ್ಯುತ್ (ಮಧ್ಯದ ಬೆರಳು) ಬಲವನ್ನು (ಹೆಬ್ಬೆರಳು) ನೀಡುತ್ತವೆ. ಒಂದು ಬದಿ ಕೆಳಗೆ, ಇನ್ನೊಂದು ಮೇಲೆ ತಳ್ಳಲ್ಪಡುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.45, 0.55, 1] },
    { id: 'end', name: t('Along the axle', 'धुरी की दिशा से', 'ಅಕ್ಷದಂಡದ ದಿಕ್ಕಿನಿಂದ'), dir: [0.02, 0.05, 1] },
    { id: 'above', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.3] },
  ],
  slices: [],
  animations: [
    { id: 'run', kind: 'orbit', name: t('Switch on', 'चालू करें', 'ಚಾಲೂ ಮಾಡಿ') },
    {
      id: 'how', kind: 'flow',
      name: t('How it works', 'यह कैसे काम करती है', 'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ'),
      steps: [
        {
          color: '#ffe066', highlight: ['battery', 'wires', 'brushes'],
          text: t('Current flows from the cell, through a brush, into the split ring and the coil.', 'धारा सेल से, एक ब्रश से होकर, विभक्त वलय और कुंडली में जाती है।', 'ವಿದ್ಯುತ್ ಕೋಶದಿಂದ, ಒಂದು ಬ್ರಷ್ ಮೂಲಕ, ಸೀಳು ಉಂಗುರ ಮತ್ತು ಸುರುಳಿಗೆ ಹರಿಯುತ್ತದೆ.'),
          paths: [[[-0.018, -0.058, CZ], [-0.03, -0.045, CZ], [-0.028, -0.01, CZ], [-CR - 0.004, 0, CZ], [-CR, 0.0015, CZ - 0.004]]],
        },
        {
          color: '#ffe066', highlight: ['coil'],
          text: t('Round the coil: back along the left side, across, and forward along the right side.', 'कुंडली में: बाईं भुजा से पीछे, आर-पार, और दाईं भुजा से आगे।', 'ಸುರುಳಿಯಲ್ಲಿ: ಎಡಬದಿಯಲ್ಲಿ ಹಿಂದಕ್ಕೆ, ಅಡ್ಡಲಾಗಿ, ಬಲಬದಿಯಲ್ಲಿ ಮುಂದಕ್ಕೆ.'),
          paths: [[[-CR, 0.0015, CZ - 0.004], [-W * 0.7, 0.001, L + 0.008], [-W, 0, L], [-W, 0, -L], [0, 0, -L - 0.003], [W, 0, -L], [W, 0, L], [W * 0.7, -0.001, L + 0.008], [CR, -0.0015, CZ - 0.004]]],
        },
        {
          color: '#ffd23f', highlight: ['force', 'field', 'coil'],
          text: t('In the field, the left side is pushed down and the right side up (Fleming\'s left-hand rule), so the coil turns.', 'क्षेत्र में बाईं भुजा नीचे और दाईं ऊपर धकेली जाती है (फ्लेमिंग का वामहस्त नियम), इसलिए कुंडली घूमती है।', 'ಕ್ಷೇತ್ರದಲ್ಲಿ ಎಡಬದಿ ಕೆಳಗೆ, ಬಲಬದಿ ಮೇಲೆ ತಳ್ಳಲ್ಪಡುತ್ತದೆ (ಫ್ಲೆಮಿಂಗ್‌ನ ಎಡಗೈ ನಿಯಮ); ಹಾಗಾಗಿ ಸುರುಳಿ ತಿರುಗುತ್ತದೆ.'),
          paths: [[[-POLE, 0.016, 0.024], [POLE, 0.016, 0.024]], [[-POLE, -0.016, -0.024], [POLE, -0.016, -0.024]]],
        },
        {
          color: '#ffe066', highlight: ['commutator', 'brushes'],
          text: t('After half a turn the split ring swaps brushes. The current in the coil reverses, so the push keeps turning it the same way.', 'आधे चक्कर के बाद विभक्त वलय ब्रश बदल लेता है। कुंडली में धारा उलट जाती है, इसलिए बल उसे उसी दिशा में घुमाता रहता है।', 'ಅರ್ಧ ಸುತ್ತಿನ ನಂತರ ಸೀಳು ಉಂಗುರ ಬ್ರಷ್‌ಗಳನ್ನು ಬದಲಿಸುತ್ತದೆ. ಸುರುಳಿಯಲ್ಲಿ ವಿದ್ಯುತ್ ತಿರುಗುತ್ತದೆ; ಹಾಗಾಗಿ ಬಲ ಅದನ್ನು ಅದೇ ದಿಕ್ಕಿನಲ್ಲಿ ತಿರುಗಿಸುತ್ತಲೇ ಇರುತ್ತದೆ.'),
          paths: [[[CR, -0.0015, CZ - 0.004], [CR + 0.004, 0, CZ], [0.028, -0.01, CZ], [0.03, -0.045, CZ], [0.021, -0.058, CZ]]],
        },
      ],
    },
  ],
};
