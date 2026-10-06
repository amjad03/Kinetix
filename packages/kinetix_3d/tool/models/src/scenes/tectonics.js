// Plate tectonics and earthquakes: a block of the Earth's crust and mantle
// where an ocean plate slides under a continent: subduction, mountains and a
// volcano, strain building at the locked fault, the rupture, and seismic
// waves from the focus and epicentre. Built in code.
import { THREE, seeded, mat, smooth, lerp, clamp01, fract, fbm, GlowPoints, canvasTexture, lathe, profileThrough } from './kit.js';
import { C } from './bio.js';

const t = (en, hi, kn) => ({ en, hi, kn });

export const script = {
  id: 'tectonics',
  subject: 'Geography',
  classes: [7, 9, 11],
  thumb: { step: 'earthquake', u: 0.35 },
  title: t('Plate tectonics and earthquakes', 'प्लेट विवर्तनिकी और भूकंप', 'ಫಲಕ ಚಲನೆ ಮತ್ತು ಭೂಕಂಪ'),
  summary: t(
    'How an ocean plate slides beneath a continent, building mountains and volcanoes, and how stress stored at the locked fault is released as an earthquake.',
    'एक महासागरीय प्लेट महाद्वीप के नीचे कैसे खिसकती है, जिससे पर्वत और ज्वालामुखी बनते हैं, और जकड़े भ्रंश पर जमा तनाव भूकंप के रूप में कैसे निकलता है।',
    'ಸಾಗರ ಫಲಕವು ಖಂಡದ ಕೆಳಗೆ ಹೇಗೆ ಜಾರುತ್ತದೆ, ಪರ್ವತ ಮತ್ತು ಜ್ವಾಲಾಮುಖಿಗಳನ್ನು ಹೇಗೆ ನಿರ್ಮಿಸುತ್ತದೆ, ಮತ್ತು ಸಿಕ್ಕಿಕೊಂಡ ಭ್ರಂಶದಲ್ಲಿ ಸಂಗ್ರಹವಾದ ಒತ್ತಡ ಭೂಕಂಪವಾಗಿ ಹೇಗೆ ಬಿಡುಗಡೆಯಾಗುತ್ತದೆ.',
  ),
  keywords: ['plate tectonics', 'earthquake', 'subduction', 'plates', 'focus', 'epicentre', 'seismic waves', 'fault', 'volcano', 'mountains', 'lithosphere', 'Richter scale', 'natural disasters', 'geography'],
  credit: 'Model built by KINETIX',
  look: {
    background: ['#1c2128', '#06080b'],
    keyAt: [4, 6, 6],
    envTop: '#2a313a',
    stages: { block: { fog: [22, 46] } },
  },
  groups: [
    { id: 'plates', name: t('Plates', 'प्लेटें', 'ಫಲಕಗಳು') },
    { id: 'features', name: t('Landforms', 'स्थलरूप', 'ಭೂರೂಪಗಳು') },
    { id: 'quake', name: t('Earthquake', 'भूकंप', 'ಭೂಕಂಪ') },
  ],
  parts: [
    { id: 'oceanic_plate', group: 'plates', color: '#5d6066', name: t('Ocean plate', 'महासागरीय प्लेट', 'ಸಾಗರ ಫಲಕ'), info: t('Thin, dense basalt rock.', 'पतली, घनी बेसाल्ट चट्टान।', 'ತೆಳುವಾದ, ಸಾಂದ್ರ ಬಸಾಲ್ಟ್ ಶಿಲೆ.') },
    { id: 'continental_plate', group: 'plates', color: '#9a8466', name: t('Continental plate', 'महाद्वीपीय प्लेट', 'ಖಂಡ ಫಲಕ'), info: t('Thicker and lighter granite rock.', 'मोटी और हल्की ग्रेनाइट चट्टान।', 'ದಪ್ಪ ಮತ್ತು ಹಗುರವಾದ ಗ್ರಾನೈಟ್ ಶಿಲೆ.') },
    { id: 'mantle', group: 'plates', color: '#b8582a', name: t('Mantle', 'प्रावार (मेंटल)', 'ಕವಚ (ಮ್ಯಾಂಟಲ್)'), info: t('Hot rock that flows slowly beneath the plates.', 'प्लेटों के नीचे धीरे बहने वाली गर्म चट्टान।', 'ಫಲಕಗಳ ಕೆಳಗೆ ನಿಧಾನವಾಗಿ ಹರಿಯುವ ಬಿಸಿ ಶಿಲೆ.') },
    { id: 'ocean', group: 'features', color: '#2a6390', name: t('Ocean', 'महासागर', 'ಸಾಗರ'), info: t('Above the ocean plate.', 'महासागरीय प्लेट के ऊपर।', 'ಸಾಗರ ಫಲಕದ ಮೇಲೆ.') },
    { id: 'trench', group: 'features', color: '#2a6390', name: t('Ocean trench', 'महासागरीय गर्त', 'ಸಾಗರ ಕಂದಕ'), info: t('A deep valley in the sea floor where the plate goes down.', 'समुद्र तल की गहरी घाटी जहाँ प्लेट नीचे जाती है।', 'ಫಲಕ ಕೆಳಗಿಳಿಯುವ ಸಮುದ್ರತಳದ ಆಳವಾದ ಕಣಿವೆ.') },
    { id: 'mountains', group: 'features', color: '#9a8466', name: t('Fold mountains', 'वलित पर्वत', 'ಮಡಿಕೆ ಪರ್ವತಗಳು'), info: t('The edge of the continent is squeezed and pushed up.', 'महाद्वीप का किनारा दबकर ऊपर उठ जाता है।', 'ಖಂಡದ ಅಂಚು ಒತ್ತಲ್ಪಟ್ಟು ಮೇಲೆ ಏರುತ್ತದೆ.') },
    { id: 'volcano', group: 'features', color: '#6b5a4a', name: t('Volcano', 'ज्वालामुखी', 'ಜ್ವಾಲಾಮುಖಿ'), info: t('Where melted rock from the sinking plate reaches the surface.', 'जहाँ डूबती प्लेट से पिघली चट्टान सतह तक पहुँचती है।', 'ಮುಳುಗುವ ಫಲಕದಿಂದ ಕರಗಿದ ಶಿಲೆ ಮೇಲ್ಮೈ ತಲುಪುವ ಸ್ಥಳ.') },
    { id: 'magma', group: 'features', color: '#ff8a3a', name: t('Magma', 'मैग्मा', 'ಶಿಲಾಪಾಕ (ಮ್ಯಾಗ್ಮಾ)'), info: t('Melted rock rising from deep below.', 'गहराई से ऊपर उठती पिघली चट्टान।', 'ಆಳದಿಂದ ಮೇಲೇರುವ ಕರಗಿದ ಶಿಲೆ.') },
    { id: 'fault', group: 'quake', color: '#ffe0a0', name: t('Locked fault', 'जकड़ा भ्रंश', 'ಸಿಕ್ಕಿಕೊಂಡ ಭ್ರಂಶ'), info: t('Where the plates stick together and strain builds up.', 'जहाँ प्लेटें आपस में चिपकी रहती हैं और तनाव बढ़ता है।', 'ಫಲಕಗಳು ಅಂಟಿಕೊಂಡು ಒತ್ತಡ ಹೆಚ್ಚುವ ಸ್ಥಳ.') },
    { id: 'focus', group: 'quake', color: '#ffd27a', name: t('Focus', 'उद्गम केंद्र (फ़ोकस)', 'ಕೇಂದ್ರಬಿಂದು (ಫೋಕಸ್)'), info: t('The point underground where the rock breaks.', 'भूमि के नीचे वह बिंदु जहाँ चट्टान टूटती है।', 'ಶಿಲೆ ಮುರಿಯುವ ನೆಲದಡಿಯ ಬಿಂದು.') },
    { id: 'epicentre', group: 'quake', color: '#ff6a4a', name: t('Epicentre', 'अधिकेंद्र', 'ಅಧಿಕೇಂದ್ರ'), info: t('The place on the surface right above the focus, where shaking is usually strongest.', 'उद्गम केंद्र के ठीक ऊपर सतह का स्थान, जहाँ प्रायः सबसे तेज़ कंपन होता है।', 'ಕೇಂದ್ರಬಿಂದುವಿನ ನೇರ ಮೇಲಿನ ಮೇಲ್ಮೈ ಸ್ಥಳ; ಸಾಮಾನ್ಯವಾಗಿ ಇಲ್ಲಿ ಕಂಪನ ತೀವ್ರ.') },
    { id: 'seismic_waves', group: 'quake', color: '#ffe0a0', name: t('Seismic waves', 'भूकंपीय तरंगें', 'ಭೂಕಂಪನ ಅಲೆಗಳು'), info: t('Waves of energy that spread out through the rock.', 'ऊर्जा की तरंगें जो चट्टानों में फैलती हैं।', 'ಶಿಲೆಗಳ ಮೂಲಕ ಹರಡುವ ಶಕ್ತಿಯ ಅಲೆಗಳು.') },
    { id: 'seismograph', group: 'quake', color: '#d8dde4', name: t('Seismograph', 'भूकंपलेखी (सिस्मोग्राफ़)', 'ಭೂಕಂಪನ ಮಾಪಕ (ಸಿಸ್ಮೋಗ್ರಾಫ್)'), info: t('Records the shaking as a wavy line.', 'कंपन को एक लहरदार रेखा के रूप में दर्ज करता है।', 'ಕಂಪನವನ್ನು ಅಲೆಅಲೆಯಾದ ರೇಖೆಯಾಗಿ ದಾಖಲಿಸುತ್ತದೆ.') },
  ],
  steps: [
    {
      id: 'plates', stage: 'block', seconds: 14,
      camera: { pos: [7.0, 8.5, 25.0], target: [0.4, -2.2, 0], from: [10, 12, 34], drift: 0.03 },
      highlight: [], labels: ['oceanic_plate', 'continental_plate', 'mantle', 'ocean'],
      title: t('A broken shell', 'टूटा हुआ खोल', 'ಒಡೆದ ಚಿಪ್ಪು'),
      caption: t(
        'The Earth’s outer shell is broken into huge plates that move a few centimetres a year, carried by currents in the mantle. Most earthquakes and volcanoes happen where plates meet.',
        'पृथ्वी का बाहरी खोल विशाल प्लेटों में टूटा है, जो प्रावार की धाराओं के साथ हर वर्ष कुछ सेंटीमीटर खिसकती हैं। अधिकांश भूकंप और ज्वालामुखी वहाँ होते हैं जहाँ प्लेटें मिलती हैं।',
        'ಭೂಮಿಯ ಹೊರಚಿಪ್ಪು ಬೃಹತ್ ಫಲಕಗಳಾಗಿ ಒಡೆದಿದ್ದು, ಕವಚದ ಪ್ರವಾಹಗಳೊಂದಿಗೆ ವರ್ಷಕ್ಕೆ ಕೆಲವು ಸೆಂಟಿಮೀಟರ್ ಚಲಿಸುತ್ತವೆ. ಹೆಚ್ಚಿನ ಭೂಕಂಪ ಮತ್ತು ಜ್ವಾಲಾಮುಖಿಗಳು ಫಲಕಗಳು ಸೇರುವಲ್ಲಿ ಸಂಭವಿಸುತ್ತವೆ.',
      ),
    },
    {
      id: 'subduction', stage: 'block', seconds: 15,
      camera: { pos: [3.0, 3.6, 21.0], target: [1.8, -1.8, 0], drift: 0.02 },
      highlight: ['oceanic_plate'], labels: ['trench', 'oceanic_plate', 'magma', 'volcano', 'mountains'],
      title: t('Subduction', 'अधोगमन (सबडक्शन)', 'ಅಧೋಗಮನ (ಸಬ್‌ಡಕ್ಷನ್)'),
      caption: t(
        'Where an ocean plate meets a continent, the heavier ocean plate slides down beneath it into the mantle. The continent’s edge is squeezed up into mountains, and rock melting deep down rises to feed volcanoes.',
        'जहाँ महासागरीय प्लेट महाद्वीप से मिलती है, वहाँ भारी महासागरीय प्लेट उसके नीचे प्रावार में खिसक जाती है। महाद्वीप का किनारा दबकर पर्वत बनाता है, और गहराई में पिघली चट्टान ऊपर उठकर ज्वालामुखी बनाती है।',
        'ಸಾಗರ ಫಲಕ ಖಂಡವನ್ನು ಸಂಧಿಸುವಲ್ಲಿ, ಭಾರವಾದ ಸಾಗರ ಫಲಕ ಅದರ ಕೆಳಗೆ ಕವಚಕ್ಕೆ ಜಾರುತ್ತದೆ. ಖಂಡದ ಅಂಚು ಒತ್ತಲ್ಪಟ್ಟು ಪರ್ವತಗಳಾಗುತ್ತದೆ; ಆಳದಲ್ಲಿ ಕರಗಿದ ಶಿಲೆ ಮೇಲೇರಿ ಜ್ವಾಲಾಮುಖಿಗಳನ್ನು ಪೋಷಿಸುತ್ತದೆ.',
      ),
    },
    {
      id: 'stress', stage: 'block', seconds: 13,
      camera: { pos: [-2.0, 2.0, 15.5], target: [1.2, -1.2, 0.8], drift: -0.015 },
      highlight: ['continental_plate'], labels: ['fault', 'continental_plate', 'oceanic_plate'],
      title: t('Stress builds up', 'तनाव बढ़ता है', 'ಒತ್ತಡ ಹೆಚ್ಚುತ್ತದೆ'),
      caption: t(
        'The plates do not slide smoothly. They lock together at the fault, and the edge of the upper plate is slowly dragged down and bent, storing energy like a bent ruler, often for hundreds of years.',
        'प्लेटें आसानी से नहीं खिसकतीं। वे भ्रंश पर जकड़ जाती हैं, और ऊपरी प्लेट का किनारा धीरे-धीरे नीचे खिंचकर मुड़ता है, मुड़े हुए पैमाने की तरह ऊर्जा जमा करता है, अक्सर सैकड़ों वर्षों तक।',
        'ಫಲಕಗಳು ಸರಾಗವಾಗಿ ಜಾರುವುದಿಲ್ಲ. ಅವು ಭ್ರಂಶದಲ್ಲಿ ಸಿಕ್ಕಿಕೊಳ್ಳುತ್ತವೆ; ಮೇಲಿನ ಫಲಕದ ಅಂಚು ನಿಧಾನವಾಗಿ ಕೆಳಗೆಳೆಯಲ್ಪಟ್ಟು ಬಾಗುತ್ತದೆ, ಬಾಗಿದ ಅಳತೆಪಟ್ಟಿಯಂತೆ ಶಕ್ತಿ ಸಂಗ್ರಹಿಸುತ್ತದೆ, ಹಲವೊಮ್ಮೆ ನೂರಾರು ವರ್ಷಗಳ ಕಾಲ.',
      ),
    },
    {
      id: 'earthquake', stage: 'block', seconds: 15,
      camera: { pos: [4.0, 6.0, 21.5], target: [1.4, -1.6, 0.6], drift: 0.02 },
      highlight: [], labels: ['focus', 'epicentre', 'seismic_waves'],
      title: t('The earthquake', 'भूकंप', 'ಭೂಕಂಪ'),
      caption: t(
        'Suddenly the rocks break and slip. The point underground where this starts is the focus; the place on the surface right above it is the epicentre. The stored energy spreads out as seismic waves that shake the ground.',
        'अचानक चट्टानें टूटकर खिसकती हैं। भूमि के नीचे जहाँ यह शुरू होता है वह उद्गम केंद्र है; उसके ठीक ऊपर सतह का स्थान अधिकेंद्र है। जमा ऊर्जा भूकंपीय तरंगों के रूप में फैलती है जो धरती को हिलाती हैं।',
        'ಇದ್ದಕ್ಕಿದ್ದಂತೆ ಶಿಲೆಗಳು ಮುರಿದು ಜಾರುತ್ತವೆ. ಇದು ಆರಂಭವಾಗುವ ನೆಲದಡಿಯ ಬಿಂದು ಕೇಂದ್ರಬಿಂದು; ಅದರ ನೇರ ಮೇಲಿನ ಮೇಲ್ಮೈ ಸ್ಥಳ ಅಧಿಕೇಂದ್ರ. ಸಂಗ್ರಹವಾದ ಶಕ್ತಿ ಭೂಕಂಪನ ಅಲೆಗಳಾಗಿ ಹರಡಿ ನೆಲವನ್ನು ಅಲುಗಾಡಿಸುತ್ತದೆ.',
      ),
    },
    {
      id: 'measure', stage: 'block', seconds: 13,
      camera: { pos: [11.0, 4.4, 15.5], target: [4.2, -0.4, 0.6], drift: 0.02 },
      highlight: ['seismograph'], labels: ['seismograph', 'epicentre'],
      title: t('Measuring an earthquake', 'भूकंप को मापना', 'ಭೂಕಂಪವನ್ನು ಅಳೆಯುವುದು'),
      caption: t(
        'A seismograph records the waves as a wavy line. Their size gives the earthquake’s magnitude on the Richter scale. In a quake: drop to the ground, take cover under a strong table, and hold on.',
        'भूकंपलेखी तरंगों को एक लहरदार रेखा के रूप में दर्ज करता है। उनके आकार से रिक्टर पैमाने पर भूकंप का परिमाण पता चलता है। भूकंप में: ज़मीन पर झुकें, किसी मज़बूत मेज़ के नीचे छिपें, और उसे पकड़े रहें।',
        'ಭೂಕಂಪನ ಮಾಪಕ ಅಲೆಗಳನ್ನು ಅಲೆಅಲೆಯಾದ ರೇಖೆಯಾಗಿ ದಾಖಲಿಸುತ್ತದೆ. ಅವುಗಳ ಗಾತ್ರ ರಿಕ್ಟರ್ ಮಾಪನದಲ್ಲಿ ಭೂಕಂಪದ ತೀವ್ರತೆ ತಿಳಿಸುತ್ತದೆ. ಭೂಕಂಪದಲ್ಲಿ: ನೆಲಕ್ಕೆ ಬಾಗಿ, ಗಟ್ಟಿಯಾದ ಮೇಜಿನ ಕೆಳಗೆ ಆಶ್ರಯ ಪಡೆದು, ಹಿಡಿದುಕೊಳ್ಳಿ.',
      ),
    },
  ],
};

const D = 3; // half the block's depth (front face at z = +D)
const X0 = -8, X1 = 8;

/** A rock section: a 2D outline (x, y) extruded through the block, its cut face banded like strata. */
function section(outline, colors, { steps = 30, top = null, seed = 1 } = {}) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: D * 2, steps, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -D);
  if (top) {
    // Roughen the upper surface: vertices on top get a little relief, varying across the block.
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const lift = top(x, y);
      if (lift > 0 && Math.abs(z) < D - 0.001) p.setY(i, y + lift * (0.6 + 0.8 * fbm(x * 0.5 + seed, z * 0.6, seed, 3)));
    }
    g.computeVertexNormals();
  }
  const strata = canvasTexture(64, 512, (c, w, h) => {
    const r = seeded(seed);
    for (let y = 0; y < h; y++) {
      const band = Math.floor(y / 18 + 0.6 * Math.sin(y * 0.05));
      const col = new THREE.Color(colors[band % colors.length]).multiplyScalar(0.9 + r() * 0.12);
      c.fillStyle = `#${col.getHexString()}`;
      c.fillRect(0, y, w, 1);
    }
  });
  strata.wrapS = strata.wrapT = THREE.RepeatWrapping;
  strata.repeat.set(0.05, 0.12);
  const face = mat({ color: '#ffffff', map: strata, rough: 0.85, rim: 0.04 });
  const side = mat({ color: colors[0], rough: 0.8, rim: 0.06 });
  return new THREE.Mesh(g, [face, side]);
}

export async function build(k) {
  const stage = k.stage('block');
  const rnd = seeded(811);
  const world = new THREE.Group();
  stage.add(world);

  // The mantle below.
  const mantle = section([[X0, -1.6], [X0, -7], [X1, -7], [X1, -2.6], [2.9, -2.6], [5.0, -4.6], [4.4, -5.4], [0.6, -1.9]], ['#b8582a', '#c4622e', '#a94e26'], { seed: 3 });
  world.add(mantle);
  k.part('mantle', mantle, { anchor: [-4.5, -4.2, D] });
  // The ocean plate: along the sea floor, then bending down into the mantle.
  const oceanic = section([[X0, -0.6], [0.3, -0.6], [0.9, -0.9], [1.6, -1.45], [5.4, -4.7], [4.6, -5.5], [1.0, -2.1], [-0.2, -1.6], [X0, -1.6]], ['#5d6066', '#686b70', '#55585e'], { seed: 5 });
  world.add(oceanic);
  k.part('oceanic_plate', oceanic, { anchor: [-4.5, -1.1, D] });
  // The continental plate, with mountains on top; its edge bends under strain (a morph).
  const contOutline = [[0.55, -0.5], [1.1, -0.1], [1.9, 0.25], [2.6, 0.55], [3.3, 1.15], [3.9, 1.0], [4.6, 1.5], [5.3, 1.0], [6.2, 0.75], [X1, 0.55], [X1, -2.6], [2.9, -2.6], [2.45, -2.3], [1.2, -1.1]];
  const continental = section(contOutline, ['#9a8466', '#8a7458', '#a89070', '#7d6a52'], { seed: 7, top: (x, y) => (y > -0.4 && x > 2.2 ? 0.5 * clamp01((x - 2.2) / 1.5) * clamp01((7.5 - x) / 2) : 0) });
  {
    const g = continental.geometry, p = g.attributes.position;
    const bent = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const drag = clamp01((3.2 - x) / 2.6);
      bent.set([x - 0.12 * drag, y - 0.38 * drag * drag, z], i * 3);
    }
    g.morphAttributes.position = [new THREE.Float32BufferAttribute(bent, 3)];
    continental.updateMorphTargets();
  }
  world.add(continental);
  k.part('continental_plate', continental, { anchor: [6.0, -1.4, D] });
  // The sea over the ocean plate.
  const sea = new THREE.Mesh(new THREE.BoxGeometry(0.8 - X0, 0.6, D * 2), mat({ color: '#2a6390', rough: 0.15, clearcoat: 1, clearcoatRough: 0.05, opacity: 0.55, rim: 0.3, rimColor: '#9fd0ff' }));
  sea.position.set((X0 + 0.8) / 2, -0.3, 0);
  world.add(sea);
  k.part('ocean', sea, { anchor: [-5.5, 0, 1.2] });
  k.marker('trench', world, (out) => out.set(0.5, -0.65, D), 0.2);
  k.marker('mountains', world, (out) => out.set(4.6, 1.9, 0.8), 0.25);

  // The volcano on the continent, and the magma feeding it.
  const cone = new THREE.Mesh(lathe(profileThrough([[1.35, 0], [1.0, 0.35], [0.55, 0.95], [0.3, 1.28], [0.18, 1.3], [0.1, 1.18], [0.001, 1.15]], 20), { segments: 40 }), mat({ color: '#6b5a4a', rough: 0.85, rim: 0.06 }));
  cone.position.set(3.5, 0.9, -0.4);
  world.add(cone);
  k.part('volcano', cone, { anchor: [3.5, 2.3, -0.2] });
  const glow = new GlowPoints(1400, { size: 0.16 });
  stage.add(glow);
  const magma = C('#ff8a3a'), hotC = C('#ffd27a'), wave = C('#ffe6b0'), red = C('#ff6a4a');
  const magmaAt = new THREE.Vector3();
  k.marker('magma', world, (out) => (magmaAt.lengthSq() ? out.copy(magmaAt) : null), 0.2);

  // Little houses on the coast that shake.
  const houses = new THREE.Group();
  const wall = mat({ color: '#d9cbb3', rough: 0.7, rim: 0.05 }), roof = mat({ color: '#9a4a3a', rough: 0.6, rim: 0.05 });
  for (let i = 0; i < 7; i++) {
    const h = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), wall);
    const r = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.14, 4), roof);
    r.position.y = 0.16;
    r.rotation.y = Math.PI / 4;
    h.add(b, r);
    h.position.set(1.5 + rnd() * 1.0, 0.18 + 0.1 * (i % 3) * 0, -2 + i * 0.7);
    houses.add(h);
  }
  houses.traverse((o) => (o.userData.decor = true));
  world.add(houses);

  // The seismograph: a drum and a pen, on a stand off to the side.
  const seis = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.9), mat({ color: '#3a3f46', rough: 0.4, metal: 0.4 }));
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.3, 40, 1, true), mat({ color: '#f2efe6', rough: 0.6, side: THREE.DoubleSide }));
  drum.rotation.z = Math.PI / 2;
  drum.position.y = 0.45;
  seis.add(base, drum);
  seis.position.set(6.4, 0.72, 1.6);
  world.add(seis);
  k.part('seismograph', seis, { anchor: [6.4, 1.5, 1.6] });
  const focus = new THREE.Vector3(1.25, -1.1, D + 0.02), epi = new THREE.Vector3(1.25, 0.05, D);
  k.marker('focus', world, (out) => out.copy(focus), 0.18);
  k.marker('epicentre', world, (out) => out.copy(epi).add({ x: 0, y: 0.1, z: 0 }), 0.18);
  k.marker('fault', world, (out) => out.set(1.0, -0.95, D), 0.18);
  const waveAt = new THREE.Vector3();
  k.marker('seismic_waves', world, (out) => (waveAt.lengthSq() ? out.copy(waveAt) : null), 0.2);
  const v = new THREE.Vector3();
  const surfaceY = (x) => {
    for (let i = 0; i < contOutline.length - 1; i++) {
      const [ax, ay] = contOutline[i], [bx, by] = contOutline[i + 1];
      if (x >= ax && x <= bx) return lerp(ay, by, (x - ax) / (bx - ax));
    }
    return x < 0.55 ? -0.6 : 0.55;
  };

  return {
    update: (s) => {
      const T = s.T;
      glow.begin();
      // Strain: builds in the stress step, held until the quake, released at the rupture.
      const rupture = 2.0;
      const strain = s.is('stress') ? smooth(s.u * 1.1) : s.is('earthquake') ? (s.t < rupture ? 1 : Math.exp(-(s.t - rupture) * 6)) : s.is('measure') ? 0 : 0.15;
      continental.morphTargetInfluences[0] = strain;
      const since = s.is('earthquake') ? s.t - rupture : s.is('measure') ? s.t + 8 : -1;
      // Shaking: strong just after the rupture, dying away.
      const shake = since > 0 ? Math.exp(-since * 0.5) * (s.is('earthquake') ? 1 : 0.25) : 0;
      world.position.set(0.06 * shake * Math.sin(T * 47), 0.05 * shake * Math.sin(T * 39 + 1), 0);
      houses.children.forEach((h, i) => {
        h.position.y = surfaceY(h.position.x) + 0.1;
        h.rotation.z = 0.15 * shake * Math.sin(T * 30 + i);
      });
      // The plates' motion: dots drifting along the ocean plate and down the slab.
      if (!s.is('measure')) {
        for (let i = 0; i < 70; i++) {
          const u = fract(i / 70 + T * 0.025);
          const x = lerp(X0 + 0.5, 5.0, u);
          const y = x < 0.4 ? -0.62 : -0.62 - (x - 0.4) * 0.84;
          for (const z of [-2.2, 0, 2.2]) glow.push(x, y - (x < 0.4 ? 0 : 0.25), z, 0.08, C('#cfe2ff'), 0.25);
        }
      }
      // Magma rising from the slab to the volcano.
      magmaAt.set(0, 0, 0);
      if (s.is('subduction', 'plates')) {
        const k2 = s.is('subduction') ? 1 : 0.4;
        for (let i = 0; i < 80; i++) {
          const ph = fract(i / 80 + T * 0.12);
          const sx = 4.3 + 0.3 * Math.sin(i * 2.1), sy = -3.7;
          v.set(lerp(sx, 3.5, smooth(ph)) + 0.12 * Math.sin(i + T), lerp(sy, 2.15, ph), D + 0.03);
          glow.push(v.x, v.y, D + 0.03, 0.14, ph > 0.8 ? hotC : magma, 0.7 * k2);
          if (i === 20) magmaAt.set(v.x, v.y, D + 0.03);
        }
        // A wisp at the crater.
        for (let i = 0; i < 12; i++) glow.push(3.5 + 0.08 * Math.sin(i * 3 + T * 2), 2.25 + 0.05 * i, -0.4, 0.3 - i * 0.015, hotC, 0.35);
      }
      // The locked patch glows as strain builds.
      if (s.is('stress') || (s.is('earthquake') && since < 0)) {
        for (let i = 0; i < 18; i++) {
          const a = i / 18;
          glow.push(lerp(0.6, 1.9, a), lerp(-0.75, -1.55, a), D + 0.03, 0.25, hotC, 0.15 + 0.5 * strain * (0.7 + 0.3 * Math.sin(T * 6 + i)));
        }
      }
      // The quake: a flash at the focus, waves spreading through the section and over the surface.
      waveAt.set(0, 0, 0);
      if (since > 0) {
        const flash = Math.exp(-since * 2.5);
        glow.push(focus.x, focus.y, focus.z, 1.2, hotC, flash);
        glow.push(epi.x, epi.y + 0.05, epi.z, 0.8, red, 0.5 + 0.5 * Math.sin(T * 8));
        for (let w = 0; w < 4; w++) {
          // Wave fronts leave the focus one after another, weakening as the quake dies away.
          const r = (since * 1.6 - w * 2.6);
          if (r <= 0) continue;
          const rr = r % 10.4;
          const a0 = clamp01(1 - rr / 10.4) * Math.exp(-since * 0.12) * (s.is('earthquake') ? 0.8 : 0.35);
          const R2 = rr;
          // Through the cut face: a circle about the focus, inside the rock.
          for (let i = 0; i < 90; i++) {
            const a = (i / 90) * Math.PI * 2;
            v.set(focus.x + Math.cos(a) * R2, focus.y + Math.sin(a) * R2, D + 0.03);
            if (v.y > surfaceY(v.x) || v.x < X0 || v.x > X1 || v.y < -7) continue;
            glow.push(v.x, v.y, v.z, 0.12, wave, a0);
            if (w === 0 && i === 60) waveAt.copy(v);
          }
          // Over the ground: half-rings about the epicentre.
          for (let i = 0; i < 60; i++) {
            const a = Math.PI + (i / 60) * Math.PI;
            const x = epi.x + Math.cos(a) * R2, z = D + Math.sin(a) * R2;
            if (x < X0 || x > X1 || z < -D) continue;
            glow.push(x, Math.max(surfaceY(x), -0.6) + 0.12, z, 0.12, wave, a0 * 0.8);
          }
        }
      }
      // The seismograph's trace on its drum.
      if (s.is('earthquake', 'measure')) {
        for (let i = 0; i < 120; i++) {
          const tt = since - (i / 120) * 6;
          const amp = tt > 0 ? Math.exp(-tt * 0.45) * Math.min(1, tt * 3) * 0.26 : 0;
          const y = amp * Math.sin(tt * 26 + Math.sin(tt * 7) * 2) + 0.004 * Math.sin(i * 1.7);
          v.set(6.4 - 0.62 + (i / 120) * 1.24 + world.position.x, 0.72 + 0.45 + y + world.position.y, 1.6 + 0.335);
          glow.push(v.x, v.y, v.z, 0.06, red, 0.9);
        }
      }
      glow.done();
    },
  };
}
