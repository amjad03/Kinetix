import 'package:flutter/widgets.dart';

/// Words of the board's sheets and previews (Board settings as a side sheet, the page overview's
/// grid, the smartboard preview) in English, Hindi and Kannada.
class UiStrings {
  const UiStrings(this.lang);

  final String lang;

  static UiStrings of(BuildContext context) => UiStrings(Localizations.maybeLocaleOf(context)?.languageCode ?? 'en');

  String t(String key) => (_strings[lang] ?? _strings['en']!)[key] ?? _strings['en']![key] ?? key;

  String get previewPanel => t('previewPanel');
  String get previewPanelHint => t('previewPanelHint');
  String get exitPreview => t('exitPreview');
  String get previewBadge => t('previewBadge');
  String get modelSize => t('modelSize');
  String pages(int n) => t('pages').replaceAll('{n}', '$n');
  String get display => t('display');

  static const _strings = <String, Map<String, String>>{
    'en': {
      'previewPanel': 'Preview as interactive panel',
      'previewPanelHint': 'See the board exactly as a 1920 × 1080 smartboard shows it, scaled to fit this screen. A phone turns on its side.',
      'exitPreview': 'Exit preview',
      'previewBadge': 'Smartboard preview',
      'modelSize': 'About 20 MB',
      'pages': '{n} pages',
      'display': 'Display',
    },
    'hi': {
      'previewPanel': 'इंटरैक्टिव पैनल जैसा देखें',
      'previewPanelHint': 'बोर्ड को ठीक वैसा देखें जैसा 1920 × 1080 स्मार्टबोर्ड पर दिखेगा, इस स्क्रीन में फ़िट करके। फ़ोन आड़ा हो जाता है।',
      'exitPreview': 'पूर्वावलोकन बंद करें',
      'previewBadge': 'स्मार्टबोर्ड पूर्वावलोकन',
      'modelSize': 'लगभग 20 MB',
      'pages': '{n} पेज',
      'display': 'डिस्प्ले',
    },
    'kn': {
      'previewPanel': 'ಇಂಟರಾಕ್ಟಿವ್ ಪ್ಯಾನೆಲ್‌ನಂತೆ ನೋಡಿ',
      'previewPanelHint': '1920 × 1080 ಸ್ಮಾರ್ಟ್‌ಬೋರ್ಡ್‌ನಲ್ಲಿ ಕಾಣುವಂತೆಯೇ ಬೋರ್ಡ್ ಅನ್ನು ಈ ಪರದೆಗೆ ಹೊಂದಿಸಿ ನೋಡಿ. ಫೋನ್ ಅಡ್ಡವಾಗುತ್ತದೆ.',
      'exitPreview': 'ಮುನ್ನೋಟದಿಂದ ಹೊರಬನ್ನಿ',
      'previewBadge': 'ಸ್ಮಾರ್ಟ್‌ಬೋರ್ಡ್ ಮುನ್ನೋಟ',
      'modelSize': 'ಸುಮಾರು 20 MB',
      'pages': '{n} ಪುಟಗಳು',
      'display': 'ಪ್ರದರ್ಶನ',
    },
  };
}
