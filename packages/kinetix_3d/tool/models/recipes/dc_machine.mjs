// A four-pole DC machine built in code, cut away: the yoke, main poles with
// their field coils and pole shoes, the slotted armature with its conductors,
// the commutator and the carbon brushes on the shaft. "Run" turns the armature,
// commutator and shaft; the "Cut away" slice takes a quarter out.
import { rod } from '../lib/shapes.mjs';
import { t, box } from '../lib/teaching.mjs';
import { tube, disc, sector, slottedCore, slotBars, ringZ } from '../lib/machines.mjs';

const L = 0.05; // half the core length (z)
const SLOTS = 18;
const SPEED = 120;
const COMM = [0.068, 0.1]; // the commutator's z range
const spin = { axis: [0, 0, 1], speed: SPEED, centre: [0, 0, 0] };

export default {
  id: 'dc_machine',
  version: 1,
  order: 10,
  source: 'procedural',
  subject: 'Engineering',
  classes: [12],
  title: t('DC machine (cutaway)', 'DC मशीन (कटा हुआ दृश्य)', 'DC ಯಂತ್ರ (ಕತ್ತರಿಸಿದ ನೋಟ)'),
  summary: t(
    'A four-pole DC machine: field coils on the poles make the magnetic field, the armature turns in it, and the commutator with its brushes keeps the torque one way (motor) or the output current one way (generator).',
    'चार ध्रुवों वाली DC मशीन: ध्रुवों पर लगी क्षेत्र कुंडलियाँ चुंबकीय क्षेत्र बनाती हैं, आर्मेचर उसमें घूमता है, और दिक्परिवर्तक (कम्यूटेटर) ब्रशों के साथ बलाघूर्ण (मोटर में) या निर्गत धारा (जनित्र में) एक ही दिशा में रखता है।',
    'ನಾಲ್ಕು ಧ್ರುವಗಳ DC ಯಂತ್ರ: ಧ್ರುವಗಳ ಮೇಲಿನ ಕ್ಷೇತ್ರ ಸುರುಳಿಗಳು ಕಾಂತಕ್ಷೇತ್ರ ಮಾಡುತ್ತವೆ, ಆರ್ಮೇಚರ್ ಅದರಲ್ಲಿ ತಿರುಗುತ್ತದೆ, ಮತ್ತು ಕಮ್ಯೂಟೇಟರ್ ಬ್ರಷ್‌ಗಳೊಂದಿಗೆ ಟಾರ್ಕ್ (ಮೋಟಾರ್) ಅಥವಾ ಹೊರ ವಿದ್ಯುತ್ (ಜನಕ) ಒಂದೇ ದಿಕ್ಕಿನಲ್ಲಿರುವಂತೆ ಮಾಡುತ್ತದೆ.',
  ),
  keywords: ['dc machine', 'dc motor', 'dc generator', 'armature', 'commutator', 'brushes', 'field winding', 'pole shoe', 'yoke', 'electrical machines', 'back emf', 'shunt motor', 'series motor'],
  credit: 'Model built by Zynetix (proportions simplified)',
  crease: 35,
  build(THREE) {
    const poles = [], shoes = [], coils = [];
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      const core = new THREE.BoxGeometry(0.026, 0.034, 2 * L).translate(0.073, 0, 0).rotateZ(a);
      poles.push(core);
      shoes.push(sector(THREE, 0.049, 0.058, a - 0.42, a + 0.42, -L, L, 8));
      coils.push(new THREE.BoxGeometry(0.02, 0.05, 2 * L + 0.016).translate(0.072, 0, 0).rotateZ(a));
    }
    return {
      yoke: tube(THREE, 0.088, 0.1, -L - 0.006, L + 0.006, 56),
      feet: [box(THREE, [0.16, 0.012, 0.11], [0, -0.106, 0]), box(THREE, [0.03, 0.012, 0.11], [-0.06, -0.096, 0]), box(THREE, [0.03, 0.012, 0.11], [0.06, -0.096, 0])],
      poles,
      pole_shoes: shoes,
      field_coils: coils,
      armature: slottedCore(THREE, 0.012, 0.046, SLOTS, 0.008, 0.45, -L, L, { inner: false }),
      conductors: [...slotBars(THREE, 0.041, SLOTS, [...Array(SLOTS).keys()], 0.0055, -L - 0.006, L + 0.006), ringZ(THREE, 0.04, 0.004, L + 0.01), ringZ(THREE, 0.04, 0.004, -L - 0.01)],
      commutator: Array.from({ length: 12 }, (_, k) => sector(THREE, 0.014, 0.024, (k * Math.PI) / 6 + 0.03, ((k + 1) * Math.PI) / 6 - 0.03, COMM[0], COMM[1], 3)),
      brushes: [box(THREE, [0.01, 0.016, 0.018], [0, 0.032, 0.084]), box(THREE, [0.01, 0.016, 0.018], [0, -0.032, 0.084])],
      brush_holders: [box(THREE, [0.016, 0.01, 0.022], [0, 0.045, 0.084]), box(THREE, [0.016, 0.01, 0.022], [0, -0.045, 0.084]), rod(THREE, [0, 0.05, 0.084], [0, 0.075, 0.084], 0.002, 8), rod(THREE, [0, -0.05, 0.084], [0, -0.075, 0.084], 0.002, 8)],
      shaft: disc(THREE, 0.011, -0.11, 0.13, 24),
    };
  },
  groups: [
    { id: 'stator', name: t('Stator (field)', 'स्टेटर (क्षेत्र)', 'ಸ್ಟೇಟರ್ (ಕ್ಷೇತ್ರ)') },
    { id: 'rotor', name: t('Armature (rotor)', 'आर्मेचर (रोटर)', 'ಆರ್ಮೇಚರ್ (ರೋಟರ್)') },
    { id: 'brushgear', name: t('Commutator and brushes', 'दिक्परिवर्तक और ब्रश', 'ಕಮ್ಯೂಟೇಟರ್ ಮತ್ತು ಬ್ರಷ್‌ಗಳು') },
  ],
  parts: [
    {
      id: 'yoke', group: 'stator', color: '#5b6670', metal: true, explode: [0, 0, -1.4],
      name: t('Yoke (frame)', 'योक (ढाँचा)', 'ಯೋಕ್ (ಚೌಕಟ್ಟು)'),
      info: t('Cast steel: holds the poles and carries the flux from one pole to the next.', 'ढलवाँ इस्पात: ध्रुवों को थामता है और फ्लक्स को एक ध्रुव से अगले तक ले जाता है।', 'ಎರಕದ ಉಕ್ಕು: ಧ್ರುವಗಳನ್ನು ಹಿಡಿಯುತ್ತದೆ ಮತ್ತು ಫ್ಲಕ್ಸ್ ಅನ್ನು ಒಂದು ಧ್ರುವದಿಂದ ಮುಂದಿನದಕ್ಕೆ ಒಯ್ಯುತ್ತದೆ.'),
    },
    {
      id: 'feet', group: 'stator', color: '#3d454d', metal: true, minor: true, explode: [0, -1, 0],
      name: t('Feet', 'पाद', 'ಪಾದಗಳು'),
      info: t('Bolt the machine to its bed.', 'मशीन को उसके आधार से कसते हैं।', 'ಯಂತ್ರವನ್ನು ಅದರ ತಳಕ್ಕೆ ಬಿಗಿಯುತ್ತವೆ.'),
    },
    {
      id: 'poles', group: 'stator', color: '#8b949e', metal: true, explode: [0, 0, -0.9],
      name: t('Main poles (N, S, N, S)', 'मुख्य ध्रुव (N, S, N, S)', 'ಮುಖ್ಯ ಧ್ರುವಗಳು (N, S, N, S)'),
      info: t('Laminated pole cores; neighbouring poles are of opposite polarity.', 'पटलित ध्रुव क्रोड; पास-पास के ध्रुव विपरीत ध्रुवता के होते हैं।', 'ಪದರಗೊಳಿಸಿದ ಧ್ರುವ ತಿರುಳುಗಳು; ಪಕ್ಕದ ಧ್ರುವಗಳು ವಿರುದ್ಧ ಧ್ರುವತೆಯವು.'),
    },
    {
      id: 'pole_shoes', group: 'stator', color: '#a7b0b9', metal: true, explode: [0, 0, -0.7],
      name: t('Pole shoes', 'ध्रुव शू', 'ಧ್ರುವ ಪಾದರಕ್ಷೆಗಳು'),
      info: t('Spread the flux evenly over the air gap and hold the field coils in place.', 'वायु अंतराल पर फ्लक्स को समान रूप से फैलाते हैं और क्षेत्र कुंडलियों को थामते हैं।', 'ಗಾಳಿ ಅಂತರದ ಮೇಲೆ ಫ್ಲಕ್ಸ್ ಅನ್ನು ಸಮವಾಗಿ ಹರಡುತ್ತವೆ ಮತ್ತು ಕ್ಷೇತ್ರ ಸುರುಳಿಗಳನ್ನು ಹಿಡಿಯುತ್ತವೆ.'),
    },
    {
      id: 'field_coils', group: 'stator', color: '#c8783a', explode: [0, 0, -1.1],
      name: t('Field coils', 'क्षेत्र कुंडलियाँ', 'ಕ್ಷೇತ್ರ ಸುರುಳಿಗಳು'),
      info: t('Carry the field current that magnetises the poles: in shunt, series or compound connection.', 'ध्रुवों को चुंबकित करने वाली क्षेत्र धारा ले जाती हैं: शंट, श्रेणी या संयुक्त संयोजन में।', 'ಧ್ರುವಗಳನ್ನು ಕಾಂತೀಕರಿಸುವ ಕ್ಷೇತ್ರ ವಿದ್ಯುತ್ ಒಯ್ಯುತ್ತವೆ: ಶಂಟ್, ಸರಣಿ ಅಥವಾ ಸಂಯುಕ್ತ ಸಂಪರ್ಕದಲ್ಲಿ.'),
    },
    {
      id: 'armature', group: 'rotor', color: '#6f7c88', metal: true, explode: [0, 0, 0.4], spin,
      name: t('Armature core', 'आर्मेचर क्रोड', 'ಆರ್ಮೇಚರ್ ತಿರುಳು'),
      info: t('Laminated silicon steel with slots: thin sheets cut eddy-current loss.', 'खाँचों वाला पटलित सिलिकॉन इस्पात: पतली परतें भँवर-धारा हानि घटाती हैं।', 'ಕಚ್ಚುಗಳಿರುವ ಪದರಗೊಳಿಸಿದ ಸಿಲಿಕಾನ್ ಉಕ್ಕು: ತೆಳು ಹಾಳೆಗಳು ಸುಳಿ-ವಿದ್ಯುತ್ ನಷ್ಟ ಕಡಿಮೆ ಮಾಡುತ್ತವೆ.'),
    },
    {
      id: 'conductors', group: 'rotor', color: '#d98a2b', metal: true, explode: [0, 0, 0.6], spin,
      name: t('Armature winding', 'आर्मेचर कुंडलन', 'ಆರ್ಮೇಚರ್ ಸುರುಳಿ'),
      info: t('Conductors in the slots, joined at the ends to the commutator (lap or wave winding). Force on them gives torque: F = BIl.', 'खाँचों में चालक, सिरों पर दिक्परिवर्तक से जुड़े (लैप या वेव कुंडलन)। उन पर लगने वाला बल बलाघूर्ण देता है: F = BIl।', 'ಕಚ್ಚುಗಳಲ್ಲಿನ ವಾಹಕಗಳು, ತುದಿಗಳಲ್ಲಿ ಕಮ್ಯೂಟೇಟರ್‌ಗೆ ಜೋಡಿಸಲ್ಪಟ್ಟಿವೆ (ಲ್ಯಾಪ್ ಅಥವಾ ವೇವ್). ಅವುಗಳ ಮೇಲಿನ ಬಲ ಟಾರ್ಕ್ ನೀಡುತ್ತದೆ: F = BIl.'),
    },
    {
      id: 'commutator', group: 'brushgear', color: '#e0a93a', metal: true, explode: [0, 0, 1.1], spin,
      name: t('Commutator', 'दिक्परिवर्तक (कम्यूटेटर)', 'ಕಮ್ಯೂಟೇಟರ್'),
      info: t('Copper segments insulated by mica. As the armature turns it reverses the current in each coil as it passes a brush, so the torque stays one way.', 'माइका से विलगित ताँबे के खंड। आर्मेचर घूमने पर ब्रश के पास से गुज़रती हर कुंडली की धारा उलट देता है, जिससे बलाघूर्ण एक ही दिशा में रहता है।', 'ಮೈಕಾದಿಂದ ಬೇರ್ಪಡಿಸಿದ ತಾಮ್ರದ ಭಾಗಗಳು. ಆರ್ಮೇಚರ್ ತಿರುಗುವಾಗ ಬ್ರಷ್ ದಾಟುವ ಪ್ರತಿ ಸುರುಳಿಯ ವಿದ್ಯುತ್ ದಿಕ್ಕು ಬದಲಿಸುತ್ತದೆ, ಹಾಗಾಗಿ ಟಾರ್ಕ್ ಒಂದೇ ದಿಕ್ಕಿನಲ್ಲಿರುತ್ತದೆ.'),
    },
    {
      id: 'brushes', group: 'brushgear', color: '#2f3237', matte: true, explode: [0, 0.5, 1.2],
      name: t('Carbon brushes', 'कार्बन ब्रश', 'ಕಾರ್ಬನ್ ಬ್ರಷ್‌ಗಳು'),
      info: t('Spring-pressed on the commutator: they connect the turning winding to the fixed terminals.', 'स्प्रिंग से दिक्परिवर्तक पर दबे: घूमती कुंडली को स्थिर टर्मिनलों से जोड़ते हैं।', 'ಸ್ಪ್ರಿಂಗ್‌ನಿಂದ ಕಮ್ಯೂಟೇಟರ್ ಮೇಲೆ ಒತ್ತಲ್ಪಟ್ಟಿವೆ: ತಿರುಗುವ ಸುರುಳಿಯನ್ನು ಸ್ಥಿರ ಟರ್ಮಿನಲ್‌ಗಳಿಗೆ ಜೋಡಿಸುತ್ತವೆ.'),
    },
    {
      id: 'brush_holders', group: 'brushgear', color: '#9aa3ad', metal: true, minor: true, explode: [0, 0.8, 1.2],
      name: t('Brush holders', 'ब्रश धारक', 'ಬ್ರಷ್ ಹಿಡಿಕೆಗಳು'),
      info: t('Hold the brushes on the neutral axis.', 'ब्रशों को उदासीन अक्ष पर रखते हैं।', 'ಬ್ರಷ್‌ಗಳನ್ನು ತಟಸ್ಥ ಅಕ್ಷದ ಮೇಲೆ ಹಿಡಿಯುತ್ತವೆ.'),
    },
    {
      id: 'shaft', group: 'rotor', color: '#b8bec4', metal: true, minor: true, explode: [0, 0, 1.6], spin,
      name: t('Shaft', 'शाफ़्ट', 'ಶಾಫ್ಟ್'),
      info: t('Delivers the mechanical power (motor) or takes it in (generator).', 'यांत्रिक शक्ति देती है (मोटर) या लेती है (जनित्र)।', 'ಯಾಂತ್ರಿಕ ಶಕ್ತಿ ನೀಡುತ್ತದೆ (ಮೋಟಾರ್) ಅಥವಾ ಪಡೆಯುತ್ತದೆ (ಜನಕ).'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.9, 0.7, 1.1] },
    { id: 'end', name: t('Along the shaft', 'शाफ़्ट की दिशा से', 'ಶಾಫ್ಟ್‌ನ ದಿಕ್ಕಿನಿಂದ'), dir: [0.05, 0.1, 1] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0.3, 0] },
  ],
  slices: [
    { id: 'cutaway', name: t('Cut away (a quarter out)', 'काटकर (एक चौथाई हटाकर)', 'ಕತ್ತರಿಸಿ (ಕಾಲು ಭಾಗ ತೆಗೆದು)'), normal: [-1, 0, 0], offset: 0, normal2: [0, -1, 0], view: 'front' },
    { id: 'cross', name: t('Cross-section', 'अनुप्रस्थ काट', 'ಅಡ್ಡ ಛೇದ'), normal: [0, 0, -1], offset: 0, view: 'end' },
  ],
  animations: [{ id: 'run', kind: 'orbit', name: t('Run the machine', 'मशीन चलाएँ', 'ಯಂತ್ರ ಚಲಾಯಿಸಿ') }],
};
