// Mitosis: one animal cell dividing into two, phase by phase: chromatin
// condensing into chromosomes, the spindle, the chromosomes lining up and
// splitting, two nuclei forming, and the cell pinching in two. Built in code.
import { THREE, seeded, mat, tube, curve, smooth, lerp, clamp01, blob } from './kit.js';
import { C } from './bio.js';

const t = (en, hi, kn) => ({ en, hi, kn });

export const script = {
  id: 'mitosis',
  subject: 'Biology',
  classes: [9, 11],
  thumb: { step: 'metaphase', u: 0.7 },
  title: t('Mitosis: a cell divides', 'समसूत्री विभाजन: कोशिका का विभाजन', 'ಸಮಸೂತ್ರ ವಿಭಜನೆ: ಕೋಶದ ವಿಭಜನೆ'),
  summary: t(
    'How one cell becomes two identical cells: the chromosomes are copied, lined up, pulled apart by the spindle, and shared equally between two new nuclei.',
    'एक कोशिका दो एक जैसी कोशिकाएँ कैसे बनती है: गुणसूत्रों की प्रतिलिपि बनती है, वे एक पंक्ति में आते हैं, तर्कु उन्हें अलग खींचता है, और वे दो नए केंद्रकों में बराबर बँट जाते हैं।',
    'ಒಂದು ಕೋಶ ಎರಡು ಒಂದೇ ರೀತಿಯ ಕೋಶಗಳಾಗುವುದು ಹೇಗೆ: ವರ್ಣತಂತುಗಳು ನಕಲಾಗುತ್ತವೆ, ಸಾಲಾಗಿ ನಿಲ್ಲುತ್ತವೆ, ಕದಿರು ತಂತುಗಳು ಅವನ್ನು ಬೇರ್ಪಡಿಸುತ್ತವೆ, ಮತ್ತು ಎರಡು ಹೊಸ ಕೋಶಕೇಂದ್ರಗಳಲ್ಲಿ ಸಮವಾಗಿ ಹಂಚಲ್ಪಡುತ್ತವೆ.',
  ),
  keywords: ['mitosis', 'cell division', 'chromosomes', 'chromatid', 'centromere', 'spindle', 'prophase', 'metaphase', 'anaphase', 'telophase', 'cytokinesis', 'interphase', 'cell cycle', 'growth'],
  credit: 'Model built by KINETIX',
  look: {
    background: ['#1f2428', '#07090a'],
    keyAt: [3, 6, 7],
    envTop: '#2c3438',
    stages: { cell: { fog: [12, 30] } },
  },
  groups: [
    { id: 'cell', name: t('The cell', 'कोशिका', 'ಕೋಶ') },
    { id: 'chromosomes', name: t('Chromosomes', 'गुणसूत्र', 'ವರ್ಣತಂತುಗಳು') },
    { id: 'spindle', name: t('The spindle', 'तर्कु', 'ಕದಿರು') },
  ],
  parts: [
    { id: 'cell_membrane', group: 'cell', color: '#9fc3c8', name: t('Cell membrane', 'कोशिका झिल्ली', 'ಕೋಶಪೊರೆ'), info: t('Pinches in at the end to make two cells.', 'अंत में अंदर की ओर सिकुड़कर दो कोशिकाएँ बनाती है।', 'ಕೊನೆಯಲ್ಲಿ ಒಳಕ್ಕೆ ಕುಗ್ಗಿ ಎರಡು ಕೋಶಗಳನ್ನು ಮಾಡುತ್ತದೆ.') },
    { id: 'nucleus', group: 'cell', color: '#c9a8d8', name: t('Nucleus', 'केंद्रक', 'ಕೋಶಕೇಂದ್ರ'), info: t('Its membrane breaks down during division and forms again at the end.', 'विभाजन के समय इसकी झिल्ली टूट जाती है और अंत में फिर बनती है।', 'ವಿಭಜನೆಯ ಸಮಯದಲ್ಲಿ ಇದರ ಪೊರೆ ಒಡೆದು ಕೊನೆಯಲ್ಲಿ ಮತ್ತೆ ರೂಪುಗೊಳ್ಳುತ್ತದೆ.') },
    { id: 'chromatin', group: 'chromosomes', color: '#7f8fc0', name: t('Chromatin', 'क्रोमैटिन', 'ಕ್ರೊಮ್ಯಾಟಿನ್'), info: t('DNA in long, thin, loose threads, as it is between divisions.', 'लंबे, पतले, ढीले धागों के रूप में DNA, जैसा वह दो विभाजनों के बीच होता है।', 'ಎರಡು ವಿಭಜನೆಗಳ ನಡುವೆ ಇರುವಂತೆ ಉದ್ದ, ತೆಳು, ಸಡಿಲ ದಾರಗಳ ರೂಪದ DNA.') },
    { id: 'chromosomes', group: 'chromosomes', color: '#6a7fb5', name: t('Chromosomes', 'गुणसूत्र', 'ವರ್ಣತಂತುಗಳು'), info: t('Coiled up tightly so they can be moved without tangling.', 'कसकर कुंडलित, ताकि बिना उलझे हिलाए जा सकें।', 'ಸಿಕ್ಕಿಕೊಳ್ಳದೆ ಚಲಿಸುವಂತೆ ಬಿಗಿಯಾಗಿ ಸುರುಳಿಯಾಗಿವೆ.') },
    { id: 'chromatids', group: 'chromosomes', color: '#8fa0cf', name: t('Sister chromatids', 'सहोदर अर्धगुणसूत्र (क्रोमैटिड)', 'ಸಹೋದರಿ ಕ್ರೊಮಾಟಿಡ್‌ಗಳು'), info: t('The two identical copies of a chromosome.', 'एक गुणसूत्र की दो एक जैसी प्रतियाँ।', 'ಒಂದು ವರ್ಣತಂತುವಿನ ಎರಡು ಒಂದೇ ರೀತಿಯ ಪ್ರತಿಗಳು.') },
    { id: 'centromere', group: 'chromosomes', color: '#e3d6b0', name: t('Centromere', 'गुणसूत्र बिंदु (सेंट्रोमियर)', 'ಸೆಂಟ್ರೋಮಿಯರ್'), info: t('Where the two chromatids are joined, and where spindle fibres hold on.', 'जहाँ दोनों अर्धगुणसूत्र जुड़े होते हैं, और जहाँ तर्कु तंतु पकड़ते हैं।', 'ಎರಡು ಕ್ರೊಮಾಟಿಡ್‌ಗಳು ಸೇರುವ ಮತ್ತು ಕದಿರು ತಂತುಗಳು ಹಿಡಿಯುವ ಸ್ಥಳ.') },
    { id: 'centrosomes', group: 'spindle', color: '#e8c56a', name: t('Centrosomes', 'तारककाय (सेंट्रोसोम)', 'ಸೆಂಟ್ರೋಸೋಮ್‌ಗಳು'), info: t('They move to opposite ends of the cell and build the spindle.', 'ये कोशिका के विपरीत सिरों पर जाकर तर्कु बनाते हैं।', 'ಇವು ಕೋಶದ ವಿರುದ್ಧ ತುದಿಗಳಿಗೆ ಸರಿದು ಕದಿರನ್ನು ನಿರ್ಮಿಸುತ್ತವೆ.') },
    { id: 'spindle', group: 'spindle', color: '#cfe6c8', name: t('Spindle fibres', 'तर्कु तंतु', 'ಕದಿರು ತಂತುಗಳು'), info: t('Protein fibres that pull the chromatids apart.', 'प्रोटीन के तंतु जो अर्धगुणसूत्रों को अलग खींचते हैं।', 'ಕ್ರೊಮಾಟಿಡ್‌ಗಳನ್ನು ಬೇರ್ಪಡಿಸಿ ಎಳೆಯುವ ಪ್ರೋಟೀನ್ ತಂತುಗಳು.') },
    { id: 'equator', group: 'spindle', color: '#cfe6c8', name: t('Equator of the cell', 'कोशिका की मध्य रेखा', 'ಕೋಶದ ಮಧ್ಯರೇಖೆ'), info: t('The chromosomes line up across the middle.', 'गुणसूत्र बीच में एक पंक्ति में आते हैं।', 'ವರ್ಣತಂತುಗಳು ಮಧ್ಯದಲ್ಲಿ ಸಾಲಾಗುತ್ತವೆ.') },
    { id: 'furrow', group: 'cell', color: '#9fc3c8', name: t('Cleavage furrow', 'विदलन खाँच', 'ವಿದಳನ ತಗ್ಗು'), info: t('A ring that tightens round the middle of the cell.', 'एक वलय जो कोशिका के बीच में कसता जाता है।', 'ಕೋಶದ ಮಧ್ಯದ ಸುತ್ತ ಬಿಗಿಯಾಗುವ ಉಂಗುರ.') },
    { id: 'daughter_cells', group: 'cell', color: '#9fc3c8', name: t('Two daughter cells', 'दो संतति कोशिकाएँ', 'ಎರಡು ಮರಿಕೋಶಗಳು'), info: t('Each with the same chromosomes as the parent.', 'हर एक में जनक कोशिका जैसे ही गुणसूत्र।', 'ಪ್ರತಿಯೊಂದರಲ್ಲೂ ಮಾತೃಕೋಶದಂತೆಯೇ ವರ್ಣತಂತುಗಳು.') },
  ],
  steps: [
    {
      id: 'interphase', stage: 'cell', seconds: 13,
      camera: { pos: [1.6, 1.8, 13.5], target: [0, 0, 0], from: [3, 4, 22], drift: 0.03 },
      highlight: ['chromatin'], labels: ['cell_membrane', 'nucleus', 'chromatin', 'centrosomes'],
      title: t('Interphase: getting ready', 'अंतरावस्था: तैयारी', 'ಅಂತರಾವಸ್ಥೆ: ಸಿದ್ಧತೆ'),
      caption: t(
        'Before dividing, the cell grows and copies its DNA. The DNA is spread through the nucleus as long, thin threads called chromatin, too fine to see in a light microscope.',
        'विभाजन से पहले कोशिका बढ़ती है और अपने DNA की प्रतिलिपि बनाती है। DNA केंद्रक में क्रोमैटिन नामक लंबे, पतले धागों के रूप में फैला रहता है, जो साधारण सूक्ष्मदर्शी में दिखने के लिए बहुत बारीक हैं।',
        'ವಿಭಜನೆಗೆ ಮೊದಲು ಕೋಶ ಬೆಳೆದು ತನ್ನ DNA ನಕಲು ಮಾಡುತ್ತದೆ. DNA ಕೋಶಕೇಂದ್ರದಲ್ಲಿ ಕ್ರೊಮ್ಯಾಟಿನ್ ಎಂಬ ಉದ್ದ, ತೆಳು ದಾರಗಳಾಗಿ ಹರಡಿರುತ್ತದೆ; ಸಾಮಾನ್ಯ ಸೂಕ್ಷ್ಮದರ್ಶಕದಲ್ಲಿ ಕಾಣಲು ಅವು ತುಂಬಾ ಸೂಕ್ಷ್ಮ.',
      ),
    },
    {
      id: 'prophase', stage: 'cell', seconds: 14,
      camera: { pos: [0.6, 1.2, 10.5], target: [0, 0, 0], drift: 0.02 },
      highlight: ['chromosomes'], labels: ['chromosomes', 'chromatids', 'centromere', 'centrosomes'],
      title: t('Prophase', 'पूर्वावस्था (प्रोफ़ेज़)', 'ಪ್ರೊಫೇಸ್ (ಪೂರ್ವಾವಸ್ಥೆ)'),
      caption: t(
        'The chromatin coils up into short, thick chromosomes. Each is now two identical sister chromatids joined at a centromere. The nuclear membrane breaks down, and the centrosomes move apart.',
        'क्रोमैटिन कुंडलित होकर छोटे, मोटे गुणसूत्र बनाता है। हर गुणसूत्र अब दो एक जैसे सहोदर अर्धगुणसूत्रों से बना है, जो गुणसूत्र बिंदु पर जुड़े हैं। केंद्रक झिल्ली टूट जाती है और तारककाय अलग होते हैं।',
        'ಕ್ರೊಮ್ಯಾಟಿನ್ ಸುರುಳಿಯಾಗಿ ಚಿಕ್ಕ, ದಪ್ಪ ವರ್ಣತಂತುಗಳಾಗುತ್ತದೆ. ಪ್ರತಿಯೊಂದೂ ಈಗ ಸೆಂಟ್ರೋಮಿಯರ್‌ನಲ್ಲಿ ಸೇರಿದ ಎರಡು ಒಂದೇ ರೀತಿಯ ಸಹೋದರಿ ಕ್ರೊಮಾಟಿಡ್‌ಗಳು. ಕೋಶಕೇಂದ್ರ ಪೊರೆ ಒಡೆಯುತ್ತದೆ, ಸೆಂಟ್ರೋಸೋಮ್‌ಗಳು ದೂರ ಸರಿಯುತ್ತವೆ.',
      ),
    },
    {
      id: 'metaphase', stage: 'cell', seconds: 13,
      camera: { pos: [-1.2, 1.0, 10.8], target: [0, 0, 0], drift: -0.02 },
      highlight: ['spindle'], labels: ['spindle', 'centrosomes', 'equator', 'centromere'],
      title: t('Metaphase', 'मध्यावस्था (मेटाफ़ेज़)', 'ಮೆಟಾಫೇಸ್ (ಮಧ್ಯಾವಸ್ಥೆ)'),
      caption: t(
        'Spindle fibres from the two poles fasten onto each centromere and pull the chromosomes into a single line across the middle of the cell, its equator.',
        'दोनों ध्रुवों से निकले तर्कु तंतु हर गुणसूत्र बिंदु को पकड़ते हैं और गुणसूत्रों को कोशिका के बीच, उसकी मध्य रेखा पर, एक पंक्ति में ले आते हैं।',
        'ಎರಡು ಧ್ರುವಗಳಿಂದ ಬರುವ ಕದಿರು ತಂತುಗಳು ಪ್ರತಿ ಸೆಂಟ್ರೋಮಿಯರ್ ಅನ್ನು ಹಿಡಿದು ವರ್ಣತಂತುಗಳನ್ನು ಕೋಶದ ಮಧ್ಯರೇಖೆಯಲ್ಲಿ ಒಂದೇ ಸಾಲಿಗೆ ತರುತ್ತವೆ.',
      ),
    },
    {
      id: 'anaphase', stage: 'cell', seconds: 13,
      camera: { pos: [0.8, 2.4, 11.2], target: [0, 0, 0], drift: 0.02 },
      highlight: ['chromatids'], labels: ['chromatids', 'spindle', 'centrosomes'],
      title: t('Anaphase', 'पश्चावस्था (एनाफ़ेज़)', 'ಅನಾಫೇಸ್ (ಪಶ್ಚಾವಸ್ಥೆ)'),
      caption: t(
        'The centromeres split, and the spindle fibres shorten, pulling the sister chromatids apart to opposite poles. Each side gets one complete set.',
        'गुणसूत्र बिंदु विभाजित होते हैं और तर्कु तंतु छोटे होकर सहोदर अर्धगुणसूत्रों को विपरीत ध्रुवों की ओर खींचते हैं। हर ओर एक पूरा समूह पहुँचता है।',
        'ಸೆಂಟ್ರೋಮಿಯರ್‌ಗಳು ಬೇರ್ಪಡುತ್ತವೆ; ಕದಿರು ತಂತುಗಳು ಮೊಟಕಾಗಿ ಸಹೋದರಿ ಕ್ರೊಮಾಟಿಡ್‌ಗಳನ್ನು ವಿರುದ್ಧ ಧ್ರುವಗಳಿಗೆ ಎಳೆಯುತ್ತವೆ. ಪ್ರತಿ ಬದಿಗೆ ಒಂದು ಪೂರ್ಣ ಗುಂಪು ಸಿಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'telophase', stage: 'cell', seconds: 13,
      camera: { pos: [-0.8, 1.6, 12.4], target: [0, 0, 0], drift: -0.02 },
      highlight: ['nucleus'], labels: ['nucleus', 'chromatin', 'furrow'],
      title: t('Telophase', 'अंत्यावस्था (टीलोफ़ेज़)', 'ಟೆಲೋಫೇಸ್ (ಅಂತ್ಯಾವಸ್ಥೆ)'),
      caption: t(
        'At each pole a new nuclear membrane forms round the chromosomes, which uncoil into chromatin again. The spindle disappears.',
        'हर ध्रुव पर गुणसूत्रों के चारों ओर नई केंद्रक झिल्ली बनती है, और वे फिर से खुलकर क्रोमैटिन बन जाते हैं। तर्कु गायब हो जाता है।',
        'ಪ್ರತಿ ಧ್ರುವದಲ್ಲಿ ವರ್ಣತಂತುಗಳ ಸುತ್ತ ಹೊಸ ಕೋಶಕೇಂದ್ರ ಪೊರೆ ರೂಪುಗೊಳ್ಳುತ್ತದೆ; ಅವು ಮತ್ತೆ ಬಿಚ್ಚಿಕೊಂಡು ಕ್ರೊಮ್ಯಾಟಿನ್ ಆಗುತ್ತವೆ. ಕದಿರು ಮಾಯವಾಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'cytokinesis', stage: 'cell', seconds: 13,
      camera: { pos: [1.4, 3.0, 13.4], target: [0, 0, 0], drift: 0.02 },
      highlight: ['furrow'], labels: ['furrow', 'cell_membrane', 'nucleus'],
      title: t('Cytokinesis', 'कोशिकाद्रव्य विभाजन', 'ಸೈಟೋಕೈನೆಸಿಸ್ (ಕೋಶದ್ರವ್ಯ ವಿಭಜನೆ)'),
      caption: t(
        'In an animal cell, a ring round the middle tightens and pinches the cell in two. A plant cell, with its stiff wall, builds a new wall, the cell plate, across the middle instead.',
        'जंतु कोशिका में बीच का एक वलय कसकर कोशिका को दो भागों में बाँट देता है। पादप कोशिका, अपनी कठोर भित्ति के कारण, इसके बजाय बीच में एक नई भित्ति, कोशिका पट्टिका, बनाती है।',
        'ಪ್ರಾಣಿ ಕೋಶದಲ್ಲಿ ಮಧ್ಯದ ಉಂಗುರವೊಂದು ಬಿಗಿಯಾಗಿ ಕೋಶವನ್ನು ಎರಡಾಗಿ ಹಿಸುಕುತ್ತದೆ. ಗಟ್ಟಿ ಭಿತ್ತಿಯಿರುವ ಸಸ್ಯ ಕೋಶ ಇದರ ಬದಲು ಮಧ್ಯದಲ್ಲಿ ಕೋಶ ಫಲಕ ಎಂಬ ಹೊಸ ಭಿತ್ತಿಯನ್ನು ಕಟ್ಟುತ್ತದೆ.',
      ),
    },
    {
      id: 'result', stage: 'cell', seconds: 12,
      camera: { pos: [-2.0, 2.2, 15.0], target: [0, 0, 0], drift: -0.03 },
      highlight: ['daughter_cells'], labels: ['daughter_cells', 'nucleus'],
      title: t('Two identical cells', 'दो एक जैसी कोशिकाएँ', 'ಎರಡು ಒಂದೇ ರೀತಿಯ ಕೋಶಗಳು'),
      caption: t(
        'The result is two daughter cells with exactly the same chromosomes as the parent cell. This is how the body grows and repairs itself.',
        'परिणाम दो संतति कोशिकाएँ हैं जिनमें ठीक वैसे ही गुणसूत्र हैं जैसे जनक कोशिका में थे। इसी तरह शरीर बढ़ता है और अपनी मरम्मत करता है।',
        'ಫಲಿತಾಂಶ ಮಾತೃಕೋಶದಲ್ಲಿದ್ದಂತೆಯೇ ವರ್ಣತಂತುಗಳಿರುವ ಎರಡು ಮರಿಕೋಶಗಳು. ದೇಹ ಹೀಗೆಯೇ ಬೆಳೆಯುತ್ತದೆ ಮತ್ತು ತನ್ನನ್ನು ದುರಸ್ತಿ ಮಾಡಿಕೊಳ್ಳುತ್ತದೆ.',
      ),
    },
  ],
};

const ORDER = ['interphase', 'prophase', 'metaphase', 'anaphase', 'telophase', 'cytokinesis', 'result'];
const R = 3.1; // the cell's radius
const POLE = 3.0;
const span = (x, a, b) => smooth(clamp01((x - a) / (b - a)));

/** A chromatid along y, centromere at 0: arms [up] and [down] long, bent back by the morph into a V. */
function chromatidGeometry(up, down, r) {
  const pts = [], n = 10;
  for (let i = 0; i <= n; i++) {
    const y = lerp(-down, up, i / n);
    pts.push([0.04 * Math.sin(i * 1.3), y, 0.03 * Math.cos(i * 0.9)]);
  }
  // Coiled surface: a fine ridge round the rod, as chromosomes look under the microscope.
  const radius = (u) => {
    const y = lerp(-down, up, u);
    const pinch = 1 - 0.4 * Math.exp(-((y / 0.12) ** 2));
    const tip = Math.min(1, (1 - Math.abs(u * 2 - 1)) * 6 + 0.35);
    return r * pinch * Math.sqrt(Math.min(1, tip)) * (1 + 0.07 * Math.sin(u * (up + down) * 38));
  };
  const g = tube(pts, radius, { segments: 56, radial: 14 });
  // The morph: arms swing back (to −x) the further they are from the centromere, a V pulled by its point.
  const p = g.attributes.position;
  const bent = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.min(1.25, Math.abs(y) * 0.9);
    bent[i * 3] = x * Math.cos(a) - Math.abs(y) * Math.sin(a) * 0.95;
    bent[i * 3 + 1] = Math.sign(y) * (Math.abs(y) * Math.cos(a) + x * Math.sin(a) * 0.3);
    bent[i * 3 + 2] = z;
  }
  g.morphAttributes.position = [new THREE.Float32BufferAttribute(bent, 3)];
  return g;
}

export async function build(k) {
  const stage = k.stage('cell');
  const rnd = seeded(401);

  // The cell membrane: a glassy sphere that stretches and pinches.
  const memGeo = new THREE.SphereGeometry(1, 96, 64);
  const base = memGeo.attributes.position.array.slice();
  const memMat = mat({ color: '#9fc3c8', rough: 0.2, clearcoat: 0.8, clearcoatRough: 0.1, sheen: 0.3, rim: 0.7, rimColor: '#d8f4f4', rimPower: 2.2, opacity: 0.2 });
  memMat.userData.noClip = false;
  const membrane = new THREE.Mesh(memGeo, memMat);
  membrane.renderOrder = 2;
  stage.add(membrane);
  k.part('cell_membrane', membrane, { anchor: [R * 0.5, R * 0.86, 0.4] });
  const shape = { stretch: 1, pinch: 0 };
  const radiusAt = (x) => 1 - shape.pinch * 0.97 * Math.exp(-((x / 0.5) ** 2));
  const reshape = () => {
    const p = memGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
      const X = x * R * shape.stretch;
      const r = radiusAt(X / shape.stretch / R * 1.6);
      // Lobes stay round as the waist tightens: push the halves apart a little.
      const push = shape.pinch * 0.35 * Math.sign(x) * R;
      p.setXYZ(i, X + push * Math.abs(x) ** 0.5, y * R * r, z * R * r);
    }
    p.needsUpdate = true;
    memGeo.computeVertexNormals();
  };
  k.marker('furrow', stage, (out) => out.set(0, R * radiusAt(0) * 0.98, 0.6), 0.25);
  k.marker('daughter_cells', stage, (out) => out.set(-R * shape.stretch * 0.7, R * 0.75, 0.6), 0.3);

  // A few organelles in the cytoplasm, soft and out of the way.
  const organelles = new THREE.Group();
  const mitoMat = mat({ color: '#b97a5e', rough: 0.5, clearcoat: 0.3, sheen: 0.3, rim: 0.15 });
  const organelleHome = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(blob(0.42, 0.16, 0.17, { detail: 12, amp: 0.02, seed: i }), mitoMat);
    const a = rnd() * Math.PI * 2, b = (rnd() - 0.5) * 2;
    const p = new THREE.Vector3(Math.cos(a) * 2.3, b * 1.6, Math.sin(a) * 2.0);
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    organelles.add(m);
    organelleHome.push(p);
  }
  organelles.traverse((o) => (o.userData.decor = true));
  stage.add(organelles);

  // The nucleus (and the two that form at the end).
  const envMat = mat({ color: '#c9a8d8', rough: 0.3, clearcoat: 0.6, sheen: 0.4, rim: 0.5, rimColor: '#f0e0ff', opacity: 0.32 });
  const envGeo = blob(1.55, 1.45, 1.5, { detail: 36, amp: 0.03, seed: 2 });
  const nuclei = [new THREE.Mesh(envGeo, envMat), new THREE.Mesh(envGeo, envMat.clone()), new THREE.Mesh(envGeo, envMat.clone())];
  const nucGroup = new THREE.Group();
  nucGroup.add(...nuclei);
  stage.add(nucGroup);
  k.part('nucleus', nucGroup, { anchor: () => (nuclei[0].visible ? new THREE.Vector3(1.0, 1.1, 0.4) : nuclei[1].position.clone().add({ x: 0, y: 0.9, z: 0.4 })) });
  const nucleolus = new THREE.Mesh(blob(0.42, 0.38, 0.4, { detail: 16, amp: 0.05, seed: 6 }), mat({ color: '#6c4f86', rough: 0.6, sheen: 0.3, rim: 0.1 }));
  nucleolus.position.set(0.5, 0.35, -0.3);
  stage.add(nucleolus);

  // Chromosomes: two pairs (a long and a short), each homologue a shade apart; each two chromatids.
  const kinds = [
    { up: 0.95, down: 0.75, color: '#6a7fb5' },
    { up: 0.95, down: 0.75, color: '#8fa0cf' },
    { up: 0.55, down: 0.4, color: '#b46b5a' },
    { up: 0.55, down: 0.4, color: '#d08d78' },
  ];
  const chromMat = (c) => mat({ color: c, rough: 0.55, clearcoat: 0.25, sheen: 0.5, sheenColor: C(c).lerp(C('#ffffff'), 0.4), rim: 0.18 });
  const chromosomes = new THREE.Group();
  const chromos = kinds.map((kd, i) => {
    const geo = chromatidGeometry(kd.up, kd.down, 0.15);
    const m = chromMat(kd.color);
    const sisters = [new THREE.Mesh(geo, m), new THREE.Mesh(geo, m)];
    sisters[1].scale.x = -1; // the mirror copy faces the other pole
    const centromere = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), mat({ color: '#e3d6b0', rough: 0.4, rim: 0.2 }));
    const g = new THREE.Group();
    g.add(...sisters, centromere);
    chromosomes.add(g);
    // Where it sits at random in the nucleus, and its place on the equator.
    const home = new THREE.Vector3((rnd() - 0.5) * 1.4, (rnd() - 0.5) * 1.3, (rnd() - 0.5) * 1.1);
    const plate = new THREE.Vector3(0, [1.35, 0.45, -0.45, -1.3][i], [0.25, -0.2, 0.3, -0.15][i]);
    const tilt = new THREE.Euler(rnd() * 2, rnd() * 2, rnd() * 2);
    return { g, sisters, centromere, home, plate, tilt };
  });
  stage.add(chromosomes);
  k.part('chromosomes', chromosomes, { anchor: () => chromos[0].g.position.clone().add({ x: 0, y: 0.6, z: 0.3 }) });
  const chromatidAt = new THREE.Vector3(), centroAt = new THREE.Vector3();
  k.marker('chromatids', stage, (out) => out.copy(chromatidAt), 0.2);
  k.marker('centromere', stage, (out) => out.copy(centroAt), 0.15);

  // Chromatin: long, fine threads wandering through the nucleus, in the chromosomes' colours.
  const chromatin = new THREE.Group();
  const threads = [];
  kinds.forEach((kd, i) => {
    for (let j = 0; j < 2; j++) {
      const pts = [];
      const p = chromos[i].home.clone();
      for (let n = 0; n < 34; n++) {
        p.add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.55));
        if (p.length() > 1.2) p.multiplyScalar(1.1 / p.length());
        pts.push(p.clone());
      }
      const m = new THREE.Mesh(tube(curve(pts), 0.028, { segments: 220, radial: 5 }), mat({ color: kd.color, rough: 0.5, rim: 0.15, opacity: 1 }));
      m.material.transparent = true;
      chromatin.add(m);
      threads.push(m);
    }
  });
  // The same threads again for the two new nuclei.
  const chromatinL = chromatin.clone(true), chromatinR = chromatin.clone(true);
  for (const g of [chromatinL, chromatinR]) g.traverse((o) => o.material && (o.material = o.material.clone()));
  stage.add(chromatin, chromatinL, chromatinR);
  k.part('chromatin', chromatin, { anchor: () => (chromatin.visible ? new THREE.Vector3(-0.6, 0.5, 0.9) : chromatinL.position.clone().add({ x: 0, y: 0.4, z: 0.8 })) });
  const setOpacity = (g, a) => {
    g.visible = a > 0.01;
    g.traverse((o) => {
      if (o.material) {
        o.material.opacity = a;
        o.material.depthWrite = a > 0.95;
      }
    });
  };

  // Centrosomes: a pair of centrioles at right angles, with a star of short fibres.
  const centMat = mat({ color: '#e8c56a', rough: 0.4, clearcoat: 0.5, rim: 0.2, emissive: '#3a2a08' });
  const fibreMat = new THREE.MeshBasicMaterial({ color: '#cfe6c8', transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
  const centrosomes = [0, 1].map(() => {
    const g = new THREE.Group();
    const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 18), centMat);
    const c2 = c1.clone();
    c2.rotation.x = Math.PI / 2;
    c2.position.set(0.12, 0, 0);
    g.add(c1, c2);
    const aster = new THREE.Group();
    for (let i = 0; i < 18; i++) {
      const d = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      aster.add(new THREE.Mesh(tube([d.clone().multiplyScalar(0.2), d.clone().multiplyScalar(0.55 + rnd() * 0.3)], 0.01, { segments: 2, radial: 4, caps: false }), fibreMat));
    }
    g.add(aster);
    g.userData.aster = aster;
    stage.add(g);
    return g;
  });
  k.part('centrosomes', centrosomes[0], { anchor: () => centrosomes[0].position.clone().add({ x: 0, y: 0.35, z: 0 }) });

  // Spindle fibres: from each pole to each centromere, and some passing pole to pole. Rebuilt as lines each frame.
  const nFib = chromos.length * 2 + 10;
  const fibGeo = new THREE.BufferGeometry();
  const segs = 12;
  const fibPos = new Float32Array(nFib * segs * 2 * 3);
  fibGeo.setAttribute('position', new THREE.BufferAttribute(fibPos, 3).setUsage(THREE.DynamicDrawUsage));
  const spindle = new THREE.LineSegments(fibGeo, new THREE.LineBasicMaterial({ color: '#cfe6c8', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
  spindle.frustumCulled = false;
  stage.add(spindle);
  // Lines are hard to tap; a soft lens-shaped hull marks the spindle for labels and the laser.
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ visible: false }));
  stage.add(hull);
  k.part('spindle', hull, { anchor: () => new THREE.Vector3(-1.4, 0.95, 0.3) });
  k.marker('equator', stage, (out) => out.set(0, -1.9, 0.5), 0.2);
  const fiberPts = [];

  const v = new THREE.Vector3(), a3 = new THREE.Vector3(), b3 = new THREE.Vector3(), e = new THREE.Euler();
  return {
    update: (s) => {
      const T = s.T;
      const P = Math.max(0, ORDER.indexOf(s.id)) + s.u;
      const condense = span(P, 1.05, 1.75);
      const envelopeGone = span(P, 1.4, 1.95);
      const congress = span(P, 2.0, 2.6);
      const split = span(P, 3.05, 3.85);
      const reform = span(P, 4.1, 4.7);
      const decondense = span(P, 4.3, 4.95);
      const spindleOn = span(P, 1.5, 2.1) * (1 - span(P, 4.5, 4.95));
      shape.stretch = 1 + 0.28 * span(P, 3.2, 4.6);
      shape.pinch = span(P, 4.5, 5.85);
      reshape();
      const pole = POLE * (0.15 + 0.85 * span(P, 1.0, 1.9)) + 0.6 * span(P, 3.2, 4.4);
      const daughterX = 2.4 + 0.6 * span(P, 4.2, 5.8);

      // Organelles drift, and go with whichever half they are in.
      organelles.children.forEach((m, i) => {
        const h = organelleHome[i];
        m.position.set(h.x * shape.stretch + Math.sign(h.x) * shape.pinch * 0.8, h.y * (1 - 0.15 * shape.pinch), h.z);
        m.rotation.y = T * 0.05 + i;
      });

      // Nucleus: one, fading out in prophase; two forming in telophase.
      nuclei[0].visible = envelopeGone < 0.99;
      nuclei[0].material.opacity = 0.32 * (1 - envelopeGone);
      nuclei[0].scale.setScalar(1 + 0.15 * envelopeGone);
      nucleolus.visible = envelopeGone < 0.6;
      nucleolus.scale.setScalar(1 - envelopeGone);
      for (const [i, side] of [[1, -1], [2, 1]]) {
        nuclei[i].visible = reform > 0.01;
        nuclei[i].material.opacity = 0.32 * reform;
        nuclei[i].position.set(side * daughterX, 0, 0);
        nuclei[i].scale.setScalar(0.62 * lerp(0.6, 1, reform));
      }
      setOpacity(chromatin, 1 - condense);
      for (const [g, side] of [[chromatinL, -1], [chromatinR, 1]]) {
        setOpacity(g, decondense);
        g.position.set(side * daughterX, 0, 0);
        g.scale.setScalar(0.6);
      }

      // Chromosomes: condense, gather on the equator, split into chromatids, fade into chromatin.
      chromos.forEach((c, i) => {
        const show = condense * (1 - decondense);
        c.g.visible = show > 0.01;
        c.g.scale.setScalar(lerp(0.35, 1, condense) * lerp(1, 0.7, decondense));
        v.copy(c.home).lerp(c.plate, congress);
        c.g.position.copy(v);
        e.set(c.tilt.x * (1 - congress), c.tilt.y * (1 - congress), c.tilt.z * (1 - congress));
        c.g.quaternion.setFromEuler(e);
        // Sisters: side by side, then pulled to opposite poles, trailing their arms.
        const gap = 0.14 + split * (pole - 0.45);
        c.sisters[0].position.set(gap, 0, 0);
        c.sisters[1].position.set(-gap, 0, 0);
        const bend = split * (1 - decondense * 0.5);
        c.sisters[0].morphTargetInfluences[0] = bend;
        c.sisters[1].morphTargetInfluences[0] = bend;
        c.centromere.visible = split < 0.05;
        if (i === 0) {
          c.sisters[0].getWorldPosition(chromatidAt);
          chromatidAt.y += 0.5;
          c.centromere.getWorldPosition(centroAt);
        }
      });
      chromosomes.visible = condense > 0.01 && decondense < 0.99;

      // Centrosomes: from beside the nucleus round to opposite poles.
      const ang = Math.PI * (1 - span(P, 1.0, 1.9));
      centrosomes.forEach((g, i) => {
        const side = i ? 1 : -1;
        if (P < 1) g.position.set(side * 0.25 + 0.2, 1.75, 0.2);
        else g.position.set(side * pole, (1.75 * (Math.sin(ang * 0.5))) * (1 - span(P, 1.0, 1.9)), 0.2);
        if (P >= 4.4) g.position.x = side * daughterX + side * 0.9 * (1 - span(P, 4.4, 5.2));
        g.rotation.set(T * 0.2, T * 0.3 + i, 0);
        g.userData.aster.scale.setScalar(0.7 + 0.8 * spindleOn);
      });

      // Spindle fibres.
      fiberPts.length = 0;
      const poles = [centrosomes[0].position, centrosomes[1].position];
      if (spindleOn > 0.01) {
        chromos.forEach((c) => {
          c.sisters[0].getWorldPosition(a3);
          c.sisters[1].getWorldPosition(b3);
          // Each chromatid's fibre runs to the pole on its own side.
          fiberPts.push([poles[1], a3.clone()], [poles[0], b3.clone()]);
        });
        for (let i = 0; i < 10; i++) {
          const y = (i - 4.5) * 0.32, z = Math.sin(i * 1.7) * 0.6;
          fiberPts.push([poles[0], new THREE.Vector3(0, y * 1.1, z), poles[1]]);
        }
      }
      let n = 0;
      for (const f of fiberPts) {
        const c = f.length === 3 ? new THREE.QuadraticBezierCurve3(f[0], f[1], f[2]) : new THREE.LineCurve3(f[0], f[1]);
        for (let j = 0; j < segs; j++) {
          c.getPoint(j / segs, a3);
          c.getPoint((j + 1) / segs, b3);
          fibPos.set([a3.x, a3.y, a3.z, b3.x, b3.y, b3.z], n * 6);
          n++;
        }
      }
      fibGeo.setDrawRange(0, n * 2);
      fibGeo.attributes.position.needsUpdate = true;
      spindle.material.opacity = 0.55 * spindleOn;
      spindle.visible = spindleOn > 0.01;
      hull.scale.set(Math.max(0.5, pole), 1.6, 1.0);
      hull.visible = spindleOn > 0.3;
    },
  };
}
