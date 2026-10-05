// The Earth going round the Sun, built in code: four positions in the year
// with the axis always tilted 23.5° the same way, lit by the Sun so that each
// Earth shows its day and night halves. Distances and sizes are not to scale.
import { globe } from '../lib/earth.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const TILT = (23.5 * Math.PI) / 180;
const ORBIT = 0.13, EARTH = 0.017, SUN = 0.03;
// Seen from above the north pole the Earth goes round anticlockwise:
// June on the left (-x), September at the front (+z), December on the
// right, March at the back. The axis leans towards +x, so in June the
// north pole leans towards the Sun.
const MONTHS = [
  { id: 'june', angle: Math.PI },
  { id: 'september', angle: -Math.PI / 2 },
  { id: 'december', angle: 0 },
  { id: 'march', angle: Math.PI / 2 },
];
const at = (a) => [ORBIT * Math.cos(a), 0, -ORBIT * Math.sin(a)];

const WORDS = {
  june: [
    t('21 June: summer in the north', '21 जून: उत्तर में ग्रीष्म', 'ಜೂನ್ 21: ಉತ್ತರದಲ್ಲಿ ಬೇಸಿಗೆ'),
    t('The northern half leans towards the Sun: long days, short nights and summer in India. The Sun is overhead at the Tropic of Cancer.', 'उत्तरी गोलार्ध सूर्य की ओर झुका है: भारत में लंबे दिन, छोटी रातें और ग्रीष्म। सूर्य कर्क रेखा पर सिर के ऊपर होता है।', 'ಉತ್ತರ ಗೋಳಾರ್ಧ ಸೂರ್ಯನ ಕಡೆಗೆ ಬಾಗಿದೆ: ಭಾರತದಲ್ಲಿ ದೀರ್ಘ ಹಗಲು, ಕಿರು ರಾತ್ರಿ ಮತ್ತು ಬೇಸಿಗೆ. ಸೂರ್ಯ ಕರ್ಕಾಟಕ ವೃತ್ತದ ಮೇಲೆ ನೆತ್ತಿಯ ಮೇಲಿರುತ್ತಾನೆ.'),
  ],
  september: [
    t('23 September: equinox', '23 सितंबर: विषुव', 'ಸೆಪ್ಟೆಂಬರ್ 23: ವಿಷುವ'),
    t('Neither half leans towards the Sun. Day and night are equal everywhere; the Sun is overhead at the equator.', 'कोई गोलार्ध सूर्य की ओर नहीं झुका। हर जगह दिन और रात बराबर; सूर्य भूमध्य रेखा पर सिर के ऊपर।', 'ಯಾವ ಗೋಳಾರ್ಧವೂ ಸೂರ್ಯನ ಕಡೆಗೆ ಬಾಗಿಲ್ಲ. ಎಲ್ಲೆಡೆ ಹಗಲು ರಾತ್ರಿ ಸಮ; ಸೂರ್ಯ ಸಮಭಾಜಕ ವೃತ್ತದ ಮೇಲೆ ನೆತ್ತಿಯ ಮೇಲಿರುತ್ತಾನೆ.'),
  ],
  december: [
    t('22 December: winter in the north', '22 दिसंबर: उत्तर में शीत', 'ಡಿಸೆಂಬರ್ 22: ಉತ್ತರದಲ್ಲಿ ಚಳಿಗಾಲ'),
    t('The southern half leans towards the Sun: winter and short days in India, summer in Australia. The Sun is overhead at the Tropic of Capricorn.', 'दक्षिणी गोलार्ध सूर्य की ओर झुका है: भारत में शीत और छोटे दिन, ऑस्ट्रेलिया में ग्रीष्म। सूर्य मकर रेखा पर सिर के ऊपर।', 'ದಕ್ಷಿಣ ಗೋಳಾರ್ಧ ಸೂರ್ಯನ ಕಡೆಗೆ ಬಾಗಿದೆ: ಭಾರತದಲ್ಲಿ ಚಳಿ ಮತ್ತು ಕಿರು ಹಗಲು, ಆಸ್ಟ್ರೇಲಿಯಾದಲ್ಲಿ ಬೇಸಿಗೆ. ಸೂರ್ಯ ಮಕರ ವೃತ್ತದ ಮೇಲೆ ನೆತ್ತಿಯ ಮೇಲಿರುತ್ತಾನೆ.'),
  ],
  march: [
    t('21 March: equinox', '21 मार्च: विषुव', 'ಮಾರ್ಚ್ 21: ವಿಷುವ'),
    t('Again neither half leans towards the Sun: equal day and night everywhere.', 'फिर कोई गोलार्ध सूर्य की ओर नहीं झुका: हर जगह दिन और रात बराबर।', 'ಮತ್ತೆ ಯಾವ ಗೋಳಾರ್ಧವೂ ಸೂರ್ಯನ ಕಡೆಗೆ ಬಾಗಿಲ್ಲ: ಎಲ್ಲೆಡೆ ಹಗಲು ರಾತ್ರಿ ಸಮ.'),
  ],
};

export default {
  id: 'seasons',
  version: 1,
  order: 2,
  source: 'procedural',
  subject: 'Space',
  classes: [6, 9, 11],
  title: t('Seasons: the Earth round the Sun', 'ऋतुएँ: सूर्य के चारों ओर पृथ्वी', 'ಋತುಗಳು: ಸೂರ್ಯನ ಸುತ್ತ ಭೂಮಿ'),
  summary: t(
    'The Earth\'s axis is tilted 23.5° and always points the same way. As the Earth goes round the Sun, first one half and then the other leans towards the Sun: that makes the seasons.',
    'पृथ्वी का अक्ष 23.5° झुका है और सदा एक ही दिशा में रहता है। सूर्य की परिक्रमा में पहले एक और फिर दूसरा गोलार्ध सूर्य की ओर झुकता है: इसी से ऋतुएँ बनती हैं।',
    'ಭೂಮಿಯ ಅಕ್ಷ 23.5° ಓರೆಯಾಗಿದ್ದು ಯಾವಾಗಲೂ ಒಂದೇ ದಿಕ್ಕಿಗೆ ತೋರುತ್ತದೆ. ಸೂರ್ಯನ ಸುತ್ತ ಸುತ್ತುವಾಗ ಮೊದಲು ಒಂದು, ನಂತರ ಇನ್ನೊಂದು ಗೋಳಾರ್ಧ ಸೂರ್ಯನ ಕಡೆಗೆ ಬಾಗುತ್ತದೆ: ಇದರಿಂದ ಋತುಗಳು.',
  ),
  keywords: ['seasons', 'motions of the earth', 'revolution', 'rotation', 'axis', 'tilt', 'equinox', 'solstice', 'day and night', 'tropic of cancer', 'tropic of capricorn', 'the earth in the solar system'],
  credit: 'Model built by KINETIX; coastlines from Natural Earth (public domain)',
  light: [0, 0, 0], // the Sun
  groups: [
    { id: 'sun', name: t('Sun and orbit', 'सूर्य और कक्षा', 'ಸೂರ್ಯ ಮತ್ತು ಕಕ್ಷೆ') },
    { id: 'earths', name: t('The Earth through the year', 'वर्ष भर पृथ्वी', 'ವರ್ಷವಿಡೀ ಭೂಮಿ') },
    { id: 'lines', name: t('Axis and lines', 'अक्ष और रेखाएँ', 'ಅಕ್ಷ ಮತ್ತು ರೇಖೆಗಳು') },
  ],
  build(THREE) {
    const out = { sun: new THREE.SphereGeometry(SUN, 64, 32), orbit: new THREE.TorusGeometry(ORBIT, 0.0006, 8, 256).rotateX(Math.PI / 2), land: [], axis: [], lines: [] };
    const place = (g, a) => {
      g.rotateZ(-TILT); // lean the north pole towards +x
      return g.translate(...at(a));
    };
    for (const m of MONTHS) {
      // India on the side facing +x.
      const { land, sea } = globe(THREE, EARTH, { widthSegments: 144, heightSegments: 72, facing: 78 - 90 });
      out[`earth_${m.id}`] = place(sea, m.angle);
      out.land.push(place(land, m.angle));
      out.axis.push(place(new THREE.CylinderGeometry(0.0006, 0.0006, EARTH * 2.9, 8), m.angle));
      // The equator, the tropics and the polar circles.
      for (const lat of [0, 23.5, -23.5, 66.5, -66.5]) {
        const r = EARTH * 1.004 * Math.cos((lat * Math.PI) / 180), y = EARTH * 1.004 * Math.sin((lat * Math.PI) / 180);
        out.lines.push(place(new THREE.TorusGeometry(r, lat === 0 ? 0.00022 : 0.00016, 4, 64).rotateX(Math.PI / 2).translate(0, y, 0), m.angle));
      }
    }
    return out;
  },
  parts: [
    {
      id: 'sun', group: 'sun', color: '#ffc93c', glow: 1, explode: [0, 0, 0],
      name: t('Sun', 'सूर्य', 'ಸೂರ್ಯ'),
      info: t('Its light falls straight on the half of the Earth that leans towards it, making that half hot.', 'इसका प्रकाश पृथ्वी के उस आधे भाग पर सीधा पड़ता है जो इसकी ओर झुका है, और उसे गर्म करता है।', 'ಇದರ ಬೆಳಕು ತನ್ನ ಕಡೆಗೆ ಬಾಗಿದ ಭೂಮಿಯ ಅರ್ಧದ ಮೇಲೆ ನೇರವಾಗಿ ಬಿದ್ದು ಅದನ್ನು ಬಿಸಿ ಮಾಡುತ್ತದೆ.'),
    },
    {
      id: 'orbit', group: 'sun', color: '#9fb3c8', glow: 0.7, minor: true, explode: [0, 0, 0],
      name: t('Orbit', 'कक्षा', 'ಕಕ್ಷೆ'),
      info: t('The Earth\'s path round the Sun: one trip takes 365¼ days, a year.', 'सूर्य के चारों ओर पृथ्वी का पथ: एक चक्कर में 365¼ दिन यानी एक वर्ष लगता है।', 'ಸೂರ್ಯನ ಸುತ್ತ ಭೂಮಿಯ ಪಥ: ಒಂದು ಸುತ್ತಿಗೆ 365¼ ದಿನ, ಅಂದರೆ ಒಂದು ವರ್ಷ.'),
    },
    ...MONTHS.map((m) => ({ id: `earth_${m.id}`, group: 'earths', color: '#2f6fb8', detail: 0.3, error: 0.0004, explode: [0, 0, 0], name: WORDS[m.id][0], info: WORDS[m.id][1] })),
    {
      id: 'land', group: 'earths', color: '#6f9a4c', matte: true, minor: true, detail: 0.35, error: 0.0004, explode: [0, 0, 0],
      name: t('Land', 'स्थल', 'ಭೂಮಿ'),
      info: t('India is on the side of each Earth facing right.', 'हर पृथ्वी पर भारत दाईं ओर वाले भाग में है।', 'ಪ್ರತಿ ಭೂಮಿಯಲ್ಲೂ ಭಾರತ ಬಲಬದಿಗೆ ಇದೆ.'),
    },
    {
      id: 'axis', group: 'lines', color: '#f4f4f4', glow: 0.6, explode: [0, 0, 0],
      name: t('Axis (tilted 23.5°)', 'अक्ष (23.5° झुका)', 'ಅಕ್ಷ (23.5° ಓರೆ)'),
      info: t('The Earth spins on it once a day. It always points the same way in space, towards the Pole Star.', 'पृथ्वी दिन में एक बार इस पर घूमती है। यह अंतरिक्ष में सदा एक ही दिशा में, ध्रुव तारे की ओर रहता है।', 'ಭೂಮಿ ದಿನಕ್ಕೊಮ್ಮೆ ಇದರ ಮೇಲೆ ತಿರುಗುತ್ತದೆ. ಇದು ಬಾಹ್ಯಾಕಾಶದಲ್ಲಿ ಯಾವಾಗಲೂ ಒಂದೇ ದಿಕ್ಕಿಗೆ, ಧ್ರುವ ನಕ್ಷತ್ರದ ಕಡೆಗೆ ತೋರುತ್ತದೆ.'),
    },
    {
      id: 'lines', group: 'lines', color: '#ffe08a', glow: 0.6, minor: true, explode: [0, 0, 0],
      name: t('Equator, tropics and polar circles', 'भूमध्य रेखा, उष्णकटिबंध और ध्रुवीय वृत्त', 'ಸಮಭಾಜಕ, ಉಷ್ಣವಲಯ ಮತ್ತು ಧ್ರುವ ವೃತ್ತಗಳು'),
      info: t('From the middle: the equator, the Tropics of Cancer and Capricorn (23½°) and the Arctic and Antarctic Circles (66½°).', 'बीच से: भूमध्य रेखा, कर्क और मकर रेखा (23½°) तथा आर्कटिक और अंटार्कटिक वृत्त (66½°)।', 'ಮಧ್ಯದಿಂದ: ಸಮಭಾಜಕ ವೃತ್ತ, ಕರ್ಕಾಟಕ ಮತ್ತು ಮಕರ ವೃತ್ತಗಳು (23½°), ಆರ್ಕ್ಟಿಕ್ ಮತ್ತು ಅಂಟಾರ್ಕ್ಟಿಕ್ ವೃತ್ತಗಳು (66½°).'),
    },
  ],
  views: [
    { id: 'above', name: t('From above, tilted', 'ऊपर से, तिरछे', 'ಮೇಲಿನಿಂದ, ಓರೆಯಾಗಿ'), dir: [0, 0.75, 1] },
    { id: 'side', name: t('From the side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [0, 0.12, 1] },
    { id: 'top', name: t('From above the North Pole', 'उत्तरी ध्रुव के ऊपर से', 'ಉತ್ತರ ಧ್ರುವದ ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.02] },
  ],
  slices: [],
  animations: [
    {
      id: 'year', kind: 'flow',
      name: t('A year round the Sun', 'सूर्य के चारों ओर एक वर्ष', 'ಸೂರ್ಯನ ಸುತ್ತ ಒಂದು ವರ್ಷ'),
      steps: MONTHS.map((m, k) => {
        const from = MONTHS[(k + 3) % 4].angle;
        let to = m.angle;
        // Anticlockwise from above, the angle grows: June π, September 3π/2, ...
        while (to < from) to += 2 * Math.PI;
        const arc = Array.from({ length: 13 }, (_, i) => at(from + ((to - from) * i) / 12));
        return { color: '#ffe08a', highlight: [`earth_${m.id}`, 'axis'], text: WORDS[m.id][1], paths: [arc] };
      }),
    },
  ],
};
