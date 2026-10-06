// Digestion: the journey of food along the alimentary canal, peristalsis in
// the oesophagus, the stomach, bile and pancreatic juice, enzymes cutting big
// molecules into small ones, absorption by the villi, and the large
// intestine. Built on the BodyParts3D digestive system (the viewer's model).
import { THREE, seeded, mat, tube, curve, smooth, fract, lerp, clamp01, GlowPoints, MoleculeSwarm, tumble, blob, lathe, profileThrough, surface, canvasTexture, fbm } from './kit.js';
import { C, protein, glowProtein } from './bio.js';

const t = (en, hi, kn) => ({ en, hi, kn });

export const script = {
  id: 'digestion',
  subject: 'Biology',
  classes: [7, 10, 11],
  thumb: { step: 'villi', u: 0.55 },
  title: t('Digestion in humans', 'मनुष्य में पाचन', 'ಮಾನವನಲ್ಲಿ ಜೀರ್ಣಕ್ರಿಯೆ'),
  summary: t(
    'The journey of food through the alimentary canal: swallowing and peristalsis, the stomach, bile and pancreatic juice, enzymes at work, absorption by the villi, and the large intestine.',
    'आहार नाल से होकर भोजन की यात्रा: निगलना और क्रमाकुंचन, आमाशय, पित्त और अग्न्याशयी रस, एंज़ाइमों का काम, रसांकुरों द्वारा अवशोषण, और बड़ी आँत।',
    'ಆಹಾರ ನಾಳದ ಮೂಲಕ ಆಹಾರದ ಪಯಣ: ನುಂಗುವಿಕೆ ಮತ್ತು ಪೆರಿಸ್ಟಾಲ್ಸಿಸ್, ಜಠರ, ಪಿತ್ತರಸ ಮತ್ತು ಮೇದೋಜೀರಕ ರಸ, ಕಿಣ್ವಗಳ ಕೆಲಸ, ವಿಲ್ಲೈಗಳಿಂದ ಹೀರುವಿಕೆ, ಮತ್ತು ದೊಡ್ಡ ಕರುಳು.',
  ),
  keywords: ['digestion', 'digestive system', 'alimentary canal', 'peristalsis', 'stomach', 'small intestine', 'large intestine', 'villi', 'enzymes', 'bile', 'liver', 'pancreas', 'absorption', 'nutrition in animals', 'life processes'],
  credit: 'BodyParts3D, © The Database Center for Life Science (DBCLS), CC BY 4.0',
  look: {
    background: ['#2a2224', '#0a0809'],
    keyAt: [3, 6, 7],
    envTop: '#352d2e',
    stages: { canal: { fog: [16, 36] }, oesophagus: { fog: [9, 22] }, lumen: { fog: [8, 20] }, villi: { fog: [6, 17] } },
  },
  groups: [
    { id: 'canal', name: t('Alimentary canal', 'आहार नाल', 'ಆಹಾರ ನಾಳ') },
    { id: 'glands', name: t('Digestive glands', 'पाचक ग्रंथियाँ', 'ಜೀರ್ಣ ಗ್ರಂಥಿಗಳು') },
    { id: 'process', name: t('Moving and mixing food', 'भोजन का आगे बढ़ना और मिलना', 'ಆಹಾರದ ಚಲನೆ ಮತ್ತು ಮಿಶ್ರಣ') },
    { id: 'molecules', name: t('Molecules', 'अणु', 'ಅಣುಗಳು') },
    { id: 'absorption', name: t('Absorption', 'अवशोषण', 'ಹೀರುವಿಕೆ') },
  ],
  parts: [
    { id: 'oesophagus', group: 'canal', color: '#c97a72', name: t('Oesophagus (food pipe)', 'ग्रसिका (भोजन नली)', 'ಅನ್ನನಾಳ'), info: t('Carries swallowed food to the stomach by waves of muscle (peristalsis).', 'निगला हुआ भोजन पेशियों की लहरों (क्रमाकुंचन) द्वारा आमाशय तक ले जाती है।', 'ನುಂಗಿದ ಆಹಾರವನ್ನು ಸ್ನಾಯುಗಳ ಅಲೆಗಳ (ಪೆರಿಸ್ಟಾಲ್ಸಿಸ್) ಮೂಲಕ ಜಠರಕ್ಕೆ ಒಯ್ಯುತ್ತದೆ.') },
    { id: 'stomach', group: 'canal', color: '#d0857a', name: t('Stomach', 'आमाशय', 'ಜಠರ'), info: t('A muscular bag that churns food with hydrochloric acid, pepsin and mucus.', 'एक पेशीय थैला जो भोजन को हाइड्रोक्लोरिक अम्ल, पेप्सिन और श्लेष्मा के साथ मथता है।', 'ಆಹಾರವನ್ನು ಹೈಡ್ರೋಕ್ಲೋರಿಕ್ ಆಮ್ಲ, ಪೆಪ್ಸಿನ್ ಮತ್ತು ಲೋಳೆಯೊಂದಿಗೆ ಕಲಕುವ ಸ್ನಾಯುವಿನ ಚೀಲ.') },
    { id: 'duodenum', group: 'canal', color: '#d9a27c', name: t('Duodenum', 'ग्रहणी', 'ಡ್ಯುಯೊಡಿನಮ್'), info: t('First part of the small intestine. Bile and pancreatic juice join the food here.', 'छोटी आँत का पहला भाग। यहाँ पित्त और अग्न्याशयी रस भोजन से मिलते हैं।', 'ಸಣ್ಣ ಕರುಳಿನ ಮೊದಲ ಭಾಗ. ಇಲ್ಲಿ ಪಿತ್ತರಸ ಮತ್ತು ಮೇದೋಜೀರಕ ರಸ ಆಹಾರವನ್ನು ಸೇರುತ್ತವೆ.') },
    { id: 'small_intestine', group: 'canal', color: '#e0a590', name: t('Small intestine', 'छोटी आँत', 'ಸಣ್ಣ ಕರುಳು'), info: t('About 6 metres long and coiled. Digestion finishes here and the villi absorb the food.', 'लगभग 6 मीटर लंबी और कुंडलित। यहाँ पाचन पूरा होता है और रसांकुर भोजन को अवशोषित करते हैं।', 'ಸುಮಾರು 6 ಮೀಟರ್ ಉದ್ದ, ಸುರುಳಿಯಾಗಿದೆ. ಇಲ್ಲಿ ಜೀರ್ಣಕ್ರಿಯೆ ಮುಗಿಯುತ್ತದೆ ಮತ್ತು ವಿಲ್ಲೈಗಳು ಆಹಾರವನ್ನು ಹೀರುತ್ತವೆ.') },
    { id: 'large_intestine', group: 'canal', color: '#bf8468', name: t('Large intestine', 'बड़ी आँत', 'ದೊಡ್ಡ ಕರುಳು'), info: t('Wider and shorter. It takes water back from the waste.', 'चौड़ी और छोटी। यह अपशिष्ट से पानी वापस लेती है।', 'ಅಗಲ ಮತ್ತು ಚಿಕ್ಕದು. ತ್ಯಾಜ್ಯದಿಂದ ನೀರನ್ನು ಮರಳಿ ಹೀರುತ್ತದೆ.') },
    { id: 'appendix', group: 'canal', color: '#b07a60', name: t('Appendix', 'परिशेषिका (अपेंडिक्स)', 'ಅಪೆಂಡಿಕ್ಸ್'), info: t('A small finger-shaped pouch; in humans it has no digestive work.', 'एक छोटी उँगली जैसी थैली; मनुष्य में इसका कोई पाचन कार्य नहीं है।', 'ಬೆರಳಿನಂತಹ ಸಣ್ಣ ಚೀಲ; ಮನುಷ್ಯರಲ್ಲಿ ಇದಕ್ಕೆ ಜೀರ್ಣ ಕಾರ್ಯವಿಲ್ಲ.') },
    { id: 'rectum', group: 'canal', color: '#a96553', name: t('Rectum', 'मलाशय', 'ಗುದನಾಳ'), info: t('Stores the waste until it leaves the body through the anus.', 'अपशिष्ट को तब तक रखता है जब तक वह गुदा से बाहर नहीं निकलता।', 'ತ್ಯಾಜ್ಯ ಗುದದ ಮೂಲಕ ದೇಹದಿಂದ ಹೊರಹೋಗುವವರೆಗೆ ಅದನ್ನು ಸಂಗ್ರಹಿಸುತ್ತದೆ.') },
    { id: 'liver', group: 'glands', color: '#7e3a33', name: t('Liver', 'यकृत', 'ಯಕೃತ್ತು'), info: t('The largest gland. It makes bile.', 'सबसे बड़ी ग्रंथि। यह पित्त बनाता है।', 'ಅತಿ ದೊಡ್ಡ ಗ್ರಂಥಿ. ಇದು ಪಿತ್ತರಸವನ್ನು ತಯಾರಿಸುತ್ತದೆ.') },
    { id: 'gallbladder', group: 'glands', color: '#62804a', name: t('Gall bladder', 'पित्ताशय', 'ಪಿತ್ತಕೋಶ'), info: t('Stores bile and releases it into the duodenum.', 'पित्त को जमा करता है और ग्रहणी में छोड़ता है।', 'ಪಿತ್ತರಸವನ್ನು ಸಂಗ್ರಹಿಸಿ ಡ್ಯುಯೊಡಿನಮ್‌ಗೆ ಬಿಡುತ್ತದೆ.') },
    { id: 'pancreas', group: 'glands', color: '#d8b48c', name: t('Pancreas', 'अग्न्याशय', 'ಮೇದೋಜೀರಕ ಗ್ರಂಥಿ'), info: t('Makes pancreatic juice, with enzymes for starch, proteins and fats.', 'अग्न्याशयी रस बनाता है, जिसमें मंड, प्रोटीन और वसा के एंज़ाइम होते हैं।', 'ಪಿಷ್ಟ, ಪ್ರೋಟೀನ್ ಮತ್ತು ಕೊಬ್ಬಿಗೆ ಕಿಣ್ವಗಳಿರುವ ಮೇದೋಜೀರಕ ರಸವನ್ನು ತಯಾರಿಸುತ್ತದೆ.') },
    { id: 'bolus', group: 'process', color: '#c79a62', name: t('Bolus (ball of food)', 'निवाला (बोलस)', 'ಆಹಾರದ ಉಂಡೆ (ಬೋಲಸ್)'), info: t('Chewed food mixed with saliva, soft and slippery.', 'लार में मिला चबाया हुआ भोजन, नरम और चिकना।', 'ಲಾಲಾರಸದೊಂದಿಗೆ ಬೆರೆತ ಅಗಿದ ಆಹಾರ, ಮೃದು ಮತ್ತು ಜಾರುವ.') },
    { id: 'circular_muscle', group: 'process', color: '#a8433d', name: t('Circular muscles', 'वर्तुल पेशियाँ', 'ವೃತ್ತಾಕಾರದ ಸ್ನಾಯುಗಳು'), info: t('They squeeze behind the food, in a wave that runs down the tube.', 'ये भोजन के पीछे सिकुड़ती हैं, एक लहर में जो नली में नीचे की ओर चलती है।', 'ಇವು ಆಹಾರದ ಹಿಂದೆ ಸಂಕುಚಿಸುತ್ತವೆ; ಆ ಅಲೆ ನಳಿಕೆಯ ಕೆಳಗೆ ಸಾಗುತ್ತದೆ.') },
    { id: 'gastric_juice', group: 'process', color: '#d8f08a', name: t('Gastric juice', 'जठर रस', 'ಜಠರ ರಸ'), info: t('Hydrochloric acid, the enzyme pepsin, and mucus.', 'हाइड्रोक्लोरिक अम्ल, एंज़ाइम पेप्सिन, और श्लेष्मा।', 'ಹೈಡ್ರೋಕ್ಲೋರಿಕ್ ಆಮ್ಲ, ಪೆಪ್ಸಿನ್ ಕಿಣ್ವ ಮತ್ತು ಲೋಳೆ.') },
    { id: 'bile', group: 'process', color: '#b9d65a', name: t('Bile', 'पित्त', 'ಪಿತ್ತರಸ'), info: t('Breaks fat into tiny droplets, and makes the food alkaline.', 'वसा को छोटी बूँदों में तोड़ता है, और भोजन को क्षारीय बनाता है।', 'ಕೊಬ್ಬನ್ನು ಸಣ್ಣ ಹನಿಗಳಾಗಿ ಒಡೆಯುತ್ತದೆ ಮತ್ತು ಆಹಾರವನ್ನು ಕ್ಷಾರೀಯವಾಗಿಸುತ್ತದೆ.') },
    { id: 'pancreatic_juice', group: 'process', color: '#e8f0ff', name: t('Pancreatic juice', 'अग्न्याशयी रस', 'ಮೇದೋಜೀರಕ ರಸ'), info: t('Trypsin for proteins, lipase for fats, amylase for starch.', 'प्रोटीन के लिए ट्रिप्सिन, वसा के लिए लाइपेज़, मंड के लिए एमाइलेज़।', 'ಪ್ರೋಟೀನ್‌ಗೆ ಟ್ರಿಪ್ಸಿನ್, ಕೊಬ್ಬಿಗೆ ಲೈಪೇಸ್, ಪಿಷ್ಟಕ್ಕೆ ಅಮೈಲೇಸ್.') },
    { id: 'enzyme', group: 'molecules', color: '#7c93b4', name: t('Enzyme', 'एंज़ाइम', 'ಕಿಣ್ವ'), info: t('A protein that speeds up one reaction, here cutting a big molecule.', 'एक प्रोटीन जो किसी एक अभिक्रिया को तेज़ करता है, यहाँ एक बड़े अणु को काटता है।', 'ಒಂದು ಕ್ರಿಯೆಯನ್ನು ವೇಗಗೊಳಿಸುವ ಪ್ರೋಟೀನ್; ಇಲ್ಲಿ ದೊಡ್ಡ ಅಣುವನ್ನು ಕತ್ತರಿಸುತ್ತದೆ.') },
    { id: 'starch', group: 'molecules', color: '#c4483f', name: t('Starch', 'मंड (स्टार्च)', 'ಪಿಷ್ಟ'), info: t('A long chain of glucose units.', 'ग्लूकोज़ इकाइयों की एक लंबी शृंखला।', 'ಗ್ಲೂಕೋಸ್ ಘಟಕಗಳ ಉದ್ದನೆಯ ಸರಪಳಿ.') },
    { id: 'glucose', group: 'molecules', color: '#c4483f', name: t('Glucose', 'ग्लूकोज़', 'ಗ್ಲೂಕೋಸ್'), info: t('A simple sugar, small enough to be absorbed.', 'एक सरल शर्करा, जो अवशोषित होने लायक छोटी है।', 'ಹೀರಲ್ಪಡುವಷ್ಟು ಸಣ್ಣದಾದ ಸರಳ ಸಕ್ಕರೆ.') },
    { id: 'protein_chain', group: 'molecules', color: '#4a6fb5', name: t('Protein', 'प्रोटीन', 'ಪ್ರೋಟೀನ್'), info: t('A long chain of amino acids.', 'अमीनो अम्लों की एक लंबी शृंखला।', 'ಅಮೈನೋ ಆಮ್ಲಗಳ ಉದ್ದನೆಯ ಸರಪಳಿ.') },
    { id: 'amino_acids', group: 'molecules', color: '#4a6fb5', name: t('Amino acids', 'अमीनो अम्ल', 'ಅಮೈನೋ ಆಮ್ಲಗಳು'), info: t('The building blocks of proteins.', 'प्रोटीन की निर्माण इकाइयाँ।', 'ಪ್ರೋಟೀನ್‌ಗಳ ನಿರ್ಮಾಣ ಘಟಕಗಳು.') },
    { id: 'fat', group: 'molecules', color: '#f2d27a', name: t('Fat droplets', 'वसा की बूँदें', 'ಕೊಬ್ಬಿನ ಹನಿಗಳು'), info: t('Bile breaks big drops of fat into small ones, so lipase can work on them.', 'पित्त वसा की बड़ी बूँदों को छोटी बूँदों में तोड़ता है, ताकि लाइपेज़ उन पर काम कर सके।', 'ಪಿತ್ತರಸ ಕೊಬ್ಬಿನ ದೊಡ್ಡ ಹನಿಗಳನ್ನು ಸಣ್ಣವಾಗಿ ಒಡೆಯುತ್ತದೆ; ಆಗ ಲೈಪೇಸ್ ಕೆಲಸ ಮಾಡಬಹುದು.') },
    { id: 'villi', group: 'absorption', color: '#e29a90', name: t('Villi', 'रसांकुर (विलाई)', 'ವಿಲ್ಲೈಗಳು'), info: t('Finger-like folds of the inner wall, about a millimetre tall.', 'भीतरी दीवार के उँगली जैसे उभार, लगभग एक मिलीमीटर ऊँचे।', 'ಒಳಗೋಡೆಯ ಬೆರಳಿನಂತಹ ಉಬ್ಬುಗಳು, ಸುಮಾರು ಒಂದು ಮಿಲಿಮೀಟರ್ ಎತ್ತರ.') },
    { id: 'capillaries', group: 'absorption', color: '#b8443a', name: t('Blood capillaries', 'रक्त केशिकाएँ', 'ರಕ್ತ ಲೋಮನಾಳಗಳು'), info: t('Take up sugars and amino acids and carry them to the liver.', 'शर्करा और अमीनो अम्ल लेकर उन्हें यकृत तक ले जाती हैं।', 'ಸಕ್ಕರೆ ಮತ್ತು ಅಮೈನೋ ಆಮ್ಲಗಳನ್ನು ಪಡೆದು ಯಕೃತ್ತಿಗೆ ಒಯ್ಯುತ್ತವೆ.') },
    { id: 'lacteal', group: 'absorption', color: '#f3e9c2', name: t('Lacteal', 'लसीका वाहिनी (लैक्टियल)', 'ಲ್ಯಾಕ್ಟಿಯಲ್ (ದುಗ್ಧನಾಳ)'), info: t('A lymph vessel in each villus that takes up digested fats.', 'हर रसांकुर में एक लसीका वाहिनी जो पची हुई वसा लेती है।', 'ಪ್ರತಿ ವಿಲ್ಲಸ್‌ನಲ್ಲಿರುವ ದುಗ್ಧನಾಳ; ಜೀರ್ಣವಾದ ಕೊಬ್ಬನ್ನು ಹೀರುತ್ತದೆ.') },
    { id: 'nutrients', group: 'absorption', color: '#ffcf6a', name: t('Digested food', 'पचा हुआ भोजन', 'ಜೀರ್ಣವಾದ ಆಹಾರ'), info: t('Glucose, amino acids, fatty acids and glycerol.', 'ग्लूकोज़, अमीनो अम्ल, वसा अम्ल और ग्लिसरॉल।', 'ಗ್ಲೂಕೋಸ್, ಅಮೈನೋ ಆಮ್ಲಗಳು, ಕೊಬ್ಬಿನಾಮ್ಲಗಳು ಮತ್ತು ಗ್ಲಿಸರಾಲ್.') },
    { id: 'water', group: 'absorption', color: '#7fc4ff', name: t('Water', 'पानी', 'ನೀರು'), info: t('Taken back into the body through the wall of the large intestine.', 'बड़ी आँत की दीवार से शरीर में वापस लिया जाता है।', 'ದೊಡ್ಡ ಕರುಳಿನ ಗೋಡೆಯ ಮೂಲಕ ದೇಹಕ್ಕೆ ಮರಳಿ ಹೀರಲ್ಪಡುತ್ತದೆ.') },
  ],
  steps: [
    {
      id: 'journey', stage: 'canal', seconds: 15,
      camera: { pos: [3.0, 1.0, 19.5], target: [0, 0.1, 0], from: [6, 3, 28], drift: 0.04 },
      highlight: [], labels: ['oesophagus', 'stomach', 'liver', 'pancreas', 'small_intestine', 'large_intestine'],
      title: t('A tube nine metres long', 'नौ मीटर लंबी नली', 'ಒಂಬತ್ತು ಮೀಟರ್ ಉದ್ದದ ನಳಿಕೆ'),
      caption: t(
        'Digestion happens in the alimentary canal, a tube about nine metres long from the mouth to the anus. As food moves along it, glands pour in juices that break it down into molecules small enough to be absorbed.',
        'पाचन आहार नाल में होता है, जो मुँह से गुदा तक लगभग नौ मीटर लंबी नली है। भोजन इसमें आगे बढ़ता है तो ग्रंथियाँ पाचक रस डालती हैं, जो उसे इतने छोटे अणुओं में तोड़ते हैं कि वे अवशोषित हो सकें।',
        'ಜೀರ್ಣಕ್ರಿಯೆ ಆಹಾರ ನಾಳದಲ್ಲಿ ನಡೆಯುತ್ತದೆ; ಇದು ಬಾಯಿಯಿಂದ ಗುದದವರೆಗೆ ಸುಮಾರು ಒಂಬತ್ತು ಮೀಟರ್ ಉದ್ದದ ನಳಿಕೆ. ಆಹಾರ ಅದರಲ್ಲಿ ಸಾಗುವಾಗ ಗ್ರಂಥಿಗಳು ರಸಗಳನ್ನು ಸುರಿಸಿ, ಅದನ್ನು ಹೀರಲ್ಪಡುವಷ್ಟು ಸಣ್ಣ ಅಣುಗಳಾಗಿ ಒಡೆಯುತ್ತವೆ.',
      ),
    },
    {
      id: 'swallow', stage: 'oesophagus', seconds: 14,
      camera: { pos: [3.6, 0.9, 8.8], target: [0, -0.2, 0], from: [1, 3, 14], drift: 0.02 },
      highlight: ['circular_muscle'], labels: ['bolus', 'circular_muscle', 'oesophagus'],
      title: t('Swallowing: peristalsis', 'निगलना: क्रमाकुंचन', 'ನುಂಗುವಿಕೆ: ಪೆರಿಸ್ಟಾಲ್ಸಿಸ್'),
      caption: t(
        'Chewed food mixed with saliva is swallowed as a soft ball, the bolus. Rings of muscle in the wall of the oesophagus squeeze behind it in a wave, called peristalsis, pushing it down to the stomach.',
        'लार में मिला चबाया हुआ भोजन एक नरम गोले, निवाले (बोलस), के रूप में निगला जाता है। ग्रसिका की दीवार की वर्तुल पेशियाँ इसके पीछे एक लहर में सिकुड़ती हैं, जिसे क्रमाकुंचन कहते हैं, और इसे नीचे आमाशय तक धकेलती हैं।',
        'ಲಾಲಾರಸದೊಂದಿಗೆ ಬೆರೆತ ಅಗಿದ ಆಹಾರವನ್ನು ಮೃದುವಾದ ಉಂಡೆಯಾಗಿ (ಬೋಲಸ್) ನುಂಗಲಾಗುತ್ತದೆ. ಅನ್ನನಾಳದ ಗೋಡೆಯ ವೃತ್ತಾಕಾರದ ಸ್ನಾಯುಗಳು ಅದರ ಹಿಂದೆ ಅಲೆಯಂತೆ ಸಂಕುಚಿಸಿ (ಪೆರಿಸ್ಟಾಲ್ಸಿಸ್) ಅದನ್ನು ಜಠರಕ್ಕೆ ತಳ್ಳುತ್ತವೆ.',
      ),
    },
    {
      id: 'stomach', stage: 'canal', seconds: 15,
      camera: { pos: [3.4, 3.2, 9.4], target: [0.4, 1.8, 0.3], drift: 0.02 },
      highlight: ['stomach'], labels: ['oesophagus', 'stomach', 'duodenum', 'gastric_juice'],
      title: t('The stomach', 'आमाशय', 'ಜಠರ'),
      caption: t(
        'The stomach’s muscular wall churns the food with gastric juice. Its hydrochloric acid kills germs and lets the enzyme pepsin start digesting proteins. Mucus protects the stomach lining from the acid.',
        'आमाशय की पेशीय दीवार भोजन को जठर रस के साथ मथती है। इसका हाइड्रोक्लोरिक अम्ल रोगाणुओं को मारता है और एंज़ाइम पेप्सिन को प्रोटीन का पाचन शुरू करने देता है। श्लेष्मा आमाशय के अस्तर को अम्ल से बचाती है।',
        'ಜಠರದ ಸ್ನಾಯುಗೋಡೆ ಆಹಾರವನ್ನು ಜಠರ ರಸದೊಂದಿಗೆ ಕಲಕುತ್ತದೆ. ಅದರ ಹೈಡ್ರೋಕ್ಲೋರಿಕ್ ಆಮ್ಲ ರೋಗಾಣುಗಳನ್ನು ಕೊಲ್ಲುತ್ತದೆ ಮತ್ತು ಪೆಪ್ಸಿನ್ ಕಿಣ್ವ ಪ್ರೋಟೀನ್‌ಗಳ ಜೀರ್ಣಕ್ರಿಯೆ ಆರಂಭಿಸಲು ನೆರವಾಗುತ್ತದೆ. ಲೋಳೆ ಜಠರದ ಒಳಪದರವನ್ನು ಆಮ್ಲದಿಂದ ರಕ್ಷಿಸುತ್ತದೆ.',
      ),
    },
    {
      id: 'juices', stage: 'canal', seconds: 15,
      camera: { pos: [-2.8, 1.8, 10.0], target: [-0.2, 0.7, 0.3], drift: -0.02 },
      highlight: ['liver', 'gallbladder', 'pancreas'], labels: ['liver', 'gallbladder', 'pancreas', 'duodenum', 'bile', 'pancreatic_juice'],
      title: t('Bile and pancreatic juice', 'पित्त और अग्न्याशयी रस', 'ಪಿತ್ತರಸ ಮತ್ತು ಮೇದೋಜೀರಕ ರಸ'),
      caption: t(
        'In the duodenum the food meets bile, made by the liver and stored in the gall bladder, and pancreatic juice from the pancreas. Bile breaks fat into tiny droplets; the pancreas’s enzymes digest starch, proteins and fats.',
        'ग्रहणी में भोजन पित्त से मिलता है, जो यकृत बनाता है और पित्ताशय में जमा रहता है, और अग्न्याशय के अग्न्याशयी रस से भी। पित्त वसा को छोटी बूँदों में तोड़ता है; अग्न्याशय के एंज़ाइम मंड, प्रोटीन और वसा को पचाते हैं।',
        'ಡ್ಯುಯೊಡಿನಮ್‌ನಲ್ಲಿ ಆಹಾರವು ಯಕೃತ್ತು ತಯಾರಿಸಿ ಪಿತ್ತಕೋಶದಲ್ಲಿ ಸಂಗ್ರಹಿಸಿದ ಪಿತ್ತರಸವನ್ನು ಮತ್ತು ಮೇದೋಜೀರಕ ಗ್ರಂಥಿಯ ರಸವನ್ನು ಸೇರುತ್ತದೆ. ಪಿತ್ತರಸ ಕೊಬ್ಬನ್ನು ಸಣ್ಣ ಹನಿಗಳಾಗಿ ಒಡೆಯುತ್ತದೆ; ಮೇದೋಜೀರಕ ಕಿಣ್ವಗಳು ಪಿಷ್ಟ, ಪ್ರೋಟೀನ್ ಮತ್ತು ಕೊಬ್ಬನ್ನು ಜೀರ್ಣಿಸುತ್ತವೆ.',
      ),
    },
    {
      id: 'enzymes', stage: 'lumen', seconds: 15,
      camera: { pos: [0.6, 0.8, 11.0], target: [-0.6, 0.3, 0], from: [0, 0, 18], drift: 0.02 },
      highlight: ['enzyme'], labels: ['enzyme', 'starch', 'glucose', 'protein_chain', 'amino_acids', 'fat'],
      title: t('Enzymes cut big molecules', 'एंज़ाइम बड़े अणुओं को काटते हैं', 'ಕಿಣ್ವಗಳು ದೊಡ್ಡ ಅಣುಗಳನ್ನು ಕತ್ತರಿಸುತ್ತವೆ'),
      caption: t(
        'Enzymes cut big molecules into small ones: starch into glucose, proteins into amino acids, and fats into fatty acids and glycerol. In the small intestine the digestion of all three is completed.',
        'एंज़ाइम बड़े अणुओं को छोटे अणुओं में काटते हैं: मंड को ग्लूकोज़ में, प्रोटीन को अमीनो अम्लों में, और वसा को वसा अम्लों और ग्लिसरॉल में। छोटी आँत में तीनों का पाचन पूरा होता है।',
        'ಕಿಣ್ವಗಳು ದೊಡ್ಡ ಅಣುಗಳನ್ನು ಸಣ್ಣವಾಗಿ ಕತ್ತರಿಸುತ್ತವೆ: ಪಿಷ್ಟವನ್ನು ಗ್ಲೂಕೋಸ್ ಆಗಿ, ಪ್ರೋಟೀನ್‌ಗಳನ್ನು ಅಮೈನೋ ಆಮ್ಲಗಳಾಗಿ, ಮತ್ತು ಕೊಬ್ಬನ್ನು ಕೊಬ್ಬಿನಾಮ್ಲ ಮತ್ತು ಗ್ಲಿಸರಾಲ್ ಆಗಿ. ಸಣ್ಣ ಕರುಳಿನಲ್ಲಿ ಮೂರರ ಜೀರ್ಣಕ್ರಿಯೆಯೂ ಪೂರ್ಣಗೊಳ್ಳುತ್ತದೆ.',
      ),
    },
    {
      id: 'villi', stage: 'villi', seconds: 16,
      camera: { pos: [2.2, 2.6, 8.8], target: [0, 0.85, 0.6], from: [3, 5, 15], drift: 0.025 },
      highlight: ['villi'], labels: ['villi', 'capillaries', 'lacteal', 'nutrients'],
      title: t('Absorption by the villi', 'रसांकुरों द्वारा अवशोषण', 'ವಿಲ್ಲೈಗಳಿಂದ ಹೀರುವಿಕೆ'),
      caption: t(
        'The inner wall of the small intestine is covered with millions of finger-like villi, which give it a huge surface. Digested food passes into the blood capillaries inside each villus, and fats into the lacteal, to be carried round the body.',
        'छोटी आँत की भीतरी दीवार लाखों उँगली जैसे रसांकुरों से ढकी होती है, जो इसकी सतह बहुत बड़ी कर देते हैं। पचा हुआ भोजन हर रसांकुर के अंदर की रक्त केशिकाओं में जाता है, और वसा लैक्टियल में, ताकि पूरे शरीर तक पहुँचे।',
        'ಸಣ್ಣ ಕರುಳಿನ ಒಳಗೋಡೆ ಲಕ್ಷಾಂತರ ಬೆರಳಿನಂತಹ ವಿಲ್ಲೈಗಳಿಂದ ಮುಚ್ಚಿದ್ದು, ಅವು ಅದರ ಮೇಲ್ಮೈಯನ್ನು ಬಹಳ ದೊಡ್ಡದಾಗಿಸುತ್ತವೆ. ಜೀರ್ಣವಾದ ಆಹಾರ ಪ್ರತಿ ವಿಲ್ಲಸ್‌ನೊಳಗಿನ ರಕ್ತ ಲೋಮನಾಳಗಳಿಗೆ, ಕೊಬ್ಬು ಲ್ಯಾಕ್ಟಿಯಲ್‌ಗೆ ಸೇರಿ ದೇಹದೆಲ್ಲೆಡೆ ಸಾಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'large', stage: 'canal', seconds: 14,
      camera: { pos: [-3.4, -0.2, 16.0], target: [0, -0.5, 0], drift: -0.03 },
      highlight: ['large_intestine'], labels: ['large_intestine', 'appendix', 'rectum', 'water'],
      title: t('The large intestine', 'बड़ी आँत', 'ದೊಡ್ಡ ಕರುಳು'),
      caption: t(
        'What cannot be digested passes into the large intestine, which takes back most of the water. The remaining waste is stored in the rectum and leaves the body through the anus.',
        'जो पच नहीं पाता वह बड़ी आँत में जाता है, जो उसका अधिकांश पानी वापस ले लेती है। बचा हुआ अपशिष्ट मलाशय में जमा रहता है और गुदा से शरीर के बाहर निकल जाता है।',
        'ಜೀರ್ಣವಾಗದ ಭಾಗ ದೊಡ್ಡ ಕರುಳಿಗೆ ಹೋಗುತ್ತದೆ; ಅದು ಅದರ ಹೆಚ್ಚಿನ ನೀರನ್ನು ಮರಳಿ ಹೀರುತ್ತದೆ. ಉಳಿದ ತ್ಯಾಜ್ಯ ಗುದನಾಳದಲ್ಲಿ ಸಂಗ್ರಹವಾಗಿ ಗುದದ ಮೂಲಕ ದೇಹದಿಂದ ಹೊರಹೋಗುತ್ತದೆ.',
      ),
    },
  ],
};

const S = 18; // the model is in metres
const ORGANS = ['oesophagus', 'stomach', 'duodenum', 'small_intestine', 'large_intestine', 'appendix', 'rectum', 'liver', 'gallbladder', 'pancreas'];

/** Moist living tissue: a soft sheen and a wet clear coat. */
const tissue = (color, o = {}) => mat({ color, rough: 0.5, clearcoat: 0.45, clearcoatRough: 0.3, sheen: 0.4, sheenColor: C(color).lerp(C('#ffe2d8'), 0.4), sheenRough: 0.5, rim: 0.14, ...o });

export async function build(k) {
  const model = await k.loadModel('digestive');
  const stages = { canal: buildCanal(k, model), oesophagus: buildOesophagus(k), lumen: buildLumen(k), villi: buildVilli(k) };
  return { update: (s) => stages[s.stage]?.(s) };
}

// ------------------------------------------------------------------ helpers

const verts = (g) => {
  const p = g.attributes.position, out = [];
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i));
  return out;
};
const centroid = (pts) => pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(Math.max(1, pts.length));
/** A rough centre line through a tube-like organ: its vertices averaged in [n] bins of [key]. */
function binned(pts, key, n) {
  const ks = pts.map(key);
  let lo = Infinity, hi = -Infinity;
  for (const x of ks) {
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  const bins = Array.from({ length: n }, () => ({ v: new THREE.Vector3(), c: 0 }));
  pts.forEach((p, i) => {
    const b = bins[Math.min(n - 1, Math.floor(((ks[i] - lo) / (hi - lo || 1)) * n))];
    b.v.add(p);
    b.c++;
  });
  return bins.filter((b) => b.c > 3).map((b) => b.v.divideScalar(b.c));
}
const nearestFirst = (pts, to) => (pts[0].distanceTo(to) <= pts[pts.length - 1].distanceTo(to) ? pts : pts.slice().reverse());
const angleKey = (c, from) => (p) => {
  let a = Math.atan2(p.y - c.y, p.x - c.x);
  if (a < from) a += Math.PI * 2;
  return a;
};

// ------------------------------------------------------------------ the whole canal

function buildCanal(k, model) {
  const stage = k.stage('canal');
  const G = {};
  for (const id of ORGANS) G[id] = model.geometries[id].clone().scale(S, S, S);
  const box = new THREE.Box3();
  for (const g of Object.values(G)) {
    g.computeBoundingBox();
    box.union(g.boundingBox);
  }
  const centre = box.getCenter(new THREE.Vector3());
  for (const g of Object.values(G)) {
    g.translate(-centre.x, -centre.y, -centre.z);
    g.computeBoundingSphere();
  }
  const mats = {
    oesophagus: tissue('#c47870'),
    stomach: tissue('#cf857a'),
    duodenum: tissue('#d49c7a'),
    small_intestine: tissue('#dda08c'),
    large_intestine: tissue('#bb8268', { sheen: 0.3 }),
    appendix: tissue('#b07a60'),
    rectum: tissue('#a6644f'),
    liver: tissue('#7a3530', { clearcoat: 0.6, clearcoatRough: 0.2, sheen: 0.25 }),
    gallbladder: tissue('#5f7d45', { clearcoat: 0.7 }),
    pancreas: tissue('#d6b089', { sheen: 0.5, rough: 0.6 }),
  };
  for (const id of ['liver', 'stomach', 'small_intestine', 'large_intestine']) mats[id].transparent = true;
  const W = {};
  for (const id of ORGANS) {
    const m = new THREE.Mesh(G[id], mats[id]);
    stage.add(m);
    W[id] = k.part(id, m);
  }

  // The route of the food, from the organs' own shapes.
  const V = {};
  for (const id of ORGANS) V[id] = verts(G[id]);
  const oes = binned(V.oesophagus, (p) => -p.y, 9);
  const st = V.stomach, sb = new THREE.Box3().setFromPoints(st), ss = sb.getSize(new THREE.Vector3());
  const stC = centroid(st);
  const lowSt = centroid(st.filter((p) => p.y < sb.min.y + ss.y * 0.3));
  const pylorus = centroid(st.filter((p) => p.x < sb.min.x + ss.x * 0.14));
  const duC = centroid(V.duodenum);
  const du = nearestFirst(binned(V.duodenum, angleKey(duC, -0.4), 12), pylorus);
  const liC = centroid(V.large_intestine);
  const li = binned(V.large_intestine, (p) => -angleKey(liC, -Math.PI / 2)(p), 20);
  const re = nearestFirst(binned(V.rectum, (p) => -p.y, 6), li[li.length - 1]);
  // The small intestine: a winding route through its coils, from the duodenum to the start of the large intestine.
  const si = V.small_intestine, ib = new THREE.Box3().setFromPoints(si), is = ib.getSize(new THREE.Vector3());
  const siPts = [];
  const rows = 5;
  for (let r = 0; r < rows; r++) {
    const y = lerp(ib.max.y - is.y * 0.18, ib.min.y + is.y * 0.18, r / (rows - 1));
    const xs = [ib.max.x - is.x * 0.2, ib.min.x + is.x * 0.5 + Math.sin(r * 2.1) * is.x * 0.08, ib.min.x + is.x * 0.2];
    if (r % 2) xs.reverse();
    for (const [j, x] of xs.entries()) siPts.push(new THREE.Vector3(x, y + Math.sin(r + j) * is.y * 0.04, ib.max.z - is.z * (0.3 + 0.1 * Math.sin(r * 3 + j))));
  }
  const route = curve([...oes, stC.clone().lerp(sb.max.clone().setZ(stC.z), 0.25), stC, lowSt, pylorus, ...du, ...siPts, ...nearestFirst(li, siPts[siPts.length - 1]), ...re]);
  const routePts = route.getSpacedPoints(700);
  const colonPts = curve([...nearestFirst(li, siPts[siPts.length - 1]), ...re]).getSpacedPoints(300);

  // Bile: liver → gall bladder → duodenum. Pancreatic juice: along the pancreas to the duodenum.
  const gb = centroid(V.gallbladder);
  const duMid = du[Math.floor(du.length * 0.4)];
  const pa = V.pancreas, pb = new THREE.Box3().setFromPoints(pa), ps = pb.getSize(new THREE.Vector3());
  const panTail = centroid(pa.filter((p) => p.x > pb.max.x - ps.x * 0.2));
  const panHead = centroid(pa.filter((p) => p.x < pb.min.x + ps.x * 0.25));
  const liverC = centroid(V.liver);
  const bileCurve = curve([liverC.clone().lerp(gb, 0.6), gb, gb.clone().lerp(duMid, 0.5).add(new THREE.Vector3(0.15, 0.1, 0.35)), duMid]);
  const panCurve = curve([panTail, centroid(pa), panHead, duMid]);

  // Inside the stomach: points pulled in from its wall, for the churning juice.
  const rnd = seeded(211);
  const inside = Array.from({ length: 90 }, () => st[Math.floor(rnd() * st.length)].clone().lerp(stC, 0.35 + rnd() * 0.4));
  const stPivot = stC.clone();

  // Glowing tracers, seen through the organs like a dye.
  const glow = new GlowPoints(1400, { size: 0.16 });
  glow.material.depthTest = false;
  stage.add(glow);
  const at = { gastric_juice: new THREE.Vector3(), bile: new THREE.Vector3(), pancreatic_juice: new THREE.Vector3(), water: new THREE.Vector3() };
  for (const id of Object.keys(at)) k.marker(id, stage, (out) => (at[id].lengthSq() ? out.copy(at[id]) : null), 0.25);
  const food = C('#ffbf62'), dim = C('#ffd9a0'), acid = C('#d8f08a'), bileC = C('#b9d65a'), panC = C('#e6efff'), waste = C('#c98f4a'), water = C('#7fc4ff');
  const v = new THREE.Vector3(), axis = new THREE.Vector3(0.3, 1, 0.2).normalize(), q = new THREE.Quaternion();
  const jit = Array.from({ length: 400 }, () => [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd()]);
  const along = (pts, u) => pts[Math.min(pts.length - 1, Math.max(0, Math.round(u * (pts.length - 1))))];

  return (s) => {
    const T = s.T;
    for (const key in at) at[key].set(0, 0, 0);
    // Organs in front fade so the ones the step is about can be seen.
    const ease = smooth(s.t / 1.2);
    const liverK = s.is('stomach') ? lerp(1, 0.22, ease) : s.is('juices') ? lerp(1, 0.4, ease) : 1;
    mats.liver.opacity = liverK;
    mats.liver.depthWrite = liverK > 0.95;
    const stK = s.is('stomach') ? lerp(1, 0.62, ease) : s.is('juices') ? lerp(1, 0.45, ease) : 1;
    mats.stomach.opacity = stK;
    mats.stomach.depthWrite = stK > 0.95;
    const siK = s.is('large') ? lerp(1, 0.35, ease) : 1;
    mats.small_intestine.opacity = siK;
    mats.small_intestine.depthWrite = siK > 0.95;
    // The stomach churns.
    const churn = s.is('stomach') ? 1 : 0.3;
    const sc = 1 + 0.025 * churn * Math.sin(T * 2.4), sc2 = 1 - 0.02 * churn * Math.sin(T * 2.4 + 1.2);
    W.stomach.scale.set(sc, sc2, sc);
    W.stomach.position.set(stPivot.x * (1 - sc), stPivot.y * (1 - sc2), stPivot.z * (1 - sc));

    glow.begin();
    if (s.is('journey')) {
      // The route, faintly, and three meals moving along it.
      for (let i = 0; i < routePts.length; i += 5) {
        const p = routePts[i];
        glow.push(p.x, p.y, p.z, 0.08, dim, 0.06);
      }
      for (let m = 0; m < 3; m++) {
        const u0 = fract(T * 0.045 + m / 3);
        for (let i = 0; i < 40; i++) {
          const j = jit[m * 40 + i];
          const u = u0 - j[3] * 0.025;
          if (u < 0) continue;
          const p = along(routePts, u);
          glow.push(p.x + j[0] * 0.25, p.y + j[1] * 0.25, p.z + j[2] * 0.25, 0.2, food, 0.55 * (1 - j[3]));
        }
      }
    }
    if (s.is('stomach', 'journey')) {
      const k2 = s.is('stomach') ? 1 : 0.35;
      inside.forEach((p, i) => {
        q.setFromAxisAngle(axis, 0.45 * Math.sin(T * 1.2 + i * 0.37) + T * 0.15);
        v.copy(p).sub(stPivot).applyQuaternion(q).add(stPivot);
        const isAcid = i % 3 !== 0;
        glow.push(v.x, v.y, v.z, isAcid ? 0.09 : 0.17, isAcid ? acid : food, (isAcid ? 0.4 : 0.42) * k2);
        if (i === 4) at.gastric_juice.copy(v);
      });
    }
    if (s.is('juices')) {
      for (let i = 0; i < 70; i++) {
        const j = jit[i];
        const u = fract(i / 70 + T * 0.12);
        bileCurve.getPointAt(u, v);
        glow.push(v.x + j[0] * 0.12, v.y + j[1] * 0.12, v.z + j[2] * 0.12, 0.13, bileC, 0.5 * Math.min(1, u * 8, (1 - u) * 8 + 0.3));
        if (i === 30) at.bile.copy(v);
        panCurve.getPointAt(fract(i / 70 + T * 0.1), v);
        glow.push(v.x + j[1] * 0.12, v.y + j[2] * 0.12, v.z + j[0] * 0.12, 0.13, panC, 0.32);
        if (i === 20) at.pancreatic_juice.copy(v);
      }
      // Food passing through the duodenum.
      for (let i = 0; i < 40; i++) {
        const j = jit[100 + i];
        const p = along(du, fract(i / 40 + T * 0.08));
        glow.push(p.x + j[0] * 0.3, p.y + j[1] * 0.3, p.z + j[2] * 0.3, 0.2, food, 0.4);
      }
    }
    if (s.is('large')) {
      // Waste moving slowly round the colon; water leaving through its wall.
      for (let i = 0; i < 90; i++) {
        const j = jit[i];
        const p = along(colonPts, fract(i / 90 + T * 0.03));
        glow.push(p.x + j[0] * 0.3, p.y + j[1] * 0.3, p.z + j[2] * 0.3, 0.2, waste, 0.45);
      }
      for (let i = 0; i < 60; i++) {
        const j = jit[200 + i];
        const ph = fract(j[3] + T * 0.25);
        const p = along(colonPts, (i / 60) * 0.85);
        v.copy(p).sub(liC).setZ(0.6).normalize();
        v.multiplyScalar(0.3 + ph * 1.1).add(p);
        glow.push(v.x, v.y, v.z + j[2] * 0.2, 0.12, water, 0.7 * Math.min(1, ph * 6, (1 - ph) * 2.5));
        if (i === 12) at.water.copy(v);
      }
    }
    glow.done();
  };
}

// ------------------------------------------------------------------ peristalsis in the oesophagus

function buildOesophagus(k) {
  const stage = k.stage('oesophagus');
  const OPEN = 0.38 * Math.PI; // half the cut-away window, round the front
  const Y0 = 4.8, Y1 = -4.8, R0 = 0.66, WALL = 0.3;
  const wave = { yc: 10, yb: 10 };
  const g = (y, c, w) => Math.exp(-(((y - c) / w) ** 2));
  const lumen = (y) => R0 + 0.24 * g(y, wave.yb, 1.0) - 0.42 * g(y, wave.yc, 0.6);
  const wall = (y) => WALL * (1 + 0.45 * g(y, wave.yc, 0.6));
  const phiAt = (u) => OPEN + u * (Math.PI * 2 - 2 * OPEN);
  const yAt = (v) => lerp(Y0, Y1, v);
  const fInner = (u, v, o) => {
    const ph = phiAt(u), y = yAt(v);
    // The lining lies in long folds when the tube is empty.
    const r = lumen(y) - 0.05 * (0.5 + 0.5 * Math.cos(ph * 9)) * (1 - g(y, wave.yb, 1.0));
    o.set(Math.sin(ph) * r, y, Math.cos(ph) * r);
  };
  const fOuter = (u, v, o) => {
    const ph = phiAt(u), y = yAt(v), r = lumen(y) + wall(y);
    o.set(Math.sin(ph) * r, y, Math.cos(ph) * r);
  };
  const fRim = (side) => (u, v, o) => {
    const ph = side ? Math.PI * 2 - OPEN : OPEN, y = yAt(v);
    const r = lerp(lumen(y) - 0.05, lumen(y) + wall(y), u);
    o.set(Math.sin(ph) * r, y, Math.cos(ph) * r);
  };
  // The muscle's circular fibres, as a texture round the tube.
  const fibres = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#b4544c';
    c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) {
      c.fillStyle = `rgba(${90 + ((y * 37) % 30)}, 30, 30, ${0.25 + ((y * 13) % 10) / 40})`;
      c.fillRect(0, y, w, 1.5);
    }
  }, { repeat: [3, 10] });
  const muscle = mat({ color: '#ffffff', map: fibres, rough: 0.55, clearcoat: 0.35, sheen: 0.3, sheenColor: '#ffc8c0', rim: 0.14, side: THREE.DoubleSide });
  const lining = mat({ color: '#e7a29a', rough: 0.3, clearcoat: 0.9, clearcoatRough: 0.12, sheen: 0.4, sheenColor: '#ffe6e0', rim: 0.12, side: THREE.DoubleSide });
  const layers = mat({ color: '#ffffff', vertexColors: true, rough: 0.5, clearcoat: 0.3, rim: 0.1, side: THREE.DoubleSide });
  const inner = new THREE.Mesh(surface(fInner, 72, 90), lining);
  const outer = new THREE.Mesh(surface(fOuter, 54, 90), muscle);
  const rims = [0, 1].map((side) => {
    const geo = surface(fRim(side), 6, 90);
    // The layers of the wall: lining, a paler layer under it, then muscle.
    const col = [];
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const a = uv.getX(i);
      const c = a < 0.2 ? C('#e7a29a') : a < 0.4 ? C('#efd3c2') : C('#a8433d');
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return new THREE.Mesh(geo, layers);
  });
  const tubeGroup = new THREE.Group();
  tubeGroup.add(inner, outer, ...rims);
  stage.add(tubeGroup);
  k.part('oesophagus', tubeGroup, { anchor: [-0.9, 3.2, 0.3] });
  const refresh = (mesh, f) => {
    const geo = mesh.geometry, p = geo.attributes.position, uv = geo.attributes.uv, o = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      f(uv.getX(i), uv.getY(i), o);
      p.setXYZ(i, o.x, o.y, o.z);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  };

  const bolus = new THREE.Mesh(blob(0.8, 1.1, 0.8, { detail: 28, amp: 0.07, freq: 2.2, seed: 5 }), mat({ color: '#c39662', rough: 0.4, clearcoat: 0.9, clearcoatRough: 0.1, sheen: 0.35, sheenColor: '#ffe8c8', rim: 0.15 }));
  stage.add(bolus);
  k.part('bolus', bolus);
  const ringAt = new THREE.Vector3();
  k.marker('circular_muscle', stage, (out) => out.copy(ringAt), 0.3);
  let last = -1;
  return (s) => {
    const P = 5.5;
    const ph = fract(s.T / P + 0.35);
    wave.yc = 6.2 - 12.4 * ph;
    wave.yb = wave.yc - 1.5;
    const key = Math.round(wave.yc * 200);
    if (key !== last) {
      last = key;
      refresh(inner, fInner);
      refresh(outer, fOuter);
      refresh(rims[0], fRim(0));
      refresh(rims[1], fRim(1));
    }
    bolus.position.set(0, wave.yb, 0);
    bolus.scale.set(1, 1 + 0.06 * Math.sin(ph * 30), 1);
    bolus.rotation.y = s.T * 0.2;
    bolus.visible = wave.yb > Y1 - 1 && wave.yb < Y0 + 1;
    const r = lumen(wave.yc) + wall(wave.yc);
    ringAt.set(Math.sin(OPEN) * r, Math.min(Y0 - 0.3, Math.max(Y1 + 0.3, wave.yc)), Math.cos(OPEN) * r);
  };
}

// ------------------------------------------------------------------ enzymes at work

function buildLumen(k) {
  const stage = k.stage('lumen');
  const rnd = seeded(223);
  // The wall of the intestine, far behind, soft in the haze.
  const back = new THREE.Mesh(surface((u, v, o) => {
    const x = lerp(-16, 16, u), y = lerp(-9, 9, v);
    o.set(x, y, -7 - 2.5 * Math.cos(x * 0.12) + 0.5 * fbm(x * 0.6, y * 0.6, 0, 3));
  }, 80, 50), mat({ color: '#a8625c', rough: 0.6, clearcoat: 0.4, sheen: 0.4, sheenColor: '#ffd0c8', rim: 0.1 }));
  back.userData.decor = true;
  stage.add(back);

  const swarm = new MoleculeSwarm(500, { scale: 0.1 });
  stage.add(swarm);
  // Starch: a chain of glucose units, curling as a helix. Protein: a chain of amino acids.
  const N = 12, gap = 0.38;
  const chain = (y, z, twist) => Array.from({ length: N }, (_, i) => {
    const x = -4.2 + i * gap;
    return new THREE.Vector3(x, y + 0.28 * Math.sin(i * twist), z + 0.28 * Math.cos(i * twist));
  });
  const starch = chain(1.35, 0, 1.1), prot = chain(-1.25, 0.2, 0.9);
  const drift = Array.from({ length: N * 2 }, () => new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.2).normalize());
  const amylase = protein([[0, 0, 0, 0.42, 0.36, 0.38], [0.3, 0.2, 0.07, 0.26], [-0.28, 0.19, -0.07, 0.23], [0.07, -0.24, 0.17, 0.2]], '#7c93b4', { seed: 3, atom: 0.06 });
  const trypsin = protein([[0, 0, 0, 0.38, 0.34, 0.36], [-0.27, -0.2, 0.07, 0.24], [0.26, -0.17, -0.07, 0.22]], '#9a84ae', { seed: 7, atom: 0.06 });
  stage.add(amylase, trypsin);
  k.part('enzyme', amylase, { anchor: () => amylase.position.clone() });
  const enzymeB = new THREE.Group();
  enzymeB.add(trypsin);
  // Fat: a big drop that bile breaks into small ones.
  const fatMat = mat({ color: '#efcd72', rough: 0.15, clearcoat: 1, clearcoatRough: 0.05, sheen: 0.2, rim: 0.3, rimColor: '#fff2c0', opacity: 0.94 });
  const bigDrop = new THREE.Mesh(blob(0.85, 0.85, 0.85, { detail: 32 }), fatMat);
  bigDrop.position.set(2.5, 0.05, 0);
  stage.add(bigDrop);
  k.part('fat', bigDrop);
  const ND = 16;
  const drops = new THREE.InstancedMesh(blob(1, 1, 1, { detail: 14 }), fatMat, ND);
  drops.frustumCulled = false;
  drops.userData.decor = true;
  stage.add(drops);
  const dropDir = Array.from({ length: ND }, () => new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() * 0.6 - 0.1).normalize());
  const dropR = Array.from({ length: ND }, () => 0.11 + rnd() * 0.09);
  const at = { starch: new THREE.Vector3(), glucose: new THREE.Vector3(), protein_chain: new THREE.Vector3(), amino_acids: new THREE.Vector3() };
  for (const id of Object.keys(at)) k.marker(id, stage, (out) => (at[id].lengthSq() ? out.copy(at[id]) : null), 0.25);
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), e = new THREE.Euler();
  const x0 = -4.2, x1 = -4.2 + (N - 1) * gap;
  return (s) => {
    const T = s.T, t0 = s.t;
    for (const key in at) at[key].set(0, 0, 0);
    swarm.begin();
    // Each enzyme walks along its chain from the right, cutting units off as it goes.
    const run = (units, enzyme, delay, kind, base, idChain, idFree) => {
      const p = clamp01((t0 - delay) / 10);
      const xe = lerp(x1 + 0.6, x0 - 0.3, p);
      enzyme.position.set(xe + 0.1 * Math.sin(T * 1.3), units[0].y + 0.45 + 0.05 * Math.sin(T * 2), 0.3);
      enzyme.rotation.set(0.2 * Math.sin(T * 0.7), T * 0.15, 0.1 * Math.sin(T));
      glowProtein(enzyme, 0.04 + 0.05 * (0.5 + 0.5 * Math.sin(T * 6)), 0.05, 0.08);
      units.forEach((u0, i) => {
        // When the enzyme passed this unit, it came free.
        const tFree = delay + (10 * (x1 + 0.6 - u0.x)) / (x1 + 0.6 - x0 + 0.3);
        const age = Math.max(0, t0 - tFree);
        v.copy(u0);
        if (age > 0) {
          const d = drift[base + i];
          v.addScaledVector(d, 1.0 * (1 - Math.exp(-age * 0.35))).add({ x: 0.05 * Math.sin(T * 1.7 + i), y: 0.05 * Math.cos(T * 1.3 + i), z: 0 });
          tumble(base + i, T, 0.5, q);
        } else {
          e.set(0, i * 1.1, 0.3);
          q.setFromEuler(e);
          v.y += 0.03 * Math.sin(T * 1.5 + i * 0.6);
        }
        swarm.put(kind, v, q, 1);
        if (i === 1) at[idChain].copy(v);
        if (i === N - 1 && age > 0.6) at[idFree].copy(v);
      });
    };
    run(starch, amylase, 0.6, 'glucose', 0, 'starch', 'glucose');
    run(prot, trypsin, 1.6, 'glutamate', N, 'protein_chain', 'amino_acids');
    swarm.end();
    // Fat: the big drop breaks up into small droplets.
    const pf = clamp01((t0 - 1.5) / 9);
    const shrink = 1 - 0.45 * smooth(pf);
    bigDrop.scale.setScalar(shrink * (1 + 0.02 * Math.sin(T * 2.2)));
    for (let i = 0; i < ND; i++) {
      const a = clamp01(pf * 1.6 - i / ND);
      const d = dropDir[i];
      v.copy(bigDrop.position).addScaledVector(d, shrink * 0.85 + 0.15 + a * 0.9);
      v.y += 0.06 * Math.sin(T + i);
      sc.setScalar(dropR[i] * smooth(a * 3));
      m4.compose(v, q.identity(), sc);
      drops.setMatrixAt(i, m4);
    }
    drops.count = ND;
    drops.instanceMatrix.needsUpdate = true;
  };
}

// ------------------------------------------------------------------ the villi

function buildVilli(k) {
  const stage = k.stage('villi');
  const rnd = seeded(229);
  const floorY = -1.6;
  const floorAt = (x, z) => floorY + 0.12 * Math.sin(x * 0.9) * Math.cos(z * 0.7);
  const floor = new THREE.Mesh(surface((u, v, o) => {
    const x = lerp(-8, 8, u), z = lerp(3.8, -7, v);
    o.set(x, floorAt(x, z) - 0.04, z);
  }, 70, 50), tissue('#c47268', { rough: 0.6 }));
  floor.userData.decor = true;
  stage.add(floor);
  const prof = profileThrough([[0.25, -0.15], [0.26, 0.3], [0.25, 1.0], [0.23, 1.5], [0.19, 1.78], [0.11, 1.93], [0.0, 1.98]], 14);
  const villusMat = tissue('#e0968c', { sheen: 0.6, sheenColor: '#ffd9d0', clearcoat: 0.55, rim: 0.22 });
  const geo = lathe(prof, { segments: 18 });
  const spots = [];
  for (let x = -7; x <= 7; x += 0.86) {
    for (let z = 3.2; z >= -6.5; z -= 0.86) {
      const px = x + (rnd() - 0.5) * 0.36, pz = z + (rnd() - 0.5) * 0.36;
      if (Math.abs(px) < 0.95 && pz > 0.4 && pz < 2.3) continue; // room for the cut-open one
      spots.push({ p: new THREE.Vector3(px, floorAt(px, pz), pz), h: 0.85 + rnd() * 0.3, w: 0.9 + rnd() * 0.2, tilt: [(rnd() - 0.5) * 0.25, rnd() * 6, (rnd() - 0.5) * 0.25], ph: rnd() * 6 });
    }
  }
  const villi = new THREE.InstancedMesh(geo, villusMat, spots.length);
  villi.frustumCulled = false;
  stage.add(villi);
  k.part('villi', villi, { anchor: [-2.4, 0.3, 0.4] });

  // One villus, larger and cut open, showing its capillaries and lacteal.
  const H = 1.6;
  const hero = new THREE.Group();
  hero.position.set(0, floorAt(0, 1.3), 1.3);
  const shell = new THREE.Mesh(lathe(prof.map(([r, y]) => [r * H, y * H]), { segments: 40, phiStart: 0.36 * Math.PI, phiLength: Math.PI * 2 - 0.72 * Math.PI }), tissue('#e39a90', { side: THREE.DoubleSide, sheen: 0.5, rim: 0.2 }));
  hero.add(shell);
  const top = 1.86 * H;
  const capPts = (side) => [[side * 0.22, -0.2, -0.05], [side * 0.24, 0.6, 0.02], [side * 0.22, 1.5, -0.06], [side * 0.15, 2.4, 0.0], [side * 0.05, top - 0.1, -0.05]];
  const art = capPts(-1), ven = capPts(1);
  const loop = curve([...art, [0, top - 0.02, -0.05], ...ven.slice().reverse()]);
  const capGeo = tube(loop, 0.035, { segments: 120, radial: 8 });
  // Red where the blood comes in, darker where it leaves.
  const col = [];
  const pp = capGeo.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const c = C('#c4473c').lerp(C('#7a3a5e'), smooth((pp.getX(i) + 0.2) / 0.4));
    col.push(c.r, c.g, c.b);
  }
  capGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const capillaries = new THREE.Group();
  capillaries.add(new THREE.Mesh(capGeo, mat({ color: '#ffffff', vertexColors: true, rough: 0.35, clearcoat: 0.6, rim: 0.15 })));
  // Cross links between the two sides.
  for (let i = 0; i < 6; i++) {
    const y = 0.3 + i * 0.42;
    const a = loop.getPointAt(0.1 + i * 0.065), b = loop.getPointAt(0.9 - i * 0.065);
    capillaries.add(new THREE.Mesh(tube([a, new THREE.Vector3(0, y, 0.12 + 0.05 * Math.sin(i)), b], 0.022, { segments: 16, radial: 6 }), mat({ color: '#a94450', rough: 0.4, clearcoat: 0.5, rim: 0.12 })));
  }
  hero.add(capillaries);
  k.part('capillaries', capillaries, { anchor: [0.3, 1.2, 0.1] });
  const lactealCurve = curve([[0, -0.3, -0.12], [0.02, 1.0, -0.12], [0, 2.2, -0.1]]);
  const lacteal = new THREE.Mesh(tube(lactealCurve, 0.075, { segments: 40, radial: 12 }), mat({ color: '#f1e5bd', rough: 0.35, clearcoat: 0.6, sheen: 0.4, rim: 0.2, opacity: 0.9 }));
  hero.add(lacteal);
  k.part('lacteal', lacteal);
  stage.add(hero);

  // Digested food: sugars and amino acids into the capillaries, fats into the lacteal.
  const glow = new GlowPoints(500, { size: 0.08 });
  stage.add(glow);
  const sugar = C('#ffc75e'), fat = C('#fff3d6'), blood = C('#ff7a66');
  const N = 26;
  const start = Array.from({ length: N * 3 }, () => new THREE.Vector3((rnd() - 0.5) * 2.4, 2.0 + rnd() * 1.6, 1.3 + (rnd() - 0.5) * 1.4));
  const entry = Array.from({ length: N * 3 }, () => 0.15 + rnd() * 0.7);
  const nut = new THREE.Vector3();
  k.marker('nutrients', stage, (out) => (nut.lengthSq() ? out.copy(nut) : null), 0.2);
  const v = new THREE.Vector3(), w = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();
  return (s) => {
    const T = s.T;
    // Villi sway gently in the moving contents.
    spots.forEach((sp, i) => {
      e.set(sp.tilt[0] + 0.05 * Math.sin(T * 0.9 + sp.ph), sp.tilt[1], sp.tilt[2] + 0.05 * Math.cos(T * 0.7 + sp.ph));
      q.setFromEuler(e);
      sc.set(sp.w, sp.h, sp.w);
      m4.compose(sp.p, q, sc);
      villi.setMatrixAt(i, m4);
    });
    villi.instanceMatrix.needsUpdate = true;
    hero.rotation.z = 0.03 * Math.sin(T * 0.8);
    nut.set(0, 0, 0);
    glow.begin();
    for (let i = 0; i < N * 2; i++) {
      const isFat = i % 3 === 2;
      const ph = fract(i / (N * 2) + T * 0.07);
      const h = entry[i];
      // The point where it enters: on the villus's surface, then the vessel inside.
      const tgtLocal = isFat ? lactealCurve.getPointAt(h * 0.9) : loop.getPointAt(0.5 + 0.45 * (1 - h));
      const surf = new THREE.Vector3(tgtLocal.x * 2.2 + 0.1 * Math.sin(i), tgtLocal.y, 0.45);
      if (ph < 0.45) {
        w.copy(surf).add(hero.position);
        v.copy(start[i]).lerp(w, smooth(ph / 0.45));
      } else if (ph < 0.58) {
        v.copy(surf).lerp(tgtLocal, smooth((ph - 0.45) / 0.13)).add(hero.position);
      } else {
        // Carried away, down the vessel and out of the villus.
        const a = (ph - 0.58) / 0.42;
        if (isFat) lactealCurve.getPointAt(Math.max(0, h * 0.9 * (1 - a)), v);
        else loop.getPointAt(Math.min(1, 0.5 + 0.45 * (1 - h) + a * (1 - (0.5 + 0.45 * (1 - h)))), v);
        v.add(hero.position);
      }
      glow.push(v.x, v.y, v.z, isFat ? 0.08 : 0.07, isFat ? fat : sugar, 0.75 * Math.min(1, ph * 8, (1 - ph) * 8));
      if (i === 3 && ph < 0.45) nut.copy(v);
    }
    // Blood moving through the capillary loop.
    for (let i = 0; i < 40; i++) {
      loop.getPointAt(fract(i / 40 + T * 0.09), v);
      v.add(hero.position);
      glow.push(v.x, v.y, v.z, 0.06, blood, 0.35);
    }
    // Nutrients settling onto the other villi, too.
    for (let i = 0; i < 60; i++) {
      const ph = fract(i * 0.137 + T * 0.05);
      const sp = spots[(i * 7) % spots.length];
      v.set(sp.p.x + 0.3 * Math.sin(i), sp.p.y + 1.9 * sp.h + (1 - ph) * 1.6, sp.p.z + 0.3 * Math.cos(i));
      glow.push(v.x, v.y, v.z, 0.07, sugar, 0.45 * Math.min(1, ph * 5, (1 - ph) * 5));
    }
    glow.done();
  };
}
