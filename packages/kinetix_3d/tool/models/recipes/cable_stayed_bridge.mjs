// A cable-stayed bridge built in code at 1:1000 (main span 300 m, back spans
// 120 m): two H-shaped pylons, stay cables in a semi-fan straight from the
// pylons to the deck, the box-girder deck and its piers.
import { member, cable } from '../lib/structures.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const MAIN = 0.3;
const SIDE = 0.12;
const PYLON = 0.075; // above the deck
const DECK = 0.03;
const W = 0.028;
const STAYS = 8; // per side of each pylon

export default {
  id: 'cable_stayed_bridge',
  version: 1,
  order: 14,
  source: 'procedural',
  subject: 'Engineering',
  classes: [11, 12],
  title: t('Cable-stayed bridge', 'केबल-स्टे पुल', 'ಕೇಬಲ್-ಸ್ಟೇ ಸೇತುವೆ'),
  summary: t(
    'Straight stay cables run from tall pylons directly to the deck. The stays\' pull squeezes the deck, so the deck works as a long compression member as well as a beam.',
    'सीधे स्टे केबल ऊँचे पायलनों से सीधे डेक तक जाते हैं। स्टे का खिंचाव डेक को दबाता है, इसलिए डेक बीम के साथ-साथ एक लंबे संपीडन सदस्य की तरह भी काम करता है।',
    'ನೇರ ಸ್ಟೇ ಕೇಬಲ್‌ಗಳು ಎತ್ತರದ ಪೈಲಾನ್‌ಗಳಿಂದ ನೇರವಾಗಿ ಡೆಕ್‌ಗೆ ಹೋಗುತ್ತವೆ. ಸ್ಟೇಗಳ ಎಳೆತ ಡೆಕ್ ಅನ್ನು ಒತ್ತುತ್ತದೆ; ಡೆಕ್ ಬೀಮ್ ಜೊತೆಗೆ ಉದ್ದ ಸಂಪೀಡನ ಸದಸ್ಯದಂತೆಯೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ.',
  ),
  keywords: ['cable-stayed bridge', 'cable stayed', 'bridge', 'pylon', 'stay cable', 'fan', 'harp', 'tension', 'compression', 'civil engineering', 'bandra-worli sea link'],
  credit: 'Model built by Zynetix (a simplified cable-stayed bridge at 1:1000)',
  crease: 40,
  build(THREE) {
    const a = MAIN / 2;
    const stays = [], pylons = [], deck = [], piers = [];
    for (const s of [-1, 1]) {
      const x = s * a;
      for (const z of [-W / 2, W / 2]) {
        pylons.push(member(THREE, [x, 0, z * 1.4], [x, DECK - 0.002, z], 0.006, 0.006));
        pylons.push(member(THREE, [x, DECK - 0.002, z], [x, DECK + PYLON, z], 0.006, 0.006));
        // Semi-fan: anchors spread down the top of the pylon, out to even points on the deck.
        for (let i = 1; i <= STAYS; i++) {
          const yTop = DECK + PYLON - 0.003 - (i - 1) * 0.004;
          for (const dir of [-1, 1]) {
            const reach = dir === s ? SIDE - 0.01 : a - 0.004;
            const xd = x + dir * (reach * i) / STAYS;
            stays.push(...cable(THREE, [[x, yTop, z], [xd, DECK + 0.002, z]], 0.0004, 4));
          }
        }
      }
      for (const y of [DECK + PYLON - 0.002, DECK - 0.006]) pylons.push(member(THREE, [x, y, -W / 2], [x, y, W / 2], 0.005, 0.005, [1, 0, 0]));
      pylons.push(new THREE.BoxGeometry(0.02, 0.008, W * 1.4 + 0.016).translate(x, -0.004, 0));
      // End piers under the back spans.
      for (const xp of [s * (a + SIDE), s * (a + SIDE / 2)]) piers.push(member(THREE, [xp, -0.004, 0], [xp, DECK - 0.003, 0], 0.006, 0.012, [0, 0, 1]));
    }
    // A streamlined box girder: wide flat top, sloping webs.
    const half = W / 2 + 0.003;
    const section = new THREE.Shape([[-half, 0.0035], [half, 0.0035], [half - 0.002, -0.002], [-half + 0.002, -0.002]].map(([z, y]) => new THREE.Vector2(z, y)));
    const L = 2 * (a + SIDE);
    deck.push(new THREE.ExtrudeGeometry(section, { depth: L, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-L / 2, DECK, 0));
    const water = [new THREE.BoxGeometry(L + 0.04, 0.003, 0.12).translate(0, -0.002, 0)];
    return { stay_cables: stays, pylons, deck, piers, water };
  },
  groups: [
    { id: 'cables', name: t('Stays and pylons', 'स्टे और पायलन', 'ಸ್ಟೇ ಮತ್ತು ಪೈಲಾನ್‌ಗಳು') },
    { id: 'deck', name: t('Deck and piers', 'डेक और खंभे', 'ಡೆಕ್ ಮತ್ತು ಕಂಬಗಳು') },
  ],
  parts: [
    {
      id: 'stay_cables', group: 'cables', color: '#d35400', metal: true, explode: [0, 1, 0.6],
      name: t('Stay cables (tension)', 'स्टे केबल (तनाव)', 'ಸ್ಟೇ ಕೇಬಲ್‌ಗಳು (ಸೆಳೆತ)'),
      info: t('Each stay holds up one stretch of deck straight from the pylon; a stay can be replaced one at a time.', 'हर स्टे डेक के एक हिस्से को सीधे पायलन से थामता है; स्टे एक-एक करके बदले जा सकते हैं।', 'ಪ್ರತಿ ಸ್ಟೇ ಡೆಕ್‌ನ ಒಂದು ಭಾಗವನ್ನು ನೇರವಾಗಿ ಪೈಲಾನ್‌ನಿಂದ ಹಿಡಿಯುತ್ತದೆ; ಸ್ಟೇಗಳನ್ನು ಒಂದೊಂದಾಗಿ ಬದಲಿಸಬಹುದು.'),
    },
    {
      id: 'pylons', group: 'cables', color: '#95a5a6', explode: [0, 0.3, -1],
      name: t('Pylons (compression)', 'पायलन (संपीडन)', 'ಪೈಲಾನ್‌ಗಳು (ಸಂಪೀಡನ)'),
      info: t('The stays on the two sides pull against each other, so the pylon is mostly pushed straight down.', 'दोनों ओर के स्टे एक-दूसरे के विरुद्ध खींचते हैं, इसलिए पायलन पर मुख्यतः सीधा नीचे दबाव पड़ता है।', 'ಎರಡೂ ಬದಿಯ ಸ್ಟೇಗಳು ಪರಸ್ಪರ ವಿರುದ್ಧ ಎಳೆಯುತ್ತವೆ; ಪೈಲಾನ್ ಮುಖ್ಯವಾಗಿ ನೇರ ಕೆಳಗೆ ಒತ್ತಲ್ಪಡುತ್ತದೆ.'),
    },
    {
      id: 'deck', group: 'deck', color: '#bdb6a8', explode: [0, -1, 0],
      name: t('Box-girder deck', 'बॉक्स-गर्डर डेक', 'ಬಾಕ್ಸ್-ಗರ್ಡರ್ ಡೆಕ್'),
      info: t('A streamlined box that resists twisting and wind; the horizontal parts of the stay forces squeeze it towards the pylons.', 'सुव्यवस्थित बॉक्स जो मरोड़ और हवा का प्रतिरोध करता है; स्टे बलों के क्षैतिज भाग उसे पायलनों की ओर दबाते हैं।', 'ತಿರುಚು ಮತ್ತು ಗಾಳಿಯನ್ನು ಎದುರಿಸುವ ನಯವಾದ ಬಾಕ್ಸ್; ಸ್ಟೇ ಬಲಗಳ ಅಡ್ಡ ಭಾಗಗಳು ಅದನ್ನು ಪೈಲಾನ್‌ಗಳ ಕಡೆಗೆ ಒತ್ತುತ್ತವೆ.'),
    },
    {
      id: 'piers', group: 'deck', color: '#7f8c8d', minor: true, explode: [0, -1.4, 0],
      name: t('Back-span piers', 'पिछले विस्तार के खंभे', 'ಹಿಂದಿನ ವ್ಯಾಪ್ತಿಯ ಕಂಬಗಳು'),
      info: t('Hold the back spans down and up; they balance the main span\'s pull on the pylons.', 'पिछले विस्तारों को थामते हैं; ये पायलनों पर मुख्य विस्तार के खिंचाव को संतुलित करते हैं।', 'ಹಿಂದಿನ ವ್ಯಾಪ್ತಿಗಳನ್ನು ಹಿಡಿಯುತ್ತವೆ; ಪೈಲಾನ್‌ಗಳ ಮೇಲಿನ ಮುಖ್ಯ ವ್ಯಾಪ್ತಿಯ ಎಳೆತವನ್ನು ಸಮತೋಲನಗೊಳಿಸುತ್ತವೆ.'),
    },
    {
      id: 'water', group: 'deck', color: '#4f8fbf', minor: true, opacity: 0.6, cap: false, explode: [0, -1.6, 0],
      name: t('Water', 'पानी', 'ನೀರು'),
      info: t('Cable-stayed bridges suit spans of about 200–1000 m, like sea links.', 'केबल-स्टे पुल लगभग 200–1000 m के विस्तार के लिए उपयुक्त हैं, जैसे सी-लिंक।', 'ಕೇಬಲ್-ಸ್ಟೇ ಸೇತುವೆಗಳು ಸುಮಾರು 200–1000 m ವ್ಯಾಪ್ತಿಗೆ ಸೂಕ್ತ, ಸೀ-ಲಿಂಕ್‌ಗಳಂತೆ.'),
    },
  ],
  views: [
    { id: 'side', name: t('Side (elevation)', 'बगल से (उन्नयन)', 'ಪಕ್ಕದಿಂದ (ಎತ್ತರ ನೋಟ)'), dir: [0.2, 0.2, 1] },
    { id: 'deck', name: t('Along the deck', 'डेक के साथ', 'ಡೆಕ್ ಉದ್ದಕ್ಕೂ'), dir: [1, 0.3, 0.35] },
  ],
  slices: [],
  animations: [],
};
