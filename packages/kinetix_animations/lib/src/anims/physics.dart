import '../model.dart';
import 'plate_circuit.dart';
import 'plate_generator.dart';
import 'plate_refraction.dart';
import 'plate_waves.dart';

// Current in a circuit, the generator, waves, and refraction.

final circuit = KxAnimation(
  id: 'electric-circuit',
  title: const Tr('Electric current in a circuit', 'परिपथ में विद्युत धारा', 'ಮಂಡಲದಲ್ಲಿ ವಿದ್ಯುತ್ ಪ್ರವಾಹ'),
  subject: 'Physics',
  topic: 'Electricity',
  levels: const ['Class 6', 'Class 7', 'Class 10'],
  keywords: const ['electric current', 'circuit', 'electrons', 'battery', 'cell', 'switch', 'bulb', 'conventional current', 'conductor', 'electricity'],
  seconds: 18,
  thumbT: 0.75,
  steps: const [
    AnimStep(0, Tr('An open circuit', 'खुला परिपथ', 'ತೆರೆದ ಮಂಡಲ'),
        Tr('A cell, a switch, a bulb and wires. With the switch open, the path is broken and no current flows.', 'एक सेल, स्विच, बल्ब और तार। स्विच खुला होने पर रास्ता टूटा है और धारा नहीं बहती।', 'ಒಂದು ಕೋಶ, ಸ್ವಿಚ್, ಬಲ್ಬ್ ಮತ್ತು ತಂತಿಗಳು. ಸ್ವಿಚ್ ತೆರೆದಿದ್ದರೆ ದಾರಿ ಮುರಿದಿದೆ, ಪ್ರವಾಹ ಹರಿಯದು.')),
    AnimStep(0.2, Tr('Switch closed', 'स्विच बंद', 'ಸ್ವಿಚ್ ಮುಚ್ಚಿದೆ'),
        Tr('Closing the switch completes the path: now it is a closed circuit.', 'स्विच बंद करने से रास्ता पूरा होता है: अब यह बंद परिपथ है।', 'ಸ್ವಿಚ್ ಮುಚ್ಚಿದಾಗ ದಾರಿ ಪೂರ್ಣವಾಗುತ್ತದೆ: ಈಗ ಇದು ಮುಚ್ಚಿದ ಮಂಡಲ.')),
    AnimStep(0.36, Tr('Electrons flow', 'इलेक्ट्रॉन बहते हैं', 'ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳ ಹರಿವು'),
        Tr('The cell pushes electrons out of its negative terminal, round the wires, and back into its positive terminal.', 'सेल इलेक्ट्रॉनों को ऋण सिरे से बाहर धकेलता है; वे तारों में घूमकर धन सिरे पर लौटते हैं।', 'ಕೋಶವು ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳನ್ನು ಋಣ ತುದಿಯಿಂದ ಹೊರತಳ್ಳುತ್ತದೆ; ಅವು ತಂತಿಗಳಲ್ಲಿ ಸುತ್ತಿ ಧನ ತುದಿಗೆ ಮರಳುತ್ತವೆ.')),
    AnimStep(0.56, Tr('Conventional current', 'परंपरागत धारा', 'ಸಾಂಪ್ರದಾಯಿಕ ಪ್ರವಾಹ'),
        Tr('By convention, current is shown flowing the other way: from + to −, opposite to the electrons.', 'परंपरा से धारा उलटी दिशा में दिखाई जाती है: + से − की ओर, इलेक्ट्रॉनों के विपरीत।', 'ಸಂಪ್ರದಾಯದಂತೆ ಪ್ರವಾಹವನ್ನು ವಿರುದ್ಧ ದಿಕ್ಕಿನಲ್ಲಿ ತೋರಿಸಲಾಗುತ್ತದೆ: + ನಿಂದ − ಕಡೆಗೆ, ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳಿಗೆ ವಿರುದ್ಧ.')),
    AnimStep(0.78, Tr('Energy in the bulb', 'बल्ब में ऊर्जा', 'ಬಲ್ಬ್‌ನಲ್ಲಿ ಶಕ್ತಿ'),
        Tr('In the thin filament the electrical energy becomes heat and light, so the bulb glows.', 'पतले तंतु में विद्युत ऊर्जा ऊष्मा और प्रकाश में बदलती है, इसलिए बल्ब चमकता है।', 'ತೆಳು ತಂತುವಿನಲ್ಲಿ ವಿದ್ಯುತ್ ಶಕ್ತಿ ಶಾಖ ಮತ್ತು ಬೆಳಕಾಗುತ್ತದೆ; ಬಲ್ಬ್ ಬೆಳಗುತ್ತದೆ.')),
  ],
  painter: CircuitPlate.new,
);

final generator = KxAnimation(
  id: 'em-induction-generator',
  title: const Tr('Electromagnetic induction: the generator', 'विद्युत चुंबकीय प्रेरण: जनित्र', 'ವಿದ್ಯುತ್ಕಾಂತೀಯ ಪ್ರೇರಣೆ: ಜನಕ'),
  subject: 'Physics',
  topic: 'Magnetism',
  levels: const ['Class 10', 'Class 12'],
  keywords: const ['electromagnetic induction', 'generator', 'dynamo', 'faraday', 'coil', 'magnetic field', 'flux', 'alternating current', 'ac', 'slip rings', 'magnetic effects of current'],
  seconds: 20,
  thumbT: 0.5,
  steps: const [
    AnimStep(0, Tr('Coil in a magnetic field', 'चुंबकीय क्षेत्र में कुंडली', 'ಕಾಂತಕ್ಷೇತ್ರದಲ್ಲಿ ಸುರುಳಿ'),
        Tr('A coil of wire sits between the north and south poles of a magnet, where field lines run from N to S.', 'तार की एक कुंडली चुंबक के उत्तर और दक्षिण ध्रुवों के बीच है, जहाँ क्षेत्र रेखाएँ N से S की ओर जाती हैं।', 'ತಂತಿಯ ಸುರುಳಿ ಕಾಂತದ ಉತ್ತರ ಮತ್ತು ದಕ್ಷಿಣ ಧ್ರುವಗಳ ನಡುವೆ ಇದೆ; ಅಲ್ಲಿ ಕ್ಷೇತ್ರ ರೇಖೆಗಳು N ನಿಂದ S ಕಡೆಗೆ ಸಾಗುತ್ತವೆ.')),
    AnimStep(0.2, Tr('Turning the coil', 'कुंडली घुमाना', 'ಸುರುಳಿ ತಿರುಗಿಸುವುದು'),
        Tr('As the coil turns, the amount of magnetic field passing through it keeps changing.', 'कुंडली घूमती है तो उससे गुज़रने वाले चुंबकीय क्षेत्र की मात्रा बदलती रहती है।', 'ಸುರುಳಿ ತಿರುಗಿದಂತೆ ಅದರ ಮೂಲಕ ಹಾದುಹೋಗುವ ಕಾಂತಕ್ಷೇತ್ರದ ಪ್ರಮಾಣ ಬದಲಾಗುತ್ತಲೇ ಇರುತ್ತದೆ.')),
    AnimStep(0.42, Tr('Induced current', 'प्रेरित धारा', 'ಪ್ರೇರಿತ ಪ್ರವಾಹ'),
        Tr('A changing field induces a current in the coil. The meter’s needle moves and the bulb lights.', 'बदलता क्षेत्र कुंडली में धारा प्रेरित करता है। मीटर की सुई हिलती है और बल्ब जलता है।', 'ಬದಲಾಗುವ ಕ್ಷೇತ್ರ ಸುರುಳಿಯಲ್ಲಿ ಪ್ರವಾಹ ಪ್ರೇರಿಸುತ್ತದೆ. ಮೀಟರ್ ಮುಳ್ಳು ಚಲಿಸುತ್ತದೆ, ಬಲ್ಬ್ ಬೆಳಗುತ್ತದೆ.')),
    AnimStep(0.66, Tr('Alternating current', 'प्रत्यावर्ती धारा', 'ಪರ್ಯಾಯ ಪ್ರವಾಹ'),
        Tr('Every half turn the current reverses: this is alternating current (AC), a sine wave.', 'हर आधे चक्कर में धारा उलट जाती है: यह प्रत्यावर्ती धारा (AC) है, एक ज्या तरंग।', 'ಪ್ರತಿ ಅರ್ಧ ಸುತ್ತಿಗೆ ಪ್ರವಾಹ ದಿಕ್ಕು ಬದಲಿಸುತ್ತದೆ: ಇದು ಪರ್ಯಾಯ ಪ್ರವಾಹ (AC), ಒಂದು ಸೈನ್ ಅಲೆ.')),
  ],
  painter: GeneratorPlate.new,
);

final waves = KxAnimation(
  id: 'waves',
  title: const Tr('Transverse and longitudinal waves', 'अनुप्रस्थ और अनुदैर्ध्य तरंगें', 'ಅಡ್ಡ ಮತ್ತು ಉದ್ದ ಅಲೆಗಳು'),
  subject: 'Physics',
  topic: 'Waves, sound and light',
  levels: const ['Class 8', 'Class 9', 'Class 11'],
  keywords: const ['waves', 'transverse', 'longitudinal', 'wavelength', 'amplitude', 'crest', 'trough', 'compression', 'rarefaction', 'sound', 'frequency'],
  seconds: 16,
  thumbT: 0.6,
  steps: const [
    AnimStep(0, Tr('Transverse wave', 'अनुप्रस्थ तरंग', 'ಅಡ್ಡ ಅಲೆ'),
        Tr('The particles move up and down while the wave travels along: like a wave on a rope, or light.', 'कण ऊपर-नीचे चलते हैं जबकि तरंग आगे बढ़ती है: जैसे रस्सी पर तरंग, या प्रकाश।', 'ಕಣಗಳು ಮೇಲೆ-ಕೆಳಗೆ ಚಲಿಸುತ್ತವೆ, ಅಲೆ ಮುಂದೆ ಸಾಗುತ್ತದೆ: ಹಗ್ಗದ ಮೇಲಿನ ಅಲೆ ಅಥವಾ ಬೆಳಕಿನಂತೆ.')),
    AnimStep(0.25, Tr('Crest and trough', 'शृंग और गर्त', 'ಶೃಂಗ ಮತ್ತು ತಗ್ಗು'),
        Tr('High points are crests, low points troughs. The wavelength is the distance from one crest to the next; the amplitude is the height.', 'ऊँचे बिंदु शृंग और नीचे के गर्त हैं। एक शृंग से अगले तक की दूरी तरंगदैर्ध्य है; ऊँचाई आयाम है।', 'ಎತ್ತರದ ಬಿಂದುಗಳು ಶೃಂಗ, ಕೆಳಗಿನವು ತಗ್ಗು. ಒಂದು ಶೃಂಗದಿಂದ ಮುಂದಿನದಕ್ಕೆ ದೂರ ತರಂಗಾಂತರ; ಎತ್ತರ ಕಂಪನಾಂಕ.')),
    AnimStep(0.5, Tr('Longitudinal wave', 'अनुदैर्ध्य तरंग', 'ಉದ್ದ ಅಲೆ'),
        Tr('Here the particles move back and forth along the direction of the wave: like sound in air, or a pushed spring.', 'यहाँ कण तरंग की दिशा में आगे-पीछे चलते हैं: जैसे हवा में ध्वनि, या धकेली गई स्प्रिंग।', 'ಇಲ್ಲಿ ಕಣಗಳು ಅಲೆಯ ದಿಕ್ಕಿನಲ್ಲೇ ಮುಂದೆ-ಹಿಂದೆ ಚಲಿಸುತ್ತವೆ: ಗಾಳಿಯಲ್ಲಿ ಶಬ್ದ ಅಥವಾ ತಳ್ಳಿದ ಸ್ಪ್ರಿಂಗ್‌ನಂತೆ.')),
    AnimStep(0.75, Tr('Compressions', 'संपीडन', 'ಸಂಪೀಡನ'),
        Tr('Crowded regions are compressions and spread-out regions are rarefactions. Each particle only wobbles about its place.', 'घनी जगहें संपीडन और विरल जगहें विरलन हैं। हर कण अपनी जगह के आसपास ही डोलता है।', 'ದಟ್ಟ ಭಾಗಗಳು ಸಂಪೀಡನ, ವಿರಳ ಭಾಗಗಳು ವಿರಳನ. ಪ್ರತಿ ಕಣ ತನ್ನ ಸ್ಥಳದ ಸುತ್ತ ಮಾತ್ರ ಕಂಪಿಸುತ್ತದೆ.')),
  ],
  painter: WavesPlate.new,
);

final refraction = KxAnimation(
  id: 'refraction',
  title: const Tr('Refraction of light', 'प्रकाश का अपवर्तन', 'ಬೆಳಕಿನ ವಕ್ರೀಭವನ'),
  subject: 'Physics',
  topic: 'Waves, sound and light',
  levels: const ['Class 8', 'Class 10', 'Class 12'],
  keywords: const ['refraction', 'light', 'glass slab', 'normal', 'angle of incidence', 'angle of refraction', 'snell', 'refractive index', 'lateral displacement', 'optics'],
  seconds: 18,
  thumbT: 0.85,
  steps: const [
    AnimStep(0, Tr('Light in air', 'हवा में प्रकाश', 'ಗಾಳಿಯಲ್ಲಿ ಬೆಳಕು'),
        Tr('A ray of light travels in a straight line through air towards a glass slab.', 'प्रकाश की किरण हवा में सीधी रेखा में काँच की पट्टी की ओर चलती है।', 'ಬೆಳಕಿನ ಕಿರಣ ಗಾಳಿಯಲ್ಲಿ ನೇರ ರೇಖೆಯಲ್ಲಿ ಗಾಜಿನ ಚಪ್ಪಡಿಯತ್ತ ಸಾಗುತ್ತದೆ.')),
    AnimStep(0.25, Tr('Into glass', 'काँच में प्रवेश', 'ಗಾಜಿನೊಳಗೆ'),
        Tr('Light slows down in glass, so it bends towards the normal: the angle of refraction r is smaller than the angle of incidence i.', 'काँच में प्रकाश धीमा होता है, इसलिए अभिलंब की ओर मुड़ता है: अपवर्तन कोण r आपतन कोण i से छोटा होता है।', 'ಗಾಜಿನಲ್ಲಿ ಬೆಳಕು ನಿಧಾನವಾಗುತ್ತದೆ, ಆದ್ದರಿಂದ ಲಂಬದತ್ತ ಬಾಗುತ್ತದೆ: ವಕ್ರೀಭವನ ಕೋನ r ಪತನ ಕೋನ i ಗಿಂತ ಚಿಕ್ಕದು.')),
    AnimStep(0.5, Tr('Out of glass', 'काँच से बाहर', 'ಗಾಜಿನಿಂದ ಹೊರಗೆ'),
        Tr('Leaving the glass it speeds up and bends away from the normal. It comes out parallel to the incident ray, shifted sideways.', 'काँच से निकलते समय यह तेज़ होकर अभिलंब से दूर मुड़ती है। यह आपतित किरण के समानांतर, कुछ खिसककर निकलती है।', 'ಗಾಜಿನಿಂದ ಹೊರಬರುವಾಗ ವೇಗ ಹೆಚ್ಚಿ ಲಂಬದಿಂದ ದೂರ ಬಾಗುತ್ತದೆ. ಅದು ಪತನ ಕಿರಣಕ್ಕೆ ಸಮಾಂತರವಾಗಿ, ಸ್ವಲ್ಪ ಪಕ್ಕಕ್ಕೆ ಸರಿದು ಹೊರಬರುತ್ತದೆ.')),
    AnimStep(0.75, Tr("Snell's law", 'स्नेल का नियम', 'ಸ್ನೆಲ್ ನಿಯಮ'),
        Tr('sin i ÷ sin r is constant for two media: the refractive index (about 1.5 for glass).', 'दो माध्यमों के लिए sin i ÷ sin r स्थिर रहता है: यही अपवर्तनांक है (काँच के लिए लगभग 1.5)।', 'ಎರಡು ಮಾಧ್ಯಮಗಳಿಗೆ sin i ÷ sin r ಸ್ಥಿರ: ಅದೇ ವಕ್ರೀಭವನ ಸೂಚ್ಯಂಕ (ಗಾಜಿಗೆ ಸುಮಾರು 1.5).')),
  ],
  painter: RefractionPlate.new,
);

