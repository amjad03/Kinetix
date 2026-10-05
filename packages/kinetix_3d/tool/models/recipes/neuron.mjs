// A neuron (nerve cell), built in code: cell body with nucleus, dendrites,
// axon with myelin sheath and nodes, axon terminals, and the dendrite of
// the next neuron across a synapse.
import { seeded, taperTube, curveThrough, branches, blob, rod } from '../lib/shapes.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

export default {
  id: 'neuron',
  version: 1,
  order: 7,
  source: 'procedural',
  subject: 'Biology',
  classes: [9, 10, 11],
  title: t('Neuron (nerve cell)', 'तंत्रिका कोशिका (न्यूरॉन)', 'ನರಕೋಶ (ನ್ಯೂರಾನ್)'),
  summary: t(
    'The cell that carries messages as electrical impulses. Dendrites receive, the axon sends, and the terminals pass the message on to the next cell.',
    'वह कोशिका जो संदेशों को विद्युत आवेग के रूप में ले जाती है। द्रुमिकाएँ संदेश ग्रहण करती हैं, तंत्रिकाक्ष उसे भेजता है, और अंतिम सिरे उसे अगली कोशिका तक पहुँचाते हैं।',
    'ಸಂದೇಶಗಳನ್ನು ವಿದ್ಯುತ್ ಆವೇಗಗಳಾಗಿ ಒಯ್ಯುವ ಕೋಶ. ಡೆಂಡ್ರೈಟ್‌ಗಳು ಸ್ವೀಕರಿಸುತ್ತವೆ, ಆಕ್ಸಾನ್ ಕಳುಹಿಸುತ್ತದೆ, ತುದಿಗಳು ಮುಂದಿನ ಕೋಶಕ್ಕೆ ದಾಟಿಸುತ್ತವೆ.',
  ),
  keywords: ['neuron', 'nerve cell', 'nervous system', 'nerve impulse', 'synapse', 'axon', 'dendrite', 'control and coordination', 'neural control'],
  credit: 'Model built by KINETIX',
  groups: [
    { id: 'cell', name: t('The cell', 'कोशिका', 'ಕೋಶ') },
    { id: 'axon', name: t('Axon', 'तंत्रिकाक्ष (एक्सॉन)', 'ಆಕ್ಸಾನ್') },
    { id: 'next', name: t('The next cell', 'अगली कोशिका', 'ಮುಂದಿನ ಕೋಶ') },
  ],
  build(THREE) {
    const rnd = seeded(7);
    const soma = [-0.1, 0, 0];
    const dendrites = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + 0.4;
      const dir = [-0.6 + Math.cos(a) * 0.4, Math.sin(a), Math.cos(a) * 0.5];
      const from = [soma[0] + dir[0] * 0.02, soma[1] + dir[1] * 0.02, soma[2] + dir[2] * 0.02];
      for (const b of branches(THREE, rnd, from, dir, { length: 0.045, radius: 0.0055, depth: 3, split: 2, spread: 0.55 })) dendrites.push(b.geometry);
    }
    const axonCurve = curveThrough(THREE, [[-0.075, 0, 0], [-0.02, 0.006, 0.002], [0.05, -0.004, -0.002], [0.12, 0.004, 0], [0.165, 0, 0]]);
    const myelin = [];
    for (let x = 0; x < 16; x++) {
      const u0 = 0.12 + x * 0.052, u1 = u0 + 0.042;
      if (u1 > 0.93) break;
      const pts = [];
      for (let s = 0; s <= 6; s++) {
        const p = axonCurve.getPointAt(u0 + ((u1 - u0) * s) / 6);
        pts.push([p.x, p.y, p.z]);
      }
      myelin.push(taperTube(THREE, curveThrough(THREE, pts), 0.0068, 0.0068, { segments: 10, radial: 16 }));
    }
    const terminals = [], knobs = [];
    const end = axonCurve.getPointAt(1);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const tip = [end.x + 0.035 + rnd() * 0.01, end.y + Math.cos(a) * 0.028, end.z + Math.sin(a) * 0.028];
      terminals.push(taperTube(THREE, curveThrough(THREE, [[end.x - 0.004, end.y, end.z], [end.x + 0.015, end.y + Math.cos(a) * 0.01, end.z + Math.sin(a) * 0.01], tip]), 0.0022, 0.0016, { segments: 12, radial: 8 }));
      knobs.push(blob(THREE, [tip[0] + 0.003, tip[1], tip[2]], 0.0055, 0.0045, 0.0045, 2));
    }
    // The next neuron: one dendrite reaching towards the first knob.
    const k0 = [end.x + 0.035 + 0.003, end.y + 0.028, end.z];
    const next = [taperTube(THREE, curveThrough(THREE, [[k0[0] + 0.012, k0[1] + 0.004, k0[2]], [k0[0] + 0.03, k0[1] + 0.02, k0[2]], [k0[0] + 0.05, k0[1] + 0.05, k0[2] + 0.01]]), 0.004, 0.006, { segments: 16, radial: 10 })];
    return {
      cell_body: blob(THREE, soma, 0.028, 0.024, 0.022, 10),
      nucleus: blob(THREE, [soma[0] - 0.002, soma[1] + 0.002, soma[2]], 0.0095, 0.009, 0.009, 6),
      dendrites,
      axon: taperTube(THREE, axonCurve, 0.0034, 0.0028, { segments: 120, radial: 12 }),
      myelin,
      terminals,
      knobs,
      next_cell: next,
    };
  },
  parts: [
    {
      id: 'cell_body', group: 'cell', color: '#d487b6', opacity: 0.85,
      name: t('Cell body', 'कोशिका काय', 'ಕೋಶ ಕಾಯ'),
      info: t('Contains the nucleus. It adds up the messages from the dendrites.', 'इसमें केंद्रक होता है। यह द्रुमिकाओं से आए संदेशों को जोड़ती है।', 'ಇದರಲ್ಲಿ ಕೋಶಕೇಂದ್ರವಿದೆ. ಡೆಂಡ್ರೈಟ್‌ಗಳಿಂದ ಬಂದ ಸಂದೇಶಗಳನ್ನು ಒಟ್ಟುಗೂಡಿಸುತ್ತದೆ.'),
    },
    {
      id: 'nucleus', group: 'cell', color: '#5e3f8f',
      name: t('Nucleus', 'केंद्रक', 'ಕೋಶಕೇಂದ್ರ'),
      info: t('Controls the cell and holds its DNA.', 'कोशिका को नियंत्रित करता है और उसका DNA रखता है।', 'ಕೋಶವನ್ನು ನಿಯಂತ್ರಿಸುತ್ತದೆ ಮತ್ತು ಅದರ DNA ಹೊಂದಿದೆ.'),
    },
    {
      id: 'dendrites', group: 'cell', color: '#cf7fb0',
      name: t('Dendrites', 'द्रुमिकाएँ (डेंड्राइट)', 'ಡೆಂಡ್ರೈಟ್‌ಗಳು'),
      info: t('Short, branched fibres that receive messages from other neurons.', 'छोटे, शाखित तंतु जो दूसरी तंत्रिका कोशिकाओं से संदेश ग्रहण करते हैं।', 'ಇತರ ನರಕೋಶಗಳಿಂದ ಸಂದೇಶ ಸ್ವೀಕರಿಸುವ ಚಿಕ್ಕ, ಕವಲೊಡೆದ ತಂತುಗಳು.'),
    },
    {
      id: 'axon', group: 'axon', color: '#c276a4',
      name: t('Axon', 'तंत्रिकाक्ष (एक्सॉन)', 'ಆಕ್ಸಾನ್'),
      info: t('One long fibre that carries the impulse away from the cell body; it can be up to a metre long.', 'एक लंबा तंतु जो आवेग को कोशिका काय से दूर ले जाता है; यह एक मीटर तक लंबा हो सकता है।', 'ಆವೇಗವನ್ನು ಕೋಶ ಕಾಯದಿಂದ ದೂರ ಒಯ್ಯುವ ಒಂದು ಉದ್ದ ತಂತು; ಒಂದು ಮೀಟರ್‌ವರೆಗೂ ಉದ್ದವಿರಬಹುದು.'),
    },
    {
      id: 'myelin', group: 'axon', color: '#f1e6c6',
      name: t('Myelin sheath', 'माइलिन आवरण', 'ಮೈಲಿನ್ ಕವಚ'),
      info: t('A fatty wrapping that insulates the axon. The impulse jumps across the gaps between its pieces (nodes of Ranvier), which makes it much faster.', 'एक वसायुक्त आवरण जो तंत्रिकाक्ष को विद्युत-रोधी बनाता है। आवेग इसके टुकड़ों के बीच के अंतरालों (रैनवियर के नोड) पर कूदता है, जिससे वह बहुत तेज़ चलता है।', 'ಆಕ್ಸಾನ್ ಅನ್ನು ನಿರೋಧಿಸುವ ಕೊಬ್ಬಿನ ಹೊದಿಕೆ. ಆವೇಗ ಇದರ ತುಂಡುಗಳ ನಡುವಿನ ಅಂತರಗಳ (ರಾನ್ವಿಯರ್ ಗಂಟುಗಳು) ಮೇಲೆ ಜಿಗಿಯುತ್ತದೆ, ಆದ್ದರಿಂದ ತುಂಬಾ ವೇಗ.'),
    },
    {
      id: 'terminals', group: 'axon', color: '#d98fbd',
      name: t('Axon terminals', 'तंत्रिकाक्ष के अंतिम सिरे', 'ಆಕ್ಸಾನ್ ತುದಿಗಳು'),
      info: t('The branched end of the axon.', 'तंत्रिकाक्ष का शाखित अंतिम भाग।', 'ಆಕ್ಸಾನ್‌ನ ಕವಲೊಡೆದ ತುದಿ.'),
    },
    {
      id: 'knobs', group: 'axon', color: '#e7a4cf',
      name: t('Synaptic knobs', 'सिनैप्टिक घुंडियाँ', 'ಸಿನಾಪ್ಟಿಕ್ ಗುಬ್ಬಿಗಳು'),
      info: t('They release chemicals (neurotransmitters) that carry the message across the synapse.', 'ये रसायन (न्यूरोट्रांसमीटर) छोड़ती हैं जो संदेश को सिनैप्स के पार ले जाते हैं।', 'ಸಿನಾಪ್ಸ್‌ನ ಆಚೆ ಸಂದೇಶ ಒಯ್ಯುವ ರಾಸಾಯನಿಕಗಳನ್ನು (ನರಪ್ರೇಷಕಗಳು) ಬಿಡುಗಡೆ ಮಾಡುತ್ತವೆ.'),
    },
    {
      id: 'next_cell', group: 'next', color: '#9d86c9',
      name: t('Dendrite of the next neuron', 'अगली तंत्रिका कोशिका की द्रुमिका', 'ಮುಂದಿನ ನರಕೋಶದ ಡೆಂಡ್ರೈಟ್'),
      info: t('The tiny gap between the knob and this dendrite is the synapse.', 'घुंडी और इस द्रुमिका के बीच का सूक्ष्म अंतराल सिनैप्स कहलाता है।', 'ಗುಬ್ಬಿ ಮತ್ತು ಈ ಡೆಂಡ್ರೈಟ್ ನಡುವಿನ ಸೂಕ್ಷ್ಮ ಅಂತರವೇ ಸಿನಾಪ್ಸ್.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0.15, 1] },
    { id: 'body', name: t('Cell body', 'कोशिका काय', 'ಕೋಶ ಕಾಯ'), dir: [-0.6, 0.3, 1] },
    { id: 'end', name: t('Axon end', 'तंत्रिकाक्ष का सिरा', 'ಆಕ್ಸಾನ್ ತುದಿ'), dir: [0.7, 0.2, 1] },
  ],
  slices: [
    { id: 'body_cut', name: t('Cell body cut open', 'कोशिका काय काटकर', 'ಕೋಶ ಕಾಯದ ಕತ್ತರಿಕೆ'), normal: [0, 0, -1], through: 'nucleus', view: 'front' },
  ],
  animations: [
    {
      id: 'impulse', kind: 'flow',
      name: t('A nerve impulse', 'तंत्रिका आवेग', 'ನರ ಆವೇಗ'),
      steps: [
        {
          color: '#ffe066', highlight: ['dendrites'],
          text: t('Dendrites pick up messages from other neurons or from sense organs.', 'द्रुमिकाएँ दूसरी तंत्रिका कोशिकाओं या ज्ञानेंद्रियों से संदेश ग्रहण करती हैं।', 'ಡೆಂಡ್ರೈಟ್‌ಗಳು ಇತರ ನರಕೋಶಗಳು ಅಥವಾ ಇಂದ್ರಿಯಗಳಿಂದ ಸಂದೇಶ ಪಡೆಯುತ್ತವೆ.'),
          paths: [['dendrites@left', 'cell_body'], ['dendrites@top', 'cell_body'], ['dendrites@bottom', 'cell_body']],
        },
        {
          color: '#ffe066', highlight: ['cell_body'],
          text: t('The cell body collects them. If they are strong enough, it starts an electrical impulse.', 'कोशिका काय उन्हें इकट्ठा करती है। पर्याप्त प्रबल होने पर यह एक विद्युत आवेग शुरू करती है।', 'ಕೋಶ ಕಾಯ ಅವುಗಳನ್ನು ಸಂಗ್ರಹಿಸುತ್ತದೆ. ಸಾಕಷ್ಟು ಪ್ರಬಲವಾದರೆ ವಿದ್ಯುತ್ ಆವೇಗ ಆರಂಭಿಸುತ್ತದೆ.'),
          paths: [['cell_body@left', 'cell_body', 'cell_body@right']],
        },
        {
          color: '#ffe066', highlight: ['axon', 'myelin'],
          text: t('The impulse races along the axon, jumping from one gap in the myelin sheath to the next.', 'आवेग तंत्रिकाक्ष पर तेज़ी से चलता है, माइलिन आवरण के एक अंतराल से दूसरे पर कूदता हुआ।', 'ಆವೇಗ ಆಕ್ಸಾನ್ ಮೇಲೆ ವೇಗವಾಗಿ ಸಾಗುತ್ತದೆ, ಮೈಲಿನ್ ಕವಚದ ಒಂದು ಅಂತರದಿಂದ ಮುಂದಿನದಕ್ಕೆ ಜಿಗಿಯುತ್ತಾ.'),
          paths: [['cell_body@right', 'axon@left', 'axon', 'axon@right']],
        },
        {
          color: '#7ee0ff', highlight: ['knobs', 'next_cell'],
          text: t('At the synaptic knobs, chemicals are released that cross the synapse and start a new impulse in the next neuron.', 'सिनैप्टिक घुंडियों पर रसायन निकलते हैं जो सिनैप्स पार करके अगली तंत्रिका कोशिका में नया आवेग शुरू करते हैं।', 'ಸಿನಾಪ್ಟಿಕ್ ಗುಬ್ಬಿಗಳಲ್ಲಿ ರಾಸಾಯನಿಕಗಳು ಬಿಡುಗಡೆಯಾಗಿ ಸಿನಾಪ್ಸ್ ದಾಟಿ ಮುಂದಿನ ನರಕೋಶದಲ್ಲಿ ಹೊಸ ಆವೇಗ ಆರಂಭಿಸುತ್ತವೆ.'),
          paths: [['axon@right', 'knobs@top', 'next_cell@bottom', 'next_cell@top']],
        },
      ],
    },
  ],
};
