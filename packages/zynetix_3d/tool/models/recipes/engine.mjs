// A single-cylinder four-stroke petrol engine, cut away to show the inside,
// built in code at about real size (84 mm bore). "Run" turns the crankshaft:
// the piston, connecting rod, valves and spark move as in a real engine over
// the four strokes (720° of the crank).
import { revolve, rod } from '../lib/shapes.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const R = 0.035; // crank radius (stroke 70 mm)
const L = 0.115; // connecting rod
const PIN = R + L; // piston pin height at top dead centre
const BORE = 0.042;
const DECK = 0.205; // top of the cylinder

/** A solid of revolution about y over part of a turn (the cut-away half), open at the cut. */
function revolveArc(THREE, loop, a0, a1, seg = 48) {
  const pos = [], idx = [];
  for (let j = 0; j <= seg; j++) {
    const a = a0 + ((a1 - a0) * j) / seg;
    for (const [r, y] of loop) pos.push(r * Math.sin(a), y, r * Math.cos(a));
  }
  const n = loop.length;
  for (let j = 0; j < seg; j++) {
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      const a = j * n + i, b = j * n + i2, c = (j + 1) * n + i, d = (j + 1) * n + i2;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// The back half (z < 0) is kept: from 90° round the back to 270°.
const BACK = [Math.PI / 2, (3 * Math.PI) / 2];

export default {
  id: 'engine',
  version: 1,
  order: 1,
  source: 'procedural',
  subject: 'Engineering',
  classes: [9, 10, 11, 12],
  title: t('Four-stroke petrol engine', 'चार-स्ट्रोक पेट्रोल इंजन', 'ನಾಲ್ಕು-ಸ್ಟ್ರೋಕ್ ಪೆಟ್ರೋಲ್ ಎಂಜಿನ್'),
  summary: t(
    'Fuel burns inside the cylinder and pushes the piston down; the connecting rod and crankshaft turn that push into turning. Each cycle has four strokes: intake, compression, power and exhaust.',
    'ईंधन सिलिंडर के भीतर जलकर पिस्टन को नीचे धकेलता है; संयोजी छड़ और क्रैंकशाफ़्ट इस धक्के को घूर्णन में बदलते हैं। हर चक्र में चार स्ट्रोक: चूषण, संपीडन, शक्ति और निष्कासन।',
    'ಇಂಧನ ಸಿಲಿಂಡರ್ ಒಳಗೆ ಉರಿದು ಪಿಸ್ಟನ್ ಅನ್ನು ಕೆಳಗೆ ತಳ್ಳುತ್ತದೆ; ಸಂಪರ್ಕ ದಂಡ ಮತ್ತು ಕ್ರ್ಯಾಂಕ್‌ಶಾಫ್ಟ್ ಆ ತಳ್ಳುವಿಕೆಯನ್ನು ತಿರುಗುವಿಕೆಯಾಗಿ ಬದಲಿಸುತ್ತವೆ. ಪ್ರತಿ ಚಕ್ರದಲ್ಲಿ ನಾಲ್ಕು ಸ್ಟ್ರೋಕ್‌ಗಳು: ಸೇವನೆ, ಸಂಪೀಡನ, ಶಕ್ತಿ ಮತ್ತು ನಿಷ್ಕಾಸ.',
  ),
  keywords: ['engine', 'petrol engine', 'piston', 'crankshaft', 'internal combustion', 'four stroke', 'valves', 'spark plug', 'heat engine', 'combustion', 'connecting rod', 'machines', 'energy conversion'],
  credit: 'Model built by ZYNETIX (a simplified single-cylinder engine)',
  crease: 40,
  build(THREE) {
    const finLoop = (y) => [[BORE + 0.0015, y], [0.082, y], [0.082, y + 0.004], [BORE + 0.0015, y + 0.004]];
    const barrel = [revolveArc(THREE, [[BORE, 0.1], [0.054, 0.1], [0.054, DECK], [BORE, DECK]], ...BACK)];
    for (let y = 0.11; y < DECK - 0.006; y += 0.013) barrel.push(revolveArc(THREE, finLoop(y), ...BACK));
    const head = [revolveArc(THREE, [[0, DECK + 0.026], [0.03, DECK + 0.022], [BORE, DECK + 0.006], [BORE, DECK], [0.06, DECK], [0.06, DECK + 0.045], [0, DECK + 0.05]], ...BACK)];
    for (let y = DECK + 0.006; y < DECK + 0.045; y += 0.012) head.push(revolveArc(THREE, finLoop(y).map(([r, yy]) => [r * 0.95, yy]), ...BACK));
    // The piston: crown, skirt, three rings and the gudgeon pin.
    const piston = [revolve(THREE, [[0, PIN - 0.016], [BORE - 0.0006, PIN - 0.016], [BORE - 0.0006, PIN + 0.04], [0.03, PIN + 0.042], [0, PIN + 0.041]], 64)];
    for (const y of [PIN + 0.034, PIN + 0.028, PIN + 0.022]) piston.push(new THREE.TorusGeometry(BORE - 0.0005, 0.0012, 6, 64).rotateX(Math.PI / 2).translate(0, y, 0));
    piston.push(rod(THREE, [0, PIN, -0.03], [0, PIN, 0.03], 0.008, 20));
    // The connecting rod, drawn at top dead centre (straight up).
    const big = new THREE.TorusGeometry(0.017, 0.006, 12, 40).translate(0, R, 0);
    const small = new THREE.TorusGeometry(0.0105, 0.0045, 12, 32).translate(0, PIN, 0);
    const beam = new THREE.BoxGeometry(0.012, L - 0.03, 0.01).translate(0, (R + PIN) / 2, 0);
    // The crankshaft: main shaft, two webs with counterweights, the crank pin.
    const webs = [-0.02, 0.02].map((z) => {
      const s = new THREE.Shape();
      s.absarc(0, 0, 0.05, Math.PI * 1.1, Math.PI * 1.9, false);
      s.lineTo(0.016, R);
      s.absarc(0, R, 0.016, 0, Math.PI, false);
      s.lineTo(-0.016, 0);
      return new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 24 }).translate(0, 0, z - 0.005);
    });
    const crank = [rod(THREE, [0, 0, -0.12], [0, 0, 0.09], 0.012, 28), rod(THREE, [0, R, -0.026], [0, R, 0.026], 0.0105, 24), ...webs];
    const flywheel = [new THREE.CylinderGeometry(0.1, 0.1, 0.018, 72).rotateX(Math.PI / 2).translate(0, 0, -0.13), new THREE.TorusGeometry(0.096, 0.008, 10, 72).translate(0, 0, -0.13)];
    // Valves (mushroom heads in the head), the spark plug between them.
    const valve = (x) => [new THREE.CylinderGeometry(0.0035, 0.0145, 0.006, 32).translate(x, DECK + 0.004, 0), rod(THREE, [x, DECK + 0.006, 0], [x, DECK + 0.085, 0], 0.003, 12), new THREE.CylinderGeometry(0.008, 0.008, 0.004, 20).translate(x, DECK + 0.08, 0)];
    const spring = (x) => {
      const pts = [];
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * Math.PI * 2 * 6;
        pts.push(new THREE.Vector3(x + 0.0075 * Math.cos(a), DECK + 0.052 + (0.026 * i) / 120, 0.0075 * Math.sin(a)));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.0011, 6, false);
    };
    const plug = [rod(THREE, [0, DECK + 0.026, 0], [0, DECK + 0.05, 0], 0.006, 16), new THREE.CylinderGeometry(0.0095, 0.0095, 0.01, 6).translate(0, DECK + 0.056, 0), rod(THREE, [0, DECK + 0.061, 0], [0, DECK + 0.09, 0], 0.0055, 16), rod(THREE, [0, DECK + 0.09, 0], [0, DECK + 0.097, 0], 0.003, 12)];
    // The charge in the combustion chamber: it glows when it burns.
    const spark = new THREE.CylinderGeometry(BORE * 0.96, BORE * 0.96, 0.009, 48).translate(0, DECK - 0.0035, 0);
    // Ports: the intake pipe to the left, the exhaust to the right.
    const intake = [rod(THREE, [-0.016, DECK + 0.03, 0], [-0.07, DECK + 0.05, 0], 0.011, 24), rod(THREE, [-0.07, DECK + 0.05, 0], [-0.13, DECK + 0.05, 0], 0.012, 24)];
    const exhaust = [rod(THREE, [0.016, DECK + 0.03, 0], [0.07, DECK + 0.045, 0], 0.011, 24), rod(THREE, [0.07, DECK + 0.045, 0], [0.12, DECK + 0.0, 0], 0.012, 24), rod(THREE, [0.12, DECK, 0], [0.15, DECK - 0.1, 0], 0.012, 24)];
    // The crankcase: the back half of a drum round the crank.
    const caseLoop = [[0, -0.075], [0.06, -0.075], [0.075, -0.05], [0.075, 0.05], [0.06, 0.1], [0.054, 0.1], [0.054, 0.095], [0.069, 0.05], [0.069, -0.05], [0.056, -0.069], [0, -0.069]];
    const crankcase = new THREE.LatheGeometry(caseLoop.map(([r, y]) => new THREE.Vector2(r, y)), 48, BACK[0], Math.PI);
    return {
      cylinder: barrel,
      head,
      piston,
      conrod: [big, small, beam],
      crankshaft: crank,
      flywheel,
      intake_valve: [...valve(-0.017)],
      exhaust_valve: [...valve(0.017)],
      springs: [spring(-0.017), spring(0.017)],
      spark_plug: plug,
      spark,
      intake_port: intake,
      exhaust_port: exhaust,
      crankcase,
    };
  },
  groups: [
    { id: 'moving', name: t('Moving parts', 'चलने वाले भाग', 'ಚಲಿಸುವ ಭಾಗಗಳು') },
    { id: 'valves', name: t('Valves and spark', 'वाल्व और चिंगारी', 'ಕವಾಟಗಳು ಮತ್ತು ಕಿಡಿ') },
    { id: 'body', name: t('Engine body', 'इंजन का ढाँचा', 'ಎಂಜಿನ್ ದೇಹ') },
  ],
  parts: [
    {
      id: 'piston', group: 'moving', color: '#c9ced4', metal: true, explode: [0, 1.2, 0.6],
      drive: { type: 'slider', axis: [0, 1, 0], r: R, l: L },
      name: t('Piston', 'पिस्टन', 'ಪಿಸ್ಟನ್'),
      info: t('Slides up and down in the cylinder. Its rings seal it so the gases cannot leak past.', 'सिलिंडर में ऊपर-नीचे सरकता है। इसके छल्ले इसे सील करते हैं ताकि गैसें बाहर न निकलें।', 'ಸಿಲಿಂಡರ್‌ನಲ್ಲಿ ಮೇಲೆ-ಕೆಳಗೆ ಜಾರುತ್ತದೆ. ಇದರ ಉಂಗುರಗಳು ಅನಿಲ ಸೋರದಂತೆ ಮುಚ್ಚುತ್ತವೆ.'),
    },
    {
      id: 'conrod', group: 'moving', color: '#8f99a3', metal: true, explode: [0, 0.4, 1],
      drive: { type: 'rod', axis: [0, 0, 1], dir: [0, 1, 0], pin: [0, PIN, 0], r: R, l: L },
      name: t('Connecting rod', 'संयोजी छड़', 'ಸಂಪರ್ಕ ದಂಡ'),
      info: t('Joins the piston to the crankshaft and turns the up-and-down motion into turning.', 'पिस्टन को क्रैंकशाफ़्ट से जोड़ती है और ऊपर-नीचे की गति को घूर्णन में बदलती है।', 'ಪಿಸ್ಟನ್ ಅನ್ನು ಕ್ರ್ಯಾಂಕ್‌ಶಾಫ್ಟ್‌ಗೆ ಜೋಡಿಸಿ ಮೇಲೆ-ಕೆಳಗಿನ ಚಲನೆಯನ್ನು ತಿರುಗುವಿಕೆಯಾಗಿ ಬದಲಿಸುತ್ತದೆ.'),
    },
    {
      id: 'crankshaft', group: 'moving', color: '#6f7a85', metal: true, explode: [0, -0.8, 1],
      drive: { type: 'spin', axis: [0, 0, -1], centre: [0, 0, 0] },
      name: t('Crankshaft', 'क्रैंकशाफ़्ट', 'ಕ್ರ್ಯಾಂಕ್‌ಶಾಫ್ಟ್'),
      info: t('Turns twice in every four-stroke cycle; the heavy webs balance the pull of the piston.', 'हर चार-स्ट्रोक चक्र में दो बार घूमता है; भारी जाले पिस्टन के खिंचाव को संतुलित करते हैं।', 'ಪ್ರತಿ ನಾಲ್ಕು-ಸ್ಟ್ರೋಕ್ ಚಕ್ರದಲ್ಲಿ ಎರಡು ಬಾರಿ ತಿರುಗುತ್ತದೆ; ಭಾರವಾದ ಭಾಗಗಳು ಪಿಸ್ಟನ್‌ನ ಎಳೆತವನ್ನು ಸಮತೋಲನಗೊಳಿಸುತ್ತವೆ.'),
    },
    {
      id: 'flywheel', group: 'moving', color: '#565f68', metal: true, explode: [0, -0.3, -1],
      drive: { type: 'spin', axis: [0, 0, -1], centre: [0, 0, 0] },
      name: t('Flywheel', 'गतिपालक चक्र', 'ಗತಿಪಾಲಕ ಚಕ್ರ'),
      info: t('A heavy wheel that keeps turning between power strokes, so the engine runs smoothly.', 'भारी पहिया जो शक्ति स्ट्रोकों के बीच घूमता रहता है, जिससे इंजन सुचारु चलता है।', 'ಶಕ್ತಿ ಸ್ಟ್ರೋಕ್‌ಗಳ ನಡುವೆ ತಿರುಗುತ್ತಲೇ ಇರುವ ಭಾರವಾದ ಚಕ್ರ; ಎಂಜಿನ್ ಸರಾಗವಾಗಿ ಓಡುತ್ತದೆ.'),
    },
    {
      id: 'intake_valve', group: 'valves', color: '#5aa0e6', metal: true, explode: [-0.6, 1, 0.4],
      drive: { type: 'valve', axis: [0, -1, 0], lift: 0.008, open: [5, 175] },
      name: t('Intake valve', 'चूषण वाल्व', 'ಸೇವನಾ ಕವಾಟ'),
      info: t('Opens on the intake stroke to let in the air and petrol mixture, then closes tight.', 'चूषण स्ट्रोक में खुलकर हवा और पेट्रोल का मिश्रण अंदर आने देता है, फिर कसकर बंद हो जाता है।', 'ಸೇವನಾ ಸ್ಟ್ರೋಕ್‌ನಲ್ಲಿ ತೆರೆದು ಗಾಳಿ-ಪೆಟ್ರೋಲ್ ಮಿಶ್ರಣ ಒಳಬರಲು ಬಿಡುತ್ತದೆ, ನಂತರ ಬಿಗಿಯಾಗಿ ಮುಚ್ಚುತ್ತದೆ.'),
    },
    {
      id: 'exhaust_valve', group: 'valves', color: '#e0703c', metal: true, explode: [0.6, 1, 0.4],
      drive: { type: 'valve', axis: [0, -1, 0], lift: 0.008, open: [545, 715] },
      name: t('Exhaust valve', 'निष्कासन वाल्व', 'ನಿಷ್ಕಾಸ ಕವಾಟ'),
      info: t('Opens on the exhaust stroke to let the burnt gases out.', 'निष्कासन स्ट्रोक में खुलकर जली हुई गैसों को बाहर निकलने देता है।', 'ನಿಷ್ಕಾಸ ಸ್ಟ್ರೋಕ್‌ನಲ್ಲಿ ತೆರೆದು ಸುಟ್ಟ ಅನಿಲಗಳನ್ನು ಹೊರಬಿಡುತ್ತದೆ.'),
    },
    {
      id: 'springs', group: 'valves', color: '#b9c0c6', metal: true, minor: true, explode: [0, 1.4, 0.4],
      name: t('Valve springs', 'वाल्व स्प्रिंग', 'ಕವಾಟದ ಸ್ಪ್ರಿಂಗ್‌ಗಳು'),
      info: t('Pull the valves shut after the camshaft has pushed them open.', 'कैमशाफ़्ट द्वारा खोले जाने के बाद वाल्वों को बंद खींचती हैं।', 'ಕ್ಯಾಮ್‌ಶಾಫ್ಟ್ ತೆರೆದ ನಂತರ ಕವಾಟಗಳನ್ನು ಮುಚ್ಚಲು ಎಳೆಯುತ್ತವೆ.'),
    },
    {
      id: 'spark_plug', group: 'valves', color: '#ecebe6', explode: [0, 1.6, 0.4],
      name: t('Spark plug', 'स्पार्क प्लग', 'ಸ್ಪಾರ್ಕ್ ಪ್ಲಗ್'),
      info: t('Makes an electric spark at the end of the compression stroke to light the squeezed mixture.', 'संपीडन स्ट्रोक के अंत में बिजली की चिंगारी देकर दबे हुए मिश्रण को जलाता है।', 'ಸಂಪೀಡನ ಸ್ಟ್ರೋಕ್‌ನ ಕೊನೆಯಲ್ಲಿ ವಿದ್ಯುತ್ ಕಿಡಿ ಹಾರಿಸಿ ಒತ್ತಿದ ಮಿಶ್ರಣವನ್ನು ಹೊತ್ತಿಸುತ್ತದೆ.'),
    },
    {
      id: 'spark', group: 'valves', color: '#ff9a2e', minor: true, opacity: 0.35, cap: false, explode: [0, 1.6, 0.4],
      drive: { type: 'glow', open: [345, 420] },
      name: t('Burning mixture', 'जलता मिश्रण', 'ಉರಿಯುವ ಮಿಶ್ರಣ'),
      info: t('The burning gases expand and push the piston down: the power stroke.', 'जलती गैसें फैलकर पिस्टन को नीचे धकेलती हैं: शक्ति स्ट्रोक।', 'ಉರಿಯುವ ಅನಿಲಗಳು ವಿಸ್ತರಿಸಿ ಪಿಸ್ಟನ್ ಅನ್ನು ಕೆಳಗೆ ತಳ್ಳುತ್ತವೆ: ಶಕ್ತಿ ಸ್ಟ್ರೋಕ್.'),
    },
    {
      id: 'cylinder', group: 'body', color: '#9aa4ad', metal: true, explode: [0, 0, -1],
      name: t('Cylinder (cut away)', 'सिलिंडर (काटकर दिखाया)', 'ಸಿಲಿಂಡರ್ (ಕತ್ತರಿಸಿ ತೋರಿಸಿದ್ದು)'),
      info: t('The piston moves inside it. The fins carry heat away into the air.', 'पिस्टन इसके भीतर चलता है। पंख गर्मी को हवा में ले जाते हैं।', 'ಪಿಸ್ಟನ್ ಇದರೊಳಗೆ ಚಲಿಸುತ್ತದೆ. ರೆಕ್ಕೆಗಳು ಶಾಖವನ್ನು ಗಾಳಿಗೆ ಸಾಗಿಸುತ್ತವೆ.'),
    },
    {
      id: 'head', group: 'body', color: '#a8b1b9', metal: true, explode: [0, 0.8, -1],
      name: t('Cylinder head', 'सिलिंडर हेड', 'ಸಿಲಿಂಡರ್ ಹೆಡ್'),
      info: t('Closes the top of the cylinder and holds the valves and the spark plug.', 'सिलिंडर के ऊपरी भाग को बंद करता है और वाल्वों व स्पार्क प्लग को थामता है।', 'ಸಿಲಿಂಡರ್‌ನ ಮೇಲ್ಭಾಗವನ್ನು ಮುಚ್ಚಿ ಕವಾಟಗಳು ಮತ್ತು ಸ್ಪಾರ್ಕ್ ಪ್ಲಗ್ ಅನ್ನು ಹಿಡಿಯುತ್ತದೆ.'),
    },
    {
      id: 'intake_port', group: 'body', color: '#4f86c6', metal: true, explode: [-1, 0.3, 0],
      name: t('Intake pipe', 'चूषण नली', 'ಸೇವನಾ ಕೊಳವೆ'),
      info: t('Brings in air mixed with a fine spray of petrol.', 'पेट्रोल की महीन फुहार मिली हवा अंदर लाती है।', 'ಪೆಟ್ರೋಲ್‌ನ ಸೂಕ್ಷ್ಮ ತುಂತುರು ಬೆರೆತ ಗಾಳಿಯನ್ನು ಒಳತರುತ್ತದೆ.'),
    },
    {
      id: 'exhaust_port', group: 'body', color: '#7a5048', metal: true, explode: [1, 0.3, 0],
      name: t('Exhaust pipe', 'निष्कासन नली', 'ನಿಷ್ಕಾಸ ಕೊಳವೆ'),
      info: t('Carries the burnt gases (carbon dioxide, water vapour and some pollutants) away.', 'जली गैसों (कार्बन डाइऑक्साइड, जलवाष्प और कुछ प्रदूषक) को दूर ले जाती है।', 'ಸುಟ್ಟ ಅನಿಲಗಳನ್ನು (ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್, ನೀರಾವಿ ಮತ್ತು ಕೆಲವು ಮಾಲಿನ್ಯಕಾರಕಗಳು) ದೂರ ಒಯ್ಯುತ್ತದೆ.'),
    },
    {
      id: 'crankcase', group: 'body', color: '#7d868f', metal: true, minor: true, explode: [0, -1, -1],
      name: t('Crankcase (cut away)', 'क्रैंककेस (काटकर दिखाया)', 'ಕ್ರ್ಯಾಂಕ್‌ಕೇಸ್ (ಕತ್ತರಿಸಿ ತೋರಿಸಿದ್ದು)'),
      info: t('Holds the crankshaft and the oil that keeps the moving parts slippery.', 'क्रैंकशाफ़्ट और उस तेल को रखता है जो चलते भागों को चिकना रखता है।', 'ಕ್ರ್ಯಾಂಕ್‌ಶಾಫ್ಟ್ ಮತ್ತು ಚಲಿಸುವ ಭಾಗಗಳನ್ನು ಜಾರುವಂತಿಡುವ ಎಣ್ಣೆಯನ್ನು ಹಿಡಿಯುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front (cut face)', 'सामने (कटा भाग)', 'ಮುಂಭಾಗ (ಕತ್ತರಿಸಿದ ಮುಖ)'), dir: [0.35, 0.25, 1] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0.2, 0.3] },
  ],
  slices: [],
  animations: [
    { id: 'run', kind: 'orbit', speed: 120, name: t('Run the engine', 'इंजन चलाएँ', 'ಎಂಜಿನ್ ಚಲಾಯಿಸಿ') },
    {
      id: 'strokes', kind: 'tour',
      name: t('The four strokes', 'चार स्ट्रोक', 'ನಾಲ್ಕು ಸ್ಟ್ರೋಕ್‌ಗಳು'),
      steps: [
        { highlight: ['intake_valve', 'piston', 'intake_port'], text: t('1. Intake: the piston moves down and the intake valve opens; air and petrol are drawn in.', '1. चूषण: पिस्टन नीचे जाता है और चूषण वाल्व खुलता है; हवा और पेट्रोल अंदर खिंचते हैं।', '1. ಸೇವನೆ: ಪಿಸ್ಟನ್ ಕೆಳಗೆ ಚಲಿಸಿ ಸೇವನಾ ಕವಾಟ ತೆರೆಯುತ್ತದೆ; ಗಾಳಿ ಮತ್ತು ಪೆಟ್ರೋಲ್ ಒಳಸೆಳೆಯಲ್ಪಡುತ್ತವೆ.') },
        { highlight: ['piston', 'head'], text: t('2. Compression: both valves close and the piston moves up, squeezing the mixture.', '2. संपीडन: दोनों वाल्व बंद होते हैं और पिस्टन ऊपर जाकर मिश्रण को दबाता है।', '2. ಸಂಪೀಡನ: ಎರಡೂ ಕವಾಟಗಳು ಮುಚ್ಚಿ ಪಿಸ್ಟನ್ ಮೇಲೆ ಚಲಿಸಿ ಮಿಶ್ರಣವನ್ನು ಒತ್ತುತ್ತದೆ.') },
        { highlight: ['spark_plug', 'spark', 'piston', 'conrod', 'crankshaft'], text: t('3. Power: the spark lights the mixture; the hot gases push the piston down and turn the crankshaft.', '3. शक्ति: चिंगारी मिश्रण को जलाती है; गर्म गैसें पिस्टन को नीचे धकेलकर क्रैंकशाफ़्ट घुमाती हैं।', '3. ಶಕ್ತಿ: ಕಿಡಿ ಮಿಶ್ರಣವನ್ನು ಹೊತ್ತಿಸುತ್ತದೆ; ಬಿಸಿ ಅನಿಲಗಳು ಪಿಸ್ಟನ್ ಅನ್ನು ಕೆಳಗೆ ತಳ್ಳಿ ಕ್ರ್ಯಾಂಕ್‌ಶಾಫ್ಟ್ ತಿರುಗಿಸುತ್ತವೆ.') },
        { highlight: ['exhaust_valve', 'piston', 'exhaust_port'], text: t('4. Exhaust: the exhaust valve opens and the piston moves up, pushing the burnt gases out.', '4. निष्कासन: निष्कासन वाल्व खुलता है और पिस्टन ऊपर जाकर जली गैसों को बाहर धकेलता है।', '4. ನಿಷ್ಕಾಸ: ನಿಷ್ಕಾಸ ಕವಾಟ ತೆರೆದು ಪಿಸ್ಟನ್ ಮೇಲೆ ಚಲಿಸಿ ಸುಟ್ಟ ಅನಿಲಗಳನ್ನು ಹೊರತಳ್ಳುತ್ತದೆ.') },
      ],
    },
  ],
};
