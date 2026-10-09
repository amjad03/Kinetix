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
  String get codeLab => 'कोड लैब';

  @override
  String get labs => 'प्रयोगशाला';

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

  @override
  String get errAccountInactive => 'आपका खाता सक्रिय नहीं है। अपने संस्थान के कार्यालय से पूछें।';

  @override
  String get errSignInAgain => 'आपका साइन इन समाप्त हो गया है। कृपया फिर से साइन इन करें।';

  @override
  String get errTooLarge => 'एक फ़ाइल बहुत बड़ी है। हर फ़ोटो या PDF ज़्यादा से ज़्यादा 8 MB की हो सकती है।';

  @override
  String get errConflict => 'इस बीच इसमें बदलाव हो गया। रीफ़्रेश करके फिर से कोशिश करें।';

  @override
  String get errSubjectNotInClass => 'यह विषय इस कक्षा में नहीं पढ़ाया जाता।';

  @override
  String get errSubmissionEmpty => 'जवाब लिखें या फ़ोटो जोड़ें।';

  @override
  String get errSubmissionChecked => 'यह होमवर्क पहले ही जाँचा जा चुका है।';

  @override
  String get calendar => 'कैलेंडर';

  @override
  String get calendarSubtitle => 'छुट्टियाँ, परीक्षाएँ और कार्यक्रम';

  @override
  String get upcoming => 'आने वाले';

  @override
  String get seeCalendar => 'पूरा कैलेंडर देखें';

  @override
  String get calendarEmpty => 'आने वाले महीनों में कोई छुट्टी, परीक्षा या कार्यक्रम नहीं है।';

  @override
  String get kindHoliday => 'छुट्टी';

  @override
  String get kindExams => 'परीक्षा';

  @override
  String get kindEvent => 'कार्यक्रम';

  @override
  String inDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count दिन में', one: '1 दिन में');
    return '$_temp0';
  }

  @override
  String forPrograms(String programs) {
    return '$programs के लिए';
  }

  @override
  String holidayToday(String title) {
    return 'आज छुट्टी है: $title';
  }

  @override
  String holidayTomorrow(String title) {
    return 'कल छुट्टी है: $title';
  }

  @override
  String get noClasses => 'कक्षाएँ नहीं होंगी।';

  @override
  String noClassesUntil(String date) {
    return '$date तक कक्षाएँ नहीं होंगी।';
  }

  @override
  String get notHandedIn => 'अभी जमा नहीं किया';

  @override
  String get statusHandedIn => 'जमा किया';

  @override
  String get statusChecked => 'जाँचा गया';

  @override
  String get statusReturned => 'दोबारा करने के लिए लौटाया';

  @override
  String handedInAt(String when) {
    return '$when को जमा किया';
  }

  @override
  String checkedByOn(String name, String date) {
    return '$name ने $date को जाँचा';
  }

  @override
  String returnedByOn(String name, String date) {
    return '$name ने $date को लौटाया';
  }

  @override
  String get teacherRemark => 'शिक्षक की टिप्पणी';

  @override
  String get answerLabel => 'जवाब';

  @override
  String get answerHint => 'जवाब यहाँ लिखें, या काम की फ़ोटो जोड़ें';

  @override
  String get handIn => 'जमा करें';

  @override
  String get handInAgain => 'फिर से जमा करें';

  @override
  String get handInTitle => 'होमवर्क जमा करें';

  @override
  String get handedInDone => 'जमा हो गया।';

  @override
  String get couldNotAddFile => 'वह फ़ाइल नहीं जुड़ पाई। फिर से कोशिश करें।';

  @override
  String fileTooBig(String name) {
    return '$name बहुत बड़ी है (ज़्यादा से ज़्यादा 8 MB)।';
  }

  @override
  String filesCount(int count, int max) {
    return 'फ़ोटो और PDF: $max में से $count';
  }

  @override
  String get removeFile => 'हटाएँ';

  @override
  String get takePhoto => 'फ़ोटो खींचें';

  @override
  String get choosePhotos => 'फ़ोटो चुनें';

  @override
  String get addPdf => 'PDF जोड़ें';

  @override
  String get filesHint => 'ज़्यादा से ज़्यादा 5 फ़ोटो या PDF, हर एक 8 MB तक। भेजने से पहले फ़ोटो छोटी की जाती हैं।';

  @override
  String uploading(String percent) {
    return 'भेजा जा रहा है… $percent';
  }

  @override
  String get photoNotLoaded => 'यह फ़ोटो लोड नहीं हो पाई।';

  @override
  String topicsTaught(int covered, int total) {
    return '$total में से $covered विषय-वस्तु पढ़ाई गई';
  }

  @override
  String get taught => 'पढ़ाया गया';

  @override
  String taughtOn(String date) {
    return '$date को पढ़ाया गया';
  }

  @override
  String get privacy => 'गोपनीयता';

  @override
  String get privacySubtitle => 'विद्यार्थी की जानकारी के साथ KINETIX क्या कर सकता है';

  @override
  String get notNow => 'अभी नहीं';

  @override
  String ifYouSayNo(String text) {
    return 'अगर आप मना करते हैं: $text';
  }

  @override
  String get changeAnyTime =>
      'आप ये विकल्प कभी भी प्रोफ़ाइल → गोपनीयता में बदल सकते हैं। बदलाव से पहले जो हो चुका है, उस पर इसका असर नहीं पड़ता।';

  @override
  String get readFullNotice => 'पूरी सूचना पढ़ें';

  @override
  String get allowAll => 'सबकी अनुमति दें';

  @override
  String get saveChoices => 'मेरे विकल्प सहेजें';

  @override
  String get notDecided => 'अभी तय नहीं किया';

  @override
  String decidedBy(String choice, String name, String date) {
    return '$choice · $name, $date';
  }

  @override
  String get allowed => 'अनुमति दी';

  @override
  String get notAllowed => 'अनुमति नहीं दी';

  @override
  String get choicesSaved => 'सहेज लिया।';

  @override
  String get privacyNotice => 'गोपनीयता सूचना';

  @override
  String noticeVersion(String version) {
    return 'संस्करण $version';
  }

  @override
  String get noticeWhoDecides => 'कौन तय करता है';

  @override
  String get noticeSchool => 'स्कूल (18 साल से कम उम्र के विद्यार्थी): बच्चे के लिए अभिभावक तय करते हैं।';

  @override
  String get noticeCollege =>
      'कॉलेज या विश्वविद्यालय: विद्यार्थी अपने लिए ख़ुद तय करते हैं। अभिभावक केवल उस विद्यार्थी के लिए तय करते हैं जिसका अपना KINETIX लॉगिन नहीं है।';

  @override
  String get noticeWhatWeAsk => 'हम किस बारे में पूछते हैं';

  @override
  String get noticeWhereKept => 'डेटा कहाँ रखा जाता है';

  @override
  String get noticeDataInIndia =>
      'सारा डेटा और AI की सारी प्रोसेसिंग भारत में ही रहती है। डेटा तब तक रखा जाता है जब तक विद्यार्थी संस्थान में है, और उसके बाद उतने समय तक जितना संस्थान की रिकॉर्ड नीति में ज़रूरी है।';

  @override
  String get noticeQuestions => 'सवाल और अनुरोध';

  @override
  String get noticeContact =>
      'संस्थान के शिकायत अधिकारी सवालों का जवाब देते हैं और डेटा देखने, सुधारने या मिटाने के अनुरोध सुनते हैं। उनसे संपर्क का तरीका संस्थान के कार्यालय से पूछें।';

  @override
  String get grievanceOfficer => 'शिकायत अधिकारी';

  @override
  String get noticeContactOfficer =>
      'संस्थान के शिकायत अधिकारी सवालों का जवाब देते हैं और डेटा देखने, सुधारने या मिटाने के अनुरोध सुनते हैं। उनसे यहाँ संपर्क करें:';

  @override
  String get contactEmail => 'ईमेल';

  @override
  String get contactPhone => 'फ़ोन';

  @override
  String get purposeDataTitle => 'रिकॉर्ड और सूचनाएँ';

  @override
  String get purposeDataBody =>
      'विद्यार्थी की उपस्थिति, होमवर्क, अंक, फ़ीस और पुस्तकालय के रिकॉर्ड रखना, ताकि संस्थान कक्षाएँ चला सके और आपको जानकारी देता रहे।';

  @override
  String get purposeDataNo => 'संस्थान वे रिकॉर्ड फिर भी रखेगा जो क़ानूनन ज़रूरी हैं; आपको ऐप में सूचनाएँ नहीं मिलेंगी।';

  @override
  String get purposeAiTitle => 'KINETIX AI';

  @override
  String get purposeAiBody =>
      'विद्यार्थी का संदेह दूर करने के लिए KINETIX AI से मदद माँगना। सवाल भारत के सर्वर पर प्रोसेस होते हैं और AI मॉडल सिखाने में इस्तेमाल नहीं होते।';

  @override
  String get purposeAiNo => 'विद्यार्थी के लिए KINETIX AI बंद हो जाएगा। बाक़ी सब काम करेगा।';

  @override
  String get purposeRecordingsTitle => 'कक्षा की रिकॉर्डिंग और लाइव कक्षाएँ';

  @override
  String get purposeRecordingsBody => 'कक्षा के साथ साझा की गई पाठ की रिकॉर्डिंग और लाइव कक्षाओं में विद्यार्थी की आवाज़ या तस्वीर आना।';

  @override
  String get purposeRecordingsNo =>
      'शिक्षकों से कहा जाएगा कि विद्यार्थी को रिकॉर्ड न करें; पहले से साझा की गई रिकॉर्डिंग कक्षा के पास रहेंगी।';

  @override
  String get purposePhotosTitle => 'फ़ोटो';

  @override
  String get purposePhotosBody => 'विद्यार्थी की फ़ोटो (जैसे होमवर्क पर या कक्षा की गतिविधियों में) कक्षा के साथ साझा करना।';

  @override
  String get purposePhotosNo => 'विद्यार्थी की फ़ोटो कक्षा के साथ साझा नहीं की जाएँगी।';

  @override
  String get errConsentGuardianDecides => 'स्कूल में ये विकल्प आपके अभिभावक चुनते हैं।';

  @override
  String get aiConsentWithdrawnTitle => 'KINETIX AI बंद है';

  @override
  String get aiConsentWithdrawnBody =>
      'KINETIX AI की अनुमति वापस ले ली गई है, इसलिए यह आपके लिए बंद है। बाक़ी सब काम करता है। किसने तय किया, यह देखने या बदलने के लिए प्रोफ़ाइल → गोपनीयता खोलें।';

  @override
  String get openPrivacy => 'गोपनीयता खोलें';

  @override
  String get errLiveNotAllowed => 'केवल स्कूल प्रमुख और विद्यार्थी ही कक्षाएँ देख सकते हैं।';

  @override
  String get errLiveViewOff => 'आपके संस्थान के लिए लाइव देखना बंद है।';

  @override
  String get errLiveNotStarted => 'आपके शिक्षक ने लाइव कक्षा शुरू नहीं की है।';

  @override
  String get errLiveUnknownBoard => 'यह कक्षा बोर्ड पहचाना नहीं गया। अपने शिक्षक से पूछें कि कौन-सी कक्षा देखनी है।';

  @override
  String get errLiveNoClass => 'इस बोर्ड पर अभी कोई कक्षा नहीं चल रही है।';

  @override
  String get errLiveNotYourClass => 'यह आपकी कक्षा नहीं है।';

  @override
  String get yourWork => 'आपका काम';

  @override
  String get returnedNote => 'आपके शिक्षक ने इसे फिर से करने को कहा है। टिप्पणी पढ़ें, फिर दोबारा जमा करें।';

  @override
  String get consentTitle => 'आपकी गोपनीयता के विकल्प';

  @override
  String get consentIntro => 'चुनें कि KINETIX आपकी जानकारी के साथ क्या कर सकता है। जब तक आप नहीं चुनते, कुछ भी चालू नहीं होता।';

  @override
  String get privacyIntro => 'KINETIX आपकी जानकारी के साथ क्या कर सकता है। अनुमति वापस लेने के लिए स्विच बंद करें।';

  @override
  String get privacyIntroReadOnly => 'KINETIX आपकी जानकारी के साथ क्या कर सकता है, और किसने तय किया।';

  @override
  String get managedByParent => 'इसे आपके अभिभावक संभालते हैं। स्कूल में ये विकल्प आपके अभिभावक KINETIX Parent ऐप में चुनते हैं।';

  @override
  String get thisWeekInClass => 'इस हफ़्ते कक्षा में';

  @override
  String get nextWeekInClass => 'अगले हफ़्ते';

  @override
  String get nothingPlannedThisWeek => 'इस हफ़्ते के लिए कोई नई विषय-वस्तु तय नहीं है।';

  @override
  String get planOnSchedule => 'कक्षा योजना के अनुसार चल रही है';

  @override
  String get planAhead => 'कक्षा योजना से आगे चल रही है';

  @override
  String planBehind(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'कक्षा योजना से $count विषय-वस्तु पीछे है',
      one: 'कक्षा योजना से 1 विषय-वस्तु पीछे है',
    );
    return '$_temp0';
  }

  @override
  String get comingUpInClass => 'कक्षा में आगे';

  @override
  String get readAhead => 'कक्षा में ये विषय-वस्तु पढ़ाई जानी हैं। चाहें तो पहले से पढ़ लें।';

  @override
  String get phoneNumber => 'मोबाइल नंबर';

  @override
  String get enterPhone => 'अपना मोबाइल नंबर डालें';

  @override
  String get enterValidMobile => '10 अंकों का मोबाइल नंबर डालें';

  @override
  String get sendCode => 'कोड भेजें';

  @override
  String otpSentTo(String phone) {
    return '$phone पर भेजा गया 6 अंकों का कोड डालें';
  }

  @override
  String get otpCode => '6 अंकों का कोड';

  @override
  String get enterOtp => '6 अंकों का कोड डालें';

  @override
  String get resendCode => 'कोड फिर से भेजें';

  @override
  String resendIn(String time) {
    return '$time में कोड फिर से भेजें';
  }

  @override
  String get changeNumber => 'नंबर बदलें';

  @override
  String get usePassword => 'इसके बजाय पासवर्ड इस्तेमाल करें';

  @override
  String get usePhoneCode => 'इसके बजाय फ़ोन पर कोड पाएँ';

  @override
  String get errOtpInvalid => 'यह कोड गलत है या इसका समय खत्म हो गया है। SMS देखें या नया कोड मँगाएँ।';

  @override
  String get errOtpTooMany => 'बहुत ज़्यादा कोड मँगाए गए। कुछ मिनट रुककर फिर से कोशिश करें।';

  @override
  String get notificationsTitle => 'इस फ़ोन पर सूचनाएँ पाएँ?';

  @override
  String get notificationsAllow => 'चालू करें';

  @override
  String get otpHint => 'आपके कॉलेज में दर्ज फ़ोन नंबर पर हम एक कोड भेजेंगे';

  @override
  String get notificationsBody =>
      'नया होमवर्क, परिणाम, लाइव कक्षाएँ और कॉलेज के संदेश आने पर हम आपको बताएँगे। आप इसे कभी भी फ़ोन की सेटिंग में बदल सकते हैं।';

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
  String recordingAvailableUntil(String date) {
    return '$date तक उपलब्ध';
  }

  @override
  String get conceptVideos => 'कॉन्सेप्ट वीडियो';

  @override
  String get conceptVideosHint => 'कक्षा से पहले झलक के लिए और कक्षा के बाद दोहराने के लिए देखें।';

  @override
  String get conceptVideosFromYouTube => 'यूट्यूब से चलता है';

  @override
  String get conceptVideoSourcePlatform => 'KINETIX';

  @override
  String get conceptVideoSourceInstitution => 'स्कूल';

  @override
  String get conceptVideoSourceTeacher => 'शिक्षक';

  @override
  String get conceptVideosUnsupported => 'वीडियो यहाँ नहीं चल सकते। अपने फ़ोन पर विद्यार्थी ऐप का उपयोग करें।';

  @override
  String conceptVideoPlay(String title) {
    return '$title चलाएँ';
  }

  @override
  String get liveQuestion => 'लाइव प्रश्न';

  @override
  String get liveQuestionTapToAnswer => 'उत्तर देने के लिए टैप करें';

  @override
  String liveQuestionYourAnswer(String answer) {
    return 'आपका उत्तर: $answer (आप बदल सकते हैं)';
  }

  @override
  String get liveQuestionYourNumber => 'आपका उत्तर';

  @override
  String get liveQuestionSend => 'उत्तर भेजें';

  @override
  String get liveQuestionNotNumber => 'कोई संख्या लिखें, जैसे 2.5';

  @override
  String get liveQuestionYourWords => 'आपका उत्तर (एक से तीन शब्द)';

  @override
  String get liveQuestionNotWords => 'एक से तीन शब्द लिखें';

  @override
  String get liveQuestionClosed => 'आपके शिक्षक ने यह प्रश्न समाप्त कर दिया है।';

  @override
  String get careersTitle => 'करियर और प्लेसमेंट';

  @override
  String get careersSubtitle => 'कैंपस ड्राइव, प्रस्ताव और इंटर्नशिप';

  @override
  String careersAcademics(Object cgpa, int backlogs) {
    String _temp0 = intl.Intl.pluralLogic(
      backlogs,
      locale: localeName,
      other: '$backlogs बैकलॉग',
      one: '1 बैकलॉग',
      zero: 'कोई बैकलॉग नहीं',
    );
    return 'CGPA $cgpa · $_temp0';
  }

  @override
  String get careersNoResult => 'अभी कोई परिणाम प्रकाशित नहीं';

  @override
  String get careersDrives => 'ड्राइव';

  @override
  String get careersNoDrives => 'अभी कोई ड्राइव खुला नहीं है।';

  @override
  String get careersOffers => 'प्रस्ताव';

  @override
  String get careersInternships => 'इंटर्नशिप';

  @override
  String get careersPlaced => 'एक प्रस्ताव स्वीकार किया गया है। बधाई!';

  @override
  String get careersRegister => 'पंजीकरण करें';

  @override
  String get careersWithdraw => 'वापस लें';

  @override
  String get careersAccept => 'स्वीकार करें';

  @override
  String get careersDecline => 'अस्वीकार करें';

  @override
  String get careersViewOnly => 'आप यहाँ ड्राइव और प्रस्ताव देख सकते हैं। पंजीकरण और प्रस्ताव का उत्तर केवल आपका बच्चा दे सकता है।';

  @override
  String careersPackage(Object ctc) {
    return 'प्रति वर्ष $ctc लाख';
  }

  @override
  String careersMinCgpa(Object cgpa) {
    return 'न्यूनतम CGPA $cgpa';
  }

  @override
  String careersRegisteredNote(Object drive) {
    return 'आप $drive के लिए पंजीकृत हैं';
  }

  @override
  String get careersReg_registered => 'पंजीकृत';

  @override
  String get careersReg_shortlisted => 'चयन सूची में';

  @override
  String get careersReg_rejected => 'चयनित नहीं';

  @override
  String get careersReg_selected => 'चयनित';

  @override
  String get careersReg_withdrawn => 'वापस लिया';

  @override
  String get careersOffer_offered => 'उत्तर की प्रतीक्षा';

  @override
  String get careersOffer_accepted => 'स्वीकृत';

  @override
  String get careersOffer_declined => 'अस्वीकृत';

  @override
  String get careersOffer_withdrawn => 'कंपनी ने वापस लिया';

  @override
  String get careersOffer_expired => 'अवधि समाप्त';

  @override
  String get careersReason_not_open => 'पंजीकरण के लिए खुला नहीं';

  @override
  String get careersReason_deadline_passed => 'पंजीकरण बंद हो चुका है';

  @override
  String get careersReason_no_results => 'अभी कोई परिणाम प्रकाशित नहीं';

  @override
  String get careersReason_cgpa_below => 'CGPA न्यूनतम से कम है';

  @override
  String get careersReason_backlogs_exceeded => 'बैकलॉग अधिक हैं';

  @override
  String get careersReason_program_not_eligible => 'आपके पाठ्यक्रम के लिए खुला नहीं';

  @override
  String get grievancesTitle => 'शिकायतें';

  @override
  String get grievancesSubtitle => 'अपनी समस्या दर्ज करें और समाधान तक देखें';

  @override
  String get grievanceNone => 'अभी कोई शिकायत दर्ज नहीं हुई।';

  @override
  String get grievanceRaise => 'शिकायत दर्ज करें';

  @override
  String get grievanceCategory => 'श्रेणी';

  @override
  String get grievanceSubject => 'विषय';

  @override
  String get grievanceDescription => 'क्या हुआ?';

  @override
  String get grievanceAnonymous => 'कर्मचारियों से मेरा नाम छिपाएँ';

  @override
  String get grievanceAnonymousHint => 'टीम नहीं देख पाएगी कि किसने दर्ज किया। आप इसे यहाँ देख सकते हैं।';

  @override
  String get grievanceConfidentialHint => 'रैगिंग और उत्पीड़न के मामले गोपनीय समिति के पास जाते हैं। उन्हें कोई और नहीं पढ़ सकता।';

  @override
  String get grievanceSubmit => 'जमा करें';

  @override
  String grievanceRecorded(Object ticketNo) {
    return 'आपकी शिकायत $ticketNo के रूप में दर्ज हुई';
  }

  @override
  String grievanceDue(Object date) {
    return '$date तक उत्तर';
  }

  @override
  String get grievanceResolution => 'समाधान';

  @override
  String get grievanceRate => 'समाधान से आप कितने संतुष्ट हैं?';

  @override
  String get grievanceRated => 'रेटिंग के लिए धन्यवाद';

  @override
  String get grievanceAnonymousTag => 'अज्ञात';

  @override
  String get grievanceCat_academic => 'शैक्षणिक';

  @override
  String get grievanceCat_exam => 'परीक्षा';

  @override
  String get grievanceCat_fees => 'शुल्क';

  @override
  String get grievanceCat_hostel => 'छात्रावास';

  @override
  String get grievanceCat_transport => 'परिवहन';

  @override
  String get grievanceCat_infrastructure => 'अवसंरचना';

  @override
  String get grievanceCat_staff_conduct => 'कर्मचारी आचरण';

  @override
  String get grievanceCat_ragging => 'रैगिंग';

  @override
  String get grievanceCat_harassment => 'उत्पीड़न';

  @override
  String get grievanceCat_other => 'अन्य';

  @override
  String get grievanceStatus_open => 'प्राप्त';

  @override
  String get grievanceStatus_assigned => 'टीम के सदस्य के पास';

  @override
  String get grievanceStatus_in_progress => 'जाँच जारी है';

  @override
  String get grievanceStatus_escalated => 'वरिष्ठ को भेजी गई';

  @override
  String get grievanceStatus_resolved => 'हल हो गई';

  @override
  String get grievanceStatus_closed => 'बंद';

  @override
  String get grievanceStatus_reopened => 'फिर खोली गई';

  @override
  String get examsTitle => 'परीक्षाएँ';

  @override
  String get examTimetable => 'समय-सारणी';

  @override
  String get examResultsTitle => 'परिणाम';

  @override
  String get noExamsScheduled => 'अभी कोई परीक्षा निर्धारित नहीं है। कॉलेज के समय-सारणी जारी करने पर वह यहाँ दिखेगी।';

  @override
  String get noExamResults => 'अभी कोई परिणाम जारी नहीं हुआ।';

  @override
  String examDates(String from, String to) {
    return '$from – $to';
  }

  @override
  String examPaperTime(String start, String end) {
    return '$start – $end';
  }

  @override
  String examSeat(String room, int seat) {
    return '$room · सीट $seat';
  }

  @override
  String examMaxMarks(int n) {
    return '$n अंक';
  }

  @override
  String get hallTicket => 'प्रवेश-पत्र';

  @override
  String get hallTicketDownload => 'प्रवेश-पत्र डाउनलोड करें';

  @override
  String hallTicketWithheld(String reason) {
    return 'प्रवेश-पत्र रोका गया है: $reason';
  }

  @override
  String get hallTicketWithheldNoReason => 'प्रवेश-पत्र रोका गया है। परीक्षा कार्यालय से संपर्क करें।';

  @override
  String get hallTicketNotIssued => 'प्रवेश-पत्र अभी जारी नहीं हुआ।';

  @override
  String get fileOpenFailed => 'यह फ़ाइल नहीं खुल सकी। PDF खोलने वाला कोई ऐप इंस्टॉल करें।';

  @override
  String get sgpaLabel => 'SGPA';

  @override
  String get cgpaLabel => 'CGPA';

  @override
  String cgpaLine(String value) {
    return 'CGPA $value';
  }

  @override
  String sgpaLine(String value) {
    return 'SGPA $value';
  }

  @override
  String get resultPass => 'उत्तीर्ण';

  @override
  String get resultFail => 'उत्तीर्ण नहीं';

  @override
  String resultLine(String percent, String grade) {
    return '$percent% · ग्रेड $grade';
  }

  @override
  String get revaluationRequest => 'पुनर्मूल्यांकन का अनुरोध करें';

  @override
  String get revaluationWhy => 'इस पेपर की दोबारा जाँच क्यों होनी चाहिए?';

  @override
  String get revaluationNeedReason => 'कुछ शब्द लिखें (कम से कम 3 अक्षर)।';

  @override
  String get revaluationSent => 'अनुरोध भेज दिया गया। परीक्षा कार्यालय निर्णय लेगा।';

  @override
  String get revaluationRequested => 'पुनर्मूल्यांकन का अनुरोध किया गया';

  @override
  String get revaluationAccepted => 'पुनर्मूल्यांकन स्वीकृत';

  @override
  String get revaluationRejected => 'पुनर्मूल्यांकन अस्वीकृत';

  @override
  String get revaluationCompleted => 'पुनर्मूल्यांकन पूरा';

  @override
  String get examDone => 'पूर्ण';

  @override
  String get navMyLearning => 'मेरी पढ़ाई';

  @override
  String get navExams => 'परीक्षाएँ';

  @override
  String get navMore => 'और';

  @override
  String get homeSubtitle => 'सीखते रहें, आगे बढ़ते रहें!';

  @override
  String get notificationsTooltip => 'सूचनाएँ';

  @override
  String get nextClass => 'अगली कक्षा';

  @override
  String get nextClassNone => 'अभी कोई कक्षा निर्धारित नहीं है।';

  @override
  String nextClassLive(String subject) {
    return '$subject अभी लाइव है';
  }

  @override
  String nextClassTopic(String subject) {
    return '$subject में आगे';
  }

  @override
  String get watchLive => 'जुड़ें';

  @override
  String get viewAction => 'देखें';

  @override
  String get tilePendingAssignments => 'असाइनमेंट';

  @override
  String tilePendingValue(int n) {
    return '$n लंबित';
  }

  @override
  String get tileAllDone => 'सब पूरा';

  @override
  String get tileUpcomingExam => 'आगामी परीक्षा';

  @override
  String tileExamDays(int n) {
    return '$n दिन में';
  }

  @override
  String get tileExamToday => 'आज';

  @override
  String get tileExamNone => 'अभी कोई नहीं';

  @override
  String get tileStreak => 'सीखने की लय';

  @override
  String tileStreakDays(int n) {
    String _temp0 = intl.Intl.pluralLogic(n, locale: localeName, other: '$n दिन', one: '1 दिन');
    return '$_temp0';
  }

  @override
  String get continueLearning => 'पढ़ाई जारी रखें';

  @override
  String get continueLearningEmpty => 'KINETIX AI से कोई शंका पूछें या मेरी पढ़ाई से कोई विषय खोलें।';

  @override
  String continueProgress(int taught, int total) {
    return '$total में से $taught विषय पढ़ाए गए';
  }

  @override
  String get moreSchoolLife => 'कैंपस';

  @override
  String get leaveApplyTitle => 'अवकाश के लिए आवेदन';

  @override
  String get leaveScreenTitle => 'अवकाश';

  @override
  String get leaveFromLabel => 'से';

  @override
  String get leaveToLabel => 'तक';

  @override
  String get leaveReasonLabel => 'कारण';

  @override
  String get leaveReasonRequired => 'कुछ शब्द लिखें (कम से कम 3 अक्षर)।';

  @override
  String get leaveSend => 'अनुरोध भेजें';

  @override
  String get leaveSentSnack => 'अनुरोध आपके कक्षा शिक्षक को भेज दिया गया।';

  @override
  String get leaveNone => 'अभी कोई अवकाश आवेदन नहीं।';

  @override
  String get leaveStatusPending => 'प्रतीक्षा में';

  @override
  String get leaveStatusApproved => 'स्वीकृत';

  @override
  String get leaveStatusRejected => 'स्वीकृत नहीं';

  @override
  String get leaveStatusCancelled => 'वापस लिया गया';

  @override
  String get leaveWithdraw => 'वापस लें';

  @override
  String get leaveToBeforeFrom => 'अंतिम दिन पहले दिन से पहले नहीं हो सकता।';

  @override
  String get busTitle => 'मेरी बस';

  @override
  String get busNone => 'आपके पास बस की सीट नहीं है। परिवहन कार्यालय से पूछें।';

  @override
  String get busRoute => 'मार्ग';

  @override
  String get busYourStop => 'आपका स्टॉप';

  @override
  String get busPickup => 'पिकअप';

  @override
  String get busVehicle => 'वाहन';

  @override
  String get busStopsHeading => 'स्टॉप';

  @override
  String busEta(int n) {
    return 'आपके स्टॉप पर लगभग $n मिनट में पहुँचेगी';
  }

  @override
  String get busPassed => 'बस आपके स्टॉप से निकल चुकी है';

  @override
  String busStopsAway(int n) {
    String _temp0 = intl.Intl.pluralLogic(n, locale: localeName, other: '$n स्टॉप दूर', one: '1 स्टॉप दूर', zero: 'आपके स्टॉप पर');
    return '$_temp0';
  }

  @override
  String get busNotRunning => 'बस अभी सड़क पर नहीं है।';

  @override
  String get gatePassTitle => 'हॉस्टल गेट पास';

  @override
  String get gatePassNotResident => 'आप हॉस्टल में नहीं हैं। गेट पास हॉस्टल के निवासियों के लिए हैं।';

  @override
  String gatePassRoom(String block, String room) {
    return '$block · कमरा $room';
  }

  @override
  String get gatePassRequest => 'गेट पास का अनुरोध';

  @override
  String get gatePassReason => 'कारण';

  @override
  String get gatePassDestination => 'आप कहाँ जा रहे हैं?';

  @override
  String get gatePassBackBy => 'वापसी का समय';

  @override
  String get gatePassSend => 'वार्डन को भेजें';

  @override
  String get gatePassSent => 'अनुरोध वार्डन को भेज दिया गया।';

  @override
  String get gatePassBackFuture => 'भविष्य का वापसी समय चुनें।';

  @override
  String get gatePassNone => 'अभी कोई गेट पास नहीं।';

  @override
  String get gatePassRequested => 'वार्डन की प्रतीक्षा';

  @override
  String get gatePassIssued => 'स्वीकृत';

  @override
  String get gatePassOut => 'हॉस्टल से बाहर';

  @override
  String get gatePassReturned => 'लौट आए';

  @override
  String get gatePassRejected => 'स्वीकृत नहीं';

  @override
  String get gatePassCancelled => 'रद्द';

  @override
  String gatePassBackLine(String when) {
    return '$when तक वापसी';
  }

  @override
  String get certificatesTitle => 'प्रमाणपत्र';

  @override
  String get certificateRequestAction => 'प्रमाणपत्र का अनुरोध';

  @override
  String get certificateChoose => 'कौन सा प्रमाणपत्र?';

  @override
  String get certificatePurpose => 'यह किसलिए चाहिए? (वैकल्पिक)';

  @override
  String get certificateRequiredField => 'यह खाना भरें।';

  @override
  String get certificateSent => 'अनुरोध कार्यालय को भेज दिया गया।';

  @override
  String get certificateNone => 'अभी कोई प्रमाणपत्र नहीं।';

  @override
  String get certificateNoTemplates => 'कॉलेज ने अनुरोध के लिए कोई प्रमाणपत्र नहीं खोला है।';

  @override
  String get certificateRequested => 'कार्यालय की प्रतीक्षा';

  @override
  String get certificateApproved => 'स्वीकृत, तैयार हो रहा है';

  @override
  String get certificateRejected => 'स्वीकृत नहीं';

  @override
  String get certificateIssued => 'डाउनलोड के लिए तैयार';

  @override
  String get certificateRevoked => 'कॉलेज ने वापस ले लिया';

  @override
  String get certificateDownload => 'PDF डाउनलोड करें';

  @override
  String certificateSerial(String serial) {
    return 'क्र. $serial';
  }

  @override
  String get coursesNone => 'अभी कोई पाठ्यक्रम नहीं। शिक्षकों के प्रकाशित करने पर यहाँ दिखेंगे।';

  @override
  String courseModulesCount(int count) {
    return '$count मॉड्यूल';
  }

  @override
  String get courseGradeTitle => 'अब तक का ग्रेड';

  @override
  String get courseNoGrade => 'अभी कुछ भी ग्रेड नहीं हुआ है।';

  @override
  String get courseAnnouncements => 'घोषणाएँ';

  @override
  String get courseNoModules => 'अभी कोई मॉड्यूल नहीं।';

  @override
  String get coursesTab => 'पाठ्यक्रम';

  @override
  String get scholarshipTitle => 'छात्रवृत्ति';

  @override
  String get scholarshipNone => 'अभी कोई छात्रवृत्ति आवेदन के लिए खुली नहीं है।';

  @override
  String scholarshipPercentOff(int count) {
    return 'आपकी फ़ीस में $count% की छूट';
  }

  @override
  String scholarshipAmountOff(String amount) {
    return 'आपकी फ़ीस में $amount की छूट';
  }

  @override
  String scholarshipMinMarks(int count) {
    return 'प्रकाशित अंकों में कम से कम $count% चाहिए';
  }

  @override
  String scholarshipMaxIncome(String amount) {
    return 'पारिवारिक आय $amount तक';
  }

  @override
  String get scholarshipApply => 'आवेदन करें';

  @override
  String get scholarshipMine => 'मेरे आवेदन';

  @override
  String scholarshipAwarded(String amount) {
    return 'आपकी फ़ीस से $amount घटाए गए';
  }

  @override
  String get scholarshipIncomeLabel => 'वार्षिक पारिवारिक आय (₹)';

  @override
  String get scholarshipIncomeRequired => 'पारिवारिक आय संख्या में लिखें।';

  @override
  String get scholarshipNoteLabel => 'कॉलेज को कुछ बताना हो तो (वैकल्पिक)';

  @override
  String get scholarshipSend => 'आवेदन भेजें';

  @override
  String get scholarshipSentSnack => 'आवेदन लेखा कार्यालय को भेज दिया गया।';

  @override
  String get walletTitle => 'हॉस्टल और कैंटीन';

  @override
  String get walletHostel => 'हॉस्टल';

  @override
  String walletBedLine(Object block, Object room, Object bed) {
    return '$block, कमरा $room, बिस्तर $bed';
  }

  @override
  String get walletNotInHostel => 'आप हॉस्टल में नहीं हैं';

  @override
  String get walletNights => 'रात की हाज़िरी';

  @override
  String get walletNoNights => 'अभी कोई हाज़िरी नहीं';

  @override
  String get walletPresent => 'उपस्थित';

  @override
  String get walletAbsent => 'अनुपस्थित';

  @override
  String get walletLeave => 'छुट्टी पर';

  @override
  String get walletCanteen => 'कैंटीन वॉलेट';

  @override
  String get walletBalance => 'बैलेंस';

  @override
  String get walletAddMoney => 'पैसे जोड़ें';

  @override
  String walletAdded(Object amount) {
    return 'आपके वॉलेट में $amount जुड़ गए';
  }

  @override
  String get walletMeals => 'हाल के भोजन';

  @override
  String get walletNoMeals => 'अभी कोई भोजन नहीं';

  @override
  String get walletBreakfast => 'नाश्ता';

  @override
  String get walletLunch => 'दोपहर का भोजन';

  @override
  String get walletSnacks => 'जलपान';

  @override
  String get walletDinner => 'रात का भोजन';

  @override
  String get walletEnterAmount => 'राशि लिखें';

  @override
  String get walletEnterRupees => 'रुपयों में राशि लिखें';

  @override
  String get walletMinAmount => 'कम से कम ₹1 जोड़ सकते हैं';

  @override
  String get walletStarting => 'भुगतान शुरू हो रहा है…';

  @override
  String get walletConfirming => 'भुगतान की पुष्टि हो रही है…';

  @override
  String get walletCancelled => 'भुगतान रद्द हुआ';

  @override
  String get walletFailedTitle => 'भुगतान नहीं हो पाया';

  @override
  String get walletCouldNotConfirm => 'भुगतान की पुष्टि नहीं हो पाई';

  @override
  String get walletNotSetUp => 'ऑनलाइन भुगतान अभी शुरू नहीं हुआ है। कैंटीन काउंटर पर पैसे जमा करें।';

  @override
  String get walletPhonesOnly => 'ऑनलाइन भुगतान Android फ़ोन और iPhone पर चलता है।';

  @override
  String get walletFailNoConfirm => 'भुगतान ऐप से पुष्टि नहीं मिली। अगर आपके खाते से पैसे कटे हैं तो वॉलेट जल्द अपडेट हो जाएगा।';

  @override
  String get walletFailOpen => 'भुगतान स्क्रीन नहीं खुल पाई। फिर कोशिश करें।';

  @override
  String get walletFailNetwork => 'इंटरनेट नहीं है। जाँचकर फिर कोशिश करें।';

  @override
  String get walletFailGeneric => 'भुगतान नहीं हो पाया। फिर कोशिश करें।';

  @override
  String walletFinishIn(Object app) {
    return '$app में पूरा करें';
  }

  @override
  String get walletInWalletBody => 'उस ऐप में भुगतान पूरा करें। पूरा होते ही वॉलेट अपडेट हो जाएगा।';

  @override
  String get walletDemo => 'डेमो भुगतान';

  @override
  String get walletDemoNoMoney => 'डेमो भुगतान: कोई पैसा नहीं कटता';

  @override
  String walletDemoPay(Object amount) {
    return '$amount चुकाएँ';
  }

  @override
  String get walletAmount => 'राशि';

  @override
  String get courseRegTitle => 'पाठ्यक्रम पंजीकरण';

  @override
  String courseRegCredits(String registered, String max, String min) {
    return 'क्रेडिट: $registered / $max (कम से कम $min)';
  }

  @override
  String courseRegAddDropUntil(String when) {
    return 'आप $when तक जोड़ या छोड़ सकते हैं।';
  }

  @override
  String get courseRegClosed => 'अभी आपके लिए पंजीकरण खुला नहीं है।';

  @override
  String get courseRegNoTerm => 'अभी पंजीकरण के लिए कोई सत्र नहीं है।';

  @override
  String get courseRegNoOfferings => 'इस सत्र में अभी कोई पाठ्यक्रम नहीं है।';

  @override
  String get courseRegMine => 'मेरे पंजीकरण';

  @override
  String get courseRegAvailable => 'उपलब्ध पाठ्यक्रम';

  @override
  String get courseRegRegister => 'पंजीकरण करें';

  @override
  String get courseRegDrop => 'छोड़ें';

  @override
  String courseRegDropTitle(String name) {
    return '$name छोड़ें?';
  }

  @override
  String get courseRegRegisteredNow => 'आपका पंजीकरण हो गया।';

  @override
  String get courseRegDropped => 'पाठ्यक्रम छोड़ दिया गया।';

  @override
  String get courseRegCore => 'मुख्य';

  @override
  String get courseRegElective => 'वैकल्पिक';

  @override
  String courseRegCreditsOf(String n) {
    return '$n क्रेडिट';
  }

  @override
  String courseRegSeatsLeft(String n) {
    return '$n सीटें बाकी';
  }

  @override
  String get courseRegFull => 'भरा हुआ';

  @override
  String get courseRegRegisteredPill => 'पंजीकृत';

  @override
  String get courseRegWaitlisted => 'प्रतीक्षा सूची में';

  @override
  String get courseRegNotAllotted => 'आवंटित नहीं';

  @override
  String courseRegRanked(String rank) {
    return 'पसंद $rank';
  }

  @override
  String get courseRegApprovalPending => 'मंज़ूरी की प्रतीक्षा';

  @override
  String get courseRegApproved => 'मंज़ूर';

  @override
  String get courseRegRejected => 'मंज़ूर नहीं';

  @override
  String get courseRegRank => 'वैकल्पिक विषयों को क्रम दें';

  @override
  String get courseRegRankHelp =>
      'जो वैकल्पिक विषय चाहिए उन्हें चुनें और सबसे ज़्यादा पसंद वाले को ऊपर रखें। भरे हुए पाठ्यक्रमों की सीटें इसी क्रम से मिलती हैं।';

  @override
  String get courseRegRankSave => 'क्रम सहेजें';

  @override
  String get courseRegRankSaved => 'आपकी पसंद सहेज ली गई।';

  @override
  String get courseRegRankNone => 'क्रम देने के लिए कोई वैकल्पिक विषय नहीं है।';

  @override
  String get passportTitle => 'परिणाम पासपोर्ट';

  @override
  String get passportVerified => 'संस्था द्वारा सत्यापित';

  @override
  String get passportNotVerified => 'संस्था द्वारा अभी सत्यापित नहीं';

  @override
  String get passportSkills => 'कौशल';

  @override
  String get passportNoSkills => 'अभी कोई कौशल दर्ज नहीं है।';

  @override
  String passportLevel(String n) {
    return 'स्तर $n / 5';
  }

  @override
  String get passportNoEvidence => 'अभी कोई प्रमाण नहीं';

  @override
  String get passportCertificates => 'प्रमाणपत्र';

  @override
  String get passportActivities => 'क्लब और कार्यक्रम';

  @override
  String get passportDownload => 'PDF डाउनलोड करें';

  @override
  String get surveysTitle => 'सर्वेक्षण';

  @override
  String get surveysNone => 'आपके लिए कोई सर्वेक्षण बाकी नहीं है।';

  @override
  String get surveyAnonymous => 'आपके उत्तर गोपनीय हैं।';

  @override
  String get surveySubmit => 'जमा करें';

  @override
  String get surveySent => 'धन्यवाद। आपके उत्तर भेज दिए गए।';

  @override
  String get surveyRequired => 'कृपया ज़रूरी प्रश्नों के उत्तर दें।';

  @override
  String get surveyOptional => 'वैकल्पिक';

  @override
  String surveyClosesOn(String when) {
    return '$when को बंद होगा';
  }

  @override
  String get surveyAnswerHint => 'आपका उत्तर';

  @override
  String get campusLifeTitle => 'क्लब और कार्यक्रम';

  @override
  String get campusTabClubs => 'क्लब';

  @override
  String get campusTabEvents => 'कार्यक्रम';

  @override
  String get campusTabPasses => 'मेरे पास';

  @override
  String get clubJoin => 'जुड़ें';

  @override
  String get clubLeave => 'छोड़ें';

  @override
  String get clubRequested => 'मंज़ूरी की प्रतीक्षा';

  @override
  String get clubMember => 'सदस्य';

  @override
  String clubPoints(String n) {
    return '$n अंक';
  }

  @override
  String get clubsNone => 'अभी कोई क्लब नहीं है।';

  @override
  String get clubJoinSent => 'अनुरोध भेज दिया गया। समन्वयक इसे मंज़ूर करेंगे।';

  @override
  String get eventsNone => 'पंजीकरण के लिए कोई कार्यक्रम खुला नहीं है।';

  @override
  String get eventRegister => 'पंजीकरण करें';

  @override
  String get eventJoinWaitlist => 'प्रतीक्षा सूची में जुड़ें';

  @override
  String get eventCancelRegistration => 'पंजीकरण रद्द करें';

  @override
  String get eventRegisteredPill => 'आप पंजीकृत हैं';

  @override
  String get eventWaitlistedPill => 'प्रतीक्षा सूची में';

  @override
  String eventSeatsLeft(String n) {
    return '$n सीटें बाकी';
  }

  @override
  String eventFee(String amount) {
    return 'शुल्क $amount';
  }

  @override
  String get eventFree => 'निःशुल्क';

  @override
  String get passNone => 'आपने किसी कार्यक्रम के लिए पंजीकरण नहीं किया है।';

  @override
  String get passShowAtDoor => 'दरवाज़े पर यह कोड दिखाएँ';

  @override
  String get passCheckedIn => 'प्रवेश दर्ज';

  @override
  String get passFeedback => 'प्रतिक्रिया दें';

  @override
  String get passFeedbackDone => 'प्रतिक्रिया भेजी गई';

  @override
  String get passFeedbackTitle => 'कैसा रहा?';

  @override
  String get passFeedbackComment => 'टिप्पणी (वैकल्पिक)';

  @override
  String get passFeedbackSend => 'भेजें';

  @override
  String get passFeedbackThanks => 'आपकी प्रतिक्रिया के लिए धन्यवाद।';

  @override
  String get classNotesTitle => 'कक्षा नोट्स और सारांश';

  @override
  String get classNotesRecaps => 'पाठ का सारांश';

  @override
  String get classNotesBoards => 'व्हाइटबोर्ड';

  @override
  String get classNotesEmpty => 'आपकी कक्षा के साथ अभी कुछ साझा नहीं किया गया है।';

  @override
  String get classNotesNoRecap => 'इस पाठ का सारांश अभी तैयार नहीं है।';

  @override
  String get classNotesKeyPoints => 'मुख्य बिंदु';

  @override
  String get classNotesWatch => 'पाठ देखें';

  @override
  String get attendanceEnterCode => 'स्वयं को उपस्थित दर्ज करें';

  @override
  String get attendanceCodeHint => 'शिक्षक की स्क्रीन पर दिखा कोड';

  @override
  String get attendanceCodeSubmit => 'मुझे उपस्थित दर्ज करें';

  @override
  String get attendanceMarkedPresent => 'आप उपस्थित दर्ज हो गए हैं।';

  @override
  String get attendanceAlreadyMarked => 'इस पीरियड की आपकी उपस्थिति पहले ही दर्ज है।';

  @override
  String get dpdpTitle => 'मेरे डेटा के अधिकार';

  @override
  String get dpdpSubtitle => 'अपना डेटा डाउनलोड, सुधार या मिटाएँ';

  @override
  String get dpdpOfficerTitle => 'शिकायत अधिकारी';

  @override
  String get dpdpOfficerNone => 'अभी कोई शिकायत अधिकारी नामित नहीं है। स्कूल कार्यालय को लिखें।';

  @override
  String get dpdpExportTitle => 'मेरा डेटा डाउनलोड करें';

  @override
  String get dpdpExportBody => 'देखें कि स्कूल के पास आपके बारे में क्या-क्या है।';

  @override
  String get dpdpExportAction => 'सार दिखाएँ';

  @override
  String get dpdpExportPdf => 'पीडीएफ़ में खोलें';

  @override
  String get dpdpRecords => 'रिकॉर्ड';

  @override
  String get dpdpCorrectTitle => 'मेरे विवरण सुधारें';

  @override
  String get dpdpField => 'सुधारने का विवरण';

  @override
  String get dpdpFieldName => 'नाम';

  @override
  String get dpdpFieldEmail => 'ईमेल';

  @override
  String get dpdpFieldPhone => 'फ़ोन';

  @override
  String get dpdpNewValue => 'सही जानकारी';

  @override
  String get dpdpCorrectSend => 'सुधार का अनुरोध भेजें';

  @override
  String get dpdpNeedValue => 'सही जानकारी भरें।';

  @override
  String get dpdpEraseTitle => 'मिटाने का अनुरोध करें';

  @override
  String get dpdpEraseBody => 'स्कूल को कुछ रिकॉर्ड क़ानूनन रखने होते हैं। हम बताएँगे कि क्या मिटाया जा सकता है और क्या नहीं।';

  @override
  String get dpdpEraseDetails => 'आप यह क्यों चाहते हैं? (वैकल्पिक)';

  @override
  String get dpdpEraseSend => 'मिटाने का अनुरोध करें';

  @override
  String get dpdpEraseConfirm => 'स्कूल से आपका डेटा मिटाने को कहें? जो रिकॉर्ड क़ानूनन रखने हैं, वे रहेंगे।';

  @override
  String get dpdpRequestSent => 'अनुरोध भेज दिया गया। शिकायत अधिकारी 30 दिन में उत्तर देंगे।';

  @override
  String get dpdpRetentionNotice => 'ये रिकॉर्ड क़ानूनन रखने होंगे:';

  @override
  String get dpdpRequestsTitle => 'मेरे अनुरोध';

  @override
  String get dpdpRequestsNone => 'अभी कोई अनुरोध नहीं।';

  @override
  String get dpdpKindCorrection => 'सुधार';

  @override
  String get dpdpKindErasure => 'मिटाना';

  @override
  String get dpdpStatusPending => 'लंबित';

  @override
  String get dpdpStatusDone => 'पूर्ण';

  @override
  String get dpdpStatusDeclined => 'अस्वीकृत';

  @override
  String get dpdpStatusBlocked => 'क़ानूनन रखा गया';

  @override
  String get houseTitle => 'मेरा सदन';

  @override
  String get houseSubtitle => 'आपके सदन के अंक और लीडरबोर्ड';

  @override
  String get houseNone => 'आपको अभी तक किसी सदन में नहीं रखा गया है।';

  @override
  String get houseRank => 'रैंक';

  @override
  String get housePointsLabel => 'अंक';

  @override
  String get houseMyPoints => 'मेरे अंक';

  @override
  String get houseCaptain => 'कप्तान';

  @override
  String get houseRecent => 'हाल के अंक';

  @override
  String get houseLeaderboard => 'लीडरबोर्ड';

  @override
  String get houseMembers => 'सदस्य';

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
  String get peerTitle => 'सहपाठी समीक्षा';

  @override
  String get peerOpen => 'सहपाठियों के काम की समीक्षा करें';

  @override
  String get peerToReview => 'समीक्षा के लिए';

  @override
  String get peerMyFeedback => 'मेरी प्रतिक्रिया';

  @override
  String get peerNone => 'अभी आपको समीक्षा के लिए कोई काम नहीं मिला है।';

  @override
  String get peerAnonymous => 'नाम छिपे हैं: आप नहीं जानते किसने लिखा, और वे नहीं जानते किसने समीक्षा की।';

  @override
  String get peerWork => 'काम';

  @override
  String get peerNoText => '(केवल फ़ोटो या फ़ाइल)';

  @override
  String get peerFiles => 'फ़ोटो और फ़ाइलें';

  @override
  String get peerClarity => 'स्पष्टता';

  @override
  String get peerAccuracy => 'सटीकता';

  @override
  String get peerEffort => 'प्रयास';

  @override
  String get peerComment => 'आपकी टिप्पणी';

  @override
  String get peerSave => 'समीक्षा सहेजें';

  @override
  String get peerSaved => 'समीक्षा सहेज ली गई।';

  @override
  String get peerNeedAll => 'हर एक के अंक दें और टिप्पणी लिखें।';

  @override
  String get peerAverage => 'औसत अंक (15 में से)';

  @override
  String get peerPending => 'बाकी समीक्षाएँ';

  @override
  String get peerNoFeedback => 'किसी सहपाठी ने अभी आपके काम की समीक्षा नहीं की है।';

  @override
  String get myLearningTitle => 'मेरी पढ़ाई';

  @override
  String get myLearningSubtitle => 'अभ्यास, कार्यपत्रक, अतिरिक्त सहायता और परीक्षा की तैयारी';

  @override
  String get myLearningNothing => 'यहां अभी कुछ नहीं है। आपके शिक्षक कार्यपत्रक और अभ्यास जोड़ेंगे।';

  @override
  String get myLearningPractice => 'आगे क्या करें';

  @override
  String get myLearningMastery => 'आप हर विषय कितना जानते हैं';

  @override
  String get myLearningWorksheets => 'कार्यपत्रक और गतिविधियां';

  @override
  String get myLearningHelp => 'शिक्षक से अतिरिक्त सहायता';

  @override
  String get myLearningReadiness => 'प्रवेश परीक्षा की तैयारी';

  @override
  String myLearningScore(Object score, Object max) {
    return '$max में से $score';
  }

  @override
  String get myLearningNotScored => 'अभी अंक नहीं मिले';

  @override
  String myLearningTarget(Object pct) {
    return 'लक्ष्य $pct%';
  }

  @override
  String myLearningAverage(Object pct, int n) {
    return '$n परीक्षाओं के बाद औसत $pct%';
  }

  @override
  String myLearningWeak(Object subjects) {
    return 'कमजोर: $subjects';
  }

  @override
  String get myLearningPromoted => 'अगली कक्षा में पदोन्नत';

  @override
  String get myLearningPromotedGrace => 'कृपांक के साथ पदोन्नत';

  @override
  String get myLearningCompartment => 'पूरक परीक्षा देनी है';

  @override
  String get myLearningDetained => 'कक्षा दोहराएंगे';

  @override
  String get myLearningOnTrack => 'सही राह पर';

  @override
  String get myLearningClose => 'लक्ष्य के करीब';

  @override
  String get myLearningBehind => 'लक्ष्य से पीछे';

  @override
  String get myLearningNoTests => 'अभी कोई मॉक परीक्षा नहीं';

  @override
  String get myLearningRising => 'बढ़ रहा';

  @override
  String get myLearningSteady => 'स्थिर';

  @override
  String get myLearningFalling => 'गिर रहा';

  @override
  String get deviceTrustTitle => 'यह फ़ोन';

  @override
  String get deviceTrustNew => 'अभी विश्वसनीय नहीं। इसे विश्वसनीय बनाएं ताकि इस फ़ोन से साइन-इन नया न माना जाए।';

  @override
  String get deviceTrustTrusted => 'विश्वसनीय';

  @override
  String get deviceTrustButton => 'इस फ़ोन पर भरोसा करें';

  @override
  String get forumTitle => 'चर्चा';

  @override
  String get forumAsk => 'प्रश्न पूछें';

  @override
  String get forumTitleLabel => 'शीर्षक';

  @override
  String get forumBodyLabel => 'आपका प्रश्न';

  @override
  String get forumPost => 'पोस्ट करें';

  @override
  String get forumNone => 'अभी कोई प्रश्न नहीं। सबसे पहले आप पूछें।';

  @override
  String forumReplies(int n) {
    String _temp0 = intl.Intl.pluralLogic(n, locale: localeName, other: '$n उत्तर', one: '1 उत्तर', zero: 'कोई उत्तर नहीं');
    return '$_temp0';
  }

  @override
  String get forumLocked => 'यह चर्चा बंद है।';

  @override
  String get forumReplyHint => 'उत्तर लिखें';

  @override
  String get pjTitle => 'प्रोजेक्ट और शोध';

  @override
  String get pjSubtitle => 'मेरे प्रोजेक्ट, टीम खोजें, प्रदर्शनी, पोर्टफ़ोलियो';

  @override
  String get pjTabMine => 'मेरे प्रोजेक्ट';

  @override
  String get pjTabFind => 'टीम खोजें';

  @override
  String get pjTabShowcase => 'प्रदर्शनी';

  @override
  String get pjTabPortfolio => 'पोर्टफ़ोलियो';

  @override
  String get pjNoneMine => 'आप अभी किसी प्रोजेक्ट में नहीं हैं। जुड़ने के लिए टीम खोजें।';

  @override
  String get pjOnShowcase => 'प्रदर्शनी में';

  @override
  String get pjRecruiting => 'सदस्य चाहिए';

  @override
  String get pjKind_capstone => 'कैपस्टोन';

  @override
  String get pjKind_research => 'शोध';

  @override
  String get pjKind_minor => 'लघु प्रोजेक्ट';

  @override
  String get pjKind_major => 'मुख्य प्रोजेक्ट';

  @override
  String get pjKind_internship => 'इंटर्नशिप';

  @override
  String get pjKind_project => 'प्रोजेक्ट';

  @override
  String get pjStatus_active => 'चालू';

  @override
  String get pjStatus_completed => 'पूरा हुआ';

  @override
  String get pjStatus_on_hold => 'रुका हुआ';

  @override
  String get pjStatus_proposed => 'प्रस्तावित';

  @override
  String get thesisTitle => 'मेरा शोध-प्रबंध';

  @override
  String get thesisStage_synopsis => 'सिनॉप्सिस';

  @override
  String get thesisStage_draft => 'मसौदा';

  @override
  String get thesisStage_submitted => 'जमा किया गया';

  @override
  String get thesisStage_examination => 'मूल्यांकन में';

  @override
  String get thesisStage_viva => 'वाइवा';

  @override
  String get thesisStage_awarded => 'उपाधि प्रदान की गई';

  @override
  String thesisSubmittedOn(Object date) {
    return '$date को जमा किया';
  }

  @override
  String thesisNextViva(Object time, Object venue) {
    return 'अगला वाइवा: $time, $venue';
  }

  @override
  String thesisSimilarity(int percent, int limit) {
    return 'समानता $percent% (सीमा $limit%)';
  }

  @override
  String get pjSkillSearch => 'कौशल से खोजें';

  @override
  String get pjNoneFind => 'अभी किसी प्रोजेक्ट को सदस्य नहीं चाहिए।';

  @override
  String pjFit(int fit) {
    return '$fit% मेल';
  }

  @override
  String pjLookingFor(Object skills) {
    return 'चाहिए: $skills';
  }

  @override
  String pjOpenings(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count स्थान खाली', one: '1 स्थान खाली');
    return '$_temp0';
  }

  @override
  String get pjAskToJoin => 'जुड़ने का अनुरोध करें';

  @override
  String pjJoinTitle(Object title) {
    return '$title से जुड़ें';
  }

  @override
  String get pjJoinMessage => 'प्रोजेक्ट प्रमुख के लिए एक छोटा संदेश';

  @override
  String get pjJoinSent => 'आपका अनुरोध भेज दिया गया।';

  @override
  String get pjNoneShowcase => 'प्रदर्शनी में अभी कोई प्रोजेक्ट नहीं है।';

  @override
  String pjReviewAverage(int average) {
    return 'समीक्षाएँ: $average%';
  }

  @override
  String get pjReview => 'समीक्षा करें';

  @override
  String pjReviewTitle(Object title) {
    return 'समीक्षा: $title';
  }

  @override
  String get pjReviewComment => 'टिप्पणी (वैकल्पिक)';

  @override
  String get pjReviewThanks => 'आपकी समीक्षा के लिए धन्यवाद।';

  @override
  String get pjCriterion_idea => 'विचार';

  @override
  String get pjCriterion_execution => 'क्रियान्वयन';

  @override
  String get pjCriterion_presentation => 'प्रस्तुति';

  @override
  String get pjCriterion_impact => 'प्रभाव';

  @override
  String get pjAddPortfolio => 'पोर्टफ़ोलियो में जोड़ें';

  @override
  String get pjPortfolioNote => 'प्रकाशित चीज़ें आपकी संस्था में सभी देख सकते हैं।';

  @override
  String get pjNonePortfolio => 'आपके पोर्टफ़ोलियो में अभी कुछ नहीं है।';

  @override
  String get pjDelete => 'हटाएँ';

  @override
  String get pjPublished => 'प्रकाशित';

  @override
  String get pjPublishedOn => 'दूसरों को दिखता है';

  @override
  String get pjPublishedOff => 'केवल आप देख सकते हैं';

  @override
  String get pjPortfolio_project => 'प्रोजेक्ट';

  @override
  String get pjPortfolio_research => 'शोध';

  @override
  String get pjPortfolio_certificate => 'प्रमाणपत्र';

  @override
  String get pjPortfolio_work => 'कार्य';

  @override
  String get pjFieldTitle => 'शीर्षक';

  @override
  String get pjFieldSummary => 'सारांश';

  @override
  String get pjFieldLink => 'लिंक (https://…)';

  @override
  String get pjFieldKind => 'प्रकार';

  @override
  String get pjNeedTitle => 'शीर्षक दें।';

  @override
  String get pjNeedUrl => 'https:// से शुरू होने वाला पूरा लिंक लिखें';

  @override
  String get pjNeedTitleAndUrl => 'लिंक के लिए शीर्षक और पूरा पता चाहिए।';

  @override
  String get pjWorkspace => 'प्रोजेक्ट वर्कस्पेस';

  @override
  String get pjMembers => 'टीम';

  @override
  String pjMentor(Object name) {
    return 'प्रमुख: $name';
  }

  @override
  String get pjMilestones => 'मील के पत्थर';

  @override
  String get pjNoMilestones => 'कोई पड़ाव तय नहीं है।';

  @override
  String pjDoneOn(Object date) {
    return '$date को पूरा हुआ';
  }

  @override
  String pjDueOn(Object date) {
    return 'समय-सीमा $date';
  }

  @override
  String get pjFiles => 'फ़ाइलें और लिंक';

  @override
  String get pjAddLink => 'लिंक जोड़ें';

  @override
  String get pjNoFiles => 'अभी कोई फ़ाइल नहीं है।';

  @override
  String get pjCopyLink => 'लिंक कॉपी करें';

  @override
  String get pjLinkCopied => 'लिंक कॉपी हो गया';

  @override
  String get pjLinkAdded => 'लिंक जोड़ा गया';

  @override
  String get pjViva => 'वाइवा';

  @override
  String pjPanel(Object names) {
    return 'पैनल: $names';
  }

  @override
  String get pjVivaCancelled => 'रद्द';

  @override
  String get pjViva_pass => 'उत्तीर्ण';

  @override
  String get pjViva_revise => 'सुधारकर फिर जमा करें';

  @override
  String get pjViva_fail => 'अनुत्तीर्ण';

  @override
  String get pjReviews => 'समीक्षाएँ';

  @override
  String get pjNoReviews => 'अभी कोई समीक्षा नहीं है।';

  @override
  String pjReviewsSummary(int count, int average) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count समीक्षाएँ', one: '1 समीक्षा');
    return '$_temp0, औसत $average%';
  }

  @override
  String get pjDiscussion => 'चर्चा';

  @override
  String get pjNoComments => 'अभी कोई संदेश नहीं है। चर्चा शुरू करें।';

  @override
  String get pjWriteComment => 'संदेश लिखें';

  @override
  String get prepTitle => 'करियर की तैयारी';

  @override
  String get prepSubtitle => 'रिज़्यूमे, टेस्ट, मॉक इंटरव्यू, सहायक';

  @override
  String get prepResume => 'रिज़्यूमे';

  @override
  String get prepResumeSub => 'प्लेसमेंट टीम के पढ़ने लायक रिज़्यूमे बनाएँ';

  @override
  String get prepTests => 'एप्टीट्यूड टेस्ट';

  @override
  String get prepTestsSub => 'समय-सीमा वाला अभ्यास, विषयवार अंकों के साथ';

  @override
  String get prepMockHr => 'HR मॉक इंटरव्यू';

  @override
  String get prepMockHrSub => 'आम HR सवाल, फ़ीडबैक के साथ';

  @override
  String get prepMockTechnical => 'तकनीकी मॉक इंटरव्यू';

  @override
  String get prepMockTechnicalSub => 'भूमिका के अनुसार तकनीकी सवाल';

  @override
  String get prepCommunication => 'संवाद का अभ्यास';

  @override
  String get prepCommunicationSub => 'स्पष्ट और क्रम से बोलने का अभ्यास';

  @override
  String get prepRecs => 'करियर सुझाव';

  @override
  String get prepRecsSub => 'आपके कौशल से मेल खाते रास्ते और भरने लायक कमियाँ';

  @override
  String get prepAssistant => 'करियर सहायक';

  @override
  String get prepAssistantSub => 'अपने करियर के बारे में KINETIX AI से पूछें';

  @override
  String get rsHeadline => 'शीर्षक वाक्य';

  @override
  String get rsSummary => 'सारांश';

  @override
  String get rsSkills => 'कौशल';

  @override
  String get rsInterests => 'रुचियाँ';

  @override
  String get rsCommaHelp => 'अल्पविराम से अलग करें';

  @override
  String get rsEducation => 'शिक्षा';

  @override
  String get rsExperience => 'अनुभव';

  @override
  String get rsProjects => 'प्रोजेक्ट';

  @override
  String get rsLinks => 'लिंक';

  @override
  String get rsAdd => 'जोड़ें';

  @override
  String get rsInstitution => 'संस्थान';

  @override
  String get rsDegree => 'डिग्री या कोर्स';

  @override
  String get rsYears => 'वर्ष';

  @override
  String get rsScore => 'अंक या ग्रेड';

  @override
  String get rsOrg => 'संगठन';

  @override
  String get rsRole => 'भूमिका';

  @override
  String get rsDetail => 'विवरण';

  @override
  String get rsLabel => 'नाम';

  @override
  String get rsVisible => 'प्लेसमेंट टीम को मेरा रिज़्यूमे दिखाएँ';

  @override
  String get rsVisibleHelp => 'यह चालू होने पर ही भर्तीकर्ता इसे देख सकते हैं।';

  @override
  String get rsSaved => 'रिज़्यूमे सहेजा गया';

  @override
  String get rsEntryIncomplete => 'ज़रूरी खाने भरें (लिंक https:// से शुरू होना चाहिए)।';

  @override
  String get testsNone => 'अभी कोई एप्टीट्यूड टेस्ट खुला नहीं है।';

  @override
  String get testCat_quant => 'गणितीय';

  @override
  String get testCat_logical => 'तार्किक';

  @override
  String get testCat_verbal => 'भाषा';

  @override
  String get testCat_technical => 'तकनीकी';

  @override
  String get testCat_mixed => 'मिश्रित';

  @override
  String testQuestions(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count सवाल', one: '1 सवाल');
    return '$_temp0';
  }

  @override
  String testMinutes(int count) {
    return '$count मिनट';
  }

  @override
  String get testNoAttempts => 'अभी तक नहीं दिया';

  @override
  String testAttempts(int attempts, int best) {
    String _temp0 = intl.Intl.pluralLogic(attempts, locale: localeName, other: '$attempts प्रयास', one: '1 प्रयास');
    return '$_temp0, सर्वश्रेष्ठ $best%';
  }

  @override
  String get testPassed => 'उत्तीर्ण';

  @override
  String testNotPassed(int pass) {
    return 'अभी उत्तीर्ण नहीं ($pass% चाहिए)';
  }

  @override
  String get testTake => 'टेस्ट दें';

  @override
  String get testRetake => 'फिर से कोशिश करें';

  @override
  String testIntro(int questions, int minutes, int pass) {
    return '$minutes मिनट में $questions सवाल। उत्तीर्ण होने के लिए $pass% चाहिए। अधिकतम 3 प्रयास मिलते हैं। टाइमर अभी शुरू होगा और बाहर जाने पर भी चलता रहेगा।';
  }

  @override
  String get testStart => 'शुरू करें';

  @override
  String testAnswered(int done, int total) {
    return '$total में से $done के उत्तर दिए';
  }

  @override
  String get testSubmit => 'उत्तर जमा करें';

  @override
  String get testLeave => 'टेस्ट छोड़ें? टाइमर चलता रहेगा और आपके उत्तर नहीं भेजे जाएँगे।';

  @override
  String get testStay => 'रुकें';

  @override
  String get testLeaveAnyway => 'छोड़ें';

  @override
  String testScore(int score, int total) {
    return '$total में से $score सही';
  }

  @override
  String get testByTopic => 'विषयवार अंक';

  @override
  String get testBack => 'टेस्ट सूची पर लौटें';

  @override
  String get mockIntro => 'हर सवाल का जवाब अपने शब्दों में दें, जैसे इंटरव्यू में देते। हर जवाब पर अंक और सुझाव मिलेंगे।';

  @override
  String get mockIntroCommunication => 'हर प्रश्न का उत्तर कुछ स्पष्ट वाक्यों में दें। क्रम और स्पष्टता पर अंक और सुझाव मिलेंगे।';

  @override
  String get mockRole => 'जिस भूमिका की तैयारी कर रहे हैं';

  @override
  String get mockRoleHint => 'जैसे, डेटा विश्लेषक';

  @override
  String get mockCount => 'सवालों की संख्या';

  @override
  String get mockStart => 'अभ्यास शुरू करें';

  @override
  String get mockPast => 'पिछला अभ्यास';

  @override
  String get mockAnswerHint => 'अपना उत्तर लिखें';

  @override
  String get mockAnswerAll => 'पहले हर सवाल का उत्तर दें।';

  @override
  String get mockSubmit => 'मेरे अंक देखें';

  @override
  String mockScore(Object score) {
    return 'अंक: 10 में से $score';
  }

  @override
  String mockQuestionScore(Object score) {
    return '10 में से $score';
  }

  @override
  String get mockOverall => 'कुल मिलाकर';

  @override
  String get mockAgain => 'फिर से अभ्यास करें';

  @override
  String recSkills(Object skills) {
    return 'आपके कौशल: $skills';
  }

  @override
  String recInterests(Object interests) {
    return 'आपकी रुचियाँ: $interests';
  }

  @override
  String get recNone => 'अभी कोई करियर रास्ता नहीं है। अपने रिज़्यूमे में कौशल और रुचियाँ जोड़ें, फिर देखें।';

  @override
  String recFit(int fit) {
    return '$fit% मेल';
  }

  @override
  String recMatched(Object skills) {
    return 'आपके पास है: $skills';
  }

  @override
  String recGaps(Object skills) {
    return 'कौशल की कमी: $skills';
  }

  @override
  String recRoles(Object roles) {
    return 'भूमिकाएँ: $roles';
  }

  @override
  String get assistantIntro => 'करियर, रिज़्यूमे या इंटरव्यू के बारे में पूछें।';

  @override
  String get assistantTry1 => 'मेरे लिए कौन-सा करियर ठीक रहेगा?';

  @override
  String get assistantTry2 => 'मैं अपना रिज़्यूमे कैसे सुधारूँ?';

  @override
  String get assistantHint => 'सवाल पूछें';

  @override
  String get assistantOffline => 'ऑफ़लाइन मार्गदर्शन';

  @override
  String get slDiaryTitle => 'कक्षा डायरी';

  @override
  String get slDiaryEmpty => 'अभी कोई डायरी प्रविष्टि नहीं है।';

  @override
  String slDiaryBy(Object name) {
    return '$name द्वारा';
  }

  @override
  String get slDiaryClasswork => 'कक्षा कार्य';

  @override
  String get slDiaryHomework => 'होमवर्क';

  @override
  String get slDiaryNotice => 'सूचना';

  @override
  String get slActivitiesTitle => 'मेरी गतिविधियाँ';

  @override
  String get slActivitiesEmpty => 'अभी कोई गतिविधि दर्ज नहीं है।';

  @override
  String slHousePoints(int points) {
    return '$points हाउस अंक';
  }

  @override
  String get slCaptain => 'हाउस कैप्टन';

  @override
  String get slClubs => 'क्लब';

  @override
  String get slMember => 'सदस्य';

  @override
  String slClubStats(int points, int count) {
    return '$points अंक, $count गतिविधियाँ';
  }

  @override
  String get slEvents => 'शामिल हुए कार्यक्रम';

  @override
  String slGrades(Object term) {
    return 'सह-पाठ्यचर्या ग्रेड, $term';
  }

  @override
  String get slCoCurricular => 'सह-पाठ्यचर्या';

  @override
  String get slAchievements => 'उपलब्धियाँ';

  @override
  String get slRecognitions => 'हाउस सराहना';

  @override
  String get slReportCards => 'रिपोर्ट कार्ड';

  @override
  String get slReportCard => 'रिपोर्ट कार्ड';

  @override
  String get slReportCardsNone => 'अभी कोई रिपोर्ट कार्ड प्रकाशित नहीं हुआ है।';

  @override
  String get slPromoted => 'अगली कक्षा में';

  @override
  String get slPromotedGrace => 'ग्रेस अंकों के साथ अगली कक्षा में';

  @override
  String get slDetained => 'अगली कक्षा में नहीं';

  @override
  String get slPromotionPending => 'अगली कक्षा का निर्णय बाकी है';

  @override
  String slPromotedTo(Object className) {
    return 'अगली कक्षा: $className';
  }

  @override
  String slAttendanceDays(int present, int total) {
    return '$total में से $present दिन';
  }

  @override
  String slBehaviourGrade(Object grade) {
    return 'व्यवहार ग्रेड: $grade';
  }

  @override
  String get slReportCardPdf => 'PDF के रूप में खोलें';

  @override
  String get alTitle => 'पूर्व विद्यार्थी';

  @override
  String get alSubtitle => 'आपकी पूर्व-विद्यार्थी प्रोफ़ाइल, कहानियाँ और दान';

  @override
  String get alTabProfile => 'प्रोफ़ाइल';

  @override
  String get alTabStories => 'मेरी कहानियाँ';

  @override
  String get alTabGive => 'योगदान दें';

  @override
  String get alTabPublished => 'सफलता की कहानियाँ';

  @override
  String alGraduated(Object program, int year) {
    return '$program, $year बैच';
  }

  @override
  String get alPhone => 'फ़ोन';

  @override
  String get alEmployer => 'नियोक्ता';

  @override
  String get alDesignation => 'पद';

  @override
  String get alCity => 'शहर';

  @override
  String get alBio => 'मेरे बारे में';

  @override
  String get alDirectory => 'मुझे पूर्व-विद्यार्थी निर्देशिका में दिखाएँ';

  @override
  String get alDirectoryHelp => 'यह चालू होने पर ही विद्यार्थी आपको खोज सकते हैं।';

  @override
  String get alMentor => 'मैं विद्यार्थियों का मार्गदर्शन कर सकता/सकती हूँ';

  @override
  String get alSaved => 'प्रोफ़ाइल सहेजी गई';

  @override
  String get storyIntro => 'अपने सफ़र के बारे में लिखें। प्रकाशन से पहले पूर्व-विद्यार्थी कार्यालय इसे पढ़ता है।';

  @override
  String get storyNone => 'आपने अभी कोई कहानी नहीं लिखी है।';

  @override
  String get storyWrite => 'कहानी लिखें';

  @override
  String get storyEdit => 'संपादित करें';

  @override
  String get storyBody => 'आपकी कहानी';

  @override
  String get storySaveDraft => 'मसौदा सहेजें';

  @override
  String get storySaved => 'कहानी सहेजी गई';

  @override
  String get storySubmit => 'समीक्षा के लिए भेजें';

  @override
  String get storySubmitted => 'समीक्षा के लिए भेजी गई';

  @override
  String get storyUnderReview => 'पूर्व-विद्यार्थी कार्यालय इसकी समीक्षा कर रहा है।';

  @override
  String storyReviewNote(Object note) {
    return 'पूर्व-विद्यार्थी कार्यालय की टिप्पणी: $note';
  }

  @override
  String get storyNeedTitle => 'अपनी कहानी को शीर्षक दें।';

  @override
  String get storyNeedBody => 'कम से कम 40 अक्षर लिखें।';

  @override
  String get storyStatus_draft => 'मसौदा';

  @override
  String get storyStatus_submitted => 'समीक्षा में';

  @override
  String get storyStatus_published => 'प्रकाशित';

  @override
  String get storyStatus_rejected => 'बदलाव चाहिए';

  @override
  String get storiesNone => 'अभी कोई सफलता की कहानी प्रकाशित नहीं हुई है।';

  @override
  String giveTotal(Object amount) {
    return 'आपने अब तक $amount दिए हैं। धन्यवाद।';
  }

  @override
  String get giveCampaigns => 'अभियान';

  @override
  String get giveNoCampaigns => 'अभी कोई अभियान खुला नहीं है।';

  @override
  String giveGoal(Object amount) {
    return 'लक्ष्य $amount';
  }

  @override
  String giveEnds(Object date) {
    return '$date को समाप्त';
  }

  @override
  String get givePledge => 'संकल्प करें';

  @override
  String giveTitle(Object name) {
    return '$name के लिए संकल्प';
  }

  @override
  String get giveAmount => 'राशि';

  @override
  String get giveNote => 'टिप्पणी (वैकल्पिक)';

  @override
  String get giveHelp => 'पैसा मिलने पर लेखा कार्यालय उसे दर्ज करता है।';

  @override
  String get giveNeedAmount => 'राशि रुपयों में लिखें।';

  @override
  String get giveThanks => 'आपके संकल्प के लिए धन्यवाद।';

  @override
  String get givePledges => 'मेरे संकल्प';

  @override
  String get pledgeStatus_open => 'बाकी';

  @override
  String get pledgeStatus_fulfilled => 'प्राप्त हुआ';

  @override
  String get pledgeStatus_cancelled => 'रद्द';

  @override
  String get giveDonations => 'मेरे दान';

  @override
  String get giveReceipt => 'रसीद (PDF)';

  @override
  String get volTitle => 'स्वयंसेवा';

  @override
  String get volNone => 'अभी स्वयंसेवा के कोई अवसर खुले नहीं हैं।';

  @override
  String volPlaces(int taken, int slots) {
    return '$slots में से $taken स्थान भरे';
  }

  @override
  String get volSignUp => 'नाम लिखवाएँ';

  @override
  String get volWithdraw => 'नाम वापस लें';

  @override
  String get volFull => 'भर गया';

  @override
  String get volThanks => 'स्वयंसेवा के लिए धन्यवाद।';
}
