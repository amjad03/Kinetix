// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Hindi (`hi`).
class AppLocalizationsHi extends AppLocalizations {
  AppLocalizationsHi([String locale = 'hi']) : super(locale);

  @override
  String get appTitle => 'KINETIX Teacher';

  @override
  String get cancel => 'रद्द करें';

  @override
  String get save => 'सहेजें';

  @override
  String get send => 'भेजें';

  @override
  String get share => 'साझा करें';

  @override
  String get done => 'हो गया';

  @override
  String get retry => 'फिर से कोशिश करें';

  @override
  String get remove => 'हटाएँ';

  @override
  String get clear => 'साफ़ करें';

  @override
  String get profile => 'प्रोफ़ाइल';

  @override
  String get discardTitle => 'बदलाव छोड़ दें?';

  @override
  String get discardMarksBody => 'आपके कुछ अंक अभी सहेजे नहीं गए हैं।';

  @override
  String get keepEditing => 'बदलाव जारी रखें';

  @override
  String get discard => 'छोड़ दें';

  @override
  String get today => 'आज';

  @override
  String get tomorrow => 'कल';

  @override
  String get yesterday => 'कल';

  @override
  String greetingMorning(String name) {
    return 'सुप्रभात, $name';
  }

  @override
  String greetingAfternoon(String name) {
    return 'नमस्ते, $name';
  }

  @override
  String greetingEvening(String name) {
    return 'शुभ संध्या, $name';
  }

  @override
  String get navToday => 'आज';

  @override
  String get navHomework => 'होमवर्क';

  @override
  String get navMarks => 'अंक';

  @override
  String get navMessages => 'संदेश';

  @override
  String get navRecordings => 'रिकॉर्डिंग';

  @override
  String get assignHomework => 'होमवर्क दें';

  @override
  String get newAssessment => 'नया मूल्यांकन';

  @override
  String get newMessage => 'नया संदेश';

  @override
  String get signInTitle => 'साइन इन';

  @override
  String get signInButton => 'साइन इन करें';

  @override
  String get signInSubtitle => 'अपने संस्थान से मिला अकाउंट इस्तेमाल करें';

  @override
  String get institutionCode => 'संस्थान कोड';

  @override
  String get institutionCodeHint => 'उदा. demo-college';

  @override
  String get emailOrPhone => 'ईमेल या फ़ोन';

  @override
  String get password => 'पासवर्ड';

  @override
  String get showPassword => 'पासवर्ड दिखाएँ';

  @override
  String get hidePassword => 'पासवर्ड छिपाएँ';

  @override
  String get serverAddress => 'सर्वर का पता';

  @override
  String serverLabel(String address) {
    return 'सर्वर: $address';
  }

  @override
  String get enterInstitutionCode => 'अपना संस्थान कोड डालें';

  @override
  String get institutionCodeChars => 'केवल अंग्रेज़ी अक्षर, नंबर और हाइफ़न (-) इस्तेमाल करें';

  @override
  String get enterEmailOrPhone => 'अपना ईमेल या फ़ोन नंबर डालें';

  @override
  String get invalidEmail => 'सही ईमेल पता डालें';

  @override
  String get invalidEmailOrPhone => 'सही ईमेल या 10 अंकों का फ़ोन नंबर डालें';

  @override
  String get enterPassword => 'अपना पासवर्ड डालें';

  @override
  String get invalidServer => 'https://api.kinetix.in जैसा सर्वर पता डालें';

  @override
  String get errorNotTeacher => 'यह ऐप शिक्षकों के लिए है। आपके अकाउंट में शिक्षक की भूमिका नहीं है।';

  @override
  String get errorOffline => 'KINETIX से कनेक्ट नहीं हो पा रहा। अपना इंटरनेट कनेक्शन और सर्वर का पता जाँचें।';

  @override
  String get errorTimeout => 'सर्वर जवाब देने में बहुत समय ले रहा है। फिर से कोशिश करें।';

  @override
  String get errorForbidden => 'आपको इसकी अनुमति नहीं है।';

  @override
  String get errorNotFound => 'नहीं मिला।';

  @override
  String get errorTooManyAttempts => 'बहुत ज़्यादा कोशिशें हो गईं। एक मिनट रुककर फिर से कोशिश करें।';

  @override
  String errorGeneric(int status) {
    return 'कुछ गड़बड़ हो गई ($status)। फिर से कोशिश करें।';
  }

  @override
  String get errorSessionExpired => 'आपका साइन इन समाप्त हो गया है। फिर से साइन इन करें।';

  @override
  String get errorWrongLogin => 'संस्थान कोड, लॉगिन या पासवर्ड गलत है';

  @override
  String get errorCodeExpired => 'यह कोड गलत है या इसकी समय-सीमा खत्म हो गई है। बोर्ड पर दिख रहा नया कोड डालें।';

  @override
  String get errorAccountInactive => 'आपका अकाउंट सक्रिय नहीं है';

  @override
  String get errorOtherCampus => 'आप उस कैंपस के शिक्षक नहीं हैं जिसका यह बोर्ड है';

  @override
  String get errorNotPairingQr => 'यह KINETIX बोर्ड का QR कोड नहीं है';

  @override
  String get errorFutureAttendance => 'आने वाली तारीख की उपस्थिति अभी नहीं ली जा सकती';

  @override
  String get errorNotYourClass => 'आप यह कक्षा नहीं पढ़ाते';

  @override
  String get errorSubjectNotInClass => 'यह विषय इस कक्षा में नहीं पढ़ाया जाता';

  @override
  String get errorDueDatePassed => 'जमा करने की तारीख निकल चुकी है';

  @override
  String get errorEnterMarksFirst => 'प्रकाशित करने से पहले अंक डालें';

  @override
  String get errorStudentsNotInClass => 'कुछ विद्यार्थी इस कक्षा में नहीं हैं';

  @override
  String get errorRecordingUploading => 'रिकॉर्डिंग अभी अपलोड हो रही है';

  @override
  String get errorRecordingNoClass => 'यह रिकॉर्डिंग किसी कक्षा के साथ नहीं बनी थी, इसलिए इसे किसी के साथ साझा नहीं किया जा सकता';

  @override
  String get recordingNotAvailable => 'यह रिकॉर्डिंग अभी उपलब्ध नहीं है। हो सकता है यह अभी बोर्ड से अपलोड हो रही हो।';

  @override
  String get connectToBoard => 'बोर्ड से कनेक्ट करें';

  @override
  String get connectToBoardBody => 'पढ़ाना शुरू करने के लिए कक्षा के बोर्ड पर दिख रहा QR कोड स्कैन करें';

  @override
  String get connect => 'कनेक्ट करें';

  @override
  String get connected => 'कनेक्टेड';

  @override
  String get endClass => 'कक्षा खत्म करें';

  @override
  String get endClassTitle => 'कक्षा खत्म करें?';

  @override
  String endClassBody(String board) {
    return '$board आपको साइन आउट कर देगा और कनेक्ट करने वाली स्क्रीन पर लौट जाएगा।';
  }

  @override
  String classEnded(String board) {
    return '$board पर कक्षा खत्म हो गई';
  }

  @override
  String noClassesOn(String weekday) {
    return '$weekday को कोई कक्षा नहीं है';
  }

  @override
  String showDay(String day) {
    return '$day दिखाएँ';
  }

  @override
  String get todaysClasses => 'आज की कक्षाएँ';

  @override
  String weekdayClasses(String weekday) {
    return '$weekday की कक्षाएँ';
  }

  @override
  String classesOn(String date) {
    return '$date की कक्षाएँ';
  }

  @override
  String get noClassesToday => 'आज कोई कक्षा नहीं है';

  @override
  String periodCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count पीरियड', one: '1 पीरियड');
    return '$_temp0';
  }

  @override
  String get attendanceTaken => 'उपस्थिति ली गई';

  @override
  String get attendanceOpensOnDay => 'उपस्थिति उसी दिन ली जा सकेगी';

  @override
  String get takeAttendance => 'उपस्थिति लें';

  @override
  String get now => 'अभी';

  @override
  String get teachOnBoard => 'बोर्ड पर पढ़ाएँ';

  @override
  String get attendance => 'उपस्थिति';

  @override
  String get statusPresent => 'उपस्थित';

  @override
  String get statusAbsent => 'अनुपस्थित';

  @override
  String get statusLate => 'देर से';

  @override
  String get statusExcused => 'छुट्टी';

  @override
  String countPresent(int count) {
    return '$count उपस्थित';
  }

  @override
  String countAbsent(int count) {
    return '$count अनुपस्थित';
  }

  @override
  String countLate(int count) {
    return '$count देर से';
  }

  @override
  String countExcused(int count) {
    return '$count छुट्टी पर';
  }

  @override
  String attendanceSaved(String summary) {
    return 'उपस्थिति सहेजी गई · $summary';
  }

  @override
  String attendanceUpdated(String summary) {
    return 'उपस्थिति अपडेट हो गई · $summary';
  }

  @override
  String get markAllPresent => 'सभी उपस्थित';

  @override
  String get noStudentsInClass => 'इस कक्षा में अभी कोई विद्यार्थी नहीं है';

  @override
  String get attendanceAlreadyTaken => 'उपस्थिति पहले ही ली जा चुकी है। बदलाव करने पर पहले वाली उपस्थिति बदल जाएगी।';

  @override
  String get attendanceHelp => 'सभी पहले से उपस्थित हैं। अनुपस्थित करने के लिए टैप करें, देर से आने के लिए दबाकर रखें।';

  @override
  String get update => 'अपडेट करें';

  @override
  String get submit => 'जमा करें';

  @override
  String get enterAllDigits => 'बोर्ड पर दिख रहे सभी 6 अंक डालें';

  @override
  String get enterCodeTitle => 'बोर्ड पर दिख रहा कोड डालें';

  @override
  String get enterCodeBody => 'यह QR कोड के नीचे लिखा 6 अंकों का नंबर है। हर 2 मिनट में नया कोड आता है।';

  @override
  String get scanInstead => 'इसके बजाय QR कोड स्कैन करें';

  @override
  String get youreConnected => 'आप कनेक्ट हो गए हैं';

  @override
  String boardReady(String board) {
    return '$board आपके लिए तैयार है';
  }

  @override
  String boardShowingClass(String board) {
    return '$board पर आपकी कक्षा खुल गई है';
  }

  @override
  String get labelBoard => 'बोर्ड';

  @override
  String get labelClass => 'कक्षा';

  @override
  String get labelSubject => 'विषय';

  @override
  String get labelPeriod => 'पीरियड';

  @override
  String get freeSession => 'खुला सेशन';

  @override
  String get freeSessionBody =>
      'अभी टाइमटेबल में आपकी कोई कक्षा नहीं है, इसलिए बोर्ड बिना विद्यार्थियों की सूची के खुलेगा। 2 घंटे बाद आप अपने-आप साइन आउट हो जाएँगे।';

  @override
  String get qrNotOurs => 'यह KINETIX बोर्ड का कोड नहीं है। बोर्ड की स्क्रीन पर दिख रहा QR कोड स्कैन करें।';

  @override
  String get scanTitle => 'बोर्ड का QR कोड स्कैन करें';

  @override
  String get torch => 'टॉर्च';

  @override
  String get cameraDenied => 'स्कैन करने के लिए सेटिंग्स में कैमरे की अनुमति दें, या इसके बजाय कोड डालें।';

  @override
  String get cameraUnavailable => 'कैमरा उपलब्ध नहीं है। इसके बजाय कोड डालें।';

  @override
  String get pointCamera => 'कैमरे को बोर्ड पर दिख रहे QR कोड की ओर करें';

  @override
  String get enterCodeInstead => 'इसके बजाय कोड डालें';

  @override
  String get dueDate => 'जमा करने की तारीख';

  @override
  String get assign => 'दें';

  @override
  String get noClassesInTimetable => 'आपके टाइमटेबल में अभी कोई कक्षा नहीं है';

  @override
  String get chooseSubject => 'विषय चुनें';

  @override
  String get titleLabel => 'शीर्षक';

  @override
  String get homeworkTitleHint => 'उदा. अभ्यास 4.2, प्रश्न 1–5';

  @override
  String get homeworkTitleRequired => 'होमवर्क का शीर्षक लिखें';

  @override
  String get instructionsOptional => 'निर्देश (वैकल्पिक)';

  @override
  String homeworkAssigned(String className) {
    return '$className को होमवर्क दिया गया';
  }

  @override
  String get noHomework => 'अभी कोई होमवर्क नहीं है।\nकिसी कक्षा को होमवर्क दें, वह यहाँ दिखेगा।';

  @override
  String get dueToday => 'जमा: आज';

  @override
  String get dueTomorrow => 'जमा: कल';

  @override
  String dueOn(String date) {
    return 'जमा: $date';
  }

  @override
  String get wasDueYesterday => 'कल जमा होना था';

  @override
  String wasDueOn(String date) {
    return '$date को जमा होना था';
  }

  @override
  String get heldOn => 'तारीख';

  @override
  String get enterMaxMarks => 'अधिकतम अंक डालें';

  @override
  String get maxMustBePositive => '0 से ज़्यादा होना चाहिए';

  @override
  String get maxAtMost1000 => 'ज़्यादा से ज़्यादा 1000';

  @override
  String get create => 'बनाएँ';

  @override
  String get assessmentTitleHint => 'उदा. यूनिट टेस्ट 2: Redemption of shares';

  @override
  String get assessmentTitleRequired => 'शीर्षक लिखें';

  @override
  String get kind => 'प्रकार';

  @override
  String get outOf => 'कुल अंक';

  @override
  String get marksPrivateNote =>
      'प्रकाशित करने तक अंक सिर्फ़ आपको दिखेंगे। उसके बाद विद्यार्थी और उनके अभिभावक अपने अंक और कक्षा का औसत देख सकेंगे।';

  @override
  String get kindTest => 'टेस्ट';

  @override
  String get kindAssignment => 'असाइनमेंट';

  @override
  String get kindInternal => 'आंतरिक';

  @override
  String get kindExam => 'परीक्षा';

  @override
  String get kindPractical => 'प्रैक्टिकल';

  @override
  String noAssessments(String className) {
    return '$className के लिए अभी कोई टेस्ट या असाइनमेंट नहीं है।\nएक जोड़ें, अंक डालें और अभिभावकों के लिए प्रकाशित करें।';
  }

  @override
  String get published => 'प्रकाशित';

  @override
  String get draft => 'ड्राफ़्ट';

  @override
  String get classAverage => 'कक्षा का औसत';

  @override
  String noMarksYet(String max) {
    return 'अभी कोई अंक नहीं · कुल $max';
  }

  @override
  String enteredOf(int entered, int total) {
    return '$total में से $entered दर्ज';
  }

  @override
  String enteredCount(int entered) {
    return '$entered दर्ज';
  }

  @override
  String get notANumber => 'नंबर नहीं है';

  @override
  String maxN(String max) {
    return 'अधिकतम $max';
  }

  @override
  String marksNeedFixing(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count अंक ठीक करने हैं', one: 'एक अंक ठीक करना है');
    return '$_temp0';
  }

  @override
  String markedOf(int marked, int total) {
    return '$total में से $marked के अंक दर्ज';
  }

  @override
  String get marksSaved => 'अंक सहेजे गए';

  @override
  String savedClassAverage(String average, String max) {
    return 'कक्षा का औसत $average / $max';
  }

  @override
  String get familiesSeeUpdate => 'अभिभावकों को बदलाव दिखेगा';

  @override
  String get publishTitle => 'अंक प्रकाशित करें?';

  @override
  String get publishBody =>
      'कक्षा के विद्यार्थियों और अभिभावकों को सूचना मिलेगी। वे अपने अंक, कक्षा का औसत और सबसे ज़्यादा अंक देख सकेंगे।';

  @override
  String publishBlank(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count विद्यार्थियों के अभी कोई अंक नहीं हैं।',
      one: '1 विद्यार्थी के अभी कोई अंक नहीं हैं।',
    );
    return '$_temp0';
  }

  @override
  String get publishCanCorrect => 'प्रकाशित करने के बाद भी आप अंक ठीक कर सकते हैं।';

  @override
  String get publish => 'प्रकाशित करें';

  @override
  String publishedNotified(String title) {
    return '$title प्रकाशित · अभिभावकों को सूचना भेजी गई';
  }

  @override
  String get statAverage => 'औसत';

  @override
  String get statHighest => 'सबसे ज़्यादा';

  @override
  String get statLowest => 'सबसे कम';

  @override
  String get statMarked => 'दर्ज';

  @override
  String typeMarksHint(String max) {
    return '$max में से अंक लिखें। कीपैड का Next बटन अगले विद्यार्थी पर ले जाता है।';
  }

  @override
  String get columnStudent => 'विद्यार्थी';

  @override
  String outOfN(String max) {
    return 'कुल $max';
  }

  @override
  String get editRemark => 'टिप्पणी बदलें';

  @override
  String get addRemark => 'टिप्पणी जोड़ें';

  @override
  String get absentShort => 'अनु';

  @override
  String marksOverMax(int count, String max) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count अंक $max से ज़्यादा हैं',
      one: 'एक अंक $max से ज़्यादा है',
    );
    return '$_temp0';
  }

  @override
  String get notSavedYet => 'अभी सहेजा नहीं गया';

  @override
  String get publishedFamiliesSee => 'प्रकाशित · अभिभावक ये अंक देख सकते हैं';

  @override
  String get typeMarksThenSave => 'अंक लिखें, फिर सहेजें';

  @override
  String get savedOnlyYou => 'सहेजा गया · ये अंक सिर्फ़ आपको दिखते हैं';

  @override
  String remarkFor(String name) {
    return '$name के लिए टिप्पणी';
  }

  @override
  String get remarkFamiliesSee => 'अभिभावक इसे अंकों के साथ देखेंगे।';

  @override
  String get remarkHint => 'उदा. साफ़-सुथरा काम; जर्नल एंट्री दोहराएँ';

  @override
  String get noMessages =>
      'अभी कोई संदेश नहीं है।\n“नया संदेश” से किसी विद्यार्थी के अभिभावक को लिखें, या अभिभावकों के संदेश का इंतज़ार करें।';

  @override
  String get noMessagesPreview => 'अभी कोई संदेश नहीं';

  @override
  String aboutParent(String student, String className) {
    return '$student के अभिभावक · $className';
  }

  @override
  String aboutStudent(String className) {
    return 'विद्यार्थी · $className';
  }

  @override
  String get pullForEarlier => 'पुराने संदेशों के लिए नीचे खींचें';

  @override
  String chatTop(String student, String family) {
    return '$student के बारे में $family के साथ संदेश';
  }

  @override
  String get notSentRetry => 'नहीं भेजा गया · फिर से भेजने के लिए टैप करें';

  @override
  String get sending => 'भेजा जा रहा है…';

  @override
  String get messageCopied => 'संदेश कॉपी हो गया';

  @override
  String messageHint(String name) {
    return '$name को संदेश लिखें';
  }

  @override
  String writeToFamily(String student) {
    return '$student के परिवार को लिखें';
  }

  @override
  String get threadPrivacy => 'यह बातचीत आपके और आपके चुने हुए व्यक्ति के बीच है। स्कूल प्रबंधन इसे देख सकता है।';

  @override
  String get relationFather => 'पिता';

  @override
  String get relationMother => 'माता';

  @override
  String get relationGuardian => 'अभिभावक';

  @override
  String get relationParent => 'अभिभावक';

  @override
  String get searchStudents => 'नाम या रोल नंबर से खोजें';

  @override
  String get noStudentsTaught => 'आपकी कक्षाओं में अभी कोई विद्यार्थी नहीं है';

  @override
  String noStudentMatches(String query) {
    return '“$query” से मिलता कोई विद्यार्थी नहीं';
  }

  @override
  String get noGuardianOnRecord => 'कोई अभिभावक दर्ज नहीं है';

  @override
  String get shareTitle => 'कक्षा के साथ साझा करें?';

  @override
  String shareBody(String className, String title) {
    return '$className के विद्यार्थी और उनके अभिभावक अपने ऐप में \"$title\" देख सकेंगे। अनुपस्थित विद्यार्थियों के अभिभावकों को सूचना मिलेगी।';
  }

  @override
  String sharedWith(String className) {
    return '$className के साथ साझा किया गया';
  }

  @override
  String get noRecordings =>
      'अभी कोई रिकॉर्डिंग नहीं है।\nकक्षा के दौरान बोर्ड पर रिकॉर्ड बटन दबाएँ। बोर्ड के अपलोड करते ही पाठ यहाँ दिखेगा।';

  @override
  String get uploading => 'अपलोड हो रही है';

  @override
  String get sharedWithClass => 'कक्षा के साथ साझा';

  @override
  String get noClass => 'कोई कक्षा नहीं';

  @override
  String get notShared => 'साझा नहीं';

  @override
  String get preparingTranscript => 'ट्रांसक्रिप्ट तैयार हो रही है';

  @override
  String get transcriptReady => 'ट्रांसक्रिप्ट तैयार';

  @override
  String get noTranscript => 'ट्रांसक्रिप्ट नहीं';

  @override
  String get noSound => 'आवाज़ नहीं';

  @override
  String get notLinkedToClass => 'किसी कक्षा से जुड़ी नहीं';

  @override
  String get play => 'चलाएँ';

  @override
  String get shareWithClass => 'कक्षा के साथ साझा करें';

  @override
  String get durationUnderMinute => 'एक मिनट से कम';

  @override
  String durationMinutes(int minutes) {
    return '$minutes मिनट';
  }

  @override
  String durationHours(int hours) {
    return '$hours घंटा';
  }

  @override
  String durationHoursMinutes(int hours, int minutes) {
    return '$hours घंटा $minutes मिनट';
  }

  @override
  String get signOutTitle => 'साइन आउट करें?';

  @override
  String get signOutBody => 'फिर से साइन इन करने के लिए आपको पासवर्ड चाहिए होगा।';

  @override
  String get signOut => 'साइन आउट करें';

  @override
  String comingLater(String feature) {
    return '$feature अगले अपडेट में आएगा';
  }

  @override
  String get account => 'अकाउंट';

  @override
  String get institution => 'संस्थान';

  @override
  String get language => 'भाषा';

  @override
  String get server => 'सर्वर';

  @override
  String get comingSoon => 'जल्द आ रहा है';

  @override
  String get announcements => 'घोषणाएँ';

  @override
  String get announcementsBody => 'अपनी कक्षाओं को सूचनाएँ भेजें';

  @override
  String get studentDoubts => 'विद्यार्थियों के संदेह';

  @override
  String get studentDoubtsBody => 'विद्यार्थियों के सवालों के जवाब दें';

  @override
  String get mcqTests => 'MCQ टेस्ट';

  @override
  String get mcqTestsBody => 'ऑनलाइन टेस्ट जो बोर्ड के क्विज़ से जुड़ते हैं';

  @override
  String get roleAdmin => 'एडमिन';

  @override
  String get rolePrincipal => 'प्रधानाचार्य';

  @override
  String get roleHod => 'विभागाध्यक्ष';

  @override
  String get roleTeacher => 'शिक्षक';

  @override
  String get roleStudent => 'विद्यार्थी';

  @override
  String get roleParent => 'अभिभावक';

  @override
  String get roleLibrarian => 'पुस्तकालयाध्यक्ष';

  @override
  String get roleAccountant => 'लेखाकार';

  @override
  String get languageSaveFailed => 'इस फ़ोन पर भाषा बदल गई है। अगली बार ऑनलाइन होने पर यह आपके अकाउंट में सहेज दी जाएगी।';

  @override
  String holidayNoClasses(String title) {
    return 'छुट्टी: $title। कोई कक्षा नहीं।';
  }

  @override
  String get teaching => 'पढ़ाई';

  @override
  String get calendar => 'कैलेंडर';

  @override
  String get calendarBody => 'छुट्टियाँ, परीक्षाएँ और कार्यक्रम';

  @override
  String get calendarHoliday => 'छुट्टी';

  @override
  String get calendarExam => 'परीक्षा';

  @override
  String get calendarEvent => 'कार्यक्रम';

  @override
  String get calendarEmpty => 'अगले छह महीनों के कैलेंडर में कुछ नहीं है।';

  @override
  String calendarFor(String programs) {
    return '$programs के लिए';
  }

  @override
  String get syllabus => 'पाठ्यक्रम';

  @override
  String get syllabusProgress => 'पाठ्यक्रम की प्रगति';

  @override
  String get syllabusProgressBody => 'हर कक्षा के लिए पढ़ाई गई विषय-वस्तु मार्क करें';

  @override
  String get syllabusUnlinked => 'यह विषय अभी किसी पाठ्यक्रम से नहीं जुड़ा है। आपके एडमिन इसे KINETIX ERP → Syllabus में जोड़ सकते हैं।';

  @override
  String topicsTaught(int covered, int total) {
    return '$total में से $covered विषय-वस्तु पढ़ाई गई';
  }

  @override
  String chapterTaught(int covered, int total) {
    return '$covered/$total';
  }

  @override
  String taughtOn(String date) {
    return '$date को पढ़ाया';
  }

  @override
  String taughtOnBy(String date, String name) {
    return '$date को पढ़ाया · $name';
  }

  @override
  String get taughtOnWhichDay => 'किस दिन पढ़ाया?';

  @override
  String get topicVideosTooltip => 'इस विषय के वीडियो';

  @override
  String get topicVideosTitle => 'इस कक्षा के लिए वीडियो';

  @override
  String get topicVideoLink => 'यूट्यूब लिंक';

  @override
  String get topicVideoLinkHelp =>
      'लिंक चिपकाएँ। शीर्षक यूट्यूब से आता है। प्राचार्य के साझा करने की मंज़ूरी तक केवल यही कक्षा इसे देखती है।';

  @override
  String get topicVideoAdd => 'वीडियो जोड़ें';

  @override
  String get topicVideoAdded => 'इस कक्षा के लिए वीडियो जोड़ा गया';

  @override
  String get topicVideoNotAdded => 'वह वीडियो नहीं जोड़ा जा सका। लिंक जाँचकर फिर कोशिश करें।';

  @override
  String get topicVideoNone => 'आपने इस विषय में अभी कोई वीडियो नहीं जोड़ा।';

  @override
  String get topicVideoShare => 'सबके साथ साझा करने का अनुरोध करें';

  @override
  String get topicVideoShareSent => 'मंज़ूरी के लिए प्राचार्य को भेजा गया';

  @override
  String get topicVideoStatusNone => 'केवल यह कक्षा';

  @override
  String get topicVideoStatusPending => 'मंज़ूरी की प्रतीक्षा में';

  @override
  String get topicVideoStatusApproved => 'सबके साथ साझा';

  @override
  String get topicVideoStatusRejected => 'मंज़ूर नहीं हुआ';

  @override
  String get topicVideoRemove => 'वीडियो हटाएँ';

  @override
  String get topicMarked => 'पढ़ाया गया मार्क किया';

  @override
  String get topicUnmarked => 'नहीं पढ़ाया गया मार्क किया';

  @override
  String get noClassesAssigned => 'आप अभी कोई कक्षा नहीं पढ़ाते हैं।';

  @override
  String get submissions => 'जमा किया गया काम';

  @override
  String get statusHandedIn => 'जमा किया';

  @override
  String get statusChecked => 'जाँचा गया';

  @override
  String get statusReturned => 'लौटाया गया';

  @override
  String get statusNotHandedIn => 'जमा नहीं किया';

  @override
  String handedInAt(String when) {
    return '$when को जमा किया';
  }

  @override
  String get answer => 'उत्तर';

  @override
  String get photosAndFiles => 'फ़ोटो और फ़ाइलें';

  @override
  String get openPdf => 'PDF खोलें';

  @override
  String get couldNotOpenFile => 'यह फ़ाइल नहीं खुल सकी। PDF खोलने वाला कोई ऐप इंस्टॉल करें।';

  @override
  String get remarkOptional => 'टिप्पणी (वैकल्पिक)';

  @override
  String get reviewRemarkHint => 'उदा. अच्छा काम, या क्या दोबारा करना है';

  @override
  String get returnWork => 'दोबारा करने के लिए लौटाएँ';

  @override
  String get checkWork => 'जाँचा गया मार्क करें';

  @override
  String get reviewNotifies => 'विद्यार्थी और उनके अभिभावकों को आपकी टिप्पणी के साथ बताया जाएगा।';

  @override
  String workChecked(String name) {
    return '$name का होमवर्क जाँचा गया मार्क किया';
  }

  @override
  String workReturned(String name) {
    return '$name का होमवर्क दोबारा करने के लिए लौटाया';
  }

  @override
  String photoOf(int index, int count) {
    return 'फ़ोटो $index / $count';
  }

  @override
  String get errorNothingHandedIn => 'अभी तक कुछ जमा नहीं किया गया है';

  @override
  String get errorTopicNotInSyllabus => 'यह विषय-वस्तु इस विषय के पाठ्यक्रम में नहीं है';

  @override
  String get errorFutureCoverage => 'आने वाली तारीख पर विषय-वस्तु को पढ़ाया गया मार्क नहीं कर सकते';

  @override
  String get errorValidation => 'कुछ जानकारी सही नहीं है। जाँचकर फिर से कोशिश करें।';

  @override
  String get yearPlan => 'वार्षिक योजना';

  @override
  String get yearPlanNone =>
      'अभी कोई वार्षिक योजना नहीं है। KINETIX आपकी समय-सारिणी के अनुसार, छुट्टियाँ और परीक्षाएँ छोड़कर, इस विषय का पाठ्यक्रम सत्र के हफ़्तों में बाँट सकता है। बाद में आप विषय-वस्तु आगे-पीछे कर सकते हैं।';

  @override
  String get makeYearPlan => 'वार्षिक योजना बनाएँ';

  @override
  String get makePlan => 'योजना बनाएँ';

  @override
  String get remakeYearPlan => 'योजना दोबारा बनाएँ';

  @override
  String get remakeYearPlanTitle => 'वार्षिक योजना दोबारा बनाएँ?';

  @override
  String get remakeYearPlanBody =>
      'आपकी चुनी तारीखों से सभी हफ़्ते फिर से तय होंगे, और जो विषय-वस्तु आपने आगे-पीछे की थी वह वापस चली जाएगी। पढ़ाई जा चुकी विषय-वस्तु पढ़ाई गई ही रहेगी।';

  @override
  String get remake => 'दोबारा बनाएँ';

  @override
  String get planDatesNote => 'अगर आप तारीखें नहीं बदलते, तो योजना आज से 16 हफ़्तों की होगी, शैक्षणिक वर्ष के अंत तक।';

  @override
  String get planStartsOn => 'शुरू होने की तारीख';

  @override
  String get planEndsOn => 'खत्म होने की तारीख';

  @override
  String get yearPlanMade => 'वार्षिक योजना बन गई';

  @override
  String get yearPlanUpdated => 'योजना अपडेट हो गई';

  @override
  String get planNotStarted => 'शुरू नहीं हुई';

  @override
  String get planOnTrack => 'समय पर';

  @override
  String get planAhead => 'योजना से आगे';

  @override
  String planBehindBy(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count विषय-वस्तु पीछे', one: '1 विषय-वस्तु पीछे');
    return '$_temp0';
  }

  @override
  String weekOf(String date) {
    return '$date वाला हफ़्ता';
  }

  @override
  String get thisWeek => 'इस हफ़्ते';

  @override
  String periodsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count पीरियड', one: '1 पीरियड');
    return '$_temp0';
  }

  @override
  String get planLate => 'देर से';

  @override
  String get changeWeek => 'हफ़्ता या पीरियड बदलें';

  @override
  String get planWeek => 'हफ़्ता';

  @override
  String get planPeriods => 'पीरियड';

  @override
  String get fewerPeriods => 'कम पीरियड';

  @override
  String get morePeriods => 'ज़्यादा पीरियड';

  @override
  String get planLesson => 'योजना';

  @override
  String get lessonPlanned => 'योजना तैयार';

  @override
  String get lessonPlan => 'पाठ योजना';

  @override
  String get lessonTopics => 'विषय-वस्तु';

  @override
  String get noTopicsChosen => 'कोई विषय-वस्तु नहीं चुनी';

  @override
  String get chooseTopics => 'विषय-वस्तु चुनें';

  @override
  String get suggestedThisWeek => 'इस हफ़्ते की वार्षिक योजना में';

  @override
  String get lessonObjectives => 'उद्देश्य';

  @override
  String get objectiveHint => 'विद्यार्थी … कर पाएँगे';

  @override
  String get addObjective => 'उद्देश्य जोड़ें';

  @override
  String get lessonSteps => 'चरण';

  @override
  String get stepHint => 'इस चरण में क्या होगा';

  @override
  String get addStep => 'चरण जोड़ें';

  @override
  String get minutesShortLabel => 'मिनट';

  @override
  String stepsTotal(int planned, int length) {
    return '$length में से $planned मिनट';
  }

  @override
  String stepsOver(int planned, int length) {
    return '$planned मिनट, पीरियड $length का है';
  }

  @override
  String get moveUp => 'ऊपर ले जाएँ';

  @override
  String get moveDown => 'नीचे ले जाएँ';

  @override
  String get moreOptions => 'और विकल्प';

  @override
  String get lessonMaterials => 'सामग्री';

  @override
  String get materialHint => 'जैसे चार्ट पेपर, किताब पेज 42';

  @override
  String get addMaterial => 'सामग्री जोड़ें';

  @override
  String get lessonCheck => 'समझ की जाँच';

  @override
  String get lessonCheckHint => 'आप कैसे जाँचेंगे कि विद्यार्थियों ने क्या सीखा';

  @override
  String get lessonHomework => 'होमवर्क';

  @override
  String get lessonHomeworkHint => 'वैकल्पिक';

  @override
  String get draftWithAi => 'KINETIX AI से ड्राफ़्ट बनाएँ';

  @override
  String get drafting => 'KINETIX AI ड्राफ़्ट बना रहा है…';

  @override
  String get replaceWithDraftTitle => 'KINETIX AI के ड्राफ़्ट से बदलें?';

  @override
  String get replaceWithDraftBody => 'इस योजना की विषय-वस्तु, उद्देश्य, चरण, सामग्री और जाँच बदल जाएगी। आपका होमवर्क वैसा ही रहेगा।';

  @override
  String get replace => 'बदलें';

  @override
  String get aiDraftLabel => 'AI ड्राफ़्ट — इस्तेमाल से पहले जाँचें';

  @override
  String get aiPreviewNote => 'नमूना: KINETIX AI सर्वर जुड़ा नहीं है, इसलिए यह एक नमूना ड्राफ़्ट है।';

  @override
  String get savePlan => 'योजना सहेजें';

  @override
  String get lessonPlanSaved => 'पाठ योजना सहेजी गई';

  @override
  String reviewedOn(String date) {
    return '$date को समीक्षा हुई';
  }

  @override
  String get reviewRemark => 'विभागाध्यक्ष की टिप्पणी';

  @override
  String get discardPlanBody => 'आपकी पाठ योजना में ऐसे बदलाव हैं जो अभी सहेजे नहीं गए।';

  @override
  String get errorPlanNoSyllabus => 'इस विषय का अभी कोई पाठ्यक्रम नहीं है। अपने एडमिन से इसे किसी कोर्स से जोड़ने को कहें।';

  @override
  String get errorPlanNoPeriods => 'इस कक्षा की समय-सारिणी में इस विषय का कोई पीरियड नहीं है।';

  @override
  String get errorPlanNoTeachingDays => 'इन तारीखों के बीच पढ़ाई का कोई दिन नहीं है।';

  @override
  String get errorPlanEndsBeforeStart => 'खत्म होने की तारीख शुरू होने की तारीख के बाद होनी चाहिए।';

  @override
  String get errorPeriodNotOnDay => 'यह कक्षा उस दिन नहीं है।';

  @override
  String get errorAiAllowance => 'आपके संस्थान ने आज की KINETIX AI सीमा पूरी कर ली है। कल फिर से मिलेगी।';

  @override
  String get errorAiUnavailable => 'KINETIX AI अभी उपलब्ध नहीं है। एक मिनट बाद फिर से कोशिश करें।';

  @override
  String get errorAiUnusable => 'KINETIX AI काम का ड्राफ़्ट नहीं बना सका। फिर से कोशिश करें।';

  @override
  String reviewedByOn(String name, String date) {
    return '$name ने $date को समीक्षा की';
  }

  @override
  String get signInWithPhone => 'फ़ोन से साइन इन करें';

  @override
  String get signInWithPassword => 'पासवर्ड से साइन इन करें';

  @override
  String get phoneSignInSubtitle => 'हम आपके रजिस्टर्ड मोबाइल नंबर पर 6 अंकों का कोड भेजेंगे';

  @override
  String get mobileNumber => 'मोबाइल नंबर';

  @override
  String get enterMobileNumber => 'अपना मोबाइल नंबर डालें';

  @override
  String get invalidMobileNumber => 'सही 10 अंकों का मोबाइल नंबर डालें';

  @override
  String get sendCode => 'कोड भेजें';

  @override
  String otpSentTo(String phone) {
    return '$phone पर भेजा गया 6 अंकों का कोड डालें';
  }

  @override
  String get otpCode => 'साइन-इन कोड';

  @override
  String get enterOtp => '6 अंकों का कोड डालें';

  @override
  String resendCodeIn(String time) {
    return '$time में कोड दोबारा भेजें';
  }

  @override
  String get resendCode => 'कोड दोबारा भेजें';

  @override
  String get codeResent => 'नया कोड भेजा गया';

  @override
  String get changeNumber => 'नंबर बदलें';

  @override
  String get errorOtpInvalid => 'यह कोड गलत है या इसकी समय-सीमा खत्म हो गई है। SMS देखें या नया कोड मंगाएँ।';

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
  String get recordingKept => 'रखी गई';

  @override
  String recordingDeletedOn(String date) {
    return '$date को हटाई जाएगी';
  }

  @override
  String get keepRecording => 'रखें';

  @override
  String get dontKeepRecording => 'न रखें';

  @override
  String get keepRecordingTooltip => 'रखी गई रिकॉर्डिंग सत्र समाप्त होने पर नहीं हटाई जातीं';

  @override
  String get phoneRemote => 'फ़ोन रिमोट';

  @override
  String remoteTitle(String board) {
    return 'रिमोट · $board';
  }

  @override
  String get remoteEnded => 'इस बोर्ड पर कक्षा समाप्त हो गई है।';

  @override
  String get remotePhotoSent => 'फ़ोटो बोर्ड पर है।';

  @override
  String get remotePhotoFailed => 'फ़ोटो नहीं भेजी जा सकी। फिर कोशिश करें।';

  @override
  String get remotePages => 'बोर्ड के पेज';

  @override
  String get remotePrevious => 'पिछला';

  @override
  String get remoteNext => 'अगला';

  @override
  String remotePageOf(int page, int pages) {
    return 'पेज $page / $pages';
  }

  @override
  String get remoteSlides => 'स्लाइड और PDF';

  @override
  String get remoteNoSlides => 'यहाँ से बदलने के लिए बोर्ड पर स्लाइड या PDF खोलें।';

  @override
  String remoteSlideOf(int slide, int slides) {
    return 'स्लाइड $slide / $slides';
  }

  @override
  String get remotePointer => 'पॉइंटर';

  @override
  String get remotePointerHint => 'बोर्ड पर इंगित करने के लिए यहाँ उँगली चलाएँ';

  @override
  String get remoteClassroom => 'कक्षा उपकरण';

  @override
  String remoteTimerMinutes(int minutes) {
    return '$minutes मिनट टाइमर';
  }

  @override
  String get remoteTimerStop => 'टाइमर रोकें';

  @override
  String get remotePickStudent => 'विद्यार्थी चुनें';

  @override
  String get remoteShowPhoto => 'फ़ोटो दिखाएँ';

  @override
  String get remoteStartRecording => 'पाठ रिकॉर्ड करें';

  @override
  String get remoteStopRecording => 'रिकॉर्डिंग रोकें';

  @override
  String get answerCards => 'उत्तर कार्ड';

  @override
  String get answerCardsMenuBody => 'कार्ड प्रिंट करें ताकि बिना फ़ोन वाले विद्यार्थी बोर्ड पर उत्तर दे सकें';

  @override
  String get answerCardsBody =>
      'हर विद्यार्थी को रोल नंबर के अनुसार एक कार्ड मिलता है। बोर्ड पर \"कक्षा से पूछें\" में वे उत्तर को ऊपर रखकर कार्ड उठाते हैं, और बोर्ड एक फ़ोटो से पूरी कक्षा पढ़ लेता है।';

  @override
  String get answerCardsPrintHint => 'Hold the card with your answer at the top. Keep your fingers off the black pattern.';

  @override
  String answerCardsReady(int count, String className) {
    return '$className के $count कार्ड प्रिंट के लिए तैयार हैं।';
  }

  @override
  String get answerCardsFailed => 'कार्ड नहीं बन सके। फिर कोशिश करें।';

  @override
  String get print => 'प्रिंट';

  @override
  String get filterMissing => 'बाकी';

  @override
  String remindMissing(int count) {
    return '$count को याद दिलाएँ';
  }

  @override
  String remindTitle(int count) {
    return '$count विद्यार्थियों को याद दिलाएँ?';
  }

  @override
  String get remindBody => 'उन्हें और उनके परिवार को सूचना मिलेगी कि यह होमवर्क अभी जमा नहीं हुआ है।';

  @override
  String get remind => 'याद दिलाएँ';

  @override
  String reminded(int count) {
    return '$count विद्यार्थियों और उनके परिवारों को याद दिलाया गया';
  }

  @override
  String get noneInFilter => 'यहाँ कोई विद्यार्थी नहीं';

  @override
  String get classAndSubject => 'कक्षा और विषय';

  @override
  String get classRoster => 'कक्षा सूची';

  @override
  String get classRosterBody => 'आपके विद्यार्थी; बैज दें';

  @override
  String get chooseClass => 'कक्षा चुनें';

  @override
  String get driverMode => 'ड्राइवर मोड';

  @override
  String get driverModeBody => 'बस की यात्रा शुरू करें और बस की लोकेशन साझा करें';

  @override
  String get driverNoRoutes => 'आपको अभी कोई रूट नहीं मिला है। परिवहन कार्यालय से पूछें।';

  @override
  String get driverRoute => 'रूट';

  @override
  String get driverDirection => 'दिशा';

  @override
  String get driverPickup => 'पिकअप (स्कूल के लिए)';

  @override
  String get driverDrop => 'ड्रॉप (घर के लिए)';

  @override
  String get driverStart => 'यात्रा शुरू करें';

  @override
  String get driverEnd => 'यात्रा समाप्त करें';

  @override
  String get driverRunning => 'यात्रा चल रही है';

  @override
  String get driverTripEnded => 'यात्रा समाप्त हुई';

  @override
  String get driverNextStops => 'अगले स्टॉप';

  @override
  String get driverNoMoreStops => 'कोई और स्टॉप नहीं';

  @override
  String driverLastSent(Object time) {
    return 'लोकेशन $time बजे भेजी गई';
  }

  @override
  String get driverWaitingGps => 'GPS का इंतज़ार है...';

  @override
  String get driverLocationDenied => 'बस की लोकेशन साझा करने के लिए लोकेशन की अनुमति चाहिए। इसे सेटिंग्स में दें।';

  @override
  String get driverLocationOff => 'यात्रा शुरू करने के लिए फ़ोन की लोकेशन (GPS) चालू करें।';

  @override
  String get driverSendFailing => 'सर्वर से संपर्क नहीं हो पा रहा। कोशिश जारी है...';

  @override
  String get driverKeepOpen => 'बस चलते समय इस स्क्रीन को खुला रखें।';

  @override
  String driverVehicle(Object regNo) {
    return 'बस $regNo';
  }

  @override
  String get workSection => 'कार्य';

  @override
  String get leaveTitle => 'अवकाश';

  @override
  String get leaveBody => 'शेष, आवेदन और स्वीकृति';

  @override
  String get checkInTitle => 'उपस्थिति दर्ज करें';

  @override
  String get checkInBody => 'अपना दिन दर्ज करें और महीना देखें';

  @override
  String get payslipsTitle => 'वेतन पर्चियाँ';

  @override
  String get payslipsBody => 'आपकी मासिक वेतन पर्चियाँ';

  @override
  String get leaveMine => 'मेरा अवकाश';

  @override
  String get leaveApprovals => 'स्वीकृति के लिए';

  @override
  String get leaveBalances => 'शेष';

  @override
  String get leaveApply => 'अवकाश के लिए आवेदन';

  @override
  String get leaveType => 'अवकाश का प्रकार';

  @override
  String get leaveFrom => 'से';

  @override
  String get leaveTo => 'तक';

  @override
  String get leaveHalfDay => 'आधा दिन';

  @override
  String get leaveReason => 'कारण (वैकल्पिक)';

  @override
  String get leaveSubmit => 'जमा करें';

  @override
  String leaveDaysCount(String days) {
    return 'कार्य दिवस: $days';
  }

  @override
  String leaveAvailable(String days) {
    return '$days शेष';
  }

  @override
  String leaveDaysLabel(String days) {
    return '$days दिन';
  }

  @override
  String get leaveNone => 'अभी कोई अवकाश अनुरोध नहीं।';

  @override
  String get leaveNoApprovals => 'आपके निर्णय के लिए कुछ लंबित नहीं है।';

  @override
  String get leaveCancelAction => 'अनुरोध रद्द करें';

  @override
  String get leaveApprove => 'स्वीकृत करें';

  @override
  String get leaveReject => 'अस्वीकृत करें';

  @override
  String get leaveDecisionNote => 'टिप्पणी (वैकल्पिक)';

  @override
  String get leaveStatusPending => 'लंबित';

  @override
  String get leaveStatusApproved => 'स्वीकृत';

  @override
  String get leaveStatusRejected => 'अस्वीकृत';

  @override
  String get leaveStatusCancelled => 'रद्द';

  @override
  String get checkInButton => 'उपस्थित हों';

  @override
  String get checkOutButton => 'प्रस्थान दर्ज करें';

  @override
  String checkedInAt(String time) {
    return '$time बजे उपस्थिति दर्ज';
  }

  @override
  String checkedOutAt(String time) {
    return '$time बजे प्रस्थान दर्ज';
  }

  @override
  String get notCheckedIn => 'आपने आज उपस्थिति दर्ज नहीं की है।';

  @override
  String get attendanceMonth => 'यह महीना';

  @override
  String get attStatusPresent => 'उपस्थित';

  @override
  String get attStatusAbsent => 'अनुपस्थित';

  @override
  String get attStatusHalfDay => 'आधा दिन';

  @override
  String get attStatusOnLeave => 'अवकाश पर';

  @override
  String get payslipNet => 'शुद्ध वेतन';

  @override
  String get payslipGross => 'कुल';

  @override
  String get payslipEarnings => 'आय';

  @override
  String get payslipDeductions => 'कटौतियाँ';

  @override
  String payslipDays(String paid, String lop) {
    return 'भुगतान दिवस $paid, वेतन कटौती $lop';
  }

  @override
  String get payslipOpenPdf => 'PDF खोलें';

  @override
  String get payslipsEmpty => 'अभी कोई वेतन पर्ची नहीं। वेतन अंतिम होने पर यहाँ दिखेगी।';

  @override
  String get roleHr => 'एचआर प्रबंधक';

  @override
  String get navHome => 'होम';

  @override
  String get navClasses => 'कक्षाएँ';

  @override
  String get navStudents => 'छात्र';

  @override
  String get navMore => 'और';

  @override
  String get homeSubtitle => 'आइए आज का दिन शानदार बनाएँ!';

  @override
  String get viewAll => 'सभी देखें';

  @override
  String get startClass => 'कक्षा शुरू करें';

  @override
  String get quickActions => 'त्वरित कार्य';

  @override
  String get qaAttendance => 'उपस्थिति';

  @override
  String get qaAssignment => 'असाइनमेंट';

  @override
  String get qaQuiz => 'क्विज़';

  @override
  String get qaSmartboard => 'स्मार्टबोर्ड';

  @override
  String get qaStudyMaterial => 'अध्ययन सामग्री';

  @override
  String get qaAiAssistant => 'AI सहायक';

  @override
  String get pendingApprovals => 'लंबित स्वीकृतियाँ';

  @override
  String get allCaughtUp => 'आपके लिए कुछ भी लंबित नहीं है।';

  @override
  String get pickAClass => 'कक्षा चुनें';

  @override
  String leaveRequestLine(String type, String days) {
    return '$type: $days दिन';
  }

  @override
  String get workToolsSection => 'स्टाफ के उपकरण';

  @override
  String get tasksTitle => 'कार्य';

  @override
  String get tasksBody => 'आपको सौंपे गए और आपके द्वारा सौंपे गए कार्य';

  @override
  String get requestsTitle => 'अनुरोध और स्वीकृतियाँ';

  @override
  String get requestsBody => 'अनुरोध शुरू करें, उसे देखें और अपने पास आए अनुरोधों पर निर्णय लें';

  @override
  String get subsTitle => 'विकल्प कक्षाएँ';

  @override
  String get subsBody => 'सहकर्मियों की जगह आपकी कक्षाएँ';

  @override
  String get dutiesTitle => 'निरीक्षण ड्यूटी';

  @override
  String get dutiesBody => 'परीक्षा कक्ष में आपकी ड्यूटी';

  @override
  String get evalTitle => 'मूल्यांकन डेस्क';

  @override
  String get evalBody => 'आपको आवंटित उत्तर पुस्तिकाओं का मूल्यांकन करें';

  @override
  String get mentoringTitle => 'मार्गदर्शन';

  @override
  String get mentoringBody => 'आपके मेंटी, सत्र और योजनाएँ';

  @override
  String get courseRosterTitle => 'पाठ्यक्रम सूची';

  @override
  String get courseRosterBody => 'आपके पढ़ाए पाठ्यक्रमों में किसने पंजीकरण किया';

  @override
  String get surveysTitle => 'सर्वेक्षण';

  @override
  String get surveysBody => 'आपके उत्तर की प्रतीक्षा में सर्वेक्षण';

  @override
  String get clubsTitle => 'मेरे संयोजित क्लब';

  @override
  String get clubsBody => 'आपके क्लबों के सदस्य और अंक';

  @override
  String get tasksMineTab => 'मुझे सौंपे गए';

  @override
  String get tasksByMeTab => 'मेरे द्वारा सौंपे गए';

  @override
  String get tasksEmpty => 'कोई खुला कार्य नहीं है।';

  @override
  String taskFrom(String name) {
    return '$name की ओर से';
  }

  @override
  String taskTo(String name) {
    return '$name को';
  }

  @override
  String taskDue(String when) {
    return 'अंतिम तिथि $when';
  }

  @override
  String get taskOverdue => 'समय बीत चुका';

  @override
  String get taskStatusOpen => 'खुला';

  @override
  String get taskStatusInProgress => 'जारी है';

  @override
  String get taskStatusDone => 'पूरा हुआ';

  @override
  String get taskStatusCancelled => 'रद्द';

  @override
  String get taskStart => 'शुरू करें';

  @override
  String get taskMarkDone => 'पूरा करें';

  @override
  String get taskCancelAction => 'कार्य रद्द करें';

  @override
  String get taskPriorityHigh => 'उच्च प्राथमिकता';

  @override
  String get taskPriorityUrgent => 'अत्यावश्यक';

  @override
  String get requestsInboxTab => 'मेरे निर्णय हेतु';

  @override
  String get requestsMineTab => 'मेरे अनुरोध';

  @override
  String get requestsStart => 'नया अनुरोध';

  @override
  String get requestsInboxEmpty => 'आपके निर्णय के लिए कुछ भी लंबित नहीं है।';

  @override
  String get requestsMineEmpty => 'आपने कोई अनुरोध नहीं किया है।';

  @override
  String requestStep(String n, String total, String name) {
    return 'चरण $n / $total · $name';
  }

  @override
  String requestBy(String name) {
    return '$name द्वारा';
  }

  @override
  String get reqStatusPending => 'लंबित';

  @override
  String get reqStatusApproved => 'स्वीकृत';

  @override
  String get reqStatusRejected => 'अस्वीकृत';

  @override
  String get reqStatusReturned => 'वापस भेजा गया';

  @override
  String get reqStatusCancelled => 'वापस लिया गया';

  @override
  String get requestApprove => 'स्वीकृत करें';

  @override
  String get requestReject => 'अस्वीकार करें';

  @override
  String get requestReturn => 'बदलाव हेतु वापस भेजें';

  @override
  String get requestComment => 'टिप्पणी (वैकल्पिक)';

  @override
  String get requestWithdraw => 'अनुरोध वापस लें';

  @override
  String get requestHistory => 'इतिहास';

  @override
  String get requestAmountLabel => 'राशि (₹)';

  @override
  String get requestTitleLabel => 'शीर्षक';

  @override
  String get requestKindLabel => 'अनुरोध का प्रकार';

  @override
  String get requestSubmit => 'अनुरोध भेजें';

  @override
  String get requestNoRoutes => 'अभी कोई अनुरोध प्रकार तय नहीं किया गया है।';

  @override
  String requestFieldNeeded(String field) {
    return '$field भरें';
  }

  @override
  String get requestActionSubmitted => 'भेजा गया';

  @override
  String get requestActionResubmitted => 'फिर भेजा गया';

  @override
  String get subsEmpty => 'अगले दो सप्ताह में आपकी कोई विकल्प कक्षा नहीं है।';

  @override
  String subsFor(String name) {
    return '$name की जगह';
  }

  @override
  String get dutiesEmpty => 'आपको कोई निरीक्षण ड्यूटी नहीं मिली है।';

  @override
  String get dutyRoleChief => 'मुख्य निरीक्षक';

  @override
  String get dutyRoleInvigilator => 'निरीक्षक';

  @override
  String get evalEmpty => 'आपको कोई उत्तर पुस्तिका आवंटित नहीं है।';

  @override
  String evalScript(String no) {
    return 'पुस्तिका $no';
  }

  @override
  String evalRound(String n) {
    return 'मूल्यांकन $n';
  }

  @override
  String get evalStatusTodo => 'करना है';

  @override
  String get evalStatusSubmitted => 'जमा किया गया';

  @override
  String evalTotal(String total) {
    return 'कुल $total';
  }

  @override
  String evalQuestionLabel(String no, String max) {
    return 'प्रश्न $no ($max में से)';
  }

  @override
  String get evalMarksLabel => 'अंक';

  @override
  String get evalCommentLabel => 'टिप्पणी';

  @override
  String get evalSave => 'अंक सहेजें';

  @override
  String get evalSavedMsg => 'अंक सहेजे गए';

  @override
  String get evalSubmit => 'मूल्यांकन जमा करें';

  @override
  String get evalSubmitConfirm => 'यह मूल्यांकन जमा करें? बाद में अंक बदले नहीं जा सकेंगे।';

  @override
  String evalSubmittedMsg(String total) {
    return 'मूल्यांकन जमा हुआ। कुल $total।';
  }

  @override
  String get evalThirdNeeded => 'दोनों मूल्यांकनों में बहुत अंतर है, इसलिए तीसरा मूल्यांकन कराया जाएगा।';

  @override
  String evalOverMax(String max) {
    return 'अधिकतम $max';
  }

  @override
  String get evalMissing => 'हर प्रश्न के अंक भरें (कुछ न लिखा हो तो 0)।';

  @override
  String get evalLockedMsg => 'यह मूल्यांकन जमा हो चुका है और बदला नहीं जा सकता।';

  @override
  String evalPageLabel(String n, String total) {
    return 'पृष्ठ $n / $total';
  }

  @override
  String get evalNoPages => 'इस पुस्तिका में कोई पृष्ठ नहीं है।';

  @override
  String get menteesEmpty => 'आपका कोई मेंटी नहीं है।';

  @override
  String get riskHigh => 'उच्च जोखिम';

  @override
  String get riskMedium => 'मध्यम जोखिम';

  @override
  String get riskLow => 'कम जोखिम';

  @override
  String get riskNone => 'ठीक चल रहा है';

  @override
  String menteeAttendance(String pct) {
    return 'उपस्थिति $pct%';
  }

  @override
  String menteeFailing(String n) {
    return '$n परीक्षाओं में अनुत्तीर्ण';
  }

  @override
  String menteeFees(String n) {
    return '$n बकाया शुल्क';
  }

  @override
  String menteeCases(String n) {
    return '$n खुले मामले';
  }

  @override
  String get mentorLogSession => 'सत्र दर्ज करें';

  @override
  String get mentorSessions => 'सत्र';

  @override
  String get mentorPlans => 'हस्तक्षेप योजनाएँ';

  @override
  String get sessionModeInPerson => 'आमने-सामने';

  @override
  String get sessionModePhone => 'फ़ोन';

  @override
  String get sessionModeOnline => 'ऑनलाइन';

  @override
  String get sessionModeLabel => 'मुलाकात का तरीका';

  @override
  String get sessionSummary => 'सारांश';

  @override
  String get sessionNotes => 'निजी टिप्पणियाँ (केवल आप, विभागाध्यक्ष और परामर्शदाता देख सकते हैं)';

  @override
  String get sessionFollowUp => 'अगली बैठक';

  @override
  String get sessionSave => 'सत्र सहेजें';

  @override
  String get sessionsNone => 'अभी कोई सत्र नहीं।';

  @override
  String get plansNone => 'अभी कोई योजना नहीं।';

  @override
  String get planNew => 'नई योजना';

  @override
  String get planGoal => 'लक्ष्य';

  @override
  String get planActionsLabel => 'कार्य (हर पंक्ति में एक)';

  @override
  String get planReviewLabel => 'समीक्षा की तिथि';

  @override
  String get planCreate => 'योजना बनाएँ';

  @override
  String get planClose => 'योजना बंद करें';

  @override
  String get planOutcome => 'परिणाम';

  @override
  String get planRatingImproved => 'सुधार हुआ';

  @override
  String get planRatingNoChange => 'कोई बदलाव नहीं';

  @override
  String get planRatingWorsened => 'बिगड़ा';

  @override
  String planReviewOn(String date) {
    return 'समीक्षा $date को';
  }

  @override
  String get planClosed => 'बंद';

  @override
  String get rosterTermLabel => 'सत्र';

  @override
  String get rosterNoTerms => 'कोई सत्र नहीं मिला।';

  @override
  String get rosterNoOfferings => 'इस सत्र में आप किसी पाठ्यक्रम के शिक्षक नहीं हैं।';

  @override
  String rosterCounts(String reg, String wait) {
    return '$reg पंजीकृत, $wait प्रतीक्षा सूची में';
  }

  @override
  String rosterWaitlist(String pos) {
    return 'प्रतीक्षा सूची $pos';
  }

  @override
  String get rosterEmpty => 'अभी तक किसी ने पंजीकरण नहीं किया।';

  @override
  String get surveysEmpty => 'आपके लिए कोई सर्वेक्षण लंबित नहीं है।';

  @override
  String get surveyAnonymous => 'गुमनाम';

  @override
  String surveyClosesOn(String when) {
    return '$when को बंद होगा';
  }

  @override
  String get surveyAnswered => 'उत्तर दिया';

  @override
  String get surveySubmit => 'उत्तर भेजें';

  @override
  String get surveyThanks => 'धन्यवाद, आपके उत्तर भेज दिए गए।';

  @override
  String get surveyRequired => 'सभी आवश्यक प्रश्नों का उत्तर दें।';

  @override
  String get surveyAnswerHint => 'आपका उत्तर';

  @override
  String get clubsEmpty => 'आप किसी क्लब के संयोजक नहीं हैं।';

  @override
  String clubMembersCount(String n) {
    return '$n सदस्य';
  }

  @override
  String clubPendingCount(String n) {
    return '$n अनुरोध लंबित';
  }

  @override
  String clubPoints(String n) {
    return '$n अंक';
  }

  @override
  String get clubNoMembers => 'अभी कोई सदस्य नहीं।';

  @override
  String get insightsTitle => 'विद्यार्थी जानकारी';

  @override
  String get insightsBody => 'कक्षा की उपस्थिति, अंक और जोखिम संकेत';

  @override
  String get insightsAttendance => 'उपस्थिति';

  @override
  String get insightsMarks => 'औसत अंक';

  @override
  String get insightsFlagged => 'ध्यान चाहिए';

  @override
  String insightsAttendanceValue(String value) {
    return 'उपस्थिति $value';
  }

  @override
  String insightsMarksValue(String value) {
    return 'अंक $value';
  }

  @override
  String get copilotTitle => 'एआई सहायक';

  @override
  String get copilotBody => 'व्याख्या, प्रश्नोत्तरी, गृहकार्य और पाठ योजना के मसौदे';

  @override
  String get copilotExplain => 'समझाएँ';

  @override
  String get copilotQuiz => 'प्रश्नोत्तरी';

  @override
  String get copilotHomework => 'गृहकार्य';

  @override
  String get copilotLessonPlan => 'पाठ योजना';

  @override
  String get copilotQuestionLabel => 'आप क्या समझाना चाहते हैं?';

  @override
  String get copilotTopicLabel => 'विषय';

  @override
  String copilotHowMany(int n) {
    return 'प्रश्न: $n';
  }

  @override
  String copilotMinutes(int n) {
    return 'मिनट: $n';
  }

  @override
  String get copilotGenerate => 'मसौदा बनाएँ';

  @override
  String get copilotDraftNote => 'एआई का मसौदा। उपयोग से पहले जाँच लें; यहाँ से विद्यार्थियों को कुछ नहीं भेजा जाता।';

  @override
  String get copilotSampleDraft => 'केवल नमूना: इस विद्यालय के सर्वर पर अभी कोई एआई मॉडल जुड़ा नहीं है। उपयोग से पहले सब कुछ जाँच लें।';

  @override
  String get copilotKeyPoints => 'मुख्य बिंदु';

  @override
  String get copilotFollowUps => 'विद्यार्थी आगे पूछ सकते हैं';

  @override
  String get copilotQuestions => 'प्रश्न';

  @override
  String get copilotObjectives => 'उद्देश्य';

  @override
  String get copilotSteps => 'चरण';

  @override
  String get copilotMaterials => 'सामग्री';

  @override
  String get copilotAssessment => 'मूल्यांकन';

  @override
  String get copilotCopy => 'मसौदा कॉपी करें';

  @override
  String get copilotCopied => 'मसौदा कॉपी हो गया।';

  @override
  String get evalToolTick => 'सही का निशान';

  @override
  String get evalToolCross => 'गलत का निशान';

  @override
  String get evalToolComment => 'टिप्पणी';

  @override
  String get evalMarksOnPage => 'स्क्रिप्ट पर निशान';

  @override
  String get evalEarlierNote => 'हल्के निशान पहले के मूल्यांकनों के हैं।';

  @override
  String get evalCommentPrompt => 'इस जगह पर टिप्पणी';

  @override
  String get evalAddMark => 'जोड़ें';

  @override
  String get appraisalTitle => 'स्व-मूल्यांकन';

  @override
  String get appraisalBody => 'अपना वार्षिक स्व-मूल्यांकन भरें और जमा करें';

  @override
  String get appraisalNoCycle => 'अभी कोई मूल्यांकन चक्र खुला नहीं है।';

  @override
  String get appraisalCycle => 'चक्र';

  @override
  String get appraisalMax => 'अधिकतम';

  @override
  String get appraisalScore => 'अंक';

  @override
  String get appraisalEvidence => 'प्रमाण';

  @override
  String appraisalOverMax(String max) {
    return 'अंक 0 और $max के बीच होने चाहिए';
  }

  @override
  String get appraisalNeedScore => 'कम से कम एक अंक भरें।';

  @override
  String get appraisalSubmitted => 'मूल्यांकन समीक्षा के लिए जमा हो गया।';

  @override
  String get appraisalSaved => 'मसौदा सहेजा गया।';

  @override
  String get appraisalLocked => 'आपका मूल्यांकन जमा हो चुका है और अब बदला नहीं जा सकता।';

  @override
  String get appraisalSelfPercent => 'स्व-अंक';

  @override
  String get appraisalSaveDraft => 'मसौदा सहेजें';

  @override
  String get appraisalSubmit => 'मूल्यांकन जमा करें';

  @override
  String get housesTitle => 'सदन';

  @override
  String get housesBody => 'लीडरबोर्ड और सदन अंक';

  @override
  String get housesEmpty => 'अभी कोई सदन नहीं बना है।';

  @override
  String get housesMembers => 'सदस्य';

  @override
  String get houseStudent => 'विद्यार्थी (वैकल्पिक)';

  @override
  String get houseWholeHouse => 'पूरा सदन';

  @override
  String get housePoints => 'अंक (काटने के लिए ऋण)';

  @override
  String get houseCategory => 'श्रेणी';

  @override
  String get houseReason => 'कारण';

  @override
  String get houseAward => 'अंक दें';

  @override
  String get housePointsRange => '-100 से 100 के बीच अंक भरें, शून्य नहीं।';

  @override
  String get houseReasonNeeded => 'कम से कम 3 अक्षरों का कारण लिखें।';

  @override
  String get housePointsSaved => 'अंक दर्ज हो गए।';

  @override
  String get houseCatGeneral => 'सामान्य';

  @override
  String get houseCatAcademics => 'शिक्षा';

  @override
  String get houseCatSports => 'खेल';

  @override
  String get houseCatArts => 'कला';

  @override
  String get houseCatDiscipline => 'अनुशासन';

  @override
  String get houseCatService => 'सेवा';

  @override
  String get curriculumTitle => 'पाठ्यक्रम';

  @override
  String get curriculumBody => 'सक्रिय पाठ्यक्रम, इकाइयाँ और पाठ्यक्रम परिणाम';

  @override
  String get curriculumEmpty => 'अभी कोई सक्रिय पाठ्यक्रम नहीं है।';

  @override
  String get curriculumNoSubjects => 'इस संस्करण में कोई विषय नहीं है।';

  @override
  String get curriculumUnits => 'इकाइयाँ';

  @override
  String get curriculumOutcomes => 'पाठ्यक्रम परिणाम';

  @override
  String get courseFilesTitle => 'पाठ्यक्रम फ़ाइलें';

  @override
  String get courseFilesBody => 'अपनी कक्षाओं की पाठ्यक्रम फ़ाइल बनाएँ और डाउनलोड करें';

  @override
  String get courseFilesEmpty => 'आपके पास पाठ्यक्रम फ़ाइल बनाने के लिए कोई कक्षा नहीं है।';

  @override
  String get courseFilesBuild => 'नया संस्करण बनाएँ';

  @override
  String get courseFilesBuilt => 'पाठ्यक्रम फ़ाइल बन गई';

  @override
  String courseFilesVersion(int n) {
    return 'संस्करण $n';
  }

  @override
  String get courseFilesReviewed => 'समीक्षा हो चुकी';

  @override
  String get courseFilesAwaiting => 'समीक्षा की प्रतीक्षा';

  @override
  String get courseFilesOpenFailed => 'फ़ाइल नहीं खुल सकी';

  @override
  String get courseFilesNone => 'अभी कोई संस्करण नहीं बना';
}
