/**
 * Evaluation set for the board's "Ask KINETIX AI": 40 questions a teacher asks at the board,
 * with what a correct answer must contain. Each `must` entry is a group of acceptable spellings
 * separated by "|"; an answer passes when every group matches (case and spacing ignored).
 */
export interface BoardQuestion {
  id: string;
  level: string;
  question: string;
  must: string[];
}

const q = (id: string, level: string, question: string, ...must: string[]): BoardQuestion => ({ id, level, question, must });

export const BOARD_QUESTIONS: BoardQuestion[] = [
  q('m01', 'Class 8 CBSE Maths', 'Solve 3x + 7 = 22.', '5'),
  q('m02', 'Class 10 CBSE Maths', 'Find the roots of x² - 5x + 6 = 0.', '2', '3'),
  q('m03', 'Class 10 CBSE Maths', 'What is the sum of the first 20 natural numbers?', '210'),
  q('m04', 'Class 10 CBSE Maths', 'Find the 10th term of the AP 2, 5, 8, 11, ...', '29'),
  q('m05', 'Class 9 CBSE Maths', 'Find the area of a triangle with base 10 cm and height 6 cm.', '30'),
  q('m06', 'Class 10 CBSE Maths', 'What is the value of sin 30°?', '1/2|0.5|half'),
  q('m08', 'Class 7 CBSE Maths', 'What is 15% of 240?', '36'),
  q('m09', 'Class 9 CBSE Maths', 'Find the circumference of a circle of radius 7 cm (use π = 22/7).', '44'),
  q('m10', 'Class 11 CBSE Maths', 'Differentiate x³ with respect to x.', '3x²|3x^2|3 x^2'),
  q('m11', 'Class 12 CBSE Maths', 'Integrate 2x with respect to x.', 'x²|x^2', 'c|constant'),
  q('m12', 'Class 10 CBSE Maths', 'Find the HCF of 12 and 18.', '6'),
  q('m13', 'Class 6 CBSE Maths', 'What is the LCM of 4 and 6?', '12'),
  q('m14', 'Class 9 CBSE Maths', 'Expand (a + b)².', 'a²|a^2', '2ab', 'b²|b^2'),
  q('m15', 'Class 10 CBSE Maths', 'Find the distance between the points (0, 0) and (3, 4).', '5'),
  q('p01', 'Class 9 CBSE Science', 'State Newton\'s second law of motion.', 'force', 'mass', 'acceleration'),
  q('p02', 'Class 9 CBSE Science', 'A car goes from rest to 20 m/s in 5 s. Find its acceleration.', '4'),
  q('p03', 'Class 10 CBSE Science', 'State Ohm\'s law.', 'current', 'voltage|potential difference', 'resistance'),
  q('p04', 'Class 10 CBSE Science', 'A current of 2 A flows through a 5 Ω resistor. What is the voltage?', '10'),
  q('p05', 'Class 9 CBSE Science', 'What is the SI unit of force?', 'newton'),
  q('p06', 'Class 11 CBSE Physics', 'What is the acceleration due to gravity on Earth, approximately?', '9.8|9.81|10'),
  q('c01', 'Class 10 CBSE Science', 'What is the chemical formula of common salt?', 'nacl'),
  q('c02', 'Class 10 CBSE Science', 'What is the pH of a neutral solution at 25°C?', '7'),
  q('c03', 'Class 9 CBSE Science', 'What is the atomic number of carbon?', '6'),
  q('c04', 'Class 10 CBSE Science', 'Write the balanced equation for the burning of hydrogen in oxygen.', '2h2|2h₂', 'o2|o₂', '2h2o|2h₂o'),
  q('c05', 'Class 11 CBSE Chemistry', 'What is the molar mass of water in g/mol?', '18'),
  q('b01', 'Class 7 CBSE Science', 'Which gas do plants take in for photosynthesis?', 'carbon dioxide|co2|co₂'),
  q('b02', 'Class 8 CBSE Science', 'What is the powerhouse of the cell?', 'mitochondri'),
  q('b03', 'Class 10 CBSE Science', 'Name the pigment that gives leaves their green colour.', 'chlorophyll'),
  q('b04', 'Class 6 CBSE Science', 'How many chambers does the human heart have?', 'four|4'),
  q('s01', 'Class 8 CBSE Social Science', 'Who was the first Prime Minister of independent India?', 'nehru'),
  q('s02', 'Class 9 CBSE Social Science', 'In which year did India become independent?', '1947'),
  q('s03', 'Class 7 CBSE Social Science', 'What is the capital of Karnataka?', 'bengaluru|bangalore'),
  q('s04', 'Class 9 CBSE Social Science', 'Which is the longest river in India?', 'ganga|ganges'),
  q('s05', 'Class 8 CBSE Civics', 'Who is known as the Father of the Indian Constitution?', 'ambedkar'),
  q('e01', 'Class 8 CBSE English', 'What is the past tense of the verb "go"?', 'went'),
  q('e02', 'Class 6 CBSE English', 'Give the plural of "child".', 'children'),
  q('e03', 'Class 9 CBSE English', 'What is a synonym of "happy"?', 'glad|joyful|cheerful|content|pleased'),
  q('h01', 'Class 8 CBSE Hindi', 'हिंदी में "सूर्य" का एक पर्यायवाची शब्द बताइए।', 'रवि|भानु|दिनकर|आदित्य|भास्कर|दिवाकर'),
  q('h02', 'Class 7 CBSE Hindi', '"पुस्तक" शब्द का बहुवचन क्या है?', 'पुस्तकें|पुस्तकों'),
  q('k01', 'Class 10 CBSE Computer Science', 'How many bits are there in one byte?', '8|eight'),
];
