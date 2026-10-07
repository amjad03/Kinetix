import '../features/board/kit/subjects.dart' show KitTab;

/// One concept video linked to a demo class's topic. The YouTube ids are placeholders until
/// the KINETIX channel's own videos are linked (YouTube then says "Video unavailable").
typedef DemoVideo = ({String id, String youtube, String title, String lang, int seconds});

/// One step of today's lesson plan.
typedef DemoStep = ({int minutes, String activity});

/// A question from the class's bank (exit tickets and worksheets in the demo).
typedef DemoQuestion = ({String q, List<String> options, int answer});

/// A class the demo board can open: a day at an institution like Soundarya Educational Trust,
/// Bangalore (CBSE school, PU college, degree colleges), from UKG to the third year of a BSc.
/// Each brings its roster, today's plan, a syllabus topic, concept videos and the labs, 3D
/// models, PhET sims and animations that fit it, so switching class shows a relevant board.
class DemoClass {
  const DemoClass({
    required this.id,
    required this.section,
    required this.subject,
    required this.teacher,
    required this.startsAt,
    required this.endsAt,
    required this.room,
    required this.institution,
    required this.syllabus,
    required this.chapter,
    required this.topicId,
    required this.topic,
    required this.summary,
    required this.objectives,
    required this.steps,
    required this.materials,
    required this.assessment,
    required this.homework,
    required this.roster,
    required this.rollPrefix,
    required this.videos,
    this.level,
    this.term,
    this.labs = const [],
    this.models = const [],
    this.phet = const [],
    this.animations = const [],
    this.kitTab,
    this.primaryActivity,
    this.quiz = const [],
  });

  final String id, section, subject, teacher, startsAt, endsAt, room, institution, syllabus, chapter, topicId, topic, summary;

  /// 'k12', 'pu', 'ug' or 'pg' (null: as the server seeds the default class).
  final String? level;

  /// The grade or semester (UKG is 0).
  final int? term;
  final List<String> objectives;
  final List<DemoStep> steps;
  final List<String> materials;
  final String assessment, homework;
  final List<String> roster;
  final String rollPrefix;
  final List<DemoVideo> videos;

  /// Lab ids (packages/kinetix_labs), 3D model ids (packages/kinetix_3d), PhET sim ids and
  /// animation ids (packages/kinetix_animations), best first.
  final List<String> labs, models, phet, animations;

  /// The subject kit's tab that fits the lesson.
  final KitTab? kitTab;

  /// For the little ones: the primary activity the lesson starts with (lib/features/primary).
  final String? primaryActivity;

  /// Questions on today's topic (the assessment generator's demo bank).
  final List<DemoQuestion> quiz;

  String get period => '$startsAt–$endsAt';

  /// The default class (the one the demo server has always opened in).
  bool get isDefault => id == DemoClasses.defaultId;
}

/// The demo day's timetable, in time order.
abstract final class DemoClasses {
  static const defaultId = 'bcom3a';

  static DemoClass byId(String id) => all.firstWhere((c) => c.id == id, orElse: () => all.firstWhere((c) => c.id == defaultId));

  static const all = <DemoClass>[
    DemoClass(
      id: 'cbse10',
      section: 'Class 10 B',
      subject: 'Science',
      teacher: 'Kavya Menon',
      startsAt: '08:30',
      endsAt: '09:15',
      room: 'Science block, room 12',
      institution: 'Soundarya Central School (CBSE)',
      syllabus: 'CBSE Class 10 · NCERT Science',
      chapter: 'Light – Reflection and Refraction',
      topicId: 'cb10-light-2',
      topic: 'Refraction through a glass slab',
      summary: 'Light bends towards the normal entering glass and away from it leaving; the emergent ray is parallel to the incident ray.',
      level: 'k12',
      term: 10,
      objectives: ['Trace the path of a ray through a rectangular glass slab', 'State the laws of refraction', 'Find the refractive index from n = sin i / sin r'],
      steps: [
        (minutes: 5, activity: 'Hook: the pencil in a glass of water looks broken. Why?'),
        (minutes: 15, activity: 'Glass slab lab on the board: measure i and r for three angles'),
        (minutes: 15, activity: 'PhET Bending Light: change the medium and watch the ray'),
        (minutes: 10, activity: 'Exit ticket: three questions on the laws of refraction'),
      ],
      materials: ['NCERT Science ch. 9', 'Glass slab, pins, protractor'],
      assessment: 'Exit ticket: draw the refracted and emergent rays; state Snell\'s law.',
      homework: 'NCERT exercise 9, Q8–10.',
      roster: [
        'Aditi Rao', 'Arjun Nair', 'Bhoomika S', 'Darshan Gowda', 'Diya Shetty', 'Eshan Kulkarni', 'Gagan M', 'Hamsa Prakash', //
        'Ishaan Reddy', 'Jahnavi K', 'Kiran Patil', 'Meghana Bhat', 'Nikhil Joshi', 'Pooja Hegde', 'Rohan Desai', 'Sanjana Iyer',
      ],
      rollPrefix: '10B',
      videos: [
        (id: 'cv-cb1', youtube: 'kxDemoLt01a', title: 'Refraction of light through a glass slab', lang: 'en', seconds: 402),
        (id: 'cv-cb2', youtube: 'kxDemoLt02h', title: 'प्रकाश का अपवर्तन: काँच की सिल्ली', lang: 'hi', seconds: 388),
        (id: 'cv-cb3', youtube: 'kxDemoLt03k', title: 'ಬೆಳಕಿನ ವಕ್ರೀಭವನ: ಗಾಜಿನ ಚಪ್ಪಡಿ', lang: 'kn', seconds: 365),
      ],
      labs: ['glass-slab', 'lab.lens-mirror', 'prism'],
      models: ['eye'],
      phet: ['bending-light', 'geometric-optics-basics'],
      animations: ['refraction'],
      kitTab: KitTab.physics,
      quiz: [
        (q: 'A ray of light passes from air into glass. It bends…', options: ['towards the normal', 'away from the normal', 'along the surface', 'not at all'], answer: 0),
        (q: 'The refractive index of a medium is…', options: ['sin r / sin i', 'sin i / sin r', 'i × r', 'i − r'], answer: 1),
        (q: 'The emergent ray from a rectangular glass slab is…', options: ['perpendicular to the incident ray', 'parallel to the incident ray', 'along the normal', 'reflected back'], answer: 1),
      ],
    ),
    DemoClass(
      id: 'bscfor3',
      section: 'BSc Forensic Science Sem 3',
      subject: 'Forensic Chemistry',
      teacher: 'Dr. Ravi Shankar',
      startsAt: '09:30',
      endsAt: '10:25',
      room: 'Forensic lab 2',
      institution: 'Soundarya Institute of Management and Science',
      syllabus: 'Bengaluru City University · BSc Forensic Science (NEP)',
      chapter: 'Forensic Toxicology',
      topicId: 'fs3-tox-1',
      topic: 'Presumptive spot tests for drugs and poisons',
      summary: 'Colour tests (Marquis, Mandelin, Dille–Koppanyi) screen an exhibit quickly; a positive result is confirmed by TLC or GC–MS.',
      level: 'ug',
      term: 3,
      objectives: ['Explain why spot tests are presumptive, not confirmatory', 'Read the colour charts of common reagents', 'Plan the chain of custody for a toxicology exhibit'],
      steps: [
        (minutes: 5, activity: 'Case file: an unknown white powder found at a scene'),
        (minutes: 20, activity: 'Virtual lab: toxicology spot tests, then flame tests for metal poisons'),
        (minutes: 15, activity: 'Ink chromatography: matching a questioned document'),
        (minutes: 15, activity: 'Exit ticket and worksheet on presumptive vs confirmatory tests'),
      ],
      materials: ['Forensic Chemistry, unit 3', 'Reagent colour chart'],
      assessment: 'Worksheet: identify the drug class from three colour results; name the confirmatory test.',
      homework: 'Write a 300-word lab report on the spot tests, with the chain-of-custody form.',
      roster: [
        'Akshay Kumar R', 'Bindu Shree', 'Chandana N', 'Dhanush Raj', 'Fathima Zehra', 'Girish B', 'Harini V', 'Imran Pasha', //
        'Keerthana L', 'Mohan Das', 'Nandini Gowda', 'Prajwal S', 'Rakshitha M', 'Sahana P',
      ],
      rollPrefix: 'U03FS',
      videos: [
        (id: 'cv-fs1', youtube: 'kxDemoFs01a', title: 'Presumptive colour tests in forensic toxicology', lang: 'en', seconds: 540),
        (id: 'cv-fs2', youtube: 'kxDemoFs02a', title: 'TLC and GC–MS: confirming the spot test', lang: 'en', seconds: 610),
      ],
      labs: ['toxicology-spot-tests', 'flame-test', 'ink-chromatography', 'fingerprint-patterns', 'glass-refractive-index'],
      models: ['molecules', 'crystal_lattices'],
      phet: ['beers-law-lab', 'molecule-shapes', 'ph-scale'],
      animations: ['atomic-structure', 'electrolysis'],
      kitTab: KitTab.periodic,
      quiz: [
        (q: 'A spot (colour) test on a seized powder is…', options: ['confirmatory', 'presumptive', 'quantitative', 'not admissible'], answer: 1),
        (q: 'The Marquis reagent is used to screen for…', options: ['opiates and amphetamines', 'heavy metals', 'blood groups', 'gunshot residue'], answer: 0),
        (q: 'Which technique confirms the identity of a drug?', options: ['Flame test', 'GC–MS', 'Litmus test', 'Fingerprint powder'], answer: 1),
      ],
    ),
    DemoClass(
      id: defaultId,
      section: 'BCom Sem 3 A',
      subject: 'Corporate Accounting',
      teacher: 'Anita Sharma',
      startsAt: '10:00',
      endsAt: '10:55',
      room: 'Room 204',
      institution: 'Soundarya Institute of Management and Science',
      syllabus: 'Bengaluru City University · BCom Semester 3',
      chapter: 'Issue of Shares',
      topicId: 't5',
      topic: 'Re-issue of forfeited shares',
      summary: 'Forfeited shares re-issued at a discount; the gain goes to capital reserve.',
      objectives: ['Pass journal entries for re-issue of forfeited shares', 'Transfer the gain to capital reserve'],
      steps: [
        (minutes: 5, activity: 'Recap: forfeiture entries from the last class'),
        (minutes: 20, activity: 'Worked example: 500 shares re-issued at ₹8 paid up as ₹10'),
        (minutes: 20, activity: 'Pairs solve Exercise 4.3, Q1–2'),
        (minutes: 10, activity: 'Exit ticket: one re-issue entry each'),
      ],
      materials: ['Textbook ch. 4.3', 'Calculator'],
      assessment: 'Exit ticket: the re-issue entry and the capital reserve transfer.',
      homework: 'Exercise 4.3, Q3–5.',
      roster: [
        'Aarav Patel', 'Ananya Gowda', 'Bhavya Reddy', 'Chetan Naik', 'Deepika Hegde', 'Farhan Khan', //
        'Gauri Shetty', 'Harsh Jain', 'Ishita Rao', 'Karthik Murthy', 'Lakshmi Iyer', 'Manoj Bhat',
      ],
      rollPrefix: 'U03BC',
      videos: [
        (id: 'cv1', youtube: 'kxDemoRe01a', title: 'Re-issue of forfeited shares in 6 minutes', lang: 'en', seconds: 372),
        (id: 'cv2', youtube: 'kxDemoRe02b', title: 'Capital reserve on re-issue: worked example', lang: 'en', seconds: 455),
        (id: 'cv3', youtube: 'kxDemoRe03h', title: 'ज़ब्त शेयरों का पुनः निर्गमन', lang: 'hi', seconds: 410),
      ],
      labs: ['lab.break-even', 'lab.graph-plotter'],
      animations: ['circular-flow-of-income'],
      kitTab: KitTab.accounts,
      quiz: [
        (q: 'On re-issue of forfeited shares, the gain is transferred to…', options: ['General reserve', 'Capital reserve', 'Securities premium', 'Profit and loss'], answer: 1),
        (q: 'Forfeited shares can be re-issued at a discount up to…', options: ['the amount forfeited on them', '10% of face value', 'any amount', 'nothing'], answer: 0),
        (q: 'Which account is debited with the discount on re-issue?', options: ['Share capital', 'Share forfeiture', 'Bank', 'Calls in arrears'], answer: 1),
      ],
    ),
    DemoClass(
      id: 'bca1b',
      section: 'BCA Sem 1 B',
      subject: 'Programming in C',
      teacher: 'Prakash Kulkarni',
      startsAt: '11:10',
      endsAt: '12:05',
      room: 'Computer lab 1',
      institution: 'Soundarya Institute of Management and Science',
      syllabus: 'Bengaluru City University · BCA Semester 1',
      chapter: 'Control Structures',
      topicId: 'bca1-loops',
      topic: 'Loops in C: for, while and do-while',
      summary: 'A loop repeats a block while a condition holds; for counts, while checks first, do-while runs at least once.',
      level: 'ug',
      term: 1,
      objectives: ['Write for, while and do-while loops', 'Trace a loop by hand with a table', 'Choose the right loop for a problem'],
      steps: [
        (minutes: 5, activity: 'Hook: print 1 to 100 without writing 100 printf lines'),
        (minutes: 20, activity: 'Code lab: sum of digits with while, then with for'),
        (minutes: 15, activity: 'Algorithm visualiser: trace bubble sort\'s nested loops'),
        (minutes: 15, activity: 'Exit ticket: predict the output of three loops'),
      ],
      materials: ['Let Us C, ch. 3', 'Code lab on the board'],
      assessment: 'Exit ticket: output-prediction questions on for and do-while.',
      homework: 'Programs: factorial, Fibonacci series and a number pyramid.',
      roster: [
        'Abhishek Gowda', 'Aishwarya R', 'Bharath Kumar', 'Chaitra S', 'Dinesh Babu', 'Kavya Shree', 'Likith M', 'Mahima Jain', //
        'Naveen Raj', 'Pavithra K', 'Rahul Verma', 'Shreya Naidu', 'Tejas Rao', 'Varun Hegde',
      ],
      rollPrefix: 'U01CA',
      videos: [
        (id: 'cv-ca1', youtube: 'kxDemoCl01a', title: 'Loops in C: for, while and do-while', lang: 'en', seconds: 498),
        (id: 'cv-ca2', youtube: 'kxDemoCl02k', title: 'C ಭಾಷೆಯಲ್ಲಿ ಲೂಪ್‌ಗಳು', lang: 'kn', seconds: 452),
      ],
      animations: ['packet-switching'],
      kitTab: KitTab.algorithms,
      quiz: [
        (q: 'Which loop always runs its body at least once?', options: ['for', 'while', 'do-while', 'none'], answer: 2),
        (q: 'for (i = 0; i < 5; i++) runs the body how many times?', options: ['4', '5', '6', 'forever'], answer: 1),
        (q: 'Which statement leaves a loop at once?', options: ['continue', 'break', 'return 0;', 'goto start'], answer: 1),
      ],
    ),
    DemoClass(
      id: 'bba2a',
      section: 'BBA Sem 2 A',
      subject: 'Marketing Management',
      teacher: 'Dr. Shalini Rao',
      startsAt: '12:10',
      endsAt: '13:05',
      room: 'Room 310',
      institution: 'Soundarya Institute of Management and Science',
      syllabus: 'Bengaluru City University · BBA Semester 2',
      chapter: 'Marketing Mix',
      topicId: 'bba2-4p',
      topic: 'The marketing mix: product, price, place and promotion',
      summary: 'The 4 Ps are the levers a firm sets for a target market; services add people, process and physical evidence.',
      level: 'ug',
      term: 2,
      objectives: ['Explain the 4 Ps with an Indian brand', 'Extend to the 7 Ps for services', 'Use break-even to test a price'],
      steps: [
        (minutes: 5, activity: 'Hook: why is a Parle-G still ₹5?'),
        (minutes: 20, activity: 'Case: the 4 Ps of a Bengaluru coffee chain (management kit)'),
        (minutes: 15, activity: 'Break-even lab: what happens to volume when the price drops'),
        (minutes: 15, activity: 'Groups of four: build a SWOT and a marketing mix for a new product'),
      ],
      materials: ['Kotler, Principles of Marketing, ch. 2', 'Case sheet'],
      assessment: 'Exit ticket: one P each, with an example.',
      homework: 'Analyse the marketing mix of a brand of your choice (one page).',
      roster: [
        'Aditya Menon', 'Akanksha Singh', 'Deeksha Gowda', 'Gautham Raj', 'Isha Kapoor', 'Jeevan K', 'Kriti Agarwal', 'Mithun S', //
        'Nisha Fernandes', 'Pranav Iyer', 'Ritika Jain', 'Sameer Khan', 'Tanvi Shetty', 'Yash Patel',
      ],
      rollPrefix: 'U02BB',
      videos: [
        (id: 'cv-bb1', youtube: 'kxDemoMk01a', title: 'The 4 Ps of marketing with Indian brands', lang: 'en', seconds: 520),
        (id: 'cv-bb2', youtube: 'kxDemoMk02h', title: 'मार्केटिंग मिक्स: 4P', lang: 'hi', seconds: 470),
      ],
      labs: ['lab.break-even'],
      animations: ['circular-flow-of-income'],
      kitTab: KitTab.management,
      quiz: [
        (q: 'The 4 Ps of the marketing mix are product, price, place and…', options: ['people', 'promotion', 'process', 'profit'], answer: 1),
        (q: 'A distribution channel is part of which P?', options: ['Product', 'Price', 'Place', 'Promotion'], answer: 2),
        (q: 'The extra 3 Ps for services are people, process and…', options: ['physical evidence', 'packaging', 'positioning', 'publicity'], answer: 0),
      ],
    ),
    DemoClass(
      id: 'puc2',
      section: 'II PUC Science A',
      subject: 'Physics',
      teacher: 'Suresh Hegde',
      startsAt: '14:00',
      endsAt: '14:55',
      room: 'PU block, room 4',
      institution: 'Soundarya PU College',
      syllabus: 'Karnataka II PUC · Physics (NCERT Part 1)',
      chapter: 'Current Electricity',
      topicId: 'puc2-kirchhoff',
      topic: "Kirchhoff's laws and the metre bridge",
      summary: 'The junction rule conserves charge, the loop rule conserves energy; a balanced metre bridge gives an unknown resistance.',
      level: 'pu',
      term: 12,
      objectives: ["Apply Kirchhoff's junction and loop rules", 'Derive the Wheatstone bridge condition', 'Find an unknown resistance with a metre bridge'],
      steps: [
        (minutes: 5, activity: 'Recap: Ohm\'s law and resistors in series and parallel'),
        (minutes: 15, activity: "Kirchhoff's laws lab: measure the currents at a junction"),
        (minutes: 20, activity: 'Metre bridge lab: find the balance point, then X = R l / (100 − l)'),
        (minutes: 15, activity: 'PhET Circuit Construction Kit: students build the bridge'),
      ],
      materials: ['NCERT Physics Part 1, ch. 3', 'Lab record'],
      assessment: 'Worksheet: two loop-rule problems and one metre bridge problem (PU board pattern).',
      homework: 'Previous PU board questions on the Wheatstone bridge (5 marks).',
      roster: [
        'Adarsh Patil', 'Ankitha Rao', 'Bhuvan Gowda', 'Chinmayi S', 'Deepak M', 'Divya Bhat', 'Harshitha N', 'Karan Shetty', //
        'Manasa R', 'Nithin Kumar', 'Prerana Joshi', 'Rakesh B', 'Sinchana H', 'Vinay Kamath', 'Yamini P',
      ],
      rollPrefix: 'P2SA',
      videos: [
        (id: 'cv-pu1', youtube: 'kxDemoKi01a', title: "Kirchhoff's laws with solved PU questions", lang: 'en', seconds: 640),
        (id: 'cv-pu2', youtube: 'kxDemoKi02k', title: 'ಮೀಟರ್ ಸೇತುವೆ ಪ್ರಯೋಗ', lang: 'kn', seconds: 515),
      ],
      labs: ['kirchhoff-laws', 'meter-bridge', 'lab.ohms-law', 'potentiometer-emf'],
      models: ['electric_circuit'],
      phet: ['circuit-construction-kit-dc', 'resistance-in-a-wire', 'ohms-law'],
      animations: ['electric-circuit'],
      kitTab: KitTab.physics,
      quiz: [
        (q: "Kirchhoff's junction rule is based on conservation of…", options: ['energy', 'charge', 'momentum', 'mass'], answer: 1),
        (q: 'A metre bridge balances at 40 cm with R = 6 Ω. The unknown X is…', options: ['4 Ω', '9 Ω', '2.4 Ω', '15 Ω'], answer: 1),
        (q: 'In a balanced Wheatstone bridge, the galvanometer current is…', options: ['maximum', 'zero', 'equal to the cell current', 'reversed'], answer: 1),
      ],
    ),
    DemoClass(
      id: 'ukg',
      section: 'UKG A',
      subject: 'English and Numbers',
      teacher: 'Roopa Srinivas',
      startsAt: '15:00',
      endsAt: '15:35',
      room: 'Kindergarten, Sunflower room',
      institution: 'Soundarya Central School (CBSE)',
      syllabus: 'Pre-primary · UKG term 2',
      chapter: 'Letters and numbers',
      topicId: 'ukg-letters',
      topic: 'Letters A to E and numbers 1 to 5',
      summary: 'Trace capital letters A–E on four-line paper, count objects to five and sing a rhyme.',
      level: 'k12',
      term: 0,
      objectives: ['Trace A to E with the right stroke order', 'Count objects up to 5', 'Recite a rhyme with actions'],
      steps: [
        (minutes: 5, activity: 'Rhyme time: Twinkle twinkle little star (read aloud)'),
        (minutes: 10, activity: 'Letter tracing A–E on four-line paper'),
        (minutes: 10, activity: 'Count and trace numbers 1 to 5'),
        (minutes: 5, activity: 'Matching game: picture to word; stars for everyone'),
      ],
      materials: ['Tracing sheets', 'Picture cards'],
      assessment: 'Observe: can each child trace A–E and count to five?',
      homework: 'Draw five things you see at home.',
      roster: ['Aadhya', 'Advik', 'Anvi', 'Dhruv', 'Ira', 'Kabir', 'Myra', 'Nihal', 'Prisha', 'Reyansh', 'Saanvi', 'Vihaan'],
      rollPrefix: 'UKA',
      videos: [
        (id: 'cv-uk1', youtube: 'kxDemoAb01a', title: 'Phonics song: A to E', lang: 'en', seconds: 180),
        (id: 'cv-uk2', youtube: 'kxDemoNu01k', title: 'ಒಂದರಿಂದ ಐದು ಎಣಿಸೋಣ', lang: 'kn', seconds: 150),
      ],
      phet: ['number-play', 'make-a-ten'],
      animations: ['water-cycle'],
      kitTab: KitTab.stars,
      primaryActivity: 'tracing',
      quiz: [
        (q: 'Which letter comes after B?', options: ['A', 'C', 'D', 'E'], answer: 1),
        (q: 'How many legs does a cat have?', options: ['2', '3', '4', '5'], answer: 2),
        (q: 'Which is a shape with three sides?', options: ['circle', 'square', 'triangle', 'star'], answer: 2),
      ],
    ),
  ];
}

/// The demo server's answers for a [DemoClass] (lib/demo/demo_server.dart sends these for every
/// class but the default one, whose answers it has always had).
extension DemoClassJson on DemoClass {
  Map<String, dynamic> get sectionJson => {'id': 'sec-$id', 'displayName': section, 'term': ?term, 'level': ?level};
  Map<String, dynamic> get subjectJson => {'id': 'sub-$id', 'name': subject};

  List<Map<String, dynamic>> get rosterJson => [
    for (final (i, n) in roster.indexed) {'id': '$id-s${i + 1}', 'rollNo': '$rollPrefix${(i + 1).toString().padLeft(3, '0')}', 'fullName': n},
  ];

  Map<String, dynamic> get syllabusJson => {
    'id': 'co-$id',
    'title': '$subject, $syllabus',
    'reviewed': true,
    'chapters': [
      {
        'id': 'ch-$id',
        'title': chapter,
        'own': false,
        'topics': [
          {'id': topicId, 'title': topic, 'summary': summary, 'own': false},
        ],
      },
    ],
  };

  Map<String, dynamic> get topicJson => {
    'id': topicId,
    'title': topic,
    'summary': summary,
    'notes': [summary, 'Sample notes (demo): work one example on the board, then let the class try the next one.'],
    'outcomes': objectives,
    'lesson': {
      'hook': steps.first.activity,
      'example': steps.length > 1 ? steps[1].activity : summary,
      'activity': steps.length > 2 ? steps[2].activity : 'Pairs try the next example.',
      'questions': [
        {'q': 'What is the main idea of $topic?', 'a': summary},
      ],
      'homework': homework,
      'terms': [topic],
    },
    'chapter': {'id': 'ch-$id', 'title': chapter},
    'course': {'id': 'co-$id', 'title': subject, 'reviewed': true},
    'resources': [
      for (final l in labs) {'kind': 'lab', 'id': l, 'title': l},
      for (final m in models) {'kind': 'model3d', 'id': m, 'title': m},
    ],
  };

  List<Map<String, dynamic>> get videosJson => [
    for (final (i, v) in videos.indexed)
      {
        'id': v.id,
        'topicId': topicId,
        'youtubeVideoId': v.youtube,
        'title': v.title,
        'language': v.lang,
        'durationSeconds': v.seconds,
        'channelTitle': 'KINETIX',
        'position': i + 1,
      },
  ];

  Map<String, dynamic> conceptVideosNow(String date) => {
    'period': {'slotId': 'slot-$id', 'date': date, 'startsAt': '$startsAt:00', 'endsAt': '$endsAt:00', 'isNow': true, 'section': sectionJson, 'subject': subjectJson},
    'source': 'lesson_plan',
    'topics': [
      {'id': topicId, 'title': topic},
    ],
    'language': 'en',
    'videos': [for (final v in videosJson) {...v, 'topicTitle': topic}],
  };

  Map<String, dynamic> planJson(String date) => {
    'slot': {'id': 'slot-$id', 'startsAt': '$startsAt:00', 'endsAt': '$endsAt:00', 'sectionId': 'sec-$id', 'section': section, 'subjectId': 'sub-$id'},
    'subject': subjectJson,
    'date': date,
    'suggestedTopicIds': [topicId],
    'plan': {
      'id': 'lp-$id',
      'date': date,
      'topicIds': [topicId],
      'topics': [
        {'id': topicId, 'title': topic},
      ],
      'content': {
        'objectives': objectives,
        'steps': [for (final s in steps) {'minutes': s.minutes, 'activity': s.activity}],
        'materials': materials,
        'assessment': assessment,
        'homework': homework,
      },
      'aiDrafted': true,
      'teacher': teacher,
      'reviewedAt': null,
      'reviewRemark': null,
    },
  };
}
