import '../model.dart';
import 'plate_atom.dart';
import 'plate_electrolysis.dart';
import 'plate_states.dart';

// States of matter, atomic structure, and electrolysis.

final statesOfMatter = KxAnimation(
  id: 'states-of-matter',
  title: const Tr('States of matter', 'पदार्थ की अवस्थाएँ', 'ದ್ರವ್ಯದ ಸ್ಥಿತಿಗಳು'),
  subject: 'Chemistry',
  topic: 'Matter',
  levels: const ['Class 6', 'Class 8', 'Class 9'],
  keywords: const ['states of matter', 'solid', 'liquid', 'gas', 'particles', 'melting', 'boiling', 'evaporation', 'heating curve', 'latent heat', 'kinetic theory', 'change of state'],
  seconds: 22,
  thumbT: 0.45,
  steps: const [
    AnimStep(0, Tr('Solid (ice)', 'ठोस (बर्फ़)', 'ಘನ (ಮಂಜುಗಡ್ಡೆ)'),
        Tr('In a solid the particles are packed tightly in fixed places. They only vibrate.', 'ठोस में कण अपनी निश्चित जगहों पर कसकर जमे होते हैं। वे केवल कंपन करते हैं।', 'ಘನದಲ್ಲಿ ಕಣಗಳು ನಿಗದಿತ ಸ್ಥಳಗಳಲ್ಲಿ ಬಿಗಿಯಾಗಿ ಜೋಡಿಸಿರುತ್ತವೆ. ಅವು ಕೇವಲ ಕಂಪಿಸುತ್ತವೆ.')),
    AnimStep(0.2, Tr('Melting', 'पिघलना', 'ಕರಗುವಿಕೆ'),
        Tr('Heat gives the particles energy to break free of their places. The temperature stays at 0 °C until all the ice melts.', 'ऊष्मा कणों को अपनी जगह छोड़ने की ऊर्जा देती है। सारी बर्फ़ पिघलने तक तापमान 0 °C पर रहता है।', 'ಶಾಖ ಕಣಗಳಿಗೆ ತಮ್ಮ ಸ್ಥಳ ಬಿಡುವ ಶಕ್ತಿ ಕೊಡುತ್ತದೆ. ಎಲ್ಲ ಮಂಜು ಕರಗುವವರೆಗೆ ತಾಪ 0 °C ನಲ್ಲೇ ಇರುತ್ತದೆ.')),
    AnimStep(0.36, Tr('Liquid (water)', 'द्रव (पानी)', 'ದ್ರವ (ನೀರು)'),
        Tr('In a liquid the particles are still close but slide past each other, so a liquid flows and takes the shape of its container.', 'द्रव में कण पास-पास रहते हैं पर एक-दूसरे पर फिसलते हैं, इसलिए द्रव बहता है और बर्तन का आकार ले लेता है।', 'ದ್ರವದಲ್ಲಿ ಕಣಗಳು ಹತ್ತಿರವಿದ್ದರೂ ಒಂದರ ಮೇಲೊಂದು ಜಾರುತ್ತವೆ; ದ್ರವ ಹರಿಯುತ್ತದೆ ಮತ್ತು ಪಾತ್ರೆಯ ಆಕಾರ ಪಡೆಯುತ್ತದೆ.')),
    AnimStep(0.56, Tr('Boiling', 'उबलना', 'ಕುದಿಯುವಿಕೆ'),
        Tr('At 100 °C the particles have enough energy to escape completely and become steam.', '100 °C पर कणों के पास पूरी तरह बच निकलने की ऊर्जा होती है और वे भाप बन जाते हैं।', '100 °C ನಲ್ಲಿ ಕಣಗಳಿಗೆ ಸಂಪೂರ್ಣ ತಪ್ಪಿಸಿಕೊಳ್ಳುವ ಶಕ್ತಿ ಬರುತ್ತದೆ; ಅವು ಹಬೆಯಾಗುತ್ತವೆ.')),
    AnimStep(0.72, Tr('Gas (steam)', 'गैस (भाप)', 'ಅನಿಲ (ಹಬೆ)'),
        Tr('In a gas the particles are far apart and move fast in all directions, filling the whole container.', 'गैस में कण दूर-दूर होते हैं और सब दिशाओं में तेज़ी से चलते हुए पूरा बर्तन भर देते हैं।', 'ಅನಿಲದಲ್ಲಿ ಕಣಗಳು ದೂರ ದೂರವಿದ್ದು ಎಲ್ಲ ದಿಕ್ಕುಗಳಲ್ಲಿ ವೇಗವಾಗಿ ಚಲಿಸುತ್ತಾ ಇಡೀ ಪಾತ್ರೆಯನ್ನು ತುಂಬುತ್ತವೆ.')),
  ],
  painter: StatesPlate.new,
);

final atomicStructure = KxAnimation(
  id: 'atomic-structure',
  title: const Tr('Structure of the atom', 'परमाणु की संरचना', 'ಪರಮಾಣುವಿನ ರಚನೆ'),
  subject: 'Chemistry',
  topic: 'Structure of the atom',
  levels: const ['Class 9', 'Class 11'],
  keywords: const ['atom', 'atomic structure', 'electron', 'proton', 'neutron', 'nucleus', 'shells', 'bohr model', 'electronic configuration', 'valence', 'atomic number'],
  seconds: 24,
  thumbT: 0.3,
  steps: const [
    AnimStep(0, Tr('The nucleus', 'नाभिक', 'ನ್ಯೂಕ್ಲಿಯಸ್'),
        Tr('At the centre is a tiny nucleus of protons (positive) and neutrons (no charge). A sodium atom has 11 protons.', 'केंद्र में प्रोटॉन (धनावेशित) और न्यूट्रॉन (अनावेशित) का छोटा नाभिक है। सोडियम परमाणु में 11 प्रोटॉन होते हैं।', 'ಕೇಂದ್ರದಲ್ಲಿ ಪ್ರೋಟಾನ್ (ಧನ) ಮತ್ತು ನ್ಯೂಟ್ರಾನ್ (ಆವೇಶರಹಿತ) ಗಳ ಸಣ್ಣ ನ್ಯೂಕ್ಲಿಯಸ್ ಇದೆ. ಸೋಡಿಯಂ ಪರಮಾಣುವಿನಲ್ಲಿ 11 ಪ್ರೋಟಾನ್‌ಗಳಿವೆ.')),
    AnimStep(0.2, Tr('Electron shells', 'इलेक्ट्रॉन कोश', 'ಇಲೆಕ್ಟ್ರಾನ್ ಕವಚಗಳು'),
        Tr('Electrons (negative) move round the nucleus in shells: K, L, M… An atom has as many electrons as protons.', 'इलेक्ट्रॉन (ऋणावेशित) नाभिक के चारों ओर कोशों में घूमते हैं: K, L, M… परमाणु में जितने प्रोटॉन, उतने ही इलेक्ट्रॉन।', 'ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳು (ಋಣ) ನ್ಯೂಕ್ಲಿಯಸ್ ಸುತ್ತ ಕವಚಗಳಲ್ಲಿ ಸುತ್ತುತ್ತವೆ: K, L, M… ಪ್ರೋಟಾನ್‌ಗಳಷ್ಟೇ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳಿರುತ್ತವೆ.')),
    AnimStep(0.36, Tr('Filling the shells', 'कोशों का भरना', 'ಕವಚಗಳ ಭರ್ತಿ'),
        Tr('The K shell holds 2 electrons, the L shell 8; the outermost shell holds at most 8. Sodium is 2, 8, 1.', 'K कोश में 2 इलेक्ट्रॉन, L में 8 आते हैं; सबसे बाहरी कोश में अधिकतम 8। सोडियम: 2, 8, 1।', 'K ಕವಚದಲ್ಲಿ 2, L ನಲ್ಲಿ 8 ಇಲೆಕ್ಟ್ರಾನ್; ಹೊರಗಿನ ಕವಚದಲ್ಲಿ ಗರಿಷ್ಠ 8. ಸೋಡಿಯಂ: 2, 8, 1.')),
    AnimStep(0.5, Tr('Building atoms', 'परमाणुओं का निर्माण', 'ಪರಮಾಣುಗಳ ರಚನೆ'),
        Tr('From hydrogen to argon, each element has one more proton and one more electron than the one before.', 'हाइड्रोजन से आर्गन तक, हर तत्व में पिछले से एक प्रोटॉन और एक इलेक्ट्रॉन अधिक होता है।', 'ಹೈಡ್ರೋಜನ್‌ನಿಂದ ಆರ್ಗಾನ್‌ವರೆಗೆ ಪ್ರತಿ ಧಾತುವಿನಲ್ಲಿ ಹಿಂದಿನದಕ್ಕಿಂತ ಒಂದು ಪ್ರೋಟಾನ್ ಮತ್ತು ಒಂದು ಇಲೆಕ್ಟ್ರಾನ್ ಹೆಚ್ಚು.')),
    AnimStep(0.86, Tr('Valence electrons', 'संयोजकता इलेक्ट्रॉन', 'ವೇಲೆನ್ಸಿ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳು'),
        Tr('The electrons in the outermost shell decide how an atom reacts. Sodium easily gives away its single outer electron.', 'सबसे बाहरी कोश के इलेक्ट्रॉन तय करते हैं कि परमाणु कैसे अभिक्रिया करेगा। सोडियम अपना एक बाहरी इलेक्ट्रॉन आसानी से दे देता है।', 'ಹೊರಗಿನ ಕವಚದ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳು ಪರಮಾಣು ಹೇಗೆ ಪ್ರತಿಕ್ರಿಯಿಸುತ್ತದೆ ಎಂದು ನಿರ್ಧರಿಸುತ್ತವೆ. ಸೋಡಿಯಂ ತನ್ನ ಒಂದು ಹೊರ ಇಲೆಕ್ಟ್ರಾನ್ ಅನ್ನು ಸುಲಭವಾಗಿ ಬಿಡುತ್ತದೆ.')),
  ],
  painter: AtomPlate.new,
);

final electrolysis = KxAnimation(
  id: 'electrolysis',
  title: const Tr('Electrolysis of water', 'जल का विद्युत अपघटन', 'ನೀರಿನ ವಿದ್ಯುದ್ವಿಭಜನೆ'),
  subject: 'Chemistry',
  topic: 'Chemical reactions',
  levels: const ['Class 8', 'Class 10'],
  keywords: const ['electrolysis', 'water', 'hydrogen', 'oxygen', 'cathode', 'anode', 'electrodes', 'ions', 'decomposition reaction', 'chemical effects of current'],
  seconds: 20,
  thumbT: 0.85,
  steps: const [
    AnimStep(0, Tr('The set-up', 'उपकरण', 'ಸಲಕರಣೆ'),
        Tr('Two electrodes stand in water with a few drops of acid, joined to a battery. Test tubes full of water sit over them.', 'अम्ल की कुछ बूँदें मिले पानी में दो इलेक्ट्रोड हैं, जो बैटरी से जुड़े हैं। उन पर पानी से भरी परखनलियाँ उलटी रखी हैं।', 'ಕೆಲವು ಹನಿ ಆಮ್ಲ ಬೆರೆಸಿದ ನೀರಿನಲ್ಲಿ ಎರಡು ವಿದ್ಯುದ್ವಾರಗಳಿದ್ದು ಬ್ಯಾಟರಿಗೆ ಜೋಡಿಸಲಾಗಿದೆ. ಅವುಗಳ ಮೇಲೆ ನೀರು ತುಂಬಿದ ಪರೀಕ್ಷಾ ನಳಿಕೆಗಳಿವೆ.')),
    AnimStep(0.2, Tr('Ions move', 'आयन चलते हैं', 'ಅಯಾನುಗಳ ಚಲನೆ'),
        Tr('Current flows. Positive hydrogen ions move to the negative electrode (cathode); negative ions move to the positive electrode (anode).', 'धारा बहती है। धनावेशित हाइड्रोजन आयन ऋण इलेक्ट्रोड (कैथोड) की ओर, ऋणावेशित आयन धन इलेक्ट्रोड (ऐनोड) की ओर जाते हैं।', 'ಪ್ರವಾಹ ಹರಿಯುತ್ತದೆ. ಧನ ಹೈಡ್ರೋಜನ್ ಅಯಾನುಗಳು ಋಣ ವಿದ್ಯುದ್ವಾರ (ಕ್ಯಾಥೋಡ್) ಕಡೆಗೆ, ಋಣ ಅಯಾನುಗಳು ಧನ ವಿದ್ಯುದ್ವಾರ (ಆನೋಡ್) ಕಡೆಗೆ ಸಾಗುತ್ತವೆ.')),
    AnimStep(0.4, Tr('Hydrogen', 'हाइड्रोजन', 'ಹೈಡ್ರೋಜನ್'),
        Tr('At the cathode, hydrogen ions gain electrons and bubbles of hydrogen gas rise into the tube.', 'कैथोड पर हाइड्रोजन आयन इलेक्ट्रॉन लेते हैं और हाइड्रोजन गैस के बुलबुले नली में ऊपर उठते हैं।', 'ಕ್ಯಾಥೋಡ್‌ನಲ್ಲಿ ಹೈಡ್ರೋಜನ್ ಅಯಾನುಗಳು ಇಲೆಕ್ಟ್ರಾನ್ ಪಡೆದು ಹೈಡ್ರೋಜನ್ ಅನಿಲದ ಗುಳ್ಳೆಗಳು ನಳಿಕೆಯಲ್ಲಿ ಏರುತ್ತವೆ.')),
    AnimStep(0.6, Tr('Oxygen', 'ऑक्सीजन', 'ಆಮ್ಲಜನಕ'),
        Tr('At the anode, oxygen gas is given off.', 'ऐनोड पर ऑक्सीजन गैस निकलती है।', 'ಆನೋಡ್‌ನಲ್ಲಿ ಆಮ್ಲಜನಕ ಅನಿಲ ಬಿಡುಗಡೆಯಾಗುತ್ತದೆ.')),
    AnimStep(0.8, Tr('Two to one', 'दो और एक', 'ಎರಡು ಮತ್ತು ಒಂದು'),
        Tr('Twice as much hydrogen as oxygen collects: water is H₂O. 2H₂O → 2H₂ + O₂.', 'ऑक्सीजन से दोगुनी हाइड्रोजन जमा होती है: पानी H₂O है। 2H₂O → 2H₂ + O₂।', 'ಆಮ್ಲಜನಕಕ್ಕಿಂತ ಎರಡರಷ್ಟು ಹೈಡ್ರೋಜನ್ ಸಂಗ್ರಹವಾಗುತ್ತದೆ: ನೀರು H₂O. 2H₂O → 2H₂ + O₂.')),
  ],
  painter: ElectrolysisPlate.new,
);
