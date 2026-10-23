// A molar cut down the middle, built in code from textbook measurements
// (simplified): enamel, dentine, pulp with its nerve and blood vessels,
// cementum, the periodontal ligament, the gum and the jaw bone. Each layer is
// a rounded solid from its outline (millimetres, the neck of the tooth at
// y = 0), so the ready-made cut shows the layers as the textbook section does.
// Downloaded on first use.
import { curveThrough, taperTube } from '../lib/shapes.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const OUTLINES = {
  enamel: [[-4.7, -0.3], [-5.6, 2.2], [-5.7, 4.8], [-4.6, 7.0], [-2.9, 7.6], [-1.4, 6.6], [0, 5.9], [1.4, 6.6], [2.9, 7.6], [4.6, 7.0], [5.7, 4.8], [5.6, 2.2], [4.7, -0.3], [0, -0.6]],
  dentine: [[-3.0, -12.6], [-3.7, -9], [-4.3, -4], [-4.6, 0], [-5.05, 2.2], [-4.95, 4.6], [-4.0, 6.1], [-2.9, 6.45], [-1.6, 5.6], [0, 5.0], [1.6, 5.6], [2.9, 6.45], [4.0, 6.1], [4.95, 4.6], [5.05, 2.2], [4.6, 0], [4.3, -4], [3.7, -9], [3.0, -12.6], [2.3, -12.9], [1.75, -9], [1.25, -5.2], [0, -3.8], [-1.25, -5.2], [-1.75, -9], [-2.3, -12.9]],
  pulp: [[-2.25, -12.5], [-2.65, -9], [-2.95, -4], [-3.1, 0.5], [-3.0, 3.0], [-2.5, 4.3], [-1.5, 3.4], [0, 3.0], [1.5, 3.4], [2.5, 4.3], [3.0, 3.0], [3.1, 0.5], [2.95, -4], [2.65, -9], [2.25, -12.5], [1.95, -12.5], [2.15, -9], [2.05, -4.5], [1.0, -1.6], [0, -1.2], [-1.0, -1.6], [-2.05, -4.5], [-2.15, -9], [-1.95, -12.5]],
  cementum: [[-4.85, 0.0], [-4.55, -4], [-3.95, -9], [-3.15, -12.9], [-2.3, -13.15], [-1.5, -9], [-1.0, -5.2], [0, -3.55], [1.0, -5.2], [1.5, -9], [2.3, -13.15], [3.15, -12.9], [3.95, -9], [4.55, -4], [4.85, 0.0], [0, 0.4]],
  ligament: [[-5.1, -1.6], [-4.85, -4], [-4.25, -9], [-3.35, -13.35], [-2.25, -13.45], [-1.25, -9], [-0.75, -5.3], [0, -3.25], [0.75, -5.3], [1.25, -9], [2.25, -13.45], [3.35, -13.35], [4.25, -9], [4.85, -4], [5.1, -1.6], [0, -1.0]],
  bone: [[-8.5, -17], [8.5, -17], [8.5, -2.3], [5.6, -1.6], [0, -2.1], [-5.6, -1.6], [-8.5, -2.3]],
  gum: [[-8.5, -4.2], [8.5, -4.2], [8.5, -1.4], [6.4, 0.1], [5.25, 1.15], [0, 0.9], [-5.25, 1.15], [-6.4, 0.1], [-8.5, -1.4]],
};
// Depth front to back (mm) and how round the edges are.
const DEPTH = { enamel: [11.2, 3.2], dentine: [10.2, 2.8], pulp: [4.2, 0.12], cementum: [10.6, 2.6], ligament: [11.0, 2.6], bone: [13.5, 0.8], gum: [14.5, 1.6] };
// Smooth outlines, except the blocks of bone and gum, which keep corners.
const SHARP = new Set(['bone', 'gum']);

/** A rounded solid from an outline, centred front to back, in metres. */
function solid(THREE, id) {
  const pts = OUTLINES[id].map(([x, y]) => new THREE.Vector2(x, y));
  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x, pts[0].y);
  if (SHARP.has(id)) for (const p of pts.slice(1)) shape.lineTo(p.x, p.y);
  else shape.splineThru([...pts.slice(1), pts[0]]);
  const [depth, round] = DEPTH[id];
  const bevel = Math.min(round, depth / 2 - 0.05);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 2 * bevel, curveSegments: 8, bevelEnabled: true, bevelThickness: bevel, bevelSize: Math.min(bevel, id === 'pulp' ? 0.12 : bevel * 0.45), bevelOffset: -Math.min(bevel, id === 'pulp' ? 0.12 : bevel * 0.45), bevelSegments: 6,
  });
  g.translate(0, 0, -(depth - 2 * bevel) / 2);
  return g.scale(0.001, 0.001, 0.001);
}

/** The nerve or the blood vessel up each root canal into the pulp chamber. */
function canals(THREE, dx, dz, r) {
  const mm = (p) => p.map((v) => v * 0.001);
  return [-1, 1].map((s) => taperTube(THREE, curveThrough(THREE, [[2.45 * s + dx, -17.5, dz], [2.2 * s + dx, -12.4, dz], [2.4 * s + dx, -9, dz], [2.5 * s + dx, -4, dz], [2.4 * s + dx, 0, dz], [1.4 * s + dx, 2.2, dz], [0.4 * s + dx, 2.6, dz]].map(mm)), r * 0.001, r * 0.0008, { segments: 60, radial: 10 }));
}

export default {
  id: 'tooth',
  version: 1,
  order: 6.3,
  source: 'procedural',
  remote: true,
  topic: 'human',
  license: 'Same as the app',
  subject: 'Biology',
  classes: [5, 7, 10],
  title: t('Tooth (inside a molar)', 'दाँत (दाढ़ के भीतर)', 'ಹಲ್ಲು (ದವಡೆಹಲ್ಲಿನ ಒಳಗೆ)'),
  summary: t(
    'A molar cut in half: hard enamel over dentine, the soft pulp with its nerve and blood vessels, and the roots held in the jaw bone. Simplified model.',
    'बीच से कटी दाढ़: डेंटीन के ऊपर कठोर इनैमल, नस और रक्त वाहिकाओं वाला कोमल गूदा, और जबड़े की हड्डी में जमी जड़ें। सरलीकृत मॉडल।',
    'ಅರ್ಧಕ್ಕೆ ಕತ್ತರಿಸಿದ ದವಡೆಹಲ್ಲು: ದಂತದ್ರವ್ಯದ ಮೇಲೆ ಗಟ್ಟಿಯಾದ ಎನಾಮೆಲ್, ನರ ಮತ್ತು ರಕ್ತನಾಳಗಳಿರುವ ಮೃದು ತಿರುಳು, ದವಡೆ ಮೂಳೆಯಲ್ಲಿ ಹಿಡಿದಿರುವ ಬೇರುಗಳು. ಸರಳೀಕೃತ ಮಾದರಿ.',
  ),
  keywords: ['tooth', 'teeth', 'molar', 'enamel', 'dentine', 'dentin', 'pulp', 'root', 'gum', 'cavity', 'tooth decay', 'dental care', 'structure of tooth', 'digestion', 'nutrition in animals'],
  credit: 'Simplified model built by Zynetix from textbook measurements',
  groups: [
    { id: 'tooth', name: t('Tooth', 'दाँत', 'ಹಲ್ಲು') },
    { id: 'living', name: t('Living core', 'जीवित भाग', 'ಜೀವಂತ ಭಾಗ') },
    { id: 'jaw', name: t('Gum and jaw', 'मसूड़ा और जबड़ा', 'ಒಸಡು ಮತ್ತು ದವಡೆ') },
  ],
  build(THREE) {
    const out = {};
    for (const id of Object.keys(OUTLINES)) out[id] = solid(THREE, id);
    out.nerve = canals(THREE, -0.13, -0.05, 0.2);
    out.blood_vessels = canals(THREE, 0.13, -0.05, 0.19);
    return out;
  },
  // Outer layers first: on a cut face the inner ones are drawn over them.
  parts: [
    {
      id: 'bone', group: 'jaw', color: '#d4bf97', inside: '#b99c6c', explode: [0, -0.5, 0],
      name: t('Jaw bone', 'जबड़े की हड्डी', 'ದವಡೆ ಮೂಳೆ'),
      info: t('The roots sit in sockets in the jaw bone.', 'जड़ें जबड़े की हड्डी के गड्ढों (कोटरों) में जमी होती हैं।', 'ಬೇರುಗಳು ದವಡೆ ಮೂಳೆಯ ಗುಳಿಗಳಲ್ಲಿ ಕುಳಿತಿವೆ.'),
    },
    {
      id: 'gum', group: 'jaw', color: '#e5838f', inside: '#d26b78', explode: [0, -0.2, 0.5],
      name: t('Gum (gingiva)', 'मसूड़ा', 'ಒಸಡು'),
      info: t('Soft pink tissue that covers the jaw bone and fits tightly round the neck of the tooth. Brushing and flossing keep it healthy.', 'कोमल गुलाबी ऊतक जो जबड़े की हड्डी को ढकता है और दाँत की गर्दन के चारों ओर कसकर लगा रहता है। ब्रश करने और फ़्लॉस करने से यह स्वस्थ रहता है।', 'ದವಡೆ ಮೂಳೆಯನ್ನು ಮುಚ್ಚಿ ಹಲ್ಲಿನ ಕುತ್ತಿಗೆಯ ಸುತ್ತ ಬಿಗಿಯಾಗಿ ಹೊಂದಿಕೊಳ್ಳುವ ಮೃದು ಗುಲಾಬಿ ಅಂಗಾಂಶ. ಬ್ರಷ್ ಮತ್ತು ಫ್ಲಾಸ್ ಮಾಡುವುದರಿಂದ ಇದು ಆರೋಗ್ಯವಾಗಿರುತ್ತದೆ.'),
    },
    {
      id: 'ligament', group: 'jaw', color: '#b5655f', inside: '#a85a55', minor: true, explode: [0, -0.35, 0],
      name: t('Periodontal ligament', 'परिदंत स्नायु', 'ಪರಿದಂತ ಅಸ್ಥಿರಜ್ಜು'),
      info: t('A thin layer of fibres that ties the root to the bone and cushions it when we bite.', 'रेशों की पतली परत जो जड़ को हड्डी से बाँधती है और काटते समय गद्दी का काम करती है।', 'ಬೇರನ್ನು ಮೂಳೆಗೆ ಕಟ್ಟಿ, ಕಚ್ಚುವಾಗ ಮೆತ್ತೆಯಂತೆ ಕೆಲಸ ಮಾಡುವ ನಾರುಗಳ ತೆಳು ಪದರ.'),
    },
    {
      id: 'cementum', group: 'tooth', color: '#d9b36b', inside: '#c99e52', explode: [0, -0.1, 0.25],
      name: t('Cementum', 'सीमेंटम (दंतमूल-आवरण)', 'ಸಿಮೆಂಟಮ್'),
      info: t('A thin bony layer covering the roots, to which the ligament fibres are fixed.', 'जड़ों को ढकने वाली पतली हड्डी जैसी परत, जिससे स्नायु के रेशे जुड़े रहते हैं।', 'ಬೇರುಗಳನ್ನು ಮುಚ್ಚಿರುವ ತೆಳು ಮೂಳೆಯಂತಹ ಪದರ; ಅಸ್ಥಿರಜ್ಜು ನಾರುಗಳು ಇದಕ್ಕೆ ಅಂಟಿಕೊಂಡಿವೆ.'),
    },
    {
      id: 'enamel', group: 'tooth', color: '#f6f4ee', inside: '#ece6d6', explode: [0, 0.7, 0.2],
      name: t('Enamel', 'इनैमल (दंतवल्क)', 'ಎನಾಮೆಲ್'),
      info: t('The hardest substance in the body, covering the crown. It has no living cells, so it cannot repair itself: acids made by bacteria from sugar dissolve it into cavities.', 'शरीर का सबसे कठोर पदार्थ, जो शिखर को ढकता है। इसमें जीवित कोशिकाएँ नहीं होतीं, इसलिए यह स्वयं ठीक नहीं होता: शर्करा से जीवाणुओं द्वारा बने अम्ल इसे घोलकर गड्ढे (कैविटी) बना देते हैं।', 'ದೇಹದ ಅತ್ಯಂತ ಗಟ್ಟಿಯಾದ ವಸ್ತು, ಕಿರೀಟವನ್ನು ಮುಚ್ಚಿದೆ. ಇದರಲ್ಲಿ ಜೀವಕೋಶಗಳಿಲ್ಲ, ಆದ್ದರಿಂದ ತಾನೇ ದುರಸ್ತಿ ಆಗದು: ಸಕ್ಕರೆಯಿಂದ ಬ್ಯಾಕ್ಟೀರಿಯಾ ತಯಾರಿಸುವ ಆಮ್ಲಗಳು ಇದನ್ನು ಕರಗಿಸಿ ಹುಳುಕು ಮಾಡುತ್ತವೆ.'),
    },
    {
      id: 'dentine', group: 'tooth', color: '#f2e2ae', inside: '#f3df9e', explode: [0, 0.15, 0],
      name: t('Dentine', 'डेंटीन (दंतधातु)', 'ಡೆಂಟೈನ್ (ದಂತದ್ರವ್ಯ)'),
      info: t('The yellowish bulk of the tooth under the enamel, softer than enamel and full of tiny tubes that carry feelings of cold and pain to the pulp.', 'इनैमल के नीचे दाँत का पीलापन लिए मुख्य भाग, इनैमल से नरम और छोटी नलियों से भरा, जो ठंडक और दर्द की अनुभूति गूदे तक पहुँचाती हैं।', 'ಎನಾಮೆಲ್ ಕೆಳಗಿನ ಹಲ್ಲಿನ ಹಳದಿ ಮುಖ್ಯ ಭಾಗ; ಎನಾಮೆಲ್‌ಗಿಂತ ಮೃದು, ತಣ್ಣಗೆ ಮತ್ತು ನೋವಿನ ಅನುಭವವನ್ನು ತಿರುಳಿಗೆ ಸಾಗಿಸುವ ಸಣ್ಣ ನಾಳಗಳಿಂದ ತುಂಬಿದೆ.'),
    },
    {
      id: 'pulp', group: 'living', color: '#e45a68', inside: '#d9505f', explode: [0, 0.1, 0.65],
      name: t('Pulp and root canals', 'गूदा (मज्जा) और मूल नलिकाएँ', 'ತಿರುಳು ಮತ್ತು ಬೇರು ನಾಳಗಳು'),
      info: t('The soft living centre of the tooth, reaching down each root in a root canal.', 'दाँत का कोमल जीवित केंद्र, जो हर जड़ में मूल नलिका के रूप में नीचे तक जाता है।', 'ಹಲ್ಲಿನ ಮೃದುವಾದ ಜೀವಂತ ಕೇಂದ್ರ; ಪ್ರತಿ ಬೇರಿನಲ್ಲಿ ಬೇರು ನಾಳವಾಗಿ ಕೆಳಗಿಳಿಯುತ್ತದೆ.'),
    },
    {
      id: 'nerve', group: 'living', color: '#f4d35e', explode: [-0.15, -0.3, 0.8],
      name: t('Nerve', 'तंत्रिका (नस)', 'ನರ'),
      info: t('Enters through a tiny hole at the tip of each root. A toothache is this nerve signalling damage.', 'हर जड़ के सिरे के छोटे छेद से प्रवेश करती है। दाँत का दर्द इसी नस का क्षति का संकेत है।', 'ಪ್ರತಿ ಬೇರಿನ ತುದಿಯ ಸಣ್ಣ ರಂಧ್ರದ ಮೂಲಕ ಒಳಬರುತ್ತದೆ. ಹಲ್ಲುನೋವು ಎಂದರೆ ಈ ನರ ಹಾನಿಯ ಸಂಕೇತ ಕಳುಹಿಸುವುದು.'),
    },
    {
      id: 'blood_vessels', group: 'living', color: '#c62f36', explode: [0.15, -0.3, 0.8],
      name: t('Blood vessels', 'रक्त वाहिकाएँ', 'ರಕ್ತನಾಳಗಳು'),
      info: t('Bring food and oxygen to the living cells of the pulp, which keep making dentine.', 'गूदे की जीवित कोशिकाओं तक भोजन और ऑक्सीजन लाती हैं, जो डेंटीन बनाती रहती हैं।', 'ಡೆಂಟೈನ್ ತಯಾರಿಸುತ್ತಲೇ ಇರುವ ತಿರುಳಿನ ಜೀವಕೋಶಗಳಿಗೆ ಆಹಾರ ಮತ್ತು ಆಮ್ಲಜನಕ ತರುತ್ತವೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0.12, 1] },
    { id: 'angle', name: t('At an angle', 'तिरछे', 'ಓರೆಯಾಗಿ'), dir: [0.65, 0.4, 1] },
  ],
  slices: [
    { id: 'section', name: t('Cut down the middle', 'बीच से काट', 'ಮಧ್ಯದಲ್ಲಿ ಕತ್ತರಿಕೆ'), normal: [0, 0, -1], offset: 0, view: 'front' },
  ],
  animations: [],
};
