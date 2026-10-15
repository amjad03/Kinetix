// The human heart: its chambers and valves, the path of blood through each
// side, the heartbeat, and the double circulation through the lungs and the
// body. Built on the BodyParts3D heart (the viewer's heart model).
import { THREE, seeded, mat, tube, disc, curve, smooth, fract, lerp, GlowPoints, MoleculeSwarm, glowMat, tumble } from './kit.js';
import { C, COL } from './bio.js';

const t = (en, hi, kn) => ({ en, hi, kn });

const OXY = '#c8473b', DEOXY = '#5566b0';

export const script = {
  id: 'heart',
  subject: 'Biology',
  classes: [7, 10, 11],
  title: t('The human heart and circulation', 'मानव हृदय और परिसंचरण', 'ಮಾನವ ಹೃದಯ ಮತ್ತು ರಕ್ತಪರಿಚಲನೆ'),
  summary: t(
    'The heart’s four chambers and valves, how blood flows through each side as the heart beats, and the double circulation through the lungs and the body.',
    'हृदय के चार कक्ष और कपाट, धड़कते हृदय के हर भाग से रक्त कैसे बहता है, और फेफड़ों तथा शरीर से होकर दोहरा परिसंचरण।',
    'ಹೃದಯದ ನಾಲ್ಕು ಕೋಣೆಗಳು ಮತ್ತು ಕವಾಟಗಳು, ಹೃದಯ ಬಡಿಯುವಾಗ ಪ್ರತಿ ಭಾಗದ ಮೂಲಕ ರಕ್ತ ಹೇಗೆ ಹರಿಯುತ್ತದೆ, ಮತ್ತು ಶ್ವಾಸಕೋಶ ಹಾಗೂ ದೇಹದ ಮೂಲಕ ದ್ವಿ ರಕ್ತಪರಿಚಲನೆ.',
  ),
  thumb: { step: 'outside', u: 0.4 },
  keywords: ['heart', 'circulation', 'double circulation', 'blood', 'atrium', 'ventricle', 'valves', 'aorta', 'pulmonary', 'heartbeat', 'transportation', 'life processes', 'blood vessels'],
  credit: 'BodyParts3D, © The Database Center for Life Science (DBCLS), CC BY 4.0',
  look: {
    background: ['#2a1d20', '#0b0708'],
    keyAt: [3, 6, 7],
    envTop: '#352a2c',
    stages: { heart: { fog: [10, 24] }, circulation: { fog: [12, 30] } },
  },
  groups: [
    { id: 'chambers', name: t('Chambers', 'कक्ष', 'ಕೋಣೆಗಳು') },
    { id: 'valves', name: t('Valves', 'कपाट (वाल्व)', 'ಕವಾಟಗಳು') },
    { id: 'vessels', name: t('Blood vessels', 'रक्त वाहिकाएँ', 'ರಕ್ತನಾಳಗಳು') },
    { id: 'supply', name: t('The heart’s own blood supply', 'हृदय की अपनी रक्त आपूर्ति', 'ಹೃದಯಕ್ಕೇ ರಕ್ತ ಪೂರೈಕೆ') },
    { id: 'blood', name: t('Blood', 'रक्त', 'ರಕ್ತ') },
    { id: 'body', name: t('Lungs and body', 'फेफड़े और शरीर', 'ಶ್ವಾಸಕೋಶಗಳು ಮತ್ತು ದೇಹ') },
  ],
  parts: [
    { id: 'right_atrium', group: 'chambers', color: '#a3404a', cap: true, inside: '#7a2a32', name: t('Right atrium', 'दायाँ अलिंद', 'ಬಲ ಹೃತ್ಕರ್ಣ'), info: t('Receives blood low in oxygen from the whole body through the venae cavae.', 'पूरे शरीर से कम ऑक्सीजन वाला रक्त महाशिराओं द्वारा प्राप्त करता है।', 'ಇಡೀ ದೇಹದಿಂದ ಕಡಿಮೆ ಆಮ್ಲಜನಕವಿರುವ ರಕ್ತವನ್ನು ಮಹಾಭಿಧಮನಿಗಳ ಮೂಲಕ ಪಡೆಯುತ್ತದೆ.') },
    { id: 'left_atrium', group: 'chambers', color: '#a3404a', cap: true, inside: '#7a2a32', name: t('Left atrium', 'बायाँ अलिंद', 'ಎಡ ಹೃತ್ಕರ್ಣ'), info: t('Receives blood rich in oxygen from the lungs through the pulmonary veins.', 'फेफड़ों से ऑक्सीजन-युक्त रक्त फुप्फुसीय शिराओं द्वारा प्राप्त करता है।', 'ಶ್ವಾಸಕೋಶಗಳಿಂದ ಆಮ್ಲಜನಕಯುಕ್ತ ರಕ್ತವನ್ನು ಶ್ವಾಸಕೋಶೀಯ ಅಭಿಧಮನಿಗಳ ಮೂಲಕ ಪಡೆಯುತ್ತದೆ.') },
    { id: 'right_ventricle', group: 'chambers', color: '#8c2430', cap: true, inside: '#6e1e28', name: t('Right ventricle', 'दायाँ निलय', 'ಬಲ ಹೃತ್ಕುಕ್ಷಿ'), info: t('Pumps blood to the lungs through the pulmonary artery. Its wall is thinner than the left ventricle’s.', 'रक्त को फुप्फुसीय धमनी द्वारा फेफड़ों में पंप करता है। इसकी दीवार बाएँ निलय से पतली होती है।', 'ಶ್ವಾಸಕೋಶೀಯ ಅಪಧಮನಿಯ ಮೂಲಕ ರಕ್ತವನ್ನು ಶ್ವಾಸಕೋಶಗಳಿಗೆ ಪಂಪ್ ಮಾಡುತ್ತದೆ. ಇದರ ಗೋಡೆ ಎಡ ಹೃತ್ಕುಕ್ಷಿಗಿಂತ ತೆಳುವಾಗಿದೆ.') },
    { id: 'left_ventricle', group: 'chambers', color: '#8c2430', cap: true, inside: '#6e1e28', name: t('Left ventricle', 'बायाँ निलय', 'ಎಡ ಹೃತ್ಕುಕ್ಷಿ'), info: t('The strongest chamber: its thick wall pumps blood through the aorta to the whole body.', 'सबसे शक्तिशाली कक्ष: इसकी मोटी दीवार महाधमनी द्वारा रक्त को पूरे शरीर में पंप करती है।', 'ಅತ್ಯಂತ ಬಲಿಷ್ಠ ಕೋಣೆ: ಇದರ ದಪ್ಪ ಗೋಡೆ ಮಹಾಪಧಮನಿಯ ಮೂಲಕ ರಕ್ತವನ್ನು ಇಡೀ ದೇಹಕ್ಕೆ ಪಂಪ್ ಮಾಡುತ್ತದೆ.') },
    { id: 'septum', group: 'chambers', color: '#76202b', cap: true, inside: '#5e1a22', name: t('Septum', 'पट (सेप्टम)', 'ವಿಭಾಜಕ ಭಿತ್ತಿ (ಸೆಪ್ಟಮ್)'), info: t('The wall between the two ventricles. It keeps blood rich in oxygen apart from blood low in oxygen.', 'दोनों निलयों के बीच की दीवार। यह ऑक्सीजन-युक्त और ऑक्सीजन-रहित रक्त को मिलने नहीं देती।', 'ಎರಡು ಹೃತ್ಕುಕ್ಷಿಗಳ ನಡುವಿನ ಗೋಡೆ. ಇದು ಆಮ್ಲಜನಕಯುಕ್ತ ಮತ್ತು ಆಮ್ಲಜನಕರಹಿತ ರಕ್ತ ಬೆರೆಯದಂತೆ ತಡೆಯುತ್ತದೆ.') },
    { id: 'tricuspid_valve', group: 'valves', color: '#eadcbc', name: t('Tricuspid valve', 'त्रिवलनी कपाट', 'ತ್ರಿದಳ ಕವಾಟ'), info: t('Three flaps between the right atrium and right ventricle. It stops blood flowing back.', 'दाएँ अलिंद और दाएँ निलय के बीच तीन पल्लों वाला कपाट। यह रक्त को वापस बहने से रोकता है।', 'ಬಲ ಹೃತ್ಕರ್ಣ ಮತ್ತು ಬಲ ಹೃತ್ಕುಕ್ಷಿಯ ನಡುವೆ ಮೂರು ದಳಗಳ ಕವಾಟ. ರಕ್ತ ಹಿಂದಕ್ಕೆ ಹರಿಯದಂತೆ ತಡೆಯುತ್ತದೆ.') },
    { id: 'mitral_valve', group: 'valves', color: '#eadcbc', name: t('Bicuspid (mitral) valve', 'द्विवलनी (माइट्रल) कपाट', 'ದ್ವಿದಳ (ಮಿಟ್ರಲ್) ಕವಾಟ'), info: t('Two flaps between the left atrium and left ventricle.', 'बाएँ अलिंद और बाएँ निलय के बीच दो पल्लों वाला कपाट।', 'ಎಡ ಹೃತ್ಕರ್ಣ ಮತ್ತು ಎಡ ಹೃತ್ಕುಕ್ಷಿಯ ನಡುವೆ ಎರಡು ದಳಗಳ ಕವಾಟ.') },
    { id: 'pulmonary_valve', group: 'valves', color: '#eadcbc', name: t('Pulmonary valve', 'फुप्फुसीय कपाट', 'ಶ್ವಾಸಕೋಶೀಯ ಕವಾಟ'), info: t('At the exit of the right ventricle, into the pulmonary artery.', 'दाएँ निलय के निकास पर, फुप्फुसीय धमनी में खुलता है।', 'ಬಲ ಹೃತ್ಕುಕ್ಷಿಯ ನಿರ್ಗಮನದಲ್ಲಿ, ಶ್ವಾಸಕೋಶೀಯ ಅಪಧಮನಿಗೆ ತೆರೆಯುತ್ತದೆ.') },
    { id: 'aortic_valve', group: 'valves', color: '#eadcbc', name: t('Aortic valve', 'महाधमनी कपाट', 'ಮಹಾಪಧಮನಿ ಕವಾಟ'), info: t('At the exit of the left ventricle, into the aorta.', 'बाएँ निलय के निकास पर, महाधमनी में खुलता है।', 'ಎಡ ಹೃತ್ಕುಕ್ಷಿಯ ನಿರ್ಗಮನದಲ್ಲಿ, ಮಹಾಪಧಮನಿಗೆ ತೆರೆಯುತ್ತದೆ.') },
    { id: 'aorta', group: 'vessels', color: '#c42b2b', cap: true, inside: '#8a2020', name: t('Aorta', 'महाधमनी', 'ಮಹಾಪಧಮನಿ'), info: t('The largest artery. It carries blood rich in oxygen from the left ventricle to the body.', 'सबसे बड़ी धमनी। यह बाएँ निलय से ऑक्सीजन-युक्त रक्त शरीर तक ले जाती है।', 'ಅತಿ ದೊಡ್ಡ ಅಪಧಮನಿ. ಎಡ ಹೃತ್ಕುಕ್ಷಿಯಿಂದ ಆಮ್ಲಜನಕಯುಕ್ತ ರಕ್ತವನ್ನು ದೇಹಕ್ಕೆ ಒಯ್ಯುತ್ತದೆ.') },
    { id: 'pulmonary_trunk', group: 'vessels', color: '#2f57bf', cap: true, inside: '#2a3f80', name: t('Pulmonary artery', 'फुप्फुसीय धमनी', 'ಶ್ವಾಸಕೋಶೀಯ ಅಪಧಮನಿ'), info: t('Carries blood low in oxygen from the right ventricle towards the lungs. The only artery with blood low in oxygen.', 'दाएँ निलय से कम ऑक्सीजन वाला रक्त फेफड़ों की ओर ले जाती है। यही एकमात्र धमनी है जिसमें ऑक्सीजन-रहित रक्त बहता है।', 'ಬಲ ಹೃತ್ಕುಕ್ಷಿಯಿಂದ ಕಡಿಮೆ ಆಮ್ಲಜನಕದ ರಕ್ತವನ್ನು ಶ್ವಾಸಕೋಶಗಳತ್ತ ಒಯ್ಯುತ್ತದೆ. ಆಮ್ಲಜನಕರಹಿತ ರಕ್ತ ಹರಿಯುವ ಏಕೈಕ ಅಪಧಮನಿ.') },
    { id: 'pulmonary_veins', group: 'vessels', color: '#c42b2b', name: t('Pulmonary veins', 'फुप्फुसीय शिराएँ', 'ಶ್ವಾಸಕೋಶೀಯ ಅಭಿಧಮನಿಗಳು'), info: t('Bring blood rich in oxygen from the lungs to the left atrium. The only veins with blood rich in oxygen.', 'फेफड़ों से ऑक्सीजन-युक्त रक्त बाएँ अलिंद में लाती हैं। यही एकमात्र शिराएँ हैं जिनमें ऑक्सीजन-युक्त रक्त बहता है।', 'ಶ್ವಾಸಕೋಶಗಳಿಂದ ಆಮ್ಲಜನಕಯುಕ್ತ ರಕ್ತವನ್ನು ಎಡ ಹೃತ್ಕರ್ಣಕ್ಕೆ ತರುತ್ತವೆ. ಆಮ್ಲಜನಕಯುಕ್ತ ರಕ್ತ ಹರಿಯುವ ಏಕೈಕ ಅಭಿಧಮನಿಗಳು.') },
    { id: 'vena_cava', group: 'vessels', color: '#2f57bf', name: t('Venae cavae', 'महाशिराएँ', 'ಮಹಾಭಿಧಮನಿಗಳು'), info: t('The two great veins that bring blood back from the body to the right atrium.', 'वे दो बड़ी शिराएँ जो शरीर से रक्त दाएँ अलिंद में वापस लाती हैं।', 'ದೇಹದಿಂದ ರಕ್ತವನ್ನು ಬಲ ಹೃತ್ಕರ್ಣಕ್ಕೆ ಮರಳಿ ತರುವ ಎರಡು ಮಹಾ ಅಭಿಧಮನಿಗಳು.') },
    { id: 'coronary_arteries', group: 'supply', color: '#e0372f', name: t('Coronary arteries', 'कोरोनरी धमनियाँ', 'ಕೊರೊನರಿ ಅಪಧಮನಿಗಳು'), info: t('They feed the heart muscle itself. A blocked coronary artery causes a heart attack.', 'ये स्वयं हृदय की पेशी को रक्त देती हैं। इनमें रुकावट से दिल का दौरा पड़ता है।', 'ಇವು ಹೃದಯದ ಸ್ನಾಯುವಿಗೇ ರಕ್ತ ನೀಡುತ್ತವೆ. ಇವುಗಳಲ್ಲಿ ಅಡಚಣೆಯಾದರೆ ಹೃದಯಾಘಾತವಾಗುತ್ತದೆ.') },
    { id: 'deoxy_blood', group: 'blood', color: DEOXY, cap: true, inside: '#4a5aa0', name: t('Blood low in oxygen', 'कम ऑक्सीजन वाला रक्त', 'ಕಡಿಮೆ ಆಮ್ಲಜನಕದ ರಕ್ತ'), info: t('Back from the body, in the right side of the heart.', 'शरीर से लौटा, हृदय के दाएँ भाग में।', 'ದೇಹದಿಂದ ಹಿಂದಿರುಗಿದ್ದು, ಹೃದಯದ ಬಲಭಾಗದಲ್ಲಿ.') },
    { id: 'oxy_blood', group: 'blood', color: OXY, cap: true, inside: '#b03a30', name: t('Blood rich in oxygen', 'ऑक्सीजन-युक्त रक्त', 'ಆಮ್ಲಜನಕಯುಕ್ತ ರಕ್ತ'), info: t('Back from the lungs, in the left side of the heart.', 'फेफड़ों से लौटा, हृदय के बाएँ भाग में।', 'ಶ್ವಾಸಕೋಶಗಳಿಂದ ಹಿಂದಿರುಗಿದ್ದು, ಹೃದಯದ ಎಡಭಾಗದಲ್ಲಿ.') },
    { id: 'lungs', group: 'body', color: '#d99a9a', name: t('Lungs', 'फेफड़े', 'ಶ್ವಾಸಕೋಶಗಳು'), info: t('Blood picks up oxygen and gives up carbon dioxide here.', 'यहाँ रक्त ऑक्सीजन लेता है और कार्बन डाइऑक्साइड छोड़ता है।', 'ಇಲ್ಲಿ ರಕ್ತ ಆಮ್ಲಜನಕವನ್ನು ಪಡೆದು ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡನ್ನು ಬಿಡುತ್ತದೆ.') },
    { id: 'body', group: 'body', color: '#b0706a', name: t('Body tissues', 'शरीर के ऊतक', 'ದೇಹದ ಅಂಗಾಂಶಗಳು'), info: t('Capillaries give oxygen and food to the cells and take away their wastes.', 'केशिकाएँ कोशिकाओं को ऑक्सीजन और भोजन देती हैं और उनके अपशिष्ट ले जाती हैं।', 'ಲೋಮನಾಳಗಳು ಕೋಶಗಳಿಗೆ ಆಮ್ಲಜನಕ ಮತ್ತು ಆಹಾರ ನೀಡಿ ತ್ಯಾಜ್ಯಗಳನ್ನು ಒಯ್ಯುತ್ತವೆ.') },
    { id: 'pulmonary_circuit', group: 'body', color: '#8a7ab0', name: t('Pulmonary circulation', 'फुप्फुसीय परिसंचरण', 'ಶ್ವಾಸಕೋಶೀಯ ರಕ್ತಪರಿಚಲನೆ'), info: t('Heart → lungs → heart.', 'हृदय → फेफड़े → हृदय।', 'ಹೃದಯ → ಶ್ವಾಸಕೋಶ → ಹೃದಯ.') },
    { id: 'systemic_circuit', group: 'body', color: '#b07a6a', name: t('Systemic circulation', 'दैहिक परिसंचरण', 'ದೈಹಿಕ ರಕ್ತಪರಿಚಲನೆ'), info: t('Heart → body → heart.', 'हृदय → शरीर → हृदय।', 'ಹೃದಯ → ದೇಹ → ಹೃದಯ.') },
  ],
  steps: [
    {
      id: 'outside', stage: 'heart', seconds: 13,
      camera: { pos: [1.6, 0.8, 9.4], target: [0, -0.15, 0], from: [3, 2, 16], drift: 0.05 },
      highlight: ['coronary_arteries'], labels: ['aorta', 'pulmonary_trunk', 'vena_cava', 'right_ventricle', 'left_ventricle', 'coronary_arteries'],
      title: t('A muscular pump', 'एक पेशीय पंप', 'ಸ್ನಾಯುವಿನ ಪಂಪ್'),
      caption: t(
        'The heart is a pump of muscle about the size of your fist. It beats about 72 times a minute, all your life. The coronary arteries on its surface feed the heart muscle itself.',
        'हृदय लगभग आपकी मुट्ठी के आकार का पेशी से बना पंप है। यह जीवन भर लगभग 72 बार प्रति मिनट धड़कता है। इसकी सतह पर कोरोनरी धमनियाँ स्वयं हृदय की पेशी को रक्त देती हैं।',
        'ಹೃದಯವು ಸುಮಾರು ನಿಮ್ಮ ಮುಷ್ಟಿಯ ಗಾತ್ರದ ಸ್ನಾಯುವಿನ ಪಂಪ್. ಇದು ಜೀವನವಿಡೀ ನಿಮಿಷಕ್ಕೆ ಸುಮಾರು 72 ಬಾರಿ ಬಡಿಯುತ್ತದೆ. ಇದರ ಮೇಲ್ಮೈಯ ಕೊರೊನರಿ ಅಪಧಮನಿಗಳು ಹೃದಯ ಸ್ನಾಯುವಿಗೇ ರಕ್ತ ನೀಡುತ್ತವೆ.',
      ),
    },
    {
      id: 'chambers', stage: 'heart', seconds: 12,
      camera: { pos: [0.3, 0.2, 7.4], target: [0, -0.35, 0], drift: 0.015 },
      cut: { normal: [0, 0, -1], point: [0, 0, -0.05] },
      highlight: ['septum'], labels: ['right_atrium', 'left_atrium', 'right_ventricle', 'left_ventricle', 'septum'],
      title: t('Four chambers', 'चार कक्ष', 'ನಾಲ್ಕು ಕೋಣೆಗಳು'),
      caption: t(
        'Cut open, the heart has four chambers: two atria above that receive blood, and two ventricles below that pump it out. The septum keeps the right and left sides apart.',
        'काटकर देखने पर हृदय में चार कक्ष दिखते हैं: ऊपर दो अलिंद जो रक्त प्राप्त करते हैं, और नीचे दो निलय जो उसे बाहर पंप करते हैं। पट दाएँ और बाएँ भागों को अलग रखता है।',
        'ಕತ್ತರಿಸಿ ನೋಡಿದರೆ ಹೃದಯದಲ್ಲಿ ನಾಲ್ಕು ಕೋಣೆಗಳಿವೆ: ಮೇಲೆ ರಕ್ತವನ್ನು ಪಡೆಯುವ ಎರಡು ಹೃತ್ಕರ್ಣಗಳು, ಕೆಳಗೆ ಅದನ್ನು ಹೊರಗೆ ಪಂಪ್ ಮಾಡುವ ಎರಡು ಹೃತ್ಕುಕ್ಷಿಗಳು. ವಿಭಾಜಕ ಭಿತ್ತಿ ಬಲ ಮತ್ತು ಎಡ ಭಾಗಗಳನ್ನು ಬೇರೆಯಾಗಿಡುತ್ತದೆ.',
      ),
    },
    {
      id: 'right_side', stage: 'heart', seconds: 14,
      camera: { pos: [-1.2, 0.3, 7.0], target: [-0.35, -0.3, 0], drift: 0.01 },
      cut: { normal: [0, 0, -1], point: [0, 0, -0.05] },
      highlight: ['right_atrium', 'right_ventricle'], labels: ['vena_cava', 'right_atrium', 'tricuspid_valve', 'right_ventricle', 'pulmonary_trunk', 'deoxy_blood'],
      title: t('The right side: to the lungs', 'दायाँ भाग: फेफड़ों की ओर', 'ಬಲಭಾಗ: ಶ್ವಾಸಕೋಶಗಳತ್ತ'),
      caption: t(
        'Blood low in oxygen comes back from the body through the venae cavae into the right atrium. It passes the tricuspid valve into the right ventricle, which pumps it to the lungs.',
        'कम ऑक्सीजन वाला रक्त शरीर से महाशिराओं द्वारा दाएँ अलिंद में लौटता है। यह त्रिवलनी कपाट से होकर दाएँ निलय में जाता है, जो इसे फेफड़ों में पंप करता है।',
        'ಕಡಿಮೆ ಆಮ್ಲಜನಕದ ರಕ್ತ ದೇಹದಿಂದ ಮಹಾಭಿಧಮನಿಗಳ ಮೂಲಕ ಬಲ ಹೃತ್ಕರ್ಣಕ್ಕೆ ಮರಳುತ್ತದೆ. ಅದು ತ್ರಿದಳ ಕವಾಟದ ಮೂಲಕ ಬಲ ಹೃತ್ಕುಕ್ಷಿಗೆ ಹೋಗುತ್ತದೆ; ಅದು ರಕ್ತವನ್ನು ಶ್ವಾಸಕೋಶಗಳಿಗೆ ಪಂಪ್ ಮಾಡುತ್ತದೆ.',
      ),
    },
    {
      id: 'left_side', stage: 'heart', seconds: 14,
      camera: { pos: [1.4, 0.3, 7.0], target: [0.35, -0.3, 0], drift: 0.01 },
      cut: { normal: [0, 0, -1], point: [0, 0, -0.05] },
      highlight: ['left_atrium', 'left_ventricle'], labels: ['pulmonary_veins', 'left_atrium', 'mitral_valve', 'left_ventricle', 'aorta', 'oxy_blood'],
      title: t('The left side: to the body', 'बायाँ भाग: शरीर की ओर', 'ಎಡಭಾಗ: ದೇಹದತ್ತ'),
      caption: t(
        'Blood rich in oxygen returns from the lungs through the pulmonary veins into the left atrium, then through the bicuspid valve into the left ventricle. Its thick wall pumps the blood into the aorta, to the whole body.',
        'ऑक्सीजन-युक्त रक्त फेफड़ों से फुप्फुसीय शिराओं द्वारा बाएँ अलिंद में लौटता है, फिर द्विवलनी कपाट से होकर बाएँ निलय में जाता है। इसकी मोटी दीवार रक्त को महाधमनी में, पूरे शरीर के लिए पंप करती है।',
        'ಆಮ್ಲಜನಕಯುಕ್ತ ರಕ್ತ ಶ್ವಾಸಕೋಶಗಳಿಂದ ಶ್ವಾಸಕೋಶೀಯ ಅಭಿಧಮನಿಗಳ ಮೂಲಕ ಎಡ ಹೃತ್ಕರ್ಣಕ್ಕೆ, ನಂತರ ದ್ವಿದಳ ಕವಾಟದ ಮೂಲಕ ಎಡ ಹೃತ್ಕುಕ್ಷಿಗೆ ಬರುತ್ತದೆ. ಅದರ ದಪ್ಪ ಗೋಡೆ ರಕ್ತವನ್ನು ಮಹಾಪಧಮನಿಗೆ, ಇಡೀ ದೇಹಕ್ಕಾಗಿ ಪಂಪ್ ಮಾಡುತ್ತದೆ.',
      ),
    },
    {
      id: 'beat', stage: 'heart', seconds: 15,
      camera: { pos: [0.2, 3.4, 7.2], target: [0, -0.2, -0.2] },
      cut: { normal: [0, 0, -1], point: [0, 0, -0.05] },
      highlight: ['tricuspid_valve', 'mitral_valve', 'aortic_valve', 'pulmonary_valve'], labels: ['tricuspid_valve', 'mitral_valve', 'aortic_valve', 'pulmonary_valve'],
      title: t('One heartbeat, slowed down', 'एक धड़कन, धीमी गति में', 'ಒಂದು ಹೃದಯಬಡಿತ, ನಿಧಾನವಾಗಿ'),
      caption: t(
        'First the atria squeeze, filling the ventricles. Then the ventricles squeeze: the valves between them snap shut (“lub”), blood rushes out, and the valves at the exits close (“dub”). Valves let blood flow only one way.',
        'पहले अलिंद सिकुड़कर निलयों को भरते हैं। फिर निलय सिकुड़ते हैं: उनके बीच के कपाट झट से बंद होते हैं (“लब”), रक्त तेज़ी से बाहर निकलता है, और निकास के कपाट बंद होते हैं (“डब”)। कपाट रक्त को केवल एक दिशा में बहने देते हैं।',
        'ಮೊದಲು ಹೃತ್ಕರ್ಣಗಳು ಸಂಕುಚಿಸಿ ಹೃತ್ಕುಕ್ಷಿಗಳನ್ನು ತುಂಬಿಸುತ್ತವೆ. ನಂತರ ಹೃತ್ಕುಕ್ಷಿಗಳು ಸಂಕುಚಿಸುತ್ತವೆ: ಅವುಗಳ ನಡುವಿನ ಕವಾಟಗಳು ಪಟ್ಟನೆ ಮುಚ್ಚುತ್ತವೆ (“ಲಬ್”), ರಕ್ತ ವೇಗವಾಗಿ ಹೊರಹೋಗುತ್ತದೆ, ಮತ್ತು ನಿರ್ಗಮನದ ಕವಾಟಗಳು ಮುಚ್ಚುತ್ತವೆ (“ಡಬ್”). ಕವಾಟಗಳು ರಕ್ತವನ್ನು ಒಂದೇ ದಿಕ್ಕಿನಲ್ಲಿ ಹರಿಯಲು ಬಿಡುತ್ತವೆ.',
      ),
    },
    {
      id: 'double', stage: 'circulation', seconds: 15,
      camera: { pos: [3.4, 1.0, 20.5], target: [0, -0.2, 0], from: [1, 0, 6], drift: 0.02 },
      highlight: ['lungs', 'body'], labels: ['lungs', 'body', 'pulmonary_circuit', 'systemic_circuit'],
      title: t('Double circulation', 'दोहरा परिसंचरण', 'ದ್ವಿ ರಕ್ತಪರಿಚಲನೆ'),
      caption: t(
        'Blood goes round two circuits. The right side sends it to the lungs to pick up oxygen and back (pulmonary circulation); the left side sends it round the body and back (systemic circulation).',
        'रक्त दो परिपथों में घूमता है। दायाँ भाग इसे ऑक्सीजन लेने के लिए फेफड़ों में भेजता है और वह लौट आता है (फुप्फुसीय परिसंचरण); बायाँ भाग इसे पूरे शरीर में भेजता है और वह लौट आता है (दैहिक परिसंचरण)।',
        'ರಕ್ತ ಎರಡು ಸುತ್ತುಗಳಲ್ಲಿ ಹರಿಯುತ್ತದೆ. ಬಲಭಾಗ ಅದನ್ನು ಆಮ್ಲಜನಕ ಪಡೆಯಲು ಶ್ವಾಸಕೋಶಗಳಿಗೆ ಕಳುಹಿಸಿ ಮರಳಿ ಪಡೆಯುತ್ತದೆ (ಶ್ವಾಸಕೋಶೀಯ ರಕ್ತಪರಿಚಲನೆ); ಎಡಭಾಗ ಅದನ್ನು ಇಡೀ ದೇಹಕ್ಕೆ ಕಳುಹಿಸಿ ಮರಳಿ ಪಡೆಯುತ್ತದೆ (ದೈಹಿಕ ರಕ್ತಪರಿಚಲನೆ).',
      ),
    },
    {
      id: 'summary', stage: 'circulation', seconds: 13,
      camera: { pos: [-4.4, 1.8, 20.0], target: [0, -0.2, 0], drift: 0.03 },
      highlight: [], labels: ['oxy_blood', 'deoxy_blood', 'pulmonary_circuit', 'systemic_circuit'],
      title: t('Why two circuits?', 'दो परिपथ क्यों?', 'ಎರಡು ಸುತ್ತುಗಳೇಕೆ?'),
      caption: t(
        'In each round, blood passes through the heart twice. Keeping blood rich in oxygen apart from blood low in oxygen gives the body a steady, rich supply of oxygen, which warm-blooded animals like us need.',
        'हर चक्कर में रक्त दो बार हृदय से होकर गुज़रता है। ऑक्सीजन-युक्त और ऑक्सीजन-रहित रक्त को अलग रखने से शरीर को ऑक्सीजन की भरपूर और लगातार आपूर्ति मिलती है, जिसकी हम जैसे नियततापी जंतुओं को ज़रूरत होती है।',
        'ಪ್ರತಿ ಸುತ್ತಿನಲ್ಲಿ ರಕ್ತ ಎರಡು ಬಾರಿ ಹೃದಯದ ಮೂಲಕ ಹಾದುಹೋಗುತ್ತದೆ. ಆಮ್ಲಜನಕಯುಕ್ತ ಮತ್ತು ಆಮ್ಲಜನಕರಹಿತ ರಕ್ತವನ್ನು ಬೇರೆಯಾಗಿಡುವುದರಿಂದ ದೇಹಕ್ಕೆ ಆಮ್ಲಜನಕದ ಸಮೃದ್ಧ ಮತ್ತು ನಿರಂತರ ಪೂರೈಕೆ ಸಿಗುತ್ತದೆ; ನಮ್ಮಂತಹ ಬಿಸಿರಕ್ತದ ಪ್ರಾಣಿಗಳಿಗೆ ಇದು ಬೇಕು.',
      ),
    },
  ],
};

const S = 20; // the model is in metres; the scene works in tenths of a metre, roughly

/** Materials for living heart tissue: moist, slightly translucent at the rim. */
const tissue = (color, o = {}) => mat({ color, rough: 0.48, clearcoat: 0.35, clearcoatRough: 0.35, sheen: 0.4, sheenColor: C(color).lerp(C('#ffd0c0'), 0.35), sheenRough: 0.5, rim: 0.12, ...o });

export async function build(k) {
  const model = await k.loadModel('heart');
  const stages = { heart: buildHeart(k, model), circulation: await buildCirculation(k, model) };
  return { update: (s) => stages[s.stage]?.(s) };
}

/** The flow paths, scaled: the right side (body → lungs) and the left side (lungs → body). */
function paths() {
  // Just in front of the cut face (z = -0.05), where they show over the section.
  const P = (pts) => curve(pts.map(([x, y, z]) => [x * S, y * S, 0.05 + z * 0.8]));
  return {
    right: [
      P([[-0.036, 0.075, 0.002], [-0.036, 0.058, 0.002], [-0.038, 0.04, 0.003], [-0.038, -0.006, 0.005], [-0.03, -0.03, 0.012], [-0.014, -0.042, 0.02], [-0.004, -0.03, 0.03], [0.002, -0.005, 0.03], [0.006, 0.022, 0.021], [0.01, 0.034, 0.0], [0.04, 0.03, -0.018]]),
      P([[-0.048, -0.105, 0.001], [-0.048, -0.093, 0.001], [-0.038, -0.075, 0.002], [-0.038, -0.03, 0.005], [-0.028, -0.036, 0.014], [-0.012, -0.044, 0.022], [-0.002, -0.028, 0.03], [0.003, 0.0, 0.03], [0.006, 0.022, 0.021], [0.0, 0.032, 0.0], [-0.03, 0.028, -0.018]]),
    ],
    left: [
      P([[-0.07, 0.004, -0.012], [-0.058, 0.004, -0.012], [-0.03, -0.004, -0.02], [-0.007, -0.011, -0.023], [0.006, -0.03, -0.012], [0.016, -0.045, 0.002], [0.012, -0.03, 0.006], [-0.003, -0.008, 0.006], [-0.012, 0.012, 0.009], [-0.01, 0.045, 0.0], [0.005, 0.06, -0.02], [0.012, 0.03, -0.035], [0.012, -0.07, -0.04]]),
      P([[0.07, -0.031, -0.004], [0.058, -0.031, -0.004], [0.03, -0.02, -0.015], [-0.003, -0.014, -0.022], [0.008, -0.034, -0.01], [0.02, -0.046, 0.004], [0.01, -0.028, 0.006], [-0.003, -0.008, 0.006], [-0.012, 0.012, 0.009], [-0.008, 0.045, 0.0], [0.006, 0.058, -0.02], [0.012, 0.03, -0.035], [0.012, -0.07, -0.04]]),
    ],
  };
}

/** A red blood cell: a disc dimpled on both faces. */
const rbcGeometry = () => disc(1, 0.42, { segments: 12, dimple: 0.13, rim: 0.5, rimSteps: 4 });

function buildHeart(k, model) {
  const stage = k.stage('heart');
  const g = (id) => model.geometries[id].clone().scale(S, S, S);
  const muscle = tissue('#8a3436'), atrial = tissue('#9a4446'), septal = tissue('#7a2c30');
  const valveMat = mat({ color: '#e6d6b4', rough: 0.55, sheen: 0.4, sheenColor: '#fff4e0', rim: 0.12, side: THREE.DoubleSide });
  const artery = tissue('#b5463d', { clearcoat: 0.5 }), vein = tissue('#56619f', { clearcoat: 0.5, sheenColor: '#a8b0e0' });
  const W = {}; // the parts' wrappers, which beat
  const add = (id, geoIds, material, opts) => {
    const geos = geoIds.map(g);
    const group = new THREE.Group();
    for (const geo of geos) group.add(new THREE.Mesh(geo, material));
    const obj = geos.length === 1 ? group.children[0] : group;
    stage.add(obj);
    W[id] = k.part(id, obj, opts);
    return obj;
  };
  add('right_atrium', ['right_atrium'], atrial);
  add('left_atrium', ['left_atrium'], atrial);
  add('right_ventricle', ['right_ventricle'], muscle);
  add('left_ventricle', ['left_ventricle'], muscle);
  add('septum', ['septum'], septal);
  const papillary = new THREE.Mesh(g('papillary_muscles'), muscle);
  W.right_ventricle.add(papillary);
  add('tricuspid_valve', ['tricuspid_valve'], valveMat);
  add('mitral_valve', ['mitral_valve'], valveMat);
  add('pulmonary_valve', ['pulmonary_valve'], valveMat);
  add('aortic_valve', ['aortic_valve'], valveMat);
  add('aorta', ['aorta', 'aortic_branches'], artery);
  add('pulmonary_trunk', ['pulmonary_trunk', 'pulmonary_arteries'], vein);
  add('pulmonary_veins', ['pulmonary_veins'], artery);
  add('vena_cava', ['superior_vena_cava', 'inferior_vena_cava'], vein);
  add('coronary_arteries', ['coronary_arteries', 'cardiac_veins'], mat({ color: '#c84a3a', rough: 0.4, clearcoat: 0.5, rim: 0.1 }));
  // The blood in the chambers: seen only where the heart is cut open.
  const bloodMat = (c) => mat({ color: c, rough: 0.3, clearcoat: 0.8, clearcoatRough: 0.15, rim: 0.1 });
  const deoxy = new THREE.Group(), oxy = new THREE.Group();
  deoxy.add(new THREE.Mesh(g('ra_blood'), bloodMat(DEOXY)), new THREE.Mesh(g('rv_blood'), bloodMat(DEOXY)));
  oxy.add(new THREE.Mesh(g('la_blood'), bloodMat(OXY)), new THREE.Mesh(g('lv_blood'), bloodMat(OXY)));
  stage.add(deoxy, oxy);
  k.part('deoxy_blood', deoxy, { anchor: [-0.038 * S, -0.024 * S, -0.3] });
  k.part('oxy_blood', oxy, { anchor: [0.016 * S, -0.04 * S, -0.3] });

  // Pivots the chambers squeeze towards.
  const pivot = (ids) => {
    const box = new THREE.Box3();
    for (const id of ids) box.expandByObject(W[id]);
    return box.getCenter(new THREE.Vector3());
  };
  stage.updateMatrixWorld(true);
  const atriaPivot = pivot(['right_atrium', 'left_atrium']);
  const ventPivot = pivot(['right_ventricle', 'left_ventricle', 'septum']).add({ x: 0, y: 0.25, z: 0 });
  const squeeze = (w, p, s) => {
    w.scale.setScalar(s);
    w.position.copy(p).multiplyScalar(1 - s);
  };
  const valvePivot = {};
  for (const id of ['tricuspid_valve', 'mitral_valve', 'pulmonary_valve', 'aortic_valve']) valvePivot[id] = new THREE.Box3().setFromObject(W[id]).getCenter(new THREE.Vector3());

  // Red blood cells along the two sides.
  const P = paths();
  const geo = rbcGeometry();
  const rbcMat = (c) => {
    const m = mat({ color: c, rough: 0.4, clearcoat: 0.6, clearcoatRough: 0.25, sheen: 0.3, rim: 0.15 });
    m.userData.noClip = true;
    return m;
  };
  const N = 40;
  const cells = { right: new THREE.InstancedMesh(geo, rbcMat('#5d6bb5'), N * 2), left: new THREE.InstancedMesh(geo, rbcMat('#c0392f'), N * 2) };
  for (const m of Object.values(cells)) {
    m.frustumCulled = false;
    m.userData.decor = true;
    stage.add(m);
  }
  const rnd = seeded(71);
  const jitter = Array.from({ length: N * 4 }, () => [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() * 6]);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), e = new THREE.Euler(), sc = new THREE.Vector3();
  const sounds = new GlowPoints(8, { size: 0.6 });
  stage.add(sounds);

  return (s) => {
    const T = s.T;
    // The cardiac cycle: real speed outside, slowed right down for the heartbeat step.
    const period = s.is('beat') ? 3.2 : s.is('outside') ? 60 / 72 : 1.6;
    const ph = fract(T / period);
    const pulse = (a, b) => (ph >= a && ph <= b ? Math.sin(((ph - a) / (b - a)) * Math.PI) : 0);
    const atria = 1 - 0.07 * pulse(0.0, 0.18);
    const vent = 1 - 0.08 * pulse(0.2, 0.55);
    for (const id of ['right_atrium', 'left_atrium']) squeeze(W[id], atriaPivot, atria);
    for (const id of ['right_ventricle', 'left_ventricle', 'septum']) squeeze(W[id], ventPivot, vent);
    // Valves: the atrioventricular ones open while the ventricles fill, the exits while they empty.
    const avOpen = ph < 0.2 || ph > 0.62 ? 1 : 0;
    const exitOpen = ph > 0.24 && ph < 0.56 ? 1 : 0;
    const vopen = (id, open) => {
      const w = W[id];
      const tgt = open ? 0.62 : 1;
      const cur = w.userData.open ?? 1;
      const next = cur + (tgt - cur) * Math.min(1, (s.dt || 0.016) * 14);
      w.userData.open = s.playing ? next : tgt;
      w.scale.set(1, w.userData.open, 1);
      w.position.set(0, valvePivot[id].y * (1 - w.userData.open), 0);
    };
    vopen('tricuspid_valve', avOpen);
    vopen('mitral_valve', avOpen);
    vopen('pulmonary_valve', exitOpen);
    vopen('aortic_valve', exitOpen);
    // "Lub" and "dub": a soft flash where the valves close.
    sounds.begin();
    if (s.is('beat')) {
      const lub = Math.max(0, 1 - Math.abs(ph - 0.21) / 0.04), dub = Math.max(0, 1 - Math.abs(ph - 0.57) / 0.04);
      for (const [id, a] of [['tricuspid_valve', lub], ['mitral_valve', lub], ['pulmonary_valve', dub], ['aortic_valve', dub]]) {
        if (a > 0) sounds.push(valvePivot[id].x, valvePivot[id].y, -0.3, 0.9, COL.spark, 0.6 * a);
      }
    }
    sounds.done();
    // Blood in the chambers shows when the heart is open.
    const open = s.is('chambers', 'right_side', 'left_side', 'beat') ? smooth(s.t / 1.2) : 0;
    deoxy.visible = oxy.visible = open > 0.01;
    // Cells move faster while the chambers squeeze.
    const flow = (s.is('outside') ? 0.05 : 0.04) + 0.06 * (pulse(0.0, 0.18) + 1.6 * pulse(0.2, 0.55));
    // Cells show over the cut face, on the side the step is about.
    const show = { right: s.is('chambers', 'right_side', 'beat') ? 1 : 0, left: s.is('chambers', 'left_side', 'beat') ? 1 : 0 };
    for (const side of ['right', 'left']) {
      const mesh = cells[side];
      let n = 0;
      if (show[side] > 0.3) {
        P[side].forEach((c, ci) => {
          for (let i = 0; i < N; i++) {
            const j = jitter[ci * N + i];
            const u = fract(i / N + T * flow * 0.5 + j[3] * 0.01);
            c.getPointAt(u, v);
            v.x += j[0] * 0.28;
            v.y += j[1] * 0.28;
            v.z += j[2] * 0.2;
            e.set(j[3] + T * 1.3, j[0] * 4 + T, j[1] * 3);
            q.setFromEuler(e);
            const a = Math.min(1, u * 12, (1 - u) * 12);
            sc.set(0.085 * a, 0.085 * a, 0.085 * a);
            m4.compose(v, q, sc);
            mesh.setMatrixAt(n++, m4);
          }
        });
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
}

// ------------------------------------------------------------------ double circulation

async function buildCirculation(k, model) {
  const stage = k.stage('circulation');
  const rnd = seeded(73);
  // A small copy of the heart in the middle.
  const H = 13;
  const heart = new THREE.Group();
  const muscle = tissue('#8a3436');
  for (const id of ['right_atrium', 'left_atrium', 'right_ventricle', 'left_ventricle', 'septum']) heart.add(new THREE.Mesh(model.geometries[id].clone().scale(H, H, H), muscle));
  heart.add(new THREE.Mesh(model.geometries.aorta.clone().scale(H, H, H), tissue('#b5463d')), new THREE.Mesh(model.geometries.pulmonary_trunk.clone().scale(H, H, H), tissue('#56619f')));
  heart.traverse((o) => (o.userData.decor = true));
  stage.add(heart);

  // The lungs above (from the lungs model) and a bed of tissue below.
  let lungsObj;
  try {
    const lungs = await k.loadModel('lungs');
    const L = 11;
    lungsObj = new THREE.Group();
    const lm = tissue('#c98f8f', { sheenColor: '#ffd8d8', clearcoat: 0.2, rough: 0.6 });
    for (const id of ['right_upper', 'right_middle', 'right_lower', 'left_upper', 'left_lower']) lungsObj.add(new THREE.Mesh(lungs.geometries[id].clone().scale(L, L, L), lm));
    lungsObj.position.set(0, 3.6, -0.6);
  } catch {
    lungsObj = new THREE.Group();
    for (const x of [-1.3, 1.3]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24).scale(1.1, 1.6, 0.9), tissue('#c98f8f'));
      m.position.set(x, 3.6, -0.6);
      lungsObj.add(m);
    }
  }
  stage.add(lungsObj);
  k.part('lungs', lungsObj, { anchor: [-1.9, 4.6, 0] });

  const body = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24).scale(3.4, 0.9, 1.6), tissue('#9a5a55', { rough: 0.7, sheen: 0.3, clearcoat: 0.1 }));
  bed.position.set(0, -4.6, -0.3);
  body.add(bed);
  // Capillaries over the tissue, red where they arrive, blue where they leave.
  const capMat = (c) => mat({ color: c, rough: 0.45, clearcoat: 0.4, rim: 0.12 });
  for (let i = 0; i < 18; i++) {
    const x0 = -2.8 + i * 0.33;
    const pts = Array.from({ length: 6 }, (_, j) => [x0 + Math.sin(j * 1.3 + i) * 0.25, -4.0 - j * 0.08 + Math.cos(i + j) * 0.05, 0.8 - j * 0.32]);
    body.add(new THREE.Mesh(tube(pts, 0.03, { segments: 30, radial: 6 }), capMat(i < 9 ? '#b5463d' : '#56619f')));
  }
  stage.add(body);
  k.part('body', body, { anchor: [2.6, -4.2, 0.6] });

  // The four great vessels of the loops: tubes with blood running through.
  const loops = {
    pulmonaryOut: curve([[0.2, 0.9, 0.3], [0.6, 1.8, 0.4], [1.2, 2.6, 0.2], [1.6, 3.2, -0.2]]),
    pulmonaryOut2: curve([[0.0, 0.9, 0.3], [-0.6, 1.9, 0.4], [-1.2, 2.7, 0.2], [-1.6, 3.2, -0.2]]),
    pulmonaryBack: curve([[1.9, 3.0, 0.6], [1.6, 1.8, 0.9], [0.9, 0.6, 0.7], [0.4, 0.1, 0.3]]),
    pulmonaryBack2: curve([[-1.9, 3.0, 0.6], [-1.5, 1.8, 0.9], [-0.9, 0.5, 0.7], [-0.3, 0.0, 0.3]]),
    aorta: curve([[0.0, 0.8, 0.0], [0.4, 1.7, 0.0], [1.6, 1.6, -0.1], [2.6, 0.2, 0.2], [2.9, -2.0, 0.4], [2.2, -3.8, 0.6]]),
    cava: curve([[-2.2, -3.8, 0.6], [-2.9, -2.0, 0.4], [-2.6, 0.0, 0.3], [-1.4, 0.7, 0.3], [-0.6, 0.4, 0.3]]),
  };
  const kinds = { pulmonaryOut: 'deoxy', pulmonaryOut2: 'deoxy', pulmonaryBack: 'oxy', pulmonaryBack2: 'oxy', aorta: 'oxy', cava: 'deoxy' };
  const pulmonary = new THREE.Group(), systemic = new THREE.Group();
  const wall = (c) => mat({ color: c, rough: 0.35, clearcoat: 0.6, clearcoatRough: 0.2, rim: 0.25, opacity: 0.32, depthWrite: false });
  for (const [id, c] of Object.entries(loops)) {
    const m = new THREE.Mesh(tube(c, 0.2, { segments: 64, radial: 16 }), wall(kinds[id] === 'oxy' ? '#c0473c' : '#5d68b0'));
    (id.startsWith('pulmonary') ? pulmonary : systemic).add(m);
  }
  stage.add(pulmonary, systemic);
  k.part('pulmonary_circuit', pulmonary, { anchor: [1.6, 2.2, 0.6] });
  k.part('systemic_circuit', systemic, { anchor: [2.75, -1.2, 0.4] });

  const geo = rbcGeometry();
  const rbcMat = (c) => mat({ color: c, rough: 0.4, clearcoat: 0.6, sheen: 0.3, rim: 0.15 });
  const N = 22;
  const meshes = { oxy: new THREE.InstancedMesh(geo, rbcMat('#c0392f'), N * 6), deoxy: new THREE.InstancedMesh(geo, rbcMat('#5d6bb5'), N * 6) };
  for (const m of Object.values(meshes)) {
    m.frustumCulled = false;
    m.userData.decor = true;
    stage.add(m);
  }
  // Markers for the two kinds of blood, following a cell of each.
  const oxyAt = new THREE.Vector3(), deoxyAt = new THREE.Vector3();
  k.marker('oxy_blood', stage, (out) => out.copy(oxyAt), 0.2);
  k.marker('deoxy_blood', stage, (out) => out.copy(deoxyAt), 0.2);
  const jitter = Array.from({ length: N * 6 }, () => [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() * 6]);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), e = new THREE.Euler(), sc = new THREE.Vector3();
  const gas = new MoleculeSwarm(120, { scale: 0.07 });
  stage.add(gas);
  return (s) => {
    const T = s.T;
    const beat = 1 - 0.05 * Math.max(0, Math.sin(fract(T / 0.83) * Math.PI * 2));
    heart.scale.setScalar(beat);
    const counts = { oxy: 0, deoxy: 0 };
    Object.entries(loops).forEach(([id, c], li) => {
      const kind = kinds[id];
      const mesh = meshes[kind];
      for (let i = 0; i < N; i++) {
        const j = jitter[li * N + i];
        const u = fract(i / N + T * 0.06 + j[3] * 0.005);
        c.getPointAt(u, v);
        v.x += j[0] * 0.22;
        v.y += j[1] * 0.22;
        v.z += j[2] * 0.22;
        e.set(j[3] + T, j[0] * 4 + T * 0.7, j[1]);
        q.setFromEuler(e);
        const a = Math.min(1, u * 10, (1 - u) * 10);
        sc.setScalar(0.09 * a);
        m4.compose(v, q, sc);
        mesh.setMatrixAt(counts[kind]++, m4);
        if (i === 7 && id === 'aorta') oxyAt.copy(v);
        if (i === 7 && id === 'cava') deoxyAt.copy(v);
      }
    });
    for (const [kk, m] of Object.entries(meshes)) {
      m.count = counts[kk];
      m.instanceMatrix.needsUpdate = true;
    }
    // Oxygen into the blood at the lungs; carbon dioxide out of it.
    gas.begin();
    for (let i = 0; i < 10; i++) {
      const ph = fract(i / 10 + T * 0.18);
      const side = i % 2 ? 1 : -1;
      v.set(side * (1.3 + Math.sin(i) * 0.4), 3.4 + Math.cos(i * 1.7) * 0.6, 1.4);
      gas.put(i % 3 ? 'O2' : 'CO2', v.clone().add({ x: 0, y: 0, z: i % 3 ? 1.2 * (1 - ph) : 1.2 * ph }), tumble(i, T, 0.5, q), Math.min(1, ph * 6, (1 - ph) * 6) * 1.4);
    }
    gas.end();
  };
}
