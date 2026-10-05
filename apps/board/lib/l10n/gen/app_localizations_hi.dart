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
  String get soon => 'जल्द';

  @override
  String comingSoonFeature(String feature) {
    return '$feature जल्द ही अगले अपडेट में आ रहा है।';
  }

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
  String minutesShort(int minutes) {
    return '$minutes मिनट';
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
  String get signInUnregistered => 'बिना पंजीकरण वाले बोर्ड पर साइन इन';

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
  String get attendanceWithoutClass => 'बिना समय-सारणी वाली कक्षा में उपस्थिति';

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
  String get splitDocument => 'PDF / PPT';

  @override
  String get splitVideo => 'वीडियो';

  @override
  String get splitWeb => 'वेब पेज';

  @override
  String get splitModel3d => '3D मॉडल';

  @override
  String get splitLab => 'वर्चुअल लैब';

  @override
  String viewerComingSoon(String viewer) {
    return '$viewer व्यूअर जल्द ही अगले अपडेट में आ रहा है।';
  }

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
  String aiToolSoon(String tool) {
    return 'KINETIX AI $tool';
  }

  @override
  String get aiAskHint => 'किसी भी विषय-वस्तु के बारे में पूछें';

  @override
  String aiAskHintClass(String classLabel) {
    return '$classLabel के बारे में कुछ भी पूछें';
  }

  @override
  String get aiSpeak => 'बोलें';

  @override
  String get aiVoiceQuestions => 'बोलकर सवाल पूछना';

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
  String get aiSummary => 'सारांश';

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
  String get aiWikipedia => 'विकिपीडिया';

  @override
  String get aiDictionary => 'शब्दकोश';

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
  String get booksNotesSoon => 'नोट्स जल्द आ रहे हैं';

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
}
