import '../model.dart';
import 'plate_flows.dart';

// The circular flow of income, and packet switching.

final circularFlow = KxAnimation(
  id: 'circular-flow-of-income',
  title: const Tr('Circular flow of income', 'आय का चक्रीय प्रवाह', 'ಆದಾಯದ ಚಕ್ರೀಯ ಹರಿವು'),
  subject: 'Economics',
  topic: 'National income',
  levels: const ['Class 11', 'Class 12'],
  alsoSubjects: const ['Commerce', 'Social Science', 'Business Studies'],
  keywords: const ['circular flow', 'income', 'households', 'firms', 'factors of production', 'wages', 'rent', 'interest', 'profit', 'goods and services', 'expenditure', 'macroeconomics', 'national income'],
  seconds: 20,
  thumbT: 0.7,
  steps: const [
    AnimStep(0, Tr('Two sectors', 'दो क्षेत्र', 'ಎರಡು ವಲಯಗಳು'),
        Tr('A simple economy has households, who own land, labour and capital, and firms, who produce goods and services.', 'सरल अर्थव्यवस्था में परिवार (भूमि, श्रम और पूँजी के स्वामी) और फ़र्में (वस्तुएँ और सेवाएँ बनाने वाली) होते हैं।', 'ಸರಳ ಅರ್ಥವ್ಯವಸ್ಥೆಯಲ್ಲಿ ಕುಟುಂಬಗಳು (ಭೂಮಿ, ಶ್ರಮ, ಬಂಡವಾಳದ ಮಾಲೀಕರು) ಮತ್ತು ಉದ್ದಿಮೆಗಳು (ಸರಕು-ಸೇವೆ ಉತ್ಪಾದಕರು) ಇರುತ್ತವೆ.')),
    AnimStep(0.2, Tr('Factor services', 'साधन सेवाएँ', 'ಸಾಧನ ಸೇವೆಗಳು'),
        Tr('Households supply factors of production to firms in the factor market.', 'परिवार साधन बाज़ार में फ़र्मों को उत्पादन के साधन देते हैं।', 'ಕುಟುಂಬಗಳು ಸಾಧನ ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ಉದ್ದಿಮೆಗಳಿಗೆ ಉತ್ಪಾದನಾ ಸಾಧನಗಳನ್ನು ಒದಗಿಸುತ್ತವೆ.')),
    AnimStep(0.4, Tr('Factor incomes', 'साधन आय', 'ಸಾಧನ ಆದಾಯ'),
        Tr('Firms pay rent, wages, interest and profit: these are the households’ incomes.', 'फ़र्में लगान, मज़दूरी, ब्याज और लाभ देती हैं: यही परिवारों की आय है।', 'ಉದ್ದಿಮೆಗಳು ಗೇಣಿ, ಕೂಲಿ, ಬಡ್ಡಿ ಮತ್ತು ಲಾಭ ಪಾವತಿಸುತ್ತವೆ: ಇವೇ ಕುಟುಂಬಗಳ ಆದಾಯ.')),
    AnimStep(0.6, Tr('Goods and services', 'वस्तुएँ और सेवाएँ', 'ಸರಕು ಮತ್ತು ಸೇವೆಗಳು'),
        Tr('Firms sell the goods and services they produce to households in the product market.', 'फ़र्में अपनी बनाई वस्तुएँ और सेवाएँ उत्पाद बाज़ार में परिवारों को बेचती हैं।', 'ಉದ್ದಿಮೆಗಳು ತಾವು ಉತ್ಪಾದಿಸಿದ ಸರಕು-ಸೇವೆಗಳನ್ನು ಉತ್ಪನ್ನ ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ಕುಟುಂಬಗಳಿಗೆ ಮಾರುತ್ತವೆ.')),
    AnimStep(0.8, Tr('Spending', 'व्यय', 'ವೆಚ್ಚ'),
        Tr('Households spend their income on them, which becomes the firms’ revenue. Real goods flow one way, money the other, in a circle.', 'परिवार अपनी आय इन पर ख़र्च करते हैं, जो फ़र्मों का राजस्व बनती है। वास्तविक प्रवाह एक ओर, मुद्रा प्रवाह दूसरी ओर, एक चक्र में।', 'ಕುಟುಂಬಗಳು ತಮ್ಮ ಆದಾಯವನ್ನು ಅವುಗಳ ಮೇಲೆ ಖರ್ಚು ಮಾಡುತ್ತವೆ; ಅದು ಉದ್ದಿಮೆಗಳ ಆದಾಯ. ವಾಸ್ತವ ಹರಿವು ಒಂದು ಕಡೆ, ಹಣದ ಹರಿವು ಇನ್ನೊಂದು ಕಡೆ, ಚಕ್ರದಲ್ಲಿ.')),
  ],
  painter: CircularFlowPlate.new,
);

final packetSwitching = KxAnimation(
  id: 'packet-switching',
  title: const Tr('Packet switching', 'पैकेट स्विचिंग', 'ಪ್ಯಾಕೆಟ್ ಸ್ವಿಚಿಂಗ್'),
  subject: 'Computer Science',
  topic: 'Computer networks',
  levels: const ['Class 11', 'Class 12'],
  alsoSubjects: const ['Informatics Practices', 'Computer Applications'],
  keywords: const ['packet switching', 'packets', 'router', 'network', 'internet', 'ip address', 'routing', 'data transmission', 'header', 'networking'],
  seconds: 20,
  thumbT: 0.5,
  steps: const [
    AnimStep(0, Tr('Split into packets', 'पैकेटों में बाँटना', 'ಪ್ಯಾಕೆಟ್‌ಗಳಾಗಿ ವಿಭಜನೆ'),
        Tr('A message is split into small numbered packets. Each has a header with the sender’s and receiver’s addresses.', 'संदेश को छोटे क्रमांकित पैकेटों में बाँटा जाता है। हर पैकेट के हेडर में भेजने और पाने वाले के पते होते हैं।', 'ಸಂದೇಶವನ್ನು ಸಂಖ್ಯೆ ಹಾಕಿದ ಸಣ್ಣ ಪ್ಯಾಕೆಟ್‌ಗಳಾಗಿ ವಿಭಜಿಸಲಾಗುತ್ತದೆ. ಪ್ರತಿ ಹೆಡರ್‌ನಲ್ಲಿ ಕಳುಹಿಸುವವರ ಮತ್ತು ಸ್ವೀಕರಿಸುವವರ ವಿಳಾಸಗಳಿರುತ್ತವೆ.')),
    AnimStep(0.2, Tr('Routers forward', 'राउटर आगे भेजते हैं', 'ರೌಟರ್‌ಗಳು ಮುಂದೆ ಕಳುಹಿಸುತ್ತವೆ'),
        Tr('Each router reads a packet’s address and sends it on along the best free link at that moment.', 'हर राउटर पैकेट का पता पढ़कर उसे उस समय की सबसे अच्छी खाली कड़ी से आगे भेजता है।', 'ಪ್ರತಿ ರೌಟರ್ ಪ್ಯಾಕೆಟ್ ವಿಳಾಸ ಓದಿ ಆ ಕ್ಷಣದ ಅತ್ಯುತ್ತಮ ಖಾಲಿ ಕೊಂಡಿಯಲ್ಲಿ ಮುಂದೆ ಕಳುಹಿಸುತ್ತದೆ.')),
    AnimStep(0.45, Tr('Different routes', 'अलग-अलग रास्ते', 'ಬೇರೆ ಬೇರೆ ದಾರಿಗಳು'),
        Tr('Packets of the same message may take different routes. If a link is busy or broken, they go round it.', 'एक ही संदेश के पैकेट अलग रास्ते ले सकते हैं। कोई कड़ी व्यस्त या टूटी हो, तो वे उसके चारों ओर से जाते हैं।', 'ಒಂದೇ ಸಂದೇಶದ ಪ್ಯಾಕೆಟ್‌ಗಳು ಬೇರೆ ದಾರಿ ಹಿಡಿಯಬಹುದು. ಕೊಂಡಿ ಕಾರ್ಯನಿರತ ಅಥವಾ ಮುರಿದಿದ್ದರೆ ಸುತ್ತಿ ಹೋಗುತ್ತವೆ.')),
    AnimStep(0.75, Tr('Reassembled', 'फिर से जोड़ना', 'ಮರುಜೋಡಣೆ'),
        Tr('Packets can arrive out of order. The receiver puts them back in order by their numbers to rebuild the message.', 'पैकेट क्रम से बाहर पहुँच सकते हैं। प्राप्तकर्ता उनके क्रमांक से उन्हें क्रम में लगाकर संदेश फिर बनाता है।', 'ಪ್ಯಾಕೆಟ್‌ಗಳು ಕ್ರಮ ತಪ್ಪಿ ತಲುಪಬಹುದು. ಸ್ವೀಕರಿಸುವವರು ಸಂಖ್ಯೆಗಳ ಪ್ರಕಾರ ಕ್ರಮಗೊಳಿಸಿ ಸಂದೇಶವನ್ನು ಮರುರಚಿಸುತ್ತಾರೆ.')),
  ],
  painter: PacketsPlate.new,
);
