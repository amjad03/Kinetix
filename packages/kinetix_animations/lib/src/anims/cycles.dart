import '../model.dart';
import 'plate_cycles.dart';
import 'plate_osmosis.dart';

// Diffusion and osmosis, the nitrogen cycle and the carbon cycle.

final osmosis = KxAnimation(
  id: 'osmosis-diffusion',
  title: const Tr('Diffusion and osmosis', 'विसरण और परासरण', 'ವಿಸರಣ ಮತ್ತು ಆಸ್ಮೋಸಿಸ್'),
  subject: 'Biology',
  topic: 'The cell',
  levels: const ['Class 8', 'Class 9', 'Class 11'],
  keywords: const ['osmosis', 'diffusion', 'semi-permeable membrane', 'concentration', 'water', 'solution', 'transport', 'cell membrane', 'turgid'],
  seconds: 18,
  thumbT: 0.8,
  steps: const [
    AnimStep(0, Tr('Diffusion', 'विसरण', 'ವಿಸರಣ'),
        Tr('Particles move on their own from where they are crowded (high concentration) to where they are few (low concentration).', 'कण अपने-आप भीड़ वाली जगह (उच्च सांद्रता) से कम कणों वाली जगह (निम्न सांद्रता) की ओर जाते हैं।', 'ಕಣಗಳು ತಾವಾಗಿಯೇ ದಟ್ಟವಾಗಿರುವ ಕಡೆಯಿಂದ (ಹೆಚ್ಚು ಸಾರತೆ) ಕಡಿಮೆ ಇರುವ ಕಡೆಗೆ (ಕಡಿಮೆ ಸಾರತೆ) ಚಲಿಸುತ್ತವೆ.')),
    AnimStep(0.3, Tr('Evenly spread', 'समान रूप से फैले', 'ಸಮವಾಗಿ ಹರಡಿದೆ'),
        Tr('In the end they are spread evenly. They keep moving, but there is no more overall flow.', 'अंत में वे समान रूप से फैल जाते हैं। वे चलते रहते हैं, पर कुल प्रवाह रुक जाता है।', 'ಕೊನೆಗೆ ಅವು ಸಮವಾಗಿ ಹರಡುತ್ತವೆ. ಚಲನೆ ಮುಂದುವರಿದರೂ ಒಟ್ಟು ಹರಿವು ನಿಲ್ಲುತ್ತದೆ.')),
    AnimStep(0.5, Tr('A membrane', 'एक झिल्ली', 'ಒಂದು ಪೊರೆ'),
        Tr('A semi-permeable membrane lets small water molecules through but not the bigger sugar molecules.', 'अर्धपारगम्य झिल्ली पानी के छोटे अणुओं को जाने देती है, पर शक्कर के बड़े अणुओं को नहीं।', 'ಅರೆಪಾರಕ ಪೊರೆ ನೀರಿನ ಸಣ್ಣ ಅಣುಗಳನ್ನು ಬಿಡುತ್ತದೆ, ಸಕ್ಕರೆಯ ದೊಡ್ಡ ಅಣುಗಳನ್ನು ಬಿಡುವುದಿಲ್ಲ.')),
    AnimStep(0.68, Tr('Osmosis', 'परासरण', 'ಆಸ್ಮೋಸಿಸ್'),
        Tr('Water moves through the membrane from the dilute side into the concentrated sugar solution, so its level rises.', 'पानी झिल्ली से होकर तनु ओर से सांद्र शक्कर के घोल में जाता है, इसलिए उसका स्तर बढ़ता है।', 'ನೀರು ಪೊರೆಯ ಮೂಲಕ ದುರ್ಬಲ ದ್ರಾವಣದಿಂದ ಸಾರವಾದ ಸಕ್ಕರೆ ದ್ರಾವಣಕ್ಕೆ ಹೋಗುತ್ತದೆ; ಅದರ ಮಟ್ಟ ಏರುತ್ತದೆ.')),
  ],
  painter: OsmosisPlate.new,
);

final nitrogenCycle = KxAnimation(
  id: 'nitrogen-cycle',
  title: const Tr('The nitrogen cycle', 'नाइट्रोजन चक्र', 'ಸಾರಜನಕ ಚಕ್ರ'),
  subject: 'Biology',
  topic: 'Natural resources and cycles',
  levels: const ['Class 8', 'Class 9', 'Class 12'],
  keywords: const ['nitrogen cycle', 'nitrogen fixation', 'rhizobium', 'root nodules', 'nitrification', 'denitrification', 'ammonification', 'biogeochemical cycle', 'ecosystem', 'lightning'],
  seconds: 24,
  thumbT: 0.2,
  steps: const [
    AnimStep(0, Tr('Nitrogen in the air', 'हवा में नाइट्रोजन', 'ಗಾಳಿಯಲ್ಲಿ ಸಾರಜನಕ'),
        Tr('Air is 78% nitrogen gas (N₂), but plants and animals cannot use it directly.', 'हवा में 78% नाइट्रोजन गैस (N₂) है, पर पौधे और जंतु इसे सीधे उपयोग नहीं कर सकते।', 'ಗಾಳಿಯಲ್ಲಿ 78% ಸಾರಜನಕ ಅನಿಲ (N₂) ಇದೆ, ಆದರೆ ಸಸ್ಯ ಮತ್ತು ಪ್ರಾಣಿಗಳು ಅದನ್ನು ನೇರವಾಗಿ ಬಳಸಲಾರವು.')),
    AnimStep(0.16, Tr('Nitrogen fixation', 'नाइट्रोजन स्थिरीकरण', 'ಸಾರಜನಕ ಸ್ಥಿರೀಕರಣ'),
        Tr('Rhizobium bacteria in the root nodules of legumes, and lightning, turn N₂ into compounds plants can use.', 'दलहनी पौधों की जड़ ग्रंथिकाओं में राइज़ोबियम जीवाणु और तड़ित N₂ को पौधों के उपयोगी यौगिकों में बदलते हैं।', 'ದ್ವಿದಳ ಸಸ್ಯಗಳ ಬೇರುಗಂಟುಗಳಲ್ಲಿನ ರೈಜೋಬಿಯಂ ಬ್ಯಾಕ್ಟೀರಿಯಾ ಮತ್ತು ಮಿಂಚು N₂ ಅನ್ನು ಸಸ್ಯಗಳು ಬಳಸಬಲ್ಲ ಸಂಯುಕ್ತಗಳಾಗಿ ಬದಲಿಸುತ್ತವೆ.')),
    AnimStep(0.33, Tr('Nitrification', 'नाइट्रीकरण', 'ನೈಟ್ರೀಕರಣ'),
        Tr('Bacteria in the soil turn ammonia into nitrites and then into nitrates.', 'मिट्टी के जीवाणु अमोनिया को नाइट्राइट और फिर नाइट्रेट में बदलते हैं।', 'ಮಣ್ಣಿನ ಬ್ಯಾಕ್ಟೀರಿಯಾ ಅಮೋನಿಯಾವನ್ನು ನೈಟ್ರೈಟ್ ಮತ್ತು ನಂತರ ನೈಟ್ರೇಟ್ ಆಗಿ ಬದಲಿಸುತ್ತವೆ.')),
    AnimStep(0.5, Tr('Assimilation', 'स्वांगीकरण', 'ಸ್ವಾಂಗೀಕರಣ'),
        Tr('Plants absorb nitrates through their roots to make proteins. Animals get nitrogen by eating plants.', 'पौधे जड़ों से नाइट्रेट सोखकर प्रोटीन बनाते हैं। जंतु पौधे खाकर नाइट्रोजन पाते हैं।', 'ಸಸ್ಯಗಳು ಬೇರುಗಳಿಂದ ನೈಟ್ರೇಟ್ ಹೀರಿ ಪ್ರೋಟೀನ್ ತಯಾರಿಸುತ್ತವೆ. ಪ್ರಾಣಿಗಳು ಸಸ್ಯ ತಿಂದು ಸಾರಜನಕ ಪಡೆಯುತ್ತವೆ.')),
    AnimStep(0.67, Tr('Ammonification', 'अमोनीकरण', 'ಅಮೋನೀಕರಣ'),
        Tr('When plants and animals die or excrete, decomposers turn the nitrogen in them back into ammonia.', 'जब पौधे और जंतु मरते हैं या उत्सर्जन करते हैं, तो अपघटक उनकी नाइट्रोजन को फिर अमोनिया में बदलते हैं।', 'ಸಸ್ಯ ಮತ್ತು ಪ್ರಾಣಿಗಳು ಸತ್ತಾಗ ಅಥವಾ ವಿಸರ್ಜಿಸಿದಾಗ, ವಿಘಟಕಗಳು ಅವುಗಳಲ್ಲಿನ ಸಾರಜನಕವನ್ನು ಮತ್ತೆ ಅಮೋನಿಯಾ ಆಗಿಸುತ್ತವೆ.')),
    AnimStep(0.84, Tr('Denitrification', 'विनाइट्रीकरण', 'ವಿನೈಟ್ರೀಕರಣ'),
        Tr('Denitrifying bacteria turn nitrates back into nitrogen gas, which returns to the air.', 'विनाइट्रीकारी जीवाणु नाइट्रेट को फिर नाइट्रोजन गैस में बदलते हैं, जो हवा में लौट जाती है।', 'ವಿನೈಟ್ರೀಕಾರಕ ಬ್ಯಾಕ್ಟೀರಿಯಾ ನೈಟ್ರೇಟ್ ಅನ್ನು ಮತ್ತೆ ಸಾರಜನಕ ಅನಿಲವಾಗಿಸುತ್ತವೆ; ಅದು ಗಾಳಿಗೆ ಮರಳುತ್ತದೆ.')),
  ],
  painter: NitrogenPlate.new,
);

final carbonCycle = KxAnimation(
  id: 'carbon-cycle',
  title: const Tr('The carbon cycle', 'कार्बन चक्र', 'ಇಂಗಾಲದ ಚಕ್ರ'),
  subject: 'Biology',
  topic: 'Natural resources and cycles',
  levels: const ['Class 8', 'Class 9', 'Class 12'],
  keywords: const ['carbon cycle', 'carbon dioxide', 'photosynthesis', 'respiration', 'combustion', 'fossil fuels', 'decomposition', 'global warming', 'biogeochemical cycle', 'ocean'],
  seconds: 22,
  thumbT: 0.55,
  steps: const [
    AnimStep(0, Tr('Carbon dioxide in air', 'हवा में कार्बन डाइऑक्साइड', 'ಗಾಳಿಯಲ್ಲಿ ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್'),
        Tr('Carbon is in the air as carbon dioxide (CO₂), and the oceans dissolve some of it.', 'कार्बन हवा में कार्बन डाइऑक्साइड (CO₂) के रूप में है, और समुद्र इसका कुछ भाग घोल लेते हैं।', 'ಇಂಗಾಲ ಗಾಳಿಯಲ್ಲಿ ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ (CO₂) ಆಗಿದೆ; ಸಾಗರಗಳು ಅದರ ಸ್ವಲ್ಪ ಭಾಗವನ್ನು ಕರಗಿಸುತ್ತವೆ.')),
    AnimStep(0.17, Tr('Photosynthesis', 'प्रकाश संश्लेषण', 'ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆ'),
        Tr('Green plants take in CO₂ and use sunlight to make food (glucose): carbon enters living things.', 'हरे पौधे CO₂ लेकर सूर्य के प्रकाश से भोजन (ग्लूकोज़) बनाते हैं: कार्बन सजीवों में आता है।', 'ಹಸಿರು ಸಸ್ಯಗಳು CO₂ ತೆಗೆದುಕೊಂಡು ಸೂರ್ಯನ ಬೆಳಕಿನಿಂದ ಆಹಾರ (ಗ್ಲೂಕೋಸ್) ತಯಾರಿಸುತ್ತವೆ: ಇಂಗಾಲ ಜೀವಿಗಳನ್ನು ಸೇರುತ್ತದೆ.')),
    AnimStep(0.33, Tr('Food chains', 'आहार शृंखला', 'ಆಹಾರ ಸರಪಳಿ'),
        Tr('Animals eat plants, and the carbon in the food passes along the food chain.', 'जंतु पौधे खाते हैं और भोजन का कार्बन आहार शृंखला में आगे बढ़ता है।', 'ಪ್ರಾಣಿಗಳು ಸಸ್ಯಗಳನ್ನು ತಿನ್ನುತ್ತವೆ; ಆಹಾರದ ಇಂಗಾಲ ಆಹಾರ ಸರಪಳಿಯಲ್ಲಿ ಮುಂದೆ ಸಾಗುತ್ತದೆ.')),
    AnimStep(0.5, Tr('Respiration', 'श्वसन', 'ಉಸಿರಾಟ'),
        Tr('Plants and animals respire: they break down food for energy and give CO₂ back to the air.', 'पौधे और जंतु श्वसन करते हैं: ऊर्जा के लिए भोजन तोड़ते हैं और CO₂ हवा में लौटाते हैं।', 'ಸಸ್ಯ ಮತ್ತು ಪ್ರಾಣಿಗಳು ಉಸಿರಾಡುತ್ತವೆ: ಶಕ್ತಿಗಾಗಿ ಆಹಾರ ಒಡೆದು CO₂ ಅನ್ನು ಗಾಳಿಗೆ ಮರಳಿಸುತ್ತವೆ.')),
    AnimStep(0.67, Tr('Decay and fossils', 'अपघटन और जीवाश्म', 'ಕೊಳೆಯುವಿಕೆ ಮತ್ತು ಪಳೆಯುಳಿಕೆ'),
        Tr('Decomposers break down dead things and release CO₂. Remains buried for millions of years become coal, oil and gas.', 'अपघटक मृत जीवों को तोड़कर CO₂ छोड़ते हैं। लाखों वर्षों तक दबे अवशेष कोयला, तेल और गैस बन जाते हैं।', 'ವಿಘಟಕಗಳು ಸತ್ತ ಜೀವಿಗಳನ್ನು ಒಡೆದು CO₂ ಬಿಡುತ್ತವೆ. ಲಕ್ಷಾಂತರ ವರ್ಷ ಹೂತ ಅವಶೇಷಗಳು ಕಲ್ಲಿದ್ದಲು, ತೈಲ ಮತ್ತು ಅನಿಲವಾಗುತ್ತವೆ.')),
    AnimStep(0.84, Tr('Combustion', 'दहन', 'ದಹನ'),
        Tr('Burning fuels releases their stored carbon as CO₂. Too much of it warms the Earth.', 'ईंधन जलाने से उनमें जमा कार्बन CO₂ बनकर निकलता है। इसकी अधिकता पृथ्वी को गर्म करती है।', 'ಇಂಧನ ಸುಡುವುದರಿಂದ ಅವುಗಳಲ್ಲಿನ ಇಂಗಾಲ CO₂ ಆಗಿ ಬಿಡುಗಡೆಯಾಗುತ್ತದೆ. ಅದರ ಅತಿಯು ಭೂಮಿಯನ್ನು ಬಿಸಿ ಮಾಡುತ್ತದೆ.')),
  ],
  painter: CarbonPlate.new,
);
