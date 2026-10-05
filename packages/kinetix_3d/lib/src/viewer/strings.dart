import 'package:flutter/widgets.dart';

import 'manifest.dart';

/// The 3D viewer's words in English, Hindi and Kannada. The models' own names and notes
/// come from their manifests; these are the controls round them.
///
/// First-draft translations: they need review by native speakers before release
/// (docs/i18n/).
class Viewer3dStrings {
  const Viewer3dStrings(this.lang);

  /// The strings for [context]'s locale (English for anything but hi and kn).
  factory Viewer3dStrings.of(BuildContext context) => Viewer3dStrings(viewerLangOf(context));

  final String lang;

  int get _i => switch (lang) {
    'hi' => 1,
    'kn' => 2,
    _ => 0,
  };

  String _t(String key) => words[key]![_i];

  String get opening => _t('opening');
  String get couldNotOpen => _t('couldNotOpen');
  String get tryAgain => _t('tryAgain');
  String get noViewer => _t('noViewer');
  String unknownModel(String id) => _t('unknownModel').replaceAll('{id}', id);
  String get labelsNone => _t('labelsNone');
  String get labelsPicked => _t('labelsPicked');
  String get labelsAll => _t('labelsAll');
  String get labels => _t('labels');
  String get laser => _t('laser');
  String get laserHint => _t('laserHint');
  String get startAgain => _t('startAgain');
  String get putOnBoard => _t('putOnBoard');
  String get onBoard => _t('onBoard');
  String get snapshotFailed => _t('snapshotFailed');
  String get about => _t('about');
  String get credits => _t('credits');
  String get viewerCredit => _t('viewerCredit');
  String get anatomyCredit => _t('anatomyCredit');
  String get earthCredit => _t('earthCredit');
  String get madeByKinetix => _t('madeByKinetix');
  String get close => _t('close');
  String get tabParts => _t('tabParts');
  String get tabCut => _t('tabCut');
  String get tabApart => _t('tabApart');
  String get tabAnimate => _t('tabAnimate');
  String get tabViews => _t('tabViews');
  String get showAllParts => _t('showAllParts');
  String get showOrHide => _t('showOrHide');
  String get hide => _t('hide');
  String get show => _t('show');
  String get showOnly => _t('showOnly');
  String get readyCuts => _t('readyCuts');
  String get cutFrom => _t('cutFrom');
  String get front => _t('front');
  String get side => _t('side');
  String get top => _t('top');
  String get moveCut => _t('moveCut');
  String get otherHalf => _t('otherHalf');
  String get closeCut => _t('closeCut');
  String get apartHint => _t('apartHint');
  String get putBack => _t('putBack');
  String get noAnimations => _t('noAnimations');
  String steps(int n) => _t(n == 1 ? 'step1' : 'steps').replaceAll('{n}', '$n');
  String stepOf(String name, int n, int m) => _t('stepOf').replaceAll('{name}', name).replaceAll('{n}', '$n').replaceAll('{m}', '$m');
  String get back => _t('back');
  String get next => _t('next');
  String get stop => _t('stop');
  String get lookFrom => _t('lookFrom');
  String get turnSlowly => _t('turnSlowly');
  String get gestureHint => _t('gestureHint');
  String get library => _t('library');
  String get search => _t('search');
  String get allSubjects => _t('allSubjects');
  String classes(List<int> c) => c.isEmpty ? '' : _t('classes').replaceAll('{list}', c.join(', '));
  String get noMatch => _t('noMatch');

  /// A subject's name (the catalogue's subjects are English words).
  String subject(String s) => words['subject$s']?[_i] ?? s;

  /// [en, hi, kn] for every key.
  static const words = <String, List<String>>{
    'opening': ['Opening the 3D model…', '3D मॉडल खुल रहा है…', '3D ಮಾದರಿ ತೆರೆಯುತ್ತಿದೆ…'],
    'couldNotOpen': ['This model could not be opened.', 'यह मॉडल नहीं खुल सका।', 'ಈ ಮಾದರಿಯನ್ನು ತೆರೆಯಲಾಗಲಿಲ್ಲ.'],
    'tryAgain': ['Try again', 'फिर से कोशिश करें', 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ'],
    'noViewer': [
      'This device cannot show this 3D model. Its parts are listed below.',
      'यह डिवाइस यह 3D मॉडल नहीं दिखा सकता। इसके भाग नीचे दिए गए हैं।',
      'ಈ ಸಾಧನ ಈ 3D ಮಾದರಿಯನ್ನು ತೋರಿಸಲಾರದು. ಇದರ ಭಾಗಗಳು ಕೆಳಗಿವೆ.',
    ],
    'unknownModel': ['There is no 3D model called "{id}".', '"{id}" नाम का कोई 3D मॉडल नहीं है।', '"{id}" ಹೆಸರಿನ 3D ಮಾದರಿ ಇಲ್ಲ.'],
    'labelsNone': ['No labels', 'कोई लेबल नहीं', 'ಲೇಬಲ್ ಇಲ್ಲ'],
    'labelsPicked': ['Label what I tap', 'जिसे छुऊँ उसका लेबल', 'ಮುಟ್ಟಿದ್ದಕ್ಕೆ ಲೇಬಲ್'],
    'labelsAll': ['Show all labels', 'सभी लेबल दिखाएँ', 'ಎಲ್ಲಾ ಲೇಬಲ್ ತೋರಿಸಿ'],
    'labels': ['Labels', 'लेबल', 'ಲೇಬಲ್‌ಗಳು'],
    'laser': ['Laser pointer', 'लेज़र पॉइंटर', 'ಲೇಸರ್ ಪಾಯಿಂಟರ್'],
    'laserHint': ['Point with one finger; turn the model with two.', 'एक उंगली से इंगित करें; दो उंगलियों से मॉडल घुमाएँ।', 'ಒಂದು ಬೆರಳಿನಿಂದ ತೋರಿಸಿ; ಎರಡು ಬೆರಳಿನಿಂದ ಮಾದರಿ ತಿರುಗಿಸಿ.'],
    'startAgain': ['Start again', 'फिर से शुरू करें', 'ಮತ್ತೆ ಆರಂಭಿಸಿ'],
    'putOnBoard': ['Put on board', 'बोर्ड पर लगाएँ', 'ಬೋರ್ಡ್‌ಗೆ ಹಾಕಿ'],
    'onBoard': ['On the board', 'बोर्ड पर लग गया', 'ಬೋರ್ಡ್‌ನಲ್ಲಿದೆ'],
    'snapshotFailed': ['Could not take a picture of the model.', 'मॉडल की तस्वीर नहीं ली जा सकी।', 'ಮಾದರಿಯ ಚಿತ್ರ ತೆಗೆಯಲಾಗಲಿಲ್ಲ.'],
    'about': ['About this model', 'इस मॉडल के बारे में', 'ಈ ಮಾದರಿಯ ಬಗ್ಗೆ'],
    'credits': ['Credits', 'आभार', 'ಕೃತಜ್ಞತೆಗಳು'],
    'viewerCredit': ['3D viewer: three.js (MIT License)', '3D व्यूअर: three.js (MIT लाइसेंस)', '3D ವೀಕ್ಷಕ: three.js (MIT ಪರವಾನಗಿ)'],
    'anatomyCredit': [
      'Human anatomy models: BodyParts3D, © The Database Center for Life Science (DBCLS), CC BY 4.0',
      'मानव शरीर रचना मॉडल: BodyParts3D, © The Database Center for Life Science (DBCLS), CC BY 4.0',
      'ಮಾನವ ದೇಹರಚನೆ ಮಾದರಿಗಳು: BodyParts3D, © The Database Center for Life Science (DBCLS), CC BY 4.0',
    ],
    'earthCredit': ['Coastlines: Natural Earth (public domain)', 'तटरेखाएँ: Natural Earth (सार्वजनिक डोमेन)', 'ಕರಾವಳಿ ರೇಖೆಗಳು: Natural Earth (ಸಾರ್ವಜನಿಕ ಡೊಮೇನ್)'],
    'madeByKinetix': ['The other models are built in code by KINETIX.', 'बाकी मॉडल KINETIX ने कोड से बनाए हैं।', 'ಉಳಿದ ಮಾದರಿಗಳನ್ನು KINETIX ಕೋಡ್‌ನಲ್ಲಿ ನಿರ್ಮಿಸಿದೆ.'],
    'close': ['Close', 'बंद करें', 'ಮುಚ್ಚಿ'],
    'tabParts': ['Parts', 'भाग', 'ಭಾಗಗಳು'],
    'tabCut': ['Cut', 'काटें', 'ಕತ್ತರಿಸಿ'],
    'tabApart': ['Take apart', 'अलग करें', 'ಬಿಡಿಸಿ'],
    'tabAnimate': ['Animate', 'एनिमेशन', 'ಅನಿಮೇಷನ್'],
    'tabViews': ['Views', 'दृश्य', 'ನೋಟಗಳು'],
    'showAllParts': ['Show all parts', 'सभी भाग दिखाएँ', 'ಎಲ್ಲಾ ಭಾಗಗಳನ್ನು ತೋರಿಸಿ'],
    'showOrHide': ['Show or hide', 'दिखाएँ या छिपाएँ', 'ತೋರಿಸಿ ಅಥವಾ ಮರೆಮಾಡಿ'],
    'hide': ['Hide', 'छिपाएँ', 'ಮರೆಮಾಡಿ'],
    'show': ['Show', 'दिखाएँ', 'ತೋರಿಸಿ'],
    'showOnly': ['Show only this', 'केवल यह दिखाएँ', 'ಇದನ್ನು ಮಾತ್ರ ತೋರಿಸಿ'],
    'readyCuts': ['Ready-made cuts', 'तैयार कट', 'ಸಿದ್ಧ ಕಡಿತಗಳು'],
    'cutFrom': ['Cut from', 'यहाँ से काटें', 'ಇಲ್ಲಿಂದ ಕತ್ತರಿಸಿ'],
    'front': ['Front', 'सामने', 'ಮುಂಭಾಗ'],
    'side': ['Side', 'बगल', 'ಪಕ್ಕ'],
    'top': ['Top', 'ऊपर', 'ಮೇಲೆ'],
    'moveCut': ['Move the cut', 'कट खिसकाएँ', 'ಕಡಿತವನ್ನು ಸರಿಸಿ'],
    'otherHalf': ['Other half', 'दूसरा आधा', 'ಇನ್ನೊಂದು ಅರ್ಧ'],
    'closeCut': ['Close the cut', 'कट बंद करें', 'ಕಡಿತ ಮುಚ್ಚಿ'],
    'apartHint': ['Slide to pull the parts away from each other.', 'भागों को एक-दूसरे से दूर करने के लिए खिसकाएँ।', 'ಭಾಗಗಳನ್ನು ಒಂದರಿಂದೊಂದು ದೂರ ಸರಿಸಲು ಜಾರಿಸಿ.'],
    'putBack': ['Put back together', 'फिर से जोड़ें', 'ಮತ್ತೆ ಜೋಡಿಸಿ'],
    'noAnimations': ['This model has no animations.', 'इस मॉडल में कोई एनिमेशन नहीं है।', 'ಈ ಮಾದರಿಯಲ್ಲಿ ಅನಿಮೇಷನ್ ಇಲ್ಲ.'],
    'step1': ['{n} step', '{n} चरण', '{n} ಹಂತ'],
    'steps': ['{n} steps', '{n} चरण', '{n} ಹಂತಗಳು'],
    'stepOf': ['{name}: step {n} of {m}', '{name}: चरण {n} / {m}', '{name}: ಹಂತ {n} / {m}'],
    'back': ['Back', 'पीछे', 'ಹಿಂದೆ'],
    'next': ['Next', 'आगे', 'ಮುಂದೆ'],
    'stop': ['Stop', 'रोकें', 'ನಿಲ್ಲಿಸಿ'],
    'lookFrom': ['Look from', 'यहाँ से देखें', 'ಇಲ್ಲಿಂದ ನೋಡಿ'],
    'turnSlowly': ['Turn slowly', 'धीरे-धीरे घुमाएँ', 'ನಿಧಾನವಾಗಿ ತಿರುಗಿಸಿ'],
    'gestureHint': [
      'One finger turns the model; two fingers zoom and move it.',
      'एक उंगली से मॉडल घूमता है; दो उंगलियों से ज़ूम करें और खिसकाएँ।',
      'ಒಂದು ಬೆರಳು ಮಾದರಿಯನ್ನು ತಿರುಗಿಸುತ್ತದೆ; ಎರಡು ಬೆರಳು ಜೂಮ್ ಮಾಡಿ ಸರಿಸುತ್ತವೆ.',
    ],
    'library': ['3D models', '3D मॉडल', '3D ಮಾದರಿಗಳು'],
    'search': ['Search models', 'मॉडल खोजें', 'ಮಾದರಿ ಹುಡುಕಿ'],
    'allSubjects': ['All', 'सभी', 'ಎಲ್ಲಾ'],
    'classes': ['Class {list}', 'कक्षा {list}', 'ತರಗತಿ {list}'],
    'noMatch': ['No model matches.', 'कोई मॉडल नहीं मिला।', 'ಯಾವ ಮಾದರಿಯೂ ಸಿಗಲಿಲ್ಲ.'],
    'subjectBiology': ['Biology', 'जीव विज्ञान', 'ಜೀವಶಾಸ್ತ್ರ'],
    'subjectPhysics': ['Physics', 'भौतिकी', 'ಭೌತಶಾಸ್ತ್ರ'],
    'subjectChemistry': ['Chemistry', 'रसायन विज्ञान', 'ರಸಾಯನಶಾಸ್ತ್ರ'],
    'subjectGeography': ['Geography', 'भूगोल', 'ಭೂಗೋಳ'],
    'subjectSpace': ['Space', 'अंतरिक्ष', 'ಬಾಹ್ಯಾಕಾಶ'],
    'subjectMaths': ['Maths', 'गणित', 'ಗಣಿತ'],
    'subjectScience': ['Science', 'विज्ञान', 'ವಿಜ್ಞಾನ'],
  };
}
