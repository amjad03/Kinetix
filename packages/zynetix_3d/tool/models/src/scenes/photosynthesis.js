// Photosynthesis: from a leaf in sunlight down to the thylakoid membrane,
// where light splits water and makes ATP and NADPH, and out into the stroma,
// where the Calvin cycle fixes carbon dioxide into sugar.
import {
  THREE, seeded, mat, blob, lathe, tube, surface, disc, squashBeyond, instanced, trs, GlowPoints, MoleculeSwarm, SphereImpostors,
  smoothNormals, canvasTexture, glowMat, smooth, fract, tumble, curve, lerp, noise3, beam, streak, proteinGeometry, proteinMat,
} from './kit.js';
import { C, COL, sunbeams, shimmer, protein, glowProtein, smoothCell, shellWithWindow, bilayer as makeBilayer, tailSheet as makeTailSheet, atpSynthase } from './bio.js';

const t = (en, hi, kn) => ({ en, hi, kn });

export const script = {
  id: 'photosynthesis',
  subject: 'Biology',
  classes: [7, 10, 11],
  title: t('Photosynthesis', 'प्रकाश संश्लेषण', 'ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆ'),
  summary: t(
    'From a leaf in sunlight to the chloroplast: light splits water and makes ATP and NADPH, and the Calvin cycle turns carbon dioxide into sugar.',
    'धूप में पत्ती से हरितलवक तक: प्रकाश जल का विघटन कर ATP और NADPH बनाता है, और केल्विन चक्र कार्बन डाइऑक्साइड को शर्करा में बदलता है।',
    'ಬಿಸಿಲಿನಲ್ಲಿರುವ ಎಲೆಯಿಂದ ಹರಿತ್ತಿನ ಕಣದವರೆಗೆ: ಬೆಳಕು ನೀರನ್ನು ವಿಭಜಿಸಿ ATP ಮತ್ತು NADPH ತಯಾರಿಸುತ್ತದೆ, ಮತ್ತು ಕ್ಯಾಲ್ವಿನ್ ಚಕ್ರ ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡನ್ನು ಸಕ್ಕರೆಯಾಗಿಸುತ್ತದೆ.',
  ),
  thumb: { step: 'chloroplast', u: 0.6 },
  keywords: ['photosynthesis', 'chloroplast', 'chlorophyll', 'leaf', 'stomata', 'thylakoid', 'light reaction', 'calvin cycle', 'atp', 'nadph', 'glucose', 'nutrition in plants', 'life processes'],
  look: {
    background: ['#1b2724', '#080b0a'],
    keyAt: [-4, 7, 5],
    stages: {
      leaf: { fog: [10, 26] },
      tissue: { fog: [6, 15] },
      cell: { fog: [5.5, 12] },
      chloroplast: { fog: [7, 16] },
      membrane: { fog: [6, 16] },
      stroma: { fog: [7, 18] },
    },
  },
  groups: [
    { id: 'leaf', name: t('Leaf', 'पत्ती', 'ಎಲೆ') },
    { id: 'cell', name: t('Cell', 'कोशिका', 'ಕೋಶ') },
    { id: 'chloroplast', name: t('Chloroplast', 'हरितलवक', 'ಹರಿತ್ತಿನ ಕಣ') },
    { id: 'membrane', name: t('Thylakoid membrane', 'थायलाकॉइड झिल्ली', 'ಥೈಲಕಾಯ್ಡ್ ಪೊರೆ') },
    { id: 'molecules', name: t('Molecules', 'अणु', 'ಅಣುಗಳು') },
  ],
  parts: [
    { id: 'leaf', group: 'leaf', color: '#4a8a32', name: t('Leaf', 'पत्ती', 'ಎಲೆ'), info: t('A thin, flat blade that catches as much light as it can.', 'एक पतला, चपटा फलक जो अधिक से अधिक प्रकाश पकड़ता है।', 'ಸಾಧ್ಯವಾದಷ್ಟು ಬೆಳಕನ್ನು ಹಿಡಿಯುವ ತೆಳುವಾದ, ಚಪ್ಪಟೆ ಪತ್ರ.') },
    { id: 'vein', group: 'leaf', color: '#b9cf7a', name: t('Vein', 'शिरा', 'ಎಲೆಯ ನರ'), info: t('Brings water and minerals from the roots, and carries food away.', 'जड़ों से जल और खनिज लाती है, और भोजन को दूर ले जाती है।', 'ಬೇರುಗಳಿಂದ ನೀರು ಮತ್ತು ಖನಿಜಗಳನ್ನು ತರುತ್ತದೆ, ಆಹಾರವನ್ನು ಸಾಗಿಸುತ್ತದೆ.') },
    { id: 'stem', group: 'leaf', color: '#6f7d3a', name: t('Stem', 'तना', 'ಕಾಂಡ'), info: t('Holds the leaves up to the light.', 'पत्तियों को प्रकाश की ओर थामे रखता है।', 'ಎಲೆಗಳನ್ನು ಬೆಳಕಿನತ್ತ ಎತ್ತಿ ಹಿಡಿಯುತ್ತದೆ.') },
    { id: 'sunlight', group: 'molecules', color: '#ffe9a8', name: t('Sunlight', 'सूर्य का प्रकाश', 'ಸೂರ್ಯನ ಬೆಳಕು'), info: t('The energy that drives photosynthesis.', 'वह ऊर्जा जो प्रकाश संश्लेषण को चलाती है।', 'ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆಯನ್ನು ನಡೆಸುವ ಶಕ್ತಿ.') },
    { id: 'co2', group: 'molecules', color: '#3c4046', name: t('Carbon dioxide (CO₂)', 'कार्बन डाइऑक्साइड (CO₂)', 'ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ (CO₂)'), info: t('Taken from the air; its carbon ends up in sugar.', 'हवा से ली जाती है; इसका कार्बन शर्करा में पहुँचता है।', 'ಗಾಳಿಯಿಂದ ಪಡೆಯಲಾಗುತ್ತದೆ; ಅದರ ಇಂಗಾಲ ಸಕ್ಕರೆಯಲ್ಲಿ ಸೇರುತ್ತದೆ.') },
    { id: 'oxygen', group: 'molecules', color: '#c9473d', name: t('Oxygen (O₂)', 'ऑक्सीजन (O₂)', 'ಆಮ್ಲಜನಕ (O₂)'), info: t('Released from split water; it leaves through the stomata.', 'विघटित जल से निकलती है; रंध्रों से बाहर जाती है।', 'ವಿಭಜಿತ ನೀರಿನಿಂದ ಬಿಡುಗಡೆಯಾಗಿ ಪತ್ರರಂಧ್ರಗಳ ಮೂಲಕ ಹೊರಹೋಗುತ್ತದೆ.') },
    { id: 'water', group: 'molecules', color: '#5aa0e0', name: t('Water (H₂O)', 'जल (H₂O)', 'ನೀರು (H₂O)'), info: t('Comes up from the roots; it is split to give electrons.', 'जड़ों से ऊपर आता है; इलेक्ट्रॉन देने के लिए इसका विघटन होता है।', 'ಬೇರುಗಳಿಂದ ಮೇಲೆ ಬರುತ್ತದೆ; ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳಿಗಾಗಿ ವಿಭಜನೆಯಾಗುತ್ತದೆ.') },
    { id: 'cuticle', group: 'leaf', color: '#d6e3a0', name: t('Cuticle', 'उपत्वचा', 'ಹೊರಪೊರೆ'), info: t('A waxy, waterproof layer that stops the leaf drying out.', 'मोम जैसी जलरोधी परत जो पत्ती को सूखने से बचाती है।', 'ಎಲೆ ಒಣಗದಂತೆ ತಡೆಯುವ ಮೇಣದಂತಹ ಜಲನಿರೋಧಕ ಪದರ.') },
    { id: 'epidermis', group: 'leaf', color: '#dfe8cf', name: t('Epidermis', 'बाह्यत्वचा', 'ಹೊರಚರ್ಮ'), info: t('The leaf’s clear skin: light passes through it.', 'पत्ती की पारदर्शी त्वचा: प्रकाश इसके पार जाता है।', 'ಎಲೆಯ ಪಾರದರ್ಶಕ ಚರ್ಮ: ಬೆಳಕು ಇದರ ಮೂಲಕ ಹಾದುಹೋಗುತ್ತದೆ.') },
    { id: 'palisade', group: 'leaf', color: '#6fa64a', name: t('Palisade cells', 'खंभ कोशिकाएँ', 'ಸ್ತಂಭ ಕೋಶಗಳು'), info: t('Tall cells packed with chloroplasts, where most photosynthesis happens.', 'हरितलवकों से भरी लंबी कोशिकाएँ, जहाँ अधिकतर प्रकाश संश्लेषण होता है।', 'ಹರಿತ್ತಿನ ಕಣಗಳಿಂದ ತುಂಬಿದ ಉದ್ದ ಕೋಶಗಳು; ಹೆಚ್ಚಿನ ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆ ಇಲ್ಲೇ.') },
    { id: 'spongy', group: 'leaf', color: '#8dbb62', name: t('Spongy cells', 'स्पंजी कोशिकाएँ', 'ಸ್ಪಂಜು ಕೋಶಗಳು'), info: t('Loosely packed, with air spaces for gases to move through.', 'ढीले-ढाले जमे, गैसों के आने-जाने के लिए हवा के स्थानों सहित।', 'ಅನಿಲಗಳು ಚಲಿಸಲು ಗಾಳಿಯ ಅವಕಾಶಗಳಿರುವ ಸಡಿಲ ಕೋಶಗಳು.') },
    { id: 'xylem', group: 'leaf', color: '#9a6a48', name: t('Xylem', 'जाइलम', 'ಕ್ಸೈಲಮ್'), info: t('Tubes that carry water up from the roots.', 'नलिकाएँ जो जड़ों से जल ऊपर ले जाती हैं।', 'ಬೇರುಗಳಿಂದ ನೀರನ್ನು ಮೇಲೆ ಸಾಗಿಸುವ ನಳಿಕೆಗಳು.') },
    { id: 'phloem', group: 'leaf', color: '#c9cf7a', name: t('Phloem', 'फ्लोएम', 'ಫ್ಲೋಯಮ್'), info: t('Tubes that carry the sugar made in the leaf to the rest of the plant.', 'नलिकाएँ जो पत्ती में बनी शर्करा पौधे के बाकी भागों तक ले जाती हैं।', 'ಎಲೆಯಲ್ಲಿ ತಯಾರಾದ ಸಕ್ಕರೆಯನ್ನು ಸಸ್ಯದ ಇತರ ಭಾಗಗಳಿಗೆ ಸಾಗಿಸುವ ನಳಿಕೆಗಳು.') },
    { id: 'stoma', group: 'leaf', color: '#5c8f3a', name: t('Stoma and guard cells', 'रंध्र और द्वार कोशिकाएँ', 'ಪತ್ರರಂಧ್ರ ಮತ್ತು ಕಾವಲು ಕೋಶಗಳು'), info: t('A pore between two guard cells that open and close it, letting CO₂ in and O₂ and water vapour out.', 'दो द्वार कोशिकाओं के बीच का छिद्र, जो इसे खोलती-बंद करती हैं; इससे CO₂ अंदर और O₂ व जलवाष्प बाहर जाती है।', 'ಎರಡು ಕಾವಲು ಕೋಶಗಳ ನಡುವಿನ ರಂಧ್ರ; ಅವು ಅದನ್ನು ತೆರೆದು ಮುಚ್ಚುತ್ತವೆ. CO₂ ಒಳಗೆ, O₂ ಮತ್ತು ನೀರಾವಿ ಹೊರಗೆ.') },
    { id: 'cell_wall', group: 'cell', color: '#b9cf8a', name: t('Cell wall', 'कोशिका भित्ति', 'ಕೋಶಭಿತ್ತಿ'), info: t('A stiff wall of cellulose round the cell.', 'कोशिका के चारों ओर सेल्यूलोज़ की कठोर भित्ति।', 'ಕೋಶದ ಸುತ್ತ ಸೆಲ್ಯುಲೋಸ್‌ನ ಗಟ್ಟಿ ಗೋಡೆ.') },
    { id: 'vacuole', group: 'cell', color: '#a8d4e6', name: t('Central vacuole', 'केंद्रीय रिक्तिका', 'ಕೇಂದ್ರ ರಸದಾನಿ'), info: t('A large sac of cell sap that keeps the cell firm.', 'कोशिका रस की बड़ी थैली जो कोशिका को कड़ा बनाए रखती है।', 'ಕೋಶವನ್ನು ಬಿಗಿಯಾಗಿಡುವ ಕೋಶರಸದ ದೊಡ್ಡ ಚೀಲ.') },
    { id: 'nucleus', group: 'cell', color: '#8f7bb5', name: t('Nucleus', 'केंद्रक', 'ಕೋಶಕೇಂದ್ರ'), info: t('Holds the cell’s DNA and controls its work.', 'कोशिका का DNA रखता है और उसके काम नियंत्रित करता है।', 'ಕೋಶದ DNA ಹೊಂದಿದ್ದು ಅದರ ಕೆಲಸಗಳನ್ನು ನಿಯಂತ್ರಿಸುತ್ತದೆ.') },
    { id: 'chloroplasts', group: 'cell', color: '#3f8a3a', name: t('Chloroplasts', 'हरितलवक', 'ಹರಿತ್ತಿನ ಕಣಗಳು'), info: t('The green organelles where photosynthesis takes place.', 'हरे कोशिकांग जहाँ प्रकाश संश्लेषण होता है।', 'ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆ ನಡೆಯುವ ಹಸಿರು ಅಂಗಕಗಳು.') },
    { id: 'envelope', group: 'chloroplast', color: '#9fc27a', name: t('Double membrane', 'दोहरी झिल्ली', 'ಎರಡು ಪದರದ ಪೊರೆ'), info: t('An outer and an inner membrane enclose the chloroplast.', 'एक बाहरी और एक भीतरी झिल्ली हरितलवक को घेरती हैं।', 'ಹೊರ ಮತ್ತು ಒಳ ಪೊರೆಗಳು ಹರಿತ್ತಿನ ಕಣವನ್ನು ಸುತ್ತುವರಿದಿವೆ.') },
    { id: 'stroma', group: 'chloroplast', color: '#d6dd9a', name: t('Stroma', 'स्ट्रोमा', 'ಸ್ಟ್ರೋಮಾ'), info: t('The fluid inside the chloroplast, where the Calvin cycle makes sugar.', 'हरितलवक के अंदर का द्रव, जहाँ केल्विन चक्र शर्करा बनाता है।', 'ಹರಿತ್ತಿನ ಕಣದೊಳಗಿನ ದ್ರವ; ಕ್ಯಾಲ್ವಿನ್ ಚಕ್ರ ಇಲ್ಲಿ ಸಕ್ಕರೆ ತಯಾರಿಸುತ್ತದೆ.') },
    { id: 'granum', group: 'chloroplast', color: '#2f6b2a', name: t('Granum (stack of thylakoids)', 'ग्रेनम (थायलाकॉइड का ढेर)', 'ಗ್ರಾನಮ್ (ಥೈಲಕಾಯ್ಡ್ ರಾಶಿ)'), info: t('Flat discs stacked like coins; light reactions happen in their membranes.', 'सिक्कों की तरह जमी चपटी थैलियाँ; प्रकाश अभिक्रियाएँ इनकी झिल्लियों में होती हैं।', 'ನಾಣ್ಯಗಳಂತೆ ಜೋಡಿಸಿದ ಚಪ್ಪಟೆ ಬಿಲ್ಲೆಗಳು; ಬೆಳಕಿನ ಕ್ರಿಯೆಗಳು ಇವುಗಳ ಪೊರೆಗಳಲ್ಲಿ.') },
    { id: 'lamella', group: 'chloroplast', color: '#4d8a3e', name: t('Stroma lamella', 'स्ट्रोमा पटलिका', 'ಸ್ಟ್ರೋಮಾ ಪಟಲ'), info: t('Thylakoid bridges that join one granum to the next.', 'थायलाकॉइड के पुल जो एक ग्रेनम को दूसरे से जोड़ते हैं।', 'ಒಂದು ಗ್ರಾನಮ್ ಅನ್ನು ಇನ್ನೊಂದಕ್ಕೆ ಜೋಡಿಸುವ ಥೈಲಕಾಯ್ಡ್ ಸೇತುವೆಗಳು.') },
    { id: 'starch', group: 'chloroplast', color: '#efe8d8', name: t('Starch grain', 'मंड कण', 'ಪಿಷ್ಟದ ಕಣ'), info: t('Stored sugar.', 'जमा की गई शर्करा।', 'ಸಂಗ್ರಹಿಸಿದ ಸಕ್ಕರೆ.') },
    { id: 'membrane', group: 'membrane', color: '#d8dcb0', name: t('Thylakoid membrane', 'थायलाकॉइड झिल्ली', 'ಥೈಲಕಾಯ್ಡ್ ಪೊರೆ'), info: t('A double layer of lipids holding the light-reaction proteins.', 'लिपिड की दोहरी परत जिसमें प्रकाश अभिक्रिया के प्रोटीन लगे होते हैं।', 'ಬೆಳಕಿನ ಕ್ರಿಯೆಯ ಪ್ರೋಟೀನ್‌ಗಳನ್ನು ಹಿಡಿದಿರುವ ಲಿಪಿಡ್‌ಗಳ ಎರಡು ಪದರ.') },
    { id: 'lumen', group: 'membrane', color: '#7fb7b0', name: t('Thylakoid space (lumen)', 'थायलाकॉइड का भीतरी स्थान (ल्यूमेन)', 'ಥೈಲಕಾಯ್ಡ್ ಒಳಾವಕಾಶ (ಲ್ಯೂಮೆನ್)'), info: t('Inside the thylakoid; H⁺ ions crowd in here.', 'थायलाकॉइड के अंदर; H⁺ आयन यहाँ इकट्ठा होते हैं।', 'ಥೈಲಕಾಯ್ಡ್‌ನ ಒಳಗೆ; H⁺ ಅಯಾನುಗಳು ಇಲ್ಲಿ ಕಿಕ್ಕಿರಿಯುತ್ತವೆ.') },
    { id: 'psii', group: 'membrane', color: '#5aa36a', name: t('Photosystem II', 'फोटोसिस्टम II', 'ಫೋಟೋಸಿಸ್ಟಮ್ II'), info: t('Absorbs light, and splits water to replace its lost electrons.', 'प्रकाश सोखता है, और खोए इलेक्ट्रॉनों की पूर्ति के लिए जल का विघटन करता है।', 'ಬೆಳಕನ್ನು ಹೀರುತ್ತದೆ; ಕಳೆದುಕೊಂಡ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳ ಬದಲಿಗೆ ನೀರನ್ನು ವಿಭಜಿಸುತ್ತದೆ.') },
    { id: 'lhc', group: 'membrane', color: '#86c46e', name: t('Light-harvesting chlorophyll', 'प्रकाश-संग्राही क्लोरोफिल', 'ಬೆಳಕು ಸಂಗ್ರಹಿಸುವ ಪತ್ರಹರಿತ್ತು'), info: t('Antenna proteins full of chlorophyll that catch light and pass its energy on.', 'क्लोरोफिल से भरे एंटीना प्रोटीन जो प्रकाश पकड़कर उसकी ऊर्जा आगे देते हैं।', 'ಬೆಳಕನ್ನು ಹಿಡಿದು ಅದರ ಶಕ್ತಿಯನ್ನು ಮುಂದೆ ನೀಡುವ ಪತ್ರಹರಿತ್ತು ತುಂಬಿದ ಆಂಟೆನಾ ಪ್ರೋಟೀನ್‌ಗಳು.') },
    { id: 'cytb6f', group: 'membrane', color: '#d29b46', name: t('Cytochrome b6f', 'साइटोक्रोम b6f', 'ಸೈಟೋಕ್ರೋಮ್ b6f'), info: t('Passes electrons on and pumps H⁺ into the thylakoid.', 'इलेक्ट्रॉन आगे बढ़ाता है और H⁺ को थायलाकॉइड में पंप करता है।', 'ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳನ್ನು ಮುಂದೆ ಸಾಗಿಸಿ H⁺ ಅನ್ನು ಥೈಲಕಾಯ್ಡ್ ಒಳಗೆ ಪಂಪ್ ಮಾಡುತ್ತದೆ.') },
    { id: 'psi', group: 'membrane', color: '#4f98ad', name: t('Photosystem I', 'फोटोसिस्टम I', 'ಫೋಟೋಸಿಸ್ಟಮ್ I'), info: t('Uses light to re-energise electrons for making NADPH.', 'NADPH बनाने के लिए प्रकाश से इलेक्ट्रॉनों को फिर ऊर्जा देता है।', 'NADPH ತಯಾರಿಸಲು ಬೆಳಕಿನಿಂದ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳಿಗೆ ಮತ್ತೆ ಶಕ್ತಿ ನೀಡುತ್ತದೆ.') },
    { id: 'atp_synthase', group: 'membrane', color: '#c96a5e', name: t('ATP synthase', 'ATP सिंथेज़', 'ATP ಸಿಂಥೇಸ್'), info: t('A rotary enzyme: H⁺ flowing through it turn its rotor, and it makes ATP.', 'घूमने वाला एंजाइम: इससे होकर बहते H⁺ इसका रोटर घुमाते हैं, और यह ATP बनाता है।', 'ತಿರುಗುವ ಕಿಣ್ವ: ಇದರ ಮೂಲಕ ಹರಿಯುವ H⁺ ಇದರ ರೋಟರ್ ತಿರುಗಿಸುತ್ತವೆ; ಇದು ATP ತಯಾರಿಸುತ್ತದೆ.') },
    { id: 'electron', group: 'molecules', color: '#7fe3ff', name: t('Electrons', 'इलेक्ट्रॉन', 'ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳು'), info: t('Carry the energy captured from light.', 'प्रकाश से पकड़ी गई ऊर्जा ले जाते हैं।', 'ಬೆಳಕಿನಿಂದ ಹಿಡಿದ ಶಕ್ತಿಯನ್ನು ಸಾಗಿಸುತ್ತವೆ.') },
    { id: 'hion', group: 'molecules', color: '#ff9e7a', name: t('Hydrogen ions (H⁺)', 'हाइड्रोजन आयन (H⁺)', 'ಹೈಡ್ರೋಜನ್ ಅಯಾನುಗಳು (H⁺)'), info: t('Build up inside the thylakoid and flow out through ATP synthase.', 'थायलाकॉइड के अंदर जमा होकर ATP सिंथेज़ से बाहर बहते हैं।', 'ಥೈಲಕಾಯ್ಡ್ ಒಳಗೆ ಸಂಗ್ರಹವಾಗಿ ATP ಸಿಂಥೇಸ್ ಮೂಲಕ ಹೊರಗೆ ಹರಿಯುತ್ತವೆ.') },
    { id: 'nadph', group: 'molecules', color: '#4fb3a5', name: t('NADPH', 'NADPH', 'NADPH'), info: t('Carries high-energy electrons to the Calvin cycle.', 'उच्च ऊर्जा वाले इलेक्ट्रॉन केल्विन चक्र तक ले जाता है।', 'ಹೆಚ್ಚಿನ ಶಕ್ತಿಯ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳನ್ನು ಕ್ಯಾಲ್ವಿನ್ ಚಕ್ರಕ್ಕೆ ಒಯ್ಯುತ್ತದೆ.') },
    { id: 'atp', group: 'molecules', color: '#e08d2b', name: t('ATP', 'ATP', 'ATP'), info: t('The cell’s energy currency.', 'कोशिका की ऊर्जा मुद्रा।', 'ಕೋಶದ ಶಕ್ತಿಯ ನಾಣ್ಯ.') },
    { id: 'rubisco', group: 'chloroplast', color: '#5f9e8f', name: t('RuBisCO', 'रुबिस्को', 'ರುಬಿಸ್ಕೋ'), info: t('The enzyme that fixes CO₂ — the most abundant protein on Earth.', 'वह एंजाइम जो CO₂ का स्थिरीकरण करता है — पृथ्वी पर सबसे अधिक पाया जाने वाला प्रोटीन।', 'CO₂ ಅನ್ನು ಸ್ಥಿರೀಕರಿಸುವ ಕಿಣ್ವ — ಭೂಮಿಯ ಮೇಲೆ ಅತಿ ಹೆಚ್ಚು ಇರುವ ಪ್ರೋಟೀನ್.') },
    { id: 'rubp', group: 'molecules', color: '#9a7bd0', name: t('RuBP (5-carbon sugar)', 'RuBP (5-कार्बन शर्करा)', 'RuBP (5-ಕಾರ್ಬನ್ ಸಕ್ಕರೆ)'), info: t('Accepts CO₂ at the start of the cycle and is rebuilt at its end.', 'चक्र की शुरुआत में CO₂ ग्रहण करता है और अंत में फिर बनता है।', 'ಚಕ್ರದ ಆರಂಭದಲ್ಲಿ CO₂ ಸ್ವೀಕರಿಸಿ ಕೊನೆಯಲ್ಲಿ ಮತ್ತೆ ತಯಾರಾಗುತ್ತದೆ.') },
    { id: 'g3p', group: 'molecules', color: '#e0b04a', name: t('G3P (3-carbon sugar)', 'G3P (3-कार्बन शर्करा)', 'G3P (3-ಕಾರ್ಬನ್ ಸಕ್ಕರೆ)'), info: t('The sugar the cycle makes; two of them make one glucose.', 'चक्र द्वारा बनी शर्करा; दो से एक ग्लूकोज़ बनता है।', 'ಚಕ್ರ ತಯಾರಿಸುವ ಸಕ್ಕರೆ; ಎರಡರಿಂದ ಒಂದು ಗ್ಲೂಕೋಸ್.') },
    { id: 'glucose', group: 'molecules', color: '#f0e2b8', name: t('Glucose', 'ग्लूकोज़', 'ಗ್ಲೂಕೋಸ್'), info: t('C₆H₁₂O₆: food the plant uses for energy and growth.', 'C₆H₁₂O₆: वह भोजन जिसे पौधा ऊर्जा और वृद्धि के लिए उपयोग करता है।', 'C₆H₁₂O₆: ಸಸ್ಯ ಶಕ್ತಿ ಮತ್ತು ಬೆಳವಣಿಗೆಗೆ ಬಳಸುವ ಆಹಾರ.') },
  ],
  steps: [
    {
      id: 'leaf', stage: 'leaf', seconds: 9,
      camera: { pos: [3.2, 4.4, 7.4], target: [0.2, -0.1, 0], from: [7, 9, 15] },
      highlight: ['leaf'], labels: ['leaf', 'vein', 'stem'],
      title: t('A green leaf', 'हरी पत्ती', 'ಹಸಿರು ಎಲೆ'),
      caption: t(
        'Green plants make their own food by photosynthesis. Most of it happens in the leaves.',
        'हरे पौधे प्रकाश संश्लेषण द्वारा अपना भोजन स्वयं बनाते हैं। यह अधिकतर पत्तियों में होता है।',
        'ಹಸಿರು ಸಸ್ಯಗಳು ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆಯ ಮೂಲಕ ತಮ್ಮ ಆಹಾರವನ್ನು ತಾವೇ ತಯಾರಿಸುತ್ತವೆ. ಇದು ಹೆಚ್ಚಾಗಿ ಎಲೆಗಳಲ್ಲಿ ನಡೆಯುತ್ತದೆ.',
      ),
    },
    {
      id: 'inputs', stage: 'leaf', seconds: 12,
      camera: { pos: [0.6, -3.4, 6.6], target: [0.3, -0.7, 0], drift: 0.015 },
      highlight: ['vein'], labels: ['sunlight', 'co2', 'oxygen', 'water'],
      title: t('What goes in and out', 'क्या अंदर जाता है, क्या बाहर आता है', 'ಒಳಗೆ ಹೋಗುವುದು, ಹೊರಗೆ ಬರುವುದು'),
      caption: t(
        'Sunlight falls on the leaf. Carbon dioxide enters through tiny pores called stomata, and water comes up from the roots through the veins. Oxygen goes out.',
        'पत्ती पर सूर्य का प्रकाश पड़ता है। कार्बन डाइऑक्साइड रंध्र नामक छोटे छिद्रों से अंदर आती है, और जल जड़ों से शिराओं द्वारा ऊपर आता है। ऑक्सीजन बाहर निकलती है।',
        'ಎಲೆಯ ಮೇಲೆ ಸೂರ್ಯನ ಬೆಳಕು ಬೀಳುತ್ತದೆ. ಪತ್ರರಂಧ್ರಗಳೆಂಬ ಸಣ್ಣ ರಂಧ್ರಗಳ ಮೂಲಕ ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ ಒಳಗೆ ಬರುತ್ತದೆ, ಮತ್ತು ನೀರು ಬೇರುಗಳಿಂದ ನಾಳಗಳ ಮೂಲಕ ಮೇಲೆ ಬರುತ್ತದೆ. ಆಮ್ಲಜನಕ ಹೊರಗೆ ಹೋಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'tissue', stage: 'tissue', seconds: 12,
      camera: { pos: [3.0, 1.35, 5.4], target: [0.1, -0.1, 0.6], from: [1.2, 6, 3] },
      highlight: ['palisade'], labels: ['cuticle', 'epidermis', 'palisade', 'spongy', 'xylem', 'stoma'],
      title: t('Inside the leaf', 'पत्ती के अंदर', 'ಎಲೆಯ ಒಳಗೆ'),
      caption: t(
        'A slice of the leaf: tall palisade cells under the upper skin, loosely packed spongy cells with air spaces below, a vein carrying water, and a stoma on the underside.',
        'पत्ती का एक टुकड़ा: ऊपरी त्वचा के नीचे लंबी खंभ कोशिकाएँ, उनके नीचे हवा के स्थानों वाली ढीली स्पंजी कोशिकाएँ, जल ले जाने वाली एक शिरा, और निचली सतह पर एक रंध्र।',
        'ಎಲೆಯ ಒಂದು ತುಂಡು: ಮೇಲಿನ ಚರ್ಮದ ಕೆಳಗೆ ಉದ್ದವಾದ ಸ್ತಂಭ ಕೋಶಗಳು, ಅವುಗಳ ಕೆಳಗೆ ಗಾಳಿಯ ಅವಕಾಶಗಳಿರುವ ಸಡಿಲವಾದ ಸ್ಪಂಜು ಕೋಶಗಳು, ನೀರನ್ನು ಸಾಗಿಸುವ ನಾಳ, ಮತ್ತು ಕೆಳಭಾಗದಲ್ಲಿ ಒಂದು ಪತ್ರರಂಧ್ರ.',
      ),
    },
    {
      id: 'cell', stage: 'cell', seconds: 11,
      camera: { pos: [3.1, 1.5, 7.8], target: [0, 0.2, 0], from: [1.5, 1, 14] },
      highlight: ['chloroplasts'], labels: ['cell_wall', 'vacuole', 'nucleus', 'chloroplasts'],
      title: t('A palisade cell', 'एक खंभ कोशिका', 'ಒಂದು ಸ್ತಂಭ ಕೋಶ'),
      caption: t(
        'Each palisade cell is packed with green chloroplasts. They drift slowly along the cell wall, around the large central vacuole, to catch the light.',
        'हर खंभ कोशिका हरे हरितलवकों से भरी होती है। वे बड़ी केंद्रीय रिक्तिका के चारों ओर, कोशिका भित्ति के साथ-साथ धीरे-धीरे घूमते हैं ताकि प्रकाश पकड़ सकें।',
        'ಪ್ರತಿ ಸ್ತಂಭ ಕೋಶವು ಹಸಿರು ಹರಿತ್ತಿನ ಕಣಗಳಿಂದ ತುಂಬಿರುತ್ತದೆ. ಬೆಳಕನ್ನು ಹಿಡಿಯಲು ಅವು ದೊಡ್ಡ ಕೇಂದ್ರ ರಸದಾನಿಯ ಸುತ್ತ, ಕೋಶಭಿತ್ತಿಯ ಉದ್ದಕ್ಕೂ ನಿಧಾನವಾಗಿ ಚಲಿಸುತ್ತವೆ.',
      ),
    },
    {
      id: 'chloroplast', stage: 'chloroplast', seconds: 12,
      camera: { pos: [2.6, 4.2, 6.6], target: [0.1, -0.2, 0.2], from: [1.2, 2.5, 14] },
      highlight: ['granum'], labels: ['envelope', 'stroma', 'granum', 'lamella', 'starch'],
      title: t('The chloroplast', 'हरितलवक', 'ಹರಿತ್ತಿನ ಕಣ'),
      caption: t(
        'Inside its double membrane, a chloroplast holds stacks of flat discs called thylakoids (a stack is a granum) in a fluid called the stroma. The green pigment chlorophyll sits in the thylakoid membranes.',
        'अपनी दोहरी झिल्ली के अंदर हरितलवक में थायलाकॉइड नामक चपटी थैलियों के ढेर (ग्रेनम) होते हैं, जो स्ट्रोमा नामक द्रव में रहते हैं। हरा वर्णक क्लोरोफिल थायलाकॉइड की झिल्लियों में होता है।',
        'ತನ್ನ ಎರಡು ಪದರದ ಪೊರೆಯೊಳಗೆ ಹರಿತ್ತಿನ ಕಣವು ಸ್ಟ್ರೋಮಾ ಎಂಬ ದ್ರವದಲ್ಲಿ ಥೈಲಕಾಯ್ಡ್‌ಗಳೆಂಬ ಚಪ್ಪಟೆ ಬಿಲ್ಲೆಗಳ ರಾಶಿಗಳನ್ನು (ಗ್ರಾನಮ್) ಹೊಂದಿದೆ. ಹಸಿರು ವರ್ಣದ್ರವ್ಯ ಪತ್ರಹರಿತ್ತು ಥೈಲಕಾಯ್ಡ್ ಪೊರೆಗಳಲ್ಲಿರುತ್ತದೆ.',
      ),
    },
    {
      id: 'light', stage: 'membrane', seconds: 11,
      camera: { pos: [-1.8, 1.4, 4.6], target: [-3.1, 0.25, 0.4], from: [-2.0, 4, 12] },
      highlight: ['psii', 'lhc'], labels: ['membrane', 'lhc', 'psii', 'electron'],
      title: t('Capturing light', 'प्रकाश को पकड़ना', 'ಬೆಳಕನ್ನು ಹಿಡಿಯುವುದು'),
      caption: t(
        'The light reactions begin. Chlorophyll in photosystem II absorbs light energy, and this energy lifts electrons to a high-energy state.',
        'प्रकाश अभिक्रियाएँ शुरू होती हैं। फोटोसिस्टम II में क्लोरोफिल प्रकाश ऊर्जा सोखता है, और यह ऊर्जा इलेक्ट्रॉनों को उच्च ऊर्जा अवस्था में पहुँचा देती है।',
        'ಬೆಳಕಿನ ಕ್ರಿಯೆಗಳು ಆರಂಭವಾಗುತ್ತವೆ. ಫೋಟೋಸಿಸ್ಟಮ್ II ರಲ್ಲಿರುವ ಪತ್ರಹರಿತ್ತು ಬೆಳಕಿನ ಶಕ್ತಿಯನ್ನು ಹೀರಿಕೊಳ್ಳುತ್ತದೆ; ಈ ಶಕ್ತಿ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳನ್ನು ಹೆಚ್ಚಿನ ಶಕ್ತಿಯ ಸ್ಥಿತಿಗೆ ಏರಿಸುತ್ತದೆ.',
      ),
    },
    {
      id: 'water', stage: 'membrane', seconds: 12,
      camera: { pos: [-1.5, -1.0, 5.0], target: [-3.2, -1.0, 0.4] },
      highlight: ['psii'], labels: ['water', 'oxygen', 'hion', 'lumen'],
      title: t('Splitting water', 'जल का विघटन', 'ನೀರಿನ ವಿಭಜನೆ'),
      caption: t(
        'To replace those electrons, water is split inside the thylakoid. Oxygen is released as a by-product, and hydrogen ions (H⁺) are left behind.',
        'उन इलेक्ट्रॉनों की पूर्ति के लिए थायलाकॉइड के अंदर जल का विघटन होता है। ऑक्सीजन उप-उत्पाद के रूप में मुक्त होती है, और हाइड्रोजन आयन (H⁺) पीछे रह जाते हैं।',
        'ಆ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳ ಬದಲಿಗೆ ಥೈಲಕಾಯ್ಡ್ ಒಳಗೆ ನೀರು ವಿಭಜನೆಯಾಗುತ್ತದೆ. ಆಮ್ಲಜನಕ ಉಪ-ಉತ್ಪನ್ನವಾಗಿ ಬಿಡುಗಡೆಯಾಗುತ್ತದೆ, ಮತ್ತು ಹೈಡ್ರೋಜನ್ ಅಯಾನುಗಳು (H⁺) ಉಳಿಯುತ್ತವೆ.',
      ),
    },
    {
      id: 'transport', stage: 'membrane', seconds: 14,
      camera: { pos: [0.5, 1.05, 7.8], target: [0.4, 0.3, 0], drift: 0.012 },
      highlight: ['cytb6f', 'psi'], labels: ['psii', 'cytb6f', 'psi', 'nadph', 'electron'],
      title: t('Electron transport and NADPH', 'इलेक्ट्रॉन परिवहन और NADPH', 'ಇಲೆಕ್ಟ್ರಾನ್ ಸಾಗಣೆ ಮತ್ತು NADPH'),
      caption: t(
        'The electrons pass along a chain of proteins to photosystem I, which uses more light to boost them again. They are used to make NADPH. On the way, H⁺ ions are pumped into the thylakoid.',
        'इलेक्ट्रॉन प्रोटीनों की एक शृंखला से होकर फोटोसिस्टम I तक जाते हैं, जो और प्रकाश लेकर उन्हें फिर ऊर्जा देता है। इनसे NADPH बनता है। रास्ते में H⁺ आयन थायलाकॉइड के अंदर पंप किए जाते हैं।',
        'ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳು ಪ್ರೋಟೀನ್‌ಗಳ ಸರಪಳಿಯ ಮೂಲಕ ಫೋಟೋಸಿಸ್ಟಮ್ I ಗೆ ಸಾಗುತ್ತವೆ; ಅದು ಇನ್ನಷ್ಟು ಬೆಳಕನ್ನು ಬಳಸಿ ಅವುಗಳಿಗೆ ಮತ್ತೆ ಶಕ್ತಿ ನೀಡುತ್ತದೆ. ಅವುಗಳಿಂದ NADPH ತಯಾರಾಗುತ್ತದೆ. ದಾರಿಯಲ್ಲಿ H⁺ ಅಯಾನುಗಳನ್ನು ಥೈಲಕಾಯ್ಡ್ ಒಳಗೆ ಪಂಪ್ ಮಾಡಲಾಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'atp', stage: 'membrane', seconds: 12,
      camera: { pos: [6.6, 1.0, 5.4], target: [4.3, 0.8, 0.2] },
      highlight: ['atp_synthase'], labels: ['atp_synthase', 'hion', 'atp'],
      title: t('Making ATP', 'ATP का बनना', 'ATP ತಯಾರಿಕೆ'),
      caption: t(
        'H⁺ ions flow back out through ATP synthase. The flow spins it like a turbine, and it joins ADP and phosphate into ATP, the cell’s energy currency.',
        'H⁺ आयन ATP सिंथेज़ से होकर वापस बाहर बहते हैं। यह बहाव उसे टरबाइन की तरह घुमाता है, और वह ADP तथा फॉस्फेट को जोड़कर ATP बनाता है, जो कोशिका की ऊर्जा मुद्रा है।',
        'H⁺ ಅಯಾನುಗಳು ATP ಸಿಂಥೇಸ್ ಮೂಲಕ ಮರಳಿ ಹೊರಗೆ ಹರಿಯುತ್ತವೆ. ಈ ಹರಿವು ಅದನ್ನು ಟರ್ಬೈನಿನಂತೆ ತಿರುಗಿಸುತ್ತದೆ, ಮತ್ತು ಅದು ADP ಮತ್ತು ಫಾಸ್ಫೇಟನ್ನು ಸೇರಿಸಿ ಕೋಶದ ಶಕ್ತಿಯ ನಾಣ್ಯವಾದ ATP ಯನ್ನು ತಯಾರಿಸುತ್ತದೆ.',
      ),
    },
    {
      id: 'calvin', stage: 'stroma', seconds: 15,
      camera: { pos: [0.3, 3.4, 8.4], target: [0.2, -0.1, 0], from: [0.5, 6, 16], drift: 0.02 },
      highlight: ['rubisco'], labels: ['rubisco', 'co2', 'rubp', 'atp', 'nadph'],
      title: t('The Calvin cycle', 'केल्विन चक्र', 'ಕ್ಯಾಲ್ವಿನ್ ಚಕ್ರ'),
      caption: t(
        'In the stroma, the enzyme RuBisCO fixes carbon dioxide onto a five-carbon sugar, RuBP. Using ATP and NADPH from the light reactions, the cycle turns it into a three-carbon sugar, G3P.',
        'स्ट्रोमा में रुबिस्को एंजाइम कार्बन डाइऑक्साइड को पाँच-कार्बन शर्करा RuBP से जोड़ देता है। प्रकाश अभिक्रियाओं से मिले ATP और NADPH की मदद से यह चक्र उसे तीन-कार्बन शर्करा G3P में बदल देता है।',
        'ಸ್ಟ್ರೋಮಾದಲ್ಲಿ ರುಬಿಸ್ಕೋ ಕಿಣ್ವವು ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡನ್ನು ಐದು-ಕಾರ್ಬನ್ ಸಕ್ಕರೆ RuBP ಗೆ ಜೋಡಿಸುತ್ತದೆ. ಬೆಳಕಿನ ಕ್ರಿಯೆಗಳಿಂದ ಬಂದ ATP ಮತ್ತು NADPH ಬಳಸಿ ಈ ಚಕ್ರವು ಅದನ್ನು ಮೂರು-ಕಾರ್ಬನ್ ಸಕ್ಕರೆ G3P ಆಗಿ ಬದಲಾಯಿಸುತ್ತದೆ.',
      ),
    },
    {
      id: 'glucose', stage: 'stroma', seconds: 12,
      camera: { pos: [5.4, 1.6, 5.6], target: [3.6, -0.3, 0.6] },
      highlight: [], labels: ['g3p', 'glucose', 'rubp'],
      title: t('Sugar is made', 'शर्करा बनती है', 'ಸಕ್ಕರೆ ತಯಾರಾಗುತ್ತದೆ'),
      caption: t(
        'Most G3P stays in the cycle to rebuild RuBP. The rest is joined into glucose, which the plant uses for energy or stores as starch.',
        'अधिकांश G3P चक्र में रहकर फिर से RuBP बनाता है। बाकी जुड़कर ग्लूकोज़ बनाता है, जिसे पौधा ऊर्जा के लिए उपयोग करता है या मंड (स्टार्च) के रूप में जमा करता है।',
        'ಹೆಚ್ಚಿನ G3P ಚಕ್ರದಲ್ಲೇ ಉಳಿದು ಮತ್ತೆ RuBP ಯನ್ನು ತಯಾರಿಸುತ್ತದೆ. ಉಳಿದದ್ದು ಸೇರಿ ಗ್ಲೂಕೋಸ್ ಆಗುತ್ತದೆ; ಸಸ್ಯವು ಅದನ್ನು ಶಕ್ತಿಗಾಗಿ ಬಳಸುತ್ತದೆ ಅಥವಾ ಪಿಷ್ಟವಾಗಿ ಸಂಗ್ರಹಿಸುತ್ತದೆ.',
      ),
    },
    {
      id: 'summary', stage: 'leaf', seconds: 12,
      camera: { pos: [4.6, 3.0, 8.6], target: [0.3, -0.4, 0], from: [1, 0.5, 2.5] },
      highlight: ['leaf'], labels: ['sunlight', 'co2', 'water', 'oxygen'],
      title: t('In short', 'संक्षेप में', 'ಸಂಕ್ಷಿಪ್ತವಾಗಿ'),
      caption: t(
        '6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ (glucose) + 6O₂. Chlorophyll in the leaf turns light into the chemical energy of food.',
        '6CO₂ + 6H₂O + प्रकाश ऊर्जा → C₆H₁₂O₆ (ग्लूकोज़) + 6O₂। पत्ती का क्लोरोफिल प्रकाश ऊर्जा को भोजन की रासायनिक ऊर्जा में बदल देता है।',
        '6CO₂ + 6H₂O + ಬೆಳಕಿನ ಶಕ್ತಿ → C₆H₁₂O₆ (ಗ್ಲೂಕೋಸ್) + 6O₂. ಎಲೆಯ ಪತ್ರಹರಿತ್ತು ಬೆಳಕಿನ ಶಕ್ತಿಯನ್ನು ಆಹಾರದ ರಾಸಾಯನಿಕ ಶಕ್ತಿಯಾಗಿ ಬದಲಾಯಿಸುತ್ತದೆ.',
      ),
    },
  ],
};

// ------------------------------------------------------------------ shared

// ------------------------------------------------------------------ builder

export async function build(k) {
  const stages = {
    leaf: buildLeaf(k),
    tissue: buildTissue(k),
    cell: buildCell(k),
    chloroplast: buildChloroplast(k),
    membrane: buildMembrane(k),
    stroma: buildStroma(k),
  };
  return {
    update(s) {
      stages[s.stage]?.(s);
    },
  };
}

// ------------------------------------------------------------------ the leaf

function leafTextures() {
  const rnd = seeded(11);
  // Veins in leaf space: u across (0..1), v along (0 base .. 1 tip).
  const veins = [];
  for (let i = 0; i < 11; i++) {
    const v0 = 0.06 + i * 0.078;
    for (const side of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 12; k++) {
        const s = k / 12;
        pts.push([0.5 + side * s * 0.47, v0 + s * 0.16 + s * s * 0.06]);
      }
      veins.push({ pts, w: 1 - i * 0.05 });
    }
  }
  const paint = (c, w, h, kind) => {
    const X = (u) => u * w, Y = (v) => (1 - v) * h;
    if (kind === 'bump') {
      c.fillStyle = '#5a5a5a';
      c.fillRect(0, 0, w, h);
    } else {
      const grad = c.createLinearGradient(0, h, 0, 0);
      const base = kind === 'under' ? ['#7d9c62', '#87a86b', '#7a9a5e'] : ['#2f6522', '#3b7629', '#326b24'];
      grad.addColorStop(0, base[0]);
      grad.addColorStop(0.5, base[1]);
      grad.addColorStop(1, base[2]);
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const x = rnd() * w, y = rnd() * h, r = 3 + rnd() * 16;
        c.fillStyle = `rgba(${rnd() < 0.5 ? '20,50,12' : '90,130,45'},${0.035 + rnd() * 0.04})`;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
      if (kind === 'under') {
        // Stomata: tiny pale pores all over the underside.
        for (let i = 0; i < 1400; i++) {
          const x = rnd() * w, y = rnd() * h;
          c.fillStyle = 'rgba(200,215,170,0.55)';
          c.beginPath();
          c.ellipse(x, y, 1.6, 2.6, rnd() * 3, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    // A fine net of small veins between the big ones.
    c.strokeStyle = kind === 'bump' ? 'rgba(160,160,160,0.6)' : 'rgba(140,180,80,0.18)';
    c.lineWidth = 1.2;
    for (let i = 0; i < 1500; i++) {
      const x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI * 2, l = 6 + rnd() * 14;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      c.stroke();
    }
    for (const { pts, w: vw } of veins) {
      c.strokeStyle = kind === 'bump' ? '#d8d8d8' : kind === 'under' ? 'rgba(190,210,150,0.8)' : 'rgba(150,185,85,0.6)';
      c.lineWidth = 5 * vw;
      c.lineCap = 'round';
      c.beginPath();
      pts.forEach(([u, v], i) => (i ? c.lineTo(X(u), Y(v)) : c.moveTo(X(u), Y(v))));
      c.stroke();
    }
    c.strokeStyle = kind === 'bump' ? '#ffffff' : 'rgba(185,205,120,0.85)';
    c.lineWidth = 12;
    c.beginPath();
    c.moveTo(X(0.5), Y(0));
    c.lineTo(X(0.5), Y(1));
    c.stroke();
  };
  return {
    map: canvasTexture(1024, 1024, (c, w, h) => paint(c, w, h, 'top')),
    under: canvasTexture(1024, 1024, (c, w, h) => paint(c, w, h, 'under')),
    bump: canvasTexture(1024, 1024, (c, w, h) => paint(c, w, h, 'bump'), { data: true }),
  };
}

const LEAF_L = 5.8, LEAF_W = 1.65;
/** The leaf blade at (u across, v along). */
function leafPoint(u, v, out) {
  const s = u * 2 - 1;
  const width = LEAF_W * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(v, 0.72))), 0.85);
  const x = v * LEAF_L - LEAF_L * 0.45;
  const z = s * width * (1 + 0.015 * Math.sin(v * 37));
  // Droops towards the tip, edges raised a little, a gentle twist.
  const y = 0.7 * v - 1.05 * v * v + 0.26 * s * s * (width / LEAF_W) + 0.035 * Math.sin(v * 9 + s * 2) * Math.abs(s) + 0.1 * s * v;
  return out.set(x, y, z);
}

function buildLeaf(k) {
  const stage = k.stage('leaf');
  const tex = leafTextures();
  const leaf = new THREE.Group();
  const top = surface((u, v, o) => leafPoint(u, v, o), 64, 120);
  const bottom = surface((u, v, o) => leafPoint(1 - u, v, o).add({ x: 0, y: -0.028, z: 0 }), 44, 84);
  const buv = bottom.attributes.uv;
  for (let i = 0; i < buv.count; i++) buv.setX(i, 1 - buv.getX(i));
  const topMat = mat({ color: '#ffffff', map: tex.map, bumpMap: tex.bump, bumpScale: 1.4, rough: 0.52, clearcoat: 0.15, clearcoatRough: 0.4, rim: 0.08, rimColor: '#7fb040' });
  const botMat = mat({ color: '#ffffff', map: tex.under, bumpMap: tex.bump, bumpScale: 1.0, rough: 0.75, sheen: 0.2, sheenColor: '#b0c890', rim: 0.12, rimColor: '#c0d8a0' });
  leaf.add(new THREE.Mesh(top, topMat), new THREE.Mesh(bottom, botMat));
  leaf.rotation.set(0.12, -0.32, -0.06);
  stage.add(leaf);
  const o = new THREE.Vector3();
  k.part('leaf', leaf, { anchor: leafPoint(0.78, 0.6, o).clone().add({ x: 0, y: 0.05, z: 0 }).toArray() });

  // Midrib and petiole: one tapering tube from the stem to the tip.
  const mid = [];
  for (let i = 0; i <= 24; i++) mid.push(leafPoint(0.5, (i / 24) * 0.97, o).clone().add({ x: 0, y: 0.02, z: 0 }));
  const base = mid[0];
  const petiole = [base.clone().add({ x: -1.3, y: -0.62, z: 0.12 }), base.clone().add({ x: -0.65, y: -0.2, z: 0.05 }), ...mid];
  const petioleCurve = curve(petiole);
  const veinMat = mat({ color: '#a9c46a', rough: 0.45, clearcoat: 0.35, sheen: 0.2, rim: 0.12 });
  const vein = new THREE.Mesh(tube(petioleCurve, (u) => (u < 0.08 ? 0.075 : 0.06 * Math.pow(1 - u, 0.8) + 0.006), { segments: 120, radial: 12 }), veinMat);
  leaf.add(vein);
  k.part('vein', vein, { anchor: mid[9].toArray() });

  // The twig the leaf grows from (it runs out of the picture).
  const s0 = petiole[0];
  const stem = new THREE.Mesh(
    tube([s0.clone().add({ x: 0.5, y: -3.6, z: 0.6 }), s0.clone().add({ x: 0.1, y: -1.4, z: 0.15 }), s0, s0.clone().add({ x: -0.35, y: 1.3, z: -0.5 }), s0.clone().add({ x: -0.9, y: 3.2, z: -1.2 })], (u) => 0.12 - u * 0.04, { segments: 64, radial: 16 }),
    mat({ color: '#5f6e33', rough: 0.65, sheen: 0.3, sheenColor: '#9aa86a', rim: 0.12 }),
  );
  leaf.add(stem);
  k.part('stem', stem, { anchor: s0.clone().add({ x: 0.1, y: -1.0, z: 0.1 }).toArray() });

  const sunFrom = [-7, 11, 6];
  const beams = sunbeams(sunFrom, [0.4, -0.2, 0], { count: 4, radius: 0.9, spread: 1.4, opacity: 0.09 });
  stage.add(beams);

  const swarm = new MoleculeSwarm(400, { scale: 0.07 });
  const glow = new GlowPoints(700, { size: 0.08 });
  stage.add(swarm, glow);
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  stage.updateMatrixWorld(true);
  const onLeaf = (u, vv, out) => leaf.localToWorld(leafPoint(u, vv, out));

  const co2At = new THREE.Vector3(), o2At = new THREE.Vector3(), waterAt = new THREE.Vector3(), sunAt = new THREE.Vector3();
  k.marker('sunlight', stage, (out) => (sunAt.lengthSq() ? out.copy(sunAt) : null), 0.3);
  k.marker('co2', stage, (out) => (co2At.lengthSq() ? out.copy(co2At) : null), 0.15);
  k.marker('oxygen', stage, (out) => (o2At.lengthSq() ? out.copy(o2At) : null), 0.15);
  k.marker('water', stage, (out) => (waterAt.lengthSq() ? out.copy(waterAt) : null), 0.15);

  const rnd = seeded(5);
  // Stomata the gases go through, on the underside.
  // Each stream goes through one pore: CO₂ curving in from below, O₂ and water vapour drifting out.
  const streams = [
    { pore: [0.3, 0.22], kind: 'CO2', from: [-2.6, -2.4, 1.4] },
    { pore: [0.62, 0.3], kind: 'CO2', from: [-1.8, -2.9, 2.2] },
    { pore: [0.4, 0.45], kind: 'CO2', from: [-2.2, -3.0, 0.4] },
    { pore: [0.66, 0.55], kind: 'CO2', from: [-1.2, -3.2, 1.6] },
    { pore: [0.35, 0.66], kind: 'O2', from: [1.6, -2.8, 1.2] },
    { pore: [0.58, 0.74], kind: 'O2', from: [2.4, -2.4, 0.6] },
    { pore: [0.45, 0.6], kind: 'H2O', from: [1.2, -3.0, -0.6] },
  ].map((st, i) => ({ ...st, ph: rnd(), sp: 0.07 + (i % 3) * 0.008 }));
  const sunDir = new THREE.Vector3(...sunFrom).normalize();
  const rays = Array.from({ length: 16 }, () => [0.15 + rnd() * 0.7, 0.1 + rnd() * 0.8, rnd()]);

  return (s) => {
    const T = s.T;
    leaf.rotation.z = -0.06 + 0.018 * Math.sin(T * 0.6);
    leaf.rotation.x = 0.12 + 0.012 * Math.sin(T * 0.43);
    leaf.updateMatrixWorld(true);
    const flows = s.is('inputs', 'summary') ? smooth(s.t / 1.5) : 0;
    shimmer(beams, T, 1);
    for (const p of [co2At, o2At, waterAt, sunAt]) p.set(0, 0, 0);
    swarm.begin();
    glow.begin();
    // Sunlight arriving as golden streaks on the leaf.
    for (let i = 0; i < rays.length; i++) {
      const [u, vv, ph0] = rays[i];
      const ph = fract(ph0 + T * 0.35);
      onLeaf(u, vv, w);
      v.copy(w).addScaledVector(sunDir, 7);
      streak(glow, v, w, ph / 0.8, { size: 0.12, color: COL.photon, length: 0.1 });
      if (i === 3 && ph < 0.8 && ph > 0.2) sunAt.copy(v).lerp(w, ph / 0.8);
    }
    if (flows > 0.01) {
      for (const [si, st] of streams.entries()) {
        onLeaf(st.pore[0], st.pore[1], w);
        w.y -= 0.035;
        // The pore itself: a faint pale glint on the underside.
        glow.push(w.x, w.y - 0.02, w.z, 0.22, COL.water, 0.35 * flows);
        const into = st.kind === 'CO2';
        for (let j = 0; j < 5; j++) {
          const ph = fract(st.ph + T * st.sp + j / 5);
          // Along a gentle curve between the pore and a point below the leaf.
          const d = into ? 1 - ph : ph;
          const bend = Math.sin(d * Math.PI) * 0.35;
          v.set(w.x + st.from[0] * d, w.y + st.from[1] * d - bend, w.z + st.from[2] * d);
          const a = Math.min(smooth(ph / 0.15), smooth((1 - ph) / 0.15)) * flows;
          swarm.put(st.kind, v, tumble(si * 7 + j, T, 0.5, q), a);
          if (into && si === 1 && j === 2) co2At.copy(v);
          if (st.kind === 'O2' && si === 4 && j === 2) o2At.copy(v);
        }
      }
      // Water rising up the stem and along the midrib.
      for (let i = 0; i < 40; i++) {
        const u = fract(i / 40 + T * 0.06);
        petioleCurve.getPointAt(Math.min(0.999, u), v);
        v.y += 0.06;
        leaf.localToWorld(v);
        glow.push(v.x, v.y, v.z, 0.1, COL.water, 0.85 * flows * Math.min(1, u * 8, (1 - u) * 8));
        if (i === 14) waterAt.copy(v);
      }
    }
    swarm.end();
    glow.done();
  };
}

// ------------------------------------------------------------------ the leaf, cut open

function buildTissue(k) {
  const stage = k.stage('tissue');
  const rnd = seeded(7);
  const ZF = 1.1; // the cut face
  const X0 = -1.8, X1 = 1.8, Z0 = -1.1;
  const front = new THREE.Vector3(0, 0, 1);
  const cutCell = (geo) => squashBeyond(geo.clone(), front, 0);

  const cutMat = mat({ color: '#c9d98f', rough: 0.2, clearcoat: 1, clearcoatRough: 0.15, opacity: 0.45, rim: 0.25 });
  const cuticle = new THREE.Group();
  for (const y of [0.735, -0.735]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 0.03, ZF - Z0), cutMat);
    m.position.set(0, y, (ZF + Z0) / 2);
    cuticle.add(m);
  }
  stage.add(cuticle);
  k.part('cuticle', cuticle, { anchor: [-1.4, 0.75, 1.0] });

  // Epidermis: flat, clear cells.
  const epiGeo = smoothCell(new THREE.BoxGeometry(0.42, 0.14, 0.4, 3, 2, 3), 0.06);
  const epiMatBack = mat({ color: '#b9c9a2', rough: 0.4, clearcoat: 0.3, sheen: 0.2, rim: 0.18 });
  const epiMatFront = mat({ color: '#d2dfc0', rough: 0.3, clearcoat: 0.4, rim: 0.3, opacity: 0.5, side: THREE.DoubleSide });
  const epidermis = new THREE.Group();
  const stomaX = 0.7;
  for (const y of [0.64, -0.64]) {
    const backList = [], frontList = [];
    for (let x = X0 + 0.22; x < X1; x += 0.44) {
      for (let z = ZF; z > Z0; z -= 0.42) {
        if (y < 0 && Math.abs(x - stomaX) < 0.3 && z > ZF - 0.5) continue; // the stoma
        const m = trs([x + (rnd() - 0.5) * 0.03, y, z], [0, (rnd() - 0.5) * 0.15, 0], [1 + (rnd() - 0.5) * 0.1, 1, 1]);
        (z === ZF ? frontList : backList).push(m);
      }
    }
    epidermis.add(instanced(epiGeo, epiMatBack, backList), instanced(cutCell(epiGeo), epiMatFront, frontList));
  }
  stage.add(epidermis);
  k.part('epidermis', epidermis, { anchor: [1.55, 0.64, 1.0] });

  // Palisade: tall cells with chloroplasts lining their walls.
  const palProfile = [[0.0001, -0.25], [0.07, -0.245], [0.115, -0.22], [0.13, -0.17], [0.13, 0.17], [0.115, 0.22], [0.07, 0.245], [0.0001, 0.25]];
  const palGeo = smoothCell(lathe(palProfile, { segments: 16 }), 0);
  const palMatBack = mat({ color: '#3f7a2e', rough: 0.55, sheen: 0.3, sheenColor: '#7fb060', rim: 0.18, rimColor: '#8fd060' });
  const palMatFront = mat({ color: '#7fb35c', rough: 0.35, clearcoat: 0.35, sheen: 0.2, rim: 0.35, rimColor: '#b8f08a', opacity: 0.4, side: THREE.DoubleSide });
  const palBack = [], palFront = [], chloro = [];
  for (let x = X0 + 0.16; x < X1 - 0.05; x += 0.3) {
    for (let z = ZF; z > Z0 + 0.1; z -= 0.3) {
      const p = [x + (rnd() - 0.5) * 0.04, 0.27 + (rnd() - 0.5) * 0.03, z];
      const m = trs(p, [0, rnd() * 6, 0], [1 + (rnd() - 0.5) * 0.12, 1, 1 + (rnd() - 0.5) * 0.12]);
      if (z === ZF) palFront.push(m);
      else palBack.push(m);
      if (z > ZF - 0.35) {
        for (let i = 0; i < 12; i++) {
          const a = z === ZF ? Math.PI + (rnd() - 0.5) * 2.6 : rnd() * Math.PI * 2;
          const r = 0.095;
          chloro.push(trs([p[0] + Math.sin(a) * r, p[1] + (rnd() - 0.5) * 0.36, p[2] + Math.cos(a) * r], [rnd() * 3, a, rnd() * 3], [0.034, 0.02, 0.026]));
        }
      }
    }
  }
  const chloroGeo = blob(1, 1, 1, { detail: 6 });
  const chloroMat = mat({ color: '#2a6e26', rough: 0.4, clearcoat: 0.4, sheen: 0.3, sheenColor: '#6fc050', rim: 0.25, rimColor: '#8fe060', emissive: '#08200a' });
  const palisade = new THREE.Group();
  palisade.add(instanced(palGeo, palMatBack, palBack), instanced(cutCell(palGeo), palMatFront, palFront), instanced(chloroGeo, chloroMat, chloro));
  stage.add(palisade);
  k.part('palisade', palisade, { anchor: [-1.05, 0.3, ZF] });

  // Spongy cells: lumpy, loosely packed, with air spaces; clear of the vein and the stoma's chamber.
  const veinX = -0.55, veinY = -0.25;
  const spongyGeos = [0, 1, 2].map((i) => blob(0.15, 0.12, 0.14, { detail: 12, amp: 0.035, freq: 7, seed: 30 + i }));
  const spMatBack = mat({ color: '#4f8838', rough: 0.55, sheen: 0.3, sheenColor: '#90c070', rim: 0.18, rimColor: '#a0e070' });
  const spMatFront = mat({ color: '#94c274', rough: 0.35, clearcoat: 0.3, rim: 0.35, rimColor: '#d0ffb0', opacity: 0.42, side: THREE.DoubleSide });
  const spongy = new THREE.Group();
  const lists = spongyGeos.map(() => ({ back: [], front: [] }));
  const spChloro = [];
  for (let x = X0 + 0.2; x < X1 - 0.1; x += 0.34) {
    for (let z = ZF; z > Z0 + 0.1; z -= 0.36) {
      for (const y of [-0.08, -0.4]) {
        const p = [x + (rnd() - 0.5) * 0.12, y + (rnd() - 0.5) * 0.08, z === ZF ? ZF : z + (rnd() - 0.5) * 0.1];
        if (Math.hypot(p[0] - veinX, p[1] - veinY) < 0.36) continue;
        if (Math.abs(p[0] - stomaX) < 0.34 && p[1] < -0.2 && p[2] > ZF - 0.6) continue;
        if (rnd() < 0.18) continue;
        const kk = (rnd() * 3) | 0;
        if (z === ZF) {
          lists[kk].front.push(trs(p, [0, rnd() * 6, 0], 0.9 + rnd() * 0.2));
          for (let i = 0; i < 6; i++) {
            const a = Math.PI + (rnd() - 0.5) * 2.4;
            spChloro.push(trs([p[0] + Math.sin(a) * 0.1, p[1] + (rnd() - 0.5) * 0.14, p[2] + Math.cos(a) * 0.1], [rnd() * 3, a, 0], [0.03, 0.018, 0.024]));
          }
        } else lists[kk].back.push(trs(p, [rnd() * 6, rnd() * 6, rnd() * 6], 0.85 + rnd() * 0.3));
      }
    }
  }
  spongyGeos.forEach((g, i) => spongy.add(instanced(g, spMatBack, lists[i].back), instanced(cutCell(g), spMatFront, lists[i].front)));
  spongy.add(instanced(chloroGeo, chloroMat, spChloro));
  stage.add(spongy);
  k.part('spongy', spongy, { anchor: [1.35, -0.32, ZF] });

  // The vein: xylem vessels (lignified, ringed) and phloem, in a sheath of cells.
  const along = (x, y, r, mtl) => new THREE.Mesh(tube([[x, y, Z0], [x, y, ZF]], r, { segments: 2, radial: 22, caps: false }), mtl);
  const xyMat = mat({ color: '#8a5c3e', rough: 0.55, sheen: 0.25, rim: 0.15, side: THREE.DoubleSide });
  const phMat = mat({ color: '#b5bb68', rough: 0.5, sheen: 0.25, rim: 0.15, side: THREE.DoubleSide });
  const shMat = mat({ color: '#8fae66', rough: 0.5, sheen: 0.3, rim: 0.18, side: THREE.DoubleSide });
  const xylem = new THREE.Group();
  const lanes = [[-0.06, -0.17, 0.06], [0.07, -0.19, 0.05], [0.0, -0.3, 0.045]];
  lanes.forEach(([dx, dy, r]) => {
    xylem.add(along(veinX + dx, veinY + dy + 0.18, r, xyMat));
    for (let z = Z0 + 0.1; z < ZF; z += 0.12) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, r * 0.12, 6, 18), xyMat);
      ring.position.set(veinX + dx, veinY + dy + 0.18, z);
      xylem.add(ring);
    }
  });
  stage.add(xylem);
  k.part('xylem', xylem, { anchor: [veinX, veinY + 0.02, ZF] });
  const phloem = new THREE.Group();
  [[-0.08, -0.08, 0.03], [0.0, -0.06, 0.028], [0.08, -0.08, 0.03]].forEach(([dx, dy, r]) => phloem.add(along(veinX + dx, veinY + dy - 0.06, r, phMat)));
  stage.add(phloem);
  k.part('phloem', phloem, { anchor: [veinX, veinY - 0.14, ZF] });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    stage.add(along(veinX + Math.cos(a) * 0.24, veinY + Math.sin(a) * 0.2, 0.065, shMat));
  }

  // The stoma: two kidney-shaped guard cells round a pore, cut across the middle.
  const stoma = new THREE.Group();
  const guardMat = mat({ color: '#4f8a34', rough: 0.45, clearcoat: 0.35, sheen: 0.3, sheenColor: '#a0d070', rim: 0.25, rimColor: '#c0ff90', side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const z = ZF - 0.36 + t * 0.72;
      pts.push([stomaX + side * (0.035 + 0.075 * Math.sin(Math.PI * t)), -0.645, z]);
    }
    const g = tube(pts, (t) => 0.05 + 0.025 * Math.sin(Math.PI * t), { segments: 32, radial: 14 });
    stoma.add(new THREE.Mesh(squashBeyond(g, front, ZF), guardMat));
  }
  stage.add(stoma);
  k.part('stoma', stoma, { anchor: [stomaX, -0.66, ZF] });

  // Light from above; gases through the stoma; water along the xylem.
  const beams = sunbeams([-3, 8, 3], [0, 0.8, 0.2], { count: 3, radius: 0.8, spread: 1.0, opacity: 0.08 });
  stage.add(beams);
  const swarm = new MoleculeSwarm(160, { scale: 0.032 });
  const glow = new GlowPoints(240, { size: 0.05 });
  stage.add(swarm, glow);
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const sunDir = new THREE.Vector3(-3, 8, 3).normalize();
  return (s) => {
    const T = s.T;
    shimmer(beams, T, 1);
    swarm.begin();
    glow.begin();
    for (let i = 0; i < 12; i++) {
      const ph = fract(i / 12 + T * 0.25);
      b.set(-1.5 + (i % 6) * 0.55, 0.75, -0.6 + Math.floor(i / 6) * 1.0);
      a.copy(b).addScaledVector(sunDir, 4);
      streak(glow, a, b, ph / 0.7, { size: 0.07, color: COL.photon, length: 0.12 });
    }
    for (let i = 0; i < 14; i++) {
      const ph = fract(i / 14 + T * 0.09);
      const co2 = i % 2 === 0;
      const u = co2 ? ph : 1 - ph;
      const spread = Math.max(0, u - 0.45) * 2.0;
      v.set(stomaX + Math.sin(i * 2.3) * 0.5 * spread, -1.4 + u * 1.25, ZF - 0.12 - (i % 3) * 0.08 + Math.cos(i * 1.3) * 0.2 * spread);
      const al = Math.min(smooth(ph / 0.12), smooth((1 - ph) / 0.12));
      swarm.put(co2 ? 'CO2' : 'O2', v, tumble(i, T, 0.6, q), al);
    }
    for (let i = 0; i < 30; i++) {
      const ph = fract(i / 30 + T * 0.12);
      const [lx, ly] = lanes[i % 3];
      glow.push(veinX + lx, veinY + ly + 0.18, lerp(Z0, ZF, ph), 0.05, COL.water, 0.9 * Math.min(1, ph * 6, (1 - ph) * 6));
    }
    swarm.end();
    glow.done();
  };
}

// ------------------------------------------------------------------ a palisade cell

function buildCell(k) {
  const stage = k.stage('cell');
  const rnd = seeded(13);
  const H = 1.85, R = 1.0;
  const prof = (r, h) => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * (Math.PI / 2);
      pts.push([Math.cos(a) * r, -h + Math.sin(a) * r * 0.9 + r * 0.9]);
    }
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      pts.push([Math.cos(a) * r, h - r * 0.9 + Math.sin(a) * r * 0.9]);
    }
    return pts;
  };
  const open = Math.PI * 0.62; // the cut-away opening, facing the camera
  const shell = (r, h) => {
    const g = lathe(prof(r, h), { segments: 64, phiStart: 0, phiLength: Math.PI * 2 - open });
    g.rotateY(open / 2);
    return g;
  };
  const wall = new THREE.Group();
  const wallMat = mat({ color: '#a7c07a', rough: 0.55, sheen: 0.3, sheenColor: '#d0e8a0', rim: 0.3, rimColor: '#e0ffc0', opacity: 0.5, side: THREE.DoubleSide, clearcoat: 0.25 });
  const memMat = mat({ color: '#c8c288', rough: 0.35, clearcoat: 0.4, rim: 0.2, opacity: 0.3, side: THREE.DoubleSide });
  wall.add(new THREE.Mesh(shell(R, H), wallMat), new THREE.Mesh(shell(R * 0.94, H - 0.04), memMat));
  for (const a of [open / 2, -open / 2]) {
    const pts = prof(R * 0.97, H - 0.02).map(([r, y]) => new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r));
    wall.add(new THREE.Mesh(tube(pts, 0.035, { segments: 40, radial: 8 }), wallMat));
  }
  stage.add(wall);
  k.part('cell_wall', wall, { anchor: [-0.97, 0.9, 0.25] });

  const vacuole = new THREE.Mesh(blob(0.6, 1.25, 0.6, { detail: 28, amp: 0.04, freq: 2 }), mat({ color: '#9cc8dc', rough: 0.08, clearcoat: 1, clearcoatRough: 0.05, opacity: 0.3, rim: 0.45, rimColor: '#d0f0ff', iridescence: 0.25 }));
  vacuole.position.set(-0.05, -0.1, -0.15);
  stage.add(vacuole);
  k.part('vacuole', vacuole);

  const nucleus = new THREE.Group();
  nucleus.add(new THREE.Mesh(blob(0.3, 0.27, 0.28, { detail: 24, amp: 0.02, freq: 4 }), mat({ color: '#7d68a6', rough: 0.4, clearcoat: 0.3, sheen: 0.3, sheenColor: '#b8a8e0', rim: 0.2 })));
  const nl = new THREE.Mesh(blob(0.09, 0.09, 0.09, { detail: 10 }), mat({ color: '#4c3a7a', rough: 0.4 }));
  nl.position.set(0.12, 0.08, 0.2);
  nucleus.add(nl);
  nucleus.position.set(0.55, 1.05, -0.45);
  stage.add(nucleus);
  k.part('nucleus', nucleus);

  const chlGeo = (() => {
    const g = blob(0.2, 0.085, 0.13, { detail: 14, amp: 0.012, freq: 9 });
    const p = g.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) {
      const n = noise3(p.getX(i) * 22, p.getY(i) * 22, p.getZ(i) * 22);
      const k2 = 0.7 + 0.3 * smooth(n * 2 + 0.5);
      col.push(k2, k2, k2);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  })();
  const chlMat = mat({ color: '#2f7a2b', rough: 0.38, clearcoat: 0.5, clearcoatRough: 0.25, sheen: 0.3, sheenColor: '#70c050', rim: 0.25, rimColor: '#90f060', vertexColors: true, emissive: '#061806' });
  const N = 46;
  const chl = new THREE.InstancedMesh(chlGeo, chlMat, N);
  chl.frustumCulled = false;
  stage.add(chl);
  k.part('chloroplasts', chl, { anchor: [-0.78, -0.4, 0.3] });
  const seeds = Array.from({ length: N }, () => ({ a: rnd() * Math.PI * 2, y: -1.45 + rnd() * 2.9, r: 0.78 + rnd() * 0.06, sp: 0.06 + rnd() * 0.03, tw: rnd() * 6 }));

  // Neighbouring cells, behind and to the sides.
  const nb = new THREE.Group();
  const nbMat = mat({ color: '#2f5c25', rough: 0.6, sheen: 0.3, sheenColor: '#70a050', rim: 0.2, rimColor: '#80c060' });
  const nbGeo = lathe(prof(R, H), { segments: 40 });
  for (const [x, z, s] of [[-2.35, -1.5, 0.95], [2.5, -1.9, 1.0], [-1.15, -3.1, 1.0], [1.2, -3.3, 0.95], [0.0, -4.4, 1.0]]) {
    const m = new THREE.Mesh(nbGeo, nbMat);
    m.position.set(x, -0.1 + (rnd() - 0.5) * 0.3, z);
    m.scale.setScalar(s);
    nb.add(m);
  }
  nb.traverse((o) => (o.userData.decor = true));
  stage.add(nb);

  const beams = sunbeams([-2, 9, 4], [0, 1, 0], { count: 3, radius: 0.8, spread: 1.0, opacity: 0.07 });
  stage.add(beams);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  return (s) => {
    const T = s.T;
    shimmer(beams, T, 1);
    let n = 0;
    for (const c of seeds) {
      const a = c.a + T * c.sp;
      const y = c.y + Math.sin(a) * 0.25;
      const capped = Math.abs(y) > H - 0.9 ? Math.sqrt(Math.max(0, 1 - ((Math.abs(y) - (H - 0.9)) / 0.95) ** 2)) : 1;
      const r = c.r * capped;
      const d = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(d) < open / 2 + 0.05) continue;
      v.set(Math.sin(a) * r, y, Math.cos(a) * r);
      e.set(c.tw + T * 0.1, a + Math.PI / 2, Math.sin(T * 0.3 + c.tw) * 0.3);
      q.setFromEuler(e);
      m4.compose(v, q, sc);
      chl.setMatrixAt(n++, m4);
    }
    chl.count = n;
    chl.instanceMatrix.needsUpdate = true;
  };
}

// ------------------------------------------------------------------ the chloroplast

function buildChloroplast(k) {
  const stage = k.stage('chloroplast');
  const rnd = seeded(17);
  const RX = 3.3, RY = 1.25, RZ = 2.05;
  const hole = (th, ph) => th < Math.PI * 0.6 && (ph < 1.25 || ph > Math.PI * 2 - 1.25);
  const env = new THREE.Group();
  const outer = new THREE.Mesh(shellWithWindow(RX, RY, RZ, hole), mat({ color: '#93b872', rough: 0.35, clearcoat: 0.5, sheen: 0.25, sheenColor: '#c8e8a0', rim: 0.35, rimColor: '#d0f0b0', opacity: 0.45, side: THREE.DoubleSide }));
  const inner = new THREE.Mesh(shellWithWindow(RX * 0.955, RY * 0.93, RZ * 0.955, hole), mat({ color: '#a9bd7c', rough: 0.5, sheen: 0.25, sheenColor: '#d8ecb0', rim: 0.22, rimColor: '#e0f8c0', opacity: 0.8, side: THREE.DoubleSide }));
  env.add(outer, inner);
  stage.add(env);
  k.part('envelope', env, { anchor: [-2.75, 0.7, 0.8] });

  const stroma = new THREE.Mesh(shellWithWindow(RX * 0.93, RY * 0.9, RZ * 0.93, (th, ph) => hole(th, ph) || th < Math.PI * 0.52), mat({ color: '#7d9358', rough: 0.85, sheen: 0.2, rim: 0.05, opacity: 0.6, side: THREE.BackSide }));
  stage.add(stroma);
  k.part('stroma', stroma, { anchor: [1.9, -0.7, -0.6] });
  const dots = new GlowPoints(160, { size: 0.025 });
  dots.begin();
  const dc = C('#e8f0b0');
  for (let i = 0; i < 160; i++) {
    const a = rnd() * Math.PI * 2, b = Math.acos(rnd() * 2 - 1), r = Math.cbrt(rnd()) * 0.85;
    dots.push(Math.sin(b) * Math.cos(a) * RX * r, Math.cos(b) * RY * r * 0.9, Math.sin(b) * Math.sin(a) * RZ * r, 0.02 + rnd() * 0.02, dc, 0.18);
  }
  dots.done();
  stage.add(dots);

  const discGeo = disc(0.36, 0.075, { segments: 30, rim: 0.5 });
  const thyMat = mat({ color: '#2a6626', rough: 0.42, clearcoat: 0, clearcoatRough: 0.3, sheen: 0.25, sheenColor: '#5fb040', rim: 0.28, rimColor: '#7fd050', emissive: '#041204' });
  const stacks = [];
  const spots = [[-2.1, 0.1, -0.5], [-1.2, -0.2, 0.7], [-0.8, 0.15, -1.0], [0.1, -0.25, 0.1], [0.5, 0.1, -1.15], [1.1, -0.05, 0.9], [1.7, -0.3, -0.4], [2.35, 0, 0.35], [-1.95, -0.35, 0.65], [0.15, -0.1, 1.25]];
  const mats = [];
  for (const [x, y, z] of spots) {
    const n = 6 + ((rnd() * 5) | 0);
    const r = 0.85 + rnd() * 0.3;
    const stack = { x, z, y0: y - (n * 0.09) / 2, n, r };
    stacks.push(stack);
    for (let i = 0; i < n; i++) mats.push(trs([x + (rnd() - 0.5) * 0.02, stack.y0 + i * 0.09, z + (rnd() - 0.5) * 0.02], [(rnd() - 0.5) * 0.06, rnd() * 6, (rnd() - 0.5) * 0.06], [r, 1, r]));
  }
  const granum = instanced(discGeo, thyMat, mats);
  stage.add(granum);
  k.part('granum', granum, { anchor: [0.1, 0.2, 0.1] });

  const lamella = new THREE.Group();
  const lamMat = mat({ color: '#3f7c34', rough: 0.4, clearcoat: 0.2, sheen: 0.2, rim: 0.2 });
  for (let i = 0; i < stacks.length; i++) {
    for (let j = i + 1; j < stacks.length; j++) {
      const a = stacks[i], b = stacks[j];
      if (Math.hypot(a.x - b.x, a.z - b.z) > 1.5) continue;
      for (let m = 0; m < 2; m++) {
        const ya = a.y0 + ((rnd() * a.n) | 0) * 0.09, yb = b.y0 + ((rnd() * b.n) | 0) * 0.09;
        const mid = [(a.x + b.x) / 2 + (rnd() - 0.5) * 0.2, (ya + yb) / 2 + (rnd() - 0.5) * 0.1, (a.z + b.z) / 2 + (rnd() - 0.5) * 0.2];
        const g = tube([[a.x, ya, a.z], mid, [b.x, yb, b.z]], 0.022, { segments: 20, radial: 8 });
        g.scale(1, 0.6, 1);
        lamella.add(new THREE.Mesh(g, lamMat));
      }
    }
  }
  stage.add(lamella);
  k.part('lamella', lamella);

  const starch = new THREE.Group();
  const stMat = mat({ color: '#d9d2bf', rough: 0.75, sheen: 0.2, rim: 0.12 });
  for (const [x, y, z, s] of [[-0.55, -0.55, -0.35, 1], [1.4, -0.6, 0.0, 0.8]]) {
    const m = new THREE.Mesh(blob(0.42 * s, 0.24 * s, 0.3 * s, { detail: 18, amp: 0.02, freq: 4 }), stMat);
    m.position.set(x, y, z);
    starch.add(m);
  }
  stage.add(starch);
  k.part('starch', starch);
  const globuli = new THREE.Group();
  const glMat = mat({ color: '#d4b04f', rough: 0.3, clearcoat: 0.6, rim: 0.2 });
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(blob(0.07, 0.07, 0.07, { detail: 8 }), glMat);
    m.position.set((rnd() - 0.5) * 4.5, -0.5 + rnd() * 0.5, (rnd() - 0.5) * 2.2);
    globuli.add(m);
  }
  globuli.traverse((o) => (o.userData.decor = true));
  stage.add(globuli);

  const beams = sunbeams([-3, 9, 4], [0, 0, 0], { count: 3, radius: 0.9, spread: 1.4, opacity: 0.06 });
  stage.add(beams);
  return (s) => {
    shimmer(beams, s.T, 1);
    stage.rotation.y = 0.1 * Math.sin(s.T * 0.12);
  };
}

// ------------------------------------------------------------------ the thylakoid membrane

const PS2 = new THREE.Vector3(-3.4, 0, 0);
const B6F = new THREE.Vector3(-0.8, 0, 0);
const PS1 = new THREE.Vector3(1.7, 0, 0);
const FNR = new THREE.Vector3(2.75, 0.98, 0.25);
const ATPS = new THREE.Vector3(4.4, 0, 0);
const HEAD = 0.2; // half the bilayer's thickness, to the heads' centres
const LUMEN = 2.5; // the lumen's width (to the other membrane of the disc)
/** The membrane's gentle undulation. */
const wave = (x, z) => 0.06 * Math.sin(x * 0.55 + 0.3) * Math.cos(z * 0.45);
const bilayer = (y0, x0, x1, z0, z1, keepOut, rnd, o = {}) => makeBilayer(y0, x0, x1, z0, z1, keepOut, rnd, { head: HEAD, wave, ...o });
const tailSheet = (y0, x0, x1, z0, z1, dim = 1) => makeTailSheet(y0, x0, x1, z0, z1, { dim, head: HEAD, wave });

function buildMembrane(k) {
  const stage = k.stage('membrane');
  const rnd = seeded(23);
  const X0 = -6.4, X1 = 6.4, Z0 = -2.8, Z1 = 2.6;
  const keepOut = [[PS2.x, 0, 1.05], [PS2.x - 1.45, 0.2, 0.4], [PS2.x - 0.5, -1.15, 0.4], [PS2.x - 0.45, 1.2, 0.4], [PS2.x + 0.7, 1.15, 0.4], [B6F.x, 0, 0.75], [PS1.x, 0, 0.95], [PS1.x + 0.2, -0.95, 0.5], [ATPS.x, 0, 0.55], [ATPS.x + 0.55, 0.1, 0.3]];

  // This membrane (stroma above, lumen below) and the far side of the disc below the lumen.
  const membrane = new THREE.Group();
  membrane.add(bilayer(0, X0, X1, Z0, Z1, keepOut, rnd), tailSheet(0, X0, X1, Z0, Z1));
  stage.add(membrane);
  k.part('membrane', membrane, { anchor: [-5.6, HEAD, 2.2] });
  const far = new THREE.Group();
  far.add(bilayer(-LUMEN, X0, X1, Z0, Z1, [], rnd, { heads: 'top', dim: 0.85 }), tailSheet(-LUMEN, X0, X1, Z0, Z1, 0.85));
  far.traverse((o) => (o.userData.decor = true));
  stage.add(far);
  // The lumen between them: a marker for its name.
  const lumenPin = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, LUMEN - HEAD * 2.6, Z1 - Z0), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  lumenPin.position.set(0, -LUMEN / 2, (Z0 + Z1) / 2);
  stage.add(lumenPin);
  k.part('lumen', lumenPin, { anchor: [-5.4, -1.25, 1.6] });

  // The proteins, set in the membrane.
  const lhc = new THREE.Group();
  for (const [dx, dz] of [[-1.45, 0.2], [-0.5, -1.15], [-0.45, 1.2], [0.7, 1.15]]) {
    const lobes = [0, 1, 2].map((i) => {
      const a = (i / 3) * Math.PI * 2 + dx;
      return [Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.2, 0.2, 0.36, 0.2];
    });
    const m = protein(lobes, '#6fa860', { seed: Math.round((dx + 3) * 10 + dz * 7), lump: 0.06, grain: 0.02 });
    m.position.set(PS2.x + dx, wave(PS2.x + dx, dz), dz);
    lhc.add(m);
  }
  stage.add(lhc);
  k.part('lhc', lhc, { anchor: [PS2.x - 1.45, 0.42, 0.2] });

  const psii = protein([
    [-0.5, 0.0, 0, 0.62, 0.6, 0.55], [0.5, 0.0, 0.05, 0.6, 0.58, 0.52],
    [-0.42, 0.6, 0.12, 0.36, 0.24, 0.32], [0.4, 0.58, -0.08, 0.34, 0.22, 0.3],
    [-0.25, -0.68, 0.22, 0.42, 0.26, 0.36], [0.45, -0.66, -0.12, 0.3, 0.22, 0.28], [0.05, -0.62, -0.38, 0.3, 0.2, 0.28],
  ], '#4f8f5e', { seed: 2 });
  psii.position.copy(PS2);
  stage.add(psii);
  k.part('psii', psii, { anchor: [PS2.x + 0.1, 0.75, 0.1] });
  // The water-splitting cluster (Mn₄CaO₅) on the lumen side.
  const oec = new THREE.Mesh(blob(0.05, 0.05, 0.05, { detail: 8 }), mat({ color: '#c88a40', emissive: '#5a2a06', rough: 0.35 }));
  oec.position.set(PS2.x - 0.15, -0.8, 0.5);
  oec.userData.decor = true;
  stage.add(oec);

  const b6f = protein([
    [-0.34, 0.0, 0, 0.38, 0.55, 0.4], [0.34, 0.0, 0, 0.38, 0.55, 0.4],
    [-0.3, -0.64, 0.15, 0.24, 0.18, 0.22], [0.32, -0.62, -0.12, 0.24, 0.18, 0.22], [0, 0.52, 0, 0.3, 0.16, 0.28],
  ], '#b8783a', { seed: 3 });
  b6f.position.copy(B6F);
  stage.add(b6f);
  k.part('cytb6f', b6f, { anchor: [B6F.x, 0.62, 0] });

  const psi = protein([
    [-0.38, 0.02, 0, 0.6, 0.56, 0.6], [0.42, 0.0, 0.1, 0.55, 0.55, 0.56],
    [0.08, 0.64, 0.1, 0.4, 0.22, 0.36], [-0.05, -0.62, 0, 0.34, 0.18, 0.3],
    [0.25, 0, -0.85, 0.3, 0.42, 0.24], [-0.35, 0, -0.85, 0.28, 0.4, 0.22],
  ], '#3f7f96', { seed: 4 });
  psi.position.copy(PS1);
  stage.add(psi);
  k.part('psi', psi, { anchor: [PS1.x, 0.78, 0] });
  const fd = protein([[0, 0, 0, 0.17, 0.15, 0.16]], '#94503c', { seed: 5 });
  fd.position.set(PS1.x + 0.42, 0.95, 0.35);
  const fnr = protein([[0, 0, 0, 0.34, 0.27, 0.3], [0.3, 0.14, -0.12, 0.2, 0.18, 0.18]], '#a8894a', { seed: 6 });
  fnr.position.copy(FNR);
  const pc = protein([[0, 0, 0, 0.17, 0.14, 0.15]], '#3d5fa6', { seed: 7 });
  for (const m of [fd, fnr, pc]) {
    m.userData.decor = true;
    stage.add(m);
  }

  // ATP synthase: the c-ring turbine in the membrane, the stalks, the α₃β₃ head.
  const { group: atps, rotor } = atpSynthase(ATPS);
  stage.add(atps);
  k.part('atp_synthase', atps, { anchor: [ATPS.x + 0.2, 1.75, 0.2] });

  const glow = new GlowPoints(1200, { size: 0.08 });
  const swarm = new MoleculeSwarm(900, { scale: 0.045 });
  const pq = new MoleculeSwarm(60, { scale: 0.05 });
  stage.add(glow, swarm, pq);

  // The electron path: PSII → plastoquinone → b6f → plastocyanin → PSI → Fd → FNR.
  const ePath = curve([
    [PS2.x + 0.05, -0.15, 0.3], [PS2.x + 0.35, 0.05, 0.45], [PS2.x + 1.3, 0.0, 0.7], [B6F.x - 0.35, 0.02, 0.4], [B6F.x, -0.25, 0.3],
    [B6F.x + 0.1, -0.75, 0.35], [0.4, -0.95, 0.55], [PS1.x - 0.35, -0.8, 0.35], [PS1.x, -0.25, 0.25], [PS1.x + 0.15, 0.3, 0.3], [PS1.x + 0.42, 0.95, 0.35], [FNR.x - 0.2, FNR.y, FNR.z + 0.1],
  ]);
  const markerAt = { electron: new THREE.Vector3(), hion: new THREE.Vector3(), water: new THREE.Vector3(), oxygen: new THREE.Vector3(), nadph: new THREE.Vector3(), atp: new THREE.Vector3() };
  for (const id of Object.keys(markerAt)) k.marker(id, stage, (out) => (markerAt[id].lengthSq() ? out.copy(markerAt[id]) : null), 0.14);
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), w = new THREE.Vector3(), a = new THREE.Vector3();
  const sunDir = new THREE.Vector3(0.45, -1, 0.3).normalize();
  const lumenH = Array.from({ length: 80 }, () => ({ x: X0 + 0.5 + rnd() * (X1 - X0 - 1), y: -HEAD - 0.35 - rnd() * (LUMEN - HEAD * 2 - 0.7), z: Z0 + 0.4 + rnd() * (Z1 - Z0 - 0.8), ph: rnd() * 10 }));

  return (s) => {
    const T = s.T;
    for (const key in markerAt) markerAt[key].set(0, 0, 0);
    glow.begin();
    swarm.begin();
    pq.begin();
    const light = s.p('light'), water = s.p('water'), trans = s.p('transport');
    const later = s.is('transport', 'atp');
    // Photons fall on the antenna and PSII (and on PSI from the transport step).
    const targets = [[PS2, 6, 0], [PS2.clone().add({ x: -1.45, y: 0, z: 0.2 }), 5, 1.3], [PS2.clone().add({ x: -0.45, y: 0, z: 1.2 }), 4, 0.7]];
    if (later) targets.push([PS1, 6, 2.1]);
    let flash1 = 0, flash2 = 0;
    for (const [tg, n, off] of targets) {
      for (let i = 0; i < n; i++) {
        const per = 2.4, ph = fract((T + off + i * (per / n)) / per);
        w.copy(tg).add({ x: Math.sin(i * 2.1) * 0.4, y: 0.5, z: Math.cos(i * 1.7) * 0.4 });
        a.copy(w).addScaledVector(sunDir, -6);
        streak(glow, a, w, ph / 0.55, { size: 0.13, color: COL.photon, length: 0.1 });
        const hit = ph > 0.55 ? Math.max(0, 1 - (ph - 0.55) / 0.3) : 0;
        if (tg === PS1) flash2 = Math.max(flash2, hit);
        else flash1 = Math.max(flash1, hit);
        if (hit > 0.6) glow.push(w.x, w.y - 0.1, w.z, 0.5 * hit, COL.photon, 0.35 * hit);
      }
    }
    glowProtein(psii, 0.05 * flash1, 0.2 * flash1, 0.05 * flash1);
    for (const m of lhc.children) glowProtein(m, 0.05 * flash1, 0.18 * flash1, 0.04 * flash1);
    glowProtein(psi, 0.02 * flash2, 0.14 * flash2, 0.2 * flash2);

    // Excited electrons leave PSII (light step: just out of it; later along the whole chain).
    const nE = 18;
    for (let i = 0; i < nE; i++) {
      const ph = fract(i / nE + T * 0.08);
      const reach = s.is('light') ? 0.16 + 0.1 * light : 1;
      ePath.getPointAt(ph * reach, v);
      const al = Math.min(1, ph * 10, (1 - ph) * 10) * (s.is('light') ? smooth(s.t / 2) : 1);
      glow.push(v.x, v.y, v.z, 0.09, COL.electron, al);
      glow.push(v.x, v.y, v.z, 0.3, COL.electron, al * 0.22);
      if (i === 3) markerAt.electron.copy(v);
    }
    // Plastoquinone shuttles in the membrane.
    for (let i = 0; i < 5; i++) {
      const ph = fract(i / 5 + T * 0.08);
      ePath.getPointAt(0.04 + ph * 0.3, v);
      pq.put([['O', 0, 0, 0], ['C', 0.9, 0.3, 0], ['C', 1.8, 0, 0], ['O', 2.7, 0.3, 0], ['C', -0.9, -0.3, 0], ['C', -1.8, 0, 0]], v, tumble(i, T, 0.8, q), later || s.is('light') ? 1 : 0);
    }
    // Plastocyanin swings between b6f and PSI under the membrane.
    const pcu = 0.5 + 0.5 * Math.sin(T * 1.1);
    pc.position.set(lerp(B6F.x + 0.25, PS1.x - 0.35, pcu), -1.0, 0.5);

    // Water splitting under PSII: H₂O in, O₂ out, H⁺ left in the lumen, electrons up.
    const showWater = s.is('water') || later;
    if (showWater) {
      const per = 3.2;
      for (let j = 0; j < 3; j++) {
        const ph = fract(T / per + j / 3);
        const site = oec.position.clone().add({ x: (j - 1) * 0.45, y: -0.08, z: 0.05 });
        if (ph < 0.45) {
          const u = smooth(ph / 0.45);
          for (const sgn of [-1, 1]) {
            w.set(site.x + sgn * 0.8 * (1 - u), site.y - 0.85 * (1 - u), site.z + 0.5 * (1 - u));
            swarm.put('H2O', w, tumble(j * 2 + sgn, T, 0.7, q), 1.3);
            if (j === 1 && sgn === 1) markerAt.water.copy(w);
          }
        } else {
          const u = (ph - 0.45) / 0.55;
          w.set(site.x + 0.3 * u, site.y - 0.2 - 1.0 * u, site.z + 0.9 * u);
          swarm.put('O2', w, tumble(j + 7, T, 0.5, q), 1.3 * (1 - smooth((u - 0.85) / 0.15)));
          if (j === 0) markerAt.oxygen.copy(w);
          for (let h = 0; h < 4; h++) {
            const ang = (h / 4) * Math.PI * 2 + j;
            v.set(site.x + Math.cos(ang) * 1.0 * u, site.y - 0.15 - 0.5 * u * Math.abs(Math.sin(ang)), site.z + Math.sin(ang) * 0.8 * u);
            glow.push(v.x, v.y, v.z, 0.09, COL.hion, 1 - u * 0.5);
            if (j === 2 && h === 1) markerAt.hion.copy(v);
          }
          if (u < 0.35) glow.push(site.x, site.y + u * 1.6, site.z, 0.1, COL.electron, 1 - u / 0.35);
          if (u < 0.15) glow.push(site.x, site.y, site.z, 0.4 * (1 - u / 0.15), COL.spark, 0.7);
        }
      }
    }
    // H⁺ pumped through b6f into the lumen, and crowding there.
    const crowd = s.is('water') ? 0.25 + 0.25 * water : s.is('transport') ? 0.5 + 0.5 * trans : s.is('atp') ? 1 : 0;
    if (later) {
      for (let i = 0; i < 6; i++) {
        const ph = fract(i / 6 + T * 0.35);
        glow.push(B6F.x + 0.3 * Math.sin(i), lerp(1.3, -1.1, ph), 0.45 + 0.2 * Math.cos(i), 0.09, COL.hion, Math.min(1, ph * 6, (1 - ph) * 4));
      }
    }
    const nH = Math.round(lumenH.length * crowd);
    for (let i = 0; i < nH; i++) {
      const h = lumenH[i];
      glow.push(h.x + 0.15 * Math.sin(T * 0.7 + h.ph), h.y + 0.1 * Math.sin(T * 0.9 + h.ph * 2), h.z + 0.15 * Math.cos(T * 0.6 + h.ph), 0.085, COL.hion, 0.85);
    }
    if (crowd > 0 && !markerAt.hion.lengthSq() && nH > 4) markerAt.hion.set(lumenH[2].x, lumenH[2].y, lumenH[2].z);
    // NADP⁺ + H⁺ + electrons → NADPH at FNR, which drifts off into the stroma.
    if (later) {
      for (let j = 0; j < 3; j++) {
        const ph = fract(T / 3.5 + j / 3);
        if (ph < 0.4) {
          const u = smooth(ph / 0.4);
          w.set(FNR.x + 1.6 * (1 - u), FNR.y + 0.55 + 0.6 * (1 - u), FNR.z + 0.55);
          swarm.put('NADP', w, tumble(j + 20, T, 0.4, q), 1);
        } else {
          const u = (ph - 0.4) / 0.6;
          w.set(FNR.x - 0.2 - 1.8 * u, FNR.y + 0.55 + 1.3 * u, FNR.z + 0.55 + 0.5 * u);
          swarm.put('NADPH', w, tumble(j + 20, T, 0.4, q), 1 - smooth((u - 0.8) / 0.2));
          if (j === 0) markerAt.nadph.copy(w);
          if (u < 0.12) glow.push(FNR.x, FNR.y + 0.45, FNR.z + 0.45, 0.45 * (1 - u / 0.12), COL.spark, 0.6);
        }
      }
    }
    // ATP synthase: H⁺ flow up through the ring, which turns; ATP leaves the head.
    const spin = s.is('atp') ? 1 : s.is('transport') ? 0.35 : 0.08;
    rotor.rotation.y = T * 2.2 * spin;
    if (later) {
      const nIn = s.is('atp') ? 12 : 4;
      for (let i = 0; i < nIn; i++) {
        const ph = fract(i / nIn + T * 0.32);
        const ang = ph * Math.PI * 1.2 + i;
        const y = lerp(-1.6, 0.5, ph);
        const r = ph < 0.3 ? 0.9 * (1 - ph / 0.3) + 0.4 : 0.4;
        glow.push(ATPS.x + Math.cos(ang) * r, y, ATPS.z + Math.sin(ang) * r, 0.09, COL.hion, Math.min(1, ph * 5, (1 - ph) * 5));
      }
      if (s.is('atp')) {
        for (let j = 0; j < 3; j++) {
          const ph = fract(T / 2.8 + j / 3);
          const ang = (j / 3) * Math.PI * 2 + 0.4;
          if (ph < 0.45) {
            const u = smooth(ph / 0.45);
            w.set(ATPS.x + Math.cos(ang) * (1.7 - 1.05 * u), 1.55 + 0.5 * (1 - u), ATPS.z + Math.sin(ang) * (1.7 - 1.05 * u));
            swarm.put('ADP', w, tumble(j + 30, T, 0.5, q), 1);
            v.copy(w).add({ x: 0.3 * (1 - u), y: -0.4 * (1 - u) - 0.12, z: 0.2 });
            swarm.put('Pi', v, tumble(j + 40, T, 0.5, q), 1);
          } else {
            const u = (ph - 0.45) / 0.55;
            w.set(ATPS.x + Math.cos(ang) * (0.65 + 1.7 * u), 1.55 + 1.0 * u, ATPS.z + Math.sin(ang) * (0.65 + 1.7 * u) + 0.2);
            swarm.put('ATP', w, tumble(j + 30, T, 0.5, q), 1 - smooth((u - 0.85) / 0.15));
            if (j === 0) markerAt.atp.copy(w);
            if (u < 0.1) glow.push(ATPS.x + Math.cos(ang) * 0.65, 1.6, ATPS.z + Math.sin(ang) * 0.65, 0.45 * (1 - u / 0.1), COL.spark, 0.6);
          }
        }
      }
    }
    glow.done();
    swarm.end();
    pq.end();
  };
}

// ------------------------------------------------------------------ the stroma: the Calvin cycle

function buildStroma(k) {
  const stage = k.stage('stroma');
  const rnd = seeded(29);
  // RuBisCO: eight large and eight small subunits in a barrel.
  const large = [], small = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    for (const y of [-0.3, 0.3]) large.push([Math.cos(a + (y > 0 ? 0.35 : 0)) * 0.42, y, Math.sin(a + (y > 0 ? 0.35 : 0)) * 0.42, 0.36, 0.31, 0.36]);
    for (const y of [-0.66, 0.66]) small.push([Math.cos(a + 0.6) * 0.36, y, Math.sin(a + 0.6) * 0.36, 0.2, 0.15, 0.2]);
  }
  const rub = new THREE.Group();
  rub.add(protein(large, '#4f8a76', { seed: 9, lump: 0.09 }), protein(small, '#b39a52', { seed: 10, lump: 0.09 }));
  const R = 2.5;
  const ringQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, 0, 0.08));
  const ringPoint = (a, out, r = R) => out.set(Math.cos(a) * r, 0, Math.sin(a) * r).applyQuaternion(ringQ);
  const fixA = -Math.PI * 0.18;
  ringPoint(fixA, rub.position);
  rub.scale.setScalar(1.15);
  stage.add(rub);
  k.part('rubisco', rub, { anchor: () => rub.position.clone().add({ x: 0, y: 0.85, z: 0 }) });

  const ringGeo = tube(Array.from({ length: 65 }, (_, i) => ringPoint((i / 64) * Math.PI * 2, new THREE.Vector3())), 0.016, { segments: 128, radial: 6, closed: true });
  const ring = new THREE.Mesh(ringGeo, glowMat(0x9fd3a8, 0.14));
  ring.userData.decor = true;
  stage.add(ring);

  // Thylakoids in the distance (where ATP and NADPH come from), and other enzymes.
  const far = new THREE.Group();
  const thyMat = mat({ color: '#2a6626', rough: 0.42, clearcoat: 0, sheen: 0.25, sheenColor: '#5fb040', rim: 0.25, rimColor: '#7fd050', emissive: '#041204' });
  const dg = disc(1.3, 0.26, { segments: 40 });
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(dg, thyMat);
    m.position.set(-6.8, -1.4 + i * 0.32, -4.5);
    m.rotation.set(0.05 * (rnd() - 0.5), rnd() * 3, 0.05 * (rnd() - 0.5));
    far.add(m);
  }
  const farColors = ['#6f8f6a', '#9a8a62', '#62809a', '#8a7a9a'];
  for (let i = 0; i < 16; i++) {
    const r = 0.25 + rnd() * 0.25;
    const p = protein([[0, 0, 0, r, r * (0.8 + rnd() * 0.3), r], [r * 0.7, r * 0.3, 0, r * 0.6, r * 0.55, r * 0.6]], farColors[i % 4], { seed: 40 + i, detail: 14 });
    p.position.set((rnd() - 0.5) * 16, (rnd() - 0.5) * 7, -2.5 - rnd() * 6);
    p.rotation.set(rnd() * 6, rnd() * 6, 0);
    far.add(p);
  }
  far.traverse((o) => (o.userData.decor = true));
  stage.add(far);

  const swarm = new MoleculeSwarm(1400, { scale: 0.052 });
  const glow = new GlowPoints(200, { size: 0.08 });
  stage.add(swarm, glow);
  const markerAt = { co2: new THREE.Vector3(), rubp: new THREE.Vector3(), atp: new THREE.Vector3(), nadph: new THREE.Vector3(), g3p: new THREE.Vector3(), glucose: new THREE.Vector3() };
  for (const id of Object.keys(markerAt)) k.marker(id, stage, (out) => (markerAt[id].lengthSq() ? out.copy(markerAt[id]) : null), 0.16);
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), w = new THREE.Vector3();
  const OUT = new THREE.Vector3(3.9, -0.6, 0.9);
  const LEFT = new THREE.Vector3(-5.6, 0.2, -3.0);
  const SLOTS = 12, PERIOD = 18;
  const zones = { fix: 0, atp1: 0.22, nadph: 0.4, exit: 0.55, regen: 0.7 };
  return (s) => {
    const T = s.T;
    for (const key in markerAt) markerAt[key].set(0, 0, 0);
    swarm.begin();
    glow.begin();
    rub.rotation.y = T * 0.15;
    for (let i = 0; i < SLOTS; i++) {
      const f = fract(i / SLOTS + T / PERIOD);
      const a = fixA + f * Math.PI * 2;
      ringPoint(a, v);
      const flash = (z) => Math.max(0, 1 - Math.abs(f - z) / 0.02);
      const kind = f < 0.01 || f > zones.regen + 0.25 ? 'C5' : 'C3';
      if (i % 6 === 0 && f > zones.exit && f < zones.regen) {
        const u = smooth((f - zones.exit) / (zones.regen - zones.exit));
        w.copy(v).lerp(OUT, u);
        swarm.put('C3', w, tumble(i, T, 0.6, q), 1);
        if (!markerAt.g3p.lengthSq()) markerAt.g3p.copy(w);
        continue;
      }
      if (f > zones.exit + 0.12 && i % 6 === 0) continue;
      if (kind === 'C3') {
        swarm.put('C3', w.copy(v).add({ x: 0, y: 0.24, z: 0 }), tumble(i, T, 0.6, q), 1);
        swarm.put('C3', w.copy(v).add({ x: 0, y: -0.24, z: 0 }), tumble(i + 50, T, 0.6, q), f < zones.exit ? 1 : 0);
      } else {
        swarm.put('C5', v, tumble(i, T, 0.6, q), 1);
        if (!markerAt.rubp.lengthSq() && f > 0.9) markerAt.rubp.copy(v);
      }
      const fl = flash(zones.fix) + flash(zones.atp1) + flash(zones.nadph) + flash(zones.regen + 0.1);
      if (fl > 0) glow.push(v.x, v.y, v.z, 0.6 * fl, COL.spark, 0.5 * fl);
    }
    for (let j = 0; j < 6; j++) {
      const ph = fract(j / 6 + T / (PERIOD / SLOTS) / 6);
      const start = new THREE.Vector3(2.5 + Math.sin(j) * 1.5, 2.6 + Math.cos(j * 2) * 0.6, 1.8 + Math.sin(j * 3));
      w.copy(start).lerp(rub.position, smooth(ph));
      swarm.put('CO2', w, tumble(j + 60, T, 0.8, q), 1.3 * (1 - smooth((ph - 0.9) / 0.1)));
      if (j === 2) markerAt.co2.copy(w);
    }
    for (let j = 0; j < 8; j++) {
      const ph = fract(j / 8 + T / 7);
      const atpIn = j % 2 === 0;
      const za = atpIn ? (j % 4 === 0 ? zones.atp1 : zones.regen + 0.1) : zones.nadph;
      const dest = ringPoint(fixA + za * Math.PI * 2 + 0.25, new THREE.Vector3());
      if (ph < 0.6) {
        w.copy(LEFT).add({ x: Math.sin(j) * 0.8, y: Math.cos(j * 2) * 0.8, z: 0 }).lerp(dest, smooth(ph / 0.6));
        swarm.put(atpIn ? 'ATP' : 'NADPH', w, tumble(j + 70, T, 0.5, q), 0.8);
        if (atpIn && !markerAt.atp.lengthSq() && ph > 0.3) markerAt.atp.copy(w);
        if (!atpIn && !markerAt.nadph.lengthSq() && ph > 0.3) markerAt.nadph.copy(w);
      } else {
        w.copy(dest).lerp(LEFT.clone().add({ x: 0, y: -1.2, z: 0.6 }), smooth((ph - 0.6) / 0.4));
        swarm.put(atpIn ? 'ADP' : 'NADP', w, tumble(j + 70, T, 0.5, q), 0.8 * (1 - smooth((ph - 0.9) / 0.1)));
      }
    }
    const nG = s.is('glucose') ? 1 + Math.floor(smooth(s.u * 1.3) * 3) : s.p('calvin') > 0.6 ? 1 : 0;
    for (let g = 0; g < nG; g++) {
      w.copy(OUT).add({ x: 0.35 + g * 0.8, y: -0.25 + Math.sin(T * 0.5 + g) * 0.12 - g * 0.15, z: 0.4 - g * 0.6 });
      const grow = g === nG - 1 && s.is('glucose') ? smooth(fract(s.u * 1.3 * 3)) : 1;
      swarm.put('glucose', w, tumble(g + 90, T, 0.25, q), 1.2 * Math.max(0.2, grow));
      if (g === 0) markerAt.glucose.copy(w);
    }
    swarm.end();
    glow.done();
  };
}
