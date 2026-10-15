// The Saturn V rocket that launched the Apollo missions to the Moon, from
// NASA 3D Resources (public domain). The file's pieces (and its painted
// decals, each with its own picture) are cut by height into the stages a class
// names. Downloaded on first use.
import sharp from 'sharp';

const t = (en, hi, kn) => ({ en, hi, kn });

/**
 * The file paints the first stage's "USA" band navy blue all round (the small
 * flags on a dark field); on the rocket that flew it is white, so the dark
 * field is made white and the flags kept.
 */
async function whiteField(texture) {
  const { data, info } = await sharp(Buffer.from(texture.data)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 3) {
    if (data[i] < 40 && data[i + 1] < 40 && data[i + 2] > 70) data[i] = data[i + 1] = data[i + 2] = 244;
  }
  return { ...texture, data: await sharp(data, { raw: info }).png().toBuffer(), mime: 'image/png', source: undefined };
}

/** Heights (source units, y up) where one part ends and the next begins, bottom to top. */
const tops = [
  ['engines', 0.56],
  ['first_stage', 4.55],
  ['second_stage', 7.86],
  ['third_stage', 10.06],
  ['instrument_unit', 10.3],
  ['lm_adapter', 10.98],
  ['service_module', 11.42],
  ['command_module', 11.84],
  ['escape_tower', Infinity],
];

export default {
  id: 'saturn_v',
  version: 1,
  order: 1,
  remote: true,
  topic: 'solar',
  license: 'Public domain',
  subject: 'Physics',
  classes: [8, 9, 11],
  title: t('Saturn V rocket', 'सैटर्न V रॉकेट', 'ಸ್ಯಾಟರ್ನ್ V ರಾಕೆಟ್'),
  summary: t(
    'The rocket that sent people to the Moon (1967 to 1973): 111 m tall, with three stages that burn in turn and drop away, and the Apollo spacecraft on top.',
    'वह रॉकेट जिसने मनुष्यों को चंद्रमा पर भेजा (1967 से 1973): 111 मीटर ऊँचा, तीन चरण जो बारी-बारी से जलकर अलग हो जाते हैं, और सबसे ऊपर अपोलो अंतरिक्ष यान।',
    'ಮಾನವರನ್ನು ಚಂದ್ರನಿಗೆ ಕಳುಹಿಸಿದ ರಾಕೆಟ್ (1967 ರಿಂದ 1973): 111 ಮೀ ಎತ್ತರ, ಸರದಿಯಲ್ಲಿ ಉರಿದು ಬೇರ್ಪಡುವ ಮೂರು ಹಂತಗಳು, ಮತ್ತು ತುದಿಯಲ್ಲಿ ಅಪೊಲೊ ಬಾಹ್ಯಾಕಾಶ ನೌಕೆ.',
  ),
  keywords: ['rocket', 'saturn v', 'launch', 'newton third law', 'space', 'stages', 'apollo', 'moon', 'thrust', 'force and pressure', 'space exploration'],
  credit: 'Saturn V, NASA 3D Resources, public domain (NASA media usage guidelines)',
  sources: {
    rocket: { file: 'nasa/saturn_v.glb', url: 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Saturn%20V/Saturn%20V.glb' },
  },
  size: 1.1,
  async import(k) {
    const prims = k.worldPrimitives(await k.readSource(k.source('rocket')));
    for (const p of prims) if (p.material.name === 'blinn8SG' && p.material.texture) p.material.texture = await whiteField(p.material.texture);
    const out = {};
    let below = -Infinity;
    for (const [id, top] of tops) {
      const lo = below;
      const pieces = prims.map((p) => k.clipRich(p, (x, y) => y >= lo && y < top)).filter((p) => p.indices.length);
      out[id] = k.joinTextures(pieces.map((p, i) => ({ ...p, path: `${id}${i}` })));
      below = top;
    }
    return out;
  },
  groups: [
    { id: 'spacecraft', name: t('Apollo spacecraft', 'अपोलो अंतरिक्ष यान', 'ಅಪೊಲೊ ಬಾಹ್ಯಾಕಾಶ ನೌಕೆ') },
    { id: 'rocket', name: t('Rocket stages', 'रॉकेट के चरण', 'ರಾಕೆಟ್ ಹಂತಗಳು') },
  ],
  parts: [
    {
      id: 'escape_tower', group: 'spacecraft', color: '#d8462f', explode: [0, 0.75, 0],
      name: t('Launch escape tower', 'प्रक्षेपण बचाव टावर', 'ಉಡಾವಣಾ ತುರ್ತು ಪಾರು ಗೋಪುರ'),
      info: t(
        'A small rocket on a tower that could pull the crew in the command module away if the launch went wrong. It was thrown away about three minutes after lift-off.',
        'टावर पर लगा छोटा रॉकेट, जो प्रक्षेपण बिगड़ने पर कमांड मॉड्यूल में बैठे दल को दूर खींच सकता था। उड़ान के लगभग तीन मिनट बाद इसे अलग कर दिया जाता था।',
        'ಉಡಾವಣೆ ತಪ್ಪಿದರೆ ಕಮಾಂಡ್ ಮಾಡ್ಯೂಲ್‌ನಲ್ಲಿದ್ದ ಸಿಬ್ಬಂದಿಯನ್ನು ದೂರ ಎಳೆಯಬಲ್ಲ, ಗೋಪುರದ ಮೇಲಿನ ಸಣ್ಣ ರಾಕೆಟ್. ಹಾರಿದ ಸುಮಾರು ಮೂರು ನಿಮಿಷಗಳ ನಂತರ ಇದನ್ನು ಬಿಡಲಾಗುತ್ತಿತ್ತು.',
      ),
    },
    {
      id: 'command_module', group: 'spacecraft', color: '#cfd3d6', explode: [0, 0.62, 0],
      name: t('Command module', 'कमांड मॉड्यूल', 'ಕಮಾಂಡ್ ಮಾಡ್ಯೂಲ್'),
      info: t(
        'The cone where the three astronauts sat. It was the only part that came back to Earth, protected by its heat shield.',
        'वह शंकु जिसमें तीनों अंतरिक्ष यात्री बैठते थे। केवल यही भाग अपनी ऊष्मा-ढाल के सहारे पृथ्वी पर लौटता था।',
        'ಮೂವರು ಗಗನಯಾತ್ರಿಗಳು ಕುಳಿತಿದ್ದ ಶಂಕು. ಉಷ್ಣ ಕವಚದ ರಕ್ಷಣೆಯಲ್ಲಿ ಭೂಮಿಗೆ ಮರಳುತ್ತಿದ್ದ ಭಾಗ ಇದೊಂದೇ.',
      ),
    },
    {
      id: 'service_module', group: 'spacecraft', color: '#b9bec4', explode: [0, 0.5, 0],
      name: t('Service module', 'सर्विस मॉड्यूल', 'ಸರ್ವಿಸ್ ಮಾಡ್ಯೂಲ್'),
      info: t(
        'Carried oxygen, water, electricity and the engine that put the spacecraft into orbit round the Moon and brought it back.',
        'ऑक्सीजन, पानी, बिजली और वह इंजन रखता था जो यान को चंद्रमा की कक्षा में ले गया और वापस लाया।',
        'ಆಮ್ಲಜನಕ, ನೀರು, ವಿದ್ಯುತ್ ಮತ್ತು ನೌಕೆಯನ್ನು ಚಂದ್ರನ ಕಕ್ಷೆಗೆ ಸೇರಿಸಿ ಮರಳಿ ತಂದ ಎಂಜಿನ್ ಇದರಲ್ಲಿತ್ತು.',
      ),
    },
    {
      id: 'lm_adapter', group: 'spacecraft', color: '#c9cdd1', explode: [0, 0.38, 0],
      name: t('Lunar module adapter', 'चंद्र मॉड्यूल एडेप्टर', 'ಚಂದ್ರ ಮಾಡ್ಯೂಲ್ ಅಡಾಪ್ಟರ್'),
      info: t(
        'A cone of panels that hid the lunar module, the lander that took two astronauts down to the Moon\'s surface.',
        'पैनलों का शंकु जिसके भीतर चंद्र मॉड्यूल छिपा रहता था, वह लैंडर जो दो अंतरिक्ष यात्रियों को चंद्रमा की सतह पर उतारता था।',
        'ಇಬ್ಬರು ಗಗನಯಾತ್ರಿಗಳನ್ನು ಚಂದ್ರನ ಮೇಲ್ಮೈಗೆ ಇಳಿಸಿದ ಲ್ಯಾಂಡರ್, ಚಂದ್ರ ಮಾಡ್ಯೂಲ್, ಅಡಗಿದ್ದ ಫಲಕಗಳ ಶಂಕು.',
      ),
    },
    {
      id: 'instrument_unit', group: 'rocket', color: '#e8e8e4', explode: [0, 0.26, 0],
      name: t('Instrument unit', 'उपकरण इकाई', 'ಉಪಕರಣ ಘಟಕ'),
      info: t(
        'A ring of computers and gyroscopes that steered the whole rocket during launch.',
        'कंप्यूटरों और जाइरोस्कोपों का छल्ला जो प्रक्षेपण के समय पूरे रॉकेट को दिशा देता था।',
        'ಉಡಾವಣೆಯ ವೇಳೆ ಇಡೀ ರಾಕೆಟ್ ಅನ್ನು ದಿಕ್ಕು ತೋರಿಸಿ ನಡೆಸುತ್ತಿದ್ದ ಕಂಪ್ಯೂಟರ್ ಮತ್ತು ಗೈರೋಸ್ಕೋಪ್‌ಗಳ ಉಂಗುರ.',
      ),
    },
    {
      id: 'third_stage', group: 'rocket', color: '#f1f1ee', explode: [0, 0.14, 0],
      name: t('Third stage (S-IVB)', 'तीसरा चरण (S-IVB)', 'ಮೂರನೇ ಹಂತ (S-IVB)'),
      info: t(
        'One J-2 engine burning liquid hydrogen and liquid oxygen. It fired twice: to reach orbit round the Earth, then to send the spacecraft towards the Moon.',
        'एक J-2 इंजन जो द्रव हाइड्रोजन और द्रव ऑक्सीजन जलाता है। यह दो बार चला: पृथ्वी की कक्षा में पहुँचने के लिए, फिर यान को चंद्रमा की ओर भेजने के लिए।',
        'ದ್ರವ ಹೈಡ್ರೋಜನ್ ಮತ್ತು ದ್ರವ ಆಮ್ಲಜನಕ ಉರಿಸುವ ಒಂದು J-2 ಎಂಜಿನ್. ಇದು ಎರಡು ಬಾರಿ ಉರಿಯಿತು: ಭೂಮಿಯ ಕಕ್ಷೆ ತಲುಪಲು, ನಂತರ ನೌಕೆಯನ್ನು ಚಂದ್ರನತ್ತ ಕಳುಹಿಸಲು.',
      ),
    },
    {
      id: 'second_stage', group: 'rocket', color: '#f4f4f1', explode: [0, 0, 0],
      name: t('Second stage (S-II)', 'दूसरा चरण (S-II)', 'ಎರಡನೇ ಹಂತ (S-II)'),
      info: t(
        'Five J-2 engines burning liquid hydrogen and liquid oxygen for about six minutes, taking the rocket up to about 185 km.',
        'पाँच J-2 इंजन जो लगभग छह मिनट तक द्रव हाइड्रोजन और द्रव ऑक्सीजन जलाकर रॉकेट को लगभग 185 किमी ऊँचाई तक ले जाते हैं।',
        'ಸುಮಾರು ಆರು ನಿಮಿಷ ದ್ರವ ಹೈಡ್ರೋಜನ್ ಮತ್ತು ದ್ರವ ಆಮ್ಲಜನಕ ಉರಿಸಿ ರಾಕೆಟ್ ಅನ್ನು ಸುಮಾರು 185 ಕಿಮೀ ಎತ್ತರಕ್ಕೆ ಒಯ್ಯುವ ಐದು J-2 ಎಂಜಿನ್‌ಗಳು.',
      ),
    },
    {
      id: 'first_stage', group: 'rocket', color: '#f4f4f1', explode: [0, -0.18, 0],
      name: t('First stage (S-IC)', 'पहला चरण (S-IC)', 'ಮೊದಲ ಹಂತ (S-IC)'),
      info: t(
        'The biggest stage, 42 m tall. Its tanks held about 2,000 tonnes of kerosene and liquid oxygen, burnt in only two and a half minutes.',
        'सबसे बड़ा चरण, 42 मीटर ऊँचा। इसकी टंकियों में लगभग 2,000 टन केरोसिन और द्रव ऑक्सीजन था, जो केवल ढाई मिनट में जल गया।',
        'ಅತಿ ದೊಡ್ಡ ಹಂತ, 42 ಮೀ ಎತ್ತರ. ಇದರ ಟ್ಯಾಂಕ್‌ಗಳಲ್ಲಿದ್ದ ಸುಮಾರು 2,000 ಟನ್ ಸೀಮೆಎಣ್ಣೆ ಮತ್ತು ದ್ರವ ಆಮ್ಲಜನಕ ಕೇವಲ ಎರಡೂವರೆ ನಿಮಿಷದಲ್ಲಿ ಉರಿಯುತ್ತಿತ್ತು.',
      ),
    },
    {
      id: 'engines', group: 'rocket', color: '#3b3d40', explode: [0, -0.4, 0], detail: 0.4, error: 0.001,
      name: t('F-1 engines and fins', 'F-1 इंजन और पंख', 'F-1 ಎಂಜಿನ್‌ಗಳು ಮತ್ತು ರೆಕ್ಕೆಗಳು'),
      info: t(
        'Five F-1 engines pushed with about 34,000 kN. Hot gas is thrown down and the rocket is pushed up: Newton\'s third law. The fins kept it steady.',
        'पाँच F-1 इंजन लगभग 34,000 kN बल से धकेलते थे। गर्म गैस नीचे फेंकी जाती है और रॉकेट ऊपर धकेला जाता है: न्यूटन का तीसरा नियम। पंख इसे स्थिर रखते थे।',
        'ಐದು F-1 ಎಂಜಿನ್‌ಗಳು ಸುಮಾರು 34,000 kN ಬಲದಿಂದ ತಳ್ಳುತ್ತಿದ್ದವು. ಬಿಸಿ ಅನಿಲ ಕೆಳಗೆ ತಳ್ಳಲ್ಪಟ್ಟು ರಾಕೆಟ್ ಮೇಲಕ್ಕೆ ತಳ್ಳಲ್ಪಡುತ್ತದೆ: ನ್ಯೂಟನ್‌ನ ಮೂರನೇ ನಿಯಮ. ರೆಕ್ಕೆಗಳು ಅದನ್ನು ಸ್ಥಿರವಾಗಿಡುತ್ತಿದ್ದವು.',
      ),
    },
  ],
  views: [
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [0.35, 0.12, 1] },
    { id: 'top', name: t('Spacecraft', 'अंतरिक्ष यान', 'ಬಾಹ್ಯಾಕಾಶ ನೌಕೆ'), dir: [0.3, 0.6, 1] },
  ],
  slices: [],
  animations: [],
};
