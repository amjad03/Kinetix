// The liver from BodyParts3D (CC BY 4.0): its lobes made of the Couinaud
// segments, the gallbladder and bile ducts, and the vessels at its gate (the
// portal vein, hepatic artery, hepatic veins and the vena cava). Downloaded
// on first use.
const t = (en, hi, kn) => ({ en, hi, kn });

export default {
  id: 'liver',
  version: 1,
  order: 6.2,
  source: 'bp3d',
  remote: true,
  topic: 'human',
  license: 'CC BY 4.0',
  subject: 'Biology',
  classes: [7, 10, 11],
  title: t('Liver and gallbladder', 'यकृत और पित्ताशय', 'ಯಕೃತ್ತು ಮತ್ತು ಪಿತ್ತಕೋಶ'),
  summary: t(
    'The largest gland in the body, about 1.5 kg. It makes bile for digesting fats, stores sugar as glycogen and cleans the blood that comes from the intestines.',
    'शरीर की सबसे बड़ी ग्रंथि, लगभग 1.5 किलो। यह वसा पचाने के लिए पित्त बनाता है, शर्करा को ग्लाइकोजन के रूप में संग्रहित करता है और आँतों से आने वाले रक्त को साफ़ करता है।',
    'ದೇಹದ ಅತಿ ದೊಡ್ಡ ಗ್ರಂಥಿ, ಸುಮಾರು 1.5 ಕೆಜಿ. ಕೊಬ್ಬು ಜೀರ್ಣಿಸಲು ಪಿತ್ತರಸ ತಯಾರಿಸುತ್ತದೆ, ಸಕ್ಕರೆಯನ್ನು ಗ್ಲೈಕೋಜೆನ್ ಆಗಿ ಸಂಗ್ರಹಿಸುತ್ತದೆ ಮತ್ತು ಕರುಳಿನಿಂದ ಬರುವ ರಕ್ತವನ್ನು ಶುದ್ಧಗೊಳಿಸುತ್ತದೆ.',
  ),
  keywords: ['liver', 'gallbladder', 'bile', 'bile duct', 'hepatic', 'glycogen', 'digestion', 'digestive glands', 'portal vein', 'nutrition in animals', 'life processes', 'digestion and absorption'],
  credit: 'BodyParts3D, © The Database Center for Life Science, CC BY 4.0',
  detail: 0.45,
  groups: [
    { id: 'lobes', name: t('Lobes of the liver', 'यकृत की पालियाँ', 'ಯಕೃತ್ತಿನ ಹಾಲೆಗಳು') },
    { id: 'bile', name: t('Bile system', 'पित्त तंत्र', 'ಪಿತ್ತ ವ್ಯವಸ್ಥೆ') },
    { id: 'blood', name: t('Blood vessels', 'रक्त वाहिकाएँ', 'ರಕ್ತನಾಳಗಳು') },
  ],
  parts: [
    {
      id: 'right_lobe', group: 'lobes', color: '#8e3b32', files: ['FJ2821', 'FJ2822', 'FJ2409', 'FJ2823', 'FJ2824'], explode: [-1, 0.2, 0],
      name: t('Right lobe', 'दायाँ पालि', 'ಬಲ ಹಾಲೆ'),
      info: t('The biggest part, about five times the size of the left lobe. Like the rest of the liver it is made of tiny six-sided lobules of liver cells.', 'सबसे बड़ा भाग, बाएँ पालि से लगभग पाँच गुना। शेष यकृत की तरह यह यकृत कोशिकाओं की छोटी षट्कोणीय पालिकाओं से बना है।', 'ಅತಿ ದೊಡ್ಡ ಭಾಗ, ಎಡ ಹಾಲೆಗಿಂತ ಸುಮಾರು ಐದು ಪಟ್ಟು. ಉಳಿದ ಯಕೃತ್ತಿನಂತೆ ಇದೂ ಯಕೃತ್ ಕೋಶಗಳ ಸಣ್ಣ ಷಡ್ಭುಜಾಕೃತಿಯ ಹಾಲೆಕೆಗಳಿಂದ ಮಾಡಲ್ಪಟ್ಟಿದೆ.'),
    },
    {
      id: 'left_lobe', group: 'lobes', color: '#9b4338', files: ['FJ2818', 'FJ2819'], explode: [1, 0.2, 0],
      name: t('Left lobe', 'बायाँ पालि', 'ಎಡ ಹಾಲೆ'),
      info: t('The thinner part on the left, over the stomach.', 'बाईं ओर का पतला भाग, आमाशय के ऊपर।', 'ಎಡಭಾಗದ ತೆಳುವಾದ ಭಾಗ, ಜಠರದ ಮೇಲೆ.'),
    },
    {
      id: 'quadrate_lobe', group: 'lobes', color: '#a5493d', files: ['FJ2820'], explode: [0.3, 0, 0.8],
      name: t('Middle part and quadrate lobe', 'मध्य भाग और चतुष्कोणीय पालि', 'ಮಧ್ಯ ಭಾಗ ಮತ್ತು ಚತುರ್ಭುಜ ಹಾಲೆ'),
      info: t('The part between the right and left lobes (segment IV). Its lower end, beside the gallbladder, is the small square quadrate lobe.', 'दाएँ और बाएँ पालि के बीच का भाग (खंड IV)। पित्ताशय के पास इसका निचला सिरा छोटी चौकोर चतुष्कोणीय पालि है।', 'ಬಲ ಮತ್ತು ಎಡ ಹಾಲೆಗಳ ನಡುವಿನ ಭಾಗ (ಖಂಡ IV). ಪಿತ್ತಕೋಶದ ಪಕ್ಕದ ಇದರ ಕೆಳತುದಿ ಸಣ್ಣ ಚೌಕಾಕಾರದ ಚತುರ್ಭುಜ ಹಾಲೆ.'),
    },
    {
      id: 'caudate_lobe', group: 'lobes', color: '#b0564a', files: ['FJ2816'], explode: [0.2, 0.3, -1],
      name: t('Caudate lobe', 'पुच्छीय पालि', 'ಪುಚ್ಛ ಹಾಲೆ'),
      info: t('A small lobe at the back, beside the vena cava.', 'पीछे की ओर, महाशिरा के पास एक छोटी पालि।', 'ಹಿಂಭಾಗದಲ್ಲಿ, ಮಹಾಭಿಧಮನಿಯ ಪಕ್ಕದ ಸಣ್ಣ ಹಾಲೆ.'),
    },
    {
      id: 'gallbladder', group: 'bile', color: '#4f9a52', files: ['FJ2817'], explode: [-0.3, -0.6, 0.7],
      name: t('Gallbladder', 'पित्ताशय', 'ಪಿತ್ತಕೋಶ'),
      info: t('A small bag under the liver that stores bile and squeezes it out when fatty food reaches the intestine.', 'यकृत के नीचे एक छोटी थैली जो पित्त जमा करती है और वसायुक्त भोजन आँत में पहुँचने पर उसे बाहर निचोड़ती है।', 'ಯಕೃತ್ತಿನ ಕೆಳಗಿನ ಸಣ್ಣ ಚೀಲ; ಪಿತ್ತರಸವನ್ನು ಸಂಗ್ರಹಿಸಿ, ಕೊಬ್ಬಿನ ಆಹಾರ ಕರುಳಿಗೆ ತಲುಪಿದಾಗ ಹೊರಹಿಂಡುತ್ತದೆ.'),
    },
    {
      id: 'bile_ducts', group: 'bile', color: '#7cc36a', files: ['FJ3079', 'FJ3080', 'FJ3096', 'FJ3123'], explode: [0, -0.8, 0.4], minPiece: 4,
      name: t('Bile ducts', 'पित्त नलिकाएँ', 'ಪಿತ್ತನಾಳಗಳು'),
      info: t('Tubes that carry bile from the liver and the gallbladder to the duodenum, where it breaks fat into small drops (emulsification).', 'नलियाँ जो पित्त को यकृत और पित्ताशय से ग्रहणी तक ले जाती हैं, जहाँ यह वसा को छोटी बूँदों में तोड़ता है (इमल्सीकरण)।', 'ಪಿತ್ತರಸವನ್ನು ಯಕೃತ್ತು ಮತ್ತು ಪಿತ್ತಕೋಶದಿಂದ ಡ್ಯುಯೊಡಿನಮ್‌ಗೆ ಒಯ್ಯುವ ನಾಳಗಳು; ಅಲ್ಲಿ ಅದು ಕೊಬ್ಬನ್ನು ಸಣ್ಣ ಹನಿಗಳಾಗಿ ಒಡೆಯುತ್ತದೆ (ಎಮಲ್ಸೀಕರಣ).'),
    },
    {
      id: 'portal_vein', group: 'blood', color: '#6a4fb3', files: ['FJ1853'], explode: [0, -1, 0.2],
      name: t('Hepatic portal vein', 'यकृत निवाहिका शिरा', 'ಯಕೃತ್ ಪೋರ್ಟಲ್ ಅಭಿಧಮನಿ'),
      info: t('Brings blood rich in digested food from the stomach and intestines, so the liver can store and process it before it reaches the rest of the body.', 'आमाशय और आँतों से पचे भोजन से भरपूर रक्त लाती है, ताकि शरीर के बाकी भागों तक पहुँचने से पहले यकृत उसे संग्रहित और संसाधित कर सके।', 'ಜಠರ ಮತ್ತು ಕರುಳುಗಳಿಂದ ಜೀರ್ಣಗೊಂಡ ಆಹಾರ ತುಂಬಿದ ರಕ್ತವನ್ನು ತರುತ್ತದೆ; ಅದು ದೇಹದ ಉಳಿದ ಭಾಗ ತಲುಪುವ ಮೊದಲು ಯಕೃತ್ತು ಅದನ್ನು ಸಂಗ್ರಹಿಸಿ ಸಂಸ್ಕರಿಸುತ್ತದೆ.'),
    },
    {
      id: 'hepatic_artery', group: 'blood', color: '#d2312e', files: ['FJ3078', 'FJ3081'], explode: [0.2, -0.9, 0.5],
      name: t('Hepatic artery', 'यकृत धमनी', 'ಯಕೃತ್ ಅಪಧಮನಿ'),
      info: t('Brings blood full of oxygen from the aorta for the liver\'s own cells.', 'यकृत की अपनी कोशिकाओं के लिए महाधमनी से ऑक्सीजन भरा रक्त लाती है।', 'ಯಕೃತ್ತಿನ ಸ್ವಂತ ಕೋಶಗಳಿಗಾಗಿ ಮಹಾಪಧಮನಿಯಿಂದ ಆಮ್ಲಜನಕ ತುಂಬಿದ ರಕ್ತ ತರುತ್ತದೆ.'),
    },
    {
      id: 'hepatic_veins', group: 'blood', color: '#3a5bbf', files: ['FJ2414', 'FJ2415', 'FJ2416'], explode: [0, 0.6, -0.6],
      name: t('Hepatic veins', 'यकृत शिराएँ', 'ಯಕೃತ್ ಅಭಿಧಮನಿಗಳು'),
      info: t('Take the cleaned blood out of the liver into the vena cava.', 'साफ़ किया हुआ रक्त यकृत से बाहर महाशिरा में ले जाती हैं।', 'ಶುದ್ಧಗೊಂಡ ರಕ್ತವನ್ನು ಯಕೃತ್ತಿನಿಂದ ಮಹಾಭಿಧಮನಿಗೆ ಒಯ್ಯುತ್ತವೆ.'),
    },
    {
      id: 'vena_cava', group: 'blood', color: '#2c4aa3', files: ['FJ3441'], explode: [0, 0.2, -1], minor: true,
      cuts: (f) => [{ point: [0, f.bboxOf('right_lobe').min[1] - 0.01, 0], normal: [0, 1, 0] }, { point: [0, f.bboxOf('right_lobe').max[1] + 0.01, 0], normal: [0, -1, 0] }],
      name: t('Inferior vena cava', 'अधो महाशिरा', 'ಕೆಳ ಮಹಾಭಿಧಮನಿ'),
      info: t('The big vein behind the liver that carries blood from the lower body back to the heart.', 'यकृत के पीछे की बड़ी शिरा जो शरीर के निचले भाग से रक्त हृदय तक वापस ले जाती है।', 'ದೇಹದ ಕೆಳಭಾಗದಿಂದ ರಕ್ತವನ್ನು ಹೃದಯಕ್ಕೆ ಮರಳಿ ಒಯ್ಯುವ, ಯಕೃತ್ತಿನ ಹಿಂದಿನ ದೊಡ್ಡ ಅಭಿಧಮನಿ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0.1, 1] },
    { id: 'below', name: t('From below', 'नीचे से', 'ಕೆಳಗಿನಿಂದ'), dir: [0.1, -0.8, 0.6] },
  ],
  slices: [
    { id: 'across', name: t('Cut across', 'आड़ा काट', 'ಅಡ್ಡ ಕತ್ತರಿಕೆ'), normal: [0, -1, 0], through: 'right_lobe', view: 'below' },
  ],
  animations: [],
};
