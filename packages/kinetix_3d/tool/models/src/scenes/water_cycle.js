// The water cycle over a block of landscape: evaporation from the sea and
// transpiration from plants, condensation into clouds, rain and snow, and the
// water's return by rivers and groundwater. Built in code.
import { THREE, seeded, mat, smooth, lerp, clamp01, fract, fbm, GlowPoints, surface, blob, curve } from './kit.js';
import { C } from './bio.js';
import { sunMesh } from './earthkit.js';

const t = (en, hi, kn) => ({ en, hi, kn });

export const script = {
  id: 'water_cycle',
  subject: 'Geography',
  classes: [6, 7, 9],
  thumb: { step: 'precipitation', u: 0.5 },
  title: t('The water cycle', 'जल चक्र', 'ಜಲಚಕ್ರ'),
  summary: t(
    'How the Sun keeps the Earth’s water moving: evaporation and transpiration, condensation into clouds, rain and snow, and the return of water by rivers and under the ground.',
    'सूर्य पृथ्वी के जल को कैसे गतिमान रखता है: वाष्पीकरण और वाष्पोत्सर्जन, बादलों में संघनन, वर्षा और हिमपात, और नदियों तथा भूमिगत जल द्वारा जल की वापसी।',
    'ಸೂರ್ಯ ಭೂಮಿಯ ನೀರನ್ನು ಹೇಗೆ ಚಲನೆಯಲ್ಲಿಡುತ್ತಾನೆ: ಆವಿಯಾಗುವಿಕೆ ಮತ್ತು ಬಾಷ್ಪವಿಸರ್ಜನೆ, ಮೋಡಗಳಾಗಿ ಸಾಂದ್ರೀಕರಣ, ಮಳೆ ಮತ್ತು ಹಿಮ, ಮತ್ತು ನದಿಗಳು ಹಾಗೂ ಅಂತರ್ಜಲದ ಮೂಲಕ ನೀರಿನ ಮರಳುವಿಕೆ.',
  ),
  keywords: ['water cycle', 'evaporation', 'condensation', 'precipitation', 'transpiration', 'clouds', 'rain', 'groundwater', 'river', 'hydrological cycle', 'water', 'geography'],
  credit: 'Model built by KINETIX',
  look: {
    background: ['#3a4a5c', '#11161d'],
    keyAt: [-4, 7, 6],
    envTop: '#5a6c80',
    stages: { land: { fog: [30, 60] } },
  },
  groups: [
    { id: 'land', name: t('Land and sea', 'स्थल और समुद्र', 'ನೆಲ ಮತ್ತು ಸಮುದ್ರ') },
    { id: 'water', name: t('Water on the move', 'गतिमान जल', 'ಚಲಿಸುವ ನೀರು') },
  ],
  parts: [
    { id: 'sun', group: 'land', color: '#ffd27a', name: t('Sun', 'सूर्य', 'ಸೂರ್ಯ'), info: t('Its heat drives the whole cycle.', 'इसकी ऊष्मा पूरे चक्र को चलाती है।', 'ಇದರ ಉಷ್ಣ ಇಡೀ ಚಕ್ರವನ್ನು ನಡೆಸುತ್ತದೆ.') },
    { id: 'ocean', group: 'land', color: '#2f6e9c', name: t('Sea', 'समुद्र', 'ಸಮುದ್ರ'), info: t('Holds about 97 % of the Earth’s water.', 'पृथ्वी का लगभग 97 % जल रखता है।', 'ಭೂಮಿಯ ಸುಮಾರು 97 % ನೀರನ್ನು ಹೊಂದಿದೆ.') },
    { id: 'plants', group: 'land', color: '#4f7238', name: t('Plants', 'पौधे', 'ಸಸ್ಯಗಳು'), info: t('Give off water vapour through their leaves.', 'पत्तियों से जलवाष्प छोड़ते हैं।', 'ಎಲೆಗಳ ಮೂಲಕ ನೀರಾವಿಯನ್ನು ಬಿಡುತ್ತವೆ.') },
    { id: 'water_vapour', group: 'water', color: '#cfe8ff', name: t('Water vapour', 'जलवाष्प', 'ನೀರಾವಿ'), info: t('Water as an invisible gas in the air.', 'हवा में अदृश्य गैस के रूप में जल।', 'ಗಾಳಿಯಲ್ಲಿ ಅದೃಶ್ಯ ಅನಿಲ ರೂಪದ ನೀರು.') },
    { id: 'clouds', group: 'water', color: '#e8ecf0', name: t('Clouds', 'बादल', 'ಮೋಡಗಳು'), info: t('Billions of tiny water droplets or ice crystals.', 'अरबों सूक्ष्म जल-बूँदें या हिम-कण।', 'ಶತಕೋಟಿ ಸೂಕ್ಷ್ಮ ನೀರಿನ ಹನಿಗಳು ಅಥವಾ ಹಿಮಕಣಗಳು.') },
    { id: 'rain', group: 'water', color: '#9fd0ff', name: t('Rain', 'वर्षा', 'ಮಳೆ'), info: t('Droplets grown too heavy to stay up.', 'बूँदें जो इतनी भारी हो गईं कि ऊपर नहीं टिक सकतीं।', 'ಮೇಲೆ ಉಳಿಯಲಾರದಷ್ಟು ಭಾರವಾದ ಹನಿಗಳು.') },
    { id: 'snow', group: 'water', color: '#ffffff', name: t('Snow', 'हिम', 'ಹಿಮ'), info: t('Falls where the air is below freezing.', 'जहाँ हवा जमाव बिंदु से ठंडी हो, वहाँ गिरता है।', 'ಗಾಳಿ ಘನೀಭವನ ಬಿಂದುವಿಗಿಂತ ತಣ್ಣಗಿರುವಲ್ಲಿ ಬೀಳುತ್ತದೆ.') },
    { id: 'river', group: 'water', color: '#3f86b8', name: t('River', 'नदी', 'ನದಿ'), info: t('Carries rainwater back to the sea.', 'वर्षा जल को वापस समुद्र तक ले जाती है।', 'ಮಳೆನೀರನ್ನು ಮರಳಿ ಸಮುದ್ರಕ್ಕೆ ಒಯ್ಯುತ್ತದೆ.') },
    { id: 'groundwater', group: 'water', color: '#5aa0d0', name: t('Groundwater', 'भूमिगत जल', 'ಅಂತರ್ಜಲ'), info: t('Water that soaks into the ground and moves slowly through the rocks; we reach it with wells.', 'भूमि में रिसकर चट्टानों में धीरे बहने वाला जल; कुओं से हम इस तक पहुँचते हैं।', 'ನೆಲದೊಳಗೆ ಇಂಗಿ ಶಿಲೆಗಳ ಮೂಲಕ ನಿಧಾನವಾಗಿ ಹರಿಯುವ ನೀರು; ಬಾವಿಗಳ ಮೂಲಕ ಇದನ್ನು ತಲುಪುತ್ತೇವೆ.') },
  ],
  steps: [
    {
      id: 'overview', stage: 'land', seconds: 13,
      camera: { pos: [3.0, 9.0, 27.0], target: [0, 1.5, 0], from: [6, 14, 36], drift: 0.03 },
      highlight: [], labels: ['sun', 'ocean', 'clouds', 'river'],
      title: t('Water always on the move', 'हमेशा गतिमान जल', 'ಸದಾ ಚಲಿಸುವ ನೀರು'),
      caption: t(
        'The water on Earth is always on the move, between the sea, the air and the land. The same water has been going round and round for billions of years, driven by the Sun.',
        'पृथ्वी पर जल हमेशा समुद्र, वायु और स्थल के बीच घूमता रहता है। वही जल अरबों वर्षों से सूर्य की ऊर्जा से बार-बार चक्कर लगा रहा है।',
        'ಭೂಮಿಯ ನೀರು ಸಮುದ್ರ, ಗಾಳಿ ಮತ್ತು ನೆಲದ ನಡುವೆ ಸದಾ ಚಲಿಸುತ್ತಿರುತ್ತದೆ. ಅದೇ ನೀರು ಸೂರ್ಯನ ಶಕ್ತಿಯಿಂದ ಶತಕೋಟಿ ವರ್ಷಗಳಿಂದ ಮತ್ತೆ ಮತ್ತೆ ಸುತ್ತುತ್ತಿದೆ.',
      ),
    },
    {
      id: 'evaporation', stage: 'land', seconds: 14,
      camera: { pos: [-6.0, 4.0, 19.0], target: [-3.5, 2.6, 0], drift: -0.02 },
      highlight: ['ocean'], labels: ['water_vapour', 'ocean', 'plants', 'sun'],
      title: t('Evaporation and transpiration', 'वाष्पीकरण और वाष्पोत्सर्जन', 'ಆವಿಯಾಗುವಿಕೆ ಮತ್ತು ಬಾಷ್ಪವಿಸರ್ಜನೆ'),
      caption: t(
        'The Sun warms the sea, lakes and rivers, and water evaporates into invisible water vapour that rises with the warm air. Plants also give off water vapour from their leaves; this is transpiration.',
        'सूर्य समुद्र, झीलों और नदियों को गर्म करता है, और जल वाष्पित होकर अदृश्य जलवाष्प बनकर गर्म हवा के साथ ऊपर उठता है। पौधे भी अपनी पत्तियों से जलवाष्प छोड़ते हैं; इसे वाष्पोत्सर्जन कहते हैं।',
        'ಸೂರ್ಯ ಸಮುದ್ರ, ಸರೋವರ ಮತ್ತು ನದಿಗಳನ್ನು ಬಿಸಿಮಾಡುತ್ತಾನೆ; ನೀರು ಅದೃಶ್ಯ ನೀರಾವಿಯಾಗಿ ಬಿಸಿಗಾಳಿಯೊಂದಿಗೆ ಮೇಲೇರುತ್ತದೆ. ಸಸ್ಯಗಳೂ ಎಲೆಗಳಿಂದ ನೀರಾವಿ ಬಿಡುತ್ತವೆ; ಇದು ಬಾಷ್ಪವಿಸರ್ಜನೆ.',
      ),
    },
    {
      id: 'condensation', stage: 'land', seconds: 13,
      camera: { pos: [2.0, 7.0, 18.0], target: [1.5, 6.0, 0], drift: 0.02 },
      highlight: ['clouds'], labels: ['clouds', 'water_vapour'],
      title: t('Condensation', 'संघनन', 'ಸಾಂದ್ರೀಕರಣ'),
      caption: t(
        'Higher up, the air is cooler. There the vapour condenses into tiny droplets of water around specks of dust, and the droplets gather into clouds.',
        'ऊँचाई पर हवा ठंडी होती है। वहाँ वाष्प धूल के कणों के चारों ओर संघनित होकर पानी की सूक्ष्म बूँदें बनाती है, और ये बूँदें मिलकर बादल बनाती हैं।',
        'ಎತ್ತರದಲ್ಲಿ ಗಾಳಿ ತಂಪಾಗಿರುತ್ತದೆ. ಅಲ್ಲಿ ಆವಿ ಧೂಳಿನ ಕಣಗಳ ಸುತ್ತ ಸಾಂದ್ರೀಕರಿಸಿ ಸೂಕ್ಷ್ಮ ನೀರಿನ ಹನಿಗಳಾಗುತ್ತದೆ; ಹನಿಗಳು ಒಟ್ಟಾಗಿ ಮೋಡಗಳಾಗುತ್ತವೆ.',
      ),
    },
    {
      id: 'precipitation', stage: 'land', seconds: 14,
      camera: { pos: [9.0, 4.0, 19.0], target: [3.5, 2.8, 0], drift: 0.02 },
      highlight: [], labels: ['rain', 'snow', 'clouds'],
      title: t('Precipitation', 'वर्षण', 'ಅವಕ್ಷೇಪನ'),
      caption: t(
        'In the clouds, droplets bump together and grow. When they are too heavy to float, they fall as rain, or as snow and hail where it is cold, as on high mountains.',
        'बादलों में बूँदें टकराकर बड़ी होती जाती हैं। जब वे तैरने के लिए बहुत भारी हो जाती हैं, तो वर्षा के रूप में गिरती हैं, या ठंडे स्थानों पर, जैसे ऊँचे पर्वतों पर, हिम और ओले बनकर।',
        'ಮೋಡಗಳಲ್ಲಿ ಹನಿಗಳು ಒಂದಕ್ಕೊಂದು ಡಿಕ್ಕಿ ಹೊಡೆದು ದೊಡ್ಡದಾಗುತ್ತವೆ. ತೇಲಲಾರದಷ್ಟು ಭಾರವಾದಾಗ ಮಳೆಯಾಗಿ, ಅಥವಾ ಎತ್ತರದ ಪರ್ವತಗಳಂತಹ ತಣ್ಣನೆಯ ಸ್ಥಳಗಳಲ್ಲಿ ಹಿಮ ಮತ್ತು ಆಲಿಕಲ್ಲಾಗಿ ಬೀಳುತ್ತವೆ.',
      ),
    },
    {
      id: 'collection', stage: 'land', seconds: 15,
      camera: { pos: [4.0, 5.5, 22.0], target: [0.5, -0.4, 1.0], drift: -0.02 },
      highlight: ['river'], labels: ['river', 'groundwater', 'ocean'],
      title: t('Back to the sea', 'वापस समुद्र तक', 'ಮರಳಿ ಸಮುದ್ರಕ್ಕೆ'),
      caption: t(
        'Rainwater runs off the land into streams and rivers, and some soaks into the ground to become groundwater. Both flow slowly back to the sea, and the cycle begins again.',
        'वर्षा जल भूमि से बहकर नालों और नदियों में जाता है, और कुछ भूमि में रिसकर भूमिगत जल बन जाता है। दोनों धीरे-धीरे वापस समुद्र तक पहुँचते हैं, और चक्र फिर शुरू होता है।',
        'ಮಳೆನೀರು ನೆಲದಿಂದ ಹರಿದು ತೊರೆ ಮತ್ತು ನದಿಗಳನ್ನು ಸೇರುತ್ತದೆ; ಸ್ವಲ್ಪ ನೆಲದೊಳಗೆ ಇಂಗಿ ಅಂತರ್ಜಲವಾಗುತ್ತದೆ. ಎರಡೂ ನಿಧಾನವಾಗಿ ಮರಳಿ ಸಮುದ್ರ ಸೇರುತ್ತವೆ; ಚಕ್ರ ಮತ್ತೆ ಆರಂಭವಾಗುತ್ತದೆ.',
      ),
    },
  ],
};

const X0 = -11, X1 = 11, Z0 = -5, Z1 = 5, BOTTOM = -3.4;
const riverPts = [[6.0, 0, -1.4], [4.6, 0, -0.6], [3.4, 0, 0.4], [2.0, 0, 0.1], [0.6, 0, 0.9], [-0.8, 0, 1.4], [-2.4, 0, 1.2], [-3.6, 0, 1.2]];
const riverCurve = curve(riverPts);
const riverSamples = riverCurve.getSpacedPoints(80);
const riverDist = (x, z) => {
  let d = Infinity;
  for (const p of riverSamples) d = Math.min(d, (p.x - x) ** 2 + (p.z - z) ** 2);
  return Math.sqrt(d);
};
/** The land: sea floor on the left, a beach, rolling hills and a mountain on the right, a river valley cut through. */
function height(x, z) {
  const coast = smooth(clamp01((x + 3.6) / 3.2));
  const base = lerp(-1.4, 0.35, coast);
  const hills = coast * (0.5 + 0.6 * fbm(x * 0.25, z * 0.3, 2.3, 4)) * clamp01((x + 2) / 3);
  const mountain = 5.2 * Math.exp(-(((x - 6.8) / 2.6) ** 2 + ((z + 1.6) / 2.6) ** 2)) * (1 + 0.15 * fbm(x * 0.8, z * 0.8, 5, 3));
  const valley = -0.45 * Math.exp(-((riverDist(x, z) / 0.7) ** 2)) * coast;
  return base + hills + mountain + valley;
}

export async function build(k) {
  const stage = k.stage('land');
  const rnd = seeded(1003);
  const terrain = surface((u, v, o) => {
    const x = lerp(X0, X1, u), z = lerp(Z1, Z0, v);
    o.set(x, height(x, z), z);
  }, 170, 80);
  {
    const p = terrain.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      let c = y < 0.15 ? C('#c9b48a') : C('#5f7d3f').lerp(C('#7a8a4a'), clamp01(fbm(x * 0.5, z * 0.5, 1, 2) + 0.4));
      if (y < -0.2) c = C('#b8a27a').lerp(C('#8a7a60'), clamp01(-y - 0.2));
      c.lerp(C('#7d7266'), clamp01((y - 1.8) / 1.4));
      c.lerp(C('#f4f6f8'), clamp01((y - 3.6) / 0.6));
      col.push(c.r, c.g, c.b);
    }
    terrain.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  const ground = new THREE.Mesh(terrain, mat({ color: '#ffffff', vertexColors: true, rough: 0.92, rim: 0.03, side: THREE.DoubleSide }));
  ground.userData.decor = true;
  stage.add(ground);
  // The front cut face: soil, then rock, with a water-soaked layer under the land.
  const faceGeo = surface((u, v, o) => {
    const x = lerp(X0, X1, u);
    o.set(x, lerp(BOTTOM, height(x, Z1), v), Z1);
  }, 170, 40);
  {
    const p = faceGeo.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const depth = height(x, Z1) - y;
      let c = depth < 0.35 ? C('#6a5238') : C(['#8a7458', '#7a6650', '#957e60'][Math.floor((y - BOTTOM) / 0.55) % 3]);
      // The saturated zone: groundwater sits in the rock below the water table.
      if (y < -0.6 && depth > 0.6) c.lerp(C('#4a7aa0'), 0.35);
      c.multiplyScalar(0.92 + 0.12 * fbm(x * 2, y * 2, 3, 2));
      col.push(c.r, c.g, c.b);
    }
    faceGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  const face = new THREE.Mesh(faceGeo, mat({ color: '#ffffff', vertexColors: true, rough: 0.9, rim: 0.03, side: THREE.DoubleSide }));
  face.userData.decor = true;
  stage.add(face);

  // The sea and its cut face.
  const waterMat = mat({ color: '#2f6e9c', rough: 0.12, clearcoat: 1, clearcoatRough: 0.05, opacity: 0.78, rim: 0.35, rimColor: '#a8d4ff', sheen: 0.2 });
  const sea = new THREE.Group();
  const top = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, 60, 20).rotateX(-Math.PI / 2), waterMat);
  top.scale.x = (-2.2 - X0) / (X1 - X0);
  top.position.set((X0 - 2.2) / 2, 0, 0);
  const seaFace = new THREE.Mesh(new THREE.PlaneGeometry(-2.2 - X0, 1.5), mat({ color: '#2a5f88', rough: 0.2, opacity: 0.6, rim: 0.2 }));
  seaFace.position.set((X0 - 2.2) / 2, -0.75, Z1 + 0.01);
  sea.add(top, seaFace);
  stage.add(sea);
  k.part('ocean', sea, { anchor: [-8.0, 0.1, 2.0] });
  // The river: a ribbon of water down its valley.
  const ribbon = surface((u, v, o) => {
    const p = riverCurve.getPointAt(u), tn = riverCurve.getTangentAt(u);
    const w = lerp(0.18, 0.55, u);
    const x = p.x - tn.z * (v - 0.5) * w * 2, z = p.z + tn.x * (v - 0.5) * w * 2;
    o.set(x, Math.max(height(x, z), height(p.x, p.z)) + 0.05, z);
  }, 120, 4);
  const river = new THREE.Mesh(ribbon, mat({ color: '#3f86b8', rough: 0.15, clearcoat: 1, opacity: 0.9, rim: 0.3, rimColor: '#bfe0ff', side: THREE.DoubleSide }));
  stage.add(river);
  k.part('river', river, { anchor: () => riverCurve.getPointAt(0.45).add({ x: 0, y: height(riverCurve.getPointAt(0.45).x, riverCurve.getPointAt(0.45).z) + 0.3, z: 0 }) });

  // Trees: a forest on the hills.
  const NT = 90;
  const foliage = new THREE.InstancedMesh(new THREE.ConeGeometry(0.32, 0.9, 10), mat({ color: '#3f6a32', rough: 0.8, sheen: 0.3, rim: 0.08 }), NT);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 6), mat({ color: '#5a4030', rough: 0.9 }), NT);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const treeAt = [];
  for (let i = 0, n = 0; n < NT && i < 2000; i++) {
    const x = lerp(-0.5, 5.5, rnd()), z = lerp(-4.5, 4.5, rnd());
    const h = height(x, z);
    if (h < 0.4 || h > 2.4 || riverDist(x, z) < 0.8) continue;
    const s = 0.7 + rnd() * 0.6;
    m4.compose(v.set(x, h + 0.15 * s, z), q.identity(), sc.setScalar(s));
    trunks.setMatrixAt(n, m4);
    m4.compose(v.set(x, h + 0.7 * s, z), q.identity(), sc.setScalar(s));
    foliage.setMatrixAt(n, m4);
    treeAt.push(new THREE.Vector3(x, h + 1.1 * s, z));
    n++;
  }
  foliage.count = trunks.count = treeAt.length;
  const forest = new THREE.Group();
  forest.add(foliage, trunks);
  stage.add(forest);
  k.part('plants', forest, { anchor: () => treeAt[3].clone() });

  // The Sun, high on the left.
  const sun = sunMesh(1.1);
  sun.position.set(-9.5, 11, -6);
  stage.add(sun);
  k.part('sun', sun, { anchor: [-9.5, 11, -6] });

  // Clouds: soft clusters of puffs over the land and the mountain.
  const cloudCentres = [new THREE.Vector3(-1.5, 6.4, -1), new THREE.Vector3(3.2, 6.9, 0.2), new THREE.Vector3(6.6, 7.2, -1.8)];
  const puffsPer = 26;
  const cloudMat = mat({ color: '#eef2f6', rough: 1, sheen: 0.35, sheenColor: '#ffffff', rim: 0.12, rimColor: '#ffffff', opacity: 0.96 });
  const clouds = new THREE.InstancedMesh(blob(1, 1, 1, { detail: 12, amp: 0.12, freq: 1.4, seed: 4 }), cloudMat, cloudCentres.length * puffsPer);
  clouds.frustumCulled = false;
  stage.add(clouds);
  k.part('clouds', clouds, { anchor: () => cloudCentres[1].clone().add({ x: 0, y: 1.2, z: 0.6 }) });
  const puffOff = Array.from({ length: cloudCentres.length * puffsPer }, () => {
    const x = (rnd() - 0.5) * 3.6;
    // Fuller in the middle, flat underneath.
    return [x, rnd() * 0.8 * (1 - Math.abs(x) / 2.2), (rnd() - 0.5) * 1.8, 0.35 + rnd() * 0.45 * (1 - Math.abs(x) / 2.6)];
  });

  const glow = new GlowPoints(2200, { size: 0.12 });
  stage.add(glow);
  const vapour = C('#d8ecff'), rainC = C('#a8d4ff'), snowC = C('#ffffff'), flowC = C('#7fc0f0');
  const at = { water_vapour: new THREE.Vector3(), rain: new THREE.Vector3(), snow: new THREE.Vector3(), groundwater: new THREE.Vector3() };
  for (const id of Object.keys(at)) k.marker(id, stage, (out) => (at[id].lengthSq() ? out.copy(at[id]) : null), 0.25);
  const seed = Array.from({ length: 600 }, () => [rnd(), rnd(), rnd(), rnd()]);
  return {
    update: (s) => {
      const T = s.T;
      for (const key in at) at[key].set(0, 0, 0);
      // Clouds grow as the vapour condenses, and darken before rain.
      const grow = s.is('evaporation') ? 0.55 : s.is('condensation') ? lerp(0.55, 1, smooth(s.u * 1.2)) : 1;
      const dark = s.is('precipitation') ? smooth(s.t / 2) : 0;
      cloudMat.color.set('#eef2f6').lerp(C('#8a929c'), dark * 0.7);
      let n = 0;
      cloudCentres.forEach((c, ci) => {
        for (let i = 0; i < puffsPer; i++) {
          const [ox, oy, oz, r] = puffOff[ci * puffsPer + i];
          v.set(c.x + ox * grow + 0.3 * Math.sin(T * 0.1 + ci), c.y + oy * grow, c.z + oz * grow);
          const rr = r * grow * (0.9 + 0.1 * Math.sin(T * 0.3 + i));
          m4.compose(v, q.identity(), sc.set(rr * 1.25, rr * 0.85, rr));
          clouds.setMatrixAt(n++, m4);
        }
      });
      clouds.instanceMatrix.needsUpdate = true;
      top.position.y = 0.02 * Math.sin(T * 0.8);
      glow.begin();
      // Evaporation from the sea, transpiration from the trees: faint vapour rising and drifting to the clouds.
      const evap = s.is('evaporation', 'overview', 'condensation') ? 1 : 0.4;
      for (let i = 0; i < 220; i++) {
        const [a, b, c, d] = seed[i];
        const ph = fract(d + T * 0.08);
        const fromTree = i % 4 === 3;
        const start = fromTree ? treeAt[(i * 7) % treeAt.length] : v.set(lerp(-10, -3, a), 0.05, lerp(-4, 4, b));
        const target = cloudCentres[i % 3];
        const x = lerp(start.x, target.x, smooth(ph)) + 0.4 * Math.sin(T * 0.7 + i);
        const y = lerp(start.y, target.y - 0.3, ph);
        const z = lerp(start.z, target.z, ph) + 0.3 * Math.cos(T * 0.5 + i);
        glow.push(x, y, z, 0.16, vapour, 0.22 * evap * Math.min(1, ph * 6, (1 - ph) * 4));
        if (i === 8) at.water_vapour.set(x, y, z);
      }
      // Rain from the two inland clouds; snow over the peak.
      const rain = s.is('precipitation') ? smooth(s.t / 2.5) : s.is('collection', 'overview') ? 0.5 : 0;
      if (rain > 0.01) {
        for (let i = 0; i < 360; i++) {
          const [a, b, c, d] = seed[i];
          const ci = 1 + (i % 2);
          const cc = cloudCentres[ci];
          const x = cc.x + (a - 0.5) * 3.2, z = cc.z + (b - 0.5) * 1.6;
          const ground = height(x, z);
          const snow = ci === 2 && ground > 2.6;
          const ph = fract(d + T * (snow ? 0.18 : 0.9));
          const y = lerp(cc.y - 0.6, ground, ph);
          if (snow) {
            glow.push(x + 0.15 * Math.sin(T * 2 + i), y, z, 0.1, snowC, 0.8 * rain);
            if (i === 10) at.snow.set(x, y, z);
          } else {
            for (let j = 0; j < 3; j++) glow.push(x, y + j * 0.12, z, 0.06, rainC, 0.6 * rain * (1 - j * 0.25));
            if (i === 9) at.rain.set(x, y, z);
          }
        }
      }
      // The river flowing to the sea; groundwater seeping through the rock towards it.
      const flow = s.is('collection') ? 1 : 0.45;
      for (let i = 0; i < 120; i++) {
        const u = fract(i / 120 + T * 0.06);
        riverCurve.getPointAt(u, v);
        glow.push(v.x + 0.15 * Math.sin(i * 2.1), height(v.x, v.z) + 0.12, v.z + 0.15 * Math.cos(i * 1.3), 0.1, flowC, 0.6 * flow);
      }
      if (s.is('collection')) {
        for (let i = 0; i < 160; i++) {
          const [a, b] = seed[i + 300];
          const u = fract(a + T * 0.03);
          const x = lerp(8, -3.0, u);
          const y = lerp(-0.8, -2.6, b) + 0.3 * Math.sin(x * 0.6 + b * 5);
          glow.push(x, y, Z1 + 0.03, 0.12, flowC, 0.55 * Math.min(1, u * 8, (1 - u) * 8));
          if (i === 40) at.groundwater.set(x, y, Z1 + 0.03);
        }
        // Water soaking down from the surface.
        for (let i = 0; i < 60; i++) {
          const [a, b] = seed[i + 480];
          const x = lerp(0, 8, a), ph = fract(b + T * 0.15);
          const y = lerp(height(x, Z1) - 0.1, -0.7, ph);
          glow.push(x, y, Z1 + 0.03, 0.08, flowC, 0.4 * (1 - ph));
        }
      }
      glow.done();
    },
  };
}
