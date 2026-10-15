// The human brain, from BodyParts3D. Lobes are coloured as in textbooks.
const t = (en, hi, kn) => ({ en, hi, kn });

export default {
  id: 'brain',
  version: 1,
  order: 2,
  source: 'bp3d',
  subject: 'Biology',
  classes: [10, 11, 12],
  title: t('Human brain', 'मानव मस्तिष्क', 'ಮಾನವ ಮಿದುಳು'),
  summary: t(
    'The control centre of the body. The forebrain thinks and senses, the midbrain relays, and the hindbrain keeps balance and runs breathing and the heartbeat.',
    'शरीर का नियंत्रण केंद्र। अग्रमस्तिष्क सोचता और अनुभव करता है, मध्यमस्तिष्क संदेश आगे पहुँचाता है, और पश्चमस्तिष्क संतुलन बनाए रखता है तथा श्वसन और धड़कन चलाता है।',
    'ದೇಹದ ನಿಯಂತ್ರಣ ಕೇಂದ್ರ. ಮುಮ್ಮಿದುಳು ಯೋಚಿಸುತ್ತದೆ ಮತ್ತು ಗ್ರಹಿಸುತ್ತದೆ, ನಡುಮಿದುಳು ಸಂದೇಶ ರವಾನಿಸುತ್ತದೆ, ಹಿಮ್ಮಿದುಳು ಸಮತೋಲನ ಕಾಯುತ್ತದೆ ಹಾಗೂ ಉಸಿರಾಟ ಮತ್ತು ಹೃದಯ ಬಡಿತ ನಡೆಸುತ್ತದೆ.',
  ),
  keywords: ['brain', 'nervous system', 'control and coordination', 'cerebrum', 'cerebellum', 'medulla', 'forebrain', 'midbrain', 'hindbrain', 'neural control', 'lobes of the brain'],
  credit: 'BodyParts3D, © The Database Center for Life Science, CC BY 4.0',
  detail: 0.28,
  labelFrom: [1, 0.15, 0.25],
  groups: [
    { id: 'forebrain', name: t('Forebrain (cerebrum)', 'अग्रमस्तिष्क (प्रमस्तिष्क)', 'ಮುಮ್ಮಿದುಳು (ಮಹಾಮಸ್ತಿಷ್ಕ)') },
    { id: 'inside', name: t('Inside the forebrain', 'अग्रमस्तिष्क के अंदर', 'ಮುಮ್ಮಿದುಳಿನ ಒಳಗೆ') },
    { id: 'midhind', name: t('Midbrain and hindbrain', 'मध्यमस्तिष्क और पश्चमस्तिष्क', 'ನಡುಮಿದುಳು ಮತ್ತು ಹಿಮ್ಮಿದುಳು') },
    { id: 'spaces', name: t('Fluid-filled spaces', 'द्रव से भरी गुहाएँ', 'ದ್ರವ ತುಂಬಿದ ಕುಹರಗಳು') },
  ],
  parts: [
    {
      id: 'frontal_lobe', group: 'forebrain', color: '#d9867a',
      files: ['FJ1744', 'FJ1787', 'FJ1800', 'FJ1833', 'FJ1745', 'FJ1788', 'FJ1801', 'FJ1834'],
      name: t('Frontal lobe', 'अग्र पालि', 'ಮುಂಭಾಗದ ಹಾಲೆ'),
      info: t('Thinking, planning, speech and voluntary movement.', 'सोचना, योजना बनाना, बोलना और ऐच्छिक गति।', 'ಯೋಚನೆ, ಯೋಜನೆ, ಮಾತು ಮತ್ತು ಐಚ್ಛಿಕ ಚಲನೆ.'),
    },
    {
      id: 'parietal_lobe', group: 'forebrain', color: '#e6bd66',
      files: ['FJ1732', 'FJ1797', 'FJ1835', 'FJ1841', 'FJ1733', 'FJ1798', 'FJ1836', 'FJ1842'],
      name: t('Parietal lobe', 'भित्तीय पालि', 'ಪಾರ್ಶ್ವ ಹಾಲೆ'),
      info: t('Touch, pain, temperature and knowing where the body is.', 'स्पर्श, दर्द, तापमान और शरीर की स्थिति का बोध।', 'ಸ್ಪರ್ಶ, ನೋವು, ಉಷ್ಣತೆ ಮತ್ತು ದೇಹದ ಸ್ಥಾನದ ಅರಿವು.'),
    },
    {
      id: 'temporal_lobe', group: 'forebrain', color: '#84b97f',
      files: ['FJ1746', 'FJ1783', 'FJ1785', 'FJ1789', 'FJ1747', 'FJ1784', 'FJ1786', 'FJ1790'],
      // BodyParts3D has no superior temporal gyrus: the white matter shows
      // through on the side of the brain. Its outward-facing surface there
      // is coloured as temporal lobe.
      absorb: { from: 'white_matter', within: 0.012, outward: (x, y, z, nx) => Math.sign(nx) === Math.sign(x) && Math.abs(nx) > 0.35 && Math.abs(x) > 0.045 },
      name: t('Temporal lobe', 'शंख पालि', 'ಶಂಖ ಹಾಲೆ'),
      info: t('Hearing, language and memory.', 'सुनना, भाषा और स्मृति।', 'ಕೇಳುವಿಕೆ, ಭಾಷೆ ಮತ್ತು ನೆನಪು.'),
    },
    {
      id: 'occipital_lobe', group: 'forebrain', color: '#7a9fd6', files: ['FJ1791', 'FJ1792'],
      name: t('Occipital lobe', 'पश्चकपाल पालि', 'ಹಿಂಭಾಗದ ಹಾಲೆ'),
      info: t('Seeing: it makes sense of what the eyes send.', 'देखना: आँखों से आए संदेशों को समझता है।', 'ನೋಡುವಿಕೆ: ಕಣ್ಣುಗಳು ಕಳುಹಿಸುವುದನ್ನು ಅರ್ಥಮಾಡಿಕೊಳ್ಳುತ್ತದೆ.'),
    },
    {
      id: 'insula', minor: true, group: 'forebrain', color: '#cf8f8f', files: ['FJ1748', 'FJ1749'],
      name: t('Insula', 'इंसुला', 'ಇನ್ಸುಲಾ'),
      info: t('A hidden fold of the cerebrum; taste and feelings from inside the body.', 'प्रमस्तिष्क की एक छिपी तह; स्वाद और शरीर के अंदर की अनुभूतियाँ।', 'ಮಹಾಮಸ್ತಿಷ್ಕದ ಒಳಗಿನ ಮಡಿಕೆ; ರುಚಿ ಮತ್ತು ದೇಹದೊಳಗಿನ ಅನುಭವಗಳು.'),
    },
    {
      id: 'limbic', minor: true, group: 'inside', color: '#c79bbd', files: ['FJ1739', 'FJ1740', 'FJ1759', 'FJ1807'],
      name: t('Cingulate gyrus and hippocampus', 'सिंगुलेट गाइरस और हिप्पोकैम्पस', 'ಸಿಂಗ್ಯುಲೇಟ್ ಗೈರಸ್ ಮತ್ತು ಹಿಪೊಕ್ಯಾಂಪಸ್'),
      info: t('Part of the limbic system: emotions and forming new memories.', 'लिम्बिक तंत्र का भाग: भावनाएँ और नई स्मृतियाँ बनाना।', 'ಲಿಂಬಿಕ್ ವ್ಯವಸ್ಥೆಯ ಭಾಗ: ಭಾವನೆಗಳು ಮತ್ತು ಹೊಸ ನೆನಪುಗಳ ರಚನೆ.'),
    },
    {
      id: 'white_matter', group: 'inside', color: '#efe8da', files: ['FJ1758', 'FJ1806', 'FJ1750', 'FJ1751'], detail: 0.2,
      name: t('White matter', 'श्वेत द्रव्य', 'ಬಿಳಿ ದ್ರವ್ಯ'),
      info: t('Nerve fibres that link one part of the brain to another. The grey outer layer (cortex) holds the cell bodies.', 'तंत्रिका तंतु जो मस्तिष्क के भागों को जोड़ते हैं। बाहरी धूसर परत (कॉर्टेक्स) में कोशिका-काय होते हैं।', 'ಮಿದುಳಿನ ಭಾಗಗಳನ್ನು ಜೋಡಿಸುವ ನರತಂತುಗಳು. ಹೊರಗಿನ ಬೂದು ಪದರ (ಕಾರ್ಟೆಕ್ಸ್) ಜೀವಕೋಶ ಕಾಯಗಳನ್ನು ಹೊಂದಿದೆ.'),
    },
    {
      id: 'corpus_callosum', group: 'inside', color: '#f4eddb', files: ['FJ1742'],
      name: t('Corpus callosum', 'कॉर्पस कैलोसम', 'ಕಾರ್ಪಸ್ ಕ್ಯಾಲೋಸಮ್'),
      info: t('A thick band of nerve fibres joining the left and right halves of the cerebrum.', 'तंत्रिका तंतुओं की मोटी पट्टी जो प्रमस्तिष्क के बाएँ और दाएँ भागों को जोड़ती है।', 'ಮಹಾಮಸ್ತಿಷ್ಕದ ಎಡ ಮತ್ತು ಬಲ ಅರ್ಧಗಳನ್ನು ಜೋಡಿಸುವ ನರತಂತುಗಳ ದಪ್ಪ ಪಟ್ಟಿ.'),
    },
    {
      id: 'thalamus', group: 'inside', color: '#8fc2c7', files: ['FJ1782', 'FJ1827'],
      name: t('Thalamus', 'थैलेमस', 'ಥಲಾಮಸ್'),
      info: t('A relay station: messages from the senses pass through it on their way to the cerebrum.', 'एक रिले केंद्र: इंद्रियों के संदेश प्रमस्तिष्क तक जाते हुए इससे होकर गुजरते हैं।', 'ರಿಲೇ ಕೇಂದ್ರ: ಇಂದ್ರಿಯಗಳ ಸಂದೇಶಗಳು ಮಹಾಮಸ್ತಿಷ್ಕಕ್ಕೆ ಹೋಗುವಾಗ ಇದರ ಮೂಲಕ ಹಾದುಹೋಗುತ್ತವೆ.'),
    },
    {
      id: 'hypothalamus', group: 'inside', color: '#5fa9ae', files: ['FJ1760', 'FJ1780', 'FJ1808', 'FJ1828'],
      name: t('Hypothalamus', 'हाइपोथैलेमस', 'ಹೈಪೋಥಲಾಮಸ್'),
      info: t('Controls hunger, thirst, body temperature and sleep, and directs the pituitary gland.', 'भूख, प्यास, शरीर का तापमान और नींद नियंत्रित करता है, और पीयूष ग्रंथि को निर्देश देता है।', 'ಹಸಿವು, ಬಾಯಾರಿಕೆ, ದೇಹದ ಉಷ್ಣತೆ ಮತ್ತು ನಿದ್ರೆ ನಿಯಂತ್ರಿಸುತ್ತದೆ ಹಾಗೂ ಪಿಟ್ಯುಟರಿ ಗ್ರಂಥಿಗೆ ನಿರ್ದೇಶನ ನೀಡುತ್ತದೆ.'),
    },
    {
      id: 'pituitary', group: 'inside', color: '#e3aa4f', files: ['FJ1796'],
      name: t('Pituitary gland', 'पीयूष ग्रंथि', 'ಪಿಟ್ಯುಟರಿ ಗ್ರಂಥಿ'),
      info: t('The "master gland": its hormones control growth and other glands.', '"मास्टर ग्रंथि": इसके हार्मोन वृद्धि और अन्य ग्रंथियों को नियंत्रित करते हैं।', '"ಪ್ರಧಾನ ಗ್ರಂಥಿ": ಇದರ ಹಾರ್ಮೋನುಗಳು ಬೆಳವಣಿಗೆ ಮತ್ತು ಇತರ ಗ್ರಂಥಿಗಳನ್ನು ನಿಯಂತ್ರಿಸುತ್ತವೆ.'),
    },
    {
      id: 'pineal', minor: true, group: 'inside', color: '#d8bf74', files: ['FJ1795', 'FJ1743'],
      name: t('Pineal gland', 'पीनियल ग्रंथि', 'ಪೀನಿಯಲ್ ಗ್ರಂಥಿ'),
      info: t('Makes melatonin, which helps set the body\'s sleep cycle.', 'मेलाटोनिन बनाती है, जो नींद के चक्र को नियमित करने में मदद करता है।', 'ಮೆಲಟೋನಿನ್ ತಯಾರಿಸುತ್ತದೆ; ಇದು ನಿದ್ರೆಯ ಚಕ್ರವನ್ನು ನಿಯಂತ್ರಿಸಲು ಸಹಾಯ ಮಾಡುತ್ತದೆ.'),
    },
    {
      id: 'midbrain', group: 'midhind', color: '#d8b08a', files: ['FJ1770', 'FJ1817', 'FJ1762', 'FJ1779', 'FJ1810', 'FJ1826'],
      name: t('Midbrain', 'मध्यमस्तिष्क', 'ನಡುಮಿದುಳು'),
      info: t('Relays messages, and controls reflexes of the eyes and ears (turning towards a sound).', 'संदेश आगे पहुँचाता है, और आँख-कान की प्रतिवर्ती क्रियाएँ नियंत्रित करता है (आवाज़ की ओर मुड़ना)।', 'ಸಂದೇಶ ರವಾನಿಸುತ್ತದೆ, ಕಣ್ಣು-ಕಿವಿಗಳ ಪ್ರತಿವರ್ತನ ಕ್ರಿಯೆಗಳನ್ನು ನಿಯಂತ್ರಿಸುತ್ತದೆ (ಶಬ್ದದತ್ತ ತಿರುಗುವುದು).'),
    },
    {
      id: 'pons', group: 'midhind', color: '#c69a72', files: ['FJ1775', 'FJ1822'],
      name: t('Pons', 'पोंस', 'ಪಾನ್ಸ್'),
      info: t('A bridge between the parts of the brain; helps control breathing.', 'मस्तिष्क के भागों के बीच एक पुल; श्वसन के नियंत्रण में मदद करता है।', 'ಮಿದುಳಿನ ಭಾಗಗಳ ನಡುವಿನ ಸೇತುವೆ; ಉಸಿರಾಟ ನಿಯಂತ್ರಣಕ್ಕೆ ಸಹಾಯ ಮಾಡುತ್ತದೆ.'),
    },
    {
      id: 'medulla', group: 'midhind', color: '#b3875f', files: ['FJ1769', 'FJ1831'],
      name: t('Medulla oblongata', 'मेडुला ऑब्लॉन्गाटा', 'ಮೆಡುಲ್ಲಾ ಆಬ್ಲಾಂಗೇಟಾ'),
      info: t('Controls actions we do not think about: heartbeat, breathing, blood pressure, swallowing, vomiting.', 'अनैच्छिक क्रियाएँ नियंत्रित करता है: धड़कन, श्वसन, रक्तचाप, निगलना, उल्टी।', 'ಅನೈಚ್ಛಿಕ ಕ್ರಿಯೆಗಳನ್ನು ನಿಯಂತ್ರಿಸುತ್ತದೆ: ಹೃದಯ ಬಡಿತ, ಉಸಿರಾಟ, ರಕ್ತದೊತ್ತಡ, ನುಂಗುವುದು, ವಾಂತಿ.'),
    },
    {
      id: 'cerebellum', group: 'midhind', color: '#b986ad', files: ['FJ1781', 'FJ1830'], detail: 0.22,
      name: t('Cerebellum', 'अनुमस्तिष्क', 'ಅನುಮಸ್ತಿಷ್ಕ'),
      info: t('Keeps balance and posture, and makes movements smooth and exact, like riding a bicycle.', 'संतुलन और मुद्रा बनाए रखता है, और गतियों को सहज व सटीक बनाता है, जैसे साइकिल चलाना।', 'ಸಮತೋಲನ ಮತ್ತು ಭಂಗಿಯನ್ನು ಕಾಯುತ್ತದೆ, ಚಲನೆಗಳನ್ನು ನಯವಾಗಿ ಮತ್ತು ನಿಖರವಾಗಿಸುತ್ತದೆ, ಉದಾ. ಸೈಕಲ್ ಸವಾರಿ.'),
    },
    {
      id: 'spinal_cord', group: 'midhind', color: '#e6d6b8', files: ['FJ1737'],
      cuts: (f) => [{ point: [0, f.bboxOf('medulla').min[1] - 0.03, 0], normal: [0, 1, 0] }],
      name: t('Spinal cord (top)', 'मेरुरज्जु (ऊपरी भाग)', 'ಮೆದುಳುಬಳ್ಳಿ (ಮೇಲ್ಭಾಗ)'),
      info: t('Carries messages between the brain and the body, and handles reflexes.', 'मस्तिष्क और शरीर के बीच संदेश ले जाती है, और प्रतिवर्ती क्रियाएँ संभालती है।', 'ಮಿದುಳು ಮತ್ತು ದೇಹದ ನಡುವೆ ಸಂದೇಶ ಒಯ್ಯುತ್ತದೆ ಹಾಗೂ ಪ್ರತಿವರ್ತನ ಕ್ರಿಯೆಗಳನ್ನು ನಿರ್ವಹಿಸುತ್ತದೆ.'),
    },
    {
      id: 'ventricles', group: 'spaces', color: '#5aa9e3', files: ['FJ1767', 'FJ1814', 'FJ1730', 'FJ1731', 'FJ1738'], hidden: true, opacity: 0.8,
      name: t('Ventricles', 'निलय (मस्तिष्क गुहाएँ)', 'ಮಿದುಳಿನ ಕುಹರಗಳು'),
      info: t('Spaces filled with cerebrospinal fluid, which cushions the brain and carries away waste.', 'प्रमस्तिष्क-मेरु द्रव से भरी गुहाएँ; यह द्रव मस्तिष्क की रक्षा करता है और अपशिष्ट दूर ले जाता है।', 'ಮಿದುಳುಬಳ್ಳಿ ದ್ರವದಿಂದ ತುಂಬಿದ ಕುಹರಗಳು; ಈ ದ್ರವ ಮಿದುಳನ್ನು ರಕ್ಷಿಸುತ್ತದೆ ಮತ್ತು ತ್ಯಾಜ್ಯ ಒಯ್ಯುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'left', name: t('Left side', 'बाईं ओर से', 'ಎಡಬದಿ'), dir: [1, 0.15, 0.25] },
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0.1, 1] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.01] },
    { id: 'below', name: t('From below', 'नीचे से', 'ಕೆಳಗಿನಿಂದ'), dir: [0, -1, 0.2] },
    { id: 'back', name: t('Back', 'पीछे से', 'ಹಿಂಭಾಗ'), dir: [0, 0.1, -1] },
    { id: 'inside', name: t('The middle, from the inside', 'बीच का भाग, अंदर से', 'ಮಧ್ಯಭಾಗ, ಒಳಗಿನಿಂದ'), dir: [-1, 0.05, 0.05] },
  ],
  slices: [
    { id: 'midline', name: t('Middle cut (left half)', 'बीच से काट (बायाँ आधा)', 'ಮಧ್ಯದ ಕತ್ತರಿಕೆ (ಎಡ ಅರ್ಧ)'), normal: [1, 0, 0], offset: 0.0015, view: 'inside' },
    { id: 'coronal', name: t('Front cut: grey and white matter', 'सामने से काट: धूसर और श्वेत द्रव्य', 'ಮುಂದಿನ ಕತ್ತರಿಕೆ: ಬೂದು ಮತ್ತು ಬಿಳಿ ದ್ರವ್ಯ'), normal: [0, 0, -1], offset: 0.0, view: 'front' },
    { id: 'horizontal', name: t('Across, from above', 'आड़ा काट, ऊपर से', 'ಅಡ್ಡ ಕತ್ತರಿಕೆ, ಮೇಲಿನಿಂದ'), normal: [0, -1, 0], offset: 0.015, view: 'top' },
  ],
  animations: [
    {
      id: 'tour', kind: 'tour',
      name: t('Three parts of the brain', 'मस्तिष्क के तीन भाग', 'ಮಿದುಳಿನ ಮೂರು ಭಾಗಗಳು'),
      steps: [
        {
          highlight: ['frontal_lobe', 'parietal_lobe', 'temporal_lobe', 'occipital_lobe', 'insula'],
          text: t('Forebrain: the cerebrum, the largest part. Its four lobes think, remember, see, hear and feel.', 'अग्रमस्तिष्क: प्रमस्तिष्क, सबसे बड़ा भाग। इसकी चार पालियाँ सोचती, याद रखती, देखती, सुनती और अनुभव करती हैं।', 'ಮುಮ್ಮಿದುಳು: ಮಹಾಮಸ್ತಿಷ್ಕ, ಅತಿ ದೊಡ್ಡ ಭಾಗ. ಇದರ ನಾಲ್ಕು ಹಾಲೆಗಳು ಯೋಚಿಸುತ್ತವೆ, ನೆನಪಿಡುತ್ತವೆ, ನೋಡುತ್ತವೆ, ಕೇಳುತ್ತವೆ, ಅನುಭವಿಸುತ್ತವೆ.'),
        },
        {
          highlight: ['thalamus', 'hypothalamus', 'pituitary', 'corpus_callosum'],
          text: t('Deep in the forebrain: the thalamus relays messages; the hypothalamus and pituitary control hormones.', 'अग्रमस्तिष्क के भीतर: थैलेमस संदेश आगे भेजता है; हाइपोथैलेमस और पीयूष ग्रंथि हार्मोन नियंत्रित करते हैं।', 'ಮುಮ್ಮಿದುಳಿನ ಒಳಗೆ: ಥಲಾಮಸ್ ಸಂದೇಶ ರವಾನಿಸುತ್ತದೆ; ಹೈಪೋಥಲಾಮಸ್ ಮತ್ತು ಪಿಟ್ಯುಟರಿ ಹಾರ್ಮೋನುಗಳನ್ನು ನಿಯಂತ್ರಿಸುತ್ತವೆ.'),
        },
        {
          highlight: ['midbrain'],
          text: t('Midbrain: a short relay between the forebrain and the hindbrain.', 'मध्यमस्तिष्क: अग्रमस्तिष्क और पश्चमस्तिष्क के बीच एक छोटा संपर्क मार्ग।', 'ನಡುಮಿದುಳು: ಮುಮ್ಮಿದುಳು ಮತ್ತು ಹಿಮ್ಮಿದುಳಿನ ನಡುವಿನ ಚಿಕ್ಕ ಸಂಪರ್ಕ.'),
        },
        {
          highlight: ['pons', 'medulla', 'cerebellum'],
          text: t('Hindbrain: pons, medulla and cerebellum. They keep us balanced and keep the heart and lungs working.', 'पश्चमस्तिष्क: पोंस, मेडुला और अनुमस्तिष्क। ये संतुलन बनाए रखते हैं और हृदय व फेफड़ों को चलाते रहते हैं।', 'ಹಿಮ್ಮಿದುಳು: ಪಾನ್ಸ್, ಮೆಡುಲ್ಲಾ ಮತ್ತು ಅನುಮಸ್ತಿಷ್ಕ. ಇವು ಸಮತೋಲನ ಕಾಯುತ್ತವೆ ಮತ್ತು ಹೃದಯ-ಶ್ವಾಸಕೋಶಗಳನ್ನು ನಡೆಸುತ್ತವೆ.'),
        },
        {
          highlight: ['spinal_cord', 'medulla'],
          text: t('The brain continues as the spinal cord, which carries messages to and from the whole body.', 'मस्तिष्क आगे मेरुरज्जु बनकर चलता है, जो पूरे शरीर से संदेश लाती और ले जाती है।', 'ಮಿದುಳು ಮೆದುಳುಬಳ್ಳಿಯಾಗಿ ಮುಂದುವರಿಯುತ್ತದೆ; ಅದು ಇಡೀ ದೇಹಕ್ಕೆ ಸಂದೇಶ ಒಯ್ಯುತ್ತದೆ ಮತ್ತು ತರುತ್ತದೆ.'),
        },
      ],
    },
  ],
};
