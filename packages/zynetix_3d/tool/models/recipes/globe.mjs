// A classroom globe: the Earth as seen from space (NASA's Blue Marble, a
// year of cloud-free satellite pictures with the land relief and the ocean
// floor), on a tilted axis in a brass meridian ring and stand, with the
// equator, the tropics, the polar circles and the prime meridian.
import { readFileSync } from 'node:fs';

const t = (en, hi, kn) => ({ en, hi, kn });

const R = 0.15; // a 30 cm globe
const TILT = (23.5 * Math.PI) / 180;
const deg = (d) => (d * Math.PI) / 180;
// three.js puts longitude λ at (cos λ, 0, -sin λ) on a sphere; turning it by
// -(90° + 78°) brings India (78° E) to the front (+z).
const TURN = -deg(168);

export default {
  id: 'globe',
  version: 1,
  order: 1,
  source: 'nasa',
  subject: 'Geography',
  classes: [5, 6, 7, 9],
  title: t('Globe', 'ग्लोब', 'ಗ್ಲೋಬ್'),
  summary: t(
    'A model of the Earth on a tilted axis, made from NASA satellite pictures. Find the equator, the tropics, the poles and India, and turn it to see day move round the world.',
    'झुके अक्ष पर पृथ्वी का मॉडल, नासा के उपग्रह चित्रों से बना। भूमध्य रेखा, कर्क और मकर रेखाएँ, ध्रुव और भारत खोजिए, और घुमाकर देखिए दिन कैसे पृथ्वी पर घूमता है।',
    'ಓರೆಯಾದ ಅಕ್ಷದ ಮೇಲೆ ಭೂಮಿಯ ಮಾದರಿ, ನಾಸಾ ಉಪಗ್ರಹ ಚಿತ್ರಗಳಿಂದ ಮಾಡಿದ್ದು. ಸಮಭಾಜಕ ವೃತ್ತ, ಕರ್ಕಾಟಕ ಮತ್ತು ಮಕರ ವೃತ್ತಗಳು, ಧ್ರುವಗಳು ಮತ್ತು ಭಾರತವನ್ನು ಹುಡುಕಿ; ತಿರುಗಿಸಿ ಹಗಲು ಭೂಮಿಯ ಸುತ್ತ ಹೇಗೆ ಸಾಗುತ್ತದೆ ನೋಡಿ.',
  ),
  keywords: ['globe', 'earth', 'equator', 'latitude', 'longitude', 'axis', 'poles', 'tropic of cancer', 'tropic of capricorn', 'prime meridian', 'continents', 'oceans', 'globe latitudes and longitudes', 'the earth in the solar system', 'map'],
  credit: 'Earth pictures: NASA Earth Observatory, Blue Marble: Next Generation (Reto Stöckli), public domain; model by ZYNETIX',
  sources: {
    earth: { file: 'globe/world.topo.bathy.200412.3x5400x2700.jpg', url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg' },
  },
  maxTexture: 2048,
  async import(k) {
    const THREE = k.THREE;
    // Everything on the globe turns with it and leans 23.5° (north pole to the right).
    const onGlobe = (g) => g.rotateY(TURN).rotateZ(-TILT);
    const metal = (g, color) => k.fromThree(g, { color, roughness: 0.32, metalness: 0.85 });
    const earth = k.fromThree(onGlobe(new THREE.SphereGeometry(R, 160, 96)), {
      texture: { data: readFileSync(k.source('earth')), mime: 'image/jpeg' },
      roughness: 0.78,
    });
    const ring = (lat, w = 0.0011) => {
      const r = R * 1.003 * Math.cos(deg(lat)), y = R * 1.003 * Math.sin(deg(lat));
      return onGlobe(new THREE.TorusGeometry(r, w, 6, 220).rotateX(Math.PI / 2).translate(0, y, 0));
    };
    const line = (lat, w) => k.fromThree(ring(lat, w), { color: [1, 1, 1, 1] });
    // Longitude 0 runs through the plane of (1, 0, 0) and the axis before turning.
    const meridian0 = onGlobe(new THREE.TorusGeometry(R * 1.003, 0.001, 6, 220, Math.PI).rotateZ(-Math.PI / 2).rotateY(0));
    // The stand: a brass half-ring holding the axis, an arm and a round base.
    const brass = [0.83, 0.62, 0.3, 1];
    const halfRing = new THREE.TorusGeometry(R * 1.08, 0.0045, 10, 160, Math.PI).rotateZ(-Math.PI / 2).rotateY(Math.PI / 2).rotateZ(-TILT);
    const pin = new THREE.CylinderGeometry(0.0028, 0.0028, R * 2.24, 12).rotateZ(-TILT);
    const capN = new THREE.SphereGeometry(0.006, 16, 8).translate(0, R * 1.115, 0).rotateZ(-TILT);
    const capS = new THREE.SphereGeometry(0.006, 16, 8).translate(0, -R * 1.115, 0).rotateZ(-TILT);
    const bottom = new THREE.Vector3(0, -R * 1.08, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), -TILT);
    const armTop = bottom.clone();
    const baseY = -R * 1.55;
    const arm = new THREE.CylinderGeometry(0.006, 0.008, armTop.y - baseY, 16).translate(armTop.x, (armTop.y + baseY) / 2, 0);
    const foot = new THREE.CylinderGeometry(R * 0.55, R * 0.62, 0.022, 64).translate(armTop.x, baseY - 0.011, 0);
    const collar = new THREE.CylinderGeometry(0.014, 0.02, 0.012, 24).translate(armTop.x, baseY + 0.006, 0);
    const merged = (gs) => k.mergeRich(gs.map((g) => k.fromThree(g, {})));
    return {
      earth,
      equator: k.fromThree(ring(0, 0.0016), { color: [1, 0.25, 0.2, 1] }),
      tropic_cancer: line(23.44, 0.0011),
      tropic_capricorn: line(-23.44, 0.0011),
      arctic: line(66.56, 0.001),
      antarctic: line(-66.56, 0.001),
      prime_meridian: k.fromThree(meridian0, { color: [1, 0.85, 0.3, 1] }),
      axis: { ...merged([pin, capN, capS]), material: { color: [0.75, 0.75, 0.78, 1], roughness: 0.25, metalness: 0.9 } },
      meridian_ring: metal(halfRing, brass),
      stand: { ...merged([arm, collar]), material: { color: brass, roughness: 0.3, metalness: 0.85 } },
      base: k.fromThree(foot, { color: [0.24, 0.14, 0.08, 1], roughness: 0.45 }),
    };
  },
  groups: [
    { id: 'earth', name: t('The Earth', 'पृथ्वी', 'ಭೂಮಿ') },
    { id: 'lines', name: t('Lines on the globe', 'ग्लोब पर रेखाएँ', 'ಗ್ಲೋಬಿನ ಮೇಲಿನ ರೇಖೆಗಳು') },
    { id: 'stand', name: t('Axis and stand', 'अक्ष और आधार', 'ಅಕ್ಷ ಮತ್ತು ಆಧಾರ') },
  ],
  parts: [
    {
      id: 'earth', group: 'earth', color: '#3d6fa8', inside: '#c8b48a', explode: [0, 0.0001, 0],
      name: t('The Earth', 'पृथ्वी', 'ಭೂಮಿ'),
      info: t(
        'Seven continents and five oceans. About 71% of the surface is water. India is in the northern half, north of the equator and east of the prime meridian.',
        'सात महाद्वीप और पाँच महासागर। सतह का लगभग 71% भाग जल है। भारत उत्तरी गोलार्ध में है, भूमध्य रेखा के उत्तर और प्रधान मध्याह्न रेखा के पूर्व में।',
        'ಏಳು ಖಂಡಗಳು ಮತ್ತು ಐದು ಮಹಾಸಾಗರಗಳು. ಮೇಲ್ಮೈಯ ಸುಮಾರು 71% ನೀರು. ಭಾರತ ಉತ್ತರ ಗೋಳಾರ್ಧದಲ್ಲಿ, ಸಮಭಾಜಕದ ಉತ್ತರಕ್ಕೆ ಮತ್ತು ಪ್ರಧಾನ ರೇಖಾಂಶದ ಪೂರ್ವಕ್ಕಿದೆ.',
      ),
    },
    {
      id: 'equator', group: 'lines', color: '#ff4a3d', cap: false, labelFrom: [0.3, -0.2, 1],
      name: t('Equator (0°)', 'भूमध्य रेखा (0°)', 'ಸಮಭಾಜಕ ವೃತ್ತ (0°)'),
      info: t('The longest line of latitude. It divides the Earth into the northern and southern hemispheres. Places near it are hot all year.', 'अक्षांश की सबसे लंबी रेखा। यह पृथ्वी को उत्तरी और दक्षिणी गोलार्ध में बाँटती है। इसके पास के स्थान वर्ष भर गर्म रहते हैं।', 'ಅತ್ಯಂತ ಉದ್ದದ ಅಕ್ಷಾಂಶ ರೇಖೆ. ಇದು ಭೂಮಿಯನ್ನು ಉತ್ತರ ಮತ್ತು ದಕ್ಷಿಣ ಗೋಳಾರ್ಧಗಳಾಗಿ ವಿಭಜಿಸುತ್ತದೆ. ಇದರ ಬಳಿಯ ಸ್ಥಳಗಳು ವರ್ಷವಿಡೀ ಬಿಸಿ.'),
    },
    {
      id: 'tropic_cancer', group: 'lines', color: '#ffffff', cap: false,
      name: t('Tropic of Cancer (23½° N)', 'कर्क रेखा (23½° उ.)', 'ಕರ್ಕಾಟಕ ವೃತ್ತ (23½° ಉ.)'),
      info: t('It passes through the middle of India, through eight states. On 21 June the noon Sun is straight overhead here.', 'यह भारत के बीच से, आठ राज्यों से होकर गुजरती है। 21 जून को दोपहर का सूर्य यहाँ ठीक सिर के ऊपर होता है।', 'ಇದು ಭಾರತದ ಮಧ್ಯದಲ್ಲಿ ಎಂಟು ರಾಜ್ಯಗಳ ಮೂಲಕ ಹಾದುಹೋಗುತ್ತದೆ. ಜೂನ್ 21ರಂದು ಮಧ್ಯಾಹ್ನದ ಸೂರ್ಯ ಇಲ್ಲಿ ನೇರವಾಗಿ ನೆತ್ತಿಯ ಮೇಲಿರುತ್ತಾನೆ.'),
    },
    {
      id: 'tropic_capricorn', group: 'lines', color: '#ffffff', cap: false,
      name: t('Tropic of Capricorn (23½° S)', 'मकर रेखा (23½° द.)', 'ಮಕರ ವೃತ್ತ (23½° ದ.)'),
      info: t('On 22 December the noon Sun is straight overhead here; it is summer in the southern hemisphere.', '22 दिसंबर को दोपहर का सूर्य यहाँ ठीक सिर के ऊपर होता है; तब दक्षिणी गोलार्ध में ग्रीष्म होती है।', 'ಡಿಸೆಂಬರ್ 22ರಂದು ಮಧ್ಯಾಹ್ನದ ಸೂರ್ಯ ಇಲ್ಲಿ ನೆತ್ತಿಯ ಮೇಲಿರುತ್ತಾನೆ; ಆಗ ದಕ್ಷಿಣ ಗೋಳಾರ್ಧದಲ್ಲಿ ಬೇಸಿಗೆ.'),
    },
    {
      id: 'arctic', group: 'lines', color: '#d9ecff', cap: false, minor: true,
      name: t('Arctic Circle (66½° N)', 'आर्कटिक वृत्त (66½° उ.)', 'ಆರ್ಕ್ಟಿಕ್ ವೃತ್ತ (66½° ಉ.)'),
      info: t('North of this line the Sun does not set on at least one day in summer and does not rise on at least one day in winter.', 'इस रेखा के उत्तर में ग्रीष्म में कम से कम एक दिन सूर्य अस्त नहीं होता और शीत में कम से कम एक दिन उदय नहीं होता।', 'ಈ ರೇಖೆಯ ಉತ್ತರಕ್ಕೆ ಬೇಸಿಗೆಯಲ್ಲಿ ಕನಿಷ್ಠ ಒಂದು ದಿನ ಸೂರ್ಯ ಮುಳುಗುವುದಿಲ್ಲ, ಚಳಿಗಾಲದಲ್ಲಿ ಕನಿಷ್ಠ ಒಂದು ದಿನ ಉದಯಿಸುವುದಿಲ್ಲ.'),
    },
    {
      id: 'antarctic', group: 'lines', color: '#d9ecff', cap: false, minor: true,
      name: t('Antarctic Circle (66½° S)', 'अंटार्कटिक वृत्त (66½° द.)', 'ಅಂಟಾರ್ಕ್ಟಿಕ್ ವೃತ್ತ (66½° ದ.)'),
      info: t('The same in the south: around it lies icy Antarctica, where India has its research stations Maitri and Bharati.', 'दक्षिण में वैसा ही: इसके चारों ओर बर्फीला अंटार्कटिका है, जहाँ भारत के शोध केंद्र मैत्री और भारती हैं।', 'ದಕ್ಷಿಣದಲ್ಲೂ ಹಾಗೆಯೇ: ಇದರ ಸುತ್ತ ಹಿಮಾವೃತ ಅಂಟಾರ್ಕ್ಟಿಕಾ ಇದೆ; ಅಲ್ಲಿ ಭಾರತದ ಸಂಶೋಧನಾ ಕೇಂದ್ರಗಳು ಮೈತ್ರಿ ಮತ್ತು ಭಾರತಿ ಇವೆ.'),
    },
    {
      id: 'prime_meridian', group: 'lines', color: '#ffd84d', cap: false,
      name: t('Prime Meridian (0°)', 'प्रधान मध्याह्न रेखा (0°)', 'ಪ್ರಧಾನ ರೇಖಾಂಶ (0°)'),
      info: t('The line of longitude through Greenwich, London. Longitudes are counted east and west of it; India is between about 68° E and 97° E.', 'ग्रीनविच, लंदन से होकर जाने वाली देशांतर रेखा। देशांतर इसके पूर्व और पश्चिम में गिने जाते हैं; भारत लगभग 68° पू. और 97° पू. के बीच है।', 'ಲಂಡನ್‌ನ ಗ್ರೀನ್‌ವಿಚ್ ಮೂಲಕ ಹಾದುಹೋಗುವ ರೇಖಾಂಶ. ರೇಖಾಂಶಗಳನ್ನು ಇದರ ಪೂರ್ವ ಮತ್ತು ಪಶ್ಚಿಮಕ್ಕೆ ಎಣಿಸುತ್ತಾರೆ; ಭಾರತ ಸುಮಾರು 68° ಪೂ. ಮತ್ತು 97° ಪೂ. ನಡುವೆ ಇದೆ.'),
    },
    {
      id: 'axis', group: 'stand', color: '#c0c0c8', explode: [0.2, 1, 0],
      name: t('Axis (tilted 23½°)', 'अक्ष (23½° झुका)', 'ಅಕ್ಷ (23½° ಓರೆ)'),
      info: t('The Earth spins on its axis once a day, from west to east, giving day and night. The axis is tilted, which gives us seasons.', 'पृथ्वी अपने अक्ष पर दिन में एक बार पश्चिम से पूर्व घूमती है, जिससे दिन और रात होते हैं। अक्ष झुका है, जिससे ऋतुएँ बनती हैं।', 'ಭೂಮಿ ತನ್ನ ಅಕ್ಷದ ಮೇಲೆ ದಿನಕ್ಕೊಮ್ಮೆ ಪಶ್ಚಿಮದಿಂದ ಪೂರ್ವಕ್ಕೆ ತಿರುಗುತ್ತದೆ; ಇದರಿಂದ ಹಗಲು-ರಾತ್ರಿ. ಅಕ್ಷ ಓರೆಯಾಗಿರುವುದರಿಂದ ಋತುಗಳು.'),
    },
    {
      id: 'meridian_ring', group: 'stand', color: '#d4a04c', minor: true, explode: [-1, 0.3, 0],
      name: t('Meridian ring', 'याम्योत्तर वलय', 'ಮೆರಿಡಿಯನ್ ಉಂಗುರ'),
      info: t('Holds the globe at the poles so it can spin freely.', 'ग्लोब को ध्रुवों पर थामे रखता है ताकि वह आसानी से घूम सके।', 'ಗ್ಲೋಬ್ ಮುಕ್ತವಾಗಿ ತಿರುಗುವಂತೆ ಧ್ರುವಗಳಲ್ಲಿ ಹಿಡಿದಿಡುತ್ತದೆ.'),
    },
    {
      id: 'stand', group: 'stand', color: '#d4a04c', minor: true, explode: [0, -1, 0],
      name: t('Stand', 'स्टैंड', 'ಸ್ಟ್ಯಾಂಡ್'),
      info: t('Holds the globe at the same tilt as the real Earth.', 'ग्लोब को असली पृथ्वी जितने झुकाव पर थामे रखता है।', 'ಗ್ಲೋಬನ್ನು ನಿಜವಾದ ಭೂಮಿಯಷ್ಟೇ ಓರೆಯಲ್ಲಿ ಹಿಡಿದಿಡುತ್ತದೆ.'),
    },
    {
      id: 'base', group: 'stand', color: '#5a3a24', minor: true, explode: [0, -1.4, 0],
      name: t('Base', 'आधार', 'ತಳ'),
      info: t('A heavy base keeps the globe steady.', 'भारी आधार ग्लोब को स्थिर रखता है।', 'ಭಾರವಾದ ತಳ ಗ್ಲೋಬನ್ನು ಸ್ಥಿರವಾಗಿಡುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'india', name: t('India', 'भारत', 'ಭಾರತ'), dir: [0.15, 0.3, 1] },
    { id: 'whole', name: t('Whole globe', 'पूरा ग्लोब', 'ಸಂಪೂರ್ಣ ಗ್ಲೋಬ್'), dir: [0.6, 0.15, 1] },
    { id: 'north', name: t('From above the North Pole', 'उत्तरी ध्रुव के ऊपर से', 'ಉತ್ತರ ಧ್ರುವದ ಮೇಲಿನಿಂದ'), dir: [-0.4, 1, 0.05] },
    { id: 'africa', name: t('Africa and Europe', 'अफ़्रीका और यूरोप', 'ಆಫ್ರಿಕಾ ಮತ್ತು ಯೂರೋಪ್'), dir: [-0.9, 0.2, 0.5] },
  ],
  slices: [],
  animations: [],
};
