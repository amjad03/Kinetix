// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Kannada (`kn`).
class AppLocalizationsKn extends AppLocalizations {
  AppLocalizationsKn([String locale = 'kn']) : super(locale);

  @override
  String get today => 'ಇಂದು';

  @override
  String get tomorrow => 'ನಾಳೆ';

  @override
  String get yesterday => 'ನಿನ್ನೆ';

  @override
  String get dueToday => 'ಇಂದು ಸಲ್ಲಿಸಬೇಕು';

  @override
  String get dueTomorrow => 'ನಾಳೆ ಸಲ್ಲಿಸಬೇಕು';

  @override
  String dueOn(Object date) {
    return '$date ರೊಳಗೆ ಸಲ್ಲಿಸಿ';
  }

  @override
  String wasDue(Object date) {
    return '$date ರೊಳಗೆ ಸಲ್ಲಿಸಬೇಕಿತ್ತು';
  }

  @override
  String overdueBy(int days) {
    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$days ದಿನ',
      one: '1 ದಿನ',
    );
    return '$_temp0 ತಡವಾಗಿದೆ';
  }

  @override
  String get bookDueToday => 'ಇಂದು ಹಿಂದಿರುಗಿಸಬೇಕು';

  @override
  String get bookDueTomorrow => 'ನಾಳೆ ಹಿಂದಿರುಗಿಸಬೇಕು';

  @override
  String bookDueOn(Object date) {
    return '$date ರೊಳಗೆ ಹಿಂದಿರುಗಿಸಿ';
  }

  @override
  String get greetingMorning => 'ಶುಭೋದಯ';

  @override
  String get greetingAfternoon => 'ಶುಭ ಮಧ್ಯಾಹ್ನ';

  @override
  String get greetingEvening => 'ಶುಭ ಸಂಜೆ';

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
    return '$items ಮತ್ತು $last';
  }

  @override
  String get retry => 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ';

  @override
  String get soon => 'ಶೀಘ್ರದಲ್ಲೇ';

  @override
  String get comingSoon => 'ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ';

  @override
  String comingLater(Object feature) {
    return '$feature ಮುಂದಿನ ಅಪ್‌ಡೇಟ್‌ನಲ್ಲಿ ಬರಲಿದೆ';
  }

  @override
  String get statusPresent => 'ಹಾಜರು';

  @override
  String get statusAbsent => 'ಗೈರು';

  @override
  String get statusLate => 'ತಡ';

  @override
  String get statusExcused => 'ಅನುಮತಿ ರಜೆ';

  @override
  String get cancel => 'ರದ್ದುಮಾಡಿ';

  @override
  String get save => 'ಉಳಿಸಿ';

  @override
  String get send => 'ಕಳುಹಿಸಿ';

  @override
  String get share => 'ಹಂಚಿಕೊಳ್ಳಿ';

  @override
  String get close => 'ಮುಚ್ಚಿ';

  @override
  String get done => 'ಮುಗಿದಿದೆ';

  @override
  String get seeAll => 'ಎಲ್ಲವನ್ನೂ ನೋಡಿ';

  @override
  String pages(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಪುಟಗಳು',
      one: '1 ಪುಟ',
    );
    return '$_temp0';
  }

  @override
  String lastDays(Object days) {
    return 'ಕಳೆದ $days ದಿನಗಳು';
  }

  @override
  String rollNo(Object rollNo) {
    return 'ರೋಲ್ ನಂ. $rollNo';
  }

  @override
  String get errTimeout =>
      'ಸರ್ವರ್ ಉತ್ತರಿಸಲು ತುಂಬಾ ಸಮಯ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get errUnreachable =>
      'KINETIX ಗೆ ಸಂಪರ್ಕ ಸಾಧ್ಯವಾಗುತ್ತಿಲ್ಲ. ನಿಮ್ಮ ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಮತ್ತು ಸರ್ವರ್ ವಿಳಾಸವನ್ನು ಪರಿಶೀಲಿಸಿ.';

  @override
  String get errForbidden => 'ಇದಕ್ಕೆ ನಿಮಗೆ ಅನುಮತಿ ಇಲ್ಲ.';

  @override
  String get errNotFound => 'ಸಿಗಲಿಲ್ಲ.';

  @override
  String get errTooMany =>
      'ಹಲವು ಬಾರಿ ಪ್ರಯತ್ನಿಸಲಾಗಿದೆ. ಒಂದು ನಿಮಿಷ ಕಾದು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String errGeneric(Object status) {
    return 'ಏನೋ ತಪ್ಪಾಗಿದೆ ($status). ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';
  }

  @override
  String get errWrongLogin => 'ಸಂಸ್ಥೆ, ಲಾಗಿನ್ ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್ ತಪ್ಪಾಗಿದೆ';

  @override
  String get signIn => 'ಸೈನ್ ಇನ್';

  @override
  String get signOut => 'ಸೈನ್ ಔಟ್';

  @override
  String get signOutQuestion => 'ಸೈನ್ ಔಟ್ ಮಾಡಬೇಕೇ?';

  @override
  String get signOutBody =>
      'ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಲು ನಿಮ್ಮ ಪಾಸ್‌ವರ್ಡ್ ಬೇಕಾಗುತ್ತದೆ.';

  @override
  String get institutionCode => 'ಸಂಸ್ಥೆಯ ಕೋಡ್';

  @override
  String get institutionCodeHint => 'ಉದಾ. demo-college';

  @override
  String get password => 'ಪಾಸ್‌ವರ್ಡ್';

  @override
  String get showPassword => 'ಪಾಸ್‌ವರ್ಡ್ ತೋರಿಸಿ';

  @override
  String get hidePassword => 'ಪಾಸ್‌ವರ್ಡ್ ಮರೆಮಾಡಿ';

  @override
  String get serverAddress => 'ಸರ್ವರ್ ವಿಳಾಸ';

  @override
  String serverLabel(Object server) {
    return 'ಸರ್ವರ್: $server';
  }

  @override
  String get enterInstitutionCode => 'ನಿಮ್ಮ ಸಂಸ್ಥೆಯ ಕೋಡ್ ನಮೂದಿಸಿ';

  @override
  String get institutionCodeChars =>
      'ಅಕ್ಷರಗಳು, ಅಂಕಿಗಳು ಮತ್ತು ಹೈಫನ್ (-) ಮಾತ್ರ ಬಳಸಿ';

  @override
  String get enterValidEmail => 'ಸರಿಯಾದ ಇಮೇಲ್ ವಿಳಾಸ ನಮೂದಿಸಿ';

  @override
  String get enterValidPhone =>
      '10 ಅಂಕಿಯ ಫೋನ್ ಸಂಖ್ಯೆ ಅಥವಾ ಸರಿಯಾದ ಇಮೇಲ್ ನಮೂದಿಸಿ';

  @override
  String get enterPassword => 'ನಿಮ್ಮ ಪಾಸ್‌ವರ್ಡ್ ನಮೂದಿಸಿ';

  @override
  String get enterServer => 'https://api.kinetix.in ನಂತಹ ಸರ್ವರ್ ವಿಳಾಸ ನಮೂದಿಸಿ';

  @override
  String get language => 'ಭಾಷೆ';

  @override
  String get languageHelp => 'ಆ್ಯಪ್ ಮತ್ತು ನಿಮಗೆ ಕಳುಹಿಸುವ ಸೂಚನೆಗಳಿಗೆ';

  @override
  String get chooseLanguage => 'ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get profile => 'ಪ್ರೊಫೈಲ್';

  @override
  String get account => 'ಖಾತೆ';

  @override
  String get server => 'ಸರ್ವರ್';

  @override
  String get settings => 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು';

  @override
  String get navHome => 'ಮುಖಪುಟ';

  @override
  String get navMessages => 'ಸಂದೇಶಗಳು';

  @override
  String get navUpdates => 'ಸೂಚನೆಗಳು';

  @override
  String get navProfile => 'ಪ್ರೊಫೈಲ್';

  @override
  String get attendance => 'ಹಾಜರಾತಿ';

  @override
  String get homework => 'ಹೋಂವರ್ಕ್';

  @override
  String sectionLastDays(Object section, Object days) {
    return '$section · ಕಳೆದ $days ದಿನಗಳು';
  }

  @override
  String get allClasses => 'ಎಲ್ಲಾ ತರಗತಿಗಳು';

  @override
  String get absentOrLate => 'ಗೈರು ಅಥವಾ ತಡ';

  @override
  String noAttendanceTaken(Object days) {
    return 'ಕಳೆದ $days ದಿನಗಳಲ್ಲಿ ಹಾಜರಾತಿ ದಾಖಲಾಗಿಲ್ಲ.';
  }

  @override
  String get attendedAll => 'ಎಲ್ಲದರಲ್ಲೂ ಹಾಜರು';

  @override
  String attendedNofM(Object attended, Object total) {
    return '$total ರಲ್ಲಿ $attended ಕ್ಕೆ ಹಾಜರು';
  }

  @override
  String get wholeDay => 'ಇಡೀ ದಿನ';

  @override
  String get instructions => 'ಸೂಚನೆಗಳು';

  @override
  String get noInstructions => 'ಯಾವುದೇ ಸೂಚನೆಗಳನ್ನು ಸೇರಿಸಿಲ್ಲ.';

  @override
  String get factDue => 'ಸಲ್ಲಿಸುವ ದಿನಾಂಕ';

  @override
  String get setBy => 'ನೀಡಿದವರು';

  @override
  String get givenOn => 'ನೀಡಿದ ದಿನಾಂಕ';

  @override
  String get library => 'ಗ್ರಂಥಾಲಯ';

  @override
  String nOut(Object count) {
    return '$count ಪಡೆದಿದೆ';
  }

  @override
  String get seeLibraryHistory => 'ಗ್ರಂಥಾಲಯದ ಪೂರ್ಣ ವಿವರ ನೋಡಿ';

  @override
  String booksOverdue(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other:
          '$count ಪುಸ್ತಕಗಳನ್ನು ಹಿಂದಿರುಗಿಸಲು ತಡವಾಗಿದೆ. ದಯವಿಟ್ಟು ಅವುಗಳನ್ನು ಗ್ರಂಥಾಲಯಕ್ಕೆ ಹಿಂದಿರುಗಿಸಿ.',
      one: '1 ಪುಸ್ತಕ ಹಿಂದಿರುಗಿಸಲು ತಡವಾಗಿದೆ. ದಯವಿಟ್ಟು ಅದನ್ನು ಗ್ರಂಥಾಲಯಕ್ಕೆ ಹಿಂದಿರುಗಿಸಿ.',
    );
    return '$_temp0';
  }

  @override
  String andMore(Object count) {
    return 'ಮತ್ತು ಇನ್ನೂ $count';
  }

  @override
  String finesForLate(Object amount) {
    return 'ತಡವಾಗಿ ಹಿಂದಿರುಗಿಸಿದ್ದಕ್ಕೆ ದಂಡ: $amount';
  }

  @override
  String finesPayAtDesk(Object amount) {
    return 'ತಡವಾಗಿ ಹಿಂದಿರುಗಿಸಿದ್ದಕ್ಕೆ ದಂಡ: $amount. ಗ್ರಂಥಾಲಯದ ಕೌಂಟರ್‌ನಲ್ಲಿ ಪಾವತಿಸಿ.';
  }

  @override
  String borrowedOn(Object date) {
    return '$date ರಂದು ಪಡೆದಿದೆ';
  }

  @override
  String returnedOn(Object date) {
    return '$date ರಂದು ಹಿಂದಿರುಗಿಸಿದೆ';
  }

  @override
  String fineAmount(Object amount) {
    return 'ದಂಡ $amount';
  }

  @override
  String get returnedLate => 'ತಡವಾಗಿ';

  @override
  String fineSoFar(Object amount) {
    return 'ಇಲ್ಲಿಯವರೆಗೆ $amount ದಂಡ';
  }

  @override
  String booksOutHeading(Object count) {
    return 'ಪಡೆದ ಪುಸ್ತಕಗಳು ($count)';
  }

  @override
  String get noBooksOut => 'ಈಗ ಯಾವುದೇ ಪುಸ್ತಕ ಪಡೆದಿಲ್ಲ.';

  @override
  String get fineRule =>
      'ಪುಸ್ತಕವನ್ನು ತಡವಾಗಿ ಹಿಂದಿರುಗಿಸಿದರೆ ಗ್ರಂಥಾಲಯವು ಪ್ರತಿ ದಿನಕ್ಕೆ ದಂಡ ವಿಧಿಸುತ್ತದೆ.';

  @override
  String returnedHeading(Object count) {
    return 'ಹಿಂದಿರುಗಿಸಿದವು ($count)';
  }

  @override
  String get returnedEmpty => 'ಹಿಂದಿರುಗಿಸಿದ ಪುಸ್ತಕಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';

  @override
  String get libraryBooks => 'ಗ್ರಂಥಾಲಯದ ಪುಸ್ತಕಗಳು';

  @override
  String get results => 'ಫಲಿತಾಂಶ';

  @override
  String get aboveAverage => 'ತರಗತಿ ಸರಾಸರಿಗಿಂತ ಹೆಚ್ಚು';

  @override
  String get atAverage => 'ತರಗತಿ ಸರಾಸರಿಗೆ ಸಮ';

  @override
  String get belowAverage => 'ತರಗತಿ ಸರಾಸರಿಗಿಂತ ಕಡಿಮೆ';

  @override
  String get notEntered => 'ನಮೂದಿಸಿಲ್ಲ';

  @override
  String get publishedMarks => 'ಪ್ರಕಟಿತ ಅಂಕಗಳು';

  @override
  String get seeAllResults => 'ಎಲ್ಲಾ ಫಲಿತಾಂಶಗಳನ್ನು ನೋಡಿ';

  @override
  String get bySubject => 'ವಿಷಯವಾರು';

  @override
  String classAverageValue(Object value) {
    return 'ತರಗತಿ ಸರಾಸರಿ $value';
  }

  @override
  String get marksExplainer =>
      'ಪ್ರಕಟಿತ ಎಲ್ಲಾ ಮೌಲ್ಯಮಾಪನಗಳಲ್ಲಿ ಒಟ್ಟು ಅಂಕಗಳಲ್ಲಿ ಪಡೆದ ಅಂಕಗಳು.';

  @override
  String get assessments => 'ಮೌಲ್ಯಮಾಪನಗಳು';

  @override
  String get classAverage => 'ತರಗತಿ ಸರಾಸರಿ';

  @override
  String get highestInClass => 'ತರಗತಿಯಲ್ಲಿ ಅತಿ ಹೆಚ್ಚು';

  @override
  String outOf(Object max) {
    return '$max ರಲ್ಲಿ';
  }

  @override
  String get teachersRemark => 'ಶಿಕ್ಷಕರ ಅಭಿಪ್ರಾಯ';

  @override
  String get kindTest => 'ಟೆಸ್ಟ್';

  @override
  String get kindAssignment => 'ಅಸೈನ್‌ಮೆಂಟ್';

  @override
  String get kindInternal => 'ಆಂತರಿಕ ಮೌಲ್ಯಮಾಪನ';

  @override
  String get kindExam => 'ಪರೀಕ್ಷೆ';

  @override
  String get kindPractical => 'ಪ್ರಾಯೋಗಿಕ';

  @override
  String get lessonRecordings => 'ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್‌ಗಳು';

  @override
  String nMissed(Object count) {
    return '$count ತಪ್ಪಿವೆ';
  }

  @override
  String seeAllRecordings(Object count) {
    return 'ಎಲ್ಲಾ $count ರೆಕಾರ್ಡಿಂಗ್‌ಗಳನ್ನು ನೋಡಿ';
  }

  @override
  String get recordingNotShared =>
      'ಈ ರೆಕಾರ್ಡಿಂಗ್ ಅನ್ನು ಈಗ ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಂಡಿಲ್ಲ.';

  @override
  String get classBoard => 'ತರಗತಿಯ ಬೋರ್ಡ್';

  @override
  String get previousPage => 'ಹಿಂದಿನ ಪುಟ';

  @override
  String get nextPage => 'ಮುಂದಿನ ಪುಟ';

  @override
  String pageOf(Object page, Object total) {
    return 'ಪುಟ $page / $total';
  }

  @override
  String get zoomOut => 'ಜೂಮ್ ಔಟ್ ಮಾಡಲು ಎರಡು ಬಾರಿ ಟ್ಯಾಪ್ ಮಾಡಿ';

  @override
  String get zoomSideways =>
      'ಜೂಮ್ ಮಾಡಲು ಎರಡು ಬೆರಳುಗಳಿಂದ ಹಿಗ್ಗಿಸಿ, ಅಥವಾ ಫೋನ್ ಅನ್ನು ಅಡ್ಡವಾಗಿ ತಿರುಗಿಸಿ';

  @override
  String get zoomHint =>
      'ಜೂಮ್ ಮಾಡಲು ಎರಡು ಬೆರಳುಗಳಿಂದ ಹಿಗ್ಗಿಸಿ ಅಥವಾ ಎರಡು ಬಾರಿ ಟ್ಯಾಪ್ ಮಾಡಿ';

  @override
  String get fees => 'ಶುಲ್ಕ';

  @override
  String get allFeesPaid => 'ಎಲ್ಲಾ ಶುಲ್ಕ ಪಾವತಿಯಾಗಿದೆ';

  @override
  String lastPaid(Object amount) {
    return 'ಕೊನೆಯ ಪಾವತಿ $amount';
  }

  @override
  String get dueSuffix => 'ಬಾಕಿ';

  @override
  String feesToPay(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಶುಲ್ಕಗಳನ್ನು ಪಾವತಿಸಬೇಕಿದೆ',
      one: '1 ಶುಲ್ಕ ಪಾವತಿಸಬೇಕಿದೆ',
    );
    return '$_temp0';
  }

  @override
  String nOverdue(Object count) {
    return '$count ಗಡುವು ಮೀರಿದೆ';
  }

  @override
  String get viewFees => 'ಶುಲ್ಕ ನೋಡಿ';

  @override
  String get viewFeesReceipts => 'ಶುಲ್ಕ ಮತ್ತು ರಸೀದಿಗಳನ್ನು ನೋಡಿ';

  @override
  String get payAtCounter => 'ದಯವಿಟ್ಟು ಶುಲ್ಕ ಕೌಂಟರ್‌ನಲ್ಲಿ ಪಾವತಿಸಿ.';

  @override
  String get ok => 'ಸರಿ';

  @override
  String get feesNothingDue => 'ಏನೂ ಬಾಕಿ ಇಲ್ಲ';

  @override
  String get totalDue => 'ಒಟ್ಟು ಬಾಕಿ';

  @override
  String get toPay => 'ಪಾವತಿಸಬೇಕಾದವು';

  @override
  String get paidHeader => 'ಪಾವತಿಸಿದವು';

  @override
  String paidLine(Object amount, Object date) {
    return '$amount · $date ರೊಳಗೆ ಪಾವತಿಸಬೇಕಿತ್ತು';
  }

  @override
  String get paidPill => 'ಪಾವತಿಯಾಗಿದೆ';

  @override
  String get paymentsReceipts => 'ಪಾವತಿಗಳು ಮತ್ತು ರಸೀದಿಗಳು';

  @override
  String get feeLabel => 'ಶುಲ್ಕ';

  @override
  String overdueWasDue(Object date) {
    return 'ಗಡುವು ಮೀರಿದೆ · $date ರೊಳಗೆ ಪಾವತಿಸಬೇಕಿತ್ತು';
  }

  @override
  String paidOfLeft(Object paid, Object total, Object left) {
    return '$total ರಲ್ಲಿ $paid ಪಾವತಿಯಾಗಿದೆ · $left ಬಾಕಿ';
  }

  @override
  String get receiptNotFound => 'ಈ ರಸೀದಿ ಸಿಗಲಿಲ್ಲ.';

  @override
  String get receiptCopied =>
      'ರಸೀದಿ ನಕಲಾಗಿದೆ. ಇದನ್ನು ಸಂದೇಶ ಅಥವಾ ಇಮೇಲ್‌ನಲ್ಲಿ ಪೇಸ್ಟ್ ಮಾಡಿ.';

  @override
  String get receipt => 'ರಸೀದಿ';

  @override
  String get copyReceipt => 'ರಸೀದಿ ನಕಲಿಸಿ';

  @override
  String get feeReceipt => 'ಶುಲ್ಕದ ರಸೀದಿ';

  @override
  String get receiptNoLabel => 'ರಸೀದಿ ಸಂ.';

  @override
  String get dateLabel => 'ದಿನಾಂಕ';

  @override
  String get studentLabel => 'ವಿದ್ಯಾರ್ಥಿ';

  @override
  String get classLabel => 'ತರಗತಿ';

  @override
  String get paidBy => 'ಪಾವತಿ ವಿಧಾನ';

  @override
  String get reference => 'ಉಲ್ಲೇಖ';

  @override
  String get amountPaid => 'ಪಾವತಿಸಿದ ಮೊತ್ತ';

  @override
  String get balanceLeft => 'ಉಳಿದ ಬಾಕಿ';

  @override
  String get nilFullyPaid => 'ಶೂನ್ಯ · ಪೂರ್ಣ ಪಾವತಿಯಾಗಿದೆ';

  @override
  String get demoNoMoneyMoved => 'ಡೆಮೊ ಪಾವತಿ: ಯಾವುದೇ ಹಣ ವರ್ಗಾವಣೆ ಆಗಿಲ್ಲ.';

  @override
  String get demoNoMoney => 'ಡೆಮೊ ಪಾವತಿ: ಯಾವುದೇ ಹಣ ವರ್ಗಾವಣೆ ಆಗುವುದಿಲ್ಲ';

  @override
  String get methodOnline => 'ಆನ್‌ಲೈನ್';

  @override
  String get methodCash => 'ನಗದು';

  @override
  String get methodCheque => 'ಚೆಕ್';

  @override
  String get methodBankTransfer => 'ಬ್ಯಾಂಕ್ ವರ್ಗಾವಣೆ';

  @override
  String get methodPayment => 'ಪಾವತಿ';

  @override
  String get newMessage => 'ಹೊಸ ಸಂದೇಶ';

  @override
  String aboutName(Object name) {
    return '$name ಬಗ್ಗೆ';
  }

  @override
  String get noMessagesYet => 'ಇನ್ನೂ ಯಾವುದೇ ಸಂದೇಶಗಳಿಲ್ಲ';

  @override
  String couldNotSend(Object reason) {
    return 'ಕಳುಹಿಸಲಾಗಲಿಲ್ಲ: $reason';
  }

  @override
  String get message => 'ಸಂದೇಶ';

  @override
  String get pullForEarlier => 'ಹಿಂದಿನ ಸಂದೇಶಗಳಿಗಾಗಿ ಕೆಳಗೆ ಎಳೆಯಿರಿ';

  @override
  String get teachersReply =>
      'ಶಿಕ್ಷಕರು ಸಮಯ ಸಿಕ್ಕಾಗ, ಸಾಮಾನ್ಯವಾಗಿ ಕಾಲೇಜು ಸಮಯದಲ್ಲಿ ಉತ್ತರಿಸುತ್ತಾರೆ.';

  @override
  String get messageCopied => 'ಸಂದೇಶ ನಕಲಾಗಿದೆ';

  @override
  String get teacher => 'ಶಿಕ್ಷಕರು';

  @override
  String get markAllRead => 'ಎಲ್ಲವನ್ನೂ ಓದಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಿ';

  @override
  String get earlier => 'ಹಿಂದಿನವು';

  @override
  String get fromCollege => 'ಕಾಲೇಜಿನಿಂದ ಸಂದೇಶ';

  @override
  String get update => 'ಸೂಚನೆ';

  @override
  String get attendanceGood => 'ಉತ್ತಮ ಹಾಜರಾತಿ. ಹೀಗೆಯೇ ಮುಂದುವರಿಸಿ.';

  @override
  String get seeAttendanceHistory => 'ಹಾಜರಾತಿಯ ಪೂರ್ಣ ವಿವರ ನೋಡಿ';

  @override
  String attendedOf(Object attended, int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ತರಗತಿಗಳಲ್ಲಿ',
      one: '1 ತರಗತಿಯಲ್ಲಿ',
    );
    return '$_temp0 $attended ರಲ್ಲಿ ಹಾಜರು';
  }

  @override
  String excusedNote(Object count) {
    return '$count ಅನುಮತಿ ರಜೆ (ಹಾಜರು ಎಂದು ಎಣಿಸಲಾಗಿದೆ)';
  }

  @override
  String get recentAbsences => 'ಇತ್ತೀಚಿನ ಗೈರುಗಳು';

  @override
  String dueCount(Object count) {
    return '$count ಬಾಕಿ';
  }

  @override
  String pastHomework(Object count) {
    return 'ಹಿಂದಿನ ಹೋಂವರ್ಕ್ ($count)';
  }

  @override
  String get classBoards => 'ತರಗತಿಯ ಬೋರ್ಡ್‌ಗಳು';

  @override
  String todaysBoard(Object subject) {
    return 'ಇಂದಿನ ಬೋರ್ಡ್: $subject';
  }

  @override
  String get resultsSubtitle => 'ಪ್ರಕಟಿತ ಅಂಕಗಳು ಮತ್ತು ತರಗತಿ ಸರಾಸರಿ';

  @override
  String get librarySubtitle =>
      'ಪಡೆದ ಪುಸ್ತಕಗಳು, ಹಿಂದಿರುಗಿಸುವ ದಿನಾಂಕಗಳು ಮತ್ತು ದಂಡ';

  @override
  String get college => 'ಕಾಲೇಜು';

  @override
  String get resultsLibraryHeader => 'ಫಲಿತಾಂಶ ಮತ್ತು ಗ್ರಂಥಾಲಯ';

  @override
  String get feesAndReceipts => 'ಶುಲ್ಕ ಮತ್ತು ರಸೀದಿಗಳು';

  @override
  String get tryAgain => 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ';

  @override
  String get signInHint =>
      'ನಿಮ್ಮ ಮಗುವಿನ ಕಾಲೇಜಿಗೆ ನೀಡಿದ ಫೋನ್ ಸಂಖ್ಯೆ ಅಥವಾ ಇಮೇಲ್ ಬಳಸಿ';

  @override
  String get errNotGuardian =>
      'ಈ ಆ್ಯಪ್ ಪೋಷಕರಿಗಾಗಿ. ನಿಮ್ಮ ಖಾತೆಯನ್ನು ನಿಮ್ಮ ಮಗುವಿನೊಂದಿಗೆ ಜೋಡಿಸಲು ನಿಮ್ಮ ಸಂಸ್ಥೆಯನ್ನು ಕೇಳಿ.';

  @override
  String get errTeacherAccount =>
      'ಈ ಆ್ಯಪ್ ಪೋಷಕರಿಗಾಗಿ. ಶಿಕ್ಷಕರು KINETIX Teacher ಆ್ಯಪ್ ಬಳಸಬಹುದು.';

  @override
  String homeSubtitle(Object name) {
    return '$name ಅವರ ಪ್ರಗತಿ ಇಲ್ಲಿದೆ';
  }

  @override
  String get noChildrenLinked =>
      'ನಿಮ್ಮ ಖಾತೆಗೆ ಇನ್ನೂ ಯಾವುದೇ ಮಗುವನ್ನು ಜೋಡಿಸಿಲ್ಲ.\nನಿಮ್ಮನ್ನು ಪೋಷಕರಾಗಿ ಸೇರಿಸಲು ನಿಮ್ಮ ಮಗುವಿನ ಕಾಲೇಜನ್ನು ಕೇಳಿ.';

  @override
  String get attendanceFewMissed => 'ಇತ್ತೀಚೆಗೆ ಕೆಲವು ತರಗತಿಗಳು ತಪ್ಪಿವೆ.';

  @override
  String get attendanceBelow75 =>
      '75% ಕ್ಕಿಂತ ಕಡಿಮೆ. ಪರೀಕ್ಷೆಗೆ ಕೂರಲು ಕಾಲೇಜುಗಳು ಸಾಮಾನ್ಯವಾಗಿ 75% ಹಾಜರಾತಿ ಕೇಳುತ್ತವೆ.';

  @override
  String noAttendanceFor(Object name, Object days) {
    return 'ಕಳೆದ $days ದಿನಗಳಲ್ಲಿ $name ಅವರ ಹಾಜರಾತಿ ದಾಖಲಾಗಿಲ್ಲ.';
  }

  @override
  String get nothingDue =>
      'ಈಗ ಸಲ್ಲಿಸಬೇಕಾದದ್ದು ಏನೂ ಇಲ್ಲ. ಶಿಕ್ಷಕರ ಹೊಸ ಹೋಂವರ್ಕ್ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';

  @override
  String get inClass => 'ತರಗತಿಯಲ್ಲಿ';

  @override
  String inClassIntro(Object name) {
    return 'ತರಗತಿಯಲ್ಲಿ ಶಿಕ್ಷಕರು $name ಅವರನ್ನು ಪ್ರಶ್ನೆಗೆ ಉತ್ತರಿಸಲು ಆಯ್ಕೆ ಮಾಡಿದಾಗ ನೀಡಿದ ಉತ್ತರಗಳು.';
  }

  @override
  String notPickedYet(Object name) {
    return '$name ಅವರನ್ನು ಇನ್ನೂ ತರಗತಿಯಲ್ಲಿ ಉತ್ತರಿಸಲು ಆಯ್ಕೆ ಮಾಡಿಲ್ಲ.';
  }

  @override
  String get legendCorrect => 'ಸರಿ';

  @override
  String get legendPartly => 'ಭಾಗಶಃ ಸರಿ';

  @override
  String get legendNotCorrect => 'ತಪ್ಪು';

  @override
  String get legendNoAnswer => 'ಉತ್ತರವಿಲ್ಲ';

  @override
  String askedNoAnswer(int count, Object subject) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಪ್ರಶ್ನೆಗಳನ್ನು',
      one: '1 ಪ್ರಶ್ನೆ',
    );
    return '$subject ನಲ್ಲಿ $_temp0 ಕೇಳಲಾಯಿತು, ಆದರೆ ಉತ್ತರಿಸಲಿಲ್ಲ.';
  }

  @override
  String answeredOneCorrectly(Object subject) {
    return '$subject ನಲ್ಲಿ 1 ಪ್ರಶ್ನೆಗೆ ಸರಿಯಾಗಿ ಉತ್ತರಿಸಿದರು.';
  }

  @override
  String answeredAllCorrect(Object count, Object subject) {
    return '$subject ನಲ್ಲಿ $count ಪ್ರಶ್ನೆಗಳಿಗೆ ಉತ್ತರಿಸಿದರು, ಎಲ್ಲವೂ ಸರಿ.';
  }

  @override
  String answeredDetail(int count, Object subject, Object detail) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಪ್ರಶ್ನೆಗಳಿಗೆ',
      one: '1 ಪ್ರಶ್ನೆಗೆ',
    );
    return '$subject ನಲ್ಲಿ $_temp0 ಉತ್ತರಿಸಿದರು: $detail.';
  }

  @override
  String nCorrect(Object count) {
    return '$count ಸರಿ';
  }

  @override
  String nPartly(Object count) {
    return '$count ಭಾಗಶಃ ಸರಿ';
  }

  @override
  String nNotCorrect(Object count) {
    return '$count ತಪ್ಪು';
  }

  @override
  String didNotAnswer(Object count) {
    return '$count ಕ್ಕೆ ಉತ್ತರಿಸಲಿಲ್ಲ.';
  }

  @override
  String boardsEmpty(Object name) {
    return 'ಪಾಠದ ನಂತರ ಶಿಕ್ಷಕರು ತರಗತಿಯ ಬೋರ್ಡ್ ಹಂಚಿಕೊಂಡಾಗ, $name ಪುನರಾವರ್ತಿಸಲು ಅದು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';
  }

  @override
  String childAttendance(Object name) {
    return '$name ಅವರ ಹಾಜರಾತಿ';
  }

  @override
  String notMissedAny(Object name, Object days) {
    return 'ಕಳೆದ $days ದಿನಗಳಲ್ಲಿ $name ಯಾವುದೇ ತರಗತಿ ತಪ್ಪಿಸಿಲ್ಲ.';
  }

  @override
  String get homeworkFor => 'ಯಾರಿಗೆ';

  @override
  String get yourChild => 'ನಿಮ್ಮ ಮಗು';

  @override
  String get yourChildren => 'ನಿಮ್ಮ ಮಕ್ಕಳು';

  @override
  String get shownOnHome => 'ಮುಖಪುಟದಲ್ಲಿ ತೋರಿಸಲಾಗಿದೆ';

  @override
  String get noChildrenYet =>
      'ಇನ್ನೂ ಯಾವುದೇ ಮಗುವನ್ನು ಜೋಡಿಸಿಲ್ಲ. ನಿಮ್ಮ ಮಗುವಿನ ಕಾಲೇಜನ್ನು ಕೇಳಿ.';

  @override
  String get feesReceiptsHeader => 'ಶುಲ್ಕ ಮತ್ತು ರಸೀದಿಗಳು';

  @override
  String childFees(Object name) {
    return '$name ಅವರ ಶುಲ್ಕ';
  }

  @override
  String get feesSubtitle => 'ಬಾಕಿ, ಪಾವತಿಗಳು ಮತ್ತು ರಸೀದಿಗಳು';

  @override
  String childResults(Object name) {
    return '$name ಅವರ ಫಲಿತಾಂಶ';
  }

  @override
  String childLibraryBooks(Object name) {
    return '$name ಅವರ ಗ್ರಂಥಾಲಯದ ಪುಸ್ತಕಗಳು';
  }

  @override
  String noBooksBorrowed(Object name) {
    return 'ಗ್ರಂಥಾಲಯದಿಂದ ಯಾವುದೇ ಪುಸ್ತಕ ಪಡೆದಿಲ್ಲ. $name ಕಾಲೇಜು ಗ್ರಂಥಾಲಯದಿಂದ ಪಡೆಯುವ ಪುಸ್ತಕಗಳು ಹಿಂದಿರುಗಿಸುವ ದಿನಾಂಕದೊಂದಿಗೆ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';
  }

  @override
  String noBooksOutNow(Object name) {
    return 'ಈಗ $name ಅವರ ಬಳಿ ಗ್ರಂಥಾಲಯದ ಯಾವುದೇ ಪುಸ್ತಕ ಇಲ್ಲ.';
  }

  @override
  String childLibrary(Object name) {
    return 'ಗ್ರಂಥಾಲಯ: $name';
  }

  @override
  String markedAbsentFor(Object name, Object kind) {
    return 'ಈ $kind ನಲ್ಲಿ $name ಅವರನ್ನು ಗೈರು ಎಂದು ದಾಖಲಿಸಲಾಗಿದೆ.';
  }

  @override
  String noMarksCard(Object name) {
    return 'ಇನ್ನೂ ಯಾವುದೇ ಅಂಕಗಳನ್ನು ಪ್ರಕಟಿಸಿಲ್ಲ. $name ಅವರ ಶಿಕ್ಷಕರು ಪರೀಕ್ಷೆಯ ಅಂಕಗಳನ್ನು ಪ್ರಕಟಿಸಿದಾಗ, ಅವು ತರಗತಿ ಸರಾಸರಿಯೊಂದಿಗೆ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';
  }

  @override
  String noMarksScreen(Object name) {
    return 'ಇನ್ನೂ ಯಾವುದೇ ಅಂಕಗಳನ್ನು ಪ್ರಕಟಿಸಿಲ್ಲ.\n$name ಅವರ ಶಿಕ್ಷಕರು ಅಂಕಗಳನ್ನು ಪ್ರಕಟಿಸಿದಾಗ, ಅವು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';
  }

  @override
  String recordingsEmpty(Object name) {
    return 'ಶಿಕ್ಷಕರು ಬೋರ್ಡ್‌ನಲ್ಲಿ ಪಾಠವನ್ನು ರೆಕಾರ್ಡ್ ಮಾಡಿ ಹಂಚಿಕೊಂಡಾಗ, $name ಅದನ್ನು ಮತ್ತೆ ನೋಡಲು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';
  }

  @override
  String get missedThisClass => 'ಈ ತರಗತಿ ತಪ್ಪಿಹೋಗಿದೆ';

  @override
  String childLessons(Object name) {
    return '$name ಅವರ ಪಾಠಗಳು';
  }

  @override
  String get noRecordingsShared =>
      'ಇನ್ನೂ ತರಗತಿಯೊಂದಿಗೆ ಯಾವುದೇ ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್ ಹಂಚಿಕೊಂಡಿಲ್ಲ.';

  @override
  String get boardNotShared => 'ಈ ಬೋರ್ಡ್ ಅನ್ನು ಈಗ ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಂಡಿಲ್ಲ.';

  @override
  String noFeesIssued(Object name) {
    return '$name ಅವರಿಗೆ ಇನ್ನೂ ಯಾವುದೇ ಶುಲ್ಕ ವಿಧಿಸಿಲ್ಲ.';
  }

  @override
  String noFeesIssuedLong(Object name) {
    return '$name ಅವರಿಗೆ ಇನ್ನೂ ಯಾವುದೇ ಶುಲ್ಕ ವಿಧಿಸಿಲ್ಲ.\nಕಾಲೇಜಿನ ಹೊಸ ಶುಲ್ಕಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';
  }

  @override
  String get pay => 'ಪಾವತಿಸಿ';

  @override
  String get payNow => 'ಈಗ ಪಾವತಿಸಿ';

  @override
  String get startingPayment => 'ಪಾವತಿ ಆರಂಭವಾಗುತ್ತಿದೆ…';

  @override
  String get confirmingPayment => 'ಪಾವತಿ ದೃಢೀಕರಿಸಲಾಗುತ್ತಿದೆ…';

  @override
  String get paymentCancelled => 'ಪಾವತಿ ರದ್ದಾಗಿದೆ. ಯಾವುದೇ ಹಣ ಪಾವತಿಯಾಗಿಲ್ಲ.';

  @override
  String get paymentFailedTitle => 'ಪಾವತಿ ಆಗಲಿಲ್ಲ';

  @override
  String finishInWallet(Object wallet) {
    return '$wallet ನಲ್ಲಿ ಪಾವತಿ ಪೂರ್ಣಗೊಳಿಸಿ';
  }

  @override
  String walletBody(Object wallet) {
    return '$wallet ಪಾವತಿಯನ್ನು ದೃಢೀಕರಿಸಿದಾಗ, ಶುಲ್ಕ ಇಲ್ಲಿ ಅಪ್‌ಡೇಟ್ ಆಗುತ್ತದೆ ಮತ್ತು ರಸೀದಿ ಸೂಚನೆಗಳಲ್ಲಿ ಬರುತ್ತದೆ.';
  }

  @override
  String get yourWalletApp => 'ನಿಮ್ಮ ವಾಲೆಟ್ ಆ್ಯಪ್';

  @override
  String get couldNotConfirmTitle => 'ಈ ಪಾವತಿಯನ್ನು ದೃಢೀಕರಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ';

  @override
  String couldNotConfirmBody(Object reason) {
    return '$reason ನಿಮ್ಮ ಖಾತೆಯಿಂದ ಹಣ ಕಡಿತವಾಗಿದ್ದರೆ, ಕಾಲೇಜಿಗೆ ಪಾವತಿ ಗೇಟ್‌ವೇಯಿಂದ ದೃಢೀಕರಣ ಸಿಗುತ್ತದೆ ಮತ್ತು ಈ ಶುಲ್ಕ ಶೀಘ್ರದಲ್ಲೇ ಅಪ್‌ಡೇಟ್ ಆಗುತ್ತದೆ. ಇಲ್ಲದಿದ್ದರೆ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';
  }

  @override
  String get onlineNotAvailableTitle => 'ಆನ್‌ಲೈನ್ ಪಾವತಿ ಲಭ್ಯವಿಲ್ಲ';

  @override
  String get enterAmount => 'ಮೊತ್ತ ನಮೂದಿಸಿ';

  @override
  String get enterAmountRupees =>
      'ರೂಪಾಯಿಗಳಲ್ಲಿ ಮೊತ್ತ ನಮೂದಿಸಿ, ಉದಾ. 2500 ಅಥವಾ 2500.50';

  @override
  String get smallestPayment => 'ಕನಿಷ್ಠ ಪಾವತಿ ₹1';

  @override
  String moreThanDue(Object amount) {
    return 'ಇದು ಬಾಕಿ ಇರುವ $amount ಗಿಂತ ಹೆಚ್ಚು';
  }

  @override
  String payTitle(Object title) {
    return '$title ಪಾವತಿಸಿ';
  }

  @override
  String amountDue(Object amount) {
    return '$amount ಬಾಕಿ';
  }

  @override
  String fullAmount(Object amount) {
    return 'ಪೂರ್ಣ $amount';
  }

  @override
  String get partAmount => 'ಭಾಗಶಃ ಮೊತ್ತ';

  @override
  String get amount => 'ಮೊತ್ತ';

  @override
  String amountRange(Object amount) {
    return '₹1 ರಿಂದ $amount ವರೆಗೆ';
  }

  @override
  String payAmount(Object amount) {
    return '$amount ಪಾವತಿಸಿ';
  }

  @override
  String get paymentNotSetUp =>
      'ಕಾಲೇಜು ಇನ್ನೂ ಆನ್‌ಲೈನ್ ಪಾವತಿ ವ್ಯವಸ್ಥೆ ಮಾಡಿಲ್ಲ. ದಯವಿಟ್ಟು ಶುಲ್ಕ ಕೌಂಟರ್‌ನಲ್ಲಿ ಪಾವತಿಸಿ.';

  @override
  String get paymentPhonesOnly =>
      'ಆನ್‌ಲೈನ್ ಪಾವತಿ Android ಫೋನ್ ಮತ್ತು iPhone ನಲ್ಲಿ KINETIX Parent ಆ್ಯಪ್‌ನಲ್ಲಿ ಮಾತ್ರ ಸಾಧ್ಯ. ಈ ಸಾಧನದಲ್ಲಿ ದಯವಿಟ್ಟು ಶುಲ್ಕ ಕೌಂಟರ್‌ನಲ್ಲಿ ಪಾವತಿಸಿ.';

  @override
  String get demoPayment => 'ಡೆಮೊ ಪಾವತಿ';

  @override
  String get demoTo => 'ಯಾರಿಗೆ';

  @override
  String get demoFor => 'ಯಾವುದಕ್ಕೆ';

  @override
  String get demoOrder => 'ಆರ್ಡರ್';

  @override
  String demoPayAmount(Object amount) {
    return '$amount ಪಾವತಿಸಿ (ಡೆಮೊ)';
  }

  @override
  String get failNoConfirmation =>
      'ಪಾವತಿ ಆ್ಯಪ್‌ನಿಂದ ದೃಢೀಕರಣ ಬರಲಿಲ್ಲ. ನಿಮ್ಮ ಖಾತೆಯಿಂದ ಹಣ ಕಡಿತವಾಗಿದ್ದರೆ, ಶುಲ್ಕ ಶೀಘ್ರದಲ್ಲೇ ಅಪ್‌ಡೇಟ್ ಆಗುತ್ತದೆ.';

  @override
  String get failCouldNotOpen => 'ಪಾವತಿ ಪರದೆ ತೆರೆಯಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get failNetwork =>
      'ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಇಲ್ಲ. ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get failGeneric => 'ಪಾವತಿ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get paymentSuccessful => 'ಪಾವತಿ ಯಶಸ್ವಿಯಾಗಿದೆ';

  @override
  String paidFor(Object amount, Object name) {
    return '$name ಅವರಿಗಾಗಿ $amount ಪಾವತಿಯಾಗಿದೆ';
  }

  @override
  String writeToAbout(Object teacher, Object name) {
    return '$name ಬಗ್ಗೆ $teacher ಅವರಿಗೆ ಬರೆಯಿರಿ.';
  }

  @override
  String noMessagesOneChild(Object name) {
    return 'ಇನ್ನೂ ಯಾವುದೇ ಸಂದೇಶಗಳಿಲ್ಲ.\nಹೋಂವರ್ಕ್, ಗೈರು ಅಥವಾ ಪ್ರಗತಿಯ ಬಗ್ಗೆ $name ಅವರ ಶಿಕ್ಷಕರಿಗೆ ಬರೆಯಿರಿ.';
  }

  @override
  String get noMessagesChildren =>
      'ಇನ್ನೂ ಯಾವುದೇ ಸಂದೇಶಗಳಿಲ್ಲ.\nಹೋಂವರ್ಕ್, ಗೈರು ಅಥವಾ ಪ್ರಗತಿಯ ಬಗ್ಗೆ ನಿಮ್ಮ ಮಕ್ಕಳ ಶಿಕ್ಷಕರಿಗೆ ಬರೆಯಿರಿ.';

  @override
  String get noChildrenLinkedShort =>
      'ನಿಮ್ಮ ಖಾತೆಗೆ ಇನ್ನೂ ಯಾವುದೇ ಮಗುವನ್ನು ಜೋಡಿಸಿಲ್ಲ.\nನಿಮ್ಮ ಮಗುವಿನ ಕಾಲೇಜನ್ನು ಕೇಳಿ.';

  @override
  String get aboutHeader => 'ಯಾರ ಬಗ್ಗೆ';

  @override
  String childTeachers(Object name) {
    return '$name ಅವರ ಶಿಕ್ಷಕರು';
  }

  @override
  String noTeachersOnTimetable(Object name) {
    return '$name ಅವರ ವೇಳಾಪಟ್ಟಿಯಲ್ಲಿ ಇನ್ನೂ ಯಾವುದೇ ಶಿಕ್ಷಕರಿಲ್ಲ.';
  }

  @override
  String get noUpdates =>
      'ಇನ್ನೂ ಯಾವುದೇ ಸೂಚನೆಗಳಿಲ್ಲ.\nಗೈರು, ಹೋಂವರ್ಕ್ ಮತ್ತು ಕಾಲೇಜಿನ ಸಂದೇಶಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';

  @override
  String get phoneOrEmail => 'ಫೋನ್ ಅಥವಾ ಇಮೇಲ್';

  @override
  String get enterPhoneOrEmail => 'ನಿಮ್ಮ ಫೋನ್ ಸಂಖ್ಯೆ ಅಥವಾ ಇಮೇಲ್ ನಮೂದಿಸಿ';

  @override
  String get errAccountInactive =>
      'ನಿಮ್ಮ ಖಾತೆ ಸಕ್ರಿಯವಾಗಿಲ್ಲ. ನಿಮ್ಮ ಸಂಸ್ಥೆಯ ಕಚೇರಿಯನ್ನು ಕೇಳಿ.';

  @override
  String get errSignInAgain =>
      'ನಿಮ್ಮ ಸೈನ್ ಇನ್ ಅವಧಿ ಮುಗಿದಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get errTooLarge =>
      'ಒಂದು ಫೈಲ್ ತುಂಬಾ ದೊಡ್ಡದಾಗಿದೆ. ಪ್ರತಿ ಫೋಟೋ ಅಥವಾ PDF ಗರಿಷ್ಠ 8 MB ಇರಬಹುದು.';

  @override
  String get errConflict =>
      'ಈ ನಡುವೆ ಇದು ಬದಲಾಗಿದೆ. ರಿಫ್ರೆಶ್ ಮಾಡಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get errSubjectNotInClass =>
      'ಈ ವಿಷಯವನ್ನು ಈ ತರಗತಿಯಲ್ಲಿ ಕಲಿಸಲಾಗುವುದಿಲ್ಲ.';

  @override
  String get errSubmissionEmpty => 'ಉತ್ತರ ಬರೆಯಿರಿ ಅಥವಾ ಫೋಟೋ ಸೇರಿಸಿ.';

  @override
  String get errSubmissionChecked => 'ಈ ಹೋಂವರ್ಕ್ ಈಗಾಗಲೇ ಪರಿಶೀಲಿಸಲಾಗಿದೆ.';

  @override
  String get errSubmissionStudentOnly =>
      'ಈ ವಿದ್ಯಾರ್ಥಿ ತಮ್ಮ ಸ್ವಂತ ಲಾಗಿನ್‌ನಿಂದ ಹೋಂವರ್ಕ್ ಸಲ್ಲಿಸುತ್ತಾರೆ.';

  @override
  String get calendar => 'ಕ್ಯಾಲೆಂಡರ್';

  @override
  String get calendarSubtitle => 'ರಜೆಗಳು, ಪರೀಕ್ಷೆಗಳು ಮತ್ತು ಕಾರ್ಯಕ್ರಮಗಳು';

  @override
  String get upcoming => 'ಮುಂಬರುವವು';

  @override
  String get seeCalendar => 'ಪೂರ್ಣ ಕ್ಯಾಲೆಂಡರ್ ನೋಡಿ';

  @override
  String get calendarEmpty =>
      'ಮುಂದಿನ ತಿಂಗಳುಗಳಲ್ಲಿ ಯಾವುದೇ ರಜೆ, ಪರೀಕ್ಷೆ ಅಥವಾ ಕಾರ್ಯಕ್ರಮವಿಲ್ಲ.';

  @override
  String get kindHoliday => 'ರಜೆ';

  @override
  String get kindExams => 'ಪರೀಕ್ಷೆ';

  @override
  String get kindEvent => 'ಕಾರ್ಯಕ್ರಮ';

  @override
  String inDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ದಿನಗಳಲ್ಲಿ',
      one: '1 ದಿನದಲ್ಲಿ',
    );
    return '$_temp0';
  }

  @override
  String forPrograms(String programs) {
    return '$programs ಗಾಗಿ';
  }

  @override
  String holidayToday(String title) {
    return 'ಇಂದು ರಜೆ: $title';
  }

  @override
  String holidayTomorrow(String title) {
    return 'ನಾಳೆ ರಜೆ: $title';
  }

  @override
  String get noClasses => 'ತರಗತಿಗಳಿಲ್ಲ.';

  @override
  String noClassesUntil(String date) {
    return '$date ವರೆಗೆ ತರಗತಿಗಳಿಲ್ಲ.';
  }

  @override
  String get notHandedIn => 'ಇನ್ನೂ ಸಲ್ಲಿಸಿಲ್ಲ';

  @override
  String get statusHandedIn => 'ಸಲ್ಲಿಸಲಾಗಿದೆ';

  @override
  String get statusChecked => 'ಪರಿಶೀಲಿಸಲಾಗಿದೆ';

  @override
  String get statusReturned => 'ಮತ್ತೆ ಮಾಡಲು ಹಿಂದಿರುಗಿಸಲಾಗಿದೆ';

  @override
  String handedInAt(String when) {
    return '$when ರಂದು ಸಲ್ಲಿಸಲಾಗಿದೆ';
  }

  @override
  String checkedByOn(String name, String date) {
    return '$name ಅವರು $date ರಂದು ಪರಿಶೀಲಿಸಿದ್ದಾರೆ';
  }

  @override
  String returnedByOn(String name, String date) {
    return '$name ಅವರು $date ರಂದು ಹಿಂದಿರುಗಿಸಿದ್ದಾರೆ';
  }

  @override
  String get teacherRemark => 'ಶಿಕ್ಷಕರ ಟಿಪ್ಪಣಿ';

  @override
  String get answerLabel => 'ಉತ್ತರ';

  @override
  String get answerHint =>
      'ಉತ್ತರವನ್ನು ಇಲ್ಲಿ ಬರೆಯಿರಿ, ಅಥವಾ ಕೆಲಸದ ಫೋಟೋಗಳನ್ನು ಸೇರಿಸಿ';

  @override
  String get handIn => 'ಸಲ್ಲಿಸಿ';

  @override
  String get handInAgain => 'ಮತ್ತೆ ಸಲ್ಲಿಸಿ';

  @override
  String get handInTitle => 'ಹೋಂವರ್ಕ್ ಸಲ್ಲಿಸಿ';

  @override
  String get handedInDone => 'ಸಲ್ಲಿಸಲಾಗಿದೆ.';

  @override
  String get couldNotAddFile => 'ಆ ಫೈಲ್ ಸೇರಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String fileTooBig(String name) {
    return '$name ತುಂಬಾ ದೊಡ್ಡದಾಗಿದೆ (ಗರಿಷ್ಠ 8 MB).';
  }

  @override
  String filesCount(int count, int max) {
    return 'ಫೋಟೋ ಮತ್ತು PDF: $max ರಲ್ಲಿ $count';
  }

  @override
  String get removeFile => 'ತೆಗೆದುಹಾಕಿ';

  @override
  String get takePhoto => 'ಫೋಟೋ ತೆಗೆಯಿರಿ';

  @override
  String get choosePhotos => 'ಫೋಟೋಗಳನ್ನು ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get addPdf => 'PDF ಸೇರಿಸಿ';

  @override
  String get filesHint =>
      'ಗರಿಷ್ಠ 5 ಫೋಟೋ ಅಥವಾ PDF, ಪ್ರತಿಯೊಂದೂ 8 MB ವರೆಗೆ. ಕಳುಹಿಸುವ ಮೊದಲು ಫೋಟೋಗಳನ್ನು ಚಿಕ್ಕದಾಗಿಸಲಾಗುತ್ತದೆ.';

  @override
  String uploading(String percent) {
    return 'ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ… $percent';
  }

  @override
  String get photoNotLoaded => 'ಈ ಫೋಟೋ ಲೋಡ್ ಆಗಲಿಲ್ಲ.';

  @override
  String topicsTaught(int covered, int total) {
    return '$total ರಲ್ಲಿ $covered ವಿಷಯಗಳನ್ನು ಕಲಿಸಲಾಗಿದೆ';
  }

  @override
  String get taught => 'ಕಲಿಸಲಾಗಿದೆ';

  @override
  String taughtOn(String date) {
    return '$date ರಂದು ಕಲಿಸಲಾಗಿದೆ';
  }

  @override
  String get privacy => 'ಗೌಪ್ಯತೆ';

  @override
  String get privacySubtitle =>
      'ವಿದ್ಯಾರ್ಥಿಯ ಮಾಹಿತಿಯೊಂದಿಗೆ KINETIX ಏನು ಮಾಡಬಹುದು';

  @override
  String get notNow => 'ಈಗ ಬೇಡ';

  @override
  String ifYouSayNo(String text) {
    return 'ನೀವು ಬೇಡ ಎಂದರೆ: $text';
  }

  @override
  String get changeAnyTime =>
      'ಈ ಆಯ್ಕೆಗಳನ್ನು ಯಾವಾಗ ಬೇಕಾದರೂ ಪ್ರೊಫೈಲ್ → ಗೌಪ್ಯತೆ ಯಲ್ಲಿ ಬದಲಾಯಿಸಬಹುದು. ಬದಲಾವಣೆಗೆ ಮೊದಲು ಆಗಿರುವುದರ ಮೇಲೆ ಇದು ಪರಿಣಾಮ ಬೀರುವುದಿಲ್ಲ.';

  @override
  String get readFullNotice => 'ಪೂರ್ಣ ಸೂಚನೆ ಓದಿ';

  @override
  String get allowAll => 'ಎಲ್ಲವನ್ನೂ ಅನುಮತಿಸಿ';

  @override
  String get saveChoices => 'ನನ್ನ ಆಯ್ಕೆಗಳನ್ನು ಉಳಿಸಿ';

  @override
  String get notDecided => 'ಇನ್ನೂ ನಿರ್ಧರಿಸಿಲ್ಲ';

  @override
  String decidedBy(String choice, String name, String date) {
    return '$choice · $name, $date';
  }

  @override
  String get allowed => 'ಅನುಮತಿಸಲಾಗಿದೆ';

  @override
  String get notAllowed => 'ಅನುಮತಿಸಿಲ್ಲ';

  @override
  String get choicesSaved => 'ಉಳಿಸಲಾಗಿದೆ.';

  @override
  String get privacyNotice => 'ಗೌಪ್ಯತಾ ಸೂಚನೆ';

  @override
  String noticeVersion(String version) {
    return 'ಆವೃತ್ತಿ $version';
  }

  @override
  String get noticeWhoDecides => 'ಯಾರು ನಿರ್ಧರಿಸುತ್ತಾರೆ';

  @override
  String get noticeSchool =>
      'ಶಾಲೆ (18 ವರ್ಷದೊಳಗಿನ ವಿದ್ಯಾರ್ಥಿಗಳು): ಮಗುವಿನ ಪರವಾಗಿ ಪೋಷಕರು ನಿರ್ಧರಿಸುತ್ತಾರೆ.';

  @override
  String get noticeCollege =>
      'ಕಾಲೇಜು ಅಥವಾ ವಿಶ್ವವಿದ್ಯಾಲಯ: ವಿದ್ಯಾರ್ಥಿಗಳು ತಮಗಾಗಿ ತಾವೇ ನಿರ್ಧರಿಸುತ್ತಾರೆ. ತಮ್ಮದೇ KINETIX ಲಾಗಿನ್ ಇಲ್ಲದ ವಿದ್ಯಾರ್ಥಿಗೆ ಮಾತ್ರ ಪೋಷಕರು ನಿರ್ಧರಿಸುತ್ತಾರೆ.';

  @override
  String get noticeWhatWeAsk => 'ನಾವು ಏನು ಕೇಳುತ್ತೇವೆ';

  @override
  String get noticeWhereKept => 'ಡೇಟಾವನ್ನು ಎಲ್ಲಿ ಇಡಲಾಗುತ್ತದೆ';

  @override
  String get noticeDataInIndia =>
      'ಎಲ್ಲಾ ಡೇಟಾ ಮತ್ತು ಎಲ್ಲಾ AI ಸಂಸ್ಕರಣೆ ಭಾರತದಲ್ಲೇ ಇರುತ್ತದೆ. ವಿದ್ಯಾರ್ಥಿ ಸಂಸ್ಥೆಯಲ್ಲಿ ಇರುವವರೆಗೆ, ನಂತರ ಸಂಸ್ಥೆಯ ದಾಖಲೆ ನೀತಿಗೆ ಬೇಕಾದಷ್ಟು ಕಾಲ ಡೇಟಾವನ್ನು ಇಡಲಾಗುತ್ತದೆ.';

  @override
  String get noticeQuestions => 'ಪ್ರಶ್ನೆಗಳು ಮತ್ತು ವಿನಂತಿಗಳು';

  @override
  String get noticeContact =>
      'ಸಂಸ್ಥೆಯ ಕುಂದುಕೊರತೆ ಅಧಿಕಾರಿ ಪ್ರಶ್ನೆಗಳಿಗೆ ಮತ್ತು ಡೇಟಾ ನೋಡಲು, ಸರಿಪಡಿಸಲು ಅಥವಾ ಅಳಿಸಲು ಬರುವ ವಿನಂತಿಗಳಿಗೆ ಉತ್ತರಿಸುತ್ತಾರೆ. ಅವರನ್ನು ಸಂಪರ್ಕಿಸುವ ಬಗೆಯನ್ನು ಸಂಸ್ಥೆಯ ಕಚೇರಿಯಲ್ಲಿ ಕೇಳಿ.';

  @override
  String get grievanceOfficer => 'ಕುಂದುಕೊರತೆ ಅಧಿಕಾರಿ';

  @override
  String get noticeContactOfficer =>
      'ಸಂಸ್ಥೆಯ ಕುಂದುಕೊರತೆ ಅಧಿಕಾರಿ ಪ್ರಶ್ನೆಗಳಿಗೆ ಮತ್ತು ಡೇಟಾ ನೋಡಲು, ಸರಿಪಡಿಸಲು ಅಥವಾ ಅಳಿಸಲು ಬರುವ ವಿನಂತಿಗಳಿಗೆ ಉತ್ತರಿಸುತ್ತಾರೆ. ಅವರನ್ನು ಇಲ್ಲಿ ಸಂಪರ್ಕಿಸಿ:';

  @override
  String get contactEmail => 'ಇಮೇಲ್';

  @override
  String get contactPhone => 'ಫೋನ್';

  @override
  String get purposeDataTitle => 'ದಾಖಲೆಗಳು ಮತ್ತು ಸೂಚನೆಗಳು';

  @override
  String get purposeDataBody =>
      'ಸಂಸ್ಥೆ ತರಗತಿಗಳನ್ನು ನಡೆಸಲು ಮತ್ತು ನಿಮಗೆ ಮಾಹಿತಿ ನೀಡಲು ವಿದ್ಯಾರ್ಥಿಯ ಹಾಜರಾತಿ, ಹೋಂವರ್ಕ್, ಅಂಕಗಳು, ಶುಲ್ಕ ಮತ್ತು ಗ್ರಂಥಾಲಯದ ದಾಖಲೆಗಳನ್ನು ಇಡುವುದು.';

  @override
  String get purposeDataNo =>
      'ಕಾನೂನಿನ ಪ್ರಕಾರ ಇಡಬೇಕಾದ ದಾಖಲೆಗಳನ್ನು ಸಂಸ್ಥೆ ಇನ್ನೂ ಇಡುತ್ತದೆ; ನಿಮಗೆ ಆ್ಯಪ್‌ನಲ್ಲಿ ಸೂಚನೆಗಳು ಬರುವುದಿಲ್ಲ.';

  @override
  String get purposeAiTitle => 'KINETIX AI';

  @override
  String get purposeAiBody =>
      'ಸಂದೇಹಗಳಿಗೆ ವಿದ್ಯಾರ್ಥಿ KINETIX AI ನಿಂದ ಸಹಾಯ ಕೇಳುವುದು. ಪ್ರಶ್ನೆಗಳನ್ನು ಭಾರತದ ಸರ್ವರ್‌ಗಳಲ್ಲಿ ಸಂಸ್ಕರಿಸಲಾಗುತ್ತದೆ ಮತ್ತು AI ಮಾದರಿಗಳ ತರಬೇತಿಗೆ ಬಳಸಲಾಗುವುದಿಲ್ಲ.';

  @override
  String get purposeAiNo =>
      'ವಿದ್ಯಾರ್ಥಿಗೆ KINETIX AI ಆಫ್ ಆಗುತ್ತದೆ. ಉಳಿದೆಲ್ಲವೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ.';

  @override
  String get purposeRecordingsTitle => 'ತರಗತಿ ರೆಕಾರ್ಡಿಂಗ್ ಮತ್ತು ಲೈವ್ ತರಗತಿಗಳು';

  @override
  String get purposeRecordingsBody =>
      'ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಂಡ ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್ ಮತ್ತು ಲೈವ್ ತರಗತಿಗಳಲ್ಲಿ ವಿದ್ಯಾರ್ಥಿಯ ಧ್ವನಿ ಅಥವಾ ಚಿತ್ರ ಬರುವುದು.';

  @override
  String get purposeRecordingsNo =>
      'ವಿದ್ಯಾರ್ಥಿಯನ್ನು ರೆಕಾರ್ಡ್ ಮಾಡದಂತೆ ಶಿಕ್ಷಕರಿಗೆ ತಿಳಿಸಲಾಗುತ್ತದೆ; ಈಗಾಗಲೇ ಹಂಚಿಕೊಂಡ ರೆಕಾರ್ಡಿಂಗ್‌ಗಳು ತರಗತಿಯಲ್ಲೇ ಇರುತ್ತವೆ.';

  @override
  String get purposePhotosTitle => 'ಫೋಟೋಗಳು';

  @override
  String get purposePhotosBody =>
      'ವಿದ್ಯಾರ್ಥಿಯ ಫೋಟೋಗಳನ್ನು (ಉದಾಹರಣೆಗೆ ಹೋಂವರ್ಕ್‌ನಲ್ಲಿ ಅಥವಾ ತರಗತಿ ಚಟುವಟಿಕೆಗಳಲ್ಲಿ) ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳುವುದು.';

  @override
  String get purposePhotosNo =>
      'ವಿದ್ಯಾರ್ಥಿಯ ಫೋಟೋಗಳನ್ನು ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಲಾಗುವುದಿಲ್ಲ.';

  @override
  String get errConsentGuardianDecides =>
      'ಈ ವಿದ್ಯಾರ್ಥಿಗಾಗಿ ನೀವು ಈ ಆಯ್ಕೆಗಳನ್ನು ಬದಲಾಯಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ.';

  @override
  String childWork(String name) {
    return '$name ಅವರ ಕೆಲಸ';
  }

  @override
  String get returnedNote =>
      'ಇದನ್ನು ಮತ್ತೆ ಮಾಡಲು ಶಿಕ್ಷಕರು ಹೇಳಿದ್ದಾರೆ. ಟಿಪ್ಪಣಿ ಓದಿ, ನಂತರ ಮತ್ತೆ ಸಲ್ಲಿಸಿ.';

  @override
  String handInFor(String name) {
    return '$name ಪರವಾಗಿ ಸಲ್ಲಿಸಿ';
  }

  @override
  String get handInForNote =>
      'ತಮ್ಮದೇ KINETIX ಲಾಗಿನ್ ಇಲ್ಲದ ಮಗುವಿನ ಪರವಾಗಿ ಇಲ್ಲಿ ಸಲ್ಲಿಸಿ.';

  @override
  String consentTitleFor(String name) {
    return '$name ಅವರ ಗೌಪ್ಯತೆಯ ಆಯ್ಕೆಗಳು';
  }

  @override
  String consentIntroFor(String name) {
    return 'KINETIX $name ಅವರ ಮಾಹಿತಿಯೊಂದಿಗೆ ಏನು ಮಾಡಬಹುದು ಎಂಬುದನ್ನು ಆಯ್ಕೆಮಾಡಿ. ನೀವು ಆಯ್ಕೆ ಮಾಡುವವರೆಗೆ ಯಾವುದೂ ಆನ್ ಆಗುವುದಿಲ್ಲ.';
  }

  @override
  String privacyIntroFor(String name) {
    return 'KINETIX $name ಅವರ ಮಾಹಿತಿಯೊಂದಿಗೆ ಏನು ಮಾಡಬಹುದು. ಅನುಮತಿ ಹಿಂಪಡೆಯಲು ಸ್ವಿಚ್ ಆಫ್ ಮಾಡಿ.';
  }

  @override
  String privacyIntroReadOnlyFor(String name) {
    return 'KINETIX $name ಅವರ ಮಾಹಿತಿಯೊಂದಿಗೆ ಏನು ಮಾಡಬಹುದು, ಮತ್ತು ಯಾರು ನಿರ್ಧರಿಸಿದರು.';
  }

  @override
  String managedByStudent(String name) {
    return 'ಇದನ್ನು $name ಅವರೇ ನಿರ್ವಹಿಸುತ್ತಾರೆ. ಕಾಲೇಜಿನಲ್ಲಿ ತಮ್ಮದೇ KINETIX ಲಾಗಿನ್ ಇರುವ ವಿದ್ಯಾರ್ಥಿಗಳು ಈ ಆಯ್ಕೆಗಳನ್ನು ತಾವೇ ಮಾಡುತ್ತಾರೆ.';
  }

  @override
  String childPrivacy(String name) {
    return 'ಗೌಪ್ಯತೆ: $name';
  }

  @override
  String get syllabusProgress => 'ಪಠ್ಯಕ್ರಮದ ಪ್ರಗತಿ';

  @override
  String childSyllabusProgress(String name) {
    return 'ಪಠ್ಯಕ್ರಮದ ಪ್ರಗತಿ: $name';
  }

  @override
  String get syllabusProgressSubtitle =>
      'ಪ್ರತಿ ವಿಷಯದಲ್ಲಿ ತರಗತಿಗೆ ಏನು ಕಲಿಸಲಾಗಿದೆ';

  @override
  String get syllabusSubjectsEmpty =>
      'ಶಿಕ್ಷಕರು ಹೋಂವರ್ಕ್ ನೀಡಿದ ನಂತರ ವಿಷಯಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';

  @override
  String syllabusNotLinked(String subject) {
    return '$subject ಪಠ್ಯಕ್ರಮ ಇನ್ನೂ KINETIX ನಲ್ಲಿ ಇಲ್ಲ.';
  }

  @override
  String chaptersTopics(int chapters) {
    String _temp0 = intl.Intl.pluralLogic(
      chapters,
      locale: localeName,
      other: '$chapters ಅಧ್ಯಾಯಗಳು',
      one: '1 ಅಧ್ಯಾಯ',
    );
    return '$_temp0';
  }

  @override
  String get noTopicsInChapter => 'ಇನ್ನೂ ಯಾವುದೇ ವಿಷಯಗಳಿಲ್ಲ';

  @override
  String get thisWeekInClass => 'ಈ ವಾರ ತರಗತಿಯಲ್ಲಿ';

  @override
  String get nextWeekInClass => 'ಮುಂದಿನ ವಾರ';

  @override
  String get nothingPlannedThisWeek => 'ಈ ವಾರಕ್ಕೆ ಹೊಸ ವಿಷಯಗಳನ್ನು ಯೋಜಿಸಿಲ್ಲ.';

  @override
  String get planOnSchedule => 'ತರಗತಿ ಯೋಜನೆಯಂತೆ ನಡೆಯುತ್ತಿದೆ';

  @override
  String get planAhead => 'ತರಗತಿ ಯೋಜನೆಗಿಂತ ಮುಂದಿದೆ';

  @override
  String planBehind(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'ತರಗತಿ ಯೋಜನೆಗಿಂತ $count ವಿಷಯಗಳಷ್ಟು ಹಿಂದಿದೆ',
      one: 'ತರಗತಿ ಯೋಜನೆಗಿಂತ 1 ವಿಷಯ ಹಿಂದಿದೆ',
    );
    return '$_temp0';
  }

  @override
  String get planIntro => 'ಶಿಕ್ಷಕರು ಕಲಿಸಲು ಯೋಜಿಸಿರುವ ವಿಷಯಗಳು.';

  @override
  String get phoneNumber => 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ';

  @override
  String get enterPhone => 'ನಿಮ್ಮ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ';

  @override
  String get enterValidMobile => '10 ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ';

  @override
  String get sendCode => 'ಕೋಡ್ ಕಳುಹಿಸಿ';

  @override
  String otpSentTo(String phone) {
    return '$phone ಗೆ ಕಳುಹಿಸಿದ 6 ಅಂಕಿಯ ಕೋಡ್ ನಮೂದಿಸಿ';
  }

  @override
  String get otpCode => '6 ಅಂಕಿಯ ಕೋಡ್';

  @override
  String get enterOtp => '6 ಅಂಕಿಯ ಕೋಡ್ ನಮೂದಿಸಿ';

  @override
  String get resendCode => 'ಕೋಡ್ ಮತ್ತೆ ಕಳುಹಿಸಿ';

  @override
  String resendIn(String time) {
    return '$time ನಂತರ ಕೋಡ್ ಮತ್ತೆ ಕಳುಹಿಸಿ';
  }

  @override
  String get changeNumber => 'ಸಂಖ್ಯೆ ಬದಲಿಸಿ';

  @override
  String get usePassword => 'ಬದಲಿಗೆ ಪಾಸ್‌ವರ್ಡ್ ಬಳಸಿ';

  @override
  String get usePhoneCode => 'ಬದಲಿಗೆ ಫೋನ್‌ಗೆ ಕೋಡ್ ಪಡೆಯಿರಿ';

  @override
  String get errOtpInvalid =>
      'ಈ ಕೋಡ್ ತಪ್ಪಾಗಿದೆ ಅಥವಾ ಅವಧಿ ಮುಗಿದಿದೆ. SMS ಪರಿಶೀಲಿಸಿ ಅಥವಾ ಹೊಸ ಕೋಡ್ ಕೇಳಿ.';

  @override
  String get errOtpTooMany =>
      'ಹಲವು ಬಾರಿ ಕೋಡ್ ಕೇಳಲಾಗಿದೆ. ಕೆಲವು ನಿಮಿಷ ಕಾದು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get notificationsTitle => 'ಈ ಫೋನ್‌ನಲ್ಲಿ ಸೂಚನೆಗಳನ್ನು ಪಡೆಯಬೇಕೇ?';

  @override
  String get notificationsAllow => 'ಆನ್ ಮಾಡಿ';

  @override
  String get otpHint =>
      'ನಿಮ್ಮ ಮಗುವಿನ ಕಾಲೇಜಿಗೆ ನೀಡಿದ ಫೋನ್ ಸಂಖ್ಯೆಗೆ ನಾವು ಕೋಡ್ ಕಳುಹಿಸುತ್ತೇವೆ';

  @override
  String get notificationsBody =>
      'ಹಾಜರಾತಿ, ಹೋಂವರ್ಕ್, ಫಲಿತಾಂಶಗಳು, ಶುಲ್ಕ ಮತ್ತು ನಿಮ್ಮ ಮಗುವಿನ ಕಾಲೇಜಿನ ಸಂದೇಶಗಳ ಬಗ್ಗೆ ನಾವು ತಿಳಿಸುತ್ತೇವೆ. ಇದನ್ನು ಯಾವಾಗ ಬೇಕಾದರೂ ಫೋನ್‌ನ ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಬದಲಿಸಬಹುದು.';

  @override
  String get demoChip => 'ಡೆಮೊ';

  @override
  String get demoBannerTitle => 'ಡೆಮೊ ಮೋಡ್';

  @override
  String get demoBannerBody =>
      'KINETIX ಡೆಮೊ ಕಾಲೇಜಿನ ಮಾದರಿ ಡೇಟಾ. ಯಾವುದನ್ನೂ ಸರ್ವರ್‌ಗೆ ಕಳುಹಿಸುವುದಿಲ್ಲ, ಮತ್ತು ನಿಮ್ಮ ಬದಲಾವಣೆಗಳು ಆ್ಯಪ್ ಮುಚ್ಚುವವರೆಗೆ ಮಾತ್ರ ಇರುತ್ತವೆ.';

  @override
  String demoSignInAs(String name) {
    return '$name ಆಗಿ ಸೈನ್ ಇನ್ ಮಾಡಿ';
  }

  @override
  String get demoOtpHint => 'ಡೆಮೊ: ಯಾವುದೇ ಸಂಖ್ಯೆ ಸಾಕು; ಕೋಡ್ 123456.';

  @override
  String get notInDemo => 'ಡೆಮೊದಲ್ಲಿ ಲಭ್ಯವಿಲ್ಲ.';

  @override
  String recordingAvailableUntil(String date) {
    return '$date ರವರೆಗೆ ಲಭ್ಯ';
  }

  @override
  String get bus => 'ಬಸ್';

  @override
  String get busSubtitle => 'ಮಾರ್ಗ, ನಿಲ್ದಾಣ ಮತ್ತು ಬಸ್ ಈಗ ಎಲ್ಲಿದೆ';

  @override
  String busTitle(Object name) {
    return '$name ಅವರ ಬಸ್';
  }

  @override
  String busNoBus(Object name) {
    return '$name ಶಾಲಾ ಬಸ್ ಬಳಸುವುದಿಲ್ಲ.';
  }

  @override
  String get busRoute => 'ಮಾರ್ಗ';

  @override
  String get busYourStop => 'ನಿಲ್ದಾಣ';

  @override
  String get busPickupTime => 'ಪಿಕಪ್ ಸಮಯ';

  @override
  String get busVehicle => 'ವಾಹನ';

  @override
  String get busNotRunning =>
      'ಈಗ ಯಾವುದೇ ಬಸ್ ಓಡುತ್ತಿಲ್ಲ. ಚಾಲಕ ಪ್ರಯಾಣ ಆರಂಭಿಸಿದಾಗ ಲೈವ್ ನಕ್ಷೆ ಕಾಣಿಸುತ್ತದೆ.';

  @override
  String busArrivingIn(int minutes) {
    String _temp0 = intl.Intl.pluralLogic(
      minutes,
      locale: localeName,
      other: '$minutes ನಿಮಿಷಗಳಲ್ಲಿ ತಲುಪುತ್ತದೆ',
      one: '1 ನಿಮಿಷದಲ್ಲಿ ತಲುಪುತ್ತದೆ',
    );
    return '$_temp0';
  }

  @override
  String busStopsAway(int count, Object name) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ನಿಲ್ದಾಣ ದೂರ',
      one: '1 ನಿಲ್ದಾಣ ದೂರ',
      zero: 'ಮುಂದಿನ ನಿಲ್ದಾಣ $name',
    );
    return '$_temp0';
  }

  @override
  String get busPassed => 'ಬಸ್ ಈ ನಿಲ್ದಾಣವನ್ನು ದಾಟಿದೆ.';

  @override
  String get busStops => 'ನಿಲ್ದಾಣಗಳು';

  @override
  String get busLive => 'ಲೈವ್';

  @override
  String get careersTitle => 'ಉದ್ಯೋಗ ಅವಕಾಶಗಳು';

  @override
  String get careersSubtitle => 'ಕ್ಯಾಂಪಸ್ ಡ್ರೈವ್, ಆಫರ್ ಮತ್ತು ಇಂಟರ್ನ್‌ಶಿಪ್';

  @override
  String careersAcademics(Object cgpa, int backlogs) {
    String _temp0 = intl.Intl.pluralLogic(
      backlogs,
      locale: localeName,
      other: '$backlogs ಬ್ಯಾಕ್‌ಲಾಗ್‌ಗಳು',
      one: '1 ಬ್ಯಾಕ್‌ಲಾಗ್',
      zero: 'ಬ್ಯಾಕ್‌ಲಾಗ್ ಇಲ್ಲ',
    );
    return 'CGPA $cgpa · $_temp0';
  }

  @override
  String get careersNoResult => 'ಇನ್ನೂ ಯಾವ ಫಲಿತಾಂಶವೂ ಪ್ರಕಟವಾಗಿಲ್ಲ';

  @override
  String get careersDrives => 'ಡ್ರೈವ್‌ಗಳು';

  @override
  String get careersNoDrives => 'ಈಗ ಯಾವ ಡ್ರೈವ್ ಕೂಡ ತೆರೆದಿಲ್ಲ.';

  @override
  String get careersOffers => 'ಆಫರ್‌ಗಳು';

  @override
  String get careersInternships => 'ಇಂಟರ್ನ್‌ಶಿಪ್‌ಗಳು';

  @override
  String get careersPlaced => 'ಒಂದು ಆಫರ್ ಸ್ವೀಕರಿಸಲಾಗಿದೆ. ಅಭಿನಂದನೆಗಳು!';

  @override
  String get careersRegister => 'ನೋಂದಾಯಿಸಿ';

  @override
  String get careersWithdraw => 'ಹಿಂಪಡೆಯಿರಿ';

  @override
  String get careersAccept => 'ಸ್ವೀಕರಿಸಿ';

  @override
  String get careersDecline => 'ತಿರಸ್ಕರಿಸಿ';

  @override
  String get careersViewOnly =>
      'ನೀವು ಇಲ್ಲಿ ಡ್ರೈವ್ ಮತ್ತು ಆಫರ್‌ಗಳನ್ನು ನೋಡಬಹುದು. ನೋಂದಣಿ ಮತ್ತು ಆಫರ್‌ಗೆ ಉತ್ತರ ನೀಡುವುದು ನಿಮ್ಮ ಮಗು ಮಾತ್ರ.';

  @override
  String careersPackage(Object ctc) {
    return 'ವಾರ್ಷಿಕ $ctc ಲಕ್ಷ';
  }

  @override
  String careersMinCgpa(Object cgpa) {
    return 'ಕನಿಷ್ಠ CGPA $cgpa';
  }

  @override
  String careersRegisteredNote(Object drive) {
    return 'ನೀವು $drive ಗೆ ನೋಂದಾಯಿಸಿದ್ದೀರಿ';
  }

  @override
  String get careersReg_registered => 'ನೋಂದಾಯಿತ';

  @override
  String get careersReg_shortlisted => 'ಆಯ್ಕೆ ಪಟ್ಟಿಯಲ್ಲಿ';

  @override
  String get careersReg_rejected => 'ಆಯ್ಕೆಯಾಗಿಲ್ಲ';

  @override
  String get careersReg_selected => 'ಆಯ್ಕೆಯಾಗಿದೆ';

  @override
  String get careersReg_withdrawn => 'ಹಿಂಪಡೆಯಲಾಗಿದೆ';

  @override
  String get careersOffer_offered => 'ಉತ್ತರಕ್ಕಾಗಿ ಕಾಯುತ್ತಿದೆ';

  @override
  String get careersOffer_accepted => 'ಸ್ವೀಕರಿಸಲಾಗಿದೆ';

  @override
  String get careersOffer_declined => 'ತಿರಸ್ಕರಿಸಲಾಗಿದೆ';

  @override
  String get careersOffer_withdrawn => 'ಕಂಪನಿ ಹಿಂಪಡೆದಿದೆ';

  @override
  String get careersOffer_expired => 'ಅವಧಿ ಮುಗಿದಿದೆ';

  @override
  String get careersReason_not_open => 'ನೋಂದಣಿಗೆ ತೆರೆದಿಲ್ಲ';

  @override
  String get careersReason_deadline_passed => 'ನೋಂದಣಿ ಮುಗಿದಿದೆ';

  @override
  String get careersReason_no_results => 'ಇನ್ನೂ ಯಾವ ಫಲಿತಾಂಶವೂ ಪ್ರಕಟವಾಗಿಲ್ಲ';

  @override
  String get careersReason_cgpa_below => 'CGPA ಕನಿಷ್ಠಕ್ಕಿಂತ ಕಡಿಮೆ ಇದೆ';

  @override
  String get careersReason_backlogs_exceeded => 'ಬ್ಯಾಕ್‌ಲಾಗ್‌ಗಳು ಹೆಚ್ಚಿವೆ';

  @override
  String get careersReason_program_not_eligible => 'ನಿಮ್ಮ ಕೋರ್ಸ್‌ಗೆ ತೆರೆದಿಲ್ಲ';

  @override
  String get grievancesTitle => 'ದೂರುಗಳು';

  @override
  String get grievancesSubtitle =>
      'ನಿಮ್ಮ ಸಮಸ್ಯೆ ದಾಖಲಿಸಿ, ಪರಿಹಾರದವರೆಗೆ ಹಿಂಬಾಲಿಸಿ';

  @override
  String get grievanceNone => 'ಇನ್ನೂ ಯಾವ ದೂರೂ ದಾಖಲಾಗಿಲ್ಲ.';

  @override
  String get grievanceRaise => 'ದೂರು ದಾಖಲಿಸಿ';

  @override
  String get grievanceCategory => 'ವರ್ಗ';

  @override
  String get grievanceSubject => 'ವಿಷಯ';

  @override
  String get grievanceDescription => 'ಏನಾಯಿತು?';

  @override
  String get grievanceAnonymous => 'ಸಿಬ್ಬಂದಿಯಿಂದ ನನ್ನ ಹೆಸರು ಮರೆಮಾಡಿ';

  @override
  String get grievanceAnonymousHint =>
      'ಯಾರು ದಾಖಲಿಸಿದರು ಎಂದು ತಂಡಕ್ಕೆ ಕಾಣುವುದಿಲ್ಲ. ನೀವು ಇಲ್ಲಿ ಹಿಂಬಾಲಿಸಬಹುದು.';

  @override
  String get grievanceConfidentialHint =>
      'ರ‍್ಯಾಗಿಂಗ್ ಮತ್ತು ಕಿರುಕುಳದ ವಿಷಯಗಳು ಗೌಪ್ಯ ಸಮಿತಿಗೆ ಹೋಗುತ್ತವೆ. ಬೇರೆ ಯಾರೂ ಅವನ್ನು ಓದಲಾಗದು.';

  @override
  String get grievanceSubmit => 'ಸಲ್ಲಿಸಿ';

  @override
  String grievanceRecorded(Object ticketNo) {
    return 'ನಿಮ್ಮ ದೂರು $ticketNo ಆಗಿ ದಾಖಲಾಗಿದೆ';
  }

  @override
  String grievanceDue(Object date) {
    return '$date ರೊಳಗೆ ಉತ್ತರ';
  }

  @override
  String get grievanceResolution => 'ಪರಿಹಾರ';

  @override
  String get grievanceRate => 'ಪರಿಹಾರದಿಂದ ನಿಮಗೆ ಎಷ್ಟು ತೃಪ್ತಿ ಇದೆ?';

  @override
  String get grievanceRated => 'ರೇಟಿಂಗ್ ನೀಡಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದ';

  @override
  String get grievanceAnonymousTag => 'ಅನಾಮಧೇಯ';

  @override
  String get grievanceCat_academic => 'ಶೈಕ್ಷಣಿಕ';

  @override
  String get grievanceCat_exam => 'ಪರೀಕ್ಷೆ';

  @override
  String get grievanceCat_fees => 'ಶುಲ್ಕ';

  @override
  String get grievanceCat_hostel => 'ವಿದ್ಯಾರ್ಥಿ ನಿಲಯ';

  @override
  String get grievanceCat_transport => 'ಸಾರಿಗೆ';

  @override
  String get grievanceCat_infrastructure => 'ಮೂಲಸೌಕರ್ಯ';

  @override
  String get grievanceCat_staff_conduct => 'ಸಿಬ್ಬಂದಿ ನಡವಳಿಕೆ';

  @override
  String get grievanceCat_ragging => 'ರ‍್ಯಾಗಿಂಗ್';

  @override
  String get grievanceCat_harassment => 'ಕಿರುಕುಳ';

  @override
  String get grievanceCat_other => 'ಇತರೆ';

  @override
  String get grievanceStatus_open => 'ಸ್ವೀಕರಿಸಲಾಗಿದೆ';

  @override
  String get grievanceStatus_assigned => 'ತಂಡದ ಸದಸ್ಯರ ಬಳಿ ಇದೆ';

  @override
  String get grievanceStatus_in_progress => 'ಪರಿಶೀಲನೆಯಲ್ಲಿದೆ';

  @override
  String get grievanceStatus_escalated => 'ಹಿರಿಯರಿಗೆ ಕಳುಹಿಸಲಾಗಿದೆ';

  @override
  String get grievanceStatus_resolved => 'ಪರಿಹಾರವಾಗಿದೆ';

  @override
  String get grievanceStatus_closed => 'ಮುಚ್ಚಲಾಗಿದೆ';

  @override
  String get grievanceStatus_reopened => 'ಮರುತೆರೆಯಲಾಗಿದೆ';

  @override
  String childCareers(Object name) {
    return '$name ಅವರ ವೃತ್ತಿ ಅವಕಾಶಗಳು';
  }

  @override
  String childGrievances(Object name) {
    return '$name ಅವರ ದೂರುಗಳು';
  }

  @override
  String get examsTitle => 'ಪರೀಕ್ಷೆಗಳು';

  @override
  String get examTimetable => 'ವೇಳಾಪಟ್ಟಿ';

  @override
  String get examResultsTitle => 'ಫಲಿತಾಂಶ';

  @override
  String get noExamsScheduled =>
      'ಇನ್ನೂ ಯಾವುದೇ ಪರೀಕ್ಷೆ ನಿಗದಿಯಾಗಿಲ್ಲ. ಕಾಲೇಜು ವೇಳಾಪಟ್ಟಿ ಪ್ರಕಟಿಸಿದಾಗ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';

  @override
  String get noExamResults => 'ಇನ್ನೂ ಯಾವುದೇ ಫಲಿತಾಂಶ ಪ್ರಕಟವಾಗಿಲ್ಲ.';

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
    return '$room · ಆಸನ $seat';
  }

  @override
  String examMaxMarks(int n) {
    return '$n ಅಂಕಗಳು';
  }

  @override
  String get hallTicket => 'ಪ್ರವೇಶ ಪತ್ರ';

  @override
  String get hallTicketDownload => 'ಪ್ರವೇಶ ಪತ್ರ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ';

  @override
  String hallTicketWithheld(String reason) {
    return 'ಪ್ರವೇಶ ಪತ್ರ ತಡೆಹಿಡಿಯಲಾಗಿದೆ: $reason';
  }

  @override
  String get hallTicketWithheldNoReason =>
      'ಪ್ರವೇಶ ಪತ್ರ ತಡೆಹಿಡಿಯಲಾಗಿದೆ. ಪರೀಕ್ಷಾ ಕಚೇರಿಯನ್ನು ಸಂಪರ್ಕಿಸಿ.';

  @override
  String get hallTicketNotIssued => 'ಪ್ರವೇಶ ಪತ್ರ ಇನ್ನೂ ನೀಡಿಲ್ಲ.';

  @override
  String get fileOpenFailed =>
      'ಈ ಫೈಲ್ ತೆರೆಯಲಾಗಲಿಲ್ಲ. PDF ತೆರೆಯುವ ಆ್ಯಪ್ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿ.';

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
  String get resultPass => 'ಉತ್ತೀರ್ಣ';

  @override
  String get resultFail => 'ಉತ್ತೀರ್ಣರಾಗಿಲ್ಲ';

  @override
  String resultLine(String percent, String grade) {
    return '$percent% · ಗ್ರೇಡ್ $grade';
  }

  @override
  String get revaluationRequest => 'ಮರುಮೌಲ್ಯಮಾಪನಕ್ಕೆ ಮನವಿ';

  @override
  String get revaluationWhy => 'ಈ ಪತ್ರಿಕೆಯನ್ನು ಏಕೆ ಮರುಪರಿಶೀಲಿಸಬೇಕು?';

  @override
  String get revaluationNeedReason =>
      'ಕೆಲವು ಪದಗಳನ್ನು ಬರೆಯಿರಿ (ಕನಿಷ್ಠ 3 ಅಕ್ಷರ).';

  @override
  String get revaluationSent =>
      'ಮನವಿ ಕಳುಹಿಸಲಾಗಿದೆ. ಪರೀಕ್ಷಾ ಕಚೇರಿ ತೀರ್ಮಾನಿಸುತ್ತದೆ.';

  @override
  String get revaluationRequested => 'ಮರುಮೌಲ್ಯಮಾಪನ ಕೋರಲಾಗಿದೆ';

  @override
  String get revaluationAccepted => 'ಮರುಮೌಲ್ಯಮಾಪನ ಒಪ್ಪಲಾಗಿದೆ';

  @override
  String get revaluationRejected => 'ಮರುಮೌಲ್ಯಮಾಪನ ತಿರಸ್ಕರಿಸಲಾಗಿದೆ';

  @override
  String get revaluationCompleted => 'ಮರುಮೌಲ್ಯಮಾಪನ ಪೂರ್ಣ';

  @override
  String get examDone => 'ಮುಗಿದಿದೆ';

  @override
  String get navFees => 'ಶುಲ್ಕ';

  @override
  String get navMore => 'ಇನ್ನಷ್ಟು';

  @override
  String get homeTabOverview => 'ಸಾರಾಂಶ';

  @override
  String get homeTabAcademics => 'ಶೈಕ್ಷಣಿಕ';

  @override
  String get homeTabFees => 'ಶುಲ್ಕ';

  @override
  String get homeTabAttendance => 'ಹಾಜರಾತಿ';

  @override
  String get chooseChild => 'ಮಗುವನ್ನು ಆರಿಸಿ';

  @override
  String get switchChildHint => 'ಮಗುವನ್ನು ಬದಲಿಸಲು ಒತ್ತಿ';

  @override
  String get tileInternalMarks => 'ಆಂತರಿಕ ಅಂಕಗಳು';

  @override
  String get tileAssignments => 'ಅಸೈನ್‌ಮೆಂಟ್‌ಗಳು';

  @override
  String tilePendingValue(int n) {
    return '$n ಬಾಕಿ';
  }

  @override
  String get tileAllDone => 'ಎಲ್ಲವೂ ಮುಗಿದಿದೆ';

  @override
  String get tileOverall => 'ಒಟ್ಟಾರೆ ಪ್ರಗತಿ';

  @override
  String get progressExcellent => 'ಅತ್ಯುತ್ತಮ';

  @override
  String get progressGood => 'ಚೆನ್ನಾಗಿದೆ';

  @override
  String get progressFair => 'ಸಾಧಾರಣ';

  @override
  String get progressNeedsAttention => 'ಗಮನ ಬೇಕು';

  @override
  String get progressNoData => 'ಇನ್ನೂ ಸಾಕಷ್ಟು ಮಾಹಿತಿ ಇಲ್ಲ';

  @override
  String get recentUpdates => 'ಇತ್ತೀಚಿನ ಸೂಚನೆಗಳು';

  @override
  String examsForChild(String name) {
    return '$name ಅವರ ಪರೀಕ್ಷೆಗಳು';
  }

  @override
  String get examsSubtitle => 'ವೇಳಾಪಟ್ಟಿ, ಪ್ರವೇಶ ಪತ್ರ ಮತ್ತು ಫಲಿತಾಂಶ';

  @override
  String get moreFamily => 'ಕುಟುಂಬ';

  @override
  String get coursesNone =>
      'ಇನ್ನೂ ಕೋರ್ಸ್‌ಗಳಿಲ್ಲ. ಶಿಕ್ಷಕರು ಪ್ರಕಟಿಸಿದಾಗ ಇಲ್ಲಿ ಕಾಣುತ್ತವೆ.';

  @override
  String courseModulesCount(int count) {
    return '$count ಮಾಡ್ಯೂಲ್‌ಗಳು';
  }

  @override
  String get courseGradeTitle => 'ಇಲ್ಲಿಯವರೆಗಿನ ಗ್ರೇಡ್';

  @override
  String get courseNoGrade => 'ಇನ್ನೂ ಯಾವುದೂ ಗ್ರೇಡ್ ಆಗಿಲ್ಲ.';

  @override
  String get courseAnnouncements => 'ಪ್ರಕಟಣೆಗಳು';

  @override
  String get courseNoModules => 'ಇನ್ನೂ ಮಾಡ್ಯೂಲ್‌ಗಳಿಲ್ಲ.';

  @override
  String get gradesTitle => 'ಕೋರ್ಸ್ ಗ್ರೇಡ್‌ಗಳು';

  @override
  String get gradesSubtitle =>
      'ಪ್ರತಿ ವಿಷಯದ ಮಾಡ್ಯೂಲ್‌ಗಳು ಮತ್ತು ಇಲ್ಲಿಯವರೆಗಿನ ಗ್ರೇಡ್';

  @override
  String childGrades(String name) {
    return 'ಗ್ರೇಡ್‌ಗಳು: $name';
  }

  @override
  String get boarding => 'ಹಾಸ್ಟೆಲ್ ಮತ್ತು ಕ್ಯಾಂಟೀನ್';

  @override
  String get boardingSubtitle => 'ರಾತ್ರಿ ಹಾಜರಾತಿ, ವಾಲೆಟ್ ಮತ್ತು ಊಟ';

  @override
  String boardingTitle(Object name) {
    return '$name ಅವರ ಹಾಸ್ಟೆಲ್ ಮತ್ತು ಕ್ಯಾಂಟೀನ್';
  }

  @override
  String get hostel => 'ಹಾಸ್ಟೆಲ್';

  @override
  String hostelBedLine(Object block, Object room, Object bed) {
    return '$block, ಕೊಠಡಿ $room, ಹಾಸಿಗೆ $bed';
  }

  @override
  String get notInHostel => 'ಹಾಸ್ಟೆಲ್‌ನಲ್ಲಿ ಇಲ್ಲ';

  @override
  String get nightRoll => 'ರಾತ್ರಿ ಹಾಜರಾತಿ';

  @override
  String get noNights => 'ಇನ್ನೂ ಹಾಜರಾತಿ ಇಲ್ಲ';

  @override
  String get nightPresent => 'ಹಾಜರು';

  @override
  String get nightAbsent => 'ಗೈರು';

  @override
  String get nightLeave => 'ರಜೆಯಲ್ಲಿ';

  @override
  String get canteenWallet => 'ಕ್ಯಾಂಟೀನ್ ವಾಲೆಟ್';

  @override
  String get walletBalance => 'ಬಾಕಿ';

  @override
  String get addMoney => 'ಹಣ ಸೇರಿಸಿ';

  @override
  String walletAdded(Object amount) {
    return 'ವಾಲೆಟ್‌ಗೆ $amount ಸೇರಿಸಲಾಗಿದೆ';
  }

  @override
  String get recentMeals => 'ಇತ್ತೀಚಿನ ಊಟಗಳು';

  @override
  String get noMeals => 'ಇನ್ನೂ ಊಟಗಳಿಲ್ಲ';

  @override
  String get mealBreakfast => 'ಉಪಾಹಾರ';

  @override
  String get mealLunch => 'ಮಧ್ಯಾಹ್ನದ ಊಟ';

  @override
  String get mealSnacks => 'ತಿಂಡಿ';

  @override
  String get mealDinner => 'ರಾತ್ರಿಯ ಊಟ';

  @override
  String get schoolLife => 'ಶಾಲಾ ಜೀವನ';

  @override
  String get schoolLifeSubtitle =>
      'ಡೈರಿ, ಸಭೆಗಳು, ಆರೋಗ್ಯ, ಕಾರ್ಯಕ್ರಮಗಳು ಮತ್ತು ಇನ್ನಷ್ಟು';

  @override
  String schoolLifeTitle(Object name) {
    return '$name ಅವರ ಶಾಲಾ ಜೀವನ';
  }

  @override
  String childSchoolLife(Object name) {
    return '$name ಅವರ ಶಾಲಾ ಜೀವನ';
  }

  @override
  String get lifeDiary => 'ಶಾಲಾ ಡೈರಿ';

  @override
  String get lifeDiarySub => 'ತರಗತಿ ಕೆಲಸ, ಮನೆಕೆಲಸ ಮತ್ತು ಸೂಚನೆಗಳು';

  @override
  String get lifePtm => 'ಪೋಷಕ-ಶಿಕ್ಷಕರ ಸಭೆಗಳು';

  @override
  String get lifePtmSub => 'ಪ್ರತಿ ಶಿಕ್ಷಕರೊಂದಿಗೆ ಸಮಯ ಕಾಯ್ದಿರಿಸಿ';

  @override
  String get lifeEarly => 'ಆರಂಭಿಕ ವರ್ಷಗಳು';

  @override
  String get lifeEarlySub => 'ಬೆಳವಣಿಗೆಯ ಹಂತಗಳು, ಫೋಟೋಗಳು ಮತ್ತು ಕಲಿಕೆಯ ಕಥೆ';

  @override
  String get lifeHealth => 'ಆರೋಗ್ಯ';

  @override
  String get lifeHealthSub => 'ವಿವರ, ನರ್ಸ್ ಭೇಟಿ ಮತ್ತು ಲಸಿಕೆಗಳು';

  @override
  String get lifePassport => 'ಫಲಿತಾಂಶ ಪಾಸ್‌ಪೋರ್ಟ್';

  @override
  String get lifePassportSub => 'ಕೌಶಲಗಳು, ಪ್ರಮಾಣಪತ್ರಗಳು ಮತ್ತು ಚಟುವಟಿಕೆಗಳು';

  @override
  String get lifeSurveys => 'ಸಮೀಕ್ಷೆಗಳು';

  @override
  String get lifeSurveysSub => 'ಶಾಲೆಗೆ ನಿಮ್ಮ ಅಭಿಪ್ರಾಯ ತಿಳಿಸಿ';

  @override
  String get lifeEvents => 'ಕ್ಯಾಂಪಸ್ ಕಾರ್ಯಕ್ರಮಗಳು';

  @override
  String get lifeEventsSub => 'ನಿಮ್ಮ ಮಗುವನ್ನು ಕಾರ್ಯಕ್ರಮಗಳಿಗೆ ನೋಂದಾಯಿಸಿ';

  @override
  String diaryTitle(Object name) {
    return '$name ಅವರ ಡೈರಿ';
  }

  @override
  String get diaryEmpty => 'ಇನ್ನೂ ಡೈರಿ ಬರಹಗಳಿಲ್ಲ.';

  @override
  String get diaryClasswork => 'ತರಗತಿ ಕೆಲಸ';

  @override
  String get diaryHomework => 'ಮನೆಕೆಲಸ';

  @override
  String get diaryNotice => 'ಸೂಚನೆ';

  @override
  String diaryBy(Object author) {
    return '$author ಅವರಿಂದ';
  }

  @override
  String get diaryAcknowledge => 'ನಾನು ಇದನ್ನು ಓದಿದ್ದೇನೆ';

  @override
  String get diaryAcknowledged => 'ಓದಲಾಗಿದೆ';

  @override
  String get diaryAckDone => 'ಓದಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಲಾಗಿದೆ';

  @override
  String diaryToAcknowledge(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'ದೃಢೀಕರಿಸಲು $count ಬರಹಗಳು',
      one: 'ದೃಢೀಕರಿಸಲು 1 ಬರಹ',
    );
    return '$_temp0';
  }

  @override
  String get ptmTitle => 'ಪೋಷಕ-ಶಿಕ್ಷಕರ ಸಭೆಗಳು';

  @override
  String get ptmNone => 'ಯಾವುದೇ ಸಭೆ ನಿಗದಿಯಾಗಿಲ್ಲ.';

  @override
  String get ptmMeetings => 'ಸಭೆಗಳು';

  @override
  String get ptmMyBookings => 'ನಿಮ್ಮ ಕಾಯ್ದಿರಿಸುವಿಕೆಗಳು';

  @override
  String get ptmClosed => 'ಮುಚ್ಚಲಾಗಿದೆ';

  @override
  String ptmNoSlots(Object name) {
    return '$name ಅವರ ಶಿಕ್ಷಕರ ಬಳಿ ಖಾಲಿ ಸಮಯವಿಲ್ಲ.';
  }

  @override
  String get ptmBook => 'ಕಾಯ್ದಿರಿಸಿ';

  @override
  String get ptmBooked => 'ಸಭೆ ಕಾಯ್ದಿರಿಸಲಾಗಿದೆ';

  @override
  String get ptmYourBooking => 'ನಿಮ್ಮ ಕಾಯ್ದಿರಿಸುವಿಕೆ';

  @override
  String get ptmReschedule => 'ಬೇರೆ ಸಮಯಕ್ಕೆ ಬದಲಿಸಿ';

  @override
  String get ptmChooseNew => 'ಹೊಸ ಸಮಯ ಆರಿಸಿ';

  @override
  String get ptmMoved => 'ಸಭೆಯ ಸಮಯ ಬದಲಾಗಿದೆ';

  @override
  String get ptmCancelBooking => 'ಕಾಯ್ದಿರಿಸುವಿಕೆ ರದ್ದುಮಾಡಿ';

  @override
  String get ptmCancelAsk => 'ಈ ಸಭೆಯನ್ನು ರದ್ದುಮಾಡಬೇಕೇ?';

  @override
  String get ptmKeep => 'ಹಾಗೇ ಇರಲಿ';

  @override
  String get ptmCancelled => 'ಕಾಯ್ದಿರಿಸುವಿಕೆ ರದ್ದಾಗಿದೆ';

  @override
  String earlyYearsTitle(Object name) {
    return '$name ಅವರ ಆರಂಭಿಕ ವರ್ಷಗಳು';
  }

  @override
  String get eyStory => 'ಕಲಿಕೆಯ ಕಥೆ (PDF)';

  @override
  String get eyChooseTerm => 'ಅವಧಿಯನ್ನು ಆರಿಸಿ';

  @override
  String get eyMilestones => 'ಬೆಳವಣಿಗೆಯ ಹಂತಗಳು';

  @override
  String get eyObservations => 'ಗಮನಿಕೆಗಳು';

  @override
  String get eyNone => 'ಇನ್ನೂ ಏನೂ ದಾಖಲಾಗಿಲ್ಲ.';

  @override
  String get eyDomainPhysical => 'ದೈಹಿಕ';

  @override
  String get eyDomainLanguage => 'ಭಾಷೆ';

  @override
  String get eyDomainCognitive => 'ಚಿಂತನೆ';

  @override
  String get eyDomainSocial => 'ಸಾಮಾಜಿಕ ಮತ್ತು ಭಾವನಾತ್ಮಕ';

  @override
  String get eyDomainCreative => 'ಸೃಜನಶೀಲ';

  @override
  String get eyEmerging => 'ಆರಂಭ';

  @override
  String get eyDeveloping => 'ಬೆಳೆಯುತ್ತಿದೆ';

  @override
  String get eyAchieved => 'ಸಾಧಿಸಲಾಗಿದೆ';

  @override
  String healthTitle(Object name) {
    return '$name ಅವರ ಆರೋಗ್ಯ';
  }

  @override
  String get healthReadOnly =>
      'ಈ ದಾಖಲೆಯನ್ನು ಶಾಲೆ ಇಟ್ಟುಕೊಂಡಿದೆ. ನೀವು ಇಲ್ಲಿ ಓದಬಹುದು.';

  @override
  String get healthNoProfile => 'ಯಾವುದೇ ಆರೋಗ್ಯ ವಿವರ ದಾಖಲಾಗಿಲ್ಲ.';

  @override
  String get healthBlood => 'ರಕ್ತದ ಗುಂಪು';

  @override
  String get healthAllergies => 'ಅಲರ್ಜಿಗಳು';

  @override
  String get healthConditions => 'ಆರೋಗ್ಯ ಸ್ಥಿತಿಗಳು';

  @override
  String get healthMedications => 'ಔಷಧಗಳು';

  @override
  String get healthContacts => 'ತುರ್ತು ಸಂಪರ್ಕಗಳು';

  @override
  String get healthNotes => 'ಟಿಪ್ಪಣಿಗಳು';

  @override
  String get healthNone => 'ಏನೂ ದಾಖಲಾಗಿಲ್ಲ';

  @override
  String get healthVisits => 'ನರ್ಸ್ ಭೇಟಿಗಳು';

  @override
  String get healthNoVisits => 'ಯಾವುದೇ ಭೇಟಿ ಇಲ್ಲ.';

  @override
  String get healthSentHome => 'ಮನೆಗೆ ಕಳುಹಿಸಲಾಗಿದೆ';

  @override
  String get healthVaccinations => 'ಲಸಿಕೆಗಳು';

  @override
  String get healthNoVaccinations => 'ಯಾವುದೇ ಲಸಿಕೆ ದಾಖಲಾಗಿಲ್ಲ.';

  @override
  String healthNextDue(Object date) {
    return 'ಮುಂದಿನ ಡೋಸ್ $date';
  }

  @override
  String passportTitle(Object name) {
    return '$name ಅವರ ಪಾಸ್‌ಪೋರ್ಟ್';
  }

  @override
  String get passportVerified => 'ಶಾಲೆಯಿಂದ ಪರಿಶೀಲಿಸಲಾಗಿದೆ';

  @override
  String get passportNotVerified => 'ಶಾಲೆಯಿಂದ ಇನ್ನೂ ಪರಿಶೀಲಿಸಿಲ್ಲ';

  @override
  String get passportDownload => 'ಪಾಸ್‌ಪೋರ್ಟ್ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ (PDF)';

  @override
  String get passportSkills => 'ಕೌಶಲಗಳು';

  @override
  String get passportNoSkills => 'ಇನ್ನೂ ಕೌಶಲಗಳಿಲ್ಲ.';

  @override
  String passportLevel(int level) {
    return 'ಹಂತ $level';
  }

  @override
  String get passportNoLevel => 'ಇನ್ನೂ ಸಾಕಷ್ಟು ಪುರಾವೆ ಇಲ್ಲ';

  @override
  String passportEvidence(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಪುರಾವೆಗಳು',
      one: '1 ಪುರಾವೆ',
    );
    return '$_temp0';
  }

  @override
  String get passportCertificates => 'ಪ್ರಮಾಣಪತ್ರಗಳು';

  @override
  String passportIssued(Object date) {
    return '$date ರಂದು ನೀಡಲಾಗಿದೆ';
  }

  @override
  String get passportActivities => 'ಕ್ಲಬ್‌ಗಳು ಮತ್ತು ಕಾರ್ಯಕ್ರಮಗಳು';

  @override
  String get surveysTitle => 'ಸಮೀಕ್ಷೆಗಳು';

  @override
  String get surveysNone => 'ಯಾವುದೇ ಸಮೀಕ್ಷೆಗೆ ನಿಮ್ಮ ಉತ್ತರ ಬೇಕಿಲ್ಲ.';

  @override
  String get surveyAnswered => 'ಉತ್ತರಿಸಲಾಗಿದೆ';

  @override
  String get surveyAnswerNow => 'ಉತ್ತರಿಸಿ';

  @override
  String get surveyAnonymous => 'ನಿಮ್ಮ ಉತ್ತರಗಳು ಅನಾಮಧೇಯವಾಗಿರುತ್ತವೆ.';

  @override
  String get surveyYourAnswer => 'ನಿಮ್ಮ ಉತ್ತರ';

  @override
  String get surveySubmit => 'ಸಲ್ಲಿಸಿ';

  @override
  String get surveyRequired => 'ನಕ್ಷತ್ರ ಗುರುತಿರುವ ಎಲ್ಲಾ ಪ್ರಶ್ನೆಗಳಿಗೆ ಉತ್ತರಿಸಿ.';

  @override
  String get surveyThanks => 'ನಿಮ್ಮ ಉತ್ತರಗಳಿಗೆ ಧನ್ಯವಾದಗಳು';

  @override
  String eventsTitle(Object name) {
    return '$name ಅವರ ಕಾರ್ಯಕ್ರಮಗಳು';
  }

  @override
  String get eventsNone => 'ಈಗ ಯಾವುದೇ ಕಾರ್ಯಕ್ರಮ ತೆರೆದಿಲ್ಲ.';

  @override
  String eventFee(Object amount) {
    return 'ಶುಲ್ಕ $amount';
  }

  @override
  String eventSeatsLeft(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಸೀಟುಗಳು ಉಳಿದಿವೆ',
      one: '1 ಸೀಟು ಉಳಿದಿದೆ',
      zero: 'ತುಂಬಿದೆ',
    );
    return '$_temp0';
  }

  @override
  String get eventRegister => 'ನೋಂದಾಯಿಸಿ';

  @override
  String get eventJoinWaitlist => 'ಕಾಯುವ ಪಟ್ಟಿಗೆ ಸೇರಿ';

  @override
  String get eventRegistered => 'ನೋಂದಾಯಿಸಲಾಗಿದೆ';

  @override
  String get eventWaitlisted => 'ಕಾಯುವ ಪಟ್ಟಿಯಲ್ಲಿ';

  @override
  String get eventCancelRegistration => 'ನೋಂದಣಿ ರದ್ದುಮಾಡಿ';

  @override
  String get eventRegisteredDone => 'ಕಾರ್ಯಕ್ರಮಕ್ಕೆ ನೋಂದಾಯಿಸಲಾಗಿದೆ';

  @override
  String get eventWaitlistDone => 'ಕಾಯುವ ಪಟ್ಟಿಗೆ ಸೇರಿಸಲಾಗಿದೆ';

  @override
  String get eventCancelled => 'ನೋಂದಣಿ ರದ್ದಾಗಿದೆ';

  @override
  String get lifePasses => 'ಕಾರ್ಯಕ್ರಮ ಪಾಸ್‌ಗಳು';

  @override
  String get lifePassesSub => 'ಕ್ಯೂಆರ್ ಕೋಡ್ ಮತ್ತು ಪ್ರತಿಕ್ರಿಯೆ';

  @override
  String passesTitle(String name) {
    return '$name ಅವರ ಕಾರ್ಯಕ್ರಮ ಪಾಸ್‌ಗಳು';
  }

  @override
  String get passesNone => 'ಇನ್ನೂ ಯಾವುದೇ ಕಾರ್ಯಕ್ರಮ ನೋಂದಣಿ ಇಲ್ಲ.';

  @override
  String get passShowAtDoor => 'ಬಾಗಿಲಲ್ಲಿ ಈ ಕೋಡ್ ತೋರಿಸಿ';

  @override
  String get passCheckedIn => 'ಪ್ರವೇಶ ದಾಖಲಾಗಿದೆ';

  @override
  String get passFeedback => 'ಪ್ರತಿಕ್ರಿಯೆ ನೀಡಿ';

  @override
  String get passFeedbackDone => 'ಪ್ರತಿಕ್ರಿಯೆ ಕಳುಹಿಸಲಾಗಿದೆ';

  @override
  String get passFeedbackTitle => 'ಹೇಗಿತ್ತು?';

  @override
  String get passFeedbackComment => 'ಟಿಪ್ಪಣಿ (ಐಚ್ಛಿಕ)';

  @override
  String get passFeedbackSend => 'ಕಳುಹಿಸಿ';

  @override
  String get passFeedbackThanks => 'ನಿಮ್ಮ ಪ್ರತಿಕ್ರಿಯೆಗೆ ಧನ್ಯವಾದ.';

  @override
  String get dpdpTitle => 'ನನ್ನ ಡೇಟಾ ಹಕ್ಕುಗಳು';

  @override
  String get dpdpSubtitle =>
      'ನಿಮ್ಮ ಮತ್ತು ನಿಮ್ಮ ಮಕ್ಕಳ ಡೇಟಾ ಡೌನ್‌ಲೋಡ್, ತಿದ್ದುಪಡಿ ಅಥವಾ ಅಳಿಸಿ';

  @override
  String get dpdpOfficerTitle => 'ಕುಂದುಕೊರತೆ ಅಧಿಕಾರಿ';

  @override
  String get dpdpOfficerNone =>
      'ಇನ್ನೂ ಕುಂದುಕೊರತೆ ಅಧಿಕಾರಿಯನ್ನು ನೇಮಿಸಿಲ್ಲ. ಶಾಲಾ ಕಚೇರಿಗೆ ಬರೆಯಿರಿ.';

  @override
  String get dpdpExportTitle => 'ನನ್ನ ಡೇಟಾ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ';

  @override
  String get dpdpExportBody =>
      'ಶಾಲೆಯ ಬಳಿ ನಿಮ್ಮ ಮತ್ತು ನಿಮ್ಮ ಮಕ್ಕಳ ಬಗ್ಗೆ ಏನೇನಿದೆ ಎಂದು ನೋಡಿ.';

  @override
  String get dpdpExportAction => 'ಸಾರಾಂಶ ತೋರಿಸಿ';

  @override
  String get dpdpExportPdf => 'ಪಿಡಿಎಫ್ ಆಗಿ ತೆರೆಯಿರಿ';

  @override
  String get dpdpRecords => 'ದಾಖಲೆಗಳು';

  @override
  String get dpdpCorrectTitle => 'ನನ್ನ ವಿವರಗಳನ್ನು ತಿದ್ದಿ';

  @override
  String get dpdpField => 'ತಿದ್ದಬೇಕಾದ ವಿವರ';

  @override
  String get dpdpFieldName => 'ಹೆಸರು';

  @override
  String get dpdpFieldEmail => 'ಇಮೇಲ್';

  @override
  String get dpdpFieldPhone => 'ಫೋನ್';

  @override
  String get dpdpNewValue => 'ಸರಿಯಾದ ಮಾಹಿತಿ';

  @override
  String get dpdpCorrectSend => 'ತಿದ್ದುಪಡಿ ಕೋರಿಕೆ ಕಳುಹಿಸಿ';

  @override
  String get dpdpNeedValue => 'ಸರಿಯಾದ ಮಾಹಿತಿಯನ್ನು ನಮೂದಿಸಿ.';

  @override
  String get dpdpEraseTitle => 'ಅಳಿಸಲು ಕೋರಿ';

  @override
  String get dpdpEraseBody =>
      'ಶಾಲೆಯು ಕೆಲವು ದಾಖಲೆಗಳನ್ನು ಕಾನೂನಿನ ಪ್ರಕಾರ ಇಟ್ಟುಕೊಳ್ಳಬೇಕು. ಯಾವುದನ್ನು ಅಳಿಸಬಹುದು, ಯಾವುದನ್ನು ಅಳಿಸಲಾಗದು ಎಂದು ತಿಳಿಸುತ್ತೇವೆ.';

  @override
  String get dpdpEraseDetails => 'ನಿಮಗೆ ಇದು ಏಕೆ ಬೇಕು? (ಐಚ್ಛಿಕ)';

  @override
  String get dpdpEraseSend => 'ಅಳಿಸಲು ಕೋರಿಕೆ ಸಲ್ಲಿಸಿ';

  @override
  String get dpdpEraseConfirm =>
      'ಶಾಲೆಗೆ ನಿಮ್ಮ ಡೇಟಾ ಅಳಿಸಲು ಕೇಳಬೇಕೇ? ಕಾನೂನಿನ ಪ್ರಕಾರ ಇಡಬೇಕಾದ ದಾಖಲೆಗಳು ಉಳಿಯುತ್ತವೆ.';

  @override
  String get dpdpRequestSent =>
      'ಕೋರಿಕೆ ಕಳುಹಿಸಲಾಗಿದೆ. ಕುಂದುಕೊರತೆ ಅಧಿಕಾರಿ 30 ದಿನಗಳಲ್ಲಿ ಉತ್ತರಿಸುತ್ತಾರೆ.';

  @override
  String get dpdpRetentionNotice => 'ಈ ದಾಖಲೆಗಳನ್ನು ಕಾನೂನಿನ ಪ್ರಕಾರ ಇಡಬೇಕು:';

  @override
  String get dpdpRequestsTitle => 'ನನ್ನ ಕೋರಿಕೆಗಳು';

  @override
  String get dpdpRequestsNone => 'ಇನ್ನೂ ಯಾವುದೇ ಕೋರಿಕೆ ಇಲ್ಲ.';

  @override
  String get dpdpKindCorrection => 'ತಿದ್ದುಪಡಿ';

  @override
  String get dpdpKindErasure => 'ಅಳಿಸುವಿಕೆ';

  @override
  String get dpdpStatusPending => 'ಬಾಕಿ';

  @override
  String get dpdpStatusDone => 'ಪೂರ್ಣ';

  @override
  String get dpdpStatusDeclined => 'ತಿರಸ್ಕೃತ';

  @override
  String get dpdpStatusBlocked => 'ಕಾನೂನಿನಂತೆ ಉಳಿಸಲಾಗಿದೆ';

  @override
  String get dpdpAbout => 'ಈ ಕೋರಿಕೆ ಯಾರ ಬಗ್ಗೆ';

  @override
  String get dpdpAboutMe => 'ನಾನು';

  @override
  String get dpdpAboutChild => 'ಮಗು';

  @override
  String get reportCardsTitle => 'ವರದಿ ಕಾರ್ಡ್‌ಗಳು';

  @override
  String childReportCards(String name) {
    return 'ವರದಿ ಕಾರ್ಡ್‌ಗಳು: $name';
  }

  @override
  String get reportCardsSubtitle => 'ಅಂಕಗಳು, ಟಿಪ್ಪಣಿಗಳು ಮತ್ತು ಬಡ್ತಿ';

  @override
  String get reportCardsNone => 'ಇನ್ನೂ ಯಾವುದೇ ವರದಿ ಕಾರ್ಡ್ ಪ್ರಕಟವಾಗಿಲ್ಲ.';

  @override
  String get promotionPending => 'ಬಡ್ತಿ ನಿರ್ಧಾರ ಬಾಕಿ';

  @override
  String get promotionPromoted => 'ಬಡ್ತಿ ಪಡೆದಿದ್ದಾರೆ';

  @override
  String get promotionGrace => 'ಗ್ರೇಸ್ ಅಂಕಗಳೊಂದಿಗೆ ಬಡ್ತಿ';

  @override
  String get promotionDetained => 'ಬಡ್ತಿ ಇಲ್ಲ';

  @override
  String get promotedTo => 'ಮುಂದಿನ ತರಗತಿ';

  @override
  String get coCurricular => 'ಸಹ-ಪಠ್ಯ ಚಟುವಟಿಕೆಗಳು';

  @override
  String get behaviour => 'ವರ್ತನೆ';

  @override
  String get reportCardPdf => 'ಪಿಡಿಎಫ್ ಆಗಿ ತೆರೆಯಿರಿ';

  @override
  String get errVisibilityOff => 'ನಿಮ್ಮ ಶಾಲೆ ಇದನ್ನು ಪೋಷಕರಿಗೆ ಲಭ್ಯಗೊಳಿಸಿಲ್ಲ.';

  @override
  String get lifeActivities => 'ಚಟುವಟಿಕೆಗಳು';

  @override
  String get lifeActivitiesSub =>
      'ಕ್ಲಬ್‌ಗಳು, ಕಾರ್ಯಕ್ರಮಗಳು, ಹೌಸ್ ಮತ್ತು ಸಾಧನೆಗಳು';

  @override
  String get lifeBehaviour => 'ವರ್ತನೆ';

  @override
  String get lifeBehaviourSub => 'ಘಟನೆಗಳು, ಶಾಲೆಯ ಸೂಚನೆಗಳು ಮತ್ತು ಮೆಚ್ಚುಗೆ';

  @override
  String activitiesTitle(Object name) {
    return '$name ಅವರ ಚಟುವಟಿಕೆಗಳು';
  }

  @override
  String behaviourTitle(Object name) {
    return '$name ಅವರ ವರ್ತನೆ';
  }

  @override
  String get activitiesEmpty => 'ಇನ್ನೂ ಯಾವುದೇ ಚಟುವಟಿಕೆ ದಾಖಲಾಗಿಲ್ಲ.';

  @override
  String activitiesHousePoints(int points) {
    return '$points ಹೌಸ್ ಅಂಕಗಳು';
  }

  @override
  String get activitiesCaptain => 'ಹೌಸ್ ಕ್ಯಾಪ್ಟನ್';

  @override
  String get activitiesClubs => 'ಕ್ಲಬ್‌ಗಳು';

  @override
  String get clubRoleMember => 'ಸದಸ್ಯರು';

  @override
  String activitiesClubStats(int points, int count) {
    return '$points ಅಂಕಗಳು, $count ಚಟುವಟಿಕೆಗಳು';
  }

  @override
  String get activitiesEvents => 'ಭಾಗವಹಿಸಿದ ಕಾರ್ಯಕ್ರಮಗಳು';

  @override
  String activitiesGrades(Object term) {
    return 'ಸಹ-ಪಠ್ಯ ಗ್ರೇಡ್‌ಗಳು, $term';
  }

  @override
  String get activitiesAchievements => 'ಸಾಧನೆಗಳು';

  @override
  String get activitiesRecognitions => 'ಹೌಸ್ ಮೆಚ್ಚುಗೆ';

  @override
  String behaviourGradeLine(Object grade) {
    return 'ವರ್ತನೆ ಗ್ರೇಡ್: $grade';
  }

  @override
  String get behaviourNotices => 'ಶಾಲೆಯ ಸೂಚನೆಗಳು';

  @override
  String get behaviourIncidents => 'ಘಟನೆಗಳು';

  @override
  String get behaviourNoIncidents => 'ಯಾವುದೇ ಘಟನೆ ದಾಖಲಾಗಿಲ್ಲ.';

  @override
  String behaviourAction(Object action) {
    return 'ಕ್ರಮ: $action';
  }

  @override
  String get actionStatus_revoked => 'ಹಿಂಪಡೆಯಲಾಗಿದೆ';

  @override
  String get actionStatus_reduced => 'ಕಡಿಮೆ ಮಾಡಲಾಗಿದೆ';

  @override
  String get severity_minor => 'ಸಣ್ಣ';

  @override
  String get severity_major => 'ಗಂಭೀರ';

  @override
  String get severity_severe => 'ತೀವ್ರ';

  @override
  String get incidentStatus_reported => 'ದಾಖಲಿಸಲಾಗಿದೆ';

  @override
  String get incidentStatus_under_review => 'ಪರಿಶೀಲನೆಯಲ್ಲಿದೆ';

  @override
  String get incidentStatus_action_taken => 'ಕ್ರಮ ಕೈಗೊಳ್ಳಲಾಗಿದೆ';

  @override
  String get incidentStatus_appealed => 'ಮೇಲ್ಮನವಿ ಸಲ್ಲಿಸಲಾಗಿದೆ';

  @override
  String get incidentStatus_closed => 'ಮುಕ್ತಾಯಗೊಂಡಿದೆ';

  @override
  String get noticeMethod_message => 'ಸಂದೇಶ';

  @override
  String get noticeMethod_call => 'ಫೋನ್ ಕರೆ';

  @override
  String get noticeMethod_meeting => 'ಸಭೆ';

  @override
  String get noticeMethod_letter => 'ಪತ್ರ';

  @override
  String noticeMeeting(Object date) {
    return 'ಸಭೆಯ ದಿನಾಂಕ: $date';
  }

  @override
  String get noticeAcknowledge => 'ಸ್ವೀಕೃತಿ ನೀಡಿ';

  @override
  String get noticeAcknowledged => 'ಸ್ವೀಕೃತಿ ನೀಡಲಾಗಿದೆ';

  @override
  String get noticeAckDone => 'ಧನ್ಯವಾದ. ಶಾಲೆಗೆ ತಿಳಿಸಲಾಗಿದೆ.';

  @override
  String reportAttendanceDays(int present, int total) {
    return '$total ದಿನಗಳಲ್ಲಿ $present ದಿನ';
  }
}
