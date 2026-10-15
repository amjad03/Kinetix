// India Gate, New Delhi (1921-1931, designed by Edwin Lutyens), drawn by
// ZYNETIX from its published measurements: a 42 m arch of buff and red
// Bharatpur sandstone with a 9.1 m opening, smaller arches through the
// piers, a deep cornice, the inscribed attic, stepped tiers and the shallow
// bowl on top. A simplified model.
import { archPanel, roundArchPoints, chhatri } from '../lib/architecture.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const OPEN = 9.1; // the main arch's width
const W = 30; // front width
const D = 10; // depth
const SPRING = 17; // where the main arch starts to curve
const TOP = 30; // the main cornice

export default {
  id: 'india_gate',
  version: 1,
  order: 3,
  source: 'procedural',
  subject: 'History',
  classes: [8, 10, 12],
  title: t('India Gate, New Delhi', 'इंडिया गेट, नई दिल्ली', 'ಇಂಡಿಯಾ ಗೇಟ್, ನವದೆಹಲಿ'),
  summary: t(
    'A 42 m war memorial arch to about 84,000 soldiers of the Indian Army who died in the First World War and other wars of 1914-1921; their names are carved on its walls. A simplified model at true proportions.',
    'प्रथम विश्व युद्ध और 1914-1921 के अन्य युद्धों में शहीद भारतीय सेना के लगभग 84,000 सैनिकों की स्मृति में 42 मी ऊँचा युद्ध स्मारक मेहराब; उनके नाम इसकी दीवारों पर उकेरे हैं। सही अनुपात में सरल मॉडल।',
    'ಮೊದಲ ಮಹಾಯುದ್ಧ ಮತ್ತು 1914-1921ರ ಇತರ ಯುದ್ಧಗಳಲ್ಲಿ ಮಡಿದ ಭಾರತೀಯ ಸೇನೆಯ ಸುಮಾರು 84,000 ಸೈನಿಕರ ಸ್ಮರಣೆಯ 42 ಮೀ ಎತ್ತರದ ಯುದ್ಧ ಸ್ಮಾರಕ ಕಮಾನು; ಅವರ ಹೆಸರುಗಳನ್ನು ಇದರ ಗೋಡೆಗಳ ಮೇಲೆ ಕೆತ್ತಲಾಗಿದೆ. ನಿಜ ಅನುಪಾತದ ಸರಳ ಮಾದರಿ.',
  ),
  keywords: ['india gate', 'war memorial', 'world war', 'first world war', 'delhi', 'new delhi', 'monument', 'lutyens', 'arch', 'amar jawan jyoti', 'colonialism', 'architecture'],
  credit: 'Simplified model drawn by ZYNETIX from published measurements',
  size: 0.6,
  crease: 30,
  matte: true,
  build(THREE) {
    const piers = [];
    for (const s of [-1, 1]) {
      // Each pier is pierced by a smaller arch from side to side.
      const width = (W - OPEN) / 2;
      const p = archPanel(THREE, D, TOP, width, [roundArchPoints(4.6, 6.2, 0, 0)]);
      p.rotateY(Math.PI / 2).translate(s > 0 ? OPEN / 2 : -W / 2, 0, 0);
      piers.push(p);
    }
    // The span over the main opening: a block with a half-round cut beneath.
    const span = new THREE.Shape();
    span.moveTo(-OPEN / 2, SPRING);
    for (let i = 0; i <= 32; i++) {
      const a = Math.PI - (Math.PI * i) / 32;
      span.lineTo((OPEN / 2) * Math.cos(a), SPRING + (OPEN / 2) * Math.sin(a));
    }
    span.lineTo(OPEN / 2, TOP).lineTo(-OPEN / 2, TOP).lineTo(-OPEN / 2, SPRING);
    const lintel = new THREE.ExtrudeGeometry(span, { depth: D, bevelEnabled: false, curveSegments: 32 }).translate(0, 0, -D / 2);
    // A moulded ring round the arch on both faces, and the keystone.
    const mouldings = [];
    for (const z of [-D / 2 - 0.2, D / 2 + 0.2]) {
      mouldings.push(new THREE.TorusGeometry(OPEN / 2 + 0.45, 0.35, 8, 48, Math.PI).translate(0, SPRING, z));
      for (const x of [-OPEN / 2 - 0.45, OPEN / 2 + 0.45]) mouldings.push(new THREE.BoxGeometry(0.7, SPRING, 0.6).translate(x, SPRING / 2, z));
      mouldings.push(new THREE.BoxGeometry(1.4, 2.2, 0.8).translate(0, SPRING + OPEN / 2 + 0.6, z));
      // Pilaster strips on the piers.
      for (const x of [-W / 2 + 1.2, W / 2 - 1.2, -OPEN / 2 - 2.2, OPEN / 2 + 2.2]) mouldings.push(new THREE.BoxGeometry(1.0, TOP - 3, 0.4).translate(x, 3 + (TOP - 3) / 2, z));
    }
    const cornice = [new THREE.BoxGeometry(W + 1.6, 1.4, D + 1.6).translate(0, TOP + 0.7, 0), new THREE.BoxGeometry(W + 0.6, 0.6, D + 0.6).translate(0, TOP - 0.3, 0)];
    const attic = [new THREE.BoxGeometry(W - 1, 5, D - 0.6).translate(0, TOP + 1.4 + 2.5, 0), new THREE.BoxGeometry(W - 0.4, 0.6, D).translate(0, TOP + 6.7, 0)];
    // The word INDIA is carved on both faces of the attic: shown as a panel.
    const inscription = [-1, 1].map((s) => new THREE.BoxGeometry(14, 2.0, 0.25).translate(0, TOP + 3.9, s * (D / 2 - 0.15)));
    const tiers = [
      new THREE.BoxGeometry(24, 1.3, 8.4).translate(0, TOP + 7.65, 0),
      new THREE.BoxGeometry(18.5, 1.3, 7.2).translate(0, TOP + 8.95, 0),
      new THREE.BoxGeometry(12, 1.2, 6).translate(0, TOP + 10.2, 0),
    ];
    const bowl = [new THREE.LatheGeometry([[0, 0], [2.8, 0], [3.4, 0.5], [4.4, 1.4], [4.7, 1.9], [4.2, 1.9], [3.2, 1.3], [0, 1.15]].map(([r, y]) => new THREE.Vector2(r, y)), 48).translate(0, TOP + 10.8, 0)];
    const base = [new THREE.BoxGeometry(W + 4, 1.6, D + 4).translate(0, -0.8, 0), new THREE.BoxGeometry(W + 9, 0.8, D + 9).translate(0, -2.0, 0)];
    // The red sandstone at the foot of the piers.
    const plinthCourse = [-1, 1].map((s) => new THREE.BoxGeometry((W - OPEN) / 2 + 0.5, 3.2, D + 0.5).translate(s * (W + OPEN) / 4, 1.6, 0));
    // The canopy to the east (a chhatri, now sheltering a statue of Netaji Subhas Chandra Bose).
    const canopy = [new THREE.BoxGeometry(12, 1.4, 12).translate(0, 0.7, -60), ...chhatri(THREE, [0, 1.4, -60], 4.2, 9, 4)];
    const paths = [new THREE.BoxGeometry(6, 0.2, 40).translate(0, -2.3, -30), new THREE.BoxGeometry(80, 0.2, 90).translate(0, -2.6, -20)];
    return {
      arch: [...piers, lintel],
      mouldings,
      plinth_course: plinthCourse,
      cornice,
      attic,
      inscription,
      tiers,
      bowl,
      base,
      canopy,
      lawns: paths,
    };
  },
  groups: [
    { id: 'gate', name: t('The arch', 'मेहराब', 'ಕಮಾನು') },
    { id: 'around', name: t('Base and canopy', 'आधार और छतरी', 'ತಳ ಮತ್ತು ಮೇಲ್ಛಾವಣಿ') },
  ],
  parts: [
    {
      id: 'arch', group: 'gate', color: '#b8936a', explode: [0, 0, 0.0001],
      name: t('Main arch (9.1 m wide)', 'मुख्य मेहराब (9.1 मी चौड़ा)', 'ಮುಖ್ಯ ಕಮಾನು (9.1 ಮೀ ಅಗಲ)'),
      info: t('Smaller arches cross through the two piers. The names of the soldiers are carved all over the walls.', 'दोनों स्तंभों के आर-पार छोटे मेहराब हैं। सैनिकों के नाम पूरी दीवारों पर उकेरे हैं।', 'ಎರಡೂ ಸ್ತಂಭಗಳ ಮೂಲಕ ಸಣ್ಣ ಕಮಾನುಗಳು ಹಾದುಹೋಗುತ್ತವೆ. ಸೈನಿಕರ ಹೆಸರುಗಳನ್ನು ಗೋಡೆಗಳ ತುಂಬಾ ಕೆತ್ತಲಾಗಿದೆ.'),
    },
    {
      id: 'mouldings', group: 'gate', color: '#a6835d', minor: true, explode: [0, 0, 0.0001],
      name: t('Arch mouldings and pilasters', 'मेहराब की सजावट और भित्ति-स्तंभ', 'ಕಮಾನಿನ ಅಲಂಕಾರ ಮತ್ತು ಭಿತ್ತಿಸ್ತಂಭಗಳು'),
      info: t('Carved stone frames round the arch.', 'मेहराब के चारों ओर उकेरे पत्थर के फ़्रेम।', 'ಕಮಾನಿನ ಸುತ್ತ ಕೆತ್ತಿದ ಕಲ್ಲಿನ ಚೌಕಟ್ಟುಗಳು.'),
    },
    {
      id: 'plinth_course', group: 'gate', color: '#9b4f3a', minor: true, explode: [0, -0.4, 0],
      name: t('Red sandstone base course', 'लाल बलुआ पत्थर की नींव पट्टी', 'ಕೆಂಪು ಮರಳುಗಲ್ಲಿನ ತಳಪಟ್ಟಿ'),
      info: t('Red Bharatpur stone at the foot, buff stone above.', 'नीचे लाल भरतपुर पत्थर, ऊपर हल्के भूरे पत्थर।', 'ಕೆಳಗೆ ಕೆಂಪು ಭರತ್‌ಪುರ ಕಲ್ಲು, ಮೇಲೆ ತಿಳಿ ಕಂದು ಕಲ್ಲು.'),
    },
    {
      id: 'cornice', group: 'gate', color: '#ab8860', explode: [0, 0.4, 0],
      name: t('Cornice', 'कार्निस', 'ಕಾರ್ನಿಸ್'),
      info: t('A deep projecting band that crowns the arch.', 'मेहराब के ऊपर गहरी निकली हुई पट्टी।', 'ಕಮಾನಿನ ಮೇಲಿನ ಆಳವಾದ ಚಾಚಿದ ಪಟ್ಟಿ.'),
    },
    {
      id: 'attic', group: 'gate', color: '#bb976f', explode: [0, 0.7, 0],
      name: t('Attic', 'ऊपरी भाग (अटारी)', 'ಮೇಲ್ಭಾಗ (ಅಟ್ಟ)'),
      info: t('The block above the cornice, carrying the inscription.', 'कार्निस के ऊपर का खंड, जिस पर अभिलेख है।', 'ಕಾರ್ನಿಸ್ ಮೇಲಿನ ಭಾಗ; ಇದರ ಮೇಲೆ ಶಾಸನವಿದೆ.'),
    },
    {
      id: 'inscription', group: 'gate', color: '#6e563f', explode: [0, 0.7, 0.5],
      name: t('"INDIA" inscription', '"INDIA" अभिलेख', '"INDIA" ಶಾಸನ'),
      info: t('The word INDIA flanked by the dates MCMXIV and MCMXIX (1914 and 1919).', 'INDIA शब्द, दोनों ओर MCMXIV और MCMXIX (1914 और 1919) तिथियाँ।', 'INDIA ಪದ, ಎರಡೂ ಬದಿ MCMXIV ಮತ್ತು MCMXIX (1914 ಮತ್ತು 1919) ದಿನಾಂಕಗಳು.'),
    },
    {
      id: 'tiers', group: 'gate', color: '#b28e67', minor: true, explode: [0, 1, 0],
      name: t('Stepped tiers', 'सीढ़ीदार परतें', 'ಮೆಟ್ಟಿಲು ಪದರಗಳು'),
      info: t('Three receding steps lift the bowl to the top.', 'तीन पीछे हटती सीढ़ियाँ कटोरे को शिखर तक उठाती हैं।', 'ಮೂರು ಹಿಂದೆ ಸರಿಯುವ ಮೆಟ್ಟಿಲುಗಳು ಬಟ್ಟಲನ್ನು ತುದಿಗೆ ಎತ್ತುತ್ತವೆ.'),
    },
    {
      id: 'bowl', group: 'gate', color: '#a7835c', explode: [0, 1.4, 0],
      name: t('Shallow bowl on top', 'शिखर पर उथला कटोरा', 'ತುದಿಯಲ್ಲಿ ಆಳವಿಲ್ಲದ ಬಟ್ಟಲು'),
      info: t('Meant to be filled with burning oil on days of remembrance; 42 m above the ground.', 'स्मृति दिवसों पर जलते तेल से भरने के लिए बना; ज़मीन से 42 मी ऊपर।', 'ಸ್ಮರಣೆಯ ದಿನಗಳಂದು ಉರಿಯುವ ಎಣ್ಣೆ ತುಂಬಲು ಮಾಡಿದ್ದು; ನೆಲದಿಂದ 42 ಮೀ ಎತ್ತರ.'),
    },
    {
      id: 'base', group: 'around', color: '#8a8078', minor: true, explode: [0, -1, 0],
      name: t('Stepped base', 'सीढ़ीदार आधार', 'ಮೆಟ್ಟಿಲು ತಳ'),
      info: t('Granite steps round the foot of the arch.', 'मेहराब के तल के चारों ओर ग्रेनाइट की सीढ़ियाँ।', 'ಕಮಾನಿನ ತಳದ ಸುತ್ತ ಗ್ರಾನೈಟ್ ಮೆಟ್ಟಿಲುಗಳು.'),
    },
    {
      id: 'canopy', group: 'around', color: '#b69470', explode: [0, 0, -1],
      name: t('Canopy (chhatri)', 'छतरी', 'ಛತ್ರಿ'),
      info: t('Behind the arch; since 2022 it shelters a statue of Netaji Subhas Chandra Bose.', 'मेहराब के पीछे; 2022 से इसमें नेताजी सुभाष चंद्र बोस की प्रतिमा है।', 'ಕಮಾನಿನ ಹಿಂದೆ; 2022ರಿಂದ ಇದರಲ್ಲಿ ನೇತಾಜಿ ಸುಭಾಷ್ ಚಂದ್ರ ಬೋಸ್ ಪ್ರತಿಮೆಯಿದೆ.'),
    },
    {
      id: 'lawns', group: 'around', color: '#3c6331', minor: true, matte: true, explode: [0, -1.4, 0],
      name: t('Kartavya Path and lawns', 'कर्तव्य पथ और लॉन', 'ಕರ್ತವ್ಯ ಪಥ ಮತ್ತು ಹುಲ್ಲುಹಾಸು'),
      info: t('The ceremonial avenue runs from here to Rashtrapati Bhavan.', 'यह औपचारिक मार्ग यहाँ से राष्ट्रपति भवन तक जाता है।', 'ಈ ಔಪಚಾರಿಕ ಮಾರ್ಗ ಇಲ್ಲಿಂದ ರಾಷ್ಟ್ರಪತಿ ಭವನದವರೆಗೆ ಸಾಗುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.3, 0.18, 1] },
    { id: 'side', name: t('Side (the small arches)', 'बगल से (छोटे मेहराब)', 'ಪಕ್ಕದಿಂದ (ಸಣ್ಣ ಕಮಾನುಗಳು)'), dir: [1, 0.2, 0.35] },
  ],
  slices: [],
  animations: [],
};
