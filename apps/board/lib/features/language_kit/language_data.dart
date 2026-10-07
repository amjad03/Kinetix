/// The language kit's offline content: a basic word list (English with Hindi and Kannada),
/// phonics charts and grammar tables.
library;

typedef Word = ({String en, String pos, String meaning, String hi, String kn, String example});

/// A basic dictionary for school and first-year college: common words with a simple meaning
/// and the Hindi and Kannada word.
const basicWords = <Word>[
  (en: 'apple', pos: 'noun', meaning: 'a round fruit with red or green skin', hi: 'सेब', kn: 'ಸೇಬು', example: 'She ate an apple.'),
  (en: 'book', pos: 'noun', meaning: 'pages with writing, fixed together in a cover', hi: 'किताब', kn: 'ಪುಸ್ತಕ', example: 'Open your book to page ten.'),
  (en: 'water', pos: 'noun', meaning: 'the clear liquid in rivers, rain and the sea', hi: 'पानी', kn: 'ನೀರು', example: 'Drink a glass of water.'),
  (en: 'school', pos: 'noun', meaning: 'a place where children learn', hi: 'विद्यालय', kn: 'ಶಾಲೆ', example: 'Our school starts at nine.'),
  (en: 'teacher', pos: 'noun', meaning: 'a person who helps others learn', hi: 'शिक्षक', kn: 'ಶಿಕ್ಷಕ', example: 'The teacher explained the sum.'),
  (en: 'friend', pos: 'noun', meaning: 'a person you like and trust', hi: 'मित्र', kn: 'ಸ್ನೇಹಿತ', example: 'Ravi is my best friend.'),
  (en: 'family', pos: 'noun', meaning: 'parents, children and relatives', hi: 'परिवार', kn: 'ಕುಟುಂಬ', example: 'My family lives in Bengaluru.'),
  (en: 'sun', pos: 'noun', meaning: 'the star that gives the Earth light and heat', hi: 'सूरज', kn: 'ಸೂರ್ಯ', example: 'The sun rises in the east.'),
  (en: 'moon', pos: 'noun', meaning: 'the round object that shines in the night sky', hi: 'चाँद', kn: 'ಚಂದ್ರ', example: 'The moon is full tonight.'),
  (en: 'tree', pos: 'noun', meaning: 'a tall plant with a trunk and branches', hi: 'पेड़', kn: 'ಮರ', example: 'Birds sit on the tree.'),
  (en: 'river', pos: 'noun', meaning: 'a large stream of water flowing to the sea', hi: 'नदी', kn: 'ನದಿ', example: 'The Kaveri is a river in Karnataka.'),
  (en: 'city', pos: 'noun', meaning: 'a large town', hi: 'शहर', kn: 'ನಗರ', example: 'Bengaluru is a busy city.'),
  (en: 'village', pos: 'noun', meaning: 'a small group of houses in the countryside', hi: 'गाँव', kn: 'ಹಳ್ಳಿ', example: 'My grandmother lives in a village.'),
  (en: 'money', pos: 'noun', meaning: 'coins and notes used to buy things', hi: 'पैसा', kn: 'ಹಣ', example: 'Save money in a bank.'),
  (en: 'market', pos: 'noun', meaning: 'a place where things are bought and sold', hi: 'बाज़ार', kn: 'ಮಾರುಕಟ್ಟೆ', example: 'We buy vegetables at the market.'),
  (en: 'price', pos: 'noun', meaning: 'the money you pay for something', hi: 'कीमत', kn: 'ಬೆಲೆ', example: 'The price of rice went up.'),
  (en: 'profit', pos: 'noun', meaning: 'money gained when income is more than cost', hi: 'लाभ', kn: 'ಲಾಭ', example: 'The shop made a profit this year.'),
  (en: 'loss', pos: 'noun', meaning: 'money lost when cost is more than income', hi: 'हानि', kn: 'ನಷ್ಟ', example: 'They sold it at a loss.'),
  (en: 'law', pos: 'noun', meaning: 'a rule made by the government that everyone must follow', hi: 'कानून', kn: 'ಕಾನೂನು', example: 'Wearing a helmet is the law.'),
  (en: 'justice', pos: 'noun', meaning: 'fair treatment of people', hi: 'न्याय', kn: 'ನ್ಯಾಯ', example: 'Courts give justice.'),
  (en: 'evidence', pos: 'noun', meaning: 'facts or things that show something is true', hi: 'साक्ष्य', kn: 'ಸಾಕ್ಷ್ಯ', example: 'The fingerprint was key evidence.'),
  (en: 'experiment', pos: 'noun', meaning: 'a test done to learn or prove something', hi: 'प्रयोग', kn: 'ಪ್ರಯೋಗ', example: 'We did an experiment with a glass slab.'),
  (en: 'energy', pos: 'noun', meaning: 'the power to do work', hi: 'ऊर्जा', kn: 'ಶಕ್ತಿ', example: 'Food gives us energy.'),
  (en: 'light', pos: 'noun', meaning: 'what makes things visible, as from the sun or a lamp', hi: 'प्रकाश', kn: 'ಬೆಳಕು', example: 'Light travels very fast.'),
  (en: 'computer', pos: 'noun', meaning: 'a machine that stores and works with information', hi: 'कंप्यूटर', kn: 'ಗಣಕಯಂತ್ರ', example: 'Save the program on the computer.'),
  (en: 'health', pos: 'noun', meaning: 'the state of being well in body and mind', hi: 'स्वास्थ्य', kn: 'ಆರೋಗ್ಯ', example: 'Exercise is good for health.'),
  (en: 'knowledge', pos: 'noun', meaning: 'what you know and understand', hi: 'ज्ञान', kn: 'ಜ್ಞಾನ', example: 'Books give us knowledge.'),
  (en: 'freedom', pos: 'noun', meaning: 'being free to act and speak', hi: 'स्वतंत्रता', kn: 'ಸ್ವಾತಂತ್ರ್ಯ', example: 'India won freedom in 1947.'),
  (en: 'read', pos: 'verb', meaning: 'to look at words and understand them', hi: 'पढ़ना', kn: 'ಓದು', example: 'I read a story every night.'),
  (en: 'write', pos: 'verb', meaning: 'to make letters or words with a pen', hi: 'लिखना', kn: 'ಬರೆ', example: 'Write your name at the top.'),
  (en: 'speak', pos: 'verb', meaning: 'to say words', hi: 'बोलना', kn: 'ಮಾತನಾಡು', example: 'She can speak three languages.'),
  (en: 'listen', pos: 'verb', meaning: 'to pay attention to sound', hi: 'सुनना', kn: 'ಆಲಿಸು', example: 'Listen to the question.'),
  (en: 'learn', pos: 'verb', meaning: 'to get knowledge or a skill', hi: 'सीखना', kn: 'ಕಲಿ', example: 'We learn something new every day.'),
  (en: 'play', pos: 'verb', meaning: 'to do something for fun', hi: 'खेलना', kn: 'ಆಡು', example: 'The children play cricket.'),
  (en: 'run', pos: 'verb', meaning: 'to move fast on foot', hi: 'दौड़ना', kn: 'ಓಡು', example: 'He can run very fast.'),
  (en: 'eat', pos: 'verb', meaning: 'to take food into the mouth', hi: 'खाना', kn: 'ತಿನ್ನು', example: 'We eat lunch at one.'),
  (en: 'help', pos: 'verb', meaning: 'to make it easier for someone to do something', hi: 'मदद करना', kn: 'ಸಹಾಯ ಮಾಡು', example: 'Please help me carry this.'),
  (en: 'explain', pos: 'verb', meaning: 'to make something clear', hi: 'समझाना', kn: 'ವಿವರಿಸು', example: 'Explain your answer.'),
  (en: 'compare', pos: 'verb', meaning: 'to look at how things are alike or different', hi: 'तुलना करना', kn: 'ಹೋಲಿಸು', example: 'Compare the two graphs.'),
  (en: 'measure', pos: 'verb', meaning: 'to find the size or amount of something', hi: 'मापना', kn: 'ಅಳೆ', example: 'Measure the angle with a protractor.'),
  (en: 'big', pos: 'adjective', meaning: 'large in size', hi: 'बड़ा', kn: 'ದೊಡ್ಡ', example: 'An elephant is a big animal.'),
  (en: 'small', pos: 'adjective', meaning: 'little in size', hi: 'छोटा', kn: 'ಚಿಕ್ಕ', example: 'An ant is small.'),
  (en: 'happy', pos: 'adjective', meaning: 'feeling glad', hi: 'खुश', kn: 'ಸಂತೋಷ', example: 'She was happy with her marks.'),
  (en: 'beautiful', pos: 'adjective', meaning: 'very pleasant to look at', hi: 'सुंदर', kn: 'ಸುಂದರ', example: 'Mysuru Palace is beautiful.'),
  (en: 'important', pos: 'adjective', meaning: 'of great value or meaning', hi: 'महत्वपूर्ण', kn: 'ಮುಖ್ಯ', example: 'Sleep is important for children.'),
  (en: 'honest', pos: 'adjective', meaning: 'telling the truth', hi: 'ईमानदार', kn: 'ಪ್ರಾಮಾಣಿಕ', example: 'An honest person does not cheat.'),
  (en: 'quickly', pos: 'adverb', meaning: 'fast; in a short time', hi: 'जल्दी से', kn: 'ಬೇಗನೆ', example: 'Finish the work quickly.'),
  (en: 'carefully', pos: 'adverb', meaning: 'with care, avoiding mistakes', hi: 'ध्यान से', kn: 'ಎಚ್ಚರಿಕೆಯಿಂದ', example: 'Read the question carefully.'),
  (en: 'always', pos: 'adverb', meaning: 'every time', hi: 'हमेशा', kn: 'ಯಾವಾಗಲೂ', example: 'Always wash your hands.'),
  (en: 'because', pos: 'conjunction', meaning: 'for the reason that', hi: 'क्योंकि', kn: 'ಏಕೆಂದರೆ', example: 'He was late because it rained.'),
];

/// The English alphabet's sounds, with a picture word each.
const englishPhonics = <(String letter, String sound, String word)>[
  ('A a', '/æ/', 'apple'), ('B b', '/b/', 'ball'), ('C c', '/k/', 'cat'), ('D d', '/d/', 'dog'), ('E e', '/e/', 'egg'), ('F f', '/f/', 'fish'),
  ('G g', '/g/', 'goat'), ('H h', '/h/', 'hat'), ('I i', '/ɪ/', 'ink'), ('J j', '/dʒ/', 'jug'), ('K k', '/k/', 'kite'), ('L l', '/l/', 'lion'),
  ('M m', '/m/', 'mango'), ('N n', '/n/', 'nest'), ('O o', '/ɒ/', 'ox'), ('P p', '/p/', 'pen'), ('Q q', '/kw/', 'queen'), ('R r', '/r/', 'rat'),
  ('S s', '/s/', 'sun'), ('T t', '/t/', 'top'), ('U u', '/ʌ/', 'umbrella'), ('V v', '/v/', 'van'), ('W w', '/w/', 'watch'), ('X x', '/ks/', 'box'),
  ('Y y', '/j/', 'yak'), ('Z z', '/z/', 'zebra'),
];

/// Devanagari varnamala: vowels, then the consonants by their groups (varga).
const hindiVarnamala = <(String group, List<String> letters)>[
  ('स्वर', ['अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ऋ', 'ए', 'ऐ', 'ओ', 'औ', 'अं', 'अः']),
  ('क वर्ग', ['क', 'ख', 'ग', 'घ', 'ङ']),
  ('च वर्ग', ['च', 'छ', 'ज', 'झ', 'ञ']),
  ('ट वर्ग', ['ट', 'ठ', 'ड', 'ढ', 'ण']),
  ('त वर्ग', ['त', 'थ', 'द', 'ध', 'न']),
  ('प वर्ग', ['प', 'फ', 'ब', 'भ', 'म']),
  ('अंतःस्थ', ['य', 'र', 'ल', 'व']),
  ('ऊष्म', ['श', 'ष', 'स', 'ह']),
  ('संयुक्त', ['क्ष', 'त्र', 'ज्ञ', 'श्र']),
];

/// Kannada varnamale: swaras, yogavahas, and the consonants (vargiya, then avargiya).
const kannadaVarnamale = <(String group, List<String> letters)>[
  ('ಸ್ವರಗಳು', ['ಅ', 'ಆ', 'ಇ', 'ಈ', 'ಉ', 'ಊ', 'ಋ', 'ಎ', 'ಏ', 'ಐ', 'ಒ', 'ಓ', 'ಔ']),
  ('ಯೋಗವಾಹಗಳು', ['ಅಂ', 'ಅಃ']),
  ('ಕ ವರ್ಗ', ['ಕ', 'ಖ', 'ಗ', 'ಘ', 'ಙ']),
  ('ಚ ವರ್ಗ', ['ಚ', 'ಛ', 'ಜ', 'ಝ', 'ಞ']),
  ('ಟ ವರ್ಗ', ['ಟ', 'ಠ', 'ಡ', 'ಢ', 'ಣ']),
  ('ತ ವರ್ಗ', ['ತ', 'ಥ', 'ದ', 'ಧ', 'ನ']),
  ('ಪ ವರ್ಗ', ['ಪ', 'ಫ', 'ಬ', 'ಭ', 'ಮ']),
  ('ಅವರ್ಗೀಯ', ['ಯ', 'ರ', 'ಲ', 'ವ', 'ಶ', 'ಷ', 'ಸ', 'ಹ', 'ಳ']),
];

/// The twelve English tenses of "play": (tense, form, example).
const englishTenses = <List<String>>[
  ['Tense', 'Form', 'Example'],
  ['Simple present', 'play / plays', 'She plays the veena.'],
  ['Present continuous', 'am / is / are playing', 'They are playing cricket.'],
  ['Present perfect', 'have / has played', 'I have played this game.'],
  ['Present perfect continuous', 'have / has been playing', 'We have been playing since four.'],
  ['Simple past', 'played', 'He played yesterday.'],
  ['Past continuous', 'was / were playing', 'She was playing when it rained.'],
  ['Past perfect', 'had played', 'They had played before lunch.'],
  ['Past perfect continuous', 'had been playing', 'I had been playing for an hour.'],
  ['Simple future', 'will play', 'We will play tomorrow.'],
  ['Future continuous', 'will be playing', 'She will be playing at six.'],
  ['Future perfect', 'will have played', 'They will have played by noon.'],
  ['Future perfect continuous', 'will have been playing', 'He will have been playing for two hours.'],
];

/// Hindi काल of खेलना.
const hindiTenses = <List<String>>[
  ['काल', 'रूप', 'उदाहरण'],
  ['वर्तमान काल', 'खेलता है / खेलती है', 'राम क्रिकेट खेलता है।'],
  ['अपूर्ण वर्तमान', 'खेल रहा है', 'सीता खेल रही है।'],
  ['भूतकाल', 'खेला / खेली', 'मोहन कल खेला।'],
  ['अपूर्ण भूत', 'खेल रहा था', 'बच्चे खेल रहे थे।'],
  ['भविष्यत् काल', 'खेलेगा / खेलेगी', 'हम कल खेलेंगे।'],
];

/// Kannada ಕಾಲ of ಆಡು.
const kannadaTenses = <List<String>>[
  ['ಕಾಲ', 'ರೂಪ', 'ಉದಾಹರಣೆ'],
  ['ವರ್ತಮಾನ ಕಾಲ', 'ಆಡುತ್ತಾನೆ / ಆಡುತ್ತಾಳೆ', 'ರಾಮ ಕ್ರಿಕೆಟ್ ಆಡುತ್ತಾನೆ.'],
  ['ಭೂತ ಕಾಲ', 'ಆಡಿದನು / ಆಡಿದಳು', 'ಸೀತಾ ನಿನ್ನೆ ಆಡಿದಳು.'],
  ['ಭವಿಷ್ಯತ್ ಕಾಲ', 'ಆಡುವನು / ಆಡುವಳು', 'ನಾವು ನಾಳೆ ಆಡುವೆವು.'],
];

/// The eight parts of speech: (part, what it does, examples).
const partsOfSpeech = <List<String>>[
  ['Part of speech', 'What it does', 'Examples'],
  ['Noun', 'names a person, place, thing or idea', 'Asha, Mysuru, book, honesty'],
  ['Pronoun', 'takes the place of a noun', 'he, she, it, they'],
  ['Verb', 'shows an action or a state', 'run, write, is'],
  ['Adjective', 'describes a noun', 'tall, red, clever'],
  ['Adverb', 'describes a verb, adjective or adverb', 'slowly, very, always'],
  ['Preposition', 'shows how a noun relates to others', 'in, on, under, with'],
  ['Conjunction', 'joins words or sentences', 'and, but, because'],
  ['Interjection', 'shows a sudden feeling', 'Oh! Wow! Ouch!'],
];
