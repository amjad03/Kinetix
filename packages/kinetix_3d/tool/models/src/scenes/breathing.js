// Breathing: the chest breathing in and out (diaphragm and ribs), the air
// passages, and gas exchange between the air in the alveoli and the blood.
// Built on the BodyParts3D lungs (the viewer's lungs model).
import { THREE, seeded, mat, tube, curve, smooth, fract, lerp, GlowPoints, MoleculeSwarm, tumble, disc } from './kit.js';
import { C, COL, shellWithWindow } from './bio.js';

const t = (en, hi, kn) => ({ en, hi, kn });

export const script = {
  id: 'breathing',
  subject: 'Biology',
  classes: [7, 10, 11],
  thumb: { step: 'inhale', u: 0.5 },
  title: t('Breathing and gas exchange', 'श्वास और गैसों का विनिमय', 'ಉಸಿರಾಟ ಮತ್ತು ಅನಿಲ ವಿನಿಮಯ'),
  summary: t(
    'How the diaphragm and ribs move air in and out of the lungs, and how oxygen and carbon dioxide pass between the air in the alveoli and the blood.',
    'मध्यपट और पसलियाँ फेफड़ों में हवा कैसे अंदर-बाहर करती हैं, और कूपिकाओं की हवा तथा रक्त के बीच ऑक्सीजन और कार्बन डाइऑक्साइड का आदान-प्रदान कैसे होता है।',
    'ವಪೆ ಮತ್ತು ಪಕ್ಕೆಲುಬುಗಳು ಗಾಳಿಯನ್ನು ಶ್ವಾಸಕೋಶಗಳ ಒಳಗೆ-ಹೊರಗೆ ಹೇಗೆ ಚಲಿಸುತ್ತವೆ, ಮತ್ತು ಆಲ್ವಿಯೋಲೈಯ ಗಾಳಿ ಮತ್ತು ರಕ್ತದ ನಡುವೆ ಆಮ್ಲಜನಕ ಮತ್ತು ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ ಹೇಗೆ ವಿನಿಮಯವಾಗುತ್ತವೆ.',
  ),
  keywords: ['breathing', 'respiration', 'lungs', 'diaphragm', 'ribs', 'trachea', 'bronchi', 'alveoli', 'gas exchange', 'inhalation', 'exhalation', 'respiratory system', 'life processes'],
  credit: 'BodyParts3D, © The Database Center for Life Science (DBCLS), CC BY 4.0',
  look: {
    background: ['#22232b', '#08090c'],
    keyAt: [3, 6, 7],
    stages: { chest: { fog: [11, 26] }, alveoli: { fog: [6, 16] } },
  },
  groups: [
    { id: 'airway', name: t('Air passage', 'वायु मार्ग', 'ಗಾಳಿಯ ಮಾರ್ಗ') },
    { id: 'lungs', name: t('Lungs', 'फेफड़े', 'ಶ್ವಾಸಕೋಶಗಳು') },
    { id: 'chest', name: t('Chest', 'वक्ष', 'ಎದೆ') },
    { id: 'exchange', name: t('Gas exchange', 'गैस विनिमय', 'ಅನಿಲ ವಿನಿಮಯ') },
  ],
  parts: [
    { id: 'trachea', group: 'airway', color: '#efe3c4', name: t('Trachea (windpipe)', 'श्वासनली', 'ಶ್ವಾಸನಾಳ'), info: t('A tube held open by rings of cartilage, so it does not collapse.', 'उपास्थि के छल्लों से खुली रहने वाली नली, ताकि यह पिचके नहीं।', 'ಮೃದ್ವಸ್ಥಿಯ ಉಂಗುರಗಳಿಂದ ತೆರೆದಿರುವ ನಳಿಕೆ; ಅದು ಕುಸಿಯುವುದಿಲ್ಲ.') },
    { id: 'bronchi', group: 'airway', color: '#efe3c4', name: t('Bronchi', 'श्वसनी (ब्रोंकाई)', 'ಶ್ವಾಸನಾಳಿಕೆಗಳು (ಬ್ರಾಂಕೈ)'), info: t('The windpipe divides into two bronchi, one for each lung.', 'श्वासनली दो श्वसनियों में बँटती है, हर फेफड़े के लिए एक।', 'ಶ್ವಾಸನಾಳ ಎರಡು ಬ್ರಾಂಕೈಗಳಾಗಿ ಕವಲೊಡೆಯುತ್ತದೆ, ಪ್ರತಿ ಶ್ವಾಸಕೋಶಕ್ಕೆ ಒಂದು.') },
    { id: 'bronchioles', group: 'airway', color: '#f3ead2', name: t('Bronchioles', 'श्वसनिकाएँ', 'ಶ್ವಾಸನಾಳಿಕೆಗಳ ಕವಲುಗಳು'), info: t('The bronchi branch again and again, like a tree, and end in tiny air sacs.', 'श्वसनियाँ पेड़ की तरह बार-बार बँटती हैं और सूक्ष्म वायु-कोषों में समाप्त होती हैं।', 'ಬ್ರಾಂಕೈಗಳು ಮರದಂತೆ ಮತ್ತೆ ಮತ್ತೆ ಕವಲೊಡೆದು ಸೂಕ್ಷ್ಮ ವಾಯುಕೋಶಗಳಲ್ಲಿ ಕೊನೆಗೊಳ್ಳುತ್ತವೆ.') },
    { id: 'right_lung', group: 'lungs', color: '#d99a9a', name: t('Right lung', 'दायाँ फेफड़ा', 'ಬಲ ಶ್ವಾಸಕೋಶ'), info: t('Three lobes.', 'तीन पालियाँ।', 'ಮೂರು ಹಾಲೆಗಳು.') },
    { id: 'left_lung', group: 'lungs', color: '#d99a9a', name: t('Left lung', 'बायाँ फेफड़ा', 'ಎಡ ಶ್ವಾಸಕೋಶ'), info: t('Two lobes, and a notch where the heart sits.', 'दो पालियाँ, और एक खाँच जहाँ हृदय रहता है।', 'ಎರಡು ಹಾಲೆಗಳು, ಮತ್ತು ಹೃದಯ ಕೂರುವ ತಗ್ಗು.') },
    { id: 'diaphragm', group: 'chest', color: '#c6776b', name: t('Diaphragm', 'मध्यपट (डायाफ्राम)', 'ವಪೆ (ಡಯಾಫ್ರಮ್)'), info: t('A dome of muscle under the lungs. It flattens to breathe in and rises to breathe out.', 'फेफड़ों के नीचे पेशी का गुंबद। साँस लेते समय यह चपटा होता है और साँस छोड़ते समय ऊपर उठता है।', 'ಶ್ವಾಸಕೋಶಗಳ ಕೆಳಗಿನ ಸ್ನಾಯುವಿನ ಗುಮ್ಮಟ. ಉಸಿರೆಳೆಯುವಾಗ ಚಪ್ಪಟೆಯಾಗುತ್ತದೆ, ಉಸಿರು ಬಿಡುವಾಗ ಮೇಲೇರುತ್ತದೆ.') },
    { id: 'ribs', group: 'chest', color: '#e8dcc4', name: t('Ribs', 'पसलियाँ', 'ಪಕ್ಕೆಲುಬುಗಳು'), info: t('They move up and out when we breathe in, making the chest larger.', 'साँस लेते समय ये ऊपर और बाहर जाती हैं, जिससे वक्ष बड़ा हो जाता है।', 'ಉಸಿರೆಳೆಯುವಾಗ ಇವು ಮೇಲೆ ಮತ್ತು ಹೊರಗೆ ಚಲಿಸಿ ಎದೆಯನ್ನು ದೊಡ್ಡದಾಗಿಸುತ್ತವೆ.') },
    { id: 'air', group: 'exchange', color: '#bfe6ff', name: t('Air', 'हवा', 'ಗಾಳಿ'), info: t('About one fifth oxygen.', 'लगभग पाँचवाँ भाग ऑक्सीजन।', 'ಸುಮಾರು ಐದನೇ ಒಂದು ಭಾಗ ಆಮ್ಲಜನಕ.') },
    { id: 'alveoli', group: 'exchange', color: '#e6b0aa', name: t('Alveoli (air sacs)', 'कूपिकाएँ (वायु-कोष)', 'ಆಲ್ವಿಯೋಲೈ (ವಾಯುಕೋಶಗಳು)'), info: t('Millions of tiny sacs with walls one cell thick: a huge surface for gases to pass through.', 'एक कोशिका मोटी दीवारों वाले लाखों सूक्ष्म कोष: गैसों के आर-पार जाने के लिए बहुत बड़ी सतह।', 'ಒಂದು ಕೋಶದಷ್ಟು ದಪ್ಪದ ಗೋಡೆಯ ಲಕ್ಷಾಂತರ ಸೂಕ್ಷ್ಮ ಚೀಲಗಳು: ಅನಿಲಗಳು ಹಾದುಹೋಗಲು ಬಹಳ ದೊಡ್ಡ ಮೇಲ್ಮೈ.') },
    { id: 'capillaries', group: 'exchange', color: '#b5463d', name: t('Capillaries', 'केशिकाएँ', 'ಲೋಮನಾಳಗಳು'), info: t('The finest blood vessels, wrapped round every alveolus.', 'सबसे बारीक रक्त वाहिकाएँ, जो हर कूपिका के चारों ओर लिपटी होती हैं।', 'ಅತ್ಯಂತ ಸೂಕ್ಷ್ಮ ರಕ್ತನಾಳಗಳು; ಪ್ರತಿ ಆಲ್ವಿಯೋಲಸ್ ಅನ್ನು ಸುತ್ತುವರಿದಿವೆ.') },
    { id: 'oxygen', group: 'exchange', color: '#c9473d', name: t('Oxygen (O₂)', 'ऑक्सीजन (O₂)', 'ಆಮ್ಲಜನಕ (O₂)'), info: t('Passes from the air into the blood.', 'हवा से रक्त में जाती है।', 'ಗಾಳಿಯಿಂದ ರಕ್ತಕ್ಕೆ ಹೋಗುತ್ತದೆ.') },
    { id: 'co2', group: 'exchange', color: '#3c4046', name: t('Carbon dioxide (CO₂)', 'कार्बन डाइऑक्साइड (CO₂)', 'ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ (CO₂)'), info: t('Passes from the blood into the air, to be breathed out.', 'रक्त से हवा में जाती है, ताकि साँस से बाहर निकले।', 'ರಕ್ತದಿಂದ ಗಾಳಿಗೆ ಹೋಗಿ ಉಸಿರಿನೊಂದಿಗೆ ಹೊರಹೋಗುತ್ತದೆ.') },
    { id: 'blood_cells', group: 'exchange', color: '#c0392f', name: t('Red blood cells', 'लाल रक्त कोशिकाएँ', 'ಕೆಂಪು ರಕ್ತಕಣಗಳು'), info: t('Their haemoglobin carries oxygen; they turn bright red as they load it.', 'इनका हीमोग्लोबिन ऑक्सीजन ले जाता है; ऑक्सीजन भरते ही ये चमकीली लाल हो जाती हैं।', 'ಇವುಗಳ ಹಿಮೋಗ್ಲೋಬಿನ್ ಆಮ್ಲಜನಕವನ್ನು ಒಯ್ಯುತ್ತದೆ; ಆಮ್ಲಜನಕ ತುಂಬಿದಂತೆ ಅವು ಹೊಳೆಯುವ ಕೆಂಪಾಗುತ್ತವೆ.') },
  ],
  steps: [
    {
      id: 'overview', stage: 'chest', seconds: 13,
      camera: { pos: [2.2, 0.8, 11.2], target: [0, -0.25, 0], from: [4, 2, 18], drift: 0.04 },
      highlight: ['trachea', 'bronchi'], labels: ['trachea', 'bronchi', 'right_lung', 'left_lung', 'diaphragm', 'ribs'],
      title: t('The breathing system', 'श्वसन तंत्र', 'ಉಸಿರಾಟದ ವ್ಯವಸ್ಥೆ'),
      caption: t(
        'Air comes in through the nose, down the trachea (windpipe) and into two bronchi, one for each lung. The lungs sit in the chest, protected by the ribs, above a dome of muscle called the diaphragm.',
        'हवा नाक से होकर श्वासनली में और फिर दो श्वसनियों में जाती है, हर फेफड़े के लिए एक। फेफड़े वक्ष में पसलियों से सुरक्षित रहते हैं, मध्यपट नामक पेशी के गुंबद के ऊपर।',
        'ಗಾಳಿ ಮೂಗಿನ ಮೂಲಕ ಶ್ವಾಸನಾಳಕ್ಕೆ, ನಂತರ ಪ್ರತಿ ಶ್ವಾಸಕೋಶಕ್ಕೆ ಒಂದರಂತೆ ಎರಡು ಬ್ರಾಂಕೈಗಳಿಗೆ ಹೋಗುತ್ತದೆ. ಶ್ವಾಸಕೋಶಗಳು ಪಕ್ಕೆಲುಬುಗಳ ರಕ್ಷಣೆಯಲ್ಲಿ ಎದೆಯಲ್ಲಿ, ವಪೆ ಎಂಬ ಸ್ನಾಯುವಿನ ಗುಮ್ಮಟದ ಮೇಲೆ ಇವೆ.',
      ),
    },
    {
      id: 'inhale', stage: 'chest', seconds: 13,
      camera: { pos: [6.8, 0.5, 8.6], target: [0, -0.15, 0], drift: 0.015 },
      highlight: ['diaphragm', 'ribs'], labels: ['diaphragm', 'ribs', 'air'],
      title: t('Breathing in', 'साँस लेना', 'ಉಸಿರೆಳೆಯುವುದು'),
      caption: t(
        'To breathe in, the diaphragm contracts and flattens, and the rib muscles lift the ribs up and out. The chest grows larger, the pressure inside falls, and air rushes into the lungs.',
        'साँस लेते समय मध्यपट सिकुड़कर चपटा हो जाता है और पसलियों की पेशियाँ पसलियों को ऊपर और बाहर उठाती हैं। वक्ष बड़ा हो जाता है, अंदर का दाब घटता है और हवा तेज़ी से फेफड़ों में भर जाती है।',
        'ಉಸಿರೆಳೆಯಲು ವಪೆ ಸಂಕುಚಿಸಿ ಚಪ್ಪಟೆಯಾಗುತ್ತದೆ, ಮತ್ತು ಪಕ್ಕೆಲುಬಿನ ಸ್ನಾಯುಗಳು ಪಕ್ಕೆಲುಬುಗಳನ್ನು ಮೇಲೆ ಮತ್ತು ಹೊರಗೆ ಎತ್ತುತ್ತವೆ. ಎದೆ ದೊಡ್ಡದಾಗುತ್ತದೆ, ಒಳಗಿನ ಒತ್ತಡ ಕಡಿಮೆಯಾಗುತ್ತದೆ, ಮತ್ತು ಗಾಳಿ ಶ್ವಾಸಕೋಶಗಳಿಗೆ ನುಗ್ಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'exhale', stage: 'chest', seconds: 12,
      camera: { pos: [-6.4, 0.6, 8.8], target: [0, -0.15, 0], drift: -0.015 },
      highlight: ['diaphragm', 'ribs'], labels: ['diaphragm', 'ribs', 'air'],
      title: t('Breathing out', 'साँस छोड़ना', 'ಉಸಿರು ಬಿಡುವುದು'),
      caption: t(
        'To breathe out, the diaphragm relaxes and domes up again, and the ribs move down and in. The chest gets smaller and air is pushed out of the lungs.',
        'साँस छोड़ते समय मध्यपट शिथिल होकर फिर गुंबद जैसा ऊपर उठ जाता है, और पसलियाँ नीचे और अंदर आती हैं। वक्ष छोटा होता है और हवा फेफड़ों से बाहर धकेल दी जाती है।',
        'ಉಸಿರು ಬಿಡಲು ವಪೆ ಸಡಿಲಗೊಂಡು ಮತ್ತೆ ಗುಮ್ಮಟದಂತೆ ಮೇಲೇರುತ್ತದೆ, ಮತ್ತು ಪಕ್ಕೆಲುಬುಗಳು ಕೆಳಗೆ ಮತ್ತು ಒಳಗೆ ಬರುತ್ತವೆ. ಎದೆ ಚಿಕ್ಕದಾಗಿ ಗಾಳಿ ಶ್ವಾಸಕೋಶಗಳಿಂದ ಹೊರಗೆ ತಳ್ಳಲ್ಪಡುತ್ತದೆ.',
      ),
    },
    {
      id: 'tree', stage: 'chest', seconds: 12,
      camera: { pos: [0.6, 0.6, 8.6], target: [0, 0.35, -0.3], drift: 0.02 },
      highlight: ['bronchioles'], labels: ['trachea', 'bronchi', 'bronchioles'],
      title: t('A tree of air tubes', 'वायु-नलियों का वृक्ष', 'ಗಾಳಿ ನಳಿಕೆಗಳ ಮರ'),
      caption: t(
        'Inside the lungs the bronchi branch again and again into thinner and thinner bronchioles, like an upside-down tree, until they end in tiny air sacs called alveoli.',
        'फेफड़ों के अंदर श्वसनियाँ बार-बार बँटकर पतली से पतली श्वसनिकाएँ बनाती हैं, उलटे पेड़ की तरह, और अंत में कूपिकाएँ नामक सूक्ष्म वायु-कोषों में समाप्त होती हैं।',
        'ಶ್ವಾಸಕೋಶಗಳ ಒಳಗೆ ಬ್ರಾಂಕೈಗಳು ತಲೆಕೆಳಗಾದ ಮರದಂತೆ ಮತ್ತೆ ಮತ್ತೆ ಕವಲೊಡೆದು ತೆಳುವಾದ ಶ್ವಾಸನಾಳಿಕೆಗಳಾಗಿ, ಕೊನೆಗೆ ಆಲ್ವಿಯೋಲೈ ಎಂಬ ಸೂಕ್ಷ್ಮ ವಾಯುಕೋಶಗಳಲ್ಲಿ ಕೊನೆಗೊಳ್ಳುತ್ತವೆ.',
      ),
    },
    {
      id: 'alveoli', stage: 'alveoli', seconds: 13,
      camera: { pos: [2.6, 1.6, 7.2], target: [0, -0.1, 0], from: [1, 3, 14], drift: 0.03 },
      highlight: ['alveoli'], labels: ['bronchioles', 'alveoli', 'capillaries'],
      title: t('The alveoli', 'कूपिकाएँ', 'ಆಲ್ವಿಯೋಲೈ'),
      caption: t(
        'Each bronchiole ends in a bunch of alveoli, wrapped in a net of capillaries. Their walls are only one cell thick, and the lungs hold about 300 million of them.',
        'हर श्वसनिका कूपिकाओं के एक गुच्छे में समाप्त होती है, जो केशिकाओं के जाल से लिपटा होता है। इनकी दीवारें केवल एक कोशिका मोटी होती हैं, और फेफड़ों में लगभग 30 करोड़ कूपिकाएँ होती हैं।',
        'ಪ್ರತಿ ಶ್ವಾಸನಾಳಿಕೆ ಲೋಮನಾಳಗಳ ಜಾಲದಿಂದ ಸುತ್ತುವರಿದ ಆಲ್ವಿಯೋಲೈ ಗೊಂಚಲಿನಲ್ಲಿ ಕೊನೆಗೊಳ್ಳುತ್ತದೆ. ಅವುಗಳ ಗೋಡೆಗಳು ಒಂದೇ ಕೋಶದಷ್ಟು ದಪ್ಪ; ಶ್ವಾಸಕೋಶಗಳಲ್ಲಿ ಸುಮಾರು 30 ಕೋಟಿ ಆಲ್ವಿಯೋಲೈ ಇವೆ.',
      ),
    },
    {
      id: 'exchange', stage: 'alveoli', seconds: 15,
      camera: { pos: [1.7, 0.7, 5.6], target: [0.4, -0.15, 0.4] },
      highlight: ['capillaries'], labels: ['oxygen', 'co2', 'blood_cells', 'capillaries'],
      title: t('Gas exchange', 'गैसों का विनिमय', 'ಅನಿಲ ವಿನಿಮಯ'),
      caption: t(
        'Oxygen from the air diffuses through the thin walls into the blood, where red blood cells pick it up and turn bright red. Carbon dioxide diffuses the other way, out of the blood into the air, to be breathed out.',
        'हवा की ऑक्सीजन पतली दीवारों से विसरित होकर रक्त में जाती है, जहाँ लाल रक्त कोशिकाएँ उसे लेकर चमकीली लाल हो जाती हैं। कार्बन डाइऑक्साइड उलटी दिशा में, रक्त से हवा में विसरित होती है, ताकि साँस के साथ बाहर निकले।',
        'ಗಾಳಿಯ ಆಮ್ಲಜನಕ ತೆಳು ಗೋಡೆಗಳ ಮೂಲಕ ರಕ್ತಕ್ಕೆ ವಿಸರಣೆಯಾಗುತ್ತದೆ; ಕೆಂಪು ರಕ್ತಕಣಗಳು ಅದನ್ನು ಪಡೆದು ಹೊಳೆಯುವ ಕೆಂಪಾಗುತ್ತವೆ. ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ ವಿರುದ್ಧ ದಿಕ್ಕಿನಲ್ಲಿ, ರಕ್ತದಿಂದ ಗಾಳಿಗೆ ವಿಸರಣೆಯಾಗಿ ಉಸಿರಿನೊಂದಿಗೆ ಹೊರಹೋಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'summary', stage: 'chest', seconds: 12,
      camera: { pos: [-2.6, 1.2, 11.6], target: [0, -0.3, 0], from: [0, 0, 3] },
      highlight: [], labels: ['trachea', 'right_lung', 'left_lung', 'diaphragm'],
      title: t('Breathing is not respiration', 'श्वास लेना श्वसन नहीं है', 'ಉಸಿರಾಟವೇ ಕೋಶೀಯ ಉಸಿರಾಟವಲ್ಲ'),
      caption: t(
        'Breathing is the movement of air in and out of the lungs. Respiration is what cells do with the oxygen: break down food to release energy. We breathe about 15 times a minute at rest.',
        'श्वास लेना फेफड़ों में हवा का अंदर-बाहर आना-जाना है। श्वसन वह है जो कोशिकाएँ ऑक्सीजन से करती हैं: भोजन को तोड़कर ऊर्जा मुक्त करना। आराम की अवस्था में हम लगभग 15 बार प्रति मिनट साँस लेते हैं।',
        'ಉಸಿರಾಟ ಎಂದರೆ ಶ್ವಾಸಕೋಶಗಳ ಒಳಗೆ-ಹೊರಗೆ ಗಾಳಿಯ ಚಲನೆ. ಕೋಶೀಯ ಉಸಿರಾಟ ಎಂದರೆ ಕೋಶಗಳು ಆಮ್ಲಜನಕದಿಂದ ಮಾಡುವ ಕೆಲಸ: ಆಹಾರವನ್ನು ವಿಭಜಿಸಿ ಶಕ್ತಿ ಬಿಡುಗಡೆ ಮಾಡುವುದು. ವಿಶ್ರಾಂತಿಯಲ್ಲಿ ನಾವು ನಿಮಿಷಕ್ಕೆ ಸುಮಾರು 15 ಬಾರಿ ಉಸಿರಾಡುತ್ತೇವೆ.',
      ),
    },
  ],
};

const tissue = (color, o = {}) => mat({ color, rough: 0.55, clearcoat: 0.3, clearcoatRough: 0.35, sheen: 0.4, sheenColor: C(color).lerp(C('#ffe0e0'), 0.4), sheenRough: 0.5, rim: 0.15, ...o });

export async function build(k) {
  const model = await k.loadModel('lungs');
  const stages = { chest: buildChest(k, model), alveoli: buildAlveoli(k) };
  return { update: (s) => stages[s.stage]?.(s) };
}

/** Breathed in (1) or out (0) at time T, period [p] seconds: a smooth, slightly longer exhale. */
function breath(T, p = 5) {
  const ph = fract(T / p);
  return ph < 0.42 ? smooth(ph / 0.42) : 1 - smooth((ph - 0.42) / 0.58);
}

function buildChest(k, model) {
  const stage = k.stage('chest');
  const S = 12;
  const g = (id) => model.geometries[id].clone().scale(S, S, S);
  const lungMat = tissue('#cf8f8f', { opacity: 0.86, depthWrite: true });
  const airwayMat = mat({ color: '#e9dcc0', rough: 0.45, clearcoat: 0.4, sheen: 0.3, rim: 0.15 });
  const W = {};
  const add = (id, ids, material) => {
    const grp = new THREE.Group();
    for (const i of ids) grp.add(new THREE.Mesh(g(i), material));
    const obj = ids.length === 1 ? grp.children[0] : grp;
    stage.add(obj);
    W[id] = k.part(id, obj);
  };
  add('trachea', ['larynx', 'trachea'], airwayMat);
  add('bronchi', ['bronchi'], airwayMat);
  add('bronchioles', ['bronchial_tree'], airwayMat);
  add('right_lung', ['right_upper', 'right_middle', 'right_lower'], lungMat);
  add('left_lung', ['left_upper', 'left_lower'], lungMat);
  add('diaphragm', ['diaphragm'], tissue('#b56a5e', { sheen: 0.3 }));
  // The lungs' blood vessels, inside.
  const vessels = new THREE.Group();
  vessels.add(new THREE.Mesh(g('arteries'), mat({ color: '#56619f', rough: 0.45, clearcoat: 0.4 })), new THREE.Mesh(g('veins'), mat({ color: '#b5463d', rough: 0.45, clearcoat: 0.4 })));
  vessels.traverse((o) => (o.userData.decor = true));
  stage.add(vessels);

  // The rib cage: ribs from the spine round to the breastbone, the spine behind.
  const box = new THREE.Box3();
  for (const id of ['right_lung', 'left_lung']) box.expandByObject(W[id]);
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const ribs = new THREE.Group();
  const bone = mat({ color: '#e6dac2', rough: 0.5, clearcoat: 0.25, sheen: 0.25, rim: 0.2, opacity: 0.55 });
  const cart = mat({ color: '#c9d6d2', rough: 0.35, clearcoat: 0.4, rim: 0.2, opacity: 0.45 });
  const back = c.z - size.z * 0.62;
  const front = c.z + size.z * 0.62;
  const top = c.y + size.y * 0.42;
  // The breastbone: narrow and flat, down the front.
  const sternumTop = top - size.y * 0.1, sternumBottom = top - size.y * 0.62;
  for (let i = 0; i < 10; i++) {
    const y0 = top - i * size.y * 0.088;
    // Wider in the middle of the cage than at the top and bottom.
    const w = size.x * 0.6 * (0.66 + 0.34 * Math.sin(Math.PI * (0.12 + i / 11)));
    const d = size.z * 0.6 * (0.8 + 0.2 * Math.sin(Math.PI * (0.1 + i / 12)));
    // Ribs slope down from the spine to the front; the lowest two float free.
    const floating = i >= 8;
    const reach = floating ? 0.58 : 0.8;
    for (const side of [-1, 1]) {
      const pts = [];
      const n = 20;
      for (let j = 0; j <= n; j++) {
        const a = (j / n) * Math.PI * reach;
        // A rib bends sharply back near the spine (its angle), then sweeps round.
        const bend = 1 + 0.1 * Math.exp(-a * 3);
        pts.push(new THREE.Vector3(c.x + side * (0.22 + Math.sin(a) * (w - 0.22)) * bend, y0 - size.y * 0.2 * smooth(a / Math.PI), c.z - Math.cos(a) * d * bend));
      }
      const r = (u) => 0.05 * (1 - 0.25 * u);
      ribs.add(new THREE.Mesh(tube(pts, r, { segments: 36, radial: 8 }), bone));
      if (!floating) {
        // Costal cartilage: from the rib's end up and in to the breastbone.
        const end = pts[n];
        const sy = Math.max(sternumBottom, Math.min(sternumTop, lerp(sternumTop, sternumBottom, i / 6.5)));
        const target = new THREE.Vector3(c.x + side * 0.16, sy, front);
        const mid = end.clone().lerp(target, 0.5).add(new THREE.Vector3(side * 0.12, -0.05, 0.12));
        ribs.add(new THREE.Mesh(tube([end, mid, target], 0.036, { segments: 14, radial: 8 }), cart));
      }
    }
  }
  const sternum = new THREE.Mesh(tube([[c.x, sternumTop + 0.25, front - 0.05], [c.x, (sternumTop + sternumBottom) / 2, front + 0.04], [c.x, sternumBottom - 0.2, front - 0.02]], 0.12, { segments: 24, radial: 12 }), bone);
  sternum.geometry.translate(-c.x, 0, -front);
  sternum.scale.set(0.95, 1, 0.42);
  sternum.position.set(c.x, 0, front);
  ribs.add(sternum);
  const spine = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.2, 16), bone);
    v.position.set(c.x, c.y + size.y * 0.5 - i * size.y * 0.085, back - 0.1);
    spine.add(v);
  }
  spine.traverse((o) => (o.userData.decor = true));
  stage.add(ribs, spine);
  k.part('ribs', ribs, { anchor: [c.x + size.x * 0.55, c.y + size.y * 0.1, c.z + size.z * 0.3] });

  // Air moving in and out of the airway.
  const glow = new GlowPoints(400, { size: 0.08 });
  stage.add(glow);
  const airPath = [curve([[c.x, c.y + size.y * 0.75, c.z + 0.1], [c.x, c.y + size.y * 0.35, c.z - 0.1], [c.x - 0.6, c.y + 0.0, c.z - 0.3], [c.x - 1.0, c.y - size.y * 0.15, c.z - 0.2]]),
    curve([[c.x, c.y + size.y * 0.75, c.z + 0.1], [c.x, c.y + size.y * 0.35, c.z - 0.1], [c.x + 0.6, c.y + 0.0, c.z - 0.3], [c.x + 1.0, c.y - size.y * 0.2, c.z - 0.2]])];
  const airAt = new THREE.Vector3();
  k.marker('air', stage, (out) => (airAt.lengthSq() ? out.copy(airAt) : null), 0.2);
  const lungPivot = c.clone();
  const diaphragmY = new THREE.Box3().setFromObject(W.diaphragm).max.y;
  const v = new THREE.Vector3();
  const rnd = seeded(91);
  const jitter = Array.from({ length: 120 }, () => [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]);
  const airColor = C('#cfeeff');
  let lastB = 0;
  return (s) => {
    const T = s.T;
    const period = s.is('inhale', 'exhale') ? 6 : 4.5;
    // The inhale and exhale steps hold on their half of the breath.
    const b = s.is('inhale') ? smooth(fract(s.t / period) / 0.7) : s.is('exhale') ? 1 - smooth(fract(s.t / period) / 0.7) : breath(T, period);
    const flow = b - lastB;
    lastB = b;
    for (const id of ['right_lung', 'left_lung', 'bronchioles']) {
      const w = W[id];
      const sc = 1 + 0.07 * b;
      w.scale.set(1 + 0.05 * b, sc, 1 + 0.06 * b);
      w.position.copy(lungPivot).multiply(new THREE.Vector3(-0.05 * b, 1 - sc, -0.06 * b));
    }
    // Seeing the tree inside: the lungs turn glassy and the ribs fade.
    const see = s.is('tree') ? smooth(s.t / 1.5) : 0;
    lungMat.opacity = lerp(0.86, 0.2, see);
    lungMat.depthWrite = see < 0.4;
    lungMat.transparent = true;
    bone.opacity = lerp(0.55, 0.12, see);
    cart.opacity = lerp(0.45, 0.1, see);
    vessels.visible = see < 0.6;
    vessels.scale.copy(W.right_lung.scale);
    vessels.position.copy(W.right_lung.position);
    // The diaphragm flattens and moves down as we breathe in.
    const dw = W.diaphragm;
    dw.scale.set(1, 1 - 0.3 * b, 1);
    dw.position.set(0, diaphragmY * 0.3 * b - 0.35 * b, 0);
    // The ribs swing up and out about the spine.
    ribs.rotation.x = -0.07 * b;
    ribs.position.set(0, -back * 0.0, back * 0.07 * b);
    ribs.scale.set(1 + 0.04 * b, 1, 1 + 0.03 * b);
    // Air: in while breathing in, out while breathing out.
    glow.begin();
    airAt.set(0, 0, 0);
    const dir = s.is('exhale') ? -1 : s.is('inhale') ? 1 : flow >= 0 ? 1 : -1;
    const strength = s.is('inhale', 'exhale') ? 1 : 0.6;
    for (let i = 0; i < 60; i++) {
      const path = airPath[i % 2];
      let u = fract(i / 60 + dir * T * 0.25);
      path.getPointAt(u, v);
      const j = jitter[i];
      v.x += j[0] * 0.12;
      v.y += j[1] * 0.12;
      v.z += j[2] * 0.12;
      glow.push(v.x, v.y, v.z, 0.14, airColor, 0.55 * strength * Math.min(1, u * 6, (1 - u) * 6));
      if (i === 20) airAt.copy(v);
    }
    glow.done();
  };
}

// ------------------------------------------------------------------ the alveoli

function buildAlveoli(k) {
  const stage = k.stage('alveoli');
  const rnd = seeded(97);
  // The bronchiole coming in, and a bunch of alveoli at its end.
  const sacs = [];
  const centre = new THREE.Vector3(0, -0.2, 0);
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, b = Math.acos(rnd() * 1.6 - 0.8);
    const r = 0.55 + rnd() * 0.25;
    const d = 1.05 + rnd() * 0.25;
    sacs.push({ p: new THREE.Vector3(Math.sin(b) * Math.cos(a) * d, Math.cos(b) * d * 0.8, Math.sin(b) * Math.sin(a) * d).add(centre), r });
  }
  const alveoli = new THREE.Group();
  const sacMat = mat({ color: '#dc9c96', rough: 0.45, clearcoat: 0.4, sheen: 0.5, sheenColor: '#ffe0dc', rim: 0.45, rimColor: '#ffd8d0', opacity: 0.6, side: THREE.DoubleSide });
  for (const s of sacs) {
    // The front ones are cut open so the air inside can be seen.
    const open = s.p.z > 0.3;
    const geo = open ? shellWithWindow(s.r, s.r, s.r, (th, ph) => ph < 1.0 || ph > Math.PI * 2 - 1.0, 40, 24) : new THREE.SphereGeometry(s.r, 32, 20);
    const m = new THREE.Mesh(geo, sacMat);
    m.position.copy(s.p);
    alveoli.add(m);
  }
  stage.add(alveoli);
  k.part('alveoli', alveoli, { anchor: [-1.1, 0.5, 0.9] });
  const bronchiole = new THREE.Mesh(tube([[-5, 3.2, -1], [-3, 2.1, -0.6], [-1.3, 0.9, -0.2], [-0.2, 0.0, 0]], (u) => 0.42 - 0.12 * u, { segments: 60, radial: 20 }), mat({ color: '#d8aea2', rough: 0.5, clearcoat: 0.35, sheen: 0.4, sheenColor: '#ffe0d8', rim: 0.2, opacity: 0.85 }));
  stage.add(bronchiole);
  k.part('bronchioles', bronchiole);

  // Capillaries: a net over each sac, blue where blood arrives, red where it leaves.
  const capillaries = new THREE.Group();
  const capPaths = [];
  const blueRed = (x) => C('#5662a8').lerp(C('#c0473c'), smooth((x + 1.6) / 3.2));
  for (const s of sacs) {
    for (let j = 0; j < 3; j++) {
      const tilt = new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3);
      const pts = [];
      for (let i = 0; i <= 14; i++) {
        const a = -Math.PI * 0.75 + (i / 14) * Math.PI * 1.5;
        pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0.05 * Math.sin(a * 3)).applyEuler(tilt).multiplyScalar(s.r * 1.02).add(s.p));
      }
      // Run blood from the blue side (left) to the red side (right).
      if (pts[0].x > pts[pts.length - 1].x) pts.reverse();
      const c = curve(pts);
      capPaths.push(c);
      const geo = tube(c, 0.022, { segments: 40, radial: 6 });
      const col = [];
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const cc = blueRed(p.getX(i));
        col.push(cc.r, cc.g, cc.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      capillaries.add(new THREE.Mesh(geo, mat({ color: '#ffffff', vertexColors: true, rough: 0.4, clearcoat: 0.5, rim: 0.15 })));
    }
  }
  stage.add(capillaries);
  k.part('capillaries', capillaries, { anchor: () => capPaths[capPaths.length - 4].getPointAt(0.5) });

  // Red blood cells along the capillaries, reddening as they go.
  const N = capPaths.length * 3;
  const rbc = new THREE.InstancedMesh(disc(1, 0.42, { segments: 12, dimple: 0.13, rimSteps: 4 }), mat({ color: '#ffffff', rough: 0.4, clearcoat: 0.6, sheen: 0.3, rim: 0.12 }), N);
  rbc.frustumCulled = false;
  rbc.userData.decor = true;
  stage.add(rbc);
  const swarm = new MoleculeSwarm(400, { scale: 0.06 });
  stage.add(swarm);
  const at = { oxygen: new THREE.Vector3(), co2: new THREE.Vector3(), blood_cells: new THREE.Vector3() };
  for (const id of Object.keys(at)) k.marker(id, stage, (out) => (at[id].lengthSq() ? out.copy(at[id]) : null), 0.12);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), w = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
  const front = sacs.filter((s) => s.p.z > 0.3);
  return (s) => {
    const T = s.T;
    for (const key in at) at[key].set(0, 0, 0);
    // The bunch swells a little with each breath.
    const b = breath(T, 5);
    alveoli.scale.setScalar(1 + 0.04 * b);
    let n = 0;
    capPaths.forEach((c, ci) => {
      for (let i = 0; i < 3; i++) {
        const u = fract(i / 3 + T * 0.12 + ci * 0.37);
        c.getPointAt(u, v);
        e.set(T + ci, i * 2 + T * 0.7, ci);
        q.setFromEuler(e);
        sc.setScalar(0.042);
        m4.compose(v, q, sc);
        rbc.setMatrixAt(n, m4);
        rbc.setColorAt(n, C('#55609f').lerp(C('#c8392f'), smooth(u * 1.4 - 0.2)));
        if (ci === 5 && i === 0) at.blood_cells.copy(v);
        n++;
      }
    });
    rbc.count = n;
    rbc.instanceMatrix.needsUpdate = true;
    if (rbc.instanceColor) rbc.instanceColor.needsUpdate = true;
    // In each open sac: O₂ moving from the air to the wall, CO₂ from the wall into the air.
    swarm.begin();
    const busy = s.is('exchange') ? 1 : 0.6;
    front.forEach((sac, si) => {
      for (let j = 0; j < 6; j++) {
        const ph = fract(j / 6 + T * 0.16 + si * 0.21);
        const dirA = new THREE.Vector3(Math.sin(j * 2.1 + si), Math.cos(j * 1.3), Math.sin(j * 0.7 + si) * 0.5).normalize();
        const o2 = j % 2 === 0;
        // O₂ goes outwards through the wall; CO₂ comes in from it.
        const r = sac.r * (o2 ? lerp(0.15, 1.25, ph) : lerp(1.25, 0.2, ph));
        w.copy(sac.p).addScaledVector(dirA, r);
        swarm.put(o2 ? 'O2' : 'CO2', w, tumble(si * 9 + j, T, 0.6, q), busy * Math.min(1, ph * 5, (1 - ph) * 5) * 1.2);
        if (o2 && si === 0 && j === 0) at.oxygen.copy(w);
        if (!o2 && si === 0 && j === 1) at.co2.copy(w);
      }
    });
    swarm.end();
  };
}
