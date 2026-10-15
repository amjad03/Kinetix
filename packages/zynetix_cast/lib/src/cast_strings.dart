/// The cast screen's words in English, Hindi and Kannada (the apps' own ARB files stay as they are).
class CastStrings {
  const CastStrings(this.lang);

  /// 'en', 'hi' or 'kn' (anything else reads as English).
  final String lang;

  String operator [](String key) => (_table[lang] ?? _table['en']!)[key] ?? _table['en']![key] ?? key;

  String get title => this['title'];
}

const _table = <String, Map<String, String>>{
  'en': {
    'title': 'Share screen to the board',
    'lead': 'Show your screen on the classroom board. The teacher approves it on the board, and can stop it at any time. Nothing is recorded.',
    'boards': 'Boards with a class now',
    'none': 'No board has a class for you right now. Try again when your class starts.',
    'refresh': 'Refresh',
    'start': 'Share my screen',
    'stop': 'Stop sharing',
    'capturing': 'Choose what to share…',
    'requesting': 'Asking the board…',
    'waiting': 'Waiting for the teacher to approve on the board…',
    'connecting': 'Connecting…',
    'live': 'Your screen is on the board.',
    'declinedCapture': 'Screen sharing was not allowed on this device.',
    'declined': 'The teacher declined the request.',
    'classEnded': 'The class ended, so sharing stopped.',
    'boardLeft': 'The board went offline, so sharing stopped.',
    'stopped': 'Sharing stopped.',
    'approval': 'The teacher approves',
    'auto': 'Your own board: starts straight away',
    'loadFailed': 'Could not load boards. Check your connection.',
  },
  'hi': {
    'title': 'स्क्रीन बोर्ड पर दिखाएँ',
    'lead': 'अपनी स्क्रीन कक्षा के बोर्ड पर दिखाएँ। शिक्षक बोर्ड पर अनुमति देते हैं और किसी भी समय रोक सकते हैं। कुछ भी रिकॉर्ड नहीं होता।',
    'boards': 'अभी कक्षा वाले बोर्ड',
    'none': 'अभी किसी बोर्ड पर आपकी कक्षा नहीं है। कक्षा शुरू होने पर फिर कोशिश करें।',
    'refresh': 'ताज़ा करें',
    'start': 'मेरी स्क्रीन दिखाएँ',
    'stop': 'दिखाना बंद करें',
    'capturing': 'चुनें क्या साझा करना है…',
    'requesting': 'बोर्ड से पूछ रहे हैं…',
    'waiting': 'बोर्ड पर शिक्षक की अनुमति की प्रतीक्षा…',
    'connecting': 'जुड़ रहे हैं…',
    'live': 'आपकी स्क्रीन बोर्ड पर है।',
    'declinedCapture': 'इस डिवाइस पर स्क्रीन साझा करने की अनुमति नहीं मिली।',
    'declined': 'शिक्षक ने अनुरोध अस्वीकार कर दिया।',
    'classEnded': 'कक्षा समाप्त हुई, इसलिए साझा करना बंद हुआ।',
    'boardLeft': 'बोर्ड ऑफ़लाइन हो गया, इसलिए साझा करना बंद हुआ।',
    'stopped': 'साझा करना बंद हुआ।',
    'approval': 'शिक्षक अनुमति देते हैं',
    'auto': 'आपका अपना बोर्ड: तुरंत शुरू',
    'loadFailed': 'बोर्ड लोड नहीं हो सके। कनेक्शन जाँचें।',
  },
  'kn': {
    'title': 'ಪರದೆಯನ್ನು ಬೋರ್ಡ್‌ಗೆ ಹಂಚಿಕೊಳ್ಳಿ',
    'lead': 'ನಿಮ್ಮ ಪರದೆಯನ್ನು ತರಗತಿಯ ಬೋರ್ಡ್‌ನಲ್ಲಿ ತೋರಿಸಿ. ಶಿಕ್ಷಕರು ಬೋರ್ಡ್‌ನಲ್ಲಿ ಒಪ್ಪಿಗೆ ನೀಡುತ್ತಾರೆ ಮತ್ತು ಯಾವಾಗ ಬೇಕಾದರೂ ನಿಲ್ಲಿಸಬಹುದು. ಏನನ್ನೂ ರೆಕಾರ್ಡ್ ಮಾಡುವುದಿಲ್ಲ.',
    'boards': 'ಈಗ ತರಗತಿ ಇರುವ ಬೋರ್ಡ್‌ಗಳು',
    'none': 'ಈಗ ಯಾವ ಬೋರ್ಡ್‌ನಲ್ಲೂ ನಿಮ್ಮ ತರಗತಿ ಇಲ್ಲ. ತರಗತಿ ಶುರುವಾದಾಗ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    'refresh': 'ರಿಫ್ರೆಶ್',
    'start': 'ನನ್ನ ಪರದೆ ಹಂಚಿಕೊಳ್ಳಿ',
    'stop': 'ಹಂಚಿಕೆ ನಿಲ್ಲಿಸಿ',
    'capturing': 'ಏನು ಹಂಚಿಕೊಳ್ಳಬೇಕು ಆರಿಸಿ…',
    'requesting': 'ಬೋರ್ಡ್ ಅನ್ನು ಕೇಳುತ್ತಿದೆ…',
    'waiting': 'ಬೋರ್ಡ್‌ನಲ್ಲಿ ಶಿಕ್ಷಕರ ಒಪ್ಪಿಗೆಗಾಗಿ ಕಾಯುತ್ತಿದೆ…',
    'connecting': 'ಸಂಪರ್ಕಿಸುತ್ತಿದೆ…',
    'live': 'ನಿಮ್ಮ ಪರದೆ ಬೋರ್ಡ್‌ನಲ್ಲಿದೆ.',
    'declinedCapture': 'ಈ ಸಾಧನದಲ್ಲಿ ಪರದೆ ಹಂಚಿಕೆಗೆ ಅನುಮತಿ ಸಿಗಲಿಲ್ಲ.',
    'declined': 'ಶಿಕ್ಷಕರು ವಿನಂತಿಯನ್ನು ನಿರಾಕರಿಸಿದರು.',
    'classEnded': 'ತರಗತಿ ಮುಗಿದಿದ್ದರಿಂದ ಹಂಚಿಕೆ ನಿಂತಿದೆ.',
    'boardLeft': 'ಬೋರ್ಡ್ ಆಫ್‌ಲೈನ್ ಆದ ಕಾರಣ ಹಂಚಿಕೆ ನಿಂತಿದೆ.',
    'stopped': 'ಹಂಚಿಕೆ ನಿಂತಿದೆ.',
    'approval': 'ಶಿಕ್ಷಕರು ಒಪ್ಪಿಗೆ ನೀಡುತ್ತಾರೆ',
    'auto': 'ನಿಮ್ಮದೇ ಬೋರ್ಡ್: ತಕ್ಷಣ ಶುರುವಾಗುತ್ತದೆ',
    'loadFailed': 'ಬೋರ್ಡ್‌ಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ. ಸಂಪರ್ಕ ಪರಿಶೀಲಿಸಿ.',
  },
};

/// The strings table, for the tests that check Hindi and Kannada have every English key.
const castStringTable = _table;
