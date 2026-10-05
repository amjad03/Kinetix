// A nephron, the kidney's filtering unit, built in code as the textbook
// draws it: the glomerulus in Bowman's capsule at the top (in the cortex),
// the tubule winding down into the loop of Henle (in the medulla) and back,
// and the collecting duct. Not to scale: a real nephron is about 3 cm long
// and its tubes far thinner.
import { revolve, seeded, taperTube } from '../lib/shapes.mjs';
import { t } from '../lib/teaching.mjs';

const G = [-0.035, 0.045, 0]; // the glomerulus
const AFFERENT = [[-0.068, 0.074, 0], [-0.05, 0.066, 0], [-0.04, 0.058, 0], [-0.0375, 0.05, 0]];
const EFFERENT = [[-0.0325, 0.05, 0], [-0.028, 0.06, 0], [-0.016, 0.066, 0], [-0.004, 0.064, 0]];
const PCT = [[G[0], G[1] - 0.0125, 0], [-0.034, 0.026, 0.002], [-0.027, 0.021, -0.004], [-0.021, 0.029, 0.003], [-0.014, 0.02, -0.003], [-0.008, 0.028, 0.004], [-0.002, 0.019, -0.002], [0.005, 0.026, 0.003], [0.011, 0.018, 0], [0.012, 0.006, 0]];
const LOOP = [[0.012, 0.006, 0], [0.012, -0.03, 0], [0.012, -0.064, 0], [0.015, -0.072, 0], [0.021, -0.072, 0], [0.024, -0.064, 0], [0.024, -0.03, 0], [0.024, 0.008, 0]];
const DCT = [[0.024, 0.008, 0], [0.022, 0.02, 0.006], [0.012, 0.034, 0.009], [-0.004, 0.04, 0.01], [-0.022, 0.046, 0.009], [-0.012, 0.054, 0.008], [0.006, 0.05, 0.008], [0.022, 0.056, 0.006], [0.036, 0.05, 0.004], [0.05, 0.052, 0]];
const DUCT = [[0.05, 0.078, 0], [0.05, 0.02, 0], [0.05, -0.04, 0], [0.05, -0.088, 0]];
const CAPILLARIES = [...EFFERENT.slice(-1), [0.004, 0.034, -0.008], [-0.012, 0.03, -0.009], [-0.006, 0.014, -0.008], [0.008, 0.01, -0.006], [0.017, -0.02, -0.005], [0.018, -0.07, -0.005], [0.03, -0.07, -0.004], [0.03, -0.02, -0.005], [0.034, 0.03, -0.007], [0.04, 0.066, -0.004], [0.06, 0.076, 0]];

const tube = (THREE, pts, r0, r1 = r0, segments = 120) => taperTube(THREE, new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal'), r0, r1, { segments, radial: 12 });

export default {
  id: 'nephron',
  version: 1,
  order: 9,
  source: 'procedural',
  subject: 'Biology',
  classes: [10, 11],
  title: t('Nephron (kidney tubule)', 'वृक्काणु (नेफ्रॉन)', 'ನೆಫ್ರಾನ್ (ಮೂತ್ರಪಿಂಡದ ನಳಿಕೆ)'),
  summary: t(
    'Each kidney has about a million nephrons. Blood is filtered in the glomerulus; the tubule then takes back what the body needs, and what is left is urine.',
    'हर वृक्क में लगभग दस लाख वृक्काणु होते हैं। ग्लोमेरुलस में रक्त छनता है; फिर नलिका शरीर के लिए ज़रूरी चीज़ें वापस ले लेती है, और जो बचता है वह मूत्र है।',
    'ಪ್ರತಿ ಮೂತ್ರಪಿಂಡದಲ್ಲಿ ಸುಮಾರು ಹತ್ತು ಲಕ್ಷ ನೆಫ್ರಾನ್‌ಗಳಿವೆ. ಗ್ಲೋಮೆರುಲಸ್‌ನಲ್ಲಿ ರಕ್ತ ಸೋಸಲ್ಪಡುತ್ತದೆ; ನಂತರ ನಳಿಕೆ ದೇಹಕ್ಕೆ ಬೇಕಾದುದನ್ನು ಹಿಂಪಡೆಯುತ್ತದೆ, ಉಳಿದದ್ದು ಮೂತ್ರ.',
  ),
  keywords: ['nephron', 'kidney', 'excretion', 'excretory system', 'glomerulus', 'bowman\'s capsule', 'loop of henle', 'urine formation', 'filtration', 'reabsorption', 'excretory products and their elimination', 'life processes'],
  credit: 'Model built by KINETIX',
  groups: [
    { id: 'filter', name: t('Filter', 'छन्नी', 'ಸೋಸುಕ') },
    { id: 'tubule', name: t('Tubule', 'नलिका', 'ನಳಿಕೆ') },
    { id: 'blood', name: t('Blood vessels', 'रक्त वाहिकाएँ', 'ರಕ್ತನಾಳಗಳು') },
  ],
  build(THREE) {
    // Bowman's capsule: a cup open at the top, where the arterioles come in.
    const outline = [];
    for (let a = -90; a <= 48; a += 6) outline.push([0.0135 * Math.cos((a * Math.PI) / 180), 0.0135 * Math.sin((a * Math.PI) / 180)]);
    for (let a = 48; a >= -84; a -= 6) outline.push([0.0118 * Math.cos((a * Math.PI) / 180), 0.0118 * Math.sin((a * Math.PI) / 180)]);
    const capsule = revolve(THREE, outline.map(([r, y]) => [Math.max(r, 0.0006), y]), 48).translate(...G);
    // The glomerulus: a knot of capillaries, a seeded tangle inside the cup.
    const rnd = seeded(7);
    const knot = [AFFERENT[AFFERENT.length - 1]];
    for (let i = 0; i < 26; i++) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = 0.0055 + rnd() * 0.0035;
      knot.push([G[0] + r * Math.sqrt(1 - u * u) * Math.cos(a), G[1] - 0.001 + r * u * 0.9, G[2] + r * Math.sqrt(1 - u * u) * Math.sin(a)]);
    }
    knot.push(EFFERENT[0]);
    return {
      bowmans_capsule: capsule,
      glomerulus: tube(THREE, knot, 0.0011, 0.0011, 260),
      afferent_arteriole: tube(THREE, AFFERENT, 0.0024, 0.002, 40),
      efferent_arteriole: tube(THREE, EFFERENT, 0.0015, 0.0013, 40),
      capillaries: tube(THREE, CAPILLARIES, 0.0009, 0.0011, 200),
      proximal_tubule: tube(THREE, PCT, 0.0024, 0.0022, 140),
      loop_of_henle: tube(THREE, LOOP, 0.0016, 0.002, 120),
      distal_tubule: tube(THREE, DCT, 0.002, 0.0021, 140),
      collecting_duct: tube(THREE, DUCT, 0.003, 0.0034, 60),
    };
  },
  parts: [
    {
      id: 'bowmans_capsule', group: 'filter', color: '#f2d27a', opacity: 0.55, explode: [-0.6, 0.6, 0],
      name: t('Bowman\'s capsule', 'बोमन संपुट', 'ಬೋಮನ್‌ನ ಸಂಪುಟ'),
      info: t('A double-walled cup round the glomerulus. It collects the fluid filtered out of the blood (the filtrate) and passes it into the tubule.', 'ग्लोमेरुलस के चारों ओर दोहरी दीवार वाला प्याला। यह रक्त से छने द्रव (निस्यंद) को इकट्ठा करके नलिका में भेजता है।', 'ಗ್ಲೋಮೆರುಲಸ್‌ನ ಸುತ್ತ ಎರಡು ಗೋಡೆಯ ಬಟ್ಟಲು. ರಕ್ತದಿಂದ ಸೋಸಿದ ದ್ರವವನ್ನು (ಸೋಸಿದ ದ್ರವ) ಸಂಗ್ರಹಿಸಿ ನಳಿಕೆಗೆ ಕಳುಹಿಸುತ್ತದೆ.'),
    },
    {
      id: 'glomerulus', group: 'filter', color: '#d23c3c', explode: [-0.6, 0.9, 0.3],
      name: t('Glomerulus', 'ग्लोमेरुलस (केशिका गुच्छ)', 'ಗ್ಲೋಮೆರುಲಸ್ (ಲೋಮನಾಳ ಗುಚ್ಛ)'),
      info: t('A tight knot of capillaries. Blood here is under high pressure, so water, glucose, salts, amino acids and urea are squeezed out through the thin walls; blood cells and proteins are too big and stay in.', 'केशिकाओं का घना गुच्छा। यहाँ रक्त उच्च दाब पर होता है, इसलिए पानी, ग्लूकोज़, लवण, अमीनो अम्ल और यूरिया पतली दीवारों से बाहर निकलते हैं; रक्त कोशिकाएँ और प्रोटीन बड़े होने से अंदर रहते हैं।', 'ಲೋಮನಾಳಗಳ ಬಿಗಿಯಾದ ಗುಚ್ಛ. ಇಲ್ಲಿ ರಕ್ತ ಹೆಚ್ಚು ಒತ್ತಡದಲ್ಲಿರುತ್ತದೆ, ಹಾಗಾಗಿ ನೀರು, ಗ್ಲೂಕೋಸ್, ಲವಣಗಳು, ಅಮೈನೋ ಆಮ್ಲಗಳು ಮತ್ತು ಯೂರಿಯಾ ತೆಳು ಗೋಡೆಗಳ ಮೂಲಕ ಹೊರಬರುತ್ತವೆ; ರಕ್ತ ಕಣಗಳು ಮತ್ತು ಪ್ರೋಟೀನ್‌ಗಳು ದೊಡ್ಡದಾದ್ದರಿಂದ ಒಳಗೇ ಉಳಿಯುತ್ತವೆ.'),
    },
    {
      id: 'afferent_arteriole', group: 'blood', color: '#e04848', explode: [-0.9, 0.9, 0],
      name: t('Afferent arteriole', 'अभिवाही धमनिका', 'ಅಭಿವಾಹಿ ಅಪಧಮನಿಕೆ'),
      info: t('Brings blood from the renal artery into the glomerulus. It is wider than the vessel leaving, which keeps the pressure in the glomerulus high.', 'वृक्क धमनी से रक्त ग्लोमेरुलस में लाती है। यह बाहर जाने वाली वाहिका से चौड़ी है, जिससे ग्लोमेरुलस में दाब ऊँचा रहता है।', 'ಮೂತ್ರಪಿಂಡ ಅಪಧಮನಿಯಿಂದ ರಕ್ತವನ್ನು ಗ್ಲೋಮೆರುಲಸ್‌ಗೆ ತರುತ್ತದೆ. ಹೊರಹೋಗುವ ನಾಳಕ್ಕಿಂತ ಅಗಲವಾಗಿರುವುದರಿಂದ ಗ್ಲೋಮೆರುಲಸ್‌ನಲ್ಲಿ ಒತ್ತಡ ಹೆಚ್ಚಿರುತ್ತದೆ.'),
    },
    {
      id: 'efferent_arteriole', group: 'blood', color: '#c0405a', explode: [0, 1, 0],
      name: t('Efferent arteriole', 'अपवाही धमनिका', 'ಅಪವಾಹಿ ಅಪಧಮನಿಕೆ'),
      info: t('Carries the filtered blood out of the glomerulus, to the capillaries round the tubule.', 'छने हुए रक्त को ग्लोमेरुलस से बाहर, नलिका के चारों ओर की केशिकाओं तक ले जाती है।', 'ಸೋಸಿದ ರಕ್ತವನ್ನು ಗ್ಲೋಮೆರುಲಸ್‌ನಿಂದ ಹೊರಗೆ, ನಳಿಕೆಯ ಸುತ್ತಲಿನ ಲೋಮನಾಳಗಳಿಗೆ ಒಯ್ಯುತ್ತದೆ.'),
    },
    {
      id: 'capillaries', group: 'blood', color: '#9a4a8e', explode: [0, 0, -0.9],
      name: t('Capillaries round the tubule', 'नलिका के चारों ओर केशिकाएँ', 'ನಳಿಕೆಯ ಸುತ್ತಲಿನ ಲೋಮನಾಳಗಳು'),
      info: t('A network of capillaries wrapped round the tubule. Everything reabsorbed from the tubule goes back into the blood here, and on to the renal vein.', 'नलिका के चारों ओर लिपटा केशिकाओं का जाल। नलिका से पुनः अवशोषित सब कुछ यहीं रक्त में लौटता है, और आगे वृक्क शिरा में जाता है।', 'ನಳಿಕೆಯನ್ನು ಸುತ್ತಿಕೊಂಡಿರುವ ಲೋಮನಾಳಗಳ ಜಾಲ. ನಳಿಕೆಯಿಂದ ಮರುಹೀರಿಕೆಯಾದ ಎಲ್ಲವೂ ಇಲ್ಲಿ ರಕ್ತಕ್ಕೆ ಮರಳಿ ಮೂತ್ರಪಿಂಡ ಅಭಿಧಮನಿಗೆ ಹೋಗುತ್ತದೆ.'),
    },
    {
      id: 'proximal_tubule', group: 'tubule', color: '#f0a35e', explode: [-0.3, 0.3, 0.6],
      name: t('Proximal convoluted tubule', 'समीपस्थ कुंडलित नलिका', 'ಸಮೀಪಸ್ಥ ಸುರುಳಿ ನಳಿಕೆ'),
      info: t('The first, twisted part of the tubule. It takes back into the blood all the glucose and amino acids and most of the water and salts (selective reabsorption).', 'नलिका का पहला, मुड़ा हुआ भाग। यह सारा ग्लूकोज़ और अमीनो अम्ल तथा अधिकतर पानी और लवण वापस रक्त में ले लेता है (चयनात्मक पुनः अवशोषण)।', 'ನಳಿಕೆಯ ಮೊದಲ, ಸುರುಳಿಯಾದ ಭಾಗ. ಎಲ್ಲಾ ಗ್ಲೂಕೋಸ್ ಮತ್ತು ಅಮೈನೋ ಆಮ್ಲಗಳನ್ನು, ಹೆಚ್ಚಿನ ನೀರು ಮತ್ತು ಲವಣಗಳನ್ನು ರಕ್ತಕ್ಕೆ ಹಿಂಪಡೆಯುತ್ತದೆ (ಆಯ್ದ ಮರುಹೀರಿಕೆ).'),
    },
    {
      id: 'loop_of_henle', group: 'tubule', color: '#6db5e0', explode: [0, -0.8, 0.3],
      name: t('Loop of Henle', 'हेनले का लूप', 'ಹೆನ್ಲೆಯ ಕುಣಿಕೆ'),
      info: t('A long U-shaped loop dipping into the medulla. It takes back more water and salt, so the kidney can make urine more concentrated than blood.', 'मध्यांश में उतरता लंबा U-आकार का लूप। यह और पानी व लवण वापस लेता है, जिससे वृक्क रक्त से अधिक सांद्र मूत्र बना सकता है।', 'ಮಜ್ಜೆಯೊಳಗೆ ಇಳಿಯುವ ಉದ್ದ U-ಆಕಾರದ ಕುಣಿಕೆ. ಇನ್ನಷ್ಟು ನೀರು ಮತ್ತು ಲವಣ ಹಿಂಪಡೆಯುತ್ತದೆ, ಹಾಗಾಗಿ ಮೂತ್ರಪಿಂಡ ರಕ್ತಕ್ಕಿಂತ ಸಾಂದ್ರ ಮೂತ್ರ ತಯಾರಿಸಬಲ್ಲದು.'),
    },
    {
      id: 'distal_tubule', group: 'tubule', color: '#7fd18b', explode: [0.3, 0.5, 0.8],
      name: t('Distal convoluted tubule', 'दूरस्थ कुंडलित नलिका', 'ದೂರಸ್ಥ ಸುರುಳಿ ನಳಿಕೆ'),
      info: t('The last twisted part. It adjusts the salts and acidity, and some wastes (and medicines) are passed into it from the blood (secretion).', 'अंतिम मुड़ा हुआ भाग। यह लवण और अम्लता को संतुलित करता है, और कुछ अपशिष्ट (और दवाएँ) रक्त से इसमें डाले जाते हैं (स्रावण)।', 'ಕೊನೆಯ ಸುರುಳಿ ಭಾಗ. ಲವಣ ಮತ್ತು ಆಮ್ಲೀಯತೆಯನ್ನು ಸರಿಹೊಂದಿಸುತ್ತದೆ; ಕೆಲವು ತ್ಯಾಜ್ಯಗಳು (ಮತ್ತು ಔಷಧಗಳು) ರಕ್ತದಿಂದ ಇದಕ್ಕೆ ಸೇರುತ್ತವೆ (ಸ್ರವಿಸುವಿಕೆ).'),
    },
    {
      id: 'collecting_duct', group: 'tubule', color: '#9b8bd6', explode: [1, 0, 0],
      name: t('Collecting duct', 'संग्रह नलिका', 'ಸಂಗ್ರಹ ನಾಳ'),
      info: t('Many nephrons empty into it. It takes back more water when the body is short of it, then carries the urine to the pelvis of the kidney and the ureter.', 'कई वृक्काणु इसमें खुलते हैं। शरीर में पानी कम होने पर यह और पानी वापस लेती है, फिर मूत्र को वृक्क की श्रोणि और मूत्रवाहिनी तक ले जाती है।', 'ಅನೇಕ ನೆಫ್ರಾನ್‌ಗಳು ಇದಕ್ಕೆ ತೆರೆದುಕೊಳ್ಳುತ್ತವೆ. ದೇಹದಲ್ಲಿ ನೀರು ಕಡಿಮೆಯಾದಾಗ ಇನ್ನಷ್ಟು ನೀರು ಹಿಂಪಡೆದು, ಮೂತ್ರವನ್ನು ಮೂತ್ರಪಿಂಡದ ಸೊಂಟ ಮತ್ತು ಮೂತ್ರನಾಳಕ್ಕೆ ಒಯ್ಯುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0.05, 1] },
    { id: 'tilted', name: t('Tilted', 'तिरछा', 'ಓರೆಯಾಗಿ'), dir: [0.6, 0.3, 1] },
    { id: 'filter', name: t('The filter', 'छन्नी', 'ಸೋಸುಕ'), dir: [-0.5, 0.6, 1] },
  ],
  slices: [{ id: 'capsule', name: t('Through the capsule', 'संपुट के बीच से', 'ಸಂಪುಟದ ಮೂಲಕ'), normal: [0, 0, -1], offset: 0, view: 'filter' }],
  animations: [
    {
      id: 'urine', kind: 'flow',
      name: t('How urine is made', 'मूत्र कैसे बनता है', 'ಮೂತ್ರ ಹೇಗೆ ತಯಾರಾಗುತ್ತದೆ'),
      steps: [
        {
          color: '#ff6b6b', highlight: ['afferent_arteriole', 'glomerulus'],
          text: t('Blood with wastes comes in through the afferent arteriole into the glomerulus, under high pressure.', 'अपशिष्ट वाला रक्त अभिवाही धमनिका से उच्च दाब पर ग्लोमेरुलस में आता है।', 'ತ್ಯಾಜ್ಯವಿರುವ ರಕ್ತ ಅಭಿವಾಹಿ ಅಪಧಮನಿಕೆಯ ಮೂಲಕ ಹೆಚ್ಚು ಒತ್ತಡದಲ್ಲಿ ಗ್ಲೋಮೆರುಲಸ್‌ಗೆ ಬರುತ್ತದೆ.'),
          paths: [[...AFFERENT, G, ...EFFERENT]],
        },
        {
          color: '#ffe066', highlight: ['glomerulus', 'bowmans_capsule'],
          text: t('Filtration: water, glucose, salts, amino acids and urea pass into Bowman\'s capsule. This filtrate is about 180 litres a day.', 'निस्यंदन: पानी, ग्लूकोज़, लवण, अमीनो अम्ल और यूरिया बोमन संपुट में जाते हैं। यह निस्यंद लगभग 180 लीटर प्रतिदिन होता है।', 'ಸೋಸುವಿಕೆ: ನೀರು, ಗ್ಲೂಕೋಸ್, ಲವಣಗಳು, ಅಮೈನೋ ಆಮ್ಲಗಳು ಮತ್ತು ಯೂರಿಯಾ ಬೋಮನ್‌ನ ಸಂಪುಟಕ್ಕೆ ಹೋಗುತ್ತವೆ. ಈ ಸೋಸಿದ ದ್ರವ ದಿನಕ್ಕೆ ಸುಮಾರು 180 ಲೀಟರ್.'),
          paths: [[G, [G[0], G[1] - 0.008, 0], PCT[0]]],
        },
        {
          color: '#ffe066', highlight: ['proximal_tubule', 'capillaries'],
          text: t('Reabsorption: all the glucose and amino acids and most of the water and salts go back into the blood.', 'पुनः अवशोषण: सारा ग्लूकोज़ और अमीनो अम्ल तथा अधिकतर पानी और लवण वापस रक्त में जाते हैं।', 'ಮರುಹೀರಿಕೆ: ಎಲ್ಲಾ ಗ್ಲೂಕೋಸ್ ಮತ್ತು ಅಮೈನೋ ಆಮ್ಲಗಳು, ಹೆಚ್ಚಿನ ನೀರು ಮತ್ತು ಲವಣಗಳು ರಕ್ತಕ್ಕೆ ಮರಳುತ್ತವೆ.'),
          paths: [PCT],
        },
        {
          color: '#ffe066', highlight: ['loop_of_henle'],
          text: t('The loop of Henle takes back more water and salt; the fluid becomes more concentrated.', 'हेनले का लूप और पानी व लवण वापस लेता है; द्रव अधिक सांद्र हो जाता है।', 'ಹೆನ್ಲೆಯ ಕುಣಿಕೆ ಇನ್ನಷ್ಟು ನೀರು ಮತ್ತು ಲವಣ ಹಿಂಪಡೆಯುತ್ತದೆ; ದ್ರವ ಹೆಚ್ಚು ಸಾಂದ್ರವಾಗುತ್ತದೆ.'),
          paths: [LOOP],
        },
        {
          color: '#ffd23f', highlight: ['distal_tubule'],
          text: t('In the distal tubule salts are balanced and some wastes are added from the blood (secretion).', 'दूरस्थ नलिका में लवण संतुलित होते हैं और कुछ अपशिष्ट रक्त से जोड़े जाते हैं (स्रावण)।', 'ದೂರಸ್ಥ ನಳಿಕೆಯಲ್ಲಿ ಲವಣಗಳು ಸಮತೋಲನಗೊಳ್ಳುತ್ತವೆ, ಕೆಲವು ತ್ಯಾಜ್ಯಗಳು ರಕ್ತದಿಂದ ಸೇರುತ್ತವೆ (ಸ್ರವಿಸುವಿಕೆ).'),
          paths: [DCT],
        },
        {
          color: '#f2c94c', highlight: ['collecting_duct'],
          text: t('What is left is urine, about 1–2 litres a day. The collecting duct carries it towards the ureter and the bladder.', 'जो बचता है वह मूत्र है, लगभग 1–2 लीटर प्रतिदिन। संग्रह नलिका इसे मूत्रवाहिनी और मूत्राशय की ओर ले जाती है।', 'ಉಳಿದದ್ದು ಮೂತ್ರ, ದಿನಕ್ಕೆ ಸುಮಾರು 1–2 ಲೀಟರ್. ಸಂಗ್ರಹ ನಾಳ ಅದನ್ನು ಮೂತ್ರನಾಳ ಮತ್ತು ಮೂತ್ರಕೋಶದ ಕಡೆಗೆ ಒಯ್ಯುತ್ತದೆ.'),
          paths: [[DCT[DCT.length - 1], [0.05, 0.03, 0], ...DUCT.slice(2)]],
        },
      ],
    },
  ],
};
