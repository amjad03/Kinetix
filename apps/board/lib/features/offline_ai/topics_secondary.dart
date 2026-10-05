import 'topics.dart';

/// Offline notes for Classes 9 to 12 and for English and Computer Science.
const secondaryTopics = <Topic>[
  ..._science,
  ..._maths,
  ..._senior,
  ..._language,
];

const _science = <Topic>[
  Topic(
    title: 'Atoms and molecules',
    subjects: ['Chemistry', 'Science'],
    keywords: ['atoms and molecules', 'atom', 'atoms', 'molecule', 'molecules', 'atomic mass', 'mole concept', 'valency'],
    summary:
        'All matter is made of atoms, the smallest particles of an element that take part in a chemical reaction. Atoms join to form molecules: two hydrogen atoms and one oxygen atom make a water molecule, H₂O. Each element has a symbol and an atomic mass; one mole of any substance contains 6.022 × 10²³ particles.',
    keyPoints: [
      'Law of conservation of mass: mass is neither created nor destroyed in a reaction.',
      'Molecule of an element: O₂, N₂. Molecule of a compound: H₂O, CO₂.',
      'Valency is the combining capacity of an atom.',
      'Avogadro number: 6.022 × 10²³.',
    ],
    formulaTex: r'N_A = 6.022 \times 10^{23}\ \text{mol}^{-1}',
    example: 'Molecular mass of water = 2 × 1 + 16 = 18 u, so 18 g of water is one mole.',
    exampleTex: r'M(\text{H}_2\text{O}) = 2(1) + 16 = 18\ \text{u}',
    quiz: [
      OfflineQuestion('How many atoms are in one molecule of CO₂?', ['1', '2', '3', '4'], 2, 'One carbon and two oxygen atoms.'),
      OfflineQuestion('Molecular mass of O₂ (O = 16 u)?', ['16 u', '32 u', '8 u', '64 u'], 1, '2 × 16 = 32 u.'),
      OfflineQuestion('Valency of hydrogen is…', ['1', '2', '3', '4'], 0, 'Hydrogen forms one bond.'),
    ],
    activityText: 'Molecule models (10 min): groups build H₂O, CO₂, CH₄ and NH₃ from clay balls and sticks, then calculate each molecular mass.',
    mistakesList: ['Writing 2H when a hydrogen molecule H₂ is meant.', 'Adding atomic numbers instead of atomic masses.'],
  ),
  Topic(
    title: 'Structure of the atom',
    subjects: ['Chemistry', 'Science', 'Physics'],
    keywords: ['structure of the atom', 'structure of atom', 'protons', 'neutrons', 'electrons', 'bohr model', 'atomic number', 'mass number', 'electronic configuration', 'isotopes', 'nucleus of an atom', 'atomic nucleus'],
    summary:
        'An atom has a tiny, dense nucleus of protons (positive) and neutrons (neutral), with electrons (negative) moving in shells around it. In Bohr\'s model the shells K, L, M, N hold at most 2, 8, 18, 32 electrons (2n²). The atomic number is the number of protons; the mass number is protons plus neutrons.',
    keyPoints: [
      'Atomic number Z = protons = electrons in a neutral atom.',
      'Mass number A = protons + neutrons.',
      'Shell capacity 2n²: 2, 8, 18, 32.',
      'Isotopes: same Z, different A (carbon-12, carbon-14).',
    ],
    formulaTex: r'A = Z + N',
    example: 'Sodium (Z = 11): electronic configuration 2, 8, 1 — one outer electron, so valency 1.',
    quiz: [
      OfflineQuestion('Chlorine has Z = 17. Its configuration is…', ['2, 8, 7', '2, 7, 8', '8, 8, 1', '2, 8, 8'], 0, '2 + 8 + 7 = 17.'),
      OfflineQuestion('Mass number 23 and atomic number 11: neutrons?', ['11', '12', '23', '34'], 1, '23 − 11 = 12.'),
      OfflineQuestion('Which particle has no charge?', ['Proton', 'Electron', 'Neutron', 'Ion'], 2, 'Neutrons are neutral.'),
    ],
    activityText: 'Human atom (10 min): pupils stand as protons and neutrons in a "nucleus" circle and electrons in chalk shells, building oxygen, then sodium, following 2n².',
  ),
  Topic(
    title: 'Chemical reactions',
    subjects: ['Chemistry', 'Science'],
    keywords: ['chemical reactions', 'chemical reaction', 'chemical equations', 'balancing equations', 'combination reaction', 'decomposition reaction', 'displacement reaction', 'redox', 'oxidation'],
    summary:
        'In a chemical reaction substances (reactants) change into new substances (products). Signs include a change in colour or temperature, gas, or a precipitate. Equations must be balanced so that each element has the same number of atoms on both sides. Main types: combination, decomposition, displacement, double displacement, and redox.',
    keyPoints: [
      'Combination: A + B → AB.  Decomposition: AB → A + B.',
      'Displacement: a more reactive metal pushes out a less reactive one.',
      'Oxidation: gain of oxygen or loss of hydrogen; reduction is the opposite.',
      'Rusting and rancidity are oxidation.',
    ],
    formulaTex: r'2\text{H}_2 + \text{O}_2 \rightarrow 2\text{H}_2\text{O}',
    example: 'An iron nail in copper sulphate solution turns brown and the blue colour fades: Fe + CuSO₄ → FeSO₄ + Cu (displacement).',
    exampleTex: r'\text{Fe} + \text{CuSO}_4 \rightarrow \text{FeSO}_4 + \text{Cu}',
    quiz: [
      OfflineQuestion('CaCO₃ → CaO + CO₂ is…', ['Combination', 'Decomposition', 'Displacement', 'Neutralisation'], 1, 'One substance breaks into two.'),
      OfflineQuestion('Rusting of iron is…', ['Reduction', 'Oxidation', 'Sublimation', 'Neutralisation'], 1, 'Iron gains oxygen.'),
      OfflineQuestion('Balance: _ Mg + O₂ → 2 MgO', ['1', '2', '3', '4'], 1, '2 Mg + O₂ → 2 MgO.'),
    ],
    activityText: 'Reaction stations (10 min): demonstrate lime water turning milky, iron in copper sulphate and a burning Mg ribbon (teacher only); groups name each reaction type and write the equation.',
    mistakesList: ['Changing subscripts to balance an equation: change only the coefficients.', 'Forgetting state symbols when asked for them.'],
  ),
  Topic(
    title: 'The periodic table',
    subjects: ['Chemistry', 'Science'],
    keywords: ['periodic table', 'periodic classification', 'mendeleev', 'modern periodic table', 'groups and periods', 'periodic law'],
    summary:
        'The modern periodic table arranges elements in order of increasing atomic number. Its 18 vertical columns are groups (similar outer electrons, similar properties) and its 7 horizontal rows are periods (same number of shells). Metals are on the left, non-metals on the right, and metalloids along the zig-zag line between them.',
    keyPoints: [
      'Modern periodic law: properties repeat with atomic number.',
      'Group 1: alkali metals; group 17: halogens; group 18: noble gases.',
      'Across a period atoms get smaller and less metallic.',
      'Down a group atoms get larger and more metallic.',
    ],
    example: 'Sodium (2, 8, 1) and potassium (2, 8, 8, 1) both have one outer electron, so both are in group 1 and react vigorously with water.',
    quiz: [
      OfflineQuestion('Elements in the same group have the same…', ['Number of shells', 'Number of outer electrons', 'Mass', 'Colour'], 1, 'Same valence electrons, similar chemistry.'),
      OfflineQuestion('Noble gases are in group…', ['1', '2', '17', '18'], 3, 'Group 18: full outer shells.'),
      OfflineQuestion('Going down group 1, reactivity…', ['Decreases', 'Increases', 'Stays the same', 'Stops'], 1, 'The outer electron is lost more easily.'),
    ],
    activityText: 'Element cards (10 min): each pupil gets an element card (1–20) with its configuration and places it on a blank wall grid; the class discovers groups and periods.',
  ),
  Topic(
    title: 'Respiration',
    subjects: ['Biology', 'Science'],
    keywords: ['respiration', 'aerobic respiration', 'anaerobic respiration', 'breathing', 'respiratory system', 'lungs', 'alveoli'],
    summary:
        'Respiration releases energy from food inside cells. Aerobic respiration uses oxygen and produces carbon dioxide, water and a lot of energy; it happens in the mitochondria. Anaerobic respiration happens without oxygen and releases less energy — yeast makes alcohol and CO₂, and tired muscles make lactic acid. Breathing is only the exchange of gases in the lungs.',
    keyPoints: [
      'Glucose + oxygen → carbon dioxide + water + energy.',
      'Energy is stored as ATP.',
      'Alveoli give a huge surface for gas exchange.',
      'Cramps come from lactic acid after hard exercise.',
    ],
    formulaTex: r'\text{C}_6\text{H}_{12}\text{O}_6 + 6\text{O}_2 \rightarrow 6\text{CO}_2 + 6\text{H}_2\text{O} + \text{energy}',
    example: 'Idli batter rises overnight because yeast respires anaerobically and gives out carbon dioxide.',
    quiz: [
      OfflineQuestion('Aerobic respiration happens in the…', ['Nucleus', 'Mitochondria', 'Chloroplast', 'Cell wall'], 1, 'Mitochondria are the powerhouses of the cell.'),
      OfflineQuestion('Muscle cramps are due to…', ['Lactic acid', 'Glucose', 'Oxygen', 'Alcohol'], 0, 'Anaerobic respiration in muscles.'),
      OfflineQuestion('Gas exchange in the lungs happens in the…', ['Trachea', 'Bronchi', 'Alveoli', 'Diaphragm'], 2, 'Alveoli have thin walls and many capillaries.'),
    ],
    activityText: 'Lime-water test (8 min): pupils blow gently through a straw into lime water; it turns milky, showing exhaled air has more CO₂.',
    mistakesList: ['Saying respiration is the same as breathing.', 'Saying plants do not respire: they respire day and night.'],
  ),
  Topic(
    title: 'Gravitation',
    subjects: ['Physics', 'Science'],
    keywords: ['gravitation', 'gravity', 'universal law of gravitation', 'acceleration due to gravity', 'free fall', 'weight and mass'],
    summary:
        'Every object in the universe attracts every other object. Newton\'s universal law of gravitation says the force is proportional to the product of the masses and inversely proportional to the square of the distance between them. Near the Earth\'s surface all objects fall with the same acceleration g ≈ 9.8 m/s². Weight is the force of gravity on a mass: W = mg.',
    keyPoints: [
      'F = G m₁m₂ / r², with G = 6.67 × 10⁻¹¹ N m² kg⁻².',
      'Mass stays the same everywhere; weight changes with g.',
      'On the Moon g is about one-sixth of Earth\'s.',
      'Ignoring air, a feather and a stone fall together.',
    ],
    formulaTex: r'F = G\,\frac{m_1 m_2}{r^2}',
    example: 'A 60 kg student weighs 60 × 9.8 = 588 N on Earth but only about 98 N on the Moon.',
    exampleTex: r'W = mg = 60 \times 9.8 = 588\ \text{N}',
    quiz: [
      OfflineQuestion('If the distance between two masses doubles, the force becomes…', ['Double', 'Half', 'One-quarter', 'Four times'], 2, 'Inverse square: 1/2² = 1/4.'),
      OfflineQuestion('Weight of a 10 kg mass on Earth (g = 9.8 m/s²)?', ['10 N', '98 N', '9.8 N', '980 N'], 1, 'W = mg = 98 N.'),
      OfflineQuestion('On the Moon, your mass is…', ['One-sixth', 'The same', 'Six times', 'Zero'], 1, 'Mass does not change; weight does.'),
    ],
    activityText: 'Drop test (8 min): drop a book and a flat sheet of paper, then the paper crumpled on the book; pupils explain the role of air resistance.',
    mistakesList: ['Using mass in kg as weight in N.', 'Thinking heavier objects fall faster (without air resistance they do not).'],
  ),
  Topic(
    title: 'Work and energy',
    subjects: ['Physics', 'Science'],
    keywords: ['work and energy', 'kinetic energy', 'potential energy', 'work done', 'power', 'conservation of energy'],
    summary:
        'Work is done when a force moves an object in the direction of the force: W = F × s, measured in joules. Energy is the ability to do work. Kinetic energy is energy of motion (½mv²); potential energy is stored energy of position (mgh). Energy cannot be created or destroyed, only changed from one form to another. Power is the rate of doing work (P = W/t, in watts).',
    keyPoints: ['W = F × s (J).', 'KE = ½ m v²;  PE = m g h.', 'Conservation of energy: total energy stays the same.', 'Power P = W / t (W); 1 kWh = 3.6 × 10⁶ J.'],
    formulaTex: r'KE = \tfrac{1}{2} m v^2, \qquad PE = m g h',
    example: 'A 2 kg ball dropped from 5 m: PE at the top = 2 × 9.8 × 5 = 98 J, which becomes 98 J of kinetic energy just before it lands.',
    exampleTex: r'PE = 2 \times 9.8 \times 5 = 98\ \text{J}',
    quiz: [
      OfflineQuestion('Work done pushing a box 3 m with 10 N?', ['13 J', '30 J', '3.3 J', '0.3 J'], 1, 'W = 10 × 3 = 30 J.'),
      OfflineQuestion('If speed doubles, kinetic energy…', ['Doubles', 'Halves', 'Becomes 4 times', 'Stays same'], 2, 'KE depends on v².'),
      OfflineQuestion('Carrying a bag while walking on level ground, work done against gravity is…', ['Large', 'Zero', 'Negative', 'Infinite'], 1, 'The force (up) is perpendicular to the motion.'),
    ],
    activityText: 'Stair power (10 min): pupils time themselves climbing a flight of stairs, measure its height and calculate their power output in watts.',
  ),
  Topic(
    title: 'Ohm\'s law',
    subjects: ['Physics', 'Science'],
    keywords: ['ohm\'s law', 'ohms law', 'resistance', 'electric current', 'potential difference', 'resistors in series', 'resistors in parallel'],
    summary:
        'Ohm\'s law: at constant temperature the current through a conductor is proportional to the potential difference across it, V = IR. Resistance R (ohms, Ω) depends on the material, length and thickness of the wire. Resistors in series add (R = R₁ + R₂); in parallel their reciprocals add (1/R = 1/R₁ + 1/R₂).',
    keyPoints: ['V = I R.', 'Current in amperes (A), measured with an ammeter in series.', 'Voltage in volts (V), measured with a voltmeter in parallel.', 'Power P = V I = I² R.'],
    formulaTex: r'V = I R',
    example: 'A 12 V battery drives current through a 4 Ω resistor: I = 12 / 4 = 3 A.',
    exampleTex: r'I = \frac{V}{R} = \frac{12}{4} = 3\ \text{A}',
    quiz: [
      OfflineQuestion('V = 6 V, R = 3 Ω. Current?', ['18 A', '2 A', '0.5 A', '9 A'], 1, 'I = V/R = 2 A.'),
      OfflineQuestion('Two 4 Ω resistors in series give…', ['2 Ω', '4 Ω', '8 Ω', '16 Ω'], 2, 'Series: add them.'),
      OfflineQuestion('Two 4 Ω resistors in parallel give…', ['2 Ω', '4 Ω', '8 Ω', '1 Ω'], 0, '1/R = 1/4 + 1/4, so R = 2 Ω.'),
    ],
    activityText: 'V–I graph (10 min): with a cell holder, resistor, ammeter and voltmeter, groups take readings for 1, 2, 3 and 4 cells and plot V against I to see a straight line.',
    mistakesList: ['Connecting the ammeter in parallel.', 'Adding parallel resistances directly.'],
  ),
  Topic(
    title: 'Refraction of light',
    subjects: ['Physics', 'Science'],
    keywords: ['refraction', 'refraction of light', 'refractive index', 'lens', 'lenses', 'convex lens', 'concave lens', 'snell\'s law'],
    summary:
        'Refraction is the bending of light when it passes from one medium to another, because its speed changes. Light bends towards the normal when it enters a denser medium (air to glass). The refractive index n = speed of light in vacuum ÷ speed in the medium. Convex lenses converge light and concave lenses diverge it.',
    keyPoints: ['Snell\'s law: sin i / sin r = constant (n).', 'n(glass) ≈ 1.5, n(water) ≈ 1.33.', 'Lens formula: 1/f = 1/v − 1/u; power P = 1/f (dioptres, f in metres).', 'A pencil in water looks bent because of refraction.'],
    formulaTex: r'\frac{1}{f} = \frac{1}{v} - \frac{1}{u}',
    example: 'A swimming pool looks shallower than it is: light from the bottom bends away from the normal as it leaves the water.',
    quiz: [
      OfflineQuestion('Light going from air into glass bends…', ['Away from the normal', 'Towards the normal', 'Not at all', 'Back'], 1, 'It slows down in a denser medium.'),
      OfflineQuestion('Power of a lens with f = 0.5 m?', ['0.5 D', '2 D', '5 D', '−2 D'], 1, 'P = 1/f = 2 D.'),
      OfflineQuestion('A convex lens is also called…', ['Diverging', 'Converging', 'Plane', 'Opaque'], 1, 'It brings parallel rays to a focus.'),
    ],
    activityText: 'Coin in a cup (8 min): pupils move back until a coin in an empty cup just disappears, then a partner pours water in and the coin reappears.',
  ),
  Topic(
    title: 'Heredity',
    subjects: ['Biology', 'Science'],
    keywords: ['heredity', 'mendel', 'inheritance', 'dominant', 'recessive', 'genes', 'monohybrid cross', 'genetics'],
    summary:
        'Heredity is the passing of traits from parents to offspring through genes. Gregor Mendel studied pea plants and found that traits come in pairs of factors (alleles), one from each parent. A dominant allele shows even when only one copy is present; a recessive one shows only with two copies. A monohybrid cross of two hybrids (Tt × Tt) gives a 3 : 1 ratio of tall to short.',
    keyPoints: ['Genes are sections of DNA on chromosomes.', 'Genotype: the alleles (TT, Tt, tt); phenotype: what shows (tall, short).', 'Tt × Tt → 1 TT : 2 Tt : 1 tt, phenotype 3 tall : 1 short.', 'Sex in humans: XX female, XY male; the father\'s sperm decides.'],
    example: 'Crossing two tall hybrid pea plants (Tt) gives about 3 tall plants for every 1 short plant.',
    quiz: [
      OfflineQuestion('Tt × Tt gives phenotype ratio…', ['1 : 1', '3 : 1', '1 : 2 : 1', '9 : 3 : 3 : 1'], 1, 'Three show the dominant trait.'),
      OfflineQuestion('Who studied inheritance in pea plants?', ['Darwin', 'Mendel', 'Lamarck', 'Watson'], 1, 'Gregor Mendel.'),
      OfflineQuestion('A child is male if it receives from the father a…', ['X chromosome', 'Y chromosome', 'Two X', 'No chromosome'], 1, 'XY is male.'),
    ],
    activityText: 'Coin genetics (10 min): pairs toss two coins (heads = T, tails = t) forty times, tally TT, Tt and tt, and compare with 1 : 2 : 1.',
  ),
];

const _maths = <Topic>[
  Topic(
    title: 'Polynomials',
    subjects: ['Mathematics'],
    keywords: ['polynomial', 'polynomials', 'degree of a polynomial', 'zeroes of a polynomial', 'factor theorem', 'remainder theorem'],
    summary:
        'A polynomial is an expression made of terms with whole-number powers of a variable, like 3x² − 5x + 2. Its degree is the highest power. A zero of a polynomial is a value of x that makes it 0; on a graph the zeroes are where the curve crosses the x-axis. For ax² + bx + c the zeroes add to −b/a and multiply to c/a.',
    keyPoints: ['Linear (degree 1), quadratic (2), cubic (3).', 'Remainder theorem: p(x) ÷ (x − a) leaves remainder p(a).', 'Factor theorem: (x − a) is a factor if p(a) = 0.', 'Sum of zeroes = −b/a; product = c/a.'],
    formulaTex: r'\alpha + \beta = -\frac{b}{a}, \quad \alpha\beta = \frac{c}{a}',
    example: 'x² − 5x + 6 = (x − 2)(x − 3), so its zeroes are 2 and 3; 2 + 3 = 5 = −(−5)/1 and 2 × 3 = 6.',
    exampleTex: r'x^2 - 5x + 6 = (x - 2)(x - 3)',
    quiz: [
      OfflineQuestion('Degree of 4x³ − x + 7?', ['1', '2', '3', '7'], 2, 'Highest power is 3.'),
      OfflineQuestion('Is (x − 1) a factor of x² − 3x + 2?', ['Yes', 'No'], 0, 'p(1) = 1 − 3 + 2 = 0.'),
      OfflineQuestion('Sum of zeroes of 2x² − 8x + 3?', ['8', '4', '−4', '3/2'], 1, '−b/a = 8/2 = 4.'),
    ],
    activityText: 'Zero hunt (8 min): groups sketch y = x² − x − 6 by plotting points and read the zeroes off the graph, then check by factorising.',
  ),
  Topic(
    title: 'Trigonometry',
    subjects: ['Mathematics'],
    keywords: ['trigonometry', 'trigonometric ratios', 'sin cos tan', 'sine', 'cosine', 'heights and distances', 'angle of elevation'],
    summary:
        'Trigonometry relates the angles and sides of right-angled triangles. For an angle θ: sin θ = opposite / hypotenuse, cos θ = adjacent / hypotenuse and tan θ = opposite / adjacent. Standard values: sin 30° = ½, cos 60° = ½, tan 45° = 1, sin 90° = 1. A key identity is sin²θ + cos²θ = 1.',
    keyPoints: ['SOH-CAH-TOA.', 'tan θ = sin θ / cos θ.', 'sin²θ + cos²θ = 1.', 'Heights and distances: tan(angle of elevation) = height / distance.'],
    formulaTex: r'\sin^2\theta + \cos^2\theta = 1',
    example: 'From 20 m away the top of a tree is seen at 45°: height = 20 × tan 45° = 20 m.',
    exampleTex: r'h = 20 \tan 45^\circ = 20\ \text{m}',
    quiz: [
      OfflineQuestion('sin 30° = ?', ['1', '½', '√3/2', '0'], 1, 'sin 30° = 1/2.'),
      OfflineQuestion('In a right triangle, opposite = 3, adjacent = 4. tan θ = ?', ['3/5', '4/5', '3/4', '4/3'], 2, 'tan = opposite / adjacent.'),
      OfflineQuestion('cos 0° = ?', ['0', '1', '½', 'Not defined'], 1, 'cos 0° = 1.'),
    ],
    activityText: 'Clinometer (10 min): pupils make a straw-and-protractor clinometer, measure the angle to the top of the flagpole and their distance from it, and compute its height.',
    mistakesList: ['Using the hypotenuse for tan.', 'Calculator in radian mode instead of degrees.'],
  ),
  Topic(
    title: 'Coordinate geometry',
    subjects: ['Mathematics'],
    keywords: ['coordinate geometry', 'distance formula', 'section formula', 'midpoint formula', 'cartesian plane', 'coordinates'],
    summary:
        'Coordinate geometry places points on a plane with an x-coordinate and a y-coordinate. The distance between (x₁, y₁) and (x₂, y₂) is √[(x₂ − x₁)² + (y₂ − y₁)²] — Pythagoras on the grid. The midpoint of the segment is ((x₁ + x₂)/2, (y₁ + y₂)/2).',
    keyPoints: ['Four quadrants: (+,+), (−,+), (−,−), (+,−).', 'Distance formula comes from Pythagoras.', 'Midpoint = average of the coordinates.', 'Section formula divides a segment in ratio m : n.'],
    formulaTex: r'd = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}',
    example: 'Distance from (1, 2) to (4, 6) = √(3² + 4²) = √25 = 5.',
    exampleTex: r'd = \sqrt{3^2 + 4^2} = 5',
    quiz: [
      OfflineQuestion('Distance from (0, 0) to (6, 8)?', ['10', '14', '7', '48'], 0, '√(36 + 64) = 10.'),
      OfflineQuestion('Midpoint of (2, 4) and (6, 8)?', ['(4, 6)', '(8, 12)', '(3, 4)', '(4, 4)'], 0, 'Average the coordinates.'),
      OfflineQuestion('(−3, 5) lies in quadrant…', ['I', 'II', 'III', 'IV'], 1, 'x negative, y positive: II.'),
    ],
    activityText: 'Classroom grid (8 min): desks become coordinates; the teacher calls two pupils and the class computes the distance between them, then measures it.',
  ),
  Topic(
    title: 'Statistics',
    subjects: ['Mathematics'],
    keywords: ['statistics', 'mean median mode', 'mean, median', 'median', 'frequency table', 'data handling', 'arithmetic mean'],
    summary:
        'Statistics collects and summarises data. The mean is the sum of the values divided by how many there are. The median is the middle value when the data are in order (the average of the two middle values if there is an even number). The mode is the value that occurs most often. Range = highest − lowest.',
    keyPoints: ['Mean = Σx / n.', 'Median: order first, then take the middle.', 'Mode: most frequent value.', 'Empirical relation: mode ≈ 3 median − 2 mean.'],
    formulaTex: r'\bar{x} = \frac{\sum x}{n}',
    example: 'Marks 4, 7, 7, 8, 9: mean = 35/5 = 7, median = 7, mode = 7, range = 5.',
    quiz: [
      OfflineQuestion('Mean of 2, 4, 6, 8?', ['4', '5', '6', '20'], 1, '20 ÷ 4 = 5.'),
      OfflineQuestion('Median of 3, 9, 1, 7, 5?', ['5', '7', '1', '9'], 0, 'In order: 1, 3, 5, 7, 9 → 5.'),
      OfflineQuestion('Mode of 2, 3, 3, 5, 3, 2?', ['2', '3', '5', '2.5'], 1, '3 occurs most often.'),
    ],
    activityText: 'Class survey (10 min): collect everyone\'s shoe size or travel time, then groups find the mean, median and mode and discuss which describes the class best.',
  ),
  Topic(
    title: 'Probability',
    subjects: ['Mathematics'],
    keywords: ['probability', 'equally likely outcomes', 'tossing a coin', 'rolling a die'],
    summary:
        'Probability measures how likely an event is, from 0 (impossible) to 1 (certain). For equally likely outcomes, P(event) = number of favourable outcomes ÷ total number of outcomes. The probabilities of an event and its opposite add to 1.',
    keyPoints: ['0 ≤ P(E) ≤ 1.', 'P(E) + P(not E) = 1.', 'A fair coin: P(head) = ½. A fair die: P(6) = 1/6.', 'A deck has 52 cards, 4 suits of 13.'],
    formulaTex: r'P(E) = \frac{\text{favourable outcomes}}{\text{total outcomes}}',
    example: 'A bag has 3 red and 5 blue balls. P(red) = 3/8.',
    quiz: [
      OfflineQuestion('P(an even number) on a fair die?', ['1/6', '1/3', '1/2', '2/3'], 2, '2, 4, 6: 3 out of 6.'),
      OfflineQuestion('If P(rain) = 0.3, P(no rain) = ?', ['0.3', '0.7', '1.3', '0'], 1, '1 − 0.3.'),
      OfflineQuestion('Probability of an impossible event?', ['0', '1', '½', '−1'], 0, 'Impossible means 0.'),
    ],
    activityText: 'Coin experiment (8 min): each pair tosses a coin 20 times; the class adds all results and sees the fraction of heads approach ½.',
  ),
  Topic(
    title: 'Arithmetic progressions',
    subjects: ['Mathematics'],
    keywords: ['arithmetic progression', 'arithmetic progressions', 'common difference', 'nth term', 'sum of n terms'],
    summary:
        'An arithmetic progression (AP) is a list of numbers in which each term is the previous one plus a fixed number, the common difference d. The nth term is aₙ = a + (n − 1)d and the sum of the first n terms is Sₙ = n/2 [2a + (n − 1)d].',
    keyPoints: ['d = a₂ − a₁.', 'aₙ = a + (n − 1)d.', 'Sₙ = n/2 (2a + (n − 1)d) = n/2 (first + last).', 'Sum of 1 to n = n(n + 1)/2.'],
    formulaTex: r'a_n = a + (n-1)d, \quad S_n = \frac{n}{2}\left[2a + (n-1)d\right]',
    example: 'AP 5, 8, 11, …: the 10th term is 5 + 9 × 3 = 32; the sum of 10 terms is 10/2 × (5 + 32) = 185.',
    quiz: [
      OfflineQuestion('Common difference of 7, 3, −1, …?', ['4', '−4', '3', '−3'], 1, '3 − 7 = −4.'),
      OfflineQuestion('20th term of 2, 5, 8, …?', ['59', '62', '57', '60'], 0, '2 + 19 × 3 = 59.'),
      OfflineQuestion('Sum of 1 + 2 + … + 100?', ['5,000', '5,050', '10,100', '4,950'], 1, '100 × 101 / 2.'),
    ],
    activityText: 'Savings plan (8 min): a pupil saves ₹10 in week 1 and ₹5 more each week; groups find the savings in week 20 and the total after 20 weeks.',
  ),
  Topic(
    title: 'Surface area and volume',
    subjects: ['Mathematics'],
    keywords: ['surface area', 'volume', 'volume of a cylinder', 'volume of a cone', 'volume of a sphere', 'cuboid', 'cylinder', 'sphere'],
    summary:
        'Surface area is the total area of all the faces of a solid; volume is the space it fills. Cuboid: volume = l × b × h. Cylinder: volume = πr²h, curved surface area = 2πrh. Cone: volume = ⅓πr²h. Sphere: volume = 4/3 πr³, surface area = 4πr².',
    keyPoints: ['Cube: V = a³, SA = 6a².', 'Cylinder: V = πr²h.', 'Cone: V = ⅓ πr²h (a third of the cylinder).', 'Sphere: V = 4/3 πr³, SA = 4πr².'],
    formulaTex: r'V_{\text{cyl}} = \pi r^2 h, \quad V_{\text{sphere}} = \tfrac{4}{3}\pi r^3',
    example: 'A water tank of radius 1 m and height 2 m holds π × 1² × 2 ≈ 6.28 m³ = about 6,280 litres.',
    quiz: [
      OfflineQuestion('Volume of a cube of side 3 cm?', ['9 cm³', '27 cm³', '18 cm³', '54 cm³'], 1, '3³ = 27.'),
      OfflineQuestion('A cone and cylinder share r and h. The cone\'s volume is…', ['Equal', 'Half', 'One-third', 'Double'], 2, '⅓ πr²h.'),
      OfflineQuestion('1 m³ = ? litres', ['100', '1,000', '10', '10,000'], 1, '1 m³ = 1,000 L.'),
    ],
    activityText: 'Fill it up (10 min): fill a paper cone with rice and pour it into a paper cylinder of the same radius and height; it takes three cones.',
  ),
  Topic(
    title: 'Quadratic equations',
    subjects: ['Mathematics'],
    keywords: ['quadratic equation', 'quadratic equations', 'quadratic formula', 'discriminant', 'roots of a quadratic', 'factorisation'],
    summary:
        'A quadratic equation has the form ax² + bx + c = 0 with a ≠ 0. It can be solved by factorisation, by completing the square or by the quadratic formula x = (−b ± √(b² − 4ac)) / 2a. The discriminant D = b² − 4ac tells the nature of the roots: two real roots if D > 0, one repeated root if D = 0, no real roots if D < 0.',
    keyPoints: ['Standard form: ax² + bx + c = 0.', 'Quadratic formula works for every quadratic.', 'D > 0: two distinct real roots; D = 0: equal roots; D < 0: no real roots.', 'Check roots by substituting back.'],
    formulaTex: r'x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}',
    example: 'x² − 7x + 12 = 0 factorises to (x − 3)(x − 4) = 0, so x = 3 or x = 4.',
    exampleTex: r'x^2 - 7x + 12 = (x - 3)(x - 4) = 0',
    quiz: [
      OfflineQuestion('Discriminant of x² + 4x + 4?', ['0', '8', '16', '−8'], 0, '16 − 16 = 0: equal roots.'),
      OfflineQuestion('Roots of x² − 9 = 0?', ['3 only', '±3', '9', '±9'], 1, 'x² = 9, x = ±3.'),
      OfflineQuestion('If D < 0 the equation has…', ['Two real roots', 'One real root', 'No real roots', 'Infinite roots'], 2, 'The square root of a negative is not real.'),
    ],
    activityText: 'Area puzzle (8 min): "A rectangle is 3 m longer than it is wide and has area 40 m²." Pairs write the quadratic, solve it and reject the negative root.',
  ),
];

const _senior = <Topic>[
  Topic(
    title: 'Differentiation',
    subjects: ['Mathematics'],
    keywords: ['differentiation', 'derivative', 'derivatives', 'rate of change', 'calculus', 'maxima and minima'],
    summary:
        'The derivative of a function measures how fast it changes: the slope of its graph at a point. dy/dx is the limit of Δy/Δx as Δx → 0. Basic rules: d/dx(xⁿ) = n xⁿ⁻¹, the derivative of a constant is 0, and derivatives add. Setting dy/dx = 0 finds maximum and minimum points.',
    keyPoints: ['d/dx (xⁿ) = n xⁿ⁻¹.', 'd/dx (sin x) = cos x; d/dx (eˣ) = eˣ.', 'Product rule: (uv)′ = u′v + uv′.', 'Stationary points where dy/dx = 0.'],
    formulaTex: r'\frac{d}{dx}\,x^n = n\,x^{n-1}',
    example: 'y = x³ − 3x: dy/dx = 3x² − 3, which is 0 at x = ±1 — a maximum at x = −1 and a minimum at x = 1.',
    exampleTex: r'\frac{d}{dx}(x^3 - 3x) = 3x^2 - 3',
    quiz: [
      OfflineQuestion('d/dx (x⁵) = ?', ['5x⁴', 'x⁴', '5x⁵', '4x⁵'], 0, 'n xⁿ⁻¹.'),
      OfflineQuestion('d/dx (7) = ?', ['7', '1', '0', '7x'], 2, 'Constants do not change.'),
      OfflineQuestion('Slope of y = x² at x = 3?', ['3', '6', '9', '2'], 1, 'dy/dx = 2x = 6.'),
    ],
    activityText: 'Slope walk (10 min): on a large printed graph of y = x², pupils lay a ruler as a tangent at x = 1, 2, 3, measure its slope and compare with 2x.',
  ),
  Topic(
    title: 'Integration',
    subjects: ['Mathematics'],
    keywords: ['integration', 'integral', 'integrals', 'antiderivative', 'definite integral', 'area under a curve'],
    summary:
        'Integration is the reverse of differentiation. The indefinite integral ∫xⁿ dx = xⁿ⁺¹/(n + 1) + C (for n ≠ −1), where C is the constant of integration. A definite integral from a to b gives the (signed) area under the curve between x = a and x = b: ∫ₐᵇ f(x) dx = F(b) − F(a).',
    keyPoints: ['∫ xⁿ dx = xⁿ⁺¹/(n+1) + C.', '∫ (1/x) dx = ln|x| + C.', 'Definite integral: F(b) − F(a), no C.', 'Area under a curve is a definite integral.'],
    formulaTex: r'\int x^n\,dx = \frac{x^{n+1}}{n+1} + C',
    example: 'Area under y = x² from 0 to 3: [x³/3] from 0 to 3 = 9 − 0 = 9 square units.',
    exampleTex: r'\int_0^3 x^2\,dx = \left[\frac{x^3}{3}\right]_0^3 = 9',
    quiz: [
      OfflineQuestion('∫ 2x dx = ?', ['x² + C', '2 + C', 'x + C', '2x² + C'], 0, 'Reverse of d/dx (x²) = 2x.'),
      OfflineQuestion('∫₀¹ 1 dx = ?', ['0', '1', '2', 'C'], 1, 'Area of a 1 × 1 square.'),
      OfflineQuestion('Why add C?', ['Always zero', 'Constants vanish when differentiating', 'For area', 'Habit'], 1, 'Many functions share the same derivative.'),
    ],
    activityText: 'Count the squares (10 min): on graph paper pupils estimate the area under y = x² from 0 to 3 by counting squares, then compare with the exact 9.',
  ),
  Topic(
    title: 'Matrices',
    subjects: ['Mathematics'],
    keywords: ['matrix', 'matrices', 'determinant', 'inverse of a matrix', 'matrix multiplication', 'transpose'],
    summary:
        'A matrix is a rectangular array of numbers in rows and columns. Matrices of the same order add element by element. The product AB is defined when the number of columns of A equals the number of rows of B; in general AB ≠ BA. A 2 × 2 matrix [[a, b], [c, d]] has determinant ad − bc and an inverse only if the determinant is not zero.',
    keyPoints: ['Order m × n: m rows, n columns.', 'Multiply row by column.', 'det [[a, b], [c, d]] = ad − bc.', 'A⁻¹ = (1/det A) adj A when det A ≠ 0.'],
    formulaTex: r'\begin{vmatrix} a & b \\ c & d \end{vmatrix} = ad - bc',
    example: 'det [[3, 1], [4, 2]] = 3 × 2 − 1 × 4 = 2, so this matrix has an inverse.',
    quiz: [
      OfflineQuestion('det [[2, 3], [1, 4]] = ?', ['5', '11', '8', '−5'], 0, '8 − 3 = 5.'),
      OfflineQuestion('A is 2 × 3 and B is 3 × 4. AB is…', ['3 × 3', '2 × 4', '4 × 2', 'Not defined'], 1, 'Outer numbers: 2 × 4.'),
      OfflineQuestion('A matrix has an inverse when its determinant is…', ['0', 'Not 0', 'Negative', '1 only'], 1, 'Singular matrices (det 0) have no inverse.'),
    ],
    activityText: 'Shop bills (10 min): prices of three items as a column matrix and quantities bought by four pupils as a 4 × 3 matrix; groups multiply to get every bill.',
  ),
  Topic(
    title: 'Chemical bonding',
    subjects: ['Chemistry'],
    keywords: ['chemical bonding', 'ionic bond', 'covalent bond', 'ionic bonding', 'covalent bonding', 'octet rule', 'electronegativity'],
    summary:
        'Atoms bond to reach a stable arrangement, usually eight outer electrons (the octet rule). In an ionic bond a metal gives electrons to a non-metal, forming oppositely charged ions that attract (NaCl). In a covalent bond two non-metals share pairs of electrons (H₂O, CH₄). Ionic compounds have high melting points and conduct when molten or dissolved; covalent compounds mostly do not conduct.',
    keyPoints: ['Ionic: transfer of electrons; metal + non-metal.', 'Covalent: sharing of electrons; non-metal + non-metal.', 'Single, double, triple bonds share 1, 2, 3 pairs.', 'Electronegativity difference decides bond type.'],
    formulaTex: r'\text{Na} \rightarrow \text{Na}^+ + e^-, \quad \text{Cl} + e^- \rightarrow \text{Cl}^-',
    example: 'In N₂ the two nitrogen atoms share three pairs of electrons — a triple bond, which makes nitrogen very unreactive.',
    quiz: [
      OfflineQuestion('NaCl has which bond?', ['Covalent', 'Ionic', 'Metallic', 'Hydrogen'], 1, 'Sodium gives an electron to chlorine.'),
      OfflineQuestion('How many bonds does carbon usually form?', ['1', '2', '3', '4'], 3, 'Carbon has 4 outer electrons.'),
      OfflineQuestion('Ionic compounds conduct electricity when…', ['Solid', 'Molten or dissolved', 'Cold', 'Never'], 1, 'The ions are free to move.'),
    ],
    activityText: 'Electron handshake (8 min): pupils hold electron cards and act out Na giving one to Cl (ionic), then two H and one O sharing (covalent).',
  ),
  Topic(
    title: 'DNA and genes',
    subjects: ['Biology'],
    keywords: ['dna', 'double helix', 'gene expression', 'nucleotides', 'base pairing', 'dna replication'],
    summary:
        'DNA (deoxyribonucleic acid) carries the genetic instructions of living things. It is a double helix of two strands made of nucleotides; the bases pair A with T and G with C. A gene is a section of DNA that codes for a protein. Before a cell divides, DNA copies itself (replication) so each new cell gets a full set.',
    keyPoints: ['Structure proposed by Watson and Crick (1953), using Rosalind Franklin\'s X-ray images.', 'Base pairs: A–T, G–C.', 'Genes → proteins → traits.', 'Human cells have 46 chromosomes (23 pairs).'],
    example: 'If one strand reads ATGC, the matching strand reads TACG.',
    quiz: [
      OfflineQuestion('Adenine pairs with…', ['Guanine', 'Thymine', 'Cytosine', 'Uracil'], 1, 'A–T.'),
      OfflineQuestion('The shape of DNA is a…', ['Single strand', 'Double helix', 'Circle only', 'Sheet'], 1, 'Two strands twisted together.'),
      OfflineQuestion('How many chromosomes in a human body cell?', ['23', '46', '44', '92'], 1, '23 pairs.'),
    ],
    activityText: 'Base-pair zip (8 min): pupils get one strand sequence each and write the matching strand, then pair up to check that their strands "zip" together.',
  ),
];

const _language = <Topic>[
  Topic(
    title: 'Tenses',
    subjects: ['English'],
    keywords: ['tense', 'tenses', 'present tense', 'past tense', 'future tense', 'present continuous', 'present perfect', 'simple past'],
    summary:
        'Tense shows the time of an action: present, past or future. Each has four forms: simple (I write), continuous (I am writing), perfect (I have written) and perfect continuous (I have been writing). Time words such as yesterday, now, already and tomorrow give clues to the tense.',
    keyPoints: ['Simple present: habits and facts ("The sun rises in the east").', 'Present continuous: happening now ("She is reading").', 'Simple past: finished actions ("We played yesterday").', 'Future: will + verb ("They will come tomorrow").'],
    example: '"Rahul has finished his homework" is present perfect: the action is complete and the result matters now.',
    quiz: [
      OfflineQuestion('"She ___ to school every day."', ['go', 'goes', 'went', 'going'], 1, 'Simple present, third person: goes.'),
      OfflineQuestion('"They ___ football when it started raining."', ['play', 'were playing', 'will play', 'plays'], 1, 'An action in progress in the past.'),
      OfflineQuestion('"I have eaten" is…', ['Simple past', 'Present perfect', 'Future', 'Past continuous'], 1, 'Have/has + past participle.'),
    ],
    activityText: 'Tense relay (8 min): the teacher says a verb and a time word ("eat — yesterday"); rows race to write the correct sentence on the board.',
    mistakesList: ['Using "did went" instead of "did go".', 'Forgetting the -s in the third person singular: "He play" → "He plays".'],
  ),
  Topic(
    title: 'Active and passive voice',
    subjects: ['English'],
    keywords: ['active and passive voice', 'passive voice', 'active voice', 'voice change'],
    summary:
        'In the active voice the subject does the action ("The cat chased the mouse"). In the passive voice the object becomes the subject and receives the action ("The mouse was chased by the cat"). The passive uses a form of "be" + past participle, and is useful when the doer is unknown or less important.',
    keyPoints: ['Active: subject + verb + object.', 'Passive: object + be + past participle (+ by + doer).', 'Keep the tense the same when changing voice.', 'Intransitive verbs (no object) have no passive.'],
    example: 'Active: "The students planted trees." Passive: "Trees were planted by the students."',
    quiz: [
      OfflineQuestion('Passive of "Ravi wrote a letter."', ['A letter is written by Ravi.', 'A letter was written by Ravi.', 'A letter wrote Ravi.', 'Ravi was written a letter.'], 1, 'Past tense stays past: was written.'),
      OfflineQuestion('Which sentence is passive?', ['She sings songs.', 'The road is being repaired.', 'He ran fast.', 'We will win.'], 1, 'Is being + past participle.'),
      OfflineQuestion('"Birds fly" can be changed to passive?', ['Yes', 'No'], 1, '"Fly" here has no object.'),
    ],
    activityText: 'Headline flip (8 min): pairs turn five active news sentences into passive headlines and discuss when the passive sounds better.',
  ),
  Topic(
    title: 'Formal letter writing',
    subjects: ['English'],
    keywords: ['formal letter', 'letter writing', 'letter to the principal', 'application letter', 'letter to the editor'],
    summary:
        'A formal letter is written to an official, a school or an organisation. Its format: sender\'s address, date, receiver\'s address, subject, salutation (Sir/Madam), body in short paragraphs (purpose, details, request), complimentary close (Yours faithfully/sincerely), and signature with name. The tone is polite and to the point.',
    keyPoints: ['Subject line states the purpose in a few words.', 'Body: introduction, details, request or conclusion.', '"Yours faithfully" with "Dear Sir/Madam"; "Yours sincerely" when the person is named.', 'No slang, no short forms.'],
    example: 'A leave application to the principal: subject "Leave for two days", reason, dates, request, "Yours obediently" or "Yours faithfully", name and class.',
    quiz: [
      OfflineQuestion('Which comes right after the receiver\'s address?', ['Signature', 'Subject', 'Body', 'Close'], 1, 'Then the salutation.'),
      OfflineQuestion('"Dear Sir/Madam" is closed with…', ['Yours lovingly', 'Yours faithfully', 'Cheers', 'Bye'], 1, 'Formal and unnamed: faithfully.'),
      OfflineQuestion('Which is NOT suitable in a formal letter?', ['Please', 'Kindly', 'Gonna', 'Thank you'], 2, 'Avoid slang and short forms.'),
    ],
    activityText: 'Letter jigsaw (8 min): groups reassemble a cut-up formal letter in the right order, then write the subject line for a new situation.',
  ),
  Topic(
    title: 'Algorithms and flowcharts',
    subjects: ['Computer Science'],
    keywords: ['algorithm', 'algorithms', 'flowchart', 'flowcharts', 'pseudocode', 'flow chart'],
    summary:
        'An algorithm is a finite, ordered list of clear steps that solves a problem. A flowchart draws an algorithm with standard symbols: an oval for start/end, a parallelogram for input/output, a rectangle for a process and a diamond for a decision. Good algorithms are correct, unambiguous and always finish.',
    keyPoints: ['Oval: start/stop. Parallelogram: input/output.', 'Rectangle: process. Diamond: decision (yes/no).', 'Arrows show the flow.', 'Three building blocks: sequence, selection (if), repetition (loop).'],
    example: 'Algorithm to find the larger of two numbers: 1) input a, b; 2) if a > b print a, else print b; 3) stop.',
    quiz: [
      OfflineQuestion('Which symbol shows a decision?', ['Oval', 'Rectangle', 'Diamond', 'Parallelogram'], 2, 'A diamond has yes/no exits.'),
      OfflineQuestion('Input and output use a…', ['Parallelogram', 'Circle', 'Triangle', 'Diamond'], 0, 'Parallelogram.'),
      OfflineQuestion('Repeating steps is called…', ['Sequence', 'Selection', 'Iteration (loop)', 'Output'], 2, 'A loop.'),
    ],
    activityText: 'Human robot (8 min): one pupil follows another\'s written algorithm exactly to draw a house on the board; the class fixes the steps that were unclear.',
  ),
  Topic(
    title: 'Binary numbers',
    subjects: ['Computer Science', 'Mathematics'],
    keywords: ['binary', 'binary numbers', 'binary number system', 'base 2', 'bits and bytes', 'decimal to binary'],
    summary:
        'Computers store everything as binary: base 2, using only the digits 0 and 1 (bits). Each place is a power of 2: 1, 2, 4, 8, 16, … To convert decimal to binary, divide by 2 repeatedly and read the remainders from bottom to top. Eight bits make a byte, which can hold 256 different values (0–255).',
    keyPoints: ['Place values: 128, 64, 32, 16, 8, 4, 2, 1.', 'Decimal → binary: repeated division by 2.', 'Binary → decimal: add the place values that have a 1.', '1 byte = 8 bits; 1 KB = 1,024 bytes.'],
    example: '13 in binary: 13 = 8 + 4 + 1 = 1101₂.',
    exampleTex: r'13_{10} = 1101_2',
    quiz: [
      OfflineQuestion('Binary 1010 in decimal?', ['8', '10', '12', '5'], 1, '8 + 2 = 10.'),
      OfflineQuestion('Decimal 6 in binary?', ['110', '101', '111', '011'], 0, '4 + 2 = 6.'),
      OfflineQuestion('How many bits in a byte?', ['4', '8', '16', '2'], 1, '8 bits.'),
    ],
    activityText: 'Binary cards (8 min): five pupils hold cards 16, 8, 4, 2, 1 and flip them face up (1) or down (0) to show numbers the class calls out.',
  ),
];
