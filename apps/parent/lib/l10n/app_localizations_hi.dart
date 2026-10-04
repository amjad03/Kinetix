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
  String get signInHint => 'वही फ़ोन नंबर या ईमेल इस्तेमाल करें जो आपने अपने बच्चे के कॉलेज को दिया है';

  @override
  String get errNotGuardian => 'यह ऐप अभिभावकों के लिए है। अपने संस्थान से अपना खाता अपने बच्चे से जोड़ने के लिए कहें।';

  @override
  String get errTeacherAccount => 'यह ऐप अभिभावकों के लिए है। शिक्षक KINETIX Teacher ऐप इस्तेमाल कर सकते हैं।';

  @override
  String homeSubtitle(Object name) {
    return '$name की प्रगति यहाँ देखें';
  }

  @override
  String get noChildrenLinked =>
      'आपके खाते से अभी कोई बच्चा नहीं जुड़ा है।\nअपने बच्चे के कॉलेज से आपको अभिभावक के रूप में जोड़ने के लिए कहें।';

  @override
  String get attendanceFewMissed => 'हाल में कुछ कक्षाएँ छूटी हैं।';

  @override
  String get attendanceBelow75 => '75% से कम। परीक्षा में बैठने के लिए कॉलेज आमतौर पर 75% उपस्थिति माँगते हैं।';

  @override
  String noAttendanceFor(Object name, Object days) {
    return 'पिछले $days दिनों में $name की उपस्थिति दर्ज नहीं हुई है।';
  }

  @override
  String get nothingDue => 'अभी कुछ भी जमा करना बाकी नहीं है। शिक्षकों का नया होमवर्क यहाँ दिखेगा।';

  @override
  String get inClass => 'कक्षा में';

  @override
  String inClassIntro(Object name) {
    return 'जब शिक्षक ने कक्षा में $name से किसी सवाल का जवाब देने को कहा, तब के जवाब।';
  }

  @override
  String notPickedYet(Object name) {
    return '$name से अभी तक कक्षा में जवाब देने को नहीं कहा गया।';
  }

  @override
  String get legendCorrect => 'सही';

  @override
  String get legendPartly => 'आंशिक रूप से सही';

  @override
  String get legendNotCorrect => 'गलत';

  @override
  String get legendNoAnswer => 'कोई जवाब नहीं';

  @override
  String askedNoAnswer(int count, Object subject) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count सवाल पूछे गए', one: '1 सवाल पूछा गया');
    return '$subject में $_temp0, पर जवाब नहीं दिया।';
  }

  @override
  String answeredOneCorrectly(Object subject) {
    return '$subject में 1 सवाल का सही जवाब दिया।';
  }

  @override
  String answeredAllCorrect(Object count, Object subject) {
    return '$subject में $count सवालों के जवाब दिए, सभी सही।';
  }

  @override
  String answeredDetail(int count, Object subject, Object detail) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count सवालों के', one: '1 सवाल का');
    return '$subject में $_temp0 जवाब दिए: $detail।';
  }

  @override
  String nCorrect(Object count) {
    return '$count सही';
  }

  @override
  String nPartly(Object count) {
    return '$count आंशिक रूप से सही';
  }

  @override
  String nNotCorrect(Object count) {
    return '$count गलत';
  }

  @override
  String didNotAnswer(Object count) {
    return '$count का जवाब नहीं दिया।';
  }

  @override
  String boardsEmpty(Object name) {
    return 'जब शिक्षक पाठ के बाद कक्षा का बोर्ड साझा करते हैं, तो वह यहाँ दिखता है ताकि $name दोहरा सकें।';
  }

  @override
  String childAttendance(Object name) {
    return '$name की उपस्थिति';
  }

  @override
  String notMissedAny(Object name, Object days) {
    return 'पिछले $days दिनों में $name की कोई कक्षा नहीं छूटी।';
  }

  @override
  String get homeworkFor => 'किसके लिए';

  @override
  String get yourChild => 'आपका बच्चा';

  @override
  String get yourChildren => 'आपके बच्चे';

  @override
  String get shownOnHome => 'होम पर दिख रहा है';

  @override
  String get noChildrenYet => 'अभी कोई बच्चा नहीं जुड़ा है। अपने बच्चे के कॉलेज से पूछें।';

  @override
  String get feesReceiptsHeader => 'फ़ीस और रसीदें';

  @override
  String childFees(Object name) {
    return '$name की फ़ीस';
  }

  @override
  String get feesSubtitle => 'बकाया, भुगतान और रसीदें';

  @override
  String childResults(Object name) {
    return '$name के परिणाम';
  }

  @override
  String childLibraryBooks(Object name) {
    return '$name की पुस्तकालय किताबें';
  }

  @override
  String noBooksBorrowed(Object name) {
    return 'पुस्तकालय से कोई किताब नहीं ली गई। $name कॉलेज पुस्तकालय से जो किताबें लेंगे, वे लौटाने की तारीख के साथ यहाँ दिखेंगी।';
  }

  @override
  String noBooksOutNow(Object name) {
    return 'अभी $name के पास पुस्तकालय की कोई किताब नहीं है।';
  }

  @override
  String childLibrary(Object name) {
    return 'पुस्तकालय: $name';
  }

  @override
  String markedAbsentFor(Object name, Object kind) {
    return 'इस $kind में $name को अनुपस्थित दर्ज किया गया।';
  }

  @override
  String noMarksCard(Object name) {
    return 'अभी कोई अंक प्रकाशित नहीं हुए। जब $name के शिक्षक टेस्ट या परीक्षा के अंक प्रकाशित करेंगे, वे कक्षा के औसत के साथ यहाँ दिखेंगे।';
  }

  @override
  String noMarksScreen(Object name) {
    return 'अभी कोई अंक प्रकाशित नहीं हुए।\nजब $name के शिक्षक अंक प्रकाशित करेंगे, वे यहाँ दिखेंगे।';
  }

  @override
  String recordingsEmpty(Object name) {
    return 'जब शिक्षक बोर्ड पर पाठ रिकॉर्ड करके साझा करते हैं, तो वह यहाँ दिखता है ताकि $name उसे फिर से देख सकें।';
  }

  @override
  String get missedThisClass => 'यह कक्षा छूट गई';

  @override
  String childLessons(Object name) {
    return '$name के पाठ';
  }

  @override
  String get noRecordingsShared => 'अभी तक कक्षा के साथ पाठ की कोई रिकॉर्डिंग साझा नहीं की गई है।';

  @override
  String get boardNotShared => 'यह बोर्ड अब कक्षा के साथ साझा नहीं है।';

  @override
  String noFeesIssued(Object name) {
    return '$name के लिए अभी कोई फ़ीस जारी नहीं हुई है।';
  }

  @override
  String noFeesIssuedLong(Object name) {
    return '$name के लिए अभी कोई फ़ीस जारी नहीं हुई है।\nकॉलेज की नई फ़ीस यहाँ दिखेगी।';
  }

  @override
  String get pay => 'भुगतान करें';

  @override
  String get payNow => 'अभी भुगतान करें';

  @override
  String get startingPayment => 'भुगतान शुरू हो रहा है…';

  @override
  String get confirmingPayment => 'भुगतान की पुष्टि हो रही है…';

  @override
  String get paymentCancelled => 'भुगतान रद्द हुआ। कोई पैसा नहीं कटा।';

  @override
  String get paymentFailedTitle => 'भुगतान नहीं हो सका';

  @override
  String finishInWallet(Object wallet) {
    return '$wallet में भुगतान पूरा करें';
  }

  @override
  String walletBody(Object wallet) {
    return 'जब $wallet भुगतान की पुष्टि करेगा, फ़ीस यहाँ अपडेट हो जाएगी और रसीद सूचनाएँ में आ जाएगी।';
  }

  @override
  String get yourWalletApp => 'आपका वॉलेट ऐप';

  @override
  String get couldNotConfirmTitle => 'हम इस भुगतान की पुष्टि नहीं कर सके';

  @override
  String couldNotConfirmBody(Object reason) {
    return '$reason अगर आपके खाते से पैसे कट गए हैं, तो कॉलेज को पेमेंट गेटवे से पुष्टि मिल जाएगी और यह फ़ीस जल्द अपडेट हो जाएगी। नहीं तो फिर से कोशिश करें।';
  }

  @override
  String get onlineNotAvailableTitle => 'ऑनलाइन भुगतान उपलब्ध नहीं है';

  @override
  String get enterAmount => 'राशि डालें';

  @override
  String get enterAmountRupees => 'रुपयों में राशि डालें, जैसे 2500 या 2500.50';

  @override
  String get smallestPayment => 'कम से कम ₹1 का भुगतान करें';

  @override
  String moreThanDue(Object amount) {
    return 'यह बाकी $amount से ज़्यादा है';
  }

  @override
  String payTitle(Object title) {
    return '$title का भुगतान करें';
  }

  @override
  String amountDue(Object amount) {
    return '$amount बाकी';
  }

  @override
  String fullAmount(Object amount) {
    return 'पूरा $amount';
  }

  @override
  String get partAmount => 'आंशिक राशि';

  @override
  String get amount => 'राशि';

  @override
  String amountRange(Object amount) {
    return '₹1 से $amount के बीच';
  }

  @override
  String payAmount(Object amount) {
    return '$amount का भुगतान करें';
  }

  @override
  String get paymentNotSetUp => 'कॉलेज ने अभी ऑनलाइन भुगतान शुरू नहीं किया है। कृपया फ़ीस काउंटर पर भुगतान करें।';

  @override
  String get paymentPhonesOnly =>
      'ऑनलाइन भुगतान Android फ़ोन और iPhone पर KINETIX Parent ऐप में होता है। इस डिवाइस पर कृपया फ़ीस काउंटर पर भुगतान करें।';

  @override
  String get demoPayment => 'डेमो भुगतान';

  @override
  String get demoTo => 'किसे';

  @override
  String get demoFor => 'किसलिए';

  @override
  String get demoOrder => 'ऑर्डर';

  @override
  String demoPayAmount(Object amount) {
    return '$amount का भुगतान करें (डेमो)';
  }

  @override
  String get failNoConfirmation => 'पेमेंट ऐप से पुष्टि नहीं मिली। अगर आपके खाते से पैसे कट गए हैं, तो फ़ीस जल्द अपडेट हो जाएगी।';

  @override
  String get failCouldNotOpen => 'भुगतान स्क्रीन नहीं खुल सकी। फिर से कोशिश करें।';

  @override
  String get failNetwork => 'इंटरनेट कनेक्शन नहीं है। उसे जाँचकर फिर से कोशिश करें।';

  @override
  String get failGeneric => 'भुगतान नहीं हो सका। फिर से कोशिश करें।';

  @override
  String get paymentSuccessful => 'भुगतान सफल रहा';

  @override
  String paidFor(Object amount, Object name) {
    return '$name के लिए $amount का भुगतान हुआ';
  }

  @override
  String writeToAbout(Object teacher, Object name) {
    return '$name के बारे में $teacher को लिखें।';
  }

  @override
  String noMessagesOneChild(Object name) {
    return 'अभी कोई संदेश नहीं।\nहोमवर्क, अनुपस्थिति या प्रगति के बारे में $name के शिक्षकों को लिखें।';
  }

  @override
  String get noMessagesChildren => 'अभी कोई संदेश नहीं।\nहोमवर्क, अनुपस्थिति या प्रगति के बारे में अपने बच्चों के शिक्षकों को लिखें।';

  @override
  String get noChildrenLinkedShort => 'आपके खाते से अभी कोई बच्चा नहीं जुड़ा है।\nअपने बच्चे के कॉलेज से पूछें।';

  @override
  String get aboutHeader => 'किसके बारे में';

  @override
  String childTeachers(Object name) {
    return '$name के शिक्षक';
  }

  @override
  String noTeachersOnTimetable(Object name) {
    return '$name की समय-सारणी में अभी कोई शिक्षक नहीं हैं।';
  }

  @override
  String get noUpdates => 'अभी कोई सूचना नहीं।\nअनुपस्थिति, होमवर्क और कॉलेज के संदेश यहाँ दिखेंगे।';

  @override
  String get phoneOrEmail => 'फ़ोन या ईमेल';

  @override
  String get enterPhoneOrEmail => 'अपना फ़ोन नंबर या ईमेल डालें';
}
