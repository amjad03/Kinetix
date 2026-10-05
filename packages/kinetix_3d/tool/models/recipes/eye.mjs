// The human eye (the right eye), from BodyParts3D. The retina, missing
// from the data, is made as a thin layer just inside the choroid.
const t = (en, hi, kn) => ({ en, hi, kn });
const light = '#fff1a8';

export default {
  id: 'eye',
  version: 1,
  order: 4,
  source: 'bp3d',
  subject: 'Biology',
  classes: [8, 10, 11, 12],
  title: t('Human eye', 'मानव नेत्र', 'ಮಾನವ ಕಣ್ಣು'),
  summary: t(
    'A camera made of living tissue. The cornea and lens focus light on the retina, which turns it into signals for the brain.',
    'जीवित ऊतकों से बना एक कैमरा। कॉर्निया और लेंस प्रकाश को रेटिना पर केंद्रित करते हैं, जो उसे मस्तिष्क के लिए संकेतों में बदलता है।',
    'ಜೀವಂತ ಅಂಗಾಂಶಗಳಿಂದ ಮಾಡಿದ ಕ್ಯಾಮೆರಾ. ಕಾರ್ನಿಯಾ ಮತ್ತು ಮಸೂರ ಬೆಳಕನ್ನು ರೆಟಿನಾದ ಮೇಲೆ ಕೇಂದ್ರೀಕರಿಸುತ್ತವೆ; ರೆಟಿನಾ ಅದನ್ನು ಮಿದುಳಿಗೆ ಸಂಕೇತಗಳಾಗಿ ಬದಲಿಸುತ್ತದೆ.',
  ),
  keywords: ['eye', 'human eye', 'vision', 'sight', 'retina', 'lens', 'cornea', 'iris', 'pupil', 'the human eye and the colourful world', 'sense organs'],
  credit: 'BodyParts3D, © The Database Center for Life Science, CC BY 4.0',
  detail: 0.35,
  groups: [
    { id: 'wall', name: t('Coats of the eyeball', 'नेत्रगोलक की परतें', 'ಕಣ್ಣುಗುಡ್ಡೆಯ ಪದರಗಳು') },
    { id: 'optics', name: t('Parts that focus light', 'प्रकाश केंद्रित करने वाले भाग', 'ಬೆಳಕನ್ನು ಕೇಂದ್ರೀಕರಿಸುವ ಭಾಗಗಳು') },
    { id: 'around', name: t('Around the eye', 'नेत्र के आसपास', 'ಕಣ್ಣಿನ ಸುತ್ತ') },
  ],
  parts: [
    {
      id: 'sclera', group: 'wall', color: '#f2eee6', files: ['FJ1368'], detail: 0.2,
      name: t('Sclera (white of the eye)', 'श्वेतपटल (आँख का सफ़ेद भाग)', 'ಸ್ಕ್ಲೀರಾ (ಕಣ್ಣಿನ ಬಿಳಿಭಾಗ)'),
      info: t('The tough white outer coat that protects the eyeball and keeps its shape.', 'मज़बूत सफ़ेद बाहरी परत जो नेत्रगोलक की रक्षा करती है और उसका आकार बनाए रखती है।', 'ಕಣ್ಣುಗುಡ್ಡೆಯನ್ನು ರಕ್ಷಿಸಿ ಅದರ ಆಕಾರ ಕಾಪಾಡುವ ಗಟ್ಟಿಯಾದ ಬಿಳಿ ಹೊರಪದರ.'),
    },
    {
      id: 'choroid', group: 'wall', color: '#5e3526', files: ['FJ1336', 'FJ1337'], detail: 0.25,
      name: t('Choroid', 'रक्तक पटल (कोरॉइड)', 'ಕೋರಾಯ್ಡ್'),
      info: t('A dark layer full of blood vessels that feeds the eye and stops light scattering inside it.', 'रक्त वाहिकाओं से भरी गहरी परत जो आँख को पोषण देती है और अंदर प्रकाश को बिखरने से रोकती है।', 'ರಕ್ತನಾಳಗಳಿಂದ ತುಂಬಿದ ಗಾಢ ಪದರ; ಕಣ್ಣಿಗೆ ಪೋಷಣೆ ನೀಡುತ್ತದೆ ಮತ್ತು ಒಳಗೆ ಬೆಳಕು ಚದುರದಂತೆ ತಡೆಯುತ್ತದೆ.'),
    },
    {
      id: 'retina', group: 'wall', color: '#e88468',
      scaleOf: { files: ['FJ1337'], factor: 0.955, about: 'FJ1382' },
      name: t('Retina', 'दृष्टिपटल (रेटिना)', 'ರೆಟಿನಾ'),
      info: t('The screen at the back of the eye. Its rods and cones sense light and colour and send signals to the brain.', 'आँख के पीछे का परदा। इसकी शलाकाएँ और शंकु प्रकाश व रंग पहचानते हैं और मस्तिष्क को संकेत भेजते हैं।', 'ಕಣ್ಣಿನ ಹಿಂಭಾಗದ ಪರದೆ. ಇದರ ದಂಡಗಳು ಮತ್ತು ಶಂಕುಗಳು ಬೆಳಕು-ಬಣ್ಣವನ್ನು ಗ್ರಹಿಸಿ ಮಿದುಳಿಗೆ ಸಂಕೇತ ಕಳುಹಿಸುತ್ತವೆ.'),
    },
    {
      id: 'cornea', group: 'optics', color: '#bfe2f2', files: ['FJ1340'], opacity: 0.45,
      name: t('Cornea', 'कॉर्निया (स्वच्छ मंडल)', 'ಕಾರ್ನಿಯಾ'),
      info: t('The clear window at the front. Most of the bending of light happens here.', 'आगे की स्वच्छ खिड़की। प्रकाश का अधिकतर अपवर्तन यहीं होता है।', 'ಮುಂಭಾಗದ ಪಾರದರ್ಶಕ ಕಿಟಕಿ. ಬೆಳಕಿನ ಹೆಚ್ಚಿನ ವಕ್ರೀಭವನ ಇಲ್ಲೇ ಆಗುತ್ತದೆ.'),
    },
    {
      id: 'iris', group: 'optics', color: '#6e4a2c', files: ['FJ1348'],
      name: t('Iris and pupil', 'परितारिका और पुतली', 'ಐರಿಸ್ ಮತ್ತು ಪಾಪೆ'),
      info: t('The coloured ring of muscle. It makes the pupil (the hole in the middle) smaller in bright light and larger in the dark.', 'पेशियों का रंगीन छल्ला। यह तेज़ रोशनी में पुतली (बीच का छेद) को छोटा और अँधेरे में बड़ा करती है।', 'ಸ್ನಾಯುಗಳ ಬಣ್ಣದ ಉಂಗುರ. ಪ್ರಕಾಶದಲ್ಲಿ ಪಾಪೆಯನ್ನು (ಮಧ್ಯದ ರಂಧ್ರ) ಚಿಕ್ಕದಾಗಿ, ಕತ್ತಲಲ್ಲಿ ದೊಡ್ಡದಾಗಿ ಮಾಡುತ್ತದೆ.'),
    },
    {
      id: 'lens', group: 'optics', color: '#eee5c2', files: ['FJ1356'], opacity: 0.8,
      name: t('Lens', 'लेंस (नेत्र लेंस)', 'ಮಸೂರ'),
      info: t('A clear, flexible convex lens. Ciliary muscles change its shape to focus near or far (accommodation).', 'एक स्वच्छ, लचीला उत्तल लेंस। पक्ष्माभी पेशियाँ इसका आकार बदलकर पास या दूर की वस्तु पर फ़ोकस करती हैं (समंजन)।', 'ಪಾರದರ್ಶಕ, ಬಾಗುವ ಪೀನ ಮಸೂರ. ಸಿಲಿಯರಿ ಸ್ನಾಯುಗಳು ಇದರ ಆಕಾರ ಬದಲಿಸಿ ಹತ್ತಿರ ಅಥವಾ ದೂರ ಕೇಂದ್ರೀಕರಿಸುತ್ತವೆ (ಹೊಂದಾಣಿಕೆ).'),
    },
    {
      id: 'ligaments', minor: true, group: 'optics', color: '#d9cfb3', files: ['FJ1371'], detail: 0.25,
      name: t('Suspensory ligaments', 'निलंबन स्नायु', 'ತೂಗು ಅಸ್ಥಿರಜ್ಜುಗಳು'),
      info: t('Fine threads that hold the lens in place and pull on it.', 'महीन धागे जो लेंस को अपनी जगह थामे रखते हैं और उसे खींचते हैं।', 'ಮಸೂರವನ್ನು ಸ್ಥಳದಲ್ಲಿ ಹಿಡಿದು ಅದನ್ನು ಎಳೆಯುವ ಸೂಕ್ಷ್ಮ ಎಳೆಗಳು.'),
    },
    {
      id: 'vitreous', group: 'optics', color: '#b9dcec', files: ['FJ1382'], opacity: 0.22,
      name: t('Vitreous humour', 'काचाभ द्रव', 'ಗಾಜಿನಂತಹ ದ್ರವ (ವಿಟ್ರಿಯಸ್)'),
      info: t('A clear jelly that fills the eyeball and keeps it round.', 'एक स्वच्छ जेली जो नेत्रगोलक को भरती है और उसे गोल बनाए रखती है।', 'ಕಣ್ಣುಗುಡ್ಡೆಯನ್ನು ತುಂಬಿ ಅದನ್ನು ದುಂಡಾಗಿಡುವ ಪಾರದರ್ಶಕ ಜೆಲ್ಲಿ.'),
    },
    {
      id: 'optic_nerve', group: 'around', color: '#eedc9f', files: ['FJ1364', 'FJ1819'],
      // The data runs the nerve into the middle of the eyeball: it starts at the back wall.
      cuts: (f) => [
        { point: [0, 0, f.bboxOf('sclera').min[2] - 0.022], normal: [0, 0, 1] },
        { point: [0, 0, f.bboxOf('sclera').min[2] + 0.003], normal: [0, 0, -1] },
      ],
      name: t('Optic nerve', 'दृक् तंत्रिका', 'ದೃಷ್ಟಿ ನರ'),
      info: t('Carries the signals from the retina to the brain. Where it leaves the eye there are no rods or cones: the blind spot.', 'रेटिना से संकेत मस्तिष्क तक ले जाती है। जहाँ यह आँख से निकलती है वहाँ शलाकाएँ-शंकु नहीं होते: अंध बिंदु।', 'ರೆಟಿನಾದಿಂದ ಸಂಕೇತಗಳನ್ನು ಮಿದುಳಿಗೆ ಒಯ್ಯುತ್ತದೆ. ಅದು ಕಣ್ಣಿನಿಂದ ಹೊರಡುವ ಜಾಗದಲ್ಲಿ ದಂಡ-ಶಂಕುಗಳಿಲ್ಲ: ಕುರುಡು ಬಿಂದು.'),
    },
    {
      id: 'muscles', group: 'around', color: '#b3524a', files: ['FJ1374', 'FJ1346', 'FJ1355', 'FJ1359', 'FJ1345', 'FJ1373'], detail: 0.3,
      cuts: (f) => [{ point: [0, 0, f.bboxOf('sclera').min[2] - 0.02], normal: [0, 0, 1] }],
      name: t('Eye muscles', 'नेत्र पेशियाँ', 'ಕಣ್ಣಿನ ಸ್ನಾಯುಗಳು'),
      info: t('Six muscles turn the eye up, down and side to side.', 'छह पेशियाँ आँख को ऊपर, नीचे और दाएँ-बाएँ घुमाती हैं।', 'ಆರು ಸ್ನಾಯುಗಳು ಕಣ್ಣನ್ನು ಮೇಲೆ, ಕೆಳಗೆ ಮತ್ತು ಅಕ್ಕಪಕ್ಕ ತಿರುಗಿಸುತ್ತವೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0, 1] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [-1, 0.1, 0.25] },
    { id: 'inside', name: t('The cut face', 'कटा हुआ भाग', 'ಕತ್ತರಿಸಿದ ಮುಖ'), dir: [1, 0.08, 0.05] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.01] },
  ],
  slices: [
    { id: 'half', name: t('Cut in half', 'बीच से आधा काटा', 'ಅರ್ಧಕ್ಕೆ ಕತ್ತರಿಸಿದ್ದು'), normal: [-1, 0, 0], through: 'vitreous', view: 'inside' },
    { id: 'across', name: t('Seen from above', 'ऊपर से देखा गया काट', 'ಮೇಲಿನಿಂದ ಕಂಡ ಕತ್ತರಿಕೆ'), normal: [0, -1, 0], through: 'vitreous', view: 'top' },
  ],
  animations: [
    {
      id: 'seeing', kind: 'flow',
      name: t('How we see', 'हम कैसे देखते हैं', 'ನಾವು ಹೇಗೆ ನೋಡುತ್ತೇವೆ'),
      steps: [
        {
          color: light, highlight: ['cornea', 'iris'],
          text: t('Light from an object enters through the clear cornea and passes through the pupil.', 'वस्तु से आया प्रकाश स्वच्छ कॉर्निया से प्रवेश करता है और पुतली से होकर गुज़रता है।', 'ವಸ್ತುವಿನಿಂದ ಬಂದ ಬೆಳಕು ಪಾರದರ್ಶಕ ಕಾರ್ನಿಯಾದ ಮೂಲಕ ಒಳಬಂದು ಪಾಪೆಯ ಮೂಲಕ ಹಾದುಹೋಗುತ್ತದೆ.'),
          paths: [
            [{ ref: 'cornea@front', add: [0, 0.004, 0.03] }, { ref: 'cornea@front', add: [0, 0.003, 0] }, 'lens'],
            [{ ref: 'cornea@front', add: [0, -0.004, 0.03] }, { ref: 'cornea@front', add: [0, -0.003, 0] }, 'lens'],
          ],
        },
        {
          color: light, highlight: ['lens', 'ligaments'],
          text: t('The lens bends the light further so that it meets exactly on the retina.', 'लेंस प्रकाश को और मोड़ता है ताकि वह ठीक रेटिना पर मिले।', 'ಮಸೂರ ಬೆಳಕನ್ನು ಇನ್ನಷ್ಟು ಬಾಗಿಸಿ ಅದು ನಿಖರವಾಗಿ ರೆಟಿನಾದ ಮೇಲೆ ಸೇರುವಂತೆ ಮಾಡುತ್ತದೆ.'),
          paths: [
            [{ ref: 'lens', add: [0, 0.003, 0] }, 'retina@back'],
            [{ ref: 'lens', add: [0, -0.003, 0] }, 'retina@back'],
            [{ ref: 'lens', add: [0.003, 0, 0] }, 'retina@back'],
          ],
        },
        {
          color: '#ff9f6b', highlight: ['retina'],
          text: t('An upside-down, smaller image forms on the retina. Rods and cones turn it into nerve signals.', 'रेटिना पर उल्टा और छोटा प्रतिबिंब बनता है। शलाकाएँ और शंकु उसे तंत्रिका संकेतों में बदलते हैं।', 'ರೆಟಿನಾದ ಮೇಲೆ ತಲೆಕೆಳಗಾದ, ಚಿಕ್ಕ ಪ್ರತಿಬಿಂಬ ಮೂಡುತ್ತದೆ. ದಂಡ-ಶಂಕುಗಳು ಅದನ್ನು ನರ ಸಂಕೇತಗಳಾಗಿ ಬದಲಿಸುತ್ತವೆ.'),
          paths: [[{ ref: 'retina@back', add: [0, 0.004, 0.002] }, 'retina@back', { ref: 'retina@back', add: [0, -0.004, 0.002] }]],
        },
        {
          color: '#ffd166', highlight: ['optic_nerve'],
          text: t('The optic nerve carries the signals to the brain, which turns the image the right way up.', 'दृक् तंत्रिका संकेतों को मस्तिष्क तक ले जाती है, जो प्रतिबिंब को सीधा समझ लेता है।', 'ದೃಷ್ಟಿ ನರ ಸಂಕೇತಗಳನ್ನು ಮಿದುಳಿಗೆ ಒಯ್ಯುತ್ತದೆ; ಮಿದುಳು ಪ್ರತಿಬಿಂಬವನ್ನು ನೇರವಾಗಿ ಅರ್ಥೈಸುತ್ತದೆ.'),
          paths: [['retina@back', 'optic_nerve', 'optic_nerve@back']],
        },
      ],
    },
  ],
};
