// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Hindi (`hi`).
class AppLocalizationsHi extends AppLocalizations {
  AppLocalizationsHi([String locale = 'hi']) : super(locale);

  @override
  String get today => 'आज';

  @override
  String get tomorrow => 'कल';

  @override
  String get yesterday => 'कल';

  @override
  String get dueToday => 'आज जमा करना है';

  @override
  String get dueTomorrow => 'कल जमा करना है';

  @override
  String dueOn(Object date) {
    return '$date तक जमा करें';
  }

  @override
  String wasDue(Object date) {
    return '$date तक जमा करना था';
  }

  @override
  String overdueBy(int days) {
    String _temp0 = intl.Intl.pluralLogic(days, locale: localeName, other: '$days दिन', one: '1 दिन');
    return '$_temp0 की देरी';
  }

  @override
  String get bookDueToday => 'आज लौटाना है';

  @override
  String get bookDueTomorrow => 'कल लौटाना है';

  @override
  String bookDueOn(Object date) {
    return '$date तक लौटाएँ';
  }

  @override
  String get greetingMorning => 'सुप्रभात';

  @override
  String get greetingAfternoon => 'नमस्ते';

  @override
  String get greetingEvening => 'शुभ संध्या';

  @override
  String greetingName(Object greeting, Object name) {
    return '$greeting, $name';
  }

  @override
  String dateTime(Object date, Object time) {
    return '$date, $time';
  }

  @override
  String get listSeparator => ', ';

  @override
  String listAnd(Object items, Object last) {
    return '$items और $last';
  }

  @override
  String get retry => 'फिर से कोशिश करें';

  @override
  String get soon => 'जल्द';

  @override
  String get comingSoon => 'जल्द आ रहा है';

  @override
  String comingLater(Object feature) {
    return '$feature अगले अपडेट में आएगा';
  }

  @override
  String get statusPresent => 'उपस्थित';

  @override
  String get statusAbsent => 'अनुपस्थित';

  @override
  String get statusLate => 'देर से';

  @override
  String get statusExcused => 'छुट्टी मंज़ूर';

  @override
  String get cancel => 'रद्द करें';

  @override
  String get save => 'सहेजें';

  @override
  String get send => 'भेजें';

  @override
  String get share => 'साझा करें';

  @override
  String get close => 'बंद करें';

  @override
  String get done => 'हो गया';

  @override
  String get seeAll => 'सभी देखें';

  @override
  String pages(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count पेज', one: '1 पेज');
    return '$_temp0';
  }

  @override
  String lastDays(Object days) {
    return 'पिछले $days दिन';
  }

  @override
  String rollNo(Object rollNo) {
    return 'रोल नं. $rollNo';
  }

  @override
  String get errTimeout => 'सर्वर जवाब देने में बहुत समय ले रहा है। फिर से कोशिश करें।';

  @override
  String get errUnreachable => 'KINETIX से कनेक्ट नहीं हो पा रहा। अपना इंटरनेट कनेक्शन और सर्वर का पता जाँचें।';

  @override
  String get errForbidden => 'आपको इसकी अनुमति नहीं है।';

  @override
  String get errNotFound => 'नहीं मिला।';

  @override
  String get errTooMany => 'बहुत ज़्यादा कोशिशें हुईं। एक मिनट रुककर फिर से कोशिश करें।';

  @override
  String errGeneric(Object status) {
    return 'कुछ गड़बड़ हो गई ($status)। फिर से कोशिश करें।';
  }

  @override
  String get errWrongLogin => 'संस्थान, लॉगिन या पासवर्ड गलत है';

  @override
  String get signIn => 'साइन इन';

  @override
  String get signOut => 'साइन आउट';

  @override
  String get signOutQuestion => 'साइन आउट करें?';

  @override
  String get signOutBody => 'फिर से साइन इन करने के लिए आपको अपने पासवर्ड की ज़रूरत होगी।';

  @override
  String get institutionCode => 'संस्थान कोड';

  @override
  String get institutionCodeHint => 'जैसे demo-college';

  @override
  String get password => 'पासवर्ड';

  @override
  String get showPassword => 'पासवर्ड दिखाएँ';

  @override
  String get hidePassword => 'पासवर्ड छिपाएँ';

  @override
  String get serverAddress => 'सर्वर का पता';

  @override
  String serverLabel(Object server) {
    return 'सर्वर: $server';
  }

  @override
  String get enterInstitutionCode => 'अपना संस्थान कोड डालें';

  @override
  String get institutionCodeChars => 'केवल अक्षर, अंक और हाइफ़न (-) इस्तेमाल करें';

  @override
  String get enterValidEmail => 'सही ईमेल पता डालें';

  @override
  String get enterValidPhone => '10 अंकों का फ़ोन नंबर या सही ईमेल डालें';

  @override
  String get enterPassword => 'अपना पासवर्ड डालें';

  @override
  String get enterServer => 'सर्वर का पता डालें, जैसे https://api.kinetix.in';

  @override
  String get language => 'भाषा';

  @override
  String get languageHelp => 'ऐप और आपको भेजी जाने वाली सूचनाओं के लिए';

  @override
  String get chooseLanguage => 'भाषा चुनें';

  @override
  String get profile => 'प्रोफ़ाइल';

  @override
  String get account => 'खाता';

  @override
  String get server => 'सर्वर';

  @override
  String get settings => 'सेटिंग्स';

  @override
  String get navHome => 'होम';

  @override
  String get navMessages => 'संदेश';

  @override
  String get navUpdates => 'सूचनाएँ';

  @override
  String get navProfile => 'प्रोफ़ाइल';

  @override
  String get attendance => 'उपस्थिति';

  @override
  String get homework => 'होमवर्क';

  @override
  String sectionLastDays(Object section, Object days) {
    return '$section · पिछले $days दिन';
  }

  @override
  String get allClasses => 'सभी कक्षाएँ';

  @override
  String get absentOrLate => 'अनुपस्थित या देर से';

  @override
  String noAttendanceTaken(Object days) {
    return 'पिछले $days दिनों में उपस्थिति दर्ज नहीं हुई है।';
  }

  @override
  String get attendedAll => 'सभी में उपस्थित';

  @override
  String attendedNofM(Object attended, Object total) {
    return '$total में से $attended में उपस्थित';
  }

  @override
  String get wholeDay => 'पूरा दिन';

  @override
  String get instructions => 'निर्देश';

  @override
  String get noInstructions => 'कोई निर्देश नहीं जोड़े गए।';

  @override
  String get factDue => 'जमा करने की तारीख';

  @override
  String get setBy => 'किसने दिया';

  @override
  String get givenOn => 'दिया गया';

  @override
  String get library => 'पुस्तकालय';

  @override
  String nOut(Object count) {
    return '$count ली गईं';
  }

  @override
  String get seeLibraryHistory => 'पुस्तकालय का पूरा ब्योरा देखें';

  @override
  String booksOverdue(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count किताबें लौटाने में देर हो गई है। कृपया उन्हें पुस्तकालय में लौटाएँ।',
      one: '1 किताब लौटाने में देर हो गई है। कृपया उसे पुस्तकालय में लौटाएँ।',
    );
    return '$_temp0';
  }

  @override
  String andMore(Object count) {
    return 'और $count';
  }

  @override
  String finesForLate(Object amount) {
    return 'देर से लौटाने का जुर्माना: $amount';
  }

  @override
  String finesPayAtDesk(Object amount) {
    return 'देर से लौटाने का जुर्माना: $amount। पुस्तकालय काउंटर पर भुगतान करें।';
  }

  @override
  String borrowedOn(Object date) {
    return '$date को ली';
  }

  @override
  String returnedOn(Object date) {
    return '$date को लौटाई';
  }

  @override
  String fineAmount(Object amount) {
    return 'जुर्माना $amount';
  }

  @override
  String get returnedLate => 'देर से';

  @override
  String fineSoFar(Object amount) {
    return 'अब तक $amount जुर्माना';
  }

  @override
  String booksOutHeading(Object count) {
    return 'ली गई किताबें ($count)';
  }

  @override
  String get noBooksOut => 'अभी कोई किताब नहीं ली गई है।';

  @override
  String get fineRule => 'किताब देर से लौटाने पर पुस्तकालय हर दिन का जुर्माना लेता है।';

  @override
  String returnedHeading(Object count) {
    return 'लौटाई गईं ($count)';
  }

  @override
  String get returnedEmpty => 'लौटाई गई किताबें यहाँ दिखेंगी।';

  @override
  String get libraryBooks => 'पुस्तकालय की किताबें';

  @override
  String get results => 'परिणाम';

  @override
  String get aboveAverage => 'कक्षा के औसत से ऊपर';

  @override
  String get atAverage => 'कक्षा के औसत के बराबर';

  @override
  String get belowAverage => 'कक्षा के औसत से नीचे';

  @override
  String get notEntered => 'दर्ज नहीं';

  @override
  String get publishedMarks => 'प्रकाशित अंक';

  @override
  String get seeAllResults => 'सभी परिणाम देखें';

  @override
  String get bySubject => 'विषय के अनुसार';

  @override
  String classAverageValue(Object value) {
    return 'कक्षा का औसत $value';
  }

  @override
  String get marksExplainer => 'सभी प्रकाशित मूल्यांकनों में कुल अंकों में से प्राप्त अंक।';

  @override
  String get assessments => 'मूल्यांकन';

  @override
  String get classAverage => 'कक्षा का औसत';

  @override
  String get highestInClass => 'कक्षा में सबसे ज़्यादा';

  @override
  String outOf(Object max) {
    return '$max में से';
  }

  @override
  String get teachersRemark => 'शिक्षक की टिप्पणी';

  @override
  String get kindTest => 'टेस्ट';

  @override
  String get kindAssignment => 'असाइनमेंट';

  @override
  String get kindInternal => 'आंतरिक मूल्यांकन';

  @override
  String get kindExam => 'परीक्षा';

  @override
  String get kindPractical => 'प्रैक्टिकल';

  @override
  String get lessonRecordings => 'पाठ की रिकॉर्डिंग';

  @override
  String nMissed(Object count) {
    return '$count छूटीं';
  }

  @override
  String seeAllRecordings(Object count) {
    return 'सभी $count रिकॉर्डिंग देखें';
  }

  @override
  String get recordingNotShared => 'यह रिकॉर्डिंग अब कक्षा के साथ साझा नहीं है।';

  @override
  String get classBoard => 'कक्षा का बोर्ड';

  @override
  String get previousPage => 'पिछला पेज';

  @override
  String get nextPage => 'अगला पेज';

  @override
  String pageOf(Object page, Object total) {
    return 'पेज $page / $total';
  }

  @override
  String get zoomOut => 'ज़ूम आउट करने के लिए दो बार टैप करें';

  @override
  String get zoomSideways => 'ज़ूम करने के लिए दो उँगलियों से फैलाएँ, या फ़ोन को आड़ा करें';

  @override
  String get zoomHint => 'ज़ूम करने के लिए दो उँगलियों से फैलाएँ या दो बार टैप करें';

  @override
  String get fees => 'फ़ीस';

  @override
  String get allFeesPaid => 'सारी फ़ीस जमा हो गई';

  @override
  String lastPaid(Object amount) {
    return 'पिछला भुगतान $amount';
  }

  @override
  String get dueSuffix => 'बाकी';

  @override
  String feesToPay(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count फ़ीस भरनी हैं', one: '1 फ़ीस भरनी है');
    return '$_temp0';
  }

  @override
  String nOverdue(Object count) {
    return '$count की तारीख निकल गई';
  }

  @override
  String get viewFees => 'फ़ीस देखें';

  @override
  String get viewFeesReceipts => 'फ़ीस और रसीदें देखें';

  @override
  String get payAtCounter => 'कृपया फ़ीस काउंटर पर भुगतान करें।';

  @override
  String get ok => 'ठीक है';

  @override
  String get feesNothingDue => 'कुछ बाकी नहीं';

  @override
  String get totalDue => 'कुल बाकी';

  @override
  String get toPay => 'भरना है';

  @override
  String get paidHeader => 'भरी गई';

  @override
  String paidLine(Object amount, Object date) {
    return '$amount · $date तक भरनी थी';
  }

  @override
  String get paidPill => 'भर दी';

  @override
  String get paymentsReceipts => 'भुगतान और रसीदें';

  @override
  String get feeLabel => 'फ़ीस';

  @override
  String overdueWasDue(Object date) {
    return 'तारीख निकल गई · $date तक भरनी थी';
  }

  @override
  String paidOfLeft(Object paid, Object total, Object left) {
    return '$total में से $paid भरे · $left बाकी';
  }

  @override
  String get receiptNotFound => 'यह रसीद नहीं मिली।';

  @override
  String get receiptCopied => 'रसीद कॉपी हो गई। इसे किसी संदेश या ईमेल में पेस्ट करें।';

  @override
  String get receipt => 'रसीद';

  @override
  String get copyReceipt => 'रसीद कॉपी करें';

  @override
  String get feeReceipt => 'फ़ीस की रसीद';

  @override
  String get receiptNoLabel => 'रसीद नं.';

  @override
  String get dateLabel => 'तारीख';

  @override
  String get studentLabel => 'विद्यार्थी';

  @override
  String get classLabel => 'कक्षा';

  @override
  String get paidBy => 'भुगतान का तरीका';

  @override
  String get reference => 'संदर्भ';

  @override
  String get amountPaid => 'भुगतान की गई राशि';

  @override
  String get balanceLeft => 'बाकी राशि';

  @override
  String get nilFullyPaid => 'शून्य · पूरा भुगतान हो गया';

  @override
  String get demoNoMoneyMoved => 'डेमो भुगतान: कोई पैसा नहीं कटा।';

  @override
  String get demoNoMoney => 'डेमो भुगतान: कोई पैसा नहीं कटेगा';

  @override
  String get methodOnline => 'ऑनलाइन';

  @override
  String get methodCash => 'नकद';

  @override
  String get methodCheque => 'चेक';

  @override
  String get methodBankTransfer => 'बैंक ट्रांसफ़र';

  @override
  String get methodPayment => 'भुगतान';

  @override
  String get newMessage => 'नया संदेश';

  @override
  String aboutName(Object name) {
    return '$name के बारे में';
  }

  @override
  String get noMessagesYet => 'अभी कोई संदेश नहीं';

  @override
  String couldNotSend(Object reason) {
    return 'नहीं भेजा जा सका: $reason';
  }

  @override
  String get message => 'संदेश';

  @override
  String get pullForEarlier => 'पुराने संदेशों के लिए नीचे खींचें';

  @override
  String get teachersReply => 'शिक्षक समय मिलने पर जवाब देते हैं, आमतौर पर कॉलेज के समय में।';

  @override
  String get messageCopied => 'संदेश कॉपी हो गया';

  @override
  String get teacher => 'शिक्षक';

  @override
  String get markAllRead => 'सभी को पढ़ा हुआ मार्क करें';

  @override
  String get earlier => 'पहले की';

  @override
  String get fromCollege => 'कॉलेज से संदेश';

  @override
  String get update => 'सूचना';

  @override
  String get attendanceGood => 'अच्छी उपस्थिति। ऐसे ही बनाए रखें।';

  @override
  String get seeAttendanceHistory => 'उपस्थिति का पूरा ब्योरा देखें';

  @override
  String attendedOf(Object attended, int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count कक्षाओं', one: '1 कक्षा');
    return '$_temp0 में से $attended में उपस्थित';
  }

  @override
  String excusedNote(Object count) {
    return '$count में छुट्टी मंज़ूर (उपस्थित गिना गया)';
  }

  @override
  String get recentAbsences => 'हाल की अनुपस्थिति';

  @override
  String dueCount(Object count) {
    return '$count बाकी';
  }

  @override
  String pastHomework(Object count) {
    return 'पुराना होमवर्क ($count)';
  }

  @override
  String get classBoards => 'कक्षा के बोर्ड';

  @override
  String todaysBoard(Object subject) {
    return 'आज का बोर्ड: $subject';
  }

  @override
  String get resultsSubtitle => 'प्रकाशित अंक और कक्षा का औसत';

  @override
  String get librarySubtitle => 'ली गई किताबें, लौटाने की तारीखें और जुर्माना';

  @override
  String get college => 'कॉलेज';

  @override
  String get resultsLibraryHeader => 'परिणाम और पुस्तकालय';

  @override
  String get feesAndReceipts => 'फ़ीस और रसीदें';

  @override
  String get tryAgain => 'फिर से कोशिश करें';

  @override
  String get yourAttendance => 'आपकी उपस्थिति';

  @override
  String notMissedAny(Object days) {
    return 'पिछले $days दिनों में आपकी कोई कक्षा नहीं छूटी। बहुत बढ़िया!';
  }

  @override
  String homeworkHandIn(Object learn) {
    return 'जैसे शिक्षक ने कहा है, वैसे ही जमा करें। कहीं अटक गए? $learn टैब में KINETIX AI से पूछें।';
  }

  @override
  String get noBooksBorrowed =>
      'पुस्तकालय से कोई किताब नहीं ली गई। कॉलेज पुस्तकालय से आप जो किताबें लेंगे, वे लौटाने की तारीख के साथ यहाँ दिखेंगी।';

  @override
  String get noBooksOutNow => 'अभी आपके पास पुस्तकालय की कोई किताब नहीं है।';

  @override
  String markedAbsentFor(Object kind) {
    return 'इस $kind में आपको अनुपस्थित दर्ज किया गया।';
  }

  @override
  String get noMarksCard =>
      'अभी कोई अंक प्रकाशित नहीं हुए। जब आपके शिक्षक टेस्ट या परीक्षा के अंक प्रकाशित करेंगे, वे कक्षा के औसत के साथ यहाँ दिखेंगे।';

  @override
  String get noMarksScreen => 'अभी कोई अंक प्रकाशित नहीं हुए।\nजब आपके शिक्षक अंक प्रकाशित करेंगे, वे यहाँ दिखेंगे।';

  @override
  String get you => 'आप';

  @override
  String get recordingsEmpty => 'जब शिक्षक बोर्ड पर पाठ रिकॉर्ड करके साझा करते हैं, तो आप उसे यहाँ फिर से देख सकते हैं।';

  @override
  String get missedThisClass => 'आपकी यह कक्षा छूट गई';

  @override
  String get noRecordingsShared => 'अभी तक आपकी कक्षा के साथ पाठ की कोई रिकॉर्डिंग साझा नहीं की गई है।';

  @override
  String get recordingNotSharedYours => 'यह रिकॉर्डिंग अब आपकी कक्षा के साथ साझा नहीं है।';

  @override
  String get boardNotShared => 'यह बोर्ड अब आपकी कक्षा के साथ साझा नहीं है।';

  @override
  String writeToAbout(Object teacher) {
    return 'किसी कक्षा, होमवर्क या संदेह के बारे में $teacher को लिखें।';
  }

  @override
  String get noMessagesStudent => 'अभी कोई संदेश नहीं।\nकिसी कक्षा, होमवर्क या संदेह के बारे में अपने शिक्षकों को लिखें।';

  @override
  String get noTeachersOnTimetable => 'आपकी समय-सारणी में अभी कोई शिक्षक नहीं हैं।';

  @override
  String yourTeachers(Object className) {
    return 'आपके शिक्षक · $className';
  }

  @override
  String nUnread(Object count) {
    return '$count अपठित';
  }

  @override
  String get writeToTeacher => 'शिक्षक को लिखें';

  @override
  String get openMessages => 'संदेश खोलें';

  @override
  String get askYourTeachers => 'किसी कक्षा, होमवर्क या संदेह के बारे में अपने शिक्षकों से पूछें।';

  @override
  String get noUpdates => 'आपने सब देख लिया है।\nनया होमवर्क, साझा बोर्ड, पाठ की रिकॉर्डिंग और कॉलेज के संदेश यहाँ दिखेंगे।';

  @override
  String get noLongerLive => 'यह कक्षा अब लाइव नहीं है।';

  @override
  String otherClassLive(Object today) {
    return 'वह कक्षा खत्म हो गई। एक दूसरी कक्षा अभी $today टैब पर लाइव है।';
  }

  @override
  String get liveClass => 'लाइव कक्षा';

  @override
  String get signInHint => 'वही ईमेल या फ़ोन नंबर इस्तेमाल करें जो आपके कॉलेज ने आपको दिया है';

  @override
  String get emailOrPhone => 'ईमेल या फ़ोन';

  @override
  String get enterEmailOrPhone => 'अपना ईमेल या फ़ोन नंबर डालें';

  @override
  String get navLearn => 'सीखें';

  @override
  String get attendanceFewMissed => 'हाल में आपकी कुछ कक्षाएँ छूटी हैं।';

  @override
  String get attendanceBelow75 => '75% से कम। परीक्षा में बैठने के लिए कॉलेज आमतौर पर 75% उपस्थिति माँगते हैं।';

  @override
  String noAttendanceForYou(Object days) {
    return 'पिछले $days दिनों में आपकी उपस्थिति दर्ज नहीं हुई है।';
  }

  @override
  String get nothingDue => 'अभी कुछ भी जमा करना बाकी नहीं है। आपके शिक्षकों का नया होमवर्क यहाँ दिखेगा।';

  @override
  String get stuckTitle => 'कहीं अटक गए?';

  @override
  String get stuckBody => 'KINETIX AI से समझाने को कहें, English, हिन्दी या ಕನ್ನಡ में।';

  @override
  String get boardsEmpty => 'जब शिक्षक पाठ के बाद कक्षा का बोर्ड साझा करते हैं, तो वह यहाँ दिखता है ताकि आप दोहरा सकें।';

  @override
  String get feesNote =>
      'फ़ीस आपके अभिभावक KINETIX Parent ऐप में या कॉलेज के फ़ीस काउंटर पर भरते हैं। यहाँ आप देख सकते हैं कि कितना बाकी है और अपनी रसीदें खोल सकते हैं।';

  @override
  String get invoicePaid => 'भर दी';

  @override
  String get invoiceCancelled => 'रद्द';

  @override
  String get invoiceOverdue => 'तारीख निकल गई';

  @override
  String get invoicePartPaid => 'आंशिक भुगतान';

  @override
  String get invoiceDue => 'बाकी';

  @override
  String get payments => 'भुगतान';

  @override
  String get noFeesIssued => 'आपके लिए कोई फ़ीस जारी नहीं हुई है।';

  @override
  String get noPayments => 'अभी कोई भुगतान नहीं। भुगतान होने पर रसीदें यहाँ दिखेंगी।';

  @override
  String get allPaid => 'सब भर दिया';

  @override
  String feesOverdueNext(int count, Object title) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count फ़ीस की तारीख निकल गई', one: '1 फ़ीस की तारीख निकल गई');
    return '$_temp0 · अगली: $title';
  }

  @override
  String nextFeeDue(Object title, Object date) {
    return 'अगली: $title, $date तक';
  }

  @override
  String amountPaidShort(Object amount) {
    return '$amount भरे';
  }

  @override
  String dueOnShort(Object date) {
    return '$date तक';
  }

  @override
  String get paidOn => 'भुगतान की तारीख';

  @override
  String get rollNoLabel => 'रोल नं.';

  @override
  String get forLabel => 'किसलिए';

  @override
  String get method => 'तरीका';

  @override
  String get feeAmount => 'फ़ीस की राशि';

  @override
  String get balance => 'बाकी';

  @override
  String get nil => 'शून्य';

  @override
  String get keepReceipt => 'इसे अपने रिकॉर्ड के लिए रखें। अगर कोई भुगतान का सबूत माँगे, तो इसे फ़ीस काउंटर पर दिखाएँ।';

  @override
  String get yourClass => 'आपकी कक्षा';

  @override
  String get program => 'कोर्स';

  @override
  String get attendanceHistory => 'उपस्थिति का ब्योरा';

  @override
  String get writeToYourTeachers => 'अपने शिक्षकों को लिखें';

  @override
  String get aiAnswersIn => 'KINETIX AI इस भाषा में जवाब देगा';

  @override
  String get answersIn => 'जवाब की भाषा';

  @override
  String get timetable => 'समय-सारणी';

  @override
  String get timetableSubtitle => 'हफ़्ते भर की आपकी कक्षाएँ';

  @override
  String get everyClass30 => 'पिछले 30 दिनों की हर कक्षा';

  @override
  String noAttendanceDays(Object days) {
    return 'पिछले $days दिनों में उपस्थिति दर्ज नहीं हुई';
  }

  @override
  String attendedPercent(Object percent, Object days) {
    return 'पिछले $days दिनों में $percent उपस्थिति';
  }

  @override
  String get noMarksYet => 'अभी कोई अंक प्रकाशित नहीं हुए';

  @override
  String assessmentsPublished(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count मूल्यांकन प्रकाशित', one: '1 मूल्यांकन प्रकाशित');
    return '$_temp0';
  }

  @override
  String get noBooksOutShort => 'कोई किताब नहीं ली गई';

  @override
  String booksOut(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count किताबें ली गईं', one: '1 किताब ली गई');
    return '$_temp0';
  }

  @override
  String feesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count फ़ीस', one: '1 फ़ीस');
    return '$_temp0';
  }

  @override
  String receiptsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count रसीदें', one: '1 रसीद');
    return '$_temp0';
  }

  @override
  String get askADoubt => 'संदेह पूछें';

  @override
  String get syllabus => 'पाठ्यक्रम';

  @override
  String get earlierQuestions => 'पहले पूछे गए सवाल';

  @override
  String get askIntro => 'KINETIX AI आपके पाठ्यक्रम के अनुसार इसे कदम-दर-कदम समझाता है।';

  @override
  String aboutTopic(Object topic) {
    return 'विषय-वस्तु: $topic';
  }

  @override
  String get askAboutAnything => 'किसी भी बारे में पूछें';

  @override
  String get questionHint => 'जैसे: शेयरों का हरण (forfeiture) क्या है?';

  @override
  String get answerIn => 'जवाब की भाषा';

  @override
  String get subject => 'विषय';

  @override
  String get anySubject => 'कोई भी';

  @override
  String get ask => 'पूछें';

  @override
  String get youAsked => 'आपने पूछा';

  @override
  String get aiThinking => 'KINETIX AI सोच रहा है…';

  @override
  String get keyPoints => 'मुख्य बातें';

  @override
  String get basedOn => 'इस पर आधारित';

  @override
  String get openTopicNotes => 'विषय-वस्तु के नोट्स खोलें';

  @override
  String get askNext => 'आगे पूछें';

  @override
  String get previewAnswer => 'नमूना जवाब';

  @override
  String get previewNote => 'आपके कॉलेज में KINETIX AI अभी जुड़ा नहीं है, इसलिए यह केवल नमूना है, असली व्याख्या नहीं।';

  @override
  String get aiCantAnswer => 'KINETIX AI इसका जवाब नहीं दे सकता';

  @override
  String get aiRephrase => 'इसे अपनी पढ़ाई से जुड़े सवाल के रूप में दोबारा लिखकर देखें।';

  @override
  String get aiAllowanceUsed => 'आज की KINETIX AI सीमा पूरी हो गई है';

  @override
  String get aiAllowanceBody => 'आपके कॉलेज ने आज की सीमा इस्तेमाल कर ली है। यह कल फिर से शुरू होगी।';

  @override
  String get aiUnreachable => 'KINETIX AI से संपर्क नहीं हो पा रहा';

  @override
  String get aiUnreachableBody => 'अभी संपर्क नहीं हो पा रहा। एक मिनट बाद फिर से कोशिश करें।';

  @override
  String get noConnection => 'कोई कनेक्शन नहीं';

  @override
  String get somethingWrong => 'कुछ गड़बड़ हो गई';

  @override
  String get topicNotInLibrary => 'यह विषय-वस्तु अब लाइब्रेरी में नहीं है।';

  @override
  String get topic => 'विषय-वस्तु';

  @override
  String get askAboutThis => 'इसके बारे में KINETIX AI से पूछें';

  @override
  String get notes => 'नोट्स';

  @override
  String get outcomes => 'इस विषय-वस्तु के बाद आप ये कर पाएँगे';

  @override
  String get noNotes => 'इस विषय-वस्तु के लिए अभी कोई नोट्स नहीं जोड़े गए हैं।';

  @override
  String get notReviewed => 'इन नोट्स की पाठ्यक्रम टीम ने अभी जाँच नहीं की है। आपकी पाठ्यपुस्तक और शिक्षक की बात पहले मानें।';

  @override
  String get askKinetixAi => 'KINETIX AI से पूछें';

  @override
  String get searchTopicsHint => 'विषय-वस्तु खोजें, जैसे goodwill';

  @override
  String get clear => 'साफ़ करें';

  @override
  String noTopicsMatch(Object query) {
    return '“$query” से कोई विषय-वस्तु नहीं मिली। छोटा शब्द आज़माएँ, या KINETIX AI से पूछें।';
  }

  @override
  String topicsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count विषय-वस्तुएँ', one: '1 विषय-वस्तु');
    return '$_temp0';
  }

  @override
  String chaptersCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count अध्याय', one: '1 अध्याय');
    return '$_temp0';
  }

  @override
  String get yourSubjects => 'आपके विषय';

  @override
  String get subjectsEmpty => 'जब आपके शिक्षक होमवर्क देंगे, आपके विषय यहाँ दिखेंगे। तब तक ऊपर कोई भी विषय-वस्तु खोजें।';

  @override
  String syllabusMissing(Object subject) {
    return '$subject का पाठ्यक्रम अभी KINETIX लाइब्रेरी में नहीं है।\nकोई विषय-वस्तु खोजें, या KINETIX AI से पूछें।';
  }

  @override
  String get noTopicsYet => 'अभी कोई विषय-वस्तु नहीं।';

  @override
  String get joiningClass => 'कक्षा से जुड़ रहे हैं…';

  @override
  String get waitingForBoard => 'बोर्ड का इंतज़ार है…';

  @override
  String get leave => 'बाहर निकलें';

  @override
  String get liveBadge => 'लाइव';

  @override
  String get reconnecting => 'कनेक्शन टूट गया। फिर से जुड़ रहे हैं…';

  @override
  String get couldNotJoin => 'कक्षा से नहीं जुड़ सके';

  @override
  String get tryInAMoment => 'थोड़ी देर बाद फिर से कोशिश करें।';

  @override
  String get liveOffTitle => 'आपके शिक्षक ने लाइव कक्षा बंद कर दी';

  @override
  String liveOffBody(Object today) {
    return 'बोर्ड अब साझा नहीं हो रहा। अगर आपके शिक्षक पाठ की रिकॉर्डिंग साझा करते हैं, तो वह $today टैब पर दिखेगी।';
  }

  @override
  String get boardOfflineTitle => 'बोर्ड ऑफ़लाइन हो गया';

  @override
  String get boardOfflineBody => 'कक्षा के बोर्ड का कनेक्शन टूट गया। यहीं रहें: दोबारा जुड़ते ही बोर्ड अपने-आप दिखने लगेगा।';

  @override
  String get classEndedTitle => 'कक्षा खत्म हो गई है';

  @override
  String classEndedBody(Object today) {
    return 'जुड़ने के लिए धन्यवाद। अगर आपके शिक्षक पाठ की रिकॉर्डिंग साझा करते हैं, तो वह $today टैब पर दिखेगी।';
  }

  @override
  String backToToday(Object today) {
    return '$today पर वापस जाएँ';
  }

  @override
  String liveNow(Object subject) {
    return 'अभी लाइव: $subject';
  }

  @override
  String get classFallback => 'कक्षा';

  @override
  String teacherTeaching(Object teacher) {
    return '$teacher पढ़ा रहे हैं। बोर्ड देखें।';
  }

  @override
  String get watch => 'देखें';

  @override
  String get liveSignInAgain => 'कक्षा देखने के लिए फिर से साइन इन करें।';

  @override
  String get liveNotConnected => 'कनेक्ट नहीं है';

  @override
  String get liveTimeout => 'कक्षा से जवाब आने में बहुत देर हो रही है। फिर से कोशिश करें।';

  @override
  String get liveCouldNotJoin => 'कक्षा से नहीं जुड़ सके।';

  @override
  String get undergraduate => 'स्नातक';

  @override
  String get postgraduate => 'स्नातकोत्तर';

  @override
  String get boardOnlyNoSound => 'सिर्फ़ बोर्ड: आवाज़ नहीं';

  @override
  String get teacherMicOn => 'शिक्षक का माइक चालू है';

  @override
  String get teacherMicOff => 'शिक्षक का माइक बंद है';

  @override
  String get muteClass => 'कक्षा की आवाज़ बंद करें';

  @override
  String get unmuteClass => 'कक्षा की आवाज़ चालू करें';

  @override
  String get errNotStudent => 'यह ऐप विद्यार्थियों के लिए है। अपना विद्यार्थी लॉगिन बनवाने के लिए कॉलेज ऑफ़िस से कहें।';

  @override
  String get errGuardianAccount => 'यह ऐप विद्यार्थियों के लिए है। अभिभावक KINETIX Parent ऐप इस्तेमाल कर सकते हैं।';

  @override
  String get errTeacherAccount => 'यह ऐप विद्यार्थियों के लिए है। शिक्षक KINETIX Teacher ऐप इस्तेमाल कर सकते हैं।';

  @override
  String get errNotLinked => 'आपका लॉगिन अभी किसी विद्यार्थी रिकॉर्ड से नहीं जुड़ा है। इसे जोड़ने के लिए कॉलेज ऑफ़िस से कहें।';
}
