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
  String get noMarksScreen => 'ಇನ್ನೂ ಯಾವುದೇ ಅಂಕಗಳನ್ನು ಪ್ರಕಟಿಸಿಲ್ಲ.\nನಿಮ್ಮ ಶಿಕ್ಷಕರು ಅಂಕಗಳನ್ನು ಪ್ರಕಟಿಸಿದಾಗ, ಅವು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';

  @override
  String get you => 'ನೀವು';

  @override
  String get recordingsEmpty => 'ಶಿಕ್ಷಕರು ಬೋರ್ಡ್‌ನಲ್ಲಿ ಪಾಠವನ್ನು ರೆಕಾರ್ಡ್ ಮಾಡಿ ಹಂಚಿಕೊಂಡಾಗ, ನೀವು ಅದನ್ನು ಇಲ್ಲಿ ಮತ್ತೆ ನೋಡಬಹುದು.';

  @override
  String get missedThisClass => 'ನೀವು ಈ ತರಗತಿಯನ್ನು ತಪ್ಪಿಸಿಕೊಂಡಿದ್ದೀರಿ';

  @override
  String get noRecordingsShared => 'ಇನ್ನೂ ನಿಮ್ಮ ತರಗತಿಯೊಂದಿಗೆ ಯಾವುದೇ ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್ ಹಂಚಿಕೊಂಡಿಲ್ಲ.';

  @override
  String get recordingNotSharedYours => 'ಈ ರೆಕಾರ್ಡಿಂಗ್ ಅನ್ನು ಈಗ ನಿಮ್ಮ ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಂಡಿಲ್ಲ.';

  @override
  String get boardNotShared => 'ಈ ಬೋರ್ಡ್ ಅನ್ನು ಈಗ ನಿಮ್ಮ ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಂಡಿಲ್ಲ.';

  @override
  String writeToAbout(Object teacher) {
    return 'ತರಗತಿ, ಹೋಂವರ್ಕ್ ಅಥವಾ ಸಂದೇಹದ ಬಗ್ಗೆ $teacher ಅವರಿಗೆ ಬರೆಯಿರಿ.';
  }

  @override
  String get noMessagesStudent => 'ಇನ್ನೂ ಯಾವುದೇ ಸಂದೇಶಗಳಿಲ್ಲ.\nತರಗತಿ, ಹೋಂವರ್ಕ್ ಅಥವಾ ಸಂದೇಹದ ಬಗ್ಗೆ ನಿಮ್ಮ ಶಿಕ್ಷಕರಿಗೆ ಬರೆಯಿರಿ.';

  @override
  String get noTeachersOnTimetable => 'ನಿಮ್ಮ ವೇಳಾಪಟ್ಟಿಯಲ್ಲಿ ಇನ್ನೂ ಯಾವುದೇ ಶಿಕ್ಷಕರಿಲ್ಲ.';

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
  String get askYourTeachers => 'ತರಗತಿ, ಹೋಂವರ್ಕ್ ಅಥವಾ ಸಂದೇಹದ ಬಗ್ಗೆ ನಿಮ್ಮ ಶಿಕ್ಷಕರನ್ನು ಕೇಳಿ.';

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
  String get attendanceFewMissed => 'ಇತ್ತೀಚೆಗೆ ನೀವು ಕೆಲವು ತರಗತಿಗಳನ್ನು ತಪ್ಪಿಸಿಕೊಂಡಿದ್ದೀರಿ.';

  @override
  String get attendanceBelow75 => '75% ಕ್ಕಿಂತ ಕಡಿಮೆ. ಪರೀಕ್ಷೆಗೆ ಕೂರಲು ಕಾಲೇಜುಗಳು ಸಾಮಾನ್ಯವಾಗಿ 75% ಹಾಜರಾತಿ ಕೇಳುತ್ತವೆ.';

  @override
  String noAttendanceForYou(Object days) {
    return 'ಕಳೆದ $days ದಿನಗಳಲ್ಲಿ ನಿಮ್ಮ ಹಾಜರಾತಿ ದಾಖಲಾಗಿಲ್ಲ.';
  }

  @override
  String get nothingDue => 'ಈಗ ಸಲ್ಲಿಸಬೇಕಾದದ್ದು ಏನೂ ಇಲ್ಲ. ನಿಮ್ಮ ಶಿಕ್ಷಕರ ಹೊಸ ಹೋಂವರ್ಕ್ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';

  @override
  String get stuckTitle => 'ಎಲ್ಲಿಯಾದರೂ ಸಿಲುಕಿದ್ದೀರಾ?';

  @override
  String get stuckBody => 'KINETIX AI ಗೆ ವಿವರಿಸಲು ಕೇಳಿ, English, हिन्दी ಅಥವಾ ಕನ್ನಡದಲ್ಲಿ.';

  @override
  String get boardsEmpty => 'ಪಾಠದ ನಂತರ ಶಿಕ್ಷಕರು ತರಗತಿಯ ಬೋರ್ಡ್ ಹಂಚಿಕೊಂಡಾಗ, ನೀವು ಪುನರಾವರ್ತಿಸಲು ಅದು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';

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
  String get noPayments => 'ಇನ್ನೂ ಯಾವುದೇ ಪಾವತಿ ಇಲ್ಲ. ಪಾವತಿ ಆದ ನಂತರ ರಸೀದಿಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ.';

  @override
  String get allPaid => 'ಎಲ್ಲವೂ ಪಾವತಿಯಾಗಿದೆ';

  @override
  String feesOverdueNext(int count, Object title) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count ಶುಲ್ಕಗಳ ಗಡುವು ಮೀರಿದೆ', one: '1 ಶುಲ್ಕದ ಗಡುವು ಮೀರಿದೆ');
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
  String get keepReceipt => 'ಇದನ್ನು ನಿಮ್ಮ ದಾಖಲೆಗಾಗಿ ಇಟ್ಟುಕೊಳ್ಳಿ. ಯಾರಾದರೂ ಪಾವತಿಯ ಪುರಾವೆ ಕೇಳಿದರೆ, ಶುಲ್ಕ ಕೌಂಟರ್‌ನಲ್ಲಿ ಇದನ್ನು ತೋರಿಸಿ.';

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
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count ಪುಸ್ತಕಗಳನ್ನು ಪಡೆದಿದೆ', one: '1 ಪುಸ್ತಕ ಪಡೆದಿದೆ');
    return '$_temp0';
  }

  @override
  String feesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count ಶುಲ್ಕಗಳು', one: '1 ಶುಲ್ಕ');
    return '$_temp0';
  }

  @override
  String receiptsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count ರಸೀದಿಗಳು', one: '1 ರಸೀದಿ');
    return '$_temp0';
  }

  @override
  String get askADoubt => 'ಸಂದೇಹ ಕೇಳಿ';

  @override
  String get syllabus => 'ಪಠ್ಯಕ್ರಮ';

  @override
  String get earlierQuestions => 'ಹಿಂದೆ ಕೇಳಿದ ಪ್ರಶ್ನೆಗಳು';

  @override
  String get askIntro => 'KINETIX AI ನಿಮ್ಮ ಪಠ್ಯಕ್ರಮದ ಪ್ರಕಾರ ಇದನ್ನು ಹಂತ ಹಂತವಾಗಿ ವಿವರಿಸುತ್ತದೆ.';

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
  String get previewNote => 'ನಿಮ್ಮ ಕಾಲೇಜಿನಲ್ಲಿ KINETIX AI ಇನ್ನೂ ಸಂಪರ್ಕಗೊಂಡಿಲ್ಲ, ಹಾಗಾಗಿ ಇದು ಕೇವಲ ಮಾದರಿ, ನಿಜವಾದ ವಿವರಣೆ ಅಲ್ಲ.';

  @override
  String get aiCantAnswer => 'KINETIX AI ಇದಕ್ಕೆ ಉತ್ತರಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ';

  @override
  String get aiRephrase => 'ಇದನ್ನು ನಿಮ್ಮ ಓದಿಗೆ ಸಂಬಂಧಿಸಿದ ಪ್ರಶ್ನೆಯಾಗಿ ಮತ್ತೆ ಬರೆದು ನೋಡಿ.';

  @override
  String get aiAllowanceUsed => 'ಇಂದಿನ KINETIX AI ಮಿತಿ ಮುಗಿದಿದೆ';

  @override
  String get aiAllowanceBody => 'ನಿಮ್ಮ ಕಾಲೇಜು ಇಂದಿನ ಮಿತಿಯನ್ನು ಬಳಸಿದೆ. ಇದು ನಾಳೆ ಮತ್ತೆ ಆರಂಭವಾಗುತ್ತದೆ.';

  @override
  String get aiUnreachable => 'KINETIX AI ಸಂಪರ್ಕಕ್ಕೆ ಸಿಗುತ್ತಿಲ್ಲ';

  @override
  String get aiUnreachableBody => 'ಈಗ ಸಂಪರ್ಕಕ್ಕೆ ಸಿಗುತ್ತಿಲ್ಲ. ಒಂದು ನಿಮಿಷದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

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
  String get notReviewed => 'ಈ ಟಿಪ್ಪಣಿಗಳನ್ನು ಪಠ್ಯಕ್ರಮ ತಂಡ ಇನ್ನೂ ಪರಿಶೀಲಿಸಿಲ್ಲ. ನಿಮ್ಮ ಪಠ್ಯಪುಸ್ತಕ ಮತ್ತು ಶಿಕ್ಷಕರಿಗೆ ಮೊದಲ ಆದ್ಯತೆ.';

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
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count ವಿಷಯಗಳು', one: '1 ವಿಷಯ');
    return '$_temp0';
  }

  @override
  String chaptersCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count ಅಧ್ಯಾಯಗಳು', one: '1 ಅಧ್ಯಾಯ');
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
  String get boardOfflineBody => 'ತರಗತಿಯ ಬೋರ್ಡ್ ಸಂಪರ್ಕ ಕಳೆದುಕೊಂಡಿದೆ. ಇಲ್ಲೇ ಇರಿ: ಮತ್ತೆ ಸಂಪರ್ಕಗೊಂಡಾಗ ಬೋರ್ಡ್ ತಾನಾಗಿಯೇ ಕಾಣಿಸುತ್ತದೆ.';

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
  String get liveTimeout => 'ತರಗತಿಯಿಂದ ಉತ್ತರ ಬರಲು ತುಂಬಾ ತಡವಾಗುತ್ತಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

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
  String get errNotStudent => 'ಈ ಆ್ಯಪ್ ವಿದ್ಯಾರ್ಥಿಗಳಿಗಾಗಿ. ನಿಮ್ಮ ವಿದ್ಯಾರ್ಥಿ ಲಾಗಿನ್ ಸಿದ್ಧಪಡಿಸಲು ಕಾಲೇಜು ಕಚೇರಿಯನ್ನು ಕೇಳಿ.';

  @override
  String get errGuardianAccount => 'ಈ ಆ್ಯಪ್ ವಿದ್ಯಾರ್ಥಿಗಳಿಗಾಗಿ. ಪೋಷಕರು KINETIX Parent ಆ್ಯಪ್ ಬಳಸಬಹುದು.';

  @override
  String get errTeacherAccount => 'ಈ ಆ್ಯಪ್ ವಿದ್ಯಾರ್ಥಿಗಳಿಗಾಗಿ. ಶಿಕ್ಷಕರು KINETIX Teacher ಆ್ಯಪ್ ಬಳಸಬಹುದು.';

  @override
  String get errNotLinked => 'ನಿಮ್ಮ ಲಾಗಿನ್ ಇನ್ನೂ ಯಾವುದೇ ವಿದ್ಯಾರ್ಥಿ ದಾಖಲೆಗೆ ಜೋಡಣೆಯಾಗಿಲ್ಲ. ಅದನ್ನು ಜೋಡಿಸಲು ಕಾಲೇಜು ಕಚೇರಿಯನ್ನು ಕೇಳಿ.';
}
