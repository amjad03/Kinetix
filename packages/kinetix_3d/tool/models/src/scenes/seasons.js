// Day and night, and the seasons: the Earth spinning on its tilted axis, its
// year-long orbit round the Sun, the solstices and the equinoxes. Lit by the
// Sun alone. Built in code.
import { THREE, seeded, GlowPoints, tube } from './kit.js';
import { C } from './bio.js';
import { earthTexture, sunlitMaterial, sunMesh, starfield } from './earthkit.js';

const t = (en, hi, kn) => ({ en, hi, kn });

export const script = {
  id: 'seasons',
  subject: 'Geography',
  classes: [5, 6, 9],
  thumb: { step: 'june', u: 0.5 },
  title: t('Day and night, and the seasons', 'दिन और रात, और ऋतुएँ', 'ಹಗಲು-ರಾತ್ರಿ ಮತ್ತು ಋತುಗಳು'),
  summary: t(
    'How the Earth’s spin makes day and night, and how its tilted axis and its journey round the Sun make the seasons.',
    'पृथ्वी का घूर्णन दिन और रात कैसे बनाता है, और उसका झुका अक्ष तथा सूर्य के चारों ओर उसकी यात्रा ऋतुएँ कैसे बनाते हैं।',
    'ಭೂಮಿಯ ಆವರ್ತನ ಹಗಲು-ರಾತ್ರಿಯನ್ನು ಹೇಗೆ ಉಂಟುಮಾಡುತ್ತದೆ, ಮತ್ತು ಅದರ ಓರೆಯಾದ ಅಕ್ಷ ಹಾಗೂ ಸೂರ್ಯನ ಸುತ್ತಲಿನ ಪಯಣ ಋತುಗಳನ್ನು ಹೇಗೆ ಉಂಟುಮಾಡುತ್ತವೆ.',
  ),
  keywords: ['day and night', 'seasons', 'rotation', 'revolution', 'axis', 'tilt', 'orbit', 'solstice', 'equinox', 'summer', 'winter', 'motions of the earth', 'geography'],
  credit: 'Model built by KINETIX',
  look: {
    background: ['#10141d', '#030407'],
    keyAt: [0, 8, 4],
    envTop: '#1a2030',
    stages: { orbit: { fog: [60, 120] } },
  },
  groups: [
    { id: 'bodies', name: t('Sun and Earth', 'सूर्य और पृथ्वी', 'ಸೂರ್ಯ ಮತ್ತು ಭೂಮಿ') },
    { id: 'motion', name: t('Motions', 'गतियाँ', 'ಚಲನೆಗಳು') },
  ],
  parts: [
    { id: 'sun', group: 'bodies', color: '#ffd27a', name: t('Sun', 'सूर्य', 'ಸೂರ್ಯ'), info: t('Lights one half of the Earth at a time.', 'एक समय में पृथ्वी के आधे भाग को प्रकाशित करता है।', 'ಒಂದು ಸಮಯದಲ್ಲಿ ಭೂಮಿಯ ಅರ್ಧ ಭಾಗವನ್ನು ಬೆಳಗುತ್ತಾನೆ.') },
    { id: 'earth', group: 'bodies', color: '#2f6e9c', name: t('Earth', 'पृथ्वी', 'ಭೂಮಿ'), info: t('Spins once a day; goes round the Sun once a year.', 'दिन में एक बार घूमती है; वर्ष में एक बार सूर्य की परिक्रमा करती है।', 'ದಿನಕ್ಕೊಮ್ಮೆ ತಿರುಗುತ್ತದೆ; ವರ್ಷಕ್ಕೊಮ್ಮೆ ಸೂರ್ಯನನ್ನು ಸುತ್ತುತ್ತದೆ.') },
    { id: 'day_side', group: 'motion', color: '#ffe0a0', name: t('Day', 'दिन', 'ಹಗಲು'), info: t('The half facing the Sun.', 'सूर्य की ओर का आधा भाग।', 'ಸೂರ್ಯನತ್ತ ಮುಖ ಮಾಡಿರುವ ಅರ್ಧ.') },
    { id: 'night_side', group: 'motion', color: '#304060', name: t('Night', 'रात', 'ರಾತ್ರಿ'), info: t('The half facing away from the Sun.', 'सूर्य से दूर का आधा भाग।', 'ಸೂರ್ಯನಿಂದ ದೂರ ಮುಖ ಮಾಡಿರುವ ಅರ್ಧ.') },
    { id: 'axis', group: 'motion', color: '#e8eef4', name: t('Axis (tilted 23½°)', 'अक्ष (23½° झुका)', 'ಅಕ್ಷ (23½° ಓರೆ)'), info: t('An imaginary line through the poles, always pointing towards the Pole Star.', 'ध्रुवों से होकर जाने वाली काल्पनिक रेखा, जो सदा ध्रुव तारे की ओर रहती है।', 'ಧ್ರುವಗಳ ಮೂಲಕ ಹಾದುಹೋಗುವ ಕಾಲ್ಪನಿಕ ರೇಖೆ; ಸದಾ ಧ್ರುವ ನಕ್ಷತ್ರದತ್ತ ಮುಖ ಮಾಡಿರುತ್ತದೆ.') },
    { id: 'orbit', group: 'motion', color: '#8aa0c0', name: t('Orbit', 'कक्षा', 'ಕಕ್ಷೆ'), info: t('The Earth’s yearly path round the Sun.', 'सूर्य के चारों ओर पृथ्वी का वार्षिक पथ।', 'ಸೂರ್ಯನ ಸುತ್ತ ಭೂಮಿಯ ವಾರ್ಷಿಕ ಪಥ.') },
    { id: 'equator', group: 'motion', color: '#ffb347', name: t('Equator', 'विषुवत रेखा', 'ಸಮಭಾಜಕ ವೃತ್ತ'), info: t('Halfway between the poles.', 'दोनों ध्रुवों के बीचोंबीच।', 'ಎರಡು ಧ್ರುವಗಳ ಮಧ್ಯದಲ್ಲಿ.') },
    { id: 'northern', group: 'motion', color: '#ffe0a0', name: t('Northern hemisphere', 'उत्तरी गोलार्ध', 'ಉತ್ತರ ಗೋಳಾರ್ಧ'), info: t('India is in this half.', 'भारत इसी आधे भाग में है।', 'ಭಾರತ ಈ ಅರ್ಧದಲ್ಲಿದೆ.') },
    { id: 'southern', group: 'motion', color: '#a0b8e0', name: t('Southern hemisphere', 'दक्षिणी गोलार्ध', 'ದಕ್ಷಿಣ ಗೋಳಾರ್ಧ'), info: t('Its seasons are the opposite of ours.', 'इसकी ऋतुएँ हमारी ऋतुओं से उलटी होती हैं।', 'ಇದರ ಋತುಗಳು ನಮ್ಮವುಗಳಿಗೆ ವಿರುದ್ಧ.') },
  ],
  steps: [
    {
      id: 'daynight', stage: 'orbit', seconds: 14,
      camera: { pos: [6.2, 1.4, 12.2], target: [0, 0, 10], from: [10, 3, 18], drift: 0.02 },
      highlight: [], labels: ['day_side', 'night_side', 'earth'],
      title: t('Day and night', 'दिन और रात', 'ಹಗಲು ಮತ್ತು ರಾತ್ರಿ'),
      caption: t(
        'The Earth spins on its axis once every 24 hours. The half facing the Sun has day, and the other half has night. As the Earth turns, each place moves from night into day, and back again.',
        'पृथ्वी हर 24 घंटे में अपने अक्ष पर एक बार घूमती है। सूर्य की ओर का आधा भाग दिन में होता है और दूसरा आधा रात में। पृथ्वी के घूमने से हर स्थान रात से दिन में, और फिर वापस रात में जाता है।',
        'ಭೂಮಿ ಪ್ರತಿ 24 ಗಂಟೆಗಳಿಗೊಮ್ಮೆ ತನ್ನ ಅಕ್ಷದ ಮೇಲೆ ತಿರುಗುತ್ತದೆ. ಸೂರ್ಯನತ್ತ ಇರುವ ಅರ್ಧದಲ್ಲಿ ಹಗಲು, ಉಳಿದ ಅರ್ಧದಲ್ಲಿ ರಾತ್ರಿ. ಭೂಮಿ ತಿರುಗಿದಂತೆ ಪ್ರತಿ ಸ್ಥಳ ರಾತ್ರಿಯಿಂದ ಹಗಲಿಗೆ, ಮತ್ತೆ ರಾತ್ರಿಗೆ ಸಾಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'tilt', stage: 'orbit', seconds: 13,
      camera: { pos: [-6.0, 1.6, 12.6], target: [0, 0.2, 10], drift: -0.02 },
      highlight: ['axis'], labels: ['axis', 'equator'],
      title: t('A tilted axis', 'झुका हुआ अक्ष', 'ಓರೆಯಾದ ಅಕ್ಷ'),
      caption: t(
        'The Earth’s axis is not upright: it is tilted by about 23½°. As the Earth goes round the Sun, the axis always points the same way in space, towards the Pole Star.',
        'पृथ्वी का अक्ष सीधा नहीं है: यह लगभग 23½° झुका है। सूर्य की परिक्रमा करते समय अक्ष हमेशा अंतरिक्ष में एक ही दिशा में, ध्रुव तारे की ओर, रहता है।',
        'ಭೂಮಿಯ ಅಕ್ಷ ನೇರವಾಗಿಲ್ಲ: ಸುಮಾರು 23½° ಓರೆಯಾಗಿದೆ. ಭೂಮಿ ಸೂರ್ಯನನ್ನು ಸುತ್ತುವಾಗ ಅಕ್ಷ ಸದಾ ಬಾಹ್ಯಾಕಾಶದಲ್ಲಿ ಒಂದೇ ದಿಕ್ಕಿಗೆ, ಧ್ರುವ ನಕ್ಷತ್ರದತ್ತ, ಮುಖ ಮಾಡಿರುತ್ತದೆ.',
      ),
    },
    {
      id: 'orbit', stage: 'orbit', seconds: 14,
      camera: { pos: [0, 17, 21], target: [0, -1.0, 0], from: [0, 8, 24], drift: 0.02 },
      highlight: ['orbit'], labels: ['sun', 'orbit', 'earth'],
      title: t('A year round the Sun', 'सूर्य की एक परिक्रमा: एक वर्ष', 'ಸೂರ್ಯನ ಸುತ್ತ ಒಂದು ವರ್ಷ'),
      caption: t(
        'The Earth also travels round the Sun, once every 365¼ days: one year. Watch the axis as it goes: it stays tilted the same way all year.',
        'पृथ्वी सूर्य की परिक्रमा भी करती है, हर 365¼ दिन में एक बार: एक वर्ष। घूमते समय अक्ष को देखें: यह पूरे वर्ष एक ही ओर झुका रहता है।',
        'ಭೂಮಿ ಸೂರ್ಯನನ್ನೂ ಸುತ್ತುತ್ತದೆ, ಪ್ರತಿ 365¼ ದಿನಗಳಿಗೊಮ್ಮೆ: ಒಂದು ವರ್ಷ. ಸುತ್ತುವಾಗ ಅಕ್ಷವನ್ನು ಗಮನಿಸಿ: ವರ್ಷವಿಡೀ ಅದು ಒಂದೇ ದಿಕ್ಕಿಗೆ ಓರೆಯಾಗಿರುತ್ತದೆ.',
      ),
    },
    {
      id: 'june', stage: 'orbit', seconds: 15,
      camera: { pos: [-9.4, 1.6, 6.6], target: [-10, 0, 0], drift: 0.02 },
      highlight: ['northern'], labels: ['northern', 'southern', 'axis'],
      title: t('June: summer in the north', 'जून: उत्तर में ग्रीष्म', 'ಜೂನ್: ಉತ್ತರದಲ್ಲಿ ಬೇಸಿಗೆ'),
      caption: t(
        'Around 21 June the northern half leans towards the Sun. The Sun climbs high in the sky and days are long: it is summer in India. The southern half leans away and has winter.',
        '21 जून के आसपास उत्तरी गोलार्ध सूर्य की ओर झुका होता है। सूर्य आकाश में ऊँचा चढ़ता है और दिन लंबे होते हैं: भारत में ग्रीष्म ऋतु होती है। दक्षिणी गोलार्ध दूर झुका होता है और वहाँ शीत ऋतु होती है।',
        'ಜೂನ್ 21ರ ಸುಮಾರಿಗೆ ಉತ್ತರ ಗೋಳಾರ್ಧ ಸೂರ್ಯನತ್ತ ಬಾಗಿರುತ್ತದೆ. ಸೂರ್ಯ ಆಕಾಶದಲ್ಲಿ ಎತ್ತರಕ್ಕೇರುತ್ತಾನೆ, ಹಗಲು ದೀರ್ಘ: ಭಾರತದಲ್ಲಿ ಬೇಸಿಗೆ. ದಕ್ಷಿಣ ಗೋಳಾರ್ಧ ದೂರ ಬಾಗಿದ್ದು ಅಲ್ಲಿ ಚಳಿಗಾಲ.',
      ),
    },
    {
      id: 'december', stage: 'orbit', seconds: 14,
      camera: { pos: [10.6, 1.6, 6.6], target: [10, 0, 0], drift: 0.02 },
      highlight: ['southern'], labels: ['northern', 'southern', 'axis'],
      title: t('December: winter in the north', 'दिसंबर: उत्तर में शीत', 'ಡಿಸೆಂಬರ್: ಉತ್ತರದಲ್ಲಿ ಚಳಿಗಾಲ'),
      caption: t(
        'Six months later, around 22 December, the Earth is on the other side of the Sun. Now the northern half leans away: the Sun stays low, days are short, and it is winter. The south has summer.',
        'छह महीने बाद, 22 दिसंबर के आसपास, पृथ्वी सूर्य के दूसरी ओर होती है। अब उत्तरी गोलार्ध दूर झुका होता है: सूर्य नीचा रहता है, दिन छोटे होते हैं, और शीत ऋतु होती है। दक्षिण में ग्रीष्म होती है।',
        'ಆರು ತಿಂಗಳ ನಂತರ, ಡಿಸೆಂಬರ್ 22ರ ಸುಮಾರಿಗೆ, ಭೂಮಿ ಸೂರ್ಯನ ಇನ್ನೊಂದು ಬದಿಯಲ್ಲಿರುತ್ತದೆ. ಈಗ ಉತ್ತರ ಗೋಳಾರ್ಧ ದೂರ ಬಾಗಿರುತ್ತದೆ: ಸೂರ್ಯ ತಗ್ಗಿನಲ್ಲಿರುತ್ತಾನೆ, ಹಗಲು ಚಿಕ್ಕದು, ಚಳಿಗಾಲ. ದಕ್ಷಿಣದಲ್ಲಿ ಬೇಸಿಗೆ.',
      ),
    },
    {
      id: 'equinox', stage: 'orbit', seconds: 13,
      camera: { pos: [6.2, 1.8, 12.6], target: [0, 0, 10], drift: -0.02 },
      highlight: ['equator'], labels: ['equator', 'day_side', 'night_side'],
      title: t('The equinoxes', 'विषुव', 'ವಿಷುವತ್ ಸಂಕ್ರಾಂತಿಗಳು'),
      caption: t(
        'Around 21 March and 23 September, neither half leans towards the Sun. The Sun is overhead at the equator, and day and night are about equal everywhere. These are the equinoxes.',
        '21 मार्च और 23 सितंबर के आसपास कोई भी गोलार्ध सूर्य की ओर नहीं झुका होता। सूर्य विषुवत रेखा पर सिर के ठीक ऊपर होता है, और हर जगह दिन और रात लगभग बराबर होते हैं। इन्हें विषुव कहते हैं।',
        'ಮಾರ್ಚ್ 21 ಮತ್ತು ಸೆಪ್ಟೆಂಬರ್ 23ರ ಸುಮಾರಿಗೆ ಯಾವ ಗೋಳಾರ್ಧವೂ ಸೂರ್ಯನತ್ತ ಬಾಗಿರುವುದಿಲ್ಲ. ಸೂರ್ಯ ಸಮಭಾಜಕ ವೃತ್ತದ ನೇರ ಮೇಲಿರುತ್ತಾನೆ; ಎಲ್ಲೆಡೆ ಹಗಲು-ರಾತ್ರಿ ಸುಮಾರು ಸಮ. ಇವೇ ವಿಷುವತ್ ಸಂಕ್ರಾಂತಿಗಳು.',
      ),
    },
  ],
};

const ORBIT = 10, ER = 1.2;
const TILT = (23.5 * Math.PI) / 180;

/** Where the Earth is (angle round the orbit) for each step; June at −x, December at +x, equinox at +z. */
const placeFor = (s) => {
  if (s.is('june')) return Math.PI;
  if (s.is('december')) return 0;
  if (s.is('orbit')) return Math.PI / 2 + s.u * Math.PI * 2;
  return Math.PI / 2;
};

export async function build(k) {
  const stage = k.stage('orbit');
  const rnd = seeded(1101);
  stage.add(starfield(1500, 80, rnd));
  const sunPos = new THREE.Vector3(0, 0, 0);
  const sun = sunMesh(1.8);
  stage.add(sun);
  k.part('sun', sun, { anchor: [0, 2.2, 0] });
  // The orbit: a thin faint ring.
  const ringPts = Array.from({ length: 129 }, (_, i) => {
    const a = (i / 128) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * ORBIT, 0, Math.sin(a) * ORBIT);
  });
  const orbit = new THREE.Mesh(tube(ringPts, 0.03, { segments: 256, radial: 6, closed: true }), new THREE.MeshBasicMaterial({ color: '#8aa0c0', transparent: true, opacity: 0.45, toneMapped: false }));
  stage.add(orbit);
  k.part('orbit', orbit, { anchor: [ORBIT * 0.71, 0, ORBIT * 0.71] });

  // The Earth: a tilted frame (the axis leans towards +x, i.e. towards the Sun in June, when the Earth is at −x), and the spinning globe inside it.
  const earth = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.z = -TILT; // north pole leans towards +x
  earth.add(tilt);
  const globeMat = sunlitMaterial({ map: earthTexture(), sun: sunPos, ambient: 0.12, atmosphere: 0.8, night: '#24385e' });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(ER, 96, 64), globeMat);
  tilt.add(globe);
  // The axis, poking out through both poles, and the equator.
  const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, ER * 3.0, 12), new THREE.MeshBasicMaterial({ color: '#e8eef4', toneMapped: false }));
  tilt.add(axis);
  const equator = new THREE.Mesh(new THREE.TorusGeometry(ER * 1.006, 0.018, 8, 128), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.85, toneMapped: false }));
  equator.rotation.x = Math.PI / 2;
  tilt.add(equator);
  stage.add(earth);
  k.part('earth', globe, { anchor: () => earth.position.clone().add({ x: 0, y: ER * 1.2, z: 0 }) });
  k.part('axis', axis, { anchor: () => tilt.localToWorld(new THREE.Vector3(0, ER * 1.45, 0)) });
  k.part('equator', equator, { anchor: () => tilt.localToWorld(new THREE.Vector3(0, 0, ER)) });
  // Markers on the day and night halves and on the two hemispheres (on the side the camera sees).
  const toSun = new THREE.Vector3();
  k.marker('day_side', stage, (out) => out.copy(earth.position).addScaledVector(toSun, ER * 0.75).add({ x: 0, y: 0.3, z: 0 }), 0.2);
  k.marker('night_side', stage, (out) => out.copy(earth.position).addScaledVector(toSun, -ER * 0.75).add({ x: 0, y: 0.3, z: 0 }), 0.2);
  k.marker('northern', stage, (out) => out.copy(tilt.localToWorld(new THREE.Vector3(0, ER * 0.75, 0))).addScaledVector(toSun, ER * 0.4), 0.2);
  k.marker('southern', stage, (out) => out.copy(tilt.localToWorld(new THREE.Vector3(0, -ER * 0.75, 0))).addScaledVector(toSun, ER * 0.4), 0.2);
  // Sunlight arriving: faint rays from the Sun towards the Earth.
  const glow = new GlowPoints(300, { size: 0.12 });
  stage.add(glow);
  const ray = C('#ffe6b0');
  const v = new THREE.Vector3();
  return {
    update: (s) => {
      const T = s.T;
      const a = placeFor(s);
      earth.position.set(Math.cos(a) * ORBIT, 0, Math.sin(a) * ORBIT);
      toSun.copy(sunPos).sub(earth.position).normalize();
      // The spin: fast enough to see in the day–night step, gentle elsewhere.
      const spin = s.is('daynight') ? T * 0.9 : T * 0.25;
      globe.rotation.y = spin;
      sun.rotation.y = T * 0.05;
      glow.begin();
      if (s.is('june', 'december', 'equinox', 'daynight')) {
        for (let i = 0; i < 160; i++) {
          const ph = (i * 0.618 + T * 0.4) % 1;
          const off = ((i * 37) % 13) / 13 - 0.5, off2 = ((i * 17) % 11) / 11 - 0.5;
          v.copy(sunPos).lerp(earth.position, 0.2 + 0.75 * ph);
          v.y += off * ER * 2.2;
          v.addScaledVector(new THREE.Vector3(-toSun.z, 0, toSun.x), off2 * ER * 2.2);
          glow.push(v.x, v.y, v.z, 0.06, ray, 0.14 * Math.min(1, ph * 5, (1 - ph) * 8));
        }
      }
      glow.done();
    },
  };
}
