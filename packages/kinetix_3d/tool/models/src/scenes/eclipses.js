// Solar and lunar eclipses: the Sun, Earth and Moon lining up, the Moon's
// shadow on the Earth, a total eclipse of the Sun as seen from inside it, the
// Moon reddened in the Earth's shadow, and why eclipses are rare. Shadows are
// computed in the shader from the bodies' sizes. Built in code.
import { THREE, seeded, tube } from './kit.js';
import { earthTexture, moonTexture, sunlitMaterial, sunMesh, starfield } from './earthkit.js';

const t = (en, hi, kn) => ({ en, hi, kn });

export const script = {
  id: 'eclipses',
  subject: 'Geography',
  classes: [6, 8],
  thumb: { step: 'lunar', u: 0.5 },
  title: t('Eclipses of the Sun and Moon', 'सूर्य और चंद्र ग्रहण', 'ಸೂರ್ಯ ಮತ್ತು ಚಂದ್ರ ಗ್ರಹಣ'),
  summary: t(
    'How the Sun, the Earth and the Moon line up to make a solar eclipse and a lunar eclipse, what each looks like, and why they do not happen every month.',
    'सूर्य, पृथ्वी और चंद्रमा एक सीध में आकर सूर्य ग्रहण और चंद्र ग्रहण कैसे बनाते हैं, ये कैसे दिखते हैं, और ये हर महीने क्यों नहीं होते।',
    'ಸೂರ್ಯ, ಭೂಮಿ ಮತ್ತು ಚಂದ್ರ ಒಂದೇ ಸಾಲಿಗೆ ಬಂದು ಸೂರ್ಯ ಗ್ರಹಣ ಮತ್ತು ಚಂದ್ರ ಗ್ರಹಣ ಹೇಗೆ ಉಂಟಾಗುತ್ತವೆ, ಅವು ಹೇಗೆ ಕಾಣುತ್ತವೆ, ಮತ್ತು ಪ್ರತಿ ತಿಂಗಳು ಏಕೆ ಆಗುವುದಿಲ್ಲ.',
  ),
  keywords: ['eclipse', 'solar eclipse', 'lunar eclipse', 'umbra', 'penumbra', 'shadow', 'corona', 'new moon', 'full moon', 'grahan', 'moon', 'sun', 'geography'],
  credit: 'Model built by KINETIX',
  look: {
    background: ['#0e1119', '#020305'],
    keyAt: [0, 8, 4],
    envTop: '#181d28',
    stages: { space: { fog: [80, 160] } },
  },
  groups: [
    { id: 'bodies', name: t('Sun, Earth and Moon', 'सूर्य, पृथ्वी और चंद्रमा', 'ಸೂರ್ಯ, ಭೂಮಿ ಮತ್ತು ಚಂದ್ರ') },
    { id: 'shadows', name: t('Shadows', 'छायाएँ', 'ನೆರಳುಗಳು') },
  ],
  parts: [
    { id: 'sun', group: 'bodies', color: '#ffd27a', name: t('Sun', 'सूर्य', 'ಸೂರ್ಯ'), info: t('About 400 times wider than the Moon, and about 400 times farther away, so the two look the same size.', 'चंद्रमा से लगभग 400 गुना चौड़ा और लगभग 400 गुना दूर, इसलिए दोनों एक जैसे आकार के दिखते हैं।', 'ಚಂದ್ರನಿಗಿಂತ ಸುಮಾರು 400 ಪಟ್ಟು ಅಗಲ ಮತ್ತು ಸುಮಾರು 400 ಪಟ್ಟು ದೂರ; ಆದ್ದರಿಂದ ಎರಡೂ ಒಂದೇ ಗಾತ್ರದಂತೆ ಕಾಣುತ್ತವೆ.') },
    { id: 'earth', group: 'bodies', color: '#2f6e9c', name: t('Earth', 'पृथ्वी', 'ಭೂಮಿ'), info: t('Casts a long shadow into space.', 'अंतरिक्ष में लंबी छाया डालती है।', 'ಬಾಹ್ಯಾಕಾಶಕ್ಕೆ ಉದ್ದನೆಯ ನೆರಳು ಬೀರುತ್ತದೆ.') },
    { id: 'moon', group: 'bodies', color: '#c8c4bc', name: t('Moon', 'चंद्रमा', 'ಚಂದ್ರ'), info: t('Goes round the Earth once a month.', 'महीने में एक बार पृथ्वी की परिक्रमा करता है।', 'ತಿಂಗಳಿಗೊಮ್ಮೆ ಭೂಮಿಯನ್ನು ಸುತ್ತುತ್ತದೆ.') },
    { id: 'umbra', group: 'shadows', color: '#20242c', name: t('Umbra (full shadow)', 'प्रच्छाया (पूर्ण छाया)', 'ಪೂರ್ಣ ನೆರಳು (ಅಂಬ್ರಾ)'), info: t('Where the Sun is completely hidden.', 'जहाँ सूर्य पूरी तरह छिप जाता है।', 'ಸೂರ್ಯ ಸಂಪೂರ್ಣವಾಗಿ ಮರೆಯಾಗುವ ಸ್ಥಳ.') },
    { id: 'penumbra', group: 'shadows', color: '#4a5060', name: t('Penumbra (partial shadow)', 'उपच्छाया (आंशिक छाया)', 'ಭಾಗಶಃ ನೆರಳು (ಪೆನಂಬ್ರಾ)'), info: t('Where only part of the Sun is hidden.', 'जहाँ सूर्य का केवल कुछ भाग छिपता है।', 'ಸೂರ್ಯನ ಒಂದು ಭಾಗ ಮಾತ್ರ ಮರೆಯಾಗುವ ಸ್ಥಳ.') },
    { id: 'corona', group: 'shadows', color: '#fff2d0', name: t('Corona', 'कोरोना (सूर्य का बाहरी वायुमंडल)', 'ಕರೋನಾ (ಸೂರ್ಯನ ಹೊರ ವಾತಾವರಣ)'), info: t('The Sun’s faint outer atmosphere, seen only in a total eclipse.', 'सूर्य का धुँधला बाहरी वायुमंडल, जो केवल पूर्ण ग्रहण में दिखता है।', 'ಪೂರ್ಣ ಗ್ರಹಣದಲ್ಲಿ ಮಾತ್ರ ಕಾಣುವ ಸೂರ್ಯನ ಮಸುಕಾದ ಹೊರ ವಾತಾವರಣ.') },
    { id: 'orbit', group: 'shadows', color: '#8aa0c0', name: t('The Moon’s tilted orbit', 'चंद्रमा की झुकी कक्षा', 'ಚಂದ್ರನ ಓರೆಯಾದ ಕಕ್ಷೆ'), info: t('Tilted about 5° to the Earth’s path round the Sun (drawn more here).', 'सूर्य के चारों ओर पृथ्वी के पथ से लगभग 5° झुकी (यहाँ अधिक दिखाई गई)।', 'ಸೂರ್ಯನ ಸುತ್ತ ಭೂಮಿಯ ಪಥಕ್ಕೆ ಸುಮಾರು 5° ಓರೆ (ಇಲ್ಲಿ ಹೆಚ್ಚು ತೋರಿಸಲಾಗಿದೆ).') },
  ],
  steps: [
    {
      id: 'line_up', stage: 'space', seconds: 14,
      camera: { pos: [-6.0, 12.0, 15.0], target: [-4.0, 0, 0], from: [0, 30, 30], drift: 0.02 },
      highlight: ['umbra'], labels: ['sun', 'earth', 'moon', 'umbra', 'penumbra'],
      title: t('Shadows in space', 'अंतरिक्ष में छायाएँ', 'ಬಾಹ್ಯಾಕಾಶದಲ್ಲಿ ನೆರಳುಗಳು'),
      caption: t(
        'Lit by the Sun, the Earth and the Moon both cast long shadows into space. An eclipse happens when the Sun, the Earth and the Moon line up, so that one passes into the other’s shadow.',
        'सूर्य से प्रकाशित पृथ्वी और चंद्रमा दोनों अंतरिक्ष में लंबी छायाएँ डालते हैं। ग्रहण तब होता है जब सूर्य, पृथ्वी और चंद्रमा एक सीध में आ जाते हैं और एक, दूसरे की छाया में चला जाता है।',
        'ಸೂರ್ಯನಿಂದ ಬೆಳಗಿದ ಭೂಮಿ ಮತ್ತು ಚಂದ್ರ ಎರಡೂ ಬಾಹ್ಯಾಕಾಶಕ್ಕೆ ಉದ್ದನೆಯ ನೆರಳು ಬೀರುತ್ತವೆ. ಸೂರ್ಯ, ಭೂಮಿ ಮತ್ತು ಚಂದ್ರ ಒಂದೇ ಸಾಲಿಗೆ ಬಂದು ಒಂದು ಇನ್ನೊಂದರ ನೆರಳಿಗೆ ಹೋದಾಗ ಗ್ರಹಣ ಸಂಭವಿಸುತ್ತದೆ.',
      ),
    },
    {
      id: 'solar', stage: 'space', seconds: 15,
      camera: { pos: [-4.4, 2.0, 3.4], target: [-1.0, -0.1, 0], drift: 0.02 },
      highlight: ['moon'], labels: ['moon', 'umbra', 'penumbra', 'earth'],
      title: t('A solar eclipse', 'सूर्य ग्रहण', 'ಸೂರ್ಯ ಗ್ರಹಣ'),
      caption: t(
        'In a solar eclipse the Moon passes between the Sun and the Earth, at new moon. Its shadow falls on a small part of the Earth; there, the Sun is hidden in the middle of the day.',
        'सूर्य ग्रहण में अमावस्या के दिन चंद्रमा सूर्य और पृथ्वी के बीच से गुज़रता है। इसकी छाया पृथ्वी के एक छोटे भाग पर पड़ती है; वहाँ दिन में ही सूर्य छिप जाता है।',
        'ಸೂರ್ಯ ಗ್ರಹಣದಲ್ಲಿ ಅಮಾವಾಸ್ಯೆಯಂದು ಚಂದ್ರ ಸೂರ್ಯ ಮತ್ತು ಭೂಮಿಯ ನಡುವೆ ಹಾದುಹೋಗುತ್ತದೆ. ಅದರ ನೆರಳು ಭೂಮಿಯ ಸಣ್ಣ ಭಾಗದ ಮೇಲೆ ಬೀಳುತ್ತದೆ; ಅಲ್ಲಿ ಹಗಲಲ್ಲೇ ಸೂರ್ಯ ಮರೆಯಾಗುತ್ತಾನೆ.',
      ),
    },
    {
      id: 'solar_view', stage: 'space', seconds: 14,
      camera: { pos: [-1.5, 0.02, 0], target: [-30, 0, 0] },
      highlight: [], labels: ['corona', 'moon'],
      title: t('Totality', 'पूर्ण ग्रहण', 'ಪೂರ್ಣ ಗ್ರಹಣ'),
      caption: t(
        'From inside the shadow, the Moon exactly covers the Sun for a few minutes. The sky goes dark, and the Sun’s faint outer atmosphere, the corona, shines around the Moon. Never look at the Sun without proper eclipse glasses.',
        'छाया के अंदर से, चंद्रमा कुछ मिनटों के लिए सूर्य को पूरी तरह ढक लेता है। आकाश अँधेरा हो जाता है, और चंद्रमा के चारों ओर सूर्य का धुँधला बाहरी वायुमंडल, कोरोना, चमकता है। ग्रहण के विशेष चश्मे के बिना सूर्य को कभी न देखें।',
        'ನೆರಳಿನ ಒಳಗಿನಿಂದ ಚಂದ್ರ ಕೆಲವು ನಿಮಿಷ ಸೂರ್ಯನನ್ನು ಸಂಪೂರ್ಣ ಮುಚ್ಚುತ್ತದೆ. ಆಕಾಶ ಕತ್ತಲಾಗುತ್ತದೆ; ಚಂದ್ರನ ಸುತ್ತ ಸೂರ್ಯನ ಮಸುಕಾದ ಹೊರ ವಾತಾವರಣ, ಕರೋನಾ, ಹೊಳೆಯುತ್ತದೆ. ಸರಿಯಾದ ಗ್ರಹಣ ಕನ್ನಡಕವಿಲ್ಲದೆ ಸೂರ್ಯನನ್ನು ಎಂದೂ ನೋಡಬೇಡಿ.',
      ),
    },
    {
      id: 'lunar', stage: 'space', seconds: 15,
      camera: { pos: [3.4, 1.4, 2.8], target: [6.0, 0, 0], drift: -0.02 },
      highlight: ['moon'], labels: ['moon', 'umbra', 'earth'],
      title: t('A lunar eclipse', 'चंद्र ग्रहण', 'ಚಂದ್ರ ಗ್ರಹಣ'),
      caption: t(
        'In a lunar eclipse the Earth comes between the Sun and the Moon, at full moon. The Moon moves into the Earth’s shadow and turns a dim coppery red, lit only by sunlight bent through the Earth’s air. It is safe to watch.',
        'चंद्र ग्रहण में पूर्णिमा के दिन पृथ्वी सूर्य और चंद्रमा के बीच आ जाती है। चंद्रमा पृथ्वी की छाया में चला जाता है और धुँधला ताँबे-जैसा लाल हो जाता है, जिसे केवल पृथ्वी की वायु से मुड़कर आया सूर्य का प्रकाश प्रकाशित करता है। इसे देखना सुरक्षित है।',
        'ಚಂದ್ರ ಗ್ರಹಣದಲ್ಲಿ ಹುಣ್ಣಿಮೆಯಂದು ಭೂಮಿ ಸೂರ್ಯ ಮತ್ತು ಚಂದ್ರನ ನಡುವೆ ಬರುತ್ತದೆ. ಚಂದ್ರ ಭೂಮಿಯ ನೆರಳಿಗೆ ಹೋಗಿ ಮಸುಕಾದ ತಾಮ್ರದಂತಹ ಕೆಂಪಾಗುತ್ತದೆ; ಭೂಮಿಯ ಗಾಳಿಯಲ್ಲಿ ಬಾಗಿ ಬಂದ ಸೂರ್ಯನ ಬೆಳಕು ಮಾತ್ರ ಅದನ್ನು ಬೆಳಗುತ್ತದೆ. ಇದನ್ನು ನೋಡುವುದು ಸುರಕ್ಷಿತ.',
      ),
    },
    {
      id: 'tilt', stage: 'space', seconds: 14,
      camera: { pos: [3.0, 3.6, 16.0], target: [0, 0, 0], drift: 0.02 },
      highlight: ['orbit'], labels: ['orbit', 'moon', 'earth'],
      title: t('Why not every month?', 'हर महीने क्यों नहीं?', 'ಪ್ರತಿ ತಿಂಗಳು ಏಕೆ ಇಲ್ಲ?'),
      caption: t(
        'The Moon’s orbit is tilted a little, about 5°. At most new and full moons the Moon passes just above or below the shadow, so eclipses happen only a few times a year.',
        'चंद्रमा की कक्षा थोड़ी, लगभग 5°, झुकी है। अधिकांश अमावस्या और पूर्णिमा को चंद्रमा छाया के ठीक ऊपर या नीचे से निकल जाता है, इसलिए ग्रहण वर्ष में कुछ ही बार होते हैं।',
        'ಚಂದ್ರನ ಕಕ್ಷೆ ಸ್ವಲ್ಪ, ಸುಮಾರು 5°, ಓರೆಯಾಗಿದೆ. ಹೆಚ್ಚಿನ ಅಮಾವಾಸ್ಯೆ ಮತ್ತು ಹುಣ್ಣಿಮೆಗಳಲ್ಲಿ ಚಂದ್ರ ನೆರಳಿನ ಸ್ವಲ್ಪ ಮೇಲೆ ಅಥವಾ ಕೆಳಗೆ ಹಾದುಹೋಗುತ್ತದೆ; ಆದ್ದರಿಂದ ಗ್ರಹಣಗಳು ವರ್ಷಕ್ಕೆ ಕೆಲವೇ ಬಾರಿ ಆಗುತ್ತವೆ.',
      ),
    },
  ],
};

const SUN = new THREE.Vector3(-30, 0, 0), SR = 1.6;
const ER = 1.3, MO = 6, MR = 0.42;
const TILT = (12 * Math.PI) / 180; // drawn larger than the real 5°

export async function build(k) {
  const stage = k.stage('space');
  const rnd = seeded(1301);
  stage.add(starfield(1600, 90, rnd));
  const sun = sunMesh(SR);
  sun.position.copy(SUN);
  stage.add(sun);
  k.part('sun', sun, { anchor: SUN.toArray().map((x, i) => (i === 1 ? x + SR * 1.3 : x)) });
  const corona = sun.children[1];
  k.marker('corona', stage, (out) => out.copy(SUN).add({ x: 0, y: SR * 1.6, z: 0 }), 0.3);

  const earthMat = sunlitMaterial({ map: earthTexture(), sun: SUN, ambient: 0.1, atmosphere: 0.8 });
  earthMat.uniforms.sunR.value = SR;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(ER, 96, 64), earthMat);
  stage.add(earth);
  k.part('earth', earth, { anchor: [0, ER * 1.15, 0] });
  const moonMat = sunlitMaterial({ map: moonTexture(), sun: SUN, ambient: 0.012, night: '#1a1c22', umbra: '#b0401c' });
  moonMat.uniforms.sunR.value = SR;
  const moon = new THREE.Mesh(new THREE.SphereGeometry(MR, 64, 48), moonMat);
  stage.add(moon);
  k.part('moon', moon, { anchor: () => moon.position.clone().add({ x: 0, y: MR * 1.2, z: 0 }) });

  // The shadow cones, drawn faintly: umbra narrowing, penumbra widening.
  const cone = (r0, r1, len, color, opacity) => {
    const g = new THREE.CylinderGeometry(r1, r0, len, 48, 1, true);
    g.rotateZ(-Math.PI / 2);
    g.translate(len / 2, 0, 0);
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  };
  const D = SUN.length();
  const shadows = new THREE.Group();
  const earthSpot = new THREE.Vector3(-ER, 0, 0);
  const earthUmbra = cone(ER, ER * (1 - 10 / ((ER * D) / (SR - ER))), 10, '#05070c', 0.42);
  const earthPen = cone(ER, ER + (10 * (SR + ER)) / D, 10, '#1a2030', 0.18);
  shadows.add(earthUmbra, earthPen);
  const moonUmbraLen = (MR * (D - MO)) / (SR - MR), mLen = Math.min(MO - 0.4, moonUmbraLen);
  const moonUmbra = cone(MR, MR * (1 - mLen / moonUmbraLen), mLen, '#05070c', 0.45);
  const moonPen = cone(MR, MR + (MO * (SR + MR)) / (D - MO), MO - 0.9, '#1a2030', 0.16);
  const moonShadows = new THREE.Group();
  moonShadows.add(moonUmbra, moonPen);
  stage.add(shadows, moonShadows);
  k.part('umbra', earthUmbra, { anchor: () => (moonShadows.visible && moon.position.x < 0 ? earthSpot.clone() : new THREE.Vector3(4.2, ER * 0.7, 0)) });
  k.part('penumbra', earthPen, { anchor: () => (moonShadows.visible && moon.position.x < 0 ? earthSpot.clone().add({ x: 0, y: 0.45, z: 0.3 }) : new THREE.Vector3(6.5, ER * 1.4, 0)) });

  // The Moon's orbit, flat or tilted, and the plane of the Earth's orbit.
  const ring = (tilt) => tube(Array.from({ length: 129 }, (_, i) => {
    const a = (i / 128) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * MO, Math.sin(a) * MO * Math.sin(tilt), -Math.sin(a) * MO * Math.cos(tilt));
  }), 0.02, { segments: 256, radial: 6, closed: true });
  const orbit = new THREE.Mesh(ring(0), new THREE.MeshBasicMaterial({ color: '#8aa0c0', transparent: true, opacity: 0.4, toneMapped: false }));
  const tilted = new THREE.Mesh(ring(TILT), new THREE.MeshBasicMaterial({ color: '#c0a0e0', transparent: true, opacity: 0.6, toneMapped: false }));
  const plane = new THREE.Mesh(new THREE.CircleGeometry(MO * 1.25, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#8aa0c0', transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  stage.add(orbit, tilted, plane);
  k.part('orbit', tilted, { anchor: [0, MO * Math.sin(TILT), -MO * Math.cos(TILT)] });
  const v = new THREE.Vector3();
  return {
    update: (s) => {
      const T = s.T;
      // The Moon's place: crossing in front of the Sun, behind the Earth, or going round.
      let a;
      if (s.is('solar')) a = Math.PI + (s.u - 0.5) * 0.35;
      else if (s.is('solar_view')) a = Math.PI + (s.u - 0.5) * 0.03;
      else if (s.is('lunar')) a = (s.u - 0.5) * 0.3;
      else a = Math.PI * 0.7 + s.u * Math.PI * 2;
      const tiltOn = s.is('tilt');
      moon.position.set(Math.cos(a) * MO, tiltOn ? Math.sin(a) * MO * Math.sin(TILT) : 0, -Math.sin(a) * MO * (tiltOn ? Math.cos(TILT) : 1));
      moon.rotation.y = -a;
      earth.rotation.y = T * 0.1;
      // Shadows: the Earth on the Moon, the Moon on the Earth.
      earthMat.uniforms.occA.value.set(moon.position.x, moon.position.y, moon.position.z, MR);
      moonMat.uniforms.occA.value.set(0, 0, 0, ER);
      // The Moon's shadow cones point away from the Sun.
      moonShadows.position.copy(moon.position);
      v.copy(moon.position).sub(SUN).normalize();
      moonShadows.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), v);
      moonShadows.visible = !s.is('solar_view') && !tiltOn;
      shadows.visible = !s.is('solar_view');
      // Where the Moon's shadow meets the Earth.
      earthSpot.copy(moon.position).addScaledVector(v, MO - ER - 0.1);
      orbit.visible = !tiltOn && !s.is('solar_view', 'lunar');
      tilted.visible = plane.visible = tiltOn;
      // In totality the corona shows: the glow is dimmer but wider.
      corona.material.opacity = s.is('solar_view') ? 1 : 0.85;
      corona.scale.setScalar(SR * (s.is('solar_view') ? 3.2 : 6));
    },
  };
}
