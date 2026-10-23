// An open-spandrel concrete deck-arch bridge built in code at 1:200 (span
// 80 m, rise 16 m): two parabolic arch ribs, spandrel columns carrying the
// deck, the deck slab, and the abutments (skewbacks) that take the arch's
// thrust, over a river.
import { member, cable } from '../lib/structures.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const SPAN = 0.4;
const RISE = 0.08;
const DECK = RISE + 0.012; // deck level above the springings
const W = 0.05; // between the ribs
const arch = (x) => RISE * (1 - (2 * x / SPAN) ** 2);

export default {
  id: 'arch_bridge',
  version: 1,
  order: 12,
  source: 'procedural',
  subject: 'Engineering',
  classes: [11, 12],
  title: t('Arch bridge', 'मेहराब (आर्च) पुल', 'ಕಮಾನು ಸೇತುವೆ'),
  summary: t(
    'An arch carries load mainly in compression and pushes outwards at its ends (the thrust), so it needs strong abutments. A parabolic arch under an even deck load has no bending.',
    'मेहराब भार मुख्यतः संपीडन में उठाता है और सिरों पर बाहर की ओर धकेलता है (थ्रस्ट), इसलिए उसे मज़बूत अबटमेंट चाहिए। समान डेक भार में परवलयी मेहराब में बंकन नहीं होता।',
    'ಕಮಾನು ಭಾರವನ್ನು ಮುಖ್ಯವಾಗಿ ಸಂಪೀಡನದಲ್ಲಿ ಹೊರುತ್ತದೆ ಮತ್ತು ತುದಿಗಳಲ್ಲಿ ಹೊರಕ್ಕೆ ತಳ್ಳುತ್ತದೆ (ಥ್ರಸ್ಟ್); ಆದ್ದರಿಂದ ಬಲವಾದ ಅಬಟ್‌ಮೆಂಟ್ ಬೇಕು. ಸಮ ಡೆಕ್ ಭಾರದಲ್ಲಿ ಪರವಲಯ ಕಮಾನಿನಲ್ಲಿ ಬಾಗುವಿಕೆ ಇರುವುದಿಲ್ಲ.',
  ),
  keywords: ['arch', 'arch bridge', 'bridge', 'thrust', 'compression', 'parabolic arch', 'spandrel', 'abutment', 'civil engineering', 'concrete bridge'],
  credit: 'Model built by Zynetix (a simplified open-spandrel arch at 1:200)',
  crease: 40,
  build(THREE) {
    const n = 32;
    const ribs = [];
    for (const z of [-W / 2, W / 2]) {
      const pts = Array.from({ length: n + 1 }, (_, i) => {
        const x = -SPAN / 2 + (SPAN * i) / n;
        return [x, arch(x), z];
      });
      // A rib thicker at the springings than at the crown, as built.
      for (let i = 0; i < n; i++) {
        const xm = (pts[i][0] + pts[i + 1][0]) / 2;
        const d = 0.007 + 0.004 * (2 * Math.abs(xm) / SPAN);
        ribs.push(member(THREE, pts[i], pts[i + 1], d, 0.008, [0, 0, 1]));
      }
    }
    // Struts between the ribs.
    for (let i = 2; i < n; i += 4) {
      const x = -SPAN / 2 + (SPAN * i) / n;
      ribs.push(member(THREE, [x, arch(x), -W / 2], [x, arch(x), W / 2], 0.004, 0.004, [1, 0, 0]));
    }
    const columns = [];
    const spacing = SPAN / 10;
    for (let k = -4; k <= 4; k++) {
      const x = k * spacing;
      const y0 = arch(x);
      if (DECK - y0 < 0.012) continue; // near the crown the deck sits on the arch
      for (const z of [-W / 2, W / 2]) columns.push(member(THREE, [x, y0, z], [x, DECK - 0.004, z], 0.005, 0.005));
      columns.push(member(THREE, [x, DECK - 0.006, -W / 2], [x, DECK - 0.006, W / 2], 0.004, 0.005, [1, 0, 0]));
    }
    const deck = [new THREE.BoxGeometry(SPAN + 0.12, 0.005, W + 0.02).translate(0, DECK, 0)];
    for (const z of [-W / 2 - 0.009, W / 2 + 0.009]) deck.push(...cable(THREE, [[-SPAN / 2 - 0.06, DECK + 0.006, z], [SPAN / 2 + 0.06, DECK + 0.006, z]], 0.0012, 6));
    // Skewbacks: concrete blocks set at right angles to the arch's thrust, on rock.
    const abutments = [-1, 1].map((s) => {
      const shape = new THREE.Shape([
        new THREE.Vector2(s * (SPAN / 2 - 0.02), -0.02),
        new THREE.Vector2(s * (SPAN / 2 + 0.06), -0.02),
        new THREE.Vector2(s * (SPAN / 2 + 0.06), DECK - 0.003),
        new THREE.Vector2(s * (SPAN / 2 + 0.01), DECK - 0.003),
        new THREE.Vector2(s * (SPAN / 2 - 0.005), 0.012),
      ]);
      return new THREE.ExtrudeGeometry(shape, { depth: W + 0.03, bevelEnabled: false }).translate(0, 0, -(W + 0.03) / 2);
    });
    const water = [new THREE.BoxGeometry(SPAN - 0.02, 0.004, W + 0.1).translate(0, -0.012, 0)];
    return { arch_ribs: ribs, spandrel_columns: columns, deck, abutments, river: water };
  },
  groups: [
    { id: 'arch', name: t('Arch', 'मेहराब', 'ಕಮಾನು') },
    { id: 'deck', name: t('Deck', 'डेक', 'ಡೆಕ್') },
    { id: 'supports', name: t('Supports and site', 'आधार और स्थल', 'ಆಧಾರ ಮತ್ತು ಸ್ಥಳ') },
  ],
  parts: [
    {
      id: 'arch_ribs', group: 'arch', color: '#b9a88f', explode: [0, -0.4, 1],
      name: t('Arch ribs', 'मेहराब की पसलियाँ', 'ಕಮಾನಿನ ಪಕ್ಕೆಗಳು'),
      info: t('Two parabolic ribs, rise one-fifth of the span. Under an even load they are only in compression, which concrete takes well.', 'दो परवलयी पसलियाँ, ऊँचाई विस्तार का पाँचवाँ भाग। समान भार में ये केवल संपीडन में रहती हैं, जिसे कंक्रीट अच्छी तरह सहता है।', 'ಎರಡು ಪರವಲಯ ಪಕ್ಕೆಗಳು, ಏರಿಕೆ ವ್ಯಾಪ್ತಿಯ ಐದನೇ ಒಂದು. ಸಮ ಭಾರದಲ್ಲಿ ಇವು ಸಂಪೀಡನದಲ್ಲಿ ಮಾತ್ರ; ಕಾಂಕ್ರೀಟ್ ಅದನ್ನು ಚೆನ್ನಾಗಿ ಹೊರುತ್ತದೆ.'),
    },
    {
      id: 'spandrel_columns', group: 'arch', color: '#8d99a6', explode: [0, 0.3, 1],
      name: t('Spandrel columns', 'स्पैंड्रल कॉलम', 'ಸ್ಪ್ಯಾಂಡ್ರೆಲ್ ಕಾಲಮ್‌ಗಳು'),
      info: t('Carry the deck down onto the arch at even spacing; the open spandrel saves weight.', 'डेक का भार समान दूरी पर मेहराब तक पहुँचाते हैं; खुला स्पैंड्रल वज़न बचाता है।', 'ಡೆಕ್ ಭಾರವನ್ನು ಸಮ ಅಂತರದಲ್ಲಿ ಕಮಾನಿಗೆ ಇಳಿಸುತ್ತವೆ; ತೆರೆದ ಸ್ಪ್ಯಾಂಡ್ರೆಲ್ ತೂಕ ಉಳಿಸುತ್ತದೆ.'),
    },
    {
      id: 'deck', group: 'deck', color: '#c9c4ba', explode: [0, 1.2, 0],
      name: t('Deck and railings', 'डेक और रेलिंग', 'ಡೆಕ್ ಮತ್ತು ಕಂಬಿಬೇಲಿ'),
      info: t('The road slab, spanning between the columns.', 'सड़क का स्लैब, कॉलमों के बीच फैला।', 'ಕಾಲಮ್‌ಗಳ ನಡುವೆ ಹರಡಿದ ರಸ್ತೆ ಸ್ಲ್ಯಾಬ್.'),
    },
    {
      id: 'abutments', group: 'supports', color: '#8a7f6e', explode: [0, -0.6, 0],
      name: t('Abutments (skewbacks)', 'अबटमेंट (स्क्यूबैक)', 'ಅಬಟ್‌ಮೆಂಟ್‌ಗಳು (ಸ್ಕ್ಯೂಬ್ಯಾಕ್)'),
      info: t('Take the arch\'s inclined thrust: its horizontal part H = wL²/8h for an even load w over span L with rise h.', 'मेहराब का तिरछा थ्रस्ट सहते हैं: समान भार w, विस्तार L और ऊँचाई h पर क्षैतिज भाग H = wL²/8h।', 'ಕಮಾನಿನ ಓರೆ ಥ್ರಸ್ಟ್ ಹೊರುತ್ತವೆ: ಸಮ ಭಾರ w, ವ್ಯಾಪ್ತಿ L, ಏರಿಕೆ h ಇದ್ದಾಗ ಅಡ್ಡ ಭಾಗ H = wL²/8h.'),
    },
    {
      id: 'river', group: 'supports', color: '#4f8fbf', minor: true, opacity: 0.6, cap: false, explode: [0, -1, 0],
      name: t('River', 'नदी', 'ನದಿ'),
      info: t('An arch spans the whole river with no pier in the water.', 'मेहराब पानी में बिना खंभे के पूरी नदी पार करता है।', 'ಕಮಾನು ನೀರಿನಲ್ಲಿ ಕಂಬವಿಲ್ಲದೆ ಇಡೀ ನದಿಯನ್ನು ದಾಟುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'side', name: t('Side (elevation)', 'बगल से (उन्नयन)', 'ಪಕ್ಕದಿಂದ (ಎತ್ತರ ನೋಟ)'), dir: [0.2, 0.15, 1] },
    { id: 'below', name: t('From below', 'नीचे से', 'ಕೆಳಗಿನಿಂದ'), dir: [0.7, -0.3, 0.8] },
  ],
  slices: [],
  animations: [],
};
