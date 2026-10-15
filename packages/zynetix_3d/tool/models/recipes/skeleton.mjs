// The human skeleton, from BodyParts3D (206 bones in a few groups). The
// element files of each group are listed in skeleton_files.json.
import { readFileSync } from 'node:fs';

const files = JSON.parse(readFileSync(new URL('./skeleton_files.json', import.meta.url), 'utf8'));
const t = (en, hi, kn) => ({ en, hi, kn });
const bone = '#ece2c6';

export default {
  id: 'skeleton',
  version: 1,
  order: 6,
  source: 'bp3d',
  subject: 'Biology',
  classes: [6, 11],
  title: t('Human skeleton', 'मानव कंकाल', 'ಮಾನವ ಅಸ್ಥಿಪಂಜರ'),
  summary: t(
    'About 206 bones give the body its shape, protect the brain, heart and lungs, and meet at joints so that we can move.',
    'लगभग 206 हड्डियाँ शरीर को आकार देती हैं, मस्तिष्क, हृदय और फेफड़ों की रक्षा करती हैं, और जोड़ों पर मिलकर हमें चलने-फिरने देती हैं।',
    'ಸುಮಾರು 206 ಮೂಳೆಗಳು ದೇಹಕ್ಕೆ ಆಕಾರ ನೀಡುತ್ತವೆ, ಮಿದುಳು, ಹೃದಯ ಮತ್ತು ಶ್ವಾಸಕೋಶಗಳನ್ನು ರಕ್ಷಿಸುತ್ತವೆ ಹಾಗೂ ಕೀಲುಗಳಲ್ಲಿ ಸೇರಿ ನಾವು ಚಲಿಸುವಂತೆ ಮಾಡುತ್ತವೆ.',
  ),
  keywords: ['skeleton', 'skeletal system', 'bones', 'joints', 'body movements', 'locomotion and movement', 'backbone', 'rib cage', 'skull'],
  credit: 'BodyParts3D, © The Database Center for Life Science, CC BY 4.0',
  detail: 0.2,
  groups: [
    { id: 'axial', name: t('Skull, backbone and ribs', 'खोपड़ी, मेरुदंड और पसलियाँ', 'ತಲೆಬುರುಡೆ, ಬೆನ್ನುಮೂಳೆ ಮತ್ತು ಪಕ್ಕೆಲುಬುಗಳು') },
    { id: 'upper', name: t('Shoulders, arms and hands', 'कंधे, बाँहें और हाथ', 'ಭುಜಗಳು, ತೋಳುಗಳು ಮತ್ತು ಕೈಗಳು') },
    { id: 'lower', name: t('Hips, legs and feet', 'कूल्हे, टाँगें और पैर', 'ಸೊಂಟ, ಕಾಲುಗಳು ಮತ್ತು ಪಾದಗಳು') },
  ],
  parts: [
    {
      id: 'skull', group: 'axial', color: bone, files: files.skull, detail: 0.1,
      name: t('Skull', 'खोपड़ी', 'ತಲೆಬುರುಡೆ'),
      info: t('A box of bones joined by fixed joints. It protects the brain.', 'अचल जोड़ों से जुड़ी हड्डियों का डिब्बा। यह मस्तिष्क की रक्षा करती है।', 'ಅಚಲ ಕೀಲುಗಳಿಂದ ಜೋಡಿಸಿದ ಮೂಳೆಗಳ ಪೆಟ್ಟಿಗೆ. ಇದು ಮಿದುಳನ್ನು ರಕ್ಷಿಸುತ್ತದೆ.'),
    },
    {
      id: 'jaw', detail: 0.55, group: 'axial', color: bone, files: files.mandible,
      name: t('Lower jaw', 'निचला जबड़ा', 'ಕೆಳದವಡೆ'),
      info: t('The only bone of the skull that moves, for chewing and speaking.', 'खोपड़ी की एकमात्र हड्डी जो हिलती है, चबाने और बोलने के लिए।', 'ತಲೆಬುರುಡೆಯಲ್ಲಿ ಚಲಿಸುವ ಏಕೈಕ ಮೂಳೆ; ಅಗಿಯಲು ಮತ್ತು ಮಾತನಾಡಲು.'),
    },
    {
      id: 'spine', group: 'axial', color: '#e6d6b2', files: files.spine, detail: 0.12,
      name: t('Backbone (vertebral column)', 'मेरुदंड (रीढ़ की हड्डी)', 'ಬೆನ್ನುಮೂಳೆ (ಕಶೇರುಸ್ತಂಭ)'),
      info: t('33 small bones, the vertebrae, stacked with discs between them. It holds the body up and protects the spinal cord.', '33 छोटी हड्डियाँ (कशेरुक) जिनके बीच गद्दियाँ होती हैं। यह शरीर को सीधा रखता है और मेरुरज्जु की रक्षा करता है।', '33 ಸಣ್ಣ ಮೂಳೆಗಳು (ಕಶೇರುಕಗಳು), ನಡುವೆ ಮೆತ್ತೆಗಳಿವೆ. ದೇಹವನ್ನು ನೇರವಾಗಿಡುತ್ತದೆ ಮತ್ತು ಮೆದುಳುಬಳ್ಳಿಯನ್ನು ರಕ್ಷಿಸುತ್ತದೆ.'),
    },
    {
      id: 'ribs', group: 'axial', color: bone, files: files.ribs, detail: 0.1,
      name: t('Rib cage', 'पसली पिंजर', 'ಪಕ್ಕೆಲುಬು ಪಂಜರ'),
      info: t('12 pairs of ribs and the breastbone. They protect the heart and lungs and move when we breathe.', '12 जोड़ी पसलियाँ और छाती की हड्डी। ये हृदय और फेफड़ों की रक्षा करती हैं और साँस लेते समय हिलती हैं।', '12 ಜೋಡಿ ಪಕ್ಕೆಲುಬುಗಳು ಮತ್ತು ಎದೆಮೂಳೆ. ಹೃದಯ-ಶ್ವಾಸಕೋಶಗಳನ್ನು ರಕ್ಷಿಸುತ್ತವೆ ಮತ್ತು ಉಸಿರಾಡುವಾಗ ಚಲಿಸುತ್ತವೆ.'),
    },
    {
      id: 'collarbones', detail: 0.55, group: 'upper', color: bone, files: files.clavicle,
      name: t('Collar bones (clavicles)', 'हँसली (कॉलर बोन)', 'ಕೊರಳೆಲುಬುಗಳು'),
      info: t('Hold the shoulders out to the sides.', 'कंधों को दोनों ओर थामे रखती हैं।', 'ಭುಜಗಳನ್ನು ಎರಡೂ ಬದಿಗೆ ಹಿಡಿದಿಡುತ್ತವೆ.'),
    },
    {
      id: 'shoulder_blades', group: 'upper', color: bone, files: files.scapula, detail: 0.1,
      name: t('Shoulder blades (scapulae)', 'कंधे की हड्डियाँ (स्कैपुला)', 'ಭುಜದ ಮೂಳೆಗಳು (ಸ್ಕ್ಯಾಪುಲಾ)'),
      info: t('Flat bones at the back. The upper arm bone fits into them at the shoulder, a ball-and-socket joint.', 'पीठ की चपटी हड्डियाँ। कंधे पर ऊपरी बाँह की हड्डी इनमें फिट होती है; यह कंदुक-खल्लिका जोड़ है।', 'ಬೆನ್ನಿನ ಚಪ್ಪಟೆ ಮೂಳೆಗಳು. ಭುಜದಲ್ಲಿ ಮೇಲ್ತೋಳಿನ ಮೂಳೆ ಇವುಗಳಲ್ಲಿ ಕೂರುತ್ತದೆ: ಚೆಂಡು-ಗುಳಿ ಕೀಲು.'),
    },
    {
      id: 'upper_arm', detail: 0.55, group: 'upper', color: bone, files: files.humerus,
      name: t('Upper arm bone (humerus)', 'ऊपरी बाँह की हड्डी (ह्यूमरस)', 'ಮೇಲ್ತೋಳಿನ ಮೂಳೆ (ಹ್ಯೂಮರಸ್)'),
      info: t('Runs from the shoulder to the elbow. The elbow is a hinge joint.', 'कंधे से कोहनी तक जाती है। कोहनी एक कब्ज़ा (हिंज) जोड़ है।', 'ಭುಜದಿಂದ ಮೊಣಕೈವರೆಗೆ. ಮೊಣಕೈ ಒಂದು ಕೀಲುಬಾಗಿಲು (ಹಿಂಜ್) ಕೀಲು.'),
    },
    {
      id: 'forearm', detail: 0.55, group: 'upper', color: bone, files: [...files.radius, ...files.ulna],
      name: t('Forearm bones (radius and ulna)', 'अग्रबाहु की हड्डियाँ (रेडियस और अल्ना)', 'ಮುಂದೋಳಿನ ಮೂಳೆಗಳು (ರೇಡಿಯಸ್ ಮತ್ತು ಅಲ್ನಾ)'),
      info: t('Two bones side by side; the radius turns around the ulna to twist the hand.', 'दो हड्डियाँ साथ-साथ; रेडियस अल्ना के चारों ओर घूमकर हाथ को मोड़ती है।', 'ಅಕ್ಕಪಕ್ಕದ ಎರಡು ಮೂಳೆಗಳು; ರೇಡಿಯಸ್ ಅಲ್ನಾದ ಸುತ್ತ ತಿರುಗಿ ಕೈಯನ್ನು ತಿರುಗಿಸುತ್ತದೆ.'),
    },
    {
      id: 'hands', group: 'upper', color: bone, files: files.hand, detail: 0.3,
      name: t('Hand bones', 'हाथ की हड्डियाँ', 'ಕೈ ಮೂಳೆಗಳು'),
      info: t('27 bones in each hand: wrist bones, palm bones and finger bones.', 'हर हाथ में 27 हड्डियाँ: कलाई, हथेली और उँगलियों की हड्डियाँ।', 'ಪ್ರತಿ ಕೈಯಲ್ಲಿ 27 ಮೂಳೆಗಳು: ಮಣಿಕಟ್ಟು, ಅಂಗೈ ಮತ್ತು ಬೆರಳುಗಳ ಮೂಳೆಗಳು.'),
    },
    {
      id: 'pelvis', detail: 0.55, group: 'lower', color: bone, files: files.pelvis,
      name: t('Hip bones (pelvis)', 'कूल्हे की हड्डियाँ (श्रोणि)', 'ಸೊಂಟದ ಮೂಳೆಗಳು (ಶ್ರೋಣಿ)'),
      info: t('A bowl of bone that carries the weight of the upper body and holds the thigh bones in ball-and-socket joints.', 'हड्डियों का कटोरा जो ऊपरी शरीर का भार उठाता है और जाँघ की हड्डियों को कंदुक-खल्लिका जोड़ों में थामता है।', 'ಮೇಲ್ದೇಹದ ಭಾರ ಹೊರುವ ಮೂಳೆಗಳ ಬಟ್ಟಲು; ತೊಡೆಮೂಳೆಗಳನ್ನು ಚೆಂಡು-ಗುಳಿ ಕೀಲುಗಳಲ್ಲಿ ಹಿಡಿದಿಡುತ್ತದೆ.'),
    },
    {
      id: 'thigh', detail: 0.55, group: 'lower', color: bone, files: files.femur,
      name: t('Thigh bone (femur)', 'जाँघ की हड्डी (फीमर)', 'ತೊಡೆಮೂಳೆ (ಫೀಮರ್)'),
      info: t('The longest and strongest bone in the body.', 'शरीर की सबसे लंबी और मज़बूत हड्डी।', 'ದೇಹದ ಅತಿ ಉದ್ದ ಮತ್ತು ಬಲಿಷ್ಠ ಮೂಳೆ.'),
    },
    {
      id: 'kneecap', detail: 0.55, group: 'lower', color: bone, files: files.patella,
      name: t('Kneecap (patella)', 'घुटने की टोपी (पटेला)', 'ಮಂಡಿಚಿಪ್ಪು (ಪಟೆಲ್ಲಾ)'),
      info: t('A small bone in front of the knee, which is a hinge joint.', 'घुटने के सामने एक छोटी हड्डी; घुटना एक कब्ज़ा जोड़ है।', 'ಮಂಡಿಯ ಮುಂದಿನ ಸಣ್ಣ ಮೂಳೆ; ಮಂಡಿ ಒಂದು ಹಿಂಜ್ ಕೀಲು.'),
    },
    {
      id: 'shin', detail: 0.55, group: 'lower', color: bone, files: [...files.tibia, ...files.fibula],
      name: t('Shin bones (tibia and fibula)', 'पिंडली की हड्डियाँ (टिबिया और फिबुला)', 'ಮೊಳಕಾಲಿನ ಕೆಳಗಿನ ಮೂಳೆಗಳು (ಟಿಬಿಯಾ ಮತ್ತು ಫಿಬುಲಾ)'),
      info: t('The thick tibia carries the weight; the thin fibula runs beside it.', 'मोटी टिबिया भार उठाती है; पतली फिबुला उसके साथ चलती है।', 'ದಪ್ಪ ಟಿಬಿಯಾ ಭಾರ ಹೊರುತ್ತದೆ; ತೆಳು ಫಿಬುಲಾ ಅದರ ಪಕ್ಕದಲ್ಲಿದೆ.'),
    },
    {
      id: 'feet', group: 'lower', color: bone, files: files.foot, detail: 0.3,
      name: t('Foot bones', 'पैर की हड्डियाँ', 'ಪಾದದ ಮೂಳೆಗಳು'),
      info: t('26 bones in each foot, arranged in arches that spring when we walk.', 'हर पैर में 26 हड्डियाँ, मेहराबों में लगी हुई जो चलते समय लचीलापन देती हैं।', 'ಪ್ರತಿ ಪಾದದಲ್ಲಿ 26 ಮೂಳೆಗಳು; ನಡೆಯುವಾಗ ಸ್ಪ್ರಿಂಗ್‌ನಂತೆ ಕೆಲಸ ಮಾಡುವ ಕಮಾನುಗಳಲ್ಲಿ ಜೋಡಣೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0, 1] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0, 0.15] },
    { id: 'back', name: t('Back', 'पीछे से', 'ಹಿಂಭಾಗ'), dir: [0, 0, -1] },
  ],
  slices: [],
  animations: [
    {
      id: 'joints', kind: 'tour',
      name: t('Kinds of joints', 'जोड़ों के प्रकार', 'ಕೀಲುಗಳ ಪ್ರಕಾರಗಳು'),
      steps: [
        {
          highlight: ['upper_arm', 'shoulder_blades', 'thigh', 'pelvis'],
          text: t('Ball-and-socket joints (shoulder, hip): the round end of one bone turns in a cup of another, in every direction.', 'कंदुक-खल्लिका जोड़ (कंधा, कूल्हा): एक हड्डी का गोल सिरा दूसरी हड्डी के कटोरे में हर दिशा में घूमता है।', 'ಚೆಂಡು-ಗುಳಿ ಕೀಲುಗಳು (ಭುಜ, ಸೊಂಟ): ಒಂದು ಮೂಳೆಯ ದುಂಡು ತುದಿ ಇನ್ನೊಂದರ ಬಟ್ಟಲಿನಲ್ಲಿ ಎಲ್ಲ ದಿಕ್ಕುಗಳಲ್ಲಿ ತಿರುಗುತ್ತದೆ.'),
        },
        {
          highlight: ['upper_arm', 'forearm', 'thigh', 'shin', 'kneecap'],
          text: t('Hinge joints (elbow, knee): they move one way only, like a door on its hinges.', 'कब्ज़ा जोड़ (कोहनी, घुटना): ये केवल एक दिशा में मुड़ते हैं, जैसे कब्ज़े पर दरवाज़ा।', 'ಹಿಂಜ್ ಕೀಲುಗಳು (ಮೊಣಕೈ, ಮಂಡಿ): ಬಾಗಿಲಿನಂತೆ ಒಂದೇ ದಿಕ್ಕಿನಲ್ಲಿ ಚಲಿಸುತ್ತವೆ.'),
        },
        {
          highlight: ['skull', 'spine'],
          text: t('Pivot joint (neck): the head turns left and right on the top of the backbone.', 'धुराग्र जोड़ (गर्दन): सिर मेरुदंड के ऊपरी सिरे पर दाएँ-बाएँ घूमता है।', 'ಅಚ್ಚು ಕೀಲು (ಕುತ್ತಿಗೆ): ತಲೆ ಬೆನ್ನುಮೂಳೆಯ ಮೇಲ್ತುದಿಯಲ್ಲಿ ಎಡ-ಬಲ ತಿರುಗುತ್ತದೆ.'),
        },
        {
          highlight: ['hands', 'feet'],
          text: t('Gliding joints (wrist, ankle): small flat bones slide over one another.', 'सरकने वाले जोड़ (कलाई, टखना): छोटी चपटी हड्डियाँ एक-दूसरे पर सरकती हैं।', 'ಜಾರುವ ಕೀಲುಗಳು (ಮಣಿಕಟ್ಟು, ಕಣಕಾಲು): ಸಣ್ಣ ಚಪ್ಪಟೆ ಮೂಳೆಗಳು ಒಂದರ ಮೇಲೊಂದು ಜಾರುತ್ತವೆ.'),
        },
        {
          highlight: ['skull'],
          text: t('Fixed joints (skull): the bones are locked together and do not move.', 'अचल जोड़ (खोपड़ी): हड्डियाँ आपस में जुड़ी रहती हैं और हिलती नहीं।', 'ಅಚಲ ಕೀಲುಗಳು (ತಲೆಬುರುಡೆ): ಮೂಳೆಗಳು ಬಿಗಿಯಾಗಿ ಸೇರಿವೆ, ಚಲಿಸುವುದಿಲ್ಲ.'),
        },
      ],
    },
  ],
};
