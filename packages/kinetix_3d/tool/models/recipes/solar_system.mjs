// The solar system, built in code. Not to scale: the planets are drawn
// much larger, and closer together, than they are, so all fit on screen.
import { seeded, blob } from '../lib/shapes.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

// [id, names, radius, orbit, colour, period in years, fact]
const PLANETS = [
  ['mercury', t('Mercury', 'बुध', 'ಬುಧ'), 0.006, 0.085, '#a5a5a5', 0.24, t('Smallest planet and closest to the Sun; a year lasts 88 days.', 'सबसे छोटा और सूर्य के सबसे निकट ग्रह; एक वर्ष 88 दिन का।', 'ಅತಿ ಚಿಕ್ಕ ಮತ್ತು ಸೂರ್ಯನಿಗೆ ಅತಿ ಹತ್ತಿರದ ಗ್ರಹ; ಒಂದು ವರ್ಷ 88 ದಿನಗಳು.')],
  ['venus', t('Venus', 'शुक्र', 'ಶುಕ್ರ'), 0.01, 0.11, '#e3c689', 0.62, t('The hottest planet: thick clouds trap the heat. Brightest in our evening and morning sky.', 'सबसे गर्म ग्रह: घने बादल ऊष्मा रोकते हैं। सुबह-शाम के आकाश में सबसे चमकीला।', 'ಅತಿ ಬಿಸಿಯಾದ ಗ್ರಹ: ದಟ್ಟ ಮೋಡಗಳು ಶಾಖ ಹಿಡಿದಿಡುತ್ತವೆ. ಬೆಳಗಿನ-ಸಂಜೆಯ ಆಕಾಶದಲ್ಲಿ ಅತಿ ಪ್ರಕಾಶಮಾನ.')],
  ['earth', t('Earth', 'पृथ्वी', 'ಭೂಮಿ'), 0.011, 0.14, '#3b7fd4', 1, t('The only planet known to have life, with liquid water and air.', 'जीवन वाला एकमात्र ज्ञात ग्रह, जिसमें तरल जल और वायु है।', 'ಜೀವವಿರುವ ಏಕೈಕ ತಿಳಿದ ಗ್ರಹ; ದ್ರವ ನೀರು ಮತ್ತು ಗಾಳಿ ಇದೆ.')],
  ['mars', t('Mars', 'मंगल', 'ಮಂಗಳ'), 0.008, 0.17, '#c4532f', 1.88, t('The red planet: its soil is rich in iron oxide (rust).', 'लाल ग्रह: इसकी मिट्टी में आयरन ऑक्साइड (जंग) भरपूर है।', 'ಕೆಂಪು ಗ್ರಹ: ಇದರ ಮಣ್ಣಿನಲ್ಲಿ ಕಬ್ಬಿಣದ ಆಕ್ಸೈಡ್ (ತುಕ್ಕು) ಹೇರಳ.')],
  ['jupiter', t('Jupiter', 'बृहस्पति', 'ಗುರು'), 0.026, 0.24, '#d4b088', 11.9, t('The largest planet, a ball of gas; more than 1,300 Earths would fit inside.', 'सबसे बड़ा ग्रह, गैस का गोला; इसमें 1,300 से अधिक पृथ्वियाँ समा सकती हैं।', 'ಅತಿ ದೊಡ್ಡ ಗ್ರಹ, ಅನಿಲದ ಗೋಳ; ಇದರೊಳಗೆ 1,300ಕ್ಕೂ ಹೆಚ್ಚು ಭೂಮಿಗಳು ಹಿಡಿಯುತ್ತವೆ.')],
  ['saturn', t('Saturn', 'शनि', 'ಶನಿ'), 0.022, 0.31, '#e2cc8f', 29.5, t('Famous for its rings of ice and rock.', 'बर्फ़ और चट्टान के अपने छल्लों के लिए प्रसिद्ध।', 'ಹಿಮ ಮತ್ತು ಬಂಡೆಗಳ ಉಂಗುರಗಳಿಗೆ ಪ್ರಸಿದ್ಧ.')],
  ['uranus', t('Uranus', 'अरुण (यूरेनस)', 'ಯುರೇನಸ್'), 0.016, 0.37, '#9fd8e2', 84, t('An ice giant that spins on its side.', 'एक हिम-विशाल ग्रह जो करवट लेकर घूमता है।', 'ಪಕ್ಕಕ್ಕೆ ವಾಲಿ ತಿರುಗುವ ಹಿಮ ದೈತ್ಯ.')],
  ['neptune', t('Neptune', 'वरुण (नेपच्यून)', 'ನೆಪ್ಚೂನ್'), 0.015, 0.42, '#3e63d8', 165, t('The farthest planet, with the fastest winds in the solar system.', 'सबसे दूर का ग्रह, सौरमंडल की सबसे तेज़ हवाओं वाला।', 'ಅತಿ ದೂರದ ಗ್ರಹ; ಸೌರವ್ಯೂಹದ ಅತಿ ವೇಗದ ಗಾಳಿಗಳು ಇಲ್ಲಿ.')],
];

export default {
  id: 'solar_system',
  version: 1,
  order: 1,
  source: 'procedural',
  subject: 'Space',
  classes: [6, 8, 9],
  title: t('The solar system', 'सौरमंडल', 'ಸೌರವ್ಯೂಹ'),
  summary: t(
    'The Sun and the eight planets that go around it. Sizes and distances are not to scale: in reality the planets are far smaller and farther apart.',
    'सूर्य और उसके चारों ओर घूमते आठ ग्रह। आकार और दूरियाँ पैमाने पर नहीं हैं: असल में ग्रह कहीं छोटे और बहुत दूर-दूर हैं।',
    'ಸೂರ್ಯ ಮತ್ತು ಅದರ ಸುತ್ತ ಸುತ್ತುವ ಎಂಟು ಗ್ರಹಗಳು. ಗಾತ್ರ ಮತ್ತು ದೂರಗಳು ಪ್ರಮಾಣದಲ್ಲಿಲ್ಲ: ನಿಜದಲ್ಲಿ ಗ್ರಹಗಳು ಬಹಳ ಚಿಕ್ಕವು ಮತ್ತು ದೂರದೂರ.',
  ),
  keywords: ['solar system', 'planets', 'sun', 'orbit', 'stars and the solar system', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'asteroid belt'],
  credit: 'Model built by KINETIX',
  light: [0, 0, 0], // the Sun
  groups: [
    { id: 'star', name: t('Star', 'तारा', 'ನಕ್ಷತ್ರ') },
    { id: 'inner', name: t('Inner (rocky) planets', 'आंतरिक (चट्टानी) ग्रह', 'ಒಳ (ಬಂಡೆಯ) ಗ್ರಹಗಳು') },
    { id: 'outer', name: t('Outer (giant) planets', 'बाहरी (विशाल) ग्रह', 'ಹೊರ (ದೈತ್ಯ) ಗ್ರಹಗಳು') },
    { id: 'other', name: t('Other', 'अन्य', 'ಇತರ') },
  ],
  build(THREE) {
    const rnd = seeded(5);
    const out = { sun: new THREE.SphereGeometry(0.045, 64, 48) };
    PLANETS.forEach(([id, , r, orbit], i) => {
      const a = i * 2.1 + 0.4;
      const at = [Math.cos(a) * orbit, 0, Math.sin(a) * orbit];
      const parts = [new THREE.SphereGeometry(r, 48, 32).translate(...at)];
      if (id === 'saturn') {
        const ring = new THREE.RingGeometry(r * 1.35, r * 2.2, 96, 1);
        const back = new THREE.RingGeometry(r * 1.35, r * 2.2, 96, 1).rotateX(Math.PI);
        for (const g of [ring, back]) {
          g.rotateX(-Math.PI / 2 + 0.45);
          g.translate(...at);
        }
        out.saturn_rings = [ring, back];
      }
      out[id] = parts;
      out[`orbit_${id}`] = new THREE.TorusGeometry(orbit, 0.0006, 4, 256).rotateX(Math.PI / 2);
    });
    out.orbits = PLANETS.map(([id]) => out[`orbit_${id}`]);
    for (const [id] of PLANETS) delete out[`orbit_${id}`];
    out.asteroids = Array.from({ length: 160 }, () => {
      const a = rnd() * Math.PI * 2, d = 0.195 + rnd() * 0.02;
      return blob(THREE, [Math.cos(a) * d, (rnd() - 0.5) * 0.006, Math.sin(a) * d], 0.0012 + rnd() * 0.0012, 0.001 + rnd() * 0.001, 0.0012, 0);
    });
    return out;
  },
  get parts() {
    return [
      {
        id: 'sun', group: 'star', color: '#ffb02e', glow: 0.9,
        name: t('Sun', 'सूर्य', 'ಸೂರ್ಯ'),
        info: t('A star: a huge ball of hot gas that gives light and heat. It holds 99.8% of the mass of the solar system.', 'एक तारा: गर्म गैस का विशाल गोला जो प्रकाश और ऊष्मा देता है। सौरमंडल का 99.8% द्रव्यमान इसी में है।', 'ಒಂದು ನಕ್ಷತ್ರ: ಬೆಳಕು ಮತ್ತು ಶಾಖ ನೀಡುವ ಬಿಸಿ ಅನಿಲದ ಬೃಹತ್ ಗೋಳ. ಸೌರವ್ಯೂಹದ 99.8% ರಾಶಿ ಇದರಲ್ಲಿದೆ.'),
      },
      ...PLANETS.map(([id, name, , , color, period, fact], i) => ({
        id, group: i < 4 ? 'inner' : 'outer', color, name,
        info: t(`${fact.en} Year: ${period < 1 ? `${Math.round(period * 365)} days` : `${period} Earth years`}.`, `${fact.hi} वर्ष: ${period < 1 ? `${Math.round(period * 365)} दिन` : `${period} पृथ्वी वर्ष`}।`, `${fact.kn} ವರ್ಷ: ${period < 1 ? `${Math.round(period * 365)} ದಿನಗಳು` : `${period} ಭೂ ವರ್ಷಗಳು`}.`),
        // Speed follows the real periods (inner planets fastest), slowed for the eye.
        spin: { axis: [0, 1, 0], speed: 36 / Math.sqrt(period), centre: [0, 0, 0] },
      })),
      {
        id: 'saturn_rings', group: 'outer', color: '#cdb98a', minor: true,
        name: t("Saturn's rings", 'शनि के छल्ले', 'ಶನಿಯ ಉಂಗುರಗಳು'),
        info: t('Billions of pieces of ice and rock orbiting Saturn.', 'शनि की परिक्रमा करते बर्फ़ और चट्टान के अरबों टुकड़े।', 'ಶನಿಯನ್ನು ಸುತ್ತುವ ಕೋಟ್ಯಂತರ ಹಿಮ-ಬಂಡೆ ತುಂಡುಗಳು.'),
        spin: { axis: [0, 1, 0], speed: 36 / Math.sqrt(29.5), centre: [0, 0, 0] },
      },
      {
        id: 'asteroids', group: 'other', color: '#8e8478', minor: true,
        name: t('Asteroid belt', 'क्षुद्रग्रह पट्टी', 'ಕ್ಷುದ್ರಗ್ರಹ ಪಟ್ಟಿ'),
        info: t('Rocky pieces between Mars and Jupiter.', 'मंगल और बृहस्पति के बीच चट्टानी टुकड़े।', 'ಮಂಗಳ ಮತ್ತು ಗುರುವಿನ ನಡುವಿನ ಬಂಡೆ ತುಂಡುಗಳು.'),
        spin: { axis: [0, 1, 0], speed: 8, centre: [0, 0, 0] },
      },
      {
        id: 'orbits', group: 'other', color: '#7d8fa8', glow: 0.55, minor: true,
        name: t('Orbits', 'कक्षाएँ', 'ಕಕ್ಷೆಗಳು'),
        info: t('The paths the planets follow around the Sun (really slightly oval: ellipses).', 'सूर्य के चारों ओर ग्रहों के पथ (असल में थोड़े अंडाकार: दीर्घवृत्त)।', 'ಸೂರ್ಯನ ಸುತ್ತ ಗ್ರಹಗಳ ಪಥಗಳು (ನಿಜದಲ್ಲಿ ಸ್ವಲ್ಪ ಅಂಡಾಕಾರ: ದೀರ್ಘವೃತ್ತಗಳು).'),
      },
    ];
  },
  views: [
    { id: 'above', name: t('From above, tilted', 'ऊपर से, झुका हुआ', 'ಮೇಲಿನಿಂದ, ಓರೆಯಾಗಿ'), dir: [0, 1, 0.75] },
    { id: 'top', name: t('Straight from above', 'ठीक ऊपर से', 'ನೇರ ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.01] },
    { id: 'side', name: t('Edge on', 'किनारे से', 'ಅಂಚಿನಿಂದ'), dir: [0, 0.08, 1] },
  ],
  slices: [],
  animations: [{ id: 'orbit', kind: 'orbit', name: t('Planets moving', 'घूमते ग्रह', 'ಚಲಿಸುವ ಗ್ರಹಗಳು') }],
};
