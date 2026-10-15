// The human digestive system, from BodyParts3D, in place in the body.
const t = (en, hi, kn) => ({ en, hi, kn });
const food = '#f0b64a';

export default {
  id: 'digestive',
  version: 1,
  order: 3,
  source: 'bp3d',
  subject: 'Biology',
  classes: [7, 10, 11],
  title: t('Digestive system', 'पाचन तंत्र', 'ಜೀರ್ಣಾಂಗ ವ್ಯವಸ್ಥೆ'),
  summary: t(
    'A long tube from the mouth to the anus, with glands that pour in juices. Food is broken down, taken into the blood, and the rest leaves the body.',
    'मुँह से गुदा तक एक लंबी नली, जिसमें ग्रंथियाँ पाचक रस डालती हैं। भोजन टूटता है, रक्त में अवशोषित होता है, और बचा हुआ शरीर से बाहर निकल जाता है।',
    'ಬಾಯಿಯಿಂದ ಗುದದವರೆಗಿನ ಉದ್ದನೆಯ ನಳಿಕೆ; ಗ್ರಂಥಿಗಳು ಜೀರ್ಣರಸಗಳನ್ನು ಸುರಿಸುತ್ತವೆ. ಆಹಾರ ಒಡೆಯುತ್ತದೆ, ರಕ್ತಕ್ಕೆ ಹೀರಲ್ಪಡುತ್ತದೆ, ಉಳಿದದ್ದು ದೇಹದಿಂದ ಹೊರಹೋಗುತ್ತದೆ.',
  ),
  keywords: ['digestive system', 'digestion', 'alimentary canal', 'stomach', 'intestine', 'small intestine', 'large intestine', 'liver', 'pancreas', 'nutrition in animals', 'human digestive system'],
  credit: 'BodyParts3D, © The Database Center for Life Science, CC BY 4.0',
  detail: 0.45,
  groups: [
    { id: 'canal', name: t('Food passage (alimentary canal)', 'आहार नाल', 'ಆಹಾರ ನಾಳ') },
    { id: 'glands', name: t('Digestive glands', 'पाचक ग्रंथियाँ', 'ಜೀರ್ಣ ಗ್ರಂಥಿಗಳು') },
  ],
  parts: [
    {
      id: 'oesophagus', group: 'canal', color: '#d98383', files: ['FJ2563'],
      cuts: (f) => [{ point: [0, f.bboxOf('stomach').max[1] + 0.09, 0], normal: [0, -1, 0] }],
      name: t('Oesophagus (food pipe)', 'ग्रसिका (भोजन नली)', 'ಅನ್ನನಾಳ'),
      info: t('Carries swallowed food to the stomach by waves of muscle (peristalsis).', 'निगला हुआ भोजन पेशियों की लहरों (क्रमाकुंचन) द्वारा आमाशय तक ले जाती है।', 'ನುಂಗಿದ ಆಹಾರವನ್ನು ಸ್ನಾಯುಗಳ ಅಲೆಗಳ (ಪೆರಿಸ್ಟಾಲ್ಸಿಸ್) ಮೂಲಕ ಜಠರಕ್ಕೆ ಒಯ್ಯುತ್ತದೆ.'),
    },
    {
      id: 'stomach', group: 'canal', color: '#e28f86', files: ['FJ2564'],
      name: t('Stomach', 'आमाशय', 'ಜಠರ'),
      info: t('A muscular bag that churns food with hydrochloric acid, pepsin and mucus.', 'एक पेशीय थैला जो भोजन को हाइड्रोक्लोरिक अम्ल, पेप्सिन और श्लेष्मा के साथ मथता है।', 'ಆಹಾರವನ್ನು ಹೈಡ್ರೋಕ್ಲೋರಿಕ್ ಆಮ್ಲ, ಪೆಪ್ಸಿನ್ ಮತ್ತು ಲೋಳೆಯೊಂದಿಗೆ ಕಲಕುವ ಸ್ನಾಯುವಿನ ಚೀಲ.'),
    },
    {
      id: 'duodenum', group: 'canal', color: '#e6ab70', files: ['FJ2573'],
      name: t('Duodenum', 'ग्रहणी', 'ಡ್ಯುಯೊಡಿನಮ್'),
      info: t('First part of the small intestine. Bile and pancreatic juice join the food here.', 'छोटी आँत का पहला भाग। यहाँ पित्त और अग्न्याशयी रस भोजन से मिलते हैं।', 'ಸಣ್ಣ ಕರುಳಿನ ಮೊದಲ ಭಾಗ. ಇಲ್ಲಿ ಪಿತ್ತರಸ ಮತ್ತು ಮೇದೋಜೀರಕ ರಸ ಆಹಾರವನ್ನು ಸೇರುತ್ತವೆ.'),
    },
    {
      id: 'small_intestine', group: 'canal', color: '#eeb39b', detail: 0.35,
      files: ['FJ2606', 'FJ2607', 'FJ2608', 'FJ2609', 'FJ2610', 'FJ2611', 'FJ2612', 'FJ2613', 'FJ2614', 'FJ2615', 'FJ2616', 'FJ2617', 'FJ2618', 'FJ2619', 'FJ2620', 'FJ2621', 'FJ2622', 'FJ2623', 'FJ2624', 'FJ2625', 'FJ2626', 'FJ2627', 'FJ2628',
        'FJ2574', 'FJ2575', 'FJ2576', 'FJ2577', 'FJ2578', 'FJ2579', 'FJ2580', 'FJ2581', 'FJ2582', 'FJ2583', 'FJ2584', 'FJ2585', 'FJ2586', 'FJ2587', 'FJ2588', 'FJ2589', 'FJ2590', 'FJ2591', 'FJ2592', 'FJ2593', 'FJ2594', 'FJ2595', 'FJ2596', 'FJ2597', 'FJ2598', 'FJ2600', 'FJ2601', 'FJ2602', 'FJ2603', 'FJ2604', 'FJ2605'],
      name: t('Small intestine', 'छोटी आँत', 'ಸಣ್ಣ ಕರುಳು'),
      info: t('About 6 metres long and coiled. Digestion finishes here and villi absorb the food into the blood.', 'लगभग 6 मीटर लंबी और कुंडलित। यहाँ पाचन पूरा होता है और रसांकुर (विलाई) भोजन को रक्त में अवशोषित करते हैं।', 'ಸುಮಾರು 6 ಮೀಟರ್ ಉದ್ದ, ಸುರುಳಿಯಾಗಿದೆ. ಇಲ್ಲಿ ಜೀರ್ಣಕ್ರಿಯೆ ಮುಗಿಯುತ್ತದೆ ಮತ್ತು ವಿಲ್ಲೈಗಳು ಆಹಾರವನ್ನು ರಕ್ತಕ್ಕೆ ಹೀರುತ್ತವೆ.'),
    },
    {
      id: 'large_intestine', group: 'canal', color: '#c4876a', files: ['FJ2599', 'FJ2566', 'FJ2572', 'FJ2567'],
      name: t('Large intestine', 'बड़ी आँत', 'ದೊಡ್ಡ ಕರುಳು'),
      info: t('Wider and shorter. It takes water back from the waste and forms faeces.', 'चौड़ी और छोटी। यह अपशिष्ट से पानी वापस लेती है और मल बनाती है।', 'ಅಗಲ ಮತ್ತು ಚಿಕ್ಕದು. ತ್ಯಾಜ್ಯದಿಂದ ನೀರನ್ನು ಮರಳಿ ಹೀರಿ ಮಲವನ್ನು ರೂಪಿಸುತ್ತದೆ.'),
    },
    {
      id: 'appendix', minor: true, group: 'canal', color: '#b0765a', files: ['FJ2565'],
      name: t('Appendix', 'परिशेषिका (अपेंडिक्स)', 'ಅಪೆಂಡಿಕ್ಸ್'),
      info: t('A small finger-shaped pouch; in humans it has no digestive work.', 'एक छोटी उँगली जैसी थैली; मनुष्य में इसका कोई पाचन कार्य नहीं है।', 'ಬೆರಳಿನಂತಹ ಸಣ್ಣ ಚೀಲ; ಮನುಷ್ಯರಲ್ಲಿ ಇದಕ್ಕೆ ಜೀರ್ಣ ಕಾರ್ಯವಿಲ್ಲ.'),
    },
    {
      id: 'rectum', group: 'canal', color: '#a8604f', files: ['FJ2571'],
      name: t('Rectum', 'मलाशय', 'ಗುದನಾಳ'),
      info: t('Stores faeces until they leave the body through the anus.', 'मल को तब तक संग्रहीत करता है जब तक वह गुदा से बाहर नहीं निकल जाता।', 'ಮಲವು ಗುದದ ಮೂಲಕ ಹೊರಹೋಗುವವರೆಗೆ ಅದನ್ನು ಸಂಗ್ರಹಿಸುತ್ತದೆ.'),
    },
    {
      id: 'liver', group: 'glands', color: '#8e3b2f', detail: 0.1,
      // The eight segments and the caudate lobe (its vessels and bile ducts are inside).
      files: ['FJ2816', 'FJ2818', 'FJ2819', 'FJ2820', 'FJ2821', 'FJ2822', 'FJ2409', 'FJ2823', 'FJ2824'],
      name: t('Liver', 'यकृत', 'ಯಕೃತ್ತು'),
      info: t('The largest gland. It makes bile, stores sugar as glycogen and cleans the blood.', 'सबसे बड़ी ग्रंथि। यह पित्त बनाता है, शर्करा को ग्लाइकोजन के रूप में संग्रहीत करता है और रक्त को साफ़ करता है।', 'ಅತಿ ದೊಡ್ಡ ಗ್ರಂಥಿ. ಪಿತ್ತರಸ ತಯಾರಿಸುತ್ತದೆ, ಸಕ್ಕರೆಯನ್ನು ಗ್ಲೈಕೋಜೆನ್ ರೂಪದಲ್ಲಿ ಸಂಗ್ರಹಿಸುತ್ತದೆ, ರಕ್ತ ಶುದ್ಧೀಕರಿಸುತ್ತದೆ.'),
    },
    {
      id: 'gallbladder', group: 'glands', color: '#5d9a4b', files: ['FJ2817'],
      name: t('Gall bladder', 'पित्ताशय', 'ಪಿತ್ತಕೋಶ'),
      info: t('Stores bile from the liver and squeezes it into the duodenum. Bile breaks fat into small drops.', 'यकृत का पित्त संग्रहीत करता है और ग्रहणी में छोड़ता है। पित्त वसा को छोटी बूँदों में तोड़ता है।', 'ಯಕೃತ್ತಿನ ಪಿತ್ತರಸವನ್ನು ಸಂಗ್ರಹಿಸಿ ಡ್ಯುಯೊಡಿನಮ್‌ಗೆ ಬಿಡುತ್ತದೆ. ಪಿತ್ತರಸ ಕೊಬ್ಬನ್ನು ಸಣ್ಣ ಹನಿಗಳಾಗಿ ಒಡೆಯುತ್ತದೆ.'),
    },
    {
      id: 'pancreas', group: 'glands', color: '#e8c071', files: ['FJ1895', 'FJ1896', 'FJ2629', 'FJ2630'], detail: 0.2,
      name: t('Pancreas', 'अग्न्याशय', 'ಮೇದೋಜೀರಕ ಗ್ರಂಥಿ'),
      info: t('Makes pancreatic juice for digestion, and insulin, which controls blood sugar.', 'पाचन के लिए अग्न्याशयी रस और रक्त शर्करा नियंत्रित करने वाला इंसुलिन बनाता है।', 'ಜೀರ್ಣಕ್ರಿಯೆಗೆ ಮೇದೋಜೀರಕ ರಸ ಮತ್ತು ರಕ್ತದ ಸಕ್ಕರೆಯನ್ನು ನಿಯಂತ್ರಿಸುವ ಇನ್ಸುಲಿನ್ ತಯಾರಿಸುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0, 1] },
    { id: 'left', name: t('Left side', 'बाईं ओर से', 'ಎಡಬದಿ'), dir: [1, 0, 0.3] },
    { id: 'right', name: t('Right side', 'दाईं ओर से', 'ಬಲಬದಿ'), dir: [-1, 0, 0.3] },
    { id: 'back', name: t('Back', 'पीछे से', 'ಹಿಂಭಾಗ'), dir: [0, 0, -1] },
  ],
  slices: [
    { id: 'front_cut', name: t('Front half removed', 'आगे का आधा भाग हटाकर', 'ಮುಂಭಾಗದ ಅರ್ಧ ತೆಗೆದು'), normal: [0, 0, -1], offset: 0.0, view: 'front' },
  ],
  animations: [
    {
      id: 'journey', kind: 'flow',
      name: t('Journey of food', 'भोजन की यात्रा', 'ಆಹಾರದ ಪಯಣ'),
      steps: [
        {
          color: food, highlight: ['oesophagus', 'stomach'],
          text: t('Chewed food is swallowed. Waves of muscle push it down the oesophagus into the stomach.', 'चबाया हुआ भोजन निगला जाता है। पेशियों की लहरें उसे ग्रसिका से आमाशय तक धकेलती हैं।', 'ಅಗಿದ ಆಹಾರ ನುಂಗಲ್ಪಡುತ್ತದೆ. ಸ್ನಾಯುಗಳ ಅಲೆಗಳು ಅದನ್ನು ಅನ್ನನಾಳದ ಮೂಲಕ ಜಠರಕ್ಕೆ ತಳ್ಳುತ್ತವೆ.'),
          paths: [['oesophagus@top', 'oesophagus', 'stomach@top', 'stomach']],
        },
        {
          color: food, highlight: ['stomach'],
          text: t('The stomach churns the food for a few hours with acid and pepsin, which begins to digest proteins.', 'आमाशय कुछ घंटों तक भोजन को अम्ल और पेप्सिन के साथ मथता है; पेप्सिन प्रोटीन का पाचन शुरू करता है।', 'ಜಠರ ಕೆಲವು ಗಂಟೆಗಳ ಕಾಲ ಆಹಾರವನ್ನು ಆಮ್ಲ ಮತ್ತು ಪೆಪ್ಸಿನ್‌ನೊಂದಿಗೆ ಕಲಕುತ್ತದೆ; ಪೆಪ್ಸಿನ್ ಪ್ರೋಟೀನ್ ಜೀರ್ಣಿಸಲು ಆರಂಭಿಸುತ್ತದೆ.'),
          paths: [['stomach@top', 'stomach@right', 'stomach@bottom', 'stomach@left', 'stomach@top']],
        },
        {
          color: food, highlight: ['duodenum', 'liver', 'gallbladder', 'pancreas'],
          text: t('In the duodenum, bile from the liver and gall bladder and juice from the pancreas join the food.', 'ग्रहणी में यकृत और पित्ताशय से पित्त तथा अग्न्याशय से रस भोजन में मिलते हैं।', 'ಡ್ಯುಯೊಡಿನಮ್‌ನಲ್ಲಿ ಯಕೃತ್ತು-ಪಿತ್ತಕೋಶದ ಪಿತ್ತರಸ ಮತ್ತು ಮೇದೋಜೀರಕ ರಸ ಆಹಾರವನ್ನು ಸೇರುತ್ತವೆ.'),
          paths: [['stomach', 'duodenum@top', 'duodenum'], ['gallbladder', 'duodenum'], ['pancreas', 'duodenum']],
        },
        {
          color: food, highlight: ['small_intestine'],
          text: t('In the small intestine digestion is completed. Finger-like villi absorb the nutrients into the blood.', 'छोटी आँत में पाचन पूरा होता है। उँगली जैसे रसांकुर पोषक तत्वों को रक्त में अवशोषित करते हैं।', 'ಸಣ್ಣ ಕರುಳಿನಲ್ಲಿ ಜೀರ್ಣಕ್ರಿಯೆ ಪೂರ್ಣಗೊಳ್ಳುತ್ತದೆ. ಬೆರಳಿನಂತಹ ವಿಲ್ಲೈಗಳು ಪೋಷಕಾಂಶಗಳನ್ನು ರಕ್ತಕ್ಕೆ ಹೀರುತ್ತವೆ.'),
          paths: [['duodenum', 'small_intestine@top', 'small_intestine@left', 'small_intestine', 'small_intestine@right', 'small_intestine@bottom', 'file:FJ2599']],
        },
        {
          color: '#9c6b3f', highlight: ['large_intestine', 'rectum'],
          text: t('The large intestine takes back water. Waste is stored in the rectum and leaves through the anus.', 'बड़ी आँत पानी वापस लेती है। अपशिष्ट मलाशय में जमा होता है और गुदा से बाहर निकलता है।', 'ದೊಡ್ಡ ಕರುಳು ನೀರನ್ನು ಮರಳಿ ಹೀರುತ್ತದೆ. ತ್ಯಾಜ್ಯ ಗುದನಾಳದಲ್ಲಿ ಸಂಗ್ರಹವಾಗಿ ಗುದದ ಮೂಲಕ ಹೊರಹೋಗುತ್ತದೆ.'),
          paths: [['file:FJ2599', 'file:FJ2566@top', 'file:FJ2572', 'file:FJ2567@top', 'file:FJ2567@bottom', 'rectum', 'rectum@bottom']],
        },
      ],
    },
  ],
};
