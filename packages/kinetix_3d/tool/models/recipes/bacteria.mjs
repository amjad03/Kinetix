// A rod-shaped bacterium (a bacillus), built in code from textbook
// structure (simplified): slime capsule, cell wall, cell membrane,
// cytoplasm with ribosomes, the nucleoid (its one loop of DNA), plasmids,
// pili and a flagellum. Built in micrometres, shown about 25,000 times
// larger. Downloaded on first use.
import { blob, curveThrough, rod, seeded, taperTube } from '../lib/shapes.mjs';
import { helix, ring } from '../lib/teaching.mjs';
import { capsule, capsuleRadius, insideCapsule } from '../lib/micro.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });
const HALF = 1.1; // half the straight part, µm
const R = { capsule: 0.66, wall: 0.52, wallIn: 0.46, membrane: 0.45, membraneIn: 0.42 };

/** The nucleoid: one long loop of DNA folded into the middle of the cell. */
function nucleoid(THREE) {
  const pts = [];
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    pts.push(new THREE.Vector3(
      0.75 * Math.sin(a) + 0.18 * Math.sin(7 * a + 0.4),
      0.17 * Math.sin(3 * a + 1) + 0.08 * Math.sin(13 * a),
      0.17 * Math.cos(5 * a) + 0.08 * Math.cos(11 * a + 0.7),
    ));
  }
  return taperTube(THREE, new THREE.CatmullRomCurve3(pts, true), 0.03, 0.03, { segments: 640, radial: 8, caps: false });
}

export default {
  id: 'bacteria',
  version: 1,
  order: 1.6,
  source: 'procedural',
  remote: true,
  topic: 'cell',
  license: 'Same as the app',
  subject: 'Biology',
  classes: [8, 9, 11],
  title: t('Bacterium (bacillus)', 'जीवाणु (बैसिलस)', 'ಬ್ಯಾಕ್ಟೀರಿಯಾ (ಬ್ಯಾಸಿಲಸ್)'),
  summary: t(
    'A single prokaryotic cell about 2 µm long: no nucleus, its DNA lies loose in the cytoplasm. A wall and a slimy capsule protect it, and a whip-like flagellum moves it. Simplified model, about 25,000 times larger than life.',
    'लगभग 2 µm लंबी एक प्रोकैरियोटिक कोशिका: केंद्रक नहीं, इसका डीएनए कोशिकाद्रव्य में खुला रहता है। भित्ति और चिपचिपा संपुट इसकी रक्षा करते हैं, और चाबुक जैसा कशाभ इसे चलाता है। सरलीकृत मॉडल, असल से लगभग 25,000 गुना बड़ा।',
    'ಸುಮಾರು 2 µm ಉದ್ದದ ಒಂದೇ ಪ್ರೊಕ್ಯಾರಿಯೋಟಿಕ್ ಕೋಶ: ಕೋಶಕೇಂದ್ರವಿಲ್ಲ, ಇದರ ಡಿಎನ್‌ಎ ಕೋಶದ್ರವ್ಯದಲ್ಲಿ ಸಡಿಲವಾಗಿದೆ. ಭಿತ್ತಿ ಮತ್ತು ಲೋಳೆಯ ಸಂಪುಟ ಇದನ್ನು ರಕ್ಷಿಸುತ್ತವೆ; ಚಾವಟಿಯಂತಹ ಕಶಾಂಗ ಇದನ್ನು ಚಲಿಸುತ್ತದೆ. ಸರಳೀಕೃತ ಮಾದರಿ, ನಿಜಕ್ಕಿಂತ ಸುಮಾರು 25,000 ಪಟ್ಟು ದೊಡ್ಡದು.',
  ),
  keywords: ['bacteria', 'bacterium', 'bacillus', 'prokaryote', 'prokaryotic cell', 'microorganisms', 'microbes', 'flagellum', 'plasmid', 'nucleoid', 'cell wall', 'pili', 'the fundamental unit of life', 'microorganisms friend and foe', 'biological classification'],
  credit: 'Simplified model built by Zynetix from textbook structure',
  size: 0.07,
  groups: [
    { id: 'cover', name: t('Coverings', 'आवरण', 'ಹೊದಿಕೆಗಳು') },
    { id: 'inside', name: t('Inside the cell', 'कोशिका के भीतर', 'ಕೋಶದ ಒಳಗೆ') },
    { id: 'move', name: t('Moving and sticking', 'चलना और चिपकना', 'ಚಲನೆ ಮತ್ತು ಅಂಟಿಕೊಳ್ಳುವಿಕೆ') },
  ],
  build(THREE) {
    const rnd = seeded(7);
    // Ribosomes everywhere in the cytoplasm, plasmids here and there.
    const ribosomes = insideCapsule(rnd, 220, HALF, R.membraneIn, 0.05).map((p) => blob(THREE, p, 0.028, 0.028, 0.028, 1));
    const plasmids = [[-1.05, 0.12, 0.18, [0.3, 1, 0.2]], [0.95, -0.15, -0.12, [1, 0.4, 0.3]], [1.25, 0.2, -0.05, [0.2, 0.3, 1]]].map(([x, y, z, axis]) => ring(THREE, [x, y, z], axis, 0.09, 0.02));
    // Pili: short straight hairs all over, out through the capsule.
    const pili = [];
    for (let i = 0; i < 70; i++) {
      const x = (rnd() * 2 - 1) * (HALF + 0.35), a = rnd() * Math.PI * 2;
      const r = capsuleRadius(HALF, R.wall, x);
      if (r < 0.2) continue;
      const n = [0, Math.cos(a), Math.sin(a)];
      const base = [x, n[1] * r, n[2] * r];
      const len = 0.28 + rnd() * 0.2;
      pili.push(rod(THREE, base, [x + (rnd() - 0.5) * 0.08, n[1] * (r + len), n[2] * (r + len)], 0.012, 6));
    }
    // The flagellum: a hook at one end, then a long helical whip.
    const start = [HALF + R.wall - 0.02, 0.05, 0];
    const flagellum = [
      taperTube(THREE, curveThrough(THREE, [start, [start[0] + 0.15, 0.08, 0.02], [start[0] + 0.28, 0.0, 0.04]]), 0.035, 0.03, { segments: 12, radial: 8 }),
      helix(THREE, [start[0] + 0.28, 0, 0.04], [start[0] + 3.6, 0, 0.04], 0.16, 4.5, 0.026),
    ];
    return {
      capsule: capsule(THREE, HALF, R.capsule),
      cell_wall: capsule(THREE, HALF, R.wall, R.wallIn),
      membrane: capsule(THREE, HALF, R.membrane, R.membraneIn),
      cytoplasm: capsule(THREE, HALF, R.membraneIn - 0.005),
      nucleoid: nucleoid(THREE),
      plasmids,
      ribosomes,
      pili,
      flagellum,
    };
  },
  parts: [
    {
      id: 'capsule', group: 'cover', color: '#9fd8c8', opacity: 0.22, cap: false, explode: [0, 0.5, 0],
      name: t('Capsule (slime layer)', 'संपुट (श्लेष्मी परत)', 'ಸಂಪುಟ (ಲೋಳೆಯ ಪದರ)'),
      info: t('A sticky outer coat that helps the bacterium stick to surfaces and hide from the body\'s defences.', 'चिपचिपा बाहरी आवरण जो जीवाणु को सतहों से चिपकने और शरीर की रक्षा प्रणाली से छिपने में मदद करता है।', 'ಬ್ಯಾಕ್ಟೀರಿಯಾ ಮೇಲ್ಮೈಗಳಿಗೆ ಅಂಟಿಕೊಳ್ಳಲು ಮತ್ತು ದೇಹದ ರಕ್ಷಣಾ ವ್ಯವಸ್ಥೆಯಿಂದ ಅಡಗಲು ಸಹಾಯ ಮಾಡುವ ಅಂಟುವ ಹೊರಹೊದಿಕೆ.'),
    },
    {
      id: 'cell_wall', group: 'cover', color: '#6fae54', inside: '#5c9645', explode: [0, 0.3, 0.3],
      name: t('Cell wall', 'कोशिका भित्ति', 'ಕೋಶ ಭಿತ್ತಿ'),
      info: t('A tough wall that gives the cell its rod shape and stops it bursting. Its material is different from a plant\'s cellulose wall; the antibiotic penicillin stops bacteria building it.', 'मज़बूत भित्ति जो कोशिका को छड़ जैसा आकार देती है और फटने से बचाती है। इसका पदार्थ पौधे की सेलुलोज़ भित्ति से अलग है; प्रतिजैविक पेनिसिलिन जीवाणुओं को इसे बनाने से रोकता है।', 'ಕೋಶಕ್ಕೆ ಕಡ್ಡಿಯ ಆಕಾರ ನೀಡಿ ಒಡೆಯದಂತೆ ತಡೆಯುವ ಗಟ್ಟಿ ಭಿತ್ತಿ. ಇದರ ವಸ್ತು ಸಸ್ಯದ ಸೆಲ್ಯುಲೋಸ್ ಭಿತ್ತಿಗಿಂತ ಬೇರೆ; ಪ್ರತಿಜೀವಕ ಪೆನಿಸಿಲಿನ್ ಬ್ಯಾಕ್ಟೀರಿಯಾ ಇದನ್ನು ನಿರ್ಮಿಸದಂತೆ ತಡೆಯುತ್ತದೆ.'),
    },
    {
      id: 'membrane', group: 'cover', color: '#e9c46a', inside: '#dcb453', explode: [0, 0.15, 0.4],
      name: t('Cell membrane', 'कोशिका झिल्ली', 'ಕೋಶ ಪೊರೆ'),
      info: t('A thin skin inside the wall that controls what goes in and out of the cell.', 'भित्ति के भीतर पतली झिल्ली जो नियंत्रित करती है कि कोशिका में क्या आए और क्या जाए।', 'ಕೋಶದೊಳಗೆ ಏನು ಬರಬೇಕು, ಏನು ಹೋಗಬೇಕು ಎಂದು ನಿಯಂತ್ರಿಸುವ, ಭಿತ್ತಿಯ ಒಳಗಿನ ತೆಳು ಪೊರೆ.'),
    },
    {
      id: 'cytoplasm', group: 'inside', color: '#dceec9', opacity: 0.32, cap: false, minor: true, explode: [0, 0, 0],
      name: t('Cytoplasm', 'कोशिकाद्रव्य', 'ಕೋಶದ್ರವ್ಯ'),
      info: t('The jelly filling the cell, where its chemical reactions happen.', 'कोशिका में भरी जेली, जहाँ इसकी रासायनिक अभिक्रियाएँ होती हैं।', 'ಕೋಶದಲ್ಲಿ ತುಂಬಿರುವ ಜೆಲ್ಲಿ; ಇದರ ರಾಸಾಯನಿಕ ಕ್ರಿಯೆಗಳು ಇಲ್ಲಿ ನಡೆಯುತ್ತವೆ.'),
    },
    {
      id: 'nucleoid', group: 'inside', color: '#4f5bd5', explode: [0, -0.2, 0.7],
      name: t('Nucleoid (DNA)', 'केंद्रकाभ (डीएनए)', 'ನ್ಯೂಕ್ಲಿಯಾಯ್ಡ್ (ಡಿಎನ್‌ಎ)'),
      info: t('One long loop of DNA, folded up but not wrapped in a nuclear membrane: that is what makes bacteria prokaryotes.', 'डीएनए का एक लंबा छल्ला, मुड़ा हुआ पर केंद्रक झिल्ली में लिपटा नहीं: इसी से जीवाणु प्रोकैरियोट कहलाते हैं।', 'ಡಿಎನ್‌ಎಯ ಒಂದು ಉದ್ದ ಕುಣಿಕೆ, ಮಡಚಿದ್ದು ಆದರೆ ಕೋಶಕೇಂದ್ರ ಪೊರೆಯಲ್ಲಿ ಸುತ್ತಿಲ್ಲ: ಅದಕ್ಕೇ ಬ್ಯಾಕ್ಟೀರಿಯಾ ಪ್ರೊಕ್ಯಾರಿಯೋಟ್‌ಗಳು.'),
    },
    {
      id: 'plasmids', group: 'inside', color: '#e0559b', explode: [0.3, -0.3, 0.6],
      name: t('Plasmids', 'प्लाज़्मिड', 'ಪ್ಲಾಸ್ಮಿಡ್‌ಗಳು'),
      info: t('Small extra rings of DNA. Bacteria can pass them to each other, which is how resistance to antibiotics spreads; scientists use them to put genes into bacteria.', 'डीएनए के छोटे अतिरिक्त छल्ले। जीवाणु इन्हें एक-दूसरे को दे सकते हैं, इसी से प्रतिजैविक प्रतिरोध फैलता है; वैज्ञानिक इनसे जीवाणुओं में जीन डालते हैं।', 'ಡಿಎನ್‌ಎಯ ಸಣ್ಣ ಹೆಚ್ಚುವರಿ ಉಂಗುರಗಳು. ಬ್ಯಾಕ್ಟೀರಿಯಾ ಇವುಗಳನ್ನು ಒಂದಕ್ಕೊಂದು ವರ್ಗಾಯಿಸಬಲ್ಲವು; ಪ್ರತಿಜೀವಕ ನಿರೋಧಕತೆ ಹರಡುವುದು ಹೀಗೆ. ವಿಜ್ಞಾನಿಗಳು ಇವುಗಳಿಂದ ಬ್ಯಾಕ್ಟೀರಿಯಾಕ್ಕೆ ಜೀನ್ ಸೇರಿಸುತ್ತಾರೆ.'),
    },
    {
      id: 'ribosomes', group: 'inside', color: '#7a46b0', explode: [0, -0.4, 0.5],
      name: t('Ribosomes', 'राइबोसोम', 'ರೈಬೋಸೋಮ್‌ಗಳು'),
      info: t('Thousands of tiny grains that make the cell\'s proteins. They are smaller than the ribosomes of our cells.', 'हज़ारों छोटे कण जो कोशिका के प्रोटीन बनाते हैं। ये हमारी कोशिकाओं के राइबोसोम से छोटे होते हैं।', 'ಕೋಶದ ಪ್ರೋಟೀನ್‌ಗಳನ್ನು ತಯಾರಿಸುವ ಸಾವಿರಾರು ಸಣ್ಣ ಕಣಗಳು. ಇವು ನಮ್ಮ ಕೋಶಗಳ ರೈಬೋಸೋಮ್‌ಗಳಿಗಿಂತ ಚಿಕ್ಕವು.'),
    },
    {
      id: 'pili', group: 'move', color: '#b9a27d', minor: true, explode: [0, 0.6, 0],
      name: t('Pili', 'पिलि (रोम)', 'ಪಿಲಿ'),
      info: t('Short hair-like threads used to stick to surfaces and to other bacteria.', 'छोटे बाल जैसे धागे, जिनसे यह सतहों और दूसरे जीवाणुओं से चिपकता है।', 'ಮೇಲ್ಮೈಗಳಿಗೆ ಮತ್ತು ಇತರ ಬ್ಯಾಕ್ಟೀರಿಯಾಗಳಿಗೆ ಅಂಟಿಕೊಳ್ಳಲು ಬಳಸುವ ಸಣ್ಣ ಕೂದಲಿನಂತಹ ಎಳೆಗಳು.'),
    },
    {
      id: 'flagellum', group: 'move', color: '#c49b6c', explode: [0.6, 0, 0],
      name: t('Flagellum', 'कशाभ (फ्लैजेलम)', 'ಕಶಾಂಗ (ಫ್ಲ್ಯಾಜೆಲ್ಲಮ್)'),
      info: t('A long whip that spins like a propeller, driven by a tiny motor in the cell wall, to push the bacterium along.', 'एक लंबा चाबुक जो कोशिका भित्ति की एक छोटी मोटर से प्रोपेलर की तरह घूमकर जीवाणु को आगे धकेलता है।', 'ಕೋಶ ಭಿತ್ತಿಯಲ್ಲಿನ ಸಣ್ಣ ಮೋಟಾರಿನಿಂದ ಪ್ರೊಪೆಲ್ಲರ್‌ನಂತೆ ತಿರುಗಿ ಬ್ಯಾಕ್ಟೀರಿಯಾವನ್ನು ಮುಂದೆ ತಳ್ಳುವ ಉದ್ದ ಚಾವಟಿ.'),
    },
  ],
  views: [
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [0.15, 0.35, 1] },
    { id: 'end', name: t('From one end', 'एक सिरे से', 'ಒಂದು ತುದಿಯಿಂದ'), dir: [-1, 0.3, 0.4] },
  ],
  slices: [
    { id: 'half', name: t('Cut in half', 'बीच से आधा काटा', 'ಅರ್ಧಕ್ಕೆ ಕತ್ತರಿಸಿದ್ದು'), normal: [0, 0, -1], offset: 0, view: 'side' },
  ],
  animations: [],
};
