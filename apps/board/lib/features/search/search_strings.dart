import 'package:flutter/widgets.dart';

/// The words of the board's search, filters and 3D solids, in English, Hindi and Kannada.
/// Kept with the feature (like the 3D viewer's and the CS kit's strings) so the board's ARB
/// files stay as they are.
class SearchStrings {
  const SearchStrings(this.lang);

  /// 'en', 'hi' or 'kn' (anything else reads as English).
  final String lang;

  static SearchStrings of(BuildContext context) => SearchStrings(Localizations.maybeLocaleOf(context)?.languageCode ?? 'en');

  String _t(String key) => (_strings[lang] ?? _strings['en']!)[key] ?? _strings['en']![key] ?? key;

  String get search => _t('search');
  String get searchTooltip => _t('searchTooltip');
  String get searchHint => _t('searchHint');
  String get searchModels => _t('searchModels');
  String get searchLabs => _t('searchLabs');
  String get searchTools => _t('searchTools');
  String get searchSims => _t('searchSims');
  String get searchTopics => _t('searchTopics');
  String get searchVideos => _t('searchVideos');
  String get searchSettings => _t('searchSettings');
  String get searchSolids => _t('searchSolids');
  String get recent => _t('recent');
  String get clearRecent => _t('clearRecent');
  String get tryThese => _t('tryThese');
  String noResults(String q) => _t('noResults').replaceAll('{q}', q);
  String showAll(int n) => _t('showAll').replaceAll('{n}', '$n');
  String found(int n) => _t('found').replaceAll('{n}', '$n');
  String get subject => _t('subject');
  String get category => _t('category');
  String get level => _t('level');
  String get chapter => _t('chapter');
  String get all => _t('all');
  String get clearFilters => _t('clearFilters');
  String get noneMatch => _t('noneMatch');
  String get formulas => _t('formulas');
  String get constants => _t('constants');
  String get pictures => _t('pictures');
  String get kit => _t('kit');
  String get settings => _t('settings');
  String get tools => _t('tools');
  String get putOnBoard => _t('putOnBoard');
  String get openInViewer => _t('openInViewer');
  String get solidsHint => _t('solidsHint');
  String get addedFormula => _t('addedFormula');
  String get offlineHint => _t('offlineHint');

  /// "Class 10", "UG"…: [code] is a level's code ('1'…'12', 'lkg', 'ukg', 'ug', 'pg').
  String levelName(String code) {
    final n = int.tryParse(code);
    if (n != null) return _t('classN').replaceAll('{n}', code);
    return _t('level_$code');
  }

  /// A group of results: [kind] is a SearchKind's name.
  String kindName(String kind) => _t('kind_$kind');

  /// Words to try when nothing is typed yet.
  List<String> get suggestions => _t('suggestions').split('|');

  String subjectName(String key) => _t('subject_$key');
  String categoryName(String key) => _t('cat_$key');
  String solidName(String kind) => _t('solid_$kind');

  static const _strings = <String, Map<String, String>>{
    'en': {
      'search': 'Search',
      'searchTooltip': 'Search everything (Ctrl+K)',
      'searchHint': 'Search tools, 3D models, labs, formulas…',
      'searchModels': 'Search 3D models',
      'searchLabs': 'Search labs',
      'searchTools': 'Search tools',
      'searchSims': 'Search simulations',
      'searchTopics': 'Search chapters and topics',
      'searchVideos': 'Search videos',
      'searchSettings': 'Search settings',
      'searchSolids': 'Search solids',
      'recent': 'Recent searches',
      'clearRecent': 'Clear',
      'tryThese': 'Try',
      'noResults': 'Nothing found for “{q}”',
      'showAll': 'Show all ({n})',
      'found': '{n} found',
      'subject': 'Subject',
      'category': 'Topic',
      'level': 'Class',
      'chapter': 'Chapter',
      'all': 'All',
      'clearFilters': 'Clear filters',
      'noneMatch': 'Nothing matches. Try fewer filters or another word.',
      'formulas': 'Formulas',
      'constants': 'Constants',
      'pictures': 'Pictures',
      'kit': 'Subject kit',
      'settings': 'Settings',
      'tools': 'Tools',
      'putOnBoard': 'Put on board',
      'openInViewer': 'Open in 3D viewer',
      'solidsHint': 'Tap a solid to turn it round, change its size and put it on the board.',
      'addedFormula': 'Formula put on the board.',
      'offlineHint': 'Works offline. Books and videos join in when the board is online.',
      'kind_tool': 'Tools',
      'kind_model3d': '3D models',
      'kind_lab': 'Virtual labs',
      'kind_formula': 'Formulas',
      'kind_kit': 'Subject kit',
      'kind_sim': 'Simulations',
      'kind_picture': 'Pictures',
      'kind_book': 'Books and lessons',
      'kind_video': 'Concept videos',
      'kind_setting': 'Settings',
      'suggestions': 'heart|lens|cube|timer|Ohm\'s law',
      'classN': 'Class {n}',
      'level_lkg': 'LKG',
      'level_ukg': 'UKG',
      'level_ug': 'Degree (UG)',
      'level_pg': 'Postgraduate (PG)',
      'subject_physics': 'Physics',
      'subject_chemistry': 'Chemistry',
      'subject_biology': 'Biology',
      'subject_maths': 'Maths',
      'subject_geography': 'Geography',
      'subject_space': 'Space',
      'subject_electronics': 'Electronics',
      'subject_forensics': 'Forensics',
      'cat_optics': 'Light and optics',
      'cat_magnetism': 'Magnetism',
      'cat_electricity': 'Electricity',
      'cat_waves': 'Sound and waves',
      'cat_heat': 'Heat',
      'cat_modern': 'Modern physics',
      'cat_mechanics': 'Force and motion',
      'cat_acids': 'Acids, bases and salts',
      'cat_reactions': 'Chemical reactions',
      'cat_atoms': 'Atoms and molecules',
      'cat_mixtures': 'Mixtures and separation',
      'cat_organic': 'Carbon compounds',
      'cat_humanBody': 'Human body',
      'cat_cells': 'Cells and genetics',
      'cat_plants': 'Plants',
      'cat_ecology': 'Life and environment',
      'cat_components': 'Components',
      'cat_digital': 'Digital logic',
      'cat_circuits': 'Circuits and instruments',
      'cat_evidence': 'Evidence',
      'cat_tests': 'Chemical tests',
      'cat_geometry': 'Shapes and mensuration',
      'cat_algebra': 'Algebra and graphs',
      'cat_trigonometry': 'Trigonometry',
      'cat_statistics': 'Statistics and probability',
      'cat_earth': 'The Earth',
      'cat_solarSystem': 'Sun, Moon and planets',
      'cat_other': 'Other',
      'solid_cube': 'Cube',
      'solid_cuboid': 'Cuboid',
      'solid_sphere': 'Sphere',
      'solid_hemisphere': 'Hemisphere',
      'solid_cylinder': 'Cylinder',
      'solid_cone': 'Cone',
      'solid_frustum': 'Frustum of a cone',
      'solid_squarePyramid': 'Square pyramid',
      'solid_triangularPrism': 'Triangular prism',
      'solid_tetrahedron': 'Regular tetrahedron',
    },
    'hi': {
      'search': 'खोजें',
      'searchTooltip': 'सब कुछ खोजें (Ctrl+K)',
      'searchHint': 'टूल, 3D मॉडल, लैब, सूत्र खोजें…',
      'searchModels': '3D मॉडल खोजें',
      'searchLabs': 'लैब खोजें',
      'searchTools': 'टूल खोजें',
      'searchSims': 'सिमुलेशन खोजें',
      'searchTopics': 'अध्याय और विषय खोजें',
      'searchVideos': 'वीडियो खोजें',
      'searchSettings': 'सेटिंग्स खोजें',
      'searchSolids': 'ठोस खोजें',
      'recent': 'हाल की खोजें',
      'clearRecent': 'मिटाएँ',
      'tryThese': 'आज़माएँ',
      'noResults': '“{q}” के लिए कुछ नहीं मिला',
      'showAll': 'सभी दिखाएँ ({n})',
      'found': '{n} मिले',
      'subject': 'विषय',
      'category': 'प्रकरण',
      'level': 'कक्षा',
      'chapter': 'अध्याय',
      'all': 'सभी',
      'clearFilters': 'फ़िल्टर हटाएँ',
      'noneMatch': 'कुछ मेल नहीं खाता। कम फ़िल्टर या कोई और शब्द आज़माएँ।',
      'formulas': 'सूत्र',
      'constants': 'स्थिरांक',
      'pictures': 'चित्र',
      'kit': 'विषय किट',
      'settings': 'सेटिंग्स',
      'tools': 'टूल',
      'putOnBoard': 'बोर्ड पर लगाएँ',
      'openInViewer': '3D व्यूअर में खोलें',
      'solidsHint': 'किसी ठोस को घुमाने, उसका माप बदलने और बोर्ड पर लगाने के लिए टैप करें।',
      'addedFormula': 'सूत्र बोर्ड पर लगा दिया गया।',
      'offlineHint': 'बिना इंटरनेट के चलता है। बोर्ड ऑनलाइन होने पर पुस्तकें और वीडियो भी मिलते हैं।',
      'kind_tool': 'टूल',
      'kind_model3d': '3D मॉडल',
      'kind_lab': 'वर्चुअल लैब',
      'kind_formula': 'सूत्र',
      'kind_kit': 'विषय किट',
      'kind_sim': 'सिमुलेशन',
      'kind_picture': 'चित्र',
      'kind_book': 'पुस्तकें और पाठ',
      'kind_video': 'कॉन्सेप्ट वीडियो',
      'kind_setting': 'सेटिंग्स',
      'suggestions': 'हृदय|लेंस|घन|टाइमर|ओम का नियम',
      'classN': 'कक्षा {n}',
      'level_lkg': 'एलकेजी',
      'level_ukg': 'यूकेजी',
      'level_ug': 'स्नातक (UG)',
      'level_pg': 'स्नातकोत्तर (PG)',
      'subject_physics': 'भौतिकी',
      'subject_chemistry': 'रसायन विज्ञान',
      'subject_biology': 'जीव विज्ञान',
      'subject_maths': 'गणित',
      'subject_geography': 'भूगोल',
      'subject_space': 'अंतरिक्ष',
      'subject_electronics': 'इलेक्ट्रॉनिक्स',
      'subject_forensics': 'फ़ॉरेंसिक विज्ञान',
      'cat_optics': 'प्रकाश और प्रकाशिकी',
      'cat_magnetism': 'चुंबकत्व',
      'cat_electricity': 'विद्युत',
      'cat_waves': 'ध्वनि और तरंगें',
      'cat_heat': 'ऊष्मा',
      'cat_modern': 'आधुनिक भौतिकी',
      'cat_mechanics': 'बल और गति',
      'cat_acids': 'अम्ल, क्षार और लवण',
      'cat_reactions': 'रासायनिक अभिक्रियाएँ',
      'cat_atoms': 'परमाणु और अणु',
      'cat_mixtures': 'मिश्रण और पृथक्करण',
      'cat_organic': 'कार्बन यौगिक',
      'cat_humanBody': 'मानव शरीर',
      'cat_cells': 'कोशिका और आनुवंशिकी',
      'cat_plants': 'पौधे',
      'cat_ecology': 'जीवन और पर्यावरण',
      'cat_components': 'घटक',
      'cat_digital': 'डिजिटल लॉजिक',
      'cat_circuits': 'परिपथ और उपकरण',
      'cat_evidence': 'साक्ष्य',
      'cat_tests': 'रासायनिक परीक्षण',
      'cat_geometry': 'आकृतियाँ और क्षेत्रमिति',
      'cat_algebra': 'बीजगणित और ग्राफ़',
      'cat_trigonometry': 'त्रिकोणमिति',
      'cat_statistics': 'सांख्यिकी और प्रायिकता',
      'cat_earth': 'पृथ्वी',
      'cat_solarSystem': 'सूर्य, चंद्रमा और ग्रह',
      'cat_other': 'अन्य',
      'solid_cube': 'घन',
      'solid_cuboid': 'घनाभ',
      'solid_sphere': 'गोला',
      'solid_hemisphere': 'अर्धगोला',
      'solid_cylinder': 'बेलन',
      'solid_cone': 'शंकु',
      'solid_frustum': 'शंकु का छिन्नक',
      'solid_squarePyramid': 'वर्ग पिरामिड',
      'solid_triangularPrism': 'त्रिभुजाकार प्रिज़्म',
      'solid_tetrahedron': 'समचतुष्फलक',
    },
    'kn': {
      'search': 'ಹುಡುಕಿ',
      'searchTooltip': 'ಎಲ್ಲವನ್ನೂ ಹುಡುಕಿ (Ctrl+K)',
      'searchHint': 'ಉಪಕರಣ, 3D ಮಾದರಿ, ಪ್ರಯೋಗಾಲಯ, ಸೂತ್ರ ಹುಡುಕಿ…',
      'searchModels': '3D ಮಾದರಿಗಳನ್ನು ಹುಡುಕಿ',
      'searchLabs': 'ಪ್ರಯೋಗಾಲಯಗಳನ್ನು ಹುಡುಕಿ',
      'searchTools': 'ಉಪಕರಣಗಳನ್ನು ಹುಡುಕಿ',
      'searchSims': 'ಸಿಮ್ಯುಲೇಶನ್‌ಗಳನ್ನು ಹುಡುಕಿ',
      'searchTopics': 'ಅಧ್ಯಾಯ ಮತ್ತು ವಿಷಯಗಳನ್ನು ಹುಡುಕಿ',
      'searchVideos': 'ವೀಡಿಯೊಗಳನ್ನು ಹುಡುಕಿ',
      'searchSettings': 'ಸೆಟ್ಟಿಂಗ್‌ಗಳನ್ನು ಹುಡುಕಿ',
      'searchSolids': 'ಘನಾಕೃತಿಗಳನ್ನು ಹುಡುಕಿ',
      'recent': 'ಇತ್ತೀಚಿನ ಹುಡುಕಾಟಗಳು',
      'clearRecent': 'ಅಳಿಸಿ',
      'tryThese': 'ಪ್ರಯತ್ನಿಸಿ',
      'noResults': '“{q}” ಗೆ ಏನೂ ಸಿಗಲಿಲ್ಲ',
      'showAll': 'ಎಲ್ಲವನ್ನೂ ತೋರಿಸಿ ({n})',
      'found': '{n} ಸಿಕ್ಕಿವೆ',
      'subject': 'ವಿಷಯ',
      'category': 'ವಿಭಾಗ',
      'level': 'ತರಗತಿ',
      'chapter': 'ಅಧ್ಯಾಯ',
      'all': 'ಎಲ್ಲಾ',
      'clearFilters': 'ಫಿಲ್ಟರ್ ತೆಗೆಯಿರಿ',
      'noneMatch': 'ಯಾವುದೂ ಹೊಂದುತ್ತಿಲ್ಲ. ಕಡಿಮೆ ಫಿಲ್ಟರ್ ಅಥವಾ ಬೇರೆ ಪದ ಪ್ರಯತ್ನಿಸಿ.',
      'formulas': 'ಸೂತ್ರಗಳು',
      'constants': 'ಸ್ಥಿರಾಂಕಗಳು',
      'pictures': 'ಚಿತ್ರಗಳು',
      'kit': 'ವಿಷಯ ಕಿಟ್',
      'settings': 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
      'tools': 'ಉಪಕರಣಗಳು',
      'putOnBoard': 'ಬೋರ್ಡ್‌ಗೆ ಹಾಕಿ',
      'openInViewer': '3D ವೀಕ್ಷಕದಲ್ಲಿ ತೆರೆಯಿರಿ',
      'solidsHint': 'ಘನಾಕೃತಿಯನ್ನು ತಿರುಗಿಸಲು, ಅಳತೆ ಬದಲಿಸಲು ಮತ್ತು ಬೋರ್ಡ್‌ಗೆ ಹಾಕಲು ಟ್ಯಾಪ್ ಮಾಡಿ.',
      'addedFormula': 'ಸೂತ್ರವನ್ನು ಬೋರ್ಡ್‌ಗೆ ಹಾಕಲಾಗಿದೆ.',
      'offlineHint': 'ಇಂಟರ್ನೆಟ್ ಇಲ್ಲದೆಯೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ. ಬೋರ್ಡ್ ಆನ್‌ಲೈನ್ ಇದ್ದಾಗ ಪುಸ್ತಕ ಮತ್ತು ವೀಡಿಯೊಗಳೂ ಸಿಗುತ್ತವೆ.',
      'kind_tool': 'ಉಪಕರಣಗಳು',
      'kind_model3d': '3D ಮಾದರಿಗಳು',
      'kind_lab': 'ವರ್ಚುವಲ್ ಪ್ರಯೋಗಾಲಯಗಳು',
      'kind_formula': 'ಸೂತ್ರಗಳು',
      'kind_kit': 'ವಿಷಯ ಕಿಟ್',
      'kind_sim': 'ಸಿಮ್ಯುಲೇಶನ್‌ಗಳು',
      'kind_picture': 'ಚಿತ್ರಗಳು',
      'kind_book': 'ಪುಸ್ತಕಗಳು ಮತ್ತು ಪಾಠಗಳು',
      'kind_video': 'ಪರಿಕಲ್ಪನಾ ವೀಡಿಯೊಗಳು',
      'kind_setting': 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
      'suggestions': 'ಹೃದಯ|ಮಸೂರ|ಘನ|ಟೈಮರ್|ಓಮ್‌ನ ನಿಯಮ',
      'classN': 'ತರಗತಿ {n}',
      'level_lkg': 'ಎಲ್‌ಕೆಜಿ',
      'level_ukg': 'ಯುಕೆಜಿ',
      'level_ug': 'ಪದವಿ (UG)',
      'level_pg': 'ಸ್ನಾತಕೋತ್ತರ (PG)',
      'subject_physics': 'ಭೌತಶಾಸ್ತ್ರ',
      'subject_chemistry': 'ರಸಾಯನಶಾಸ್ತ್ರ',
      'subject_biology': 'ಜೀವಶಾಸ್ತ್ರ',
      'subject_maths': 'ಗಣಿತ',
      'subject_geography': 'ಭೂಗೋಳ',
      'subject_space': 'ಬಾಹ್ಯಾಕಾಶ',
      'subject_electronics': 'ಎಲೆಕ್ಟ್ರಾನಿಕ್ಸ್',
      'subject_forensics': 'ವಿಧಿವಿಜ್ಞಾನ',
      'cat_optics': 'ಬೆಳಕು ಮತ್ತು ದೃಗ್ವಿಜ್ಞಾನ',
      'cat_magnetism': 'ಕಾಂತೀಯತೆ',
      'cat_electricity': 'ವಿದ್ಯುತ್',
      'cat_waves': 'ಶಬ್ದ ಮತ್ತು ತರಂಗಗಳು',
      'cat_heat': 'ಉಷ್ಣ',
      'cat_modern': 'ಆಧುನಿಕ ಭೌತಶಾಸ್ತ್ರ',
      'cat_mechanics': 'ಬಲ ಮತ್ತು ಚಲನೆ',
      'cat_acids': 'ಆಮ್ಲ, ಪ್ರತ್ಯಾಮ್ಲ ಮತ್ತು ಲವಣಗಳು',
      'cat_reactions': 'ರಾಸಾಯನಿಕ ಕ್ರಿಯೆಗಳು',
      'cat_atoms': 'ಪರಮಾಣು ಮತ್ತು ಅಣುಗಳು',
      'cat_mixtures': 'ಮಿಶ್ರಣ ಮತ್ತು ಬೇರ್ಪಡಿಸುವಿಕೆ',
      'cat_organic': 'ಇಂಗಾಲದ ಸಂಯುಕ್ತಗಳು',
      'cat_humanBody': 'ಮಾನವ ದೇಹ',
      'cat_cells': 'ಜೀವಕೋಶ ಮತ್ತು ತಳಿಶಾಸ್ತ್ರ',
      'cat_plants': 'ಸಸ್ಯಗಳು',
      'cat_ecology': 'ಜೀವ ಮತ್ತು ಪರಿಸರ',
      'cat_components': 'ಘಟಕಗಳು',
      'cat_digital': 'ಡಿಜಿಟಲ್ ತರ್ಕ',
      'cat_circuits': 'ಮಂಡಲಗಳು ಮತ್ತು ಉಪಕರಣಗಳು',
      'cat_evidence': 'ಸಾಕ್ಷ್ಯ',
      'cat_tests': 'ರಾಸಾಯನಿಕ ಪರೀಕ್ಷೆಗಳು',
      'cat_geometry': 'ಆಕೃತಿಗಳು ಮತ್ತು ಕ್ಷೇತ್ರಮಿತಿ',
      'cat_algebra': 'ಬೀಜಗಣಿತ ಮತ್ತು ಆಲೇಖಗಳು',
      'cat_trigonometry': 'ತ್ರಿಕೋನಮಿತಿ',
      'cat_statistics': 'ಸಂಖ್ಯಾಶಾಸ್ತ್ರ ಮತ್ತು ಸಂಭವನೀಯತೆ',
      'cat_earth': 'ಭೂಮಿ',
      'cat_solarSystem': 'ಸೂರ್ಯ, ಚಂದ್ರ ಮತ್ತು ಗ್ರಹಗಳು',
      'cat_other': 'ಇತರೆ',
      'solid_cube': 'ಘನ',
      'solid_cuboid': 'ಆಯತಘನ',
      'solid_sphere': 'ಗೋಳ',
      'solid_hemisphere': 'ಅರ್ಧಗೋಳ',
      'solid_cylinder': 'ಸಿಲಿಂಡರ್',
      'solid_cone': 'ಶಂಕು',
      'solid_frustum': 'ಶಂಕುವಿನ ಛಿನ್ನಕ',
      'solid_squarePyramid': 'ಚೌಕ ಪಿರಮಿಡ್',
      'solid_triangularPrism': 'ತ್ರಿಕೋನ ಪಟ್ಟಕ',
      'solid_tetrahedron': 'ಸಮಚತುರ್ಮುಖಿ',
    },
  };

  /// Every key, for the completeness test.
  static Iterable<String> get keys => _strings['en']!.keys;
  static String? raw(String lang, String key) => _strings[lang]?[key];
}
