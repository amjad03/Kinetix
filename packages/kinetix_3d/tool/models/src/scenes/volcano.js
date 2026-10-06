// A volcano, cut open: the magma chamber, the vents, the layers of the cone;
// magma rising, an eruption with lava and an ash column, and lava flows
// cooling on the slopes. Built in code.
import { THREE, seeded, mat, smooth, lerp, clamp01, fract, fbm, GlowPoints, surface, blob, tube, curve } from './kit.js';
import { C } from './bio.js';

const t = (en, hi, kn) => ({ en, hi, kn });

export const script = {
  id: 'volcano',
  subject: 'Geography',
  classes: [7, 9, 11],
  thumb: { step: 'eruption', u: 0.55 },
  title: t('Volcano', 'ज्वालामुखी', 'ಜ್ವಾಲಾಮುಖಿ'),
  summary: t(
    'Inside a volcano: the magma chamber and vents, how pressure builds and the volcano erupts, and how lava and ash build up the land.',
    'ज्वालामुखी के अंदर: मैग्मा कक्ष और निकास नलियाँ, दाब कैसे बढ़ता है और ज्वालामुखी कैसे फटता है, और लावा तथा राख भूमि कैसे बनाते हैं।',
    'ಜ್ವಾಲಾಮುಖಿಯ ಒಳಗೆ: ಶಿಲಾಪಾಕ ಕೋಣೆ ಮತ್ತು ನಾಳಗಳು, ಒತ್ತಡ ಹೇಗೆ ಹೆಚ್ಚಿ ಜ್ವಾಲಾಮುಖಿ ಸ್ಫೋಟಿಸುತ್ತದೆ, ಮತ್ತು ಲಾವಾ ಹಾಗೂ ಬೂದಿ ಭೂಮಿಯನ್ನು ಹೇಗೆ ರೂಪಿಸುತ್ತವೆ.',
  ),
  keywords: ['volcano', 'eruption', 'magma', 'lava', 'crater', 'vent', 'magma chamber', 'ash', 'active volcano', 'dormant', 'extinct', 'Barren Island', 'natural disasters', 'geography'],
  credit: 'Model built by KINETIX',
  look: {
    background: ['#22201f', '#080707'],
    keyAt: [5, 6, 5],
    envTop: '#302c2a',
    stages: { volcano: { fog: [26, 55] } },
  },
  groups: [
    { id: 'inside', name: t('Inside the volcano', 'ज्वालामुखी के अंदर', 'ಜ್ವಾಲಾಮುಖಿಯ ಒಳಗೆ') },
    { id: 'eruption', name: t('Eruption', 'उद्गार', 'ಸ್ಫೋಟ') },
  ],
  parts: [
    { id: 'crater', group: 'inside', color: '#5a4a40', name: t('Crater', 'क्रेटर (ज्वालामुख)', 'ಕುಳಿ (ಕ್ರೇಟರ್)'), info: t('The bowl-shaped opening at the top.', 'ऊपर का कटोरे जैसा मुख।', 'ಮೇಲ್ಭಾಗದ ಬಟ್ಟಲಿನಂತಹ ತೆರೆಪು.') },
    { id: 'main_vent', group: 'inside', color: '#ff8a3a', name: t('Main vent', 'मुख्य नली', 'ಮುಖ್ಯ ನಾಳ'), info: t('The pipe magma rises through.', 'वह नली जिससे मैग्मा ऊपर उठता है।', 'ಶಿಲಾಪಾಕ ಮೇಲೇರುವ ನಳಿಕೆ.') },
    { id: 'side_vent', group: 'inside', color: '#ff8a3a', name: t('Side vent', 'पार्श्व नली', 'ಪಾರ್ಶ್ವ ನಾಳ'), info: t('A branch that can build a smaller cone on the slope.', 'एक शाखा जो ढलान पर छोटा शंकु बना सकती है।', 'ಇಳಿಜಾರಿನಲ್ಲಿ ಚಿಕ್ಕ ಶಂಕುವನ್ನು ನಿರ್ಮಿಸಬಲ್ಲ ಕವಲು.') },
    { id: 'magma_chamber', group: 'inside', color: '#ff6a2a', name: t('Magma chamber', 'मैग्मा कक्ष', 'ಶಿಲಾಪಾಕ ಕೋಣೆ'), info: t('A pool of melted rock, several kilometres down.', 'पिघली चट्टान का भंडार, कई किलोमीटर नीचे।', 'ಹಲವು ಕಿಲೋಮೀಟರ್ ಆಳದಲ್ಲಿರುವ ಕರಗಿದ ಶಿಲೆಯ ಸಂಗ್ರಹ.') },
    { id: 'layers', group: 'inside', color: '#7a6a5e', name: t('Layers of lava and ash', 'लावा और राख की परतें', 'ಲಾವಾ ಮತ್ತು ಬೂದಿಯ ಪದರಗಳು'), info: t('Each eruption adds a layer to the cone.', 'हर उद्गार शंकु में एक परत जोड़ता है।', 'ಪ್ರತಿ ಸ್ಫೋಟ ಶಂಕುವಿಗೆ ಒಂದು ಪದರ ಸೇರಿಸುತ್ತದೆ.') },
    { id: 'magma', group: 'eruption', color: '#ffb347', name: t('Magma', 'मैग्मा', 'ಶಿಲಾಪಾಕ'), info: t('Melted rock with gas dissolved in it.', 'पिघली चट्टान जिसमें गैस घुली होती है।', 'ಅನಿಲ ಕರಗಿರುವ ಕರಗಿದ ಶಿಲೆ.') },
    { id: 'lava', group: 'eruption', color: '#ff7a2a', name: t('Lava', 'लावा', 'ಲಾವಾ'), info: t('Magma that has reached the surface, about 1,000 °C.', 'सतह पर पहुँचा मैग्मा, लगभग 1,000 °C।', 'ಮೇಲ್ಮೈ ತಲುಪಿದ ಶಿಲಾಪಾಕ, ಸುಮಾರು 1,000 °C.') },
    { id: 'ash_cloud', group: 'eruption', color: '#8a8580', name: t('Ash cloud', 'राख का बादल', 'ಬೂದಿಯ ಮೋಡ'), info: t('Tiny pieces of rock and glass, with gases.', 'चट्टान और काँच के सूक्ष्म कण, गैसों के साथ।', 'ಅನಿಲಗಳೊಂದಿಗೆ ಶಿಲೆ ಮತ್ತು ಗಾಜಿನ ಸೂಕ್ಷ್ಮ ಕಣಗಳು.') },
  ],
  steps: [
    {
      id: 'structure', stage: 'volcano', seconds: 15,
      camera: { pos: [6.0, 3.0, 22.0], target: [0, -0.6, 0], from: [10, 8, 32], drift: 0.03 },
      highlight: ['magma_chamber'], labels: ['crater', 'main_vent', 'side_vent', 'magma_chamber', 'layers'],
      title: t('Inside a volcano', 'ज्वालामुखी के अंदर', 'ಜ್ವಾಲಾಮುಖಿಯ ಒಳಗೆ'),
      caption: t(
        'A volcano is an opening in the Earth’s crust. Deep below lies a magma chamber of melted rock. A main vent leads up to the crater, and the cone is built of layers of old lava and ash.',
        'ज्वालामुखी पृथ्वी की भूपर्पटी में एक छिद्र है। गहराई में पिघली चट्टान का मैग्मा कक्ष होता है। मुख्य नली ऊपर क्रेटर तक जाती है, और शंकु पुराने लावा और राख की परतों से बना होता है।',
        'ಜ್ವಾಲಾಮುಖಿ ಭೂಹೊರಪದರದಲ್ಲಿರುವ ಒಂದು ತೆರೆಪು. ಆಳದಲ್ಲಿ ಕರಗಿದ ಶಿಲೆಯ ಶಿಲಾಪಾಕ ಕೋಣೆ ಇದೆ. ಮುಖ್ಯ ನಾಳ ಮೇಲಿನ ಕುಳಿಗೆ ಹೋಗುತ್ತದೆ; ಶಂಕು ಹಳೆಯ ಲಾವಾ ಮತ್ತು ಬೂದಿಯ ಪದರಗಳಿಂದ ರಚಿತವಾಗಿದೆ.',
      ),
    },
    {
      id: 'magma', stage: 'volcano', seconds: 13,
      camera: { pos: [3.0, 0.4, 14.0], target: [0, -2.2, 0], drift: 0.02 },
      highlight: ['main_vent'], labels: ['magma', 'magma_chamber', 'main_vent'],
      title: t('Pressure builds', 'दाब बढ़ता है', 'ಒತ್ತಡ ಹೆಚ್ಚುತ್ತದೆ'),
      caption: t(
        'Magma is lighter than the solid rock around it, so it rises. The gas dissolved in it forms bubbles and builds up pressure, like the gas in a shaken bottle of soda.',
        'मैग्मा अपने आसपास की ठोस चट्टान से हल्का होता है, इसलिए ऊपर उठता है। उसमें घुली गैस बुलबुले बनाकर दाब बढ़ाती है, जैसे हिलाई गई सोडा की बोतल में गैस।',
        'ಶಿಲಾಪಾಕ ಸುತ್ತಲಿನ ಘನ ಶಿಲೆಗಿಂತ ಹಗುರವಾದ್ದರಿಂದ ಮೇಲೇರುತ್ತದೆ. ಅದರಲ್ಲಿ ಕರಗಿದ ಅನಿಲ ಗುಳ್ಳೆಗಳಾಗಿ ಒತ್ತಡ ಹೆಚ್ಚಿಸುತ್ತದೆ, ಅಲುಗಾಡಿಸಿದ ಸೋಡಾ ಬಾಟಲಿಯ ಅನಿಲದಂತೆ.',
      ),
    },
    {
      id: 'eruption', stage: 'volcano', seconds: 15,
      camera: { pos: [10.0, 7.0, 27.0], target: [0, 4.2, -1.0], drift: 0.03 },
      highlight: [], labels: ['lava', 'ash_cloud', 'crater'],
      title: t('Eruption', 'उद्गार', 'ಸ್ಫೋಟ'),
      caption: t(
        'When the pressure is too great, the volcano erupts. Gas, ash and fountains of melted rock burst out of the crater. Magma that reaches the surface is called lava.',
        'जब दाब बहुत बढ़ जाता है, तो ज्वालामुखी फट पड़ता है। क्रेटर से गैस, राख और पिघली चट्टान के फव्वारे निकलते हैं। सतह पर पहुँचे मैग्मा को लावा कहते हैं।',
        'ಒತ್ತಡ ತುಂಬಾ ಹೆಚ್ಚಾದಾಗ ಜ್ವಾಲಾಮುಖಿ ಸ್ಫೋಟಿಸುತ್ತದೆ. ಕುಳಿಯಿಂದ ಅನಿಲ, ಬೂದಿ ಮತ್ತು ಕರಗಿದ ಶಿಲೆಯ ಕಾರಂಜಿಗಳು ಚಿಮ್ಮುತ್ತವೆ. ಮೇಲ್ಮೈ ತಲುಪಿದ ಶಿಲಾಪಾಕವನ್ನು ಲಾವಾ ಎನ್ನುತ್ತಾರೆ.',
      ),
    },
    {
      id: 'lava', stage: 'volcano', seconds: 14,
      camera: { pos: [-5.0, 13.0, 9.0], target: [0, 1.8, -3.0], drift: -0.02 },
      highlight: ['lava'], labels: ['lava', 'layers'],
      title: t('Lava builds new land', 'लावा नई भूमि बनाता है', 'ಲಾವಾ ಹೊಸ ಭೂಮಿ ನಿರ್ಮಿಸುತ್ತದೆ'),
      caption: t(
        'Lava flows downhill, then cools and hardens into new rock. Ash settles over the land; in time it makes very fertile soil, which is why farms often lie near old volcanoes.',
        'लावा ढलान पर बहता है, फिर ठंडा होकर नई चट्टान में बदल जाता है। राख भूमि पर बिछ जाती है; समय के साथ यह बहुत उपजाऊ मिट्टी बनाती है, इसीलिए पुराने ज्वालामुखियों के पास प्रायः खेत होते हैं।',
        'ಲಾವಾ ಇಳಿಜಾರಿನಲ್ಲಿ ಹರಿದು, ನಂತರ ತಣ್ಣಗಾಗಿ ಗಟ್ಟಿಯಾಗಿ ಹೊಸ ಶಿಲೆಯಾಗುತ್ತದೆ. ಬೂದಿ ನೆಲದ ಮೇಲೆ ಹರಡುತ್ತದೆ; ಕಾಲಾನಂತರ ಅದು ಬಹಳ ಫಲವತ್ತಾದ ಮಣ್ಣಾಗುತ್ತದೆ, ಆದ್ದರಿಂದ ಹಳೆಯ ಜ್ವಾಲಾಮುಖಿಗಳ ಬಳಿ ಹೊಲಗಳಿರುತ್ತವೆ.',
      ),
    },
    {
      id: 'kinds', stage: 'volcano', seconds: 15,
      camera: { pos: [12.0, 7.0, 18.0], target: [0, 0, -1.0], drift: 0.03 },
      highlight: [], labels: ['crater'],
      title: t('Active, dormant, extinct', 'सक्रिय, प्रसुप्त, शांत', 'ಸಕ್ರಿಯ, ಸುಪ್ತ, ನಿಷ್ಕ್ರಿಯ'),
      caption: t(
        'A volcano that erupts often is active; one that has not erupted for a long time but may again is dormant; one that will not erupt again is extinct. Barren Island in the Andaman Sea is India’s active volcano.',
        'जो ज्वालामुखी अक्सर फटता है वह सक्रिय है; जो लंबे समय से नहीं फटा पर फिर फट सकता है वह प्रसुप्त है; जो फिर कभी नहीं फटेगा वह शांत (मृत) है। अंडमान सागर का बैरन द्वीप भारत का सक्रिय ज्वालामुखी है।',
        'ಆಗಾಗ ಸ್ಫೋಟಿಸುವುದು ಸಕ್ರಿಯ; ಬಹಳ ಕಾಲದಿಂದ ಸ್ಫೋಟಿಸದಿದ್ದರೂ ಮತ್ತೆ ಸ್ಫೋಟಿಸಬಹುದಾದದ್ದು ಸುಪ್ತ; ಮತ್ತೆಂದೂ ಸ್ಫೋಟಿಸದಿರುವುದು ನಿಷ್ಕ್ರಿಯ. ಅಂಡಮಾನ್ ಸಮುದ್ರದ ಬ್ಯಾರನ್ ದ್ವೀಪ ಭಾರತದ ಸಕ್ರಿಯ ಜ್ವಾಲಾಮುಖಿ.',
      ),
    },
  ],
};

const W = 11, BOTTOM = -7;
/** The land's height: the main cone, a smaller side cone, and gentle relief. */
function height(x, z) {
  const r = Math.hypot(x, z);
  const cone = 5.2 * Math.exp(-((r / 4.6) ** 1.6));
  const crater = -1.1 * Math.exp(-((r / 0.9) ** 2));
  const side = 1.3 * Math.exp(-((Math.hypot(x - 3.6, z + 0.2) / 1.1) ** 2)) - 0.35 * Math.exp(-((Math.hypot(x - 3.6, z + 0.2) / 0.3) ** 2));
  return cone + crater + side + 0.25 * fbm(x * 0.35, z * 0.35, 1.7, 4) * clamp01(r / 3);
}

export async function build(k) {
  const stage = k.stage('volcano');
  const rnd = seeded(907);
  // The land behind the cut (z ≤ 0), coloured by height and slope.
  const land = surface((u, v, o) => {
    const x = lerp(-W, W, u), z = lerp(-W, 0, v);
    o.set(x, height(x, z), z);
  }, 160, 80);
  {
    const p = land.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = Math.hypot(x, z);
      let c = C('#5c6b3a').lerp(C('#6f6450'), clamp01(y / 2.2)).lerp(C('#4a403a'), clamp01((y - 2.5) / 2));
      c.lerp(C('#3a3532'), clamp01(1 - r / 1.6) * 0.7);
      c.multiplyScalar(0.92 + 0.12 * fbm(x * 1.3, z * 1.3, 4, 2));
      col.push(c.r, c.g, c.b);
    }
    land.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  const ground = new THREE.Mesh(land, mat({ color: '#ffffff', vertexColors: true, rough: 0.9, rim: 0.04, side: THREE.DoubleSide }));
  stage.add(ground);
  k.part('crater', ground, { anchor: [0, height(0, -0.5) + 0.2, -0.3] });

  // The cut face (z = 0): layers of the cone over horizontal bedrock.
  const faceGeo = surface((u, v, o) => {
    const x = lerp(-W, W, u);
    o.set(x, lerp(BOTTOM, height(x, 0), v), 0);
  }, 220, 90);
  {
    const p = faceGeo.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const top = height(x, 0);
      const depth = top - y;
      let c;
      if (y > 0.2 && depth < top) {
        // The cone: alternating ash (lighter) and lava (darker) layers parallel to the slope.
        const band = Math.floor(depth / 0.32 + 0.3 * Math.sin(x * 1.3));
        c = band % 2 ? C('#7a6a5e') : C('#4a4240');
      } else {
        const band = Math.floor((y - BOTTOM) / 0.9 + 0.2 * Math.sin(x * 0.7));
        c = C(['#6e5a48', '#7d6852', '#655244', '#73604c'][band % 4]);
      }
      c.multiplyScalar(0.9 + 0.15 * fbm(x * 2, y * 2, 0.5, 2));
      col.push(c.r, c.g, c.b);
    }
    faceGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  const face = new THREE.Mesh(faceGeo, mat({ color: '#ffffff', vertexColors: true, rough: 0.92, rim: 0.03, side: THREE.DoubleSide }));
  stage.add(face);
  k.part('layers', face, { anchor: [-2.2, 1.6, 0.05] });

  // Magma: the chamber, the main vent and a side vent, glowing in the cut.
  const magmaMat = mat({ color: '#c8501a', emissive: '#ff5a10', emissiveIntensity: 0.6, rough: 0.45, clearcoat: 0.4, rim: 0.4, rimColor: '#ffd27a' });
  const chamberGeo = blob(2.6, 1.15, 1.6, { detail: 30, amp: 0.12, freq: 1.4, seed: 3 });
  chamberGeo.translate(0, -4.6, 0);
  const pa = chamberGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) if (pa.getZ(i) > 0.02) pa.setZ(i, 0.02);
  chamberGeo.computeVertexNormals();
  const chamber = new THREE.Mesh(chamberGeo, magmaMat);
  stage.add(chamber);
  k.part('magma_chamber', chamber, { anchor: [1.6, -4.4, 0.1] });
  const ventPath = curve([[0, -3.6, 0], [0.15, -1.5, 0], [-0.05, 1.5, 0], [0, height(0, 0) - 0.4, 0]]);
  const vent = new THREE.Mesh(tube(ventPath, 0.28, { segments: 60, radial: 14 }), magmaMat);
  stage.add(vent);
  k.part('main_vent', vent, { anchor: [0.3, 0.2, 0.2] });
  const sidePath = curve([[0.1, -1.0, 0], [1.6, -0.2, 0], [3.0, 0.6, 0], [3.6, height(3.6, 0) - 0.35, 0]]);
  const side = new THREE.Mesh(tube(sidePath, 0.16, { segments: 40, radial: 10 }), magmaMat);
  stage.add(side);
  k.part('side_vent', side, { anchor: [2.2, 0.3, 0.2] });

  // Lava flows: glowing tongues down the slopes behind, cooling from orange to dark.
  const flows = [];
  for (let f = 0; f < 3; f++) {
    const a = -Math.PI * (0.2 + 0.3 * f);
    const pts = [];
    let x = Math.cos(a) * 0.95, z = Math.sin(a) * 0.95;
    for (let i = 0; i < 24; i++) {
      pts.push(new THREE.Vector3(x, height(x, z) + 0.06, z));
      // Downhill, with a little wander.
      const e = 0.05, h0 = height(x, z);
      const gx = (height(x + e, z) - h0) / e, gz = (height(x, z + e) - h0) / e;
      const g = Math.hypot(gx, gz) || 1;
      x -= (gx / g) * 0.32 + 0.05 * Math.sin(i + f);
      z -= (gz / g) * 0.32;
      z = Math.min(z, -0.2);
    }
    const c = curve(pts);
    const geo = tube(c, (u) => 0.16 + 0.22 * u, { segments: 90, radial: 10 });
    const m = mat({ color: '#2e2826', emissive: '#ff5a10', emissiveIntensity: 1, rough: 0.6, rim: 0.1 });
    const mesh = new THREE.Mesh(geo, m);
    mesh.scale.y = 0.45;
    mesh.position.y = 0.04;
    flows.push({ mesh, geo, m, c });
  }
  const lavaGroup = new THREE.Group();
  flows.forEach((f) => lavaGroup.add(f.mesh));
  stage.add(lavaGroup);
  k.part('lava', lavaGroup, { anchor: () => flows[1].c.getPointAt(0.35).add({ x: 0, y: 0.3, z: 0 }) });

  // The ash column: soft grey puffs rising and spreading into an umbrella.
  const NP = 70;
  const puffMat = mat({ color: '#9a948d', rough: 1, sheen: 0.5, sheenColor: '#c8c2ba', rim: 0.3, rimColor: '#c8c2ba', opacity: 0.9 });
  const puffs = new THREE.InstancedMesh(blob(1, 1, 1, { detail: 10, amp: 0.18, freq: 1.4, seed: 2 }), puffMat, NP);
  puffs.frustumCulled = false;
  stage.add(puffs);
  const puffSeed = Array.from({ length: NP }, () => [rnd(), rnd(), rnd(), rnd()]);
  const ashAt = new THREE.Vector3();
  k.part('ash_cloud', puffs, { anchor: () => ashAt.clone() });
  const glow = new GlowPoints(900, { size: 0.2 });
  stage.add(glow);
  const hot = C('#ffd27a'), orange = C('#ff7a2a'), red = C('#c8321a');
  const magmaAt = new THREE.Vector3();
  k.marker('magma', stage, (out) => (magmaAt.lengthSq() ? out.copy(magmaAt) : null), 0.2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const top = height(0, 0);
  return {
    update: (s) => {
      const T = s.T;
      const erupting = s.is('eruption') ? smooth(s.t / 2) : s.is('lava') ? 1 - smooth((s.t - 6) / 6) * 0.6 : 0;
      const pulse = 0.85 + 0.15 * Math.sin(T * 3);
      magmaMat.emissiveIntensity = 0.55 + 0.15 * Math.sin(T * 2);
      // Lava flows advance during the eruption and cool afterwards.
      const reach = s.is('eruption') ? clamp01((s.t - 4) / 10) * 0.55 : s.is('lava') ? 0.55 + 0.45 * smooth(s.t / 9) : s.is('kinds') ? 1 : 0;
      const cool = s.is('lava') ? smooth((s.t - 5) / 8) : s.is('kinds') ? 1 : 0;
      flows.forEach((f, i) => {
        const idx = f.geo.index.count;
        f.geo.setDrawRange(0, Math.floor(idx * clamp01(reach * (1 - i * 0.12))) - (Math.floor(idx * clamp01(reach * (1 - i * 0.12))) % 3));
        f.mesh.visible = reach > 0.01;
        f.m.emissiveIntensity = (1 - cool) * 1.1 * pulse + 0.05;
      });
      // Ash column and umbrella.
      let n = 0;
      ashAt.set(0, top + 5.5, -1);
      puffSeed.forEach(([a, b, c2, d], i) => {
        const age = fract(d + T * 0.06);
        const rise = Math.min(1, age * 1.6);
        const spread = clamp01((age - 0.45) / 0.55);
        const ang = a * Math.PI * 2;
        v.set(Math.cos(ang) * (0.3 + spread * 4.5 * b), top + rise * 7.5 + spread * (c2 - 0.5) * 1.2, -0.6 + Math.sin(ang) * (0.3 + spread * 3.5 * b) - 0.6);
        const r = (0.5 + age * 1.6) * (0.7 + 0.5 * c2) * erupting;
        sc.setScalar(Math.max(0.001, r));
        q.setFromAxisAngle(v.clone().normalize(), T * 0.1 + i);
        m4.compose(v, q, sc);
        puffs.setMatrixAt(n++, m4);
      });
      puffs.count = erupting > 0.01 ? NP : 0;
      puffs.instanceMatrix.needsUpdate = true;
      puffMat.opacity = 0.85 * Math.min(1, erupting * 1.5);
      glow.begin();
      // Magma rising up the vents as bubbles.
      magmaAt.set(0, 0, 0);
      if (!s.is('kinds')) {
        const rate = s.is('magma') ? 0.18 : s.is('eruption') ? 0.5 : 0.1;
        for (let i = 0; i < 70; i++) {
          const u = fract(i / 70 + T * rate);
          ventPath.getPointAt(u, v);
          glow.push(v.x + 0.12 * Math.sin(i * 2.3), v.y, 0.35, 0.18 + 0.1 * Math.sin(i), u > 0.85 ? hot : orange, 0.6);
          if (i === 30) magmaAt.set(v.x, v.y, 0.3);
        }
        // Gas bubbles in the chamber.
        for (let i = 0; i < 40; i++) {
          const ph = fract(i * 0.37 + T * 0.2);
          glow.push(-2.0 + (i / 40) * 4.0, -5.2 + ph * 1.6, 0.3, 0.1 + 0.08 * ph, hot, 0.5 * (1 - ph) * (s.is('magma') ? 1.6 : 0.7));
        }
      }
      // Lava fountain from the crater.
      if (erupting > 0.01) {
        for (let i = 0; i < 260; i++) {
          const life = fract(i / 260 + T * 0.55);
          const a = i * 2.4, sp = 0.5 + 0.5 * fract(i * 0.618);
          const vx = Math.cos(a) * 1.4 * sp, vz = Math.sin(a) * 1.1 * sp - 0.3, vy = 5.5 + 2.5 * fract(i * 0.37);
          const tt = life * 1.6;
          v.set(vx * tt, top - 0.2 + vy * tt - 4.9 * tt * tt, vz * tt - 0.5);
          if (v.y < height(v.x, Math.min(v.z, 0)) - 0.1) continue;
          glow.push(v.x, v.y, v.z, 0.16, life < 0.4 ? hot : life < 0.75 ? orange : red, 0.9 * erupting);
        }
      }
      glow.done();
    },
  };
}
