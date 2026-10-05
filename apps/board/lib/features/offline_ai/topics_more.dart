import 'topics.dart';
import 'topics_secondary.dart';

/// Offline lesson notes beyond the first twelve topics: primary and middle
/// school here, secondary and senior in topics_secondary.dart. Written to
/// the Indian school syllabus (NCERT / state boards). Each is short, exact
/// and classroom-ready; anything not here is left to a connected AI.
const moreTopics = <Topic>[
  ..._primary,
  ..._middleScience,
  ..._middleMaths,
  ..._social,
  ...secondaryTopics,
];

const _primary = <Topic>[
  Topic(
    title: 'Parts of a plant',
    subjects: ['EVS', 'Science', 'Biology'],
    keywords: ['parts of a plant', 'parts of plant', 'plant parts', 'root and shoot', 'parts of a flower'],
    summary:
        'A plant has roots, a stem, leaves, flowers and fruits. Roots hold the plant in the soil and take in water. The stem carries water up and food down. Leaves make food using sunlight. Flowers make seeds, and fruits protect the seeds.',
    keyPoints: [
      'Roots: hold the plant firmly and absorb water and minerals.',
      'Stem: holds the plant up and carries water and food.',
      'Leaves: make food (photosynthesis) and let out water vapour.',
      'Flowers become fruits; fruits carry the seeds.',
    ],
    example: 'A carrot is a root we eat; a potato is a stem that stores food; spinach is a leaf; a mango is a fruit.',
    quiz: [
      OfflineQuestion('Which part of a plant makes food?', ['Root', 'Stem', 'Leaf', 'Flower'], 2, 'Leaves make food using sunlight, water and air.'),
      OfflineQuestion('Which part takes water from the soil?', ['Root', 'Leaf', 'Fruit', 'Flower'], 0, 'Roots absorb water and minerals.'),
      OfflineQuestion('A potato is a…', ['Root', 'Stem', 'Leaf', 'Seed'], 1, 'A potato is an underground stem that stores food; it has eyes (buds).'),
    ],
    realLifeText: 'Look at your lunch: rice and wheat are seeds, carrot and radish are roots, onion is a leaf base, cauliflower is a flower.',
    activityText:
        'Plant hunt (10 min): groups sort pictures or real vegetables into root, stem, leaf, flower, fruit, seed. Each group explains one surprise (potato is a stem, tomato is a fruit).',
    mistakesList: ['Calling a potato a root: it is an underground stem.', 'Saying roots make food: leaves make food, roots take in water.'],
  ),
  Topic(
    title: 'Animals and their homes',
    subjects: ['EVS', 'Science'],
    keywords: ['animals and their homes', 'animal homes', 'habitat', 'habitats', 'where animals live', 'shelter'],
    summary:
        'Animals live in homes that keep them safe, warm or dry. Birds build nests, rabbits dig burrows, bees live in hives and spiders spin webs. The place where an animal lives and finds its food is its habitat.',
    keyPoints: [
      'A habitat gives food, water and shelter.',
      'Land habitats: forest, desert, grassland. Water habitats: ponds, rivers, the sea.',
      'Animals are adapted to their habitat: a camel stores fat in its hump; a fish breathes with gills.',
    ],
    example: 'Home names: bird → nest, bee → hive, lion → den, rabbit → burrow, spider → web, horse → stable, cow → shed.',
    quiz: [
      OfflineQuestion('Where does a bee live?', ['Nest', 'Hive', 'Den', 'Burrow'], 1, 'Bees live together in a hive.'),
      OfflineQuestion('Which animal lives in a burrow?', ['Rabbit', 'Eagle', 'Fish', 'Horse'], 0, 'Rabbits dig burrows underground.'),
      OfflineQuestion('A camel is suited to the…', ['Sea', 'Desert', 'Snow', 'Forest'], 1, 'Its hump stores fat, and its feet do not sink in sand.'),
    ],
    realLifeText: 'Look up at a tree near school: there may be a nest. Look under a stone: ants and worms make their homes there.',
    activityText: 'Match the home (8 min): each pupil gets an animal card and finds the classmate holding its home card. Pairs tell the class one thing the home protects the animal from.',
  ),
  Topic(
    title: 'Food and nutrition',
    subjects: ['EVS', 'Science', 'Biology'],
    keywords: ['food and nutrition', 'balanced diet', 'nutrients', 'healthy food', 'food groups', 'carbohydrates', 'proteins', 'vitamins'],
    summary:
        'Food gives us energy, helps us grow and keeps us healthy. The main nutrients are carbohydrates and fats (energy), proteins (growth and repair), vitamins and minerals (protection from disease), plus water and fibre. A balanced diet has all of them in the right amounts.',
    keyPoints: [
      'Energy-giving: rice, wheat, potato, sugar, oil and ghee.',
      'Body-building (proteins): dal, milk, eggs, fish, paneer.',
      'Protective (vitamins, minerals): fruits and vegetables.',
      'Lack of a nutrient causes a deficiency disease (vitamin C → scurvy, iron → anaemia).',
    ],
    example: 'A plate of rice, dal, a green vegetable, curd and a fruit is a balanced meal.',
    quiz: [
      OfflineQuestion('Which food is rich in protein?', ['Rice', 'Dal', 'Sugar', 'Oil'], 1, 'Pulses like dal are body-building foods.'),
      OfflineQuestion('Lack of vitamin C causes…', ['Scurvy', 'Rickets', 'Goitre', 'Anaemia'], 0, 'Scurvy: bleeding gums. Citrus fruits give vitamin C.'),
      OfflineQuestion('Which gives us the most energy?', ['Cucumber', 'Ghee', 'Water', 'Spinach'], 1, 'Fats give the most energy per gram.'),
    ],
    realLifeText: 'Look at a school mid-day meal: rice for energy, dal or egg for growth, vegetables for protection.',
    activityText: 'Plate planner (10 min): pairs draw a plate and fill it for one day from a list of Indian foods, then label each item energy, body-building or protective. The class checks every plate has all three.',
    mistakesList: ['Thinking fat is always bad: small amounts are needed for energy.', 'Mixing up vitamins (protective) with proteins (body-building).'],
  ),
  Topic(
    title: 'Our senses',
    subjects: ['EVS', 'Science'],
    keywords: ['sense organs', 'five senses', 'our senses', 'sense of touch', 'sense of smell', 'sense of taste'],
    summary:
        'We know the world through five senses: sight (eyes), hearing (ears), smell (nose), taste (tongue) and touch (skin). The sense organs send messages to the brain, which tells us what we see, hear, smell, taste or feel.',
    keyPoints: ['Eyes – see; ears – hear; nose – smell; tongue – taste; skin – touch.', 'The brain makes sense of the messages.', 'Some people use other senses more: Braille is read by touch.'],
    example: 'When we eat a mango we see its colour, smell it, feel it soft and taste it sweet: four senses at once.',
    quiz: [
      OfflineQuestion('Which sense organ helps us feel hot and cold?', ['Ear', 'Skin', 'Nose', 'Eye'], 1, 'The skin senses touch, heat and cold.'),
      OfflineQuestion('Braille is read using the sense of…', ['Sight', 'Touch', 'Hearing', 'Smell'], 1, 'Braille letters are raised dots felt with the fingers.'),
      OfflineQuestion('Which organ tells us the milk has gone bad before we taste it?', ['Nose', 'Ear', 'Skin', 'Hair'], 0, 'We smell that it is sour.'),
    ],
    activityText: 'Mystery bag (8 min): a volunteer, eyes closed, identifies objects only by touch or smell, and the class records which sense solved each one.',
  ),
  Topic(
    title: 'The solar system',
    subjects: ['EVS', 'Science', 'Geography', 'Physics'],
    keywords: ['solar system', 'planets', 'the planets', 'orbit the sun', 'eight planets'],
    summary:
        'The solar system is the Sun and everything that moves around it: eight planets, their moons, dwarf planets, asteroids and comets. In order from the Sun the planets are Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus and Neptune.',
    keyPoints: [
      'The Sun is a star; it gives light and heat.',
      'Inner rocky planets: Mercury, Venus, Earth, Mars. Outer giant planets: Jupiter, Saturn, Uranus, Neptune.',
      'Jupiter is the largest planet; Mercury is the smallest and nearest the Sun.',
      'The Moon is Earth\'s natural satellite.',
    ],
    example: 'A way to remember the order: "My Very Educated Mother Just Served Us Noodles."',
    quiz: [
      OfflineQuestion('Which is the largest planet?', ['Earth', 'Saturn', 'Jupiter', 'Neptune'], 2, 'Jupiter is more than 11 times as wide as Earth.'),
      OfflineQuestion('Which planet is nearest the Sun?', ['Venus', 'Mercury', 'Mars', 'Earth'], 1, 'Mercury is the first planet.'),
      OfflineQuestion('The Sun is a…', ['Planet', 'Star', 'Moon', 'Comet'], 1, 'The Sun is a star: it makes its own light.'),
    ],
    realLifeText: 'Just after sunset, the brightest "star" in the west is often Venus.',
    activityText: 'Human solar system (10 min): pupils hold planet cards and stand at scaled distances from the "Sun" across the ground; the class sees how far Neptune is.',
  ),
  Topic(
    title: '2D shapes',
    subjects: ['Mathematics'],
    keywords: ['2d shapes', 'shapes', 'sides and corners', 'sides and vertices', 'basic shapes'],
    summary:
        'Flat (2D) shapes have length and width but no thickness. We describe them by their sides and corners (vertices): a triangle has 3 sides, a square 4 equal sides, a rectangle 4 sides with opposite sides equal, and a circle has no straight sides and no corners.',
    keyPoints: ['Triangle: 3 sides, 3 corners.', 'Square: 4 equal sides, 4 right angles.', 'Rectangle: opposite sides equal, 4 right angles.', 'Circle: one curved edge, no corners.'],
    example: 'A chapati is a circle, a notebook page is a rectangle, a samosa looks like a triangle, a chessboard square is a square.',
    quiz: [
      OfflineQuestion('How many corners does a triangle have?', ['2', '3', '4', '0'], 1, 'Three sides meet at three corners.'),
      OfflineQuestion('Which shape has no corners?', ['Square', 'Circle', 'Triangle', 'Rectangle'], 1, 'A circle has only a curved edge.'),
      OfflineQuestion('A shape with 4 equal sides and 4 right angles is a…', ['Rectangle', 'Square', 'Triangle', 'Circle'], 1, 'All sides equal and all angles 90°.'),
    ],
    activityText: 'Shape walk (8 min): pairs list objects in the classroom for each shape (door, clock, set square, window) and tally which shape is most common.',
  ),
  Topic(
    title: 'Place value',
    subjects: ['Mathematics'],
    keywords: ['place value', 'face value', 'ones tens hundreds', 'expanded form', 'hundreds tens ones'],
    summary:
        'In our number system the value of a digit depends on its place. In 345, the 3 means 3 hundreds (300), the 4 means 4 tens (40) and the 5 means 5 ones. Each place is ten times the place to its right.',
    keyPoints: ['Places from the right: ones, tens, hundreds, thousands…', 'Place value = digit × value of its place.', 'Face value is the digit itself.', 'Expanded form: 345 = 300 + 40 + 5.'],
    example: 'In 7,582 the place value of 5 is 500 and its face value is 5.',
    quiz: [
      OfflineQuestion('What is the place value of 6 in 1,625?', ['6', '60', '600', '6,000'], 2, 'The 6 is in the hundreds place: 600.'),
      OfflineQuestion('Expanded form of 408 is…', ['4 + 0 + 8', '400 + 8', '40 + 8', '400 + 80'], 1, '4 hundreds, 0 tens, 8 ones.'),
      OfflineQuestion('Which number has 7 tens?', ['137', '713', '371', '317'], 2, '371 is 3 hundreds, 7 tens and 1 one.'),
    ],
    realLifeText: 'A ₹345 bill paid with notes: three ₹100 notes, four ₹10 notes and five ₹1 coins.',
    activityText: 'Human numbers (8 min): three pupils hold digit cards and stand in the ones, tens and hundreds spots; the class reads the number, then two pupils swap places and the class says how the value changed.',
  ),
  Topic(
    title: 'Telling the time',
    subjects: ['Mathematics', 'EVS'],
    keywords: ['telling the time', 'reading a clock', 'hour hand', 'minute hand', 'o\'clock', 'half past', 'quarter past'],
    summary:
        'A clock face has 12 numbers. The short hand shows the hour and the long hand shows the minutes. Each number on the dial stands for 5 minutes for the long hand, so when the long hand points to 6 it is 30 minutes past the hour (half past).',
    keyPoints: ['Short hand = hours; long hand = minutes.', '60 minutes make 1 hour; the long hand goes round once in an hour.', 'Quarter past = 15 minutes, half past = 30, quarter to = 45.'],
    example: 'If the short hand is just past 3 and the long hand is on 6, the time is half past three (3:30).',
    quiz: [
      OfflineQuestion('The long hand points to 3. How many minutes past the hour?', ['3', '15', '30', '45'], 1, 'Each number is 5 minutes: 3 × 5 = 15.'),
      OfflineQuestion('How many minutes are in one hour?', ['30', '60', '100', '24'], 1, 'The long hand goes all the way round: 60 minutes.'),
      OfflineQuestion('Half past seven is written…', ['7:15', '7:30', '7:45', '6:30'], 1, 'Half an hour is 30 minutes.'),
    ],
    activityText: 'Clock orders (8 min): the teacher calls a school event ("lunch at half past twelve"); pupils set paper clocks and hold them up; the class checks the long hand first.',
  ),
  Topic(
    title: 'Nouns',
    subjects: ['English'],
    keywords: ['noun', 'nouns', 'naming words', 'common noun', 'proper noun', 'collective noun'],
    summary:
        'A noun is a naming word: it names a person, place, animal or thing. A proper noun names a particular one and begins with a capital letter (Ravi, Mysuru). A common noun names any one of a kind (boy, city). A collective noun names a group (a flock of birds).',
    keyPoints: ['Person, place, animal or thing → noun.', 'Proper nouns start with a capital letter.', 'Collective nouns: a team of players, a herd of cows, a bunch of keys.'],
    example: '"Meera took her dog to Cubbon Park." Nouns: Meera (proper), dog (common), Cubbon Park (proper).',
    quiz: [
      OfflineQuestion('Which is a proper noun?', ['river', 'Kaveri', 'city', 'girl'], 1, 'Kaveri names one particular river.'),
      OfflineQuestion('"A ___ of birds"', ['herd', 'flock', 'bunch', 'school'], 1, 'A flock of birds; a school of fish.'),
      OfflineQuestion('Find the noun: "The happy children sang loudly."', ['happy', 'children', 'sang', 'loudly'], 1, 'Children names people.'),
    ],
    activityText: 'Noun hunt (8 min): pairs get a short paragraph and circle common nouns in one colour and proper nouns in another, then read one proper noun each aloud with its capital letter.',
    mistakesList: ['Writing proper nouns in small letters.', 'Calling describing words (adjectives) nouns.'],
  ),
  Topic(
    title: 'Verbs',
    subjects: ['English'],
    keywords: ['verb', 'verbs', 'action words', 'doing words', 'helping verbs'],
    summary:
        'A verb is an action or doing word: run, eat, write, think. Verbs can also show a state (is, are, seem). Every sentence needs a verb. Helping verbs (is, are, was, has, will) work with main verbs to show time: "She is writing."',
    keyPoints: ['Action verbs: jump, sing, read.', 'Being verbs: am, is, are, was, were.', 'Helping verb + main verb: "They have finished."'],
    example: '"The dog barked and ran after the ball." Verbs: barked, ran.',
    quiz: [
      OfflineQuestion('Which word is a verb?', ['quickly', 'swim', 'blue', 'table'], 1, 'Swim is an action.'),
      OfflineQuestion('Find the helping verb: "Ravi is reading a book."', ['Ravi', 'is', 'reading', 'book'], 1, '"Is" helps the main verb "reading".'),
      OfflineQuestion('Every complete sentence has a…', ['noun only', 'verb', 'adjective', 'comma'], 1, 'Without a verb there is no sentence.'),
    ],
    activityText: 'Verb charades (8 min): a pupil acts out a verb from a card; the class guesses and writes a sentence using it.',
  ),
];

const _middleScience = <Topic>[
  Topic(
    title: 'States of matter',
    subjects: ['Science', 'Chemistry', 'Physics'],
    keywords: ['states of matter', 'solid liquid gas', 'solids liquids and gases', 'melting', 'boiling', 'sublimation', 'change of state'],
    summary:
        'Matter is anything that has mass and takes up space. It exists as solid, liquid or gas. In a solid the particles are packed tightly and only vibrate; in a liquid they are close but slide past each other; in a gas they are far apart and move freely. Heating or cooling changes the state.',
    keyPoints: [
      'Solid: fixed shape and volume. Liquid: fixed volume, takes the shape of its container. Gas: fills any container.',
      'Melting (solid → liquid), boiling/evaporation (liquid → gas), condensation (gas → liquid), freezing (liquid → solid).',
      'Sublimation: solid straight to gas (camphor, naphthalene, dry ice).',
      'Water melts at 0 °C and boils at 100 °C (at sea level).',
    ],
    example: 'Ice (solid) melts into water (liquid), which boils into steam (gas) — the same substance in three states.',
    quiz: [
      OfflineQuestion('Which has a fixed volume but no fixed shape?', ['Solid', 'Liquid', 'Gas', 'None'], 1, 'Liquids take the shape of the container but keep their volume.'),
      OfflineQuestion('Camphor disappearing without melting is…', ['Evaporation', 'Sublimation', 'Condensation', 'Melting'], 1, 'Solid turning directly into gas is sublimation.'),
      OfflineQuestion('In which state are particles farthest apart?', ['Solid', 'Liquid', 'Gas', 'All the same'], 2, 'Gas particles move freely with large gaps.'),
    ],
    realLifeText: 'Drops on a cold water bottle (condensation), a wet floor drying (evaporation), ghee setting in winter (freezing).',
    activityText: 'Be the particles (8 min): pupils act as particles: packed and shivering (solid), sliding around each other (liquid), spread out across the room (gas). The teacher "heats" and "cools" the class.',
    mistakesList: ['Saying steam is visible: the white cloud is tiny water droplets; steam itself is invisible.', 'Confusing evaporation (any temperature, at the surface) with boiling (at the boiling point, throughout).'],
  ),
  Topic(
    title: 'Magnets',
    subjects: ['Science', 'Physics', 'EVS'],
    keywords: ['magnet', 'magnets', 'magnetic', 'north pole', 'south pole', 'magnetic materials'],
    summary:
        'A magnet attracts iron, nickel and cobalt. Every magnet has two poles, north and south. Like poles repel and unlike poles attract. A freely hanging magnet always points north–south, which is how a compass works.',
    keyPoints: ['Magnetic materials: iron, nickel, cobalt. Non-magnetic: wood, plastic, copper, aluminium.', 'Like poles repel; unlike poles attract.', 'A magnet\'s pull is strongest at its poles.', 'Heating, hammering or dropping can weaken a magnet.'],
    example: 'A compass needle is a tiny magnet; its north pole points to the Earth\'s geographic north.',
    quiz: [
      OfflineQuestion('Which is attracted by a magnet?', ['Copper coin', 'Iron nail', 'Plastic scale', 'Rubber'], 1, 'Iron is a magnetic material.'),
      OfflineQuestion('Two north poles brought together will…', ['Attract', 'Repel', 'Do nothing', 'Stick'], 1, 'Like poles repel.'),
      OfflineQuestion('Where is a bar magnet strongest?', ['Middle', 'Ends (poles)', 'Everywhere equally', 'Nowhere'], 1, 'Iron filings gather at the poles.'),
    ],
    realLifeText: 'Fridge-door seals, the lid of a pencil box, and the speaker in your phone all use magnets.',
    activityText: 'Magnet sort (8 min): groups test ten objects with a magnet, predict first, then record which are magnetic and why a steel spoon sticks but a steel tumbler sometimes does not.',
  ),
  Topic(
    title: 'Reflection of light',
    subjects: ['Science', 'Physics'],
    keywords: ['reflection of light', 'reflection', 'mirror', 'plane mirror', 'angle of incidence', 'angle of reflection', 'shadows'],
    summary:
        'Light travels in straight lines. When it falls on a smooth shiny surface like a mirror it bounces back: this is reflection. The angle of incidence equals the angle of reflection, measured from the normal. A plane mirror forms an upright image, the same size, as far behind the mirror as the object is in front, and laterally inverted (left and right swap).',
    keyPoints: ['Laws: angle of incidence = angle of reflection; incident ray, reflected ray and normal lie in one plane.', 'Plane mirror image: virtual, erect, same size, laterally inverted.', 'Opaque objects block light and make shadows.'],
    formulaTex: r'\angle i = \angle r',
    example: 'AMBULANCE is written reversed on the front of ambulances so drivers ahead read it correctly in their mirrors.',
    quiz: [
      OfflineQuestion('If the angle of incidence is 40°, the angle of reflection is…', ['50°', '40°', '80°', '90°'], 1, 'They are always equal.'),
      OfflineQuestion('An image in a plane mirror is…', ['Inverted', 'Laterally inverted', 'Magnified', 'Real'], 1, 'Left and right are swapped.'),
      OfflineQuestion('Shadows form because light…', ['Bends', 'Travels in straight lines', 'Is a wave', 'Is hot'], 1, 'An object blocks straight rays.'),
    ],
    activityText: 'Mirror writing (8 min): pupils write their name so that it reads correctly in a mirror, then explain lateral inversion with the ambulance example.',
  ),
  Topic(
    title: 'Electric circuits',
    subjects: ['Science', 'Physics'],
    keywords: ['electric circuit', 'electric circuits', 'circuit', 'conductors', 'insulators', 'switch', 'bulb and cell', 'series and parallel'],
    summary:
        'Electric current flows only through a closed path called a circuit: a cell, wires, a switch and a bulb. Materials that let current flow are conductors (metals); those that do not are insulators (plastic, rubber, wood). A switch opens or closes the circuit.',
    keyPoints: ['Closed circuit: bulb glows. Open circuit: no current.', 'Conductors: copper, aluminium, iron. Insulators: plastic, rubber, glass.', 'In series, one broken bulb stops all; in parallel, the others stay on.', 'Never touch switches with wet hands: water with impurities conducts.'],
    example: 'Home wiring is in parallel, so switching off the fan does not switch off the light.',
    quiz: [
      OfflineQuestion('Which is a conductor?', ['Rubber', 'Copper', 'Plastic', 'Wood'], 1, 'Metals like copper conduct electricity.'),
      OfflineQuestion('A bulb glows only when the circuit is…', ['Open', 'Closed', 'Broken', 'Wet'], 1, 'Current needs a complete path.'),
      OfflineQuestion('Why are wires covered with plastic?', ['Colour', 'Plastic is an insulator', 'Plastic conducts', 'Weight'], 1, 'The covering stops shocks and short circuits.'),
    ],
    activityText: 'Conductor tester (10 min): groups build a cell–bulb circuit with a gap and test coins, pencil lead, eraser, foil and a key in the gap; the graphite surprise leads the discussion.',
  ),
  Topic(
    title: 'The digestive system',
    subjects: ['Science', 'Biology'],
    keywords: ['digestive system', 'digestion', 'alimentary canal', 'small intestine', 'stomach', 'food pipe'],
    summary:
        'Digestion breaks food into simple substances the body can absorb. Food passes through the mouth, food pipe (oesophagus), stomach, small intestine and large intestine. Saliva starts digesting starch, the stomach digests protein with acid and enzymes, and the small intestine completes digestion and absorbs nutrients into the blood.',
    keyPoints: ['Mouth → oesophagus → stomach → small intestine → large intestine → anus.', 'Liver makes bile (breaks fat into droplets); pancreas makes digestive juices.', 'Small intestine: villi absorb digested food.', 'Large intestine absorbs water.'],
    example: 'Chew a piece of roti for a minute and it tastes sweet: saliva is turning starch into sugar.',
    quiz: [
      OfflineQuestion('Where is most food absorbed?', ['Stomach', 'Small intestine', 'Large intestine', 'Mouth'], 1, 'Villi in the small intestine absorb nutrients.'),
      OfflineQuestion('Bile is made by the…', ['Stomach', 'Liver', 'Pancreas', 'Kidney'], 1, 'The liver makes bile; the gall bladder stores it.'),
      OfflineQuestion('Digestion of starch begins in the…', ['Mouth', 'Stomach', 'Large intestine', 'Food pipe'], 0, 'Saliva contains an enzyme that digests starch.'),
    ],
    activityText: 'Journey of a roti (10 min): pupils in a line each play an organ and pass a paper "roti" along, saying what they do to it; the small intestine keeps the "nutrients".',
  ),
  Topic(
    title: 'The cell',
    subjects: ['Science', 'Biology'],
    keywords: ['cell structure', 'plant cell', 'animal cell', 'cell membrane', 'cell wall', 'nucleus', 'cytoplasm', 'the cell', 'unit of life', 'cell organelles'],
    summary:
        'The cell is the basic unit of life. Every cell has a cell membrane, cytoplasm and a nucleus that controls it. Plant cells also have a rigid cell wall, chloroplasts for making food and a large vacuole; animal cells do not.',
    keyPoints: ['Cell membrane: controls what enters and leaves.', 'Nucleus: contains DNA, controls the cell.', 'Plant cells only: cell wall, chloroplasts, large central vacuole.', 'Mitochondria release energy from food (respiration).'],
    example: 'Onion peel under a microscope shows brick-like cells with cell walls and nuclei.',
    quiz: [
      OfflineQuestion('Which is found only in plant cells?', ['Nucleus', 'Cell wall', 'Cytoplasm', 'Cell membrane'], 1, 'Animal cells have no cell wall.'),
      OfflineQuestion('Which part controls the cell?', ['Vacuole', 'Nucleus', 'Cell wall', 'Chloroplast'], 1, 'The nucleus holds the genetic instructions.'),
      OfflineQuestion('Chloroplasts are needed for…', ['Digestion', 'Photosynthesis', 'Movement', 'Reproduction'], 1, 'They contain chlorophyll, which traps light.'),
    ],
    activityText: 'Cell in a bag (10 min): groups build a cell from a zip bag (membrane), gel (cytoplasm), a marble (nucleus) and beans (mitochondria), then turn it into a plant cell with a box (wall) and green paper (chloroplasts).',
    mistakesList: ['Saying animal cells have a cell wall.', 'Confusing the cell membrane with the cell wall.'],
  ),
  Topic(
    title: 'Motion and speed',
    subjects: ['Science', 'Physics'],
    keywords: ['motion and speed', 'speed', 'distance time', 'distance-time graph', 'uniform motion', 'average speed', 'velocity'],
    summary:
        'Speed tells how fast something moves: the distance covered in unit time. Speed = distance ÷ time, measured in m/s or km/h. Motion is uniform when equal distances are covered in equal times. Velocity is speed in a given direction.',
    keyPoints: ['Speed = distance / time.', 'Average speed = total distance / total time.', '1 km/h = 5/18 m/s.', 'A straight distance–time graph means uniform motion.'],
    formulaTex: r'\text{speed} = \frac{\text{distance}}{\text{time}}',
    example: 'A bus covers 120 km in 3 hours: speed = 120 ÷ 3 = 40 km/h.',
    exampleTex: r'v = \frac{120\ \text{km}}{3\ \text{h}} = 40\ \text{km/h}',
    quiz: [
      OfflineQuestion('A cyclist goes 30 km in 2 h. Speed?', ['60 km/h', '15 km/h', '32 km/h', '28 km/h'], 1, '30 ÷ 2 = 15 km/h.'),
      OfflineQuestion('36 km/h in m/s is…', ['10 m/s', '36 m/s', '3.6 m/s', '100 m/s'], 0, '36 × 5/18 = 10 m/s.'),
      OfflineQuestion('A straight, sloping distance–time graph shows…', ['Rest', 'Uniform motion', 'Speeding up', 'Slowing down'], 1, 'Constant slope means constant speed.'),
    ],
    activityText: 'Corridor speed (10 min): pupils time a walker, a fast walker and a runner over 10 m, calculate each speed, and plot the three lines on one distance–time graph.',
    mistakesList: ['Mixing units: convert km/h and m/s before comparing.', 'Adding speeds to get average speed instead of total distance ÷ total time.'],
  ),
  Topic(
    title: 'Acids, bases and salts',
    subjects: ['Science', 'Chemistry'],
    keywords: ['acids and bases', 'acids bases and salts', 'acids', 'litmus', 'ph scale', 'ph value', 'neutralisation', 'neutralization', 'antacid'],
    summary:
        'Acids taste sour and turn blue litmus red; bases taste bitter, feel soapy and turn red litmus blue. An acid and a base react to give a salt and water: neutralisation. The pH scale runs from 0 to 14: below 7 is acidic, 7 is neutral, above 7 is basic.',
    keyPoints: ['Acids: lemon juice (citric), vinegar (acetic), curd (lactic). Bases: soap, baking soda, lime water.', 'Indicators: litmus, turmeric (turns red with bases), phenolphthalein.', 'Acid + base → salt + water.', 'pH 7 = neutral (pure water).'],
    formulaTex: r'\text{HCl} + \text{NaOH} \rightarrow \text{NaCl} + \text{H}_2\text{O}',
    example: 'An ant bite injects formic acid; rubbing baking soda (a base) on it neutralises the acid and eases the pain.',
    quiz: [
      OfflineQuestion('Which turns red litmus blue?', ['Lemon juice', 'Soap solution', 'Vinegar', 'Curd'], 1, 'Soap is basic.'),
      OfflineQuestion('A solution with pH 3 is…', ['Neutral', 'Strongly basic', 'Acidic', 'Salt'], 2, 'Below 7 means acidic.'),
      OfflineQuestion('Acid + base gives…', ['Only water', 'Salt and water', 'Only gas', 'Another acid'], 1, 'That reaction is neutralisation.'),
    ],
    realLifeText: 'Antacid tablets neutralise extra stomach acid; farmers add lime to acidic soil.',
    activityText: 'Kitchen indicator (10 min): turmeric paper test on lemon juice, soap water, baking soda solution and tap water; groups sort them into acid, base, neutral.',
    mistakesList: ['Tasting or touching lab chemicals to test them.', 'Thinking all salts are like table salt.'],
  ),
  Topic(
    title: 'Layers of the Earth',
    subjects: ['Geography', 'Science'],
    keywords: ['layers of the earth', 'interior of the earth', 'crust mantle core', 'earth\'s crust', 'mantle', 'inner core'],
    summary:
        'The Earth has three main layers. The crust is the thin rocky outer layer we live on. Below it is the mantle, hot rock that flows very slowly. At the centre is the core: a liquid outer core and a solid inner core made mostly of iron and nickel, as hot as the Sun\'s surface.',
    keyPoints: ['Crust: thinnest layer, about 5–70 km thick (thin under oceans, thick under mountains).', 'Mantle: about 2,900 km thick; moving rock drives earthquakes and volcanoes.', 'Core: outer liquid, inner solid; iron and nickel.'],
    example: 'The Earth is like a boiled egg: the thin shell is the crust, the white is the mantle, the yolk is the core.',
    quiz: [
      OfflineQuestion('We live on the…', ['Mantle', 'Crust', 'Core', 'Outer core'], 1, 'The crust is the outer rocky layer.'),
      OfflineQuestion('The core is made mostly of…', ['Granite', 'Iron and nickel', 'Water', 'Sand'], 1, 'Iron and nickel.'),
      OfflineQuestion('Which layer is thickest?', ['Crust', 'Mantle', 'Inner core', 'Soil'], 1, 'The mantle is about 2,900 km thick.'),
    ],
    activityText: 'Clay Earth (10 min): groups make a ball of three colours of clay, cut it in half and label the layers with their thickness.',
  ),
  Topic(
    title: 'Volcanoes',
    subjects: ['Geography', 'Science'],
    keywords: ['volcano', 'volcanoes', 'lava', 'magma', 'eruption', 'active volcano'],
    summary:
        'A volcano is an opening in the Earth\'s crust through which molten rock (magma), gases and ash come out. Magma that reaches the surface is called lava. Volcanoes are active (erupting now or recently), dormant (sleeping) or extinct. Most lie where tectonic plates meet, such as the Pacific "Ring of Fire".',
    keyPoints: ['Magma underground; lava on the surface.', 'Parts: magma chamber, vent, crater.', 'India\'s only active volcano is on Barren Island (Andaman Islands).', 'Volcanic soil is very fertile.'],
    example: 'Barren Island in the Andaman Sea erupted again in 2017.',
    quiz: [
      OfflineQuestion('Molten rock on the Earth\'s surface is called…', ['Magma', 'Lava', 'Ash', 'Crust'], 1, 'Magma becomes lava when it comes out.'),
      OfflineQuestion('India\'s active volcano is on…', ['Barren Island', 'Lakshadweep', 'Goa', 'Sri Lanka'], 0, 'Barren Island, Andaman and Nicobar.'),
      OfflineQuestion('A volcano that has not erupted for thousands of years and will not again is…', ['Active', 'Dormant', 'Extinct', 'New'], 2, 'Extinct volcanoes are dead.'),
    ],
    activityText: 'Baking-soda volcano (10 min, outdoors): a paper cone over a cup, baking soda and vinegar with a drop of colour; pupils label vent, crater and "lava" and compare it with the real thing.',
  ),
];

const _middleMaths = <Topic>[
  Topic(
    title: 'Integers',
    subjects: ['Mathematics'],
    keywords: ['integers', 'negative numbers', 'positive and negative', 'number line integers'],
    summary:
        'Integers are the whole numbers and their negatives: … −3, −2, −1, 0, 1, 2, 3 … On a number line, numbers to the right are bigger. Adding a negative number is the same as subtracting; subtracting a negative is the same as adding.',
    keyPoints: ['0 is neither positive nor negative.', 'a + (−b) = a − b;  a − (−b) = a + b.', 'Same signs multiply to +, different signs to −.', '−5 is less than −2.'],
    example: 'The temperature in Leh is −4 °C and in Chennai 31 °C: the difference is 31 − (−4) = 35 °C.',
    exampleTex: r'31 - (-4) = 31 + 4 = 35',
    quiz: [
      OfflineQuestion('(−7) + 3 = ?', ['−10', '−4', '4', '10'], 1, 'Move 3 right from −7 on the number line: −4.'),
      OfflineQuestion('(−6) × (−2) = ?', ['−12', '12', '−8', '8'], 1, 'Negative × negative = positive.'),
      OfflineQuestion('Which is greater?', ['−9', '−2', '−5', '−7'], 1, '−2 is furthest right.'),
    ],
    activityText: 'Number-line walk (8 min): a floor number line; pupils take cards like "+3" or "−5" and walk them, predicting the landing number first.',
    mistakesList: ['Thinking −8 is bigger than −3.', 'Forgetting that minus a negative becomes plus.'],
  ),
  Topic(
    title: 'Ratio and proportion',
    subjects: ['Mathematics'],
    keywords: ['ratio', 'ratios', 'proportion', 'unitary method', 'ratio and proportion'],
    summary:
        'A ratio compares two quantities of the same kind by division, written a : b. Ratios are simplified like fractions. Four numbers are in proportion when two ratios are equal: a : b = c : d, which means a × d = b × c. The unitary method finds the value of one unit first.',
    keyPoints: ['A ratio has no units; convert to the same unit first.', 'Simplify: 12 : 18 = 2 : 3.', 'Proportion: a : b = c : d ⇔ ad = bc.', 'Unitary method: find one, then multiply.'],
    formulaTex: r'a : b = c : d \iff ad = bc',
    example: 'If 5 pens cost ₹60, one pen costs ₹12, so 8 pens cost ₹96.',
    quiz: [
      OfflineQuestion('Simplify 15 : 25', ['3 : 5', '5 : 3', '1 : 5', '15 : 5'], 0, 'Divide both by 5.'),
      OfflineQuestion('Are 2, 3, 8, 12 in proportion?', ['Yes', 'No'], 0, '2 × 12 = 24 = 3 × 8.'),
      OfflineQuestion('6 kg of rice cost ₹300. Cost of 4 kg?', ['₹150', '₹200', '₹250', '₹180'], 1, '₹50 per kg × 4 = ₹200.'),
    ],
    activityText: 'Recipe scaling (8 min): a lemonade recipe for 4; groups rewrite it for 10 people and explain their method.',
  ),
  Topic(
    title: 'Perimeter and area',
    subjects: ['Mathematics'],
    keywords: ['perimeter', 'area of a rectangle', 'area of rectangle', 'area of a square', 'perimeter and area', 'area and perimeter'],
    summary:
        'Perimeter is the distance around a shape; area is the space it covers. For a rectangle, perimeter = 2 × (length + breadth) and area = length × breadth. For a square with side a, perimeter = 4a and area = a². Area is measured in square units such as cm² or m².',
    keyPoints: ['Perimeter: add all sides (cm, m).', 'Rectangle area = l × b; square area = a².', 'Triangle area = ½ × base × height.', 'Area uses square units.'],
    formulaTex: r'P = 2(l + b), \quad A = l \times b',
    example: 'A classroom 8 m long and 6 m wide: perimeter 2 × (8 + 6) = 28 m, area 8 × 6 = 48 m².',
    quiz: [
      OfflineQuestion('Perimeter of a square of side 5 cm?', ['10 cm', '20 cm', '25 cm', '15 cm'], 1, '4 × 5 = 20 cm.'),
      OfflineQuestion('Area of a 7 m × 3 m rectangle?', ['10 m²', '20 m²', '21 m²', '42 m²'], 2, '7 × 3 = 21 m².'),
      OfflineQuestion('Area of a triangle, base 10 cm, height 4 cm?', ['40 cm²', '20 cm²', '14 cm²', '80 cm²'], 1, '½ × 10 × 4 = 20.'),
    ],
    activityText: 'Measure the room (10 min): groups measure a desk, a book and the door, calculate perimeter and area of each, and check who needs the most paper to cover their object.',
    mistakesList: ['Mixing up perimeter and area.', 'Forgetting square units for area.'],
  ),
  Topic(
    title: 'Algebraic expressions',
    subjects: ['Mathematics'],
    keywords: ['algebraic expressions', 'algebraic expression', 'like terms', 'unlike terms', 'simplifying expressions', 'simplify expressions', 'coefficient', 'terms and factors'],
    summary:
        'An algebraic expression combines numbers and variables with operations, like 3x + 2y − 5. Its parts separated by + or − are terms. Like terms have the same variables with the same powers (3x and −7x) and can be added; unlike terms (3x and 2y) cannot. The number in front of a variable is its coefficient.',
    keyPoints: ['Terms: 3x, 2y, −5 in 3x + 2y − 5.', 'Coefficient of x in 3x is 3.', 'Only like terms combine: 4a + 3a = 7a.', 'Expand brackets: 2(x + 3) = 2x + 6.'],
    formulaTex: r'4a + 3b - a + 2b = 3a + 5b',
    example: 'Simplify 5x + 3 − 2x + 7: collect like terms → 3x + 10.',
    exampleTex: r'5x + 3 - 2x + 7 = 3x + 10',
    quiz: [
      OfflineQuestion('Which are like terms?', ['2x and 2y', '3x² and 3x', '5ab and −2ab', '4 and 4x'], 2, 'Same variables with the same powers.'),
      OfflineQuestion('Simplify 6m − 2m + m', ['3m', '4m', '5m', '9m'], 2, '6 − 2 + 1 = 5.'),
      OfflineQuestion('Coefficient of y in 7 − 4y', ['7', '−4', '4', 'y'], 1, 'The sign belongs to the coefficient.'),
    ],
    activityText: 'Term sort (8 min): cards with terms like 3x, −2y, 5x², 7; groups sort into like-term piles, then add each pile.',
    mistakesList: ['Adding unlike terms: 2x + 3y is not 5xy.', 'Dropping the minus sign when collecting terms.'],
  ),
  Topic(
    title: 'Lines and angles',
    subjects: ['Mathematics'],
    keywords: ['lines and angles', 'types of angles', 'acute angle', 'obtuse angle', 'right angle', 'angle sum', 'angle sum property', 'complementary', 'supplementary'],
    summary:
        'An angle is formed where two rays meet. Acute angles are less than 90°, a right angle is exactly 90°, obtuse angles are between 90° and 180°, and a straight angle is 180°. Angles on a straight line add to 180°, angles around a point add to 360°, and the angles of any triangle add to 180°.',
    keyPoints: ['Complementary angles add to 90°; supplementary add to 180°.', 'Vertically opposite angles are equal.', 'Angle sum of a triangle = 180°.', 'Use a protractor from the zero line.'],
    formulaTex: r'\angle A + \angle B + \angle C = 180^\circ',
    example: 'A triangle has angles 50° and 60°. The third angle is 180° − 110° = 70°.',
    quiz: [
      OfflineQuestion('An angle of 120° is…', ['Acute', 'Right', 'Obtuse', 'Straight'], 2, 'Between 90° and 180°.'),
      OfflineQuestion('The supplement of 65° is…', ['25°', '115°', '295°', '35°'], 1, '180 − 65 = 115.'),
      OfflineQuestion('Two angles of a triangle are 90° and 35°. The third?', ['55°', '65°', '45°', '75°'], 0, '180 − 125 = 55.'),
    ],
    activityText: 'Tear and fit (8 min): pupils draw any triangle, tear off its three corners and fit them together on a straight line to see they make 180°.',
  ),
  Topic(
    title: 'Simple interest',
    subjects: ['Mathematics'],
    keywords: ['simple interest', 'rate of interest'],
    summary:
        'Interest is the extra money paid for using borrowed money, or earned on money deposited. Simple interest is calculated on the original amount (principal) only: SI = P × R × T ÷ 100, where R is the rate per cent per year and T the time in years. Amount = principal + interest.',
    keyPoints: ['SI = PRT / 100.', 'Amount = P + SI.', 'T must be in years (6 months = ½ year).'],
    formulaTex: r'SI = \frac{P \times R \times T}{100}',
    example: '₹5,000 at 8% a year for 3 years: SI = 5000 × 8 × 3 ÷ 100 = ₹1,200; amount = ₹6,200.',
    exampleTex: r'SI = \frac{5000 \times 8 \times 3}{100} = 1200',
    quiz: [
      OfflineQuestion('SI on ₹1,000 at 10% for 2 years?', ['₹100', '₹200', '₹1,200', '₹20'], 1, '1000 × 10 × 2 / 100 = 200.'),
      OfflineQuestion('Amount on ₹2,000 at 5% for 1 year?', ['₹2,100', '₹2,005', '₹100', '₹2,500'], 0, 'SI ₹100, so amount ₹2,100.'),
      OfflineQuestion('6 months as T in the formula is…', ['6', '0.5', '60', '1'], 1, 'Time is in years.'),
    ],
    activityText: 'Bank manager (8 min): pairs play depositor and banker with three deposit offers and decide which earns the most, showing their SI working.',
  ),
];

const _social = <Topic>[
  Topic(
    title: 'Directions and maps',
    subjects: ['Geography', 'EVS', 'Social Science'],
    keywords: ['directions', 'cardinal directions', 'map reading', 'map symbols', 'scale of a map', 'maps'],
    summary:
        'A map shows a place from above on a small scale. Maps have three components: distance (scale), direction and symbols. The four cardinal directions are north, south, east and west; between them are north-east, south-east, south-west and north-west. Maps usually have north at the top.',
    keyPoints: ['Scale: e.g. 1 cm = 1 km.', 'A compass needle points north.', 'Conventional symbols: blue for water, green for vegetation, brown for mountains.', 'The Sun rises in the east and sets in the west.'],
    example: 'On a school map with scale 1 cm = 10 m, the playground 5 cm away is 50 m away.',
    quiz: [
      OfflineQuestion('The Sun rises in the…', ['West', 'East', 'North', 'South'], 1, 'East.'),
      OfflineQuestion('Between north and east lies…', ['South-west', 'North-east', 'North-west', 'South-east'], 1, 'North-east.'),
      OfflineQuestion('Which colour usually shows water on a map?', ['Green', 'Brown', 'Blue', 'Yellow'], 2, 'Blue for water bodies.'),
    ],
    activityText: 'Classroom map (10 min): groups draw a map of the classroom to a scale, add a north arrow and symbols, then give each other directions to a hidden object.',
  ),
  Topic(
    title: 'The Mughal Empire',
    subjects: ['History', 'Social Science'],
    keywords: ['mughal', 'mughals', 'mughal empire', 'akbar', 'babur', 'shah jahan', 'aurangzeb', 'humayun'],
    summary:
        'The Mughal Empire ruled much of the Indian subcontinent from 1526, when Babur won the First Battle of Panipat, into the 18th century. Akbar (1556–1605) expanded and organised it with the mansabdari system and a policy of tolerance (sulh-i kul). Shah Jahan built the Taj Mahal; under Aurangzeb the empire reached its largest size and then weakened.',
    keyPoints: ['Babur → Humayun → Akbar → Jahangir → Shah Jahan → Aurangzeb.', '1526: First Battle of Panipat.', 'Akbar: mansabdari, land revenue under Todar Mal, sulh-i kul.', 'Monuments: Taj Mahal, Red Fort, Fatehpur Sikri, Humayun\'s Tomb.'],
    example: 'The Taj Mahal in Agra was built by Shah Jahan in memory of Mumtaz Mahal (completed around 1653).',
    quiz: [
      OfflineQuestion('Who founded the Mughal Empire in India?', ['Akbar', 'Babur', 'Humayun', 'Aurangzeb'], 1, 'Babur, after the First Battle of Panipat (1526).'),
      OfflineQuestion('The Taj Mahal was built by…', ['Akbar', 'Jahangir', 'Shah Jahan', 'Babur'], 2, 'Shah Jahan.'),
      OfflineQuestion('Akbar\'s ranking system of officials was the…', ['Iqta', 'Mansabdari', 'Zamindari', 'Panchayat'], 1, 'Mansabdars held ranks (zat and sawar).'),
    ],
    activityText: 'Emperor timeline (10 min): groups place the six great Mughals on a timeline with one achievement each and a monument picture.',
  ),
  Topic(
    title: 'The Indian Constitution',
    subjects: ['Civics', 'Social Science', 'History'],
    keywords: ['constitution', 'indian constitution', 'constitution of india', 'fundamental rights', 'preamble', 'fundamental duties', 'ambedkar'],
    summary:
        'The Constitution of India is the supreme law of the country. It was adopted on 26 November 1949 and came into force on 26 January 1950, now celebrated as Republic Day. Dr B. R. Ambedkar chaired its Drafting Committee. It makes India a sovereign, socialist, secular, democratic republic and guarantees Fundamental Rights to all citizens.',
    keyPoints: ['Preamble: justice, liberty, equality, fraternity.', 'Six Fundamental Rights, including equality, freedom and the right against exploitation.', 'Fundamental Duties: e.g. respect the national flag and anthem.', 'Separation of powers: legislature, executive, judiciary.'],
    example: 'Because of the Right to Education (Article 21A), every child aged 6 to 14 has the right to free and compulsory education.',
    quiz: [
      OfflineQuestion('The Constitution came into force on…', ['15 August 1947', '26 January 1950', '26 November 1949', '2 October 1950'], 1, 'That is why Republic Day is 26 January.'),
      OfflineQuestion('Who chaired the Drafting Committee?', ['Jawaharlal Nehru', 'Dr B. R. Ambedkar', 'Rajendra Prasad', 'Sardar Patel'], 1, 'Dr Ambedkar.'),
      OfflineQuestion('Which word in the Preamble means the state has no official religion?', ['Sovereign', 'Secular', 'Socialist', 'Republic'], 1, 'Secular.'),
    ],
    activityText: 'Class constitution (10 min): the class drafts five rights and five duties for their own classroom and compares them with the real Fundamental Rights and Duties.',
  ),
  Topic(
    title: 'The French Revolution',
    subjects: ['History', 'Social Science'],
    keywords: ['french revolution', 'bastille', 'louis xvi', 'liberty equality fraternity', 'estates general'],
    summary:
        'The French Revolution began in 1789. French society was divided into three estates, and only the third estate (commoners) paid taxes. A financial crisis made Louis XVI call the Estates General; the third estate declared itself the National Assembly, and on 14 July 1789 crowds stormed the Bastille. The revolution ended absolute monarchy and spread the ideas of liberty, equality and fraternity.',
    keyPoints: ['Three estates: clergy, nobility, commoners.', '14 July 1789: storming of the Bastille.', 'Declaration of the Rights of Man and Citizen (1789).', 'France became a republic in 1792; Louis XVI was executed in 1793.'],
    example: 'Our own Constitution\'s ideals of liberty, equality and fraternity echo the slogan of the French Revolution.',
    quiz: [
      OfflineQuestion('The Bastille was stormed on…', ['14 July 1789', '26 January 1950', '4 July 1776', '1 May 1789'], 0, '14 July 1789, now France\'s national day.'),
      OfflineQuestion('Which estate paid taxes?', ['First', 'Second', 'Third', 'None'], 2, 'The clergy and nobility were exempt.'),
      OfflineQuestion('The revolution\'s slogan was…', ['Peace, land, bread', 'Liberty, equality, fraternity', 'No taxation without representation', 'Swaraj'], 1, 'Liberté, égalité, fraternité.'),
    ],
    activityText: 'Three estates (10 min): the class is split 1 : 2 : 17 into estates and asked to vote by estate, then by head; pupils explain why the third estate walked out.',
  ),
  Topic(
    title: 'Nationalism in India',
    subjects: ['History', 'Social Science'],
    keywords: ['nationalism in india', 'freedom struggle', 'non-cooperation movement', 'civil disobedience', 'salt march', 'dandi march', 'quit india', 'gandhi'],
    summary:
        'Indian nationalism grew against British rule. Mahatma Gandhi led mass movements based on satyagraha (non-violent resistance): the Non-Cooperation Movement (1920–22), the Civil Disobedience Movement beginning with the Salt March to Dandi (1930) and the Quit India Movement (1942). India became independent on 15 August 1947.',
    keyPoints: ['Satyagraha: the power of truth and non-violence.', '1919: Jallianwala Bagh massacre.', '1930: Dandi March against the salt tax.', '1942: Quit India — "Do or die".'],
    example: 'At Dandi on 6 April 1930, Gandhi picked up natural salt, breaking the British salt law in front of the whole country.',
    quiz: [
      OfflineQuestion('The Salt March ended at…', ['Sabarmati', 'Dandi', 'Champaran', 'Bombay'], 1, 'Dandi, on the Gujarat coast.'),
      OfflineQuestion('Satyagraha means resistance by…', ['Force', 'Truth and non-violence', 'Elections', 'Trade'], 1, 'Non-violent resistance.'),
      OfflineQuestion('The Quit India Movement began in…', ['1920', '1930', '1942', '1947'], 2, 'August 1942.'),
    ],
    activityText: 'Movement cards (10 min): groups get one movement each and make a card: year, cause, method, result; the class lines them up in order.',
  ),
  Topic(
    title: 'Climate',
    subjects: ['Geography', 'Social Science', 'EVS'],
    keywords: ['climate', 'weather and climate', 'factors affecting climate', 'climate of india', 'latitude and altitude'],
    summary:
        'Weather is the state of the atmosphere at a place for a short time; climate is the average weather over many years (about 30). Climate depends on latitude, altitude, distance from the sea, winds, ocean currents and relief. India has a monsoon type of climate.',
    keyPoints: ['Latitude: places near the equator are hotter.', 'Altitude: temperature falls about 6.5 °C per 1,000 m of height.', 'Distance from the sea: coasts have moderate climate; interiors have extreme climate.', 'Relief: mountains block winds and cause rain on one side.'],
    example: 'Shimla (high altitude) stays cool in summer while Delhi, at nearly the same latitude, is very hot.',
    quiz: [
      OfflineQuestion('Average weather over many years is…', ['Weather', 'Climate', 'Season', 'Humidity'], 1, 'Climate.'),
      OfflineQuestion('Why is Ooty cooler than Chennai?', ['Latitude', 'Altitude', 'Ocean current', 'Longitude'], 1, 'Ooty is about 2,200 m high.'),
      OfflineQuestion('Mumbai has a moderate climate mainly because it is…', ['High up', 'Near the sea', 'Near the equator', 'In a desert'], 1, 'The sea keeps temperatures even.'),
    ],
    activityText: 'Weather diary vs climate chart (10 min): pupils compare a week of local weather they recorded with the city\'s monthly climate chart and list three differences.',
  ),
];
