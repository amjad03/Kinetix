// The Apollo Lunar Module, the lander that took two astronauts from orbit
// round the Moon to its surface and back, from NASA 3D Resources (public
// domain). The file's pieces (with their textures) are sorted into the parts
// a class names by where they sit. Downloaded on first use.
const t = (en, hi, kn) => ({ en, hi, kn });

/** Which part a triangle with centre [x, y, z] belongs to (source units, y up, axis at x = z = 0). */
function partOf(x, y, z) {
  const r = Math.hypot(x, z);
  if (y < 0.45) return 'footpads';
  if (y < 2.75 && r > 1.95) return 'legs';
  if (y < 1.45 && r < 0.75) return 'descent_engine';
  if (y < 2.62) return 'descent_stage';
  return 'ascent_stage';
}

export default {
  id: 'apollo_lunar_module',
  version: 1,
  remote: true,
  topic: 'solar',
  license: 'Public domain',
  subject: 'Geography',
  classes: [6, 7, 8],
  title: t('Apollo Lunar Module', 'अपोलो चंद्र मॉड्यूल', 'ಅಪೊಲೊ ಚಂದ್ರ ಮಾಡ್ಯೂಲ್'),
  summary: t(
    'The lander that took two astronauts from orbit round the Moon down to its surface and back, six times from 1969 to 1972. Its lower half stayed on the Moon as a launch pad.',
    'वह लैंडर जो दो अंतरिक्ष यात्रियों को चंद्रमा की कक्षा से उसकी सतह तक ले गया और वापस लाया, 1969 से 1972 तक छह बार। इसका निचला आधा भाग प्रक्षेपण मंच बनकर चंद्रमा पर ही रह गया।',
    'ಇಬ್ಬರು ಗಗನಯಾತ್ರಿಗಳನ್ನು ಚಂದ್ರನ ಕಕ್ಷೆಯಿಂದ ಅದರ ಮೇಲ್ಮೈಗೆ ಇಳಿಸಿ ಮರಳಿ ತಂದ ಲ್ಯಾಂಡರ್; 1969 ರಿಂದ 1972ರವರೆಗೆ ಆರು ಬಾರಿ. ಇದರ ಕೆಳಗಿನ ಅರ್ಧ ಉಡಾವಣಾ ವೇದಿಕೆಯಾಗಿ ಚಂದ್ರನ ಮೇಲೆಯೇ ಉಳಿಯಿತು.',
  ),
  keywords: ['moon', 'lander', 'apollo', 'lunar module', 'space exploration', 'moon landing', 'gravity', 'armstrong', 'chandrayaan', 'the moon'],
  credit: 'Apollo Lunar Module, NASA 3D Resources, public domain (NASA media usage guidelines)',
  sources: {
    lander: { file: 'nasa/apollo_lm.glb', url: 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Apollo%20Lunar%20Module/Apollo%20Lunar%20Module.glb' },
  },
  size: 0.6,
  detail: 0.5,
  error: 0.001,
  async import(k) {
    const groups = {};
    for (const p of k.worldPrimitives(await k.readSource(k.source('lander')))) {
      for (const id of ['footpads', 'legs', 'descent_engine', 'descent_stage', 'ascent_stage']) {
        const piece = k.clipRich(p, (x, y, z) => partOf(x, y, z) === id);
        if (piece.indices.length) (groups[id] ||= []).push({ ...piece, path: `${id}${groups[id]?.length ?? 0}` });
      }
    }
    return Object.fromEntries(Object.entries(groups).map(([id, list]) => [id, k.joinTextures(list)]));
  },
  groups: [
    { id: 'ascent', name: t('Ascent stage (came back up)', 'आरोहण चरण (वापस ऊपर गया)', 'ಆರೋಹಣ ಹಂತ (ಮರಳಿ ಮೇಲೇರಿತು)') },
    { id: 'descent', name: t('Descent stage (stayed on the Moon)', 'अवरोहण चरण (चंद्रमा पर रहा)', 'ಅವರೋಹಣ ಹಂತ (ಚಂದ್ರನ ಮೇಲೆ ಉಳಿಯಿತು)') },
  ],
  parts: [
    {
      id: 'ascent_stage', group: 'ascent', color: '#c7c9cc', explode: [0, 0.7, 0],
      name: t('Ascent stage (crew cabin)', 'आरोहण चरण (दल का केबिन)', 'ಆರೋಹಣ ಹಂತ (ಸಿಬ್ಬಂದಿ ಕ್ಯಾಬಿನ್)'),
      info: t(
        'The cabin where the two astronauts stood, with triangular windows and its own rocket engine. It lifted off from the Moon to meet the command module in orbit.',
        'वह केबिन जिसमें दोनों अंतरिक्ष यात्री खड़े रहते थे, त्रिकोणीय खिड़कियों और अपने रॉकेट इंजन के साथ। यह चंद्रमा से उड़कर कक्षा में कमांड मॉड्यूल से मिलता था।',
        'ಇಬ್ಬರು ಗಗನಯಾತ್ರಿಗಳು ನಿಂತಿದ್ದ ಕ್ಯಾಬಿನ್; ತ್ರಿಕೋನ ಕಿಟಕಿಗಳು ಮತ್ತು ತನ್ನದೇ ರಾಕೆಟ್ ಎಂಜಿನ್ ಇದೆ. ಇದು ಚಂದ್ರನಿಂದ ಹಾರಿ ಕಕ್ಷೆಯಲ್ಲಿ ಕಮಾಂಡ್ ಮಾಡ್ಯೂಲ್ ಅನ್ನು ಸೇರುತ್ತಿತ್ತು.',
      ),
    },
    {
      id: 'descent_stage', group: 'descent', color: '#c9a24a', explode: [0, 0.05, 0],
      name: t('Descent stage', 'अवरोहण चरण', 'ಅವರೋಹಣ ಹಂತ'),
      info: t(
        'An eight-sided box wrapped in gold foil that reflects the Sun\'s heat. It held the fuel for landing, water, oxygen and the astronauts\' tools.',
        'सुनहरी पन्नी में लिपटा आठ-भुजाओं वाला डिब्बा, जो सूर्य की गर्मी परावर्तित करता है। इसमें उतरने का ईंधन, पानी, ऑक्सीजन और यात्रियों के औज़ार रहते थे।',
        'ಸೂರ್ಯನ ಶಾಖವನ್ನು ಪ್ರತಿಫಲಿಸುವ ಚಿನ್ನದ ಹಾಳೆಯಲ್ಲಿ ಸುತ್ತಿದ ಎಂಟು ಬದಿಯ ಪೆಟ್ಟಿಗೆ. ಇಳಿಯುವ ಇಂಧನ, ನೀರು, ಆಮ್ಲಜನಕ ಮತ್ತು ಗಗನಯಾತ್ರಿಗಳ ಉಪಕರಣಗಳು ಇದರಲ್ಲಿದ್ದವು.',
      ),
    },
    {
      id: 'descent_engine', group: 'descent', color: '#55585c', explode: [0, -0.45, 0],
      name: t('Descent engine', 'अवरोहण इंजन', 'ಅವರೋಹಣ ಎಂಜಿನ್'),
      info: t(
        'A rocket engine whose thrust could be turned up and down, so the lander could slow down and hover before touching the ground. The Moon has no air, so parachutes would not work.',
        'ऐसा रॉकेट इंजन जिसका बल घटाया-बढ़ाया जा सकता था, ताकि लैंडर धीमा होकर ज़मीन छूने से पहले ठहर सके। चंद्रमा पर हवा नहीं है, इसलिए पैराशूट काम नहीं करते।',
        'ಒತ್ತಡವನ್ನು ಹೆಚ್ಚು-ಕಡಿಮೆ ಮಾಡಬಹುದಾದ ರಾಕೆಟ್ ಎಂಜಿನ್; ಇದರಿಂದ ಲ್ಯಾಂಡರ್ ನಿಧಾನಗೊಂಡು ನೆಲ ಮುಟ್ಟುವ ಮೊದಲು ಗಾಳಿಯಲ್ಲಿ ನಿಲ್ಲುತ್ತಿತ್ತು. ಚಂದ್ರನಲ್ಲಿ ಗಾಳಿ ಇಲ್ಲ, ಆದ್ದರಿಂದ ಪ್ಯಾರಾಶೂಟ್ ಕೆಲಸ ಮಾಡುವುದಿಲ್ಲ.',
      ),
    },
    {
      id: 'legs', group: 'descent', color: '#b8a36a', explode: [0, -0.1, 0],
      name: t('Landing legs', 'उतरने वाले पैर', 'ಇಳಿಯುವ ಕಾಲುಗಳು'),
      info: t(
        'Four folding legs with crushable shock absorbers that soaked up the bump of landing. A ladder on the front leg led down to the surface.',
        'चार मुड़ने वाले पैर, जिनके दबने वाले झटका-रोधक उतरते समय का धक्का सोख लेते थे। आगे वाले पैर पर लगी सीढ़ी सतह तक जाती थी।',
        'ಇಳಿಯುವಾಗಿನ ಆಘಾತವನ್ನು ಹೀರಿಕೊಳ್ಳುವ ಕುಗ್ಗುವ ಆಘಾತ-ನಿರೋಧಕಗಳಿರುವ ನಾಲ್ಕು ಮಡಚುವ ಕಾಲುಗಳು. ಮುಂದಿನ ಕಾಲಿನ ಮೇಲಿನ ಏಣಿ ಮೇಲ್ಮೈಗೆ ಇಳಿಯುತ್ತಿತ್ತು.',
      ),
    },
    {
      id: 'footpads', group: 'descent', color: '#a8a28f', explode: [0, -0.3, 0],
      name: t('Footpads', 'पैरों की तश्तरियाँ', 'ಪಾದದ ತಟ್ಟೆಗಳು'),
      info: t(
        'Wide dish-shaped feet that spread the lander\'s weight so it would not sink into the Moon\'s dust.',
        'चौड़े तश्तरी जैसे पैर जो लैंडर का भार फैला देते थे ताकि वह चंद्रमा की धूल में न धँसे।',
        'ಲ್ಯಾಂಡರ್‌ನ ಭಾರವನ್ನು ಹರಡಿ ಅದು ಚಂದ್ರನ ಧೂಳಿನಲ್ಲಿ ಹೂತುಹೋಗದಂತೆ ತಡೆಯುವ ಅಗಲವಾದ ತಟ್ಟೆಯಾಕಾರದ ಪಾದಗಳು.',
      ),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.5, 0.3, 1] },
    { id: 'below', name: t('From below', 'नीचे से', 'ಕೆಳಗಿನಿಂದ'), dir: [0.6, -0.5, 1] },
  ],
  slices: [],
  animations: [],
};
