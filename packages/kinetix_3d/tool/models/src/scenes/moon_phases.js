// The phases of the Moon: the Moon going round the Earth, always half lit
// by the Sun, seen from above and as we see it from the Earth. Lit by the
// Sun alone. Built in code.
import { THREE, seeded, GlowPoints, tube } from './kit.js';
import { C } from './bio.js';
import { earthTexture, moonTexture, sunlitMaterial, sunMesh, starfield } from './earthkit.js';

const t = (en, hi, kn) => ({ en, hi, kn });

export const script = {
  id: 'moon_phases',
  subject: 'Geography',
  classes: [5, 6, 8],
  thumb: { step: 'crescent', u: 0.5 },
  title: t('Phases of the Moon', 'चंद्रमा की कलाएँ', 'ಚಂದ್ರನ ಕಲೆಗಳು'),
  summary: t(
    'Why the Moon seems to change shape over a month: it is always half lit by the Sun, and as it goes round the Earth we see more or less of the lit half.',
    'महीने भर में चंद्रमा का आकार बदलता क्यों लगता है: सूर्य उसका आधा भाग सदा प्रकाशित रखता है, और पृथ्वी की परिक्रमा करते समय हमें उस प्रकाशित भाग का कम या अधिक हिस्सा दिखता है।',
    'ತಿಂಗಳಲ್ಲಿ ಚಂದ್ರನ ಆಕಾರ ಬದಲಾದಂತೆ ಏಕೆ ಕಾಣುತ್ತದೆ: ಸೂರ್ಯ ಅದರ ಅರ್ಧ ಭಾಗವನ್ನು ಸದಾ ಬೆಳಗುತ್ತಾನೆ; ಅದು ಭೂಮಿಯನ್ನು ಸುತ್ತುವಾಗ ಬೆಳಗಿದ ಭಾಗದ ಕಡಿಮೆ ಅಥವಾ ಹೆಚ್ಚು ಅಂಶ ನಮಗೆ ಕಾಣುತ್ತದೆ.',
  ),
  keywords: ['moon', 'phases of the moon', 'new moon', 'full moon', 'crescent', 'first quarter', 'waxing', 'waning', 'lunar month', 'amavasya', 'purnima', 'satellite', 'geography'],
  credit: 'Model built by KINETIX',
  look: {
    background: ['#0e1119', '#020305'],
    keyAt: [0, 8, 4],
    envTop: '#181d28',
    stages: { space: { fog: [80, 160] } },
  },
  groups: [
    { id: 'bodies', name: t('Sun, Earth and Moon', 'सूर्य, पृथ्वी और चंद्रमा', 'ಸೂರ್ಯ, ಭೂಮಿ ಮತ್ತು ಚಂದ್ರ') },
  ],
  parts: [
    { id: 'sunlight', group: 'bodies', color: '#ffe6b0', name: t('Sunlight', 'सूर्य का प्रकाश', 'ಸೂರ್ಯನ ಬೆಳಕು'), info: t('Comes from one direction and lights half of everything it falls on.', 'एक दिशा से आता है और जिस पर पड़ता है उसका आधा भाग प्रकाशित करता है।', 'ಒಂದೇ ದಿಕ್ಕಿನಿಂದ ಬಂದು ಬೀಳುವ ಎಲ್ಲದರ ಅರ್ಧ ಭಾಗವನ್ನು ಬೆಳಗುತ್ತದೆ.') },
    { id: 'earth', group: 'bodies', color: '#2f6e9c', name: t('Earth', 'पृथ्वी', 'ಭೂಮಿ'), info: t('We watch the Moon from here.', 'हम यहाँ से चंद्रमा को देखते हैं।', 'ನಾವು ಇಲ್ಲಿಂದ ಚಂದ್ರನನ್ನು ನೋಡುತ್ತೇವೆ.') },
    { id: 'moon', group: 'bodies', color: '#c8c4bc', name: t('Moon', 'चंद्रमा', 'ಚಂದ್ರ'), info: t('It makes no light of its own; it shines by reflected sunlight.', 'इसका अपना प्रकाश नहीं है; यह सूर्य का परावर्तित प्रकाश से चमकता है।', 'ಇದಕ್ಕೆ ತನ್ನದೇ ಬೆಳಕಿಲ್ಲ; ಪ್ರತಿಫಲಿತ ಸೂರ್ಯನ ಬೆಳಕಿನಿಂದ ಹೊಳೆಯುತ್ತದೆ.') },
    { id: 'lit_half', group: 'bodies', color: '#fff2d0', name: t('Lit half', 'प्रकाशित आधा भाग', 'ಬೆಳಗಿದ ಅರ್ಧ'), info: t('Always the half facing the Sun.', 'हमेशा सूर्य की ओर वाला आधा भाग।', 'ಸದಾ ಸೂರ್ಯನತ್ತ ಮುಖ ಮಾಡಿದ ಅರ್ಧ.') },
    { id: 'orbit', group: 'bodies', color: '#8aa0c0', name: t('The Moon’s orbit', 'चंद्रमा की कक्षा', 'ಚಂದ್ರನ ಕಕ್ಷೆ'), info: t('About 3,84,000 km from the Earth.', 'पृथ्वी से लगभग 3,84,000 किमी।', 'ಭೂಮಿಯಿಂದ ಸುಮಾರು 3,84,000 ಕಿಮೀ.') },
  ],
  steps: [
    {
      id: 'orbit', stage: 'space', seconds: 14,
      camera: { pos: [-1.0, 17.0, 8.0], target: [0.5, 0, 1.2], from: [0, 30, 20], drift: 0.02 },
      highlight: ['lit_half'], labels: ['sunlight', 'earth', 'moon', 'lit_half', 'orbit'],
      title: t('Always half lit', 'सदा आधा प्रकाशित', 'ಸದಾ ಅರ್ಧ ಬೆಳಗಿದ'),
      caption: t(
        'The Moon goes round the Earth about once a month. The Sun always lights the half of the Moon that faces it. What changes is how much of that lit half we can see from the Earth.',
        'चंद्रमा लगभग महीने में एक बार पृथ्वी की परिक्रमा करता है। सूर्य हमेशा चंद्रमा के उस आधे भाग को प्रकाशित करता है जो उसकी ओर है। बदलता यह है कि उस प्रकाशित भाग का कितना हिस्सा हमें पृथ्वी से दिखता है।',
        'ಚಂದ್ರ ಸುಮಾರು ತಿಂಗಳಿಗೊಮ್ಮೆ ಭೂಮಿಯನ್ನು ಸುತ್ತುತ್ತದೆ. ಸೂರ್ಯ ಸದಾ ಚಂದ್ರನ ತನ್ನತ್ತ ಮುಖ ಮಾಡಿದ ಅರ್ಧವನ್ನು ಬೆಳಗುತ್ತಾನೆ. ಬದಲಾಗುವುದು ಆ ಬೆಳಗಿದ ಅರ್ಧದ ಎಷ್ಟು ಭಾಗ ಭೂಮಿಯಿಂದ ಕಾಣುತ್ತದೆ ಎಂಬುದು.',
      ),
    },
    {
      id: 'new', stage: 'space', seconds: 12,
      camera: { pos: [1.7, 0.35, 0.2], target: [5.95, 0.4, -0.7] },
      highlight: [], labels: ['moon'],
      title: t('New moon (Amavasya)', 'अमावस्या', 'ಅಮಾವಾಸ್ಯೆ'),
      caption: t(
        'New moon: the Moon is between the Earth and the Sun. Its lit half faces away from us, so we cannot see it, and it is lost in the Sun’s glare.',
        'अमावस्या: चंद्रमा पृथ्वी और सूर्य के बीच होता है। इसका प्रकाशित भाग हमसे दूर की ओर होता है, इसलिए यह हमें नहीं दिखता, और सूर्य की चमक में छिप जाता है।',
        'ಅಮಾವಾಸ್ಯೆ: ಚಂದ್ರ ಭೂಮಿ ಮತ್ತು ಸೂರ್ಯನ ನಡುವೆ ಇರುತ್ತದೆ. ಅದರ ಬೆಳಗಿದ ಅರ್ಧ ನಮ್ಮಿಂದ ದೂರ ಮುಖ ಮಾಡಿರುವುದರಿಂದ ಅದು ಕಾಣುವುದಿಲ್ಲ; ಸೂರ್ಯನ ಪ್ರಖರತೆಯಲ್ಲಿ ಮರೆಯಾಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'crescent', stage: 'space', seconds: 11,
      camera: { pos: [1.2, 0.35, -1.2], target: [4.24, 0.4, -4.24] },
      highlight: [], labels: ['moon', 'lit_half'],
      title: t('Waxing crescent', 'बढ़ता अर्धचंद्र (शुक्ल पक्ष)', 'ಬೆಳೆಯುವ ಬಿದಿಗೆ ಚಂದ್ರ (ಶುಕ್ಲ ಪಕ್ಷ)'),
      caption: t(
        'A few days later we see a thin crescent: just the edge of the lit half. Night by night it grows. This is the waxing Moon.',
        'कुछ दिन बाद हमें एक पतला अर्धचंद्र दिखता है: प्रकाशित भाग का केवल किनारा। हर रात यह बढ़ता है। यह बढ़ता चंद्रमा है।',
        'ಕೆಲವು ದಿನಗಳ ನಂತರ ತೆಳು ಬಿದಿಗೆ ಚಂದ್ರ ಕಾಣುತ್ತದೆ: ಬೆಳಗಿದ ಅರ್ಧದ ಅಂಚು ಮಾತ್ರ. ರಾತ್ರಿಯಿಂದ ರಾತ್ರಿಗೆ ಅದು ಬೆಳೆಯುತ್ತದೆ. ಇದು ಬೆಳೆಯುವ ಚಂದ್ರ.',
      ),
    },
    {
      id: 'quarter', stage: 'space', seconds: 11,
      camera: { pos: [0, 0.35, -1.7], target: [0, 0.4, -6] },
      highlight: [], labels: ['moon', 'lit_half'],
      title: t('First quarter', 'प्रथम चतुर्थांश', 'ಮೊದಲ ಚತುರ್ಥ'),
      caption: t(
        'About a week after new moon, the Moon has gone a quarter of the way round. We see half of its face lit.',
        'अमावस्या के लगभग एक सप्ताह बाद चंद्रमा अपनी परिक्रमा का एक चौथाई भाग पूरा कर लेता है। हमें इसका आधा चेहरा प्रकाशित दिखता है।',
        'ಅಮಾವಾಸ್ಯೆಯ ಸುಮಾರು ಒಂದು ವಾರದ ನಂತರ ಚಂದ್ರ ತನ್ನ ಸುತ್ತಿನ ಕಾಲು ಭಾಗ ಸಾಗಿರುತ್ತದೆ. ಅದರ ಮುಖದ ಅರ್ಧ ಭಾಗ ಬೆಳಗಿದಂತೆ ಕಾಣುತ್ತದೆ.',
      ),
    },
    {
      id: 'full', stage: 'space', seconds: 11,
      camera: { pos: [-1.7, 0.35, 0], target: [-6, 0.4, 0] },
      highlight: [], labels: ['moon'],
      title: t('Full moon (Purnima)', 'पूर्णिमा', 'ಹುಣ್ಣಿಮೆ'),
      caption: t(
        'Full moon: the Earth is between the Sun and the Moon, and we see the whole lit half, a round, bright Moon that rises as the Sun sets.',
        'पूर्णिमा: पृथ्वी सूर्य और चंद्रमा के बीच होती है, और हमें पूरा प्रकाशित भाग दिखता है: एक गोल, चमकीला चंद्रमा जो सूर्यास्त के समय उगता है।',
        'ಹುಣ್ಣಿಮೆ: ಭೂಮಿ ಸೂರ್ಯ ಮತ್ತು ಚಂದ್ರನ ನಡುವೆ ಇರುತ್ತದೆ; ಇಡೀ ಬೆಳಗಿದ ಅರ್ಧ ಕಾಣುತ್ತದೆ: ಸೂರ್ಯ ಮುಳುಗುವಾಗ ಉದಯಿಸುವ ದುಂಡಾದ, ಹೊಳೆಯುವ ಚಂದ್ರ.',
      ),
    },
    {
      id: 'waning', stage: 'space', seconds: 12,
      camera: { pos: [0, 0.35, 1.7], target: [0, 0.4, 6] },
      highlight: [], labels: ['moon', 'lit_half'],
      title: t('Waning: last quarter', 'घटता चंद्रमा: अंतिम चतुर्थांश', 'ಕ್ಷೀಣಿಸುವ ಚಂದ್ರ: ಕೊನೆಯ ಚತುರ್ಥ'),
      caption: t(
        'After full moon, the lit part we see shrinks night by night: the Moon is waning. At last quarter we see the other half lit, and then a thin crescent before dawn.',
        'पूर्णिमा के बाद हमें दिखने वाला प्रकाशित भाग हर रात घटता है: चंद्रमा घट रहा है (कृष्ण पक्ष)। अंतिम चतुर्थांश पर दूसरा आधा भाग प्रकाशित दिखता है, और फिर भोर से पहले एक पतला अर्धचंद्र।',
        'ಹುಣ್ಣಿಮೆಯ ನಂತರ ಕಾಣುವ ಬೆಳಗಿದ ಭಾಗ ರಾತ್ರಿಯಿಂದ ರಾತ್ರಿಗೆ ಕುಗ್ಗುತ್ತದೆ: ಚಂದ್ರ ಕ್ಷೀಣಿಸುತ್ತಿದ್ದಾನೆ (ಕೃಷ್ಣ ಪಕ್ಷ). ಕೊನೆಯ ಚತುರ್ಥದಲ್ಲಿ ಇನ್ನೊಂದು ಅರ್ಧ ಬೆಳಗಿದಂತೆ, ನಂತರ ಬೆಳಗಿನ ಮೊದಲು ತೆಳು ಬಿದಿಗೆ ಕಾಣುತ್ತದೆ.',
      ),
    },
    {
      id: 'cycle', stage: 'space', seconds: 12,
      camera: { pos: [2.0, 16.0, 9.0], target: [0.5, 0, 1.2], drift: -0.02 },
      highlight: [], labels: ['moon', 'earth', 'orbit'],
      title: t('A month of phases', 'कलाओं का एक महीना', 'ಕಲೆಗಳ ಒಂದು ತಿಂಗಳು'),
      caption: t(
        'The whole cycle, from one new moon to the next, takes about 29½ days. It is the basis of the lunar month used in many calendars.',
        'एक अमावस्या से अगली तक पूरा चक्र लगभग 29½ दिन लेता है। यही कई पंचांगों में प्रयुक्त चांद्र मास का आधार है।',
        'ಒಂದು ಅಮಾವಾಸ್ಯೆಯಿಂದ ಮುಂದಿನದರವರೆಗೆ ಇಡೀ ಚಕ್ರಕ್ಕೆ ಸುಮಾರು 29½ ದಿನಗಳು ಬೇಕು. ಅನೇಕ ಪಂಚಾಂಗಗಳ ಚಾಂದ್ರಮಾಸಕ್ಕೆ ಇದೇ ಆಧಾರ.',
      ),
    },
  ],
};

const MO = 6, MR = 0.42, ER = 1.3;
/** Where the Moon is in each view from the Earth (angle round its orbit from the Sun's direction). */
const ANGLES = { new: 0.12, crescent: Math.PI / 4, quarter: Math.PI / 2, full: Math.PI, waning: (Math.PI * 3) / 2 };

export async function build(k) {
  const stage = k.stage('space');
  const rnd = seeded(1201);
  stage.add(starfield(1600, 90, rnd));
  // The Sun, far off along +x.
  const sunPos = new THREE.Vector3(60, 0, 0);
  const sun = sunMesh(3.0);
  sun.position.copy(sunPos);
  stage.add(sun);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(ER, 96, 64), sunlitMaterial({ map: earthTexture(), sun: sunPos, ambient: 0.1, atmosphere: 0.8 }));
  stage.add(earth);
  k.part('earth', earth, { anchor: [0, ER * 1.1, 0] });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(MR, 64, 48), sunlitMaterial({ map: moonTexture(), sun: sunPos, ambient: 0.015, night: '#1a1c22' }));
  stage.add(moon);
  k.part('moon', moon, { anchor: () => moon.position.clone().add({ x: 0, y: MR * 1.1, z: 0 }) });
  k.marker('lit_half', stage, (out) => out.copy(moon.position).add({ x: MR * 0.8, y: MR * 0.4, z: 0 }), 0.12);
  const ringPts = Array.from({ length: 129 }, (_, i) => {
    const a = (i / 128) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * MO, 0, -Math.sin(a) * MO);
  });
  const orbit = new THREE.Mesh(tube(ringPts, 0.02, { segments: 256, radial: 6, closed: true }), new THREE.MeshBasicMaterial({ color: '#8aa0c0', transparent: true, opacity: 0.4, toneMapped: false }));
  stage.add(orbit);
  k.part('orbit', orbit, { anchor: [-MO * 0.71, 0, MO * 0.71] });
  // Sunlight: faint streaks arriving from the right.
  const glow = new GlowPoints(400, { size: 0.12 });
  stage.add(glow);
  const ray = C('#ffe6b0');
  const rayAt = new THREE.Vector3(9, 0, 4);
  k.marker('sunlight', stage, (out) => out.copy(rayAt), 0.2);
  return {
    update: (s) => {
      const T = s.T;
      // Where the Moon is: fixed for the views from Earth, going round in the overviews.
      const a = ANGLES[s.id] ?? (s.is('orbit') ? 0.6 + s.u * Math.PI * 2 : 2.2 + s.u * Math.PI * 2);
      // A little above the Earth's plane, as the Moon's tilted orbit usually is: no eclipse at new or full moon.
      moon.position.set(Math.cos(a) * MO, 0.4, -Math.sin(a) * MO);
      moon.rotation.y = -a; // the same face always towards the Earth
      orbit.visible = s.is('orbit', 'cycle');
      earth.rotation.y = T * 0.2;
      glow.begin();
      if (s.is('orbit', 'cycle')) {
        for (let i = 0; i < 300; i++) {
          const ph = (i * 0.618 + T * 0.35) % 1;
          const z = (((i * 37) % 23) / 23 - 0.5) * 16, y = (((i * 17) % 7) / 7 - 0.5) * 1.2;
          glow.push(lerp1(14, -9, ph), y, z, 0.1, ray, 0.12 * Math.min(1, ph * 6, (1 - ph) * 3));
        }
      }
      glow.done();
    },
  };
}

const lerp1 = (a, b, t2) => a + (b - a) * t2;
