import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// The lesson player's words in English, Hindi and Kannada (see docs/i18n/glossary.md).
///
/// Apps can register [LessonStrings.delegate] in `localizationsDelegates`; without it, [of]
/// still follows the ambient [Locale], so an app that has not registered it gets the right
/// language too. Anything else falls back to English.
///
/// First-draft translations: they need review by native speakers before release.
abstract class LessonStrings {
  const LessonStrings();

  static const supportedLanguages = ['en', 'hi', 'kn'];
  static const LocalizationsDelegate<LessonStrings> delegate = _LessonStringsDelegate();

  /// The strings for [locale]'s language (English for anything else).
  static LessonStrings forLocale(Locale? locale) => switch (locale?.languageCode) {
    'hi' => const _Hi(),
    'kn' => const _Kn(),
    _ => const _En(),
  };

  static LessonStrings of(BuildContext context) =>
      Localizations.of<LessonStrings>(context, LessonStrings) ?? forLocale(Localizations.maybeLocaleOf(context));

  /// "en_IN", "hi_IN" or "kn_IN": the intl locale for dates.
  String get intlLocale;

  String get lessonRecording;
  String page(int page, int total);
  String get play;
  String get pause;
  String get playAgain;
  String speed(String value);
  String get back10;
  String get forward10;
  String get missedNote;
  String get noSound;
  String get soundUnavailable;
  String get summary;
  String get transcript;
  String get summaryPending;
  String get transcriptPending;
  String get keyPoints;
  String get chapters;
  String get retry;
  String get loadFailed;
  String get recordingNotShared;
  String get underAMinute;
  String minutes(int m);
  String hours(int h);
  String hoursMinutes(int h, int m);
}

class _En extends LessonStrings {
  const _En();

  @override
  String get intlLocale => 'en_IN';
  @override
  String get lessonRecording => 'Lesson recording';
  @override
  String page(int page, int total) => 'Page $page of $total';
  @override
  String get play => 'Play';
  @override
  String get pause => 'Pause';
  @override
  String get playAgain => 'Play again';
  @override
  String speed(String value) => 'Speed $value';
  @override
  String get back10 => 'Back 10 seconds';
  @override
  String get forward10 => 'Forward 10 seconds';
  @override
  String get missedNote => 'Missed this class. Watch the lesson to catch up.';
  @override
  String get noSound => 'This lesson was recorded without sound.';
  @override
  String get soundUnavailable => "Sound can't play on this device, so the board plays on its own.";
  @override
  String get summary => 'Summary';
  @override
  String get transcript => 'Transcript';
  @override
  String get summaryPending => 'The summary is being prepared. Check back in a few minutes.';
  @override
  String get transcriptPending => 'Transcript is being prepared. Check back in a few minutes.';
  @override
  String get keyPoints => 'Key points';
  @override
  String get chapters => 'Chapters';
  @override
  String get retry => 'Retry';
  @override
  String get loadFailed => "Couldn't load this lesson. Try again.";
  @override
  String get recordingNotShared => 'This recording is no longer shared with the class.';
  @override
  String get underAMinute => 'Under a minute';
  @override
  String minutes(int m) => '$m min';
  @override
  String hours(int h) => '$h h';
  @override
  String hoursMinutes(int h, int m) => '$h h $m min';
}

class _Hi extends LessonStrings {
  const _Hi();

  @override
  String get intlLocale => 'hi_IN';
  @override
  String get lessonRecording => 'पाठ की रिकॉर्डिंग';
  @override
  String page(int page, int total) => 'पेज $page / $total';
  @override
  String get play => 'चलाएँ';
  @override
  String get pause => 'रोकें';
  @override
  String get playAgain => 'फिर से चलाएँ';
  @override
  String speed(String value) => 'गति $value';
  @override
  String get back10 => '10 सेकंड पीछे';
  @override
  String get forward10 => '10 सेकंड आगे';
  @override
  String get missedNote => 'यह कक्षा छूट गई। जो छूटा उसे पूरा करने के लिए पाठ देखें।';
  @override
  String get noSound => 'यह पाठ बिना आवाज़ के रिकॉर्ड हुआ था।';
  @override
  String get soundUnavailable => 'इस डिवाइस पर आवाज़ नहीं चल सकती, इसलिए केवल बोर्ड चलेगा।';
  @override
  String get summary => 'सारांश';
  @override
  String get transcript => 'ट्रांसक्रिप्ट';
  @override
  String get summaryPending => 'सारांश तैयार हो रहा है। कुछ मिनट बाद फिर देखें।';
  @override
  String get transcriptPending => 'ट्रांसक्रिप्ट तैयार हो रहा है। कुछ मिनट बाद फिर देखें।';
  @override
  String get keyPoints => 'मुख्य बातें';
  @override
  String get chapters => 'अध्याय';
  @override
  String get retry => 'फिर से कोशिश करें';
  @override
  String get loadFailed => 'यह पाठ लोड नहीं हो सका। फिर से कोशिश करें।';
  @override
  String get recordingNotShared => 'यह रिकॉर्डिंग अब कक्षा के साथ साझा नहीं है।';
  @override
  String get underAMinute => 'एक मिनट से कम';
  @override
  String minutes(int m) => '$m मिनट';
  @override
  String hours(int h) => h == 1 ? '1 घंटा' : '$h घंटे';
  @override
  String hoursMinutes(int h, int m) => '${hours(h)} $m मिनट';
}

class _Kn extends LessonStrings {
  const _Kn();

  @override
  String get intlLocale => 'kn_IN';
  @override
  String get lessonRecording => 'ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್';
  @override
  String page(int page, int total) => 'ಪುಟ $page / $total';
  @override
  String get play => 'ಪ್ಲೇ ಮಾಡಿ';
  @override
  String get pause => 'ವಿರಾಮ';
  @override
  String get playAgain => 'ಮತ್ತೆ ಪ್ಲೇ ಮಾಡಿ';
  @override
  String speed(String value) => 'ವೇಗ $value';
  @override
  String get back10 => '10 ಸೆಕೆಂಡ್ ಹಿಂದೆ';
  @override
  String get forward10 => '10 ಸೆಕೆಂಡ್ ಮುಂದೆ';
  @override
  String get missedNote => 'ಈ ತರಗತಿ ತಪ್ಪಿಹೋಗಿದೆ. ತಪ್ಪಿದ ಪಾಠವನ್ನು ಸರಿದೂಗಿಸಲು ಇದನ್ನು ನೋಡಿ.';
  @override
  String get noSound => 'ಈ ಪಾಠವನ್ನು ಧ್ವನಿ ಇಲ್ಲದೆ ರೆಕಾರ್ಡ್ ಮಾಡಲಾಗಿದೆ.';
  @override
  String get soundUnavailable => 'ಈ ಸಾಧನದಲ್ಲಿ ಧ್ವನಿ ಪ್ಲೇ ಆಗುವುದಿಲ್ಲ, ಹಾಗಾಗಿ ಬೋರ್ಡ್ ಮಾತ್ರ ಪ್ಲೇ ಆಗುತ್ತದೆ.';
  @override
  String get summary => 'ಸಾರಾಂಶ';
  @override
  String get transcript => 'ಪ್ರತಿಲಿಪಿ';
  @override
  String get summaryPending => 'ಸಾರಾಂಶ ಸಿದ್ಧವಾಗುತ್ತಿದೆ. ಕೆಲವು ನಿಮಿಷಗಳ ನಂತರ ಮತ್ತೆ ನೋಡಿ.';
  @override
  String get transcriptPending => 'ಪ್ರತಿಲಿಪಿ ಸಿದ್ಧವಾಗುತ್ತಿದೆ. ಕೆಲವು ನಿಮಿಷಗಳ ನಂತರ ಮತ್ತೆ ನೋಡಿ.';
  @override
  String get keyPoints => 'ಮುಖ್ಯ ಅಂಶಗಳು';
  @override
  String get chapters => 'ಅಧ್ಯಾಯಗಳು';
  @override
  String get retry => 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ';
  @override
  String get loadFailed => 'ಈ ಪಾಠ ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';
  @override
  String get recordingNotShared => 'ಈ ರೆಕಾರ್ಡಿಂಗ್ ಅನ್ನು ಈಗ ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಂಡಿಲ್ಲ.';
  @override
  String get underAMinute => 'ಒಂದು ನಿಮಿಷಕ್ಕಿಂತ ಕಡಿಮೆ';
  @override
  String minutes(int m) => '$m ನಿಮಿಷ';
  @override
  String hours(int h) => '$h ಗಂಟೆ';
  @override
  String hoursMinutes(int h, int m) => '$h ಗಂಟೆ $m ನಿಮಿಷ';
}

class _LessonStringsDelegate extends LocalizationsDelegate<LessonStrings> {
  const _LessonStringsDelegate();

  @override
  bool isSupported(Locale locale) => LessonStrings.supportedLanguages.contains(locale.languageCode);

  @override
  Future<LessonStrings> load(Locale locale) => SynchronousFuture(LessonStrings.forLocale(locale));

  @override
  bool shouldReload(_LessonStringsDelegate old) => false;
}
