// Cellular respiration: glucose split in the cytoplasm (glycolysis), pyruvate
// into the mitochondrion, the Krebs cycle in its matrix, and the electron
// transport chain on the cristae, where oxygen takes the electrons and ATP
// synthase makes most of the cell's ATP. And what happens without oxygen.
import { THREE, seeded, mat, blob, lathe, tube, disc, instanced, trs, GlowPoints, MoleculeSwarm, smooth, fract, tumble, curve, lerp, glowMat, streak } from './kit.js';
import { C, COL, protein, shellWithWindow, bilayer, tailSheet, atpSynthase } from './bio.js';

const t = (en, hi, kn) => ({ en, hi, kn });

export const script = {
  id: 'respiration',
  subject: 'Biology',
  classes: [7, 10, 11],
  title: t('Cellular respiration', 'कोशिकीय श्वसन', 'ಕೋಶೀಯ ಉಸಿರಾಟ'),
  summary: t(
    'How a cell releases the energy in glucose: glycolysis in the cytoplasm, then the Krebs cycle and the electron transport chain in the mitochondria, where oxygen is used and most ATP is made.',
    'कोशिका ग्लूकोज़ की ऊर्जा कैसे मुक्त करती है: कोशिकाद्रव्य में ग्लाइकोलाइसिस, फिर माइटोकॉन्ड्रिया में क्रेब्स चक्र और इलेक्ट्रॉन परिवहन शृंखला, जहाँ ऑक्सीजन का उपयोग होता है और अधिकांश ATP बनता है।',
    'ಕೋಶವು ಗ್ಲೂಕೋಸ್‌ನ ಶಕ್ತಿಯನ್ನು ಹೇಗೆ ಬಿಡುಗಡೆ ಮಾಡುತ್ತದೆ: ಕೋಶದ್ರವ್ಯದಲ್ಲಿ ಗ್ಲೈಕೊಲಿಸಿಸ್, ನಂತರ ಮೈಟೊಕಾಂಡ್ರಿಯದಲ್ಲಿ ಕ್ರೆಬ್ಸ್ ಚಕ್ರ ಮತ್ತು ಇಲೆಕ್ಟ್ರಾನ್ ಸಾಗಣೆ ಸರಪಳಿ; ಅಲ್ಲಿ ಆಮ್ಲಜನಕ ಬಳಕೆಯಾಗಿ ಹೆಚ್ಚಿನ ATP ತಯಾರಾಗುತ್ತದೆ.',
  ),
  thumb: { step: 'mitochondrion', u: 0.6 },
  keywords: ['respiration', 'cellular respiration', 'mitochondria', 'glycolysis', 'krebs cycle', 'electron transport chain', 'atp', 'aerobic', 'anaerobic', 'lactic acid', 'fermentation', 'life processes'],
  look: {
    background: ['#2a1f22', '#0b0809'],
    keyAt: [-4, 7, 5],
    envTop: '#33292b',
    stages: {
      cell: { fog: [9, 22] },
      cytosol: { fog: [7, 17] },
      mito: { fog: [8, 18] },
      matrix: { fog: [7, 17] },
      crista: { fog: [6, 16] },
    },
  },
  groups: [
    { id: 'cell', name: t('Cell', 'कोशिका', 'ಕೋಶ') },
    { id: 'mito', name: t('Mitochondrion', 'माइटोकॉन्ड्रिया', 'ಮೈಟೊಕಾಂಡ್ರಿಯ') },
    { id: 'chain', name: t('Electron transport chain', 'इलेक्ट्रॉन परिवहन शृंखला', 'ಇಲೆಕ್ಟ್ರಾನ್ ಸಾಗಣೆ ಸರಪಳಿ') },
    { id: 'molecules', name: t('Molecules', 'अणु', 'ಅಣುಗಳು') },
  ],
  parts: [
    { id: 'membrane', group: 'cell', color: '#d8b4a6', name: t('Cell membrane', 'कोशिका झिल्ली', 'ಕೋಶ ಪೊರೆ'), info: t('Lets glucose and oxygen in, and carbon dioxide out.', 'ग्लूकोज़ और ऑक्सीजन को अंदर और कार्बन डाइऑक्साइड को बाहर जाने देती है।', 'ಗ್ಲೂಕೋಸ್ ಮತ್ತು ಆಮ್ಲಜನಕವನ್ನು ಒಳಗೆ, ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡನ್ನು ಹೊರಗೆ ಬಿಡುತ್ತದೆ.') },
    { id: 'nucleus', group: 'cell', color: '#7d68a6', name: t('Nucleus', 'केंद्रक', 'ಕೋಶಕೇಂದ್ರ'), info: t('Controls the cell.', 'कोशिका को नियंत्रित करता है।', 'ಕೋಶವನ್ನು ನಿಯಂತ್ರಿಸುತ್ತದೆ.') },
    { id: 'cytoplasm', group: 'cell', color: '#8a6a66', name: t('Cytoplasm', 'कोशिकाद्रव्य', 'ಕೋಶದ್ರವ್ಯ'), info: t('The jelly-like fluid of the cell, where glycolysis happens.', 'कोशिका का जेली जैसा द्रव, जहाँ ग्लाइकोलाइसिस होता है।', 'ಕೋಶದ ಲೋಳೆಯಂತಹ ದ್ರವ; ಗ್ಲೈಕೊಲಿಸಿಸ್ ಇಲ್ಲಿ ನಡೆಯುತ್ತದೆ.') },
    { id: 'mitochondria', group: 'cell', color: '#c46a4f', name: t('Mitochondria', 'माइटोकॉन्ड्रिया', 'ಮೈಟೊಕಾಂಡ್ರಿಯಗಳು'), info: t('The powerhouses of the cell, where aerobic respiration releases most of the energy.', 'कोशिका के ऊर्जा घर, जहाँ वायवीय श्वसन से अधिकांश ऊर्जा मुक्त होती है।', 'ಕೋಶದ ಶಕ್ತಿ ಕೇಂದ್ರಗಳು; ವಾಯುವಿಕ ಉಸಿರಾಟ ಹೆಚ್ಚಿನ ಶಕ್ತಿಯನ್ನು ಇಲ್ಲಿ ಬಿಡುಗಡೆ ಮಾಡುತ್ತದೆ.') },
    { id: 'enzymes', group: 'cell', color: '#7f9a86', name: t('Enzymes of glycolysis', 'ग्लाइकोलाइसिस के एंजाइम', 'ಗ್ಲೈಕೊಲಿಸಿಸ್ ಕಿಣ್ವಗಳು'), info: t('Ten enzymes break glucose down step by step.', 'दस एंजाइम ग्लूकोज़ को चरण-दर-चरण तोड़ते हैं।', 'ಹತ್ತು ಕಿಣ್ವಗಳು ಗ್ಲೂಕೋಸನ್ನು ಹಂತ ಹಂತವಾಗಿ ವಿಭಜಿಸುತ್ತವೆ.') },
    { id: 'outer_membrane', group: 'mito', color: '#c97a5a', name: t('Outer membrane', 'बाहरी झिल्ली', 'ಹೊರಪೊರೆ'), info: t('A smooth membrane around the mitochondrion.', 'माइटोकॉन्ड्रिया के चारों ओर एक चिकनी झिल्ली।', 'ಮೈಟೊಕಾಂಡ್ರಿಯದ ಸುತ್ತ ನಯವಾದ ಪೊರೆ.') },
    { id: 'cristae', group: 'mito', color: '#e0957a', name: t('Inner membrane (cristae)', 'भीतरी झिल्ली (क्रिस्टी)', 'ಒಳಪೊರೆ (ಕ್ರಿಸ್ಟೇ)'), info: t('Folded many times to make room for the electron transport chain and ATP synthase.', 'इलेक्ट्रॉन परिवहन शृंखला और ATP सिंथेज़ के लिए जगह बनाने हेतु कई बार मुड़ी हुई।', 'ಇಲೆಕ್ಟ್ರಾನ್ ಸಾಗಣೆ ಸರಪಳಿ ಮತ್ತು ATP ಸಿಂಥೇಸ್‌ಗೆ ಜಾಗ ಮಾಡಲು ಹಲವು ಬಾರಿ ಮಡಿಚಲಾಗಿದೆ.') },
    { id: 'matrix', group: 'mito', color: '#7a3e36', name: t('Matrix', 'मैट्रिक्स', 'ಮ್ಯಾಟ್ರಿಕ್ಸ್'), info: t('The fluid inside the inner membrane, where the Krebs cycle runs.', 'भीतरी झिल्ली के अंदर का द्रव, जहाँ क्रेब्स चक्र चलता है।', 'ಒಳಪೊರೆಯೊಳಗಿನ ದ್ರವ; ಕ್ರೆಬ್ಸ್ ಚಕ್ರ ಇಲ್ಲಿ ನಡೆಯುತ್ತದೆ.') },
    { id: 'ims', group: 'mito', color: '#b07a6a', name: t('Space between the membranes', 'झिल्लियों के बीच का स्थान', 'ಪೊರೆಗಳ ನಡುವಿನ ಜಾಗ'), info: t('H⁺ ions are pumped in here and build up.', 'H⁺ आयन यहाँ पंप होकर जमा होते हैं।', 'H⁺ ಅಯಾನುಗಳು ಇಲ್ಲಿಗೆ ಪಂಪ್ ಆಗಿ ಸಂಗ್ರಹವಾಗುತ್ತವೆ.') },
    { id: 'complex1', group: 'chain', color: '#8a6fae', name: t('Complex I', 'कॉम्प्लेक्स I', 'ಕಾಂಪ್ಲೆಕ್ಸ್ I'), info: t('Takes electrons from NADH and pumps H⁺.', 'NADH से इलेक्ट्रॉन लेता है और H⁺ पंप करता है।', 'NADH ನಿಂದ ಇಲೆಕ್ಟ್ರಾನ್ ಪಡೆದು H⁺ ಪಂಪ್ ಮಾಡುತ್ತದೆ.') },
    { id: 'complex2', group: 'chain', color: '#c2a35a', name: t('Complex II', 'कॉम्प्लेक्स II', 'ಕಾಂಪ್ಲೆಕ್ಸ್ II'), info: t('Takes electrons from FADH₂.', 'FADH₂ से इलेक्ट्रॉन लेता है।', 'FADH₂ ನಿಂದ ಇಲೆಕ್ಟ್ರಾನ್ ಪಡೆಯುತ್ತದೆ.') },
    { id: 'complex3', group: 'chain', color: '#4f8fa0', name: t('Complex III', 'कॉम्प्लेक्स III', 'ಕಾಂಪ್ಲೆಕ್ಸ್ III'), info: t('Passes electrons on to cytochrome c and pumps H⁺.', 'इलेक्ट्रॉन साइटोक्रोम c को देता है और H⁺ पंप करता है।', 'ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳನ್ನು ಸೈಟೋಕ್ರೋಮ್ c ಗೆ ನೀಡಿ H⁺ ಪಂಪ್ ಮಾಡುತ್ತದೆ.') },
    { id: 'complex4', group: 'chain', color: '#6f9f6a', name: t('Complex IV', 'कॉम्प्लेक्स IV', 'ಕಾಂಪ್ಲೆಕ್ಸ್ IV'), info: t('Gives the electrons to oxygen, making water, and pumps H⁺.', 'इलेक्ट्रॉन ऑक्सीजन को देकर जल बनाता है, और H⁺ पंप करता है।', 'ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳನ್ನು ಆಮ್ಲಜನಕಕ್ಕೆ ನೀಡಿ ನೀರು ತಯಾರಿಸುತ್ತದೆ; H⁺ ಪಂಪ್ ಮಾಡುತ್ತದೆ.') },
    { id: 'atp_synthase', group: 'chain', color: '#a8574d', name: t('ATP synthase', 'ATP सिंथेज़', 'ATP ಸಿಂಥೇಸ್'), info: t('A rotary enzyme driven by H⁺ flowing through it; it makes ATP.', 'इससे होकर बहते H⁺ से चलने वाला घूर्णी एंजाइम; यह ATP बनाता है।', 'ಇದರ ಮೂಲಕ ಹರಿಯುವ H⁺ ನಿಂದ ತಿರುಗುವ ಕಿಣ್ವ; ಇದು ATP ತಯಾರಿಸುತ್ತದೆ.') },
    { id: 'glucose', group: 'molecules', color: '#f0e2b8', name: t('Glucose', 'ग्लूकोज़', 'ಗ್ಲೂಕೋಸ್'), info: t('C₆H₁₂O₆, the fuel.', 'C₆H₁₂O₆, ईंधन।', 'C₆H₁₂O₆, ಇಂಧನ.') },
    { id: 'pyruvate', group: 'molecules', color: '#d9b06a', name: t('Pyruvate', 'पाइरुवेट', 'ಪೈರುವೇಟ್'), info: t('A three-carbon molecule; glycolysis makes two from each glucose.', 'तीन-कार्बन अणु; ग्लाइकोलाइसिस हर ग्लूकोज़ से दो बनाता है।', 'ಮೂರು-ಕಾರ್ಬನ್ ಅಣು; ಗ್ಲೈಕೊಲಿಸಿಸ್ ಪ್ರತಿ ಗ್ಲೂಕೋಸ್‌ನಿಂದ ಎರಡು ತಯಾರಿಸುತ್ತದೆ.') },
    { id: 'acetyl_coa', group: 'molecules', color: '#c9a64a', name: t('Acetyl-CoA', 'एसिटाइल-CoA', 'ಅಸಿಟೈಲ್-CoA'), info: t('Carries two carbons into the Krebs cycle.', 'दो कार्बन क्रेब्स चक्र में ले जाता है।', 'ಎರಡು ಕಾರ್ಬನ್‌ಗಳನ್ನು ಕ್ರೆಬ್ಸ್ ಚಕ್ರಕ್ಕೆ ಒಯ್ಯುತ್ತದೆ.') },
    { id: 'citrate', group: 'molecules', color: '#9a7bd0', name: t('Citric acid (6 carbons)', 'साइट्रिक अम्ल (6 कार्बन)', 'ಸಿಟ್ರಿಕ್ ಆಮ್ಲ (6 ಕಾರ್ಬನ್)'), info: t('Formed when acetyl-CoA joins the four-carbon acid.', 'एसिटाइल-CoA के चार-कार्बन अम्ल से जुड़ने पर बनता है।', 'ಅಸಿಟೈಲ್-CoA ನಾಲ್ಕು-ಕಾರ್ಬನ್ ಆಮ್ಲದೊಂದಿಗೆ ಸೇರಿದಾಗ ಉಂಟಾಗುತ್ತದೆ.') },
    { id: 'co2', group: 'molecules', color: '#3c4046', name: t('Carbon dioxide (CO₂)', 'कार्बन डाइऑक्साइड (CO₂)', 'ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ (CO₂)'), info: t('The waste carbon, breathed out.', 'अपशिष्ट कार्बन, जो साँस से बाहर जाता है।', 'ತ್ಯಾಜ್ಯ ಇಂಗಾಲ; ಉಸಿರಿನಿಂದ ಹೊರಹೋಗುತ್ತದೆ.') },
    { id: 'nadh', group: 'molecules', color: '#4fb3a5', name: t('NADH and FADH₂', 'NADH और FADH₂', 'NADH ಮತ್ತು FADH₂'), info: t('Carry high-energy electrons to the electron transport chain.', 'उच्च ऊर्जा वाले इलेक्ट्रॉन इलेक्ट्रॉन परिवहन शृंखला तक ले जाते हैं।', 'ಹೆಚ್ಚಿನ ಶಕ್ತಿಯ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳನ್ನು ಸಾಗಣೆ ಸರಪಳಿಗೆ ಒಯ್ಯುತ್ತವೆ.') },
    { id: 'atp', group: 'molecules', color: '#e08d2b', name: t('ATP', 'ATP', 'ATP'), info: t('The cell’s energy currency.', 'कोशिका की ऊर्जा मुद्रा।', 'ಕೋಶದ ಶಕ್ತಿಯ ನಾಣ್ಯ.') },
    { id: 'oxygen', group: 'molecules', color: '#c9473d', name: t('Oxygen (O₂)', 'ऑक्सीजन (O₂)', 'ಆಮ್ಲಜನಕ (O₂)'), info: t('Accepts the electrons at the end of the chain.', 'शृंखला के अंत में इलेक्ट्रॉन ग्रहण करती है।', 'ಸರಪಳಿಯ ಕೊನೆಯಲ್ಲಿ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳನ್ನು ಸ್ವೀಕರಿಸುತ್ತದೆ.') },
    { id: 'water', group: 'molecules', color: '#5aa0e0', name: t('Water (H₂O)', 'जल (H₂O)', 'ನೀರು (H₂O)'), info: t('Made from oxygen, electrons and H⁺.', 'ऑक्सीजन, इलेक्ट्रॉनों और H⁺ से बनता है।', 'ಆಮ್ಲಜನಕ, ಇಲೆಕ್ಟ್ರಾನ್ ಮತ್ತು H⁺ ನಿಂದ ತಯಾರಾಗುತ್ತದೆ.') },
    { id: 'electron', group: 'molecules', color: '#7fe3ff', name: t('Electrons', 'इलेक्ट्रॉन', 'ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳು'), info: t('Their energy pumps the H⁺ ions.', 'इनकी ऊर्जा H⁺ आयनों को पंप करती है।', 'ಇವುಗಳ ಶಕ್ತಿ H⁺ ಅಯಾನುಗಳನ್ನು ಪಂಪ್ ಮಾಡುತ್ತದೆ.') },
    { id: 'hion', group: 'molecules', color: '#ff9e7a', name: t('Hydrogen ions (H⁺)', 'हाइड्रोजन आयन (H⁺)', 'ಹೈಡ್ರೋಜನ್ ಅಯಾನುಗಳು (H⁺)'), info: t('Pumped between the membranes; flowing back, they drive ATP synthase.', 'झिल्लियों के बीच पंप होते हैं; लौटते समय ATP सिंथेज़ को चलाते हैं।', 'ಪೊರೆಗಳ ನಡುವೆ ಪಂಪ್ ಆಗುತ್ತವೆ; ಮರಳುವಾಗ ATP ಸಿಂಥೇಸ್ ಅನ್ನು ನಡೆಸುತ್ತವೆ.') },
    { id: 'lactate', group: 'molecules', color: '#e0c08a', name: t('Lactic acid', 'लैक्टिक अम्ल', 'ಲ್ಯಾಕ್ಟಿಕ್ ಆಮ್ಲ'), info: t('Made from pyruvate in muscles short of oxygen.', 'ऑक्सीजन की कमी वाली पेशियों में पाइरुवेट से बनता है।', 'ಆಮ್ಲಜನಕದ ಕೊರತೆಯಿರುವ ಸ್ನಾಯುಗಳಲ್ಲಿ ಪೈರುವೇಟ್‌ನಿಂದ ತಯಾರಾಗುತ್ತದೆ.') },
  ],
  steps: [
    {
      id: 'cell', stage: 'cell', seconds: 11,
      camera: { pos: [4.6, 2.8, 9.2], target: [0, 0.1, 0], from: [8, 5, 17] },
      highlight: ['mitochondria'], labels: ['membrane', 'nucleus', 'mitochondria', 'glucose', 'oxygen'],
      title: t('Energy from food', 'भोजन से ऊर्जा', 'ಆಹಾರದಿಂದ ಶಕ್ತಿ'),
      caption: t(
        'Every living cell releases energy from food by respiration. Glucose and oxygen go in; carbon dioxide and water come out, and the energy is stored as ATP.',
        'हर जीवित कोशिका श्वसन द्वारा भोजन से ऊर्जा मुक्त करती है। ग्लूकोज़ और ऑक्सीजन अंदर जाते हैं; कार्बन डाइऑक्साइड और जल बाहर आते हैं, और ऊर्जा ATP के रूप में जमा होती है।',
        'ಪ್ರತಿಯೊಂದು ಜೀವಕೋಶವೂ ಉಸಿರಾಟದ ಮೂಲಕ ಆಹಾರದಿಂದ ಶಕ್ತಿಯನ್ನು ಬಿಡುಗಡೆ ಮಾಡುತ್ತದೆ. ಗ್ಲೂಕೋಸ್ ಮತ್ತು ಆಮ್ಲಜನಕ ಒಳಗೆ ಹೋಗುತ್ತವೆ; ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ ಮತ್ತು ನೀರು ಹೊರಬರುತ್ತವೆ, ಮತ್ತು ಶಕ್ತಿ ATP ರೂಪದಲ್ಲಿ ಸಂಗ್ರಹವಾಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'glycolysis', stage: 'cytosol', seconds: 14,
      camera: { pos: [0.2, 1.8, 8.4], target: [0.2, 0.1, 0], from: [0, 3, 16] },
      highlight: ['enzymes'], labels: ['glucose', 'enzymes', 'pyruvate', 'atp', 'nadh'],
      title: t('Glycolysis', 'ग्लाइकोलाइसिस', 'ಗ್ಲೈಕೊಲಿಸಿಸ್'),
      caption: t(
        'In the cytoplasm, glucose (6 carbons) is split into two pyruvate molecules (3 carbons each). This needs no oxygen and gives a small gain of 2 ATP and 2 NADH.',
        'कोशिकाद्रव्य में ग्लूकोज़ (6 कार्बन) दो पाइरुवेट अणुओं (3-3 कार्बन) में टूट जाता है। इसमें ऑक्सीजन की ज़रूरत नहीं होती और 2 ATP व 2 NADH का छोटा लाभ मिलता है।',
        'ಕೋಶದ್ರವ್ಯದಲ್ಲಿ ಗ್ಲೂಕೋಸ್ (6 ಕಾರ್ಬನ್) ಎರಡು ಪೈರುವೇಟ್ ಅಣುಗಳಾಗಿ (ತಲಾ 3 ಕಾರ್ಬನ್) ವಿಭಜನೆಯಾಗುತ್ತದೆ. ಇದಕ್ಕೆ ಆಮ್ಲಜನಕ ಬೇಕಿಲ್ಲ; 2 ATP ಮತ್ತು 2 NADH ನ ಸಣ್ಣ ಲಾಭ ಸಿಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'mitochondrion', stage: 'mito', seconds: 12,
      camera: { pos: [3.0, 3.8, 8.0], target: [0, -0.2, 0], from: [2, 5, 16] },
      highlight: ['cristae'], labels: ['outer_membrane', 'cristae', 'matrix', 'ims'],
      title: t('The mitochondrion', 'माइटोकॉन्ड्रिया', 'ಮೈಟೊಕಾಂಡ್ರಿಯ'),
      caption: t(
        'With oxygen, pyruvate goes on into a mitochondrion. Its smooth outer membrane encloses an inner membrane folded into cristae, around a fluid called the matrix.',
        'ऑक्सीजन होने पर पाइरुवेट माइटोकॉन्ड्रिया में जाता है। इसकी चिकनी बाहरी झिल्ली के अंदर एक भीतरी झिल्ली होती है जो क्रिस्टी नामक तहों में मुड़ी होती है; इसके बीच मैट्रिक्स नामक द्रव होता है।',
        'ಆಮ್ಲಜನಕವಿದ್ದಾಗ ಪೈರುವೇಟ್ ಮೈಟೊಕಾಂಡ್ರಿಯದೊಳಗೆ ಹೋಗುತ್ತದೆ. ಇದರ ನಯವಾದ ಹೊರಪೊರೆಯೊಳಗೆ ಕ್ರಿಸ್ಟೇ ಎಂಬ ಮಡಿಕೆಗಳಾಗಿ ಮಡಿಚಿದ ಒಳಪೊರೆಯಿದೆ; ಅದರ ನಡುವೆ ಮ್ಯಾಟ್ರಿಕ್ಸ್ ಎಂಬ ದ್ರವವಿದೆ.',
      ),
    },
    {
      id: 'link', stage: 'mito', seconds: 11,
      camera: { pos: [-2.2, 2.4, 5.6], target: [-1.6, -0.3, 0.4] },
      highlight: [], labels: ['pyruvate', 'acetyl_coa', 'co2', 'matrix'],
      title: t('Into the matrix', 'मैट्रिक्स में', 'ಮ್ಯಾಟ್ರಿಕ್ಸ್‌ನೊಳಗೆ'),
      caption: t(
        'In the matrix, each pyruvate loses one carbon as carbon dioxide and becomes acetyl-CoA, which feeds the Krebs cycle.',
        'मैट्रिक्स में हर पाइरुवेट एक कार्बन को कार्बन डाइऑक्साइड के रूप में खोकर एसिटाइल-CoA बन जाता है, जो क्रेब्स चक्र में जाता है।',
        'ಮ್ಯಾಟ್ರಿಕ್ಸ್‌ನಲ್ಲಿ ಪ್ರತಿಯೊಂದು ಪೈರುವೇಟ್ ಒಂದು ಕಾರ್ಬನ್ ಅನ್ನು ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ ಆಗಿ ಕಳೆದುಕೊಂಡು ಅಸಿಟೈಲ್-CoA ಆಗುತ್ತದೆ; ಅದು ಕ್ರೆಬ್ಸ್ ಚಕ್ರಕ್ಕೆ ಸೇರುತ್ತದೆ.',
      ),
    },
    {
      id: 'krebs', stage: 'matrix', seconds: 15,
      camera: { pos: [0.3, 3.2, 8.2], target: [0.2, -0.1, 0], from: [0.5, 6, 16], drift: 0.02 },
      highlight: [], labels: ['acetyl_coa', 'citrate', 'co2', 'nadh', 'atp'],
      title: t('The Krebs cycle', 'क्रेब्स चक्र', 'ಕ್ರೆಬ್ಸ್ ಚಕ್ರ'),
      caption: t(
        'Acetyl-CoA joins a four-carbon acid to make citric acid. Turn by turn, the cycle releases the carbons as CO₂ and loads high-energy electrons onto NADH and FADH₂, making a little ATP too.',
        'एसिटाइल-CoA एक चार-कार्बन अम्ल से जुड़कर साइट्रिक अम्ल बनाता है। हर चक्कर में यह चक्र कार्बनों को CO₂ के रूप में छोड़ता है और उच्च ऊर्जा वाले इलेक्ट्रॉनों को NADH और FADH₂ पर लादता है; थोड़ा ATP भी बनता है।',
        'ಅಸಿಟೈಲ್-CoA ಒಂದು ನಾಲ್ಕು-ಕಾರ್ಬನ್ ಆಮ್ಲದೊಂದಿಗೆ ಸೇರಿ ಸಿಟ್ರಿಕ್ ಆಮ್ಲವಾಗುತ್ತದೆ. ಪ್ರತಿ ಸುತ್ತಿನಲ್ಲಿ ಈ ಚಕ್ರ ಕಾರ್ಬನ್‌ಗಳನ್ನು CO₂ ಆಗಿ ಬಿಡುತ್ತದೆ ಮತ್ತು ಹೆಚ್ಚಿನ ಶಕ್ತಿಯ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳನ್ನು NADH ಮತ್ತು FADH₂ ಮೇಲೆ ಹೇರುತ್ತದೆ; ಸ್ವಲ್ಪ ATP ಕೂಡ ತಯಾರಾಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'chain', stage: 'crista', seconds: 15,
      camera: { pos: [-0.8, 1.9, 9.0], target: [-0.6, -0.3, 0], from: [-1, 4, 16], drift: 0.012 },
      highlight: ['complex1', 'complex3', 'complex4'], labels: ['complex1', 'complex2', 'complex3', 'complex4', 'nadh', 'electron'],
      title: t('The electron transport chain', 'इलेक्ट्रॉन परिवहन शृंखला', 'ಇಲೆಕ್ಟ್ರಾನ್ ಸಾಗಣೆ ಸರಪಳಿ'),
      caption: t(
        'NADH and FADH₂ hand their electrons to a chain of proteins in the inner membrane. As the electrons pass along, their energy pumps H⁺ ions out into the space between the membranes.',
        'NADH और FADH₂ अपने इलेक्ट्रॉन भीतरी झिल्ली में प्रोटीनों की एक शृंखला को देते हैं। इलेक्ट्रॉनों के आगे बढ़ने पर उनकी ऊर्जा H⁺ आयनों को दोनों झिल्लियों के बीच के स्थान में पंप करती है।',
        'NADH ಮತ್ತು FADH₂ ತಮ್ಮ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳನ್ನು ಒಳಪೊರೆಯಲ್ಲಿರುವ ಪ್ರೋಟೀನ್‌ಗಳ ಸರಪಳಿಗೆ ನೀಡುತ್ತವೆ. ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳು ಮುಂದೆ ಸಾಗುವಾಗ ಅವುಗಳ ಶಕ್ತಿ H⁺ ಅಯಾನುಗಳನ್ನು ಎರಡು ಪೊರೆಗಳ ನಡುವಿನ ಜಾಗಕ್ಕೆ ಪಂಪ್ ಮಾಡುತ್ತದೆ.',
      ),
    },
    {
      id: 'oxygen', stage: 'crista', seconds: 12,
      camera: { pos: [2.8, -1.3, 5.2], target: [1.5, -0.6, 0.3] },
      highlight: ['complex4'], labels: ['complex4', 'oxygen', 'water', 'electron'],
      title: t('Oxygen, the last acceptor', 'ऑक्सीजन, अंतिम ग्राही', 'ಆಮ್ಲಜನಕ, ಕೊನೆಯ ಸ್ವೀಕಾರಕ'),
      caption: t(
        'At the end of the chain, oxygen accepts the electrons and joins with H⁺ to form water. This is why we need to breathe oxygen.',
        'शृंखला के अंत में ऑक्सीजन इलेक्ट्रॉनों को ग्रहण करती है और H⁺ से मिलकर जल बनाती है। इसीलिए हमें साँस से ऑक्सीजन लेनी पड़ती है।',
        'ಸರಪಳಿಯ ಕೊನೆಯಲ್ಲಿ ಆಮ್ಲಜನಕ ಇಲೆಕ್ಟ್ರಾನ್‌ಗಳನ್ನು ಸ್ವೀಕರಿಸಿ H⁺ ನೊಂದಿಗೆ ಸೇರಿ ನೀರಾಗುತ್ತದೆ. ಅದಕ್ಕಾಗಿಯೇ ನಾವು ಆಮ್ಲಜನಕವನ್ನು ಉಸಿರಾಡಬೇಕು.',
      ),
    },
    {
      id: 'atp', stage: 'crista', seconds: 13,
      camera: { pos: [6.0, -0.7, 5.4], target: [3.9, -0.6, 0.2] },
      highlight: ['atp_synthase'], labels: ['atp_synthase', 'hion', 'atp'],
      title: t('Most ATP is made here', 'अधिकांश ATP यहीं बनता है', 'ಹೆಚ್ಚಿನ ATP ಇಲ್ಲೇ ತಯಾರಾಗುತ್ತದೆ'),
      caption: t(
        'H⁺ ions rush back into the matrix through ATP synthase, turning it like a turbine. About 34 of the 38 ATP from one glucose are made this way.',
        'H⁺ आयन ATP सिंथेज़ से होकर तेज़ी से मैट्रिक्स में लौटते हैं और उसे टरबाइन की तरह घुमाते हैं। एक ग्लूकोज़ से बनने वाले 38 ATP में से लगभग 34 इसी तरह बनते हैं।',
        'H⁺ ಅಯಾನುಗಳು ATP ಸಿಂಥೇಸ್ ಮೂಲಕ ಮ್ಯಾಟ್ರಿಕ್ಸ್‌ಗೆ ವೇಗವಾಗಿ ಮರಳಿ ಅದನ್ನು ಟರ್ಬೈನಿನಂತೆ ತಿರುಗಿಸುತ್ತವೆ. ಒಂದು ಗ್ಲೂಕೋಸ್‌ನಿಂದ ಸಿಗುವ 38 ATP ಗಳಲ್ಲಿ ಸುಮಾರು 34 ಹೀಗೆಯೇ ತಯಾರಾಗುತ್ತವೆ.',
      ),
    },
    {
      id: 'anaerobic', stage: 'cytosol', seconds: 14,
      camera: { pos: [4.6, 1.3, 5.8], target: [3.0, 0.0, 0], from: [8, 3, 12] },
      highlight: [], labels: ['pyruvate', 'lactate'],
      title: t('Without oxygen', 'ऑक्सीजन के बिना', 'ಆಮ್ಲಜನಕವಿಲ್ಲದೆ'),
      caption: t(
        'When oxygen runs short, as in a hard-working muscle, pyruvate is turned into lactic acid instead, which causes cramps. Yeast makes ethanol and carbon dioxide. Far less ATP is made.',
        'जब ऑक्सीजन कम पड़ जाती है, जैसे ज़ोर से काम करती पेशी में, तब पाइरुवेट लैक्टिक अम्ल में बदल जाता है, जिससे ऐंठन होती है। यीस्ट एथेनॉल और कार्बन डाइऑक्साइड बनाता है। इसमें ATP बहुत कम बनता है।',
        'ಹೆಚ್ಚು ಕೆಲಸ ಮಾಡುವ ಸ್ನಾಯುವಿನಂತೆ ಆಮ್ಲಜನಕ ಕಡಿಮೆಯಾದಾಗ, ಪೈರುವೇಟ್ ಲ್ಯಾಕ್ಟಿಕ್ ಆಮ್ಲವಾಗಿ ಬದಲಾಗುತ್ತದೆ; ಇದರಿಂದ ಸೆಳೆತ ಉಂಟಾಗುತ್ತದೆ. ಯೀಸ್ಟ್ ಎಥೆನಾಲ್ ಮತ್ತು ಇಂಗಾಲದ ಡೈಆಕ್ಸೈಡ್ ತಯಾರಿಸುತ್ತದೆ. ಇದರಲ್ಲಿ ATP ತುಂಬಾ ಕಡಿಮೆ ಸಿಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'summary', stage: 'cell', seconds: 12,
      camera: { pos: [5.2, 2.2, 10.0], target: [0, 0, 0], from: [1, 0.5, 3] },
      highlight: ['mitochondria'], labels: ['glucose', 'oxygen', 'co2', 'water', 'mitochondria'],
      title: t('In short', 'संक्षेप में', 'ಸಂಕ್ಷಿಪ್ತವಾಗಿ'),
      caption: t(
        'C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + energy (ATP). Respiration is the reverse of photosynthesis: it releases the energy that plants stored in sugar.',
        'C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + ऊर्जा (ATP)। श्वसन प्रकाश संश्लेषण का उलटा है: यह उस ऊर्जा को मुक्त करता है जो पौधों ने शर्करा में जमा की थी।',
        'C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + ಶಕ್ತಿ (ATP). ಉಸಿರಾಟವು ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆಯ ವಿರುದ್ಧ ಕ್ರಿಯೆ: ಸಸ್ಯಗಳು ಸಕ್ಕರೆಯಲ್ಲಿ ಸಂಗ್ರಹಿಸಿದ ಶಕ್ತಿಯನ್ನು ಇದು ಬಿಡುಗಡೆ ಮಾಡುತ್ತದೆ.',
      ),
    },
  ],
};

// ------------------------------------------------------------------ builder

export async function build(k) {
  const stages = { cell: buildCell(k), cytosol: buildCytosol(k), mito: buildMito(k), matrix: buildMatrix(k), crista: buildCrista(k) };
  return { update: (s) => stages[s.stage]?.(s) };
}

/** Markers that follow chosen molecules, named [ids]. */
function markers(k, stage, ids) {
  const at = {};
  for (const id of ids) {
    at[id] = new THREE.Vector3();
    k.marker(id, stage, (out) => (at[id].lengthSq() ? out.copy(at[id]) : null), 0.15);
  }
  at.clear = () => ids.forEach((id) => at[id].set(0, 0, 0));
  return at;
}

/** A mitochondrion's outside: a capsule with ridges, for the cell view. */
function mitoGeometry(len, r) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const a = -Math.PI / 2 + (i / 24) * Math.PI;
    const y = Math.sin(a) * (len / 2 - r) + Math.sign(Math.sin(a)) * 0 + Math.sin(a) * r;
    pts.push([Math.cos(a) * r * (1 + 0.04 * Math.sin(i * 1.7)), y]);
  }
  return blobify(lathe(pts, { segments: 20 }));
}
function blobify(g) {
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ the cell

function buildCell(k) {
  const stage = k.stage('cell');
  const rnd = seeded(41);
  const R = 3.0;
  const hole = (th, ph) => th < Math.PI * 0.55 && (ph < 1.1 || ph > Math.PI * 2 - 1.1);
  const membrane = new THREE.Group();
  membrane.add(
    new THREE.Mesh(shellWithWindow(R, R * 0.92, R, hole, 96, 48), mat({ color: '#cfa597', rough: 0.4, clearcoat: 0.4, sheen: 0.3, sheenColor: '#f0c8b8', rim: 0.35, rimColor: '#ffd8c8', opacity: 0.5, side: THREE.DoubleSide })),
  );
  stage.add(membrane);
  k.part('membrane', membrane, { anchor: [-2.4, 1.6, 1.2] });
  const cyto = new THREE.Mesh(shellWithWindow(R * 0.97, R * 0.89, R * 0.97, (th, ph) => hole(th, ph) || th < 0.9), mat({ color: '#5e3f3f', rough: 0.8, sheen: 0.2, rim: 0.05, opacity: 0.75, side: THREE.BackSide }));
  stage.add(cyto);
  k.part('cytoplasm', cyto, { anchor: [1.8, -1.6, -1.0] });

  const nucleus = new THREE.Group();
  nucleus.add(new THREE.Mesh(blob(0.95, 0.85, 0.9, { detail: 28, amp: 0.04, freq: 2.5 }), mat({ color: '#6f5a98', rough: 0.45, clearcoat: 0.3, sheen: 0.3, sheenColor: '#b8a8e0', rim: 0.2 })));
  const nl = new THREE.Mesh(blob(0.28, 0.26, 0.27, { detail: 12 }), mat({ color: '#43336f', rough: 0.4 }));
  nl.position.set(0.3, 0.25, 0.65);
  nucleus.add(nl);
  nucleus.position.set(-0.9, 0.2, -1.0);
  stage.add(nucleus);
  k.part('nucleus', nucleus);

  // Mitochondria scattered in the cytoplasm.
  const mGeo = mitoGeometry(1.0, 0.24);
  const list = [];
  const spots = [[1.2, 0.6, -0.3], [0.6, -1.0, 0.4], [1.8, -0.4, -1.2], [-0.2, -1.6, -0.8], [-1.9, -0.9, 0.1], [0.9, 1.5, -1.4], [-2.0, 1.0, -0.8], [1.9, 0.9, 0.9], [-0.6, 1.6, 0.2], [0.2, -0.3, -2.2]];
  for (const p of spots) list.push(trs(p, [rnd() * 3, rnd() * 3, rnd() * 3], 1));
  const mitos = instanced(mGeo, mat({ color: '#c46a4f', rough: 0.45, clearcoat: 0.35, sheen: 0.35, sheenColor: '#f0a080', rim: 0.25, rimColor: '#ffb090' }), list);
  stage.add(mitos);
  k.part('mitochondria', mitos, { anchor: [1.2, 0.6, -0.3] });

  // Endoplasmic reticulum and small granules, for a living interior.
  const er = new THREE.Group();
  const erMat = mat({ color: '#9a8aa8', rough: 0.5, sheen: 0.3, rim: 0.15 });
  for (let i = 0; i < 5; i++) {
    const a0 = rnd() * Math.PI * 2;
    const pts = Array.from({ length: 8 }, (_, j) => {
      const a = a0 + j * 0.35;
      const r = 1.25 + 0.15 * Math.sin(j * 1.3 + i);
      return [nucleus.position.x + Math.cos(a) * r, nucleus.position.y + (j - 4) * 0.12 + (i - 2) * 0.2, nucleus.position.z + Math.sin(a) * r];
    });
    const g = tube(pts, 0.045, { segments: 40, radial: 8 });
    g.scale(1, 0.55, 1);
    er.add(new THREE.Mesh(g, erMat));
  }
  er.traverse((o) => (o.userData.decor = true));
  stage.add(er);
  const dots = new GlowPoints(220, { size: 0.03 });
  dots.begin();
  for (let i = 0; i < 220; i++) {
    const a = rnd() * Math.PI * 2, b = Math.acos(rnd() * 2 - 1), r = Math.cbrt(rnd()) * R * 0.85;
    dots.push(Math.sin(b) * Math.cos(a) * r, Math.cos(b) * r * 0.9, Math.sin(b) * Math.sin(a) * r, 0.025, C('#f0d0c0'), 0.18);
  }
  dots.done();
  stage.add(dots);

  const swarm = new MoleculeSwarm(400, { scale: 0.07 });
  stage.add(swarm);
  const at = markers(k, stage, ['glucose', 'oxygen', 'co2', 'water']);
  const q = new THREE.Quaternion(), v = new THREE.Vector3();
  // What goes in and what comes out, through the membrane.
  const flows = [
    { kind: 'glucose', from: [-6.5, 2.6, 2.4], to: [-1.0, 0.6, 0.6], n: 3, sp: 0.06, id: 'glucose', s: 1.1 },
    { kind: 'O2', from: [-5.5, -2.6, 3.0], to: [0.8, -0.6, 0.2], n: 6, sp: 0.08, id: 'oxygen', s: 1.2 },
    { kind: 'CO2', from: [1.4, 0.4, 0.0], to: [6.5, 2.2, 2.6], n: 6, sp: 0.08, id: 'co2', s: 1.2 },
    { kind: 'H2O', from: [0.9, -0.8, 0.0], to: [6.0, -2.6, 2.6], n: 5, sp: 0.07, id: 'water', s: 1.2 },
  ];
  return (s) => {
    const T = s.T;
    at.clear();
    swarm.begin();
    for (const [fi, f] of flows.entries()) {
      for (let j = 0; j < f.n; j++) {
        const ph = fract(j / f.n + T * f.sp + fi * 0.13);
        v.set(...f.from).lerp(new THREE.Vector3(...f.to), ph);
        v.y += Math.sin(ph * Math.PI) * 0.5;
        const a = Math.min(smooth(ph / 0.1), smooth((1 - ph) / 0.1));
        swarm.put(f.kind, v, tumble(fi * 9 + j, T, 0.5, q), f.s * a);
        if (j === 1 && ph > 0.15 && ph < 0.85) at[f.id].copy(v);
      }
    }
    swarm.end();
  };
}

// ------------------------------------------------------------------ glycolysis, in the cytoplasm

function buildCytosol(k) {
  const stage = k.stage('cytosol');
  const rnd = seeded(43);
  // The enzymes along the way: two that use ATP, the one that splits, and those that make ATP and NADH.
  const E = [[-3.0, 0.0, 0], [-1.5, 0.0, 0], [0.0, 0.0, 0], [1.6, 0.75, 0], [1.6, -0.75, 0], [2.9, 0.75, 0], [2.9, -0.75, 0]];
  const colors = ['#7f9a86', '#8f8aa8', '#9a8a6a', '#6f8fa0', '#6f8fa0', '#9a7a7a', '#9a7a7a'];
  const enzymes = new THREE.Group();
  E.forEach(([x, y, z], i) => {
    const r = 0.34 + (i === 2 ? 0.08 : 0);
    const p = protein([[0, 0, 0, r, r * 0.9, r], [r * 0.55, r * 0.35, -r * 0.3, r * 0.6, r * 0.55, r * 0.6], [-r * 0.5, -r * 0.3, -r * 0.2, r * 0.55, r * 0.5, r * 0.5]], colors[i], { seed: 60 + i });
    p.position.set(x, y, z - 0.55);
    enzymes.add(p);
  });
  stage.add(enzymes);
  k.part('enzymes', enzymes, { anchor: [-1.5, 0.5, -0.4] });

  // A mitochondrion waiting in the distance, and the crowd of the cytoplasm.
  const far = new THREE.Group();
  const mito = new THREE.Mesh(mitoGeometry(5, 1.1), mat({ color: '#b5654c', rough: 0.45, clearcoat: 0.3, sheen: 0.3, rim: 0.2 }));
  mito.rotation.z = Math.PI / 2 + 0.2;
  mito.position.set(8.5, -0.5, -5);
  far.add(mito);
  const farColors = ['#7f8f7a', '#8f7f6a', '#6f7f9a', '#8a6f7f'];
  for (let i = 0; i < 18; i++) {
    const r = 0.25 + rnd() * 0.3;
    const p = protein([[0, 0, 0, r, r * (0.8 + rnd() * 0.3), r], [r * 0.7, r * 0.3, 0, r * 0.6, r * 0.55, r * 0.6]], farColors[i % 4], { seed: 80 + i, detail: 12 });
    p.position.set((rnd() - 0.5) * 18, (rnd() - 0.5) * 8, -3 - rnd() * 6);
    p.rotation.set(rnd() * 6, rnd() * 6, 0);
    far.add(p);
  }
  far.traverse((o) => (o.userData.decor = true));
  stage.add(far);

  const swarm = new MoleculeSwarm(1200, { scale: 0.075 });
  const glow = new GlowPoints(200, { size: 0.08 });
  stage.add(swarm, glow);
  // A faint trail along the pathway: one road, forking where glucose splits in two.
  const trail = new THREE.Group();
  for (const lane of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 40; i++) pts.push(path(i / 40, lane, new THREE.Vector3()).clone().add({ x: 0, y: 0, z: -0.15 }));
    trail.add(new THREE.Mesh(tube(pts, 0.02, { segments: 80, radial: 6 }), glowMat(0xe8c0a0, 0.16)));
  }
  trail.userData.decor = true;
  stage.add(trail);
  const at = markers(k, stage, ['glucose', 'pyruvate', 'atp', 'nadh', 'lactate']);
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), w = new THREE.Vector3();
  const PERIOD = 7;
  /** Where a molecule of the batch is at phase u (0..1 along the pathway); [lane] ±1 after the split. */
  function path(u, lane, out) {
    if (u < 0.45) {
      const x = lerp(-5.2, 0, u / 0.45);
      return out.set(x, 0.05 * Math.sin(u * 20), 0.1);
    }
    const x = lerp(0, 4.6, (u - 0.45) / 0.55);
    return out.set(x, lane * 0.75 * smooth((u - 0.45) / 0.12), 0.1);
  }
  const enzymeAt = [0.18, 0.31, 0.45, 0.66, 0.82];
  return (s) => {
    const T = s.T;
    at.clear();
    swarm.begin();
    glow.begin();
    const anaerobic = s.is('anaerobic');
    for (let b = 0; b < 3; b++) {
      const u = fract(T / PERIOD + b / 3);
      if (u < 0.45) {
        path(u, 0, v);
        // Glucose becomes a phosphorylated six-carbon sugar after the first enzymes.
        swarm.put(u < 0.18 ? 'glucose' : 'C6', v, tumble(b, T, 0.4, q), 1.1);
        if (b === 0) at.glucose.copy(v);
      } else {
        for (const lane of [-1, 1]) {
          path(u, lane, v);
          const kind = u < 0.82 ? 'C3' : 'pyruvate';
          if (anaerobic && u > 0.9) {
            // No oxygen: pyruvate takes the NADH's hydrogen and becomes lactic acid.
            swarm.put('lactate', v, tumble(b * 3 + lane, T, 0.4, q), 1.2);
            if (lane === 1 && b === 0) at.lactate.copy(v);
          } else {
            swarm.put(kind, v, tumble(b * 3 + lane, T, 0.4, q), 1.2);
            if (kind === 'pyruvate' && lane === 1 && !at.pyruvate.lengthSq()) at.pyruvate.copy(v);
          }
        }
      }
      // At each enzyme: ATP spent (first two), ATP and NADH made (after the split).
      for (const [ei, eu] of enzymeAt.entries()) {
        const d = u - eu;
        if (d < -0.06 || d > 0.12) continue;
        const k2 = (d + 0.06) / 0.18;
        const ex = E[Math.min(E.length - 1, ei < 3 ? ei : ei === 3 ? 3 : 5)];
        for (const lane of ei < 3 ? [0] : [-1, 1]) {
          const ey = ei < 3 ? 0 : lane * 0.75;
          if (ei < 2) {
            // ATP comes in from above and leaves as ADP.
            w.set(ex[0] - 0.2, ey + 1.8 - 1.4 * Math.min(1, k2 * 1.6), 0.4);
            swarm.put(k2 < 0.6 ? 'ATP' : 'ADP', w, tumble(ei + b * 5, T, 0.5, q), 0.9);
            if (k2 > 0.6) w.y += (k2 - 0.6) * 2;
          } else if (ei >= 3) {
            w.set(ex[0] + 0.2, ey + lane * (0.6 + 1.2 * k2), 0.45);
            swarm.put(ei === 3 ? 'NADH' : 'ATP', w, tumble(ei + b * 5 + lane, T, 0.5, q), 0.9 * (1 - smooth((k2 - 0.85) / 0.15)));
            if (ei === 4 && lane === -1) at.atp.copy(w);
            if (ei === 3 && lane === 1) at.nadh.copy(w);
          }
          if (Math.abs(d) < 0.02) glow.push(ex[0], ey, 0.2, 0.7, COL.spark, 0.5 * (1 - Math.abs(d) / 0.02));
        }
      }
    }
    swarm.end();
    glow.done();
  };
}

// ------------------------------------------------------------------ the mitochondrion, cut away

const MRX = 3.6, MRY = 1.45, MRZ = 1.6;

function buildMito(k) {
  const stage = k.stage('mito');
  const rnd = seeded(47);
  const hole = (th, ph) => th < Math.PI * 0.58 && (ph < 1.2 || ph > Math.PI * 2 - 1.2);
  const outer = new THREE.Mesh(shellWithWindow(MRX, MRY, MRZ, hole), mat({ color: '#c97a5a', rough: 0.4, clearcoat: 0.4, sheen: 0.3, sheenColor: '#f0b090', rim: 0.35, rimColor: '#ffc0a0', opacity: 0.6, side: THREE.DoubleSide }));
  stage.add(outer);
  k.part('outer_membrane', outer, { anchor: [-3.0, 0.75, 0.6] });
  const innerGroup = new THREE.Group();
  const innerMat = mat({ color: '#e0957a', rough: 0.45, sheen: 0.35, sheenColor: '#ffc8b0', rim: 0.25, rimColor: '#ffd0c0', side: THREE.DoubleSide });
  innerGroup.add(new THREE.Mesh(shellWithWindow(MRX * 0.93, MRY * 0.88, MRZ * 0.9, hole), innerMat));
  // Cristae: folds of the inner membrane reaching in from the top and the bottom.
  const crGeo = disc(1, 0.11, { segments: 36, rim: 0.5 });
  for (let i = 0; i < 9; i++) {
    const x = -2.7 + i * 0.68 + (rnd() - 0.5) * 0.1;
    const f = Math.sqrt(Math.max(0.05, 1 - (x / (MRX * 0.93)) ** 2));
    const ry = MRY * 0.88 * f, rz = MRZ * 0.9 * f;
    const top = i % 2 === 0;
    const m = new THREE.Mesh(crGeo, innerMat);
    m.rotation.z = Math.PI / 2;
    m.scale.set(ry * 0.62, 1, rz * 0.78);
    m.position.set(x, (top ? 1 : -1) * ry * 0.4, 0);
    innerGroup.add(m);
  }
  stage.add(innerGroup);
  k.part('cristae', innerGroup, { anchor: [0.7, 0.55, 0.3] });
  const matrix = new THREE.Mesh(shellWithWindow(MRX * 0.9, MRY * 0.84, MRZ * 0.86, (th, ph) => hole(th, ph) || th < Math.PI * 0.5), mat({ color: '#6a3530', rough: 0.85, sheen: 0.2, rim: 0.05, opacity: 0.8, side: THREE.BackSide }));
  stage.add(matrix);
  k.part('matrix', matrix, { anchor: [1.9, -0.9, -0.5] });
  // The space between the membranes: named where the two meet the window.
  const imsPin = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  imsPin.position.set(-1.0, MRY * 0.92, 0.55);
  stage.add(imsPin);
  k.part('ims', imsPin);
  const granules = new GlowPoints(200, { size: 0.03 });
  granules.begin();
  for (let i = 0; i < 200; i++) {
    const a = rnd() * Math.PI * 2, b = Math.acos(rnd() * 2 - 1), r = Math.cbrt(rnd()) * 0.8;
    granules.push(Math.sin(b) * Math.cos(a) * MRX * r, Math.cos(b) * MRY * r * 0.8, Math.sin(b) * Math.sin(a) * MRZ * r, 0.03, C('#f0c8b0'), 0.2);
  }
  granules.done();
  stage.add(granules);

  const swarm = new MoleculeSwarm(500, { scale: 0.05 });
  const glow = new GlowPoints(80, { size: 0.08 });
  stage.add(swarm, glow);
  const at = markers(k, stage, ['pyruvate', 'acetyl_coa', 'co2']);
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), w = new THREE.Vector3();
  const entry = new THREE.Vector3(-2.3, 0.2, 1.2);
  return (s) => {
    const T = s.T;
    at.clear();
    swarm.begin();
    glow.begin();
    stage.rotation.y = 0.08 * Math.sin(T * 0.1);
    const show = s.is('link') ? 1 : 0.6;
    for (let j = 0; j < 4; j++) {
      const ph = fract(T / 5 + j / 4);
      if (ph < 0.45) {
        // Pyruvate comes in through both membranes.
        v.set(-5.5 + ph / 0.45 * 3.2, 1.6 - ph / 0.45 * 1.4, 2.4 - ph / 0.45 * 1.2);
        swarm.put('pyruvate', v, tumble(j, T, 0.5, q), 1.3 * show);
        if (j === 1) at.pyruvate.copy(v);
      } else {
        // In the matrix it becomes acetyl-CoA, giving off CO₂.
        const u = (ph - 0.45) / 0.55;
        v.copy(entry).add({ x: 1.6 * u, y: -0.5 * u, z: -0.5 * u });
        swarm.put('acetylCoA', v, tumble(j, T, 0.4, q), 1.1 * show);
        if (j === 2) at.acetyl_coa.copy(v);
        w.copy(entry).add({ x: -0.4 - 0.5 * u, y: 1.3 * u, z: 1.0 * u });
        swarm.put('CO2', w, tumble(j + 10, T, 0.7, q), 1.4 * show * (1 - smooth((u - 0.8) / 0.2)));
        if (j === 2) at.co2.copy(w);
        if (u < 0.1) glow.push(entry.x, entry.y, entry.z, 0.5 * (1 - u / 0.1), COL.spark, 0.6);
      }
    }
    swarm.end();
    glow.done();
  };
}

// ------------------------------------------------------------------ the Krebs cycle in the matrix

function buildMatrix(k) {
  const stage = k.stage('matrix');
  const rnd = seeded(53);
  const R = 2.5;
  const ringQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.42, 0, 0.06));
  const ringPoint = (a, out, r = R) => out.set(Math.cos(a) * r, 0, Math.sin(a) * r).applyQuaternion(ringQ);
  const ring = new THREE.Mesh(tube(Array.from({ length: 65 }, (_, i) => ringPoint((i / 64) * Math.PI * 2, new THREE.Vector3())), 0.016, { segments: 128, radial: 6, closed: true }), glowMat(0xf0b090, 0.14));
  ring.userData.decor = true;
  stage.add(ring);
  // The enzymes of the cycle, round the ring.
  const enzymes = new THREE.Group();
  const ecol = ['#9a7a6a', '#7f8f9a', '#8f9a7a', '#9a8aa8', '#a0907a', '#7a9a90', '#8a7f9a', '#9a8a7a'];
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI * 0.2 + (i / 8) * Math.PI * 2;
    const p = protein([[0, 0, 0, 0.36, 0.32, 0.36], [0.22, 0.18, -0.1, 0.24, 0.22, 0.24]], ecol[i], { seed: 100 + i, detail: 14 });
    ringPoint(a, p.position, R + 0.55);
    p.position.y -= 0.15;
    enzymes.add(p);
  }
  enzymes.traverse((o) => (o.userData.decor = true));
  stage.add(enzymes);
  // Cristae in the distance: great folded sheets.
  const far = new THREE.Group();
  const crMat = mat({ color: '#d08a72', rough: 0.5, sheen: 0.3, rim: 0.2, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(disc(3.2, 0.3, { segments: 40 }), crMat);
    m.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.4);
    m.position.set(-8 + i * 5.2, (rnd() - 0.5) * 2, -6 - rnd() * 2);
    far.add(m);
  }
  far.traverse((o) => (o.userData.decor = true));
  stage.add(far);

  const swarm = new MoleculeSwarm(1200, { scale: 0.05 });
  const glow = new GlowPoints(120, { size: 0.08 });
  stage.add(swarm, glow);
  const at = markers(k, stage, ['acetyl_coa', 'citrate', 'co2', 'nadh', 'atp']);
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), w = new THREE.Vector3();
  const SLOTS = 8, PERIOD = 16, A0 = -Math.PI * 0.2;
  // Where along the ring (0..1) things happen: CO₂ out twice, NADH three times, ATP, FADH₂.
  const events = [[0.3, 'CO2'], [0.3, 'NADH'], [0.5, 'CO2'], [0.5, 'NADH'], [0.66, 'ATP'], [0.78, 'FADH2'], [0.9, 'NADH']];
  return (s) => {
    const T = s.T;
    at.clear();
    swarm.begin();
    glow.begin();
    for (let i = 0; i < SLOTS; i++) {
      const f = fract(i / SLOTS + T / PERIOD);
      ringPoint(A0 + f * Math.PI * 2, v);
      const kind = f < 0.3 ? 'C6' : f < 0.5 ? 'C5' : 'C4';
      swarm.put(kind, v, tumble(i, T, 0.5, q), 1.2);
      if (kind === 'C6' && !at.citrate.lengthSq() && f > 0.08) at.citrate.copy(v);
      for (const [ez, what] of events) {
        const d = f - ez;
        if (d < 0 || d > 0.14) continue;
        const u = d / 0.14;
        const out = ringPoint(A0 + ez * Math.PI * 2, new THREE.Vector3(), R + 0.4 + 2.0 * u);
        out.y += what === 'CO2' ? 1.4 * u : -0.5 * u;
        swarm.put(what, out, tumble(i + 20, T, 0.6, q), (what === 'CO2' ? 1.5 : 1.0) * (1 - smooth((u - 0.8) / 0.2)));
        if (what === 'CO2' && !at.co2.lengthSq()) at.co2.copy(out);
        if (what === 'NADH' && !at.nadh.lengthSq()) at.nadh.copy(out);
        if (what === 'ATP') at.atp.copy(out);
        if (u < 0.08) glow.push(v.x, v.y, v.z, 0.5, COL.spark, 0.5 * (1 - u / 0.08));
      }
    }
    // Acetyl-CoA arrives and joins the four-carbon acid at the start of the ring.
    for (let j = 0; j < 3; j++) {
      const ph = fract(j / 3 + T / (PERIOD / SLOTS) / 3);
      const dest = ringPoint(A0, new THREE.Vector3());
      w.set(-5.5 + Math.sin(j) * 0.6, 2.2 + Math.cos(j) * 0.5, 1.5).lerp(dest, smooth(ph));
      swarm.put('acetylCoA', w, tumble(j + 40, T, 0.5, q), 1.0 * (1 - smooth((ph - 0.9) / 0.1)));
      if (j === 1) at.acetyl_coa.copy(w);
    }
    swarm.end();
    glow.done();
  };
}

// ------------------------------------------------------------------ the electron transport chain on a crista

const C1 = new THREE.Vector3(-4.4, 0, 0);
const C2 = new THREE.Vector3(-2.5, 0, 0.6);
const C3 = new THREE.Vector3(-0.6, 0, 0);
const C4 = new THREE.Vector3(1.5, 0, 0);
const AS = new THREE.Vector3(3.9, 0, 0);
const HEAD = 0.2;
const IMS = 2.4; // to the outer membrane above

function buildCrista(k) {
  const stage = k.stage('crista');
  const rnd = seeded(59);
  const X0 = -6.6, X1 = 6.4, Z0 = -2.8, Z1 = 2.6;
  const wave = (x, z) => 0.05 * Math.sin(x * 0.5 + 1.1) * Math.cos(z * 0.4);
  const colors = ['#cdb6a0', '#c4ae9a', '#d6bfa8', '#bba48f'];
  const keepOut = [[C1.x, 0, 1.0], [C1.x - 1.2, 0, 0.6], [C2.x, C2.z, 0.5], [C3.x, 0, 0.8], [C4.x, 0, 0.75], [AS.x, 0, 0.55], [AS.x + 0.55, 0.1, 0.3]];
  const inner = new THREE.Group();
  inner.add(bilayer(0, X0, X1, Z0, Z1, keepOut, rnd, { head: HEAD, wave, colors }), tailSheet(0, X0, X1, Z0, Z1, { head: HEAD, wave, color: '#9a7a52' }));
  stage.add(inner);
  // The outer membrane above the space between the membranes.
  const outer = new THREE.Group();
  outer.add(bilayer(IMS, X0, X1, Z0, Z1, [], rnd, { head: HEAD, heads: 'bottom', dim: 0.8, colors }), tailSheet(IMS, X0, X1, Z0, Z1, { head: HEAD, dim: 0.8, color: '#9a7a52' }));
  outer.traverse((o) => (o.userData.decor = true));
  stage.add(outer);
  const imsPin = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, IMS - 0.6, Z1 - Z0), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  imsPin.position.set(0, IMS / 2, 0);
  stage.add(imsPin);
  k.part('ims', imsPin, { anchor: [-5.6, 1.4, 1.6] });
  const matrixPin = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 2, Z1 - Z0), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  matrixPin.position.set(0, -1.4, 0);
  stage.add(matrixPin);
  k.part('matrix', matrixPin, { anchor: [-5.6, -1.4, 1.6] });
  k.part('cristae', inner, { anchor: [-5.8, 0.2, 2.2] });

  // Complex I: an L, its arm along the membrane and its head down in the matrix.
  const c1 = protein([
    [-1.2, 0, 0, 0.5, 0.38, 0.42], [-0.45, 0.02, 0.05, 0.5, 0.4, 0.44], [0.3, 0, 0, 0.48, 0.38, 0.42],
    [0.35, -0.75, 0.1, 0.42, 0.42, 0.4], [0.45, -1.4, 0.05, 0.5, 0.42, 0.46], [0.05, -1.25, -0.25, 0.32, 0.3, 0.3],
  ], '#8a6fae', { seed: 21 });
  c1.position.copy(C1);
  stage.add(c1);
  k.part('complex1', c1, { anchor: [C1.x - 0.4, 0.45, 0.1] });
  const c2 = protein([[0, -0.1, 0, 0.32, 0.3, 0.3], [0.05, -0.62, 0.05, 0.36, 0.3, 0.34]], '#c2a35a', { seed: 22 });
  c2.position.copy(C2);
  stage.add(c2);
  k.part('complex2', c2, { anchor: [C2.x, 0.35, C2.z] });
  const c3 = protein([[-0.36, 0, 0, 0.4, 0.5, 0.42], [0.36, 0, 0, 0.4, 0.5, 0.42], [-0.3, -0.62, 0.1, 0.3, 0.24, 0.3], [0.3, -0.6, -0.1, 0.3, 0.24, 0.3], [0, 0.52, 0, 0.3, 0.16, 0.3]], '#4f8fa0', { seed: 23 });
  c3.position.copy(C3);
  stage.add(c3);
  k.part('complex3', c3, { anchor: [C3.x, 0.65, 0] });
  const c4 = protein([[-0.25, 0, 0, 0.42, 0.5, 0.45], [0.3, 0.02, 0.05, 0.38, 0.48, 0.42], [0.05, -0.55, 0.1, 0.3, 0.2, 0.3], [0, 0.5, 0, 0.32, 0.18, 0.3]], '#6f9f6a', { seed: 24 });
  c4.position.copy(C4);
  stage.add(c4);
  k.part('complex4', c4, { anchor: [C4.x + 0.1, 0.62, 0] });
  // Cytochrome c shuttles in the space between the membranes.
  const cytc = protein([[0, 0, 0, 0.15, 0.14, 0.15]], '#b04a42', { seed: 25 });
  cytc.userData.decor = true;
  stage.add(cytc);
  const { group: atps, rotor } = atpSynthase(AS, { flip: true });
  stage.add(atps);
  k.part('atp_synthase', atps, { anchor: [AS.x + 0.2, -1.75, 0.2] });

  const glow = new GlowPoints(1200, { size: 0.08 });
  const swarm = new MoleculeSwarm(900, { scale: 0.045 });
  const q10 = new MoleculeSwarm(40, { scale: 0.05 });
  stage.add(glow, swarm, q10);
  const at = markers(k, stage, ['electron', 'hion', 'nadh', 'oxygen', 'water', 'atp']);
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), w = new THREE.Vector3();
  // NADH → I → Q → III → cyt c → IV → O₂.
  const ePath = curve([
    [C1.x + 0.45, -1.3, 0.45], [C1.x + 0.4, -0.6, 0.45], [C1.x + 0.1, 0.0, 0.5], [C1.x + 1.3, 0.0, 0.7], [C3.x - 0.6, 0.0, 0.5], [C3.x, 0.15, 0.4],
    [C3.x + 0.15, 0.75, 0.45], [0.45, 0.95, 0.55], [C4.x - 0.25, 0.7, 0.45], [C4.x, 0.1, 0.4], [C4.x + 0.05, -0.65, 0.5],
  ]);
  const H = Array.from({ length: 90 }, () => ({ x: X0 + 0.5 + rnd() * (X1 - X0 - 1), y: HEAD + 0.35 + rnd() * (IMS - HEAD * 2 - 0.7), z: Z0 + 0.4 + rnd() * (Z1 - Z0 - 0.8), ph: rnd() * 10 }));
  return (s) => {
    const T = s.T;
    at.clear();
    glow.begin();
    swarm.begin();
    q10.begin();
    const isAtp = s.is('atp'), isO2 = s.is('oxygen');
    // NADH arrives at complex I from the matrix and leaves as NAD⁺; FADH₂ at complex II.
    for (let j = 0; j < 3; j++) {
      const ph = fract(T / 3.4 + j / 3);
      const site = new THREE.Vector3(C1.x + 0.9, -1.6, 0.6);
      if (ph < 0.5) {
        w.set(site.x - 1.8 * (1 - smooth(ph / 0.5)), site.y - 0.9 * (1 - smooth(ph / 0.5)), site.z + 0.4);
        swarm.put('NADH', w, tumble(j, T, 0.4, q), 1);
        if (j === 0) at.nadh.copy(w);
      } else {
        const u = (ph - 0.5) / 0.5;
        w.set(site.x - 0.4 - 1.6 * u, site.y - 0.4 - 0.8 * u, site.z + 0.4);
        swarm.put('NAD', w, tumble(j, T, 0.4, q), 1 - smooth((u - 0.8) / 0.2));
      }
      const ph2 = fract(T / 4 + j / 3 + 0.2);
      w.set(C2.x - 1.2 * (1 - ph2), -1.2 - 0.6 * (1 - ph2), C2.z + 0.3);
      swarm.put('FADH2', w, tumble(j + 5, T, 0.4, q), Math.min(1, ph2 * 6, (1 - ph2) * 6));
    }
    // Electrons along the chain.
    for (let i = 0; i < 18; i++) {
      const ph = fract(i / 18 + T * 0.075);
      ePath.getPointAt(ph, v);
      const a = Math.min(1, ph * 10, (1 - ph) * 10);
      glow.push(v.x, v.y, v.z, 0.09, COL.electron, a);
      glow.push(v.x, v.y, v.z, 0.3, COL.electron, a * 0.22);
      if (i === 4) at.electron.copy(v);
    }
    // Ubiquinone in the membrane; cytochrome c across the space between the membranes.
    for (let i = 0; i < 4; i++) {
      const ph = fract(i / 4 + T * 0.075);
      ePath.getPointAt(0.18 + ph * 0.27, v);
      q10.put([['O', 0, 0, 0], ['C', 0.9, 0.3, 0], ['C', 1.8, 0, 0], ['O', 2.7, 0.3, 0], ['C', -0.9, -0.3, 0], ['C', -1.8, 0, 0]], v, tumble(i, T, 0.8, q), 1);
    }
    cytc.position.set(lerp(C3.x + 0.3, C4.x - 0.3, 0.5 + 0.5 * Math.sin(T * 1.2)), 0.95, 0.55);
    // H⁺ pumped up through I, III and IV, crowding the space between the membranes.
    for (const [cx, n] of [[C1.x - 0.5, 4], [C3.x, 2], [C4.x, 2]]) {
      for (let i = 0; i < n; i++) {
        const ph = fract(i / n + T * 0.35 + cx);
        glow.push(cx + 0.3 * Math.sin(i * 2 + cx), lerp(-1.1, 1.4, ph), 0.45 + 0.2 * Math.cos(i), 0.09, COL.hion, Math.min(1, ph * 5, (1 - ph) * 4));
      }
    }
    const crowd = s.is('chain') ? 0.4 + 0.6 * s.u : 1;
    for (let i = 0; i < Math.round(H.length * crowd); i++) {
      const h = H[i];
      glow.push(h.x + 0.15 * Math.sin(T * 0.7 + h.ph), h.y + 0.1 * Math.sin(T * 0.9 + h.ph * 2), h.z + 0.15 * Math.cos(T * 0.6 + h.ph), 0.085, COL.hion, 0.85);
      if (i === 5) at.hion.copy(new THREE.Vector3(h.x, h.y, h.z));
    }
    // At complex IV: O₂ + electrons + H⁺ → water.
    for (let j = 0; j < 2; j++) {
      const ph = fract(T / 3 + j / 2);
      const site = new THREE.Vector3(C4.x + 0.05, -0.85, 0.55);
      if (ph < 0.5) {
        w.copy(site).add({ x: 1.6 * (1 - smooth(ph / 0.5)), y: -1.0 * (1 - smooth(ph / 0.5)), z: 0.3 });
        swarm.put('O2', w, tumble(j + 50, T, 0.5, q), isO2 ? 1.5 : 1.2);
        if (j === 0) at.oxygen.copy(w);
      } else {
        const u = (ph - 0.5) / 0.5;
        for (const sg of [-1, 1]) {
          w.copy(site).add({ x: sg * 0.9 * u, y: -0.3 - 0.9 * u, z: 0.3 + 0.5 * u });
          swarm.put('H2O', w, tumble(j + 60 + sg, T, 0.6, q), (isO2 ? 1.6 : 1.3) * (1 - smooth((u - 0.85) / 0.15)));
          if (j === 0 && sg === 1) at.water.copy(w);
        }
        if (u < 0.1) glow.push(site.x, site.y, site.z, 0.5 * (1 - u / 0.1), COL.spark, 0.7);
      }
    }
    // ATP synthase: H⁺ flow down through the turbine; ATP leaves its head in the matrix.
    rotor.rotation.y = -T * 2.2 * (isAtp ? 1 : 0.4);
    const nIn = isAtp ? 12 : 4;
    for (let i = 0; i < nIn; i++) {
      const ph = fract(i / nIn + T * 0.32);
      const ang = ph * Math.PI * 1.2 + i;
      const r = ph < 0.3 ? 0.9 * (1 - ph / 0.3) + 0.4 : 0.4;
      glow.push(AS.x + Math.cos(ang) * r, lerp(1.6, -0.5, ph), AS.z + Math.sin(ang) * r, 0.09, COL.hion, Math.min(1, ph * 5, (1 - ph) * 5));
    }
    for (let j = 0; j < 3; j++) {
      const ph = fract(T / 2.8 + j / 3);
      const ang = (j / 3) * Math.PI * 2 + 0.4;
      if (ph < 0.45) {
        const u = smooth(ph / 0.45);
        w.set(AS.x + Math.cos(ang) * (1.7 - 1.05 * u), -1.5 - 0.5 * (1 - u), AS.z + Math.sin(ang) * (1.7 - 1.05 * u));
        swarm.put('ADP', w, tumble(j + 30, T, 0.5, q), 1);
      } else {
        const u = (ph - 0.45) / 0.55;
        w.set(AS.x + Math.cos(ang) * (0.65 + 1.7 * u), -1.5 - 1.0 * u, AS.z + Math.sin(ang) * (0.65 + 1.7 * u) + 0.2);
        swarm.put('ATP', w, tumble(j + 30, T, 0.5, q), 1 - smooth((u - 0.85) / 0.15));
        if (j === 0) at.atp.copy(w);
        if (u < 0.1) glow.push(AS.x + Math.cos(ang) * 0.65, -1.55, AS.z + Math.sin(ang) * 0.65, 0.45 * (1 - u / 0.1), COL.spark, 0.6);
      }
    }
    glow.done();
    swarm.end();
    q10.end();
  };
}
