// The respiratory system, from BodyParts3D. BodyParts3D has the airways
// and blood vessels of the lungs but not the lungs' outer surface: it is
// wrapped around them (an envelope) and shared between the lobes by which
// lobe's airways are nearest.
import { readFileSync } from 'node:fs';

// FJ2041 and FJ2044, filed under the right lung in BodyParts3D, lie at the
// level of the kidneys; they are left out of lungs_files.json.
const f = JSON.parse(readFileSync(new URL('./lungs_files.json', import.meta.url), 'utf8'));
const t = (en, hi, kn) => ({ en, hi, kn });
const lung = '#e8a0a6';
const env = { cell: 0.0025, grow: 0.011, fill: 0.024, smooth: 4 };

export default {
  id: 'lungs',
  version: 1,
  order: 3.5,
  source: 'bp3d',
  subject: 'Biology',
  classes: [7, 10, 11],
  title: t('Respiratory system', 'श्वसन तंत्र', 'ಉಸಿರಾಟದ ವ್ಯವಸ್ಥೆ'),
  summary: t(
    'Air goes down the windpipe into two lungs, through smaller and smaller tubes to tiny air sacs, where oxygen enters the blood and carbon dioxide leaves it.',
    'हवा श्वासनली से दो फेफड़ों में जाती है, छोटी-छोटी नलियों से होकर सूक्ष्म वायु-कोषों तक, जहाँ ऑक्सीजन रक्त में जाती है और कार्बन डाइऑक्साइड बाहर आती है।',
    'ಗಾಳಿ ಶ್ವಾಸನಾಳದ ಮೂಲಕ ಎರಡು ಶ್ವಾಸಕೋಶಗಳಿಗೆ, ಚಿಕ್ಕ ಚಿಕ್ಕ ನಳಿಕೆಗಳ ಮೂಲಕ ಸೂಕ್ಷ್ಮ ವಾಯುಕೋಶಗಳಿಗೆ ಹೋಗುತ್ತದೆ; ಅಲ್ಲಿ ಆಮ್ಲಜನಕ ರಕ್ತ ಸೇರುತ್ತದೆ, ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ ಹೊರಬರುತ್ತದೆ.',
  ),
  keywords: ['lungs', 'lung', 'respiratory system', 'respiration', 'breathing', 'trachea', 'bronchi', 'alveoli', 'diaphragm', 'breathing and exchange of gases', 'human respiratory system'],
  credit: 'BodyParts3D, © The Database Center for Life Science, CC BY 4.0 (lung surfaces made by KINETIX around its airways)',
  detail: 0.4,
  envelopes: {
    right: { files: [...f.right.airways, ...f.right.arteries, ...f.right.veins], ...env },
    left: { files: [...f.left.airways, ...f.left.arteries, ...f.left.veins], ...env },
  },
  splits: {
    right: { envelope: 'right', near: { right_upper: f.lobes.right_upper, right_middle: f.lobes.right_middle, right_lower: f.lobes.right_lower } },
    left: { envelope: 'left', near: { left_upper: f.lobes.left_upper, left_lower: f.lobes.left_lower } },
  },
  groups: [
    { id: 'airway', name: t('Air passage', 'वायु मार्ग', 'ಗಾಳಿಯ ಮಾರ್ಗ') },
    { id: 'lungs', name: t('Lungs', 'फेफड़े', 'ಶ್ವಾಸಕೋಶಗಳು') },
    { id: 'blood', name: t('Blood vessels of the lungs', 'फेफड़ों की रक्त वाहिकाएँ', 'ಶ್ವಾಸಕೋಶಗಳ ರಕ್ತನಾಳಗಳು') },
    { id: 'muscle', name: t('Breathing muscle', 'श्वसन पेशी', 'ಉಸಿರಾಟದ ಸ್ನಾಯು') },
  ],
  parts: [
    {
      id: 'larynx', group: 'airway', color: '#e7d7b0', files: ['FJ2808', 'FJ2440', 'FJ2769', 'FJ2770', 'FJ2792'],
      name: t('Larynx (voice box)', 'स्वरयंत्र (लैरिंक्स)', 'ಧ್ವನಿಪೆಟ್ಟಿಗೆ (ಲ್ಯಾರಿಂಕ್ಸ್)'),
      info: t('Holds the vocal cords. The epiglottis on top closes the airway when we swallow.', 'इसमें स्वर-रज्जु होते हैं। ऊपर की घाटी-ढक्कन (एपिग्लॉटिस) निगलते समय वायुमार्ग बंद कर देती है।', 'ಇದರಲ್ಲಿ ಧ್ವನಿತಂತುಗಳಿವೆ. ಮೇಲಿನ ಎಪಿಗ್ಲಾಟಿಸ್ ನುಂಗುವಾಗ ಗಾಳಿಮಾರ್ಗವನ್ನು ಮುಚ್ಚುತ್ತದೆ.'),
    },
    {
      id: 'trachea', group: 'airway', color: '#efe3c4', files: ['FJ2541'],
      name: t('Trachea (windpipe)', 'श्वासनली', 'ಶ್ವಾಸನಾಳ'),
      info: t('A tube held open by rings of cartilage, so it does not collapse.', 'उपास्थि के छल्लों से खुली रहने वाली नली, ताकि यह पिचके नहीं।', 'ಮೃದ್ವಸ್ಥಿಯ ಉಂಗುರಗಳಿಂದ ತೆರೆದಿರುವ ನಳಿಕೆ; ಅದು ಕುಸಿಯುವುದಿಲ್ಲ.'),
    },
    {
      id: 'bronchi', group: 'airway', color: '#efe3c4', files: ['FJ2539', 'FJ2450'],
      name: t('Bronchi', 'श्वसनी (ब्रोंकाई)', 'ಶ್ವಾಸನಾಳಿಕೆಗಳು (ಬ್ರಾಂಕೈ)'),
      info: t('The windpipe divides into two bronchi, one for each lung.', 'श्वासनली दो श्वसनियों में बँटती है, हर फेफड़े के लिए एक।', 'ಶ್ವಾಸನಾಳ ಎರಡು ಬ್ರಾಂಕೈಗಳಾಗಿ ಕವಲೊಡೆಯುತ್ತದೆ, ಪ್ರತಿ ಶ್ವಾಸಕೋಶಕ್ಕೆ ಒಂದು.'),
    },
    {
      id: 'bronchial_tree', group: 'airway', color: '#f3ead2', files: [...f.right.airways, ...f.left.airways], detail: 0.3,
      name: t('Bronchioles (bronchial tree)', 'श्वसनिकाएँ (श्वसनी वृक्ष)', 'ಶ್ವಾಸನಾಳಿಕೆಗಳ ಮರ'),
      info: t('The bronchi branch again and again, like a tree, and end in millions of tiny air sacs (alveoli).', 'श्वसनियाँ पेड़ की तरह बार-बार बँटती हैं और लाखों सूक्ष्म वायु-कोषों (कूपिकाओं) में समाप्त होती हैं।', 'ಬ್ರಾಂಕೈಗಳು ಮರದಂತೆ ಮತ್ತೆ ಮತ್ತೆ ಕವಲೊಡೆದು ಲಕ್ಷಾಂತರ ಸೂಕ್ಷ್ಮ ವಾಯುಕೋಶಗಳಲ್ಲಿ (ಆಲ್ವಿಯೋಲೈ) ಕೊನೆಗೊಳ್ಳುತ್ತವೆ.'),
    },
    {
      id: 'right_upper', group: 'lungs', color: lung, opacity: 0.32,
      name: t('Right lung: upper lobe', 'दायाँ फेफड़ा: ऊपरी पालि', 'ಬಲ ಶ್ವಾಸಕೋಶ: ಮೇಲಿನ ಹಾಲೆ'),
      info: t('The right lung has three lobes.', 'दाएँ फेफड़े में तीन पालियाँ होती हैं।', 'ಬಲ ಶ್ವಾಸಕೋಶದಲ್ಲಿ ಮೂರು ಹಾಲೆಗಳಿವೆ.'),
    },
    {
      id: 'right_middle', group: 'lungs', color: '#e39299', opacity: 0.32,
      name: t('Right lung: middle lobe', 'दायाँ फेफड़ा: मध्य पालि', 'ಬಲ ಶ್ವಾಸಕೋಶ: ಮಧ್ಯದ ಹಾಲೆ'),
      info: t('Only the right lung has a middle lobe.', 'केवल दाएँ फेफड़े में मध्य पालि होती है।', 'ಬಲ ಶ್ವಾಸಕೋಶದಲ್ಲಿ ಮಾತ್ರ ಮಧ್ಯದ ಹಾಲೆ ಇದೆ.'),
    },
    {
      id: 'right_lower', group: 'lungs', color: lung, opacity: 0.32,
      name: t('Right lung: lower lobe', 'दायाँ फेफड़ा: निचली पालि', 'ಬಲ ಶ್ವಾಸಕೋಶ: ಕೆಳಗಿನ ಹಾಲೆ'),
      info: t('Rests on the dome of the diaphragm.', 'मध्यपट के गुंबद पर टिकी रहती है।', 'ವಪೆಯ ಗುಮ್ಮಟದ ಮೇಲೆ ಕುಳಿತಿದೆ.'),
    },
    {
      id: 'left_upper', group: 'lungs', color: lung, opacity: 0.32,
      name: t('Left lung: upper lobe', 'बायाँ फेफड़ा: ऊपरी पालि', 'ಎಡ ಶ್ವಾಸಕೋಶ: ಮೇಲಿನ ಹಾಲೆ'),
      info: t('The left lung has two lobes and a notch where the heart sits.', 'बाएँ फेफड़े में दो पालियाँ होती हैं और एक खाँच जहाँ हृदय रहता है।', 'ಎಡ ಶ್ವಾಸಕೋಶದಲ್ಲಿ ಎರಡು ಹಾಲೆಗಳು ಮತ್ತು ಹೃದಯ ಕೂರುವ ಒಂದು ತಗ್ಗು ಇದೆ.'),
    },
    {
      id: 'left_lower', group: 'lungs', color: '#e39299', opacity: 0.32,
      name: t('Left lung: lower lobe', 'बायाँ फेफड़ा: निचली पालि', 'ಎಡ ಶ್ವಾಸಕೋಶ: ಕೆಳಗಿನ ಹಾಲೆ'),
      info: t('Rests on the dome of the diaphragm.', 'मध्यपट के गुंबद पर टिकी रहती है।', 'ವಪೆಯ ಗುಮ್ಮಟದ ಮೇಲೆ ಕುಳಿತಿದೆ.'),
    },
    {
      id: 'arteries', minor: true, group: 'blood', color: '#3f63c9', files: [...f.right.arteries, ...f.left.arteries], detail: 0.3,
      name: t('Pulmonary arteries', 'फुप्फुसीय धमनियाँ', 'ಶ್ವಾಸಕೋಶೀಯ ಅಪಧಮನಿಗಳು'),
      info: t('Bring blood low in oxygen from the heart to the air sacs.', 'हृदय से ऑक्सीजन-रहित रक्त वायु-कोषों तक लाती हैं।', 'ಹೃದಯದಿಂದ ಕಡಿಮೆ ಆಮ್ಲಜನಕದ ರಕ್ತವನ್ನು ವಾಯುಕೋಶಗಳಿಗೆ ತರುತ್ತವೆ.'),
    },
    {
      id: 'veins', minor: true, group: 'blood', color: '#cc3b3b', files: [...f.right.veins, ...f.left.veins], detail: 0.3,
      name: t('Pulmonary veins', 'फुप्फुसीय शिराएँ', 'ಶ್ವಾಸಕೋಶೀಯ ಅಭಿಧಮನಿಗಳು'),
      info: t('Carry blood rich in oxygen back to the heart.', 'ऑक्सीजन-युक्त रक्त वापस हृदय तक ले जाती हैं।', 'ಆಮ್ಲಜನಕಯುಕ್ತ ರಕ್ತವನ್ನು ಮರಳಿ ಹೃದಯಕ್ಕೆ ಒಯ್ಯುತ್ತವೆ.'),
    },
    {
      id: 'diaphragm', group: 'muscle', color: '#c6776b', files: ['FJ3131'], detail: 0.08, opacity: 0.8,
      // Only the dome under the lungs, not the long crura down the back.
      cuts: (f) => [{ point: [0, f.bboxOf('diaphragm').max[1] - 0.075, 0], normal: [0, 1, 0] }],
      name: t('Diaphragm', 'मध्यपट (डायाफ्राम)', 'ವಪೆ (ಡಯಾಫ್ರಮ್)'),
      info: t('A dome of muscle under the lungs. It flattens to breathe in and rises to breathe out.', 'फेफड़ों के नीचे पेशी का गुंबद। साँस लेते समय यह चपटा होता है और साँस छोड़ते समय ऊपर उठता है।', 'ಶ್ವಾಸಕೋಶಗಳ ಕೆಳಗಿನ ಸ್ನಾಯುವಿನ ಗುಮ್ಮಟ. ಉಸಿರೆಳೆಯುವಾಗ ಚಪ್ಪಟೆಯಾಗುತ್ತದೆ, ಉಸಿರು ಬಿಡುವಾಗ ಮೇಲೇರುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0, 1] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0, 0.2] },
    { id: 'back', name: t('Back', 'पीछे से', 'ಹಿಂಭಾಗ'), dir: [0, 0, -1] },
    { id: 'below', name: t('From below', 'नीचे से', 'ಕೆಳಗಿನಿಂದ'), dir: [0, -1, 0.3] },
  ],
  slices: [
    { id: 'front_cut', name: t('Cut through the lungs', 'फेफड़ों के आर-पार काट', 'ಶ್ವಾಸಕೋಶಗಳ ಅಡ್ಡ ಕತ್ತರಿಕೆ'), normal: [0, 0, -1], through: 'trachea', view: 'front' },
  ],
  animations: [
    {
      id: 'breathe', kind: 'breathe', bpm: 14,
      name: t('Breathing in and out', 'साँस लेना और छोड़ना', 'ಉಸಿರೆಳೆಯುವುದು ಮತ್ತು ಬಿಡುವುದು'),
      expand: ['right_upper', 'right_middle', 'right_lower', 'left_upper', 'left_lower', 'bronchial_tree', 'arteries', 'veins'],
      lower: ['diaphragm'],
    },
    {
      id: 'air', kind: 'flow',
      name: t('The path of air', 'हवा का मार्ग', 'ಗಾಳಿಯ ಮಾರ್ಗ'),
      steps: [
        {
          color: '#2f8cff', highlight: ['larynx', 'trachea'],
          text: t('Air breathed in through the nose passes the larynx and goes down the trachea.', 'नाक से ली गई हवा स्वरयंत्र से होकर श्वासनली में नीचे जाती है।', 'ಮೂಗಿನ ಮೂಲಕ ಎಳೆದ ಗಾಳಿ ಧ್ವನಿಪೆಟ್ಟಿಗೆ ದಾಟಿ ಶ್ವಾಸನಾಳದಲ್ಲಿ ಕೆಳಗಿಳಿಯುತ್ತದೆ.'),
          paths: [['larynx@top', 'larynx', 'trachea@top', 'trachea', 'trachea@bottom']],
        },
        {
          color: '#2f8cff', highlight: ['bronchi'],
          text: t('The trachea divides into the right and left bronchi.', 'श्वासनली दाएँ और बाएँ श्वसनी में बँट जाती है।', 'ಶ್ವಾಸನಾಳ ಬಲ ಮತ್ತು ಎಡ ಬ್ರಾಂಕೈಗಳಾಗಿ ಕವಲೊಡೆಯುತ್ತದೆ.'),
          paths: [['trachea@bottom', 'bronchi@left'], ['trachea@bottom', 'bronchi@right']],
        },
        {
          color: '#2f8cff', highlight: ['bronchial_tree'],
          text: t('The bronchi branch into thinner and thinner bronchioles that reach every part of the lungs.', 'श्वसनियाँ पतली-पतली श्वसनिकाओं में बँटती हैं जो फेफड़ों के हर भाग तक पहुँचती हैं।', 'ಬ್ರಾಂಕೈಗಳು ತೆಳುವಾದ ಬ್ರಾಂಕಿಯೋಲ್‌ಗಳಾಗಿ ಕವಲೊಡೆದು ಶ್ವಾಸಕೋಶಗಳ ಪ್ರತಿ ಭಾಗವನ್ನೂ ತಲುಪುತ್ತವೆ.'),
          paths: [['bronchi@left', 'right_upper'], ['bronchi@left', 'right_middle'], ['bronchi@left', 'right_lower'], ['bronchi@right', 'left_upper'], ['bronchi@right', 'left_lower']],
        },
        {
          color: '#ff6b6b', highlight: ['arteries', 'veins'],
          text: t('In the alveoli, oxygen passes into the blood and carbon dioxide passes out of it.', 'कूपिकाओं में ऑक्सीजन रक्त में जाती है और कार्बन डाइऑक्साइड रक्त से बाहर आती है।', 'ಆಲ್ವಿಯೋಲೈಗಳಲ್ಲಿ ಆಮ್ಲಜನಕ ರಕ್ತ ಸೇರುತ್ತದೆ, ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ ರಕ್ತದಿಂದ ಹೊರಬರುತ್ತದೆ.'),
          paths: [['right_lower', 'arteries'], ['left_lower', 'veins']],
        },
        {
          color: '#c9c9c9', highlight: ['diaphragm', 'trachea'],
          text: t('Breathing out: the diaphragm rises, the lungs get smaller, and air with carbon dioxide is pushed out.', 'साँस छोड़ना: मध्यपट ऊपर उठता है, फेफड़े छोटे होते हैं, और कार्बन डाइऑक्साइड वाली हवा बाहर निकलती है।', 'ಉಸಿರು ಬಿಡುವುದು: ವಪೆ ಮೇಲೇರುತ್ತದೆ, ಶ್ವಾಸಕೋಶಗಳು ಕುಗ್ಗುತ್ತವೆ, ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ ಇರುವ ಗಾಳಿ ಹೊರದೂಡಲ್ಪಡುತ್ತದೆ.'),
          paths: [['trachea@bottom', 'trachea', 'trachea@top', 'larynx@top']],
        },
      ],
    },
  ],
};
