// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Hindi (`hi`).
class AppLocalizationsHi extends AppLocalizations {
  AppLocalizationsHi([String locale = 'hi']) : super(locale);

  @override
  String get appTitle => 'KINETIX Board';

  @override
  String get cancel => 'रद्द करें';

  @override
  String get save => 'सहेजें';

  @override
  String get share => 'साझा करें';

  @override
  String get close => 'बंद करें';

  @override
  String get done => 'हो गया';

  @override
  String get ok => 'ठीक है';

  @override
  String get open => 'खोलें';

  @override
  String get discard => 'हटा दें';

  @override
  String get keep => 'रखें';

  @override
  String get tryAgain => 'फिर से कोशिश करें';

  @override
  String get retry => 'फिर से कोशिश करें';

  @override
  String get back => 'वापस';

  @override
  String get clear => 'साफ़ करें';

  @override
  String get regenerate => 'फिर से बनाएँ';

  @override
  String get titleLabel => 'शीर्षक';

  @override
  String get topicLabel => 'विषय-वस्तु';

  @override
  String get guest => 'अतिथि';

  @override
  String get practiceBoard => 'अभ्यास बोर्ड';

  @override
  String get noClassTimetabled => 'अभी समय-सारणी में कोई कक्षा नहीं है';

  @override
  String goesTo(String section) {
    return '$section को भेजा जाएगा';
  }

  @override
  String minutesShort(int n) {
    return '$n मिनट';
  }

  @override
  String get today => 'आज';

  @override
  String get tomorrow => 'कल';

  @override
  String requestFailed(int status) {
    return 'अनुरोध पूरा नहीं हुआ ($status)';
  }

  @override
  String get cloudUnreachable => 'KINETIX Cloud से संपर्क नहीं हो सका';

  @override
  String get toolRecord => 'रिकॉर्ड';

  @override
  String get toolStop => 'रोकें';

  @override
  String get toolTheme => 'थीम';

  @override
  String get toolWrite => 'लिखें';

  @override
  String get toolErase => 'मिटाएँ';

  @override
  String get toolSelect => 'चुनें';

  @override
  String get toolShapes => 'आकृतियाँ';

  @override
  String get toolTools => 'टूल्स';

  @override
  String get toolUndo => 'अनडू';

  @override
  String get toolRedo => 'रीडू';

  @override
  String get toolAi => 'AI';

  @override
  String get toolBooks => 'किताबें';

  @override
  String get toolQuiz => 'क्विज़';

  @override
  String get toolHomework => 'होमवर्क';

  @override
  String get toolSwitch => 'बदलें';

  @override
  String get toolHide => 'छिपाएँ';

  @override
  String get toolPrevious => 'पिछला';

  @override
  String get toolNext => 'अगला';

  @override
  String get toolNewPage => 'नया पेज';

  @override
  String get showTools => 'टूल्स दिखाएँ';

  @override
  String deleteSelection(int count) {
    return '$count हटाएँ';
  }

  @override
  String get guestSignIn => 'अतिथि · साइन इन';

  @override
  String beingViewed(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'देखा जा रहा है · $count',
      one: 'देखा जा रहा है',
    );
    return '$_temp0';
  }

  @override
  String get beingViewedTooltip =>
      'स्कूल के एक प्रमुख यह कक्षा लाइव देख रहे हैं। देखना ऑडिट लॉग में दर्ज होता है।';

  @override
  String get goLive => 'लाइव करें';

  @override
  String get liveWaiting => 'लाइव · विद्यार्थियों का इंतज़ार';

  @override
  String liveStudents(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'लाइव · $count विद्यार्थी',
      one: 'लाइव · 1 विद्यार्थी',
    );
    return '$_temp0';
  }

  @override
  String get stopLiveTooltip => 'लाइव कक्षा रोकें';

  @override
  String get goLiveTooltip =>
      'इस कक्षा के विद्यार्थियों को Student App में बोर्ड देखने दें';

  @override
  String get liveStarted =>
      'लाइव: इस कक्षा के विद्यार्थी Student App में बोर्ड देख सकते हैं। उन्हें अपनी आवाज़ सुनाने के लिए \"कक्षा की आवाज़\" चालू करें।';

  @override
  String get liveEnded => 'लाइव कक्षा समाप्त हो गई।';

  @override
  String get classAudio => 'कक्षा की आवाज़';

  @override
  String get classAudioOn => 'कक्षा की आवाज़ चालू';

  @override
  String get classAudioTurnOnTooltip =>
      'लाइव कक्षा के विद्यार्थियों को बोर्ड के माइक्रोफ़ोन से अपनी आवाज़ सुनने दें';

  @override
  String get classAudioTurnOffTooltip => 'कक्षा की आवाज़ बंद करें';

  @override
  String get micOn => 'माइक चालू';

  @override
  String get micOnTooltip =>
      'बोर्ड का माइक्रोफ़ोन चालू है: लाइव कक्षा के विद्यार्थी कक्षा की आवाज़ सुन सकते हैं';

  @override
  String get classAudioStarted =>
      'कक्षा की आवाज़ चालू है। लाइव कक्षा के विद्यार्थी आपको सुन सकते हैं; जब वे सुन रहे हों तब \"माइक चालू\" दिखता है।';

  @override
  String get classAudioStopped => 'कक्षा की आवाज़ बंद है।';

  @override
  String classAudioUnavailable(String reason) {
    return 'कक्षा की आवाज़ उपलब्ध नहीं है: $reason';
  }

  @override
  String get cloudUnreachableCheckOnline =>
      'KINETIX Cloud से संपर्क नहीं हो सका। देखें कि बोर्ड ऑनलाइन है।';

  @override
  String get noClassList => 'कक्षा की सूची नहीं है';

  @override
  String takeAttendance(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count विद्यार्थी · उपस्थिति लें',
      one: '1 विद्यार्थी · उपस्थिति लें',
    );
    return '$_temp0';
  }

  @override
  String presentOfTotal(int present, int total) {
    return '$present/$total उपस्थित';
  }

  @override
  String pendingSync(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count बदलाव सिंक होने बाकी हैं',
      one: '1 बदलाव सिंक होना बाकी है',
    );
    return '$_temp0';
  }

  @override
  String get connectedCloud => 'KINETIX Cloud से जुड़ा है';

  @override
  String get offlineSaved =>
      'ऑफ़लाइन। सब कुछ सहेजा गया है और बाद में सिंक होगा।';

  @override
  String get endClass => 'कक्षा समाप्त करें';

  @override
  String get signedOutGuest => 'साइन आउट हो गया। बोर्ड अब अतिथि मोड में है।';

  @override
  String welcomeTeacher(String name) {
    return 'स्वागत है, $name।';
  }

  @override
  String get recordNeedsSignIn =>
      'पाठ रिकॉर्ड करने के लिए Teacher App से साइन इन करें। पहले शिक्षक को इस बोर्ड से जुड़ना होगा।';

  @override
  String get recordingStarted => 'बोर्ड और आपकी आवाज़ रिकॉर्ड हो रही है।';

  @override
  String recordingNoSound(String reason) {
    return 'बिना आवाज़ के बोर्ड रिकॉर्ड हो रहा है: $reason';
  }

  @override
  String get voiceNoMicrophone => 'कोई माइक्रोफ़ोन नहीं मिला';

  @override
  String get voicePermissionDenied => 'माइक्रोफ़ोन की अनुमति नहीं दी गई';

  @override
  String get voiceUnsupported => 'यह बोर्ड आवाज़ रिकॉर्ड नहीं कर सकता';

  @override
  String get voiceNotStarted => 'माइक्रोफ़ोन शुरू नहीं हो सका';

  @override
  String couldNotStartRecording(String error) {
    return 'रिकॉर्डिंग शुरू नहीं हो सकी: $error';
  }

  @override
  String get recordingDiscarded => 'रिकॉर्डिंग हटा दी गई।';

  @override
  String get recordingSavedUploading =>
      'रिकॉर्डिंग सहेज ली गई। यह KINETIX Cloud पर अपलोड हो रही है।';

  @override
  String recordingSavedLater(String name) {
    return 'रिकॉर्डिंग इस बोर्ड पर सहेज ली गई। $name के अगली बार साइन इन करने पर यह अपलोड होगी।';
  }

  @override
  String couldNotSaveRecording(String error) {
    return 'रिकॉर्डिंग सहेजी नहीं जा सकी: $error';
  }

  @override
  String get saveNeedsSignIn =>
      'बोर्ड को क्लाउड में सहेजने के लिए Teacher App से साइन इन करें।';

  @override
  String get nothingToSave => 'बोर्ड पर अभी सहेजने के लिए कुछ नहीं है।';

  @override
  String savedAndShared(String section) {
    return 'सहेजा गया और $section के साथ साझा किया गया।';
  }

  @override
  String get savedToWhiteboards => '\"आपके व्हाइटबोर्ड\" में सहेजा गया।';

  @override
  String couldNotSaveBoard(String error) {
    return 'बोर्ड सहेजा नहीं जा सका: $error';
  }

  @override
  String get whiteboardsNeedSignIn =>
      'अपने सहेजे गए बोर्ड देखने के लिए Teacher App से साइन इन करें।';

  @override
  String get replaceBoardTitle => 'बोर्ड बदलें?';

  @override
  String get replaceBoardBody =>
      'अभी बोर्ड पर जो है, वह मिट जाएगा, जब तक आप उसे पहले सहेज न लें।';

  @override
  String openedBoard(String title) {
    return '\"$title\" खोला गया। फिर से सहेजने पर यही बोर्ड अपडेट होगा।';
  }

  @override
  String couldNotOpenBoard(String error) {
    return 'बोर्ड खुल नहीं सका: $error';
  }

  @override
  String get endClassTitle => 'कक्षा समाप्त करें?';

  @override
  String get endClassBody =>
      'आप इस बोर्ड से साइन आउट हो जाएँगे। कक्षा में दर्ज उपस्थिति और उत्तर सुरक्षित रहेंगे।';

  @override
  String get endClassRecordingNote =>
      'पाठ की रिकॉर्डिंग रुक जाएगी, और आप पहले उसे सहेज और साझा कर सकते हैं।';

  @override
  String get saveThisBoard => 'यह बोर्ड सहेजें';

  @override
  String get shareWithStudentsParents =>
      'विद्यार्थियों और अभिभावकों के साथ साझा करें';

  @override
  String get keepTeaching => 'पढ़ाना जारी रखें';

  @override
  String get uploadingBeforeSignOut =>
      'साइन आउट से पहले पाठ की रिकॉर्डिंग अपलोड हो रही है…';

  @override
  String signedOutRecordingPending(String name) {
    return 'साइन आउट हो गया। पाठ की रिकॉर्डिंग इस बोर्ड पर सहेजी गई है और $name के अगली बार साइन इन करने पर अपलोड होगी।';
  }

  @override
  String get defaultBoardName => 'बोर्ड';

  @override
  String get defaultLessonName => 'पाठ';

  @override
  String get toolTimer => 'टाइमर';

  @override
  String get toolRandomPick => 'रैंडम चुनाव';

  @override
  String get toolAttendance => 'उपस्थिति';

  @override
  String get toolSplitScreen => 'स्प्लिट स्क्रीन';

  @override
  String get toolEyeComfort => 'आँखों का आराम';

  @override
  String get toolRuler => 'स्केल';

  @override
  String get toolProtractor => 'चाँदा';

  @override
  String get toolCalculator => 'कैलकुलेटर';

  @override
  String get toolSpotlight => 'स्पॉटलाइट';

  @override
  String get toolScreenShade => 'स्क्रीन शेड';

  @override
  String get toolScreenshot => 'स्क्रीनशॉट';

  @override
  String get toolTouchLock => 'टच लॉक';

  @override
  String get tkStopwatch => 'स्टॉपवॉच';

  @override
  String get tkDice => 'पासा';

  @override
  String get tkSpinner => 'चक्री';

  @override
  String get tkNoiseMeter => 'शोर मीटर';

  @override
  String get tkDragCard => 'हटाने के लिए खींचें';

  @override
  String get tkPlusMinute => '+1 मिनट';

  @override
  String get tkLap => 'लैप';

  @override
  String tkLapN(int number, String time) {
    return 'लैप $number: $time';
  }

  @override
  String get tkPick => 'चुनें';

  @override
  String get tkReady => 'तैयार?';

  @override
  String tkPickedOf(int picked, int total) {
    return '$total में से $picked चुने गए';
  }

  @override
  String get tkNoRepeat => 'सबकी बारी आने तक दोबारा न चुनें';

  @override
  String get tkStartOver => 'फिर से शुरू करें';

  @override
  String get tkDemoClass => 'डेमो कक्षा';

  @override
  String get tkRoll => 'फेंकें';

  @override
  String tkDiceCount(int count) {
    return '$count पासे';
  }

  @override
  String tkTotal(int total) {
    return 'कुल: $total';
  }

  @override
  String get tkSpin => 'घुमाएँ';

  @override
  String get tkSpinnerOptions => 'चक्री के विकल्प';

  @override
  String get tkSpinnerHint => 'हर पंक्ति में एक विकल्प';

  @override
  String tkGroup(String letter) {
    return 'समूह $letter';
  }

  @override
  String get tkTooLoud => 'बहुत शोर!';

  @override
  String get tkCalm => 'अच्छा और शांत';

  @override
  String get tkLimit => 'सीमा';

  @override
  String get tkNoisePermission => 'शोर मीटर के लिए माइक्रोफ़ोन की अनुमति दें।';

  @override
  String get tkNoiseNoMic => 'इस बोर्ड में माइक्रोफ़ोन नहीं है।';

  @override
  String get tkNoiseUnavailable =>
      'शोर मीटर अभी माइक्रोफ़ोन इस्तेमाल नहीं कर सकता। कक्षा की आवाज़ या रिकॉर्डिंग बंद करके फिर कोशिश करें।';

  @override
  String get tkNoiseLocal =>
      'सिर्फ़ आवाज़ का स्तर इसी बोर्ड पर मापा जाता है। कुछ भी रिकॉर्ड नहीं होता।';

  @override
  String get tkDragToReveal => 'दिखाने के लिए खींचें';

  @override
  String get tkRevealAll => 'सब दिखाएँ';

  @override
  String get tkRemoveShade => 'शेड हटाएँ';

  @override
  String get tkEndSpotlight => 'स्पॉटलाइट बंद करें';

  @override
  String get tkSpotlightSize => 'स्पॉटलाइट का आकार';

  @override
  String get simTitle => 'सिमुलेशन';

  @override
  String get simHint => 'लोलक, प्रक्षेप्य, ग्राफ़, भिन्न, तरंगें, पाइथागोरस';

  @override
  String get simOthers => 'अन्य सिमुलेशन';

  @override
  String get simPendulum => 'सरल लोलक';

  @override
  String get simProjectile => 'प्रक्षेप्य गति';

  @override
  String get simGrapher => 'फलन ग्राफ़';

  @override
  String get simFractions => 'भिन्न पट्टियाँ';

  @override
  String get simWave => 'तरंगें';

  @override
  String get simPythagoras => 'पाइथागोरस प्रमेय';

  @override
  String get simLength => 'लंबाई';

  @override
  String get simGravity => 'गुरुत्व';

  @override
  String get simStartAngle => 'प्रारंभिक कोण';

  @override
  String get simSpeed => 'चाल';

  @override
  String get simAngle => 'कोण';

  @override
  String get simAmplitude => 'आयाम';

  @override
  String get simFrequency => 'आवृत्ति';

  @override
  String get simWavelength => 'तरंगदैर्ध्य';

  @override
  String simRange(String metres) {
    return 'परास $metres मी';
  }

  @override
  String simMaxHeight(String metres) {
    return 'अधिकतम ऊँचाई $metres मी';
  }

  @override
  String simFlightTime(String seconds) {
    return 'समय $seconds से.';
  }

  @override
  String simTop(int number) {
    return 'ऊपर $number';
  }

  @override
  String simBottom(int number) {
    return 'नीचे $number';
  }

  @override
  String simSide(String name) {
    return 'भुजा $name';
  }

  @override
  String get simBadExpression => 'वह व्यंजक पढ़ा नहीं जा सका';

  @override
  String get simDraw => 'बनाएँ';

  @override
  String get readAloud => 'ज़ोर से पढ़ें';

  @override
  String get readerTitle => 'इमर्सिव रीडर';

  @override
  String readerPageTitle(int number) {
    return 'पेज $number';
  }

  @override
  String get readerNothing =>
      'इस पेज पर पढ़ने के लिए टाइप किया हुआ कुछ नहीं है। टेक्स्ट टाइप करें, नोट जोड़ें या AI पेन से लिखावट बदलें।';

  @override
  String readerNoVoice(String language) {
    return 'इस बोर्ड में $language आवाज़ नहीं है। डिवाइस की टेक्स्ट-टू-स्पीच सेटिंग में जोड़ें (Windows: Settings → Time & language → Speech)।';
  }

  @override
  String get readerPrevious => 'पिछला अनुच्छेद';

  @override
  String get readerNext => 'अगला अनुच्छेद';

  @override
  String get readerPaper => 'कागज़';

  @override
  String get readerCream => 'क्रीम';

  @override
  String get readerContrast => 'उच्च कंट्रास्ट';

  @override
  String get readerBlue => 'हल्का नीला';

  @override
  String get readerLineFocus => 'पंक्ति पर ध्यान';

  @override
  String get readerSlower => 'धीमे';

  @override
  String get readerHint =>
      'पेज का टेक्स्ट, बड़े अक्षरों में, शब्द-दर-शब्द ज़ोर से';

  @override
  String get insertPicture => 'चित्र';

  @override
  String get insertPictureHintGallery => 'गैलरी से';

  @override
  String get insertPictureHintFiles => 'इस बोर्ड की फ़ाइलों से';

  @override
  String get insertPhoto => 'फ़ोटो लें';

  @override
  String get insertPhotoHint => 'इस बोर्ड के कैमरे से';

  @override
  String get pictureCouldNotOpen => 'वह चित्र नहीं खुल सका।';

  @override
  String get libTitle => 'चित्र संग्रह';

  @override
  String get libHint => 'आरेख, मानचित्र और स्टिकर, मुफ़्त उपयोग के लिए';

  @override
  String get libSearch => 'चित्र खोजें (हृदय, भारत का मानचित्र, ज्वालामुखी…)';

  @override
  String get libAll => 'सभी';

  @override
  String get libBiology => 'जीव विज्ञान';

  @override
  String get libChemistry => 'रसायन विज्ञान';

  @override
  String get libPhysics => 'भौतिकी';

  @override
  String get libMaths => 'गणित';

  @override
  String get libGeography => 'भूगोल';

  @override
  String get libHistory => 'इतिहास';

  @override
  String get libEnglish => 'भाषाएँ';

  @override
  String get libComputers => 'कंप्यूटर';

  @override
  String get libEvs => 'पर्यावरण अध्ययन और प्राथमिक';

  @override
  String get libStickers => 'स्टिकर';

  @override
  String get libNothingFound => 'कोई चित्र नहीं मिला। कोई और शब्द आज़माएँ।';

  @override
  String get libCredits =>
      'चित्र विकिमीडिया कॉमन्स (सार्वजनिक डोमेन, CC0, CC BY, CC BY-SA) और Microsoft Fluent Emoji (MIT) से। किसी चित्र के लेखक और लाइसेंस के लिए ⓘ दबाएँ; श्रेय चित्र के साथ बोर्ड पर जाता है।';

  @override
  String get importTitle => 'PDF या PowerPoint';

  @override
  String get importHint => 'हर पेज या स्लाइड लिखने के लिए एक बोर्ड पेज बनती है';

  @override
  String importingFile(String name) {
    return '$name खुल रही है';
  }

  @override
  String get importReading => 'फ़ाइल पढ़ी जा रही है…';

  @override
  String importPageOf(int done, int total) {
    return 'पेज $done / $total';
  }

  @override
  String importedPages(int count) {
    return 'इस पेज के बाद $count पेज जोड़े गए';
  }

  @override
  String get importOldPpt =>
      'यह पुरानी PowerPoint फ़ाइल (.ppt) है। इसे PowerPoint में .pptx या PDF के रूप में सहेजें, फिर यहाँ खोलें।';

  @override
  String get importNotSupported =>
      'बोर्ड PDF और PowerPoint (.pptx) फ़ाइलें खोलता है।';

  @override
  String get importPdfFailed =>
      'यह PDF नहीं खुल सकी। हो सकता है यह खराब हो या पासवर्ड से सुरक्षित हो।';

  @override
  String get importPptxFailed =>
      'यह PowerPoint नहीं खुल सकी। इसे PowerPoint में PDF के रूप में सहेजें और वह PDF खोलें।';

  @override
  String tourStepOf(int step, int total) {
    return '$total में से $step';
  }

  @override
  String get tourSkip => 'छोड़ें';

  @override
  String get tourNext => 'आगे';

  @override
  String get tourGotIt => 'समझ गया';

  @override
  String get tourWelcomeTitle => 'आपके बोर्ड में स्वागत है';

  @override
  String get tourWelcomeBody =>
      'हर कक्षा में काम आने वाले बटनों पर एक मिनट की नज़र।';

  @override
  String get tourPenTitle => 'लिखें और बनाएँ';

  @override
  String get tourPenBody =>
      'उँगली या स्टाइलस से लिखें। रंग और मोटाई के लिए पेन को फिर दबाएँ। दो उँगलियों से टैप करें तो अनडू, तीन से रीडू।';

  @override
  String get tourEraseTitle => 'मिटाएँ';

  @override
  String get tourEraseBody => 'स्याही पर रगड़ें। अनडू बोर्ड के नीचे है।';

  @override
  String get tourInsertTitle => 'बोर्ड पर जोड़ें';

  @override
  String get tourInsertBody =>
      'समीकरण, नोट, चित्र, चित्र संग्रह, PDF या PowerPoint, 3D मॉडल, लैब और सिमुलेशन।';

  @override
  String get tourToolsTitle => 'कक्षा के टूल';

  @override
  String get tourToolsBody =>
      'टाइमर, स्टॉपवॉच, नाम चुनने वाला, पासा, चक्री, शोर मीटर, स्क्रीन शेड, स्पॉटलाइट और इमर्सिव रीडर।';

  @override
  String get tourAiTitle => 'KINETIX AI';

  @override
  String get tourAiBody =>
      'पाठ के बारे में पूछें, क्विज़ या गृहकार्य बनाएँ, या बोर्ड पर लिखा सवाल हल करें।';

  @override
  String get tourBooksTitle => 'किताबें';

  @override
  String get tourBooksBody =>
      'आपका पाठ्यक्रम: हर विषय-वस्तु का पाठ, मुख्य बातें और प्रश्न, चाहें तो ज़ोर से पढ़कर।';

  @override
  String get tourPagesTitle => 'पेज';

  @override
  String get tourPagesBody =>
      'अगले पेज पर जाएँ; आख़िरी पेज पर यह नया पेज जोड़ता है।';

  @override
  String get tourRecordTitle => 'पाठ रिकॉर्ड करें';

  @override
  String get tourRecordBody =>
      'बोर्ड और आपकी आवाज़ रिकॉर्ड करता है, ताकि छात्र फिर से देख सकें।';

  @override
  String get tourHelpTitle => 'मदद हमेशा यहाँ है';

  @override
  String get tourHelpBody =>
      'मदद, यह टूर दोबारा और पाँच मिनट के अभ्यास के लिए यह मेनू खोलें। कीबोर्ड पर ? भी दबा सकते हैं।';

  @override
  String get tourPractise => 'अभी अभ्यास करें';

  @override
  String get helpTitle => 'मदद';

  @override
  String get helpSubtitle => 'छोटे जवाब, और बोर्ड पर बटन दिखाकर।';

  @override
  String get helpShowAround => 'मुझे घुमाकर दिखाएँ';

  @override
  String get helpPractise => '5 मिनट में अभ्यास करें';

  @override
  String get helpSearch => 'मैं कैसे…';

  @override
  String get helpNothing =>
      'कुछ नहीं मिला। कोई और शब्द आज़माएँ, या मुझे घुमाकर दिखाएँ।';

  @override
  String get helpShowMe => 'मुझे दिखाएँ';

  @override
  String get helpGroupWriting => 'बोर्ड पर लिखना';

  @override
  String get helpGroupContent => 'पेज और सामग्री';

  @override
  String get helpGroupClass => 'पढ़ाने के टूल';

  @override
  String get helpGroupAi => 'KINETIX AI और किताबें';

  @override
  String get helpGroupSettings => 'सेटिंग';

  @override
  String get helpWriteTitle => 'लिखें और बनाएँ';

  @override
  String get helpWrite1 => 'बाईं ओर पेन दबाएँ और उँगली या स्टाइलस से लिखें।';

  @override
  String get helpWrite2 => 'दो उँगलियों से बोर्ड खिसकाएँ और ज़ूम करें।';

  @override
  String get helpEraseTitle => 'मिटाएँ या अनडू करें';

  @override
  String get helpErase1 =>
      'इरेज़र दबाएँ और स्याही पर रगड़ें। पेज साफ़ करने के लिए उसे फिर दबाएँ।';

  @override
  String get helpErase2 => 'गलती हुई? नीचे अनडू दबाएँ।';

  @override
  String get helpShapesTitle => 'आकृतियाँ';

  @override
  String get helpShapes1 => 'आकृतियाँ दबाएँ, एक चुनें और बोर्ड पर खींचें।';

  @override
  String get helpShapes2 =>
      'आकार बदलने, घुमाने, रंगने या कॉपी करने के लिए उसे चुनें।';

  @override
  String get helpTextTitle => 'टेक्स्ट टाइप करें';

  @override
  String get helpText1 =>
      'T दबाएँ, फिर बोर्ड पर वहाँ दबाएँ जहाँ टेक्स्ट चाहिए।';

  @override
  String get helpPagesTitle => 'पेज पलटें और जोड़ें';

  @override
  String get helpPages1 =>
      'नीचे के तीर पेज पलटते हैं; आख़िरी पेज पर + नया पेज जोड़ता है।';

  @override
  String get helpPages2 =>
      'बोर्ड रखने और कक्षा से साझा करने के लिए नीचे बाईं ओर से सहेजें।';

  @override
  String get helpPictureTitle => 'चित्र जोड़ें';

  @override
  String get helpPicture1 =>
      '+ (जोड़ें) दबाएँ, फिर इस बोर्ड से चित्र के लिए चित्र, या चित्र संग्रह।';

  @override
  String get helpPicture2 => 'संग्रह के चित्रों के नीचे उनका श्रेय रहता है।';

  @override
  String get helpImportTitle => 'PDF या PowerPoint खोलें';

  @override
  String get helpImport1 =>
      '+ (जोड़ें) दबाएँ, फिर PDF या PowerPoint, और फ़ाइल चुनें।';

  @override
  String get helpImport2 =>
      'हर पेज या स्लाइड एक बोर्ड पेज बनती है जिस पर लिख सकते हैं; यह बिना इंटरनेट के चलता है।';

  @override
  String get helpSimsTitle => 'सिमुलेशन';

  @override
  String get helpSims1 => '+ (जोड़ें) या टूल्स दबाएँ, फिर सिमुलेशन।';

  @override
  String get helpSims2 =>
      'स्लाइडर खिसकाएँ और कक्षा लोलक, प्रक्षेप्य या तरंग को बदलते देखती है।';

  @override
  String get helpToolkitTitle => 'टाइमर, नाम चुनने वाला और पासा';

  @override
  String get helpToolkit1 => 'टूल्स दबाएँ और एक चुनें; वह बोर्ड पर तैरता है।';

  @override
  String get helpToolkit2 => 'उसे हटाने के लिए उसके नाम से खींचें।';

  @override
  String get helpShadeTitle => 'स्क्रीन शेड और स्पॉटलाइट';

  @override
  String get helpShade1 =>
      'शेड बोर्ड को ढकता है; पंक्ति-दर-पंक्ति दिखाने के लिए उसका हैंडल नीचे खींचें।';

  @override
  String get helpShade2 =>
      'स्पॉटलाइट एक घेरे को छोड़ सब अँधेरा कर देती है, जिसे आप खींच सकते हैं।';

  @override
  String get helpReadTitle => 'ज़ोर से पढ़ें';

  @override
  String get helpRead1 =>
      'टेक्स्ट चुनें और ज़ोर से पढ़ें दबाएँ, या पेज के लिए टूल्स → इमर्सिव रीडर।';

  @override
  String get helpRead2 =>
      'किताबें और लैब भी पाठ और चरण ज़ोर से पढ़ते हैं, अंग्रेज़ी, हिन्दी या कन्नड़ में, जहाँ बोर्ड में वह आवाज़ हो।';

  @override
  String get helpRecordTitle => 'पाठ रिकॉर्ड करें';

  @override
  String get helpRecord1 =>
      'बोर्ड और आपकी आवाज़ रिकॉर्ड करने के लिए लाल बटन दबाएँ।';

  @override
  String get helpRecord2 => 'रोकने और सहेजने के लिए फिर दबाएँ।';

  @override
  String get helpAiTitle => 'KINETIX AI से पूछें';

  @override
  String get helpAi1 =>
      'दाईं ओर AI बटन दबाएँ: पूछें, क्विज़, गृहकार्य, गणित हल करने वाला।';

  @override
  String get helpAi2 =>
      'बोर्ड पर कुछ चुनें और उसके बारे में पूछने के लिए AI से पढ़ें दबाएँ।';

  @override
  String get helpBooksTitle => 'किताबों से पाठ';

  @override
  String get helpBooks1 => 'दाईं ओर किताबें दबाएँ और एक विषय-वस्तु खोलें।';

  @override
  String get helpBooks2 =>
      'ज़ोर से पढ़ें पाठ को बड़े अक्षरों में खोलकर शब्द-दर-शब्द पढ़ता है।';

  @override
  String get helpSettingsTitle => 'भाषा, लेआउट और टच';

  @override
  String get helpSettings1 => 'नीचे बाईं ओर मेनू खोलें, फिर बोर्ड सेटिंग।';

  @override
  String get practiceTitle => 'अभ्यास बोर्ड';

  @override
  String get practiceNotSaved => 'यहाँ कुछ भी नहीं रखा जाता। सब कुछ आज़माएँ।';

  @override
  String practiceCount(int done, int total) {
    return 'अभ्यास: $total में से $done पूरे';
  }

  @override
  String get practiceReady => 'आप तैयार हैं!';

  @override
  String get practiceDoneBody =>
      'आपने कक्षा के लिए ज़रूरी सब कर लिया। मदद नीचे बाईं ओर के मेनू में है।';

  @override
  String get practiceShowList => 'सूची दिखाएँ';

  @override
  String get practiceHideList => 'सूची छिपाएँ';

  @override
  String get practiceFinish => 'अभ्यास पूरा करें';

  @override
  String get practiceEnd => 'अभ्यास बंद करें';

  @override
  String get practiceWrite => 'पेन से कुछ लिखें';

  @override
  String get practiceErase => 'उसे मिटाएँ, या अनडू दबाएँ';

  @override
  String get practiceShape => 'एक आकृति बनाएँ';

  @override
  String get practicePage => 'नए पेज पर जाएँ';

  @override
  String get practicePicture => 'चित्र संग्रह से एक चित्र जोड़ें';

  @override
  String get practiceTimer => 'टूल्स से टाइमर शुरू करें';

  @override
  String get practiceEnded => 'अभ्यास खत्म: आपका बोर्ड पहले जैसा है।';

  @override
  String get pen => 'पेन';

  @override
  String get highlighter => 'हाइलाइटर';

  @override
  String get colour => 'रंग';

  @override
  String get thickness => 'मोटाई';

  @override
  String get eraserSize => 'इरेज़र का आकार';

  @override
  String get sizeSmall => 'छोटा';

  @override
  String get sizeMedium => 'मध्यम';

  @override
  String get sizeLarge => 'बड़ा';

  @override
  String get eraseTip =>
      'सुझाव: इंटरैक्टिव पैनल पर मिटाने के लिए हथेली से रगड़ें।';

  @override
  String get clearPage => 'पेज साफ़ करें';

  @override
  String get boardTheme => 'बोर्ड थीम';

  @override
  String get bgPlain => 'सादा';

  @override
  String get bgRuled => 'लाइन वाला';

  @override
  String get bgGrid => 'ग्रिड (1 cm)';

  @override
  String get bgDots => 'बिंदु';

  @override
  String get bgChalkboard => 'ब्लैकबोर्ड';

  @override
  String get shapes3dSoon =>
      'घुमाए जा सकने वाले 3D ठोस (घन, बेलन, शंकु, गोला) जल्द आ रहे हैं।';

  @override
  String get shapeLine => 'रेखा';

  @override
  String get shapeArrow => 'तीर';

  @override
  String get shapeDoubleArrow => 'दोतरफ़ा तीर';

  @override
  String get shapeCircle => 'वृत्त';

  @override
  String get shapeEllipse => 'दीर्घवृत्त';

  @override
  String get shapeTriangle => 'त्रिभुज';

  @override
  String get shapeRightTriangle => 'समकोण त्रिभुज';

  @override
  String get shapeRectangle => 'आयत';

  @override
  String get shapeParallelogram => 'समांतर चतुर्भुज';

  @override
  String get shapeTrapezium => 'समलंब चतुर्भुज';

  @override
  String get shapeRhombus => 'समचतुर्भुज';

  @override
  String get shapePentagon => 'पंचभुज';

  @override
  String get shapeHexagon => 'षट्भुज';

  @override
  String get showLengths => 'लंबाई दिखाएँ';

  @override
  String get showLengthsHint => 'भुजाएँ cm में, 1 cm ग्रिड के अनुसार';

  @override
  String get showAngles => 'कोण दिखाएँ';

  @override
  String get eyeProtection => 'आँखों की सुरक्षा';

  @override
  String get eyeProtectionHint => 'गर्म रंग, कम नीली रोशनी, हल्की मद्धिम चमक';

  @override
  String get adjustSchoolDay => 'स्कूल के समय के अनुसार अपने-आप बदलें';

  @override
  String get warmth => 'गर्माहट';

  @override
  String get dimming => 'मद्धिम';

  @override
  String get highContrast => 'हाई कंट्रास्ट';

  @override
  String get highContrastHint => 'धुंधले प्रोजेक्टर के लिए';

  @override
  String get chalkboardHint => 'गहरा बोर्ड, कम चमक';

  @override
  String get dragToResize => 'आकार बदलने के लिए खींचें';

  @override
  String get moveToOtherSide => 'दूसरी तरफ़ ले जाएँ';

  @override
  String get splitWhiteboard => 'व्हाइटबोर्ड';

  @override
  String get splitModel3d => '3D मॉडल';

  @override
  String get splitLab => 'वर्चुअल लैब';

  @override
  String get splitChoose => 'चुनें कि व्हाइटबोर्ड के बगल में क्या दिखाना है।';

  @override
  String get chooseSomethingElse => 'कुछ और चुनें';

  @override
  String get signInWithTeacherApp => 'Teacher App से साइन इन करें';

  @override
  String get importFiles => 'PDF, PPT या इमेज इंपोर्ट करें';

  @override
  String get yourWhiteboards => 'आपके व्हाइटबोर्ड';

  @override
  String get recordings => 'रिकॉर्डिंग';

  @override
  String recordingsToUpload(int count) {
    return '$count अपलोड बाकी';
  }

  @override
  String get screenProjection => 'स्क्रीन प्रोजेक्शन';

  @override
  String get boardSettings => 'बोर्ड सेटिंग्स';

  @override
  String get guidedTour => 'गाइडेड टूर और अभ्यास';

  @override
  String get language => 'भाषा';

  @override
  String get languageHint =>
      'इस बोर्ड के बटन और संदेशों की भाषा। साइन इन करने वाले शिक्षक को साइन आउट होने तक बोर्ड उनकी अपनी भाषा में दिखता है।';

  @override
  String get touchScreen => 'टच स्क्रीन';

  @override
  String get touchScreenHint =>
      'चुनें कि यह बोर्ड किस हार्डवेयर पर चलता है। इसी से तय होता है कि हथेली या बड़े स्पर्श से क्या होगा।';

  @override
  String get touchTablet => 'टैबलेट';

  @override
  String get touchTabletHint => 'स्क्रीन पर टिके हाथ को अनदेखा किया जाता है';

  @override
  String get touchPanel => 'इंटरैक्टिव पैनल';

  @override
  String get touchPanelHint => 'हथेली या मुट्ठी डस्टर की तरह मिटाती है';

  @override
  String get touchIrFrame => 'IR टच फ़्रेम';

  @override
  String get touchIrFrameHint =>
      'हर स्पर्श लिखता है। IR फ़्रेम हथेली और उँगली में फ़र्क नहीं कर पाते';

  @override
  String get timesUp => 'समय पूरा';

  @override
  String get closeTimer => 'टाइमर बंद करें';

  @override
  String get reset => 'रीसेट';

  @override
  String get pause => 'रोकें';

  @override
  String get restart => 'फिर से शुरू करें';

  @override
  String get start => 'शुरू करें';

  @override
  String get randomPickNoClass =>
      'कक्षा के विद्यार्थियों में से चुनने के लिए, समय-सारणी वाली कक्षा के दौरान Teacher App से साइन इन करें।';

  @override
  String rollNo(String rollNo) {
    return 'रोल नंबर $rollNo';
  }

  @override
  String answerSavedTo(String outcome, String name) {
    return '$outcome · $name की प्रोफ़ाइल में सहेजा गया';
  }

  @override
  String get answerCorrect => 'सही';

  @override
  String get answerPartlyCorrect => 'आंशिक रूप से सही';

  @override
  String get answerPartly => 'आंशिक';

  @override
  String get answerNotCorrect => 'सही नहीं';

  @override
  String get answerSkipped => 'छोड़ा गया';

  @override
  String get answerSkip => 'छोड़ें';

  @override
  String get pickAgain => 'फिर से चुनें';

  @override
  String attendanceSummary(int present, int absent, int late) {
    return '$present उपस्थित · $absent अनुपस्थित · $late देर से   —   बदलने के लिए विद्यार्थी पर टैप करें';
  }

  @override
  String get present => 'उपस्थित';

  @override
  String get absent => 'अनुपस्थित';

  @override
  String get late => 'देर से';

  @override
  String get saveAttendance => 'उपस्थिति सहेजें';

  @override
  String get saveBoard => 'बोर्ड सहेजें';

  @override
  String get shareWithClass => 'कक्षा के साथ साझा करें';

  @override
  String get shareNeedsClass =>
      'तब उपलब्ध, जब बोर्ड समय-सारणी वाली कक्षा में इस्तेमाल हो';

  @override
  String shareBoardHint(String section) {
    return '$section के विद्यार्थी और अभिभावक इसे अपने ऐप में खोल सकते हैं';
  }

  @override
  String couldNotLoadBoards(String error) {
    return 'आपके बोर्ड लोड नहीं हो सके।\n$error';
  }

  @override
  String get noBoardsYet =>
      'आपके सहेजे गए बोर्ड यहाँ दिखेंगे। \"सहेजें\" दबाएँ, या कक्षा समाप्त करते समय सहेजें।';

  @override
  String pageCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count पेज',
      one: '1 पेज',
    );
    return '$_temp0';
  }

  @override
  String get shared => 'साझा किया गया';

  @override
  String get recPaused => 'रुका हुआ';

  @override
  String get recLive => 'REC';

  @override
  String get recNoSoundTooltip => 'बिना आवाज़ के रिकॉर्डिंग';

  @override
  String get recResume => 'रिकॉर्डिंग जारी रखें';

  @override
  String get recPause => 'रिकॉर्डिंग रोकें';

  @override
  String get recStop => 'रिकॉर्डिंग बंद करें';

  @override
  String get recDiscardTitle => 'यह रिकॉर्डिंग हटा दें?';

  @override
  String recDiscardBody(String duration) {
    return 'पाठ का $duration हिस्सा बोर्ड से मिटा दिया जाएगा।';
  }

  @override
  String get recSaveTitle => 'पाठ की रिकॉर्डिंग सहेजें';

  @override
  String get recBoardAndVoice => 'बोर्ड और आवाज़';

  @override
  String get recBoardOnly => 'केवल बोर्ड, बिना आवाज़';

  @override
  String recShareHint(String section) {
    return 'अपलोड होने के बाद $section के विद्यार्थी और अभिभावक इसे देख सकते हैं';
  }

  @override
  String get recUploadNote =>
      'यह पीछे से KINETIX Cloud पर अपलोड होती है। अनुपस्थित विद्यार्थियों को इसकी सूचना दी जाती है।';

  @override
  String sharedWith(String section) {
    return '$section के साथ साझा किया गया।';
  }

  @override
  String get theClass => 'कक्षा';

  @override
  String couldNotShare(String error) {
    return 'साझा नहीं हो सका: $error';
  }

  @override
  String couldNotLoadRecordings(String error) {
    return 'आपकी रिकॉर्डिंग लोड नहीं हो सकीं।\n$error';
  }

  @override
  String get noRecordingsYet =>
      'आपके रिकॉर्ड किए गए पाठ यहाँ दिखेंगे। शुरू करने के लिए टूलबार पर \"रिकॉर्ड\" टैप करें।';

  @override
  String get recNoSound => 'बिना आवाज़';

  @override
  String get recWaiting => 'अपलोड का इंतज़ार';

  @override
  String recUploadsWhen(String name) {
    return '$name के साइन इन करने पर अपलोड होगी';
  }

  @override
  String recUploading(int percent) {
    return 'अपलोड हो रही है $percent%';
  }

  @override
  String get recUploaded => 'अपलोड हो गई';

  @override
  String get recUploadFailed => 'अपलोड नहीं हो सकी';

  @override
  String recUploadedLaterClass(String section) {
    return 'बाद की कक्षा में अपलोड हुई। अगर यह $section के लिए है, तो यहीं से साझा करें।';
  }

  @override
  String get thisClass => 'इस कक्षा';

  @override
  String broadcastFrom(String name) {
    return '$name की ओर से';
  }

  @override
  String get acknowledge => 'पढ़ लिया';

  @override
  String signInTo(String board) {
    return '$board पर साइन इन करें';
  }

  @override
  String get thisBoard => 'इस बोर्ड';

  @override
  String get signInUsePhone =>
      'अपने फ़ोन पर KINETIX Teacher App इस्तेमाल करें।';

  @override
  String get signInStep1 => 'KINETIX Teacher App खोलें';

  @override
  String get signInStep2 => '\"Connect to board\" पर टैप करें';

  @override
  String get signInStep3 => 'QR कोड स्कैन करें, या यह कोड टाइप करें';

  @override
  String newCodeIn(int seconds) {
    return 'नया कोड $seconds सेकंड में';
  }

  @override
  String get cannotReachCloudRetrying =>
      'KINETIX Cloud से संपर्क नहीं हो रहा। फिर से कोशिश हो रही है…';

  @override
  String get signInCodeNote =>
      'कोड हर 2 मिनट में बदलता है और एक ही बार काम करता है। बोर्ड पर कोई पासवर्ड नहीं लिखा जाता।';

  @override
  String get enrollTitle => 'यह बोर्ड सेट अप करें';

  @override
  String get enrollHint =>
      'KINETIX ERP में Devices → Add board खोलें, फिर वहाँ दिखाया गया कोड यहाँ लिखें।';

  @override
  String get enrollCode => 'पंजीकरण कोड';

  @override
  String get enrollServer => 'सर्वर';

  @override
  String get enrollRegistering => 'पंजीकरण हो रहा है…';

  @override
  String get enrollRegister => 'बोर्ड पंजीकृत करें';

  @override
  String get enrollSkip => 'अभी छोड़ें और अभ्यास बोर्ड इस्तेमाल करें';

  @override
  String get aiAskNeedsSignIn =>
      'KINETIX AI से पूछने के लिए Teacher App से साइन इन करें।';

  @override
  String get aiAskHint => 'किसी भी विषय-वस्तु के बारे में पूछें';

  @override
  String aiAskHintClass(String classLabel) {
    return '$classLabel के बारे में कुछ भी पूछें';
  }

  @override
  String get aiSpeak => 'बोलें';

  @override
  String get aiAsk => 'पूछें';

  @override
  String get aiDisclaimer =>
      'उत्तर आपके पाठ्यक्रम के अनुसार होते हैं। कक्षा के साथ साझा करने से पहले जाँच लें।';

  @override
  String get aiPreparing => 'KINETIX AI व्याख्या तैयार कर रहा है…';

  @override
  String get aiGroupTeach => 'पढ़ाएँ';

  @override
  String get aiGroupMathsScience => 'गणित और विज्ञान';

  @override
  String get aiGroupLookUp => 'खोजें';

  @override
  String get aiQuickQuiz => 'झटपट क्विज़';

  @override
  String get aiLessonPlan => 'पाठ योजना';

  @override
  String get aiMathSolver => 'गणित सॉल्वर';

  @override
  String get aiGraph => 'ग्राफ़';

  @override
  String get ai3dModels => '3D मॉडल';

  @override
  String get aiSimulations => 'सिमुलेशन';

  @override
  String get aiTextbook => 'पाठ्यपुस्तक';

  @override
  String get aiReadBoard => 'बोर्ड पढ़ें';

  @override
  String get aiAskAgain => 'नया उत्तर पाने के लिए फिर पूछें';

  @override
  String aiBasedOnSyllabus(String sources) {
    return 'आपके पाठ्यक्रम पर आधारित: $sources';
  }

  @override
  String get aiKeyPoints => 'मुख्य बिंदु';

  @override
  String get aiAskNext => 'आगे पूछें';

  @override
  String get aiPreviewLabel =>
      'नमूना — असली उत्तरों के लिए KINETIX AI सर्वर जोड़ें';

  @override
  String get aiPreview => 'नमूना';

  @override
  String get aiLanguageTooltip => 'KINETIX AI की भाषा';

  @override
  String get aiSignInNotice =>
      'KINETIX AI के लिए शिक्षक का साइन इन होना और बोर्ड का ऑनलाइन होना ज़रूरी है। प्रोफ़ाइल बटन से Teacher App द्वारा साइन इन करें। गणित सॉल्वर बिना साइन इन के भी चलता है।';

  @override
  String get difficultyEasy => 'आसान';

  @override
  String get difficultyMedium => 'मध्यम';

  @override
  String get difficultyHard => 'कठिन';

  @override
  String dueOn(String date) {
    return 'जमा करने की तारीख: $date';
  }

  @override
  String get dueDate => 'जमा करने की तारीख';

  @override
  String get aiErrSignInAgain =>
      'KINETIX AI इस्तेमाल करने के लिए Teacher App से फिर से साइन इन करें।';

  @override
  String get aiErrRefused =>
      'KINETIX AI इस अनुरोध में मदद नहीं कर सकता। इसे कक्षा के हिसाब से दूसरे शब्दों में पूछें।';

  @override
  String get aiErrQuota =>
      'आपके संस्थान ने आज की KINETIX AI सीमा पूरी कर ली है। यह कल फिर से शुरू होगी।';

  @override
  String get aiErrUnusable =>
      'KINETIX AI काम का उत्तर नहीं दे सका। फिर से कोशिश करें या दूसरे शब्दों में पूछें।';

  @override
  String get aiErrUnreachable =>
      'KINETIX AI से अभी संपर्क नहीं हो रहा। एक मिनट बाद फिर कोशिश करें।';

  @override
  String get aiErrCheckInput => 'आपने जो लिखा है उसे जाँचें और फिर कोशिश करें।';

  @override
  String aiErrGeneric(int status) {
    return 'कुछ गड़बड़ हो गई ($status)। फिर से कोशिश करें।';
  }

  @override
  String get aiErrTimeout =>
      'KINETIX AI बहुत समय ले रहा है। एक मिनट बाद फिर कोशिश करें।';

  @override
  String get aiErrOffline =>
      'बोर्ड ऑफ़लाइन है। KINETIX AI इस्तेमाल करने के लिए इंटरनेट से जोड़ें। गणित सॉल्वर ऑफ़लाइन भी चलता है।';

  @override
  String aiExplainTopic(String topic) {
    return '$topic समझाइए';
  }

  @override
  String aiExplainFromBoard(String text) {
    return 'बोर्ड पर लिखे इस भाग को समझाइए: $text';
  }

  @override
  String get quizNeedsSignIn =>
      'KINETIX AI से क्विज़ बनाने के लिए Teacher App से साइन इन करें।';

  @override
  String get quizTypeTopic => 'पहले क्विज़ की विषय-वस्तु लिखें।';

  @override
  String get quizTopicHint => 'जैसे प्रकाश संश्लेषण, भिन्न, कंपनी खाते';

  @override
  String get questionsLabel => 'प्रश्न';

  @override
  String get quizMake => 'क्विज़ बनाएँ';

  @override
  String get quizMakeNew => 'नया क्विज़ बनाएँ';

  @override
  String writingQuestions(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count प्रश्न लिखे जा रहे हैं…',
      one: '1 प्रश्न लिखा जा रहा है…',
    );
    return '$_temp0';
  }

  @override
  String quizHeader(int count, String topic) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count प्रश्न · $topic',
      one: '1 प्रश्न · $topic',
    );
    return '$_temp0';
  }

  @override
  String get quizDraftNote =>
      'मसौदा — दिखाने से पहले प्रश्न और उत्तर जाँच लें।';

  @override
  String get quizPresent => 'दिखाएँ';

  @override
  String get sendAsHomework => 'होमवर्क के रूप में भेजें';

  @override
  String quizAnswerExplanation(String letter, String explanation) {
    return 'उत्तर $letter। $explanation';
  }

  @override
  String questionOf(int number, int total) {
    return 'प्रश्न $number / $total';
  }

  @override
  String get hideAnswer => 'उत्तर छिपाएँ';

  @override
  String get revealAnswer => 'उत्तर दिखाएँ';

  @override
  String get finish => 'समाप्त';

  @override
  String quizTitle(String topic) {
    return 'क्विज़: $topic';
  }

  @override
  String get quizHomeworkIntro =>
      'इन बहुविकल्पीय प्रश्नों के उत्तर दें। सही विकल्प का अक्षर लिखें।';

  @override
  String get homeworkNeedsSignIn =>
      'KINETIX AI से होमवर्क बनाने के लिए Teacher App से साइन इन करें।';

  @override
  String get homeworkTypeTopic => 'पहले होमवर्क की विषय-वस्तु लिखें।';

  @override
  String get homeworkTopicHint => 'जैसे रैखिक समीकरण, जर्नल प्रविष्टियाँ';

  @override
  String get homeworkMake => 'होमवर्क बनाएँ';

  @override
  String get homeworkWriteOwn => 'खुद लिखें';

  @override
  String get homeworkEditNote =>
      'कक्षा को भेजने से पहले आप सब कुछ बदल सकते हैं। विद्यार्थी और अभिभावक इसे अपने ऐप में देखते हैं।';

  @override
  String get homeworkNeedsTitle => 'होमवर्क का शीर्षक लिखें।';

  @override
  String get homeworkTooLong =>
      'यह होमवर्क भेजने के लिए बहुत लंबा है। कुछ प्रश्न हटाएँ।';

  @override
  String get quizTooLongForHomework =>
      'यह क्विज़ होमवर्क के रूप में भेजने के लिए बहुत लंबा है। कम प्रश्नों वाला क्विज़ बनाएँ।';

  @override
  String homeworkSent(String section) {
    return 'होमवर्क $section को भेज दिया गया। विद्यार्थियों और अभिभावकों को सूचना मिल गई है।';
  }

  @override
  String get homeworkErrSignIn =>
      'होमवर्क देने के लिए Teacher App से फिर से साइन इन करें।';

  @override
  String homeworkErrStatus(int status) {
    return 'होमवर्क भेजा नहीं जा सका ($status)। फिर से कोशिश करें।';
  }

  @override
  String get homeworkErrOffline =>
      'बोर्ड ऑफ़लाइन है। होमवर्क भेजने के लिए इंटरनेट से जोड़ें।';

  @override
  String get questionHint => 'प्रश्न';

  @override
  String marks(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count अंक',
      one: '1 अंक',
    );
    return '$_temp0';
  }

  @override
  String get removeQuestion => 'प्रश्न हटाएँ';

  @override
  String get instructionsLabel => 'निर्देश';

  @override
  String totalMarks(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'कुल $count अंक',
      one: 'कुल 1 अंक',
    );
    return '$_temp0';
  }

  @override
  String get addQuestion => 'प्रश्न जोड़ें';

  @override
  String get sendToClass => 'कक्षा को भेजें';

  @override
  String homeworkTitleTopic(String topic) {
    return 'होमवर्क: $topic';
  }

  @override
  String get homeworkDefaultInstructions =>
      'सभी प्रश्नों के उत्तर अपनी कॉपी में लिखें। हल करने के चरण भी लिखें।';

  @override
  String homeworkTotalLine(String marks) {
    return 'कुल: $marks';
  }

  @override
  String get lessonNeedsSignIn =>
      'KINETIX AI से पाठ योजना बनाने के लिए Teacher App से साइन इन करें।';

  @override
  String get lessonTypeTopic => 'पहले पाठ की विषय-वस्तु लिखें।';

  @override
  String get lessonTopicHint => 'जैसे जल चक्र';

  @override
  String get lessonLength => 'अवधि';

  @override
  String get lessonPlanButton => 'पाठ की योजना बनाएँ';

  @override
  String get lessonPlanAgain => 'फिर से योजना बनाएँ';

  @override
  String get lessonPlanning => 'पाठ की योजना बन रही है…';

  @override
  String get lessonObjectives => 'उद्देश्य';

  @override
  String lessonSteps(int minutes) {
    return 'चरण · $minutes मिनट';
  }

  @override
  String get lessonMaterials => 'सामग्री';

  @override
  String get lessonCheck => 'समझ की जाँच';

  @override
  String get readNeedsSignIn =>
      'KINETIX AI से बोर्ड पढ़वाने के लिए Teacher App से साइन इन करें।';

  @override
  String get readIntro =>
      'इस पेज की लिखावट को ऐसे टेक्स्ट में बदलता है जिसे आप कॉपी, जाँच या उसके बारे में पूछ सकते हैं। साफ़ लिखें; एक बार में एक पेज।';

  @override
  String get readThisPage => 'यह पेज पढ़ें';

  @override
  String get readAgain => 'फिर से पढ़ें';

  @override
  String get readingBoard => 'बोर्ड पढ़ा जा रहा है…';

  @override
  String get readNoWriting => 'इस पेज पर कुछ लिखा नहीं मिला।';

  @override
  String get readMathsFound => 'मिला गणित';

  @override
  String get copied => 'कॉपी हो गया';

  @override
  String get copyText => 'टेक्स्ट कॉपी करें';

  @override
  String get askAiAboutThis => 'इसके बारे में KINETIX AI से पूछें';

  @override
  String get booksTopic => 'विषय-वस्तु';

  @override
  String get booksSignIn =>
      'किताबें में चल रही कक्षा का पाठ्यक्रम दिखता है। इसे खोलने के लिए Teacher App से साइन इन करें।';

  @override
  String get booksOpening => 'पाठ्यक्रम खुल रहा है…';

  @override
  String get booksCouldNotOpen =>
      'पाठ्यक्रम खुल नहीं सका। देखें कि बोर्ड ऑनलाइन है।';

  @override
  String get booksUnlinked =>
      'यह विषय अभी किसी पाठ्यक्रम से नहीं जुड़ा है। आपके एडमिन इसे KINETIX ERP → Syllabus में जोड़ सकते हैं।';

  @override
  String get booksDraft =>
      'मसौदा सामग्री: इससे पढ़ाने से पहले अपनी पाठ्यपुस्तक से मिलान करें।';

  @override
  String get booksDraftShort =>
      'मसौदा सामग्री: अपनी पाठ्यपुस्तक से मिलान करें।';

  @override
  String get booksAddedByInstitution => 'आपके संस्थान ने जोड़ा';

  @override
  String booksTopicCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count विषय-वस्तु',
      one: '1 विषय-वस्तु',
    );
    return '$_temp0';
  }

  @override
  String get booksOpeningTopic => 'विषय-वस्तु खुल रही है…';

  @override
  String get booksCouldNotOpenTopic => 'यह विषय-वस्तु खुल नहीं सकी।';

  @override
  String get booksExplain => 'KINETIX AI से समझाएँ';

  @override
  String get booksQuiz => 'इस पर झटपट क्विज़';

  @override
  String get booksOnTheBoard => 'बोर्ड पर दिखाएँ';

  @override
  String get booksKeyFacts => 'मुख्य तथ्य';

  @override
  String get booksOutcomes => 'अंत तक विद्यार्थी ये कर पाएँगे';

  @override
  String booksTaughtCount(int covered, int total) {
    return '$total में से $covered विषय-वस्तु पढ़ाई गई';
  }

  @override
  String booksChapterTaught(int covered, int total) {
    return '$covered/$total पढ़ाई गई';
  }

  @override
  String booksTaughtOn(String date) {
    return '$date को पढ़ाया';
  }

  @override
  String get booksMarkTaught => 'पढ़ाया गया मार्क करें';

  @override
  String get booksUndoTaught => 'अनडू';

  @override
  String get booksMarked => 'पढ़ाया गया मार्क किया';

  @override
  String get booksUnmarked => 'पढ़ाया गया का मार्क हटाया';

  @override
  String get booksMarkFailed => 'सहेजा नहीं जा सका। देखें कि बोर्ड ऑनलाइन है।';

  @override
  String get booksHook => 'ऐसे शुरू करें';

  @override
  String get booksTerms => 'सीखने के शब्द';

  @override
  String get booksExample => 'हल किया हुआ उदाहरण';

  @override
  String get booksActivity => 'कक्षा गतिविधि';

  @override
  String get mathHint => 'कोई सवाल या समीकरण लिखें';

  @override
  String get mathOffline =>
      'इसी बोर्ड पर हल होता है। ऑफ़लाइन चलता है, साइन इन की ज़रूरत नहीं।';

  @override
  String get mathTryThese => 'इनमें से कोई आज़माएँ';

  @override
  String get mathAbout =>
      'BODMAS से सवाल, भिन्न, घात और मूल, डिग्री में sin/cos/tan, log हल करता है, और रैखिक व द्विघात समीकरण चरण-दर-चरण हल करता है।';

  @override
  String get mathSolve => 'हल करें';

  @override
  String get mathWorking => 'हल';

  @override
  String get mathKeySquared => 'वर्ग';

  @override
  String get mathKeyPower => 'घात';

  @override
  String get mathKeySquareRoot => 'वर्गमूल';

  @override
  String get mathKeyPi => 'पाई';

  @override
  String get mathKeyFraction => 'भिन्न';

  @override
  String get mathKeyOpenBracket => 'कोष्ठक खोलें';

  @override
  String get mathKeyCloseBracket => 'कोष्ठक बंद करें';

  @override
  String get mathKeyTimes => 'गुणा';

  @override
  String get mathKeyDivide => 'भाग';

  @override
  String get mathKeyMinus => 'घटा';

  @override
  String get mathKeyPlus => 'जोड़';

  @override
  String get mathKeyEquals => 'बराबर';

  @override
  String get mathKeyDelete => 'मिटाएँ';

  @override
  String get mathKindArithmetic => 'अंकगणित';

  @override
  String get mathKindSimplify => 'सरल करें';

  @override
  String get mathKindCheck => 'जाँच';

  @override
  String get mathKindLinear => 'रैखिक समीकरण';

  @override
  String get mathKindQuadratic => 'द्विघात समीकरण';

  @override
  String get mathTrue => 'सत्य';

  @override
  String get mathFalse => 'असत्य';

  @override
  String get mathEveryNumber => 'हर संख्या एक हल है';

  @override
  String get mathNoSolution => 'कोई हल नहीं';

  @override
  String mathRepeatedRoot(String answer) {
    return '$answer (दोहराया मूल)';
  }

  @override
  String mathNoRealRoots(String roots) {
    return 'कोई वास्तविक मूल नहीं: $roots';
  }

  @override
  String get mathOr => 'या';

  @override
  String get mathAnd => 'और';

  @override
  String mathForEvery(String equation, String variable) {
    return '$variable के हर मान के लिए $equation';
  }

  @override
  String mathIsFalse(String equation) {
    return '$equation असत्य है';
  }

  @override
  String get mathStepWorkOutRest => 'बाकी हल करें';

  @override
  String get mathStepBrackets => 'पहले कोष्ठक';

  @override
  String get mathStepPowers => 'घात और मूल';

  @override
  String get mathStepDivideMultiply => 'भाग और गुणा, बाएँ से दाएँ';

  @override
  String get mathStepAddSubtract => 'जोड़ और घटाव, बाएँ से दाएँ';

  @override
  String get mathStepStartExpression => 'व्यंजक से शुरू करें';

  @override
  String get mathStepStartStatement => 'कथन से शुरू करें';

  @override
  String get mathStepLeftSide => 'बायाँ पक्ष हल करें';

  @override
  String get mathStepRightSide => 'दायाँ पक्ष हल करें';

  @override
  String get mathStepStatementTrue => 'दोनों पक्ष बराबर हैं, इसलिए कथन सत्य है';

  @override
  String get mathStepStatementFalse => 'दोनों पक्ष अलग हैं, इसलिए कथन असत्य है';

  @override
  String get mathStepExpand => 'कोष्ठक खोलें और समान पद मिलाएँ';

  @override
  String mathStepToFind(String variable, String equation) {
    return '$variable ज्ञात करने के लिए समीकरण लिखें, जैसे $equation';
  }

  @override
  String get mathStepWriteEquation => 'समीकरण लिखें';

  @override
  String get mathStepExpandEachSide =>
      'कोष्ठक खोलें और हर पक्ष में समान पद मिलाएँ';

  @override
  String mathStepSquaresCancel(String term, String square) {
    return 'दोनों पक्षों से $term घटाएँ; $square वाले पद कट जाते हैं';
  }

  @override
  String get mathStepAlwaysEqual => 'दोनों पक्ष हमेशा बराबर हैं';

  @override
  String get mathStepNeverEqual => 'दोनों पक्ष कभी बराबर नहीं हो सकते';

  @override
  String mathStepAddBoth(String term) {
    return 'दोनों पक्षों में $term जोड़ें';
  }

  @override
  String mathStepSubtractBoth(String term) {
    return 'दोनों पक्षों से $term घटाएँ';
  }

  @override
  String mathStepMultiplyBoth(String number) {
    return 'दोनों पक्षों को $number से गुणा करें';
  }

  @override
  String mathStepDivideBoth(String number) {
    return 'दोनों पक्षों को $number से भाग दें';
  }

  @override
  String mathStepCheck(String value) {
    return 'जाँच: समीकरण में $value रखें';
  }

  @override
  String get mathStepBringLeft => 'सभी पदों को बाएँ पक्ष में लाकर सरल करें';

  @override
  String mathStepClearFractions(String number) {
    return 'भिन्न हटाने के लिए दोनों पक्षों को $number से गुणा करें';
  }

  @override
  String mathStepMakePositive(String number, String square) {
    return 'दोनों पक्षों को $number से गुणा करें ताकि $square वाला पद धनात्मक हो';
  }

  @override
  String mathStepCompare(String form) {
    return '$form से तुलना करें';
  }

  @override
  String mathStepDiscriminant(String formula) {
    return 'विविक्तकर $formula ज्ञात करें';
  }

  @override
  String get mathStepEqualRoots => 'D = 0, इसलिए दोनों मूल बराबर हैं';

  @override
  String mathStepUse(String formula) {
    return '$formula का प्रयोग करें';
  }

  @override
  String get mathStepComplexRoots =>
      'D < 0, इसलिए कोई वास्तविक मूल नहीं है। मूल सम्मिश्र संख्याएँ हैं';

  @override
  String get mathStepTwoRealRoots => 'D > 0, इसलिए दो अलग-अलग वास्तविक मूल हैं';

  @override
  String mathStepQuadraticFormula(String formula) {
    return 'द्विघात सूत्र $formula का प्रयोग करें';
  }

  @override
  String get mathStepTwoRoots => 'दोनों मूल निकालें';

  @override
  String get mathStepSimplifyRoot => 'वर्गमूल को सरल करें';

  @override
  String mathStepDivideTopBottom(String number) {
    return 'अंश और हर को $number से भाग दें';
  }

  @override
  String get mathStepSoRoots => 'इसलिए मूल हैं';

  @override
  String get mathStepInDecimals => 'दशमलव में';

  @override
  String get mathStepWorkOutRoots => 'मूल निकालें';

  @override
  String get mathStepFactorised => 'गुणनखंड रूप';

  @override
  String get mathErrZeroPowerZero => '0⁰ परिभाषित नहीं है।';

  @override
  String get mathErrDivisionByZero => 'शून्य से भाग परिभाषित नहीं है।';

  @override
  String get mathErrNegativeFractionalPower =>
      'ऋणात्मक संख्या की भिन्नात्मक घात वास्तविक संख्या नहीं होती।';

  @override
  String get mathErrNegativeRoot =>
      'ऋणात्मक संख्या का वर्गमूल वास्तविक संख्या नहीं होता।';

  @override
  String mathErrNotDefined(String expression) {
    return '$expression परिभाषित नहीं है।';
  }

  @override
  String mathErrPositiveOnly(String function) {
    return '$function केवल धनात्मक संख्याओं के लिए परिभाषित है।';
  }

  @override
  String mathErrUnknownFunction(String function) {
    return 'अज्ञात फलन $function।';
  }

  @override
  String mathErrNoValue(String name) {
    return '“$name” का कोई मान नहीं है।';
  }

  @override
  String get mathErrTooLarge => 'उत्तर बहुत बड़ा है या परिभाषित नहीं है।';

  @override
  String mathErrNotANumber(String text) {
    return '“$text” कोई संख्या नहीं है।';
  }

  @override
  String mathErrDontUnderstandUse(String text) {
    return '“$text” समझ नहीं आया। संख्याएँ, x, + − × ÷ ^, कोष्ठक, √, sin, cos, tan, log इस्तेमाल करें।';
  }

  @override
  String get mathErrEmpty => 'कोई सवाल या समीकरण लिखें, जैसे 3x + 5 = 20।';

  @override
  String get mathErrAfterEquals => '“=” के बाद कुछ लिखें।';

  @override
  String get mathErrOneEquals => 'केवल एक “=” चिह्न लगाएँ।';

  @override
  String get mathErrUnmatchedClose => 'एक “)” है जिसका “(” नहीं है।';

  @override
  String mathErrDontUnderstandHere(String text) {
    return 'यहाँ “$text” समझ नहीं आया।';
  }

  @override
  String get mathErrEndsEarly =>
      'व्यंजक बहुत जल्दी खत्म हो गया। क्या कुछ छूट गया है?';

  @override
  String get mathErrOperatorBetween =>
      'संख्याओं के बीच कोई चिह्न (+ − × ÷) लगाएँ।';

  @override
  String get mathErrPowerAfterCaret => '“^” के बाद घात लिखें।';

  @override
  String get mathErrEmptyBrackets => 'कोष्ठक “()” के अंदर कुछ नहीं है।';

  @override
  String get mathErrBracketNotClosed => 'एक कोष्ठक बंद नहीं है। “)” लगाएँ।';

  @override
  String mathErrNumberAfter(String function) {
    return '$function के बाद कोई संख्या लिखें।';
  }

  @override
  String get mathErrBeforeEquals => '“=” से पहले कुछ लिखें।';

  @override
  String mathErrMissingBefore(String text) {
    return '“$text” से पहले कुछ छूट गया है।';
  }

  @override
  String get mathErrBothSides => '“=” के दोनों ओर कुछ लिखें।';

  @override
  String mathErrUnknownInside(String function) {
    return '$function के अंदर अज्ञात अभी समर्थित नहीं है।';
  }

  @override
  String get mathErrUnknownDenominator => 'हर में अज्ञात अभी समर्थित नहीं है।';

  @override
  String get mathErrUnknownPower => 'घात में अज्ञात अभी समर्थित नहीं है।';

  @override
  String get mathErrWholePowers =>
      'अज्ञात की घात पूर्ण संख्या होनी चाहिए, जैसे x² या x³।';

  @override
  String mathErrManyUnknowns(String list) {
    return 'इसमें एक से अधिक अज्ञात हैं ($list)। एक ही अज्ञात लें, जैसे x।';
  }

  @override
  String mathErrHighPowers(String power) {
    return '$power या उससे ऊँची घात वाले समीकरण अभी समर्थित नहीं हैं। रैखिक या द्विघात समीकरण आज़माएँ।';
  }

  @override
  String get toolTodaysPlan => 'आज की योजना';

  @override
  String get planSignIn =>
      'आज की योजना में पढ़ाई जा रही कक्षा की पाठ योजना दिखती है। इसे खोलने के लिए Teacher app से साइन इन करें।';

  @override
  String get planOpening => 'योजना खुल रही है…';

  @override
  String get planCouldNotOpen =>
      'पाठ योजना नहीं खुल सकी। देखें कि बोर्ड ऑनलाइन है।';

  @override
  String get planNoClass =>
      'बोर्ड पर समय-सारिणी की कोई कक्षा नहीं खुली है, इसलिए दिखाने के लिए कोई पाठ योजना नहीं है।';

  @override
  String get planNone =>
      'इस पीरियड की कोई पाठ योजना नहीं है। Teacher app में योजना बनाएँ।';

  @override
  String get planAiDrafted => 'KINETIX AI से ड्राफ़्ट किया गया';

  @override
  String get planTopics => 'विषय-वस्तु';

  @override
  String get planOpenInBooks => 'Books में खोलें';

  @override
  String planStepsOf(int planned, int length) {
    return 'चरण · $length में से $planned मिनट';
  }

  @override
  String get planStartTimer => 'चरण टाइमर शुरू करें';

  @override
  String get planResumeTimer => 'फिर शुरू करें';

  @override
  String get planNextStep => 'अगला चरण';

  @override
  String get planAllStepsDone => 'सभी चरण पूरे';

  @override
  String get planHomework => 'होमवर्क';

  @override
  String get demoChip => 'डेमो';

  @override
  String get demoBannerTitle => 'डेमो मोड';

  @override
  String get demoBannerBody =>
      'KINETIX डेमो कॉलेज का नमूना डेटा। कुछ भी सर्वर पर नहीं भेजा जाता, और आपके बदलाव ऐप बंद होने तक ही रहते हैं।';

  @override
  String demoSignInAs(String name) {
    return '$name के रूप में साइन इन करें';
  }

  @override
  String get demoOtpHint => 'डेमो: कोई भी नंबर चलेगा; कोड 123456 है।';

  @override
  String get notInDemo => 'डेमो में उपलब्ध नहीं है।';

  @override
  String get demoBoardBody =>
      'यह बोर्ड नमूना डेटा वाली एक डेमो कक्षा में है। कुछ भी सर्वर पर नहीं भेजा जाता।';

  @override
  String get kioskTitle => 'कियोस्क मोड';

  @override
  String get kioskSettingsHint =>
      'विद्यार्थियों को KINETIX Board में ही रखता है और बिजली जाने के बाद इसे फिर खोल देता है। आपकी संस्था इसे KINETIX ERP → सेटिंग्स में चालू करती है और IT PIN तय करती है।';

  @override
  String get kioskStatusLocked => 'चालू: यह डिवाइस KINETIX Board पर लॉक है।';

  @override
  String get kioskStatusPinned =>
      'चालू: स्क्रीन पिनिंग। पूरे लॉक के लिए KINETIX Board को डिवाइस ओनर बनाएँ (कियोस्क गाइड देखें)।';

  @override
  String get kioskStatusOff => 'बंद';

  @override
  String kioskStatusPaused(String time) {
    return 'IT ने $time तक रोका है';
  }

  @override
  String get kioskStatusUnsupported =>
      'इस डिवाइस पर उपलब्ध नहीं। Windows पर Assigned Access का उपयोग करें (कियोस्क गाइड देखें)।';

  @override
  String get kioskDemoHint =>
      'डेमो बिल्ड इस डिवाइस को कभी लॉक नहीं करते। कियोस्क मोड कैसा है यह देखने के लिए स्क्रीन पिनिंग आज़माएँ: बाहर आने के लिए घड़ी को 3 सेकंड दबाए रखें।';

  @override
  String get kioskTry => 'कियोस्क आज़माएँ (स्क्रीन पिनिंग)';

  @override
  String get kioskStopTrial => 'कियोस्क ट्रायल बंद करें';

  @override
  String get kioskExitTitle => 'कियोस्क मोड से बाहर निकलें';

  @override
  String get kioskEnterPin =>
      'IT स्टाफ़ के लिए: KINETIX ERP में तय किया गया IT PIN डालें।';

  @override
  String get kioskPinLabel => 'IT PIN';

  @override
  String get kioskUnlock => 'अनलॉक करें';

  @override
  String kioskWrongPin(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'गलत PIN। $count प्रयास बाकी।',
      one: 'गलत PIN। 1 प्रयास बाकी।',
    );
    return '$_temp0';
  }

  @override
  String kioskLockedOut(String time) {
    return 'बहुत बार गलत PIN डाला गया। $time के बाद फिर कोशिश करें।';
  }

  @override
  String get kioskNoPin =>
      'इस संस्था के लिए अभी कोई IT PIN तय नहीं है। KINETIX ERP → सेटिंग्स → बोर्ड कियोस्क मोड में एक PIN तय करें; बोर्ड अगली बार ऑनलाइन होने पर उसे ले लेगा। तब तक कियोस्क मोड केवल कियोस्क गाइड में बताए तरीके से हटाया जा सकता है।';

  @override
  String get kioskLeave => '10 मिनट के लिए कियोस्क से बाहर निकलें';

  @override
  String get kioskLeaveHint =>
      '10 मिनट बाद, या दोबारा शुरू होने पर, बोर्ड अपने-आप फिर लॉक हो जाता है।';

  @override
  String get kioskOpenSettings => 'Android सेटिंग्स खोलें';

  @override
  String kioskPausedBody(String time) {
    return 'कियोस्क मोड $time तक रुका है।';
  }

  @override
  String get kioskLockNow => 'अभी फिर लॉक करें';

  @override
  String get kioskDemoBody =>
      'यह डेमो बिल्ड है: कियोस्क मोड बंद है और PIN की ज़रूरत नहीं है।';

  @override
  String get toolConceptVideos => 'कॉन्सेप्ट वीडियो';

  @override
  String get conceptVideosTitle => 'कॉन्सेप्ट वीडियो';

  @override
  String get conceptVideosForPeriod => 'इस पीरियड के कॉन्सेप्ट वीडियो';

  @override
  String conceptVideosNext(String time) {
    return 'अगला पीरियड $time बजे';
  }

  @override
  String get conceptVideosSkip => 'छोड़ें';

  @override
  String get conceptVideosNone =>
      'इस विषय के लिए अभी कोई कॉन्सेप्ट वीडियो नहीं है।';

  @override
  String get conceptVideosNoPeriod =>
      'इस बोर्ड पर अभी या आज बाद में कोई कक्षा नहीं है।';

  @override
  String get conceptVideosSignIn =>
      'अपनी कक्षा के कॉन्सेप्ट वीडियो देखने के लिए साइन इन करें।';

  @override
  String get conceptVideosCouldNotLoad => 'कॉन्सेप्ट वीडियो लोड नहीं हो सके।';

  @override
  String get conceptVideosUnsupported =>
      'इस डिवाइस पर वीडियो नहीं चल सकते। बोर्ड का Android या Windows ऐप उपयोग करें।';

  @override
  String get conceptVideosFromYouTube => 'यूट्यूब से चलता है';

  @override
  String get conceptVideosSourceLessonPlan => 'आज की पाठ योजना से';

  @override
  String get conceptVideosSourceYearPlan => 'वार्षिक योजना से';

  @override
  String get conceptVideosSourceSyllabus => 'पाठ्यक्रम का अगला विषय';

  @override
  String conceptVideosPlay(String title) {
    return '$title चलाएँ';
  }

  @override
  String get answerCover => 'उत्तर देखने के लिए टैप करें';

  @override
  String get answerHint => 'उत्तर, जो दिखाने तक ढका रहेगा';

  @override
  String get bgFourLine => 'चार-रेखा';

  @override
  String get bringToFront => 'सबसे आगे लाएँ';

  @override
  String get sendToBack => 'सबसे पीछे भेजें';

  @override
  String get circuitAmmeter => 'एमीटर';

  @override
  String get circuitBattery => 'बैटरी';

  @override
  String get circuitBulb => 'बल्ब';

  @override
  String get circuitCell => 'सेल';

  @override
  String get circuitEarth => 'अर्थ';

  @override
  String get circuitLed => 'एलईडी';

  @override
  String get circuitResistor => 'प्रतिरोधक';

  @override
  String get circuitSwitchClosed => 'स्विच (बंद)';

  @override
  String get circuitSwitchOpen => 'स्विच (खुला)';

  @override
  String get circuitVoltmeter => 'वोल्टमीटर';

  @override
  String get circuitWire => 'तार';

  @override
  String get copy => 'कॉपी करें';

  @override
  String get paste => 'चिपकाएँ';

  @override
  String get duplicate => 'दोहराएँ';

  @override
  String get delete => 'हटाएँ';

  @override
  String get edit => 'बदलें';

  @override
  String get group => 'समूह बनाएँ';

  @override
  String get ungroup => 'समूह तोड़ें';

  @override
  String get fill => 'रंग भरें';

  @override
  String get noFill => 'रंग हटाएँ';

  @override
  String get fillShapes => 'आकृतियों में रंग भरें';

  @override
  String get equationLatex => 'समीकरण (LaTeX)';

  @override
  String get equationPreview => 'नीचे लिखें, या कोई चिह्न टैप करें';

  @override
  String get putOnBoard => 'बोर्ड पर लगाएँ';

  @override
  String get flowDecision => 'निर्णय';

  @override
  String get flowInputOutput => 'इनपुट / आउटपुट';

  @override
  String get flowProcess => 'प्रक्रिया';

  @override
  String get flowStartEnd => 'शुरू / अंत';

  @override
  String get graphCannotRead => 'यह फलन पढ़ा नहीं जा सका';

  @override
  String get graphFunction => 'फलन';

  @override
  String get graphHint => 'जैसे 2x^2 - 3, sin(x), sqrt(x)';

  @override
  String get graphXRange => 'x, − से + तक';

  @override
  String get graphYRange => 'y, − से + तक';

  @override
  String get hideProtractor => 'चाँदा हटाएँ';

  @override
  String get hideRuler => 'स्केल हटाएँ';

  @override
  String get turn => 'घुमाएँ';

  @override
  String get typeHint => 'लिखें…';

  @override
  String get inputTitle => 'किससे लिखें';

  @override
  String get inputHint =>
      'पेन: केवल पेन लिखता है, उँगलियाँ बोर्ड खिसकाती हैं। अपने-आप: पेन उठाने तक उँगलियाँ लिखती हैं।';

  @override
  String get inputAuto => 'अपने-आप';

  @override
  String get inputPen => 'पेन';

  @override
  String get inputFinger => 'उँगली';

  @override
  String get insertAnswerHint => 'कक्षा में टैप करने तक ढका रहता है';

  @override
  String get insertEquationHint => 'भिन्न, मूल और घात, सुंदर लिखावट में';

  @override
  String get insertModelHint =>
      'बोर्ड के साथ खुलता है; उसकी तस्वीर बोर्ड पर लगाएँ';

  @override
  String get tapToPlace => 'रखने के लिए बोर्ड पर टैप करें';

  @override
  String get laserHint => 'बिना लिखे इशारा करता है';

  @override
  String get kitAddWord => 'शब्द जोड़ें';

  @override
  String get kitAiForLesson => 'इस पाठ के लिए KINETIX AI';

  @override
  String get kitAll => 'सभी';

  @override
  String get kitAtomBall => 'परमाणु गेंद';

  @override
  String get kitBinary => 'द्विआधारी';

  @override
  String get kitBohrModel => 'बोर मॉडल';

  @override
  String get kitDecimal => 'दशमलव संख्या';

  @override
  String kitDrawTimeline(int count) {
    return 'समयरेखा बनाएँ ($count)';
  }

  @override
  String get kitElementCard => 'तत्व कार्ड';

  @override
  String get kitIndia => 'भारत';

  @override
  String get kitWorld => 'विश्व';

  @override
  String get kitMore => 'इस किट में';

  @override
  String get kitMoreHint =>
      'ऊपर के टैब में इस विषय की सामग्री है। बोर्ड पर लगाने के लिए किसी पर भी टैप करें।';

  @override
  String get kitPickEvents => 'समयरेखा के लिए घटनाएँ चुनें';

  @override
  String get kitSearchFormulas => 'सूत्र खोजें';

  @override
  String get kitSeeAndDo => 'देखें और करें';

  @override
  String get kitShort => 'किट';

  @override
  String get kitStarGive => 'एक स्टार दें';

  @override
  String get kitStarRemove => 'एक स्टार वापस लें';

  @override
  String kitStarOfTheDay(String name) {
    return 'आज का स्टार: $name';
  }

  @override
  String get kitStarsNoClass =>
      'बच्चों को स्टार देने के लिए समय-सारणी वाली कक्षा के साथ साइन इन करें।';

  @override
  String get kitWordsHint =>
      'बोर्ड पर लिखे शब्द यहाँ दिखते हैं। बड़े शब्द-कार्ड के लिए किसी पर टैप करें।';

  @override
  String get kitThisLesson => 'यह पाठ';

  @override
  String get kitFormulas => 'सूत्र';

  @override
  String get kitConstants => 'स्थिरांक';

  @override
  String get kitPeriodic => 'आवर्त सारणी';

  @override
  String get kitIons => 'आयन';

  @override
  String get kitDates => 'मुख्य तिथियाँ';

  @override
  String get kitWords => 'शब्द दीवार';

  @override
  String get kitLogic => 'लॉजिक गेट';

  @override
  String get kitStars => 'कक्षा के स्टार';

  @override
  String kitValency(int valency) {
    return 'संयोजकता $valency';
  }

  @override
  String get kitPeriodicHint =>
      'कार्ड, बोर मॉडल या परमाणु गेंद के लिए किसी तत्व पर टैप करें।';

  @override
  String get kitLogicHint => 'सत्य सारणी बोर्ड पर लिखने के लिए टैप करें।';

  @override
  String subjectKit(String subject) {
    return '$subject किट';
  }

  @override
  String get layoutTitle => 'लेआउट';

  @override
  String get layoutHint =>
      'रेल में औज़ार बोर्ड के किनारों पर होते हैं; टूलबार में नीचे।';

  @override
  String get layoutRails => 'रेल';

  @override
  String get layoutBottomBar => 'नीचे का टूलबार';

  @override
  String get simpleBoardTitle => 'सरल बोर्ड';

  @override
  String get simpleBoardHint =>
      'LKG से कक्षा 5 के लिए नाम सहित बड़े औज़ार, Andika अक्षर और कक्षा के स्टार। अपने-आप उन कक्षाओं में चालू करता है।';

  @override
  String get simpleBoardAuto => 'अपने-आप';

  @override
  String get simpleBoardOn => 'चालू';

  @override
  String get simpleBoardOff => 'बंद';

  @override
  String get noteAnswer => 'ढका उत्तर';

  @override
  String get noteSticky => 'चिपकने वाला नोट';

  @override
  String get numberFrom => 'से';

  @override
  String get numberTo => 'तक';

  @override
  String get numberStep => 'अंतराल';

  @override
  String get openLab => 'प्रयोगशाला खोलें';

  @override
  String get openModel => '3D मॉडल खोलें';

  @override
  String get readWithAi => 'AI से पढ़ें';

  @override
  String get snapshotAdded =>
      'तस्वीर बोर्ड पर लगी। फिर खोलने के लिए उस पर टैप करें।';

  @override
  String get snapshotToBoard => 'बोर्ड पर लगाएँ';

  @override
  String get stChemEquation => 'रासायनिक समीकरण';

  @override
  String get stCode => 'कोड ब्लॉक';

  @override
  String get stEquation => 'समीकरण';

  @override
  String get stGraph => 'ग्राफ़';

  @override
  String get stNumberLine => 'संख्या रेखा';

  @override
  String get stWordCard => 'शब्द कार्ड';

  @override
  String get stGeometry => 'ज्यामिति';

  @override
  String get stCircuits => 'परिपथ';

  @override
  String get stAtoms => 'परमाणु';

  @override
  String get stTimeline => 'समयरेखा';

  @override
  String get stFlowchart => 'फ़्लोचार्ट';

  @override
  String get stFourLine => 'चार-रेखा कागज़';

  @override
  String get stGrammar => 'व्याकरण के रंग';

  @override
  String get subjectMaths => 'गणित';

  @override
  String get subjectPhysics => 'भौतिकी';

  @override
  String get subjectChemistry => 'रसायन';

  @override
  String get subjectBiology => 'जीव विज्ञान';

  @override
  String get subjectScience => 'विज्ञान';

  @override
  String get subjectEvs => 'पर्यावरण अध्ययन';

  @override
  String get subjectGeography => 'भूगोल';

  @override
  String get subjectHistory => 'इतिहास';

  @override
  String get subjectCivics => 'नागरिक शास्त्र';

  @override
  String get subjectCommerce => 'वाणिज्य';

  @override
  String get subjectEnglish => 'अंग्रेज़ी';

  @override
  String get subjectLanguages => 'भाषाएँ';

  @override
  String get subjectComputer => 'कंप्यूटर विज्ञान';

  @override
  String get subjectArt => 'कला';

  @override
  String get subjectGeneral => 'कक्षा';

  @override
  String get toolCompass => 'परकार';

  @override
  String get toolInsert => 'जोड़ें';

  @override
  String get toolLaser => 'लेज़र पॉइंटर';

  @override
  String get toolMove => 'बोर्ड खिसकाएँ';

  @override
  String get toolText => 'टेक्स्ट';

  @override
  String get zoomFit => 'सब दिखाएँ';

  @override
  String get zoomIn => 'बड़ा करें';

  @override
  String get zoomOut => 'छोटा करें';

  @override
  String get zoomReset => '100% पर लौटें';

  @override
  String get aiPen => 'AI पेन';

  @override
  String get aiPenTitle => 'AI पेन: आपकी लिखावट से आकृतियाँ, गणित और शब्द';

  @override
  String get aiPenModeAuto => 'थोड़ा रुकने पर';

  @override
  String get aiPenModeAutoHint =>
      'हमेशा की तरह लिखें; रुकने के लगभग एक सेकंड बाद यह बदल जाता है।';

  @override
  String get aiPenModeLive => 'शब्द-दर-शब्द';

  @override
  String get aiPenModeLiveHint =>
      'अगला शब्द शुरू करते ही पिछला शब्द बदल जाता है।';

  @override
  String get aiPenModeTap => 'जब मैं बदलें दबाऊँ';

  @override
  String get aiPenModeTapHint =>
      'जब तक आप बदलें नहीं दबाते, स्याही जैसी लिखी है वैसी रहती है।';

  @override
  String get aiPenConvert => 'बदलें';

  @override
  String get aiPenWordsLanguage => 'शब्द इस भाषा में पढ़े जाते हैं';

  @override
  String get aiPenTapHint =>
      'AI पेन ने जो बदला है उस पर टैप करें: दूसरे विकल्प देखें या अपनी स्याही वापस पाएँ। किसी लिखावट को मिटाने के लिए उस पर घिचपिच करें।';

  @override
  String get aiPenSnapShapes => 'बनाते समय आकृतियाँ साफ़ करें';

  @override
  String get aiPenSnapShapesHint =>
      'पेन से बने कच्चे वृत्त, रेखाएँ, तीर और बहुभुज साफ़ आकृतियाँ बन जाते हैं।';

  @override
  String get aiPenDidYouMean => 'क्या आपका मतलब था…';

  @override
  String get aiPenTypeIt => 'या टाइप करें';

  @override
  String get aiPenItsShape => 'यह आकृति है';

  @override
  String get aiPenItsWriting => 'यह लिखावट है';

  @override
  String get aiPenBackToInk => 'मेरी स्याही वापस';

  @override
  String get aiPenKeepShape => 'आकृति रखें';

  @override
  String get aiPenNoShape => 'इस स्याही से कोई साफ़ आकृति नहीं बनती।';

  @override
  String get aiPenReadings => 'दूसरे विकल्प';

  @override
  String get aiPenConvertInk => 'AI पेन से बदलें';

  @override
  String get aiPenWordsStayInk =>
      'इस बोर्ड पर आकृतियाँ और गणित बदल जाते हैं। शब्द स्याही ही रहते हैं: इस बोर्ड में लिखावट पढ़ने वाला नहीं है।';

  @override
  String aiPenModelNeeded(String language) {
    return '$language लिखावट मॉडल डाउनलोड होने तक शब्द स्याही ही रहेंगे (बोर्ड सेटिंग्स → AI पेन)।';
  }

  @override
  String aiPenLanguageUnsupported(String language) {
    return 'यह बोर्ड $language लिखावट नहीं पढ़ सकता। शब्द स्याही ही रहेंगे; आकृतियाँ और गणित फिर भी बदलेंगे।';
  }

  @override
  String get aiPenNothingToConvert =>
      'बदलने को कुछ नहीं: पहले लिखावट या चित्र चुनें।';

  @override
  String get aiPenSettingsTitle => 'AI पेन';

  @override
  String get aiPenSettingsHint =>
      'लिखावट इसी बोर्ड पर पढ़ी जाती है: आप जो लिखते हैं वह बोर्ड से बाहर नहीं जाता। आकृतियाँ और गणित हर भाषा में बिना डाउनलोड के काम करते हैं।';

  @override
  String get aiPenEngineMlkit =>
      'इस पैनल पर शब्द Google ML Kit पढ़ता है। हर भाषा का मॉडल एक बार डाउनलोड होता है (लगभग 20 MB); उसके बाद यह बिना इंटरनेट के चलता है।';

  @override
  String get aiPenEngineWindows =>
      'शब्द Windows का लिखावट पहचानने वाला पढ़ता है। कोई भाषा जोड़ने के लिए Windows Settings → Time & language में उसकी लिखावट जोड़ें।';

  @override
  String get aiPenEngineNone =>
      'इस बोर्ड में लिखावट पढ़ने वाला नहीं है: शब्द स्याही ही रहते हैं।';

  @override
  String get aiPenModelReady => 'तैयार';

  @override
  String get aiPenModelDownload => 'डाउनलोड करें';

  @override
  String get aiPenModelDownloading => 'डाउनलोड हो रहा है…';

  @override
  String get aiPenModelUnsupported => 'इस बोर्ड पर उपलब्ध नहीं';

  @override
  String get aiPenDownloadFailed =>
      'लिखावट मॉडल डाउनलोड नहीं हो सका। एक बार इंटरनेट से जुड़ें और फिर कोशिश करें।';

  @override
  String get aiOfflineLabel =>
      'ऑफ़लाइन नमूना — बोर्ड के अपने नोट्स से (अंग्रेज़ी में), क्योंकि KINETIX AI से संपर्क नहीं हो पा रहा';

  @override
  String get profilesTitle => 'कौन पढ़ा रहा है?';

  @override
  String get profilesHint =>
      'जिन शिक्षकों ने इस बोर्ड पर साइन इन किया है। अपने नाम पर टैप करें और अपना PIN डालें।';

  @override
  String get profilesSignInFull => 'Teacher ऐप से साइन इन करें';

  @override
  String get profilesLocked => 'लॉक';

  @override
  String get profilesNoPin => 'अभी PIN नहीं';

  @override
  String pinEnterFor(String name) {
    return '$name का PIN डालें';
  }

  @override
  String pinWrong(int n) {
    return 'गलत PIN। बचे प्रयास: $n';
  }

  @override
  String get pinWrongNoCount => 'गलत PIN। फिर कोशिश करें।';

  @override
  String get pinLockedOut =>
      'बहुत सारे गलत PIN। Teacher ऐप से साइन इन करें, या अपने एडमिन से PIN रीसेट करवाएँ।';

  @override
  String get pinNoPin =>
      'इस बोर्ड पर आपका PIN सेट नहीं है। Teacher ऐप से साइन इन करें, फिर PIN सेट करें।';

  @override
  String get pinNeedsNetwork =>
      'यह बोर्ड ऑफ़लाइन है और आपकी कोई कक्षा खुली नहीं है। इंटरनेट से जुड़ें, या Teacher ऐप से साइन इन करें।';

  @override
  String get pinSetTitle => 'इस बोर्ड के लिए PIN सेट करें';

  @override
  String get pinSetHint =>
      '4 से 6 अंक। अगली बार Teacher ऐप की जगह इस बोर्ड पर अपने नाम पर टैप करके PIN डालें।';

  @override
  String get pinConfirm => 'PIN फिर से डालें';

  @override
  String get pinMismatch => 'दोनों PIN अलग हैं। फिर कोशिश करें।';

  @override
  String get pinWeak => 'ऐसा PIN चुनें जिसका अंदाज़ा लगाना मुश्किल हो।';

  @override
  String get pinSaved =>
      'PIN सेव हो गया। इस बोर्ड पर अपनी प्रोफ़ाइल पर जाने के लिए इसका इस्तेमाल करें।';

  @override
  String get pinSetAction => 'PIN सेट करें';

  @override
  String get pinChangeAction => 'PIN बदलें';

  @override
  String get pinBanner =>
      'फ़ोन के बिना इस बोर्ड पर अपनी प्रोफ़ाइल पर जाने के लिए PIN सेट करें।';

  @override
  String get notNow => 'अभी नहीं';

  @override
  String get lockTitle => 'बोर्ड लॉक है';

  @override
  String lockHint(String name) {
    return '$name की कक्षा अभी खुली है। जारी रखने के लिए PIN डालें।';
  }

  @override
  String get switchTeacher => 'शिक्षक बदलें';

  @override
  String get lockBoard => 'बोर्ड लॉक करें';

  @override
  String get signOut => 'साइन आउट';

  @override
  String get idleLockTitle => 'खाली रहने पर लॉक करें';

  @override
  String get idleLockHint =>
      'PIN वाले शिक्षकों के लिए, इतने मिनट तक न छूने पर बोर्ड लॉक हो जाता है। पीरियड ख़त्म होने पर साइन आउट हो जाता है।';

  @override
  String get idleOff => 'बंद';

  @override
  String get projectorTitle => 'प्रोजेक्टर';

  @override
  String get projectorHint =>
      'बोर्ड को दूसरी स्क्रीन (प्रोजेक्टर या टीवी) पर कक्षा को दिखाएँ, आपके टूल और पैनल के बिना। 3D मॉडल और लैब उसके बगल में दिखते हैं।';

  @override
  String get projectorEnabled => 'दूसरी स्क्रीन इस्तेमाल करें';

  @override
  String get projectorAuto => 'स्क्रीन जुड़ते ही शुरू करें';

  @override
  String get projectorNone => 'कोई दूसरी स्क्रीन नहीं जुड़ी';

  @override
  String projectorShowingOn(String name) {
    return '$name पर दिख रहा है';
  }

  @override
  String get projectorShow => 'दूसरी स्क्रीन पर दिखाएँ';

  @override
  String get projectorStop => 'दिखाना बंद करें';

  @override
  String get projectorBlank => 'कक्षा की स्क्रीन खाली करें';

  @override
  String get toolAskClass => 'कक्षा से पूछें';

  @override
  String get askClassHint =>
      'विद्यार्थी स्टूडेंट ऐप में उत्तर दें, या अपना उत्तर कार्ड उत्तर को ऊपर रखकर उठाएँ। फ़ोन ज़रूरी नहीं।';

  @override
  String get askQuestionLabel => 'प्रश्न (वैकल्पिक)';

  @override
  String get askAnswersLabel => 'उत्तर';

  @override
  String get askTrueFalse => 'सही / गलत';

  @override
  String get askNumber => 'संख्या';

  @override
  String get askRightAnswer => 'सही उत्तर (वैकल्पिक)';

  @override
  String get askNumberHint => 'जैसे 2.5';

  @override
  String get askNumberNoCards =>
      'संख्या वाले उत्तर केवल स्टूडेंट ऐप से आते हैं (उत्तर कार्ड पर A से D होते हैं)।';

  @override
  String get askStart => 'पूछें';

  @override
  String get pollTrue => 'सही';

  @override
  String get pollFalse => 'गलत';

  @override
  String get pollDefaultQuestion => 'कक्षा जाँच';

  @override
  String get pollNoCards =>
      'फ़ोटो में कोई उत्तर कार्ड नहीं मिला। कक्षा से कार्ड सीधे उठाने को कहें और फिर कोशिश करें।';

  @override
  String pollCardsRead(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count कार्ड पढ़े गए।',
      one: '1 कार्ड पढ़ा गया।',
    );
    return '$_temp0';
  }

  @override
  String pollUnknownCards(String cards) {
    return 'कार्ड $cards इस कक्षा के नहीं हैं।';
  }

  @override
  String get pollScanFailed => 'फ़ोटो पढ़ी नहीं जा सकी। फिर कोशिश करें।';

  @override
  String pollAnswered(int count, int total) {
    return '$total में से $count ने उत्तर दिया';
  }

  @override
  String get pollEnded => 'प्रश्न समाप्त';

  @override
  String get pollLiveInApp => 'स्टूडेंट ऐप में लाइव';

  @override
  String get pollNotSaved =>
      'केवल उत्तर कार्ड; सहेजा नहीं जाएगा (कोई कक्षा खुली नहीं है)।';

  @override
  String get pollScanCards => 'उत्तर कार्ड स्कैन करें';

  @override
  String get pollShowAnswer => 'उत्तर दिखाएँ';

  @override
  String get pollEnd => 'प्रश्न समाप्त करें';

  @override
  String get pollPutOnBoard => 'परिणाम बोर्ड पर रखें';

  @override
  String get pollNoAnswersYet => 'अभी कोई उत्तर नहीं।';

  @override
  String get remoteConnected => 'फ़ोन रिमोट जुड़ गया।';

  @override
  String get remotePhotoFailed => 'फ़ोन से आई फ़ोटो नहीं दिखाई जा सकी।';

  @override
  String get subjectManagement => 'प्रबंधन';

  @override
  String get subjectLaw => 'विधि';

  @override
  String get subjectStatistics => 'सांख्यिकी';

  @override
  String get kitAccounts => 'लेखा';

  @override
  String get kitFinance => 'कैलकुलेटर';

  @override
  String get kitManagement => 'ढाँचे';

  @override
  String get kitLaw => 'विधि';

  @override
  String get kitAlgorithms => 'एल्गोरिद्म';

  @override
  String get kitCsLabs => 'CS लैब';

  @override
  String get kitDiagrams => 'आरेख';

  @override
  String get stCodeLab => 'कोड लैब';

  @override
  String get kitStats => 'सांख्यिकी';

  @override
  String get stSheet => 'स्प्रेडशीट';

  @override
  String get stReader => 'अधिनियम और निर्णय रीडर';

  @override
  String get accFormats => 'प्रारूप';

  @override
  String get accJournal => 'जर्नल (रोज़नामचा)';

  @override
  String get accLedger => 'खाता बही (T-खाता)';

  @override
  String get accTrialBalance => 'तलपट';

  @override
  String get accFinalAccounts => 'व्यापार एवं लाभ-हानि खाता';

  @override
  String get accBalanceSheet => 'तुलन पत्र (अनुसूची III)';

  @override
  String get accCashBook => 'रोकड़ बही';

  @override
  String get accBrs => 'बैंक समाधान विवरण';

  @override
  String get accBlankSheet => 'खाली स्प्रेडशीट';

  @override
  String get calcDepreciation => 'मूल्यह्रास (SLM / WDV)';

  @override
  String get calcRatios => 'लेखा अनुपात';

  @override
  String get calcNpv => 'NPV, IRR और पेबैक अवधि';

  @override
  String get calcBreakEven => 'सम-विच्छेद बिंदु';

  @override
  String get calcGst => 'GST (CGST / SGST / IGST)';

  @override
  String get calcInterest => 'साधारण और चक्रवृद्धि ब्याज';

  @override
  String get calcEmi => 'EMI (मासिक किस्त)';

  @override
  String get calcWorkOut => 'हल करें';

  @override
  String get calcPutOnBoard => 'बोर्ड पर रखें';

  @override
  String get calcCheckInputs => 'संख्याएँ जाँचें';

  @override
  String get calcOpenLab => 'सम-विच्छेद लैब खोलें';

  @override
  String get methodSlm => 'सीधी रेखा';

  @override
  String get methodWdv => 'ह्रासमान शेष';

  @override
  String get interestSimple => 'साधारण';

  @override
  String get interestCompound => 'चक्रवृद्धि';

  @override
  String get fCost => 'लागत (₹)';

  @override
  String get fScrap => 'अवशेष मूल्य (₹)';

  @override
  String get fLife => 'उपयोगी जीवन (वर्ष)';

  @override
  String get fRate => 'दर (% प्रति वर्ष)';

  @override
  String get fYears => 'वर्ष';

  @override
  String get fMonths => 'महीने';

  @override
  String get fPrincipal => 'मूलधन (₹)';

  @override
  String get fAmount => 'राशि (₹)';

  @override
  String get fGstRate => 'GST दर (%)';

  @override
  String get fInterState => 'अंतर-राज्यीय आपूर्ति (IGST)';

  @override
  String get fInclusive => 'राशि में GST शामिल है';

  @override
  String get fOutlay => 'प्रारंभिक निवेश (₹)';

  @override
  String get fCashFlows => 'वर्षवार नकद अंतर्वाह (₹)';

  @override
  String get fDiscountRate => 'पूंजी की लागत (%)';

  @override
  String get fFixedCost => 'स्थिर लागत (₹)';

  @override
  String get fVariableCost => 'प्रति इकाई परिवर्ती लागत (₹)';

  @override
  String get fPrice => 'प्रति इकाई विक्रय मूल्य (₹)';

  @override
  String get fUnits => 'बेची गई इकाइयाँ';

  @override
  String get fCompounding => 'वर्ष में चक्रवृद्धि की बार';

  @override
  String get fCurrentAssets => 'चालू परिसंपत्तियाँ';

  @override
  String get fCurrentLiabilities => 'चालू देयताएँ';

  @override
  String get fInventory => 'स्टॉक (माल-सूची)';

  @override
  String get fPrepaid => 'पूर्वदत्त व्यय';

  @override
  String get fDebt => 'दीर्घकालीन ऋण';

  @override
  String get fEquity => 'अंशधारकों की निधि';

  @override
  String get fRevenue => 'परिचालन से आय';

  @override
  String get fGrossProfit => 'सकल लाभ';

  @override
  String get fNetProfit => 'शुद्ध लाभ';

  @override
  String get fCogs => 'परिचालन आय की लागत';

  @override
  String get fAvgInventory => 'औसत स्टॉक';

  @override
  String get fReceivables => 'व्यापारिक प्राप्य';

  @override
  String get fEbit => 'ब्याज और कर से पूर्व लाभ';

  @override
  String get fInterest => 'ब्याज';

  @override
  String get fTotalAssets => 'कुल परिसंपत्तियाँ';

  @override
  String get mgSwot => 'SWOT विश्लेषण';

  @override
  String get mgPestle => 'PESTLE विश्लेषण';

  @override
  String get mgPorter => 'पोर्टर की पाँच शक्तियाँ';

  @override
  String get mgBcg => 'BCG मैट्रिक्स';

  @override
  String get mgAnsoff => 'एंसॉफ मैट्रिक्स';

  @override
  String get mgValueChain => 'मूल्य श्रृंखला';

  @override
  String get mg7s => 'मैकिन्से 7S';

  @override
  String get mgMaslow => 'मास्लो का आवश्यकता पदानुक्रम';

  @override
  String get mg4p => 'विपणन मिश्रण (4P)';

  @override
  String get mg7p => 'विपणन मिश्रण (7P)';

  @override
  String get mgGantt => 'गैंट चार्ट';

  @override
  String get mgPert => 'PERT / CPM (क्रांतिक पथ)';

  @override
  String get mgDecisionTree => 'निर्णय वृक्ष';

  @override
  String get mgFishbone => 'फिशबोन आरेख';

  @override
  String get mgMindMap => 'माइंड मैप';

  @override
  String get mgCaseStudy => 'केस स्टडी ढाँचा';

  @override
  String get mgStrategy => 'रणनीति';

  @override
  String get mgMarketing => 'विपणन और लोग';

  @override
  String get mgProjects => 'परियोजनाएँ और निर्णय';

  @override
  String get pertActivities => 'गतिविधियाँ';

  @override
  String get pertHint =>
      'हर पंक्ति में एक गतिविधि: उसका अक्षर, उसका समय (या आशावादी, संभावित, निराशावादी), फिर उससे पहले की गतिविधियाँ। उदाहरण: C 2 A';

  @override
  String get pertInvalid =>
      'गतिविधियाँ जाँचें: किसी को ऐसी गतिविधि चाहिए जो सूची में नहीं है, या वे एक चक्र बनाती हैं।';

  @override
  String get lawReader => 'अधिनियम या निर्णय पढ़ें';

  @override
  String get lawPaste => 'पाठ चिपकाएँ';

  @override
  String get lawImportPdf => 'PDF आयात करें';

  @override
  String get lawEditText => 'पाठ बदलें';

  @override
  String get lawRead => 'पढ़ें';

  @override
  String get lawAddNote => 'टिप्पणी जोड़ें';

  @override
  String get lawSendToBoard => 'हाइलाइट बोर्ड पर रखें';

  @override
  String get lawSamples => 'नमूना धाराएँ';

  @override
  String get lawReaderEmpty =>
      'किसी अधिनियम या निर्णय का पाठ चिपकाएँ, या PDF आयात करें। फिर किसी अनुच्छेद को हाइलाइट करने के लिए उस पर टैप करें।';

  @override
  String get lawNoText =>
      'इस PDF में कोई पाठ नहीं मिला। यह स्कैन की गई प्रति हो सकती है।';

  @override
  String get lawNothingHighlighted => 'पहले कोई अनुच्छेद हाइलाइट करें';

  @override
  String get lawCaseBrief => 'केस ब्रीफ़';

  @override
  String get lawIrac => 'IRAC ढाँचा';

  @override
  String get lawTimeline => 'घटनाओं की समयरेखा';

  @override
  String get lawTimelineHint => 'हर पंक्ति में एक घटना: तारीख, फिर क्या हुआ';

  @override
  String get lawArgumentMap => 'तर्क मानचित्र';

  @override
  String get lawFrames => 'ढाँचे';

  @override
  String get stData => 'आँकड़े';

  @override
  String get stDataHint => 'संख्याएँ, स्पेस, अल्पविराम या नई पंक्ति से अलग';

  @override
  String get stDescriptive => 'वर्णनात्मक सांख्यिकी';

  @override
  String get stBoxPlot => 'बॉक्स प्लॉट';

  @override
  String get stHistogram => 'आयतचित्र';

  @override
  String get stDistributions => 'प्रायिकता बंटन';

  @override
  String get stNormal => 'प्रसामान्य';

  @override
  String get stBinomial => 'द्विपद';

  @override
  String get stPoisson => 'प्वासों';

  @override
  String get stT => 't';

  @override
  String get stChiSquare => 'काई-वर्ग';

  @override
  String get stMean => 'माध्य (μ)';

  @override
  String get stSd => 'मानक विचलन (σ)';

  @override
  String get stTrials => 'परीक्षण (n)';

  @override
  String get stProbability => 'सफलता की प्रायिकता (p)';

  @override
  String get stLambda => 'माध्य (λ)';

  @override
  String get stDf => 'स्वातंत्र्य कोटि';

  @override
  String get stFrom => 'से';

  @override
  String get stTo => 'तक';

  @override
  String get stRegression => 'सहसंबंध और प्रतीपगमन';

  @override
  String get stPairsHint => 'हर पंक्ति में एक जोड़ी: x, y';

  @override
  String get stTests => 'परिकल्पना परीक्षण';

  @override
  String get stZTest => 'z परीक्षण (एक माध्य)';

  @override
  String get stTTest1 => 't परीक्षण (एक माध्य)';

  @override
  String get stTTest2 => 't परीक्षण (दो माध्य)';

  @override
  String get stChiTest => 'काई-वर्ग परीक्षण';

  @override
  String get stAnova => 'एकमार्गी ANOVA';

  @override
  String get stSampleMean => 'प्रतिदर्श माध्य (x̄)';

  @override
  String get stSampleSize => 'प्रतिदर्श आकार (n)';

  @override
  String get stMu0 => 'परिकल्पित माध्य (μ₀)';

  @override
  String get stAlpha => 'सार्थकता स्तर (α)';

  @override
  String get stSample1 => 'प्रतिदर्श 1';

  @override
  String get stSample2 => 'प्रतिदर्श 2';

  @override
  String get stObservedHint =>
      'प्रेक्षित बारंबारताएँ, हर पंक्ति में एक पंक्ति (एक पंक्ति हो तो उपयुक्तता परीक्षण)';

  @override
  String get stExpectedHint =>
      'अपेक्षित बारंबारताएँ (बराबर के लिए खाली छोड़ें)';

  @override
  String get stGroupsHint => 'हर पंक्ति में एक समूह';

  @override
  String get stIndex => 'सूचकांक';

  @override
  String get stIndexHint => 'हर पंक्ति में एक वस्तु: p₀, q₀, p₁, q₁';

  @override
  String get stMovingAverage => 'चल माध्य';

  @override
  String get stPeriod => 'अवधि';

  @override
  String get stSeriesHint => 'समय के क्रम में मान';

  @override
  String get stDrawChart => 'चार्ट भी बनाएँ';

  @override
  String get sheetTitle => 'स्प्रेडशीट';

  @override
  String get sheetCellHint => 'संख्या, शब्द, या =SUM(B2:B6) जैसा सूत्र';

  @override
  String get sheetAddRow => 'पंक्ति जोड़ें';

  @override
  String get sheetAddColumn => 'स्तंभ जोड़ें';

  @override
  String get sheetRemoveRow => 'अंतिम पंक्ति हटाएँ';

  @override
  String get sheetRemoveColumn => 'अंतिम स्तंभ हटाएँ';

  @override
  String get sheetHeading => 'पहली पंक्ति शीर्षक है';

  @override
  String get sheetFormat => 'स्तंभ का प्रारूप';

  @override
  String get fmtGeneral => 'सामान्य';

  @override
  String get fmtNumber => '1,23,456.00';

  @override
  String get fmtInr => '₹ (भारतीय)';

  @override
  String get fmtLakh => '₹ लाख';

  @override
  String get fmtCrore => '₹ करोड़';

  @override
  String get fmtPercent => 'प्रतिशत';

  @override
  String get sheetChart => 'चार्ट';

  @override
  String get chartNone => 'कोई चार्ट नहीं';

  @override
  String get chartBar => 'स्तंभ';

  @override
  String get chartLine => 'रेखा';

  @override
  String get chartPie => 'पाई';

  @override
  String get sheetLabels => 'लेबल (जैसे A2:A6)';

  @override
  String get sheetValues => 'मान (जैसे B2:B6)';

  @override
  String get fingerTapsTitle => 'उँगलियों से टैप';

  @override
  String get fingerTapsHint =>
      'बोर्ड पर दो उँगलियों से टैप करें तो अनडू, तीन उँगलियों से टैप करें तो रीडू।';

  @override
  String get helpErase3 =>
      'या बोर्ड पर दो उँगलियों से टैप करें (अनडू); तीन उँगलियों से रीडू।';

  @override
  String get toolMore => 'और';

  @override
  String get appThemeTitle => 'ऐप थीम';

  @override
  String get appThemeHint =>
      'टूलबार, पैनल और डायलॉग के रंग, डिवाइस कोई भी हो। चॉकबोर्ड हरा बोर्ड को भी हरा कर देता है।';

  @override
  String get themeLight => 'हल्का';

  @override
  String get themeDark => 'गहरा';

  @override
  String get themeChalkboard => 'चॉकबोर्ड हरा';

  @override
  String get themeSystem => 'सिस्टम जैसा';

  @override
  String get clearBoardTitle => 'बोर्ड साफ़ करें?';

  @override
  String get clearBoardBody =>
      'आयात किए गए पेजों के चित्र बने रहते हैं। अनडू से सब वापस आ जाता है।';

  @override
  String get clearAllPages => 'सभी पेज साफ़ करें';

  @override
  String get clearedPage => 'पेज साफ़ हो गया';

  @override
  String get clearedAllPages => 'सभी पेज साफ़ हो गए';

  @override
  String get calcCannotWorkOut => 'इसकी गणना नहीं हो सकती';

  @override
  String get screenshotSaved => 'बोर्ड की तस्वीर सहेजी गई';

  @override
  String screenshotFailed(String error) {
    return 'तस्वीर सहेजी नहीं जा सकी: $error';
  }

  @override
  String get touchLocked => 'टच लॉक है';

  @override
  String get touchUnlockHold => 'अनलॉक करने के लिए दबाकर रखें';

  @override
  String get aiListening => 'सुन रहा है… रोकने के लिए टैप करें';

  @override
  String get aiVoiceUnavailable =>
      'इस डिवाइस पर आवाज़ से सवाल पूछना उपलब्ध नहीं है, या माइक्रोफ़ोन बंद है।';

  @override
  String aiVoiceLanguage(String language) {
    return '$language में बोली पहचान इस डिवाइस पर अभी नहीं है: डिवाइस की वॉइस टाइपिंग (ऑफ़लाइन स्पीच) सेटिंग में जोड़ें।';
  }

  @override
  String get aiVoiceNothingHeard => 'कुछ सुनाई नहीं दिया। माइक दबाकर बोलें।';

  @override
  String get booksAskAiChapter => 'KINETIX AI से समझने के लिए टैप करें';

  @override
  String get signInNeedsEnrolment =>
      'यह बोर्ड आपके संस्थान में पंजीकृत होने के बाद साइन इन काम करता है।';

  @override
  String get attendanceNeedsClass =>
      'हाज़िरी छात्र सूची वाली समय-सारिणी की कक्षा के साथ खुलती है।';

  @override
  String get aiPenMeasureShapes => 'नई आकृतियों पर माप दिखाएँ';

  @override
  String get aiPenMeasureShapesHint =>
      'आकृति बनाते ही लंबाई, कोण, त्रिज्या और क्षेत्रफल। हर आकृति के माप उसे चुनकर दिखाए या छिपाए जा सकते हैं।';

  @override
  String get measureUnits => 'इकाई';

  @override
  String get measureUnitCm => 'सेमी';

  @override
  String get measureUnitPx => 'px';

  @override
  String get selLineWidth => 'रेखा की मोटाई';

  @override
  String get selLineStyle => 'रेखा का प्रकार';

  @override
  String get selLineSolid => 'ठोस';

  @override
  String get selLineDashed => 'डैश वाली';

  @override
  String get selLineDotted => 'बिंदुदार';

  @override
  String get selShowMeasurements => 'माप दिखाएँ';

  @override
  String get selHideMeasurements => 'माप छिपाएँ';

  @override
  String get selMeasureOptions => 'माप';

  @override
  String get selMeasureLengths => 'लंबाई';

  @override
  String get selMeasureAngles => 'कोण';

  @override
  String get selMeasureRadius => 'त्रिज्या';

  @override
  String get selMeasureArea => 'क्षेत्रफल';

  @override
  String get selEditPoints => 'बिंदु बदलें';

  @override
  String get selArrowHeads => 'तीर के सिरे';

  @override
  String get selArrowNone => 'कोई सिरा नहीं';

  @override
  String get selArrowEnd => 'अंत में';

  @override
  String get selArrowStart => 'शुरू में';

  @override
  String get selArrowBoth => 'दोनों सिरों पर';

  @override
  String get selArrowFilled => 'भरे हुए सिरे';

  @override
  String get selFlipH => 'बाएँ-दाएँ पलटें';

  @override
  String get selFlipV => 'ऊपर-नीचे पलटें';

  @override
  String get selAlign => 'संरेखित करें';

  @override
  String get selAlignLeft => 'बाएँ किनारे';

  @override
  String get selAlignCentre => 'बीच में';

  @override
  String get selAlignRight => 'दाएँ किनारे';

  @override
  String get selAlignTop => 'ऊपरी किनारे';

  @override
  String get selAlignMiddle => 'बीचों-बीच';

  @override
  String get selAlignBottom => 'निचले किनारे';

  @override
  String get selLock => 'लॉक करें';

  @override
  String get selUnlock => 'अनलॉक करें';

  @override
  String get selKeepProportions => 'अनुपात बनाए रखें';

  @override
  String get selMore => 'और';

  @override
  String get clearThisPageTitle => 'यह पेज साफ़ करें?';

  @override
  String clearAllPagesTitle(int count) {
    return 'सभी $count पेज साफ़ करें?';
  }

  @override
  String get aiPenModelsTitle => 'AI पेन तैयार करें?';

  @override
  String get aiPenModelsBody =>
      'AI पेन इसी डिवाइस पर लिखावट, गणित और आकृतियाँ पढ़ता है। इसके मॉडल एक बार डाउनलोड करें (हर एक कुछ MB); उसके बाद ये बिना इंटरनेट के चलते हैं, और कोई लिखावट डिवाइस से बाहर नहीं जाती।';

  @override
  String get aiPenModelShapes => 'आकृतियाँ';

  @override
  String aiPenModelHandwriting(String language) {
    return '$language लिखावट';
  }

  @override
  String aiPenModelsStep(String name, int step, int count) {
    return '$name डाउनलोड हो रहा है ($count में से $step)…';
  }

  @override
  String get aiPenModelsReady =>
      'AI पेन तैयार है: लिखावट, गणित और आकृतियाँ अब बदलती हैं।';
}
