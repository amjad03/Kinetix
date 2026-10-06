import 'package:flutter/widgets.dart';

/// The words of the PhET sims (lib/features/phet) in English, Hindi and Kannada, kept with the
/// feature like the layout's strings, so the board's ARB files stay as they are. The
/// attribution line is PhET's and stays in English everywhere (CC BY 4.0 asks for it as given).
class PhetStrings {
  const PhetStrings(this.lang);

  /// 'en', 'hi' or 'kn' (anything else reads as English).
  final String lang;

  static PhetStrings of(BuildContext context) => PhetStrings(Localizations.maybeLocaleOf(context)?.languageCode ?? 'en');

  static const attribution = 'PhET Interactive Simulations, University of Colorado Boulder, CC BY 4.0';

  String t(String key) => (_strings[lang] ?? _strings['en']!)[key] ?? _strings['en']![key] ?? key;

  String get tab => t('tab');
  String get title => t('title');
  String get search => t('search');
  String get subject => t('subject');
  String get topic => t('topic');
  String get level => t('level');
  String get download => t('download');
  String get resume => t('resume');
  String get cancel => t('cancel');
  String get open => t('open');
  String get delete => t('delete');
  String get downloaded => t('downloaded');
  String get storage => t('storage');
  String get noneMatch => t('noneMatch');
  String get noneDownloaded => t('noneDownloaded');
  String get couldNotDownload => t('couldNotDownload');
  String get related => t('related');
  String get fromPhet => t('fromPhet');
  String get noViewer => t('noViewer');
  String get shotAdded => t('shotAdded');
  String get shotFailed => t('shotFailed');
  String get back => t('back');
  String get approx => t('approx');
  String get downloadFirst => t('downloadFirst');
  String used(String size) => t('used').replaceAll('{size}', size);
  String count(int n) => t('count').replaceAll('{n}', '$n');

  String subjectName(String id) => t('subject.$id');
  String topicName(String id) => t('topic.$id');
  String levelName(String id) => id == 'UG' ? t('ug') : t('class').replaceAll('{n}', id);

  static const _strings = <String, Map<String, String>>{
    'en': {
      'tab': 'Sims',
      'title': 'PhET simulations',
      'search': 'Search sims',
      'subject': 'Subject',
      'topic': 'Topic',
      'level': 'Class',
      'class': 'Class {n}',
      'ug': 'UG',
      'download': 'Download',
      'resume': 'Resume',
      'cancel': 'Cancel',
      'open': 'Open',
      'delete': 'Delete',
      'downloaded': 'Downloaded',
      'storage': 'Storage',
      'used': '{size} used on this board',
      'count': '{n} sims',
      'noneMatch': 'No sims match.',
      'noneDownloaded': 'No sims downloaded yet.',
      'couldNotDownload': 'Could not download the sim. Check the internet and try again.',
      'related': 'Related PhET sims',
      'fromPhet': 'Downloads come from phet.colorado.edu (no KINETIX mirror here).',
      'noViewer': 'This board cannot show web pages (WebView is missing).',
      'shotAdded': 'Picture of the sim added to the board',
      'shotFailed': 'Could not take a picture of the sim',
      'back': 'All sims',
      'approx': 'about',
      'downloadFirst': 'Download it once; it then opens without the internet.',
      'subject.physics': 'Physics',
      'subject.chemistry': 'Chemistry',
      'subject.biology': 'Biology',
      'subject.maths': 'Maths',
      'subject.earth-science': 'Earth science',
      'topic.acids-bases': 'Acids, bases and salts',
      'topic.algebra': 'Algebra',
      'topic.atomic-structure': 'Structure of the atom',
      'topic.atoms-nuclei': 'Atoms and nuclei',
      'topic.bonding': 'Chemical bonding',
      'topic.calculus': 'Calculus',
      'topic.cells': 'Cells',
      'topic.climate': 'Climate',
      'topic.electricity': 'Electricity',
      'topic.energy': 'Work and energy',
      'topic.evolution': 'Evolution',
      'topic.fluids': 'Fluids and pressure',
      'topic.forces': 'Force and laws of motion',
      'topic.fractions': 'Fractions',
      'topic.functions': 'Functions',
      'topic.genetics': 'Genetics',
      'topic.geometry': 'Geometry',
      'topic.graphs': 'Graphs',
      'topic.gravitation': 'Gravitation',
      'topic.heat': 'Heat',
      'topic.human-body': 'Human body',
      'topic.light': 'Light',
      'topic.magnetism': 'Magnetism',
      'topic.modern-physics': 'Modern physics',
      'topic.motion': 'Motion',
      'topic.number': 'Numbers',
      'topic.oscillations': 'Oscillations',
      'topic.probability': 'Probability',
      'topic.ratio': 'Ratio and proportion',
      'topic.reactions': 'Chemical reactions',
      'topic.solutions': 'Solutions',
      'topic.states-of-matter': 'States of matter',
      'topic.statistics': 'Statistics',
      'topic.trigonometry': 'Trigonometry',
      'topic.waves': 'Waves and sound',
    },
    'hi': {
      'tab': 'सिम',
      'title': 'PhET सिमुलेशन',
      'search': 'सिम खोजें',
      'subject': 'विषय',
      'topic': 'टॉपिक',
      'level': 'कक्षा',
      'class': 'कक्षा {n}',
      'ug': 'स्नातक',
      'download': 'डाउनलोड करें',
      'resume': 'फिर शुरू करें',
      'cancel': 'रद्द करें',
      'open': 'खोलें',
      'delete': 'हटाएँ',
      'downloaded': 'डाउनलोड हो गया',
      'storage': 'स्टोरेज',
      'used': 'इस बोर्ड पर {size} इस्तेमाल',
      'count': '{n} सिम',
      'noneMatch': 'कोई सिम नहीं मिला।',
      'noneDownloaded': 'अभी कोई सिम डाउनलोड नहीं हुआ।',
      'couldNotDownload': 'सिम डाउनलोड नहीं हो सका। इंटरनेट देखकर फिर कोशिश करें।',
      'related': 'संबंधित PhET सिम',
      'fromPhet': 'डाउनलोड phet.colorado.edu से होते हैं (यहाँ KINETIX मिरर नहीं है)।',
      'noViewer': 'यह बोर्ड वेब पेज नहीं दिखा सकता (WebView नहीं है)।',
      'shotAdded': 'सिम की तस्वीर बोर्ड पर जोड़ दी गई',
      'shotFailed': 'सिम की तस्वीर नहीं ली जा सकी',
      'back': 'सभी सिम',
      'approx': 'लगभग',
      'downloadFirst': 'एक बार डाउनलोड करें; फिर यह बिना इंटरनेट खुलेगा।',
      'subject.physics': 'भौतिकी',
      'subject.chemistry': 'रसायन विज्ञान',
      'subject.biology': 'जीव विज्ञान',
      'subject.maths': 'गणित',
      'subject.earth-science': 'पृथ्वी विज्ञान',
      'topic.acids-bases': 'अम्ल, क्षार और लवण',
      'topic.algebra': 'बीजगणित',
      'topic.atomic-structure': 'परमाणु की संरचना',
      'topic.atoms-nuclei': 'परमाणु और नाभिक',
      'topic.bonding': 'रासायनिक आबंधन',
      'topic.calculus': 'कलन',
      'topic.cells': 'कोशिका',
      'topic.climate': 'जलवायु',
      'topic.electricity': 'विद्युत',
      'topic.energy': 'कार्य और ऊर्जा',
      'topic.evolution': 'विकास',
      'topic.fluids': 'तरल और दाब',
      'topic.forces': 'बल और गति के नियम',
      'topic.fractions': 'भिन्न',
      'topic.functions': 'फलन',
      'topic.genetics': 'आनुवंशिकी',
      'topic.geometry': 'ज्यामिति',
      'topic.graphs': 'ग्राफ़',
      'topic.gravitation': 'गुरुत्वाकर्षण',
      'topic.heat': 'ऊष्मा',
      'topic.human-body': 'मानव शरीर',
      'topic.light': 'प्रकाश',
      'topic.magnetism': 'चुंबकत्व',
      'topic.modern-physics': 'आधुनिक भौतिकी',
      'topic.motion': 'गति',
      'topic.number': 'संख्याएँ',
      'topic.oscillations': 'दोलन',
      'topic.probability': 'प्रायिकता',
      'topic.ratio': 'अनुपात और समानुपात',
      'topic.reactions': 'रासायनिक अभिक्रियाएँ',
      'topic.solutions': 'विलयन',
      'topic.states-of-matter': 'पदार्थ की अवस्थाएँ',
      'topic.statistics': 'सांख्यिकी',
      'topic.trigonometry': 'त्रिकोणमिति',
      'topic.waves': 'तरंगें और ध्वनि',
    },
    'kn': {
      'tab': 'ಸಿಮ್‌ಗಳು',
      'title': 'PhET ಸಿಮ್ಯುಲೇಶನ್‌ಗಳು',
      'search': 'ಸಿಮ್ ಹುಡುಕಿ',
      'subject': 'ವಿಷಯ',
      'topic': 'ಟಾಪಿಕ್',
      'level': 'ತರಗತಿ',
      'class': 'ತರಗತಿ {n}',
      'ug': 'ಪದವಿ',
      'download': 'ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ',
      'resume': 'ಮುಂದುವರಿಸಿ',
      'cancel': 'ರದ್ದುಮಾಡಿ',
      'open': 'ತೆರೆಯಿರಿ',
      'delete': 'ಅಳಿಸಿ',
      'downloaded': 'ಡೌನ್‌ಲೋಡ್ ಆಗಿದೆ',
      'storage': 'ಸಂಗ್ರಹಣೆ',
      'used': 'ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ {size} ಬಳಕೆ',
      'count': '{n} ಸಿಮ್‌ಗಳು',
      'noneMatch': 'ಯಾವ ಸಿಮ್ ಸಿಗಲಿಲ್ಲ.',
      'noneDownloaded': 'ಇನ್ನೂ ಯಾವ ಸಿಮ್ ಡೌನ್‌ಲೋಡ್ ಆಗಿಲ್ಲ.',
      'couldNotDownload': 'ಸಿಮ್ ಡೌನ್‌ಲೋಡ್ ಆಗಲಿಲ್ಲ. ಇಂಟರ್ನೆಟ್ ನೋಡಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
      'related': 'ಸಂಬಂಧಿತ PhET ಸಿಮ್‌ಗಳು',
      'fromPhet': 'ಡೌನ್‌ಲೋಡ್‌ಗಳು phet.colorado.edu ಇಂದ ಬರುತ್ತವೆ (ಇಲ್ಲಿ KINETIX ಮಿರರ್ ಇಲ್ಲ).',
      'noViewer': 'ಈ ಬೋರ್ಡ್ ವೆಬ್ ಪುಟಗಳನ್ನು ತೋರಿಸಲಾರದು (WebView ಇಲ್ಲ).',
      'shotAdded': 'ಸಿಮ್‌ನ ಚಿತ್ರವನ್ನು ಬೋರ್ಡ್‌ಗೆ ಸೇರಿಸಲಾಗಿದೆ',
      'shotFailed': 'ಸಿಮ್‌ನ ಚಿತ್ರ ತೆಗೆಯಲಾಗಲಿಲ್ಲ',
      'back': 'ಎಲ್ಲ ಸಿಮ್‌ಗಳು',
      'approx': 'ಸುಮಾರು',
      'downloadFirst': 'ಒಮ್ಮೆ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ; ನಂತರ ಇಂಟರ್ನೆಟ್ ಇಲ್ಲದೆ ತೆರೆಯುತ್ತದೆ.',
      'subject.physics': 'ಭೌತಶಾಸ್ತ್ರ',
      'subject.chemistry': 'ರಸಾಯನಶಾಸ್ತ್ರ',
      'subject.biology': 'ಜೀವಶಾಸ್ತ್ರ',
      'subject.maths': 'ಗಣಿತ',
      'subject.earth-science': 'ಭೂ ವಿಜ್ಞಾನ',
      'topic.acids-bases': 'ಆಮ್ಲಗಳು, ಪ್ರತ್ಯಾಮ್ಲಗಳು ಮತ್ತು ಲವಣಗಳು',
      'topic.algebra': 'ಬೀಜಗಣಿತ',
      'topic.atomic-structure': 'ಪರಮಾಣುವಿನ ರಚನೆ',
      'topic.atoms-nuclei': 'ಪರಮಾಣು ಮತ್ತು ನ್ಯೂಕ್ಲಿಯಸ್',
      'topic.bonding': 'ರಾಸಾಯನಿಕ ಬಂಧ',
      'topic.calculus': 'ಕಲನಶಾಸ್ತ್ರ',
      'topic.cells': 'ಜೀವಕೋಶ',
      'topic.climate': 'ಹವಾಮಾನ',
      'topic.electricity': 'ವಿದ್ಯುತ್',
      'topic.energy': 'ಕೆಲಸ ಮತ್ತು ಶಕ್ತಿ',
      'topic.evolution': 'ವಿಕಾಸ',
      'topic.fluids': 'ದ್ರವಗಳು ಮತ್ತು ಒತ್ತಡ',
      'topic.forces': 'ಬಲ ಮತ್ತು ಚಲನೆಯ ನಿಯಮಗಳು',
      'topic.fractions': 'ಭಿನ್ನರಾಶಿಗಳು',
      'topic.functions': 'ಫಲನಗಳು',
      'topic.genetics': 'ಅನುವಂಶೀಯತೆ',
      'topic.geometry': 'ರೇಖಾಗಣಿತ',
      'topic.graphs': 'ನಕ್ಷೆಗಳು',
      'topic.gravitation': 'ಗುರುತ್ವಾಕರ್ಷಣೆ',
      'topic.heat': 'ಉಷ್ಣ',
      'topic.human-body': 'ಮಾನವ ದೇಹ',
      'topic.light': 'ಬೆಳಕು',
      'topic.magnetism': 'ಕಾಂತೀಯತೆ',
      'topic.modern-physics': 'ಆಧುನಿಕ ಭೌತಶಾಸ್ತ್ರ',
      'topic.motion': 'ಚಲನೆ',
      'topic.number': 'ಸಂಖ್ಯೆಗಳು',
      'topic.oscillations': 'ಆಂದೋಲನಗಳು',
      'topic.probability': 'ಸಂಭವನೀಯತೆ',
      'topic.ratio': 'ಅನುಪಾತ ಮತ್ತು ಸಮಾನುಪಾತ',
      'topic.reactions': 'ರಾಸಾಯನಿಕ ಕ್ರಿಯೆಗಳು',
      'topic.solutions': 'ದ್ರಾವಣಗಳು',
      'topic.states-of-matter': 'ದ್ರವ್ಯದ ಸ್ಥಿತಿಗಳು',
      'topic.statistics': 'ಸಂಖ್ಯಾಶಾಸ್ತ್ರ',
      'topic.trigonometry': 'ತ್ರಿಕೋನಮಿತಿ',
      'topic.waves': 'ತರಂಗಗಳು ಮತ್ತು ಧ್ವನಿ',
    },
  };
}

/// 6.2 MB, 850 KB: sizes as people read them.
String phetSize(int bytes) {
  if (bytes >= 1000000) return '${(bytes / 1000000).toStringAsFixed(1)} MB';
  if (bytes >= 1000) return '${(bytes / 1000).round()} KB';
  return '$bytes B';
}
