// A volcano in cross-section, built in code: a cone of alternating ash and
// lava layers with a crater, the main vent and a side vent, the magma
// chamber in the rock below, a lava flow down the side and an ash cloud.
// Each layer is a hollow shell (a closed solid), so the cut shows each one
// as a band of its own colour.
import { seeded, blob, taperTube, curveThrough, rod, revolve } from '../lib/shapes.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

// The cone: height H, base radius R, crater rim at RC dipping CD down to the
// vent (radius V). Each layer is D thick. Walls sit GAP apart so that two
// never draw in the same place.
const H = 0.15, R = 0.17, RC = 0.026, CD = 0.02, V = 0.0075, D = 0.02, GAP = 0.0003;
const LAYERS = 4;
const top = (r) => (r >= RC ? H * Math.pow((R - r) / (R - RC), 1.6) : H - (CD * (RC - r)) / (RC - V));
/** Where layer surface k meets the ground. */
const foot = (k) => {
  let lo = RC, hi = R;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    if (top(m) - k * D > 0) lo = m;
    else hi = m;
  }
  return lo;
};
/** Points along layer surface k from the vent out to its foot. */
const surfaceOf = (k, lift = 0) => {
  const end = foot(k), pts = [];
  const rs = [V, (V + RC) / 2, RC];
  for (let i = 1; i <= 36; i++) rs.push(RC + ((end - RC) * i) / 36);
  for (const r of rs) pts.push([r, Math.max(GAP, top(r) - k * D + lift)]);
  pts[pts.length - 1][1] = GAP;
  return pts;
};
/** Layer k: between surface k and surface k + 1 (or the ground for the core). */
function layer(THREE, k) {
  const outer = surfaceOf(k);
  if (k === LAYERS) return revolve(THREE, [...outer, [V, GAP]]);
  const inner = surfaceOf(k + 1, GAP).reverse();
  return revolve(THREE, [...outer, ...inner]);
}

// Taken apart, the magma parts come out to the right together, still joined
// up, and the layers lift off the cone one by one.
const OUT = [1.9, 0.25, 0];

// Where the lava runs down: towards the class and a little to the right.
const FLOW = Math.PI / 6;
const along = (r, side = 0) => [r * Math.sin(FLOW) + side * Math.cos(FLOW), (r < R ? top(r) : 0) + 0.0015, r * Math.cos(FLOW) - side * Math.sin(FLOW)];

export default {
  id: 'volcano',
  version: 2,
  order: 3,
  source: 'procedural',
  subject: 'Geography',
  classes: [7, 9, 11],
  title: t('Volcano', 'ज्वालामुखी', 'ಜ್ವಾಲಾಮುಖಿ'),
  summary: t(
    'Molten rock (magma) rises from a chamber deep underground through a vent and erupts as lava, ash and gas, building the cone layer by layer.',
    'पिघली चट्टान (मैग्मा) भूमिगत कक्ष से नली द्वारा ऊपर उठती है और लावा, राख और गैस के रूप में फूटती है, और परत दर परत शंकु बनाती है।',
    'ಕರಗಿದ ಬಂಡೆ (ಶಿಲಾಪಾಕ) ನೆಲದಾಳದ ಕೋಣೆಯಿಂದ ನಾಳದ ಮೂಲಕ ಮೇಲೇರಿ ಲಾವಾ, ಬೂದಿ ಮತ್ತು ಅನಿಲವಾಗಿ ಸಿಡಿಯುತ್ತದೆ; ಪದರ ಪದರವಾಗಿ ಶಂಕು ನಿರ್ಮಿಸುತ್ತದೆ.',
  ),
  keywords: ['volcano', 'volcanoes', 'magma', 'lava', 'eruption', 'crater', 'our changing earth', 'natural disasters', 'landforms', 'igneous rocks'],
  credit: 'Model built by KINETIX',
  matte: true,
  groups: [
    { id: 'land', name: t('Rock and cone', 'चट्टान और शंकु', 'ಬಂಡೆ ಮತ್ತು ಶಂಕು') },
    { id: 'magma', name: t('Magma and lava', 'मैग्मा और लावा', 'ಶಿಲಾಪಾಕ ಮತ್ತು ಲಾವಾ') },
    { id: 'air', name: t('In the air', 'हवा में', 'ಗಾಳಿಯಲ್ಲಿ') },
  ],
  build(THREE) {
    const rnd = seeded(7);
    const ground = new THREE.BoxGeometry(0.44, 0.13, 0.38).translate(0, -0.065, 0);
    const chamber = blob(THREE, [0, -0.08, 0], 0.07, 0.03, 0.05, 10);
    const vent = rod(THREE, [0, -0.06, 0], [0, H - CD + 0.001, 0], V - GAP, 24);
    const side = taperTube(THREE, curveThrough(THREE, [[0.004, 0.01, 0], [0.04, 0.045, 0], [0.083, top(0.085) - 0.005, 0]]), 0.0045, 0.0038, { segments: 32, radial: 14 });
    // The flow hugs the slope, wandering a little, and spreads out at the foot.
    const flowPts = [];
    for (let i = 0; i <= 14; i++) {
      const r = RC - 0.002 + (i / 14) * (R + 0.035 - RC);
      flowPts.push(along(r, 0.008 * Math.sin(i * 0.9)));
    }
    const flow = taperTube(THREE, curveThrough(THREE, flowPts), 0.0045, 0.011, { segments: 80, radial: 12 });
    flow.scale(1, 0.7, 1);
    // The cloud: a column of billows spreading into a wide top.
    const cloud = [];
    for (let k = 0; k < 26; k++) {
      const u = k / 25;
      const y = H + 0.014 + u * 0.13;
      const spread = 0.006 + u * u * 0.055;
      const a = rnd() * Math.PI * 2;
      const s = 0.012 + u * 0.016 + rnd() * 0.006;
      cloud.push(blob(THREE, [Math.cos(a) * spread + u * 0.02, y, Math.sin(a) * spread * 0.8], s, s * 0.85, s, 2));
    }
    return {
      ground,
      chamber,
      vent,
      side_vent: side,
      cone: layer(THREE, 0),
      lava_layers: [layer(THREE, 1), layer(THREE, 3)],
      ash_layers: [layer(THREE, 2), layer(THREE, 4)],
      lava_flow: flow,
      ash_cloud: cloud,
    };
  },
  parts: [
    {
      id: 'cone', group: 'land', color: '#5f4b3e', inside: '#806a58', explode: [0, 1.2, 0],
      name: t('Cone and crater', 'शंकु और क्रेटर', 'ಶಂಕು ಮತ್ತು ಕುಳಿ'),
      info: t(
        'The mountain built by earlier eruptions. The crater is the bowl-shaped opening at the top.',
        'पिछले विस्फोटों से बना पर्वत। शीर्ष पर कटोरे जैसा मुँह क्रेटर है।',
        'ಹಿಂದಿನ ಸ್ಫೋಟಗಳಿಂದ ರೂಪುಗೊಂಡ ಪರ್ವತ. ಮೇಲಿನ ಬಟ್ಟಲಿನಂತಹ ಬಾಯಿಯೇ ಕುಳಿ.',
      ),
    },
    {
      id: 'lava_layers', group: 'land', color: '#4a2c22', inside: '#5e3326', explode: [0, 0.8, 0],
      name: t('Layers of old lava', 'पुराने लावा की परतें', 'ಹಳೆಯ ಲಾವಾದ ಪದರಗಳು'),
      info: t(
        'Lava from past eruptions that cooled into hard rock such as basalt.',
        'पिछले विस्फोटों का लावा जो ठंडा होकर बेसाल्ट जैसी कठोर चट्टान बन गया।',
        'ಹಿಂದಿನ ಸ್ಫೋಟಗಳ ಲಾವಾ ತಣ್ಣಗಾಗಿ ಬಸಾಲ್ಟ್‌ನಂತಹ ಗಟ್ಟಿ ಬಂಡೆಯಾಗಿದೆ.',
      ),
    },
    {
      id: 'ash_layers', group: 'land', color: '#8f8171', inside: '#a39480', explode: [0, 0.4, 0],
      name: t('Layers of ash', 'राख की परतें', 'ಬೂದಿಯ ಪದರಗಳು'),
      info: t(
        'Ash and small rocks that fell back after eruptions. Ash and lava layers take turns, so the volcano grows like an onion.',
        'विस्फोटों के बाद वापस गिरी राख और छोटे पत्थर। राख और लावा की परतें बारी-बारी से बनती हैं, इसलिए ज्वालामुखी प्याज़ की तरह बढ़ता है।',
        'ಸ್ಫೋಟಗಳ ನಂತರ ಮತ್ತೆ ಬಿದ್ದ ಬೂದಿ ಮತ್ತು ಸಣ್ಣ ಕಲ್ಲುಗಳು. ಬೂದಿ ಮತ್ತು ಲಾವಾ ಪದರಗಳು ಸರದಿಯಲ್ಲಿ ಬರುತ್ತವೆ; ಹಾಗಾಗಿ ಜ್ವಾಲಾಮುಖಿ ಈರುಳ್ಳಿಯಂತೆ ಬೆಳೆಯುತ್ತದೆ.',
      ),
    },
    {
      id: 'ground', group: 'land', color: '#6e5a43', inside: '#7d6349', explode: [0, -0.5, 0],
      name: t('Crust (bedrock)', 'भूपर्पटी (आधार चट्टान)', 'ಭೂಹೊರಪದರ (ತಳಬಂಡೆ)'),
      info: t('The solid rock of the Earth\'s crust around and under the volcano.', 'ज्वालामुखी के आसपास और नीचे पृथ्वी की भूपर्पटी की ठोस चट्टान।', 'ಜ್ವಾಲಾಮುಖಿಯ ಸುತ್ತ ಮತ್ತು ಕೆಳಗಿನ ಭೂಹೊರಪದರದ ಘನ ಬಂಡೆ.'),
    },
    {
      id: 'chamber', group: 'magma', color: '#ff5a1f', glow: 0.75, inside: '#ff6a24', matte: false, explode: OUT,
      name: t('Magma chamber', 'मैग्मा कक्ष', 'ಶಿಲಾಪಾಕದ ಕೋಣೆ'),
      info: t('A huge pool of molten rock (magma) several kilometres underground.', 'भूमि के कई किलोमीटर नीचे पिघली चट्टान (मैग्मा) का विशाल भंडार।', 'ನೆಲದಾಳದಲ್ಲಿ ಹಲವು ಕಿಲೋಮೀಟರ್ ಕೆಳಗೆ ಕರಗಿದ ಬಂಡೆಯ (ಶಿಲಾಪಾಕ) ದೊಡ್ಡ ಸಂಗ್ರಹ.'),
    },
    {
      id: 'vent', group: 'magma', color: '#ff7a2c', glow: 0.65, inside: '#ff8a34', matte: false, explode: OUT,
      name: t('Main vent', 'मुख्य नली', 'ಮುಖ್ಯ ನಾಳ'),
      info: t('The pipe through which magma rises from the chamber to the crater.', 'वह नली जिससे मैग्मा कक्ष से क्रेटर तक उठता है।', 'ಶಿಲಾಪಾಕ ಕೋಣೆಯಿಂದ ಕುಳಿಯವರೆಗೆ ಏರುವ ನಳಿಕೆ.'),
    },
    {
      id: 'side_vent', group: 'magma', color: '#ff7a2c', glow: 0.55, inside: '#ff8a34', matte: false, explode: OUT,
      name: t('Side vent', 'पार्श्व नली', 'ಪಾರ್ಶ್ವ ನಾಳ'),
      info: t('A branch of the vent that can break out on the side of the volcano.', 'नली की एक शाखा जो ज्वालामुखी के किनारे पर फूट सकती है।', 'ಜ್ವಾಲಾಮುಖಿಯ ಬದಿಯಲ್ಲಿ ಹೊರಬರಬಹುದಾದ ನಾಳದ ಕವಲು.'),
    },
    {
      id: 'lava_flow', group: 'magma', color: '#ff5d22', glow: 0.8, matte: false, explode: OUT,
      name: t('Lava flow', 'लावा प्रवाह', 'ಲಾವಾ ಹರಿವು'),
      info: t('Magma that reaches the surface is called lava. It flows downhill at over 1,000 °C and cools into rock.', 'सतह पर पहुँचे मैग्मा को लावा कहते हैं। यह 1,000 °C से अधिक तापमान पर ढलान पर बहता है और ठंडा होकर चट्टान बनता है।', 'ಮೇಲ್ಮೈ ತಲುಪಿದ ಶಿಲಾಪಾಕವೇ ಲಾವಾ. 1,000 °C ಗಿಂತ ಹೆಚ್ಚು ಬಿಸಿಯಾಗಿ ಇಳಿಜಾರಿನಲ್ಲಿ ಹರಿದು ತಣ್ಣಗಾಗಿ ಬಂಡೆಯಾಗುತ್ತದೆ.'),
    },
    {
      id: 'ash_cloud', group: 'air', color: '#6f6a66', opacity: 0.93, explode: [0, 1.6, 0],
      name: t('Ash and gas cloud', 'राख और गैस का बादल', 'ಬೂದಿ ಮತ್ತು ಅನಿಲದ ಮೋಡ'),
      info: t('Tiny pieces of rock, steam and gases blasted kilometres into the sky.', 'चट्टान के सूक्ष्म कण, भाप और गैसें जो किलोमीटरों ऊपर आकाश में उछलती हैं।', 'ಬಂಡೆಯ ಸೂಕ್ಷ್ಮ ಕಣಗಳು, ಆವಿ ಮತ್ತು ಅನಿಲಗಳು ಆಕಾಶದಲ್ಲಿ ಕಿಲೋಮೀಟರ್‌ಗಟ್ಟಲೆ ಚಿಮ್ಮುತ್ತವೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.35, 0.32, 1] },
    { id: 'inside', name: t('The cut face', 'कटा हुआ भाग', 'ಕತ್ತರಿಸಿದ ಮುಖ'), dir: [0.06, 0.1, 1] },
    { id: 'above', name: t('Into the crater', 'क्रेटर में', 'ಕುಳಿಯೊಳಗೆ'), dir: [0.2, 1, 0.5] },
  ],
  slices: [
    {
      id: 'open', name: t('Cut open', 'काटकर खोलें', 'ಕತ್ತರಿಸಿ ತೆರೆಯಿರಿ'), normal: [0, 0, -1], offset: 0, view: 'inside',
      // Labels on the cut face: one on each band.
      anchors: {
        cone: [-0.11, top(0.11) - D / 2, 0],
        lava_layers: [-0.085, top(0.085) - D * 1.5, 0],
        ash_layers: [-0.055, top(0.055) - D * 2.5, 0],
        ground: [0.17, -0.04, 0],
        chamber: [0.035, -0.08, 0],
        vent: [0, 0.045, 0],
        side_vent: [0.04, 0.045, 0],
        lava_flow: null,
        ash_cloud: [0.01, H + 0.075, 0],
      },
    },
  ],
  animations: [
    {
      id: 'eruption', kind: 'flow',
      name: t('An eruption', 'ज्वालामुखी विस्फोट', 'ಜ್ವಾಲಾಮುಖಿ ಸ್ಫೋಟ'),
      steps: [
        {
          color: '#ff7a2c', highlight: ['chamber'],
          text: t('Magma collects in the chamber. It is lighter than the solid rock around it, so it pushes upwards.', 'मैग्मा कक्ष में इकट्ठा होता है। यह आसपास की ठोस चट्टान से हल्का होता है, इसलिए ऊपर की ओर धकेलता है।', 'ಶಿಲಾಪಾಕ ಕೋಣೆಯಲ್ಲಿ ಸಂಗ್ರಹವಾಗುತ್ತದೆ. ಸುತ್ತಲಿನ ಘನ ಬಂಡೆಗಿಂತ ಹಗುರವಾದ್ದರಿಂದ ಮೇಲಕ್ಕೆ ತಳ್ಳುತ್ತದೆ.'),
          paths: [['chamber@left', 'chamber', 'chamber@top'], ['chamber@right', 'chamber', 'chamber@top']],
        },
        {
          color: '#ff7a2c', highlight: ['vent', 'side_vent'],
          text: t('Gas pressure forces it up the vent, and some breaks out through a side vent.', 'गैस का दबाव उसे नली में ऊपर धकेलता है, और कुछ पार्श्व नली से निकलता है।', 'ಅನಿಲದ ಒತ್ತಡ ಅದನ್ನು ನಾಳದ ಮೇಲಕ್ಕೆ ತಳ್ಳುತ್ತದೆ; ಸ್ವಲ್ಪ ಪಾರ್ಶ್ವ ನಾಳದ ಮೂಲಕ ಹೊರಬರುತ್ತದೆ.'),
          paths: [['chamber@top', 'vent@bottom', 'vent', 'vent@top'], ['vent', 'side_vent@left', 'side_vent@right']],
        },
        {
          color: '#ff4f14', highlight: ['lava_flow', 'ash_cloud'],
          text: t('It erupts: lava pours down the slope and ash and gas shoot into the sky.', 'विस्फोट होता है: लावा ढलान पर बहता है और राख व गैस आकाश में उछलती है।', 'ಸ್ಫೋಟ: ಲಾವಾ ಇಳಿಜಾರಿನಲ್ಲಿ ಹರಿಯುತ್ತದೆ, ಬೂದಿ ಮತ್ತು ಅನಿಲ ಆಕಾಶಕ್ಕೆ ಚಿಮ್ಮುತ್ತವೆ.'),
          paths: [['vent@top', 'lava_flow@top', 'lava_flow', 'lava_flow@front'], ['vent@top', 'ash_cloud@bottom', 'ash_cloud', 'ash_cloud@top']],
        },
        {
          color: '#b9aa98', highlight: ['ash_layers', 'lava_layers', 'cone'],
          text: t('The lava and ash cool into new layers of rock, and the cone grows a little taller each time.', 'लावा और राख ठंडे होकर चट्टान की नई परतें बनाते हैं, और हर बार शंकु थोड़ा ऊँचा हो जाता है।', 'ಲಾವಾ ಮತ್ತು ಬೂದಿ ತಣ್ಣಗಾಗಿ ಹೊಸ ಬಂಡೆ ಪದರಗಳಾಗುತ್ತವೆ; ಪ್ರತಿ ಬಾರಿ ಶಂಕು ಸ್ವಲ್ಪ ಎತ್ತರವಾಗುತ್ತದೆ.'),
          paths: [['lava_flow@front', 'lava_flow', 'cone@top']],
        },
      ],
    },
  ],
};
