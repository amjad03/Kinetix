// The human excretory (urinary) system, from BodyParts3D.
const t = (en, hi, kn) => ({ en, hi, kn });

export default {
  id: 'excretory',
  version: 1,
  order: 5,
  source: 'bp3d',
  subject: 'Biology',
  classes: [10, 11],
  title: t('Excretory system', 'उत्सर्जन तंत्र', 'ವಿಸರ್ಜನಾಂಗ ವ್ಯವಸ್ಥೆ'),
  summary: t(
    'Two kidneys filter waste from the blood and make urine, which flows down the ureters to the bladder and leaves through the urethra.',
    'दो वृक्क रक्त से अपशिष्ट छानकर मूत्र बनाते हैं; मूत्र मूत्रवाहिनियों से मूत्राशय में जाता है और मूत्रमार्ग से बाहर निकलता है।',
    'ಎರಡು ಮೂತ್ರಪಿಂಡಗಳು ರಕ್ತದಿಂದ ತ್ಯಾಜ್ಯವನ್ನು ಸೋಸಿ ಮೂತ್ರ ತಯಾರಿಸುತ್ತವೆ; ಅದು ಮೂತ್ರನಾಳಗಳ ಮೂಲಕ ಮೂತ್ರಕೋಶಕ್ಕೆ ಹರಿದು ಮೂತ್ರದ್ವಾರದಿಂದ ಹೊರಹೋಗುತ್ತದೆ.',
  ),
  keywords: ['excretory system', 'excretion', 'kidney', 'kidneys', 'urinary system', 'ureter', 'urinary bladder', 'urine', 'excretion in humans'],
  credit: 'BodyParts3D, © The Database Center for Life Science, CC BY 4.0',
  detail: 0.5,
  groups: [
    { id: 'urinary', name: t('Urinary organs', 'मूत्र अंग', 'ಮೂತ್ರ ಅಂಗಗಳು') },
    { id: 'blood', name: t('Blood vessels', 'रक्त वाहिकाएँ', 'ರಕ್ತನಾಳಗಳು') },
    { id: 'glands', name: t('Glands on top', 'ऊपर की ग्रंथियाँ', 'ಮೇಲಿನ ಗ್ರಂಥಿಗಳು') },
  ],
  parts: [
    {
      id: 'kidneys', group: 'urinary', color: '#9c3b35', files: ['FJ3147', 'FJ3145'],
      name: t('Kidneys', 'वृक्क (गुर्दे)', 'ಮೂತ್ರಪಿಂಡಗಳು'),
      info: t('Bean-shaped filters. Each has about a million nephrons that clean the blood and make urine.', 'सेम के आकार के छन्ने। हर एक में लगभग दस लाख वृक्काणु (नेफ्रॉन) होते हैं जो रक्त साफ़ करके मूत्र बनाते हैं।', 'ಅವರೆಕಾಳಿನ ಆಕಾರದ ಸೋಸುಕಗಳು. ಪ್ರತಿಯೊಂದರಲ್ಲೂ ಸುಮಾರು ಹತ್ತು ಲಕ್ಷ ನೆಫ್ರಾನ್‌ಗಳಿದ್ದು ರಕ್ತ ಶುದ್ಧೀಕರಿಸಿ ಮೂತ್ರ ತಯಾರಿಸುತ್ತವೆ.'),
    },
    {
      id: 'ureters', group: 'urinary', color: '#e3c26b', files: ['FJ3146', 'FJ3144'],
      name: t('Ureters', 'मूत्रवाहिनियाँ', 'ಮೂತ್ರನಾಳಗಳು'),
      info: t('Two thin tubes that carry urine from the kidneys to the bladder.', 'दो पतली नलियाँ जो मूत्र को वृक्कों से मूत्राशय तक ले जाती हैं।', 'ಮೂತ್ರವನ್ನು ಮೂತ್ರಪಿಂಡಗಳಿಂದ ಮೂತ್ರಕೋಶಕ್ಕೆ ಒಯ್ಯುವ ಎರಡು ತೆಳು ನಳಿಕೆಗಳು.'),
    },
    {
      id: 'bladder', group: 'urinary', color: '#e8b04f', files: ['FJ3149'],
      name: t('Urinary bladder', 'मूत्राशय', 'ಮೂತ್ರಕೋಶ'),
      info: t('A stretchy muscular bag that stores urine until we pass it.', 'एक लचीला पेशीय थैला जो मूत्र को त्यागने तक संग्रहीत करता है।', 'ಮೂತ್ರವನ್ನು ವಿಸರ್ಜಿಸುವವರೆಗೆ ಸಂಗ್ರಹಿಸುವ ಹಿಗ್ಗುವ ಸ್ನಾಯುವಿನ ಚೀಲ.'),
    },
    {
      id: 'urethra', group: 'urinary', color: '#d9a044', files: ['FJ3148'],
      cuts: (f) => [{ point: [0, f.bboxOf('bladder').min[1] - 0.045, 0], normal: [0, 1, 0] }],
      name: t('Urethra', 'मूत्रमार्ग', 'ಮೂತ್ರದ್ವಾರ ನಾಳ'),
      info: t('The tube through which urine leaves the body.', 'वह नली जिससे मूत्र शरीर से बाहर निकलता है।', 'ಮೂತ್ರವು ದೇಹದಿಂದ ಹೊರಹೋಗುವ ನಳಿಕೆ.'),
    },
    {
      id: 'renal_arteries', group: 'blood', color: '#cf3030', files: ['FJ2038', 'FJ3576', 'FJ3581', 'FJ3582', 'FJ3584', 'FJ2046', 'FJ3467', 'FJ3476', 'FJ3481'],
      name: t('Renal arteries', 'वृक्क धमनियाँ', 'ಮೂತ್ರಪಿಂಡ ಅಪಧಮನಿಗಳು'),
      info: t('Bring blood with waste (urea) from the aorta into the kidneys.', 'महाधमनी से अपशिष्ट (यूरिया) वाला रक्त वृक्कों में लाती हैं।', 'ತ್ಯಾಜ್ಯವಿರುವ (ಯೂರಿಯಾ) ರಕ್ತವನ್ನು ಮಹಾಪಧಮನಿಯಿಂದ ಮೂತ್ರಪಿಂಡಗಳಿಗೆ ತರುತ್ತವೆ.'),
    },
    {
      id: 'renal_veins', group: 'blood', color: '#3557b8', files: ['FJ3577', 'FJ3578', 'FJ3477', 'FJ3478'],
      name: t('Renal veins', 'वृक्क शिराएँ', 'ಮೂತ್ರಪಿಂಡ ಅಭಿಧಮನಿಗಳು'),
      info: t('Take the cleaned blood from the kidneys to the vena cava.', 'वृक्कों से साफ़ किया गया रक्त महाशिरा में ले जाती हैं।', 'ಮೂತ್ರಪಿಂಡಗಳಿಂದ ಶುದ್ಧಗೊಂಡ ರಕ್ತವನ್ನು ಮಹಾಭಿಧಮನಿಗೆ ಒಯ್ಯುತ್ತವೆ.'),
    },
    {
      id: 'aorta', group: 'blood', color: '#b52626', files: ['FJ1932'],
      name: t('Aorta', 'महाधमनी', 'ಮಹಾಪಧಮನಿ'),
      info: t('The main artery; here it runs down the back of the abdomen.', 'मुख्य धमनी; यहाँ यह पेट के पीछे की ओर नीचे जाती है।', 'ಮುಖ್ಯ ಅಪಧಮನಿ; ಇಲ್ಲಿ ಅದು ಹೊಟ್ಟೆಯ ಹಿಂಭಾಗದಲ್ಲಿ ಕೆಳಗೆ ಸಾಗುತ್ತದೆ.'),
    },
    {
      id: 'vena_cava', group: 'blood', color: '#2c4aa3', files: ['FJ3659'],
      name: t('Inferior vena cava', 'निम्न महाशिरा', 'ಅಧೋ ಮಹಾಭಿಧಮನಿ'),
      info: t('The large vein taking blood from the lower body back to the heart.', 'शरीर के निचले भाग से रक्त हृदय तक वापस ले जाने वाली बड़ी शिरा।', 'ದೇಹದ ಕೆಳಭಾಗದಿಂದ ರಕ್ತವನ್ನು ಹೃದಯಕ್ಕೆ ಮರಳಿ ಒಯ್ಯುವ ದೊಡ್ಡ ಅಭಿಧಮನಿ.'),
    },
    {
      id: 'adrenals', minor: true, group: 'glands', color: '#e2a53a', files: ['FJ3130', 'FJ3129'],
      name: t('Adrenal glands', 'अधिवृक्क ग्रंथियाँ', 'ಅಡ್ರಿನಲ್ ಗ್ರಂಥಿಗಳು'),
      info: t('Sit on top of the kidneys and make adrenaline, the hormone for sudden danger.', 'वृक्कों के ऊपर स्थित होती हैं और एड्रेनलिन बनाती हैं, जो अचानक खतरे के समय का हार्मोन है।', 'ಮೂತ್ರಪಿಂಡಗಳ ಮೇಲೆ ಇರುತ್ತವೆ; ತುರ್ತು ಅಪಾಯದ ಹಾರ್ಮೋನ್ ಅಡ್ರಿನಲಿನ್ ತಯಾರಿಸುತ್ತವೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0, 1] },
    { id: 'back', name: t('Back', 'पीछे से', 'ಹಿಂಭಾಗ'), dir: [0, 0, -1] },
    { id: 'left', name: t('Left side', 'बाईं ओर से', 'ಎಡಬದಿ'), dir: [1, 0, 0.2] },
  ],
  slices: [
    { id: 'kidney_cut', name: t('Cut through the kidneys', 'वृक्कों के आर-पार काट', 'ಮೂತ್ರಪಿಂಡಗಳ ಅಡ್ಡ ಕತ್ತರಿಕೆ'), normal: [0, 0, -1], through: 'kidneys', view: 'front' },
  ],
  animations: [
    {
      id: 'urine', kind: 'flow',
      name: t('Making urine', 'मूत्र का बनना', 'ಮೂತ್ರ ತಯಾರಿಕೆ'),
      steps: [
        {
          color: '#d23a3a', highlight: ['aorta', 'renal_arteries', 'kidneys'],
          text: t('Blood carrying urea and extra water and salts reaches the kidneys through the renal arteries.', 'यूरिया, अतिरिक्त पानी और लवण वाला रक्त वृक्क धमनियों से वृक्कों तक पहुँचता है।', 'ಯೂರಿಯಾ, ಹೆಚ್ಚುವರಿ ನೀರು ಮತ್ತು ಲವಣಗಳಿರುವ ರಕ್ತ ಮೂತ್ರಪಿಂಡ ಅಪಧಮನಿಗಳ ಮೂಲಕ ಮೂತ್ರಪಿಂಡಗಳನ್ನು ತಲುಪುತ್ತದೆ.'),
          paths: [['aorta@top', 'renal_arteries@left', 'kidneys@left'], ['aorta@top', 'renal_arteries@right', 'kidneys@right']],
        },
        {
          color: '#3a5fc8', highlight: ['kidneys', 'renal_veins', 'vena_cava'],
          text: t('Nephrons filter the blood. The cleaned blood returns through the renal veins to the vena cava.', 'वृक्काणु रक्त को छानते हैं। साफ़ रक्त वृक्क शिराओं से महाशिरा में लौटता है।', 'ನೆಫ್ರಾನ್‌ಗಳು ರಕ್ತವನ್ನು ಸೋಸುತ್ತವೆ. ಶುದ್ಧ ರಕ್ತ ಮೂತ್ರಪಿಂಡ ಅಭಿಧಮನಿಗಳ ಮೂಲಕ ಮಹಾಭಿಧಮನಿಗೆ ಮರಳುತ್ತದೆ.'),
          paths: [['kidneys@left', 'renal_veins@left', 'vena_cava'], ['kidneys@right', 'renal_veins@right', 'vena_cava']],
        },
        {
          color: '#e8c64a', highlight: ['ureters', 'bladder'],
          text: t('The urine flows down the ureters and collects in the bladder.', 'मूत्र मूत्रवाहिनियों से नीचे बहकर मूत्राशय में इकट्ठा होता है।', 'ಮೂತ್ರವು ಮೂತ್ರನಾಳಗಳ ಮೂಲಕ ಕೆಳಗೆ ಹರಿದು ಮೂತ್ರಕೋಶದಲ್ಲಿ ಸಂಗ್ರಹವಾಗುತ್ತದೆ.'),
          paths: [['kidneys@left', 'file:FJ3146@top', 'file:FJ3146', 'file:FJ3146@bottom', 'bladder'], ['kidneys@right', 'file:FJ3144@top', 'file:FJ3144', 'file:FJ3144@bottom', 'bladder']],
        },
        {
          color: '#e8c64a', highlight: ['bladder', 'urethra'],
          text: t('When the bladder is full we feel the urge, and urine leaves the body through the urethra.', 'मूत्राशय भर जाने पर हमें मूत्र त्याग की इच्छा होती है, और मूत्र मूत्रमार्ग से बाहर निकलता है।', 'ಮೂತ್ರಕೋಶ ತುಂಬಿದಾಗ ಮೂತ್ರ ವಿಸರ್ಜನೆಯ ಬಯಕೆಯಾಗುತ್ತದೆ; ಮೂತ್ರ ಮೂತ್ರದ್ವಾರ ನಾಳದ ಮೂಲಕ ಹೊರಹೋಗುತ್ತದೆ.'),
          paths: [['bladder', 'urethra@top', 'urethra@bottom']],
        },
      ],
    },
  ],
};
