// The Hubble Space Telescope, from NASA 3D Resources (public domain). The
// file is one piece with five pictures; its triangles are sorted into the
// parts a class names by where they sit, each keeping its pictures.
// Downloaded on first use.
const t = (en, hi, kn) => ({ en, hi, kn });

/** Which part a triangle with centre [x, y, z] belongs to (source units, the tube along y). */
function partOf(x, y, z) {
  const r = Math.hypot(x, z);
  if (r > 108) return 'solar_arrays';
  if (y > 196) return 'aperture_door';
  if (y > -2) return 'light_shield';
  if (y > -112) return 'equipment';
  return 'aft_shroud';
}

const ids = ['aperture_door', 'light_shield', 'solar_arrays', 'equipment', 'aft_shroud'];

export default {
  id: 'hubble_telescope',
  version: 1,
  order: 2,
  remote: true,
  topic: 'solar',
  license: 'Public domain',
  subject: 'Physics',
  classes: [8, 10, 12],
  title: t('Hubble Space Telescope', 'हबल अंतरिक्ष दूरबीन', 'ಹಬಲ್ ಬಾಹ್ಯಾಕಾಶ ದೂರದರ್ಶಕ'),
  summary: t(
    'A reflecting telescope with a 2.4 m mirror, circling the Earth about 540 km up since 1990. Above the air, which blurs and blocks starlight, it sees sharper and further than telescopes on the ground.',
    '2.4 मीटर दर्पण वाली परावर्ती दूरबीन, जो 1990 से लगभग 540 किमी ऊपर पृथ्वी की परिक्रमा कर रही है। तारों के प्रकाश को धुंधला करने और रोकने वाली हवा से ऊपर होने के कारण यह ज़मीन की दूरबीनों से अधिक साफ़ और दूर तक देखती है।',
    '2.4 ಮೀ ಕನ್ನಡಿಯಿರುವ ಪ್ರತಿಫಲನ ದೂರದರ್ಶಕ; 1990ರಿಂದ ಸುಮಾರು 540 ಕಿಮೀ ಎತ್ತರದಲ್ಲಿ ಭೂಮಿಯನ್ನು ಸುತ್ತುತ್ತಿದೆ. ನಕ್ಷತ್ರದ ಬೆಳಕನ್ನು ಮಸುಕಾಗಿಸುವ ಮತ್ತು ತಡೆಯುವ ಗಾಳಿಯ ಮೇಲಿರುವುದರಿಂದ ನೆಲದ ದೂರದರ್ಶಕಗಳಿಗಿಂತ ಸ್ಪಷ್ಟವಾಗಿ ಮತ್ತು ದೂರ ನೋಡುತ್ತದೆ.',
  ),
  keywords: ['telescope', 'hubble', 'optics', 'mirror', 'reflection', 'space', 'astronomy', 'satellite', 'light', 'stars and the solar system', 'galaxies'],
  credit: 'Hubble Space Telescope (A), NASA 3D Resources, public domain (NASA media usage guidelines)',
  sources: {
    telescope: { file: 'nasa/hubble.glb', url: 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/Hubble%20Space%20Telescope%20(A)/Hubble%20Space%20Telescope%20(A).glb' },
  },
  size: 0.8,
  async import(k) {
    const groups = {};
    for (const p of k.worldPrimitives(await k.readSource(k.source('telescope')))) {
      for (const id of ids) {
        const piece = k.clipRich(p, (x, y, z) => partOf(x, y, z) === id);
        if (piece.indices.length) (groups[id] ||= []).push({ ...piece, path: `${id}${groups[id]?.length ?? 0}` });
      }
    }
    return Object.fromEntries(Object.entries(groups).map(([id, list]) => [id, k.joinTextures(list)]));
  },
  groups: [
    { id: 'optics', name: t('Telescope', 'दूरबीन', 'ದೂರದರ್ಶಕ') },
    { id: 'craft', name: t('Spacecraft', 'अंतरिक्ष यान', 'ಬಾಹ್ಯಾಕಾಶ ನೌಕೆ') },
  ],
  parts: [
    {
      id: 'aperture_door', group: 'optics', color: '#d5d8db', explode: [0, 0.5, 0],
      name: t('Aperture door', 'द्वार ढक्कन', 'ದ್ಯುತಿರಂಧ್ರದ ಬಾಗಿಲು'),
      info: t(
        'A lid over the open end of the tube. It can close to keep sunlight from shining straight onto the mirror.',
        'नली के खुले सिरे का ढक्कन। सूर्य का प्रकाश सीधे दर्पण पर न पड़े, इसलिए यह बंद हो सकता है।',
        'ಕೊಳವೆಯ ತೆರೆದ ತುದಿಯ ಮುಚ್ಚಳ. ಸೂರ್ಯನ ಬೆಳಕು ನೇರವಾಗಿ ಕನ್ನಡಿಯ ಮೇಲೆ ಬೀಳದಂತೆ ಇದು ಮುಚ್ಚಿಕೊಳ್ಳಬಲ್ಲದು.',
      ),
    },
    {
      id: 'light_shield', group: 'optics', color: '#c8cbcf', explode: [0, 0.25, 0],
      name: t('Light shield and tube', 'प्रकाश कवच और नली', 'ಬೆಳಕಿನ ಕವಚ ಮತ್ತು ಕೊಳವೆ'),
      info: t(
        'The long tube that keeps stray light out. Starlight goes down it to the 2.4 m main mirror, which reflects it back to a smaller mirror and then to the instruments.',
        'लंबी नली जो इधर-उधर का प्रकाश बाहर रखती है। तारों का प्रकाश इसमें से 2.4 मीटर के मुख्य दर्पण तक जाता है, जो उसे छोटे दर्पण पर और फिर उपकरणों तक परावर्तित करता है।',
        'ಬೇರೆಡೆಯ ಬೆಳಕನ್ನು ಹೊರಗಿಡುವ ಉದ್ದ ಕೊಳವೆ. ನಕ್ಷತ್ರದ ಬೆಳಕು ಇದರೊಳಗೆ 2.4 ಮೀ ಮುಖ್ಯ ಕನ್ನಡಿಗೆ ಹೋಗುತ್ತದೆ; ಅದು ಚಿಕ್ಕ ಕನ್ನಡಿಗೆ, ನಂತರ ಉಪಕರಣಗಳಿಗೆ ಪ್ರತಿಫಲಿಸುತ್ತದೆ.',
      ),
    },
    {
      id: 'solar_arrays', group: 'craft', color: '#3a4a7a', explode: [0, 0, 0.5],
      name: t('Solar panels', 'सौर पैनल', 'ಸೌರ ಫಲಕಗಳು'),
      info: t(
        'Two wings of solar cells that turn sunlight into electricity, about 5 kW. Batteries keep it working on the night side of each 95-minute orbit.',
        'सौर सेलों के दो पंख जो सूर्य के प्रकाश को लगभग 5 kW बिजली में बदलते हैं। हर 95 मिनट की परिक्रमा के रात वाले भाग में बैटरियाँ इसे चलाती हैं।',
        'ಸೂರ್ಯನ ಬೆಳಕನ್ನು ಸುಮಾರು 5 kW ವಿದ್ಯುತ್ತಾಗಿ ಬದಲಿಸುವ ಸೌರ ಕೋಶಗಳ ಎರಡು ರೆಕ್ಕೆಗಳು. ಪ್ರತಿ 95 ನಿಮಿಷದ ಸುತ್ತಿನ ರಾತ್ರಿ ಭಾಗದಲ್ಲಿ ಬ್ಯಾಟರಿಗಳು ಇದನ್ನು ನಡೆಸುತ್ತವೆ.',
      ),
    },
    {
      id: 'equipment', group: 'craft', color: '#b9bdc2', explode: [0, -0.1, 0],
      name: t('Equipment section and antennas', 'उपकरण खंड और एंटीना', 'ಉಪಕರಣ ವಿಭಾಗ ಮತ್ತು ಆಂಟೆನಾಗಳು'),
      info: t(
        'Holds the computers, batteries and the gyroscopes that point the telescope steadily at one star for hours. The dish antennas send pictures to Earth through relay satellites.',
        'इसमें कंप्यूटर, बैटरियाँ और वे जाइरोस्कोप हैं जो दूरबीन को घंटों तक एक तारे पर स्थिर रखते हैं। डिश एंटीना रिले उपग्रहों के द्वारा चित्र पृथ्वी पर भेजते हैं।',
        'ಕಂಪ್ಯೂಟರ್‌ಗಳು, ಬ್ಯಾಟರಿಗಳು ಮತ್ತು ದೂರದರ್ಶಕವನ್ನು ಗಂಟೆಗಳ ಕಾಲ ಒಂದೇ ನಕ್ಷತ್ರದತ್ತ ಸ್ಥಿರವಾಗಿಡುವ ಗೈರೋಸ್ಕೋಪ್‌ಗಳು ಇಲ್ಲಿವೆ. ತಟ್ಟೆ ಆಂಟೆನಾಗಳು ಪ್ರಸಾರ ಉಪಗ್ರಹಗಳ ಮೂಲಕ ಚಿತ್ರಗಳನ್ನು ಭೂಮಿಗೆ ಕಳುಹಿಸುತ್ತವೆ.',
      ),
    },
    {
      id: 'aft_shroud', group: 'optics', color: '#aeb2b7', explode: [0, -0.4, 0],
      name: t('Aft shroud (cameras and instruments)', 'पिछला आवरण (कैमरे और उपकरण)', 'ಹಿಂಬದಿಯ ಹೊದಿಕೆ (ಕ್ಯಾಮೆರಾಗಳು ಮತ್ತು ಉಪಕರಣಗಳು)'),
      info: t(
        'Behind the main mirror: the cameras and spectrographs that make pictures and split light into its colours. Astronauts replaced them on five servicing missions.',
        'मुख्य दर्पण के पीछे: वे कैमरे और स्पेक्ट्रोग्राफ जो चित्र बनाते हैं और प्रकाश को उसके रंगों में बाँटते हैं। अंतरिक्ष यात्रियों ने पाँच मरम्मत अभियानों में इन्हें बदला।',
        'ಮುಖ್ಯ ಕನ್ನಡಿಯ ಹಿಂದೆ: ಚಿತ್ರಗಳನ್ನು ತೆಗೆಯುವ ಮತ್ತು ಬೆಳಕನ್ನು ಬಣ್ಣಗಳಾಗಿ ವಿಭಜಿಸುವ ಕ್ಯಾಮೆರಾಗಳು ಮತ್ತು ಸ್ಪೆಕ್ಟ್ರೋಗ್ರಾಫ್‌ಗಳು. ಗಗನಯಾತ್ರಿಗಳು ಐದು ದುರಸ್ತಿ ಯಾತ್ರೆಗಳಲ್ಲಿ ಇವುಗಳನ್ನು ಬದಲಿಸಿದರು.',
      ),
    },
  ],
  views: [
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0.25, 0.6] },
    { id: 'front', name: t('Open end', 'खुला सिरा', 'ತೆರೆದ ತುದಿ'), dir: [0.4, 1, 0.5] },
  ],
  slices: [],
  animations: [],
};
