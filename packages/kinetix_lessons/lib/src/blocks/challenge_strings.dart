import '../engine/model.dart';

/// Text of the challenge block, in English and Kannada (from the Zynetix board).
const _s = <String, (String, String)>{
  // Challenge block
  'challenge': ('Challenge', 'ಸವಾಲು'),
  'target': ('Target', 'ಗುರಿ'),
  'lockIn': ('Lock it in', 'ಖಚಿತಪಡಿಸಿ'),
  'triesLeft': ('tries left', 'ಪ್ರಯತ್ನಗಳು ಉಳಿದಿವೆ'),
  'tooHigh': ('Too high', 'ತುಂಬಾ ಹೆಚ್ಚು'),
  'tooLow': ('Too low', 'ತುಂಬಾ ಕಡಿಮೆ'),
  'hit': ('Bullseye!', 'ಗುರಿ ಮುಟ್ಟಿದಿರಿ!'),
  'timeUp': ('Time up: that try is lost', 'ಸಮಯ ಮುಗಿಯಿತು: ಆ ಪ್ರಯತ್ನ ಹೋಯಿತು'),
  'hint': ('Hint', 'ಸುಳಿವು'),
  'revealSolution': ('Show the solution', 'ಪರಿಹಾರ ತೋರಿಸಿ'),
  'solution': ('Solution', 'ಪರಿಹಾರ'),
  'whyItWorks': ('Why it works', 'ಏಕೆ ಸರಿ'),
  'playAgain': ('Play again', 'ಮತ್ತೆ ಆಡಿ'),
  'outOfTries': ('Out of tries. Here is how to hit it.', 'ಪ್ರಯತ್ನಗಳು ಮುಗಿದಿವೆ. ಗುರಿ ಮುಟ್ಟುವುದು ಹೀಗೆ.'),
  'stars': ('stars', 'ನಕ್ಷತ್ರಗಳು'),
  'turn': ('Turn', 'ಸರದಿ'),
  'wholeClass': ('Whole class', 'ಇಡೀ ತರಗತಿ'),
  'setSliders': ('Work it out, set the sliders, then lock it in. The result shows only after you lock in.', 'ಲೆಕ್ಕ ಹಾಕಿ, ಸ್ಲೈಡರ್‌ಗಳನ್ನು ಹೊಂದಿಸಿ, ನಂತರ ಖಚಿತಪಡಿಸಿ. ಫಲಿತಾಂಶ ಆಮೇಲೆ ಮಾತ್ರ ಕಾಣುತ್ತದೆ.'),
  'youGot': ('You got', 'ನಿಮಗೆ ಬಂದದ್ದು'),
};

String gt(String key, Lang lang) {
  final v = _s[key];
  if (v == null) return key;
  return lang == Lang.kn ? v.$2 : v.$1;
}
