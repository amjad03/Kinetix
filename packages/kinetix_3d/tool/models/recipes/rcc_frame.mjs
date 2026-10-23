// A three-storey reinforced concrete (RCC) frame building, two bays by two,
// built in code at 1:50 (bays 4 m, storeys 3 m): isolated footings, columns,
// beams (with plinth beams), slabs, and the starter bars left sticking out of
// the roof columns for the next storey.
import { member } from '../lib/structures.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const BAY = 0.08; // 4 m at 1:50
const STOREY = 0.06; // 3 m
const N = 3; // storeys
const COL = 0.008; // 400 mm column
const BEAM = [0.006, 0.009]; // 300 x 450 mm beam
const SLAB = 0.0025; // 125 mm slab
const PLINTH = 0.012; // plinth level above the ground

export default {
  id: 'rcc_frame',
  version: 1,
  order: 10,
  source: 'procedural',
  subject: 'Engineering',
  classes: [11, 12],
  title: t('RCC frame building', 'RCC फ़्रेम भवन', 'RCC ಚೌಕಟ್ಟಿನ ಕಟ್ಟಡ'),
  summary: t(
    'A framed building carries its loads through slabs to beams, beams to columns and columns to the footings, which spread them into the soil. Walls only fill the frame.',
    'फ़्रेम भवन में भार स्लैब से बीम, बीम से कॉलम और कॉलम से नींव तक जाता है, जो उसे मिट्टी में फैला देती है। दीवारें केवल फ़्रेम को भरती हैं।',
    'ಚೌಕಟ್ಟಿನ ಕಟ್ಟಡದಲ್ಲಿ ಭಾರ ಸ್ಲ್ಯಾಬ್‌ನಿಂದ ಬೀಮ್‌ಗೆ, ಬೀಮ್‌ನಿಂದ ಕಾಲಮ್‌ಗೆ ಮತ್ತು ಕಾಲಮ್‌ನಿಂದ ಅಡಿಪಾಯಕ್ಕೆ ಹೋಗಿ ಮಣ್ಣಿನಲ್ಲಿ ಹರಡುತ್ತದೆ. ಗೋಡೆಗಳು ಚೌಕಟ್ಟನ್ನು ತುಂಬುತ್ತವೆ ಅಷ್ಟೇ.',
  ),
  keywords: ['rcc', 'reinforced concrete', 'frame building', 'column', 'beam', 'slab', 'footing', 'load path', 'civil engineering', 'structure', 'building', 'storey'],
  credit: 'Model built by Zynetix (a simplified RCC frame at 1:50)',
  crease: 40,
  build(THREE) {
    const xs = [0, 1, 2].map((i) => (i - 1) * BAY);
    const zs = [0, 1, 2].map((i) => (i - 1) * BAY);
    const levels = [PLINTH, ...Array.from({ length: N }, (_, i) => PLINTH + STOREY * (i + 1))];
    const footings = [], columns = [], beams = [], slabs = [], bars = [];
    for (const x of xs) {
      for (const z of zs) {
        // An isolated footing: a square pad and a pedestal, below the ground (y = 0).
        footings.push(new THREE.BoxGeometry(0.036, 0.008, 0.036).translate(x, -0.03, z));
        footings.push(new THREE.BoxGeometry(0.012, 0.022, 0.012).translate(x, -0.015, z));
        columns.push(member(THREE, [x, -0.004, z], [x, levels[N], z], COL, COL));
        // Starter bars: four bars of the next storey's column, and a tie round them.
        for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          bars.push(new THREE.CylinderGeometry(0.0005, 0.0005, 0.03, 6).translate(x + dx * 0.0028, levels[N] + 0.015, z + dz * 0.0028));
        }
        bars.push(new THREE.TorusGeometry(0.004, 0.0004, 4, 16).rotateX(Math.PI / 2).translate(x, levels[N] + 0.012, z));
      }
    }
    for (const y of levels) {
      const yb = y - BEAM[1] / 2;
      for (const z of zs) beams.push(member(THREE, [xs[0], yb, z], [xs[2], yb, z], BEAM[0], BEAM[1], [0, 0, 1]));
      for (const x of xs) beams.push(member(THREE, [x, yb, zs[0]], [x, yb, zs[2]], BEAM[0], BEAM[1], [1, 0, 0]));
    }
    for (const y of levels.slice(1)) slabs.push(new THREE.BoxGeometry(2 * BAY + COL, SLAB, 2 * BAY + COL).translate(0, y - SLAB / 2 + 0.0004, 0));
    // The ground: a thin block cut away round the footings.
    const ground = [new THREE.BoxGeometry(2 * BAY + 0.08, 0.004, 2 * BAY + 0.08).translate(0, -0.002, 0)];
    return { footings, columns, beams, slabs, starter_bars: bars, ground };
  },
  groups: [
    { id: 'frame', name: t('Frame', 'फ़्रेम', 'ಚೌಕಟ್ಟು') },
    { id: 'foundation', name: t('Foundation and ground', 'नींव और ज़मीन', 'ಅಡಿಪಾಯ ಮತ್ತು ನೆಲ') },
  ],
  parts: [
    {
      id: 'slabs', group: 'frame', color: '#c9c4ba', explode: [0, 1.2, 0],
      name: t('Slabs', 'स्लैब', 'ಸ್ಲ್ಯಾಬ್‌ಗಳು'),
      info: t('Floors 100–150 mm thick. They carry people and furniture and pass the load to the beams round them.', '100–150 mm मोटे फ़र्श। ये लोगों और सामान का भार उठाकर आसपास के बीमों को देते हैं।', '100–150 mm ದಪ್ಪದ ನೆಲಗಳು. ಜನ ಮತ್ತು ಸಾಮಾನುಗಳ ಭಾರ ಹೊತ್ತು ಸುತ್ತಲಿನ ಬೀಮ್‌ಗಳಿಗೆ ಕೊಡುತ್ತವೆ.'),
    },
    {
      id: 'beams', group: 'frame', color: '#8fa3b8', explode: [0, 0.6, 1],
      name: t('Beams', 'बीम', 'ಬೀಮ್‌ಗಳು'),
      info: t('Bend under the slab load and carry it sideways to the columns. Steel bars at the bottom take the tension.', 'स्लैब के भार से मुड़ते हैं और उसे कॉलमों तक ले जाते हैं। नीचे की सरिया तनाव सहती है।', 'ಸ್ಲ್ಯಾಬ್ ಭಾರದಿಂದ ಬಾಗಿ ಅದನ್ನು ಕಾಲಮ್‌ಗಳಿಗೆ ಸಾಗಿಸುತ್ತವೆ. ಕೆಳಗಿನ ಉಕ್ಕಿನ ಸರಳುಗಳು ಸೆಳೆತ ಹೊರುತ್ತವೆ.'),
    },
    {
      id: 'columns', group: 'frame', color: '#5f7d99', explode: [1, 0, 1],
      name: t('Columns', 'कॉलम', 'ಕಾಲಮ್‌ಗಳು'),
      info: t('Carry the beams\' loads straight down in compression; the ground-floor columns carry the most.', 'बीमों का भार संपीडन में सीधे नीचे ले जाते हैं; भूतल के कॉलम सबसे अधिक भार उठाते हैं।', 'ಬೀಮ್‌ಗಳ ಭಾರವನ್ನು ಸಂಪೀಡನದಲ್ಲಿ ನೇರ ಕೆಳಗೆ ಒಯ್ಯುತ್ತವೆ; ನೆಲಮಹಡಿಯ ಕಾಲಮ್‌ಗಳು ಅತಿ ಹೆಚ್ಚು ಭಾರ ಹೊರುತ್ತವೆ.'),
    },
    {
      id: 'starter_bars', group: 'frame', color: '#b5522f', metal: true, minor: true, explode: [0, 1.6, 0],
      name: t('Starter bars', 'स्टार्टर सरिया', 'ಸ್ಟಾರ್ಟರ್ ಸರಳುಗಳು'),
      info: t('Main bars of the columns left above the roof, with ties, so another storey can be joined on later.', 'छत के ऊपर छोड़ी गई कॉलम की मुख्य सरिया और टाई, ताकि बाद में एक और मंज़िल जोड़ी जा सके।', 'ಛಾವಣಿಯ ಮೇಲೆ ಬಿಟ್ಟ ಕಾಲಮ್‌ನ ಮುಖ್ಯ ಸರಳುಗಳು ಮತ್ತು ಟೈಗಳು; ಮುಂದೆ ಇನ್ನೊಂದು ಮಹಡಿ ಸೇರಿಸಲು.'),
    },
    {
      id: 'footings', group: 'foundation', color: '#9b8c78', explode: [0, -1.2, 0],
      name: t('Isolated footings', 'पृथक नींव', 'ಪ್ರತ್ಯೇಕ ಅಡಿಪಾಯ'),
      info: t('A pad under each column spreads its load over enough soil that the soil is not overstressed.', 'हर कॉलम के नीचे एक पैड उसका भार पर्याप्त मिट्टी पर फैलाता है ताकि मिट्टी पर अधिक दबाव न पड़े।', 'ಪ್ರತಿ ಕಾಲಮ್ ಕೆಳಗಿನ ಪ್ಯಾಡ್ ಅದರ ಭಾರವನ್ನು ಸಾಕಷ್ಟು ಮಣ್ಣಿನ ಮೇಲೆ ಹರಡಿ ಮಣ್ಣಿಗೆ ಅತಿ ಒತ್ತಡವಾಗದಂತೆ ಮಾಡುತ್ತದೆ.'),
    },
    {
      id: 'ground', group: 'foundation', color: '#7b6a52', minor: true, opacity: 0.45, explode: [0, -0.6, 0],
      name: t('Ground level', 'भूमि तल', 'ನೆಲಮಟ್ಟ'),
      info: t('The footings sit below the ground, on firm soil.', 'नींव ज़मीन के नीचे, ठोस मिट्टी पर टिकी होती है।', 'ಅಡಿಪಾಯಗಳು ನೆಲದ ಕೆಳಗೆ, ಗಟ್ಟಿ ಮಣ್ಣಿನ ಮೇಲೆ ಕೂರುತ್ತವೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.6, 0.45, 1] },
    { id: 'below', name: t('From below (footings)', 'नीचे से (नींव)', 'ಕೆಳಗಿನಿಂದ (ಅಡಿಪಾಯ)'), dir: [0.8, -0.35, 0.9] },
  ],
  slices: [],
  animations: [
    {
      id: 'load_path', kind: 'tour',
      name: t('The load path', 'भार का रास्ता', 'ಭಾರದ ದಾರಿ'),
      steps: [
        { highlight: ['slabs'], text: t('1. The slab carries the floor load.', '1. स्लैब फ़र्श का भार उठाता है।', '1. ಸ್ಲ್ಯಾಬ್ ನೆಲದ ಭಾರ ಹೊರುತ್ತದೆ.') },
        { highlight: ['beams'], text: t('2. The beams take it to the columns.', '2. बीम उसे कॉलमों तक ले जाते हैं।', '2. ಬೀಮ್‌ಗಳು ಅದನ್ನು ಕಾಲಮ್‌ಗಳಿಗೆ ಒಯ್ಯುತ್ತವೆ.') },
        { highlight: ['columns'], text: t('3. The columns carry it down, storey by storey.', '3. कॉलम उसे मंज़िल-दर-मंज़िल नीचे ले जाते हैं।', '3. ಕಾಲಮ್‌ಗಳು ಅದನ್ನು ಮಹಡಿ ಮಹಡಿಯಾಗಿ ಕೆಳಗೆ ಒಯ್ಯುತ್ತವೆ.') },
        { highlight: ['footings'], text: t('4. The footings spread it into the soil.', '4. नींव उसे मिट्टी में फैला देती है।', '4. ಅಡಿಪಾಯಗಳು ಅದನ್ನು ಮಣ್ಣಿನಲ್ಲಿ ಹರಡುತ್ತವೆ.') },
      ],
    },
  ],
};
