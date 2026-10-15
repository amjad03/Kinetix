// The Qutub Minar, Delhi (begun about 1199), drawn by ZYNETIX from its
// published measurements: 72.5 m high in five storeys, 14.3 m across at the
// base and 2.7 m at the top. The first three storeys are red sandstone with
// different flutes (round and angular, round, angular), the top two marble
// and sandstone; each storey ends in a balcony on brackets. A simplified
// model: the carved bands of inscriptions are shown as plain bands.
import { flutedStorey } from '../lib/architecture.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

// Flute shapes round the circumference, u from 0 to 1.
const round = (n, d) => (u) => d * Math.abs(Math.sin(Math.PI * n * u));
const angular = (n, d) => (u) => d * (1 - Math.abs(((n * u) % 1) * 2 - 1));
const mixed = (n, d) => (u) => {
  const k = Math.floor(n * u);
  return k % 2 ? d * (1 - Math.abs(((n * u) % 1) * 2 - 1)) : d * Math.abs(Math.sin(Math.PI * n * u));
};

// [bottom, top, radius at bottom, radius at top, flutes, part]
const STOREYS = [
  [0, 29.5, 7.15, 5.9, mixed(24, 0.075), 'storey1'],
  [30.6, 46.1, 5.55, 4.75, round(20, 0.08), 'storey2'],
  [47.2, 58.6, 4.45, 3.95, angular(20, 0.085), 'storey3'],
  [59.7, 66.4, 3.7, 3.4, () => 0, 'storey4'],
  [67.5, 72.5, 3.15, 2.75, round(16, 0.05), 'storey5'],
];

export default {
  id: 'qutub_minar',
  version: 1,
  order: 2,
  source: 'procedural',
  subject: 'History',
  classes: [6, 7, 12],
  title: t('Qutub Minar, Delhi', 'क़ुतुब मीनार, दिल्ली', 'ಕುತುಬ್ ಮಿನಾರ್, ದೆಹಲಿ'),
  summary: t(
    'The tallest brick-and-stone minaret of its time, 72.5 m high, begun by Qutb-ud-din Aibak around 1199 and finished by Iltutmish; the top storeys were rebuilt by Firoz Shah Tughlaq. A simplified model at true proportions.',
    'अपने समय की सबसे ऊँची पत्थर की मीनार, 72.5 मी ऊँची, लगभग 1199 में क़ुतुबुद्दीन ऐबक ने शुरू की और इल्तुतमिश ने पूरी की; ऊपरी मंज़िलें फ़िरोज़ शाह तुग़लक ने फिर से बनवाईं। सही अनुपात में सरल मॉडल।',
    'ತನ್ನ ಕಾಲದ ಅತಿ ಎತ್ತರದ ಕಲ್ಲಿನ ಮಿನಾರು, 72.5 ಮೀ ಎತ್ತರ; ಸುಮಾರು 1199ರಲ್ಲಿ ಕುತುಬುದ್ದೀನ್ ಐಬಕ್ ಆರಂಭಿಸಿ ಇಲ್ತುತ್ಮಿಷ್ ಪೂರ್ಣಗೊಳಿಸಿದ; ಮೇಲಿನ ಅಂತಸ್ತುಗಳನ್ನು ಫಿರೋಜ್ ಶಾ ತುಘಲಕ್ ಮರುನಿರ್ಮಿಸಿದ. ನಿಜ ಅನುಪಾತದ ಸರಳ ಮಾದರಿ.',
  ),
  keywords: ['qutub minar', 'qutb minar', 'delhi sultanate', 'aibak', 'iltutmish', 'monument', 'minaret', 'architecture', 'delhi', 'world heritage', 'towns traders and craftspersons', 'the delhi sultans'],
  credit: 'Simplified model drawn by ZYNETIX from published measurements',
  size: 0.6,
  crease: 30,
  matte: true,
  build(THREE) {
    const out = { storey1: [], storey2: [], storey3: [], storey4: [], storey5: [], balconies: [], bands: [], base: [] };
    for (const [y0, y1, ra, rb, flute, id] of STOREYS) {
      out[id].push(flutedStorey(THREE, y0, y1, ra, rb, flute));
      // Bands of inscriptions round the red storeys.
      if (id === 'storey1' || id === 'storey2' || id === 'storey3') {
        for (const f of id === 'storey1' ? [0.18, 0.42, 0.66] : [0.35, 0.7]) {
          const y = y0 + (y1 - y0) * f, r = ra + (rb - ra) * f;
          out.bands.push(flutedStorey(THREE, y, y + 0.9, r * 1.005, r * 1.005, flute, 192, 1));
        }
      }
      // The marble storeys have white bands.
      if (id === 'storey4' || id === 'storey5') {
        out.bands.push(flutedStorey(THREE, y0 + 0.2, y0 + (y1 - y0) * 0.45, ra * 1.01, (ra + rb) / 2 * 1.01, flute, 192, 2));
      }
      // The balcony at the top of each storey: a projecting floor on brackets and a railing.
      const r = rb * 1.32;
      out.balconies.push(new THREE.CylinderGeometry(r, r * 0.97, 0.6, 64).translate(0, y1 + 0.3, 0));
      out.balconies.push(new THREE.CylinderGeometry(r * 0.97, rb * 1.02, 1.1, 64, 1, true).translate(0, y1 - 0.25, 0));
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        out.balconies.push(new THREE.BoxGeometry(0.35, 0.55, (r - rb) * 0.95).translate(0, y1 - 0.35, (r + rb) / 2).rotateY(a));
      }
      out.balconies.push(new THREE.TorusGeometry(r * 0.98, 0.12, 6, 64).rotateX(Math.PI / 2).translate(0, y1 + 1.4, 0));
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        out.balconies.push(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6).translate(r * 0.98 * Math.cos(a), y1 + 1.0, r * 0.98 * Math.sin(a)));
      }
    }
    // A low square plinth round the foot, and the doorway on the north side.
    out.base.push(new THREE.CylinderGeometry(8.2, 8.6, 1.2, 8).translate(0, -0.6, 0));
    out.base.push(new THREE.BoxGeometry(46, 0.6, 46).translate(0, -1.5, 0));
    const door = new THREE.BoxGeometry(1.4, 2.6, 1.0).translate(0, 1.3, -7.0);
    return { ...out, door };
  },
  groups: [
    { id: 'storeys', name: t('Storeys', 'मंज़िलें', 'ಅಂತಸ್ತುಗಳು') },
    { id: 'details', name: t('Balconies and bands', 'छज्जे और पट्टियाँ', 'ಬಾಲ್ಕನಿಗಳು ಮತ್ತು ಪಟ್ಟಿಗಳು') },
  ],
  parts: [
    {
      id: 'storey1', group: 'storeys', color: '#a05540', explode: [0, -1, 0],
      name: t('First storey: round and angular flutes', 'पहली मंज़िल: गोल और कोणीय धारियाँ', 'ಮೊದಲ ಅಂತಸ್ತು: ದುಂಡು ಮತ್ತು ಕೋನೀಯ ಕೊರೆಗಳು'),
      info: t('Red sandstone, about 29 m high, built by Qutb-ud-din Aibak. Its flutes are rounded and angular in turn.', 'लाल बलुआ पत्थर, लगभग 29 मी ऊँची, क़ुतुबुद्दीन ऐबक ने बनवाई। इसकी धारियाँ बारी-बारी से गोल और कोणीय हैं।', 'ಕೆಂಪು ಮರಳುಗಲ್ಲು, ಸುಮಾರು 29 ಮೀ ಎತ್ತರ, ಕುತುಬುದ್ದೀನ್ ಐಬಕ್ ನಿರ್ಮಿಸಿದ್ದು. ಇದರ ಕೊರೆಗಳು ಸರದಿಯಂತೆ ದುಂಡು ಮತ್ತು ಕೋನೀಯ.'),
    },
    {
      id: 'storey2', group: 'storeys', color: '#a65a43', explode: [0, -0.4, 0],
      name: t('Second storey: round flutes', 'दूसरी मंज़िल: गोल धारियाँ', 'ಎರಡನೇ ಅಂತಸ್ತು: ದುಂಡು ಕೊರೆಗಳು'),
      info: t('Added by Iltutmish, like the third storey.', 'इल्तुतमिश ने जोड़ी, तीसरी मंज़िल की तरह।', 'ಮೂರನೇ ಅಂತಸ್ತಿನಂತೆ ಇಲ್ತುತ್ಮಿಷ್ ಸೇರಿಸಿದ.'),
    },
    {
      id: 'storey3', group: 'storeys', color: '#a35944', explode: [0, 0.2, 0],
      name: t('Third storey: angular flutes', 'तीसरी मंज़िल: कोणीय धारियाँ', 'ಮೂರನೇ ಅಂತಸ್ತು: ಕೋನೀಯ ಕೊರೆಗಳು'),
      info: t('Star-shaped in plan, with sharp angular flutes.', 'ऊपर से देखने पर तारे जैसी, तीखी कोणीय धारियों वाली।', 'ಮೇಲಿನಿಂದ ನಕ್ಷತ್ರಾಕಾರ, ಚೂಪಾದ ಕೋನೀಯ ಕೊರೆಗಳು.'),
    },
    {
      id: 'storey4', group: 'storeys', color: '#d6cab6', explode: [0, 0.7, 0],
      name: t('Fourth storey: marble', 'चौथी मंज़िल: संगमरमर', 'ನಾಲ್ಕನೇ ಅಂತಸ್ತು: ಅಮೃತಶಿಲೆ'),
      info: t('Rebuilt in white marble and red sandstone by Firoz Shah Tughlaq after lightning damaged the tower in 1368.', '1368 में बिजली से मीनार को क्षति के बाद फ़िरोज़ शाह तुग़लक ने सफ़ेद संगमरमर और लाल बलुआ पत्थर से फिर बनवाई।', '1368ರಲ್ಲಿ ಸಿಡಿಲಿನಿಂದ ಗೋಪುರಕ್ಕೆ ಹಾನಿಯಾದ ನಂತರ ಫಿರೋಜ್ ಶಾ ತುಘಲಕ್ ಬಿಳಿ ಅಮೃತಶಿಲೆ ಮತ್ತು ಕೆಂಪು ಮರಳುಗಲ್ಲಿನಲ್ಲಿ ಮರುನಿರ್ಮಿಸಿದ.'),
    },
    {
      id: 'storey5', group: 'storeys', color: '#b08268', explode: [0, 1.1, 0],
      name: t('Fifth storey', 'पाँचवीं मंज़िल', 'ಐದನೇ ಅಂತಸ್ತು'),
      info: t('The top, 72.5 m above the ground. A cupola once stood on it; it fell in an earthquake in 1803.', 'शिखर, ज़मीन से 72.5 मी ऊपर। इस पर कभी एक छतरी थी जो 1803 के भूकंप में गिर गई।', 'ತುದಿ, ನೆಲದಿಂದ 72.5 ಮೀ ಎತ್ತರ. ಇದರ ಮೇಲೆ ಒಮ್ಮೆ ಛತ್ರಿಯಿತ್ತು; 1803ರ ಭೂಕಂಪದಲ್ಲಿ ಬಿದ್ದುಹೋಯಿತು.'),
    },
    {
      id: 'balconies', group: 'details', color: '#8c4733', explode: [0, 0, 0.0001],
      name: t('Balconies on brackets', 'ब्रैकेट पर छज्जे', 'ಆಧಾರಗಳ ಮೇಲಿನ ಬಾಲ್ಕನಿಗಳು'),
      info: t('Each storey ends in a projecting balcony carried on carved stone brackets (muqarnas).', 'हर मंज़िल नक्काशीदार पत्थर के ब्रैकेटों (मुक़र्नस) पर टिके छज्जे पर समाप्त होती है।', 'ಪ್ರತಿ ಅಂತಸ್ತು ಕೆತ್ತಿದ ಕಲ್ಲಿನ ಆಧಾರಗಳ (ಮುಕರ್ನಸ್) ಮೇಲಿನ ಚಾಚಿದ ಬಾಲ್ಕನಿಯಲ್ಲಿ ಕೊನೆಗೊಳ್ಳುತ್ತದೆ.'),
    },
    {
      id: 'bands', group: 'details', color: '#c79f76', explode: [0, 0, 0.0001],
      name: t('Bands of carved inscriptions', 'नक्काशीदार अभिलेखों की पट्टियाँ', 'ಕೆತ್ತಿದ ಶಾಸನಗಳ ಪಟ್ಟಿಗಳು'),
      info: t('Verses from the Quran and the names of the builders carved in Arabic and Persian scripts.', 'अरबी और फ़ारसी लिपियों में क़ुरान की आयतें और निर्माताओं के नाम उकेरे गए हैं।', 'ಅರೇಬಿಕ್ ಮತ್ತು ಪರ್ಷಿಯನ್ ಲಿಪಿಗಳಲ್ಲಿ ಕುರಾನ್ ವಚನಗಳು ಮತ್ತು ನಿರ್ಮಾತೃಗಳ ಹೆಸರುಗಳನ್ನು ಕೆತ್ತಲಾಗಿದೆ.'),
    },
    {
      id: 'base', group: 'details', color: '#7f7668', minor: true, matte: true, explode: [0, -1.5, 0],
      name: t('Base and courtyard', 'आधार और आँगन', 'ತಳ ಮತ್ತು ಅಂಗಳ'),
      info: t('The minar stands in the Qutb complex beside the Quwwat-ul-Islam mosque and the Iron Pillar.', 'मीनार क़ुव्वत-उल-इस्लाम मस्जिद और लौह स्तंभ के पास क़ुतुब परिसर में खड़ी है।', 'ಮಿನಾರು ಕುವ್ವತ್-ಉಲ್-ಇಸ್ಲಾಂ ಮಸೀದಿ ಮತ್ತು ಕಬ್ಬಿಣದ ಕಂಬದ ಬಳಿ ಕುತುಬ್ ಸಂಕೀರ್ಣದಲ್ಲಿದೆ.'),
    },
    {
      id: 'door', group: 'details', color: '#3b2a22', minor: true, explode: [0, -1, -1],
      name: t('Doorway', 'द्वार', 'ಬಾಗಿಲು'),
      info: t('Inside, 379 steps spiral up to the top.', 'भीतर 379 सीढ़ियाँ घूमती हुई ऊपर तक जाती हैं।', 'ಒಳಗೆ 379 ಮೆಟ್ಟಿಲುಗಳು ಸುರುಳಿಯಾಗಿ ಮೇಲಕ್ಕೆ ಹೋಗುತ್ತವೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.2, 0.15, 1] },
    { id: 'below', name: t('Looking up', 'नीचे से ऊपर', 'ಕೆಳಗಿನಿಂದ ಮೇಲೆ'), dir: [0.3, -0.35, 1] },
    { id: 'top', name: t('From above (the star plan)', 'ऊपर से (तारे जैसी योजना)', 'ಮೇಲಿನಿಂದ (ನಕ್ಷತ್ರ ಯೋಜನೆ)'), dir: [0, 1, 0.05] },
  ],
  slices: [
    { id: 'half', name: t('Cut in half', 'बीच से आधा काटा', 'ಅರ್ಧಕ್ಕೆ ಕತ್ತರಿಸಿದ್ದು'), normal: [0, 0, -1], offset: 0, view: 'front' },
  ],
  animations: [],
};
