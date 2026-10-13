// School laboratory apparatus at real size, built in code from the outlines
// of standard glassware (borosilicate glass is turned on a lathe, so each
// piece is a solid of revolution): a titration set-up (burette on a retort
// stand over a conical flask), a measuring cylinder, test tubes in a rack,
// and a beaker heated on a tripod and gauze over a Bunsen burner.
import { revolve, rod } from '../lib/shapes.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

// Outlines are [radius, height] in metres, round the glass wall once.
const wall = (outer, thickness) => [...outer, ...outer.slice().reverse().map(([r, y]) => [Math.max(0, r - thickness), y + (r < 1e-6 ? thickness : 0)])];

/** A glass vessel: an outer outline from the bottom centre up to the rim, made [th] thick. */
function vessel(THREE, outer, th = 0.0014, seg = 72) {
  const inner = outer
    .slice()
    .reverse()
    .map(([r, y], i, a) => [r <= 1e-6 ? 0 : Math.max(0.0004, r - th), i === a.length - 1 ? y + th : y]);
  return revolve(THREE, [...outer, ...inner], seg);
}

/** The liquid in a vessel: a solid of revolution under [level], [r(y)] the inside radius. */
function liquid(THREE, r, y0, level, steps = 24) {
  const pts = [[0, y0]];
  for (let i = 0; i <= steps; i++) {
    const y = y0 + ((level - y0) * i) / steps;
    pts.push([r(y), y]);
  }
  pts.push([0, level]);
  return revolve(THREE, pts, 64);
}

const at = (g, x, y = 0, z = 0) => g.translate(x, y, z);

// Where things stand on the bench (x), front to back (z).
const X = { stand: -0.26, cylinder: -0.08, rack: 0.05, burner: 0.22 };
const BENCH_TOP = 0;

export default {
  id: 'lab_apparatus',
  version: 1,
  order: 6,
  source: 'procedural',
  subject: 'Chemistry',
  classes: [6, 7, 8, 9, 10, 11],
  title: t('Laboratory apparatus', 'प्रयोगशाला के उपकरण', 'ಪ್ರಯೋಗಾಲಯದ ಉಪಕರಣಗಳು'),
  summary: t(
    'The glassware and stands of a school laboratory at real size: titration with a burette and a conical flask, measuring liquids, test tubes, and heating a beaker over a Bunsen burner.',
    'विद्यालय प्रयोगशाला के काँच के उपकरण और स्टैंड असली आकार में: ब्यूरेट और शंक्वाकार फ्लास्क से अनुमापन, द्रव मापना, परखनलियाँ, और बुनसेन बर्नर पर बीकर गर्म करना।',
    'ಶಾಲಾ ಪ್ರಯೋಗಾಲಯದ ಗಾಜಿನ ಉಪಕರಣಗಳು ಮತ್ತು ಸ್ಟ್ಯಾಂಡ್‌ಗಳು ನೈಜ ಗಾತ್ರದಲ್ಲಿ: ಬ್ಯೂರೆಟ್ ಮತ್ತು ಶಂಕುವಿನಾಕಾರದ ಫ್ಲಾಸ್ಕ್‌ನಿಂದ ಅನುಮಾಪನ, ದ್ರವ ಅಳೆಯುವುದು, ಪರೀಕ್ಷಾ ನಳಿಕೆಗಳು ಮತ್ತು ಬುನ್ಸೆನ್ ಬರ್ನರ್ ಮೇಲೆ ಬೀಕರ್ ಕಾಯಿಸುವುದು.',
  ),
  keywords: ['beaker', 'flask', 'conical flask', 'test tube', 'burette', 'bunsen burner', 'retort stand', 'measuring cylinder', 'tripod', 'wire gauze', 'lab equipment', 'titration', 'apparatus', 'laboratory', 'acids bases and salts'],
  credit: 'Model built by KINETIX (standard glassware sizes)',
  build(THREE) {
    // Titration: retort stand, clamp, burette, conical flask on a white tile.
    const standBase = new THREE.BoxGeometry(0.16, 0.012, 0.12).translate(X.stand + 0.02, BENCH_TOP + 0.006, -0.02);
    const standRod = rod(THREE, [X.stand - 0.03, 0.012, -0.06], [X.stand - 0.03, 0.62, -0.06], 0.0055);
    const boss = new THREE.BoxGeometry(0.022, 0.026, 0.022).translate(X.stand - 0.03, 0.46, -0.06);
    const clampArm = rod(THREE, [X.stand - 0.03, 0.46, -0.06], [X.stand + 0.03, 0.46, 0.0], 0.004);
    const clampJaw = new THREE.TorusGeometry(0.0095, 0.0025, 8, 24).rotateX(Math.PI / 2).translate(X.stand + 0.035, 0.46, 0.0);
    const burette = vessel(THREE, [[0, 0.17], [0.0015, 0.17], [0.0016, 0.185], [0.0065, 0.2], [0.0065, 0.66], [0.0072, 0.665]], 0.0011, 40);
    const stopcock = [
      rod(THREE, [X.stand + 0.035 - 0.012, 0.192, 0], [X.stand + 0.035 + 0.012, 0.192, 0], 0.0028, 16),
      rod(THREE, [X.stand + 0.035 + 0.012, 0.192, 0], [X.stand + 0.035 + 0.018, 0.2, 0], 0.0022, 12),
    ];
    const buretteLiquid = liquid(THREE, () => 0.0052, 0.205, 0.6);
    const tile = new THREE.BoxGeometry(0.1, 0.006, 0.1).translate(X.stand + 0.035, 0.015, 0);
    const conical = [[0, 0], [0.04, 0], [0.042, 0.004], [0.0145, 0.09], [0.0135, 0.1], [0.0135, 0.132], [0.0152, 0.135]];
    const flask = vessel(THREE, conical, 0.0014);
    const coneR = (y) => 0.042 - 0.0014 - ((0.042 - 0.0145) * (y - 0.004)) / 0.086;
    const flaskLiquid = liquid(THREE, (y) => coneR(Math.max(0.004, y)), 0.0015, 0.035);
    // Measuring cylinder, 100 mL, on a hexagonal foot.
    const cylinderGlass = vessel(THREE, [[0, 0.01], [0.0145, 0.01], [0.0145, 0.25], [0.0165, 0.253]], 0.0013);
    const cylinderFoot = new THREE.CylinderGeometry(0.034, 0.036, 0.01, 6).translate(0, 0.005, 0);
    const cylinderLiquid = liquid(THREE, () => 0.0131, 0.0114, 0.17);
    const marks = [];
    for (let i = 1; i <= 10; i++) marks.push(new THREE.TorusGeometry(0.01465, 0.00035, 4, 40, Math.PI * 0.6).rotateX(Math.PI / 2).rotateY(Math.PI * 0.2).translate(0, 0.01 + i * 0.022, 0));
    // Test tubes in a wooden rack.
    const rackTop = new THREE.BoxGeometry(0.17, 0.008, 0.045).translate(0, 0.075, 0);
    const rackMid = new THREE.BoxGeometry(0.17, 0.006, 0.045).translate(0, 0.03, 0);
    const rackFoot = new THREE.BoxGeometry(0.17, 0.008, 0.06).translate(0, 0.004, 0);
    const rackEnds = [-0.083, 0.083].map((x) => new THREE.BoxGeometry(0.006, 0.08, 0.045).translate(x, 0.04, 0));
    const tubeX = [-0.055, -0.018, 0.018, 0.055];
    const tubeOuter = [[0, 0.012]];
    for (let i = 1; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      tubeOuter.push([0.0078 * Math.sin(a), 0.012 + 0.0078 * (1 - Math.cos(a))]);
    }
    tubeOuter.push([0.0078, 0.15], [0.0086, 0.152]);
    const tubes = tubeX.map((x) => at(vessel(THREE, tubeOuter, 0.0009, 40), x));
    const tubeIn = (y) => (y < 0.0198 ? Math.max(0.0005, Math.sqrt(Math.max(0, 0.0069 ** 2 - (0.0198 - y) ** 2))) : 0.0069);
    const levels = [0.07, 0.055, 0.085, 0.045];
    const tubeLiquids = tubeX.map((x, i) => at(liquid(THREE, tubeIn, 0.0131, levels[i]), x));
    // Heating: Bunsen burner under a tripod with wire gauze, a beaker on top.
    const burnerBase = new THREE.CylinderGeometry(0.038, 0.045, 0.012, 48).translate(0, 0.006, 0);
    const barrel = rod(THREE, [0, 0.012, 0], [0, 0.13, 0], 0.0072, 32);
    const collar = rod(THREE, [0, 0.025, 0], [0, 0.04, 0], 0.0092, 32);
    const gasInlet = rod(THREE, [0, 0.018, 0], [0.06, 0.018, 0], 0.004, 16);
    const flameOuter = revolve(THREE, [[0, 0.13], [0.0068, 0.132], [0.0085, 0.15], [0.006, 0.19], [0, 0.215]], 48);
    const flameInner = revolve(THREE, [[0, 0.131], [0.0055, 0.133], [0.004, 0.15], [0, 0.165]], 48);
    const tripodRing = new THREE.TorusGeometry(0.055, 0.0035, 10, 72).rotateX(Math.PI / 2).translate(0, 0.205, 0);
    const legs = [0, 1, 2].map((k) => {
      const a = (k * 2 * Math.PI) / 3 + Math.PI / 6;
      return rod(THREE, [0.055 * Math.cos(a), 0.205, 0.055 * Math.sin(a)], [0.075 * Math.cos(a), 0, 0.075 * Math.sin(a)], 0.0035, 12);
    });
    const gauze = new THREE.BoxGeometry(0.13, 0.002, 0.13).translate(0, 0.21, 0);
    const gauzeCentre = new THREE.CylinderGeometry(0.032, 0.032, 0.0026, 40).translate(0, 0.21, 0);
    const beakerOuter = [[0, 0], [0.033, 0], [0.035, 0.003], [0.035, 0.093], [0.0368, 0.096]];
    const beaker = at(vessel(THREE, beakerOuter, 0.0015), 0, 0.212);
    const beakerLiquid = at(liquid(THREE, () => 0.0333, 0.0016, 0.058), 0, 0.212);
    const bench = new THREE.BoxGeometry(0.72, 0.02, 0.26).translate(-0.01, -0.01, -0.01);
    return {
      bench,
      retort_stand: [standBase, standRod, boss, clampArm, clampJaw],
      burette: [at(burette, X.stand + 0.035), ...stopcock],
      burette_liquid: at(buretteLiquid, X.stand + 0.035),
      tile,
      conical_flask: at(flask, X.stand + 0.035, 0.018),
      flask_liquid: at(flaskLiquid, X.stand + 0.035, 0.018),
      measuring_cylinder: [at(cylinderGlass, X.cylinder), at(cylinderFoot, X.cylinder), ...marks.map((m) => at(m, X.cylinder))],
      cylinder_liquid: at(cylinderLiquid, X.cylinder),
      test_tubes: tubes.map((g) => at(g, X.rack, 0.0, 0.0)),
      tube_liquids: tubeLiquids.map((g) => at(g, X.rack)),
      rack: [rackTop, rackMid, rackFoot, ...rackEnds].map((g) => at(g, X.rack)),
      bunsen_burner: [burnerBase, barrel, collar, gasInlet].map((g) => at(g, X.burner)),
      flame: [at(flameOuter, X.burner), at(flameInner, X.burner)],
      tripod: [tripodRing, ...legs, gauze, gauzeCentre].map((g) => at(g, X.burner)),
      beaker: at(beaker, X.burner),
      beaker_liquid: at(beakerLiquid, X.burner),
    };
  },
  groups: [
    { id: 'glass', name: t('Glassware', 'काँच के उपकरण', 'ಗಾಜಿನ ಉಪಕರಣಗಳು') },
    { id: 'stands', name: t('Stands and heating', 'स्टैंड और तापन', 'ಸ್ಟ್ಯಾಂಡ್‌ಗಳು ಮತ್ತು ಕಾಯಿಸುವಿಕೆ') },
    { id: 'liquids', name: t('Liquids', 'द्रव', 'ದ್ರವಗಳು') },
  ],
  parts: [
    {
      id: 'burette', group: 'glass', color: '#d8eef5', opacity: 0.3, explode: [0, 0.4, 1],
      name: t('Burette', 'ब्यूरेट', 'ಬ್ಯೂರೆಟ್'),
      info: t('A long tube marked in 0.1 mL steps, with a tap (stopcock) at the bottom, to add a liquid drop by drop and read exactly how much was used, as in titration.', '0.1 mL के निशानों वाली लंबी नली, नीचे टोंटी (स्टॉपकॉक) के साथ, जिससे द्रव बूँद-बूँद डाला जाता है और ठीक-ठीक पढ़ा जाता है कि कितना लगा, जैसे अनुमापन में।', '0.1 mL ಗುರುತುಗಳಿರುವ ಉದ್ದನೆಯ ನಳಿಕೆ, ಕೆಳಗೆ ನಲ್ಲಿ (ಸ್ಟಾಪ್‌ಕಾಕ್); ದ್ರವವನ್ನು ಹನಿಹನಿಯಾಗಿ ಸೇರಿಸಿ ಎಷ್ಟು ಬಳಸಲಾಯಿತು ಎಂದು ನಿಖರವಾಗಿ ಓದಲು, ಅನುಮಾಪನದಲ್ಲಿ ಹಾಗೆ.'),
    },
    {
      id: 'conical_flask', group: 'glass', color: '#d8eef5', opacity: 0.3, explode: [0, -0.2, 1],
      name: t('Conical (Erlenmeyer) flask', 'शंक्वाकार (अर्लेनमेयर) फ्लास्क', 'ಶಂಕುವಿನಾಕಾರದ (ಎರ್ಲೆನ್‌ಮೇಯರ್) ಫ್ಲಾಸ್ಕ್'),
      info: t('Its narrow neck stops liquid splashing out when it is swirled; here the pink colour shows the end point of a titration with phenolphthalein.', 'इसकी पतली गर्दन घुमाने पर द्रव को छलकने से रोकती है; यहाँ गुलाबी रंग फ़िनॉल्फ़्थेलिन से अनुमापन का अंत बिंदु दिखाता है।', 'ಇದರ ಕಿರಿದಾದ ಕುತ್ತಿಗೆ ಅಲುಗಿಸಿದಾಗ ದ್ರವ ಚೆಲ್ಲದಂತೆ ತಡೆಯುತ್ತದೆ; ಇಲ್ಲಿ ಗುಲಾಬಿ ಬಣ್ಣ ಫಿನಾಲ್ಫ್ತಲೀನ್‌ನೊಂದಿಗೆ ಅನುಮಾಪನದ ಅಂತ್ಯಬಿಂದು ತೋರಿಸುತ್ತದೆ.'),
    },
    {
      id: 'measuring_cylinder', group: 'glass', color: '#d8eef5', opacity: 0.3, explode: [0, 0.2, 1],
      name: t('Measuring cylinder', 'मापक सिलिंडर', 'ಅಳತೆಯ ಸಿಲಿಂಡರ್'),
      info: t('Measures the volume of a liquid. Read the bottom of the curved surface (the meniscus) with your eye level with it.', 'द्रव का आयतन मापता है। वक्र सतह (मेनिस्कस) के निचले भाग को आँख के समतल रखकर पढ़ें।', 'ದ್ರವದ ಘನಫಲ ಅಳೆಯುತ್ತದೆ. ಬಾಗಿದ ಮೇಲ್ಮೈಯ (ಮೆನಿಸ್ಕಸ್) ಕೆಳಭಾಗವನ್ನು ಕಣ್ಣಿನ ಮಟ್ಟದಲ್ಲಿಟ್ಟು ಓದಿ.'),
    },
    {
      id: 'test_tubes', group: 'glass', color: '#d8eef5', opacity: 0.3, explode: [0, 0.6, 1],
      name: t('Test tubes', 'परखनलियाँ', 'ಪರೀಕ್ಷಾ ನಳಿಕೆಗಳು'),
      info: t('For small amounts of chemicals and quick tests. Heat one held at an angle, pointing away from everyone.', 'थोड़े रसायनों और त्वरित परीक्षणों के लिए। गर्म करते समय तिरछा पकड़ें, मुँह सबसे दूर रखें।', 'ಕಡಿಮೆ ಪ್ರಮಾಣದ ರಾಸಾಯನಿಕಗಳು ಮತ್ತು ತ್ವರಿತ ಪರೀಕ್ಷೆಗಳಿಗೆ. ಕಾಯಿಸುವಾಗ ಓರೆಯಾಗಿ ಹಿಡಿದು ಬಾಯಿ ಎಲ್ಲರಿಂದ ದೂರವಿರಲಿ.'),
    },
    {
      id: 'beaker', group: 'glass', color: '#d8eef5', opacity: 0.3, explode: [0, 1, 0.3],
      name: t('Beaker', 'बीकर', 'ಬೀಕರ್'),
      info: t('A wide glass with a lip for pouring, for mixing, heating and holding liquids. Its marks are only rough measures.', 'उँडेलने के लिए होंठ वाला चौड़ा गिलास, द्रव मिलाने, गर्म करने और रखने के लिए। इसके निशान केवल मोटे माप हैं।', 'ಸುರಿಯಲು ತುಟಿಯಿರುವ ಅಗಲವಾದ ಗಾಜಿನ ಪಾತ್ರೆ; ದ್ರವ ಬೆರೆಸಲು, ಕಾಯಿಸಲು, ಹಿಡಿದಿಡಲು. ಇದರ ಗುರುತುಗಳು ಸ್ಥೂಲ ಅಳತೆ ಮಾತ್ರ.'),
    },
    {
      id: 'retort_stand', group: 'stands', color: '#4a5560', explode: [-1, 0, -0.3],
      name: t('Retort stand and clamp', 'रिटॉर्ट स्टैंड और क्लैम्प', 'ರಿಟಾರ್ಟ್ ಸ್ಟ್ಯಾಂಡ್ ಮತ್ತು ಕ್ಲ್ಯಾಂಪ್'),
      info: t('A heavy base and a rod with a clamp that holds apparatus such as a burette steady.', 'भारी आधार और क्लैम्प वाली छड़ जो ब्यूरेट जैसे उपकरण को स्थिर थामती है।', 'ಭಾರವಾದ ತಳ ಮತ್ತು ಕ್ಲ್ಯಾಂಪ್ ಇರುವ ಸರಳು; ಬ್ಯೂರೆಟ್‌ನಂತಹ ಉಪಕರಣಗಳನ್ನು ಸ್ಥಿರವಾಗಿ ಹಿಡಿಯುತ್ತದೆ.'),
    },
    {
      id: 'rack', group: 'stands', color: '#b07a45', explode: [0, -0.4, -1],
      name: t('Test tube rack', 'परखनली स्टैंड', 'ಪರೀಕ್ಷಾ ನಳಿಕೆ ಸ್ಟ್ಯಾಂಡ್'),
      info: t('Holds test tubes upright.', 'परखनलियों को सीधा खड़ा रखता है।', 'ಪರೀಕ್ಷಾ ನಳಿಕೆಗಳನ್ನು ನೇರವಾಗಿ ನಿಲ್ಲಿಸುತ್ತದೆ.'),
    },
    {
      id: 'bunsen_burner', group: 'stands', color: '#8d969e', explode: [0, -1, 0.3],
      name: t('Bunsen burner', 'बुनसेन बर्नर', 'ಬುನ್ಸೆನ್ ಬರ್ನರ್'),
      info: t('Burns gas mixed with air. Turning the collar opens the air hole: more air gives a hot, clean blue flame; less gives a sooty yellow one.', 'हवा मिली गैस जलाता है। कॉलर घुमाने से वायु छिद्र खुलता है: अधिक हवा से गर्म, साफ़ नीली लौ; कम हवा से धुएँदार पीली लौ।', 'ಗಾಳಿ ಬೆರೆತ ಅನಿಲ ಉರಿಸುತ್ತದೆ. ಕಾಲರ್ ತಿರುಗಿಸಿದರೆ ಗಾಳಿ ರಂಧ್ರ ತೆರೆಯುತ್ತದೆ: ಹೆಚ್ಚು ಗಾಳಿಯಿಂದ ಬಿಸಿಯಾದ ಸ್ವಚ್ಛ ನೀಲಿ ಜ್ವಾಲೆ; ಕಡಿಮೆಯಿಂದ ಮಸಿಯ ಹಳದಿ ಜ್ವಾಲೆ.'),
    },
    {
      id: 'flame', group: 'stands', color: '#4f8dff', opacity: 0.55, glow: 0.9, minor: true, cap: false, explode: [0, -0.6, 0.3],
      name: t('Blue flame', 'नीली लौ', 'ನೀಲಿ ಜ್ವಾಲೆ'),
      info: t('The hottest part of the flame is just above the tip of the inner blue cone.', 'लौ का सबसे गर्म भाग भीतरी नीले शंकु की नोक के ठीक ऊपर होता है।', 'ಜ್ವಾಲೆಯ ಅತಿ ಬಿಸಿ ಭಾಗ ಒಳಗಿನ ನೀಲಿ ಶಂಕುವಿನ ತುದಿಯ ಸ್ವಲ್ಪ ಮೇಲೆ.'),
    },
    {
      id: 'tripod', group: 'stands', color: '#3d4247', explode: [0, 0.3, -1],
      name: t('Tripod and wire gauze', 'तिपाई और तार की जाली', 'ಮುಕ್ಕಾಲಿ ಮತ್ತು ತಂತಿ ಜಾಲರಿ'),
      info: t('Holds a beaker over the flame; the gauze spreads the heat evenly so the glass does not crack.', 'बीकर को लौ के ऊपर थामती है; जाली गर्मी को समान रूप से फैलाती है ताकि काँच न चटके।', 'ಬೀಕರನ್ನು ಜ್ವಾಲೆಯ ಮೇಲೆ ಹಿಡಿಯುತ್ತದೆ; ಜಾಲರಿ ಶಾಖವನ್ನು ಸಮವಾಗಿ ಹರಡಿ ಗಾಜು ಬಿರುಕು ಬಿಡದಂತೆ ಮಾಡುತ್ತದೆ.'),
    },
    {
      id: 'burette_liquid', group: 'liquids', color: '#e9f6ff', opacity: 0.45, minor: true, explode: [0, 0.4, 1],
      name: t('Alkali (sodium hydroxide solution)', 'क्षार (सोडियम हाइड्रॉक्साइड विलयन)', 'ಕ್ಷಾರ (ಸೋಡಿಯಂ ಹೈಡ್ರಾಕ್ಸೈಡ್ ದ್ರಾವಣ)'),
      info: t('Added from the burette until the colour just changes.', 'रंग बदलने तक ब्यूरेट से डाला जाता है।', 'ಬಣ್ಣ ಬದಲಾಗುವವರೆಗೆ ಬ್ಯೂರೆಟ್‌ನಿಂದ ಸೇರಿಸಲಾಗುತ್ತದೆ.'),
    },
    {
      id: 'flask_liquid', group: 'liquids', color: '#e8559c', opacity: 0.8, minor: true, explode: [0, -0.2, 1],
      name: t('Acid with indicator', 'सूचक के साथ अम्ल', 'ಸೂಚಕದೊಂದಿಗೆ ಆಮ್ಲ'),
      info: t('Phenolphthalein is colourless in acid and turns pink once all the acid has been neutralised.', 'फ़िनॉल्फ़्थेलिन अम्ल में रंगहीन रहता है और सारा अम्ल उदासीन होते ही गुलाबी हो जाता है।', 'ಫಿನಾಲ್ಫ್ತಲೀನ್ ಆಮ್ಲದಲ್ಲಿ ಬಣ್ಣರಹಿತ; ಎಲ್ಲಾ ಆಮ್ಲ ತಟಸ್ಥವಾದ ಕೂಡಲೇ ಗುಲಾಬಿಯಾಗುತ್ತದೆ.'),
    },
    {
      id: 'cylinder_liquid', group: 'liquids', color: '#7fc3ee', opacity: 0.7, minor: true, explode: [0, 0.2, 1],
      name: t('Water', 'पानी', 'ನೀರು'),
      info: t('About 75 mL.', 'लगभग 75 mL।', 'ಸುಮಾರು 75 mL.'),
    },
    {
      id: 'tube_liquids', group: 'liquids', color: '#e2a93b', opacity: 0.8, minor: true, explode: [0, 0.6, 1],
      name: t('Solutions to test', 'परखने के विलयन', 'ಪರೀಕ್ಷಿಸುವ ದ್ರಾವಣಗಳು'),
      info: t('Small amounts of solutions to test.', 'परखने के लिए थोड़े विलयन।', 'ಪರೀಕ್ಷಿಸಲು ಕಡಿಮೆ ಪ್ರಮಾಣದ ದ್ರಾವಣಗಳು.'),
    },
    {
      id: 'beaker_liquid', group: 'liquids', color: '#2f7fd6', opacity: 0.8, minor: true, explode: [0, 1, 0.3],
      name: t('Copper sulphate solution', 'कॉपर सल्फ़ेट विलयन', 'ತಾಮ್ರದ ಸಲ್ಫೇಟ್ ದ್ರಾವಣ'),
      info: t('Blue copper sulphate solution being warmed.', 'गर्म किया जा रहा नीला कॉपर सल्फ़ेट विलयन।', 'ಕಾಯಿಸಲಾಗುತ್ತಿರುವ ನೀಲಿ ತಾಮ್ರದ ಸಲ್ಫೇಟ್ ದ್ರಾವಣ.'),
    },
    {
      id: 'tile', group: 'stands', color: '#f4f4f2', minor: true, explode: [0, -0.5, 1],
      name: t('White tile', 'सफ़ेद टाइल', 'ಬಿಳಿ ಟೈಲ್'),
      info: t('Makes the colour change easy to see.', 'रंग परिवर्तन आसानी से दिखाता है।', 'ಬಣ್ಣ ಬದಲಾವಣೆ ಸುಲಭವಾಗಿ ಕಾಣುವಂತೆ ಮಾಡುತ್ತದೆ.'),
    },
    {
      id: 'bench', group: 'stands', color: '#2b2f33', minor: true, matte: true, explode: [0, -1.5, 0],
      name: t('Laboratory bench', 'प्रयोगशाला की मेज़', 'ಪ್ರಯೋಗಾಲಯದ ಮೇಜು'),
      info: t('A chemical-resistant bench top.', 'रसायन-रोधी मेज़ की सतह।', 'ರಾಸಾಯನಿಕ ನಿರೋಧಕ ಮೇಜಿನ ಮೇಲ್ಮೈ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.15, 0.32, 1] },
    { id: 'titration', name: t('Titration', 'अनुमापन', 'ಅನುಮಾಪನ'), dir: [-0.5, 0.2, 1] },
    { id: 'heating', name: t('Heating', 'तापन', 'ಕಾಯಿಸುವಿಕೆ'), dir: [0.7, 0.35, 1] },
  ],
  slices: [],
  animations: [],
};
