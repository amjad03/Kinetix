// A suspension bridge built in code at 1:1000 (main span 400 m, side spans
// 120 m, towers 60 m above the deck): two towers, two main cables hanging in a
// parabola, vertical hangers, the stiffened deck and the anchorages that hold
// the cables' pull.
import { member, cable } from '../lib/structures.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const MAIN = 0.4;
const SIDE = 0.12;
const TOWER = 0.06; // above the deck
const SAG = 0.05; // main cable sag (1/8 of the span)
const W = 0.026;
const DECK = 0.03; // deck above the water
const HANG = 0.02; // hanger spacing

/** The main cable's height above the deck at [x]: a parabola in the main span, straight-ish back spans. */
function cableY(x) {
  const a = MAIN / 2;
  if (Math.abs(x) <= a) return TOWER - SAG * (1 - (x / a) ** 2);
  // Side spans: a flatter curve from the tower top down to the anchorage at deck level.
  const u = (Math.abs(x) - a) / SIDE;
  return TOWER * (1 - u) - 0.012 * Math.sin(Math.PI * u);
}

export default {
  id: 'suspension_bridge',
  version: 1,
  order: 13,
  source: 'procedural',
  subject: 'Engineering',
  classes: [11, 12],
  title: t('Suspension bridge', 'झूला (सस्पेंशन) पुल', 'ತೂಗು ಸೇತುವೆ'),
  summary: t(
    'The deck hangs from vertical hangers on two main cables, which pass over the towers and are held in heavy anchorages. The cables are in tension, the towers in compression.',
    'डेक खड़े हैंगरों से दो मुख्य केबलों पर लटका होता है, जो टावरों के ऊपर से गुज़रकर भारी एंकरेज में बँधे होते हैं। केबल तनाव में और टावर संपीडन में होते हैं।',
    'ಡೆಕ್ ಲಂಬ ಹ್ಯಾಂಗರ್‌ಗಳ ಮೂಲಕ ಎರಡು ಮುಖ್ಯ ಕೇಬಲ್‌ಗಳಿಂದ ತೂಗುತ್ತದೆ; ಕೇಬಲ್‌ಗಳು ಗೋಪುರಗಳ ಮೇಲೆ ಹಾದು ಭಾರವಾದ ಆಂಕರೇಜ್‌ಗಳಲ್ಲಿ ಬಂಧಿಸಲ್ಪಟ್ಟಿವೆ. ಕೇಬಲ್‌ಗಳು ಸೆಳೆತದಲ್ಲಿ, ಗೋಪುರಗಳು ಸಂಪೀಡನದಲ್ಲಿ.',
  ),
  keywords: ['suspension bridge', 'bridge', 'cable', 'hanger', 'tower', 'anchorage', 'tension', 'parabola', 'sag', 'civil engineering', 'howrah', 'golden gate'],
  credit: 'Model built by KINETIX (a simplified suspension bridge at 1:1000)',
  crease: 40,
  build(THREE) {
    const a = MAIN / 2;
    const ends = a + SIDE;
    const cables = [], hangers = [], towers = [], deck = [], anchorages = [];
    for (const z of [-W / 2, W / 2]) {
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const x = -ends + (2 * ends * i) / 60;
        pts.push([x, DECK + cableY(x), z]);
      }
      // Keep the tower tops exactly on the cable.
      pts.push([-a, DECK + TOWER, z], [a, DECK + TOWER, z]);
      pts.sort((p, q) => p[0] - q[0]);
      cables.push(...cable(THREE, pts, 0.0012, 8));
      for (let x = -ends + HANG; x < ends - HANG / 2; x += HANG) {
        if (Math.abs(Math.abs(x) - a) < HANG / 2) continue;
        const y = DECK + cableY(x);
        if (y - DECK < 0.004) continue;
        hangers.push(...cable(THREE, [[x, DECK + 0.002, z], [x, y, z]], 0.0004, 4));
      }
    }
    for (const s of [-1, 1]) {
      // A portal tower: two legs from the pier, two cross beams.
      const x = s * a;
      for (const z of [-W / 2, W / 2]) towers.push(member(THREE, [x, 0, z], [x, DECK + TOWER + 0.003, z], 0.005, 0.006));
      for (const y of [DECK + TOWER - 0.004, DECK + TOWER * 0.5, DECK - 0.004]) towers.push(member(THREE, [x, y, -W / 2], [x, y, W / 2], 0.004, 0.004, [1, 0, 0]));
      towers.push(new THREE.BoxGeometry(0.02, 0.008, W + 0.016).translate(x, -0.004, 0));
      // Anchorage blocks where the cables end.
      anchorages.push(new THREE.BoxGeometry(0.03, 0.03, W + 0.02).translate(s * (ends + 0.01), DECK - 0.006, 0));
    }
    deck.push(new THREE.BoxGeometry(2 * ends, 0.0025, W + 0.004).translate(0, DECK + 0.001, 0));
    // The stiffening truss under the road, drawn as two girders.
    for (const z of [-W / 2, W / 2]) deck.push(member(THREE, [-ends, DECK - 0.002, z], [ends, DECK - 0.002, z], 0.002, 0.004, [0, 0, 1]));
    const water = [new THREE.BoxGeometry(2 * ends + 0.04, 0.003, 0.12).translate(0, -0.002, 0)];
    return { main_cables: cables, hangers, towers, deck, anchorages, water };
  },
  groups: [
    { id: 'cables', name: t('Cables', 'केबल', 'ಕೇಬಲ್‌ಗಳು') },
    { id: 'structure', name: t('Towers and deck', 'टावर और डेक', 'ಗೋಪುರಗಳು ಮತ್ತು ಡೆಕ್') },
    { id: 'site', name: t('Anchorages and site', 'एंकरेज और स्थल', 'ಆಂಕರೇಜ್ ಮತ್ತು ಸ್ಥಳ') },
  ],
  parts: [
    {
      id: 'main_cables', group: 'cables', color: '#c0392b', metal: true, explode: [0, 1, 0],
      name: t('Main cables (tension)', 'मुख्य केबल (तनाव)', 'ಮುಖ್ಯ ಕೇಬಲ್‌ಗಳು (ಸೆಳೆತ)'),
      info: t('Thousands of steel wires bundled together. Under an even load the cable hangs in a parabola; its horizontal pull is H = wL²/8d (d = sag).', 'हज़ारों स्टील तारों का गुच्छा। समान भार में केबल परवलय में लटकता है; इसका क्षैतिज खिंचाव H = wL²/8d (d = झोल)।', 'ಸಾವಿರಾರು ಉಕ್ಕಿನ ತಂತಿಗಳ ಕಟ್ಟು. ಸಮ ಭಾರದಲ್ಲಿ ಕೇಬಲ್ ಪರವಲಯದಲ್ಲಿ ತೂಗುತ್ತದೆ; ಅಡ್ಡ ಎಳೆತ H = wL²/8d (d = ಜೋತು).'),
    },
    {
      id: 'hangers', group: 'cables', color: '#e59866', metal: true, minor: true, explode: [0, 0.6, 1],
      name: t('Hangers (suspenders)', 'हैंगर (सस्पेंडर)', 'ಹ್ಯಾಂಗರ್‌ಗಳು (ಸಸ್ಪೆಂಡರ್)'),
      info: t('Vertical rods that hang the deck from the main cables.', 'खड़ी छड़ें जो डेक को मुख्य केबलों से लटकाती हैं।', 'ಡೆಕ್ ಅನ್ನು ಮುಖ್ಯ ಕೇಬಲ್‌ಗಳಿಂದ ತೂಗಿಸುವ ಲಂಬ ಸರಳುಗಳು.'),
    },
    {
      id: 'towers', group: 'structure', color: '#8e9aa6', explode: [0, 0, -1],
      name: t('Towers (compression)', 'टावर (संपीडन)', 'ಗೋಪುರಗಳು (ಸಂಪೀಡನ)'),
      info: t('The cables rest in saddles on top; the towers carry the cables\' downward pull to the foundations.', 'केबल ऊपर सैडल पर टिके होते हैं; टावर केबलों का नीचे का बल नींव तक ले जाते हैं।', 'ಕೇಬಲ್‌ಗಳು ಮೇಲಿನ ಸ್ಯಾಡಲ್‌ಗಳಲ್ಲಿ ಕೂರುತ್ತವೆ; ಗೋಪುರಗಳು ಕೇಬಲ್‌ಗಳ ಕೆಳಮುಖ ಬಲವನ್ನು ಅಡಿಪಾಯಕ್ಕೆ ಒಯ್ಯುತ್ತವೆ.'),
    },
    {
      id: 'deck', group: 'structure', color: '#b9b2a4', explode: [0, -1, 0],
      name: t('Deck and stiffening girders', 'डेक और स्टिफ़निंग गर्डर', 'ಡೆಕ್ ಮತ್ತು ಗಟ್ಟಿಗೊಳಿಸುವ ಗರ್ಡರ್‌ಗಳು'),
      info: t('Stiffening girders spread moving loads over many hangers and stop the deck twisting in wind.', 'स्टिफ़निंग गर्डर चलते भार को कई हैंगरों पर फैलाते हैं और हवा में डेक को मरोड़ने से रोकते हैं।', 'ಗಟ್ಟಿಗೊಳಿಸುವ ಗರ್ಡರ್‌ಗಳು ಚಲಿಸುವ ಭಾರವನ್ನು ಹಲವು ಹ್ಯಾಂಗರ್‌ಗಳಿಗೆ ಹರಡಿ ಗಾಳಿಯಲ್ಲಿ ಡೆಕ್ ತಿರುಚದಂತೆ ತಡೆಯುತ್ತವೆ.'),
    },
    {
      id: 'anchorages', group: 'site', color: '#7d7466', explode: [0, -0.4, 0],
      name: t('Anchorages', 'एंकरेज', 'ಆಂಕರೇಜ್‌ಗಳು'),
      info: t('Huge concrete blocks set in the ground that hold the ends of the cables against their pull.', 'ज़मीन में बने विशाल कंक्रीट खंड जो केबलों के सिरों को उनके खिंचाव के विरुद्ध थामते हैं।', 'ಕೇಬಲ್ ತುದಿಗಳನ್ನು ಅವುಗಳ ಎಳೆತದ ವಿರುದ್ಧ ಹಿಡಿಯುವ ನೆಲದಲ್ಲಿನ ದೊಡ್ಡ ಕಾಂಕ್ರೀಟ್ ಬ್ಲಾಕ್‌ಗಳು.'),
    },
    {
      id: 'water', group: 'site', color: '#4f8fbf', minor: true, opacity: 0.6, cap: false, explode: [0, -1.2, 0],
      name: t('Water', 'पानी', 'ನೀರು'),
      info: t('Suspension bridges make the longest spans, over wide rivers and sea straits.', 'झूला पुल सबसे लंबे विस्तार बनाते हैं, चौड़ी नदियों और समुद्री जलडमरूमध्यों पर।', 'ತೂಗು ಸೇತುವೆಗಳು ಅಗಲ ನದಿ ಮತ್ತು ಜಲಸಂಧಿಗಳ ಮೇಲೆ ಅತಿ ಉದ್ದದ ವ್ಯಾಪ್ತಿ ಮಾಡುತ್ತವೆ.'),
    },
  ],
  views: [
    { id: 'side', name: t('Side (elevation)', 'बगल से (उन्नयन)', 'ಪಕ್ಕದಿಂದ (ಎತ್ತರ ನೋಟ)'), dir: [0.15, 0.15, 1] },
    { id: 'deck', name: t('Along the deck', 'डेक के साथ', 'ಡೆಕ್ ಉದ್ದಕ್ಕೂ'), dir: [1, 0.3, 0.35] },
  ],
  slices: [],
  animations: [],
};
