import 'package:flutter/widgets.dart';

/// The words of the board's layout (the approved wireframes, docs/design/board-wireframes.html):
/// the floating toolbar, the class bar, the menu, pages, the split panel, the pen popover, the
/// tools drawer, the timer, backgrounds and badges, in English, Hindi and Kannada. Kept with
/// the feature, like the search's strings, so the board's ARB files stay as they are.
class LayoutStrings {
  const LayoutStrings(this.lang);

  /// 'en', 'hi' or 'kn' (anything else reads as English).
  final String lang;

  static LayoutStrings of(BuildContext context) => LayoutStrings(Localizations.maybeLocaleOf(context)?.languageCode ?? 'en');

  String t(String key) => (_strings[lang] ?? _strings['en']!)[key] ?? _strings['en']![key] ?? key;
  String _n(String key, int n) => t(key).replaceAll('{n}', '$n');

  // Toolbar
  String get kinetixAi => t('kinetixAi');
  String get eraser => t('eraser');
  String get add => t('add');
  String get collapse => t('collapse');
  String get expand => t('expand');
  String get dragToolbar => t('dragToolbar');
  String get more => t('more');

  // Class bar and corners
  String minutesLeft(int n) => _n('minutesLeft', n);
  String get switchClass => t('switchClass');
  String get menu => t('menu');
  String get share => t('share');
  String get signOut => t('signOut');
  String get background => t('background');
  String get pageOverview => t('pageOverview');
  String get addPage => t('addPage');

  // Page overview
  String get dragToReorder => t('dragToReorder');
  String get duplicate => t('duplicate');
  String get delete => t('delete');
  String get exportPdf => t('exportPdf');
  String get exportedPdf => t('exportedPdf');
  String page(int n) => _n('page', n);
  String get zoom => t('zoom');

  // Split panel
  String get tabAi => t('tabAi');
  String get tab3d => t('tab3d');
  String get tabLabs => t('tabLabs');
  String get tabVideos => t('tabVideos');
  String get tabBooks => t('tabBooks');
  String get tabKit => t('tabKit');
  String get tabAnimations => t('tabAnimations');
  String get fullWidth => t('fullWidth');
  String get besideBoard => t('besideBoard');
  String get addToBoard => t('addToBoard');
  String get writeOnPanel => t('writeOnPanel');
  String get animationsSoon => t('animationsSoon');
  String get videosNone => t('videosNone');
  String get videoNoteAdded => t('videoNoteAdded');
  String get videoSourcePlatform => t('videoSourcePlatform');
  String get videoSourceInstitution => t('videoSourceInstitution');
  String get videoSourceTeacher => t('videoSourceTeacher');
  String get addVideo => t('addVideo');
  String get videoLink => t('videoLink');
  String get videoLinkHelp => t('videoLinkHelp');
  String get videoAdded => t('videoAdded');
  String get videoNotAdded => t('videoNotAdded');
  String get videoCancel => t('videoCancel');
  String get topic => t('topic');
  String get language => t('language');
  String get dragDivider => t('dragDivider');

  // Pen popover
  String get calligraphy => t('calligraphy');
  String get dashed => t('dashed');
  String get arrowPen => t('arrowPen');
  String get opacity => t('opacity');
  String get customColour => t('customColour');
  String get smoothing => t('smoothing');
  String get pressure => t('pressure');
  String get palmRejection => t('palmRejection');
  String get singleTouch => t('singleTouch');
  String get multiTouch => t('multiTouch');
  String get aiConvert => t('aiConvert');
  String get aiShapes => t('aiShapes');
  String get aiMaths => t('aiMaths');
  String get aiText => t('aiText');
  String get aiWhen => t('aiWhen');
  String get aiAuto => t('aiAuto');
  String get aiTap => t('aiTap');
  String get recentPens => t('recentPens');
  String get preview => t('preview');
  String get pick => t('pick');
  String get hue => t('hue');
  String get lightness => t('lightness');

  // Tools drawer
  String get all => t('all');
  String get geometry => t('geometry');
  String get maths => t('maths');
  String get science => t('science');
  String get commerce => t('commerce');
  String get cs => t('cs');
  String get classGroup => t('classGroup');
  String get searchTools => t('searchTools');
  String get setSquare45 => t('setSquare45');
  String get setSquare3060 => t('setSquare3060');
  String get graphTemplates => t('graphTemplates');
  String get flowchart => t('flowchart');
  String get spreadsheet => t('spreadsheet');
  String get codeLab => t('codeLab');
  String get dictionary => t('dictionary');
  String get badges => t('badges');
  String get quickQuiz => t('quickQuiz');
  String get secondBoard => t('secondBoard');
  String get noTools => t('noTools');

  // Badges
  String get awardBadge => t('awardBadge');
  String get student => t('student');
  String get award => t('award');
  String awarded(String badge, String name) => t('awarded').replaceAll('{badge}', badge).replaceAll('{name}', name);
  String get badgeFailed => t('badgeFailed');
  String get badgeNoClass => t('badgeNoClass');
  String badgeName(String id) => t('badge_$id');

  // Timer
  String get countDown => t('countDown');
  String get countUp => t('countUp');
  String get savePreset => t('savePreset');
  String get sound => t('sound');
  String soundName(String id) => t('sound_$id');
  String get showToClass => t('showToClass');
  String get mini => t('mini');
  String get setTime => t('setTime');
  String get keypad => t('keypad');
  String get wheels => t('wheels');
  String get hoursShort => t('hoursShort');
  String get minutesShort => t('minutesShort');
  String get secondsShort => t('secondsShort');
  String get set => t('set');
  String get removePreset => t('removePreset');

  // Backgrounds
  String get templates => t('templates');
  String get colours => t('colours');
  String get ownPicture => t('ownPicture');
  String get everyPage => t('everyPage');
  String get thisPage => t('thisPage');
  String bgName(String id) => t('bg_$id');

  // Settings
  String get palmHint => t('palmHint');
  String get multiTouchHint => t('multiTouchHint');

  static const _strings = <String, Map<String, String>>{
    'en': {
      'kinetixAi': 'KINETIX AI',
      'eraser': 'Eraser',
      'add': 'Add',
      'collapse': 'Hide toolbar',
      'expand': 'Show toolbar',
      'dragToolbar': 'Drag to move the toolbar to the left, right or bottom',
      'more': 'More',
      'minutesLeft': '{n} min left',
      'switchClass': 'Switch class',
      'menu': 'Menu',
      'share': 'Share',
      'signOut': 'Sign out',
      'background': 'Background',
      'pageOverview': 'Page overview',
      'addPage': 'Add page',
      'dragToReorder': 'Drag a page to reorder',
      'duplicate': 'Duplicate',
      'delete': 'Delete',
      'exportPdf': 'Export PDF',
      'exportedPdf': 'PDF ready to share',
      'page': 'Page {n}',
      'zoom': 'Zoom',
      'tabAi': 'AI',
      'tab3d': '3D',
      'tabLabs': 'Labs',
      'tabVideos': 'Videos',
      'tabBooks': 'Books',
      'tabKit': 'Kit',
      'tabAnimations': 'Animations',
      'fullWidth': 'Full width',
      'besideBoard': 'Beside the board',
      'addToBoard': 'Add to board',
      'writeOnPanel': 'Write on the panel',
      'animationsSoon': 'Animations arrive with the animations pack.',
      'videosNone': 'No concept videos for this period yet.',
      'videoNoteAdded': 'Video note added to the board',
      'videoSourcePlatform': 'KINETIX',
      'videoSourceInstitution': 'School',
      'videoSourceTeacher': 'Teacher',
      'addVideo': 'Add a video',
      'videoLink': 'YouTube link',
      'videoLinkHelp': 'Paste a link. The title comes from YouTube. Only this class sees it until the principal approves sharing it.',
      'videoAdded': 'Video added for this class',
      'videoNotAdded': "Couldn't add that video. Check the link and try again.",
      'videoCancel': 'Cancel',
      'topic': 'Topic',
      'language': 'Language',
      'dragDivider': 'Drag to resize',
      'calligraphy': 'Calligraphy',
      'dashed': 'Dashed',
      'arrowPen': 'Arrow pen',
      'opacity': 'Opacity',
      'customColour': 'Custom colour',
      'smoothing': 'Smoothing',
      'pressure': 'Pressure',
      'palmRejection': 'Palm rejection',
      'singleTouch': 'Single touch',
      'multiTouch': 'Multi touch',
      'aiConvert': 'Convert',
      'aiShapes': 'Shapes',
      'aiMaths': 'Maths',
      'aiText': 'Text',
      'aiWhen': 'When',
      'aiAuto': 'Automatically',
      'aiTap': 'When I tap',
      'recentPens': 'Recent',
      'preview': 'Preview',
      'pick': 'Use this colour',
      'hue': 'Hue',
      'lightness': 'Lightness',
      'all': 'All',
      'geometry': 'Geometry',
      'maths': 'Maths',
      'science': 'Science',
      'commerce': 'Commerce',
      'cs': 'CS',
      'classGroup': 'Class',
      'searchTools': 'Search tools',
      'setSquare45': 'Set square 45°',
      'setSquare3060': 'Set square 30°–60°',
      'graphTemplates': 'Graphs',
      'flowchart': 'Flowchart',
      'spreadsheet': 'Spreadsheet',
      'codeLab': 'Code lab',
      'dictionary': 'Dictionary',
      'badges': 'Badges',
      'quickQuiz': 'Quick quiz',
      'secondBoard': 'Second board',
      'noTools': 'No tool matches',
      'awardBadge': 'Award a badge',
      'student': 'Student',
      'award': 'Award',
      'awarded': '{badge} for {name}',
      'badgeFailed': 'The badge could not be sent. Try again when online.',
      'badgeNoClass': 'Badges need a class with a student list.',
      'badge_star': 'Star pupil',
      'badge_helper': 'Helping hand',
      'badge_creative': 'Creative thinker',
      'badge_curious': 'Curious mind',
      'badge_teamwork': 'Team player',
      'badge_leader': 'Leader',
      'badge_punctual': 'Always on time',
      'badge_neat': 'Neat work',
      'badge_improved': 'Most improved',
      'badge_champion': 'Champion',
      'countDown': 'Count down',
      'countUp': 'Count up',
      'savePreset': 'Save preset',
      'sound': 'Sound',
      'sound_bell': 'Bell',
      'sound_chime': 'Chime',
      'sound_beep': 'Beep',
      'sound_none': 'Silent',
      'showToClass': 'Show to class',
      'mini': 'Mini',
      'setTime': 'Set time',
      'keypad': 'Keypad',
      'wheels': 'Wheels',
      'hoursShort': 'h',
      'minutesShort': 'm',
      'secondsShort': 's',
      'set': 'Set',
      'removePreset': 'Remove preset',
      'templates': 'Template',
      'colours': 'Background',
      'ownPicture': 'Custom',
      'everyPage': 'Every page',
      'thisPage': 'This page',
      'bg_graph': 'Graph',
      'bg_plain': 'Plain',
      'bg_grid': 'Grid Lines',
      'bg_ruled': 'Horizontal Lines',
      'bg_fourLine': 'English Lines',
      'bg_dots': 'Dotted',
      'bg_black': 'Black',
      'bg_hindiLines': 'Hindi Lines',
      'bg_checks': 'Checks',
      'bg_basketballCourt': 'Basketball Layout',
      'bg_kannadaLines': 'Kannada Lines',
      'bg_musicStaff': 'Music Lines',
      'bg_isometric': 'Isometric Grid',
      'bg_ledger': 'Ledger',
      'bg_journal': 'Journal',
      'bg_indiaMap': 'India Map',
      'bg_worldMap': 'World Map',
      'bg_twoColumns': '2 Columns',
      'bg_threeColumns': '3 Columns',
      'bg_cricketField': 'Cricket Layout',
      'bg_footballField': 'Football Layout',
      'bg_paperCream': 'Cream',
      'bg_paperSky': 'Sky',
      'bg_paperMint': 'Mint',
      'bg_paperRose': 'Rose',
      'bg_paperSlate': 'Slate',
      'bg_night': 'Dark',
      'palmHint': 'A resting hand does not write',
      'multiTouchHint': 'Several people can write at once',
    },
    'hi': {
      'kinetixAi': 'KINETIX AI',
      'eraser': 'रबर',
      'add': 'जोड़ें',
      'collapse': 'टूलबार छिपाएँ',
      'expand': 'टूलबार दिखाएँ',
      'dragToolbar': 'टूलबार को बाएँ, दाएँ या नीचे ले जाने के लिए खींचें',
      'more': 'और',
      'minutesLeft': '{n} मिनट बचे',
      'switchClass': 'कक्षा बदलें',
      'menu': 'मेन्यू',
      'share': 'साझा करें',
      'signOut': 'साइन आउट',
      'background': 'पृष्ठभूमि',
      'pageOverview': 'पेज सूची',
      'addPage': 'पेज जोड़ें',
      'dragToReorder': 'क्रम बदलने के लिए पेज खींचें',
      'duplicate': 'प्रति बनाएँ',
      'delete': 'हटाएँ',
      'exportPdf': 'PDF बनाएँ',
      'exportedPdf': 'PDF साझा करने के लिए तैयार',
      'page': 'पेज {n}',
      'zoom': 'ज़ूम',
      'tabAi': 'AI',
      'tab3d': '3D',
      'tabLabs': 'लैब',
      'tabVideos': 'वीडियो',
      'tabBooks': 'किताबें',
      'tabKit': 'किट',
      'tabAnimations': 'एनिमेशन',
      'fullWidth': 'पूरी चौड़ाई',
      'besideBoard': 'बोर्ड के बगल में',
      'addToBoard': 'बोर्ड पर जोड़ें',
      'writeOnPanel': 'पैनल पर लिखें',
      'animationsSoon': 'एनिमेशन, एनिमेशन पैक के साथ आएँगे।',
      'videosNone': 'इस पीरियड के लिए अभी कोई कॉन्सेप्ट वीडियो नहीं।',
      'videoNoteAdded': 'वीडियो नोट बोर्ड पर जोड़ा गया',
      'videoSourcePlatform': 'KINETIX',
      'videoSourceInstitution': 'स्कूल',
      'videoSourceTeacher': 'शिक्षक',
      'addVideo': 'वीडियो जोड़ें',
      'videoLink': 'यूट्यूब लिंक',
      'videoLinkHelp': 'लिंक चिपकाएँ। शीर्षक यूट्यूब से आता है। प्राचार्य के साझा करने की मंज़ूरी तक केवल यही कक्षा इसे देखती है।',
      'videoAdded': 'इस कक्षा के लिए वीडियो जोड़ा गया',
      'videoNotAdded': 'वह वीडियो नहीं जोड़ा जा सका। लिंक जाँचकर फिर कोशिश करें।',
      'videoCancel': 'रद्द करें',
      'topic': 'विषय-वस्तु',
      'language': 'भाषा',
      'dragDivider': 'आकार बदलने के लिए खींचें',
      'calligraphy': 'सुलेख',
      'dashed': 'डैश वाली',
      'arrowPen': 'तीर पेन',
      'opacity': 'अपारदर्शिता',
      'customColour': 'अपना रंग',
      'smoothing': 'चिकनाई',
      'pressure': 'दबाव',
      'palmRejection': 'हथेली अनदेखी',
      'singleTouch': 'एक स्पर्श',
      'multiTouch': 'कई स्पर्श',
      'aiConvert': 'बदलें',
      'aiShapes': 'आकृतियाँ',
      'aiMaths': 'गणित',
      'aiText': 'शब्द',
      'aiWhen': 'कब',
      'aiAuto': 'अपने आप',
      'aiTap': 'टैप करने पर',
      'recentPens': 'हाल के',
      'preview': 'झलक',
      'pick': 'यह रंग लें',
      'hue': 'रंगत',
      'lightness': 'चमक',
      'all': 'सभी',
      'geometry': 'ज्यामिति',
      'maths': 'गणित',
      'science': 'विज्ञान',
      'commerce': 'वाणिज्य',
      'cs': 'कंप्यूटर',
      'classGroup': 'कक्षा',
      'searchTools': 'टूल खोजें',
      'setSquare45': 'सेट स्क्वेयर 45°',
      'setSquare3060': 'सेट स्क्वेयर 30°–60°',
      'graphTemplates': 'ग्राफ़',
      'flowchart': 'फ़्लोचार्ट',
      'spreadsheet': 'स्प्रेडशीट',
      'codeLab': 'कोड लैब',
      'dictionary': 'शब्दकोश',
      'badges': 'बैज',
      'quickQuiz': 'झटपट क्विज़',
      'secondBoard': 'दूसरा बोर्ड',
      'noTools': 'कोई टूल नहीं मिला',
      'awardBadge': 'बैज दें',
      'student': 'विद्यार्थी',
      'award': 'दें',
      'awarded': '{name} को {badge}',
      'badgeFailed': 'बैज नहीं भेजा जा सका। ऑनलाइन होने पर फिर कोशिश करें।',
      'badgeNoClass': 'बैज के लिए विद्यार्थियों की सूची वाली कक्षा चाहिए।',
      'badge_star': 'सितारा विद्यार्थी',
      'badge_helper': 'मददगार',
      'badge_creative': 'रचनात्मक सोच',
      'badge_curious': 'जिज्ञासु',
      'badge_teamwork': 'टीम खिलाड़ी',
      'badge_leader': 'नेतृत्व',
      'badge_punctual': 'हमेशा समय पर',
      'badge_neat': 'साफ़ काम',
      'badge_improved': 'सबसे ज़्यादा सुधार',
      'badge_champion': 'चैंपियन',
      'countDown': 'उल्टी गिनती',
      'countUp': 'सीधी गिनती',
      'savePreset': 'प्रीसेट सहेजें',
      'sound': 'आवाज़',
      'sound_bell': 'घंटी',
      'sound_chime': 'झंकार',
      'sound_beep': 'बीप',
      'sound_none': 'बिना आवाज़',
      'showToClass': 'कक्षा को दिखाएँ',
      'mini': 'छोटा',
      'setTime': 'समय तय करें',
      'keypad': 'कीपैड',
      'wheels': 'पहिए',
      'hoursShort': 'घं',
      'minutesShort': 'मि',
      'secondsShort': 'से',
      'set': 'तय करें',
      'removePreset': 'प्रीसेट हटाएँ',
      'templates': 'टेम्पलेट',
      'colours': 'रंग',
      'ownPicture': 'अपनी तस्वीर',
      'everyPage': 'हर पेज',
      'thisPage': 'यह पेज',
      'bg_graph': 'ग्राफ़ पेपर',
      'bg_kannadaLines': 'कन्नड़ रेखाएँ',
      'bg_musicStaff': 'संगीत स्टाफ़',
      'bg_isometric': 'आइसोमेट्रिक',
      'bg_ledger': 'खाता (लेजर)',
      'bg_journal': 'रोज़नामचा',
      'bg_indiaMap': 'भारत का नक्शा',
      'bg_worldMap': 'विश्व का नक्शा',
      'bg_twoColumns': 'दो कॉलम',
      'bg_threeColumns': 'तीन कॉलम',
      'bg_cricketField': 'क्रिकेट मैदान',
      'bg_footballField': 'फ़ुटबॉल मैदान',
      'bg_black': 'काला',
      'bg_hindiLines': 'हिंदी पंक्तियाँ',
      'bg_checks': 'चेक',
      'bg_basketballCourt': 'बास्केटबॉल कोर्ट',
      'bg_paperCream': 'क्रीम',
      'bg_paperSky': 'आसमानी',
      'bg_paperMint': 'हल्का हरा',
      'bg_paperRose': 'गुलाबी',
      'bg_paperSlate': 'स्लेटी',
      'bg_night': 'गहरा',
      'palmHint': 'टिका हुआ हाथ नहीं लिखता',
      'multiTouchHint': 'कई लोग एक साथ लिख सकते हैं',
    },
    'kn': {
      'kinetixAi': 'KINETIX AI',
      'eraser': 'ಅಳಿಸುವಿಕೆ',
      'add': 'ಸೇರಿಸಿ',
      'collapse': 'ಟೂಲ್‌ಬಾರ್ ಮರೆಮಾಡಿ',
      'expand': 'ಟೂಲ್‌ಬಾರ್ ತೋರಿಸಿ',
      'dragToolbar': 'ಟೂಲ್‌ಬಾರ್ ಅನ್ನು ಎಡ, ಬಲ ಅಥವಾ ಕೆಳಗೆ ಸರಿಸಲು ಎಳೆಯಿರಿ',
      'more': 'ಇನ್ನಷ್ಟು',
      'minutesLeft': '{n} ನಿಮಿಷ ಉಳಿದಿದೆ',
      'switchClass': 'ತರಗತಿ ಬದಲಿಸಿ',
      'menu': 'ಮೆನು',
      'share': 'ಹಂಚಿಕೊಳ್ಳಿ',
      'signOut': 'ಸೈನ್ ಔಟ್',
      'background': 'ಹಿನ್ನೆಲೆ',
      'pageOverview': 'ಪುಟಗಳ ನೋಟ',
      'addPage': 'ಪುಟ ಸೇರಿಸಿ',
      'dragToReorder': 'ಕ್ರಮ ಬದಲಿಸಲು ಪುಟವನ್ನು ಎಳೆಯಿರಿ',
      'duplicate': 'ನಕಲು ಮಾಡಿ',
      'delete': 'ಅಳಿಸಿ',
      'exportPdf': 'PDF ಮಾಡಿ',
      'exportedPdf': 'PDF ಹಂಚಿಕೊಳ್ಳಲು ಸಿದ್ಧ',
      'page': 'ಪುಟ {n}',
      'zoom': 'ಜೂಮ್',
      'tabAi': 'AI',
      'tab3d': '3D',
      'tabLabs': 'ಲ್ಯಾಬ್',
      'tabVideos': 'ವೀಡಿಯೊ',
      'tabBooks': 'ಪುಸ್ತಕ',
      'tabKit': 'ಕಿಟ್',
      'tabAnimations': 'ಅನಿಮೇಷನ್',
      'fullWidth': 'ಪೂರ್ಣ ಅಗಲ',
      'besideBoard': 'ಬೋರ್ಡ್ ಪಕ್ಕದಲ್ಲಿ',
      'addToBoard': 'ಬೋರ್ಡ್‌ಗೆ ಸೇರಿಸಿ',
      'writeOnPanel': 'ಪ್ಯಾನಲ್ ಮೇಲೆ ಬರೆಯಿರಿ',
      'animationsSoon': 'ಅನಿಮೇಷನ್‌ಗಳು ಅನಿಮೇಷನ್ ಪ್ಯಾಕ್‌ನೊಂದಿಗೆ ಬರುತ್ತವೆ.',
      'videosNone': 'ಈ ಅವಧಿಗೆ ಇನ್ನೂ ಪರಿಕಲ್ಪನೆ ವೀಡಿಯೊಗಳಿಲ್ಲ.',
      'videoNoteAdded': 'ವೀಡಿಯೊ ಟಿಪ್ಪಣಿ ಬೋರ್ಡ್‌ಗೆ ಸೇರಿತು',
      'videoSourcePlatform': 'KINETIX',
      'videoSourceInstitution': 'ಶಾಲೆ',
      'videoSourceTeacher': 'ಶಿಕ್ಷಕ',
      'addVideo': 'ವೀಡಿಯೊ ಸೇರಿಸಿ',
      'videoLink': 'ಯೂಟ್ಯೂಬ್ ಲಿಂಕ್',
      'videoLinkHelp': 'ಲಿಂಕ್ ಅಂಟಿಸಿ. ಶೀರ್ಷಿಕೆ ಯೂಟ್ಯೂಬ್‌ನಿಂದ ಬರುತ್ತದೆ. ಪ್ರಾಂಶುಪಾಲರು ಹಂಚಲು ಅನುಮೋದಿಸುವವರೆಗೆ ಈ ತರಗತಿ ಮಾತ್ರ ನೋಡುತ್ತದೆ.',
      'videoAdded': 'ಈ ತರಗತಿಗೆ ವೀಡಿಯೊ ಸೇರಿಸಲಾಗಿದೆ',
      'videoNotAdded': 'ಆ ವೀಡಿಯೊ ಸೇರಿಸಲಾಗಲಿಲ್ಲ. ಲಿಂಕ್ ಪರೀಕ್ಷಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
      'videoCancel': 'ರದ್ದುಮಾಡಿ',
      'topic': 'ವಿಷಯಾಂಶ',
      'language': 'ಭಾಷೆ',
      'dragDivider': 'ಗಾತ್ರ ಬದಲಿಸಲು ಎಳೆಯಿರಿ',
      'calligraphy': 'ಕ್ಯಾಲಿಗ್ರಫಿ',
      'dashed': 'ಡ್ಯಾಶ್ ಗೆರೆ',
      'arrowPen': 'ಬಾಣದ ಪೆನ್',
      'opacity': 'ಅಪಾರದರ್ಶಕತೆ',
      'customColour': 'ನಿಮ್ಮ ಬಣ್ಣ',
      'smoothing': 'ನಯಗೊಳಿಸುವಿಕೆ',
      'pressure': 'ಒತ್ತಡ',
      'palmRejection': 'ಅಂಗೈ ತಡೆ',
      'singleTouch': 'ಒಂದೇ ಸ್ಪರ್ಶ',
      'multiTouch': 'ಹಲವು ಸ್ಪರ್ಶ',
      'aiConvert': 'ಬದಲಿಸಿ',
      'aiShapes': 'ಆಕೃತಿಗಳು',
      'aiMaths': 'ಗಣಿತ',
      'aiText': 'ಪದಗಳು',
      'aiWhen': 'ಯಾವಾಗ',
      'aiAuto': 'ತಾನಾಗಿಯೇ',
      'aiTap': 'ಟ್ಯಾಪ್ ಮಾಡಿದಾಗ',
      'recentPens': 'ಇತ್ತೀಚಿನ',
      'preview': 'ಮುನ್ನೋಟ',
      'pick': 'ಈ ಬಣ್ಣ ಬಳಸಿ',
      'hue': 'ವರ್ಣ',
      'lightness': 'ಹೊಳಪು',
      'all': 'ಎಲ್ಲಾ',
      'geometry': 'ರೇಖಾಗಣಿತ',
      'maths': 'ಗಣಿತ',
      'science': 'ವಿಜ್ಞಾನ',
      'commerce': 'ವಾಣಿಜ್ಯ',
      'cs': 'ಕಂಪ್ಯೂಟರ್',
      'classGroup': 'ತರಗತಿ',
      'searchTools': 'ಉಪಕರಣ ಹುಡುಕಿ',
      'setSquare45': 'ಸೆಟ್ ಸ್ಕ್ವೇರ್ 45°',
      'setSquare3060': 'ಸೆಟ್ ಸ್ಕ್ವೇರ್ 30°–60°',
      'graphTemplates': 'ಗ್ರಾಫ್‌ಗಳು',
      'flowchart': 'ಫ್ಲೋಚಾರ್ಟ್',
      'spreadsheet': 'ಸ್ಪ್ರೆಡ್‌ಶೀಟ್',
      'codeLab': 'ಕೋಡ್ ಲ್ಯಾಬ್',
      'dictionary': 'ನಿಘಂಟು',
      'badges': 'ಬ್ಯಾಡ್ಜ್‌ಗಳು',
      'quickQuiz': 'ತ್ವರಿತ ರಸಪ್ರಶ್ನೆ',
      'secondBoard': 'ಎರಡನೇ ಬೋರ್ಡ್',
      'noTools': 'ಯಾವ ಉಪಕರಣವೂ ಹೊಂದುವುದಿಲ್ಲ',
      'awardBadge': 'ಬ್ಯಾಡ್ಜ್ ನೀಡಿ',
      'student': 'ವಿದ್ಯಾರ್ಥಿ',
      'award': 'ನೀಡಿ',
      'awarded': '{name} ಅವರಿಗೆ {badge}',
      'badgeFailed': 'ಬ್ಯಾಡ್ಜ್ ಕಳುಹಿಸಲಾಗಲಿಲ್ಲ. ಆನ್‌ಲೈನ್ ಆದಾಗ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
      'badgeNoClass': 'ಬ್ಯಾಡ್ಜ್‌ಗಳಿಗೆ ವಿದ್ಯಾರ್ಥಿ ಪಟ್ಟಿಯಿರುವ ತರಗತಿ ಬೇಕು.',
      'badge_star': 'ತಾರಾ ವಿದ್ಯಾರ್ಥಿ',
      'badge_helper': 'ಸಹಾಯಕ ಕೈ',
      'badge_creative': 'ಸೃಜನಶೀಲ ಚಿಂತಕ',
      'badge_curious': 'ಕುತೂಹಲಿ',
      'badge_teamwork': 'ತಂಡದ ಆಟಗಾರ',
      'badge_leader': 'ನಾಯಕ',
      'badge_punctual': 'ಯಾವಾಗಲೂ ಸಮಯಕ್ಕೆ',
      'badge_neat': 'ಅಚ್ಚುಕಟ್ಟಾದ ಕೆಲಸ',
      'badge_improved': 'ಅತಿ ಹೆಚ್ಚು ಸುಧಾರಣೆ',
      'badge_champion': 'ಚಾಂಪಿಯನ್',
      'countDown': 'ಹಿಮ್ಮುಖ ಎಣಿಕೆ',
      'countUp': 'ಮುಮ್ಮುಖ ಎಣಿಕೆ',
      'savePreset': 'ಪ್ರೀಸೆಟ್ ಉಳಿಸಿ',
      'sound': 'ಧ್ವನಿ',
      'sound_bell': 'ಗಂಟೆ',
      'sound_chime': 'ಝೇಂಕಾರ',
      'sound_beep': 'ಬೀಪ್',
      'sound_none': 'ನಿಶ್ಶಬ್ದ',
      'showToClass': 'ತರಗತಿಗೆ ತೋರಿಸಿ',
      'mini': 'ಸಣ್ಣ',
      'setTime': 'ಸಮಯ ಹೊಂದಿಸಿ',
      'keypad': 'ಕೀಪ್ಯಾಡ್',
      'wheels': 'ಚಕ್ರಗಳು',
      'hoursShort': 'ಗಂ',
      'minutesShort': 'ನಿ',
      'secondsShort': 'ಸೆ',
      'set': 'ಹೊಂದಿಸಿ',
      'removePreset': 'ಪ್ರೀಸೆಟ್ ತೆಗೆಯಿರಿ',
      'templates': 'ಮಾದರಿಗಳು',
      'colours': 'ಬಣ್ಣಗಳು',
      'ownPicture': 'ನಿಮ್ಮ ಚಿತ್ರ',
      'everyPage': 'ಎಲ್ಲಾ ಪುಟ',
      'thisPage': 'ಈ ಪುಟ',
      'bg_graph': 'ಗ್ರಾಫ್ ಹಾಳೆ',
      'bg_kannadaLines': 'ಕನ್ನಡ ಗೆರೆಗಳು',
      'bg_musicStaff': 'ಸಂಗೀತ ಸ್ಟಾಫ್',
      'bg_isometric': 'ಐಸೋಮೆಟ್ರಿಕ್',
      'bg_ledger': 'ಖಾತೆ (ಲೆಡ್ಜರ್)',
      'bg_journal': 'ದಿನಚರಿ (ಜರ್ನಲ್)',
      'bg_indiaMap': 'ಭಾರತದ ನಕ್ಷೆ',
      'bg_worldMap': 'ವಿಶ್ವ ನಕ್ಷೆ',
      'bg_twoColumns': 'ಎರಡು ಕಾಲಂ',
      'bg_threeColumns': 'ಮೂರು ಕಾಲಂ',
      'bg_cricketField': 'ಕ್ರಿಕೆಟ್ ಮೈದಾನ',
      'bg_footballField': 'ಫುಟ್‌ಬಾಲ್ ಮೈದಾನ',
      'bg_black': 'ಕಪ್ಪು',
      'bg_hindiLines': 'ಹಿಂದಿ ಸಾಲುಗಳು',
      'bg_checks': 'ಚೌಕಗಳು',
      'bg_basketballCourt': 'ಬಾಸ್ಕೆಟ್‌ಬಾಲ್ ಅಂಕಣ',
      'bg_paperCream': 'ಕ್ರೀಮ್',
      'bg_paperSky': 'ಆಕಾಶ ನೀಲಿ',
      'bg_paperMint': 'ತಿಳಿ ಹಸಿರು',
      'bg_paperRose': 'ಗುಲಾಬಿ',
      'bg_paperSlate': 'ಸ್ಲೇಟ್',
      'bg_night': 'ಗಾಢ',
      'palmHint': 'ಆನಿಸಿದ ಕೈ ಬರೆಯುವುದಿಲ್ಲ',
      'multiTouchHint': 'ಹಲವರು ಒಟ್ಟಿಗೆ ಬರೆಯಬಹುದು',
    },
  };

  /// Every key, for the strings test.
  static Iterable<String> get keys => _strings['en']!.keys;
  static Map<String, String> table(String lang) => _strings[lang] ?? const {};
}
