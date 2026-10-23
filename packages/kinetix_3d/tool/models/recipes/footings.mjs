// Types of shallow and deep foundation side by side in a block of soil, built
// in code at 1:50: an isolated (pad) footing, a combined footing under two
// columns, a strip (wall) footing, a raft under a grid of columns, and a pile
// foundation (a pile cap on four piles down to firm strata).
import { member } from '../lib/structures.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const GAP = 0.11; // between the examples along x
const COL = 0.008;

export default {
  id: 'footings',
  version: 1,
  order: 15,
  source: 'procedural',
  subject: 'Engineering',
  classes: [11, 12],
  title: t('Types of footings', 'नींव के प्रकार', 'ಅಡಿಪಾಯದ ವಿಧಗಳು'),
  summary: t(
    'A footing spreads a column\'s or wall\'s load over enough soil. Shallow footings (isolated, combined, strip, raft) bear on soil near the surface; piles carry load down to firm strata.',
    'नींव कॉलम या दीवार का भार पर्याप्त मिट्टी पर फैलाती है। उथली नींव (पृथक, संयुक्त, पट्टी, राफ़्ट) सतह के पास की मिट्टी पर टिकती है; पाइल भार को नीचे ठोस परत तक ले जाते हैं।',
    'ಅಡಿಪಾಯ ಕಾಲಮ್ ಅಥವಾ ಗೋಡೆಯ ಭಾರವನ್ನು ಸಾಕಷ್ಟು ಮಣ್ಣಿನ ಮೇಲೆ ಹರಡುತ್ತದೆ. ಆಳವಿಲ್ಲದ ಅಡಿಪಾಯಗಳು (ಪ್ರತ್ಯೇಕ, ಸಂಯುಕ್ತ, ಪಟ್ಟಿ, ರಾಫ್ಟ್) ಮೇಲ್ಮೈ ಬಳಿಯ ಮಣ್ಣಿನ ಮೇಲೆ ಕೂರುತ್ತವೆ; ಪೈಲ್‌ಗಳು ಭಾರವನ್ನು ಕೆಳಗಿನ ಗಟ್ಟಿ ಪದರಕ್ಕೆ ಒಯ್ಯುತ್ತವೆ.',
  ),
  keywords: ['footing', 'foundation', 'isolated footing', 'combined footing', 'strip footing', 'raft foundation', 'pile foundation', 'pile cap', 'bearing capacity', 'soil', 'civil engineering', 'geotechnical'],
  credit: 'Model built by Zynetix (simplified foundations at 1:50)',
  crease: 40,
  build(THREE) {
    const xs = [-2, -1, 0, 1, 2].map((i) => i * GAP);
    const col = (x, z, top = 0.05) => member(THREE, [x, -0.02, z], [x, top, z], COL, COL);
    // Isolated: a sloped pad under one column.
    const isolated = [new THREE.BoxGeometry(0.05, 0.008, 0.05).translate(xs[0], -0.026, 0), new THREE.CylinderGeometry(0.008, 0.035, 0.008, 4, 1).rotateY(Math.PI / 4).translate(xs[0], -0.018, 0)];
    // Combined: one rectangular footing under two columns close together.
    const combined = [new THREE.BoxGeometry(0.09, 0.01, 0.045).translate(xs[1], -0.025, 0)];
    // Strip: a continuous footing under a wall.
    const strip = [new THREE.BoxGeometry(0.09, 0.008, 0.04).translate(xs[2], -0.026, 0), new THREE.BoxGeometry(0.09, 0.008, 0.024).translate(xs[2], -0.018, 0)];
    // Raft: one slab under a grid of columns, with downstand beams.
    const raft = [new THREE.BoxGeometry(0.095, 0.007, 0.095).translate(xs[3], -0.0255, 0)];
    for (const d of [-0.03, 0, 0.03]) {
      raft.push(member(THREE, [xs[3] - 0.045, -0.031, d], [xs[3] + 0.045, -0.031, d], 0.006, 0.006, [0, 0, 1]));
    }
    // Pile foundation: a cap on four piles down to the hard stratum.
    const cap = [new THREE.BoxGeometry(0.05, 0.014, 0.05).translate(xs[4], -0.025, 0)];
    const piles = [];
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) piles.push(new THREE.CylinderGeometry(0.0045, 0.0045, 0.14, 16).translate(xs[4] + dx * 0.016, -0.032 - 0.07, dz * 0.016));
    const columns = [col(xs[0], 0), col(xs[1] - 0.028, 0), col(xs[1] + 0.028, 0), col(xs[4], 0)];
    for (const dx of [-0.03, 0, 0.03]) for (const dz of [-0.03, 0.03]) columns.push(col(xs[3] + dx, dz, 0.035));
    columns.push(new THREE.BoxGeometry(0.09, 0.07, 0.01).translate(xs[2], 0.021, 0)); // the wall on the strip
    // Soil: the top layer (soft) and the hard stratum the piles reach.
    const L = 5 * GAP + 0.04;
    const soil = [new THREE.BoxGeometry(L, 0.16, 0.12).translate(0, -0.08, 0)];
    const rock = [new THREE.BoxGeometry(L, 0.04, 0.12).translate(0, -0.18, 0)];
    return { isolated, combined, strip, raft, pile_cap: cap, piles, columns, soil, hard_stratum: rock };
  },
  groups: [
    { id: 'shallow', name: t('Shallow footings', 'उथली नींव', 'ಆಳವಿಲ್ಲದ ಅಡಿಪಾಯ') },
    { id: 'deep', name: t('Pile foundation', 'पाइल नींव', 'ಪೈಲ್ ಅಡಿಪಾಯ') },
    { id: 'site', name: t('Columns and soil', 'कॉलम और मिट्टी', 'ಕಾಲಮ್ ಮತ್ತು ಮಣ್ಣು') },
  ],
  parts: [
    {
      id: 'isolated', group: 'shallow', color: '#a0907a', explode: [0, 0.8, 0.6],
      name: t('Isolated (pad) footing', 'पृथक (पैड) नींव', 'ಪ್ರತ್ಯೇಕ (ಪ್ಯಾಡ್) ಅಡಿಪಾಯ'),
      info: t('One square or sloped pad under one column; its area = column load ÷ safe bearing capacity of the soil.', 'एक कॉलम के नीचे एक चौकोर या ढलवाँ पैड; क्षेत्रफल = कॉलम भार ÷ मिट्टी की सुरक्षित धारण क्षमता।', 'ಒಂದು ಕಾಲಮ್ ಕೆಳಗೆ ಒಂದು ಚೌಕ ಅಥವಾ ಇಳಿಜಾರು ಪ್ಯಾಡ್; ವಿಸ್ತೀರ್ಣ = ಕಾಲಮ್ ಭಾರ ÷ ಮಣ್ಣಿನ ಸುರಕ್ಷಿತ ಧಾರಣ ಸಾಮರ್ಥ್ಯ.'),
    },
    {
      id: 'combined', group: 'shallow', color: '#b39b7d', explode: [0, 0.8, 0.6],
      name: t('Combined footing', 'संयुक्त नींव', 'ಸಂಯುಕ್ತ ಅಡಿಪಾಯ'),
      info: t('Used when two columns are so close (or one is at the boundary) that their pads would overlap; shaped so the soil pressure is even.', 'जब दो कॉलम इतने पास हों (या एक सीमा पर हो) कि उनके पैड मिल जाएँ; आकार ऐसा कि मिट्टी पर दबाव समान रहे।', 'ಎರಡು ಕಾಲಮ್‌ಗಳು ತುಂಬಾ ಹತ್ತಿರವಿದ್ದಾಗ (ಅಥವಾ ಒಂದು ಗಡಿಯಲ್ಲಿದ್ದಾಗ) ಪ್ಯಾಡ್‌ಗಳು ಸೇರುವಾಗ; ಮಣ್ಣಿನ ಒತ್ತಡ ಸಮವಾಗುವಂತೆ ಆಕಾರ.'),
    },
    {
      id: 'strip', group: 'shallow', color: '#9c8b74', explode: [0, 0.8, 0.6],
      name: t('Strip (wall) footing', 'पट्टी (दीवार) नींव', 'ಪಟ್ಟಿ (ಗೋಡೆ) ಅಡಿಪಾಯ'),
      info: t('A continuous, stepped footing under a load-bearing wall.', 'भार वहन करने वाली दीवार के नीचे लगातार, सीढ़ीदार नींव।', 'ಭಾರ ಹೊರುವ ಗೋಡೆಯ ಕೆಳಗೆ ನಿರಂತರ, ಮೆಟ್ಟಿಲಿನ ಅಡಿಪಾಯ.'),
    },
    {
      id: 'raft', group: 'shallow', color: '#8f8371', explode: [0, 0.8, 0.6],
      name: t('Raft (mat) foundation', 'राफ़्ट (मैट) नींव', 'ರಾಫ್ಟ್ (ಮ್ಯಾಟ್) ಅಡಿಪಾಯ'),
      info: t('One slab under the whole building, for weak soil or when pads would cover more than about half the plan area.', 'पूरे भवन के नीचे एक स्लैब, कमज़ोर मिट्टी के लिए या जब पैड योजना के लगभग आधे से अधिक क्षेत्र को ढक लें।', 'ಇಡೀ ಕಟ್ಟಡದ ಕೆಳಗೆ ಒಂದು ಸ್ಲ್ಯಾಬ್; ದುರ್ಬಲ ಮಣ್ಣಿಗೆ ಅಥವಾ ಪ್ಯಾಡ್‌ಗಳು ಯೋಜನೆಯ ಅರ್ಧಕ್ಕಿಂತ ಹೆಚ್ಚು ಆವರಿಸಿದಾಗ.'),
    },
    {
      id: 'pile_cap', group: 'deep', color: '#a79c8a', explode: [0, 0.8, 0.6],
      name: t('Pile cap', 'पाइल कैप', 'ಪೈಲ್ ಕ್ಯಾಪ್'),
      info: t('A thick block that shares the column load between the piles.', 'एक मोटा खंड जो कॉलम का भार पाइलों में बाँटता है।', 'ಕಾಲಮ್ ಭಾರವನ್ನು ಪೈಲ್‌ಗಳಿಗೆ ಹಂಚುವ ದಪ್ಪ ಬ್ಲಾಕ್.'),
    },
    {
      id: 'piles', group: 'deep', color: '#6f7f8f', explode: [0, -0.4, 1],
      name: t('Piles', 'पाइल', 'ಪೈಲ್‌ಗಳು'),
      info: t('Long columns in the ground carrying load by end bearing on the hard stratum and by skin friction along their sides.', 'ज़मीन में लंबे स्तंभ जो कठोर परत पर सिरे के आधार और किनारों के घर्षण से भार उठाते हैं।', 'ನೆಲದಲ್ಲಿನ ಉದ್ದ ಕಂಬಗಳು; ಗಟ್ಟಿ ಪದರದ ಮೇಲೆ ತುದಿ ಆಧಾರ ಮತ್ತು ಬದಿಗಳ ಘರ್ಷಣೆಯಿಂದ ಭಾರ ಹೊರುತ್ತವೆ.'),
    },
    {
      id: 'columns', group: 'site', color: '#5f7d99', explode: [0, 1.4, 0],
      name: t('Columns and wall', 'कॉलम और दीवार', 'ಕಾಲಮ್ ಮತ್ತು ಗೋಡೆ'),
      info: t('What each footing carries: one column, two columns, a wall, a grid of columns.', 'हर नींव क्या उठाती है: एक कॉलम, दो कॉलम, एक दीवार, कॉलमों का जाल।', 'ಪ್ರತಿ ಅಡಿಪಾಯ ಏನು ಹೊರುತ್ತದೆ: ಒಂದು ಕಾಲಮ್, ಎರಡು ಕಾಲಮ್, ಗೋಡೆ, ಕಾಲಮ್‌ಗಳ ಜಾಲ.'),
    },
    {
      id: 'soil', group: 'site', color: '#a8865a', opacity: 0.22, minor: true, explode: [0, 0, -1],
      name: t('Soil', 'मिट्टी', 'ಮಣ್ಣು'),
      info: t('Footings are placed at least about 1 m below ground (IS 1904), on soil that can safely take the pressure.', 'नींव ज़मीन से कम से कम लगभग 1 m नीचे (IS 1904) ऐसी मिट्टी पर रखी जाती है जो दबाव सुरक्षित सह सके।', 'ಅಡಿಪಾಯಗಳನ್ನು ನೆಲದಿಂದ ಕನಿಷ್ಠ ಸುಮಾರು 1 m ಕೆಳಗೆ (IS 1904), ಒತ್ತಡ ಸುರಕ್ಷಿತವಾಗಿ ಹೊರುವ ಮಣ್ಣಿನ ಮೇಲೆ ಇಡಲಾಗುತ್ತದೆ.'),
    },
    {
      id: 'hard_stratum', group: 'site', color: '#6d6355', opacity: 0.5, minor: true, explode: [0, -0.6, -1],
      name: t('Hard stratum', 'कठोर परत', 'ಗಟ್ಟಿ ಪದರ'),
      info: t('Rock or dense soil deep down, where the piles end.', 'गहराई में चट्टान या घनी मिट्टी, जहाँ पाइल समाप्त होते हैं।', 'ಆಳದಲ್ಲಿನ ಬಂಡೆ ಅಥವಾ ದಟ್ಟ ಮಣ್ಣು; ಪೈಲ್‌ಗಳು ಅಲ್ಲಿ ಕೊನೆಯಾಗುತ್ತವೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front (section)', 'सामने (काट)', 'ಮುಂಭಾಗ (ಛೇದ)'), dir: [0.2, 0.3, 1] },
    { id: 'above', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0.4, 1, 0.7] },
  ],
  slices: [],
  animations: [],
};
