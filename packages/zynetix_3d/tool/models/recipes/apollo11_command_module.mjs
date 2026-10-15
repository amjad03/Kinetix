// "Columbia", the Apollo 11 command module that carried Armstrong, Aldrin and
// Collins to the Moon and back in 1969, scanned at the Smithsonian's National
// Air and Space Museum (Smithsonian Open Access, CC0). Downloaded on first use.
const t = (en, hi, kn) => ({ en, hi, kn });

export default {
  id: 'apollo11_command_module',
  version: 1,
  remote: true,
  topic: 'solar',
  license: 'CC0',
  subject: 'Space',
  classes: [6, 8, 9, 11],
  title: t('Apollo 11 command module', 'अपोलो 11 कमांड मॉड्यूल', 'ಅಪೊಲೊ 11 ಕಮಾಂಡ್ ಮಾಡ್ಯೂಲ್'),
  summary: t(
    'The capsule that took the first people to land on the Moon there and back in July 1969. Its heat shield, scorched on the way back, protected the crew from the heat of falling through the air.',
    'वह कैप्सूल जो जुलाई 1969 में चंद्रमा पर उतरने वाले पहले लोगों को वहाँ ले गया और वापस लाया। लौटते समय झुलसी इसकी ऊष्मा-ढाल ने हवा में गिरते समय की गर्मी से दल को बचाया।',
    'ಜುಲೈ 1969ರಲ್ಲಿ ಚಂದ್ರನ ಮೇಲೆ ಇಳಿದ ಮೊದಲ ಮಾನವರನ್ನು ಅಲ್ಲಿಗೆ ಕರೆದೊಯ್ದು ಮರಳಿ ತಂದ ಕ್ಯಾಪ್ಸೂಲ್. ಹಿಂದಿರುಗುವಾಗ ಸುಟ್ಟ ಇದರ ಉಷ್ಣ ಕವಚ, ಗಾಳಿಯಲ್ಲಿ ಬೀಳುವಾಗಿನ ಶಾಖದಿಂದ ಸಿಬ್ಬಂದಿಯನ್ನು ರಕ್ಷಿಸಿತು.',
  ),
  keywords: ['apollo', 'apollo 11', 'moon landing', 'spacecraft', 'command module', 'armstrong', 'space exploration', 'friction', 'heat shield', 'satellites', 'chandrayaan'],
  credit: 'Command Module, Apollo 11, Smithsonian National Air and Space Museum, Smithsonian Open Access (CC0)',
  sources: {
    scan: { file: 'si/apollo11-cm-exterior-100k-2048.glb', url: 'https://3d-api.si.edu/content/document/3d_package:d8c6457e-4ebc-11ea-b77f-2e728ce88125/multi-mesh2-100k-2048_std_draco.glb' },
  },
  size: 0.45,
  async import(k) {
    const m = k.join(k.worldPrimitives(await k.readSource(k.source('scan'))));
    return { capsule: await k.simplifyRich(m, 0.5, 0.0006) };
  },
  groups: [{ id: 'craft', name: t('Spacecraft', 'अंतरिक्ष यान', 'ಬಾಹ್ಯಾಕಾಶ ನೌಕೆ') }],
  parts: [
    {
      id: 'capsule', group: 'craft', color: '#a59a86', explode: [0, 0.0001, 0],
      name: t('Command module "Columbia"', 'कमांड मॉड्यूल "कोलंबिया"', 'ಕಮಾಂಡ್ ಮಾಡ್ಯೂಲ್ "ಕೊಲಂಬಿಯಾ"'),
      info: t(
        'About 3.2 m tall and 3.9 m wide. The three astronauts lived in it for eight days; it was the only part of the giant Saturn V rocket to come back.',
        'लगभग 3.2 मीटर ऊँचा और 3.9 मीटर चौड़ा। तीनों अंतरिक्ष यात्री आठ दिन इसमें रहे; विशाल सैटर्न V रॉकेट का केवल यही भाग वापस आया।',
        'ಸುಮಾರು 3.2 ಮೀ ಎತ್ತರ ಮತ್ತು 3.9 ಮೀ ಅಗಲ. ಮೂವರು ಗಗನಯಾತ್ರಿಗಳು ಎಂಟು ದಿನ ಇದರಲ್ಲಿದ್ದರು; ದೈತ್ಯ ಸ್ಯಾಟರ್ನ್ V ರಾಕೆಟ್‌ನಲ್ಲಿ ಮರಳಿ ಬಂದದ್ದು ಇದೊಂದೇ ಭಾಗ.',
      ),
    },
  ],
  views: [
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [0.6, 0.35, 1] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.3] },
  ],
  slices: [],
  animations: [],
};
