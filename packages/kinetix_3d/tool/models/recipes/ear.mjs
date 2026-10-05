// The human ear, built in code as the textbook section draws it: the outer
// ear on the left, the middle ear with its three small bones, and the
// inner ear (cochlea and semicircular canals) on the right. Shapes are
// simplified and the middle and inner ear are enlarged against the outer
// ear, as in the textbook picture, so the small parts can be seen.
import { blob, rod, sheet, taperTube } from '../lib/shapes.mjs';
import { t, wire, ring, box } from '../lib/teaching.mjs';

const add = (a, b) => a.map((v, k) => v + b[k]);
const mul = (a, s) => a.map((v) => v * s);
const norm = (a) => mul(a, 1 / Math.hypot(...a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// The cochlea: a spiral of 2½ turns round an axis turned mostly towards
// the viewer, so the front view shows the snail shape.
const COCHLEA = { c: [0.015, -0.005, -0.004], axis: norm([0.25, -0.2, 1]), turns: 2.6, r0: 0.0095, r1: 0.0022, rise: 0.007 };
const cu = norm(cross(COCHLEA.axis, [0, 1, 0])), cv = cross(COCHLEA.axis, cu);
function cochleaPoint(s) {
  const a = Math.PI + s * COCHLEA.turns * Math.PI * 2;
  const r = COCHLEA.r0 + (COCHLEA.r1 - COCHLEA.r0) * s;
  return add(add(COCHLEA.c, mul(COCHLEA.axis, COCHLEA.rise * s)), add(mul(cu, Math.cos(a) * r), mul(cv, Math.sin(a) * r)));
}
const SPIRAL = Array.from({ length: 61 }, (_, i) => cochleaPoint(i / 60));

const CANAL = [[-0.068, 0.0, 0], [-0.055, 0.003, 0.001], [-0.04, 0.0, 0], [-0.028, 0.002, 0], [-0.021, 0.002, 0]];
const DRUM = [-0.0195, 0.002, 0];
const OSSICLES = [[-0.0185, 0.002, 0.001], [-0.0165, 0.011, 0.001], [-0.0155, 0.0155, 0.001], [-0.0115, 0.0155, 0.001], [-0.009, 0.0065, 0.001], [-0.0075, 0.005, 0], [-0.003, 0.005, 0]];
const NERVE = [SPIRAL[45], [0.025, 0.0, 0.0], [0.038, 0.004, 0], [0.052, 0.006, 0]];
const BRANCH = [[0.004, 0.009, 0], [0.016, 0.008, 0.001], [0.026, 0.002, 0]];
const TUBE = [[-0.012, -0.003, 0], [-0.008, -0.016, 0.003], [-0.001, -0.03, 0.006], [0.006, -0.042, 0.008]];

export default {
  id: 'ear',
  version: 1,
  order: 8,
  source: 'procedural',
  subject: 'Biology',
  classes: [8, 9, 10, 11],
  title: t('Human ear', 'मानव कान', 'ಮಾನವ ಕಿವಿ'),
  summary: t(
    'The outer ear collects sound, the middle ear\'s three tiny bones pass the vibrations on, and the inner ear turns them into nerve signals. The inner ear also senses balance.',
    'बाहरी कान ध्वनि इकट्ठा करता है, मध्य कान की तीन छोटी हड्डियाँ कंपन आगे बढ़ाती हैं, और आंतरिक कान उन्हें तंत्रिका संकेतों में बदलता है। आंतरिक कान संतुलन भी पहचानता है।',
    'ಹೊರಕಿವಿ ಶಬ್ದವನ್ನು ಸಂಗ್ರಹಿಸುತ್ತದೆ, ಮಧ್ಯಕಿವಿಯ ಮೂರು ಸಣ್ಣ ಮೂಳೆಗಳು ಕಂಪನಗಳನ್ನು ಮುಂದೆ ಸಾಗಿಸುತ್ತವೆ, ಒಳಕಿವಿ ಅವುಗಳನ್ನು ನರ ಸಂಕೇತಗಳಾಗಿ ಬದಲಿಸುತ್ತದೆ. ಒಳಕಿವಿ ಸಮತೋಲನವನ್ನೂ ಗ್ರಹಿಸುತ್ತದೆ.',
  ),
  keywords: ['ear', 'human ear', 'hearing', 'sound', 'eardrum', 'cochlea', 'ossicles', 'semicircular canals', 'balance', 'sense organs', 'structure of the ear', 'neural control and coordination', 'auditory nerve'],
  credit: 'Model built by KINETIX',
  groups: [
    { id: 'outer', name: t('Outer ear', 'बाहरी कान', 'ಹೊರಕಿವಿ') },
    { id: 'middle', name: t('Middle ear', 'मध्य कान', 'ಮಧ್ಯಕಿವಿ') },
    { id: 'inner', name: t('Inner ear', 'आंतरिक कान', 'ಒಳಕಿವಿ') },
  ],
  build(THREE) {
    // The pinna: a cupped, curled flap round the opening of the canal.
    const pinna = sheet(THREE, (u, v) => {
      const a = -Math.PI * 0.62 + u * Math.PI * 1.75;
      const r = 0.35 + 0.65 * v;
      const ry = Math.sin(a) < 0 ? 0.042 : 0.036; // the lobe hangs a little lower
      const curl = 0.014 * v * v + 0.003 * Math.sin(3 * a) * v;
      return [-0.07 - curl, 0.006 + Math.sin(a) * r * ry, -0.004 + Math.cos(a) * r * 0.024];
    }, { nu: 40, nv: 10, thickness: 0.0028 });
    const cochleaTube = taperTube(THREE, new THREE.CatmullRomCurve3(SPIRAL.map((p) => new THREE.Vector3(...p))), 0.0029, 0.0011, { segments: 180, radial: 12 });
    const stapesArch = wire(THREE, Array.from({ length: 13 }, (_, i) => {
      const a = (Math.PI * i) / 12;
      return [-0.003 - 0.0042 * Math.sin(a), 0.005, 0.0026 * Math.cos(a)];
    }), 0.0005, 24);
    const drum = new THREE.CylinderGeometry(0.0066, 0.0066, 0.0007, 32);
    drum.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0.45, 0).normalize()));
    drum.translate(...DRUM);
    return {
      pinna,
      ear_canal: wire(THREE, CANAL, 0.0042, 48),
      eardrum: drum,
      malleus: [rod(THREE, [-0.0185, 0.002, 0.001], [-0.016, 0.0125, 0.001], 0.0007, 8), blob(THREE, [-0.0155, 0.0155, 0.001], 0.0026, 0.0028, 0.0024, 2)],
      incus: [blob(THREE, [-0.0115, 0.0155, 0.001], 0.0028, 0.0024, 0.0024, 2), rod(THREE, [-0.0115, 0.0145, 0.001], [-0.009, 0.0065, 0.001], 0.0007, 8)],
      stapes: [stapesArch, box(THREE, [0.0008, 0.003, 0.0062], [-0.003, 0.005, 0]), rod(THREE, [-0.0072, 0.005, 0], [-0.009, 0.0065, 0.001], 0.0006, 8)],
      middle_ear: blob(THREE, [-0.011, 0.007, 0.0], 0.011, 0.015, 0.009, 3),
      eustachian_tube: taperTube(THREE, new THREE.CatmullRomCurve3(TUBE.map((p) => new THREE.Vector3(...p))), 0.0016, 0.0028, { segments: 40, radial: 10 }),
      vestibule: blob(THREE, [0.001, 0.006, 0], 0.006, 0.0055, 0.005, 3),
      semicircular_canals: [ring(THREE, [0.003, 0.017, 0.0], [0, 0, 1], 0.0085, 0.0012), ring(THREE, [0.005, 0.015, -0.007], [1, 0, 0], 0.0075, 0.0012), ring(THREE, [0.009, 0.008, 0.003], [0, 1, 0], 0.0072, 0.0012)],
      cochlea: cochleaTube,
      auditory_nerve: [taperTube(THREE, new THREE.CatmullRomCurve3(NERVE.map((p) => new THREE.Vector3(...p))), 0.0018, 0.0028, { segments: 40, radial: 10 }), wire(THREE, BRANCH, 0.0014, 30)],
    };
  },
  parts: [
    {
      id: 'pinna', group: 'outer', color: '#e2a98c', explode: [-1, 0, 0],
      name: t('Pinna (outer ear)', 'कर्ण पल्लव (बाहरी कान)', 'ಕಿವಿ ಹಾಲೆ (ಹೊರಕಿವಿ)'),
      info: t('The flap of skin and cartilage we can see. Its shape collects sound waves and funnels them into the ear canal.', 'त्वचा और उपास्थि का वह भाग जो हमें दिखता है। इसकी आकृति ध्वनि तरंगों को इकट्ठा करके कर्ण नलिका में भेजती है।', 'ನಮಗೆ ಕಾಣುವ ಚರ್ಮ ಮತ್ತು ಮೃದ್ವಸ್ಥಿಯ ಭಾಗ. ಇದರ ಆಕಾರ ಶಬ್ದ ತರಂಗಗಳನ್ನು ಸಂಗ್ರಹಿಸಿ ಕಿವಿ ನಾಳದೊಳಗೆ ಕಳುಹಿಸುತ್ತದೆ.'),
    },
    {
      id: 'ear_canal', group: 'outer', color: '#d98f78', explode: [-0.6, 0, 0],
      name: t('Ear canal', 'कर्ण नलिका', 'ಕಿವಿ ನಾಳ'),
      info: t('A tube about 2.5 cm long leading to the eardrum. Its wax and hairs trap dust.', 'लगभग 2.5 cm लंबी नली जो कर्णपटह तक जाती है। इसका मोम और बाल धूल रोकते हैं।', 'ಕಿವಿತಮಟೆಯವರೆಗೆ ಹೋಗುವ ಸುಮಾರು 2.5 cm ಉದ್ದದ ನಾಳ. ಇದರ ಮೇಣ ಮತ್ತು ಕೂದಲು ಧೂಳನ್ನು ತಡೆಯುತ್ತವೆ.'),
    },
    {
      id: 'eardrum', group: 'middle', color: '#ecdcc0', explode: [-0.3, 0, 0.3],
      name: t('Eardrum (tympanic membrane)', 'कर्णपटह (कान का पर्दा)', 'ಕಿವಿತಮಟೆ'),
      info: t('A thin, tight membrane across the end of the canal. Sound waves make it vibrate.', 'नलिका के सिरे पर तनी हुई पतली झिल्ली। ध्वनि तरंगें इसे कंपित करती हैं।', 'ನಾಳದ ತುದಿಯಲ್ಲಿ ಬಿಗಿಯಾಗಿ ಹರಡಿದ ತೆಳು ಪೊರೆ. ಶಬ್ದ ತರಂಗಗಳು ಅದನ್ನು ಕಂಪಿಸುತ್ತವೆ.'),
    },
    {
      id: 'malleus', group: 'middle', color: '#efe6d2', explode: [-0.2, 0.6, 0.5],
      name: t('Hammer (malleus)', 'मुग्दरक (मैलियस)', 'ಸುತ್ತಿಗೆ ಮೂಳೆ (ಮ್ಯಾಲಿಯಸ್)'),
      info: t('The first of the three ossicles, the smallest bones in the body. It is joined to the eardrum and vibrates with it.', 'तीन कर्ण अस्थिकाओं में पहली, शरीर की सबसे छोटी हड्डियाँ। यह कर्णपटह से जुड़ी है और उसके साथ कंपित होती है।', 'ದೇಹದ ಅತಿ ಚಿಕ್ಕ ಮೂಳೆಗಳಾದ ಮೂರು ಕಿವಿ ಮೂಳೆಗಳಲ್ಲಿ ಮೊದಲನೆಯದು. ಕಿವಿತಮಟೆಗೆ ಜೋಡಿಸಿದ್ದು ಅದರೊಂದಿಗೆ ಕಂಪಿಸುತ್ತದೆ.'),
    },
    {
      id: 'incus', group: 'middle', color: '#e8dcc2', explode: [0, 0.7, 0.5],
      name: t('Anvil (incus)', 'स्थूणक (इन्कस)', 'ಅಡಿಗಲ್ಲು ಮೂಳೆ (ಇಂಕಸ್)'),
      info: t('The middle ossicle, passing the vibrations from the hammer to the stirrup.', 'बीच की अस्थिका, जो कंपन मुग्दरक से वलयक तक पहुँचाती है।', 'ಮಧ್ಯದ ಕಿವಿ ಮೂಳೆ, ಕಂಪನಗಳನ್ನು ಸುತ್ತಿಗೆಯಿಂದ ರಿಕಾಪು ಮೂಳೆಗೆ ಸಾಗಿಸುತ್ತದೆ.'),
    },
    {
      id: 'stapes', group: 'middle', color: '#f4ecda', explode: [0.2, 0.5, 0.5],
      name: t('Stirrup (stapes)', 'वलयक (स्टेपीज़)', 'ರಿಕಾಪು ಮೂಳೆ (ಸ್ಟೇಪಿಸ್)'),
      info: t('The smallest bone in the body. Its footplate fits the oval window of the inner ear. The three ossicles make the vibrations about 20 times stronger.', 'शरीर की सबसे छोटी हड्डी। इसका पाद आंतरिक कान की अंडाकार खिड़की पर बैठता है। तीनों अस्थिकाएँ कंपन को लगभग 20 गुना प्रबल करती हैं।', 'ದೇಹದ ಅತಿ ಚಿಕ್ಕ ಮೂಳೆ. ಇದರ ಪಾದ ಒಳಕಿವಿಯ ಅಂಡಾಕಾರದ ಕಿಟಕಿಯ ಮೇಲೆ ಕುಳಿತಿದೆ. ಮೂರು ಮೂಳೆಗಳು ಕಂಪನಗಳನ್ನು ಸುಮಾರು 20 ಪಟ್ಟು ಬಲಪಡಿಸುತ್ತವೆ.'),
    },
    {
      id: 'middle_ear', group: 'middle', color: '#f2d0c0', opacity: 0.16, minor: true, explode: [0, 0, 0],
      name: t('Middle ear cavity', 'मध्य कर्ण गुहा', 'ಮಧ್ಯಕಿವಿ ಕುಹರ'),
      info: t('An air-filled space behind the eardrum that holds the three ossicles.', 'कर्णपटह के पीछे हवा से भरा स्थान जिसमें तीनों अस्थिकाएँ होती हैं।', 'ಕಿವಿತಮಟೆಯ ಹಿಂದೆ ಗಾಳಿ ತುಂಬಿದ ಜಾಗ, ಇದರಲ್ಲಿ ಮೂರು ಕಿವಿ ಮೂಳೆಗಳಿವೆ.'),
    },
    {
      id: 'eustachian_tube', group: 'middle', color: '#e89a9a', explode: [0, -1, 0.3],
      name: t('Eustachian tube', 'कर्णनली (यूस्टेकियन नली)', 'ಯೂಸ್ಟೇಕಿಯನ್ ನಾಳ'),
      info: t('Joins the middle ear to the throat and keeps the air pressure equal on both sides of the eardrum (your ears "pop" when it opens).', 'मध्य कान को गले से जोड़ती है और कर्णपटह के दोनों ओर वायुदाब बराबर रखती है (इसके खुलने पर कान "पॉप" करते हैं)।', 'ಮಧ್ಯಕಿವಿಯನ್ನು ಗಂಟಲಿಗೆ ಜೋಡಿಸಿ ಕಿವಿತಮಟೆಯ ಎರಡೂ ಬದಿ ಗಾಳಿಯ ಒತ್ತಡ ಸಮವಾಗಿಡುತ್ತದೆ (ಇದು ತೆರೆದಾಗ ಕಿವಿ "ಪಾಪ್" ಆಗುತ್ತದೆ).'),
    },
    {
      id: 'semicircular_canals', group: 'inner', color: '#7cc0e6', explode: [0.3, 1, 0],
      name: t('Semicircular canals', 'अर्धवृत्ताकार नलिकाएँ', 'ಅರ್ಧವೃತ್ತಾಕಾರದ ನಾಳಗಳು'),
      info: t('Three fluid-filled loops at right angles to each other. When the head turns the fluid moves, and they sense balance and movement, not sound.', 'एक-दूसरे से समकोण पर तीन द्रव भरे छल्ले। सिर घूमने पर द्रव हिलता है, और ये संतुलन और गति पहचानते हैं, ध्वनि नहीं।', 'ಪರಸ್ಪರ ಲಂಬ ಕೋನದಲ್ಲಿರುವ ಮೂರು ದ್ರವ ತುಂಬಿದ ಕುಣಿಕೆಗಳು. ತಲೆ ತಿರುಗಿದಾಗ ದ್ರವ ಚಲಿಸುತ್ತದೆ; ಇವು ಸಮತೋಲನ ಮತ್ತು ಚಲನೆಯನ್ನು ಗ್ರಹಿಸುತ್ತವೆ, ಶಬ್ದವನ್ನಲ್ಲ.'),
    },
    {
      id: 'vestibule', group: 'inner', color: '#9fc9e6', minor: true, explode: [0.3, 0.4, 0],
      name: t('Vestibule', 'प्रघाण (वेस्टिब्यूल)', 'ಮುಖಮಂಟಪ (ವೆಸ್ಟಿಬ್ಯೂಲ್)'),
      info: t('The chamber joining the cochlea and the semicircular canals; it senses which way is down.', 'कर्णावर्त और अर्धवृत्ताकार नलिकाओं को जोड़ने वाला कक्ष; यह पहचानता है कि नीचे किस ओर है।', 'ಕಾಕ್ಲಿಯಾ ಮತ್ತು ಅರ್ಧವೃತ್ತಾಕಾರದ ನಾಳಗಳನ್ನು ಜೋಡಿಸುವ ಕೋಣೆ; ಕೆಳಗೆ ಯಾವ ಕಡೆ ಎಂದು ಗ್ರಹಿಸುತ್ತದೆ.'),
    },
    {
      id: 'cochlea', group: 'inner', color: '#b48ce0', explode: [0.6, -0.4, 0.2],
      name: t('Cochlea', 'कर्णावर्त (कॉक्लिया)', 'ಕಾಕ್ಲಿಯಾ (ಶಂಖನಾಳ)'),
      info: t('A snail-shaped, fluid-filled tube. Vibrations of the fluid move tiny hair cells, which turn them into nerve signals; different places respond to different pitches.', 'घोंघे जैसी, द्रव से भरी नली। द्रव के कंपन छोटी रोम कोशिकाओं को हिलाते हैं, जो उन्हें तंत्रिका संकेतों में बदलती हैं; अलग-अलग स्थान अलग-अलग तारत्व पर प्रतिक्रिया करते हैं।', 'ಬಸವನ ಹುಳುವಿನ ಆಕಾರದ, ದ್ರವ ತುಂಬಿದ ನಾಳ. ದ್ರವದ ಕಂಪನಗಳು ಸಣ್ಣ ರೋಮ ಕೋಶಗಳನ್ನು ಚಲಿಸುತ್ತವೆ, ಅವು ಅವುಗಳನ್ನು ನರ ಸಂಕೇತಗಳಾಗಿ ಬದಲಿಸುತ್ತವೆ; ಬೇರೆ ಬೇರೆ ಜಾಗಗಳು ಬೇರೆ ಬೇರೆ ಸ್ಥಾಯಿಗೆ ಸ್ಪಂದಿಸುತ್ತವೆ.'),
    },
    {
      id: 'auditory_nerve', group: 'inner', color: '#f4d35e', explode: [1, 0, 0],
      name: t('Auditory nerve', 'श्रवण तंत्रिका', 'ಶ್ರವಣ ನರ'),
      info: t('Carries the signals from the cochlea (and the balance organs) to the brain, which makes sense of them as sound.', 'कर्णावर्त (और संतुलन अंगों) से संकेत मस्तिष्क तक ले जाती है, जो उन्हें ध्वनि के रूप में समझता है।', 'ಕಾಕ್ಲಿಯಾದಿಂದ (ಮತ್ತು ಸಮತೋಲನ ಅಂಗಗಳಿಂದ) ಸಂಕೇತಗಳನ್ನು ಮಿದುಳಿಗೆ ಒಯ್ಯುತ್ತದೆ, ಮಿದುಳು ಅವುಗಳನ್ನು ಶಬ್ದವಾಗಿ ಅರ್ಥೈಸುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Section', 'काट', 'ಛೇದ'), dir: [0, 0.05, 1] },
    { id: 'outside', name: t('From outside', 'बाहर से', 'ಹೊರಗಿನಿಂದ'), dir: [-1, 0.15, 0.35] },
    { id: 'inner', name: t('Inner ear', 'आंतरिक कान', 'ಒಳಕಿವಿ'), dir: [0.7, 0.3, 1] },
  ],
  slices: [],
  animations: [
    {
      id: 'hearing', kind: 'flow',
      name: t('How we hear', 'हम कैसे सुनते हैं', 'ನಾವು ಹೇಗೆ ಕೇಳುತ್ತೇವೆ'),
      steps: [
        {
          color: '#ffffff', highlight: ['pinna', 'ear_canal'],
          text: t('The pinna collects sound waves and the ear canal carries them in.', 'कर्ण पल्लव ध्वनि तरंगें इकट्ठा करता है और कर्ण नलिका उन्हें अंदर ले जाती है।', 'ಕಿವಿ ಹಾಲೆ ಶಬ್ದ ತರಂಗಗಳನ್ನು ಸಂಗ್ರಹಿಸುತ್ತದೆ, ಕಿವಿ ನಾಳ ಅವುಗಳನ್ನು ಒಳಗೆ ಒಯ್ಯುತ್ತದೆ.'),
          paths: [[[-0.095, 0.004, 0], ...CANAL]],
        },
        {
          color: '#ffe066', highlight: ['eardrum'],
          text: t('The sound waves make the eardrum vibrate.', 'ध्वनि तरंगें कर्णपटह को कंपित करती हैं।', 'ಶಬ್ದ ತರಂಗಗಳು ಕಿವಿತಮಟೆಯನ್ನು ಕಂಪಿಸುತ್ತವೆ.'),
          paths: [[[-0.024, 0.002, 0], DRUM]],
        },
        {
          color: '#ffe066', highlight: ['malleus', 'incus', 'stapes'],
          text: t('The hammer, anvil and stirrup pass the vibrations along and make them stronger.', 'मुग्दरक, स्थूणक और वलयक कंपन को आगे बढ़ाते हैं और प्रबल करते हैं।', 'ಸುತ್ತಿಗೆ, ಅಡಿಗಲ್ಲು ಮತ್ತು ರಿಕಾಪು ಮೂಳೆಗಳು ಕಂಪನಗಳನ್ನು ಮುಂದೆ ಸಾಗಿಸಿ ಬಲಪಡಿಸುತ್ತವೆ.'),
          paths: [OSSICLES],
        },
        {
          color: '#d9b8ff', highlight: ['cochlea'],
          text: t('The stirrup pushes on the fluid in the cochlea; hair cells turn the waves in the fluid into nerve signals.', 'वलयक कर्णावर्त के द्रव को धकेलता है; रोम कोशिकाएँ द्रव की तरंगों को तंत्रिका संकेतों में बदलती हैं।', 'ರಿಕಾಪು ಮೂಳೆ ಕಾಕ್ಲಿಯಾದ ದ್ರವವನ್ನು ತಳ್ಳುತ್ತದೆ; ರೋಮ ಕೋಶಗಳು ದ್ರವದ ತರಂಗಗಳನ್ನು ನರ ಸಂಕೇತಗಳಾಗಿ ಬದಲಿಸುತ್ತವೆ.'),
          paths: [[[-0.003, 0.005, 0], ...SPIRAL.filter((_, i) => i % 3 === 0)]],
        },
        {
          color: '#f4d35e', highlight: ['auditory_nerve'],
          text: t('The auditory nerve carries the signals to the brain, and we hear the sound.', 'श्रवण तंत्रिका संकेतों को मस्तिष्क तक ले जाती है, और हम ध्वनि सुनते हैं।', 'ಶ್ರವಣ ನರ ಸಂಕೇತಗಳನ್ನು ಮಿದುಳಿಗೆ ಒಯ್ಯುತ್ತದೆ, ನಾವು ಶಬ್ದವನ್ನು ಕೇಳುತ್ತೇವೆ.'),
          paths: [NERVE],
        },
        {
          color: '#9fe0ff', highlight: ['semicircular_canals', 'vestibule'],
          text: t('Separately, the semicircular canals and the vestibule sense the head\'s movement and keep us balanced.', 'अलग से, अर्धवृत्ताकार नलिकाएँ और प्रघाण सिर की गति पहचानते हैं और हमें संतुलित रखते हैं।', 'ಪ್ರತ್ಯೇಕವಾಗಿ, ಅರ್ಧವೃತ್ತಾಕಾರದ ನಾಳಗಳು ಮತ್ತು ಮುಖಮಂಟಪ ತಲೆಯ ಚಲನೆಯನ್ನು ಗ್ರಹಿಸಿ ನಮ್ಮನ್ನು ಸಮತೋಲನದಲ್ಲಿಡುತ್ತವೆ.'),
          paths: [Array.from({ length: 17 }, (_, i) => [0.003 + 0.0085 * Math.cos((i / 16) * 2 * Math.PI), 0.017 + 0.0085 * Math.sin((i / 16) * 2 * Math.PI), 0])],
        },
      ],
    },
  ],
};
