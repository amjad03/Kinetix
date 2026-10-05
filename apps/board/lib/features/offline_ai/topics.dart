import 'topics_more.dart';

// Ported from the KINETIX prototype's offline demo AI (lib/ai/topics*.dart): the notes are
// unchanged; the simulations they linked to are not part of this board.

/// A multiple-choice question in the offline notes ([options] empty: an open question, [why]
/// is then its model answer).
class OfflineQuestion {
  final String question;
  final List<String> options;
  final int answer;
  final String why;
  const OfflineQuestion(this.question, this.options, this.answer, this.why);
}

/// Hand-written lesson notes the offline AI (offline_ai.dart) answers from when the board
/// cannot reach KINETIX AI, or in demo builds. English only.
class Topic {
  final String title;
  final List<String> keywords;
  final String summary;
  final List<String> keyPoints;
  final String example;
  final String? exampleTex;
  final String? formulaTex;
  final List<OfflineQuestion> quiz;

  /// Subjects this topic belongs to (as in the lesson header); empty = any.
  /// Used to pick between topics that share a word ("cell" in biology and
  /// in physics).
  final List<String> subjects;

  final String? realLifeText, activityText;
  final List<String>? mistakesList;

  /// Everyday hook for a first explanation.
  String get realLife => realLifeText ?? topicRealLife[title] ?? 'Look for $title around you: where have you seen it outside school?';

  /// Mistakes examiners see most often.
  List<String> get mistakes =>
      mistakesList ?? topicMistakes[title] ?? const ['Learn the key words and their exact meaning.', 'Show every step; marks are given for working.'];

  /// A 5–10 minute classroom activity.
  String get activity =>
      activityText ??
      topicActivities[title] ??
      'Think–pair–share: each pupil writes one thing they learned about $title, swaps with a partner, and the pair adds one question to ask the class.';

  const Topic({
    required this.title,
    required this.keywords,
    required this.summary,
    required this.keyPoints,
    required this.example,
    this.exampleTex,
    this.formulaTex,
    required this.quiz,
    this.subjects = const [],
    this.realLifeText,
    this.activityText,
    this.mistakesList,
  });
}

/// Every topic the offline demo can teach.
final topics = <Topic>[..._baseTopics, ...moreTopics];

const _baseTopics = <Topic>[
  Topic(
    title: 'Number systems',
    keywords: ['number system', 'number systems', 'rational number', 'rational numbers', 'irrational', 'real number', 'real numbers', 'natural number', 'whole number'],
    summary:
        'Numbers are grouped into families that sit inside each other. Natural numbers (1, 2, 3, …) are inside the whole numbers (0, 1, 2, …), which are inside the integers (… −2, −1, 0, 1, 2 …), which are inside the rational numbers (p/q with q ≠ 0). Rational and irrational numbers together make up the real numbers.',
    keyPoints: [
      'N ⊂ W ⊂ Z ⊂ Q ⊂ R.',
      'A rational number can be written as p/q (q ≠ 0); its decimal ends or repeats.',
      'An irrational number cannot be written as p/q; its decimal never ends and never repeats (√2, π).',
      'Every real number is a point on the number line.',
    ],
    formulaTex: '\\mathbb{N} \\subset \\mathbb{W} \\subset \\mathbb{Z} \\subset \\mathbb{Q} \\subset \\mathbb{R}',
    example: '0.75 = 3/4 is rational (it ends). 0.333… = 1/3 is rational (it repeats). √2 = 1.41421356… is irrational.',
    exampleTex: '0.\\overline{3} = \\frac{1}{3}, \\quad \\sqrt{2} \\approx 1.41421356\\ldots',
    quiz: [
      OfflineQuestion('Which number is irrational?', ['0.25', '√9', '√3', '7/2'], 2, '√3 = 1.7320508… never ends or repeats. √9 = 3 is rational.'),
      OfflineQuestion('Every integer is also a…', ['Natural number', 'Rational number', 'Irrational number', 'Whole number'], 1,
          'Any integer n can be written as n/1, so it is rational.'),
      OfflineQuestion('The decimal 0.1212… (repeating) is…', ['Irrational', 'Rational', 'Not a real number', 'An integer'], 1,
          'Repeating decimals are rational: 0.1212… = 12/99 = 4/33.'),
    ],
  ),
  Topic(
    title: 'Pythagoras theorem',
    keywords: ['pythagoras', 'pythagorean', 'hypotenuse', 'right triangle', 'right-angled'],
    summary:
        'In a right-angled triangle, the square on the longest side (the hypotenuse, opposite the right angle) equals the sum of the squares on the other two sides.',
    keyPoints: [
      'Only works for right-angled triangles.',
      'The hypotenuse c is always the longest side.',
      'Use it to find a missing side when two sides are known.',
    ],
    formulaTex: 'a^2 + b^2 = c^2',
    example: 'Legs of 3 cm and 4 cm: c² = 9 + 16 = 25, so the hypotenuse is 5 cm.',
    exampleTex: 'c = \\sqrt{3^2 + 4^2} = \\sqrt{25} = 5',
    quiz: [
      OfflineQuestion('A right triangle has legs 6 and 8. How long is the hypotenuse?', ['10', '14', '12', '48'], 0,
          '6² + 8² = 36 + 64 = 100, and √100 = 10.'),
      OfflineQuestion('Which side is the hypotenuse?', ['The shortest side', 'The side opposite the right angle', 'The base', 'Any side'], 1,
          'The hypotenuse is opposite the 90° angle and is always the longest side.'),
      OfflineQuestion('Is a triangle with sides 5, 12, 13 right-angled?', ['Yes', 'No'], 0, '5² + 12² = 25 + 144 = 169 = 13².'),
    ],
  ),
  Topic(
    title: 'Photosynthesis',
    keywords: ['photosynthesis', 'chlorophyll', 'chloroplast', 'glucose'],
    summary:
        'Green plants make their own food. Using energy from sunlight, the chlorophyll in their leaves turns carbon dioxide from the air and water from the soil into glucose, releasing oxygen.',
    keyPoints: [
      'Happens mainly in the leaves, inside chloroplasts.',
      'Needs sunlight, water, carbon dioxide and chlorophyll.',
      'Produces glucose (food) and oxygen (released into the air).',
    ],
    formulaTex: '6\\,\\mathrm{CO_2} + 6\\,\\mathrm{H_2O} \\xrightarrow{\\text{light}} \\mathrm{C_6H_{12}O_6} + 6\\,\\mathrm{O_2}',
    example: 'A plant kept in a dark cupboard for days turns pale and weak because it cannot photosynthesise.',
    quiz: [
      OfflineQuestion('Which gas do plants take in for photosynthesis?', ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen'], 1,
          'Carbon dioxide enters through tiny pores (stomata) in the leaves.'),
      OfflineQuestion('What pigment captures light energy?', ['Haemoglobin', 'Melanin', 'Chlorophyll', 'Keratin'], 2,
          'Chlorophyll is the green pigment in chloroplasts.'),
      OfflineQuestion('Which is a product of photosynthesis?', ['Carbon dioxide', 'Oxygen', 'Soil', 'Nitrogen'], 1,
          'Glucose and oxygen are produced; oxygen is released.'),
    ],
  ),
  Topic(
    title: 'Fractions',
    keywords: ['fraction', 'fractions', 'numerator', 'denominator', 'equivalent fraction'],
    summary:
        'A fraction shows parts of a whole. The denominator (bottom) says how many equal parts the whole is cut into; the numerator (top) says how many of those parts we take.',
    keyPoints: [
      'Equivalent fractions name the same amount: 1/2 = 2/4 = 3/6.',
      'To add fractions, first make the denominators the same.',
      'Multiply or divide top and bottom by the same number to get an equivalent fraction.',
    ],
    formulaTex: '\\frac{a}{b} + \\frac{c}{d} = \\frac{ad + bc}{bd}',
    example: '1/4 + 2/4 = 3/4 — same-size parts, so just add the numerators.',
    exampleTex: '\\frac{1}{3} + \\frac{1}{6} = \\frac{2}{6} + \\frac{1}{6} = \\frac{3}{6} = \\frac{1}{2}',
    quiz: [
      OfflineQuestion('Which fraction equals 1/2?', ['2/3', '3/6', '1/4', '2/5'], 1, '3/6: divide top and bottom by 3 to get 1/2.'),
      OfflineQuestion('What is 1/4 + 1/4?', ['2/8', '1/2', '1/8', '1/16'], 1, '1/4 + 1/4 = 2/4 = 1/2.'),
      OfflineQuestion('In 3/5, what does 5 tell us?', ['Parts taken', 'Total equal parts', 'The answer', 'Nothing'], 1,
          'The denominator is the number of equal parts in the whole.'),
    ],
  ),
  Topic(
    title: "Newton's laws of motion",
    keywords: ['newton', 'inertia', 'force', 'action and reaction', 'f = ma', 'f=ma'],
    summary:
        'Newton\'s three laws describe how forces change motion: objects keep doing what they are doing unless a force acts; force equals mass times acceleration; and every action has an equal and opposite reaction.',
    keyPoints: [
      '1st law (inertia): no net force means no change in motion.',
      '2nd law: F = ma — more force, more acceleration; more mass, less acceleration.',
      '3rd law: forces come in equal and opposite pairs.',
    ],
    formulaTex: 'F = m a',
    example: 'Pushing a 2 kg trolley with 10 N of net force gives it an acceleration of 5 m/s².',
    exampleTex: 'a = \\frac{F}{m} = \\frac{10}{2} = 5\\ \\text{m/s}^2',
    quiz: [
      OfflineQuestion('A 4 kg box is pushed with a net force of 20 N. Its acceleration is…', ['80 m/s²', '5 m/s²', '16 m/s²', '0.2 m/s²'], 1,
          'a = F/m = 20/4 = 5 m/s².'),
      OfflineQuestion('Passengers lurch forward when a bus brakes suddenly. Which law explains it?', ['First', 'Second', 'Third', 'None'], 0,
          'Inertia — their bodies keep moving forward.'),
      OfflineQuestion('A rocket pushes gas down and moves up. Which law?', ['First', 'Second', 'Third', 'Gravity'], 2,
          'Action (gas pushed down) and reaction (rocket pushed up).'),
    ],
  ),
  Topic(
    title: 'Simple pendulum',
    keywords: ['pendulum', 'oscillation', 'time period'],
    summary:
        'A simple pendulum is a small mass (bob) on a string that swings back and forth. For small swings, the time for one full swing depends only on the string length and gravity — not on the mass.',
    keyPoints: [
      'Longer string → slower swing (longer period).',
      'Mass of the bob does not change the period.',
      'Period T = 2π√(L/g) for small angles.',
    ],
    formulaTex: 'T = 2\\pi\\sqrt{\\frac{L}{g}}',
    example: 'A 1 m pendulum on Earth (g ≈ 9.8 m/s²) takes about 2 seconds per full swing.',
    exampleTex: 'T = 2\\pi\\sqrt{\\frac{1}{9.8}} \\approx 2.0\\ \\text{s}',
    quiz: [
      OfflineQuestion('If the string is made 4 times longer, the period becomes…', ['4× longer', '2× longer', 'Half', 'Same'], 1,
          'T ∝ √L, and √4 = 2.'),
      OfflineQuestion('Doubling the bob\'s mass makes the period…', ['Double', 'Half', 'Unchanged', 'Four times'], 2,
          'Mass does not appear in T = 2π√(L/g).'),
      OfflineQuestion('On the Moon (weaker gravity) a pendulum swings…', ['Faster', 'Slower', 'The same', 'Not at all'], 1,
          'Smaller g gives a larger period.'),
    ],
  ),
  Topic(
    title: 'Projectile motion',
    keywords: ['projectile', 'trajectory', 'launch angle', 'projectile motion'],
    summary:
        'A projectile is anything thrown or launched that then moves only under gravity. Its horizontal speed stays constant while gravity pulls its vertical speed down, so its path is a parabola.',
    keyPoints: [
      'Horizontal and vertical motion are independent.',
      'Ignoring air resistance, maximum range is at a 45° launch angle.',
      'Range R = v² sin(2θ) / g on level ground.',
    ],
    formulaTex: 'R = \\frac{v^2 \\sin 2\\theta}{g}',
    example: 'A ball kicked at 20 m/s at 45° lands about 41 m away (no air resistance).',
    exampleTex: 'R = \\frac{20^2 \\sin 90^\\circ}{9.8} \\approx 40.8\\ \\text{m}',
    quiz: [
      OfflineQuestion('Which launch angle gives the longest range (no air)?', ['30°', '45°', '60°', '90°'], 1, 'sin(2θ) is largest when 2θ = 90°.'),
      OfflineQuestion('The path of a projectile is a…', ['Circle', 'Straight line', 'Parabola', 'Spiral'], 2,
          'Constant horizontal speed plus constant downward acceleration gives a parabola.'),
      OfflineQuestion('At the top of its flight, the vertical speed is…', ['Maximum', 'Zero', 'Equal to g', 'Negative'], 1,
          'It stops rising before it starts falling.'),
    ],
  ),
  Topic(
    title: 'The water cycle',
    keywords: ['water cycle', 'evaporation', 'condensation', 'precipitation', 'where water comes from', 'sources of water'],
    summary:
        'Water moves in a loop between the land, sea and sky. The sun heats water so it evaporates, the vapour cools and condenses into clouds, and it falls back as rain or snow (precipitation), then collects and flows back to the sea.',
    keyPoints: [
      'Evaporation: liquid water → water vapour (heat from the sun).',
      'Condensation: vapour cools → tiny droplets → clouds.',
      'Precipitation: rain, snow, hail. Collection: rivers, lakes, groundwater.',
    ],
    example: 'Water droplets forming on the outside of a cold glass is condensation — the same process that makes clouds.',
    quiz: [
      OfflineQuestion('Clouds form mainly by…', ['Evaporation', 'Condensation', 'Precipitation', 'Melting'], 1,
          'Rising vapour cools and condenses into droplets.'),
      OfflineQuestion('What provides the energy for evaporation?', ['The Moon', 'Wind only', 'The Sun', 'Clouds'], 2, 'Sunlight heats the water.'),
      OfflineQuestion('Rain and snow are examples of…', ['Collection', 'Precipitation', 'Transpiration', 'Condensation'], 1,
          'Precipitation is water falling from clouds.'),
    ],
  ),
  Topic(
    title: 'Waves',
    keywords: ['wave', 'waves', 'wavelength', 'frequency', 'amplitude', 'sound wave'],
    summary:
        'A wave carries energy from place to place without carrying the material with it. Amplitude is how big the disturbance is, wavelength is the distance between repeating points, and frequency is how many waves pass each second.',
    keyPoints: [
      'Wave speed = frequency × wavelength.',
      'Bigger amplitude → more energy (louder sound, brighter light).',
      'Higher frequency → higher pitch for sound.',
    ],
    formulaTex: 'v = f \\lambda',
    example: 'A sound of 340 Hz travelling at 340 m/s has a wavelength of 1 m.',
    exampleTex: '\\lambda = \\frac{v}{f} = \\frac{340}{340} = 1\\ \\text{m}',
    quiz: [
      OfflineQuestion('A wave has f = 5 Hz and λ = 2 m. Its speed is…', ['2.5 m/s', '7 m/s', '10 m/s', '3 m/s'], 2, 'v = fλ = 5 × 2 = 10 m/s.'),
      OfflineQuestion('Which property decides how loud a sound is?', ['Frequency', 'Amplitude', 'Wavelength', 'Speed'], 1,
          'Larger amplitude carries more energy.'),
      OfflineQuestion('Higher frequency sound has a…', ['Lower pitch', 'Higher pitch', 'Louder volume', 'Longer wavelength'], 1,
          'Pitch rises with frequency.'),
    ],
  ),
  Topic(
    title: 'Area of a circle',
    keywords: ['circle', 'radius', 'diameter', 'circumference', 'area of circle'],
    summary:
        'The area of a circle is π times the radius squared. The radius is the distance from the centre to the edge; the diameter is twice the radius.',
    keyPoints: [
      'Area A = πr².',
      'Circumference C = 2πr = πd.',
      'π ≈ 3.14 or 22/7.',
    ],
    formulaTex: 'A = \\pi r^2',
    example: 'A circle with radius 7 cm has area about 154 cm² (using π ≈ 22/7).',
    exampleTex: 'A = \\frac{22}{7} \\times 7^2 = 154\\ \\text{cm}^2',
    quiz: [
      OfflineQuestion('Radius 10 cm. Area (π ≈ 3.14)?', ['31.4 cm²', '314 cm²', '62.8 cm²', '100 cm²'], 1, '3.14 × 10² = 314.'),
      OfflineQuestion('If the diameter is 12 cm, the radius is…', ['24 cm', '6 cm', '12 cm', '3 cm'], 1, 'Radius is half the diameter.'),
      OfflineQuestion('Doubling the radius makes the area…', ['Double', 'Four times', 'Half', 'Same'], 1, 'Area ∝ r², and 2² = 4.'),
    ],
  ),
  Topic(
    title: 'Prime numbers',
    keywords: ['prime', 'primes', 'composite', 'factor'],
    summary:
        'A prime number is a whole number greater than 1 whose only factors are 1 and itself. Numbers with more factors are composite. 1 is neither prime nor composite.',
    keyPoints: [
      'The first primes: 2, 3, 5, 7, 11, 13, 17, 19, 23, 29.',
      '2 is the only even prime.',
      'Every whole number above 1 can be written as a product of primes.',
    ],
    example: '12 = 2 × 2 × 3, so 12 is composite; 13 has only the factors 1 and 13, so it is prime.',
    quiz: [
      OfflineQuestion('Which is prime?', ['21', '27', '29', '33'], 2, '29 has no factors other than 1 and 29.'),
      OfflineQuestion('How many even primes are there?', ['None', 'One', 'Two', 'Infinitely many'], 1, 'Only 2.'),
      OfflineQuestion('Is 1 prime?', ['Yes', 'No'], 1, 'A prime needs exactly two different factors.'),
    ],
  ),
  Topic(
    title: 'Percentages',
    keywords: ['percent', 'percentage', '%', 'discount'],
    summary:
        'Per cent means "out of 100". To find a percentage of an amount, divide by 100 and multiply by the percentage.',
    keyPoints: [
      '50% = 1/2, 25% = 1/4, 10% = 1/10.',
      'x% of y = (x/100) × y.',
      'Percentage change = (change ÷ original) × 100.',
    ],
    formulaTex: 'x\\% \\text{ of } y = \\frac{x}{100} \\times y',
    example: '20% off a ₹500 shirt saves ₹100, so it costs ₹400.',
    exampleTex: '\\frac{20}{100} \\times 500 = 100',
    quiz: [
      OfflineQuestion('What is 25% of 80?', ['20', '25', '40', '8'], 0, '80 ÷ 4 = 20.'),
      OfflineQuestion('A price rises from 200 to 250. Percentage increase?', ['50%', '25%', '20%', '5%'], 1, '50 ÷ 200 × 100 = 25%.'),
      OfflineQuestion('10% as a fraction is…', ['1/100', '1/10', '1/5', '10/1'], 1, '10/100 = 1/10.'),
    ],
  ),
  Topic(
    title: 'Linear equations',
    keywords: ['linear equation', 'linear equations', 'solve for x', 'balance method', 'simple equation', 'simple equations'],
    summary:
        'An equation is a balance: both sides are equal. To find the unknown, do the same thing to both sides until the letter is alone. Undo additions with subtraction and multiplications with division, in the reverse order they were done.',
    keyPoints: [
      'Whatever you do to one side, do to the other.',
      'Undo operations in reverse order: first + and −, then × and ÷.',
      'Check the answer by putting it back into the original equation.',
    ],
    formulaTex: 'ax + b = c \\;\\Rightarrow\\; x = \\frac{c - b}{a}',
    example: 'Solve 2x + 5 = 15. Subtract 5 from both sides: 2x = 10. Divide both sides by 2: x = 5. Check: 2 × 5 + 5 = 15, so x = 5 is right.',
    exampleTex: '2x + 5 = 15 \\;\\Rightarrow\\; 2x = 10 \\;\\Rightarrow\\; x = 5',
    quiz: [
      OfflineQuestion('Solve 3x − 4 = 11.', ['x = 5', 'x = 7/3', 'x = 15', 'x = 3'], 0, 'Add 4: 3x = 15, divide by 3: x = 5.'),
      OfflineQuestion('First step to solve x/4 + 2 = 6?', ['Multiply by 4', 'Subtract 2 from both sides', 'Divide by 4', 'Add 2'], 1,
          'Undo the + 2 first: x/4 = 4, then multiply by 4: x = 16.'),
      OfflineQuestion('Is x = 2 a solution of 5x + 1 = 12?', ['Yes', 'No'], 1, '5 × 2 + 1 = 11, not 12.'),
    ],
  ),
  Topic(
    title: 'Monsoon',
    keywords: ['monsoon', 'monsoons', 'south-west monsoon', 'southwest monsoon', 'retreating monsoon'],
    summary:
        'The monsoon is a seasonal reversal of winds. In summer the land heats faster than the sea, forming low pressure over north-west India; moist south-west winds blow in from the Indian Ocean and bring about three-quarters of India\'s rain between June and September. In winter the land cools, the winds reverse, and the retreating north-east monsoon brings rain to the Tamil Nadu coast.',
    keyPoints: [
      'Cause: unequal heating of land and sea creates low pressure over land in summer.',
      'The south-west monsoon splits into the Arabian Sea branch and the Bay of Bengal branch.',
      'Relief matters: the Western Ghats and the Khasi hills force the winds up, so the windward side gets heavy rain (Mawsynram) and the leeward side stays dry.',
      'Break in the monsoon: dry spells of days or weeks inside the rainy season.',
    ],
    example: 'Mumbai, on the windward side of the Western Ghats, gets over 2,000 mm of rain a year; Pune, just across the Ghats in the rain shadow, gets about 700 mm.',
    quiz: [
      OfflineQuestion('The south-west monsoon is caused mainly by…', ['Earth\'s rotation only', 'Unequal heating of land and sea', 'Ocean currents', 'Volcanoes'], 1,
          'Hot land makes low pressure; moist air flows in from the cooler sea.'),
      OfflineQuestion('Which place in India gets the most rain?', ['Jaisalmer', 'Mawsynram', 'Delhi', 'Chennai'], 1, 'Moist Bay of Bengal winds rise over the Khasi hills.'),
      OfflineQuestion('Which coast gets rain from the retreating monsoon?', ['Konkan', 'Tamil Nadu (Coromandel)', 'Gujarat', 'Malabar'], 1,
          'North-east winds pick up moisture over the Bay of Bengal.'),
    ],
  ),
];

/// The topic [text] is about: the one whose keyword matches as a whole word
/// or phrase with the most letters. [subject] (the lesson's) breaks ties
/// between topics of different subjects.
Topic? findTopic(String text, {String? subject}) {
  final t = ' ${text.toLowerCase()} ';
  final subj = subject?.toLowerCase();
  Topic? best;
  var bestScore = 0;
  for (final topic in topics) {
    final inSubject = subj != null && topic.subjects.any((x) => x.toLowerCase() == subj);
    for (final k in topic.keywords) {
      final score = k.length * 2 + (inSubject ? 1 : 0);
      if (score <= bestScore || !_hasWord(t, k)) continue;
      best = topic;
      bestScore = score;
    }
  }
  return best;
}

final _wordCache = <String, RegExp>{};

/// [k] appears in [t] as a whole word or phrase, or its plural ("range" is
/// not in "arrange").
bool _hasWord(String t, String k) {
  if (!t.contains(k)) return false;
  final re = _wordCache.putIfAbsent(k, () {
    final e = RegExp.escape(k);
    final start = RegExp(r'^\w').hasMatch(k) ? r'(?<![\w])' : '';
    // A plural still counts: "percentages" matches "percentage".
    final end = RegExp(r'\w$').hasMatch(k) ? r'(?:e?s)?(?![\w])' : '';
    return RegExp('$start$e$end');
  });
  return re.hasMatch(t);
}

const topicActivities = <String, String>{
  'Number systems':
      'Number sort (8 min): write 12 numbers on the board (−3, 0, 5, 2/3, 0.75, 0.333…, √2, √16, π, −1.5, 22/7, 1.010010001…). Pairs sort them into Natural / Whole / Integer / Rational / Irrational, then each pair defends one tricky choice to the class.',
  'Pythagoras theorem':
      'Measure and check (10 min): groups draw three right triangles with sides of their choice on grid paper, measure all sides, and test whether a² + b² = c². Then they find a 3-4-5 triangle in the classroom (door frame, desk corner).',
  'Photosynthesis':
      'Leaf detectives (10 min): groups list everything a plant needs and everything it gives out, then arrange the cards into the photosynthesis equation. Bonus: explain why a plant in a dark cupboard turns yellow.',
  'Fractions':
      'Fraction wall race (8 min): pairs fold paper strips into halves, quarters and eighths, then race to show three pairs of equivalent fractions and one addition such as 1/4 + 1/8.',
  "Newton's laws of motion":
      'Law hunt (8 min): pupils act out a short situation (pushing a desk, stopping suddenly, jumping off a skateboard) and the class names which law it shows and why.',
  'Simple pendulum':
      'Pendulum timing (10 min): groups hang a weight on a string, time 10 swings for two different lengths, and compare with T = 2π√(L/g). Does changing the weight change the time?',
  'Projectile motion':
      'Paper-ball launch (10 min): pupils flick a paper ball at 30°, 45° and 60° from the same spot, mark where it lands, and discuss which angle went furthest.',
  'The water cycle':
      'Cycle in a bag (5 min to set up): a zip bag with a little water taped to a sunny window; pupils predict and later observe evaporation and condensation on the bag.',
  'Waves':
      'Rope waves (8 min): two pupils shake a rope slowly then quickly; the class describes how wavelength changes when frequency increases.',
  'Area of a circle':
      'Cut and rearrange (10 min): pupils cut a paper circle into 8 sectors and rearrange them into a near-rectangle to see why A = πr².',
  'Prime numbers':
      'Sieve of Eratosthenes (10 min): on a 1–100 grid pupils cross out multiples of 2, 3, 5 and 7; what is left are the primes. Count them.',
  'Linear equations':
      'Equation relay (8 min): each row gets a chain of five equations; the answer to one is the number used in the next. First row to reach the end with every answer checked by substitution wins.',
  'Monsoon':
      'Rain map (10 min): give an outline map of India with annual rainfall for eight cities; pairs shade wet and dry regions, draw the two monsoon branches with arrows, and explain why the Western Ghats split Mumbai and Pune.',
  'Percentages':
      'Shop sale (8 min): give a price list and discount tags (10%, 25%, 50%); pairs work out sale prices and decide which offer saves the most.',
};

const topicRealLife = <String, String>{
  'Number systems': 'Money is rational (₹12.50 = 1250/100). The diagonal of a 1 m square tile is √2 m — a length you can draw but never write exactly as a decimal.',
  'Pythagoras theorem': 'A 5 m ladder with its foot 3 m from a wall reaches 4 m up — builders use 3-4-5 to check corners are square.',
  'Photosynthesis': 'Every bite of rice, dal or fruit started as sunlight caught by a leaf — plants are the kitchen of the whole food chain.',
  'Fractions': 'Cutting a roti into 4 equal pieces and eating 1 means you ate 1/4 of it.',
  "Newton's laws of motion": 'You lurch forward when a bus brakes (1st law); a cricket ball needs a harder hit to go faster (2nd law); a rocket pushes gas down and goes up (3rd law).',
  'Simple pendulum': 'A child on a swing is a pendulum: a longer rope makes each swing slower, whatever the child weighs.',
  'Projectile motion': 'A thrown cricket ball, a basketball shot and water from a hose all follow the same curved path — a parabola.',
  'The water cycle': 'Wet clothes drying on a line is evaporation; drops on a cold glass of water is condensation.',
  'Waves': 'Ripples on a pond, sound from a speaker and the light from your phone are all waves carrying energy.',
  'Area of a circle': 'How much pizza you get depends on area: a 12-inch pizza has about 1.4 times the area of a 10-inch one.',
  'Prime numbers': 'Your UPI and bank apps are kept safe by the fact that multiplying two huge primes is easy but splitting the result back is very hard.',
  'Linear equations': 'If 2 notebooks and a ₹5 pen cost ₹15, one notebook costs ₹5 — you just solved 2x + 5 = 15 in your head.',
  'Monsoon': 'Farmers across India sow kharif crops like rice when the first monsoon rains arrive in June; a late monsoon means higher vegetable prices.',
  'Percentages': 'A "20% off" sale on a ₹500 shirt saves ₹100; exam marks out of 80 are turned into a percentage to compare.',
};

const topicMistakes = <String, List<String>>{
  'Number systems': ['Thinking every square root is irrational — √9 = 3 and √16 = 4 are rational.', 'Forgetting 0 is a whole number but not a natural number.', 'Calling 22/7 equal to π — it is only an approximation.'],
  'Pythagoras theorem': ['Adding the squares when finding a shorter side — subtract: a² = c² − b².', 'Using it on a triangle with no right angle.', 'Forgetting to take the square root at the end.'],
  'Photosynthesis': ['Saying plants take in oxygen for photosynthesis — they take in carbon dioxide and give out oxygen.', 'Forgetting light and chlorophyll are needed.', 'Mixing it up with respiration, which happens all the time in every living cell.'],
  'Fractions': ['Adding denominators: 1/2 + 1/3 is not 2/5.', 'Not simplifying the final answer.', 'Forgetting to flip the second fraction when dividing.'],
  "Newton's laws of motion": ['Thinking a moving object needs a force to keep moving.', 'Using mass in grams in F = ma — use kilograms.', 'Believing action and reaction cancel — they act on different objects.'],
  'Simple pendulum': ['Thinking a heavier bob swings faster — mass does not change the period.', 'Measuring length to the top of the bob instead of its centre.', 'Timing one swing instead of 10 and dividing.'],
  'Projectile motion': ['Letting gravity change the horizontal speed — only vertical speed changes.', 'Forgetting the angle for maximum range is 45° on level ground.', 'Mixing up time of flight and time to the top.'],
  'The water cycle': ['Saying clouds are water vapour — they are tiny liquid droplets.', 'Leaving out collection/runoff.', 'Mixing up evaporation and condensation.'],
  'Waves': ['Confusing amplitude with wavelength.', 'Thinking the medium travels with the wave — energy travels, particles oscillate.', 'Forgetting v = f × λ units (m/s, Hz, m).'],
  'Area of a circle': ['Using the diameter instead of the radius in πr².', 'Mixing up area (πr²) and circumference (2πr).', 'Forgetting square units, e.g. cm².'],
  'Prime numbers': ['Calling 1 a prime — it has only one factor.', 'Thinking all odd numbers are prime (9, 15, 21 are not).', 'Forgetting 2 is the only even prime.'],
  'Linear equations': ['Doing an operation to one side only.', 'Dividing before undoing the addition: in 2x + 5 = 15, subtract 5 first.', 'Sign slips when moving a term: + 5 becomes − 5 on the other side.'],
  'Monsoon': ['Saying the monsoon is just "rain" — it is a seasonal reversal of winds.', 'Mixing up windward and leeward sides of the Ghats.', 'Forgetting the retreating monsoon brings winter rain to Tamil Nadu.'],
  'Percentages': ['Taking a percentage of the wrong amount (of the new price instead of the original).', 'Adding percentage changes: +10% then −10% is not back to the start.', 'Forgetting to divide by 100.'],
};
