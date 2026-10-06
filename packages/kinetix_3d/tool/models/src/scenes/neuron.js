// The neuron: its parts, a nerve impulse travelling along it, the ions and
// channels of the axon's membrane behind the impulse, saltatory conduction
// along myelin, and the chemical synapse. Built in code.
import { THREE, mergeGeometries, seeded, mat, tube, curve, smooth, fract, lerp, clamp01, GlowPoints, MoleculeSwarm, tumble, blob, surface, squashBeyond, atomCluster } from './kit.js';
import { C, glowProtein, shellWithWindow, bilayer, tailSheet } from './bio.js';

const t = (en, hi, kn) => ({ en, hi, kn });

export const script = {
  id: 'neuron',
  subject: 'Biology',
  classes: [10, 11, 12],
  thumb: { step: 'signal', u: 0.45 },
  title: t('The neuron and the nerve impulse', 'तंत्रिका कोशिका और तंत्रिका आवेग', 'ನರಕೋಶ ಮತ್ತು ನರ ಆವೇಗ'),
  summary: t(
    'The parts of a neuron, how an impulse travels along the axon as ions cross its membrane, how myelin makes it faster, and how the message crosses a synapse to the next cell.',
    'तंत्रिका कोशिका के भाग, झिल्ली के आर-पार आयनों के जाने से आवेग तंत्रिकाक्ष पर कैसे चलता है, माइलिन इसे तेज़ कैसे करता है, और संदेश सिनैप्स पार करके अगली कोशिका तक कैसे पहुँचता है।',
    'ನರಕೋಶದ ಭಾಗಗಳು, ಪೊರೆಯ ಮೂಲಕ ಅಯಾನುಗಳು ಹಾದುಹೋಗುವಾಗ ಆವೇಗ ಆಕ್ಸಾನ್ ಮೇಲೆ ಹೇಗೆ ಸಾಗುತ್ತದೆ, ಮೈಲಿನ್ ಅದನ್ನು ಹೇಗೆ ವೇಗಗೊಳಿಸುತ್ತದೆ, ಮತ್ತು ಸಂದೇಶ ಸಿನಾಪ್ಸ್ ದಾಟಿ ಮುಂದಿನ ಕೋಶವನ್ನು ಹೇಗೆ ತಲುಪುತ್ತದೆ.',
  ),
  keywords: ['neuron', 'nerve cell', 'nerve impulse', 'action potential', 'synapse', 'axon', 'dendrite', 'myelin', 'neurotransmitter', 'sodium', 'potassium', 'nervous system', 'control and coordination', 'neural control'],
  credit: 'Model built by KINETIX',
  look: {
    background: ['#1d2230', '#07090d'],
    keyAt: [3, 6, 7],
    envTop: '#2a3140',
    stages: { neuron: { fog: [13, 32] }, membrane: { fog: [9, 22] }, synapse: { fog: [9, 22] } },
  },
  groups: [
    { id: 'cell', name: t('The neuron', 'तंत्रिका कोशिका', 'ನರಕೋಶ') },
    { id: 'membrane', name: t('The axon’s membrane', 'तंत्रिकाक्ष की झिल्ली', 'ಆಕ್ಸಾನ್‌ನ ಪೊರೆ') },
    { id: 'synapse', name: t('The synapse', 'सिनैप्स', 'ಸಿನಾಪ್ಸ್') },
  ],
  parts: [
    { id: 'dendrites', group: 'cell', color: '#d2a27c', name: t('Dendrites', 'द्रुमिकाएँ (डेंड्राइट)', 'ಡೆಂಡ್ರೈಟ್‌ಗಳು'), info: t('Branches that pick up messages from other cells.', 'शाखाएँ जो दूसरी कोशिकाओं से संदेश ग्रहण करती हैं।', 'ಇತರ ಕೋಶಗಳಿಂದ ಸಂದೇಶ ಪಡೆಯುವ ಕವಲುಗಳು.') },
    { id: 'cell_body', group: 'cell', color: '#d2a27c', name: t('Cell body', 'कोशिका काय', 'ಕೋಶ ಕಾಯ'), info: t('Holds the nucleus. It adds up the incoming messages.', 'इसमें केंद्रक होता है। यह आने वाले संदेशों को जोड़ती है।', 'ಕೋಶಕೇಂದ್ರವನ್ನು ಹೊಂದಿದೆ. ಬರುವ ಸಂದೇಶಗಳನ್ನು ಒಟ್ಟುಗೂಡಿಸುತ್ತದೆ.') },
    { id: 'nucleus', group: 'cell', color: '#5a4a8a', name: t('Nucleus', 'केंद्रक', 'ಕೋಶಕೇಂದ್ರ'), info: t('Controls the cell.', 'कोशिका का नियंत्रण करता है।', 'ಕೋಶವನ್ನು ನಿಯಂತ್ರಿಸುತ್ತದೆ.') },
    { id: 'axon', group: 'cell', color: '#d2a27c', name: t('Axon', 'तंत्रिकाक्ष (एक्सॉन)', 'ಆಕ್ಸಾನ್'), info: t('A long fibre that carries the impulse away from the cell body; some are a metre long.', 'एक लंबा तंतु जो आवेग को कोशिका काय से दूर ले जाता है; कुछ एक मीटर तक लंबे होते हैं।', 'ಆವೇಗವನ್ನು ಕೋಶ ಕಾಯದಿಂದ ದೂರ ಒಯ್ಯುವ ಉದ್ದನೆಯ ತಂತು; ಕೆಲವು ಒಂದು ಮೀಟರ್ ಉದ್ದವಿರುತ್ತವೆ.') },
    { id: 'myelin', group: 'cell', color: '#ece2cc', name: t('Myelin sheath', 'माइलिन आवरण', 'ಮೈಲಿನ್ ಕವಚ'), info: t('Fatty insulation wrapped round the axon by other cells.', 'वसा का विद्युत-रोधी आवरण, जिसे दूसरी कोशिकाएँ तंत्रिकाक्ष के चारों ओर लपेटती हैं।', 'ಇತರ ಕೋಶಗಳು ಆಕ್ಸಾನ್ ಸುತ್ತ ಸುತ್ತುವ ಕೊಬ್ಬಿನ ನಿರೋಧಕ ಕವಚ.') },
    { id: 'node', group: 'cell', color: '#d2a27c', name: t('Node of Ranvier', 'रैनवियर की पर्वसंधि', 'ರಾನ್ವಿಯರ್ ಗಂಟು'), info: t('A gap in the myelin, where the impulse is renewed.', 'माइलिन में एक अंतराल, जहाँ आवेग फिर से बनता है।', 'ಮೈಲಿನ್‌ನಲ್ಲಿನ ಅಂತರ; ಇಲ್ಲಿ ಆವೇಗ ಮತ್ತೆ ಹುಟ್ಟುತ್ತದೆ.') },
    { id: 'terminals', group: 'cell', color: '#d2a27c', name: t('Axon terminals', 'तंत्रिकाक्ष के अंतिम सिरे', 'ಆಕ್ಸಾನ್ ತುದಿಗಳು'), info: t('They end in knobs that pass the message to the next cell.', 'ये घुंडियों में समाप्त होते हैं जो संदेश अगली कोशिका को देती हैं।', 'ಇವು ಸಂದೇಶವನ್ನು ಮುಂದಿನ ಕೋಶಕ್ಕೆ ದಾಟಿಸುವ ಗುಬ್ಬಿಗಳಲ್ಲಿ ಕೊನೆಗೊಳ್ಳುತ್ತವೆ.') },
    { id: 'impulse', group: 'cell', color: '#8fe3ff', name: t('Nerve impulse', 'तंत्रिका आवेग', 'ನರ ಆವೇಗ'), info: t('A wave of electrical change along the membrane.', 'झिल्ली पर विद्युत परिवर्तन की एक लहर।', 'ಪೊರೆಯ ಮೇಲೆ ವಿದ್ಯುತ್ ಬದಲಾವಣೆಯ ಅಲೆ.') },
    { id: 'membrane', group: 'membrane', color: '#c9c29a', name: t('Cell membrane', 'कोशिका झिल्ली', 'ಕೋಶಪೊರೆ'), info: t('A double layer of fat molecules that ions cannot cross on their own.', 'वसा अणुओं की दोहरी परत, जिसे आयन अपने-आप पार नहीं कर सकते।', 'ಕೊಬ್ಬಿನ ಅಣುಗಳ ಎರಡು ಪದರ; ಅಯಾನುಗಳು ತಾವಾಗಿ ಇದನ್ನು ದಾಟಲಾರವು.') },
    { id: 'outside', group: 'membrane', color: '#ffb347', name: t('Outside: positive', 'बाहर: धनात्मक', 'ಹೊರಗೆ: ಧನಾತ್ಮಕ'), info: t('Rich in sodium ions.', 'सोडियम आयनों से भरपूर।', 'ಸೋಡಿಯಂ ಅಯಾನುಗಳು ಹೆಚ್ಚು.') },
    { id: 'inside', group: 'membrane', color: '#4f7cff', name: t('Inside: negative', 'अंदर: ऋणात्मक', 'ಒಳಗೆ: ಋಣಾತ್ಮಕ'), info: t('Rich in potassium ions, and in negative proteins that cannot leave.', 'पोटैशियम आयनों से भरपूर, और ऐसे ऋणात्मक प्रोटीन से जो बाहर नहीं जा सकते।', 'ಪೊಟ್ಯಾಸಿಯಂ ಅಯಾನುಗಳು ಮತ್ತು ಹೊರಹೋಗಲಾರದ ಋಣಾತ್ಮಕ ಪ್ರೋಟೀನ್‌ಗಳು ಹೆಚ್ಚು.') },
    { id: 'sodium', group: 'membrane', color: '#e0a040', name: t('Sodium ions (Na⁺)', 'सोडियम आयन (Na⁺)', 'ಸೋಡಿಯಂ ಅಯಾನುಗಳು (Na⁺)'), info: t('Many outside, few inside.', 'बाहर बहुत, अंदर कम।', 'ಹೊರಗೆ ಹೆಚ್ಚು, ಒಳಗೆ ಕಡಿಮೆ.') },
    { id: 'potassium', group: 'membrane', color: '#6a7fd0', name: t('Potassium ions (K⁺)', 'पोटैशियम आयन (K⁺)', 'ಪೊಟ್ಯಾಸಿಯಂ ಅಯಾನುಗಳು (K⁺)'), info: t('Many inside, few outside.', 'अंदर बहुत, बाहर कम।', 'ಒಳಗೆ ಹೆಚ್ಚು, ಹೊರಗೆ ಕಡಿಮೆ.') },
    { id: 'na_channel', group: 'membrane', color: '#5f9a8a', name: t('Sodium channel', 'सोडियम चैनल', 'ಸೋಡಿಯಂ ಕಾಲುವೆ'), info: t('A protein gate that opens for a moment to let sodium in.', 'एक प्रोटीन द्वार जो पल भर के लिए खुलकर सोडियम को अंदर आने देता है।', 'ಕ್ಷಣಕಾಲ ತೆರೆದು ಸೋಡಿಯಂ ಒಳಬರಲು ಬಿಡುವ ಪ್ರೋಟೀನ್ ದ್ವಾರ.') },
    { id: 'k_channel', group: 'membrane', color: '#8a74b0', name: t('Potassium channel', 'पोटैशियम चैनल', 'ಪೊಟ್ಯಾಸಿಯಂ ಕಾಲುವೆ'), info: t('Opens a little later to let potassium out.', 'थोड़ी देर बाद खुलकर पोटैशियम को बाहर जाने देता है।', 'ಸ್ವಲ್ಪ ತಡವಾಗಿ ತೆರೆದು ಪೊಟ್ಯಾಸಿಯಂ ಹೊರಹೋಗಲು ಬಿಡುತ್ತದೆ.') },
    { id: 'pump', group: 'membrane', color: '#a89060', name: t('Sodium–potassium pump', 'सोडियम-पोटैशियम पंप', 'ಸೋಡಿಯಂ-ಪೊಟ್ಯಾಸಿಯಂ ಪಂಪ್'), info: t('Uses ATP to push three sodium ions out for every two potassium ions in.', 'ATP की ऊर्जा से हर दो पोटैशियम आयन अंदर लाने पर तीन सोडियम आयन बाहर भेजता है।', 'ATP ಶಕ್ತಿಯಿಂದ ಪ್ರತಿ ಎರಡು ಪೊಟ್ಯಾಸಿಯಂ ಅಯಾನು ಒಳತರುವಾಗ ಮೂರು ಸೋಡಿಯಂ ಅಯಾನುಗಳನ್ನು ಹೊರತಳ್ಳುತ್ತದೆ.') },
    { id: 'vesicles', group: 'synapse', color: '#d8cfe8', name: t('Vesicles', 'पुटिकाएँ', 'ಕೋಶಕಗಳು (ವೆಸಿಕಲ್‌ಗಳು)'), info: t('Tiny bags of neurotransmitter.', 'तंत्रिका संचारी से भरी छोटी थैलियाँ।', 'ನರಪ್ರೇಷಕ ತುಂಬಿದ ಸಣ್ಣ ಚೀಲಗಳು.') },
    { id: 'neurotransmitter', group: 'synapse', color: '#c4483f', name: t('Neurotransmitter', 'तंत्रिका संचारी (न्यूरोट्रांसमीटर)', 'ನರಪ್ರೇಷಕ (ನ್ಯೂರೋಟ್ರಾನ್ಸ್‌ಮಿಟರ್)'), info: t('A chemical messenger, here acetylcholine.', 'एक रासायनिक संदेशवाहक, यहाँ ऐसीटिलकोलीन।', 'ರಾಸಾಯನಿಕ ಸಂದೇಶವಾಹಕ; ಇಲ್ಲಿ ಅಸಿಟೈಲ್‌ಕೋಲೀನ್.') },
    { id: 'synapse', group: 'synapse', color: '#8fe3ff', name: t('Synapse (the gap)', 'सिनैप्स (अंतराल)', 'ಸಿನಾಪ್ಸ್ (ಅಂತರ)'), info: t('A gap about 20 nanometres wide between two cells.', 'दो कोशिकाओं के बीच लगभग 20 नैनोमीटर का अंतराल।', 'ಎರಡು ಕೋಶಗಳ ನಡುವೆ ಸುಮಾರು 20 ನ್ಯಾನೋಮೀಟರ್ ಅಂತರ.') },
    { id: 'receptors', group: 'synapse', color: '#6f8fbf', name: t('Receptors', 'ग्राही (रिसेप्टर)', 'ಗ್ರಾಹಕಗಳು'), info: t('Proteins that the neurotransmitter fits into, like a key in a lock.', 'प्रोटीन जिनमें तंत्रिका संचारी ताले में चाबी की तरह फिट होता है।', 'ಬೀಗದಲ್ಲಿ ಕೀಲಿಯಂತೆ ನರಪ್ರೇಷಕ ಹೊಂದಿಕೊಳ್ಳುವ ಪ್ರೋಟೀನ್‌ಗಳು.') },
    { id: 'next_cell', group: 'synapse', color: '#b996c9', name: t('Next neuron', 'अगली तंत्रिका कोशिका', 'ಮುಂದಿನ ನರಕೋಶ'), info: t('Its dendrite receives the message.', 'इसकी द्रुमिका संदेश ग्रहण करती है।', 'ಇದರ ಡೆಂಡ್ರೈಟ್ ಸಂದೇಶವನ್ನು ಪಡೆಯುತ್ತದೆ.') },
  ],
  steps: [
    {
      id: 'parts', stage: 'neuron', seconds: 14,
      camera: { pos: [1.4, 2.0, 20.5], target: [-0.6, 0.2, 0], from: [4, 4, 30], drift: 0.04 },
      highlight: [], labels: ['dendrites', 'cell_body', 'nucleus', 'axon', 'myelin', 'terminals'],
      title: t('A cell that carries messages', 'संदेश ले जाने वाली कोशिका', 'ಸಂದೇಶ ಒಯ್ಯುವ ಕೋಶ'),
      caption: t(
        'A neuron is a cell built to carry messages. Its dendrites pick up signals, the cell body holds the nucleus, and a long axon, wrapped in fatty myelin, carries the message away to the axon terminals.',
        'तंत्रिका कोशिका संदेश ले जाने के लिए बनी कोशिका है। इसकी द्रुमिकाएँ संकेत ग्रहण करती हैं, कोशिका काय में केंद्रक होता है, और माइलिन में लिपटा लंबा तंत्रिकाक्ष संदेश को अंतिम सिरों तक ले जाता है।',
        'ನರಕೋಶವು ಸಂದೇಶ ಒಯ್ಯಲೆಂದೇ ರೂಪುಗೊಂಡ ಕೋಶ. ಇದರ ಡೆಂಡ್ರೈಟ್‌ಗಳು ಸಂಕೇತಗಳನ್ನು ಪಡೆಯುತ್ತವೆ, ಕೋಶ ಕಾಯದಲ್ಲಿ ಕೋಶಕೇಂದ್ರವಿದೆ, ಮತ್ತು ಮೈಲಿನ್‌ನಿಂದ ಸುತ್ತಿದ ಉದ್ದನೆಯ ಆಕ್ಸಾನ್ ಸಂದೇಶವನ್ನು ಆಕ್ಸಾನ್ ತುದಿಗಳಿಗೆ ಒಯ್ಯುತ್ತದೆ.',
      ),
    },
    {
      id: 'signal', stage: 'neuron', seconds: 13,
      camera: { pos: [-2.6, 1.4, 17.0], target: [-1.4, 0.2, 0], drift: 0.02 },
      highlight: [], labels: ['dendrites', 'cell_body', 'axon', 'impulse'],
      title: t('The nerve impulse', 'तंत्रिका आवेग', 'ನರ ಆವೇಗ'),
      caption: t(
        'Messages arriving at the dendrites add up in the cell body. If they are strong enough, an electrical impulse starts and races along the axon to its end, in some nerves at over 100 metres a second.',
        'द्रुमिकाओं पर आए संदेश कोशिका काय में जुड़ते हैं। पर्याप्त प्रबल होने पर एक विद्युत आवेग शुरू होता है और तंत्रिकाक्ष पर उसके सिरे तक दौड़ता है, कुछ तंत्रिकाओं में 100 मीटर प्रति सेकंड से भी तेज़।',
        'ಡೆಂಡ್ರೈಟ್‌ಗಳಿಗೆ ಬಂದ ಸಂದೇಶಗಳು ಕೋಶ ಕಾಯದಲ್ಲಿ ಕೂಡುತ್ತವೆ. ಸಾಕಷ್ಟು ಪ್ರಬಲವಾದರೆ ವಿದ್ಯುತ್ ಆವೇಗ ಆರಂಭವಾಗಿ ಆಕ್ಸಾನ್ ಮೇಲೆ ಅದರ ತುದಿಯವರೆಗೆ ಓಡುತ್ತದೆ; ಕೆಲವು ನರಗಳಲ್ಲಿ ಸೆಕೆಂಡಿಗೆ 100 ಮೀಟರ್‌ಗಿಂತಲೂ ವೇಗವಾಗಿ.',
      ),
    },
    {
      id: 'resting', stage: 'membrane', seconds: 14,
      camera: { pos: [1.2, 3.4, 12.6], target: [0, -0.1, -0.6], from: [0, 5, 20], drift: 0.02 },
      highlight: ['pump'], labels: ['outside', 'inside', 'sodium', 'potassium', 'pump', 'membrane'],
      title: t('A membrane ready to fire', 'आवेग के लिए तैयार झिल्ली', 'ಆವೇಗಕ್ಕೆ ಸಿದ್ಧವಾದ ಪೊರೆ'),
      caption: t(
        'Zoom in to the axon’s membrane. At rest, the inside is negative compared with the outside. Pumps in the membrane keep sodium ions outside and potassium ions inside, using energy from ATP.',
        'तंत्रिकाक्ष की झिल्ली को पास से देखें। विश्राम में अंदर का भाग बाहर की तुलना में ऋणात्मक होता है। झिल्ली के पंप ATP की ऊर्जा से सोडियम आयनों को बाहर और पोटैशियम आयनों को अंदर रखते हैं।',
        'ಆಕ್ಸಾನ್‌ನ ಪೊರೆಯನ್ನು ಹತ್ತಿರದಿಂದ ನೋಡಿ. ವಿಶ್ರಾಂತಿಯಲ್ಲಿ ಒಳಭಾಗ ಹೊರಭಾಗಕ್ಕಿಂತ ಋಣಾತ್ಮಕವಾಗಿರುತ್ತದೆ. ಪೊರೆಯ ಪಂಪ್‌ಗಳು ATP ಶಕ್ತಿಯಿಂದ ಸೋಡಿಯಂ ಅಯಾನುಗಳನ್ನು ಹೊರಗೆ ಮತ್ತು ಪೊಟ್ಯಾಸಿಯಂ ಅಯಾನುಗಳನ್ನು ಒಳಗೆ ಇಡುತ್ತವೆ.',
      ),
    },
    {
      id: 'action', stage: 'membrane', seconds: 16,
      camera: { pos: [-1.4, 2.6, 11.4], target: [0, -0.1, -0.6], drift: -0.02 },
      highlight: ['na_channel', 'k_channel'], labels: ['na_channel', 'k_channel', 'sodium', 'potassium'],
      title: t('The impulse: ions rush across', 'आवेग: आयनों का तेज़ बहाव', 'ಆವೇಗ: ಅಯಾನುಗಳ ನುಗ್ಗುವಿಕೆ'),
      caption: t(
        'When the impulse arrives, sodium channels open and sodium ions rush in, making the inside positive for an instant. Then potassium channels open and potassium flows out, making it negative again. This change sweeps along the axon.',
        'आवेग आने पर सोडियम चैनल खुलते हैं और सोडियम आयन तेज़ी से अंदर आते हैं, जिससे अंदर का भाग पल भर के लिए धनात्मक हो जाता है। फिर पोटैशियम चैनल खुलते हैं और पोटैशियम बाहर जाता है, जिससे यह फिर ऋणात्मक हो जाता है। यह परिवर्तन तंत्रिकाक्ष पर आगे बढ़ता है।',
        'ಆವೇಗ ಬಂದಾಗ ಸೋಡಿಯಂ ಕಾಲುವೆಗಳು ತೆರೆದು ಸೋಡಿಯಂ ಅಯಾನುಗಳು ಒಳನುಗ್ಗುತ್ತವೆ; ಒಳಭಾಗ ಕ್ಷಣಕಾಲ ಧನಾತ್ಮಕವಾಗುತ್ತದೆ. ನಂತರ ಪೊಟ್ಯಾಸಿಯಂ ಕಾಲುವೆಗಳು ತೆರೆದು ಪೊಟ್ಯಾಸಿಯಂ ಹೊರಹೋಗುತ್ತದೆ; ಅದು ಮತ್ತೆ ಋಣಾತ್ಮಕವಾಗುತ್ತದೆ. ಈ ಬದಲಾವಣೆ ಆಕ್ಸಾನ್ ಉದ್ದಕ್ಕೂ ಸಾಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'myelin', stage: 'neuron', seconds: 13,
      camera: { pos: [1.6, 1.6, 6.0], target: [1.0, 0, 0], from: [0, 3, 12], drift: 0.015 },
      highlight: ['myelin'], labels: ['myelin', 'node', 'axon', 'impulse'],
      title: t('Myelin: a faster route', 'माइलिन: तेज़ रास्ता', 'ಮೈಲಿನ್: ವೇಗದ ಮಾರ್ಗ'),
      caption: t(
        'Myelin insulates the axon, so ions can cross only at the gaps between its segments, the nodes of Ranvier. The impulse jumps from node to node, which makes it many times faster.',
        'माइलिन तंत्रिकाक्ष को विद्युत-रोधी बनाता है, इसलिए आयन केवल इसके खंडों के बीच के अंतरालों, रैनवियर की पर्वसंधियों, पर ही पार हो सकते हैं। आवेग एक पर्वसंधि से दूसरी पर कूदता है, जिससे यह कई गुना तेज़ हो जाता है।',
        'ಮೈಲಿನ್ ಆಕ್ಸಾನ್ ಅನ್ನು ನಿರೋಧಿಸುತ್ತದೆ; ಆದ್ದರಿಂದ ಅಯಾನುಗಳು ಅದರ ಭಾಗಗಳ ನಡುವಿನ ಅಂತರಗಳಾದ ರಾನ್ವಿಯರ್ ಗಂಟುಗಳಲ್ಲಿ ಮಾತ್ರ ದಾಟಬಲ್ಲವು. ಆವೇಗ ಒಂದು ಗಂಟಿನಿಂದ ಇನ್ನೊಂದಕ್ಕೆ ಜಿಗಿಯುವುದರಿಂದ ಅದು ಹಲವು ಪಟ್ಟು ವೇಗವಾಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'synapse', stage: 'synapse', seconds: 16,
      camera: { pos: [3.6, 2.0, 13.0], target: [0, 1.7, 0], from: [1, 6, 20], drift: 0.02 },
      highlight: ['receptors'], labels: ['terminals', 'vesicles', 'neurotransmitter', 'synapse', 'receptors', 'next_cell'],
      title: t('Crossing the synapse', 'सिनैप्स को पार करना', 'ಸಿನಾಪ್ಸ್ ದಾಟುವುದು'),
      caption: t(
        'Between one neuron and the next is a tiny gap, the synapse. The impulse makes vesicles release a chemical, a neurotransmitter, which crosses the gap and fits into receptors on the next cell, starting a new impulse there.',
        'एक तंत्रिका कोशिका और अगली के बीच एक सूक्ष्म अंतराल होता है, सिनैप्स। आवेग पुटिकाओं से एक रसायन, तंत्रिका संचारी, छुड़वाता है, जो अंतराल पार करके अगली कोशिका के ग्राहियों में फिट होता है और वहाँ नया आवेग शुरू करता है।',
        'ಒಂದು ನರಕೋಶ ಮತ್ತು ಮುಂದಿನದರ ನಡುವೆ ಸಿನಾಪ್ಸ್ ಎಂಬ ಸೂಕ್ಷ್ಮ ಅಂತರವಿದೆ. ಆವೇಗವು ಕೋಶಕಗಳಿಂದ ನರಪ್ರೇಷಕ ಎಂಬ ರಾಸಾಯನಿಕವನ್ನು ಬಿಡುಗಡೆ ಮಾಡಿಸುತ್ತದೆ; ಅದು ಅಂತರ ದಾಟಿ ಮುಂದಿನ ಕೋಶದ ಗ್ರಾಹಕಗಳಲ್ಲಿ ಹೊಂದಿಕೊಂಡು ಅಲ್ಲಿ ಹೊಸ ಆವೇಗ ಆರಂಭಿಸುತ್ತದೆ.',
      ),
    },
    {
      id: 'oneway', stage: 'neuron', seconds: 12,
      camera: { pos: [-5.0, 3.6, 19.5], target: [-0.4, 0.2, 0], drift: -0.03 },
      highlight: [], labels: ['dendrites', 'cell_body', 'axon', 'terminals'],
      title: t('One way only', 'केवल एक दिशा में', 'ಒಂದೇ ದಿಕ್ಕಿನಲ್ಲಿ'),
      caption: t(
        'Only the axon’s end releases neurotransmitter, so messages always travel one way: from dendrites, to cell body, to axon, and on to the next neuron.',
        'केवल तंत्रिकाक्ष का सिरा तंत्रिका संचारी छोड़ता है, इसलिए संदेश हमेशा एक ही दिशा में चलते हैं: द्रुमिकाओं से कोशिका काय, फिर तंत्रिकाक्ष, और आगे अगली तंत्रिका कोशिका तक।',
        'ಆಕ್ಸಾನ್‌ನ ತುದಿ ಮಾತ್ರ ನರಪ್ರೇಷಕ ಬಿಡುಗಡೆ ಮಾಡುವುದರಿಂದ ಸಂದೇಶಗಳು ಯಾವಾಗಲೂ ಒಂದೇ ದಿಕ್ಕಿನಲ್ಲಿ ಸಾಗುತ್ತವೆ: ಡೆಂಡ್ರೈಟ್‌ಗಳಿಂದ ಕೋಶ ಕಾಯಕ್ಕೆ, ಆಕ್ಸಾನ್‌ಗೆ, ಮತ್ತು ಮುಂದಿನ ನರಕೋಶಕ್ಕೆ.',
      ),
    },
  ],
};

const SPARK = C('#8fe3ff');
/** Living membrane: warm, soft, faintly translucent at the rim. */
const cellMat = (color = '#d2a27c', o = {}) => mat({ color, rough: 0.5, clearcoat: 0.3, clearcoatRough: 0.35, sheen: 0.5, sheenColor: C(color).lerp(C('#fff0e0'), 0.45), sheenRough: 0.5, rim: 0.22, rimColor: '#ffe6cc', ...o });

export async function build(k) {
  const stages = { neuron: buildNeuron(k), membrane: buildMembrane(k), synapse: buildSynapse(k) };
  return { update: (s) => stages[s.stage]?.(s) };
}

// ------------------------------------------------------------------ the whole neuron

function buildNeuron(k) {
  const stage = k.stage('neuron');
  const rnd = seeded(307);
  const membrane = cellMat();
  const soma = new THREE.Vector3(-4.6, 0, 0);

  // Dendrites: branching, tapering, gently bent; their tips remembered for the incoming signals.
  const geos = [], chains = [];
  const branch = (from, dir, len, r, depth, chain) => {
    const pts = [from.clone()];
    const d = dir.clone(), p = from.clone();
    for (let i = 1; i <= 3; i++) {
      d.add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.45)).normalize();
      p.addScaledVector(d, len / 3);
      pts.push(p.clone());
    }
    geos.push(tube(pts, (u) => lerp(r, r * 0.68, u), { segments: 10, radial: 8 }));
    const here = [...chain, ...pts.slice(1)];
    if (depth > 1) {
      const side = new THREE.Vector3().crossVectors(d, new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5)).normalize();
      for (const sgn of [1, -1]) branch(p, d.clone().addScaledVector(side, sgn * (0.55 + rnd() * 0.3)).normalize(), len * (0.68 + rnd() * 0.12), r * 0.64, depth - 1, here);
    } else chains.push(here.slice().reverse());
  };
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const dir = new THREE.Vector3(-0.55 + Math.cos(a) * 0.45, Math.sin(a), Math.cos(a + 1.2) * 0.6).normalize();
    branch(soma.clone().addScaledVector(dir, 0.55), dir, 1.25 + rnd() * 0.4, 0.22, 4, [soma.clone()]);
  }
  const dendrites = new THREE.Mesh(mergeGeometries(geos), membrane);
  stage.add(dendrites);
  k.part('dendrites', dendrites, { anchor: [-6.6, 1.9, 0.5] });
  const bodyMat = cellMat('#d4a47e', { opacity: 0.8 });
  const body = new THREE.Mesh(blob(1.0, 0.86, 0.82, { detail: 30, amp: 0.1, freq: 1.6, seed: 4 }), bodyMat);
  body.position.copy(soma);
  stage.add(body);
  k.part('cell_body', body);
  const nucleus = new THREE.Mesh(blob(0.4, 0.38, 0.36, { detail: 20, amp: 0.03, seed: 9 }), mat({ color: '#5a4a8a', rough: 0.45, clearcoat: 0.4, sheen: 0.3, rim: 0.2 }));
  nucleus.position.copy(soma).add({ x: -0.1, y: 0.08, z: 0.05 });
  stage.add(nucleus);
  k.part('nucleus', nucleus);

  // The axon: thick at the hillock, then thin; myelin in segments with gaps (nodes).
  const axonCurve = curve([[-3.75, 0, 0], [-1.8, 0.14, 0.06], [0.8, -0.1, -0.05], [3.4, 0.09, 0], [5.3, 0, 0]]);
  const axon = new THREE.Mesh(tube(axonCurve, (u) => (u < 0.06 ? lerp(0.46, 0.14, smooth(u / 0.06)) : 0.14), { segments: 160, radial: 14 }), membrane);
  stage.add(axon);
  k.part('axon', axon, { anchor: [-3.1, 0.2, 0.2] });
  const myelinMat = mat({ color: '#ece2cc', rough: 0.32, clearcoat: 0.7, clearcoatRough: 0.18, sheen: 0.5, sheenColor: '#fffaf0', rim: 0.2 });
  const sheaths = [], nodes = [];
  const L = axonCurve.getLength();
  const seg = 0.95 / L, gap = 0.16 / L;
  for (let u = 0.11; u + seg < 0.93; u += seg + gap) {
    const pts = Array.from({ length: 9 }, (_, i) => axonCurve.getPointAt(u + (seg * i) / 8));
    sheaths.push(tube(pts, (v) => 0.14 + 0.2 * Math.pow(Math.sin(Math.PI * v), 0.3), { segments: 18, radial: 22 }));
    nodes.push(u + seg + gap / 2);
  }
  nodes.pop();
  const myelin = new THREE.Mesh(mergeGeometries(sheaths), myelinMat);
  stage.add(myelin);
  k.part('myelin', myelin, { anchor: [1.3, 0.3, 0.3] });
  const nodeAt = (i) => axonCurve.getPointAt(nodes[Math.max(0, Math.min(nodes.length - 1, i))]);
  k.marker('node', stage, (out) => out.copy(nodeAt(3)), 0.18);

  // Terminals: branches ending in knobs.
  const end = axonCurve.getPointAt(1);
  const tGeos = [], knobs = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const tip = new THREE.Vector3(end.x + 1.1 + rnd() * 0.4, end.y + Math.cos(a) * 0.95, end.z + Math.sin(a) * 0.95);
    const mid = end.clone().lerp(tip, 0.45).add({ x: 0, y: Math.cos(a) * 0.15, z: Math.sin(a) * 0.15 });
    tGeos.push(tube([end.clone().add({ x: -0.1, y: 0, z: 0 }), mid, tip], (u) => lerp(0.11, 0.07, u), { segments: 16, radial: 8 }));
    const knob = blob(0.24, 0.21, 0.21, { detail: 14 });
    knob.translate(tip.x + 0.12, tip.y, tip.z);
    tGeos.push(knob);
    knobs.push(tip.clone().add({ x: 0.12, y: 0, z: 0 }));
  }
  const terminals = new THREE.Mesh(mergeGeometries(tGeos.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
    g.deleteAttribute('uv');
    return g;
  })), membrane);
  stage.add(terminals);
  k.part('terminals', terminals, { anchor: [6.6, 0.9, 0.2] });

  // The impulse: glowing points, seen through the myelin.
  const glow = new GlowPoints(900, { size: 0.5 });
  glow.material.depthTest = false;
  stage.add(glow);
  const imp = new THREE.Vector3();
  k.marker('impulse', stage, (out) => (imp.lengthSq() ? out.copy(imp) : null), 0.3);
  const v = new THREE.Vector3();
  const pathPt = (chain, u, out) => {
    const f = u * (chain.length - 1), i = Math.min(chain.length - 2, Math.floor(f));
    return out.copy(chain[i]).lerp(chain[i + 1], f - i);
  };
  const someChains = chains.filter((_, i) => i % 5 === 0).slice(0, 8);
  return (s) => {
    const T = s.T;
    imp.set(0, 0, 0);
    glow.begin();
    bodyMat.emissive.setRGB(0, 0, 0);
    const saltatory = s.is('myelin');
    const P = saltatory ? 3.2 : 4;
    const ph = fract(T / P);
    if (s.is('signal', 'oneway', 'parts') || saltatory) {
      const strength = s.is('parts') ? 0.45 : 1;
      if (!saltatory) {
        // Inward along the dendrites (0–0.3), the cell body lights (0.25–0.4).
        const a = ph / 0.3;
        if (a < 1) {
          someChains.forEach((c, ci) => {
            pathPt(c, clamp01(a + ci * 0.02), v);
            glow.push(v.x, v.y, v.z, 0.38, SPARK, 0.8 * strength);
            pathPt(c, clamp01(a - 0.06), v);
            glow.push(v.x, v.y, v.z, 0.26, SPARK, 0.35 * strength);
          });
        }
        const flash = Math.max(0, 1 - Math.abs(ph - 0.33) / 0.08);
        bodyMat.emissive.setRGB(0.12 * flash * strength, 0.3 * flash * strength, 0.4 * flash * strength);
        if (flash > 0) glow.push(soma.x, soma.y, soma.z, 2.4, SPARK, 0.5 * flash * strength);
        // Along the axon (0.35–0.85), then the terminals light.
        const b = (ph - 0.35) / 0.5;
        if (b >= 0 && b <= 1) {
          for (let i = 0; i < 14; i++) {
            const u = b - i * 0.006;
            if (u < 0) break;
            axonCurve.getPointAt(u, v);
            glow.push(v.x, v.y, v.z, 0.75 - i * 0.04, SPARK, (0.9 - i * 0.06) * strength);
          }
          axonCurve.getPointAt(b, imp);
        }
        const fin = Math.max(0, 1 - Math.abs(ph - 0.9) / 0.07);
        if (fin > 0) for (const p of knobs) glow.push(p.x, p.y, p.z, 0.7, SPARK, 0.8 * fin * strength);
      } else {
        // Saltatory: the impulse lights each node in turn and leaps the myelin between.
        const f = ph * (nodes.length + 1);
        const n = Math.floor(f), w = f - n;
        for (let i = 0; i < nodes.length; i++) {
          const age = n - i + (1 - w);
          if (i <= n && age < 2.5) {
            const p = nodeAt(i);
            glow.push(p.x, p.y, p.z, 0.9, SPARK, Math.max(0, 1 - (n - i + w) / 2.5));
          }
        }
        if (n > 0 && n <= nodes.length - 1) {
          // The current running inside the sheath to the next node, fast and faint.
          const u0 = nodes[n - 1], u1 = nodes[n];
          for (let i = 0; i < 10; i++) {
            const u = lerp(u0, u1, clamp01(w * 1.6 - i * 0.04));
            axonCurve.getPointAt(u, v);
            glow.push(v.x, v.y, v.z, 0.3, SPARK, 0.35);
          }
          imp.copy(nodeAt(n));
        }
      }
    }
    glow.done();
  };
}

// ------------------------------------------------------------------ the membrane: ions and channels

function buildMembrane(k) {
  const stage = k.stage('membrane');
  const rnd = seeded(311);
  const X0 = -7, X1 = 7, Z0 = -3.6, Z1 = 1.8;
  const naCh = [[-2.8, 0.2], [0.7, -0.3], [4.4, 0.1]], kCh = [[-1.3, -0.9], [2.6, 0.6], [5.9, -1.2]], pumpAt = [-4.9, 0.4];
  const keepOut = [...naCh, ...kCh].map(([x, z]) => [x, z, 0.62]).concat([[pumpAt[0], pumpAt[1], 0.85]]);
  const lipids = new THREE.Group();
  lipids.add(bilayer(0, X0, X1, Z0, Z1, keepOut, rnd), tailSheet(0, X0, X1, Z0, Z1));
  stage.add(lipids);
  k.part('membrane', lipids, { anchor: [2.0, 0.25, 1.7] });

  // A channel: four subunits round a pore, which part to open it.
  const channel = (x, z, color, seed) => {
    const g = new THREE.Group();
    const subs = [];
    for (let i = 0; i < 4; i++) {
      const c = atomCluster([[0, 0, 0, 0.21, 0.56, 0.21], [0, 0.42, 0, 0.17, 0.16, 0.17]], color, { seed: seed + i });
      g.add(c);
      subs.push({ c, a: (i / 4) * Math.PI * 2 + Math.PI / 4 });
    }
    g.position.set(x, 0, z);
    stage.add(g);
    const set = (open, T) => {
      for (const s2 of subs) {
        const r = 0.24 + 0.12 * open;
        s2.c.position.set(Math.cos(s2.a) * r, 0.02 * Math.sin(T * 2 + s2.a), Math.sin(s2.a) * r);
        s2.c.rotation.set(Math.sin(s2.a) * 0.15 * open, 0, -Math.cos(s2.a) * 0.15 * open);
        glowProtein(s2.c, 0.12 * open, 0.1 * open, 0.04 * open);
      }
    };
    return { g, set, x, z };
  };
  const na = naCh.map(([x, z], i) => channel(x, z, '#5f9a8a', 20 + i * 5));
  const kk = kCh.map(([x, z], i) => channel(x, z, '#8a74b0', 60 + i * 5));
  // Labels point at one of each kind.
  k.part('na_channel', na[1].g);
  k.part('k_channel', kk[1].g);
  const pump = atomCluster([[0, 0, 0, 0.5, 0.62, 0.44], [0.25, -0.62, 0.1, 0.36, 0.3, 0.32], [-0.2, 0.55, -0.05, 0.3, 0.22, 0.28]], '#a89060', { seed: 90 });
  pump.position.set(pumpAt[0], 0, pumpAt[1]);
  stage.add(pump);
  k.part('pump', pump);

  // Ions: sodium (amber) mostly outside, potassium (blue) mostly inside.
  const ionMat = (c) => mat({ color: c, rough: 0.3, clearcoat: 0.8, clearcoatRough: 0.15, rim: 0.25, emissive: C(c).multiplyScalar(0.15) });
  const NA = 70, KN = 60;
  const naMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), ionMat('#e0a040'), NA + 40);
  const kMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), ionMat('#6a7fd0'), KN + 40);
  for (const m of [naMesh, kMesh]) {
    m.frustumCulled = false;
    stage.add(m);
  }
  const home = (n, outsideShare) => Array.from({ length: n }, () => {
    const out = rnd() < outsideShare;
    return { p: new THREE.Vector3(lerp(X0 + 0.3, X1 - 0.3, rnd()), (out ? 1 : -1) * (0.75 + rnd() * 2.4), lerp(Z0 + 0.3, Z1 + 1.2, rnd())), ph: rnd() * 6 };
  });
  const naHome = home(NA, 0.88), kHome = home(KN, 0.12);
  const at = { sodium: new THREE.Vector3(), potassium: new THREE.Vector3() };
  for (const id of Object.keys(at)) k.marker(id, stage, (out) => out.copy(at[id]), 0.2);
  k.marker('outside', stage, (out) => out.set(-4.4, 2.3, 1.2), 0.3);
  k.marker('inside', stage, (out) => out.set(-4.4, -2.3, 1.2), 0.3);

  // The voltage: a faint glow each side of the membrane, blue where the inside is negative.
  const volt = new GlowPoints(400, { size: 0.7 });
  stage.add(volt);
  const neg = C('#4f7cff'), pos = C('#ffb347');
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  return (s) => {
    const T = s.T;
    // The wave of the impulse: none at rest, sweeping left to right during the action step.
    const firing = s.is('action');
    const xf = firing ? lerp(X0 - 2, X1 + 4, fract(s.t / 6)) : -100;
    const local = (x) => xf - x; // how long ago the wave passed x (in units)
    const naOpen = (x) => {
      const d = local(x);
      return d > 0 && d < 1.4 ? smooth(Math.min(d / 0.3, (1.4 - d) / 0.4)) : 0;
    };
    const kOpen = (x) => {
      const d = local(x);
      return d > 1.0 && d < 3.6 ? smooth(Math.min((d - 1.0) / 0.4, (3.6 - d) / 0.6)) : 0;
    };
    const depol = (x) => {
      const d = local(x);
      return d > 0.15 && d < 2.6 ? smooth(Math.min((d - 0.15) / 0.35, (2.6 - d) / 0.9)) : 0;
    };
    na.forEach((c) => c.set(naOpen(c.x), T));
    kk.forEach((c) => c.set(kOpen(c.x), T));
    pump.rotation.y = Math.sin(T * 1.8) * 0.12;
    pump.position.y = 0.05 * Math.sin(T * 3.6);

    // Ions at home, jiggling.
    let nN = 0, nK = 0;
    const place = (mesh, i, p, r) => {
      sc.setScalar(r);
      m4.compose(p, q.identity(), sc);
      mesh.setMatrixAt(i, m4);
    };
    naHome.forEach((h, i) => {
      v.copy(h.p).add({ x: 0.12 * Math.sin(T * 1.7 + h.ph), y: 0.1 * Math.sin(T * 1.3 + h.ph * 2), z: 0.12 * Math.cos(T * 1.5 + h.ph) });
      place(naMesh, nN++, v, 0.1);
      if (i === 4) at.sodium.copy(v);
    });
    kHome.forEach((h, i) => {
      v.copy(h.p).add({ x: 0.1 * Math.sin(T * 1.4 + h.ph), y: 0.1 * Math.cos(T * 1.2 + h.ph), z: 0.1 * Math.sin(T * 1.1 + h.ph * 2) });
      place(kMesh, nK++, v, 0.13);
      if (i === 7) at.potassium.copy(v);
    });
    // Through open channels: sodium in, potassium out.
    const flux = (list, open, mesh, dir, r, n0) => {
      let n = n0;
      list.forEach((c, ci) => {
        const o = open(c.x);
        if (o < 0.05) return;
        for (let j = 0; j < 6; j++) {
          const ph = fract(j / 6 + T * 0.9 + ci * 0.3);
          const y = dir * lerp(1.4, -1.6, ph);
          const spread = Math.max(0, Math.abs(y) - 0.5) * 0.5;
          v.set(c.x + Math.sin(j * 2.3) * spread, y, c.z + Math.cos(j * 1.7) * spread);
          place(mesh, n++, v, r * Math.min(1, o * 2) * Math.min(1, ph * 6, (1 - ph) * 6));
        }
      });
      return n;
    };
    nN = flux(na, naOpen, naMesh, 1, 0.1, nN);
    nK = flux(kk, kOpen, kMesh, -1, 0.13, nK);
    // The pump: three sodium out, two potassium in, over and over.
    const pp = fract(T / 2.4);
    for (let j = 0; j < 3; j++) {
      v.set(pumpAt[0] + (j - 1) * 0.25, lerp(-1.3, 1.3, smooth(pp)), pumpAt[1] + 0.55);
      place(naMesh, nN++, v, 0.1 * Math.min(1, pp * 8, (1 - pp) * 8));
    }
    for (let j = 0; j < 2; j++) {
      v.set(pumpAt[0] + (j - 0.5) * 0.3, lerp(1.3, -1.3, smooth(pp)), pumpAt[1] + 0.55);
      place(kMesh, nK++, v, 0.13 * Math.min(1, pp * 8, (1 - pp) * 8));
    }
    naMesh.count = nN;
    kMesh.count = nK;
    naMesh.instanceMatrix.needsUpdate = kMesh.instanceMatrix.needsUpdate = true;

    volt.begin();
    for (let i = 0; i < 36; i++) {
      for (let j = 0; j < 7; j++) {
        const x = lerp(X0, X1, i / 35), z = lerp(Z0, Z1, j / 6);
        const d = depol(x);
        volt.push(x, -0.7, z, 0.8, neg.clone().lerp(pos, d), 0.012 + 0.03 * d);
      }
    }
    volt.done();
  };
}

// ------------------------------------------------------------------ the synapse

function buildSynapse(k) {
  const stage = k.stage('synapse');
  const rnd = seeded(331);
  // The knob at the end of the axon, cut open at the front, flat where it faces the gap.
  const knobGeo = shellWithWindow(2.5, 2.3, 2.1, (th, ph) => th > 0.9 && th < 2.75 && (ph < 0.75 || ph > Math.PI * 2 - 0.75), 72, 40);
  knobGeo.translate(0, 2.85, 0);
  squashBeyond(knobGeo, new THREE.Vector3(0, -1, 0), -0.62);
  const knob = new THREE.Group();
  knob.add(new THREE.Mesh(knobGeo, cellMat('#d2a27c')));
  knob.add(new THREE.Mesh(knobGeo, mat({ color: '#7a5a46', rough: 0.7, side: THREE.BackSide, rim: 0.05 })));
  // The axon branch it hangs from.
  knob.add(new THREE.Mesh(tube([[0, 4.6, -0.2], [-0.6, 6.4, -0.8], [-1.6, 8.6, -1.6]], 0.75, { segments: 24, radial: 18 }), cellMat('#d2a27c')));
  stage.add(knob);
  k.part('terminals', knob, { anchor: [-2.0, 3.6, 0.6] });
  const mito = new THREE.Mesh(blob(0.95, 0.36, 0.38, { detail: 18, amp: 0.04, seed: 3 }), mat({ color: '#b56a4c', rough: 0.5, clearcoat: 0.4, sheen: 0.3, rim: 0.15 }));
  mito.position.set(-0.7, 3.4, -0.7);
  mito.rotation.z = 0.4;
  stage.add(mito);

  // Vesicles: many inside, a few docked at the membrane, which fuse and empty.
  const VN = 30;
  const vesMat = mat({ color: '#c9bcdc', rough: 0.35, clearcoat: 0.5, clearcoatRough: 0.2, sheen: 0.3, rim: 0.45, rimColor: '#f4eeff', opacity: 0.85 });
  const ves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 3), vesMat, VN + 4);
  ves.frustumCulled = false;
  stage.add(ves);
  k.part('vesicles', ves, { anchor: [0.6, 2.6, 0.9] });
  const vesHome = Array.from({ length: VN }, () => {
    let p;
    do p = new THREE.Vector3((rnd() - 0.5) * 3.6, 1.5 + rnd() * 2.8, (rnd() - 0.5) * 2.8);
    while (((p.x / 2.0) ** 2 + ((p.y - 2.85) / 1.8) ** 2 + (p.z / 1.7) ** 2) > 1 || p.z > 0.9);
    return { p, ph: rnd() * 6 };
  });
  const docks = [[-1.1, 0.35], [0.1, 0.55], [1.2, 0.2], [0.5, -0.6]].map(([x, z]) => new THREE.Vector3(x, 0.98, z));

  // The next cell's membrane below, with receptors facing the gap.
  const postMat = cellMat('#8f74a8', { side: THREE.DoubleSide, sheen: 0.25, clearcoat: 0.2 });
  const post = new THREE.Mesh(surface((u, v, o) => {
    const x = lerp(-7, 7, u), z = lerp(3, -6, v);
    o.set(x, -0.15 - 0.035 * (x * x + z * z) + 0.05 * Math.sin(x * 1.3) * Math.cos(z), z);
  }, 70, 46), postMat);
  stage.add(post);
  k.part('next_cell', post, { anchor: [4.2, -0.9, 1.2] });
  const receptors = new THREE.Group();
  const recs = [];
  for (let i = 0; i < 7; i++) {
    const x = -1.8 + (i % 4) * 1.15 + (i > 3 ? 0.55 : 0), z = i > 3 ? -0.5 : 0.55;
    const r = atomCluster([[0, 0, 0, 0.2, 0.3, 0.2], [0.13, 0.12, 0.1, 0.14], [-0.12, 0.12, -0.1, 0.14]], '#6f8fbf', { seed: 70 + i });
    r.position.set(x, -0.15 - 0.035 * (x * x + z * z) + 0.25, z);
    receptors.add(r);
    recs.push(r);
  }
  stage.add(receptors);
  k.part('receptors', receptors, { anchor: [1.6, 0.0, 0.8] });
  k.marker('synapse', stage, (out) => out.set(2.0, 0.42, 1.1), 0.25);

  const swarm = new MoleculeSwarm(600, { scale: 0.055 });
  stage.add(swarm);
  const glow = new GlowPoints(300, { size: 0.3 });
  stage.add(glow);
  const ntAt = new THREE.Vector3();
  k.marker('neurotransmitter', stage, (out) => (ntAt.lengthSq() ? out.copy(ntAt) : null), 0.15);
  const NT = 14;
  const ntDir = Array.from({ length: docks.length * NT }, () => new THREE.Vector3((rnd() - 0.5) * 2.2, -1, (rnd() - 0.5) * 2.2));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  return (s) => {
    const T = s.T;
    const P = 4.5;
    const ph = fract(T / P);
    // 0–0.18 the impulse arrives; 0.18–0.32 the docked vesicles fuse; then the transmitter crosses.
    let n = 0;
    vesHome.forEach((h) => {
      v.copy(h.p).add({ x: 0.05 * Math.sin(T * 0.9 + h.ph), y: 0.05 * Math.cos(T * 0.7 + h.ph), z: 0 });
      sc.setScalar(0.2);
      m4.compose(v, q.identity(), sc);
      ves.setMatrixAt(n++, m4);
    });
    const fuse = clamp01((ph - 0.18) / 0.14);
    const refill = clamp01((ph - 0.75) / 0.2);
    docks.forEach((d) => {
      const r = 0.2 * (fuse < 1 ? 1 - 0.85 * smooth(fuse) : smooth(refill));
      v.copy(d).add({ x: 0, y: -0.22 * smooth(fuse) * (1 - refill), z: 0 });
      sc.set(r, r * (1 - 0.3 * fuse * (1 - refill)), r);
      m4.compose(v, q.identity(), sc);
      ves.setMatrixAt(n++, m4);
    });
    ves.count = n;
    ves.instanceMatrix.needsUpdate = true;

    swarm.begin();
    ntAt.set(0, 0, 0);
    const cross = clamp01((ph - 0.24) / 0.4);
    let bound = 0;
    if (ph > 0.24) {
      docks.forEach((d, di) => {
        for (let j = 0; j < NT; j++) {
          const dir = ntDir[di * NT + j];
          const a = clamp01(cross * (0.8 + (j % 4) * 0.1));
          v.copy(d).add({ x: dir.x * 0.5 * a, y: -0.62 - 0.5 * a, z: dir.z * 0.5 * a });
          v.y = Math.max(v.y, 0.12);
          // Later in the cycle they come loose and drift away (broken down by an enzyme).
          const fadeOut = 1 - clamp01((ph - 0.78) / 0.15);
          swarm.put('acetylcholine', v, tumble(di * NT + j, T, 0.8, q), fadeOut);
          if (di === 1 && j === 3) ntAt.copy(v);
        }
      });
      bound = clamp01((ph - 0.5) / 0.08) * (1 - clamp01((ph - 0.82) / 0.12));
    }
    swarm.end();
    recs.forEach((r, i) => glowProtein(r, 0.05 * bound, 0.16 * bound, 0.25 * bound * (0.8 + 0.2 * Math.sin(T * 6 + i))));

    glow.begin();
    // The impulse coming down the axon into the knob.
    const arrive = ph / 0.2;
    if (arrive < 1) {
      for (let i = 0; i < 12; i++) {
        const u = clamp01(arrive - i * 0.03);
        v.set(lerp(-1.6, 0, u), lerp(8.4, 1.2, u), lerp(-1.6, 0, u));
        glow.push(v.x, v.y, v.z, 0.9 - i * 0.05, SPARK, 0.8 - i * 0.06);
      }
    }
    // A new impulse starting in the next cell where the receptors opened.
    if (bound > 0.1) {
      for (let i = 0; i < 40; i++) {
        const a = fract(i / 40 + T * 0.5);
        const ang = (i / 40) * Math.PI * 2;
        const r = 0.6 + a * 4.2;
        v.set(Math.cos(ang) * r, -0.35 - 0.035 * r * r, Math.sin(ang) * r * 0.7);
        glow.push(v.x, v.y, v.z, 0.35, SPARK, 0.5 * bound * (1 - a));
      }
    }
    glow.done();
  };
}
