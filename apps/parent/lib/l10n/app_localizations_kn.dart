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
    String _temp0 = intl.Intl.pluralLogic(days, locale: localeName, other: '$days ದಿನ', one: '1 ದಿನ');
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
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count ಪುಟಗಳು', one: '1 ಪುಟ');
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
  String get errTimeout => 'ಸರ್ವರ್ ಉತ್ತರಿಸಲು ತುಂಬಾ ಸಮಯ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get errUnreachable => 'KINETIX ಗೆ ಸಂಪರ್ಕ ಸಾಧ್ಯವಾಗುತ್ತಿಲ್ಲ. ನಿಮ್ಮ ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಮತ್ತು ಸರ್ವರ್ ವಿಳಾಸವನ್ನು ಪರಿಶೀಲಿಸಿ.';

  @override
  String get errForbidden => 'ಇದಕ್ಕೆ ನಿಮಗೆ ಅನುಮತಿ ಇಲ್ಲ.';

  @override
  String get errNotFound => 'ಸಿಗಲಿಲ್ಲ.';

  @override
  String get errTooMany => 'ಹಲವು ಬಾರಿ ಪ್ರಯತ್ನಿಸಲಾಗಿದೆ. ಒಂದು ನಿಮಿಷ ಕಾದು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

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
  String get signOutBody => 'ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಲು ನಿಮ್ಮ ಪಾಸ್‌ವರ್ಡ್ ಬೇಕಾಗುತ್ತದೆ.';

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
  String get institutionCodeChars => 'ಅಕ್ಷರಗಳು, ಅಂಕಿಗಳು ಮತ್ತು ಹೈಫನ್ (-) ಮಾತ್ರ ಬಳಸಿ';

  @override
  String get enterValidEmail => 'ಸರಿಯಾದ ಇಮೇಲ್ ವಿಳಾಸ ನಮೂದಿಸಿ';

  @override
  String get enterValidPhone => '10 ಅಂಕಿಯ ಫೋನ್ ಸಂಖ್ಯೆ ಅಥವಾ ಸರಿಯಾದ ಇಮೇಲ್ ನಮೂದಿಸಿ';

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
      other: '$count ಪುಸ್ತಕಗಳನ್ನು ಹಿಂದಿರುಗಿಸಲು ತಡವಾಗಿದೆ. ದಯವಿಟ್ಟು ಅವುಗಳನ್ನು ಗ್ರಂಥಾಲಯಕ್ಕೆ ಹಿಂದಿರುಗಿಸಿ.',
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
  String get fineRule => 'ಪುಸ್ತಕವನ್ನು ತಡವಾಗಿ ಹಿಂದಿರುಗಿಸಿದರೆ ಗ್ರಂಥಾಲಯವು ಪ್ರತಿ ದಿನಕ್ಕೆ ದಂಡ ವಿಧಿಸುತ್ತದೆ.';

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
  String get marksExplainer => 'ಪ್ರಕಟಿತ ಎಲ್ಲಾ ಮೌಲ್ಯಮಾಪನಗಳಲ್ಲಿ ಒಟ್ಟು ಅಂಕಗಳಲ್ಲಿ ಪಡೆದ ಅಂಕಗಳು.';

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
  String get recordingNotShared => 'ಈ ರೆಕಾರ್ಡಿಂಗ್ ಅನ್ನು ಈಗ ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಂಡಿಲ್ಲ.';

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
  String get zoomSideways => 'ಜೂಮ್ ಮಾಡಲು ಎರಡು ಬೆರಳುಗಳಿಂದ ಹಿಗ್ಗಿಸಿ, ಅಥವಾ ಫೋನ್ ಅನ್ನು ಅಡ್ಡವಾಗಿ ತಿರುಗಿಸಿ';

  @override
  String get zoomHint => 'ಜೂಮ್ ಮಾಡಲು ಎರಡು ಬೆರಳುಗಳಿಂದ ಹಿಗ್ಗಿಸಿ ಅಥವಾ ಎರಡು ಬಾರಿ ಟ್ಯಾಪ್ ಮಾಡಿ';

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
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count ಶುಲ್ಕಗಳನ್ನು ಪಾವತಿಸಬೇಕಿದೆ', one: '1 ಶುಲ್ಕ ಪಾವತಿಸಬೇಕಿದೆ');
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
  String get receiptCopied => 'ರಸೀದಿ ನಕಲಾಗಿದೆ. ಇದನ್ನು ಸಂದೇಶ ಅಥವಾ ಇಮೇಲ್‌ನಲ್ಲಿ ಪೇಸ್ಟ್ ಮಾಡಿ.';

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
  String get teachersReply => 'ಶಿಕ್ಷಕರು ಸಮಯ ಸಿಕ್ಕಾಗ, ಸಾಮಾನ್ಯವಾಗಿ ಕಾಲೇಜು ಸಮಯದಲ್ಲಿ ಉತ್ತರಿಸುತ್ತಾರೆ.';

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
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count ತರಗತಿಗಳಲ್ಲಿ', one: '1 ತರಗತಿಯಲ್ಲಿ');
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
  String get librarySubtitle => 'ಪಡೆದ ಪುಸ್ತಕಗಳು, ಹಿಂದಿರುಗಿಸುವ ದಿನಾಂಕಗಳು ಮತ್ತು ದಂಡ';

  @override
  String get college => 'ಕಾಲೇಜು';

  @override
  String get resultsLibraryHeader => 'ಫಲಿತಾಂಶ ಮತ್ತು ಗ್ರಂಥಾಲಯ';

  @override
  String get feesAndReceipts => 'ಶುಲ್ಕ ಮತ್ತು ರಸೀದಿಗಳು';

  @override
  String get tryAgain => 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ';

  @override
  String get signInHint => 'ನಿಮ್ಮ ಮಗುವಿನ ಕಾಲೇಜಿಗೆ ನೀಡಿದ ಫೋನ್ ಸಂಖ್ಯೆ ಅಥವಾ ಇಮೇಲ್ ಬಳಸಿ';

  @override
  String get errNotGuardian => 'ಈ ಆ್ಯಪ್ ಪೋಷಕರಿಗಾಗಿ. ನಿಮ್ಮ ಖಾತೆಯನ್ನು ನಿಮ್ಮ ಮಗುವಿನೊಂದಿಗೆ ಜೋಡಿಸಲು ನಿಮ್ಮ ಸಂಸ್ಥೆಯನ್ನು ಕೇಳಿ.';

  @override
  String get errTeacherAccount => 'ಈ ಆ್ಯಪ್ ಪೋಷಕರಿಗಾಗಿ. ಶಿಕ್ಷಕರು KINETIX Teacher ಆ್ಯಪ್ ಬಳಸಬಹುದು.';

  @override
  String homeSubtitle(Object name) {
    return '$name ಅವರ ಪ್ರಗತಿ ಇಲ್ಲಿದೆ';
  }

  @override
  String get noChildrenLinked => 'ನಿಮ್ಮ ಖಾತೆಗೆ ಇನ್ನೂ ಯಾವುದೇ ಮಗುವನ್ನು ಜೋಡಿಸಿಲ್ಲ.\nನಿಮ್ಮನ್ನು ಪೋಷಕರಾಗಿ ಸೇರಿಸಲು ನಿಮ್ಮ ಮಗುವಿನ ಕಾಲೇಜನ್ನು ಕೇಳಿ.';

  @override
  String get attendanceFewMissed => 'ಇತ್ತೀಚೆಗೆ ಕೆಲವು ತರಗತಿಗಳು ತಪ್ಪಿವೆ.';

  @override
  String get attendanceBelow75 => '75% ಕ್ಕಿಂತ ಕಡಿಮೆ. ಪರೀಕ್ಷೆಗೆ ಕೂರಲು ಕಾಲೇಜುಗಳು ಸಾಮಾನ್ಯವಾಗಿ 75% ಹಾಜರಾತಿ ಕೇಳುತ್ತವೆ.';

  @override
  String noAttendanceFor(Object name, Object days) {
    return 'ಕಳೆದ $days ದಿನಗಳಲ್ಲಿ $name ಅವರ ಹಾಜರಾತಿ ದಾಖಲಾಗಿಲ್ಲ.';
  }

  @override
  String get nothingDue => 'ಈಗ ಸಲ್ಲಿಸಬೇಕಾದದ್ದು ಏನೂ ಇಲ್ಲ. ಶಿಕ್ಷಕರ ಹೊಸ ಹೋಂವರ್ಕ್ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';

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
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count ಪ್ರಶ್ನೆಗಳನ್ನು', one: '1 ಪ್ರಶ್ನೆ');
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
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count ಪ್ರಶ್ನೆಗಳಿಗೆ', one: '1 ಪ್ರಶ್ನೆಗೆ');
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
  String get noChildrenYet => 'ಇನ್ನೂ ಯಾವುದೇ ಮಗುವನ್ನು ಜೋಡಿಸಿಲ್ಲ. ನಿಮ್ಮ ಮಗುವಿನ ಕಾಲೇಜನ್ನು ಕೇಳಿ.';

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
  String get noRecordingsShared => 'ಇನ್ನೂ ತರಗತಿಯೊಂದಿಗೆ ಯಾವುದೇ ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್ ಹಂಚಿಕೊಂಡಿಲ್ಲ.';

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
  String get enterAmountRupees => 'ರೂಪಾಯಿಗಳಲ್ಲಿ ಮೊತ್ತ ನಮೂದಿಸಿ, ಉದಾ. 2500 ಅಥವಾ 2500.50';

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
  String get paymentNotSetUp => 'ಕಾಲೇಜು ಇನ್ನೂ ಆನ್‌ಲೈನ್ ಪಾವತಿ ವ್ಯವಸ್ಥೆ ಮಾಡಿಲ್ಲ. ದಯವಿಟ್ಟು ಶುಲ್ಕ ಕೌಂಟರ್‌ನಲ್ಲಿ ಪಾವತಿಸಿ.';

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
  String get failNoConfirmation => 'ಪಾವತಿ ಆ್ಯಪ್‌ನಿಂದ ದೃಢೀಕರಣ ಬರಲಿಲ್ಲ. ನಿಮ್ಮ ಖಾತೆಯಿಂದ ಹಣ ಕಡಿತವಾಗಿದ್ದರೆ, ಶುಲ್ಕ ಶೀಘ್ರದಲ್ಲೇ ಅಪ್‌ಡೇಟ್ ಆಗುತ್ತದೆ.';

  @override
  String get failCouldNotOpen => 'ಪಾವತಿ ಪರದೆ ತೆರೆಯಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get failNetwork => 'ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಇಲ್ಲ. ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

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
  String get noMessagesChildren => 'ಇನ್ನೂ ಯಾವುದೇ ಸಂದೇಶಗಳಿಲ್ಲ.\nಹೋಂವರ್ಕ್, ಗೈರು ಅಥವಾ ಪ್ರಗತಿಯ ಬಗ್ಗೆ ನಿಮ್ಮ ಮಕ್ಕಳ ಶಿಕ್ಷಕರಿಗೆ ಬರೆಯಿರಿ.';

  @override
  String get noChildrenLinkedShort => 'ನಿಮ್ಮ ಖಾತೆಗೆ ಇನ್ನೂ ಯಾವುದೇ ಮಗುವನ್ನು ಜೋಡಿಸಿಲ್ಲ.\nನಿಮ್ಮ ಮಗುವಿನ ಕಾಲೇಜನ್ನು ಕೇಳಿ.';

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
  String get noUpdates => 'ಇನ್ನೂ ಯಾವುದೇ ಸೂಚನೆಗಳಿಲ್ಲ.\nಗೈರು, ಹೋಂವರ್ಕ್ ಮತ್ತು ಕಾಲೇಜಿನ ಸಂದೇಶಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';

  @override
  String get phoneOrEmail => 'ಫೋನ್ ಅಥವಾ ಇಮೇಲ್';

  @override
  String get enterPhoneOrEmail => 'ನಿಮ್ಮ ಫೋನ್ ಸಂಖ್ಯೆ ಅಥವಾ ಇಮೇಲ್ ನಮೂದಿಸಿ';

  @override
  String get errAccountInactive => 'ನಿಮ್ಮ ಖಾತೆ ಸಕ್ರಿಯವಾಗಿಲ್ಲ. ನಿಮ್ಮ ಸಂಸ್ಥೆಯ ಕಚೇರಿಯನ್ನು ಕೇಳಿ.';

  @override
  String get errSignInAgain => 'ನಿಮ್ಮ ಸೈನ್ ಇನ್ ಅವಧಿ ಮುಗಿದಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get errTooLarge => 'ಒಂದು ಫೈಲ್ ತುಂಬಾ ದೊಡ್ಡದಾಗಿದೆ. ಪ್ರತಿ ಫೋಟೋ ಅಥವಾ PDF ಗರಿಷ್ಠ 8 MB ಇರಬಹುದು.';

  @override
  String get errConflict => 'ಈ ನಡುವೆ ಇದು ಬದಲಾಗಿದೆ. ರಿಫ್ರೆಶ್ ಮಾಡಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get errSubjectNotInClass => 'ಈ ವಿಷಯವನ್ನು ಈ ತರಗತಿಯಲ್ಲಿ ಕಲಿಸಲಾಗುವುದಿಲ್ಲ.';

  @override
  String get errSubmissionEmpty => 'ಉತ್ತರ ಬರೆಯಿರಿ ಅಥವಾ ಫೋಟೋ ಸೇರಿಸಿ.';

  @override
  String get errSubmissionChecked => 'ಈ ಹೋಂವರ್ಕ್ ಈಗಾಗಲೇ ಪರಿಶೀಲಿಸಲಾಗಿದೆ.';

  @override
  String get errSubmissionStudentOnly => 'ಈ ವಿದ್ಯಾರ್ಥಿ ತಮ್ಮ ಸ್ವಂತ ಲಾಗಿನ್‌ನಿಂದ ಹೋಂವರ್ಕ್ ಸಲ್ಲಿಸುತ್ತಾರೆ.';

  @override
  String get calendar => 'ಕ್ಯಾಲೆಂಡರ್';

  @override
  String get calendarSubtitle => 'ರಜೆಗಳು, ಪರೀಕ್ಷೆಗಳು ಮತ್ತು ಕಾರ್ಯಕ್ರಮಗಳು';

  @override
  String get upcoming => 'ಮುಂಬರುವವು';

  @override
  String get seeCalendar => 'ಪೂರ್ಣ ಕ್ಯಾಲೆಂಡರ್ ನೋಡಿ';

  @override
  String get calendarEmpty => 'ಮುಂದಿನ ತಿಂಗಳುಗಳಲ್ಲಿ ಯಾವುದೇ ರಜೆ, ಪರೀಕ್ಷೆ ಅಥವಾ ಕಾರ್ಯಕ್ರಮವಿಲ್ಲ.';

  @override
  String get kindHoliday => 'ರಜೆ';

  @override
  String get kindExams => 'ಪರೀಕ್ಷೆ';

  @override
  String get kindEvent => 'ಕಾರ್ಯಕ್ರಮ';

  @override
  String inDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count ದಿನಗಳಲ್ಲಿ', one: '1 ದಿನದಲ್ಲಿ');
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
  String get answerHint => 'ಉತ್ತರವನ್ನು ಇಲ್ಲಿ ಬರೆಯಿರಿ, ಅಥವಾ ಕೆಲಸದ ಫೋಟೋಗಳನ್ನು ಸೇರಿಸಿ';

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
  String get filesHint => 'ಗರಿಷ್ಠ 5 ಫೋಟೋ ಅಥವಾ PDF, ಪ್ರತಿಯೊಂದೂ 8 MB ವರೆಗೆ. ಕಳುಹಿಸುವ ಮೊದಲು ಫೋಟೋಗಳನ್ನು ಚಿಕ್ಕದಾಗಿಸಲಾಗುತ್ತದೆ.';

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
  String get privacySubtitle => 'ವಿದ್ಯಾರ್ಥಿಯ ಮಾಹಿತಿಯೊಂದಿಗೆ KINETIX ಏನು ಮಾಡಬಹುದು';

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
  String get noticeSchool => 'ಶಾಲೆ (18 ವರ್ಷದೊಳಗಿನ ವಿದ್ಯಾರ್ಥಿಗಳು): ಮಗುವಿನ ಪರವಾಗಿ ಪೋಷಕರು ನಿರ್ಧರಿಸುತ್ತಾರೆ.';

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
  String get purposeDataNo => 'ಕಾನೂನಿನ ಪ್ರಕಾರ ಇಡಬೇಕಾದ ದಾಖಲೆಗಳನ್ನು ಸಂಸ್ಥೆ ಇನ್ನೂ ಇಡುತ್ತದೆ; ನಿಮಗೆ ಆ್ಯಪ್‌ನಲ್ಲಿ ಸೂಚನೆಗಳು ಬರುವುದಿಲ್ಲ.';

  @override
  String get purposeAiTitle => 'KINETIX AI';

  @override
  String get purposeAiBody =>
      'ಸಂದೇಹಗಳಿಗೆ ವಿದ್ಯಾರ್ಥಿ KINETIX AI ನಿಂದ ಸಹಾಯ ಕೇಳುವುದು. ಪ್ರಶ್ನೆಗಳನ್ನು ಭಾರತದ ಸರ್ವರ್‌ಗಳಲ್ಲಿ ಸಂಸ್ಕರಿಸಲಾಗುತ್ತದೆ ಮತ್ತು AI ಮಾದರಿಗಳ ತರಬೇತಿಗೆ ಬಳಸಲಾಗುವುದಿಲ್ಲ.';

  @override
  String get purposeAiNo => 'ವಿದ್ಯಾರ್ಥಿಗೆ KINETIX AI ಆಫ್ ಆಗುತ್ತದೆ. ಉಳಿದೆಲ್ಲವೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ.';

  @override
  String get purposeRecordingsTitle => 'ತರಗತಿ ರೆಕಾರ್ಡಿಂಗ್ ಮತ್ತು ಲೈವ್ ತರಗತಿಗಳು';

  @override
  String get purposeRecordingsBody => 'ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಂಡ ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್ ಮತ್ತು ಲೈವ್ ತರಗತಿಗಳಲ್ಲಿ ವಿದ್ಯಾರ್ಥಿಯ ಧ್ವನಿ ಅಥವಾ ಚಿತ್ರ ಬರುವುದು.';

  @override
  String get purposeRecordingsNo =>
      'ವಿದ್ಯಾರ್ಥಿಯನ್ನು ರೆಕಾರ್ಡ್ ಮಾಡದಂತೆ ಶಿಕ್ಷಕರಿಗೆ ತಿಳಿಸಲಾಗುತ್ತದೆ; ಈಗಾಗಲೇ ಹಂಚಿಕೊಂಡ ರೆಕಾರ್ಡಿಂಗ್‌ಗಳು ತರಗತಿಯಲ್ಲೇ ಇರುತ್ತವೆ.';

  @override
  String get purposePhotosTitle => 'ಫೋಟೋಗಳು';

  @override
  String get purposePhotosBody =>
      'ವಿದ್ಯಾರ್ಥಿಯ ಫೋಟೋಗಳನ್ನು (ಉದಾಹರಣೆಗೆ ಹೋಂವರ್ಕ್‌ನಲ್ಲಿ ಅಥವಾ ತರಗತಿ ಚಟುವಟಿಕೆಗಳಲ್ಲಿ) ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳುವುದು.';

  @override
  String get purposePhotosNo => 'ವಿದ್ಯಾರ್ಥಿಯ ಫೋಟೋಗಳನ್ನು ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಲಾಗುವುದಿಲ್ಲ.';

  @override
  String get errConsentGuardianDecides => 'ಈ ವಿದ್ಯಾರ್ಥಿಗಾಗಿ ನೀವು ಈ ಆಯ್ಕೆಗಳನ್ನು ಬದಲಾಯಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ.';

  @override
  String childWork(String name) {
    return '$name ಅವರ ಕೆಲಸ';
  }

  @override
  String get returnedNote => 'ಇದನ್ನು ಮತ್ತೆ ಮಾಡಲು ಶಿಕ್ಷಕರು ಹೇಳಿದ್ದಾರೆ. ಟಿಪ್ಪಣಿ ಓದಿ, ನಂತರ ಮತ್ತೆ ಸಲ್ಲಿಸಿ.';

  @override
  String handInFor(String name) {
    return '$name ಪರವಾಗಿ ಸಲ್ಲಿಸಿ';
  }

  @override
  String get handInForNote => 'ತಮ್ಮದೇ KINETIX ಲಾಗಿನ್ ಇಲ್ಲದ ಮಗುವಿನ ಪರವಾಗಿ ಇಲ್ಲಿ ಸಲ್ಲಿಸಿ.';

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
  String get syllabusProgressSubtitle => 'ಪ್ರತಿ ವಿಷಯದಲ್ಲಿ ತರಗತಿಗೆ ಏನು ಕಲಿಸಲಾಗಿದೆ';

  @override
  String get syllabusSubjectsEmpty => 'ಶಿಕ್ಷಕರು ಹೋಂವರ್ಕ್ ನೀಡಿದ ನಂತರ ವಿಷಯಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';

  @override
  String syllabusNotLinked(String subject) {
    return '$subject ಪಠ್ಯಕ್ರಮ ಇನ್ನೂ KINETIX ನಲ್ಲಿ ಇಲ್ಲ.';
  }

  @override
  String chaptersTopics(int chapters) {
    String _temp0 = intl.Intl.pluralLogic(chapters, locale: localeName, other: '$chapters ಅಧ್ಯಾಯಗಳು', one: '1 ಅಧ್ಯಾಯ');
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
}
