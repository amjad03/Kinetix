// A steel through-truss bridge (Pratt truss, six panels) built in code at
// 1:100 (span 36 m, 6 m deep, deck 6 m wide): two trusses, the deck on cross
// girders and stringers, the top bracing and portals, and the abutments with
// a pin bearing at one end and a roller at the other.
import { member } from '../lib/structures.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const SPAN = 0.36;
const PANELS = 6;
const H = 0.06;
const W = 0.06; // between the trusses
const P = SPAN / PANELS;
const S = 0.004; // member section

export default {
  id: 'truss_bridge',
  version: 1,
  order: 11,
  source: 'procedural',
  subject: 'Engineering',
  classes: [11, 12],
  title: t('Truss bridge (Pratt)', 'ट्रस पुल (प्रैट)', 'ಟ್ರಸ್ ಸೇತುವೆ (ಪ್ರ್ಯಾಟ್)'),
  summary: t(
    'A truss is made of straight members joined in triangles, so each member is only pulled or pushed. In a Pratt truss the diagonals are in tension and the verticals in compression.',
    'ट्रस सीधे सदस्यों को त्रिभुजों में जोड़कर बनता है, इसलिए हर सदस्य केवल खिंचता या दबता है। प्रैट ट्रस में तिरछे सदस्य तनाव में और खड़े सदस्य संपीडन में होते हैं।',
    'ಟ್ರಸ್ ನೇರ ಸದಸ್ಯಗಳನ್ನು ತ್ರಿಕೋನಗಳಾಗಿ ಜೋಡಿಸಿ ಮಾಡಿದ್ದು, ಪ್ರತಿ ಸದಸ್ಯ ಎಳೆಯಲ್ಪಡುತ್ತದೆ ಅಥವಾ ತಳ್ಳಲ್ಪಡುತ್ತದೆ ಅಷ್ಟೇ. ಪ್ರ್ಯಾಟ್ ಟ್ರಸ್‌ನಲ್ಲಿ ಓರೆ ಸದಸ್ಯಗಳು ಸೆಳೆತದಲ್ಲಿ, ಲಂಬ ಸದಸ್ಯಗಳು ಸಂಪೀಡನದಲ್ಲಿ ಇರುತ್ತವೆ.',
  ),
  keywords: ['truss', 'truss bridge', 'pratt truss', 'bridge', 'tension', 'compression', 'member', 'chord', 'civil engineering', 'steel bridge', 'method of joints'],
  credit: 'Model built by Zynetix (a simplified Pratt through-truss at 1:100)',
  crease: 40,
  build(THREE) {
    const xs = Array.from({ length: PANELS + 1 }, (_, i) => -SPAN / 2 + i * P);
    const top = [], bottom = [], verticals = [], diagonals = [], bracing = [], deck = [];
    for (const z of [-W / 2, W / 2]) {
      // End posts slope from the bearings up to the first top joints; the top chord runs between.
      bottom.push(member(THREE, [xs[0], 0, z], [xs[PANELS], 0, z], S * 1.2, S * 1.4));
      top.push(member(THREE, [xs[1], H, z], [xs[PANELS - 1], H, z], S * 1.3, S * 1.3));
      top.push(member(THREE, [xs[0], 0, z], [xs[1], H, z], S * 1.3, S * 1.3));
      top.push(member(THREE, [xs[PANELS], 0, z], [xs[PANELS - 1], H, z], S * 1.3, S * 1.3));
      for (let i = 1; i < PANELS; i++) verticals.push(member(THREE, [xs[i], 0, z], [xs[i], H, z], S, S));
      // Pratt: the diagonals slope down towards the middle.
      for (let i = 1; i < PANELS / 2; i++) diagonals.push(member(THREE, [xs[i], H, z], [xs[i + 1], 0, z], S * 0.8, S * 0.8));
      for (let i = PANELS / 2; i < PANELS - 1; i++) diagonals.push(member(THREE, [xs[i + 1], H, z], [xs[i], 0, z], S * 0.8, S * 0.8));
    }
    for (let i = 1; i < PANELS; i++) {
      // Top struts and X bracing between the trusses, and a cross girder under each joint.
      bracing.push(member(THREE, [xs[i], H, -W / 2], [xs[i], H, W / 2], S * 0.8, S * 0.8, [1, 0, 0]));
      if (i < PANELS - 1) {
        bracing.push(member(THREE, [xs[i], H, -W / 2], [xs[i + 1], H, W / 2], S * 0.4, S * 0.4));
        bracing.push(member(THREE, [xs[i], H, W / 2], [xs[i + 1], H, -W / 2], S * 0.4, S * 0.4));
      }
    }
    for (const i of [1, PANELS - 1]) {
      // Portal bracing at each end, under the first top strut.
      bracing.push(member(THREE, [xs[i], H - 0.012, -W / 2], [xs[i], H - 0.012, W / 2], S * 0.6, S * 0.6, [1, 0, 0]));
    }
    for (const x of xs) deck.push(member(THREE, [x, -0.003, -W / 2], [x, -0.003, W / 2], S, S * 1.4, [1, 0, 0]));
    for (const z of [-W / 4, 0, W / 4]) deck.push(member(THREE, [xs[0], 0.0005, z], [xs[PANELS], 0.0005, z], S * 0.6, S * 0.8, [0, 0, 1]));
    deck.push(new THREE.BoxGeometry(SPAN, 0.002, W - S).translate(0, 0.0035, 0));
    // Abutments and bearings: a pin (left) and a roller (right) under each truss.
    const abutments = [-1, 1].map((s) => new THREE.BoxGeometry(0.05, 0.05, W + 0.04).translate(s * (SPAN / 2 + 0.015), -0.033, 0));
    const bearings = [];
    for (const z of [-W / 2, W / 2]) {
      bearings.push(new THREE.ConeGeometry(0.006, 0.006, 4).rotateY(Math.PI / 4).translate(xs[0], -0.0055, z));
      bearings.push(new THREE.CylinderGeometry(0.0025, 0.0025, 0.008, 12).rotateX(Math.PI / 2).translate(xs[PANELS], -0.0055, z));
    }
    return { top_chords: top, bottom_chords: bottom, verticals, diagonals, bracing, deck, bearings, abutments };
  },
  groups: [
    { id: 'truss', name: t('Trusses', 'ट्रस', 'ಟ್ರಸ್‌ಗಳು') },
    { id: 'deck', name: t('Deck and bracing', 'डेक और ब्रेसिंग', 'ಡೆಕ್ ಮತ್ತು ಬ್ರೇಸಿಂಗ್') },
    { id: 'supports', name: t('Supports', 'आधार', 'ಆಧಾರಗಳು') },
  ],
  parts: [
    {
      id: 'top_chords', group: 'truss', color: '#c0392b', metal: true, explode: [0, 1, 0],
      name: t('Top chords and end posts (compression)', 'ऊपरी कॉर्ड और सिरे के स्तंभ (संपीडन)', 'ಮೇಲಿನ ಕಾರ್ಡ್ ಮತ್ತು ಕೊನೆಯ ಕಂಬಗಳು (ಸಂಪೀಡನ)'),
      info: t('The top chord is squeezed as the bridge sags under load, so it is made heavy enough not to buckle.', 'भार से पुल झुकने पर ऊपरी कॉर्ड दबता है, इसलिए उसे इतना भारी बनाया जाता है कि वह मुड़कर न टूटे (बकलिंग)।', 'ಭಾರದಿಂದ ಸೇತುವೆ ಬಾಗಿದಾಗ ಮೇಲಿನ ಕಾರ್ಡ್ ಒತ್ತಲ್ಪಡುತ್ತದೆ; ಅದು ಬಕಲ್ ಆಗದಷ್ಟು ಗಟ್ಟಿಯಾಗಿ ಮಾಡಲಾಗುತ್ತದೆ.'),
    },
    {
      id: 'bottom_chords', group: 'truss', color: '#1f5fa8', metal: true, explode: [0, -0.6, 0],
      name: t('Bottom chords (tension)', 'निचले कॉर्ड (तनाव)', 'ಕೆಳಗಿನ ಕಾರ್ಡ್‌ಗಳು (ಸೆಳೆತ)'),
      info: t('The bottom chord is pulled, like the bottom of a bending beam.', 'निचला कॉर्ड खिंचता है, जैसे मुड़ती बीम का निचला भाग।', 'ಬಾಗುವ ಬೀಮ್‌ನ ಕೆಳಭಾಗದಂತೆ ಕೆಳಗಿನ ಕಾರ್ಡ್ ಎಳೆಯಲ್ಪಡುತ್ತದೆ.'),
    },
    {
      id: 'verticals', group: 'truss', color: '#e07a5f', metal: true, explode: [0, 0.3, 1],
      name: t('Verticals (compression)', 'खड़े सदस्य (संपीडन)', 'ಲಂಬ ಸದಸ್ಯಗಳು (ಸಂಪೀಡನ)'),
      info: t('In a Pratt truss the verticals push, carrying the deck load up to the top joints.', 'प्रैट ट्रस में खड़े सदस्य दबाव में रहते हैं और डेक का भार ऊपरी जोड़ों तक ले जाते हैं।', 'ಪ್ರ್ಯಾಟ್ ಟ್ರಸ್‌ನಲ್ಲಿ ಲಂಬ ಸದಸ್ಯಗಳು ತಳ್ಳುತ್ತವೆ, ಡೆಕ್ ಭಾರವನ್ನು ಮೇಲಿನ ಕೀಲುಗಳಿಗೆ ಒಯ್ಯುತ್ತವೆ.'),
    },
    {
      id: 'diagonals', group: 'truss', color: '#4a90d9', metal: true, explode: [0, 0.3, -1],
      name: t('Diagonals (tension)', 'तिरछे सदस्य (तनाव)', 'ಓರೆ ಸದಸ್ಯಗಳು (ಸೆಳೆತ)'),
      info: t('Sloping down towards the middle, the diagonals are pulled; long thin members are fine in tension.', 'बीच की ओर नीचे झुके तिरछे सदस्य खिंचते हैं; तनाव में लंबे पतले सदस्य ठीक रहते हैं।', 'ಮಧ್ಯದ ಕಡೆಗೆ ಇಳಿಜಾರಾದ ಓರೆ ಸದಸ್ಯಗಳು ಎಳೆಯಲ್ಪಡುತ್ತವೆ; ಸೆಳೆತದಲ್ಲಿ ಉದ್ದ ತೆಳು ಸದಸ್ಯಗಳು ಸಾಕು.'),
    },
    {
      id: 'bracing', group: 'deck', color: '#7f8c8d', metal: true, minor: true, explode: [0, 1.5, 0],
      name: t('Top bracing and portals', 'ऊपरी ब्रेसिंग और पोर्टल', 'ಮೇಲಿನ ಬ್ರೇಸಿಂಗ್ ಮತ್ತು ಪೋರ್ಟಲ್‌ಗಳು'),
      info: t('Ties the two trusses together against wind and stops the top chords buckling sideways.', 'दोनों ट्रसों को हवा के विरुद्ध आपस में बाँधती है और ऊपरी कॉर्ड को बगल में मुड़ने से रोकती है।', 'ಎರಡು ಟ್ರಸ್‌ಗಳನ್ನು ಗಾಳಿಯ ವಿರುದ್ಧ ಕಟ್ಟಿ ಮೇಲಿನ ಕಾರ್ಡ್ ಪಕ್ಕಕ್ಕೆ ಬಕಲ್ ಆಗದಂತೆ ತಡೆಯುತ್ತದೆ.'),
    },
    {
      id: 'deck', group: 'deck', color: '#b9b2a4', explode: [0, -1.2, 0],
      name: t('Deck, stringers and cross girders', 'डेक, स्ट्रिंगर और क्रॉस गर्डर', 'ಡೆಕ್, ಸ್ಟ್ರಿಂಗರ್ ಮತ್ತು ಅಡ್ಡ ಗರ್ಡರ್‌ಗಳು'),
      info: t('The road rests on stringers, which rest on cross girders hung at the truss joints, so loads reach the truss only at its joints.', 'सड़क स्ट्रिंगरों पर, और स्ट्रिंगर ट्रस के जोड़ों पर लगे क्रॉस गर्डरों पर टिके होते हैं, इसलिए भार ट्रस पर केवल जोड़ों पर आता है।', 'ರಸ್ತೆ ಸ್ಟ್ರಿಂಗರ್‌ಗಳ ಮೇಲೆ, ಅವು ಟ್ರಸ್ ಕೀಲುಗಳಲ್ಲಿನ ಅಡ್ಡ ಗರ್ಡರ್‌ಗಳ ಮೇಲೆ ಕೂರುತ್ತವೆ; ಹೀಗಾಗಿ ಭಾರ ಟ್ರಸ್‌ಗೆ ಕೀಲುಗಳಲ್ಲಿ ಮಾತ್ರ ಬರುತ್ತದೆ.'),
    },
    {
      id: 'bearings', group: 'supports', color: '#34495e', metal: true, minor: true, explode: [0, -1.6, 0],
      name: t('Bearings (pin and roller)', 'बेयरिंग (पिन और रोलर)', 'ಬೇರಿಂಗ್‌ಗಳು (ಪಿನ್ ಮತ್ತು ರೋಲರ್)'),
      info: t('A pin at one end and a roller at the other: the bridge can grow and shrink with heat without pushing the abutments.', 'एक सिरे पर पिन और दूसरे पर रोलर: पुल गर्मी से फैल-सिकुड़ सकता है और आधारों को नहीं धकेलता।', 'ಒಂದು ತುದಿಯಲ್ಲಿ ಪಿನ್, ಇನ್ನೊಂದರಲ್ಲಿ ರೋಲರ್: ಶಾಖದಿಂದ ಸೇತುವೆ ಹಿಗ್ಗಿ ಕುಗ್ಗಿದರೂ ಆಧಾರಗಳನ್ನು ತಳ್ಳುವುದಿಲ್ಲ.'),
    },
    {
      id: 'abutments', group: 'supports', color: '#9e9483', explode: [0, -1, 0],
      name: t('Abutments', 'अबटमेंट', 'ಅಬಟ್‌ಮೆಂಟ್‌ಗಳು'),
      info: t('The end supports that carry the reactions into the ground and hold back the embankment.', 'सिरे के आधार जो प्रतिक्रिया बल ज़मीन तक पहुँचाते हैं और तटबंध की मिट्टी रोकते हैं।', 'ಪ್ರತಿಕ್ರಿಯಾ ಬಲಗಳನ್ನು ನೆಲಕ್ಕೆ ಒಯ್ದು ದಂಡೆಯ ಮಣ್ಣನ್ನು ತಡೆಯುವ ಕೊನೆಯ ಆಧಾರಗಳು.'),
    },
  ],
  views: [
    { id: 'side', name: t('Side (elevation)', 'बगल से (उन्नयन)', 'ಪಕ್ಕದಿಂದ (ಎತ್ತರ ನೋಟ)'), dir: [0.15, 0.2, 1] },
    { id: 'portal', name: t('Down the deck', 'डेक के साथ', 'ಡೆಕ್ ಉದ್ದಕ್ಕೂ'), dir: [1, 0.35, 0.4] },
  ],
  slices: [],
  animations: [],
};
