// The human skull, bone by bone, from BodyParts3D: the eight bones of the
// cranium round the brain, the fourteen of the face, the lower jaw and the
// teeth. Coloured by bone like the teaching skulls in a lab, so each bone
// and its sutures stand out; "take apart" lifts the bones away from each other.
const t = (en, hi, kn) => ({ en, hi, kn });
const upperTeeth = ['FJ1261', 'FJ1262', 'FJ1263', 'FJ1264', 'FJ1265', 'FJ1266', 'FJ1267', 'FJ1275', 'FJ1276', 'FJ1277', 'FJ1278', 'FJ1279', 'FJ1280', 'FJ1281'];
const lowerTeeth = ['FJ1254', 'FJ1255', 'FJ1256', 'FJ1257', 'FJ1258', 'FJ1259', 'FJ1260', 'FJ1268', 'FJ1269', 'FJ1270', 'FJ1271', 'FJ1272', 'FJ1273', 'FJ1274'];

export default {
  id: 'skull',
  version: 1,
  order: 6.5,
  source: 'bp3d',
  subject: 'Biology',
  classes: [6, 7, 11],
  title: t('Human skull', 'मानव खोपड़ी', 'ಮಾನವ ತಲೆಬುರುಡೆ'),
  summary: t(
    'Twenty-two bones locked together by fixed joints (sutures) protect the brain and shape the face. Only the lower jaw moves.',
    'बाईस हड्डियाँ अचल जोड़ों (सीवन) से आपस में जुड़कर मस्तिष्क की रक्षा करती हैं और चेहरे को आकार देती हैं। केवल निचला जबड़ा हिलता है।',
    'ಇಪ್ಪತ್ತೆರಡು ಮೂಳೆಗಳು ಅಚಲ ಕೀಲುಗಳಿಂದ (ಹೊಲಿಗೆಗಳು) ಒಂದಾಗಿ ಸೇರಿ ಮಿದುಳನ್ನು ರಕ್ಷಿಸುತ್ತವೆ ಮತ್ತು ಮುಖಕ್ಕೆ ಆಕಾರ ನೀಡುತ್ತವೆ. ಕೆಳದವಡೆ ಮಾತ್ರ ಚಲಿಸುತ್ತದೆ.',
  ),
  keywords: ['skull', 'cranium', 'jaw', 'mandible', 'maxilla', 'skeleton', 'bones', 'head', 'sutures', 'fixed joints', 'immovable joints', 'body movements', 'locomotion and movement', 'skeletal system'],
  credit: 'BodyParts3D, © The Database Center for Life Science, CC BY 4.0',
  detail: 0.8,
  groups: [
    { id: 'cranium', name: t('Cranium (brain case)', 'कपाल (मस्तिष्क का खोल)', 'ಕಪಾಲ (ಮಿದುಳಿನ ಪೆಟ್ಟಿಗೆ)') },
    { id: 'face', name: t('Bones of the face', 'चेहरे की हड्डियाँ', 'ಮುಖದ ಮೂಳೆಗಳು') },
    { id: 'jaw', name: t('Jaws and teeth', 'जबड़े और दाँत', 'ದವಡೆಗಳು ಮತ್ತು ಹಲ್ಲುಗಳು') },
  ],
  parts: [
    {
      id: 'frontal', group: 'cranium', color: '#e8c872', files: ['FJ3200'], explode: [0, 0.35, 1],
      name: t('Frontal bone (forehead)', 'ललाट अस्थि (माथा)', 'ಲಲಾಟಾಸ್ಥಿ (ಹಣೆ)'),
      info: t('Forms the forehead and the roofs of the eye sockets.', 'माथा और आँख के गड्ढों की छत बनाती है।', 'ಹಣೆಯನ್ನು ಮತ್ತು ಕಣ್ಣಿನ ಗುಳಿಗಳ ಮೇಲ್ಛಾವಣಿಯನ್ನು ರೂಪಿಸುತ್ತದೆ.'),
    },
    {
      id: 'parietal', group: 'cranium', color: '#8fc0e8', files: ['FJ3274', 'FJ3380'], explode: [0, 1, -0.2],
      name: t('Parietal bones', 'भित्तिका अस्थियाँ', 'ಪಾರ್ಶ್ವಕಪಾಲಾಸ್ಥಿಗಳು'),
      info: t('A pair of curved plates forming the top and sides of the head, joined along the middle by a suture.', 'वक्र प्लेटों का जोड़ा जो सिर का ऊपरी भाग और बगलें बनाता है; बीच में सीवन से जुड़ा।', 'ತಲೆಯ ಮೇಲ್ಭಾಗ ಮತ್ತು ಪಕ್ಕಗಳನ್ನು ರೂಪಿಸುವ ಬಾಗಿದ ಫಲಕಗಳ ಜೋಡಿ; ಮಧ್ಯದಲ್ಲಿ ಹೊಲಿಗೆಯಿಂದ ಸೇರಿವೆ.'),
    },
    {
      id: 'temporal', group: 'cranium', color: '#9ad08f', files: ['FJ3281', 'FJ3386'], explode: [1, -0.1, 0],
      name: t('Temporal bones', 'शंख अस्थियाँ', 'ಶಂಖಾಸ್ಥಿಗಳು'),
      info: t('At the sides, round the ears. They hold the hearing organs and the joint of the lower jaw.', 'बगलों में, कानों के चारों ओर। इनमें सुनने के अंग और निचले जबड़े का जोड़ होता है।', 'ಪಕ್ಕಗಳಲ್ಲಿ, ಕಿವಿಗಳ ಸುತ್ತ. ಇವು ಶ್ರವಣ ಅಂಗಗಳನ್ನು ಮತ್ತು ಕೆಳದವಡೆಯ ಕೀಲನ್ನು ಹೊಂದಿವೆ.'),
    },
    {
      id: 'occipital', group: 'cranium', color: '#d79be0', files: ['FJ3309'], explode: [0, -0.2, -1],
      name: t('Occipital bone', 'पश्चकपाल अस्थि', 'ಪಶ್ಚಕಪಾಲಾಸ್ಥಿ'),
      info: t('The back and base of the skull. The spinal cord passes through its large hole, the foramen magnum.', 'खोपड़ी का पिछला और निचला भाग। मेरुरज्जु इसके बड़े छिद्र (महारंध्र) से होकर जाता है।', 'ತಲೆಬುರುಡೆಯ ಹಿಂಭಾಗ ಮತ್ತು ತಳ. ಮೆದುಳುಬಳ್ಳಿ ಇದರ ದೊಡ್ಡ ರಂಧ್ರದ (ಮಹಾರಂಧ್ರ) ಮೂಲಕ ಹಾದುಹೋಗುತ್ತದೆ.'),
    },
    {
      id: 'sphenoid', group: 'cranium', color: '#f2a65a', files: ['FJ3394'], explode: [0, -0.6, 0.4],
      name: t('Sphenoid bone', 'जतुकास्थि (स्फ़ीनॉइड)', 'ಜತುಕಾಸ್ಥಿ (ಸ್ಫಿನಾಯ್ಡ್)'),
      info: t('A butterfly-shaped bone across the base of the skull, behind the eyes; it touches almost every other skull bone.', 'खोपड़ी के आधार पर, आँखों के पीछे तितली के आकार की हड्डी; यह लगभग हर दूसरी खोपड़ी की हड्डी को छूती है।', 'ತಲೆಬುರುಡೆಯ ತಳದಲ್ಲಿ, ಕಣ್ಣುಗಳ ಹಿಂದೆ ಚಿಟ್ಟೆಯಾಕಾರದ ಮೂಳೆ; ಇದು ಬಹುತೇಕ ಎಲ್ಲಾ ತಲೆಬುರುಡೆ ಮೂಳೆಗಳನ್ನು ಸ್ಪರ್ಶಿಸುತ್ತದೆ.'),
    },
    {
      id: 'ethmoid', group: 'cranium', color: '#f4e19b', files: ['FJ3199'], minor: true, explode: [0, 0.2, 1],
      name: t('Ethmoid bone', 'झर्झरास्थि (एथमॉइड)', 'ಜರಡಿ ಮೂಳೆ (ಎತ್ಮಾಯ್ಡ್)'),
      info: t('A light, spongy bone between the eyes. Smell nerves pass through its sieve-like roof.', 'आँखों के बीच हल्की, स्पंजी हड्डी। गंध की तंत्रिकाएँ इसकी छलनी जैसी छत से गुजरती हैं।', 'ಕಣ್ಣುಗಳ ನಡುವಿನ ಹಗುರ, ಸ್ಪಂಜಿನಂತಹ ಮೂಳೆ. ವಾಸನೆಯ ನರಗಳು ಇದರ ಜರಡಿಯಂತಹ ಮೇಲ್ಭಾಗದ ಮೂಲಕ ಹಾದುಹೋಗುತ್ತವೆ.'),
    },
    {
      id: 'nasal', group: 'face', color: '#f28b82', files: ['FJ3272', 'FJ3378'], explode: [0, 0.3, 1],
      name: t('Nasal bones', 'नासा अस्थियाँ', 'ಮೂಗಿನ ಮೂಳೆಗಳು'),
      info: t('Two small bones forming the bridge of the nose; the rest of the nose is cartilage.', 'नाक का पुल बनाने वाली दो छोटी हड्डियाँ; नाक का शेष भाग उपास्थि है।', 'ಮೂಗಿನ ಸೇತುವೆಯನ್ನು ರೂಪಿಸುವ ಎರಡು ಸಣ್ಣ ಮೂಳೆಗಳು; ಉಳಿದ ಮೂಗು ಮೃದ್ವಸ್ಥಿ.'),
    },
    {
      id: 'zygomatic', group: 'face', color: '#7fd3c6', files: ['FJ3287', 'FJ3392'], explode: [1, 0, 0.6],
      name: t('Cheekbones (zygomatic)', 'गाल की हड्डियाँ (गंडास्थि)', 'ಕೆನ್ನೆಯ ಮೂಳೆಗಳು (ಗಂಡಾಸ್ಥಿ)'),
      info: t('Shape the cheeks and the outer walls of the eye sockets.', 'गालों और आँख के गड्ढों की बाहरी दीवारों को आकार देती हैं।', 'ಕೆನ್ನೆಗಳಿಗೆ ಮತ್ತು ಕಣ್ಣಿನ ಗುಳಿಗಳ ಹೊರಗೋಡೆಗಳಿಗೆ ಆಕಾರ ನೀಡುತ್ತವೆ.'),
    },
    {
      id: 'maxilla', group: 'face', color: '#b5a1e6', files: ['FJ3269', 'FJ3375'], explode: [0, -0.2, 1],
      name: t('Upper jaw (maxilla)', 'ऊपरी जबड़ा (मैक्सिला)', 'ಮೇಲ್ದವಡೆ (ಮ್ಯಾಕ್ಸಿಲ್ಲಾ)'),
      info: t('Holds the upper teeth and forms the front of the roof of the mouth. It does not move.', 'ऊपरी दाँतों को थामता है और मुँह की छत का अगला भाग बनाता है। यह हिलता नहीं।', 'ಮೇಲಿನ ಹಲ್ಲುಗಳನ್ನು ಹಿಡಿದಿಡುತ್ತದೆ ಮತ್ತು ಬಾಯಿಯ ಮೇಲ್ಛಾವಣಿಯ ಮುಂಭಾಗವನ್ನು ರೂಪಿಸುತ್ತದೆ. ಇದು ಚಲಿಸುವುದಿಲ್ಲ.'),
    },
    {
      id: 'lacrimal', group: 'face', color: '#f7b7d2', files: ['FJ3265', 'FJ3371'], minor: true, explode: [0.4, 0, 1],
      name: t('Lacrimal bones', 'अश्रु अस्थियाँ', 'ಅಶ್ರು ಮೂಳೆಗಳು'),
      info: t('The smallest face bones, inside the eye sockets; tears drain through a channel beside them.', 'चेहरे की सबसे छोटी हड्डियाँ, आँख के गड्ढों के भीतर; इनके पास की नली से आँसू बहते हैं।', 'ಮುಖದ ಅತಿ ಸಣ್ಣ ಮೂಳೆಗಳು, ಕಣ್ಣಿನ ಗುಳಿಗಳ ಒಳಗೆ; ಇವುಗಳ ಪಕ್ಕದ ನಾಳದ ಮೂಲಕ ಕಣ್ಣೀರು ಹರಿಯುತ್ತದೆ.'),
    },
    {
      id: 'palatine', group: 'face', color: '#c3d68a', files: ['FJ3273', 'FJ3379', 'FJ3395', 'FJ3263', 'FJ3369'], minor: true, explode: [0, -0.5, 0.3],
      name: t('Palatine bones, vomer and nasal conchae', 'तालु अस्थियाँ, सीरिका और नासा शुक्तिकाएँ', 'ಅಂಗುಳಿನ ಮೂಳೆಗಳು, ವೋಮರ್ ಮತ್ತು ಮೂಗಿನ ಶುಕ್ತಿಗಳು'),
      info: t('Small bones inside the nose and at the back of the roof of the mouth.', 'नाक के भीतर और मुँह की छत के पिछले भाग की छोटी हड्डियाँ।', 'ಮೂಗಿನ ಒಳಗೆ ಮತ್ತು ಬಾಯಿಯ ಮೇಲ್ಛಾವಣಿಯ ಹಿಂಭಾಗದ ಸಣ್ಣ ಮೂಳೆಗಳು.'),
    },
    {
      id: 'mandible', group: 'jaw', color: '#f0b27a', files: ['FJ3289'], detail: 0.6, explode: [0, -1, 0.35],
      name: t('Lower jaw (mandible)', 'निचला जबड़ा (मैंडिबल)', 'ಕೆಳದವಡೆ (ಮ್ಯಾಂಡಿಬಲ್)'),
      info: t('The largest and strongest face bone and the only skull bone that moves, for chewing and speaking.', 'चेहरे की सबसे बड़ी और मज़बूत हड्डी, और खोपड़ी की एकमात्र हिलने वाली हड्डी, चबाने और बोलने के लिए।', 'ಮುಖದ ಅತಿ ದೊಡ್ಡ ಮತ್ತು ಬಲವಾದ ಮೂಳೆ; ತಲೆಬುರುಡೆಯಲ್ಲಿ ಚಲಿಸುವ ಏಕೈಕ ಮೂಳೆ, ಅಗಿಯಲು ಮತ್ತು ಮಾತನಾಡಲು.'),
    },
    {
      id: 'upper_teeth', group: 'jaw', color: '#fbf6e9', files: upperTeeth, detail: 0.7, explode: [0, -0.3, 1],
      name: t('Upper teeth', 'ऊपरी दाँत', 'ಮೇಲಿನ ಹಲ್ಲುಗಳು'),
      info: t('Set in sockets in the upper jaw. Adults have 16 in each jaw (with the wisdom teeth).', 'ऊपरी जबड़े के गड्ढों में लगे। वयस्कों के हर जबड़े में 16 दाँत होते हैं (अक्ल दाढ़ सहित)।', 'ಮೇಲ್ದವಡೆಯ ಗುಳಿಗಳಲ್ಲಿ ಕುಳಿತಿವೆ. ವಯಸ್ಕರಿಗೆ ಪ್ರತಿ ದವಡೆಯಲ್ಲಿ 16 ಹಲ್ಲುಗಳು (ಜ್ಞಾನದಂತ ಸೇರಿ).'),
    },
    {
      id: 'lower_teeth', group: 'jaw', color: '#fbf6e9', files: lowerTeeth, detail: 0.7, explode: [0, -1, 0.6],
      name: t('Lower teeth', 'निचले दाँत', 'ಕೆಳಗಿನ ಹಲ್ಲುಗಳು'),
      info: t('Set in the lower jaw; they meet the upper teeth to bite and grind food.', 'निचले जबड़े में लगे; ये ऊपरी दाँतों से मिलकर भोजन काटते और पीसते हैं।', 'ಕೆಳದವಡೆಯಲ್ಲಿ ಕುಳಿತಿವೆ; ಮೇಲಿನ ಹಲ್ಲುಗಳೊಂದಿಗೆ ಸೇರಿ ಆಹಾರ ಕಚ್ಚಿ ಅರೆಯುತ್ತವೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.35, 0.15, 1] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0.1, 0.1] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.2] },
    { id: 'below', name: t('From below', 'नीचे से', 'ಕೆಳಗಿನಿಂದ'), dir: [0, -1, 0.25] },
  ],
  slices: [
    { id: 'half', name: t('Cut down the middle', 'बीच से लंबवत काटा', 'ಮಧ್ಯದಲ್ಲಿ ಉದ್ದಕ್ಕೆ ಕತ್ತರಿಸಿದ್ದು'), normal: [-1, 0, 0], offset: 0, view: 'side' },
  ],
  animations: [],
};
