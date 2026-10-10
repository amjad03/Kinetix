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
  String get yourAttendance => 'ನಿಮ್ಮ ಹಾಜರಾತಿ';

  @override
  String notMissedAny(Object days) {
    return 'ಕಳೆದ $days ದಿನಗಳಲ್ಲಿ ನೀವು ಯಾವುದೇ ತರಗತಿ ತಪ್ಪಿಸಿಲ್ಲ. ಶಭಾಷ್!';
  }

  @override
  String homeworkHandIn(Object learn) {
    return 'ಶಿಕ್ಷಕರು ಹೇಳಿದ ರೀತಿಯಲ್ಲೇ ಸಲ್ಲಿಸಿ. ಎಲ್ಲಿಯಾದರೂ ಸಿಲುಕಿದ್ದೀರಾ? $learn ಟ್ಯಾಬ್‌ನಲ್ಲಿ KINETIX AI ಅನ್ನು ಕೇಳಿ.';
  }

  @override
  String get noBooksBorrowed =>
      'ಗ್ರಂಥಾಲಯದಿಂದ ಯಾವುದೇ ಪುಸ್ತಕ ಪಡೆದಿಲ್ಲ. ಕಾಲೇಜು ಗ್ರಂಥಾಲಯದಿಂದ ನೀವು ಪಡೆಯುವ ಪುಸ್ತಕಗಳು ಹಿಂದಿರುಗಿಸುವ ದಿನಾಂಕದೊಂದಿಗೆ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';

  @override
  String get noBooksOutNow => 'ಈಗ ನಿಮ್ಮ ಬಳಿ ಗ್ರಂಥಾಲಯದ ಯಾವುದೇ ಪುಸ್ತಕ ಇಲ್ಲ.';

  @override
  String markedAbsentFor(Object kind) {
    return 'ಈ $kind ನಲ್ಲಿ ನಿಮ್ಮನ್ನು ಗೈರು ಎಂದು ದಾಖಲಿಸಲಾಗಿದೆ.';
  }

  @override
  String get noMarksCard =>
      'ಇನ್ನೂ ಯಾವುದೇ ಅಂಕಗಳನ್ನು ಪ್ರಕಟಿಸಿಲ್ಲ. ನಿಮ್ಮ ಶಿಕ್ಷಕರು ಪರೀಕ್ಷೆಯ ಅಂಕಗಳನ್ನು ಪ್ರಕಟಿಸಿದಾಗ, ಅವು ತರಗತಿ ಸರಾಸರಿಯೊಂದಿಗೆ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';

  @override
  String get noMarksScreen =>
      'ಇನ್ನೂ ಯಾವುದೇ ಅಂಕಗಳನ್ನು ಪ್ರಕಟಿಸಿಲ್ಲ.\nನಿಮ್ಮ ಶಿಕ್ಷಕರು ಅಂಕಗಳನ್ನು ಪ್ರಕಟಿಸಿದಾಗ, ಅವು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';

  @override
  String get you => 'ನೀವು';

  @override
  String get recordingsEmpty =>
      'ಶಿಕ್ಷಕರು ಬೋರ್ಡ್‌ನಲ್ಲಿ ಪಾಠವನ್ನು ರೆಕಾರ್ಡ್ ಮಾಡಿ ಹಂಚಿಕೊಂಡಾಗ, ನೀವು ಅದನ್ನು ಇಲ್ಲಿ ಮತ್ತೆ ನೋಡಬಹುದು.';

  @override
  String get missedThisClass => 'ನೀವು ಈ ತರಗತಿಯನ್ನು ತಪ್ಪಿಸಿಕೊಂಡಿದ್ದೀರಿ';

  @override
  String get noRecordingsShared =>
      'ಇನ್ನೂ ನಿಮ್ಮ ತರಗತಿಯೊಂದಿಗೆ ಯಾವುದೇ ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್ ಹಂಚಿಕೊಂಡಿಲ್ಲ.';

  @override
  String get recordingNotSharedYours =>
      'ಈ ರೆಕಾರ್ಡಿಂಗ್ ಅನ್ನು ಈಗ ನಿಮ್ಮ ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಂಡಿಲ್ಲ.';

  @override
  String get boardNotShared =>
      'ಈ ಬೋರ್ಡ್ ಅನ್ನು ಈಗ ನಿಮ್ಮ ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಂಡಿಲ್ಲ.';

  @override
  String writeToAbout(Object teacher) {
    return 'ತರಗತಿ, ಹೋಂವರ್ಕ್ ಅಥವಾ ಸಂದೇಹದ ಬಗ್ಗೆ $teacher ಅವರಿಗೆ ಬರೆಯಿರಿ.';
  }

  @override
  String get noMessagesStudent =>
      'ಇನ್ನೂ ಯಾವುದೇ ಸಂದೇಶಗಳಿಲ್ಲ.\nತರಗತಿ, ಹೋಂವರ್ಕ್ ಅಥವಾ ಸಂದೇಹದ ಬಗ್ಗೆ ನಿಮ್ಮ ಶಿಕ್ಷಕರಿಗೆ ಬರೆಯಿರಿ.';

  @override
  String get noTeachersOnTimetable =>
      'ನಿಮ್ಮ ವೇಳಾಪಟ್ಟಿಯಲ್ಲಿ ಇನ್ನೂ ಯಾವುದೇ ಶಿಕ್ಷಕರಿಲ್ಲ.';

  @override
  String yourTeachers(Object className) {
    return 'ನಿಮ್ಮ ಶಿಕ್ಷಕರು · $className';
  }

  @override
  String nUnread(Object count) {
    return '$count ಓದಿಲ್ಲ';
  }

  @override
  String get writeToTeacher => 'ಶಿಕ್ಷಕರಿಗೆ ಬರೆಯಿರಿ';

  @override
  String get openMessages => 'ಸಂದೇಶಗಳನ್ನು ತೆರೆಯಿರಿ';

  @override
  String get askYourTeachers =>
      'ತರಗತಿ, ಹೋಂವರ್ಕ್ ಅಥವಾ ಸಂದೇಹದ ಬಗ್ಗೆ ನಿಮ್ಮ ಶಿಕ್ಷಕರನ್ನು ಕೇಳಿ.';

  @override
  String get noUpdates =>
      'ನೀವು ಎಲ್ಲವನ್ನೂ ನೋಡಿದ್ದೀರಿ.\nಹೊಸ ಹೋಂವರ್ಕ್, ಹಂಚಿಕೊಂಡ ಬೋರ್ಡ್‌ಗಳು, ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್‌ಗಳು ಮತ್ತು ಕಾಲೇಜಿನ ಸಂದೇಶಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';

  @override
  String get noLongerLive => 'ಈ ತರಗತಿ ಈಗ ಲೈವ್ ಇಲ್ಲ.';

  @override
  String otherClassLive(Object today) {
    return 'ಆ ತರಗತಿ ಮುಗಿದಿದೆ. ಇನ್ನೊಂದು ತರಗತಿ ಈಗ $today ಟ್ಯಾಬ್‌ನಲ್ಲಿ ಲೈವ್ ಇದೆ.';
  }

  @override
  String get liveClass => 'ಲೈವ್ ತರಗತಿ';

  @override
  String get signInHint => 'ನಿಮ್ಮ ಕಾಲೇಜು ನೀಡಿದ ಇಮೇಲ್ ಅಥವಾ ಫೋನ್ ಸಂಖ್ಯೆ ಬಳಸಿ';

  @override
  String get emailOrPhone => 'ಇಮೇಲ್ ಅಥವಾ ಫೋನ್';

  @override
  String get enterEmailOrPhone => 'ನಿಮ್ಮ ಇಮೇಲ್ ಅಥವಾ ಫೋನ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ';

  @override
  String get navLearn => 'ಕಲಿಯಿರಿ';

  @override
  String get attendanceFewMissed =>
      'ಇತ್ತೀಚೆಗೆ ನೀವು ಕೆಲವು ತರಗತಿಗಳನ್ನು ತಪ್ಪಿಸಿಕೊಂಡಿದ್ದೀರಿ.';

  @override
  String get attendanceBelow75 =>
      '75% ಕ್ಕಿಂತ ಕಡಿಮೆ. ಪರೀಕ್ಷೆಗೆ ಕೂರಲು ಕಾಲೇಜುಗಳು ಸಾಮಾನ್ಯವಾಗಿ 75% ಹಾಜರಾತಿ ಕೇಳುತ್ತವೆ.';

  @override
  String noAttendanceForYou(Object days) {
    return 'ಕಳೆದ $days ದಿನಗಳಲ್ಲಿ ನಿಮ್ಮ ಹಾಜರಾತಿ ದಾಖಲಾಗಿಲ್ಲ.';
  }

  @override
  String get nothingDue =>
      'ಈಗ ಸಲ್ಲಿಸಬೇಕಾದದ್ದು ಏನೂ ಇಲ್ಲ. ನಿಮ್ಮ ಶಿಕ್ಷಕರ ಹೊಸ ಹೋಂವರ್ಕ್ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';

  @override
  String get stuckTitle => 'ಎಲ್ಲಿಯಾದರೂ ಸಿಲುಕಿದ್ದೀರಾ?';

  @override
  String get stuckBody =>
      'KINETIX AI ಗೆ ವಿವರಿಸಲು ಕೇಳಿ, English, हिन्दी ಅಥವಾ ಕನ್ನಡದಲ್ಲಿ.';

  @override
  String get boardsEmpty =>
      'ಪಾಠದ ನಂತರ ಶಿಕ್ಷಕರು ತರಗತಿಯ ಬೋರ್ಡ್ ಹಂಚಿಕೊಂಡಾಗ, ನೀವು ಪುನರಾವರ್ತಿಸಲು ಅದು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';

  @override
  String get feesNote =>
      'ಶುಲ್ಕವನ್ನು ನಿಮ್ಮ ಪೋಷಕರು KINETIX Parent ಆ್ಯಪ್‌ನಲ್ಲಿ ಅಥವಾ ಕಾಲೇಜಿನ ಶುಲ್ಕ ಕೌಂಟರ್‌ನಲ್ಲಿ ಪಾವತಿಸುತ್ತಾರೆ. ಇಲ್ಲಿ ನೀವು ಎಷ್ಟು ಬಾಕಿ ಇದೆ ಎಂದು ನೋಡಬಹುದು ಮತ್ತು ನಿಮ್ಮ ರಸೀದಿಗಳನ್ನು ತೆರೆಯಬಹುದು.';

  @override
  String get invoicePaid => 'ಪಾವತಿಯಾಗಿದೆ';

  @override
  String get invoiceCancelled => 'ರದ್ದಾಗಿದೆ';

  @override
  String get invoiceOverdue => 'ಗಡುವು ಮೀರಿದೆ';

  @override
  String get invoicePartPaid => 'ಭಾಗಶಃ ಪಾವತಿ';

  @override
  String get invoiceDue => 'ಬಾಕಿ';

  @override
  String get payments => 'ಪಾವತಿಗಳು';

  @override
  String get noFeesIssued => 'ನಿಮಗೆ ಯಾವುದೇ ಶುಲ್ಕ ವಿಧಿಸಿಲ್ಲ.';

  @override
  String get noPayments =>
      'ಇನ್ನೂ ಯಾವುದೇ ಪಾವತಿ ಇಲ್ಲ. ಪಾವತಿ ಆದ ನಂತರ ರಸೀದಿಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';

  @override
  String get allPaid => 'ಎಲ್ಲವೂ ಪಾವತಿಯಾಗಿದೆ';

  @override
  String feesOverdueNext(int count, Object title) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಶುಲ್ಕಗಳ ಗಡುವು ಮೀರಿದೆ',
      one: '1 ಶುಲ್ಕದ ಗಡುವು ಮೀರಿದೆ',
    );
    return '$_temp0 · ಮುಂದಿನದು: $title';
  }

  @override
  String nextFeeDue(Object title, Object date) {
    return 'ಮುಂದಿನದು: $title, $date ರೊಳಗೆ';
  }

  @override
  String amountPaidShort(Object amount) {
    return '$amount ಪಾವತಿಯಾಗಿದೆ';
  }

  @override
  String dueOnShort(Object date) {
    return '$date ರೊಳಗೆ';
  }

  @override
  String get paidOn => 'ಪಾವತಿಸಿದ ದಿನಾಂಕ';

  @override
  String get rollNoLabel => 'ರೋಲ್ ನಂ.';

  @override
  String get forLabel => 'ಯಾವುದಕ್ಕೆ';

  @override
  String get method => 'ವಿಧಾನ';

  @override
  String get feeAmount => 'ಶುಲ್ಕದ ಮೊತ್ತ';

  @override
  String get balance => 'ಬಾಕಿ';

  @override
  String get nil => 'ಶೂನ್ಯ';

  @override
  String get keepReceipt =>
      'ಇದನ್ನು ನಿಮ್ಮ ದಾಖಲೆಗಾಗಿ ಇಟ್ಟುಕೊಳ್ಳಿ. ಯಾರಾದರೂ ಪಾವತಿಯ ಪುರಾವೆ ಕೇಳಿದರೆ, ಶುಲ್ಕ ಕೌಂಟರ್‌ನಲ್ಲಿ ಇದನ್ನು ತೋರಿಸಿ.';

  @override
  String get yourClass => 'ನಿಮ್ಮ ತರಗತಿ';

  @override
  String get program => 'ಕೋರ್ಸ್';

  @override
  String get attendanceHistory => 'ಹಾಜರಾತಿಯ ವಿವರ';

  @override
  String get writeToYourTeachers => 'ನಿಮ್ಮ ಶಿಕ್ಷಕರಿಗೆ ಬರೆಯಿರಿ';

  @override
  String get aiAnswersIn => 'KINETIX AI ಈ ಭಾಷೆಯಲ್ಲಿ ಉತ್ತರಿಸುತ್ತದೆ';

  @override
  String get answersIn => 'ಉತ್ತರದ ಭಾಷೆ';

  @override
  String get timetable => 'ವೇಳಾಪಟ್ಟಿ';

  @override
  String get timetableSubtitle => 'ವಾರದ ನಿಮ್ಮ ತರಗತಿಗಳು';

  @override
  String get everyClass30 => 'ಕಳೆದ 30 ದಿನಗಳ ಪ್ರತಿ ತರಗತಿ';

  @override
  String noAttendanceDays(Object days) {
    return 'ಕಳೆದ $days ದಿನಗಳಲ್ಲಿ ಹಾಜರಾತಿ ದಾಖಲಾಗಿಲ್ಲ';
  }

  @override
  String attendedPercent(Object percent, Object days) {
    return 'ಕಳೆದ $days ದಿನಗಳಲ್ಲಿ $percent ಹಾಜರಾತಿ';
  }

  @override
  String get noMarksYet => 'ಇನ್ನೂ ಯಾವುದೇ ಅಂಕಗಳನ್ನು ಪ್ರಕಟಿಸಿಲ್ಲ';

  @override
  String assessmentsPublished(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಮೌಲ್ಯಮಾಪನಗಳು ಪ್ರಕಟವಾಗಿವೆ',
      one: '1 ಮೌಲ್ಯಮಾಪನ ಪ್ರಕಟವಾಗಿದೆ',
    );
    return '$_temp0';
  }

  @override
  String get noBooksOutShort => 'ಯಾವುದೇ ಪುಸ್ತಕ ಪಡೆದಿಲ್ಲ';

  @override
  String booksOut(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಪುಸ್ತಕಗಳನ್ನು ಪಡೆದಿದೆ',
      one: '1 ಪುಸ್ತಕ ಪಡೆದಿದೆ',
    );
    return '$_temp0';
  }

  @override
  String feesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಶುಲ್ಕಗಳು',
      one: '1 ಶುಲ್ಕ',
    );
    return '$_temp0';
  }

  @override
  String receiptsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ರಸೀದಿಗಳು',
      one: '1 ರಸೀದಿ',
    );
    return '$_temp0';
  }

  @override
  String get askADoubt => 'ಸಂದೇಹ ಕೇಳಿ';

  @override
  String get syllabus => 'ಪಠ್ಯಕ್ರಮ';

  @override
  String get codeLab => 'ಕೋಡ್ ಲ್ಯಾಬ್';

  @override
  String get labs => 'ಪ್ರಯೋಗಾಲಯ';

  @override
  String get earlierQuestions => 'ಹಿಂದೆ ಕೇಳಿದ ಪ್ರಶ್ನೆಗಳು';

  @override
  String get askIntro =>
      'KINETIX AI ನಿಮ್ಮ ಪಠ್ಯಕ್ರಮದ ಪ್ರಕಾರ ಇದನ್ನು ಹಂತ ಹಂತವಾಗಿ ವಿವರಿಸುತ್ತದೆ.';

  @override
  String aboutTopic(Object topic) {
    return 'ವಿಷಯ: $topic';
  }

  @override
  String get askAboutAnything => 'ಯಾವುದರ ಬಗ್ಗೆಯಾದರೂ ಕೇಳಿ';

  @override
  String get questionHint => 'ಉದಾ. ಷೇರುಗಳ ಮುಟ್ಟುಗೋಲು (forfeiture) ಎಂದರೇನು?';

  @override
  String get answerIn => 'ಉತ್ತರದ ಭಾಷೆ';

  @override
  String get subject => 'ವಿಷಯ';

  @override
  String get anySubject => 'ಯಾವುದಾದರೂ';

  @override
  String get ask => 'ಕೇಳಿ';

  @override
  String get youAsked => 'ನೀವು ಕೇಳಿದ್ದು';

  @override
  String get aiThinking => 'KINETIX AI ಯೋಚಿಸುತ್ತಿದೆ…';

  @override
  String get keyPoints => 'ಮುಖ್ಯ ಅಂಶಗಳು';

  @override
  String get basedOn => 'ಇದನ್ನು ಆಧರಿಸಿದೆ';

  @override
  String get openTopicNotes => 'ವಿಷಯದ ಟಿಪ್ಪಣಿಗಳನ್ನು ತೆರೆಯಿರಿ';

  @override
  String get askNext => 'ಮುಂದೆ ಕೇಳಿ';

  @override
  String get previewAnswer => 'ಮಾದರಿ ಉತ್ತರ';

  @override
  String get previewNote =>
      'ನಿಮ್ಮ ಕಾಲೇಜಿನಲ್ಲಿ KINETIX AI ಇನ್ನೂ ಸಂಪರ್ಕಗೊಂಡಿಲ್ಲ, ಹಾಗಾಗಿ ಇದು ಕೇವಲ ಮಾದರಿ, ನಿಜವಾದ ವಿವರಣೆ ಅಲ್ಲ.';

  @override
  String get aiCantAnswer => 'KINETIX AI ಇದಕ್ಕೆ ಉತ್ತರಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ';

  @override
  String get aiRephrase =>
      'ಇದನ್ನು ನಿಮ್ಮ ಓದಿಗೆ ಸಂಬಂಧಿಸಿದ ಪ್ರಶ್ನೆಯಾಗಿ ಮತ್ತೆ ಬರೆದು ನೋಡಿ.';

  @override
  String get aiAllowanceUsed => 'ಇಂದಿನ KINETIX AI ಮಿತಿ ಮುಗಿದಿದೆ';

  @override
  String get aiAllowanceBody =>
      'ನಿಮ್ಮ ಕಾಲೇಜು ಇಂದಿನ ಮಿತಿಯನ್ನು ಬಳಸಿದೆ. ಇದು ನಾಳೆ ಮತ್ತೆ ಆರಂಭವಾಗುತ್ತದೆ.';

  @override
  String get aiUnreachable => 'KINETIX AI ಸಂಪರ್ಕಕ್ಕೆ ಸಿಗುತ್ತಿಲ್ಲ';

  @override
  String get aiUnreachableBody =>
      'ಈಗ ಸಂಪರ್ಕಕ್ಕೆ ಸಿಗುತ್ತಿಲ್ಲ. ಒಂದು ನಿಮಿಷದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get noConnection => 'ಸಂಪರ್ಕವಿಲ್ಲ';

  @override
  String get somethingWrong => 'ಏನೋ ತಪ್ಪಾಗಿದೆ';

  @override
  String get topicNotInLibrary => 'ಈ ವಿಷಯ ಈಗ ಲೈಬ್ರರಿಯಲ್ಲಿ ಇಲ್ಲ.';

  @override
  String get topic => 'ವಿಷಯ';

  @override
  String get askAboutThis => 'ಇದರ ಬಗ್ಗೆ KINETIX AI ಅನ್ನು ಕೇಳಿ';

  @override
  String get notes => 'ಟಿಪ್ಪಣಿಗಳು';

  @override
  String get outcomes => 'ಈ ವಿಷಯದ ನಂತರ ನೀವು ಇದನ್ನು ಮಾಡಲು ಸಾಧ್ಯವಾಗಬೇಕು';

  @override
  String get noNotes => 'ಈ ವಿಷಯಕ್ಕೆ ಇನ್ನೂ ಯಾವುದೇ ಟಿಪ್ಪಣಿಗಳನ್ನು ಸೇರಿಸಿಲ್ಲ.';

  @override
  String get notReviewed =>
      'ಈ ಟಿಪ್ಪಣಿಗಳನ್ನು ಪಠ್ಯಕ್ರಮ ತಂಡ ಇನ್ನೂ ಪರಿಶೀಲಿಸಿಲ್ಲ. ನಿಮ್ಮ ಪಠ್ಯಪುಸ್ತಕ ಮತ್ತು ಶಿಕ್ಷಕರಿಗೆ ಮೊದಲ ಆದ್ಯತೆ.';

  @override
  String get askKinetixAi => 'KINETIX AI ಅನ್ನು ಕೇಳಿ';

  @override
  String get searchTopicsHint => 'ವಿಷಯಗಳನ್ನು ಹುಡುಕಿ, ಉದಾ. goodwill';

  @override
  String get clear => 'ತೆರವುಗೊಳಿಸಿ';

  @override
  String noTopicsMatch(Object query) {
    return '“$query” ಗೆ ಹೊಂದುವ ಯಾವುದೇ ವಿಷಯ ಸಿಗಲಿಲ್ಲ. ಚಿಕ್ಕ ಪದ ಪ್ರಯತ್ನಿಸಿ, ಅಥವಾ KINETIX AI ಅನ್ನು ಕೇಳಿ.';
  }

  @override
  String topicsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ವಿಷಯಗಳು',
      one: '1 ವಿಷಯ',
    );
    return '$_temp0';
  }

  @override
  String chaptersCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಅಧ್ಯಾಯಗಳು',
      one: '1 ಅಧ್ಯಾಯ',
    );
    return '$_temp0';
  }

  @override
  String get yourSubjects => 'ನಿಮ್ಮ ವಿಷಯಗಳು';

  @override
  String get subjectsEmpty =>
      'ನಿಮ್ಮ ಶಿಕ್ಷಕರು ಹೋಂವರ್ಕ್ ನೀಡಿದ ನಂತರ ನಿಮ್ಮ ವಿಷಯಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ. ಅಲ್ಲಿಯವರೆಗೆ ಮೇಲೆ ಯಾವುದೇ ವಿಷಯವನ್ನು ಹುಡುಕಿ.';

  @override
  String syllabusMissing(Object subject) {
    return '$subject ವಿಷಯದ ಪಠ್ಯಕ್ರಮ ಇನ್ನೂ KINETIX ಲೈಬ್ರರಿಯಲ್ಲಿ ಇಲ್ಲ.\nಯಾವುದಾದರೂ ವಿಷಯವನ್ನು ಹುಡುಕಿ, ಅಥವಾ KINETIX AI ಅನ್ನು ಕೇಳಿ.';
  }

  @override
  String get noTopicsYet => 'ಇನ್ನೂ ಯಾವುದೇ ವಿಷಯಗಳಿಲ್ಲ.';

  @override
  String get joiningClass => 'ತರಗತಿಗೆ ಸೇರುತ್ತಿದ್ದೀರಿ…';

  @override
  String get waitingForBoard => 'ಬೋರ್ಡ್‌ಗಾಗಿ ಕಾಯಲಾಗುತ್ತಿದೆ…';

  @override
  String get leave => 'ಹೊರಬನ್ನಿ';

  @override
  String get liveBadge => 'ಲೈವ್';

  @override
  String get reconnecting => 'ಸಂಪರ್ಕ ಕಡಿತಗೊಂಡಿದೆ. ಮತ್ತೆ ಸಂಪರ್ಕಿಸಲಾಗುತ್ತಿದೆ…';

  @override
  String get couldNotJoin => 'ತರಗತಿಗೆ ಸೇರಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ';

  @override
  String get tryInAMoment => 'ಸ್ವಲ್ಪ ಸಮಯದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get liveOffTitle => 'ನಿಮ್ಮ ಶಿಕ್ಷಕರು ಲೈವ್ ತರಗತಿಯನ್ನು ನಿಲ್ಲಿಸಿದ್ದಾರೆ';

  @override
  String liveOffBody(Object today) {
    return 'ಬೋರ್ಡ್ ಅನ್ನು ಈಗ ಹಂಚಿಕೊಳ್ಳುತ್ತಿಲ್ಲ. ನಿಮ್ಮ ಶಿಕ್ಷಕರು ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್ ಹಂಚಿಕೊಂಡರೆ, ಅದು $today ಟ್ಯಾಬ್‌ನಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';
  }

  @override
  String get boardOfflineTitle => 'ಬೋರ್ಡ್ ಆಫ್‌ಲೈನ್ ಆಗಿದೆ';

  @override
  String get boardOfflineBody =>
      'ತರಗತಿಯ ಬೋರ್ಡ್ ಸಂಪರ್ಕ ಕಳೆದುಕೊಂಡಿದೆ. ಇಲ್ಲೇ ಇರಿ: ಮತ್ತೆ ಸಂಪರ್ಕಗೊಂಡಾಗ ಬೋರ್ಡ್ ತಾನಾಗಿಯೇ ಕಾಣಿಸುತ್ತದೆ.';

  @override
  String get classEndedTitle => 'ತರಗತಿ ಮುಗಿದಿದೆ';

  @override
  String classEndedBody(Object today) {
    return 'ಸೇರಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ಶಿಕ್ಷಕರು ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್ ಹಂಚಿಕೊಂಡರೆ, ಅದು $today ಟ್ಯಾಬ್‌ನಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';
  }

  @override
  String backToToday(Object today) {
    return '$today ಗೆ ಹಿಂತಿರುಗಿ';
  }

  @override
  String liveNow(Object subject) {
    return 'ಈಗ ಲೈವ್: $subject';
  }

  @override
  String get classFallback => 'ತರಗತಿ';

  @override
  String teacherTeaching(Object teacher) {
    return '$teacher ಪಾಠ ಮಾಡುತ್ತಿದ್ದಾರೆ. ಬೋರ್ಡ್ ನೋಡಿ.';
  }

  @override
  String get watch => 'ನೋಡಿ';

  @override
  String get liveSignInAgain => 'ತರಗತಿ ನೋಡಲು ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get liveNotConnected => 'ಸಂಪರ್ಕವಿಲ್ಲ';

  @override
  String get liveTimeout =>
      'ತರಗತಿಯಿಂದ ಉತ್ತರ ಬರಲು ತುಂಬಾ ತಡವಾಗುತ್ತಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get liveCouldNotJoin => 'ತರಗತಿಗೆ ಸೇರಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.';

  @override
  String get undergraduate => 'ಪದವಿ';

  @override
  String get postgraduate => 'ಸ್ನಾತಕೋತ್ತರ';

  @override
  String get boardOnlyNoSound => 'ಬೋರ್ಡ್ ಮಾತ್ರ: ಧ್ವನಿ ಇಲ್ಲ';

  @override
  String get teacherMicOn => 'ಶಿಕ್ಷಕರ ಮೈಕ್ ಆನ್ ಆಗಿದೆ';

  @override
  String get teacherMicOff => 'ಶಿಕ್ಷಕರ ಮೈಕ್ ಆಫ್ ಆಗಿದೆ';

  @override
  String get muteClass => 'ತರಗತಿಯ ಧ್ವನಿ ಮ್ಯೂಟ್ ಮಾಡಿ';

  @override
  String get unmuteClass => 'ತರಗತಿಯ ಧ್ವನಿ ಅನ್‌ಮ್ಯೂಟ್ ಮಾಡಿ';

  @override
  String get errNotStudent =>
      'ಈ ಆ್ಯಪ್ ವಿದ್ಯಾರ್ಥಿಗಳಿಗಾಗಿ. ನಿಮ್ಮ ವಿದ್ಯಾರ್ಥಿ ಲಾಗಿನ್ ಸಿದ್ಧಪಡಿಸಲು ಕಾಲೇಜು ಕಚೇರಿಯನ್ನು ಕೇಳಿ.';

  @override
  String get errGuardianAccount =>
      'ಈ ಆ್ಯಪ್ ವಿದ್ಯಾರ್ಥಿಗಳಿಗಾಗಿ. ಪೋಷಕರು KINETIX Parent ಆ್ಯಪ್ ಬಳಸಬಹುದು.';

  @override
  String get errTeacherAccount =>
      'ಈ ಆ್ಯಪ್ ವಿದ್ಯಾರ್ಥಿಗಳಿಗಾಗಿ. ಶಿಕ್ಷಕರು KINETIX Teacher ಆ್ಯಪ್ ಬಳಸಬಹುದು.';

  @override
  String get errNotLinked =>
      'ನಿಮ್ಮ ಲಾಗಿನ್ ಇನ್ನೂ ಯಾವುದೇ ವಿದ್ಯಾರ್ಥಿ ದಾಖಲೆಗೆ ಜೋಡಣೆಯಾಗಿಲ್ಲ. ಅದನ್ನು ಜೋಡಿಸಲು ಕಾಲೇಜು ಕಚೇರಿಯನ್ನು ಕೇಳಿ.';

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
      'ಶಾಲೆಯಲ್ಲಿ ಈ ಆಯ್ಕೆಗಳನ್ನು ನಿಮ್ಮ ಪೋಷಕರು ಮಾಡುತ್ತಾರೆ.';

  @override
  String get aiConsentWithdrawnTitle => 'KINETIX AI ಆಫ್ ಆಗಿದೆ';

  @override
  String get aiConsentWithdrawnBody =>
      'KINETIX AI ಗೆ ನೀಡಿದ ಅನುಮತಿಯನ್ನು ಹಿಂಪಡೆಯಲಾಗಿದೆ, ಆದ್ದರಿಂದ ಅದು ನಿಮಗೆ ಆಫ್ ಆಗಿದೆ. ಉಳಿದೆಲ್ಲವೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ. ಯಾರು ನಿರ್ಧರಿಸಿದರು ಎಂದು ನೋಡಲು ಅಥವಾ ಬದಲಾಯಿಸಲು ಪ್ರೊಫೈಲ್ → ಗೌಪ್ಯತೆ ತೆರೆಯಿರಿ.';

  @override
  String get openPrivacy => 'ಗೌಪ್ಯತೆ ತೆರೆಯಿರಿ';

  @override
  String get errLiveNotAllowed =>
      'ಶಾಲೆಯ ಮುಖ್ಯಸ್ಥರು ಮತ್ತು ವಿದ್ಯಾರ್ಥಿಗಳು ಮಾತ್ರ ತರಗತಿಗಳನ್ನು ನೋಡಬಹುದು.';

  @override
  String get errLiveViewOff => 'ನಿಮ್ಮ ಸಂಸ್ಥೆಗೆ ಲೈವ್ ವೀಕ್ಷಣೆ ಆಫ್ ಆಗಿದೆ.';

  @override
  String get errLiveNotStarted =>
      'ನಿಮ್ಮ ಶಿಕ್ಷಕರು ಲೈವ್ ತರಗತಿಯನ್ನು ಪ್ರಾರಂಭಿಸಿಲ್ಲ.';

  @override
  String get errLiveUnknownBoard =>
      'ಈ ತರಗತಿ ಬೋರ್ಡ್ ಗುರುತಿಸಲಾಗಿಲ್ಲ. ಯಾವ ತರಗತಿಯನ್ನು ನೋಡಬೇಕು ಎಂದು ನಿಮ್ಮ ಶಿಕ್ಷಕರನ್ನು ಕೇಳಿ.';

  @override
  String get errLiveNoClass => 'ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ಈಗ ಯಾವುದೇ ತರಗತಿ ನಡೆಯುತ್ತಿಲ್ಲ.';

  @override
  String get errLiveNotYourClass => 'ಇದು ನಿಮ್ಮ ತರಗತಿಯಲ್ಲ.';

  @override
  String get yourWork => 'ನಿಮ್ಮ ಕೆಲಸ';

  @override
  String get returnedNote =>
      'ಇದನ್ನು ಮತ್ತೆ ಮಾಡಲು ನಿಮ್ಮ ಶಿಕ್ಷಕರು ಹೇಳಿದ್ದಾರೆ. ಟಿಪ್ಪಣಿ ಓದಿ, ನಂತರ ಮತ್ತೆ ಸಲ್ಲಿಸಿ.';

  @override
  String get consentTitle => 'ನಿಮ್ಮ ಗೌಪ್ಯತೆಯ ಆಯ್ಕೆಗಳು';

  @override
  String get consentIntro =>
      'KINETIX ನಿಮ್ಮ ಮಾಹಿತಿಯೊಂದಿಗೆ ಏನು ಮಾಡಬಹುದು ಎಂಬುದನ್ನು ಆಯ್ಕೆಮಾಡಿ. ನೀವು ಆಯ್ಕೆ ಮಾಡುವವರೆಗೆ ಯಾವುದೂ ಆನ್ ಆಗುವುದಿಲ್ಲ.';

  @override
  String get privacyIntro =>
      'KINETIX ನಿಮ್ಮ ಮಾಹಿತಿಯೊಂದಿಗೆ ಏನು ಮಾಡಬಹುದು. ಅನುಮತಿ ಹಿಂಪಡೆಯಲು ಸ್ವಿಚ್ ಆಫ್ ಮಾಡಿ.';

  @override
  String get privacyIntroReadOnly =>
      'KINETIX ನಿಮ್ಮ ಮಾಹಿತಿಯೊಂದಿಗೆ ಏನು ಮಾಡಬಹುದು, ಮತ್ತು ಯಾರು ನಿರ್ಧರಿಸಿದರು.';

  @override
  String get managedByParent =>
      'ಇದನ್ನು ನಿಮ್ಮ ಪೋಷಕರು ನಿರ್ವಹಿಸುತ್ತಾರೆ. ಶಾಲೆಯಲ್ಲಿ ಈ ಆಯ್ಕೆಗಳನ್ನು ನಿಮ್ಮ ಪೋಷಕರು KINETIX Parent ಆ್ಯಪ್‌ನಲ್ಲಿ ಮಾಡುತ್ತಾರೆ.';

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
  String get comingUpInClass => 'ತರಗತಿಯಲ್ಲಿ ಮುಂದೆ';

  @override
  String get readAhead =>
      'ತರಗತಿಯಲ್ಲಿ ಕಲಿಸಲು ಯೋಜಿಸಿರುವ ವಿಷಯಗಳು. ಬೇಕಿದ್ದರೆ ಮೊದಲೇ ಓದಿಕೊಳ್ಳಿ.';

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
      'ನಿಮ್ಮ ಕಾಲೇಜಿನಲ್ಲಿರುವ ಫೋನ್ ಸಂಖ್ಯೆಗೆ ನಾವು ಕೋಡ್ ಕಳುಹಿಸುತ್ತೇವೆ';

  @override
  String get notificationsBody =>
      'ಹೊಸ ಹೋಂವರ್ಕ್, ಫಲಿತಾಂಶಗಳು, ಲೈವ್ ತರಗತಿಗಳು ಮತ್ತು ಕಾಲೇಜಿನ ಸಂದೇಶಗಳು ಬಂದಾಗ ನಾವು ತಿಳಿಸುತ್ತೇವೆ. ಇದನ್ನು ಯಾವಾಗ ಬೇಕಾದರೂ ಫೋನ್‌ನ ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಬದಲಿಸಬಹುದು.';

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
  String get conceptVideos => 'ಪರಿಕಲ್ಪನೆ ವೀಡಿಯೊಗಳು';

  @override
  String get conceptVideosHint =>
      'ತರಗತಿಗೆ ಮೊದಲು ಮುನ್ನೋಟಕ್ಕಾಗಿ ಮತ್ತು ತರಗತಿಯ ನಂತರ ಪುನರಾವರ್ತನೆಗಾಗಿ ನೋಡಿ.';

  @override
  String get conceptVideosFromYouTube => 'ಯೂಟ್ಯೂಬ್‌ನಿಂದ ಪ್ಲೇ ಆಗುತ್ತದೆ';

  @override
  String get conceptVideoSourcePlatform => 'KINETIX';

  @override
  String get conceptVideoSourceInstitution => 'ಶಾಲೆ';

  @override
  String get conceptVideoSourceTeacher => 'ಶಿಕ್ಷಕ';

  @override
  String get conceptVideosUnsupported =>
      'ವೀಡಿಯೊಗಳು ಇಲ್ಲಿ ಪ್ಲೇ ಆಗುವುದಿಲ್ಲ. ನಿಮ್ಮ ಫೋನ್‌ನಲ್ಲಿ ವಿದ್ಯಾರ್ಥಿ ಆ್ಯಪ್ ಬಳಸಿ.';

  @override
  String conceptVideoPlay(String title) {
    return '$title ಪ್ಲೇ ಮಾಡಿ';
  }

  @override
  String get liveQuestion => 'ಲೈವ್ ಪ್ರಶ್ನೆ';

  @override
  String get liveQuestionTapToAnswer => 'ಉತ್ತರಿಸಲು ಟ್ಯಾಪ್ ಮಾಡಿ';

  @override
  String liveQuestionYourAnswer(String answer) {
    return 'ನಿಮ್ಮ ಉತ್ತರ: $answer (ಬದಲಿಸಬಹುದು)';
  }

  @override
  String get liveQuestionYourNumber => 'ನಿಮ್ಮ ಉತ್ತರ';

  @override
  String get liveQuestionSend => 'ಉತ್ತರ ಕಳುಹಿಸಿ';

  @override
  String get liveQuestionNotNumber => '2.5 ರಂತೆ ಒಂದು ಸಂಖ್ಯೆ ಬರೆಯಿರಿ';

  @override
  String get liveQuestionYourWords => 'ನಿಮ್ಮ ಉತ್ತರ (ಒಂದರಿಂದ ಮೂರು ಪದಗಳು)';

  @override
  String get liveQuestionNotWords => 'ಒಂದರಿಂದ ಮೂರು ಪದಗಳನ್ನು ಬರೆಯಿರಿ';

  @override
  String get liveQuestionClosed =>
      'ನಿಮ್ಮ ಶಿಕ್ಷಕರು ಈ ಪ್ರಶ್ನೆಯನ್ನು ಮುಗಿಸಿದ್ದಾರೆ.';

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
  String get navMyLearning => 'ನನ್ನ ಕಲಿಕೆ';

  @override
  String get navExams => 'ಪರೀಕ್ಷೆಗಳು';

  @override
  String get navMore => 'ಇನ್ನಷ್ಟು';

  @override
  String get homeSubtitle => 'ಕಲಿಯುತ್ತಿರಿ, ಬೆಳೆಯುತ್ತಿರಿ!';

  @override
  String get notificationsTooltip => 'ಸೂಚನೆಗಳು';

  @override
  String get nextClass => 'ಮುಂದಿನ ತರಗತಿ';

  @override
  String get nextClassNone => 'ಈಗ ಯಾವುದೇ ತರಗತಿ ನಿಗದಿಯಾಗಿಲ್ಲ.';

  @override
  String nextClassLive(String subject) {
    return '$subject ಈಗ ಲೈವ್ ಆಗಿದೆ';
  }

  @override
  String nextClassTopic(String subject) {
    return '$subject ನಲ್ಲಿ ಮುಂದೆ';
  }

  @override
  String get watchLive => 'ಸೇರಿ';

  @override
  String get viewAction => 'ನೋಡಿ';

  @override
  String get tilePendingAssignments => 'ಅಸೈನ್‌ಮೆಂಟ್‌ಗಳು';

  @override
  String tilePendingValue(int n) {
    return '$n ಬಾಕಿ';
  }

  @override
  String get tileAllDone => 'ಎಲ್ಲವೂ ಮುಗಿದಿದೆ';

  @override
  String get tileUpcomingExam => 'ಮುಂಬರುವ ಪರೀಕ್ಷೆ';

  @override
  String tileExamDays(int n) {
    return '$n ದಿನಗಳಲ್ಲಿ';
  }

  @override
  String get tileExamToday => 'ಇಂದು';

  @override
  String get tileExamNone => 'ಇನ್ನೂ ಇಲ್ಲ';

  @override
  String get tileStreak => 'ಕಲಿಕೆಯ ಸರಣಿ';

  @override
  String tileStreakDays(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n ದಿನಗಳು',
      one: '1 ದಿನ',
    );
    return '$_temp0';
  }

  @override
  String get continueLearning => 'ಕಲಿಕೆ ಮುಂದುವರಿಸಿ';

  @override
  String get continueLearningEmpty =>
      'KINETIX AI ಗೆ ಸಂದೇಹ ಕೇಳಿ ಅಥವಾ ನನ್ನ ಕಲಿಕೆಯಿಂದ ಒಂದು ವಿಷಯ ತೆರೆಯಿರಿ.';

  @override
  String continueProgress(int taught, int total) {
    return '$total ರಲ್ಲಿ $taught ವಿಷಯ ಬೋಧಿಸಲಾಗಿದೆ';
  }

  @override
  String get moreSchoolLife => 'ಕ್ಯಾಂಪಸ್';

  @override
  String get leaveApplyTitle => 'ರಜೆಗೆ ಅರ್ಜಿ';

  @override
  String get leaveScreenTitle => 'ರಜೆ';

  @override
  String get leaveFromLabel => 'ಇಂದ';

  @override
  String get leaveToLabel => 'ವರೆಗೆ';

  @override
  String get leaveReasonLabel => 'ಕಾರಣ';

  @override
  String get leaveReasonRequired => 'ಕೆಲವು ಪದಗಳನ್ನು ಬರೆಯಿರಿ (ಕನಿಷ್ಠ 3 ಅಕ್ಷರ).';

  @override
  String get leaveSend => 'ಮನವಿ ಕಳುಹಿಸಿ';

  @override
  String get leaveSentSnack => 'ಮನವಿಯನ್ನು ನಿಮ್ಮ ತರಗತಿ ಶಿಕ್ಷಕರಿಗೆ ಕಳುಹಿಸಲಾಗಿದೆ.';

  @override
  String get leaveNone => 'ಇನ್ನೂ ಯಾವುದೇ ರಜೆ ಅರ್ಜಿ ಇಲ್ಲ.';

  @override
  String get leaveStatusPending => 'ಕಾಯುತ್ತಿದೆ';

  @override
  String get leaveStatusApproved => 'ಅನುಮೋದಿಸಲಾಗಿದೆ';

  @override
  String get leaveStatusRejected => 'ಅನುಮೋದಿಸಿಲ್ಲ';

  @override
  String get leaveStatusCancelled => 'ಹಿಂಪಡೆಯಲಾಗಿದೆ';

  @override
  String get leaveWithdraw => 'ಹಿಂಪಡೆಯಿರಿ';

  @override
  String get leaveToBeforeFrom => 'ಕೊನೆಯ ದಿನ ಮೊದಲ ದಿನಕ್ಕಿಂತ ಮೊದಲು ಇರಬಾರದು.';

  @override
  String get busTitle => 'ನನ್ನ ಬಸ್';

  @override
  String get busNone => 'ನಿಮಗೆ ಬಸ್ ಸೀಟು ನಿಗದಿಯಾಗಿಲ್ಲ. ಸಾರಿಗೆ ಕಚೇರಿಯನ್ನು ಕೇಳಿ.';

  @override
  String get busRoute => 'ಮಾರ್ಗ';

  @override
  String get busYourStop => 'ನಿಮ್ಮ ನಿಲುಗಡೆ';

  @override
  String get busPickup => 'ಪಿಕಪ್';

  @override
  String get busVehicle => 'ವಾಹನ';

  @override
  String get busStopsHeading => 'ನಿಲುಗಡೆಗಳು';

  @override
  String busEta(int n) {
    return 'ನಿಮ್ಮ ನಿಲುಗಡೆಗೆ ಸುಮಾರು $n ನಿಮಿಷದಲ್ಲಿ ತಲುಪುತ್ತದೆ';
  }

  @override
  String get busPassed => 'ಬಸ್ ನಿಮ್ಮ ನಿಲುಗಡೆಯನ್ನು ದಾಟಿದೆ';

  @override
  String busStopsAway(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n ನಿಲುಗಡೆ ದೂರ',
      one: '1 ನಿಲುಗಡೆ ದೂರ',
      zero: 'ನಿಮ್ಮ ನಿಲುಗಡೆಯಲ್ಲಿ',
    );
    return '$_temp0';
  }

  @override
  String get busNotRunning => 'ಬಸ್ ಈಗ ರಸ್ತೆಯಲ್ಲಿಲ್ಲ.';

  @override
  String get gatePassTitle => 'ಹಾಸ್ಟೆಲ್ ಗೇಟ್ ಪಾಸ್';

  @override
  String get gatePassNotResident =>
      'ನೀವು ಹಾಸ್ಟೆಲ್‌ನಲ್ಲಿ ಇಲ್ಲ. ಗೇಟ್ ಪಾಸ್ ಹಾಸ್ಟೆಲ್ ನಿವಾಸಿಗಳಿಗೆ.';

  @override
  String gatePassRoom(String block, String room) {
    return '$block · ಕೊಠಡಿ $room';
  }

  @override
  String get gatePassRequest => 'ಗೇಟ್ ಪಾಸ್‌ಗೆ ಮನವಿ';

  @override
  String get gatePassReason => 'ಕಾರಣ';

  @override
  String get gatePassDestination => 'ನೀವು ಎಲ್ಲಿಗೆ ಹೋಗುತ್ತಿದ್ದೀರಿ?';

  @override
  String get gatePassBackBy => 'ಹಿಂತಿರುಗುವ ಸಮಯ';

  @override
  String get gatePassSend => 'ವಾರ್ಡನ್‌ಗೆ ಕಳುಹಿಸಿ';

  @override
  String get gatePassSent => 'ಮನವಿಯನ್ನು ವಾರ್ಡನ್‌ಗೆ ಕಳುಹಿಸಲಾಗಿದೆ.';

  @override
  String get gatePassBackFuture => 'ಭವಿಷ್ಯದ ಹಿಂತಿರುಗುವ ಸಮಯ ಆಯ್ಕೆಮಾಡಿ.';

  @override
  String get gatePassNone => 'ಇನ್ನೂ ಯಾವುದೇ ಗೇಟ್ ಪಾಸ್ ಇಲ್ಲ.';

  @override
  String get gatePassRequested => 'ವಾರ್ಡನ್‌ಗಾಗಿ ಕಾಯುತ್ತಿದೆ';

  @override
  String get gatePassIssued => 'ಅನುಮೋದಿಸಲಾಗಿದೆ';

  @override
  String get gatePassOut => 'ಹಾಸ್ಟೆಲ್‌ನಿಂದ ಹೊರಗೆ';

  @override
  String get gatePassReturned => 'ಹಿಂತಿರುಗಿದ್ದಾರೆ';

  @override
  String get gatePassRejected => 'ಅನುಮೋದಿಸಿಲ್ಲ';

  @override
  String get gatePassCancelled => 'ರದ್ದಾಗಿದೆ';

  @override
  String gatePassBackLine(String when) {
    return '$when ರೊಳಗೆ ಹಿಂತಿರುಗಿ';
  }

  @override
  String get certificatesTitle => 'ಪ್ರಮಾಣಪತ್ರಗಳು';

  @override
  String get certificateRequestAction => 'ಪ್ರಮಾಣಪತ್ರಕ್ಕೆ ಮನವಿ';

  @override
  String get certificateChoose => 'ಯಾವ ಪ್ರಮಾಣಪತ್ರ?';

  @override
  String get certificatePurpose => 'ಇದು ಏತಕ್ಕೆ? (ಐಚ್ಛಿಕ)';

  @override
  String get certificateRequiredField => 'ಈ ಕ್ಷೇತ್ರವನ್ನು ಭರ್ತಿಮಾಡಿ.';

  @override
  String get certificateSent => 'ಮನವಿಯನ್ನು ಕಚೇರಿಗೆ ಕಳುಹಿಸಲಾಗಿದೆ.';

  @override
  String get certificateNone => 'ಇನ್ನೂ ಯಾವುದೇ ಪ್ರಮಾಣಪತ್ರ ಇಲ್ಲ.';

  @override
  String get certificateNoTemplates =>
      'ಕಾಲೇಜು ಮನವಿಗೆ ಯಾವುದೇ ಪ್ರಮಾಣಪತ್ರ ತೆರೆದಿಲ್ಲ.';

  @override
  String get certificateRequested => 'ಕಚೇರಿಗಾಗಿ ಕಾಯುತ್ತಿದೆ';

  @override
  String get certificateApproved => 'ಅನುಮೋದಿಸಲಾಗಿದೆ, ಸಿದ್ಧವಾಗುತ್ತಿದೆ';

  @override
  String get certificateRejected => 'ಅನುಮೋದಿಸಿಲ್ಲ';

  @override
  String get certificateIssued => 'ಡೌನ್‌ಲೋಡ್‌ಗೆ ಸಿದ್ಧ';

  @override
  String get certificateRevoked => 'ಕಾಲೇಜು ಹಿಂಪಡೆದಿದೆ';

  @override
  String get certificateDownload => 'PDF ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ';

  @override
  String certificateSerial(String serial) {
    return 'ಸಂ. $serial';
  }

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
  String get coursesTab => 'ಕೋರ್ಸ್‌ಗಳು';

  @override
  String get scholarshipTitle => 'ವಿದ್ಯಾರ್ಥಿವೇತನ';

  @override
  String get scholarshipNone => 'ಈಗ ಯಾವ ವಿದ್ಯಾರ್ಥಿವೇತನವೂ ಅರ್ಜಿಗೆ ತೆರೆದಿಲ್ಲ.';

  @override
  String scholarshipPercentOff(int count) {
    return 'ನಿಮ್ಮ ಶುಲ್ಕದಲ್ಲಿ $count% ರಿಯಾಯಿತಿ';
  }

  @override
  String scholarshipAmountOff(String amount) {
    return 'ನಿಮ್ಮ ಶುಲ್ಕದಲ್ಲಿ $amount ರಿಯಾಯಿತಿ';
  }

  @override
  String scholarshipMinMarks(int count) {
    return 'ಪ್ರಕಟಿತ ಅಂಕಗಳಲ್ಲಿ ಕನಿಷ್ಠ $count% ಬೇಕು';
  }

  @override
  String scholarshipMaxIncome(String amount) {
    return 'ಕುಟುಂಬದ ಆದಾಯ $amount ವರೆಗೆ';
  }

  @override
  String get scholarshipApply => 'ಅರ್ಜಿ ಸಲ್ಲಿಸಿ';

  @override
  String get scholarshipMine => 'ನನ್ನ ಅರ್ಜಿಗಳು';

  @override
  String scholarshipAwarded(String amount) {
    return 'ನಿಮ್ಮ ಶುಲ್ಕದಿಂದ $amount ಕಳೆಯಲಾಗಿದೆ';
  }

  @override
  String get scholarshipIncomeLabel => 'ವಾರ್ಷಿಕ ಕುಟುಂಬ ಆದಾಯ (₹)';

  @override
  String get scholarshipIncomeRequired =>
      'ಕುಟುಂಬದ ಆದಾಯವನ್ನು ಸಂಖ್ಯೆಯಲ್ಲಿ ನಮೂದಿಸಿ.';

  @override
  String get scholarshipNoteLabel => 'ಕಾಲೇಜಿಗೆ ತಿಳಿಸಬೇಕಾದದ್ದು (ಐಚ್ಛಿಕ)';

  @override
  String get scholarshipSend => 'ಅರ್ಜಿ ಕಳುಹಿಸಿ';

  @override
  String get scholarshipSentSnack =>
      'ಅರ್ಜಿಯನ್ನು ಲೆಕ್ಕಪತ್ರ ಕಚೇರಿಗೆ ಕಳುಹಿಸಲಾಗಿದೆ.';

  @override
  String get walletTitle => 'ಹಾಸ್ಟೆಲ್ ಮತ್ತು ಕ್ಯಾಂಟೀನ್';

  @override
  String get walletHostel => 'ಹಾಸ್ಟೆಲ್';

  @override
  String walletBedLine(Object block, Object room, Object bed) {
    return '$block, ಕೊಠಡಿ $room, ಹಾಸಿಗೆ $bed';
  }

  @override
  String get walletNotInHostel => 'ನೀವು ಹಾಸ್ಟೆಲ್‌ನಲ್ಲಿ ಇಲ್ಲ';

  @override
  String get walletNights => 'ರಾತ್ರಿ ಹಾಜರಾತಿ';

  @override
  String get walletNoNights => 'ಇನ್ನೂ ಹಾಜರಾತಿ ಇಲ್ಲ';

  @override
  String get walletPresent => 'ಹಾಜರು';

  @override
  String get walletAbsent => 'ಗೈರು';

  @override
  String get walletLeave => 'ರಜೆಯಲ್ಲಿ';

  @override
  String get walletCanteen => 'ಕ್ಯಾಂಟೀನ್ ವಾಲೆಟ್';

  @override
  String get walletBalance => 'ಬಾಕಿ';

  @override
  String get walletAddMoney => 'ಹಣ ಸೇರಿಸಿ';

  @override
  String walletAdded(Object amount) {
    return 'ನಿಮ್ಮ ವಾಲೆಟ್‌ಗೆ $amount ಸೇರಿಸಲಾಗಿದೆ';
  }

  @override
  String get walletMeals => 'ಇತ್ತೀಚಿನ ಊಟಗಳು';

  @override
  String get walletNoMeals => 'ಇನ್ನೂ ಊಟಗಳಿಲ್ಲ';

  @override
  String get walletBreakfast => 'ಉಪಾಹಾರ';

  @override
  String get walletLunch => 'ಮಧ್ಯಾಹ್ನದ ಊಟ';

  @override
  String get walletSnacks => 'ತಿಂಡಿ';

  @override
  String get walletDinner => 'ರಾತ್ರಿಯ ಊಟ';

  @override
  String get walletEnterAmount => 'ಮೊತ್ತ ನಮೂದಿಸಿ';

  @override
  String get walletEnterRupees => 'ರೂಪಾಯಿಗಳಲ್ಲಿ ಮೊತ್ತ ನಮೂದಿಸಿ';

  @override
  String get walletMinAmount => 'ಕನಿಷ್ಠ ₹1 ಸೇರಿಸಬಹುದು';

  @override
  String get walletStarting => 'ಪಾವತಿ ಪ್ರಾರಂಭವಾಗುತ್ತಿದೆ…';

  @override
  String get walletConfirming => 'ಪಾವತಿ ದೃಢೀಕರಿಸಲಾಗುತ್ತಿದೆ…';

  @override
  String get walletCancelled => 'ಪಾವತಿ ರದ್ದಾಗಿದೆ';

  @override
  String get walletFailedTitle => 'ಪಾವತಿ ಆಗಲಿಲ್ಲ';

  @override
  String get walletCouldNotConfirm => 'ಪಾವತಿ ದೃಢೀಕರಿಸಲು ಆಗಲಿಲ್ಲ';

  @override
  String get walletNotSetUp =>
      'ಆನ್‌ಲೈನ್ ಪಾವತಿ ಇನ್ನೂ ಸಿದ್ಧವಾಗಿಲ್ಲ. ಕ್ಯಾಂಟೀನ್ ಕೌಂಟರ್‌ನಲ್ಲಿ ಹಣ ಸೇರಿಸಿ.';

  @override
  String get walletPhonesOnly =>
      'ಆನ್‌ಲೈನ್ ಪಾವತಿ Android ಫೋನ್ ಮತ್ತು iPhone ಗಳಲ್ಲಿ ಕೆಲಸ ಮಾಡುತ್ತದೆ.';

  @override
  String get walletFailNoConfirm =>
      'ಪಾವತಿ ಆ್ಯಪ್‌ನಿಂದ ದೃಢೀಕರಣ ಬರಲಿಲ್ಲ. ನಿಮ್ಮ ಖಾತೆಯಿಂದ ಹಣ ಕಡಿತವಾಗಿದ್ದರೆ ವಾಲೆಟ್ ಶೀಘ್ರದಲ್ಲೇ ನವೀಕರಣವಾಗುತ್ತದೆ.';

  @override
  String get walletFailOpen => 'ಪಾವತಿ ಪರದೆ ತೆರೆಯಲು ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get walletFailNetwork => 'ಇಂಟರ್ನೆಟ್ ಇಲ್ಲ. ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get walletFailGeneric => 'ಪಾವತಿ ಆಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String walletFinishIn(Object app) {
    return '$app ನಲ್ಲಿ ಪೂರ್ಣಗೊಳಿಸಿ';
  }

  @override
  String get walletInWalletBody =>
      'ಆ ಆ್ಯಪ್‌ನಲ್ಲಿ ಪಾವತಿ ಪೂರ್ಣಗೊಳಿಸಿ. ಪೂರ್ಣವಾದ ಕೂಡಲೇ ವಾಲೆಟ್ ನವೀಕರಣವಾಗುತ್ತದೆ.';

  @override
  String get walletDemo => 'ಡೆಮೊ ಪಾವತಿ';

  @override
  String get walletDemoNoMoney => 'ಡೆಮೊ ಪಾವತಿ: ಹಣ ಕಡಿತವಾಗುವುದಿಲ್ಲ';

  @override
  String walletDemoPay(Object amount) {
    return '$amount ಪಾವತಿಸಿ';
  }

  @override
  String get walletAmount => 'ಮೊತ್ತ';

  @override
  String get courseRegTitle => 'ಕೋರ್ಸ್ ನೋಂದಣಿ';

  @override
  String courseRegCredits(String registered, String max, String min) {
    return 'ಕ್ರೆಡಿಟ್: $registered / $max (ಕನಿಷ್ಠ $min)';
  }

  @override
  String courseRegAddDropUntil(String when) {
    return '$when ವರೆಗೆ ಸೇರಿಸಬಹುದು ಅಥವಾ ಬಿಡಬಹುದು.';
  }

  @override
  String get courseRegClosed => 'ಈಗ ನಿಮಗೆ ನೋಂದಣಿ ತೆರೆದಿಲ್ಲ.';

  @override
  String get courseRegNoTerm => 'ನೋಂದಣಿಗೆ ಇನ್ನೂ ಯಾವುದೇ ಅವಧಿ ಇಲ್ಲ.';

  @override
  String get courseRegNoOfferings => 'ಈ ಅವಧಿಯಲ್ಲಿ ಇನ್ನೂ ಯಾವುದೇ ಕೋರ್ಸ್ ಇಲ್ಲ.';

  @override
  String get courseRegMine => 'ನನ್ನ ನೋಂದಣಿಗಳು';

  @override
  String get courseRegAvailable => 'ಲಭ್ಯವಿರುವ ಕೋರ್ಸ್‌ಗಳು';

  @override
  String get courseRegRegister => 'ನೋಂದಾಯಿಸಿ';

  @override
  String get courseRegDrop => 'ಬಿಡಿ';

  @override
  String courseRegDropTitle(String name) {
    return '$name ಬಿಡಬೇಕೆ?';
  }

  @override
  String get courseRegRegisteredNow => 'ನಿಮ್ಮ ನೋಂದಣಿ ಆಯಿತು.';

  @override
  String get courseRegDropped => 'ಕೋರ್ಸ್ ಬಿಡಲಾಗಿದೆ.';

  @override
  String get courseRegCore => 'ಕಡ್ಡಾಯ';

  @override
  String get courseRegElective => 'ಐಚ್ಛಿಕ';

  @override
  String courseRegCreditsOf(String n) {
    return '$n ಕ್ರೆಡಿಟ್';
  }

  @override
  String courseRegSeatsLeft(String n) {
    return '$n ಸೀಟುಗಳು ಉಳಿದಿವೆ';
  }

  @override
  String get courseRegFull => 'ಭರ್ತಿಯಾಗಿದೆ';

  @override
  String get courseRegRegisteredPill => 'ನೋಂದಾಯಿಸಲಾಗಿದೆ';

  @override
  String get courseRegWaitlisted => 'ಕಾಯುವ ಪಟ್ಟಿಯಲ್ಲಿ';

  @override
  String get courseRegNotAllotted => 'ಹಂಚಿಕೆಯಾಗಿಲ್ಲ';

  @override
  String courseRegRanked(String rank) {
    return 'ಆದ್ಯತೆ $rank';
  }

  @override
  String get courseRegApprovalPending => 'ಅನುಮೋದನೆಗಾಗಿ ಕಾಯುತ್ತಿದೆ';

  @override
  String get courseRegApproved => 'ಅನುಮೋದಿಸಲಾಗಿದೆ';

  @override
  String get courseRegRejected => 'ಅನುಮೋದಿಸಿಲ್ಲ';

  @override
  String get courseRegRank => 'ಐಚ್ಛಿಕ ಕೋರ್ಸ್‌ಗಳಿಗೆ ಕ್ರಮ ನೀಡಿ';

  @override
  String get courseRegRankHelp =>
      'ಬೇಕಾದ ಐಚ್ಛಿಕ ಕೋರ್ಸ್‌ಗಳನ್ನು ಆಯ್ಕೆಮಾಡಿ, ಹೆಚ್ಚು ಬೇಕಾದದ್ದನ್ನು ಮೇಲೆ ಇಡಿ. ಭರ್ತಿಯಾದ ಕೋರ್ಸ್‌ಗಳ ಸೀಟುಗಳು ಈ ಕ್ರಮದಲ್ಲಿ ಸಿಗುತ್ತವೆ.';

  @override
  String get courseRegRankSave => 'ಕ್ರಮ ಉಳಿಸಿ';

  @override
  String get courseRegRankSaved => 'ನಿಮ್ಮ ಆದ್ಯತೆಗಳನ್ನು ಉಳಿಸಲಾಗಿದೆ.';

  @override
  String get courseRegRankNone => 'ಕ್ರಮ ನೀಡಲು ಐಚ್ಛಿಕ ಕೋರ್ಸ್‌ಗಳಿಲ್ಲ.';

  @override
  String get passportTitle => 'ಫಲಿತಾಂಶ ಪಾಸ್‌ಪೋರ್ಟ್';

  @override
  String get passportVerified => 'ಸಂಸ್ಥೆಯಿಂದ ಪರಿಶೀಲಿಸಲಾಗಿದೆ';

  @override
  String get passportNotVerified => 'ಸಂಸ್ಥೆ ಇನ್ನೂ ಪರಿಶೀಲಿಸಿಲ್ಲ';

  @override
  String get passportSkills => 'ಕೌಶಲ್ಯಗಳು';

  @override
  String get passportNoSkills => 'ಇನ್ನೂ ಯಾವುದೇ ಕೌಶಲ್ಯ ದಾಖಲಾಗಿಲ್ಲ.';

  @override
  String passportLevel(String n) {
    return 'ಹಂತ $n / 5';
  }

  @override
  String get passportNoEvidence => 'ಇನ್ನೂ ಯಾವುದೇ ಪುರಾವೆ ಇಲ್ಲ';

  @override
  String get passportCertificates => 'ಪ್ರಮಾಣಪತ್ರಗಳು';

  @override
  String get passportActivities => 'ಕ್ಲಬ್‌ಗಳು ಮತ್ತು ಕಾರ್ಯಕ್ರಮಗಳು';

  @override
  String get passportDownload => 'PDF ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ';

  @override
  String get surveysTitle => 'ಸಮೀಕ್ಷೆಗಳು';

  @override
  String get surveysNone => 'ನಿಮಗಾಗಿ ಯಾವುದೇ ಸಮೀಕ್ಷೆ ಬಾಕಿ ಇಲ್ಲ.';

  @override
  String get surveyAnonymous => 'ನಿಮ್ಮ ಉತ್ತರಗಳು ಅನಾಮಧೇಯವಾಗಿವೆ.';

  @override
  String get surveySubmit => 'ಸಲ್ಲಿಸಿ';

  @override
  String get surveySent => 'ಧನ್ಯವಾದ. ನಿಮ್ಮ ಉತ್ತರಗಳನ್ನು ಕಳುಹಿಸಲಾಗಿದೆ.';

  @override
  String get surveyRequired => 'ಕಡ್ಡಾಯ ಎಂದು ಗುರುತಿಸಿದ ಪ್ರಶ್ನೆಗಳಿಗೆ ಉತ್ತರಿಸಿ.';

  @override
  String get surveyOptional => 'ಐಚ್ಛಿಕ';

  @override
  String surveyClosesOn(String when) {
    return '$when ರಂದು ಮುಚ್ಚುತ್ತದೆ';
  }

  @override
  String get surveyAnswerHint => 'ನಿಮ್ಮ ಉತ್ತರ';

  @override
  String get campusLifeTitle => 'ಕ್ಲಬ್‌ಗಳು ಮತ್ತು ಕಾರ್ಯಕ್ರಮಗಳು';

  @override
  String get campusTabClubs => 'ಕ್ಲಬ್‌ಗಳು';

  @override
  String get campusTabEvents => 'ಕಾರ್ಯಕ್ರಮಗಳು';

  @override
  String get campusTabPasses => 'ನನ್ನ ಪಾಸ್‌ಗಳು';

  @override
  String get clubJoin => 'ಸೇರಿ';

  @override
  String get clubLeave => 'ಬಿಡಿ';

  @override
  String get clubRequested => 'ಅನುಮೋದನೆಗಾಗಿ ಕಾಯುತ್ತಿದೆ';

  @override
  String get clubMember => 'ಸದಸ್ಯ';

  @override
  String clubPoints(String n) {
    return '$n ಅಂಕಗಳು';
  }

  @override
  String get clubsNone => 'ಇನ್ನೂ ಯಾವುದೇ ಕ್ಲಬ್ ಇಲ್ಲ.';

  @override
  String get clubJoinSent => 'ವಿನಂತಿ ಕಳುಹಿಸಲಾಗಿದೆ. ಸಂಯೋಜಕರು ಅನುಮೋದಿಸುತ್ತಾರೆ.';

  @override
  String get eventsNone => 'ನೋಂದಣಿಗೆ ಯಾವುದೇ ಕಾರ್ಯಕ್ರಮ ತೆರೆದಿಲ್ಲ.';

  @override
  String get eventRegister => 'ನೋಂದಾಯಿಸಿ';

  @override
  String get eventJoinWaitlist => 'ಕಾಯುವ ಪಟ್ಟಿಗೆ ಸೇರಿ';

  @override
  String get eventCancelRegistration => 'ನೋಂದಣಿ ರದ್ದುಮಾಡಿ';

  @override
  String get eventRegisteredPill => 'ನೀವು ನೋಂದಾಯಿಸಿದ್ದೀರಿ';

  @override
  String get eventWaitlistedPill => 'ಕಾಯುವ ಪಟ್ಟಿಯಲ್ಲಿ';

  @override
  String eventSeatsLeft(String n) {
    return '$n ಸೀಟುಗಳು ಉಳಿದಿವೆ';
  }

  @override
  String eventFee(String amount) {
    return 'ಶುಲ್ಕ $amount';
  }

  @override
  String get eventFree => 'ಉಚಿತ';

  @override
  String get passNone => 'ನೀವು ಯಾವುದೇ ಕಾರ್ಯಕ್ರಮಕ್ಕೆ ನೋಂದಾಯಿಸಿಲ್ಲ.';

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
  String get classNotesTitle => 'ತರಗತಿಯ ಟಿಪ್ಪಣಿಗಳು';

  @override
  String get classNotesRecaps => 'ಪಾಠದ ಸಾರಾಂಶ';

  @override
  String get classNotesBoards => 'ವೈಟ್‌ಬೋರ್ಡ್‌ಗಳು';

  @override
  String get classNotesEmpty => 'ನಿಮ್ಮ ತರಗತಿಯೊಂದಿಗೆ ಇನ್ನೂ ಏನನ್ನೂ ಹಂಚಿಕೊಂಡಿಲ್ಲ.';

  @override
  String get classNotesNoRecap => 'ಈ ಪಾಠದ ಸಾರಾಂಶ ಇನ್ನೂ ಸಿದ್ಧವಾಗಿಲ್ಲ.';

  @override
  String get classNotesKeyPoints => 'ಮುಖ್ಯ ಅಂಶಗಳು';

  @override
  String get classNotesWatch => 'ಪಾಠ ನೋಡಿ';

  @override
  String get attendanceEnterCode => 'ನಿಮ್ಮನ್ನು ಹಾಜರು ಎಂದು ದಾಖಲಿಸಿ';

  @override
  String get attendanceCodeHint => 'ಶಿಕ್ಷಕರ ಪರದೆಯಲ್ಲಿರುವ ಕೋಡ್';

  @override
  String get attendanceCodeSubmit => 'ನನ್ನನ್ನು ಹಾಜರು ಎಂದು ದಾಖಲಿಸಿ';

  @override
  String get attendanceMarkedPresent => 'ನಿಮ್ಮನ್ನು ಹಾಜರು ಎಂದು ದಾಖಲಿಸಲಾಗಿದೆ.';

  @override
  String get attendanceAlreadyMarked =>
      'ಈ ಅವಧಿಯ ನಿಮ್ಮ ಹಾಜರಾತಿ ಈಗಾಗಲೇ ದಾಖಲಾಗಿದೆ.';

  @override
  String get dpdpTitle => 'ನನ್ನ ಡೇಟಾ ಹಕ್ಕುಗಳು';

  @override
  String get dpdpSubtitle => 'ನಿಮ್ಮ ಡೇಟಾ ಡೌನ್‌ಲೋಡ್, ತಿದ್ದುಪಡಿ ಅಥವಾ ಅಳಿಸಿ';

  @override
  String get dpdpOfficerTitle => 'ಕುಂದುಕೊರತೆ ಅಧಿಕಾರಿ';

  @override
  String get dpdpOfficerNone =>
      'ಇನ್ನೂ ಕುಂದುಕೊರತೆ ಅಧಿಕಾರಿಯನ್ನು ನೇಮಿಸಿಲ್ಲ. ಶಾಲಾ ಕಚೇರಿಗೆ ಬರೆಯಿರಿ.';

  @override
  String get dpdpExportTitle => 'ನನ್ನ ಡೇಟಾ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ';

  @override
  String get dpdpExportBody => 'ಶಾಲೆಯ ಬಳಿ ನಿಮ್ಮ ಬಗ್ಗೆ ಏನೇನಿದೆ ಎಂದು ನೋಡಿ.';

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
  String get houseTitle => 'ನನ್ನ ಹೌಸ್';

  @override
  String get houseSubtitle => 'ನಿಮ್ಮ ಹೌಸ್ ಅಂಕಗಳು ಮತ್ತು ಲೀಡರ್‌ಬೋರ್ಡ್';

  @override
  String get houseNone => 'ನಿಮ್ಮನ್ನು ಇನ್ನೂ ಯಾವುದೇ ಹೌಸ್‌ಗೆ ಸೇರಿಸಿಲ್ಲ.';

  @override
  String get houseRank => 'ಶ್ರೇಣಿ';

  @override
  String get housePointsLabel => 'ಅಂಕಗಳು';

  @override
  String get houseMyPoints => 'ನನ್ನ ಅಂಕಗಳು';

  @override
  String get houseCaptain => 'ನಾಯಕ';

  @override
  String get houseRecent => 'ಇತ್ತೀಚಿನ ಅಂಕಗಳು';

  @override
  String get houseLeaderboard => 'ಲೀಡರ್‌ಬೋರ್ಡ್';

  @override
  String get houseMembers => 'ಸದಸ್ಯರು';

  @override
  String get houseCatGeneral => 'ಸಾಮಾನ್ಯ';

  @override
  String get houseCatAcademics => 'ಶೈಕ್ಷಣಿಕ';

  @override
  String get houseCatSports => 'ಕ್ರೀಡೆ';

  @override
  String get houseCatArts => 'ಕಲೆ';

  @override
  String get houseCatDiscipline => 'ಶಿಸ್ತು';

  @override
  String get houseCatService => 'ಸೇವೆ';

  @override
  String get peerTitle => 'ಸಹಪಾಠಿ ಪರಿಶೀಲನೆ';

  @override
  String get peerOpen => 'ಸಹಪಾಠಿಗಳ ಕೆಲಸವನ್ನು ಪರಿಶೀಲಿಸಿ';

  @override
  String get peerToReview => 'ಪರಿಶೀಲನೆಗೆ';

  @override
  String get peerMyFeedback => 'ನನ್ನ ಪ್ರತಿಕ್ರಿಯೆ';

  @override
  String get peerNone => 'ಪರಿಶೀಲಿಸಲು ನಿಮಗೆ ಇನ್ನೂ ಯಾವುದೇ ಕೆಲಸ ಕೊಟ್ಟಿಲ್ಲ.';

  @override
  String get peerAnonymous =>
      'ಹೆಸರುಗಳು ಮರೆಯಾಗಿವೆ: ಯಾರು ಬರೆದರು ಎಂದು ನಿಮಗೆ ಗೊತ್ತಿಲ್ಲ, ಯಾರು ಪರಿಶೀಲಿಸಿದರು ಎಂದು ಅವರಿಗೆ ಗೊತ್ತಿಲ್ಲ.';

  @override
  String get peerWork => 'ಕೆಲಸ';

  @override
  String get peerNoText => '(ಫೋಟೋ ಅಥವಾ ಫೈಲ್ ಮಾತ್ರ)';

  @override
  String get peerFiles => 'ಫೋಟೋಗಳು ಮತ್ತು ಫೈಲ್‌ಗಳು';

  @override
  String get peerClarity => 'ಸ್ಪಷ್ಟತೆ';

  @override
  String get peerAccuracy => 'ನಿಖರತೆ';

  @override
  String get peerEffort => 'ಪ್ರಯತ್ನ';

  @override
  String get peerComment => 'ನಿಮ್ಮ ಟಿಪ್ಪಣಿ';

  @override
  String get peerSave => 'ಪರಿಶೀಲನೆ ಉಳಿಸಿ';

  @override
  String get peerSaved => 'ಪರಿಶೀಲನೆ ಉಳಿಸಲಾಗಿದೆ.';

  @override
  String get peerNeedAll => 'ಪ್ರತಿಯೊಂದಕ್ಕೂ ಅಂಕ ನೀಡಿ ಮತ್ತು ಟಿಪ್ಪಣಿ ಬರೆಯಿರಿ.';

  @override
  String get peerAverage => 'ಸರಾಸರಿ ಅಂಕ (15 ರಲ್ಲಿ)';

  @override
  String get peerPending => 'ಇನ್ನೂ ಬರಬೇಕಾದ ಪರಿಶೀಲನೆಗಳು';

  @override
  String get peerNoFeedback =>
      'ಯಾವ ಸಹಪಾಠಿಯೂ ನಿಮ್ಮ ಕೆಲಸವನ್ನು ಇನ್ನೂ ಪರಿಶೀಲಿಸಿಲ್ಲ.';

  @override
  String get myLearningTitle => 'ನನ್ನ ಕಲಿಕೆ';

  @override
  String get myLearningSubtitle =>
      'ಅಭ್ಯಾಸ, ಕಾರ್ಯಪತ್ರಗಳು, ಹೆಚ್ಚುವರಿ ಸಹಾಯ ಮತ್ತು ಪರೀಕ್ಷಾ ಸಿದ್ಧತೆ';

  @override
  String get myLearningNothing =>
      'ಇಲ್ಲಿ ಇನ್ನೂ ಏನೂ ಇಲ್ಲ. ನಿಮ್ಮ ಶಿಕ್ಷಕರು ಕಾರ್ಯಪತ್ರ ಮತ್ತು ಅಭ್ಯಾಸ ಸೇರಿಸುತ್ತಾರೆ.';

  @override
  String get myLearningPractice => 'ಮುಂದೇನು ಮಾಡಬೇಕು';

  @override
  String get myLearningMastery => 'ನೀವು ಪ್ರತಿ ವಿಷಯವನ್ನು ಎಷ್ಟು ತಿಳಿದಿದ್ದೀರಿ';

  @override
  String get myLearningWorksheets => 'ಕಾರ್ಯಪತ್ರಗಳು ಮತ್ತು ಚಟುವಟಿಕೆಗಳು';

  @override
  String get myLearningHelp => 'ಶಿಕ್ಷಕರಿಂದ ಹೆಚ್ಚುವರಿ ಸಹಾಯ';

  @override
  String get myLearningReadiness => 'ಪ್ರವೇಶ ಪರೀಕ್ಷಾ ಸಿದ್ಧತೆ';

  @override
  String myLearningScore(Object score, Object max) {
    return '$max ರಲ್ಲಿ $score';
  }

  @override
  String get myLearningNotScored => 'ಇನ್ನೂ ಅಂಕ ಬಂದಿಲ್ಲ';

  @override
  String myLearningTarget(Object pct) {
    return 'ಗುರಿ $pct%';
  }

  @override
  String myLearningAverage(Object pct, int n) {
    return '$n ಪರೀಕ್ಷೆಗಳ ನಂತರ ಸರಾಸರಿ $pct%';
  }

  @override
  String myLearningWeak(Object subjects) {
    return 'ದುರ್ಬಲ: $subjects';
  }

  @override
  String get myLearningPromoted => 'ಮುಂದಿನ ತರಗತಿಗೆ ಬಡ್ತಿ';

  @override
  String get myLearningPromotedGrace => 'ಕೃಪಾಂಕದೊಂದಿಗೆ ಬಡ್ತಿ';

  @override
  String get myLearningCompartment => 'ಪೂರಕ ಪರೀಕ್ಷೆ ಬರೆಯಬೇಕು';

  @override
  String get myLearningDetained => 'ತರಗತಿ ಪುನರಾವರ್ತನೆ';

  @override
  String get myLearningOnTrack => 'ಸರಿಯಾದ ಹಾದಿಯಲ್ಲಿ';

  @override
  String get myLearningClose => 'ಗುರಿಯ ಹತ್ತಿರ';

  @override
  String get myLearningBehind => 'ಗುರಿಗಿಂತ ಹಿಂದೆ';

  @override
  String get myLearningNoTests => 'ಇನ್ನೂ ಮಾದರಿ ಪರೀಕ್ಷೆಗಳಿಲ್ಲ';

  @override
  String get myLearningRising => 'ಏರುತ್ತಿದೆ';

  @override
  String get myLearningSteady => 'ಸ್ಥಿರ';

  @override
  String get myLearningFalling => 'ಇಳಿಯುತ್ತಿದೆ';

  @override
  String get deviceTrustTitle => 'ಈ ಫೋನ್';

  @override
  String get deviceTrustNew =>
      'ಇನ್ನೂ ವಿಶ್ವಾಸಾರ್ಹವಲ್ಲ. ಈ ಫೋನ್‌ನಿಂದ ಸೈನ್-ಇನ್ ಹೊಸದೆಂದು ಗುರುತಿಸದಂತೆ ಇದನ್ನು ವಿಶ್ವಾಸಾರ್ಹ ಮಾಡಿ.';

  @override
  String get deviceTrustTrusted => 'ವಿಶ್ವಾಸಾರ್ಹ';

  @override
  String get deviceTrustButton => 'ಈ ಫೋನ್ ವಿಶ್ವಾಸಾರ್ಹ ಮಾಡಿ';

  @override
  String get forumTitle => 'ಚರ್ಚೆ';

  @override
  String get forumAsk => 'ಪ್ರಶ್ನೆ ಕೇಳಿ';

  @override
  String get forumTitleLabel => 'ಶೀರ್ಷಿಕೆ';

  @override
  String get forumBodyLabel => 'ನಿಮ್ಮ ಪ್ರಶ್ನೆ';

  @override
  String get forumPost => 'ಪೋಸ್ಟ್ ಮಾಡಿ';

  @override
  String get forumNone => 'ಇನ್ನೂ ಪ್ರಶ್ನೆಗಳಿಲ್ಲ. ಮೊದಲು ನೀವೇ ಕೇಳಿ.';

  @override
  String forumReplies(int n) {
    String _temp0 = intl.Intl.pluralLogic(
      n,
      locale: localeName,
      other: '$n ಉತ್ತರಗಳು',
      one: '1 ಉತ್ತರ',
      zero: 'ಉತ್ತರಗಳಿಲ್ಲ',
    );
    return '$_temp0';
  }

  @override
  String get forumLocked => 'ಈ ಚರ್ಚೆ ಲಾಕ್ ಆಗಿದೆ.';

  @override
  String get forumReplyHint => 'ಉತ್ತರ ಬರೆಯಿರಿ';

  @override
  String get pjTitle => 'ಯೋಜನೆಗಳು ಮತ್ತು ಸಂಶೋಧನೆ';

  @override
  String get pjSubtitle => 'ನನ್ನ ಯೋಜನೆಗಳು, ತಂಡ ಹುಡುಕಿ, ಪ್ರದರ್ಶನ, ಪೋರ್ಟ್‌ಫೋಲಿಯೋ';

  @override
  String get pjTabMine => 'ನನ್ನ ಯೋಜನೆಗಳು';

  @override
  String get pjTabFind => 'ತಂಡ ಹುಡುಕಿ';

  @override
  String get pjTabShowcase => 'ಪ್ರದರ್ಶನ';

  @override
  String get pjTabPortfolio => 'ಪೋರ್ಟ್‌ಫೋಲಿಯೋ';

  @override
  String get pjNoneMine =>
      'ನೀವು ಇನ್ನೂ ಯಾವುದೇ ಯೋಜನೆಯಲ್ಲಿ ಇಲ್ಲ. ಸೇರಲು ತಂಡ ಹುಡುಕಿ.';

  @override
  String get pjOnShowcase => 'ಪ್ರದರ್ಶನದಲ್ಲಿದೆ';

  @override
  String get pjRecruiting => 'ಸದಸ್ಯರು ಬೇಕಿದ್ದಾರೆ';

  @override
  String get pjKind_capstone => 'ಕ್ಯಾಪ್‌ಸ್ಟೋನ್';

  @override
  String get pjKind_research => 'ಸಂಶೋಧನೆ';

  @override
  String get pjKind_minor => 'ಸಣ್ಣ ಯೋಜನೆ';

  @override
  String get pjKind_major => 'ಪ್ರಮುಖ ಯೋಜನೆ';

  @override
  String get pjKind_internship => 'ಇಂಟರ್ನ್‌ಶಿಪ್';

  @override
  String get pjKind_project => 'ಯೋಜನೆ';

  @override
  String get pjStatus_active => 'ಸಕ್ರಿಯ';

  @override
  String get pjStatus_completed => 'ಪೂರ್ಣಗೊಂಡಿದೆ';

  @override
  String get pjStatus_on_hold => 'ತಡೆಹಿಡಿಯಲಾಗಿದೆ';

  @override
  String get pjStatus_proposed => 'ಪ್ರಸ್ತಾಪಿತ';

  @override
  String get thesisTitle => 'ನನ್ನ ಪ್ರಬಂಧ';

  @override
  String get thesisStage_synopsis => 'ಸಿನಾಪ್ಸಿಸ್';

  @override
  String get thesisStage_draft => 'ಕರಡು';

  @override
  String get thesisStage_submitted => 'ಸಲ್ಲಿಸಲಾಗಿದೆ';

  @override
  String get thesisStage_examination => 'ಮೌಲ್ಯಮಾಪನದಲ್ಲಿದೆ';

  @override
  String get thesisStage_viva => 'ವೈವಾ';

  @override
  String get thesisStage_awarded => 'ಪದವಿ ನೀಡಲಾಗಿದೆ';

  @override
  String thesisSubmittedOn(Object date) {
    return '$date ರಂದು ಸಲ್ಲಿಸಲಾಗಿದೆ';
  }

  @override
  String thesisNextViva(Object time, Object venue) {
    return 'ಮುಂದಿನ ವೈವಾ: $time, $venue';
  }

  @override
  String thesisSimilarity(int percent, int limit) {
    return 'ಹೋಲಿಕೆ $percent% (ಮಿತಿ $limit%)';
  }

  @override
  String get pjSkillSearch => 'ಕೌಶಲ್ಯದಿಂದ ಹುಡುಕಿ';

  @override
  String get pjNoneFind => 'ಈಗ ಯಾವ ಯೋಜನೆಗೂ ಸದಸ್ಯರು ಬೇಕಿಲ್ಲ.';

  @override
  String pjFit(int fit) {
    return '$fit% ಹೊಂದಾಣಿಕೆ';
  }

  @override
  String pjLookingFor(Object skills) {
    return 'ಬೇಕಾಗಿರುವುದು: $skills';
  }

  @override
  String pjOpenings(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಸ್ಥಾನಗಳು ಖಾಲಿ',
      one: '1 ಸ್ಥಾನ ಖಾಲಿ',
    );
    return '$_temp0';
  }

  @override
  String get pjAskToJoin => 'ಸೇರಲು ವಿನಂತಿಸಿ';

  @override
  String pjJoinTitle(Object title) {
    return '$title ಗೆ ಸೇರಿ';
  }

  @override
  String get pjJoinMessage => 'ಯೋಜನೆಯ ಮುಖ್ಯಸ್ಥರಿಗೆ ಚಿಕ್ಕ ಸಂದೇಶ';

  @override
  String get pjJoinSent => 'ನಿಮ್ಮ ವಿನಂತಿಯನ್ನು ಕಳುಹಿಸಲಾಗಿದೆ.';

  @override
  String get pjNoneShowcase => 'ಪ್ರದರ್ಶನದಲ್ಲಿ ಇನ್ನೂ ಯಾವುದೇ ಯೋಜನೆ ಇಲ್ಲ.';

  @override
  String pjReviewAverage(int average) {
    return 'ವಿಮರ್ಶೆಗಳು: $average%';
  }

  @override
  String get pjReview => 'ವಿಮರ್ಶೆ ಮಾಡಿ';

  @override
  String pjReviewTitle(Object title) {
    return 'ವಿಮರ್ಶೆ: $title';
  }

  @override
  String get pjReviewComment => 'ಟಿಪ್ಪಣಿ (ಐಚ್ಛಿಕ)';

  @override
  String get pjReviewThanks => 'ನಿಮ್ಮ ವಿಮರ್ಶೆಗೆ ಧನ್ಯವಾದ.';

  @override
  String get pjCriterion_idea => 'ಕಲ್ಪನೆ';

  @override
  String get pjCriterion_execution => 'ಅನುಷ್ಠಾನ';

  @override
  String get pjCriterion_presentation => 'ಪ್ರಸ್ತುತಿ';

  @override
  String get pjCriterion_impact => 'ಪರಿಣಾಮ';

  @override
  String get pjAddPortfolio => 'ಪೋರ್ಟ್‌ಫೋಲಿಯೋಗೆ ಸೇರಿಸಿ';

  @override
  String get pjPortfolioNote =>
      'ಪ್ರಕಟಿಸಿದ ಅಂಶಗಳನ್ನು ನಿಮ್ಮ ಸಂಸ್ಥೆಯ ಎಲ್ಲರೂ ನೋಡಬಹುದು.';

  @override
  String get pjNonePortfolio => 'ನಿಮ್ಮ ಪೋರ್ಟ್‌ಫೋಲಿಯೋದಲ್ಲಿ ಇನ್ನೂ ಏನೂ ಇಲ್ಲ.';

  @override
  String get pjDelete => 'ಅಳಿಸಿ';

  @override
  String get pjPublished => 'ಪ್ರಕಟಿತ';

  @override
  String get pjPublishedOn => 'ಇತರರಿಗೆ ಕಾಣುತ್ತದೆ';

  @override
  String get pjPublishedOff => 'ನಿಮಗೆ ಮಾತ್ರ ಕಾಣುತ್ತದೆ';

  @override
  String get pjPortfolio_project => 'ಯೋಜನೆ';

  @override
  String get pjPortfolio_research => 'ಸಂಶೋಧನೆ';

  @override
  String get pjPortfolio_certificate => 'ಪ್ರಮಾಣಪತ್ರ';

  @override
  String get pjPortfolio_work => 'ಕೆಲಸ';

  @override
  String get pjFieldTitle => 'ಶೀರ್ಷಿಕೆ';

  @override
  String get pjFieldSummary => 'ಸಾರಾಂಶ';

  @override
  String get pjFieldLink => 'ಲಿಂಕ್ (https://…)';

  @override
  String get pjFieldKind => 'ಪ್ರಕಾರ';

  @override
  String get pjNeedTitle => 'ಶೀರ್ಷಿಕೆ ನೀಡಿ.';

  @override
  String get pjNeedUrl => 'https:// ನಿಂದ ಆರಂಭವಾಗುವ ಪೂರ್ಣ ಲಿಂಕ್ ನಮೂದಿಸಿ';

  @override
  String get pjNeedTitleAndUrl => 'ಲಿಂಕ್‌ಗೆ ಶೀರ್ಷಿಕೆ ಮತ್ತು ಪೂರ್ಣ ವಿಳಾಸ ಬೇಕು.';

  @override
  String get pjWorkspace => 'ಯೋಜನೆಯ ಕಾರ್ಯಸ್ಥಳ';

  @override
  String get pjMembers => 'ತಂಡ';

  @override
  String pjMentor(Object name) {
    return 'ಮುಖ್ಯಸ್ಥರು: $name';
  }

  @override
  String get pjMilestones => 'ಮೈಲಿಗಲ್ಲುಗಳು';

  @override
  String get pjNoMilestones => 'ಯಾವುದೇ ಮೈಲಿಗಲ್ಲು ನಿಗದಿಯಾಗಿಲ್ಲ.';

  @override
  String pjDoneOn(Object date) {
    return '$date ರಂದು ಪೂರ್ಣಗೊಂಡಿದೆ';
  }

  @override
  String pjDueOn(Object date) {
    return 'ಗಡುವು $date';
  }

  @override
  String get pjFiles => 'ಫೈಲ್‌ಗಳು ಮತ್ತು ಲಿಂಕ್‌ಗಳು';

  @override
  String get pjAddLink => 'ಲಿಂಕ್ ಸೇರಿಸಿ';

  @override
  String get pjNoFiles => 'ಇನ್ನೂ ಯಾವುದೇ ಫೈಲ್ ಇಲ್ಲ.';

  @override
  String get pjCopyLink => 'ಲಿಂಕ್ ನಕಲಿಸಿ';

  @override
  String get pjLinkCopied => 'ಲಿಂಕ್ ನಕಲಿಸಲಾಗಿದೆ';

  @override
  String get pjLinkAdded => 'ಲಿಂಕ್ ಸೇರಿಸಲಾಗಿದೆ';

  @override
  String get pjViva => 'ವೈವಾ';

  @override
  String pjPanel(Object names) {
    return 'ಸಮಿತಿ: $names';
  }

  @override
  String get pjVivaCancelled => 'ರದ್ದಾಗಿದೆ';

  @override
  String get pjViva_pass => 'ಉತ್ತೀರ್ಣ';

  @override
  String get pjViva_revise => 'ತಿದ್ದಿ ಮರು ಸಲ್ಲಿಸಿ';

  @override
  String get pjViva_fail => 'ಅನುತ್ತೀರ್ಣ';

  @override
  String get pjReviews => 'ವಿಮರ್ಶೆಗಳು';

  @override
  String get pjNoReviews => 'ಇನ್ನೂ ಯಾವುದೇ ವಿಮರ್ಶೆ ಇಲ್ಲ.';

  @override
  String pjReviewsSummary(int count, int average) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ವಿಮರ್ಶೆಗಳು',
      one: '1 ವಿಮರ್ಶೆ',
    );
    return '$_temp0, ಸರಾಸರಿ $average%';
  }

  @override
  String get pjDiscussion => 'ಚರ್ಚೆ';

  @override
  String get pjNoComments => 'ಇನ್ನೂ ಸಂದೇಶಗಳಿಲ್ಲ. ಚರ್ಚೆ ಆರಂಭಿಸಿ.';

  @override
  String get pjWriteComment => 'ಸಂದೇಶ ಬರೆಯಿರಿ';

  @override
  String get prepTitle => 'ವೃತ್ತಿ ಸಿದ್ಧತೆ';

  @override
  String get prepSubtitle => 'ರೆಸ್ಯೂಮೆ, ಪರೀಕ್ಷೆಗಳು, ಮಾಕ್ ಸಂದರ್ಶನ, ಸಹಾಯಕ';

  @override
  String get prepResume => 'ರೆಸ್ಯೂಮೆ';

  @override
  String get prepResumeSub => 'ಪ್ಲೇಸ್‌ಮೆಂಟ್ ತಂಡ ಓದಬಹುದಾದ ರೆಸ್ಯೂಮೆ ಸಿದ್ಧಪಡಿಸಿ';

  @override
  String get prepTests => 'ಯೋಗ್ಯತಾ ಪರೀಕ್ಷೆಗಳು';

  @override
  String get prepTestsSub => 'ಸಮಯದ ಅಭ್ಯಾಸ, ವಿಷಯವಾರು ಅಂಕಗಳೊಂದಿಗೆ';

  @override
  String get prepMockHr => 'HR ಮಾಕ್ ಸಂದರ್ಶನ';

  @override
  String get prepMockHrSub => 'ಸಾಮಾನ್ಯ HR ಪ್ರಶ್ನೆಗಳು, ಪ್ರತಿಕ್ರಿಯೆಯೊಂದಿಗೆ';

  @override
  String get prepMockTechnical => 'ತಾಂತ್ರಿಕ ಮಾಕ್ ಸಂದರ್ಶನ';

  @override
  String get prepMockTechnicalSub => 'ಪಾತ್ರಕ್ಕೆ ತಕ್ಕ ತಾಂತ್ರಿಕ ಪ್ರಶ್ನೆಗಳು';

  @override
  String get prepCommunication => 'ಸಂವಹನ ಅಭ್ಯಾಸ';

  @override
  String get prepCommunicationSub => 'ಸ್ಪಷ್ಟವಾಗಿ, ಕ್ರಮಬದ್ಧವಾಗಿ ಮಾತನಾಡುವ ಅಭ್ಯಾಸ';

  @override
  String get prepRecs => 'ವೃತ್ತಿ ಶಿಫಾರಸುಗಳು';

  @override
  String get prepRecsSub =>
      'ನಿಮ್ಮ ಕೌಶಲ್ಯಕ್ಕೆ ಹೊಂದುವ ದಾರಿಗಳು ಮತ್ತು ತುಂಬಬೇಕಾದ ಕೊರತೆಗಳು';

  @override
  String get prepAssistant => 'ವೃತ್ತಿ ಸಹಾಯಕ';

  @override
  String get prepAssistantSub => 'ನಿಮ್ಮ ವೃತ್ತಿಯ ಬಗ್ಗೆ KINETIX AI ಯನ್ನು ಕೇಳಿ';

  @override
  String get rsHeadline => 'ಶೀರ್ಷಿಕೆ ವಾಕ್ಯ';

  @override
  String get rsSummary => 'ಸಾರಾಂಶ';

  @override
  String get rsSkills => 'ಕೌಶಲ್ಯಗಳು';

  @override
  String get rsInterests => 'ಆಸಕ್ತಿಗಳು';

  @override
  String get rsCommaHelp => 'ಕಾಮಾದಿಂದ ಬೇರ್ಪಡಿಸಿ';

  @override
  String get rsEducation => 'ಶಿಕ್ಷಣ';

  @override
  String get rsExperience => 'ಅನುಭವ';

  @override
  String get rsProjects => 'ಯೋಜನೆಗಳು';

  @override
  String get rsLinks => 'ಲಿಂಕ್‌ಗಳು';

  @override
  String get rsAdd => 'ಸೇರಿಸಿ';

  @override
  String get rsInstitution => 'ಸಂಸ್ಥೆ';

  @override
  String get rsDegree => 'ಪದವಿ ಅಥವಾ ಕೋರ್ಸ್';

  @override
  String get rsYears => 'ವರ್ಷಗಳು';

  @override
  String get rsScore => 'ಅಂಕ ಅಥವಾ ಗ್ರೇಡ್';

  @override
  String get rsOrg => 'ಸಂಸ್ಥೆ';

  @override
  String get rsRole => 'ಪಾತ್ರ';

  @override
  String get rsDetail => 'ವಿವರಗಳು';

  @override
  String get rsLabel => 'ಹೆಸರು';

  @override
  String get rsVisible => 'ಪ್ಲೇಸ್‌ಮೆಂಟ್ ತಂಡಕ್ಕೆ ನನ್ನ ರೆಸ್ಯೂಮೆ ತೋರಿಸಿ';

  @override
  String get rsVisibleHelp => 'ಇದು ಆನ್ ಆಗಿದ್ದರೆ ಮಾತ್ರ ನೇಮಕಾತಿದಾರರು ನೋಡಬಹುದು.';

  @override
  String get rsSaved => 'ರೆಸ್ಯೂಮೆ ಉಳಿಸಲಾಗಿದೆ';

  @override
  String get rsEntryIncomplete =>
      'ಅಗತ್ಯ ಕ್ಷೇತ್ರಗಳನ್ನು ತುಂಬಿ (ಲಿಂಕ್ https:// ನಿಂದ ಆರಂಭವಾಗಬೇಕು).';

  @override
  String get testsNone => 'ಈಗ ಯಾವುದೇ ಯೋಗ್ಯತಾ ಪರೀಕ್ಷೆ ತೆರೆದಿಲ್ಲ.';

  @override
  String get testCat_quant => 'ಪರಿಮಾಣಾತ್ಮಕ';

  @override
  String get testCat_logical => 'ತಾರ್ಕಿಕ';

  @override
  String get testCat_verbal => 'ಭಾಷಾ';

  @override
  String get testCat_technical => 'ತಾಂತ್ರಿಕ';

  @override
  String get testCat_mixed => 'ಮಿಶ್ರ';

  @override
  String testQuestions(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಪ್ರಶ್ನೆಗಳು',
      one: '1 ಪ್ರಶ್ನೆ',
    );
    return '$_temp0';
  }

  @override
  String testMinutes(int count) {
    return '$count ನಿಮಿಷ';
  }

  @override
  String get testNoAttempts => 'ಇನ್ನೂ ಪ್ರಯತ್ನಿಸಿಲ್ಲ';

  @override
  String testAttempts(int attempts, int best) {
    String _temp0 = intl.Intl.pluralLogic(
      attempts,
      locale: localeName,
      other: '$attempts ಪ್ರಯತ್ನಗಳು',
      one: '1 ಪ್ರಯತ್ನ',
    );
    return '$_temp0, ಉತ್ತಮ $best%';
  }

  @override
  String get testPassed => 'ಉತ್ತೀರ್ಣ';

  @override
  String testNotPassed(int pass) {
    return 'ಇನ್ನೂ ಉತ್ತೀರ್ಣರಾಗಿಲ್ಲ (ಪಾಸ್ ಅಂಕ $pass%)';
  }

  @override
  String get testTake => 'ಪರೀಕ್ಷೆ ಬರೆಯಿರಿ';

  @override
  String get testRetake => 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ';

  @override
  String testIntro(int questions, int minutes, int pass) {
    return '$minutes ನಿಮಿಷದಲ್ಲಿ $questions ಪ್ರಶ್ನೆಗಳು. ಉತ್ತೀರ್ಣರಾಗಲು $pass% ಬೇಕು. ಗರಿಷ್ಠ 3 ಪ್ರಯತ್ನಗಳು ಸಿಗುತ್ತವೆ. ಟೈಮರ್ ಈಗ ಆರಂಭವಾಗುತ್ತದೆ; ಹೊರಗೆ ಹೋದರೂ ನಡೆಯುತ್ತಲೇ ಇರುತ್ತದೆ.';
  }

  @override
  String get testStart => 'ಆರಂಭಿಸಿ';

  @override
  String testAnswered(int done, int total) {
    return '$total ರಲ್ಲಿ $done ಉತ್ತರಿಸಲಾಗಿದೆ';
  }

  @override
  String get testSubmit => 'ಉತ್ತರಗಳನ್ನು ಸಲ್ಲಿಸಿ';

  @override
  String get testLeave =>
      'ಪರೀಕ್ಷೆ ಬಿಡುವಿರಾ? ಟೈಮರ್ ನಡೆಯುತ್ತಲೇ ಇರುತ್ತದೆ ಮತ್ತು ನಿಮ್ಮ ಉತ್ತರಗಳನ್ನು ಕಳುಹಿಸಲಾಗುವುದಿಲ್ಲ.';

  @override
  String get testStay => 'ಇಲ್ಲೇ ಇರಿ';

  @override
  String get testLeaveAnyway => 'ಬಿಡಿ';

  @override
  String testScore(int score, int total) {
    return '$total ರಲ್ಲಿ $score ಸರಿ';
  }

  @override
  String get testByTopic => 'ವಿಷಯವಾರು ಅಂಕಗಳು';

  @override
  String get testBack => 'ಪರೀಕ್ಷೆಗಳ ಪಟ್ಟಿಗೆ ಹಿಂತಿರುಗಿ';

  @override
  String get mockIntro =>
      'ಪ್ರತಿ ಪ್ರಶ್ನೆಗೆ ಸಂದರ್ಶನದಲ್ಲಿ ಹೇಳುವಂತೆ ನಿಮ್ಮ ಮಾತುಗಳಲ್ಲಿ ಉತ್ತರಿಸಿ. ಪ್ರತಿ ಉತ್ತರಕ್ಕೆ ಅಂಕ ಮತ್ತು ಸಲಹೆಗಳು ಸಿಗುತ್ತವೆ.';

  @override
  String get mockIntroCommunication =>
      'ಪ್ರತಿ ಪ್ರಶ್ನೆಗೆ ಕೆಲವು ಸ್ಪಷ್ಟ ವಾಕ್ಯಗಳಲ್ಲಿ ಉತ್ತರಿಸಿ. ಕ್ರಮ ಮತ್ತು ಸ್ಪಷ್ಟತೆಯ ಮೇಲೆ ಅಂಕ ಮತ್ತು ಸಲಹೆಗಳು ಸಿಗುತ್ತವೆ.';

  @override
  String get mockRole => 'ನೀವು ತಯಾರಾಗುತ್ತಿರುವ ಪಾತ್ರ';

  @override
  String get mockRoleHint => 'ಉದಾಹರಣೆಗೆ, ಡೇಟಾ ವಿಶ್ಲೇಷಕ';

  @override
  String get mockCount => 'ಪ್ರಶ್ನೆಗಳ ಸಂಖ್ಯೆ';

  @override
  String get mockStart => 'ಅಭ್ಯಾಸ ಆರಂಭಿಸಿ';

  @override
  String get mockPast => 'ಹಿಂದಿನ ಅಭ್ಯಾಸ';

  @override
  String get mockAnswerHint => 'ನಿಮ್ಮ ಉತ್ತರ ಬರೆಯಿರಿ';

  @override
  String get mockAnswerAll => 'ಮೊದಲು ಎಲ್ಲ ಪ್ರಶ್ನೆಗಳಿಗೂ ಉತ್ತರಿಸಿ.';

  @override
  String get mockSubmit => 'ನನ್ನ ಅಂಕ ನೋಡಿ';

  @override
  String mockScore(Object score) {
    return 'ಅಂಕ: 10 ರಲ್ಲಿ $score';
  }

  @override
  String mockQuestionScore(Object score) {
    return '10 ರಲ್ಲಿ $score';
  }

  @override
  String get mockOverall => 'ಒಟ್ಟಾರೆ';

  @override
  String get mockAgain => 'ಮತ್ತೆ ಅಭ್ಯಾಸ ಮಾಡಿ';

  @override
  String recSkills(Object skills) {
    return 'ನಿಮ್ಮ ಕೌಶಲ್ಯಗಳು: $skills';
  }

  @override
  String recInterests(Object interests) {
    return 'ನಿಮ್ಮ ಆಸಕ್ತಿಗಳು: $interests';
  }

  @override
  String get recNone =>
      'ಇನ್ನೂ ಯಾವುದೇ ವೃತ್ತಿ ದಾರಿ ಇಲ್ಲ. ರೆಸ್ಯೂಮೆಗೆ ಕೌಶಲ್ಯ ಮತ್ತು ಆಸಕ್ತಿಗಳನ್ನು ಸೇರಿಸಿ, ನಂತರ ಮತ್ತೆ ನೋಡಿ.';

  @override
  String recFit(int fit) {
    return '$fit% ಹೊಂದಾಣಿಕೆ';
  }

  @override
  String recMatched(Object skills) {
    return 'ನಿಮ್ಮಲ್ಲಿದೆ: $skills';
  }

  @override
  String recGaps(Object skills) {
    return 'ಕೌಶಲ್ಯದ ಕೊರತೆ: $skills';
  }

  @override
  String recRoles(Object roles) {
    return 'ಪಾತ್ರಗಳು: $roles';
  }

  @override
  String get assistantIntro => 'ವೃತ್ತಿ, ರೆಸ್ಯೂಮೆ ಅಥವಾ ಸಂದರ್ಶನಗಳ ಬಗ್ಗೆ ಕೇಳಿ.';

  @override
  String get assistantTry1 => 'ನನಗೆ ಯಾವ ವೃತ್ತಿ ಸೂಕ್ತ?';

  @override
  String get assistantTry2 => 'ನನ್ನ ರೆಸ್ಯೂಮೆಯನ್ನು ಹೇಗೆ ಉತ್ತಮಗೊಳಿಸಲಿ?';

  @override
  String get assistantHint => 'ಪ್ರಶ್ನೆ ಕೇಳಿ';

  @override
  String get assistantOffline => 'ಆಫ್‌ಲೈನ್ ಮಾರ್ಗದರ್ಶನ';

  @override
  String get slDiaryTitle => 'ತರಗತಿ ಡೈರಿ';

  @override
  String get slDiaryEmpty => 'ಇನ್ನೂ ಡೈರಿ ನಮೂದುಗಳಿಲ್ಲ.';

  @override
  String slDiaryBy(Object name) {
    return '$name ಅವರಿಂದ';
  }

  @override
  String get slDiaryClasswork => 'ತರಗತಿ ಕೆಲಸ';

  @override
  String get slDiaryHomework => 'ಹೋಂವರ್ಕ್';

  @override
  String get slDiaryNotice => 'ಸೂಚನೆ';

  @override
  String get slActivitiesTitle => 'ನನ್ನ ಚಟುವಟಿಕೆಗಳು';

  @override
  String get slActivitiesEmpty => 'ಇನ್ನೂ ಯಾವುದೇ ಚಟುವಟಿಕೆ ದಾಖಲಾಗಿಲ್ಲ.';

  @override
  String slHousePoints(int points) {
    return '$points ಹೌಸ್ ಅಂಕಗಳು';
  }

  @override
  String get slCaptain => 'ಹೌಸ್ ಕ್ಯಾಪ್ಟನ್';

  @override
  String get slClubs => 'ಕ್ಲಬ್‌ಗಳು';

  @override
  String get slMember => 'ಸದಸ್ಯ';

  @override
  String slClubStats(int points, int count) {
    return '$points ಅಂಕಗಳು, $count ಚಟುವಟಿಕೆಗಳು';
  }

  @override
  String get slEvents => 'ಭಾಗವಹಿಸಿದ ಕಾರ್ಯಕ್ರಮಗಳು';

  @override
  String slGrades(Object term) {
    return 'ಸಹ-ಪಠ್ಯ ಗ್ರೇಡ್‌ಗಳು, $term';
  }

  @override
  String get slCoCurricular => 'ಸಹ-ಪಠ್ಯ ಚಟುವಟಿಕೆಗಳು';

  @override
  String get slAchievements => 'ಸಾಧನೆಗಳು';

  @override
  String get slRecognitions => 'ಹೌಸ್ ಮೆಚ್ಚುಗೆ';

  @override
  String get slReportCards => 'ವರದಿ ಪತ್ರಗಳು';

  @override
  String get slReportCard => 'ವರದಿ ಪತ್ರ';

  @override
  String get slReportCardsNone => 'ಇನ್ನೂ ಯಾವುದೇ ವರದಿ ಪತ್ರ ಪ್ರಕಟವಾಗಿಲ್ಲ.';

  @override
  String get slPromoted => 'ಮುಂದಿನ ತರಗತಿಗೆ ಬಡ್ತಿ';

  @override
  String get slPromotedGrace => 'ಗ್ರೇಸ್ ಅಂಕಗಳೊಂದಿಗೆ ಬಡ್ತಿ';

  @override
  String get slDetained => 'ಬಡ್ತಿ ಇಲ್ಲ';

  @override
  String get slPromotionPending => 'ಬಡ್ತಿಯ ನಿರ್ಧಾರ ಬಾಕಿ ಇದೆ';

  @override
  String slPromotedTo(Object className) {
    return 'ಮುಂದಿನ ತರಗತಿ: $className';
  }

  @override
  String slAttendanceDays(int present, int total) {
    return '$total ದಿನಗಳಲ್ಲಿ $present ದಿನ';
  }

  @override
  String slBehaviourGrade(Object grade) {
    return 'ವರ್ತನೆ ಗ್ರೇಡ್: $grade';
  }

  @override
  String get slReportCardPdf => 'PDF ಆಗಿ ತೆರೆಯಿರಿ';

  @override
  String get alTitle => 'ಹಳೆಯ ವಿದ್ಯಾರ್ಥಿಗಳು';

  @override
  String get alSubtitle =>
      'ನಿಮ್ಮ ಹಳೆಯ ವಿದ್ಯಾರ್ಥಿ ಪ್ರೊಫೈಲ್, ಕಥೆಗಳು ಮತ್ತು ದೇಣಿಗೆ';

  @override
  String get alTabProfile => 'ಪ್ರೊಫೈಲ್';

  @override
  String get alTabStories => 'ನನ್ನ ಕಥೆಗಳು';

  @override
  String get alTabGive => 'ಕೊಡುಗೆ ನೀಡಿ';

  @override
  String get alTabPublished => 'ಯಶಸ್ಸಿನ ಕಥೆಗಳು';

  @override
  String alGraduated(Object program, int year) {
    return '$program, $year ಬ್ಯಾಚ್';
  }

  @override
  String get alPhone => 'ಫೋನ್';

  @override
  String get alEmployer => 'ಉದ್ಯೋಗದಾತ';

  @override
  String get alDesignation => 'ಹುದ್ದೆ';

  @override
  String get alCity => 'ನಗರ';

  @override
  String get alBio => 'ನನ್ನ ಬಗ್ಗೆ';

  @override
  String get alDirectory => 'ಹಳೆಯ ವಿದ್ಯಾರ್ಥಿ ಡೈರೆಕ್ಟರಿಯಲ್ಲಿ ನನ್ನನ್ನು ತೋರಿಸಿ';

  @override
  String get alDirectoryHelp =>
      'ಇದು ಆನ್ ಆಗಿದ್ದರೆ ಮಾತ್ರ ವಿದ್ಯಾರ್ಥಿಗಳು ನಿಮ್ಮನ್ನು ಹುಡುಕಬಹುದು.';

  @override
  String get alMentor => 'ನಾನು ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ಮಾರ್ಗದರ್ಶನ ನೀಡಬಲ್ಲೆ';

  @override
  String get alSaved => 'ಪ್ರೊಫೈಲ್ ಉಳಿಸಲಾಗಿದೆ';

  @override
  String get storyIntro =>
      'ನಿಮ್ಮ ಪ್ರಯಾಣದ ಬಗ್ಗೆ ಬರೆಯಿರಿ. ಪ್ರಕಟಿಸುವ ಮೊದಲು ಹಳೆಯ ವಿದ್ಯಾರ್ಥಿ ಕಚೇರಿ ಓದುತ್ತದೆ.';

  @override
  String get storyNone => 'ನೀವು ಇನ್ನೂ ಯಾವುದೇ ಕಥೆ ಬರೆದಿಲ್ಲ.';

  @override
  String get storyWrite => 'ಕಥೆ ಬರೆಯಿರಿ';

  @override
  String get storyEdit => 'ಸಂಪಾದಿಸಿ';

  @override
  String get storyBody => 'ನಿಮ್ಮ ಕಥೆ';

  @override
  String get storySaveDraft => 'ಕರಡು ಉಳಿಸಿ';

  @override
  String get storySaved => 'ಕಥೆ ಉಳಿಸಲಾಗಿದೆ';

  @override
  String get storySubmit => 'ಪರಿಶೀಲನೆಗೆ ಕಳುಹಿಸಿ';

  @override
  String get storySubmitted => 'ಪರಿಶೀಲನೆಗೆ ಕಳುಹಿಸಲಾಗಿದೆ';

  @override
  String get storyUnderReview =>
      'ಹಳೆಯ ವಿದ್ಯಾರ್ಥಿ ಕಚೇರಿ ಇದನ್ನು ಪರಿಶೀಲಿಸುತ್ತಿದೆ.';

  @override
  String storyReviewNote(Object note) {
    return 'ಹಳೆಯ ವಿದ್ಯಾರ್ಥಿ ಕಚೇರಿಯ ಟಿಪ್ಪಣಿ: $note';
  }

  @override
  String get storyNeedTitle => 'ನಿಮ್ಮ ಕಥೆಗೆ ಶೀರ್ಷಿಕೆ ನೀಡಿ.';

  @override
  String get storyNeedBody => 'ಕನಿಷ್ಠ 40 ಅಕ್ಷರಗಳನ್ನು ಬರೆಯಿರಿ.';

  @override
  String get storyStatus_draft => 'ಕರಡು';

  @override
  String get storyStatus_submitted => 'ಪರಿಶೀಲನೆಯಲ್ಲಿದೆ';

  @override
  String get storyStatus_published => 'ಪ್ರಕಟಿತ';

  @override
  String get storyStatus_rejected => 'ಬದಲಾವಣೆ ಬೇಕು';

  @override
  String get storiesNone => 'ಇನ್ನೂ ಯಾವುದೇ ಯಶಸ್ಸಿನ ಕಥೆ ಪ್ರಕಟವಾಗಿಲ್ಲ.';

  @override
  String giveTotal(Object amount) {
    return 'ನೀವು ಇದುವರೆಗೆ $amount ನೀಡಿದ್ದೀರಿ. ಧನ್ಯವಾದ.';
  }

  @override
  String get giveCampaigns => 'ಅಭಿಯಾನಗಳು';

  @override
  String get giveNoCampaigns => 'ಈಗ ಯಾವುದೇ ಅಭಿಯಾನ ತೆರೆದಿಲ್ಲ.';

  @override
  String giveGoal(Object amount) {
    return 'ಗುರಿ $amount';
  }

  @override
  String giveEnds(Object date) {
    return '$date ರಂದು ಮುಕ್ತಾಯ';
  }

  @override
  String get givePledge => 'ವಾಗ್ದಾನ ಮಾಡಿ';

  @override
  String giveTitle(Object name) {
    return '$name ಗೆ ವಾಗ್ದಾನ';
  }

  @override
  String get giveAmount => 'ಮೊತ್ತ';

  @override
  String get giveNote => 'ಟಿಪ್ಪಣಿ (ಐಚ್ಛಿಕ)';

  @override
  String get giveHelp => 'ಹಣ ಬಂದಾಗ ಲೆಕ್ಕಪತ್ರ ಕಚೇರಿ ಅದನ್ನು ದಾಖಲಿಸುತ್ತದೆ.';

  @override
  String get giveNeedAmount => 'ಮೊತ್ತವನ್ನು ರೂಪಾಯಿಗಳಲ್ಲಿ ನಮೂದಿಸಿ.';

  @override
  String get giveThanks => 'ನಿಮ್ಮ ವಾಗ್ದಾನಕ್ಕೆ ಧನ್ಯವಾದ.';

  @override
  String get givePledges => 'ನನ್ನ ವಾಗ್ದಾನಗಳು';

  @override
  String get pledgeStatus_open => 'ಬಾಕಿ';

  @override
  String get pledgeStatus_fulfilled => 'ಸ್ವೀಕರಿಸಲಾಗಿದೆ';

  @override
  String get pledgeStatus_cancelled => 'ರದ್ದಾಗಿದೆ';

  @override
  String get giveDonations => 'ನನ್ನ ದೇಣಿಗೆಗಳು';

  @override
  String get giveReceipt => 'ರಸೀದಿ (PDF)';

  @override
  String get volTitle => 'ಸ್ವಯಂಸೇವೆ';

  @override
  String get volNone => 'ಸ್ವಯಂಸೇವೆಯ ಯಾವುದೇ ಅವಕಾಶಗಳು ತೆರೆದಿಲ್ಲ.';

  @override
  String volPlaces(int taken, int slots) {
    return '$slots ಸ್ಥಾನಗಳಲ್ಲಿ $taken ತುಂಬಿವೆ';
  }

  @override
  String get volSignUp => 'ಹೆಸರು ನೋಂದಾಯಿಸಿ';

  @override
  String get volWithdraw => 'ಹೆಸರು ಹಿಂಪಡೆಯಿರಿ';

  @override
  String get volFull => 'ತುಂಬಿದೆ';

  @override
  String get volThanks => 'ಸ್ವಯಂಸೇವೆಗೆ ಧನ್ಯವಾದ.';

  @override
  String get tutorOpen => 'ನಿಮ್ಮ ಬೋಧಕರೊಂದಿಗೆ ಮಾತನಾಡಿ';

  @override
  String get tutorTitle => 'ನಿಮ್ಮ ಬೋಧಕ';

  @override
  String get tutorNew => 'ಹೊಸ ಸಂಭಾಷಣೆ';

  @override
  String get tutorEmpty =>
      'ನಿಮಗೆ ಅರ್ಥವಾಗದ ಯಾವುದನ್ನೇ ಆದರೂ ಕೇಳಿ. ನಿಮ್ಮ ಬೋಧಕ ಸಂಭಾಷಣೆಯನ್ನು ನೆನಪಿಡುತ್ತಾರೆ ಮತ್ತು ನಿಮಗೆ ಎಲ್ಲಿ ಹೆಚ್ಚು ಸಹಾಯ ಬೇಕೆಂದು ತಿಳಿದಿದ್ದಾರೆ.';

  @override
  String get tutorHint => 'ನಿಮ್ಮ ಪ್ರಶ್ನೆ ಟೈಪ್ ಮಾಡಿ';

  @override
  String get tutorSend => 'ಕಳುಹಿಸಿ';

  @override
  String get tutorNext => 'ಮುಂದೆ ಅಭ್ಯಾಸ ಮಾಡಿ';

  @override
  String get tutorPreview =>
      'ಇದು ಮಾದರಿ ಉತ್ತರ: ಇನ್ನೂ ಯಾವ AI ಸರ್ವರ್ ಸಂಪರ್ಕಗೊಂಡಿಲ್ಲ.';

  @override
  String get mealRateTitle => 'ಊಟಕ್ಕೆ ರೇಟಿಂಗ್ ನೀಡಿ';

  @override
  String get mealRateSub => 'ಇಂದಿನ ಊಟ ಹೇಗಿತ್ತು ಎಂದು ಕ್ಯಾಂಟೀನ್‌ಗೆ ತಿಳಿಸಿ';

  @override
  String get mealBreakfast => 'ಬೆಳಗಿನ ತಿಂಡಿ';

  @override
  String get mealLunch => 'ಮಧ್ಯಾಹ್ನದ ಊಟ';

  @override
  String get mealSnacks => 'ತಿಂಡಿಗಳು';

  @override
  String get mealDinner => 'ರಾತ್ರಿಯ ಊಟ';

  @override
  String get mealRateComment => 'ಇನ್ನೇನಾದರೂ ಹೇಳಬೇಕೇ? (ಐಚ್ಛಿಕ)';

  @override
  String get mealRateSend => 'ರೇಟಿಂಗ್ ಕಳುಹಿಸಿ';

  @override
  String get mealRateThanks => 'ಧನ್ಯವಾದ. ನಿಮ್ಮ ರೇಟಿಂಗ್ ಕಳುಹಿಸಲಾಗಿದೆ.';

  @override
  String get mealRatePick => 'ಮೊದಲು ನಕ್ಷತ್ರ ರೇಟಿಂಗ್ ಆರಿಸಿ.';

  @override
  String get repairTitle => 'ದುರಸ್ತಿ ವಿನಂತಿಗಳು';

  @override
  String get repairSub => 'ಪ್ರತಿ ದುರಸ್ತಿ ಯಾವ ಹಂತದಲ್ಲಿದೆ ನೋಡಿ';

  @override
  String get repairEmpty => 'ಯಾವುದೇ ದುರಸ್ತಿ ವಿನಂತಿಗಳಿಲ್ಲ.';

  @override
  String get repairWaiting => 'ಕಾಯುತ್ತಿದೆ';

  @override
  String get repairAssigned => 'ನಿಯೋಜಿಸಲಾಗಿದೆ';

  @override
  String get repairInProgress => 'ಸರಿಪಡಿಸಲಾಗುತ್ತಿದೆ';

  @override
  String get repairDone => 'ಸರಿಪಡಿಸಲಾಗಿದೆ';

  @override
  String get repairClosed => 'ಪರಿಶೀಲಿಸಿ ಮುಚ್ಚಲಾಗಿದೆ';

  @override
  String repairDueOn(Object date) {
    return '$date ರೊಳಗೆ';
  }

  @override
  String repairFixedOn(Object date) {
    return '$date ರಂದು ಸರಿಪಡಿಸಲಾಗಿದೆ';
  }

  @override
  String get instalmentsButton => 'ಕಂತುಗಳು';

  @override
  String get instalmentsTitle => 'ಶುಲ್ಕದ ಕಂತುಗಳು';

  @override
  String get instalmentsNone => 'ಈ ಶುಲ್ಕವನ್ನು ಕಂತುಗಳಾಗಿ ವಿಭಜಿಸಿಲ್ಲ.';

  @override
  String instalmentN(Object n) {
    return 'ಕಂತು $n';
  }

  @override
  String instalmentDueOn(Object date) {
    return '$date ರೊಳಗೆ ಪಾವತಿಸಬೇಕು';
  }

  @override
  String get instalmentPaid => 'ಪಾವತಿಸಲಾಗಿದೆ';

  @override
  String get instalmentPartial => 'ಭಾಗಶಃ ಪಾವತಿ';

  @override
  String get instalmentDue => 'ಬಾಕಿ';

  @override
  String get instalmentOverdue => 'ಗಡುವು ಮೀರಿದೆ';

  @override
  String instalmentsSummary(Object paid, Object total) {
    return '$total ರಲ್ಲಿ $paid ಪಾವತಿಸಲಾಗಿದೆ';
  }

  @override
  String get libraryRenew => 'ನವೀಕರಿಸಿ';

  @override
  String get libraryRenewed => 'ನವೀಕರಿಸಲಾಗಿದೆ. ಹೊಸ ಗಡುವು ತೋರಿಸಲಾಗಿದೆ.';

  @override
  String get buzzerTitle => 'ತರಗತಿಯ ಬಜರ್';

  @override
  String get buzzerPress => 'ಬಜರ್ ಒತ್ತಿ!';

  @override
  String get buzzerReady => 'ಶಿಕ್ಷಕರು ಬಜರ್ ತೆರೆದಿದ್ದಾರೆ. ಮೊದಲು ಒತ್ತಿ!';

  @override
  String get buzzerLocked => 'ಬಜರ್ ಲಾಕ್ ಆಗಿದೆ';

  @override
  String get buzzerYouFirst => 'ನೀವು ಮೊದಲು ಬಜರ್ ಒತ್ತಿದ್ದೀರಿ!';

  @override
  String buzzerYourPlace(int n) {
    return 'ನೀವು ಬಜರ್ ಒತ್ತಿದ್ದೀರಿ. ನೀವು $nನೇ ಸ್ಥಾನದಲ್ಲಿದ್ದೀರಿ';
  }

  @override
  String buzzerFirstIs(Object name) {
    return '$name ಮೊದಲು ಬಜರ್ ಒತ್ತಿದರು';
  }

  @override
  String get acadDocTitle => 'ಟ್ರಾನ್ಸ್‌ಕ್ರಿಪ್ಟ್ ಮತ್ತು ಪ್ರಮಾಣಪತ್ರಗಳು';

  @override
  String get acadDocTranscript => 'ಶೈಕ್ಷಣಿಕ ಟ್ರಾನ್ಸ್‌ಕ್ರಿಪ್ಟ್';

  @override
  String get acadDocProvisional => 'ತಾತ್ಕಾಲಿಕ ಪ್ರಮಾಣಪತ್ರ';

  @override
  String get acadDocGradeCard => 'ಸಂಯೋಜಿತ ಗ್ರೇಡ್ ಕಾರ್ಡ್';

  @override
  String get acadDocRequest => 'ವಿನಂತಿಸಿ';

  @override
  String get acadDocPurpose => 'ಉದ್ದೇಶ (ಐಚ್ಛಿಕ)';

  @override
  String get acadDocSent => 'ವಿನಂತಿಯನ್ನು ಪರೀಕ್ಷಾ ಕಚೇರಿಗೆ ಕಳುಹಿಸಲಾಗಿದೆ.';

  @override
  String get acadDocDownload => 'ಡೌನ್‌ಲೋಡ್';

  @override
  String get acadDocNone => 'ಇನ್ನೂ ವಿನಂತಿಗಳಿಲ್ಲ.';

  @override
  String get acadDocRequested => 'ಅನುಮೋದನೆಗಾಗಿ ಕಾಯುತ್ತಿದೆ';

  @override
  String get acadDocApproved => 'ಅನುಮೋದಿತ, ನೀಡಲಾಗುತ್ತಿದೆ';

  @override
  String get acadDocRejected => 'ಅನುಮೋದಿಸಲಾಗಿಲ್ಲ';

  @override
  String get acadDocIssued => 'ಸಿದ್ಧ';

  @override
  String get acadDocCannotOpen => 'ಈ ಫೋನ್‌ನಲ್ಲಿ ಫೈಲ್ ತೆರೆಯಬಲ್ಲ ಆ್ಯಪ್ ಇಲ್ಲ.';
}
