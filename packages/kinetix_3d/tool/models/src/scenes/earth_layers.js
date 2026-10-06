// The Earth's layers: the globe, a cut-away showing crust, mantle, outer and
// inner core, and convection currents in the mantle that move the plates.
// Built in code (procedural Earth texture).
import { THREE, seeded, mat, smooth, fract, GlowPoints, canvasTexture } from './kit.js';
import { C } from './bio.js';
import { earthTexture, sunlitMaterial, starfield } from './earthkit.js';

const t = (en, hi, kn) => ({ en, hi, kn });

export const script = {
  id: 'earth_layers',
  subject: 'Geography',
  classes: [7, 11],
  thumb: { step: 'layers', u: 0.5 },
  title: t('Inside the Earth', 'पृथ्वी के अंदर', 'ಭೂಮಿಯ ಒಳಗೆ'),
  summary: t(
    'The layers of the Earth, from the thin crust to the solid inner core, and the slow convection currents in the mantle that move the plates.',
    'पृथ्वी की परतें, पतली भूपर्पटी से ठोस आंतरिक क्रोड तक, और प्रावार की धीमी संवहन धाराएँ जो प्लेटों को खिसकाती हैं।',
    'ತೆಳುವಾದ ಭೂಹೊರಪದರದಿಂದ ಘನ ಒಳಗಿನ ತಿರುಳಿನವರೆಗೆ ಭೂಮಿಯ ಪದರಗಳು, ಮತ್ತು ಫಲಕಗಳನ್ನು ಚಲಿಸುವ ಕವಚದ ನಿಧಾನ ಸಂವಹನ ಪ್ರವಾಹಗಳು.',
  ),
  keywords: ['interior of the earth', 'earth layers', 'crust', 'mantle', 'core', 'inner core', 'outer core', 'convection currents', 'plates', 'lithosphere', 'geography'],
  credit: 'Model built by KINETIX',
  look: {
    background: ['#141a26', '#04060a'],
    keyAt: [4, 5, 6],
    envTop: '#222a38',
    stages: { earth: { fog: [30, 60] } },
  },
  groups: [
    { id: 'layers', name: t('Layers', 'परतें', 'ಪದರಗಳು') },
    { id: 'motion', name: t('Movement', 'गति', 'ಚಲನೆ') },
  ],
  parts: [
    { id: 'crust', group: 'layers', color: '#8a7a62', name: t('Crust', 'भूपर्पटी', 'ಭೂಹೊರಪದರ'), info: t('5–70 km thick: thinnest under the oceans, thickest under mountains.', '5–70 किमी मोटी: महासागरों के नीचे सबसे पतली, पर्वतों के नीचे सबसे मोटी।', '5–70 ಕಿಮೀ ದಪ್ಪ: ಸಾಗರಗಳ ಕೆಳಗೆ ಅತಿ ತೆಳು, ಪರ್ವತಗಳ ಕೆಳಗೆ ಅತಿ ದಪ್ಪ.') },
    { id: 'mantle', group: 'layers', color: '#c0602e', name: t('Mantle', 'प्रावार (मेंटल)', 'ಕವಚ (ಮ್ಯಾಂಟಲ್)'), info: t('About 2,900 km of hot rock that flows very slowly.', 'लगभग 2,900 किमी गर्म चट्टान, जो बहुत धीरे बहती है।', 'ಬಹಳ ನಿಧಾನವಾಗಿ ಹರಿಯುವ ಸುಮಾರು 2,900 ಕಿಮೀ ಬಿಸಿ ಶಿಲೆ.') },
    { id: 'outer_core', group: 'layers', color: '#e8a030', name: t('Outer core', 'बाह्य क्रोड', 'ಹೊರ ತಿರುಳು'), info: t('Liquid iron and nickel, about 2,200 km thick.', 'तरल लोहा और निकल, लगभग 2,200 किमी मोटा।', 'ದ್ರವ ಕಬ್ಬಿಣ ಮತ್ತು ನಿಕ್ಕಲ್, ಸುಮಾರು 2,200 ಕಿಮೀ ದಪ್ಪ.') },
    { id: 'inner_core', group: 'layers', color: '#f4e2a0', name: t('Inner core', 'आंतरिक क्रोड', 'ಒಳ ತಿರುಳು'), info: t('Solid iron and nickel, about 5,500 °C.', 'ठोस लोहा और निकल, लगभग 5,500 °C।', 'ಘನ ಕಬ್ಬಿಣ ಮತ್ತು ನಿಕ್ಕಲ್, ಸುಮಾರು 5,500 °C.') },
    { id: 'convection', group: 'motion', color: '#ffb347', name: t('Convection currents', 'संवहन धाराएँ', 'ಸಂವಹನ ಪ್ರವಾಹಗಳು'), info: t('Hot rock rises, cools, and sinks again, in slow loops.', 'गर्म चट्टान ऊपर उठती है, ठंडी होकर फिर नीचे जाती है, धीमे चक्रों में।', 'ಬಿಸಿ ಶಿಲೆ ಮೇಲೇರಿ, ತಣ್ಣಗಾಗಿ ಮತ್ತೆ ಕೆಳಗಿಳಿಯುತ್ತದೆ, ನಿಧಾನ ಸುತ್ತುಗಳಲ್ಲಿ.') },
    { id: 'plates', group: 'motion', color: '#8a7a62', name: t('Plates', 'प्लेटें', 'ಫಲಕಗಳು'), info: t('Pieces of the crust and upper mantle, carried by the currents below.', 'भूपर्पटी और ऊपरी प्रावार के टुकड़े, जिन्हें नीचे की धाराएँ खिसकाती हैं।', 'ಕೆಳಗಿನ ಪ್ರವಾಹಗಳು ಒಯ್ಯುವ ಭೂಹೊರಪದರ ಮತ್ತು ಮೇಲ್ಕವಚದ ತುಂಡುಗಳು.') },
  ],
  steps: [
    {
      id: 'planet', stage: 'earth', seconds: 12,
      camera: { pos: [4.0, 2.6, 15.5], target: [0, 0.3, 0], from: [6, 4, 26], drift: 0.03 },
      highlight: [], labels: ['crust'],
      title: t('A layered planet', 'परतों वाला ग्रह', 'ಪದರಗಳ ಗ್ರಹ'),
      caption: t(
        'We live on the Earth’s crust, a thin rocky skin. Below it the Earth is built in layers, getting hotter and denser towards the centre, about 6,400 km down.',
        'हम पृथ्वी की भूपर्पटी पर रहते हैं, जो चट्टानों की एक पतली परत है। इसके नीचे पृथ्वी परतों में बनी है, जो केंद्र की ओर, लगभग 6,400 किमी नीचे तक, अधिक गर्म और घनी होती जाती हैं।',
        'ನಾವು ಭೂಮಿಯ ತೆಳುವಾದ ಶಿಲಾ ಚರ್ಮವಾದ ಭೂಹೊರಪದರದ ಮೇಲೆ ವಾಸಿಸುತ್ತೇವೆ. ಅದರ ಕೆಳಗೆ ಭೂಮಿ ಪದರಗಳಲ್ಲಿ ರಚಿತವಾಗಿದ್ದು, ಸುಮಾರು 6,400 ಕಿಮೀ ಆಳದ ಕೇಂದ್ರದತ್ತ ಹೆಚ್ಚು ಬಿಸಿ ಮತ್ತು ಸಾಂದ್ರವಾಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'layers', stage: 'earth', seconds: 15,
      camera: { pos: [11.0, 5.0, 6.2], target: [0.3, 0.1, 0.3], drift: 0.02 },
      highlight: ['mantle'], labels: ['crust', 'mantle', 'outer_core', 'inner_core'],
      title: t('Cut open: four layers', 'काटकर देखें: चार परतें', 'ಕತ್ತರಿಸಿ ನೋಡಿ: ನಾಲ್ಕು ಪದರಗಳು'),
      caption: t(
        'Cut open, the Earth shows four main layers: the crust, the thick rocky mantle, the liquid outer core and the solid inner core. The mantle makes up most of the Earth’s volume.',
        'काटकर देखने पर पृथ्वी की चार मुख्य परतें दिखती हैं: भूपर्पटी, मोटा चट्टानी प्रावार, तरल बाह्य क्रोड और ठोस आंतरिक क्रोड। पृथ्वी के आयतन का अधिकांश भाग प्रावार है।',
        'ಕತ್ತರಿಸಿದರೆ ಭೂಮಿಯ ನಾಲ್ಕು ಮುಖ್ಯ ಪದರಗಳು ಕಾಣುತ್ತವೆ: ಭೂಹೊರಪದರ, ದಪ್ಪ ಶಿಲಾ ಕವಚ, ದ್ರವ ಹೊರ ತಿರುಳು ಮತ್ತು ಘನ ಒಳ ತಿರುಳು. ಭೂಮಿಯ ಗಾತ್ರದ ಹೆಚ್ಚಿನ ಭಾಗ ಕವಚ.',
      ),
    },
    {
      id: 'crust', stage: 'earth', seconds: 12,
      camera: { pos: [3.6, 3.4, 3.8], target: [0.6, 2.5, 0.6], drift: 0.01 },
      highlight: ['crust'], labels: ['crust', 'mantle'],
      title: t('The thin crust', 'पतली भूपर्पटी', 'ತೆಳುವಾದ ಭೂಹೊರಪದರ'),
      caption: t(
        'The crust is very thin, like the skin of an apple: only about 7 km under the oceans and up to 70 km under high mountains. Here it is drawn thicker so you can see it.',
        'भूपर्पटी बहुत पतली है, सेब के छिलके जैसी: महासागरों के नीचे लगभग 7 किमी और ऊँचे पर्वतों के नीचे 70 किमी तक। यहाँ इसे दिखाने के लिए मोटा बनाया गया है।',
        'ಭೂಹೊರಪದರ ಸೇಬಿನ ಸಿಪ್ಪೆಯಂತೆ ಬಹಳ ತೆಳು: ಸಾಗರಗಳ ಕೆಳಗೆ ಸುಮಾರು 7 ಕಿಮೀ, ಎತ್ತರದ ಪರ್ವತಗಳ ಕೆಳಗೆ 70 ಕಿಮೀವರೆಗೆ. ಕಾಣುವಂತೆ ಇಲ್ಲಿ ಅದನ್ನು ದಪ್ಪವಾಗಿ ತೋರಿಸಲಾಗಿದೆ.',
      ),
    },
    {
      id: 'core', stage: 'earth', seconds: 13,
      camera: { pos: [7.4, 2.4, 4.2], target: [0.2, 0.1, 0.2], drift: 0.02 },
      highlight: ['outer_core', 'inner_core'], labels: ['outer_core', 'inner_core'],
      title: t('The core', 'क्रोड', 'ತಿರುಳು'),
      caption: t(
        'The core is mostly iron and nickel. The outer core is liquid, and its swirling makes the Earth’s magnetic field. The inner core is as hot as the Sun’s surface, but the huge pressure keeps it solid.',
        'क्रोड मुख्यतः लोहे और निकल का बना है। बाह्य क्रोड तरल है, और उसके घूमने से पृथ्वी का चुंबकीय क्षेत्र बनता है। आंतरिक क्रोड सूर्य की सतह जितना गर्म है, पर भारी दाब उसे ठोस रखता है।',
        'ತಿರುಳು ಮುಖ್ಯವಾಗಿ ಕಬ್ಬಿಣ ಮತ್ತು ನಿಕ್ಕಲ್. ಹೊರ ತಿರುಳು ದ್ರವ; ಅದರ ಸುಳಿಯುವಿಕೆ ಭೂಮಿಯ ಕಾಂತಕ್ಷೇತ್ರವನ್ನು ಉಂಟುಮಾಡುತ್ತದೆ. ಒಳ ತಿರುಳು ಸೂರ್ಯನ ಮೇಲ್ಮೈಯಷ್ಟು ಬಿಸಿ, ಆದರೆ ಅಪಾರ ಒತ್ತಡ ಅದನ್ನು ಘನವಾಗಿಡುತ್ತದೆ.',
      ),
    },
    {
      id: 'convection', stage: 'earth', seconds: 15,
      camera: { pos: [5.6, 4.6, 10.6], target: [0.3, 0.2, 0.3], drift: -0.02 },
      highlight: ['mantle'], labels: ['convection', 'plates', 'mantle'],
      title: t('Convection in the mantle', 'प्रावार में संवहन', 'ಕವಚದಲ್ಲಿ ಸಂವಹನ'),
      caption: t(
        'Heat from the core keeps the mantle rock moving, a few centimetres a year, in convection currents: hot rock rises, spreads, cools and sinks. These currents carry the plates of the crust, causing earthquakes and volcanoes.',
        'क्रोड की ऊष्मा प्रावार की चट्टान को संवहन धाराओं में, कुछ सेंटीमीटर प्रति वर्ष, चलाती रहती है: गर्म चट्टान ऊपर उठती है, फैलती है, ठंडी होकर नीचे जाती है। ये धाराएँ भूपर्पटी की प्लेटों को खिसकाती हैं, जिससे भूकंप और ज्वालामुखी होते हैं।',
        'ತಿರುಳಿನ ಉಷ್ಣ ಕವಚದ ಶಿಲೆಯನ್ನು ಸಂವಹನ ಪ್ರವಾಹಗಳಲ್ಲಿ ವರ್ಷಕ್ಕೆ ಕೆಲವು ಸೆಂಟಿಮೀಟರ್ ಚಲಿಸುತ್ತಿರುತ್ತದೆ: ಬಿಸಿ ಶಿಲೆ ಮೇಲೇರಿ, ಹರಡಿ, ತಣ್ಣಗಾಗಿ ಕೆಳಗಿಳಿಯುತ್ತದೆ. ಈ ಪ್ರವಾಹಗಳು ಭೂಹೊರಪದರದ ಫಲಕಗಳನ್ನು ಒಯ್ದು ಭೂಕಂಪ ಮತ್ತು ಜ್ವಾಲಾಮುಖಿಗಳಿಗೆ ಕಾರಣವಾಗುತ್ತವೆ.',
      ),
    },
  ],
};

const R = 3;
// Radii as fractions of the Earth's (the crust drawn thicker than it is).
const LAYERS = [
  { id: 'crust', r0: 0.955, r1: 1, color: '#8a7a62' },
  { id: 'mantle', r0: 0.55, r1: 0.955, color: '#b8582a', color2: '#d9783a' },
  { id: 'outer_core', r0: 0.19, r1: 0.55, color: '#e39a2e', emissive: '#6a3200' },
  { id: 'inner_core', r0: 0, r1: 0.19, color: '#f6e4a6', emissive: '#8a6a28' },
];

export async function build(k) {
  const stage = k.stage('earth');
  const rnd = seeded(701);
  stage.add(starfield(900, 40, rnd));
  const sun = new THREE.Vector3(40, 18, 30);
  const earth = new THREE.Group();
  stage.add(earth);
  // The surface, with a quarter cut away (towards +x, +z).
  const surfaceMat = sunlitMaterial({ map: earthTexture(), sun, ambient: 0.22, atmosphere: 0.7 });
  const cutGeo = new THREE.SphereGeometry(R, 96, 64, Math.PI, Math.PI * 1.5);
  const fullGeo = new THREE.SphereGeometry(R, 96, 64);
  const surface = new THREE.Mesh(fullGeo, surfaceMat);
  earth.add(surface);
  // The cut faces: a half-ring per layer on each of the two planes.
  const faces = {};
  const grain = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, w, h);
    const r = seeded(9);
    for (let i = 0; i < 2600; i++) {
      c.fillStyle = `rgba(${90 + r() * 60},${60 + r() * 40},${40 + r() * 30},${0.05 + r() * 0.08})`;
      c.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
    }
  }, { repeat: [3, 3] });
  for (const L of LAYERS) {
    const g = new THREE.Group();
    const m = mat({ color: L.color, rough: 0.8, map: grain, emissive: L.emissive || '#000000', emissiveIntensity: 1, rim: 0.05, side: THREE.DoubleSide });
    for (const rotY of [0, -Math.PI / 2]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.0001, L.r0 * R), L.r1 * R, 96, 2, -Math.PI / 2, Math.PI), m);
      ring.rotation.y = rotY;
      g.add(ring);
    }
    earth.add(g);
    faces[L.id] = g;
  }
  const anchors = { crust: [2.05, 2.15, 0.25], mantle: [1.6, -1.6, 0.05], outer_core: [0.05, -0.9, 0.95], inner_core: [0.25, 0.25, 0.05] };
  // The crust is the globe's surface as well as its cut edge.
  const crust = new THREE.Group();
  earth.add(crust);
  crust.add(surface, faces.crust);
  for (const L of LAYERS) k.part(L.id, L.id === 'crust' ? crust : faces[L.id], { anchor: anchors[L.id] });

  // Convection: loops of glowing rock in the mantle on both faces; hot rising, cool sinking.
  const glow = new GlowPoints(900, { size: 0.12 });
  stage.add(glow);
  const hot = C('#ffcf6a'), cool = C('#a8381c');
  const cells = [-1.05, -0.4, 0.3, 0.95];
  const conv = new THREE.Vector3(), plate = new THREE.Vector3();
  k.marker('convection', stage, (out) => (conv.lengthSq() ? out.copy(conv) : null), 0.2);
  k.marker('plates', stage, (out) => (plate.lengthSq() ? out.copy(plate) : null), 0.2);
  // Plate arrows on the surface, drawn as glowing chevrons that drift over the cells.
  const v = new THREE.Vector3();
  const face = (a, r, plane, out) => (plane ? out.set(-r * 0 + 0.012, r * Math.sin(a), r * Math.cos(a)) : out.set(r * Math.cos(a), r * Math.sin(a), 0.012));
  return {
    update: (s) => {
      const T = s.T;
      const open = s.is('planet') ? 0 : smooth(s.is('layers') ? s.t / 1.6 : 1);
      surface.geometry = open > 0.02 ? cutGeo : fullGeo;
      for (const L of LAYERS) faces[L.id].visible = open > 0.02;
      // The planet turns, coming to rest with its cut facing us.
      earth.rotation.y = s.is('planet') ? -2.2 * (1 - smooth(s.u)) : 0;
      earth.scale.setScalar(1);
      conv.set(0, 0, 0);
      plate.set(0, 0, 0);
      glow.begin();
      if (s.is('convection')) {
        const k2 = s.is('convection') ? 1 : 0.35;
        for (const plane of [0, 1]) {
          cells.forEach((ac, ci) => {
            const dir = ci % 2 ? 1 : -1;
            for (let i = 0; i < 46; i++) {
              const th = (i / 46) * Math.PI * 2 + dir * T * 0.35;
              const r = (0.755 + 0.165 * Math.sin(th)) * R;
              const a = ac + 0.27 * Math.cos(th);
              face(a, r, plane, v);
              // Rising (moving outward) rock is hot.
              const rising = Math.cos(th) * dir;
              glow.push(v.x, v.y, v.z, 0.13, hot.clone().lerp(cool, 0.5 - 0.5 * rising), 0.6 * k2);
              if (plane === 0 && ci === 2 && i === 10) conv.copy(v);
            }
          });
        }
        if (s.is('convection')) {
          // Plates riding on top: chevrons sliding away from the rising limbs.
          for (const plane of [0, 1]) {
            for (let i = 0; i < 24; i++) {
              const a = -1.45 + fract(i / 24 + T * 0.03) * 2.9;
              face(a, R * 1.005, plane, v);
              glow.push(v.x, v.y, v.z, 0.1, C('#fff2d0'), 0.5);
              if (plane === 0 && i === 14) plate.copy(v);
            }
          }
        }
      }
      if (s.is('core')) {
        // The liquid outer core swirls.
        for (let i = 0; i < 120; i++) {
          const a = -Math.PI / 2 + fract(i * 0.618 + T * 0.04 * (i % 2 ? 1 : -1)) * Math.PI;
          const r = (0.24 + 0.28 * fract(i * 0.37)) * R;
          face(a, r, i % 2, v);
          glow.push(v.x, v.y, v.z, 0.09, C('#ffe8a0'), 0.4);
        }
      }
      glow.done();
    },
  };
}
