// Human permanent teeth in their jaws, from BodyParts3D: incisors, canines,
// premolars and molars (the wisdom teeth are not in the source), with the
// jaw bones see-through so the roots show. "Take apart" draws each kind of
// tooth out of the jaws.
const t = (en, hi, kn) => ({ en, hi, kn });

export default {
  id: 'teeth',
  version: 1,
  order: 6.6,
  source: 'bp3d',
  subject: 'Biology',
  classes: [4, 5, 7, 10],
  title: t('Human teeth', 'मानव दाँत', 'ಮಾನವ ಹಲ್ಲುಗಳು'),
  summary: t(
    'Adults have up to 32 permanent teeth of four kinds: incisors cut, canines tear, premolars and molars crush and grind. Each sits in a socket in the jaw bone, held by its roots.',
    'वयस्कों के 32 तक स्थायी दाँत चार प्रकार के होते हैं: कृंतक काटते हैं, रदनक फाड़ते हैं, अग्रचर्वणक और चर्वणक कुचलते और पीसते हैं। हर दाँत जबड़े की हड्डी के गड्ढे में अपनी जड़ों से टिका रहता है।',
    'ವಯಸ್ಕರಿಗೆ ನಾಲ್ಕು ಬಗೆಯ 32ರವರೆಗೆ ಶಾಶ್ವತ ಹಲ್ಲುಗಳಿವೆ: ಬಾಚಿಹಲ್ಲುಗಳು ಕತ್ತರಿಸುತ್ತವೆ, ಕೋರೆಹಲ್ಲುಗಳು ಹರಿಯುತ್ತವೆ, ಮುಂದವಡೆ ಮತ್ತು ದವಡೆ ಹಲ್ಲುಗಳು ಜಜ್ಜಿ ಅರೆಯುತ್ತವೆ. ಪ್ರತಿ ಹಲ್ಲು ತನ್ನ ಬೇರುಗಳಿಂದ ದವಡೆ ಮೂಳೆಯ ಗುಳಿಯಲ್ಲಿ ಕುಳಿತಿದೆ.',
  ),
  keywords: ['teeth', 'tooth', 'incisor', 'canine', 'premolar', 'molar', 'dentition', 'digestion', 'mouth', 'jaw', 'types of teeth', 'food and digestion', 'nutrition in animals', 'dental care'],
  credit: 'BodyParts3D, © The Database Center for Life Science, CC BY 4.0',
  detail: 0.85,
  groups: [
    { id: 'teeth', name: t('Upper teeth', 'ऊपरी दाँत', 'ಮೇಲಿನ ಹಲ್ಲುಗಳು') },
    { id: 'lower', name: t('Lower teeth', 'निचले दाँत', 'ಕೆಳಗಿನ ಹಲ್ಲುಗಳು') },
    { id: 'jaws', name: t('Jaw bones', 'जबड़े की हड्डियाँ', 'ದವಡೆಯ ಮೂಳೆಗಳು') },
  ],
  parts: [
    {
      id: 'upper_incisors', group: 'teeth', explode: [0, 1, 0.15], color: '#fff1c9', inside: '#f0c9a8',
      files: ['FJ1265', 'FJ1266', 'FJ1279', 'FJ1280'],
      name: t('Incisors (4 in each jaw)', 'कृंतक (हर जबड़े में 4)', 'ಬಾಚಿಹಲ್ಲುಗಳು (ಪ್ರತಿ ದವಡೆಯಲ್ಲಿ 4)'),
      info: t('Flat, chisel-shaped front teeth with one root, for biting and cutting food.', 'छेनी जैसे चपटे सामने के दाँत, एक जड़ वाले, भोजन काटने के लिए।', 'ಉಳಿಯಂತೆ ಚಪ್ಪಟೆಯಾದ ಮುಂದಿನ ಹಲ್ಲುಗಳು, ಒಂದು ಬೇರು; ಆಹಾರ ಕಚ್ಚಿ ಕತ್ತರಿಸಲು.'),
    },
    {
      id: 'lower_incisors', group: 'lower', minor: true, explode: [0, -1, 0.15], color: '#fff1c9', inside: '#f0c9a8',
      files: ['FJ1258', 'FJ1259', 'FJ1272', 'FJ1273'],
      name: t('Incisors (4 in each jaw)', 'कृंतक (हर जबड़े में 4)', 'ಬಾಚಿಹಲ್ಲುಗಳು (ಪ್ರತಿ ದವಡೆಯಲ್ಲಿ 4)'),
      info: t('Flat, chisel-shaped front teeth with one root, for biting and cutting food.', 'छेनी जैसे चपटे सामने के दाँत, एक जड़ वाले, भोजन काटने के लिए।', 'ಉಳಿಯಂತೆ ಚಪ್ಪಟೆಯಾದ ಮುಂದಿನ ಹಲ್ಲುಗಳು, ಒಂದು ಬೇರು; ಆಹಾರ ಕಚ್ಚಿ ಕತ್ತರಿಸಲು.'),
    },
    {
      id: 'upper_canines', group: 'teeth', explode: [0, 1, 0.15], color: '#ffc46e', inside: '#f0c9a8',
      files: ['FJ1267', 'FJ1281'],
      name: t('Canines (2 in each jaw)', 'रदनक (हर जबड़े में 2)', 'ಕೋರೆಹಲ್ಲುಗಳು (ಪ್ರತಿ ದವಡೆಯಲ್ಲಿ 2)'),
      info: t('Pointed teeth with the longest roots, for tearing food.', 'नुकीले दाँत, सबसे लंबी जड़ वाले, भोजन फाड़ने के लिए।', 'ಚೂಪಾದ ಹಲ್ಲುಗಳು, ಅತಿ ಉದ್ದದ ಬೇರು; ಆಹಾರ ಹರಿಯಲು.'),
    },
    {
      id: 'lower_canines', group: 'lower', minor: true, explode: [0, -1, 0.15], color: '#ffc46e', inside: '#f0c9a8',
      files: ['FJ1260', 'FJ1274'],
      name: t('Canines (2 in each jaw)', 'रदनक (हर जबड़े में 2)', 'ಕೋರೆಹಲ್ಲುಗಳು (ಪ್ರತಿ ದವಡೆಯಲ್ಲಿ 2)'),
      info: t('Pointed teeth with the longest roots, for tearing food.', 'नुकीले दाँत, सबसे लंबी जड़ वाले, भोजन फाड़ने के लिए।', 'ಚೂಪಾದ ಹಲ್ಲುಗಳು, ಅತಿ ಉದ್ದದ ಬೇರು; ಆಹಾರ ಹರಿಯಲು.'),
    },
    {
      id: 'upper_premolars', group: 'teeth', explode: [0, 1, 0.15], color: '#a9d4ff', inside: '#b8cbe0',
      files: ['FJ1262', 'FJ1264', 'FJ1277', 'FJ1278'],
      name: t('Premolars (4 in each jaw)', 'अग्रचर्वणक (हर जबड़े में 4)', 'ಮುಂದವಡೆ ಹಲ್ಲುಗಳು (ಪ್ರತಿ ದವಡೆಯಲ್ಲಿ 4)'),
      info: t('Two-pointed teeth behind the canines, for crushing food. Milk teeth have none.', 'रदनकों के पीछे दो नोक वाले दाँत, भोजन कुचलने के लिए। दूध के दाँतों में ये नहीं होते।', 'ಕೋರೆಹಲ್ಲುಗಳ ಹಿಂದಿನ ಎರಡು ಮೊನೆಯ ಹಲ್ಲುಗಳು, ಆಹಾರ ಜಜ್ಜಲು. ಹಾಲುಹಲ್ಲುಗಳಲ್ಲಿ ಇವು ಇಲ್ಲ.'),
    },
    {
      id: 'lower_premolars', group: 'lower', minor: true, explode: [0, -1, 0.15], color: '#a9d4ff', inside: '#b8cbe0',
      files: ['FJ1255', 'FJ1257', 'FJ1269', 'FJ1271'],
      name: t('Premolars (4 in each jaw)', 'अग्रचर्वणक (हर जबड़े में 4)', 'ಮುಂದವಡೆ ಹಲ್ಲುಗಳು (ಪ್ರತಿ ದವಡೆಯಲ್ಲಿ 4)'),
      info: t('Two-pointed teeth behind the canines, for crushing food. Milk teeth have none.', 'रदनकों के पीछे दो नोक वाले दाँत, भोजन कुचलने के लिए। दूध के दाँतों में ये नहीं होते।', 'ಕೋರೆಹಲ್ಲುಗಳ ಹಿಂದಿನ ಎರಡು ಮೊನೆಯ ಹಲ್ಲುಗಳು, ಆಹಾರ ಜಜ್ಜಲು. ಹಾಲುಹಲ್ಲುಗಳಲ್ಲಿ ಇವು ಇಲ್ಲ.'),
    },
    {
      id: 'upper_molars', group: 'teeth', explode: [0, 1, 0.15], color: '#ade39f', inside: '#b9d6ae',
      files: ['FJ1261', 'FJ1263', 'FJ1275', 'FJ1276'],
      name: t('Molars (4 in each jaw, plus 2 wisdom teeth)', 'चर्वणक (हर जबड़े में 4, और 2 अक्ल दाढ़)', 'ದವಡೆ ಹಲ್ಲುಗಳು (ಪ್ರತಿ ದವಡೆಯಲ್ಲಿ 4, ಜೊತೆಗೆ 2 ಜ್ಞಾನದಂತ)'),
      info: t('Broad back teeth with two or three roots, for grinding food. The third molars, wisdom teeth, come last, often after 17.', 'दो या तीन जड़ों वाले चौड़े पिछले दाँत, भोजन पीसने के लिए। तीसरे चर्वणक, अक्ल दाढ़, सबसे बाद में, प्रायः 17 वर्ष के बाद आते हैं।', 'ಎರಡು ಅಥವಾ ಮೂರು ಬೇರುಗಳ ಅಗಲವಾದ ಹಿಂದಿನ ಹಲ್ಲುಗಳು, ಆಹಾರ ಅರೆಯಲು. ಮೂರನೇ ದವಡೆ ಹಲ್ಲುಗಳು, ಜ್ಞಾನದಂತಗಳು, ಕೊನೆಗೆ, ಹೆಚ್ಚಾಗಿ 17ರ ನಂತರ ಬರುತ್ತವೆ.'),
    },
    {
      id: 'lower_molars', group: 'lower', minor: true, explode: [0, -1, 0.15], color: '#ade39f', inside: '#b9d6ae',
      files: ['FJ1254', 'FJ1256', 'FJ1268', 'FJ1270'],
      name: t('Molars (4 in each jaw, plus 2 wisdom teeth)', 'चर्वणक (हर जबड़े में 4, और 2 अक्ल दाढ़)', 'ದವಡೆ ಹಲ್ಲುಗಳು (ಪ್ರತಿ ದವಡೆಯಲ್ಲಿ 4, ಜೊತೆಗೆ 2 ಜ್ಞಾನದಂತ)'),
      info: t('Broad back teeth with two or three roots, for grinding food. The third molars, wisdom teeth, come last, often after 17.', 'दो या तीन जड़ों वाले चौड़े पिछले दाँत, भोजन पीसने के लिए। तीसरे चर्वणक, अक्ल दाढ़, सबसे बाद में, प्रायः 17 वर्ष के बाद आते हैं।', 'ಎರಡು ಅಥವಾ ಮೂರು ಬೇರುಗಳ ಅಗಲವಾದ ಹಿಂದಿನ ಹಲ್ಲುಗಳು, ಆಹಾರ ಅರೆಯಲು. ಮೂರನೇ ದವಡೆ ಹಲ್ಲುಗಳು, ಜ್ಞಾನದಂತಗಳು, ಕೊನೆಗೆ, ಹೆಚ್ಚಾಗಿ 17ರ ನಂತರ ಬರುತ್ತವೆ.'),
    },
    {
      id: 'upper_jaw', group: 'jaws', color: '#e9d8bd', opacity: 0.32, files: ['FJ3269', 'FJ3375'], explode: [0, 1.8, 0],
      name: t('Upper jaw (maxilla)', 'ऊपरी जबड़ा (मैक्सिला)', 'ಮೇಲ್ದವಡೆ (ಮ್ಯಾಕ್ಸಿಲ್ಲಾ)'),
      info: t('The upper teeth sit in sockets in this bone; it does not move.', 'ऊपरी दाँत इस हड्डी के गड्ढों में लगे हैं; यह हिलती नहीं।', 'ಮೇಲಿನ ಹಲ್ಲುಗಳು ಈ ಮೂಳೆಯ ಗುಳಿಗಳಲ್ಲಿ ಕುಳಿತಿವೆ; ಇದು ಚಲಿಸುವುದಿಲ್ಲ.'),
    },
    {
      id: 'lower_jaw', group: 'jaws', color: '#e9d8bd', opacity: 0.32, files: ['FJ3289'], explode: [0, -1.8, 0],
      name: t('Lower jaw (mandible)', 'निचला जबड़ा (मैंडिबल)', 'ಕೆಳದವಡೆ (ಮ್ಯಾಂಡಿಬಲ್)'),
      info: t('Moves up, down and sideways to bite and chew.', 'काटने और चबाने के लिए ऊपर-नीचे और दाएँ-बाएँ हिलता है।', 'ಕಚ್ಚಲು ಮತ್ತು ಅಗಿಯಲು ಮೇಲೆ-ಕೆಳಗೆ ಮತ್ತು ಪಕ್ಕಕ್ಕೆ ಚಲಿಸುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.25, 0.2, 1] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0.15, 0.2] },
    { id: 'below', name: t('Upper teeth from below', 'नीचे से ऊपरी दाँत', 'ಕೆಳಗಿನಿಂದ ಮೇಲಿನ ಹಲ್ಲುಗಳು'), dir: [0, -1, 0.35] },
  ],
  slices: [],
  animations: [],
};
