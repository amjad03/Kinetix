// The human heart, from BodyParts3D (an adult male heart, in place in the
// chest). Vessels are cut short, as on a dissected specimen.
const blue = '#2f57bf', red = '#c42b2b';

const t = (en, hi, kn) => ({ en, hi, kn });

export default {
  id: 'heart',
  version: 1,
  order: 1,
  source: 'bp3d',
  subject: 'Biology',
  classes: [7, 10, 11, 12],
  title: t('Human heart', 'मानव हृदय', 'ಮಾನವ ಹೃದಯ'),
  summary: t(
    'A muscular pump with four chambers. The right side sends blood to the lungs; the left side sends it to the whole body.',
    'चार कक्षों वाला एक पेशीय पंप। दायाँ भाग रक्त को फेफड़ों में भेजता है; बायाँ भाग पूरे शरीर में।',
    'ನಾಲ್ಕು ಕೋಣೆಗಳಿರುವ ಸ್ನಾಯುವಿನ ಪಂಪ್. ಬಲಭಾಗ ರಕ್ತವನ್ನು ಶ್ವಾಸಕೋಶಗಳಿಗೆ, ಎಡಭಾಗ ಇಡೀ ದೇಹಕ್ಕೆ ಕಳುಹಿಸುತ್ತದೆ.',
  ),
  keywords: ['heart', 'circulation', 'circulatory system', 'double circulation', 'blood circulation', 'cardiac', 'atrium', 'ventricle', 'aorta', 'valves'],
  credit: 'BodyParts3D, © The Database Center for Life Science, CC BY 4.0',
  detail: 0.45,
  groups: [
    { id: 'chambers', name: t('Chambers', 'कक्ष', 'ಕೋಣೆಗಳು') },
    { id: 'valves', name: t('Valves', 'कपाट (वाल्व)', 'ಕವಾಟಗಳು') },
    { id: 'vessels', name: t('Blood vessels', 'रक्त वाहिकाएँ', 'ರಕ್ತನಾಳಗಳು') },
    { id: 'supply', name: t("The heart's own blood supply", 'हृदय की अपनी रक्त आपूर्ति', 'ಹೃದಯಕ್ಕೇ ರಕ್ತ ಪೂರೈಕೆ') },
    { id: 'blood', name: t('Blood in the chambers', 'कक्षों में रक्त', 'ಕೋಣೆಗಳಲ್ಲಿನ ರಕ್ತ') },
  ],
  splits: {
    ventricles: { file: 'FJ2428', near: { left_ventricle: ['FJ2422'], right_ventricle: ['FJ2423'] }, both: { part: 'septum', within: 0.011 } },
  },
  parts: [
    {
      id: 'right_atrium', group: 'chambers', color: '#a3404a', files: ['FJ2439'],
      name: t('Right atrium', 'दायाँ अलिंद', 'ಬಲ ಹೃತ್ಕರ್ಣ'),
      info: t('Receives blood low in oxygen from the whole body through the venae cavae.', 'पूरे शरीर से कम ऑक्सीजन वाला रक्त महाशिराओं द्वारा प्राप्त करता है।', 'ಇಡೀ ದೇಹದಿಂದ ಕಡಿಮೆ ಆಮ್ಲಜನಕವಿರುವ ರಕ್ತವನ್ನು ಮಹಾಭಿಧಮನಿಗಳ ಮೂಲಕ ಪಡೆಯುತ್ತದೆ.'),
    },
    {
      id: 'left_atrium', labelFrom: [0.3, 0, -1], group: 'chambers', color: '#a3404a', files: ['FJ2438'],
      name: t('Left atrium', 'बायाँ अलिंद', 'ಎಡ ಹೃತ್ಕರ್ಣ'),
      info: t('Receives blood rich in oxygen from the lungs through the pulmonary veins.', 'फेफड़ों से ऑक्सीजन-युक्त रक्त फुप्फुसीय शिराओं द्वारा प्राप्त करता है।', 'ಶ್ವಾಸಕೋಶಗಳಿಂದ ಆಮ್ಲಜನಕಯುಕ್ತ ರಕ್ತವನ್ನು ಶ್ವಾಸಕೋಶೀಯ ಅಭಿಧಮನಿಗಳ ಮೂಲಕ ಪಡೆಯುತ್ತದೆ.'),
    },
    {
      id: 'right_ventricle', group: 'chambers', color: '#8c2430',
      name: t('Right ventricle', 'दायाँ निलय', 'ಬಲ ಹೃತ್ಕುಕ್ಷಿ'),
      info: t('Pumps blood to the lungs through the pulmonary artery. Its wall is thinner than the left ventricle\'s.', 'रक्त को फुप्फुसीय धमनी द्वारा फेफड़ों में पंप करता है। इसकी दीवार बाएँ निलय से पतली होती है।', 'ಶ್ವಾಸಕೋಶೀಯ ಅಪಧಮನಿಯ ಮೂಲಕ ರಕ್ತವನ್ನು ಶ್ವಾಸಕೋಶಗಳಿಗೆ ಪಂಪ್ ಮಾಡುತ್ತದೆ. ಇದರ ಗೋಡೆ ಎಡ ಹೃತ್ಕುಕ್ಷಿಗಿಂತ ತೆಳುವಾಗಿದೆ.'),
    },
    {
      id: 'left_ventricle', group: 'chambers', color: '#8c2430',
      name: t('Left ventricle', 'बायाँ निलय', 'ಎಡ ಹೃತ್ಕುಕ್ಷಿ'),
      info: t('The strongest chamber: its thick wall pumps blood through the aorta to the whole body.', 'सबसे शक्तिशाली कक्ष: इसकी मोटी दीवार महाधमनी द्वारा रक्त को पूरे शरीर में पंप करती है।', 'ಅತ್ಯಂತ ಬಲಿಷ್ಠ ಕೋಣೆ: ಇದರ ದಪ್ಪ ಗೋಡೆ ಮಹಾಪಧಮನಿಯ ಮೂಲಕ ರಕ್ತವನ್ನು ಇಡೀ ದೇಹಕ್ಕೆ ಪಂಪ್ ಮಾಡುತ್ತದೆ.'),
    },
    {
      id: 'septum', group: 'chambers', color: '#76202b',
      name: t('Septum', 'पट (सेप्टम)', 'ವಿಭಾಜಕ ಭಿತ್ತಿ (ಸೆಪ್ಟಮ್)'),
      info: t('The wall between the two ventricles. It keeps blood rich in oxygen apart from blood low in oxygen.', 'दोनों निलयों के बीच की दीवार। यह ऑक्सीजन-युक्त और ऑक्सीजन-रहित रक्त को मिलने नहीं देती।', 'ಎರಡು ಹೃತ್ಕುಕ್ಷಿಗಳ ನಡುವಿನ ಗೋಡೆ. ಇದು ಆಮ್ಲಜನಕಯುಕ್ತ ಮತ್ತು ಆಮ್ಲಜನಕರಹಿತ ರಕ್ತ ಬೆರೆಯದಂತೆ ತಡೆಯುತ್ತದೆ.'),
    },
    {
      id: 'tricuspid_valve', group: 'valves', color: '#eadcbc', files: ['FJ2421', 'FJ2433', 'FJ2436'], detail: 0.35,
      name: t('Tricuspid valve', 'त्रिवलनी कपाट', 'ತ್ರಿದಳ ಕವಾಟ'),
      info: t('Three flaps between the right atrium and right ventricle. It stops blood flowing back.', 'दाएँ अलिंद और दाएँ निलय के बीच तीन पल्लों वाला कपाट। यह रक्त को वापस बहने से रोकता है।', 'ಬಲ ಹೃತ್ಕರ್ಣ ಮತ್ತು ಬಲ ಹೃತ್ಕುಕ್ಷಿಯ ನಡುವೆ ಮೂರು ದಳಗಳ ಕವಾಟ. ರಕ್ತ ಹಿಂದಕ್ಕೆ ಹರಿಯದಂತೆ ತಡೆಯುತ್ತದೆ.'),
    },
    {
      id: 'mitral_valve', group: 'valves', color: '#eadcbc', files: ['FJ2420', 'FJ2432'], detail: 0.35,
      name: t('Bicuspid (mitral) valve', 'द्विवलनी (माइट्रल) कपाट', 'ದ್ವಿದಳ (ಮಿಟ್ರಲ್) ಕವಾಟ'),
      info: t('Two flaps between the left atrium and left ventricle.', 'बाएँ अलिंद और बाएँ निलय के बीच दो पल्लों वाला कपाट।', 'ಎಡ ಹೃತ್ಕರ್ಣ ಮತ್ತು ಎಡ ಹೃತ್ಕುಕ್ಷಿಯ ನಡುವೆ ಎರಡು ದಳಗಳ ಕವಾಟ.'),
    },
    {
      id: 'pulmonary_valve', group: 'valves', color: '#eadcbc', files: ['FJ2417', 'FJ2427', 'FJ2434'],
      name: t('Pulmonary valve', 'फुप्फुसीय कपाट', 'ಶ್ವಾಸಕೋಶೀಯ ಕವಾಟ'),
      info: t('At the exit of the right ventricle, into the pulmonary artery.', 'दाएँ निलय के निकास पर, फुप्फुसीय धमनी में खुलता है।', 'ಬಲ ಹೃತ್ಕುಕ್ಷಿಯ ನಿರ್ಗಮನದಲ್ಲಿ, ಶ್ವಾಸಕೋಶೀಯ ಅಪಧಮನಿಗೆ ತೆರೆಯುತ್ತದೆ.'),
    },
    {
      id: 'aortic_valve', group: 'valves', color: '#eadcbc', files: ['FJ2426', 'FJ2431', 'FJ2435'],
      name: t('Aortic valve', 'महाधमनी कपाट', 'ಮಹಾಪಧಮನಿ ಕವಾಟ'),
      info: t('At the exit of the left ventricle, into the aorta.', 'बाएँ निलय के निकास पर, महाधमनी में खुलता है।', 'ಎಡ ಹೃತ್ಕುಕ್ಷಿಯ ನಿರ್ಗಮನದಲ್ಲಿ, ಮಹಾಪಧಮನಿಗೆ ತೆರೆಯುತ್ತದೆ.'),
    },
    {
      id: 'papillary_muscles', minor: true, group: 'chambers', color: '#9a2f3a', files: ['FJ2418', 'FJ2419', 'FJ2429', 'FJ2430', 'FJ2437'],
      name: t('Papillary muscles', 'पैपिलरी पेशियाँ', 'ಪ್ಯಾಪಿಲರಿ ಸ್ನಾಯುಗಳು'),
      info: t('Small muscles inside the ventricles that hold the valve flaps so they do not turn inside out.', 'निलयों के अंदर छोटी पेशियाँ जो कपाट के पल्लों को थामे रखती हैं ताकि वे उलटें नहीं।', 'ಹೃತ್ಕುಕ್ಷಿಗಳ ಒಳಗಿನ ಸಣ್ಣ ಸ್ನಾಯುಗಳು; ಕವಾಟದ ದಳಗಳು ತಿರುಗಿಕೊಳ್ಳದಂತೆ ಹಿಡಿದಿಡುತ್ತವೆ.'),
    },
    {
      id: 'aorta', group: 'vessels', color: red, files: ['FJ3413', 'FJ3411', 'FJ1931'],
      cuts: (f) => [{ point: [0, f.bboxOf('left_ventricle').min[1] + 0.02, 0], normal: [0, 1, 0] }],
      name: t('Aorta', 'महाधमनी', 'ಮಹಾಪಧಮನಿ'),
      info: t('The largest artery. It carries blood rich in oxygen from the left ventricle to the body.', 'सबसे बड़ी धमनी। यह बाएँ निलय से ऑक्सीजन-युक्त रक्त शरीर तक ले जाती है।', 'ಅತಿ ದೊಡ್ಡ ಅಪಧಮನಿ. ಎಡ ಹೃತ್ಕುಕ್ಷಿಯಿಂದ ಆಮ್ಲಜನಕಯುಕ್ತ ರಕ್ತವನ್ನು ದೇಹಕ್ಕೆ ಒಯ್ಯುತ್ತದೆ.'),
    },
    {
      id: 'aortic_branches', minor: true, group: 'vessels', color: red, files: ['FJ3417', 'FJ3483', 'FJ3479'],
      cuts: (f) => [{ point: [0, f.bboxOf('aorta').max[1] + 0.028, 0], normal: [0, -1, 0] }],
      attachedTo: ['aorta'],
      name: t('Branches to the head and arms', 'सिर और बाँहों की शाखाएँ', 'ತಲೆ ಮತ್ತು ತೋಳುಗಳಿಗೆ ಶಾಖೆಗಳು'),
      info: t('Three arteries leave the arch of the aorta for the head, neck and arms.', 'महाधमनी के चाप से सिर, गर्दन और बाँहों के लिए तीन धमनियाँ निकलती हैं।', 'ಮಹಾಪಧಮನಿಯ ಕಮಾನಿನಿಂದ ತಲೆ, ಕುತ್ತಿಗೆ ಮತ್ತು ತೋಳುಗಳಿಗೆ ಮೂರು ಅಪಧಮನಿಗಳು ಹೊರಡುತ್ತವೆ.'),
    },
    {
      id: 'pulmonary_trunk', group: 'vessels', color: blue, files: ['FJ2966'],
      name: t('Pulmonary artery', 'फुप्फुसीय धमनी', 'ಶ್ವಾಸಕೋಶೀಯ ಅಪಧಮನಿ'),
      info: t('Carries blood low in oxygen from the right ventricle towards the lungs. The only artery with blood low in oxygen.', 'दाएँ निलय से कम ऑक्सीजन वाला रक्त फेफड़ों की ओर ले जाती है। यही एकमात्र धमनी है जिसमें ऑक्सीजन-रहित रक्त बहता है।', 'ಬಲ ಹೃತ್ಕುಕ್ಷಿಯಿಂದ ಕಡಿಮೆ ಆಮ್ಲಜನಕದ ರಕ್ತವನ್ನು ಶ್ವಾಸಕೋಶಗಳತ್ತ ಒಯ್ಯುತ್ತದೆ. ಆಮ್ಲಜನಕರಹಿತ ರಕ್ತ ಹರಿಯುವ ಏಕೈಕ ಅಪಧಮನಿ.'),
    },
    {
      id: 'pulmonary_arteries', minor: true, group: 'vessels', color: blue, files: ['FJ3019', 'FJ2924'],
      cuts: (f) => [
        { point: [f.centroid('pulmonary_trunk')[0] - 0.05, 0, 0], normal: [1, 0, 0] },
        { point: [f.centroid('pulmonary_trunk')[0] + 0.05, 0, 0], normal: [-1, 0, 0] },
      ],
      attachedTo: ['pulmonary_trunk'],
      name: t('Right and left pulmonary arteries', 'दाईं और बाईं फुप्फुसीय धमनियाँ', 'ಬಲ ಮತ್ತು ಎಡ ಶ್ವಾಸಕೋಶೀಯ ಅಪಧಮನಿಗಳು'),
      info: t('One branch goes to each lung.', 'एक शाखा हर फेफड़े में जाती है।', 'ಒಂದೊಂದು ಶಾಖೆ ಒಂದೊಂದು ಶ್ವಾಸಕೋಶಕ್ಕೆ ಹೋಗುತ್ತದೆ.'),
    },
    {
      id: 'pulmonary_veins', labelFrom: [0, 0, -1], group: 'vessels', color: red, files: ['FJ3020', 'FJ3040', 'FJ2925', 'FJ2933', 'FJ2944', 'FJ2950', 'FJ2955'],
      name: t('Pulmonary veins', 'फुप्फुसीय शिराएँ', 'ಶ್ವಾಸಕೋಶೀಯ ಅಭಿಧಮನಿಗಳು'),
      info: t('Bring blood rich in oxygen from the lungs to the left atrium. The only veins with blood rich in oxygen.', 'फेफड़ों से ऑक्सीजन-युक्त रक्त बाएँ अलिंद में लाती हैं। यही एकमात्र शिराएँ हैं जिनमें ऑक्सीजन-युक्त रक्त बहता है।', 'ಶ್ವಾಸಕೋಶಗಳಿಂದ ಆಮ್ಲಜನಕಯುಕ್ತ ರಕ್ತವನ್ನು ಎಡ ಹೃತ್ಕರ್ಣಕ್ಕೆ ತರುತ್ತವೆ. ಆಮ್ಲಜನಕಯುಕ್ತ ರಕ್ತ ಹರಿಯುವ ಏಕೈಕ ಅಭಿಧಮನಿಗಳು.'),
    },
    {
      id: 'superior_vena_cava', group: 'vessels', color: blue, files: ['FJ3645'],
      name: t('Superior vena cava', 'ऊर्ध्व महाशिरा', 'ಊರ್ಧ್ವ ಮಹಾಭಿಧಮನಿ'),
      info: t('Brings blood from the head, neck and arms to the right atrium.', 'सिर, गर्दन और बाँहों से रक्त दाएँ अलिंद में लाती है।', 'ತಲೆ, ಕುತ್ತಿಗೆ ಮತ್ತು ತೋಳುಗಳಿಂದ ರಕ್ತವನ್ನು ಬಲ ಹೃತ್ಕರ್ಣಕ್ಕೆ ತರುತ್ತದೆ.'),
    },
    {
      id: 'inferior_vena_cava', group: 'vessels', color: blue, files: ['FJ3441'],
      cuts: (f) => [{ point: [0, f.bboxOf('right_atrium').min[1] - 0.025, 0], normal: [0, 1, 0] }],
      name: t('Inferior vena cava', 'निम्न महाशिरा', 'ಅಧೋ ಮಹಾಭಿಧಮನಿ'),
      info: t('Brings blood from the lower body to the right atrium.', 'शरीर के निचले भाग से रक्त दाएँ अलिंद में लाती है।', 'ದೇಹದ ಕೆಳಭಾಗದಿಂದ ರಕ್ತವನ್ನು ಬಲ ಹೃತ್ಕರ್ಣಕ್ಕೆ ತರುತ್ತದೆ.'),
    },
    {
      id: 'coronary_arteries', minor: true, group: 'supply', color: '#e0372f', detail: 0.6,
      files: ['FJ2631', 'FJ2632', 'FJ2633', 'FJ2634', 'FJ2635', 'FJ2636', 'FJ2637', 'FJ2638', 'FJ2639', 'FJ2640', 'FJ2641', 'FJ2642', 'FJ2643', 'FJ2644', 'FJ2645', 'FJ2646', 'FJ2647', 'FJ2648', 'FJ2649', 'FJ2650', 'FJ2651', 'FJ2652', 'FJ2653', 'FJ2654', 'FJ2737',
        'FJ2667', 'FJ2668', 'FJ2670', 'FJ2671', 'FJ2672', 'FJ2673', 'FJ2674', 'FJ2675', 'FJ2676', 'FJ2677', 'FJ2692', 'FJ2693', 'FJ2694', 'FJ2695', 'FJ2696', 'FJ2697', 'FJ2698', 'FJ2699', 'FJ2700', 'FJ2714', 'FJ2715', 'FJ2716', 'FJ2717', 'FJ2718', 'FJ2719', 'FJ2720', 'FJ2721', 'FJ2722', 'FJ2723'],
      name: t('Coronary arteries', 'कोरोनरी धमनियाँ', 'ಕೊರೊನರಿ ಅಪಧಮನಿಗಳು'),
      info: t('They feed the heart muscle itself. A blocked coronary artery causes a heart attack.', 'ये स्वयं हृदय की पेशी को रक्त देती हैं। इनमें रुकावट से दिल का दौरा पड़ता है।', 'ಇವು ಹೃದಯದ ಸ್ನಾಯುವಿಗೇ ರಕ್ತ ನೀಡುತ್ತವೆ. ಇವುಗಳಲ್ಲಿ ಅಡಚಣೆಯಾದರೆ ಹೃದಯಾಘಾತವಾಗುತ್ತದೆ.'),
    },
    {
      id: 'cardiac_veins', minor: true, group: 'supply', color: '#2c3e9e', detail: 0.6,
      files: ['FJ2655', 'FJ2656', 'FJ2678', 'FJ2679', 'FJ2680', 'FJ2681', 'FJ2682', 'FJ2683', 'FJ2684', 'FJ2685', 'FJ2686', 'FJ2687', 'FJ2688', 'FJ2689', 'FJ2690', 'FJ2691', 'FJ2724', 'FJ2731',
        'FJ2701', 'FJ2702', 'FJ2706', 'FJ2707', 'FJ2708', 'FJ2709', 'FJ2710', 'FJ2711', 'FJ2712', 'FJ2713', 'FJ2725', 'FJ2730', 'FJ2727', 'FJ2728', 'FJ2729', 'FJ2703', 'FJ2704', 'FJ2705'],
      name: t('Cardiac veins', 'हृदय की शिराएँ', 'ಹೃದಯದ ಅಭಿಧಮನಿಗಳು'),
      info: t('Collect used blood from the heart muscle and return it to the right atrium.', 'हृदय की पेशी से उपयोग किया गया रक्त इकट्ठा करके दाएँ अलिंद में लौटाती हैं।', 'ಹೃದಯ ಸ್ನಾಯುವಿನಿಂದ ಬಳಸಿದ ರಕ್ತವನ್ನು ಸಂಗ್ರಹಿಸಿ ಬಲ ಹೃತ್ಕರ್ಣಕ್ಕೆ ಹಿಂದಿರುಗಿಸುತ್ತವೆ.'),
    },
    {
      id: 'ra_blood', group: 'blood', color: '#5a6fd6', files: ['FJ2424'], hidden: true, opacity: 0.55,
      name: t('Blood in the right atrium', 'दाएँ अलिंद में रक्त', 'ಬಲ ಹೃತ್ಕರ್ಣದಲ್ಲಿನ ರಕ್ತ'),
      info: t('Blood low in oxygen, just back from the body.', 'शरीर से लौटा कम ऑक्सीजन वाला रक्त।', 'ದೇಹದಿಂದ ಹಿಂದಿರುಗಿದ ಕಡಿಮೆ ಆಮ್ಲಜನಕದ ರಕ್ತ.'),
    },
    {
      id: 'rv_blood', group: 'blood', color: '#5a6fd6', files: ['FJ2423'], hidden: true, opacity: 0.55,
      name: t('Blood in the right ventricle', 'दाएँ निलय में रक्त', 'ಬಲ ಹೃತ್ಕುಕ್ಷಿಯಲ್ಲಿನ ರಕ್ತ'),
      info: t('On its way to the lungs.', 'फेफड़ों की ओर जाता हुआ।', 'ಶ್ವಾಸಕೋಶಗಳತ್ತ ಹೊರಟಿದೆ.'),
    },
    {
      id: 'la_blood', group: 'blood', color: '#e2463f', files: ['FJ2425'], hidden: true, opacity: 0.55,
      name: t('Blood in the left atrium', 'बाएँ अलिंद में रक्त', 'ಎಡ ಹೃತ್ಕರ್ಣದಲ್ಲಿನ ರಕ್ತ'),
      info: t('Blood rich in oxygen, just back from the lungs.', 'फेफड़ों से लौटा ऑक्सीजन-युक्त रक्त।', 'ಶ್ವಾಸಕೋಶಗಳಿಂದ ಹಿಂದಿರುಗಿದ ಆಮ್ಲಜನಕಯುಕ್ತ ರಕ್ತ.'),
    },
    {
      id: 'lv_blood', group: 'blood', color: '#e2463f', files: ['FJ2422'], hidden: true, opacity: 0.55,
      name: t('Blood in the left ventricle', 'बाएँ निलय में रक्त', 'ಎಡ ಹೃತ್ಕುಕ್ಷಿಯಲ್ಲಿನ ರಕ್ತ'),
      info: t('On its way to the whole body.', 'पूरे शरीर की ओर जाता हुआ।', 'ಇಡೀ ದೇಹದತ್ತ ಹೊರಟಿದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0, 1] },
    { id: 'back', name: t('Back', 'पीछे से', 'ಹಿಂಭಾಗ'), dir: [0, 0, -1] },
    { id: 'left', name: t('Left side', 'बाईं ओर से', 'ಎಡಬದಿ'), dir: [1, 0, 0] },
    { id: 'right', name: t('Right side', 'दाईं ओर से', 'ಬಲಬದಿ'), dir: [-1, 0, 0] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.01] },
  ],
  slices: [
    { id: 'four_chambers', name: t('All four chambers', 'चारों कक्ष', 'ನಾಲ್ಕೂ ಕೋಣೆಗಳು'), normal: [0, 0, -1], offset: 0.0, view: 'front' },
    { id: 'valves', name: t('The four valves', 'चारों कपाट', 'ನಾಲ್ಕು ಕವಾಟಗಳು'), normal: [0, -1, 0], offset: 0.012, view: 'top' },
    { id: 'ventricles', name: t('Across the ventricles', 'निलयों के आर-पार', 'ಹೃತ್ಕುಕ್ಷಿಗಳ ಅಡ್ಡಲಾಗಿ'), normal: [0, -1, 0], offset: -0.02, view: 'top' },
    { id: 'side', name: t('Side cut', 'पार्श्व काट', 'ಪಕ್ಕದ ಕತ್ತರಿಕೆ'), normal: [-1, 0, 0], offset: 0.0, view: 'left' },
  ],
  animations: [
    {
      id: 'beat', kind: 'beat', bpm: 72,
      name: t('Heartbeat', 'धड़कन', 'ಹೃದಯ ಬಡಿತ'),
      atria: ['right_atrium', 'left_atrium', 'ra_blood', 'la_blood'],
      ventricles: ['left_ventricle', 'right_ventricle', 'septum', 'papillary_muscles', 'rv_blood', 'lv_blood', 'tricuspid_valve', 'mitral_valve'],
    },
    {
      id: 'flow', kind: 'flow',
      name: t('Double circulation', 'दोहरा परिसंचरण', 'ದ್ವಿ ಪರಿಚಲನೆ'),
      steps: [
        {
          color: '#4a64d8', show: ['ra_blood'], highlight: ['superior_vena_cava', 'inferior_vena_cava', 'right_atrium'],
          text: t('Blood low in oxygen comes back from the body through the two venae cavae into the right atrium.', 'कम ऑक्सीजन वाला रक्त शरीर से दोनों महाशिराओं द्वारा दाएँ अलिंद में लौटता है।', 'ಕಡಿಮೆ ಆಮ್ಲಜನಕದ ರಕ್ತ ದೇಹದಿಂದ ಎರಡು ಮಹಾಭಿಧಮನಿಗಳ ಮೂಲಕ ಬಲ ಹೃತ್ಕರ್ಣಕ್ಕೆ ಹಿಂದಿರುಗುತ್ತದೆ.'),
          paths: [['superior_vena_cava@top', 'superior_vena_cava', 'ra_blood'], ['inferior_vena_cava@bottom', 'inferior_vena_cava', 'ra_blood']],
        },
        {
          color: '#4a64d8', show: ['ra_blood', 'rv_blood'], highlight: ['tricuspid_valve', 'right_ventricle'],
          text: t('The right atrium squeezes. Blood goes through the tricuspid valve into the right ventricle.', 'दायाँ अलिंद सिकुड़ता है। रक्त त्रिवलनी कपाट से होकर दाएँ निलय में जाता है।', 'ಬಲ ಹೃತ್ಕರ್ಣ ಸಂಕುಚಿಸುತ್ತದೆ. ರಕ್ತ ತ್ರಿದಳ ಕವಾಟದ ಮೂಲಕ ಬಲ ಹೃತ್ಕುಕ್ಷಿಗೆ ಹೋಗುತ್ತದೆ.'),
          paths: [['ra_blood', 'tricuspid_valve', 'rv_blood']],
        },
        {
          color: '#4a64d8', show: ['rv_blood'], highlight: ['pulmonary_valve', 'pulmonary_trunk', 'pulmonary_arteries'],
          text: t('The right ventricle pumps it through the pulmonary valve into the pulmonary artery, to the lungs.', 'दायाँ निलय इसे फुप्फुसीय कपाट से होकर फुप्फुसीय धमनी में, फेफड़ों की ओर पंप करता है।', 'ಬಲ ಹೃತ್ಕುಕ್ಷಿ ಅದನ್ನು ಶ್ವಾಸಕೋಶೀಯ ಕವಾಟದ ಮೂಲಕ ಶ್ವಾಸಕೋಶೀಯ ಅಪಧಮನಿಗೆ, ಶ್ವಾಸಕೋಶಗಳತ್ತ ಪಂಪ್ ಮಾಡುತ್ತದೆ.'),
          paths: [['rv_blood', 'pulmonary_valve', 'pulmonary_trunk', 'pulmonary_arteries@left'], ['rv_blood', 'pulmonary_valve', 'pulmonary_trunk', 'pulmonary_arteries@right']],
        },
        {
          color: '#e0403a', show: ['la_blood'], highlight: ['pulmonary_veins', 'left_atrium'],
          text: t('In the lungs the blood takes in oxygen. The pulmonary veins bring it back to the left atrium.', 'फेफड़ों में रक्त ऑक्सीजन लेता है। फुप्फुसीय शिराएँ इसे बाएँ अलिंद में वापस लाती हैं।', 'ಶ್ವಾಸಕೋಶಗಳಲ್ಲಿ ರಕ್ತ ಆಮ್ಲಜನಕ ಪಡೆಯುತ್ತದೆ. ಶ್ವಾಸಕೋಶೀಯ ಅಭಿಧಮನಿಗಳು ಅದನ್ನು ಎಡ ಹೃತ್ಕರ್ಣಕ್ಕೆ ತರುತ್ತವೆ.'),
          paths: [['pulmonary_veins@left', 'la_blood'], ['pulmonary_veins@right', 'la_blood']],
        },
        {
          color: '#e0403a', show: ['la_blood', 'lv_blood'], highlight: ['mitral_valve', 'left_ventricle'],
          text: t('The left atrium squeezes. Blood goes through the bicuspid valve into the left ventricle.', 'बायाँ अलिंद सिकुड़ता है। रक्त द्विवलनी कपाट से होकर बाएँ निलय में जाता है।', 'ಎಡ ಹೃತ್ಕರ್ಣ ಸಂಕುಚಿಸುತ್ತದೆ. ರಕ್ತ ದ್ವಿದಳ ಕವಾಟದ ಮೂಲಕ ಎಡ ಹೃತ್ಕುಕ್ಷಿಗೆ ಹೋಗುತ್ತದೆ.'),
          paths: [['la_blood', 'mitral_valve', 'lv_blood']],
        },
        {
          color: '#e0403a', show: ['lv_blood'], highlight: ['aortic_valve', 'aorta', 'aortic_branches'],
          text: t('The thick left ventricle pumps it through the aortic valve into the aorta, to the whole body.', 'मोटी दीवार वाला बायाँ निलय इसे महाधमनी कपाट से होकर महाधमनी में, पूरे शरीर तक पंप करता है।', 'ದಪ್ಪ ಗೋಡೆಯ ಎಡ ಹೃತ್ಕುಕ್ಷಿ ಅದನ್ನು ಮಹಾಪಧಮನಿ ಕವಾಟದ ಮೂಲಕ ಮಹಾಪಧಮನಿಗೆ, ಇಡೀ ದೇಹಕ್ಕೆ ಪಂಪ್ ಮಾಡುತ್ತದೆ.'),
          paths: [['lv_blood', 'aortic_valve', 'file:FJ3413', 'file:FJ3411@top', 'aortic_branches@top'], ['lv_blood', 'aortic_valve', 'file:FJ3413', 'file:FJ3411@top', 'aorta@bottom']],
        },
      ],
    },
  ],
};
