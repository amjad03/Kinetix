import 'package:flutter/widgets.dart';

/// The shared widgets' words in English, Hindi and Kannada (see docs/i18n/glossary.md). They
/// follow the ambient [Locale], so apps need no extra delegate; anything else is English.
///
/// First-draft translations: they need review by native speakers before release.
class KxStrings {
  const KxStrings._(this._lang);

  final String _lang;

  static KxStrings of(BuildContext context) => forLanguage(Localizations.maybeLocaleOf(context)?.languageCode);

  static KxStrings forLanguage(String? code) => KxStrings._(switch (code) {
    'hi' => 'hi',
    'kn' => 'kn',
    _ => 'en',
  });

  /// The language these strings are in: en, hi or kn.
  String get language => _lang;

  String _t(String en, String hi, String kn) => switch (_lang) {
    'hi' => hi,
    'kn' => kn,
    _ => en,
  };

  String get search => _t('Search', 'खोजें', 'ಹುಡುಕಿ');
  String noMatches(String q) => _t('Nothing matches “$q”', '“$q” से कुछ नहीं मिला', '“$q” ಗೆ ಹೊಂದುವುದು ಏನೂ ಇಲ್ಲ');
  String get choose => _t('Choose', 'चुनें', 'ಆಯ್ಕೆಮಾಡಿ');
  String get all => _t('All', 'सभी', 'ಎಲ್ಲಾ');
  String get cancel => _t('Cancel', 'रद्द करें', 'ರದ್ದುಮಾಡಿ');
  String get save => _t('Save', 'सहेजें', 'ಉಳಿಸಿ');

  String get editProfile => _t('Edit profile', 'प्रोफ़ाइल बदलें', 'ಪ್ರೊಫೈಲ್ ಬದಲಿಸಿ');
  String get changePhoto => _t('Change photo', 'फ़ोटो बदलें', 'ಫೋಟೋ ಬದಲಿಸಿ');
  String get takePhoto => _t('Take a photo', 'फ़ोटो खींचें', 'ಫೋಟೋ ತೆಗೆಯಿರಿ');
  String get chooseFromGallery => _t('Choose from gallery', 'गैलरी से चुनें', 'ಗ್ಯಾಲರಿಯಿಂದ ಆಯ್ಕೆಮಾಡಿ');
  String get removePhoto => _t('Remove photo', 'फ़ोटो हटाएँ', 'ಫೋಟೋ ತೆಗೆದುಹಾಕಿ');
  String get photoSaved => _t('Photo updated', 'फ़ोटो बदल दी गई', 'ಫೋಟೋ ಬದಲಾಗಿದೆ');
  String get photoUnusable => _t('Could not use this photo. Try another.', 'यह फ़ोटो इस्तेमाल नहीं हो सकी। दूसरी आज़माएँ।', 'ಈ ಫೋಟೋ ಬಳಸಲಾಗಲಿಲ್ಲ. ಬೇರೊಂದನ್ನು ಪ್ರಯತ್ನಿಸಿ.');
  String get fullName => _t('Full name', 'पूरा नाम', 'ಪೂರ್ಣ ಹೆಸರು');
  String get nameRequired => _t('Enter your full name', 'अपना पूरा नाम लिखें', 'ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರು ನಮೂದಿಸಿ');
  String get email => _t('Email', 'ईमेल', 'ಇಮೇಲ್');
  String get emailInvalid => _t('Enter a valid email address', 'सही ईमेल पता लिखें', 'ಸರಿಯಾದ ಇಮೇಲ್ ವಿಳಾಸ ನಮೂದಿಸಿ');
  String get phone => _t('Phone', 'फ़ोन', 'ಫೋನ್');
  String get phoneReadOnly => _t(
    'You sign in with this number, so only your institution’s office can change it.',
    'आप इसी नंबर से साइन इन करते हैं, इसलिए इसे केवल आपके संस्थान का कार्यालय बदल सकता है।',
    'ನೀವು ಈ ಸಂಖ್ಯೆಯಿಂದ ಸೈನ್ ಇನ್ ಮಾಡುತ್ತೀರಿ, ಆದ್ದರಿಂದ ನಿಮ್ಮ ಸಂಸ್ಥೆಯ ಕಚೇರಿ ಮಾತ್ರ ಇದನ್ನು ಬದಲಿಸಬಹುದು.',
  );
  String get noPhone => _t('Not set', 'नहीं दिया गया', 'ನೀಡಿಲ್ಲ');
  String get subjectsYouTeach => _t('Subjects you teach', 'आप जो विषय पढ़ाते हैं', 'ನೀವು ಕಲಿಸುವ ವಿಷಯಗಳು');
  String get addSubject => _t('Add a subject', 'विषय जोड़ें', 'ವಿಷಯ ಸೇರಿಸಿ');
  String removeSubject(String s) => _t('Remove $s', '$s हटाएँ', '$s ತೆಗೆದುಹಾಕಿ');
  String get profileSaved => _t('Profile saved', 'प्रोफ़ाइल सहेजी गई', 'ಪ್ರೊಫೈಲ್ ಉಳಿಸಲಾಗಿದೆ');

  String get badges => _t('Badges', 'बैज', 'ಬ್ಯಾಡ್ಜ್‌ಗಳು');
  String get noBadges => _t('No badges yet', 'अभी कोई बैज नहीं', 'ಇನ್ನೂ ಯಾವುದೇ ಬ್ಯಾಡ್ಜ್ ಇಲ್ಲ');
  String badgeFrom(String teacher) => _t('From $teacher', '$teacher की ओर से', '$teacher ಅವರಿಂದ');
  String newBadge(String badge) => _t('New badge: $badge!', 'नया बैज: $badge!', 'ಹೊಸ ಬ್ಯಾಡ್ಜ್: $badge!');
  String get awardBadge => _t('Award a badge', 'बैज दें', 'ಬ್ಯಾಡ್ಜ್ ನೀಡಿ');
  String awardBadgeTo(String student) => _t('Award a badge to $student', '$student को बैज दें', '$student ಅವರಿಗೆ ಬ್ಯಾಡ್ಜ್ ನೀಡಿ');
  String badgeAwarded(String badge, String student) =>
      _t('$badge awarded to $student', '$student को “$badge” बैज दिया गया', '$student ಅವರಿಗೆ “$badge” ಬ್ಯಾಡ್ಜ್ ನೀಡಲಾಗಿದೆ');
}
