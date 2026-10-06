// DNA replication: from a chromosome down to the double helix, its base
// pairs, helicase unzipping it, DNA polymerase building a new strand on each
// old one, and the two identical, semi-conservative copies. Built in code.
import { THREE, seeded, mat, tube, curve, smooth, lerp, clamp01, GlowPoints, blob, atomCluster } from './kit.js';
import { C, glowProtein } from './bio.js';
import { Nucleotides, PAIR, BACKBONE, RISE, R, strandQuat, sequence } from './dnakit.js';

const t = (en, hi, kn) => ({ en, hi, kn });

export const script = {
  id: 'dna_replication',
  subject: 'Biology',
  classes: [10, 12],
  thumb: { step: 'copy', u: 0.6 },
  title: t('DNA and how it is copied', 'DNA और उसकी प्रतिलिपि', 'DNA ಮತ್ತು ಅದರ ನಕಲು'),
  summary: t(
    'From a chromosome down to the double helix and its base pairs, then how the cell copies its DNA: unzipping, matching bases, and two identical molecules.',
    'गुणसूत्र से द्विकुंडली और उसके क्षारक युग्मों तक, फिर कोशिका अपने DNA की प्रतिलिपि कैसे बनाती है: खुलना, क्षारकों का मिलान, और दो एक जैसे अणु।',
    'ವರ್ಣತಂತುವಿನಿಂದ ದ್ವಿಸುರುಳಿ ಮತ್ತು ಅದರ ಪ್ರತ್ಯಾಮ್ಲ ಜೋಡಿಗಳವರೆಗೆ, ನಂತರ ಕೋಶ ತನ್ನ DNA ಅನ್ನು ಹೇಗೆ ನಕಲು ಮಾಡುತ್ತದೆ: ಬಿಚ್ಚುವಿಕೆ, ಪ್ರತ್ಯಾಮ್ಲಗಳ ಹೊಂದಾಣಿಕೆ, ಮತ್ತು ಎರಡು ಒಂದೇ ರೀತಿಯ ಅಣುಗಳು.',
  ),
  keywords: ['DNA', 'DNA replication', 'double helix', 'base pairs', 'adenine', 'thymine', 'guanine', 'cytosine', 'helicase', 'DNA polymerase', 'nucleotides', 'chromosome', 'histones', 'heredity', 'semi-conservative'],
  credit: 'Model built by KINETIX',
  look: {
    background: ['#1e2128', '#07080b'],
    keyAt: [3, 6, 7],
    envTop: '#2c3038',
    stages: { chromosome: { fog: [10, 26] }, dna: { fog: [14, 34] } },
  },
  groups: [
    { id: 'packing', name: t('How DNA is packed', 'DNA कैसे समाया रहता है', 'DNA ಹೇಗೆ ಅಡಕವಾಗಿದೆ') },
    { id: 'helix', name: t('The double helix', 'द्विकुंडली', 'ದ್ವಿಸುರುಳಿ') },
    { id: 'copying', name: t('Copying', 'प्रतिलिपि बनाना', 'ನಕಲು ಮಾಡುವುದು') },
  ],
  parts: [
    { id: 'chromosome', group: 'packing', color: '#6a7fb5', name: t('Chromosome', 'गुणसूत्र', 'ವರ್ಣತಂತು'), info: t('One long DNA molecule, tightly coiled.', 'एक लंबा DNA अणु, कसकर कुंडलित।', 'ಬಿಗಿಯಾಗಿ ಸುರುಳಿಯಾದ ಒಂದು ಉದ್ದ DNA ಅಣು.') },
    { id: 'histones', group: 'packing', color: '#b9a0c8', name: t('Histones', 'हिस्टोन', 'ಹಿಸ್ಟೋನ್‌ಗಳು'), info: t('Proteins the DNA winds round, like thread on a spool.', 'प्रोटीन जिन पर DNA धागे की रील की तरह लिपटा रहता है।', 'ದಾರದ ಉಂಡೆಯಂತೆ DNA ಸುತ್ತಿಕೊಳ್ಳುವ ಪ್ರೋಟೀನ್‌ಗಳು.') },
    { id: 'dna', group: 'packing', color: '#c99a5a', name: t('DNA', 'DNA', 'DNA'), info: t('Deoxyribonucleic acid, which carries the instructions of heredity.', 'डीऑक्सीराइबोन्यूक्लिक अम्ल, जो आनुवंशिकता के निर्देश रखता है।', 'ಆನುವಂಶಿಕತೆಯ ಸೂಚನೆಗಳನ್ನು ಹೊಂದಿರುವ ಡಿಆಕ್ಸಿರೈಬೋನ್ಯೂಕ್ಲಿಕ್ ಆಮ್ಲ.') },
    { id: 'backbone', group: 'helix', color: '#c99a5a', name: t('Sugar–phosphate backbone', 'शर्करा-फ़ॉस्फ़ेट आधार', 'ಸಕ್ಕರೆ-ಫಾಸ್ಫೇಟ್ ಬೆನ್ನೆಲುಬು'), info: t('The sides of the ladder: sugar and phosphate in turn.', 'सीढ़ी की दोनों भुजाएँ: बारी-बारी से शर्करा और फ़ॉस्फ़ेट।', 'ಏಣಿಯ ಬದಿಗಳು: ಸರದಿಯಲ್ಲಿ ಸಕ್ಕರೆ ಮತ್ತು ಫಾಸ್ಫೇಟ್.') },
    { id: 'adenine', group: 'helix', color: '#c8594f', name: t('Adenine (A)', 'एडेनीन (A)', 'ಅಡೆನಿನ್ (A)'), info: t('Always pairs with thymine.', 'हमेशा थाइमीन से जुड़ता है।', 'ಯಾವಾಗಲೂ ಥೈಮಿನ್ ಜೊತೆ ಜೋಡಿಯಾಗುತ್ತದೆ.') },
    { id: 'thymine', group: 'helix', color: '#d9b44a', name: t('Thymine (T)', 'थाइमीन (T)', 'ಥೈಮಿನ್ (T)'), info: t('Always pairs with adenine.', 'हमेशा एडेनीन से जुड़ता है।', 'ಯಾವಾಗಲೂ ಅಡೆನಿನ್ ಜೊತೆ ಜೋಡಿಯಾಗುತ್ತದೆ.') },
    { id: 'guanine', group: 'helix', color: '#4f8a6b', name: t('Guanine (G)', 'ग्वानीन (G)', 'ಗ್ವಾನಿನ್ (G)'), info: t('Always pairs with cytosine.', 'हमेशा साइटोसीन से जुड़ता है।', 'ಯಾವಾಗಲೂ ಸೈಟೋಸಿನ್ ಜೊತೆ ಜೋಡಿಯಾಗುತ್ತದೆ.') },
    { id: 'cytosine', group: 'helix', color: '#4f74a8', name: t('Cytosine (C)', 'साइटोसीन (C)', 'ಸೈಟೋಸಿನ್ (C)'), info: t('Always pairs with guanine.', 'हमेशा ग्वानीन से जुड़ता है।', 'ಯಾವಾಗಲೂ ಗ್ವಾನಿನ್ ಜೊತೆ ಜೋಡಿಯಾಗುತ್ತದೆ.') },
    { id: 'helicase', group: 'copying', color: '#b07a50', name: t('Helicase', 'हेलिकेज़', 'ಹೆಲಿಕೇಸ್'), info: t('The enzyme that unzips the helix.', 'वह एंज़ाइम जो कुंडली को खोलता है।', 'ಸುರುಳಿಯನ್ನು ಬಿಚ್ಚುವ ಕಿಣ್ವ.') },
    { id: 'polymerase', group: 'copying', color: '#6f8fbf', name: t('DNA polymerase', 'DNA पॉलिमरेज़', 'DNA ಪಾಲಿಮರೇಸ್'), info: t('The enzyme that builds the new strand.', 'वह एंज़ाइम जो नई लड़ी बनाता है।', 'ಹೊಸ ಎಳೆಯನ್ನು ನಿರ್ಮಿಸುವ ಕಿಣ್ವ.') },
    { id: 'nucleotides', group: 'copying', color: '#8fb3d9', name: t('Free nucleotides', 'मुक्त न्यूक्लियोटाइड', 'ಮುಕ್ತ ನ್ಯೂಕ್ಲಿಯೋಟೈಡ್‌ಗಳು'), info: t('The building blocks of the new strand.', 'नई लड़ी की निर्माण इकाइयाँ।', 'ಹೊಸ ಎಳೆಯ ನಿರ್ಮಾಣ ಘಟಕಗಳು.') },
    { id: 'old_strand', group: 'copying', color: '#c99a5a', name: t('Old strand (template)', 'पुरानी लड़ी (साँचा)', 'ಹಳೆಯ ಎಳೆ (ಮಾದರಿ)'), info: t('Its bases decide the order of the new ones.', 'इसके क्षारक नई लड़ी के क्षारकों का क्रम तय करते हैं।', 'ಇದರ ಪ್ರತ್ಯಾಮ್ಲಗಳು ಹೊಸವುಗಳ ಕ್ರಮವನ್ನು ನಿರ್ಧರಿಸುತ್ತವೆ.') },
    { id: 'new_strand', group: 'copying', color: '#8fb3d9', name: t('New strand', 'नई लड़ी', 'ಹೊಸ ಎಳೆ'), info: t('Built to match the old one.', 'पुरानी लड़ी से मेल खाती हुई बनी।', 'ಹಳೆಯದಕ್ಕೆ ಹೊಂದುವಂತೆ ನಿರ್ಮಿತ.') },
  ],
  steps: [
    {
      id: 'chromosome', stage: 'chromosome', seconds: 13,
      camera: { pos: [1.4, 1.2, 10.5], target: [0.6, 0, 0], from: [3, 3, 18], drift: 0.03 },
      highlight: ['histones'], labels: ['chromosome', 'histones', 'dna'],
      title: t('Inside a chromosome', 'गुणसूत्र के अंदर', 'ವರ್ಣತಂತುವಿನ ಒಳಗೆ'),
      caption: t(
        'A chromosome is one very long molecule of DNA, wound round proteins called histones and coiled again and again. Unwound, the DNA in just one of your cells would stretch about two metres.',
        'गुणसूत्र DNA का एक बहुत लंबा अणु है, जो हिस्टोन नामक प्रोटीन पर लिपटा और बार-बार कुंडलित होता है। खोलने पर आपकी केवल एक कोशिका का DNA लगभग दो मीटर लंबा होगा।',
        'ವರ್ಣತಂತು DNAಯ ಒಂದು ಬಹಳ ಉದ್ದದ ಅಣು; ಹಿಸ್ಟೋನ್ ಎಂಬ ಪ್ರೋಟೀನ್‌ಗಳ ಸುತ್ತ ಸುತ್ತಿ ಮತ್ತೆ ಮತ್ತೆ ಸುರುಳಿಯಾಗಿದೆ. ಬಿಚ್ಚಿದರೆ ನಿಮ್ಮ ಒಂದೇ ಕೋಶದ DNA ಸುಮಾರು ಎರಡು ಮೀಟರ್ ಉದ್ದವಾಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'helix', stage: 'dna', seconds: 15,
      camera: { pos: [1.6, 2.2, 13.0], target: [1.4, 0, 0], from: [0, 3, 20], drift: 0.03 },
      highlight: ['backbone'], labels: ['backbone', 'adenine', 'thymine', 'guanine', 'cytosine'],
      title: t('The double helix', 'द्विकुंडली', 'ದ್ವಿಸುರುಳಿ'),
      caption: t(
        'DNA is a double helix: two strands twisted round each other like a spiral ladder. The sides are sugar and phosphate; the rungs are pairs of bases. Adenine always pairs with thymine, and guanine with cytosine.',
        'DNA एक द्विकुंडली है: दो लड़ियाँ एक-दूसरे के चारों ओर घुमावदार सीढ़ी की तरह लिपटी हुई। भुजाएँ शर्करा और फ़ॉस्फ़ेट की हैं; डंडे क्षारकों के युग्म हैं। एडेनीन हमेशा थाइमीन से, और ग्वानीन साइटोसीन से जुड़ता है।',
        'DNA ಒಂದು ದ್ವಿಸುರುಳಿ: ಸುರುಳಿ ಏಣಿಯಂತೆ ಒಂದರ ಸುತ್ತ ಒಂದು ತಿರುಚಿದ ಎರಡು ಎಳೆಗಳು. ಬದಿಗಳು ಸಕ್ಕರೆ ಮತ್ತು ಫಾಸ್ಫೇಟ್; ಮೆಟ್ಟಿಲುಗಳು ಪ್ರತ್ಯಾಮ್ಲ ಜೋಡಿಗಳು. ಅಡೆನಿನ್ ಯಾವಾಗಲೂ ಥೈಮಿನ್ ಜೊತೆ, ಗ್ವಾನಿನ್ ಸೈಟೋಸಿನ್ ಜೊತೆ ಜೋಡಿಯಾಗುತ್ತವೆ.',
      ),
    },
    {
      id: 'unzip', stage: 'dna', seconds: 13,
      camera: { pos: [-2.6, 3.0, 18.5], target: [-2.4, 0, 0], drift: -0.02 },
      highlight: ['helicase'], labels: ['helicase', 'old_strand'],
      title: t('Unzipping', 'खुलना', 'ಬಿಚ್ಚುವಿಕೆ'),
      caption: t(
        'Before a cell divides, its DNA is copied. An enzyme called helicase unzips the double helix, breaking the weak bonds between the base pairs, so the two strands come apart.',
        'कोशिका के विभाजन से पहले उसके DNA की प्रतिलिपि बनती है। हेलिकेज़ नामक एंज़ाइम द्विकुंडली को खोलता है, क्षारक युग्मों के बीच के कमज़ोर बंध तोड़ता है, जिससे दोनों लड़ियाँ अलग हो जाती हैं।',
        'ಕೋಶ ವಿಭಜನೆಗೆ ಮೊದಲು ಅದರ DNA ನಕಲಾಗುತ್ತದೆ. ಹೆಲಿಕೇಸ್ ಎಂಬ ಕಿಣ್ವ ದ್ವಿಸುರುಳಿಯನ್ನು ಬಿಚ್ಚಿ, ಪ್ರತ್ಯಾಮ್ಲ ಜೋಡಿಗಳ ನಡುವಿನ ದುರ್ಬಲ ಬಂಧಗಳನ್ನು ಮುರಿಯುತ್ತದೆ; ಎರಡು ಎಳೆಗಳು ಬೇರ್ಪಡುತ್ತವೆ.',
      ),
    },
    {
      id: 'copy', stage: 'dna', seconds: 15,
      camera: { pos: [-1.0, 3.0, 19.0], target: [0.6, 0, 0], drift: 0.02 },
      highlight: ['polymerase'], labels: ['polymerase', 'nucleotides', 'old_strand', 'new_strand'],
      title: t('Building the new strands', 'नई लड़ियाँ बनाना', 'ಹೊಸ ಎಳೆಗಳ ನಿರ್ಮಾಣ'),
      caption: t(
        'DNA polymerase then builds a new strand along each old one. It adds free nucleotides one by one, each base matching its partner, A with T and G with C. The old strand acts as the template.',
        'फिर DNA पॉलिमरेज़ हर पुरानी लड़ी के साथ एक नई लड़ी बनाता है। यह मुक्त न्यूक्लियोटाइड एक-एक करके जोड़ता है, हर क्षारक अपने साथी से मेल खाता है, A के साथ T और G के साथ C। पुरानी लड़ी साँचे का काम करती है।',
        'ನಂತರ DNA ಪಾಲಿಮರೇಸ್ ಪ್ರತಿ ಹಳೆಯ ಎಳೆಯ ಉದ್ದಕ್ಕೂ ಹೊಸ ಎಳೆಯನ್ನು ಕಟ್ಟುತ್ತದೆ. ಅದು ಮುಕ್ತ ನ್ಯೂಕ್ಲಿಯೋಟೈಡ್‌ಗಳನ್ನು ಒಂದೊಂದಾಗಿ ಸೇರಿಸುತ್ತದೆ; ಪ್ರತಿ ಪ್ರತ್ಯಾಮ್ಲ ತನ್ನ ಜೊತೆಗಾರನಿಗೆ ಹೊಂದುತ್ತದೆ, A ಜೊತೆ T ಮತ್ತು G ಜೊತೆ C. ಹಳೆಯ ಎಳೆ ಮಾದರಿಯಾಗಿ ಕೆಲಸ ಮಾಡುತ್ತದೆ.',
      ),
    },
    {
      id: 'result', stage: 'dna', seconds: 13,
      camera: { pos: [0.5, 4.2, 21.5], target: [0, 0, 0], drift: 0.03 },
      highlight: ['new_strand'], labels: ['old_strand', 'new_strand'],
      title: t('Two identical copies', 'दो एक जैसी प्रतियाँ', 'ಎರಡು ಒಂದೇ ರೀತಿಯ ಪ್ರತಿಗಳು'),
      caption: t(
        'The result is two identical DNA molecules. Each keeps one old strand and has one new one, so the copying is called semi-conservative. Each of the two new cells gets one copy.',
        'परिणाम दो एक जैसे DNA अणु हैं। हर एक में एक पुरानी लड़ी रहती है और एक नई होती है, इसलिए इस प्रतिलिपि को अर्ध-संरक्षी कहते हैं। दोनों नई कोशिकाओं को एक-एक प्रति मिलती है।',
        'ಫಲಿತಾಂಶ ಎರಡು ಒಂದೇ ರೀತಿಯ DNA ಅಣುಗಳು. ಪ್ರತಿಯೊಂದೂ ಒಂದು ಹಳೆಯ ಎಳೆಯನ್ನು ಉಳಿಸಿಕೊಂಡು ಒಂದು ಹೊಸ ಎಳೆಯನ್ನು ಹೊಂದಿರುತ್ತದೆ; ಆದ್ದರಿಂದ ಈ ನಕಲನ್ನು ಅರೆ-ಸಂರಕ್ಷಕ ಎನ್ನುತ್ತಾರೆ. ಎರಡು ಹೊಸ ಕೋಶಗಳಿಗೆ ಒಂದೊಂದು ಪ್ರತಿ ಸಿಗುತ್ತದೆ.',
      ),
    },
  ],
};

export async function build(k) {
  const stages = { chromosome: buildChromosome(k), dna: buildDna(k) };
  return { update: (s) => stages[s.stage]?.(s) };
}

// ------------------------------------------------------------------ the chromosome, unpacked

function buildChromosome(k) {
  const stage = k.stage('chromosome');
  const rnd = seeded(503);
  // The chromosome: two chromatids, a coiled-rope surface.
  const chromo = new THREE.Group();
  const chromMat = mat({ color: '#6a7fb5', rough: 0.55, clearcoat: 0.25, sheen: 0.5, sheenColor: '#c8d4f0', rim: 0.2 });
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const y = lerp(-2.6, 2.6, i / 12);
      pts.push([side * (0.32 + 0.22 * Math.abs(y) / 2.6) + 0.05 * Math.sin(i), y, 0.04 * Math.cos(i * 1.3)]);
    }
    const radius = (u) => {
      const y = lerp(-2.6, 2.6, u);
      return 0.42 * (1 - 0.4 * Math.exp(-((y / 0.3) ** 2))) * Math.sqrt(Math.min(1, (1 - Math.abs(u * 2 - 1)) * 7 + 0.3)) * (1 + 0.06 * Math.sin(u * 140));
    };
    chromo.add(new THREE.Mesh(tube(pts, radius, { segments: 140, radial: 18 }), chromMat));
  }
  chromo.position.set(-3.6, 0, -1);
  chromo.rotation.z = 0.25;
  stage.add(chromo);
  k.part('chromosome', chromo, { anchor: [-3.4, 2.2, -0.6] });

  // Coming out of it: a fibre of nucleosomes, DNA wound round histone spools, linked by bare DNA.
  const fibre = curve([[-3.2, 1.6, -0.6], [-1.6, 1.4, 0.2], [0.0, 0.4, 0.6], [1.6, -0.4, 0.4], [3.2, 0.2, 0.0], [4.8, 1.2, -0.4], [6.4, 0.6, 0]]);
  const histMat = mat({ color: '#b9a0c8', rough: 0.55, clearcoat: 0.2, sheen: 0.4, rim: 0.2 });
  const dnaMat = mat({ color: '#c99a5a', rough: 0.4, clearcoat: 0.5, rim: 0.2 });
  const histones = new THREE.Group();
  const dnaPts = [];
  const nN = 9;
  const v = new THREE.Vector3();
  for (let i = 0; i < nN; i++) {
    const u = (i + 0.5) / nN;
    const c = fibre.getPointAt(u);
    const tan = fibre.getTangentAt(u);
    const spool = new THREE.Mesh(blob(0.42, 0.32, 0.42, { detail: 16, amp: 0.03, seed: i }), histMat);
    spool.position.copy(c);
    spool.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    histones.add(spool);
    // The DNA: about one and two-thirds turns round each spool.
    const q = spool.quaternion;
    for (let j = 0; j <= 30; j++) {
      const a = (j / 30) * Math.PI * 2 * 1.65 + rnd() * 0.0;
      v.set(Math.cos(a) * 0.52, lerp(-0.22, 0.22, j / 30), Math.sin(a) * 0.52).applyQuaternion(q).add(c);
      dnaPts.push(v.clone());
    }
  }
  stage.add(histones);
  k.part('histones', histones, { anchor: () => histones.children[4].position.clone().add({ x: 0, y: 0.5, z: 0.3 }) });
  const dna = new THREE.Mesh(tube(curve(dnaPts), 0.07, { segments: 900, radial: 8 }), dnaMat);
  stage.add(dna);
  // And at the end, the bare double helix.
  const tail = new Nucleotides(80, { quality: 0 });
  stage.add(tail);
  const end = fibre.getPointAt(1);
  const seq = sequence(24, rnd);
  const q = new THREE.Quaternion(), o = new THREE.Vector3();
  k.part('dna', dna, { anchor: () => end.clone().add({ x: 1.6, y: 0.7, z: 0 }) });
  const S = 0.32;
  return (s) => {
    const T = s.T;
    histones.rotation.y = 0;
    tail.begin();
    for (let i = 0; i < seq.length; i++) {
      o.set(end.x + 0.3 + i * RISE * S * 1.0, end.y, end.z);
      for (const st of [0, 1]) {
        strandQuat(i, st, q, T * 0.3);
        tail.put(st ? PAIR[seq[i]] : seq[i], o, q, BACKBONE.old, S);
      }
    }
    tail.scale.setScalar(1);
    tail.end();
    // The nucleotides are positioned at scale S around the axis: shrink the group about the end point.
    tail.position.copy(end).multiplyScalar(1 - S);
    tail.scale.setScalar(S);
    chromo.rotation.y = 0.15 * Math.sin(T * 0.2);
  };
}

// ------------------------------------------------------------------ the helix, unzipped and copied

const N = 64;
const X0 = -((N - 1) * RISE) / 2;
const xAt = (i) => X0 + i * RISE;

function buildDna(k) {
  const stage = k.stage('dna');
  const rnd = seeded(509);
  const seq = sequence(N, rnd);
  const nuc = new Nucleotides(N * 4 + 60);
  stage.add(nuc);
  // Markers for labels: they follow particular nucleotides.
  const at = { backbone: new THREE.Vector3(), adenine: new THREE.Vector3(), thymine: new THREE.Vector3(), guanine: new THREE.Vector3(), cytosine: new THREE.Vector3(), old_strand: new THREE.Vector3(), new_strand: new THREE.Vector3(), nucleotides: new THREE.Vector3() };
  for (const id of Object.keys(at)) k.marker(id, stage, (out) => (at[id].lengthSq() ? out.copy(at[id]) : null), 0.25);
  const firstOf = (b, from) => {
    for (let i = from; i < N; i++) if (seq[i] === b) return i;
    return from;
  };
  const labelIdx = { adenine: firstOf('A', 33), thymine: firstOf('T', 36), guanine: firstOf('G', 39), cytosine: firstOf('C', 42) };

  // The enzymes: helicase, a ring at the fork; polymerase, one on each new strand.
  const helicase = atomCluster([[0, 0.9, 0, 0.45, 0.5, 0.5], [0, -0.9, 0, 0.45, 0.5, 0.5], [0, 0, 0.9, 0.45, 0.5, 0.5], [0, 0, -0.9, 0.45, 0.5, 0.5], [0, 0.65, 0.65, 0.4], [0, -0.65, -0.65, 0.4], [0, 0.65, -0.65, 0.4], [0, -0.65, 0.65, 0.4]], '#b07a50', { seed: 11 });
  stage.add(helicase);
  k.part('helicase', helicase, { anchor: () => helicase.position.clone().add({ x: 0, y: 1.6, z: 0.4 }) });
  const pols = [0, 1].map((i) => {
    const p = atomCluster([[0, 0, 0, 0.85, 0.75, 0.8], [0.5, 0.5, 0.2, 0.5], [-0.4, 0.55, -0.3, 0.45], [0.2, -0.6, 0.4, 0.45]], '#6f8fbf', { seed: 20 + i });
    stage.add(p);
    return p;
  });
  k.part('polymerase', pols[0], { anchor: () => pols[0].position.clone().add({ x: 0, y: 1.2, z: 0.5 }) });
  const glow = new GlowPoints(80, { size: 0.5 });
  stage.add(glow);
  const spark = C('#ffe0a0');

  // Free nucleotides waiting near the fork: where each starts from.
  const drift = Array.from({ length: N * 2 }, () => new THREE.Vector3((rnd() - 0.5) * 3, (rnd() - 0.5) * 3, (rnd() - 0.2) * 3));
  const q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), o = new THREE.Vector3(), w = new THREE.Vector3(), e = new THREE.Euler();
  const Y = new THREE.Vector3();
  return (s) => {
    const T = s.T;
    for (const key in at) at[key].set(0, 0, 0);
    // The fork moves left to right; the polymerases follow it, a little behind.
    const fork = s.is('helix') ? xAt(0) - 6 : s.is('unzip') ? lerp(xAt(0) - 1, xAt(N * 0.55), smooth(s.u)) : s.is('copy') ? lerp(xAt(N * 0.55), xAt(N - 1) + 1, smooth(s.u)) : xAt(N - 1) + 8;
    const copying = s.is('copy', 'result');
    const lag = 2.2;
    const polyX = copying ? fork - lag : -100;
    // The daughters separate behind the fork.
    const sep = (x) => 2.4 * smooth((fork - x) / 3.2);
    const spin = s.is('helix') ? T * 0.25 : 0;
    nuc.begin();
    for (let i = 0; i < N; i++) {
      const x = xAt(i);
      const d = sep(x);
      const opened = d > 0.05;
      for (const st of [0, 1]) {
        // Each old strand goes with its own daughter: strand 0 up, strand 1 down.
        const dy = opened ? (st ? -d : d) : 0;
        o.set(x, dy, 0);
        strandQuat(i, st, q, spin);
        const base = st ? PAIR[seq[i]] : seq[i];
        nuc.put(base, o, q, BACKBONE.old);
        if (i === 30 && st === 0) at.backbone.copy(Y.set(0, R + 0.1, 0).applyQuaternion(q).add(o));
        if (i === 40 && st === 1 && opened) at.old_strand.copy(Y.set(0, R + 0.1, 0).applyQuaternion(q).add(o));
        for (const [id, li] of Object.entries(labelIdx)) {
          if (li === i && st === (id === 'thymine' || id === 'cytosine' ? (seq[i] === 'A' || seq[i] === 'G' ? 1 : 0) : 0)) at[id].copy(Y.set(0, R * 0.55, 0).applyQuaternion(q).add(o));
        }
        // The new partner, once the polymerase has passed (or arriving as it passes).
        if (opened && copying) {
          const k2 = clamp01((polyX - x + 0.9) / 0.9);
          const partner = st ? seq[i] : PAIR[seq[i]];
          strandQuat(i, 1 - st, q2, spin);
          if (k2 >= 1) {
            nuc.put(partner, o, q2, BACKBONE.new);
            if (i === 12 && st === 0) at.new_strand.copy(Y.set(0, R + 0.1, 0).applyQuaternion(q2).add(o));
          } else if (x - polyX < 4.5) {
            // Free nucleotides drift in towards their places.
            const a = smooth(clamp01((polyX - x + 4.5) / 5.4));
            w.copy(drift[i * 2 + st]).multiplyScalar(1 - a).add(o);
            e.set(T * 0.7 + i, T * 0.5 + st, 0);
            q.setFromEuler(e).slerp(q2, a);
            nuc.put(partner, w, q, BACKBONE.new, 0.95);
            if (i === firstOf(seq[i], 0) && st === 0 && a < 0.5) at.nucleotides.copy(w);
          }
        }
      }
    }
    nuc.end();
    if (!at.nucleotides.lengthSq() && copying) at.nucleotides.set(polyX + 2.5, 2.6, 1.2);

    helicase.visible = s.is('unzip', 'copy');
    helicase.position.set(fork + 0.6, 0, 0);
    helicase.rotation.x = -T * 2.2;
    glowProtein(helicase, 0.06, 0.04, 0.02);
    pols.forEach((p, i) => {
      p.visible = copying && polyX > xAt(0) - 1 && polyX < xAt(N - 1) + 1.5;
      p.position.set(polyX, (i ? -1 : 1) * sep(polyX), 0.2);
      p.rotation.set(T * 0.3, 0, 0);
    });
    glow.begin();
    if (helicase.visible) glow.push(fork + 0.2, 0, 0, 1.2, spark, 0.35 + 0.15 * Math.sin(T * 8));
    glow.done();
  };
}
