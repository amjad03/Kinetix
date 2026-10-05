// Simple machines, built in code: a lever, a fixed pulley and an inclined
// plane, each with its load, effort and the distances that decide its
// mechanical advantage.
import { rod, revolve } from '../lib/shapes.mjs';
import { t, arrow, box, extrude, wire, arcPoints } from '../lib/teaching.mjs';

const GROUND = -0.04;
const EFFORT = '#e5533d', LOADC = '#8a6d4a', ARM1 = '#3d7be5', ARM2 = '#3fb56a';

/** A measuring line from [a] to [b] with a small tick across each end. */
function measure(THREE, a, b, across) {
  const tick = (p) => rod(THREE, p.map((v, k) => v - across[k] * 0.004), p.map((v, k) => v + across[k] * 0.004), 0.0008, 8);
  return [rod(THREE, a, b, 0.0009, 8), tick(a), tick(b)];
}

// Lever: fulcrum nearer the load, so a small effort lifts a heavy load.
const FX = -0.03, LX = -0.065, EX = 0.07, PLANK_Y = GROUND + 0.034;
// Inclined plane: 0.16 long at the base, 0.06 high.
const RAMP = { x0: -0.08, x1: 0.08, h: 0.06 };
const slope = Math.atan2(RAMP.h, RAMP.x1 - RAMP.x0);
const along = [Math.cos(slope), Math.sin(slope), 0], normal = [-Math.sin(slope), Math.cos(slope), 0];
const onSlope = (s, up = 0) => [RAMP.x0 + along[0] * s + normal[0] * up, GROUND + along[1] * s + normal[1] * up, 0];

export default {
  id: 'simple_machines',
  version: 1,
  order: 5,
  source: 'procedural',
  subject: 'Physics',
  classes: [6, 7, 9],
  title: t('Simple machines', 'सरल मशीनें', 'ಸರಳ ಯಂತ್ರಗಳು'),
  summary: t(
    'A lever, a pulley and an inclined plane: each lets a smaller effort move a load, or changes the direction of the push. Mechanical advantage = load ÷ effort.',
    'उत्तोलक, घिरनी और आनत तल: हर एक कम प्रयास से भार हिलाने देता है, या बल की दिशा बदल देता है। यांत्रिक लाभ = भार ÷ प्रयास।',
    'ಸನ್ನೆ, ರಾಟೆ ಮತ್ತು ಓರೆ ತಲ: ಪ್ರತಿಯೊಂದೂ ಕಡಿಮೆ ಪ್ರಯತ್ನದಿಂದ ಹೊರೆ ಸರಿಸಲು ಅಥವಾ ಬಲದ ದಿಕ್ಕು ಬದಲಿಸಲು ಸಹಾಯ ಮಾಡುತ್ತದೆ. ಯಾಂತ್ರಿಕ ಲಾಭ = ಹೊರೆ ÷ ಪ್ರಯತ್ನ.',
  ),
  keywords: ['simple machines', 'lever', 'fulcrum', 'pulley', 'inclined plane', 'mechanical advantage', 'load', 'effort', 'work and energy', 'force and pressure', 'moments', 'principle of moments'],
  credit: 'Model built by KINETIX',
  variants: [
    { id: 'lever', name: t('Lever', 'उत्तोलक', 'ಸನ್ನೆ') },
    { id: 'pulley', name: t('Pulley', 'घिरनी', 'ರಾಟೆ') },
    { id: 'ramp', name: t('Inclined plane', 'आनत तल', 'ಓರೆ ತಲ') },
  ],
  groups: [
    { id: 'machine', name: t('Machine', 'मशीन', 'ಯಂತ್ರ') },
    { id: 'forces', name: t('Load and effort', 'भार और प्रयास', 'ಹೊರೆ ಮತ್ತು ಪ್ರಯತ್ನ') },
    { id: 'distances', name: t('Distances', 'दूरियाँ', 'ದೂರಗಳು') },
  ],
  build(THREE) {
    // Pulley: a grooved wheel on an axle hanging from a beam, the rope over it.
    const wheel = revolve(THREE, [[0.005, -0.005], [0.024, -0.005], [0.02, 0], [0.024, 0.005], [0.005, 0.005]], 64).rotateX(Math.PI / 2).translate(0, 0.04, 0);
    const mid = arcPoints(THREE, [0, 0.04, 0], [-1, 0, 0], [0, 1, 0], 0.0205, 12);
    const rest = arcPoints(THREE, [0, 0.04, 0], [0, 1, 0], [1, 0, 0], 0.0205, 12);
    const rope = wire(THREE, [[-0.0205, -0.021, 0], [-0.0205, 0.01, 0], ...mid, ...rest.slice(1), [0.0205, 0.01, 0], [0.0205, -0.03, 0]], 0.0011, 120);
    const box0 = new THREE.BoxGeometry(0.024, 0.024, 0.024);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), slope);
    const rampLoad = box0.clone().applyQuaternion(q).translate(...onSlope(0.075, 0.012));
    return {
      lever_ground: box(THREE, [0.2, 0.004, 0.05], [0, GROUND - 0.002, 0]),
      ramp_ground: box(THREE, [0.2, 0.004, 0.05], [0, GROUND - 0.002, 0]),
      lever_plank: box(THREE, [0.16, 0.005, 0.03], [0, PLANK_Y, 0]),
      lever_fulcrum: extrude(THREE, [[FX - 0.016, GROUND], [FX + 0.016, GROUND], [FX, PLANK_Y - 0.0025]], 0.03),
      lever_load: box(THREE, [0.026, 0.026, 0.026], [LX, PLANK_Y + 0.0025 + 0.013, 0]),
      lever_effort: arrow(THREE, [EX, PLANK_Y + 0.05, 0], [EX, PLANK_Y + 0.004, 0], 0.0022),
      lever_load_arm: measure(THREE, [LX, PLANK_Y - 0.008, 0.02], [FX, PLANK_Y - 0.008, 0.02], [0, 1, 0]),
      lever_effort_arm: measure(THREE, [FX, PLANK_Y - 0.008, 0.02], [EX, PLANK_Y - 0.008, 0.02], [0, 1, 0]),
      pulley_beam: [box(THREE, [0.09, 0.008, 0.03], [0, 0.078, 0]), rod(THREE, [0, 0.074, -0.008], [0, 0.04, -0.008], 0.0015, 8), rod(THREE, [0, 0.074, 0.008], [0, 0.04, 0.008], 0.0015, 8)],
      pulley_wheel: [wheel, rod(THREE, [0, 0.04, -0.01], [0, 0.04, 0.01], 0.003, 16)],
      pulley_rope: rope,
      pulley_load: box(THREE, [0.026, 0.026, 0.026], [-0.0205, -0.034, 0]),
      pulley_effort: arrow(THREE, [0.0205, -0.03, 0], [0.0205, -0.07, 0], 0.0022),
      ramp_plane: extrude(THREE, [[RAMP.x0, GROUND], [RAMP.x1, GROUND], [RAMP.x1, GROUND + RAMP.h]], 0.04),
      ramp_load: rampLoad,
      ramp_effort: arrow(THREE, onSlope(0.092, 0.012), onSlope(0.14, 0.012), 0.0022),
      ramp_height: measure(THREE, [RAMP.x1 + 0.008, GROUND, 0.022], [RAMP.x1 + 0.008, GROUND + RAMP.h, 0.022], [1, 0, 0]),
      ramp_length: measure(THREE, onSlope(0, 0.006).map((v, k) => (k === 2 ? 0.022 : v)), onSlope(Math.hypot(RAMP.h, RAMP.x1 - RAMP.x0), 0.006).map((v, k) => (k === 2 ? 0.022 : v)), normal),
    };
  },
  parts: [
    ...['lever', 'ramp'].map((v) => ({ id: `${v}_ground`, variant: v, group: 'machine', color: '#6b5844', matte: true, minor: true, explode: [0, -0.5, 0], name: t('Ground', 'ज़मीन', 'ನೆಲ'), info: t('The machine rests on the ground.', 'मशीन ज़मीन पर टिकी है।', 'ಯಂತ್ರ ನೆಲದ ಮೇಲಿದೆ.') })),
    {
      id: 'lever_plank', variant: 'lever', group: 'machine', color: '#c9a36a', matte: true, explode: [0, 0.5, 0],
      name: t('Lever (a rigid bar)', 'उत्तोलक (एक दृढ़ छड़)', 'ಸನ್ನೆ (ಒಂದು ದೃಢ ದಂಡ)'),
      info: t('A rigid bar that turns about a fixed point. Seesaws, scissors and bottle openers are levers.', 'एक दृढ़ छड़ जो एक स्थिर बिंदु के चारों ओर घूमती है। सी-सॉ, कैंची और बोतल ओपनर उत्तोलक हैं।', 'ಒಂದು ಸ್ಥಿರ ಬಿಂದುವಿನ ಸುತ್ತ ತಿರುಗುವ ದೃಢ ದಂಡ. ಸೀಸಾ, ಕತ್ತರಿ ಮತ್ತು ಬಾಟಲ್ ಓಪನರ್ ಸನ್ನೆಗಳು.'),
    },
    {
      id: 'lever_fulcrum', variant: 'lever', group: 'machine', color: '#5d6670', matte: true, explode: [0, -0.4, 0],
      name: t('Fulcrum', 'आलंब', 'ಆಧಾರ ಬಿಂದು'),
      info: t('The fixed point the lever turns about. Moving it nearer the load makes the load easier to lift.', 'वह स्थिर बिंदु जिसके चारों ओर उत्तोलक घूमता है। इसे भार के पास लाने से भार उठाना आसान होता है।', 'ಸನ್ನೆ ತಿರುಗುವ ಸ್ಥಿರ ಬಿಂದು. ಇದನ್ನು ಹೊರೆಯ ಹತ್ತಿರ ಸರಿಸಿದರೆ ಹೊರೆ ಎತ್ತುವುದು ಸುಲಭ.'),
    },
    {
      id: 'lever_load', variant: 'lever', group: 'forces', color: LOADC, explode: [-0.4, 0.6, 0],
      name: t('Load', 'भार', 'ಹೊರೆ'),
      info: t('The weight to be lifted.', 'उठाया जाने वाला भार।', 'ಎತ್ತಬೇಕಾದ ಭಾರ.'),
    },
    {
      id: 'lever_effort', variant: 'lever', group: 'forces', color: EFFORT, glow: 0.2, explode: [0.4, 0.6, 0],
      name: t('Effort', 'प्रयास', 'ಪ್ರಯತ್ನ'),
      info: t('The push we apply. Law of the lever: load × load arm = effort × effort arm, so a long effort arm needs a small effort.', 'हमारे द्वारा लगाया गया बल। उत्तोलक का नियम: भार × भार भुजा = प्रयास × प्रयास भुजा, इसलिए लंबी प्रयास भुजा के लिए कम प्रयास चाहिए।', 'ನಾವು ಹಾಕುವ ಬಲ. ಸನ್ನೆಯ ನಿಯಮ: ಹೊರೆ × ಹೊರೆ ತೋಳು = ಪ್ರಯತ್ನ × ಪ್ರಯತ್ನ ತೋಳು, ಹಾಗಾಗಿ ಉದ್ದ ಪ್ರಯತ್ನ ತೋಳಿಗೆ ಕಡಿಮೆ ಪ್ರಯತ್ನ ಸಾಕು.'),
    },
    {
      id: 'lever_load_arm', variant: 'lever', group: 'distances', color: ARM1, explode: [0, 0, 0.6],
      name: t('Load arm', 'भार भुजा', 'ಹೊರೆ ತೋಳು'),
      info: t('The distance from the fulcrum to the load.', 'आलंब से भार तक की दूरी।', 'ಆಧಾರ ಬಿಂದುವಿನಿಂದ ಹೊರೆಯವರೆಗಿನ ದೂರ.'),
    },
    {
      id: 'lever_effort_arm', variant: 'lever', group: 'distances', color: ARM2, explode: [0, 0, 0.6],
      name: t('Effort arm', 'प्रयास भुजा', 'ಪ್ರಯತ್ನ ತೋಳು'),
      info: t('The distance from the fulcrum to the effort. Here it is about 3 times the load arm, so the effort is about a third of the load: mechanical advantage 3.', 'आलंब से प्रयास तक की दूरी। यहाँ यह भार भुजा की लगभग 3 गुनी है, इसलिए प्रयास भार का लगभग एक-तिहाई है: यांत्रिक लाभ 3।', 'ಆಧಾರ ಬಿಂದುವಿನಿಂದ ಪ್ರಯತ್ನದವರೆಗಿನ ದೂರ. ಇಲ್ಲಿ ಇದು ಹೊರೆ ತೋಳಿನ ಸುಮಾರು 3 ಪಟ್ಟು, ಹಾಗಾಗಿ ಪ್ರಯತ್ನ ಹೊರೆಯ ಸುಮಾರು ಮೂರನೇ ಒಂದು ಭಾಗ: ಯಾಂತ್ರಿಕ ಲಾಭ 3.'),
    },
    {
      id: 'pulley_beam', variant: 'pulley', group: 'machine', color: '#5d6670', matte: true, explode: [0, 0.6, 0],
      name: t('Support', 'आधार', 'ಆಧಾರ'),
      info: t('A fixed pulley hangs from a support and does not move up or down.', 'स्थिर घिरनी एक आधार से लटकी होती है और ऊपर-नीचे नहीं चलती।', 'ಸ್ಥಿರ ರಾಟೆ ಒಂದು ಆಧಾರದಿಂದ ನೇತಾಡುತ್ತದೆ, ಮೇಲೆ-ಕೆಳಗೆ ಚಲಿಸುವುದಿಲ್ಲ.'),
    },
    {
      id: 'pulley_wheel', variant: 'pulley', group: 'machine', color: '#c9a36a', explode: [0, 0.3, 0.5], spin: { axis: [0, 0, -1], speed: 60, centre: [0, 0.04, 0] },
      name: t('Pulley wheel', 'घिरनी का पहिया', 'ರಾಟೆಯ ಚಕ್ರ'),
      info: t('A grooved wheel turning on an axle. A single fixed pulley does not reduce the effort (mechanical advantage 1) but lets us pull down to lift up, which is easier. Used on wells and flagpoles.', 'धुरी पर घूमता खाँचेदार पहिया। एक स्थिर घिरनी प्रयास नहीं घटाती (यांत्रिक लाभ 1) पर ऊपर उठाने के लिए नीचे खींचने देती है, जो आसान है। कुओं और झंडे के खंभों पर उपयोग होती है।', 'ಅಕ್ಷದ ಮೇಲೆ ತಿರುಗುವ ಚಡಿಯುಳ್ಳ ಚಕ್ರ. ಒಂದು ಸ್ಥಿರ ರಾಟೆ ಪ್ರಯತ್ನವನ್ನು ಕಡಿಮೆ ಮಾಡುವುದಿಲ್ಲ (ಯಾಂತ್ರಿಕ ಲಾಭ 1), ಆದರೆ ಮೇಲೆತ್ತಲು ಕೆಳಗೆ ಎಳೆಯಲು ಬಿಡುತ್ತದೆ, ಅದು ಸುಲಭ. ಬಾವಿ ಮತ್ತು ಧ್ವಜಸ್ತಂಭಗಳಲ್ಲಿ ಬಳಸುತ್ತಾರೆ.'),
    },
    {
      id: 'pulley_rope', variant: 'pulley', group: 'machine', color: '#e8dcc0', explode: [0, 0, 0.3],
      name: t('Rope', 'रस्सी', 'ಹಗ್ಗ'),
      info: t('Runs over the wheel. The tension is the same all along it, so the effort equals the load.', 'पहिये के ऊपर से जाती है। इसमें तनाव हर जगह समान है, इसलिए प्रयास भार के बराबर है।', 'ಚಕ್ರದ ಮೇಲೆ ಹಾದುಹೋಗುತ್ತದೆ. ಇದರ ಉದ್ದಕ್ಕೂ ಸೆಳೆತ ಒಂದೇ, ಹಾಗಾಗಿ ಪ್ರಯತ್ನ ಹೊರೆಗೆ ಸಮ.'),
    },
    { id: 'pulley_load', variant: 'pulley', group: 'forces', color: LOADC, explode: [-0.5, -0.3, 0], name: t('Load', 'भार', 'ಹೊರೆ'), info: t('The weight being lifted.', 'उठाया जा रहा भार।', 'ಎತ್ತಲಾಗುತ್ತಿರುವ ಭಾರ.') },
    {
      id: 'pulley_effort', variant: 'pulley', group: 'forces', color: EFFORT, glow: 0.2, explode: [0.5, -0.3, 0],
      name: t('Effort (pull down)', 'प्रयास (नीचे खींचें)', 'ಪ್ರಯತ್ನ (ಕೆಳಗೆ ಎಳೆಯಿರಿ)'),
      info: t('Pulling down on this end lifts the load on the other: the pulley changes the direction of the force.', 'इस सिरे को नीचे खींचने से दूसरे सिरे का भार ऊपर उठता है: घिरनी बल की दिशा बदलती है।', 'ಈ ತುದಿಯನ್ನು ಕೆಳಗೆ ಎಳೆದರೆ ಇನ್ನೊಂದು ತುದಿಯ ಹೊರೆ ಮೇಲೇರುತ್ತದೆ: ರಾಟೆ ಬಲದ ದಿಕ್ಕು ಬದಲಿಸುತ್ತದೆ.'),
    },
    {
      id: 'ramp_plane', variant: 'ramp', group: 'machine', color: '#c9a36a', matte: true, explode: [0, -0.4, 0],
      name: t('Inclined plane', 'आनत तल', 'ಓರೆ ತಲ'),
      info: t('A sloping surface. Pushing a load up a gentle slope takes less force than lifting it straight up, but over a longer distance. Ramps, staircases and mountain roads use it.', 'एक ढलवाँ सतह। भार को हल्की ढलान पर ऊपर धकेलने में सीधे उठाने से कम बल लगता है, पर दूरी अधिक होती है। रैंप, सीढ़ियाँ और पहाड़ी सड़कें इसका उपयोग करती हैं।', 'ಇಳಿಜಾರಾದ ಮೇಲ್ಮೈ. ಹೊರೆಯನ್ನು ಸೌಮ್ಯ ಇಳಿಜಾರಿನಲ್ಲಿ ಮೇಲೆ ತಳ್ಳಲು ನೇರವಾಗಿ ಎತ್ತುವುದಕ್ಕಿಂತ ಕಡಿಮೆ ಬಲ ಸಾಕು, ಆದರೆ ದೂರ ಹೆಚ್ಚು. ರ್‍ಯಾಂಪ್, ಮೆಟ್ಟಿಲು ಮತ್ತು ಘಾಟಿ ರಸ್ತೆಗಳು ಇದನ್ನು ಬಳಸುತ್ತವೆ.'),
    },
    { id: 'ramp_load', variant: 'ramp', group: 'forces', color: LOADC, explode: [0, 0.6, 0], name: t('Load', 'भार', 'ಹೊರೆ'), info: t('The load being pushed up the slope.', 'ढलान पर ऊपर धकेला जा रहा भार।', 'ಇಳಿಜಾರಿನಲ್ಲಿ ಮೇಲೆ ತಳ್ಳಲಾಗುತ್ತಿರುವ ಹೊರೆ.') },
    {
      id: 'ramp_effort', variant: 'ramp', group: 'forces', color: EFFORT, glow: 0.2, explode: [0.4, 0.6, 0],
      name: t('Effort (along the slope)', 'प्रयास (ढलान की दिशा में)', 'ಪ್ರಯತ್ನ (ಇಳಿಜಾರಿನ ದಿಕ್ಕಿನಲ್ಲಿ)'),
      info: t('Ignoring friction, effort × length of slope = load × height.', 'घर्षण को छोड़कर, प्रयास × ढलान की लंबाई = भार × ऊँचाई।', 'ಘರ್ಷಣೆ ಬಿಟ್ಟು, ಪ್ರಯತ್ನ × ಇಳಿಜಾರಿನ ಉದ್ದ = ಹೊರೆ × ಎತ್ತರ.'),
    },
    {
      id: 'ramp_height', variant: 'ramp', group: 'distances', color: ARM2, explode: [0.5, 0, 0.5],
      name: t('Height (h)', 'ऊँचाई (h)', 'ಎತ್ತರ (h)'),
      info: t('How high the load is raised.', 'भार कितना ऊपर उठता है।', 'ಹೊರೆ ಎಷ್ಟು ಮೇಲೇರುತ್ತದೆ.'),
    },
    {
      id: 'ramp_length', variant: 'ramp', group: 'distances', color: ARM1, explode: [-0.3, 0.5, 0.5],
      name: t('Length of the slope (l)', 'ढलान की लंबाई (l)', 'ಇಳಿಜಾರಿನ ಉದ್ದ (l)'),
      info: t('Mechanical advantage = l ÷ h. Here the slope is about 2.8 times the height, so the effort is about 2.8 times smaller than the load.', 'यांत्रिक लाभ = l ÷ h। यहाँ ढलान ऊँचाई की लगभग 2.8 गुनी है, इसलिए प्रयास भार से लगभग 2.8 गुना कम है।', 'ಯಾಂತ್ರಿಕ ಲಾಭ = l ÷ h. ಇಲ್ಲಿ ಇಳಿಜಾರು ಎತ್ತರದ ಸುಮಾರು 2.8 ಪಟ್ಟು, ಹಾಗಾಗಿ ಪ್ರಯತ್ನ ಹೊರೆಗಿಂತ ಸುಮಾರು 2.8 ಪಟ್ಟು ಕಡಿಮೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0.1, 1] },
    { id: 'tilted', name: t('Tilted', 'तिरछा', 'ಓರೆಯಾಗಿ'), dir: [0.6, 0.4, 1] },
  ],
  slices: [],
  animations: [{ id: 'turn', kind: 'orbit', name: t('Turn the pulley', 'घिरनी घुमाएँ', 'ರಾಟೆ ತಿರುಗಿಸಿ') }],
};
