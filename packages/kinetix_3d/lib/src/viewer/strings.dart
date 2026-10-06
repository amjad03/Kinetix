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
  String get write => _t('write');
  String get toolPin => _t('toolPin');
  String get toolSurface => _t('toolSurface');
  String get toolScreen => _t('toolScreen');
  String get pinHint => _t('pinHint');
  String get drawHint => _t('drawHint');
  String get noteMissed => _t('noteMissed');
  String get tabNotes => _t('tabNotes');
  String get noNotes => _t('noNotes');
  String get note => _t('note');
  String get noteText => _t('noteText');
  String get emptyNote => _t('emptyNote');
  String get drawingOver => _t('drawingOver');
  String get save => _t('save');
  String get delete => _t('delete');
  String get edit => _t('edit');
  String get clearNotes => _t('clearNotes');
  String get undo => _t('undo');
  String get showNotes => _t('showNotes');
  String get colour => _t('colour');
  String get done => _t('done');
  String get cutKind => _t('cutKind');
  String get cutHalf => _t('cutHalf');
  String get cutWedge => _t('cutWedge');
  String get cutSlab => _t('cutSlab');
  String get cutDepth => _t('cutDepth');
  String get cutPeel => _t('cutPeel');
  String get turnSlice => _t('turnSlice');
  String get thickness => _t('thickness');
  String get sweep => _t('sweep');
  String get onePeel => _t('onePeel');
  String drawingOn(String part) => _t('drawingOn').replaceAll('{part}', part);
  String sliceSize(int degrees) => _t('sliceSize').replaceAll('{n}', '$degrees');
  String depthOf(int percent) => _t('depthOf').replaceAll('{n}', '$percent');
  String peeled(int n, int m) => _t('peeled').replaceAll('{n}', '$n').replaceAll('{m}', '$m');
  String get play => _t('play');
  String get pause => _t('pause');
  String get replay => _t('replay');
  String get speed => _t('speed');
  String get readAloud => _t('readAloud');
  String get lighterGraphics => _t('lighterGraphics');
  String get lighterGraphicsHint => _t('lighterGraphicsHint');
  String get tabSteps => _t('tabSteps');
  String get previousStep => _t('previousStep');
  String get nextStep => _t('nextStep');
  String sceneStep(int n, int m) => _t('sceneStep').replaceAll('{n}', '$n').replaceAll('{m}', '$m');

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
    'write': ['Write on the model', 'मॉडल पर लिखें', 'ಮಾದರಿಯ ಮೇಲೆ ಬರೆಯಿರಿ'],
    'toolPin': ['Pin a note', 'नोट लगाएँ', 'ಟಿಪ್ಪಣಿ ಅಂಟಿಸಿ'],
    'toolSurface': ['Draw on the model', 'मॉडल पर बनाएँ', 'ಮಾದರಿಯ ಮೇಲೆ ಗೆರೆ ಎಳೆಯಿರಿ'],
    'toolScreen': ['Draw over the view', 'दृश्य के ऊपर बनाएँ', 'ನೋಟದ ಮೇಲೆ ಗೆರೆ ಎಳೆಯಿರಿ'],
    'pinHint': ['Tap the model to pin a note; turn it with two fingers.', 'नोट लगाने के लिए मॉडल को छुएँ; दो उंगलियों से घुमाएँ।', 'ಟಿಪ್ಪಣಿ ಅಂಟಿಸಲು ಮಾದರಿಯನ್ನು ಮುಟ್ಟಿ; ಎರಡು ಬೆರಳಿನಿಂದ ತಿರುಗಿಸಿ.'],
    'drawHint': ['Draw with one finger; turn the model with two.', 'एक उंगली से बनाएँ; दो उंगलियों से मॉडल घुमाएँ।', 'ಒಂದು ಬೆರಳಿನಿಂದ ಬರೆಯಿರಿ; ಎರಡು ಬೆರಳಿನಿಂದ ಮಾದರಿ ತಿರುಗಿಸಿ.'],
    'noteMissed': ['Tap on the model to pin a note there.', 'नोट लगाने के लिए मॉडल पर ही छुएँ।', 'ಟಿಪ್ಪಣಿ ಅಂಟಿಸಲು ಮಾದರಿಯ ಮೇಲೆಯೇ ಮುಟ್ಟಿ.'],
    'tabNotes': ['Notes', 'नोट', 'ಟಿಪ್ಪಣಿಗಳು'],
    'noNotes': ['Nothing written yet. Use the pen above the model to pin notes or draw.', 'अभी कुछ नहीं लिखा। नोट लगाने या बनाने के लिए मॉडल के ऊपर का पेन चुनें।', 'ಇನ್ನೂ ಏನೂ ಬರೆದಿಲ್ಲ. ಟಿಪ್ಪಣಿ ಅಂಟಿಸಲು ಅಥವಾ ಬರೆಯಲು ಮಾದರಿಯ ಮೇಲಿನ ಪೆನ್ ಬಳಸಿ.'],
    'note': ['Note', 'नोट', 'ಟಿಪ್ಪಣಿ'],
    'noteText': ['Write the note', 'नोट लिखें', 'ಟಿಪ್ಪಣಿ ಬರೆಯಿರಿ'],
    'emptyNote': ['(no text)', '(कोई पाठ नहीं)', '(ಪಠ್ಯವಿಲ್ಲ)'],
    'drawingOn': ['Drawing on {part}', '{part} पर चित्र', '{part} ಮೇಲೆ ಚಿತ್ರ'],
    'drawingOver': ['Drawing over the view', 'दृश्य के ऊपर चित्र', 'ನೋಟದ ಮೇಲಿನ ಚಿತ್ರ'],
    'save': ['Save', 'सहेजें', 'ಉಳಿಸಿ'],
    'delete': ['Delete', 'हटाएँ', 'ಅಳಿಸಿ'],
    'edit': ['Edit', 'बदलें', 'ಬದಲಿಸಿ'],
    'clearNotes': ['Clear all', 'सब मिटाएँ', 'ಎಲ್ಲವನ್ನೂ ಅಳಿಸಿ'],
    'undo': ['Undo last', 'पिछला हटाएँ', 'ಕೊನೆಯದನ್ನು ತೆಗೆಯಿರಿ'],
    'showNotes': ['Show notes and drawing', 'नोट और चित्र दिखाएँ', 'ಟಿಪ್ಪಣಿ ಮತ್ತು ಚಿತ್ರ ತೋರಿಸಿ'],
    'colour': ['Colour', 'रंग', 'ಬಣ್ಣ'],
    'done': ['Done', 'हो गया', 'ಮುಗಿಯಿತು'],
    'cutKind': ['Kind of cut', 'कट का प्रकार', 'ಕಡಿತದ ಬಗೆ'],
    'cutHalf': ['In half', 'आधा', 'ಅರ್ಧ'],
    'cutWedge': ['Cake slice', 'केक जैसी फाँक', 'ಕೇಕ್ ತುಂಡು'],
    'cutSlab': ['Thin slice', 'पतली परत', 'ತೆಳು ಹೋಳು'],
    'cutDepth': ['Depth', 'गहराई', 'ಆಳ'],
    'cutPeel': ['Peel layers', 'परतें उतारें', 'ಪದರ ಸುಲಿಯಿರಿ'],
    'sliceSize': ['Size of the slice: {n}°', 'फाँक का आकार: {n}°', 'ತುಂಡಿನ ಗಾತ್ರ: {n}°'],
    'turnSlice': ['Turn the slice', 'फाँक घुमाएँ', 'ತುಂಡನ್ನು ತಿರುಗಿಸಿ'],
    'thickness': ['Thickness', 'मोटाई', 'ದಪ್ಪ'],
    'depthOf': ['How deep: {n}%', 'कितना गहरा: {n}%', 'ಎಷ್ಟು ಆಳ: {n}%'],
    'sweep': ['Sweep through', 'आर-पार चलाएँ', 'ಆಚೆಯವರೆಗೆ ಸರಿಸಿ'],
    'peeled': ['{n} of {m} layers taken off', '{m} में से {n} परतें उतारीं', '{m} ರಲ್ಲಿ {n} ಪದರ ತೆಗೆದಿದೆ'],
    'onePeel': ['This model has only one layer.', 'इस मॉडल में केवल एक परत है।', 'ಈ ಮಾದರಿಯಲ್ಲಿ ಒಂದೇ ಪದರವಿದೆ.'],
    'play': ['Play', 'चलाएँ', 'ಪ್ಲೇ ಮಾಡಿ'],
    'pause': ['Pause', 'रोकें', 'ವಿರಾಮ'],
    'replay': ['Play again', 'फिर से चलाएँ', 'ಮತ್ತೆ ಪ್ಲೇ ಮಾಡಿ'],
    'speed': ['Speed', 'गति', 'ವೇಗ'],
    'readAloud': ['Read aloud', 'पढ़कर सुनाएँ', 'ಓದಿ ಹೇಳಿ'],
    'lighterGraphics': ['Lighter graphics', 'हल्के ग्राफ़िक्स', 'ಹಗುರ ಗ್ರಾಫಿಕ್ಸ್'],
    'lighterGraphicsHint': ['For slower panels: fewer pixels and particles.', 'धीमे पैनल के लिए: कम पिक्सेल और कण।', 'ನಿಧಾನ ಪ್ಯಾನೆಲ್‌ಗಳಿಗೆ: ಕಡಿಮೆ ಪಿಕ್ಸೆಲ್ ಮತ್ತು ಕಣಗಳು.'],
    'tabSteps': ['Steps', 'चरण', 'ಹಂತಗಳು'],
    'previousStep': ['Previous step', 'पिछला चरण', 'ಹಿಂದಿನ ಹಂತ'],
    'nextStep': ['Next step', 'अगला चरण', 'ಮುಂದಿನ ಹಂತ'],
    'sceneStep': ['Step {n} of {m}', 'चरण {n} / {m}', 'ಹಂತ {n} / {m}'],
    'subjectBiology': ['Biology', 'जीव विज्ञान', 'ಜೀವಶಾಸ್ತ್ರ'],
    'subjectPhysics': ['Physics', 'भौतिकी', 'ಭೌತಶಾಸ್ತ್ರ'],
    'subjectChemistry': ['Chemistry', 'रसायन विज्ञान', 'ರಸಾಯನಶಾಸ್ತ್ರ'],
    'subjectGeography': ['Geography', 'भूगोल', 'ಭೂಗೋಳ'],
    'subjectSpace': ['Space', 'अंतरिक्ष', 'ಬಾಹ್ಯಾಕಾಶ'],
    'subjectMaths': ['Maths', 'गणित', 'ಗಣಿತ'],
    'subjectScience': ['Science', 'विज्ञान', 'ವಿಜ್ಞಾನ'],
  };
}
