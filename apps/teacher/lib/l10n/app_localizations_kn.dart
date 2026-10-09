// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Kannada (`kn`).
class AppLocalizationsKn extends AppLocalizations {
  AppLocalizationsKn([String locale = 'kn']) : super(locale);

  @override
  String get appTitle => 'KINETIX Teacher';

  @override
  String get cancel => 'ರದ್ದುಮಾಡಿ';

  @override
  String get save => 'ಉಳಿಸಿ';

  @override
  String get send => 'ಕಳುಹಿಸಿ';

  @override
  String get share => 'ಹಂಚಿಕೊಳ್ಳಿ';

  @override
  String get done => 'ಮುಗಿದಿದೆ';

  @override
  String get retry => 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ';

  @override
  String get remove => 'ತೆಗೆದುಹಾಕಿ';

  @override
  String get clear => 'ತೆರವುಗೊಳಿಸಿ';

  @override
  String get profile => 'ಪ್ರೊಫೈಲ್';

  @override
  String get discardTitle => 'ಬದಲಾವಣೆಗಳನ್ನು ಬಿಟ್ಟುಬಿಡುವುದೇ?';

  @override
  String get discardMarksBody =>
      'ನೀವು ನಮೂದಿಸಿದ ಕೆಲವು ಅಂಕಗಳನ್ನು ಇನ್ನೂ ಉಳಿಸಿಲ್ಲ.';

  @override
  String get keepEditing => 'ಸಂಪಾದನೆ ಮುಂದುವರಿಸಿ';

  @override
  String get discard => 'ಬಿಟ್ಟುಬಿಡಿ';

  @override
  String get today => 'ಇಂದು';

  @override
  String get tomorrow => 'ನಾಳೆ';

  @override
  String get yesterday => 'ನಿನ್ನೆ';

  @override
  String greetingMorning(String name) {
    return 'ಶುಭೋದಯ, $name';
  }

  @override
  String greetingAfternoon(String name) {
    return 'ಶುಭ ಮಧ್ಯಾಹ್ನ, $name';
  }

  @override
  String greetingEvening(String name) {
    return 'ಶುಭ ಸಂಜೆ, $name';
  }

  @override
  String get navToday => 'ಇಂದು';

  @override
  String get navHomework => 'ಹೋಂವರ್ಕ್';

  @override
  String get navMarks => 'ಅಂಕಗಳು';

  @override
  String get navMessages => 'ಸಂದೇಶಗಳು';

  @override
  String get navRecordings => 'ರೆಕಾರ್ಡಿಂಗ್';

  @override
  String get assignHomework => 'ಹೋಂವರ್ಕ್ ನೀಡಿ';

  @override
  String get newAssessment => 'ಹೊಸ ಮೌಲ್ಯಮಾಪನ';

  @override
  String get newMessage => 'ಹೊಸ ಸಂದೇಶ';

  @override
  String get signInTitle => 'ಸೈನ್ ಇನ್';

  @override
  String get signInButton => 'ಸೈನ್ ಇನ್ ಮಾಡಿ';

  @override
  String get signInSubtitle => 'ನಿಮ್ಮ ಸಂಸ್ಥೆ ನೀಡಿದ ಖಾತೆಯನ್ನು ಬಳಸಿ';

  @override
  String get institutionCode => 'ಸಂಸ್ಥೆಯ ಕೋಡ್';

  @override
  String get institutionCodeHint => 'ಉದಾ. demo-college';

  @override
  String get emailOrPhone => 'ಇಮೇಲ್ ಅಥವಾ ಫೋನ್';

  @override
  String get password => 'ಪಾಸ್‌ವರ್ಡ್';

  @override
  String get showPassword => 'ಪಾಸ್‌ವರ್ಡ್ ತೋರಿಸಿ';

  @override
  String get hidePassword => 'ಪಾಸ್‌ವರ್ಡ್ ಮರೆಮಾಡಿ';

  @override
  String get serverAddress => 'ಸರ್ವರ್ ವಿಳಾಸ';

  @override
  String serverLabel(String address) {
    return 'ಸರ್ವರ್: $address';
  }

  @override
  String get enterInstitutionCode => 'ನಿಮ್ಮ ಸಂಸ್ಥೆಯ ಕೋಡ್ ನಮೂದಿಸಿ';

  @override
  String get institutionCodeChars =>
      'ಇಂಗ್ಲಿಷ್ ಅಕ್ಷರಗಳು, ಸಂಖ್ಯೆಗಳು ಮತ್ತು ಹೈಫನ್ (-) ಮಾತ್ರ ಬಳಸಿ';

  @override
  String get enterEmailOrPhone => 'ನಿಮ್ಮ ಇಮೇಲ್ ಅಥವಾ ಫೋನ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ';

  @override
  String get invalidEmail => 'ಸರಿಯಾದ ಇಮೇಲ್ ವಿಳಾಸ ನಮೂದಿಸಿ';

  @override
  String get invalidEmailOrPhone =>
      'ಸರಿಯಾದ ಇಮೇಲ್ ಅಥವಾ 10 ಅಂಕಿಯ ಫೋನ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ';

  @override
  String get enterPassword => 'ನಿಮ್ಮ ಪಾಸ್‌ವರ್ಡ್ ನಮೂದಿಸಿ';

  @override
  String get invalidServer =>
      'https://api.kinetix.in ರೀತಿಯ ಸರ್ವರ್ ವಿಳಾಸ ನಮೂದಿಸಿ';

  @override
  String get errorNotTeacher =>
      'ಈ ಆ್ಯಪ್ ಶಿಕ್ಷಕರಿಗಾಗಿ. ನಿಮ್ಮ ಖಾತೆಗೆ ಶಿಕ್ಷಕರ ಪಾತ್ರ ಇಲ್ಲ.';

  @override
  String get errorOffline =>
      'KINETIX ಸಂಪರ್ಕಿಸಲು ಆಗುತ್ತಿಲ್ಲ. ನಿಮ್ಮ ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಮತ್ತು ಸರ್ವರ್ ವಿಳಾಸವನ್ನು ಪರಿಶೀಲಿಸಿ.';

  @override
  String get errorTimeout =>
      'ಸರ್ವರ್ ಪ್ರತಿಕ್ರಿಯಿಸಲು ತುಂಬಾ ಸಮಯ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get errorForbidden => 'ಇದಕ್ಕೆ ನಿಮಗೆ ಅನುಮತಿ ಇಲ್ಲ.';

  @override
  String get errorNotFound => 'ಸಿಗಲಿಲ್ಲ.';

  @override
  String get errorTooManyAttempts =>
      'ತುಂಬಾ ಪ್ರಯತ್ನಗಳಾಗಿವೆ. ಒಂದು ನಿಮಿಷ ಕಾದು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String errorGeneric(int status) {
    return 'ಏನೋ ತಪ್ಪಾಗಿದೆ ($status). ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';
  }

  @override
  String get errorSessionExpired =>
      'ನಿಮ್ಮ ಸೈನ್ ಇನ್ ಅವಧಿ ಮುಗಿದಿದೆ. ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get errorWrongLogin =>
      'ಸಂಸ್ಥೆಯ ಕೋಡ್, ಲಾಗಿನ್ ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್ ತಪ್ಪಾಗಿದೆ';

  @override
  String get errorCodeExpired =>
      'ಈ ಕೋಡ್ ತಪ್ಪಾಗಿದೆ ಅಥವಾ ಅದರ ಅವಧಿ ಮುಗಿದಿದೆ. ಬೋರ್ಡ್‌ನಲ್ಲಿರುವ ಹೊಸ ಕೋಡ್ ಬಳಸಿ.';

  @override
  String get errorAccountInactive => 'ನಿಮ್ಮ ಖಾತೆ ಸಕ್ರಿಯವಾಗಿಲ್ಲ';

  @override
  String get errorOtherCampus => 'ಈ ಬೋರ್ಡ್ ಇರುವ ಕ್ಯಾಂಪಸ್‌ನಲ್ಲಿ ನೀವು ಶಿಕ್ಷಕರಲ್ಲ';

  @override
  String get errorNotPairingQr => 'ಇದು KINETIX ಬೋರ್ಡ್‌ನ QR ಕೋಡ್ ಅಲ್ಲ';

  @override
  String get errorFutureAttendance =>
      'ಮುಂದಿನ ದಿನಾಂಕದ ಹಾಜರಾತಿಯನ್ನು ಈಗ ತೆಗೆದುಕೊಳ್ಳಲು ಆಗುವುದಿಲ್ಲ';

  @override
  String get errorNotYourClass => 'ನೀವು ಈ ತರಗತಿಗೆ ಪಾಠ ಮಾಡುವುದಿಲ್ಲ';

  @override
  String get errorSubjectNotInClass => 'ಈ ವಿಷಯವನ್ನು ಈ ತರಗತಿಯಲ್ಲಿ ಕಲಿಸುವುದಿಲ್ಲ';

  @override
  String get errorDueDatePassed => 'ಸಲ್ಲಿಸುವ ದಿನಾಂಕ ಈಗಾಗಲೇ ಕಳೆದಿದೆ';

  @override
  String get errorEnterMarksFirst => 'ಪ್ರಕಟಿಸುವ ಮೊದಲು ಅಂಕಗಳನ್ನು ನಮೂದಿಸಿ';

  @override
  String get errorStudentsNotInClass => 'ಕೆಲವು ವಿದ್ಯಾರ್ಥಿಗಳು ಈ ತರಗತಿಯಲ್ಲಿ ಇಲ್ಲ';

  @override
  String get errorRecordingUploading => 'ರೆಕಾರ್ಡಿಂಗ್ ಇನ್ನೂ ಅಪ್‌ಲೋಡ್ ಆಗುತ್ತಿದೆ';

  @override
  String get errorRecordingNoClass =>
      'ಈ ರೆಕಾರ್ಡಿಂಗ್ ಯಾವುದೇ ತರಗತಿಯೊಂದಿಗೆ ಮಾಡಿಲ್ಲ, ಆದ್ದರಿಂದ ಹಂಚಿಕೊಳ್ಳಲು ಯಾರೂ ಇಲ್ಲ';

  @override
  String get recordingNotAvailable =>
      'ಈ ರೆಕಾರ್ಡಿಂಗ್ ಇನ್ನೂ ಲಭ್ಯವಿಲ್ಲ. ಇದು ಇನ್ನೂ ಬೋರ್ಡ್‌ನಿಂದ ಅಪ್‌ಲೋಡ್ ಆಗುತ್ತಿರಬಹುದು.';

  @override
  String get connectToBoard => 'ಬೋರ್ಡ್‌ಗೆ ಸಂಪರ್ಕಿಸಿ';

  @override
  String get connectToBoardBody =>
      'ಪಾಠ ಶುರು ಮಾಡಲು ತರಗತಿಯ ಬೋರ್ಡ್‌ನಲ್ಲಿರುವ QR ಕೋಡ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ';

  @override
  String get connect => 'ಸಂಪರ್ಕಿಸಿ';

  @override
  String get connected => 'ಸಂಪರ್ಕಗೊಂಡಿದೆ';

  @override
  String get endClass => 'ತರಗತಿ ಮುಗಿಸಿ';

  @override
  String get endClassTitle => 'ತರಗತಿ ಮುಗಿಸುವುದೇ?';

  @override
  String endClassBody(String board) {
    return '$board ನಿಮ್ಮನ್ನು ಸೈನ್ ಔಟ್ ಮಾಡಿ ಸಂಪರ್ಕದ ಪರದೆಗೆ ಮರಳುತ್ತದೆ.';
  }

  @override
  String classEnded(String board) {
    return '$board ನಲ್ಲಿ ತರಗತಿ ಮುಗಿದಿದೆ';
  }

  @override
  String noClassesOn(String weekday) {
    return '$weekdayದಂದು ಯಾವುದೇ ತರಗತಿಗಳಿಲ್ಲ';
  }

  @override
  String showDay(String day) {
    return '$day ತೋರಿಸಿ';
  }

  @override
  String get todaysClasses => 'ಇಂದಿನ ತರಗತಿಗಳು';

  @override
  String weekdayClasses(String weekday) {
    return '$weekdayದ ತರಗತಿಗಳು';
  }

  @override
  String classesOn(String date) {
    return '$date ರ ತರಗತಿಗಳು';
  }

  @override
  String get noClassesToday => 'ಇಂದು ಯಾವುದೇ ತರಗತಿಗಳಿಲ್ಲ';

  @override
  String periodCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಅವಧಿಗಳು',
      one: '1 ಅವಧಿ',
    );
    return '$_temp0';
  }

  @override
  String get attendanceTaken => 'ಹಾಜರಾತಿ ಆಗಿದೆ';

  @override
  String get attendanceOpensOnDay => 'ಹಾಜರಾತಿಯನ್ನು ಅದೇ ದಿನ ತೆಗೆದುಕೊಳ್ಳಬಹುದು';

  @override
  String get takeAttendance => 'ಹಾಜರಾತಿ ತೆಗೆದುಕೊಳ್ಳಿ';

  @override
  String get now => 'ಈಗ';

  @override
  String get teachOnBoard => 'ಬೋರ್ಡ್‌ನಲ್ಲಿ ಪಾಠ ಮಾಡಿ';

  @override
  String get attendance => 'ಹಾಜರಾತಿ';

  @override
  String get statusPresent => 'ಹಾಜರು';

  @override
  String get statusAbsent => 'ಗೈರು';

  @override
  String get statusLate => 'ತಡ';

  @override
  String get statusExcused => 'ರಜೆ';

  @override
  String countPresent(int count) {
    return '$count ಹಾಜರು';
  }

  @override
  String countAbsent(int count) {
    return '$count ಗೈರು';
  }

  @override
  String countLate(int count) {
    return '$count ತಡ';
  }

  @override
  String countExcused(int count) {
    return '$count ರಜೆ';
  }

  @override
  String attendanceSaved(String summary) {
    return 'ಹಾಜರಾತಿ ಉಳಿಸಲಾಗಿದೆ · $summary';
  }

  @override
  String attendanceUpdated(String summary) {
    return 'ಹಾಜರಾತಿ ಅಪ್‌ಡೇಟ್ ಆಗಿದೆ · $summary';
  }

  @override
  String get markAllPresent => 'ಎಲ್ಲರೂ ಹಾಜರು';

  @override
  String get noStudentsInClass => 'ಈ ತರಗತಿಯಲ್ಲಿ ಇನ್ನೂ ಯಾವುದೇ ವಿದ್ಯಾರ್ಥಿಗಳಿಲ್ಲ';

  @override
  String get attendanceAlreadyTaken =>
      'ಹಾಜರಾತಿ ಈಗಾಗಲೇ ತೆಗೆದುಕೊಳ್ಳಲಾಗಿದೆ. ಬದಲಾವಣೆಗಳು ಹಿಂದಿನ ನಮೂದುಗಳನ್ನು ಬದಲಾಯಿಸುತ್ತವೆ.';

  @override
  String get attendanceHelp =>
      'ಎಲ್ಲರೂ ಮೊದಲಿಗೆ ಹಾಜರು. ಗೈರು ಎಂದು ಗುರುತಿಸಲು ಟ್ಯಾಪ್ ಮಾಡಿ, ತಡ ಎಂದು ಗುರುತಿಸಲು ಒತ್ತಿ ಹಿಡಿಯಿರಿ.';

  @override
  String get update => 'ಅಪ್‌ಡೇಟ್ ಮಾಡಿ';

  @override
  String get submit => 'ಸಲ್ಲಿಸಿ';

  @override
  String get enterAllDigits => 'ಬೋರ್ಡ್‌ನಲ್ಲಿ ಕಾಣುವ ಎಲ್ಲಾ 6 ಅಂಕಿಗಳನ್ನು ನಮೂದಿಸಿ';

  @override
  String get enterCodeTitle => 'ಬೋರ್ಡ್‌ನಲ್ಲಿರುವ ಕೋಡ್ ನಮೂದಿಸಿ';

  @override
  String get enterCodeBody =>
      'ಇದು QR ಕೋಡ್‌ನ ಕೆಳಗಿರುವ 6 ಅಂಕಿಯ ಸಂಖ್ಯೆ. ಪ್ರತಿ 2 ನಿಮಿಷಕ್ಕೊಮ್ಮೆ ಹೊಸ ಕೋಡ್ ಬರುತ್ತದೆ.';

  @override
  String get scanInstead => 'ಬದಲಾಗಿ QR ಕೋಡ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ';

  @override
  String get youreConnected => 'ನೀವು ಸಂಪರ್ಕಗೊಂಡಿದ್ದೀರಿ';

  @override
  String boardReady(String board) {
    return '$board ನಿಮಗಾಗಿ ಸಿದ್ಧವಾಗಿದೆ';
  }

  @override
  String boardShowingClass(String board) {
    return '$board ನಲ್ಲಿ ನಿಮ್ಮ ತರಗತಿ ತೆರೆದಿದೆ';
  }

  @override
  String get labelBoard => 'ಬೋರ್ಡ್';

  @override
  String get labelClass => 'ತರಗತಿ';

  @override
  String get labelSubject => 'ವಿಷಯ';

  @override
  String get labelPeriod => 'ಅವಧಿ';

  @override
  String get freeSession => 'ಮುಕ್ತ ಸೆಷನ್';

  @override
  String get freeSessionBody =>
      'ಈಗ ವೇಳಾಪಟ್ಟಿಯಲ್ಲಿ ನಿಮಗೆ ಯಾವುದೇ ತರಗತಿ ಇಲ್ಲ, ಆದ್ದರಿಂದ ಬೋರ್ಡ್ ವಿದ್ಯಾರ್ಥಿಗಳ ಪಟ್ಟಿ ಇಲ್ಲದೆ ತೆರೆಯುತ್ತದೆ. 2 ಗಂಟೆಗಳ ನಂತರ ನೀವು ತಾನಾಗಿಯೇ ಸೈನ್ ಔಟ್ ಆಗುತ್ತೀರಿ.';

  @override
  String get qrNotOurs =>
      'ಇದು KINETIX ಬೋರ್ಡ್‌ನ ಕೋಡ್ ಅಲ್ಲ. ಬೋರ್ಡ್‌ನ ಪರದೆಯ ಮೇಲಿರುವ QR ಕೋಡ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ.';

  @override
  String get scanTitle => 'ಬೋರ್ಡ್‌ನ QR ಕೋಡ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ';

  @override
  String get torch => 'ಟಾರ್ಚ್';

  @override
  String get cameraDenied =>
      'ಸ್ಕ್ಯಾನ್ ಮಾಡಲು ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಕ್ಯಾಮೆರಾ ಅನುಮತಿ ನೀಡಿ, ಅಥವಾ ಬದಲಾಗಿ ಕೋಡ್ ನಮೂದಿಸಿ.';

  @override
  String get cameraUnavailable => 'ಕ್ಯಾಮೆರಾ ಲಭ್ಯವಿಲ್ಲ. ಬದಲಾಗಿ ಕೋಡ್ ನಮೂದಿಸಿ.';

  @override
  String get pointCamera =>
      'ಕ್ಯಾಮೆರಾವನ್ನು ಬೋರ್ಡ್‌ನಲ್ಲಿರುವ QR ಕೋಡ್ ಕಡೆಗೆ ತೋರಿಸಿ';

  @override
  String get enterCodeInstead => 'ಬದಲಾಗಿ ಕೋಡ್ ನಮೂದಿಸಿ';

  @override
  String get dueDate => 'ಸಲ್ಲಿಸುವ ದಿನಾಂಕ';

  @override
  String get assign => 'ನೀಡಿ';

  @override
  String get noClassesInTimetable =>
      'ನಿಮ್ಮ ವೇಳಾಪಟ್ಟಿಯಲ್ಲಿ ಇನ್ನೂ ಯಾವುದೇ ತರಗತಿಗಳಿಲ್ಲ';

  @override
  String get chooseSubject => 'ವಿಷಯ ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get titleLabel => 'ಶೀರ್ಷಿಕೆ';

  @override
  String get homeworkTitleHint => 'ಉದಾ. ಅಭ್ಯಾಸ 4.2, ಪ್ರಶ್ನೆಗಳು 1–5';

  @override
  String get homeworkTitleRequired => 'ಹೋಂವರ್ಕ್‌ಗೆ ಶೀರ್ಷಿಕೆ ನೀಡಿ';

  @override
  String get instructionsOptional => 'ಸೂಚನೆಗಳು (ಐಚ್ಛಿಕ)';

  @override
  String homeworkAssigned(String className) {
    return '$className ಗೆ ಹೋಂವರ್ಕ್ ನೀಡಲಾಗಿದೆ';
  }

  @override
  String get noHomework =>
      'ಇನ್ನೂ ಯಾವುದೇ ಹೋಂವರ್ಕ್ ಇಲ್ಲ.\nತರಗತಿಗೆ ಹೋಂವರ್ಕ್ ನೀಡಿದರೆ ಅದು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';

  @override
  String get dueToday => 'ಸಲ್ಲಿಕೆ: ಇಂದು';

  @override
  String get dueTomorrow => 'ಸಲ್ಲಿಕೆ: ನಾಳೆ';

  @override
  String dueOn(String date) {
    return 'ಸಲ್ಲಿಕೆ: $date';
  }

  @override
  String get wasDueYesterday => 'ನಿನ್ನೆ ಸಲ್ಲಿಸಬೇಕಿತ್ತು';

  @override
  String wasDueOn(String date) {
    return '$date ರಂದು ಸಲ್ಲಿಸಬೇಕಿತ್ತು';
  }

  @override
  String get heldOn => 'ದಿನಾಂಕ';

  @override
  String get enterMaxMarks => 'ಗರಿಷ್ಠ ಅಂಕಗಳನ್ನು ನಮೂದಿಸಿ';

  @override
  String get maxMustBePositive => '0 ಕ್ಕಿಂತ ಹೆಚ್ಚು ಇರಬೇಕು';

  @override
  String get maxAtMost1000 => 'ಗರಿಷ್ಠ 1000';

  @override
  String get create => 'ರಚಿಸಿ';

  @override
  String get assessmentTitleHint =>
      'ಉದಾ. ಯೂನಿಟ್ ಟೆಸ್ಟ್ 2: Redemption of shares';

  @override
  String get assessmentTitleRequired => 'ಶೀರ್ಷಿಕೆ ನೀಡಿ';

  @override
  String get kind => 'ಪ್ರಕಾರ';

  @override
  String get outOf => 'ಒಟ್ಟು ಅಂಕ';

  @override
  String get marksPrivateNote =>
      'ನೀವು ಪ್ರಕಟಿಸುವವರೆಗೆ ಅಂಕಗಳು ನಿಮಗೆ ಮಾತ್ರ ಕಾಣುತ್ತವೆ. ನಂತರ ವಿದ್ಯಾರ್ಥಿಗಳು ಮತ್ತು ಅವರ ಪೋಷಕರು ತಮ್ಮ ಅಂಕಗಳು ಮತ್ತು ತರಗತಿ ಸರಾಸರಿಯನ್ನು ನೋಡಬಹುದು.';

  @override
  String get kindTest => 'ಟೆಸ್ಟ್';

  @override
  String get kindAssignment => 'ಅಸೈನ್‌ಮೆಂಟ್';

  @override
  String get kindInternal => 'ಆಂತರಿಕ';

  @override
  String get kindExam => 'ಪರೀಕ್ಷೆ';

  @override
  String get kindPractical => 'ಪ್ರಾಯೋಗಿಕ';

  @override
  String noAssessments(String className) {
    return '$className ಗೆ ಇನ್ನೂ ಯಾವುದೇ ಟೆಸ್ಟ್ ಅಥವಾ ಅಸೈನ್‌ಮೆಂಟ್ ಇಲ್ಲ.\nಒಂದನ್ನು ಸೇರಿಸಿ, ಅಂಕಗಳನ್ನು ನಮೂದಿಸಿ ಮತ್ತು ಪೋಷಕರಿಗೆ ಪ್ರಕಟಿಸಿ.';
  }

  @override
  String get published => 'ಪ್ರಕಟಿಸಲಾಗಿದೆ';

  @override
  String get draft => 'ಕರಡು';

  @override
  String get classAverage => 'ತರಗತಿ ಸರಾಸರಿ';

  @override
  String noMarksYet(String max) {
    return 'ಇನ್ನೂ ಅಂಕಗಳಿಲ್ಲ · ಒಟ್ಟು $max';
  }

  @override
  String enteredOf(int entered, int total) {
    return '$total ರಲ್ಲಿ $entered ನಮೂದಾಗಿದೆ';
  }

  @override
  String enteredCount(int entered) {
    return '$entered ನಮೂದಾಗಿದೆ';
  }

  @override
  String get notANumber => 'ಸಂಖ್ಯೆ ಅಲ್ಲ';

  @override
  String maxN(String max) {
    return 'ಗರಿಷ್ಠ $max';
  }

  @override
  String marksNeedFixing(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಅಂಕಗಳನ್ನು ಸರಿಪಡಿಸಬೇಕು',
      one: 'ಒಂದು ಅಂಕವನ್ನು ಸರಿಪಡಿಸಬೇಕು',
    );
    return '$_temp0';
  }

  @override
  String markedOf(int marked, int total) {
    return '$total ರಲ್ಲಿ $marked ಅಂಕ ನಮೂದಾಗಿದೆ';
  }

  @override
  String get marksSaved => 'ಅಂಕಗಳನ್ನು ಉಳಿಸಲಾಗಿದೆ';

  @override
  String savedClassAverage(String average, String max) {
    return 'ತರಗತಿ ಸರಾಸರಿ $average / $max';
  }

  @override
  String get familiesSeeUpdate => 'ಪೋಷಕರಿಗೆ ಬದಲಾವಣೆ ಕಾಣುತ್ತದೆ';

  @override
  String get publishTitle => 'ಅಂಕಗಳನ್ನು ಪ್ರಕಟಿಸುವುದೇ?';

  @override
  String get publishBody =>
      'ತರಗತಿಯ ವಿದ್ಯಾರ್ಥಿಗಳು ಮತ್ತು ಪೋಷಕರಿಗೆ ಸೂಚನೆ ಹೋಗುತ್ತದೆ. ಅವರು ತಮ್ಮ ಅಂಕಗಳು, ತರಗತಿ ಸರಾಸರಿ ಮತ್ತು ಗರಿಷ್ಠ ಅಂಕವನ್ನು ನೋಡಬಹುದು.';

  @override
  String publishBlank(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ಇನ್ನೂ ಅಂಕಗಳಿಲ್ಲ.',
      one: '1 ವಿದ್ಯಾರ್ಥಿಗೆ ಇನ್ನೂ ಅಂಕಗಳಿಲ್ಲ.',
    );
    return '$_temp0';
  }

  @override
  String get publishCanCorrect =>
      'ಪ್ರಕಟಿಸಿದ ನಂತರವೂ ನೀವು ಅಂಕಗಳನ್ನು ಸರಿಪಡಿಸಬಹುದು.';

  @override
  String get publish => 'ಪ್ರಕಟಿಸಿ';

  @override
  String publishedNotified(String title) {
    return '$title ಪ್ರಕಟಿಸಲಾಗಿದೆ · ಪೋಷಕರಿಗೆ ಸೂಚನೆ ಕಳುಹಿಸಲಾಗಿದೆ';
  }

  @override
  String get statAverage => 'ಸರಾಸರಿ';

  @override
  String get statHighest => 'ಗರಿಷ್ಠ';

  @override
  String get statLowest => 'ಕನಿಷ್ಠ';

  @override
  String get statMarked => 'ನಮೂದು';

  @override
  String typeMarksHint(String max) {
    return '$max ರಲ್ಲಿ ಅಂಕಗಳನ್ನು ಟೈಪ್ ಮಾಡಿ. ಕೀಪ್ಯಾಡ್‌ನ Next ಬಟನ್ ಮುಂದಿನ ವಿದ್ಯಾರ್ಥಿಗೆ ಕರೆದೊಯ್ಯುತ್ತದೆ.';
  }

  @override
  String get columnStudent => 'ವಿದ್ಯಾರ್ಥಿ';

  @override
  String outOfN(String max) {
    return 'ಒಟ್ಟು $max';
  }

  @override
  String get editRemark => 'ಟಿಪ್ಪಣಿ ಬದಲಿಸಿ';

  @override
  String get addRemark => 'ಟಿಪ್ಪಣಿ ಸೇರಿಸಿ';

  @override
  String get absentShort => 'ಗೈರು';

  @override
  String marksOverMax(int count, String max) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಅಂಕಗಳು $max ಕ್ಕಿಂತ ಹೆಚ್ಚಿವೆ',
      one: 'ಒಂದು ಅಂಕ $max ಕ್ಕಿಂತ ಹೆಚ್ಚಿದೆ',
    );
    return '$_temp0';
  }

  @override
  String get notSavedYet => 'ಇನ್ನೂ ಉಳಿಸಿಲ್ಲ';

  @override
  String get publishedFamiliesSee =>
      'ಪ್ರಕಟಿಸಲಾಗಿದೆ · ಪೋಷಕರು ಈ ಅಂಕಗಳನ್ನು ನೋಡಬಹುದು';

  @override
  String get typeMarksThenSave => 'ಅಂಕಗಳನ್ನು ಟೈಪ್ ಮಾಡಿ, ನಂತರ ಉಳಿಸಿ';

  @override
  String get savedOnlyYou => 'ಉಳಿಸಲಾಗಿದೆ · ಈ ಅಂಕಗಳು ನಿಮಗೆ ಮಾತ್ರ ಕಾಣುತ್ತವೆ';

  @override
  String remarkFor(String name) {
    return '$name ಗಾಗಿ ಟಿಪ್ಪಣಿ';
  }

  @override
  String get remarkFamiliesSee => 'ಪೋಷಕರು ಇದನ್ನು ಅಂಕಗಳೊಂದಿಗೆ ನೋಡುತ್ತಾರೆ.';

  @override
  String get remarkHint =>
      'ಉದಾ. ಅಚ್ಚುಕಟ್ಟಾದ ಕೆಲಸ; ಜರ್ನಲ್ ಎಂಟ್ರಿಗಳನ್ನು ಪುನರಾವರ್ತಿಸಿ';

  @override
  String get noMessages =>
      'ಇನ್ನೂ ಯಾವುದೇ ಸಂದೇಶಗಳಿಲ್ಲ.\n“ಹೊಸ ಸಂದೇಶ” ಬಳಸಿ ವಿದ್ಯಾರ್ಥಿಯ ಪೋಷಕರಿಗೆ ಬರೆಯಿರಿ, ಅಥವಾ ಪೋಷಕರು ನಿಮಗೆ ಬರೆಯುವವರೆಗೆ ಕಾಯಿರಿ.';

  @override
  String get noMessagesPreview => 'ಇನ್ನೂ ಸಂದೇಶಗಳಿಲ್ಲ';

  @override
  String aboutParent(String student, String className) {
    return '$student ಅವರ ಪೋಷಕರು · $className';
  }

  @override
  String aboutStudent(String className) {
    return 'ವಿದ್ಯಾರ್ಥಿ · $className';
  }

  @override
  String get pullForEarlier => 'ಹಿಂದಿನ ಸಂದೇಶಗಳಿಗಾಗಿ ಕೆಳಗೆ ಎಳೆಯಿರಿ';

  @override
  String chatTop(String student, String family) {
    return '$student ಕುರಿತು $family ಅವರೊಂದಿಗಿನ ಸಂದೇಶಗಳು';
  }

  @override
  String get notSentRetry => 'ಕಳುಹಿಸಲಾಗಿಲ್ಲ · ಮತ್ತೆ ಕಳುಹಿಸಲು ಟ್ಯಾಪ್ ಮಾಡಿ';

  @override
  String get sending => 'ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…';

  @override
  String get messageCopied => 'ಸಂದೇಶ ನಕಲಿಸಲಾಗಿದೆ';

  @override
  String messageHint(String name) {
    return '$name ಅವರಿಗೆ ಸಂದೇಶ ಬರೆಯಿರಿ';
  }

  @override
  String writeToFamily(String student) {
    return '$student ಅವರ ಕುಟುಂಬಕ್ಕೆ ಬರೆಯಿರಿ';
  }

  @override
  String get threadPrivacy =>
      'ಈ ಸಂಭಾಷಣೆ ನಿಮ್ಮ ಮತ್ತು ನೀವು ಆಯ್ಕೆಮಾಡುವ ವ್ಯಕ್ತಿಯ ನಡುವೆ ಇರುತ್ತದೆ. ಶಾಲೆಯ ಮುಖ್ಯಸ್ಥರು ಇದನ್ನು ಪರಿಶೀಲಿಸಬಹುದು.';

  @override
  String get relationFather => 'ತಂದೆ';

  @override
  String get relationMother => 'ತಾಯಿ';

  @override
  String get relationGuardian => 'ಪೋಷಕರು';

  @override
  String get relationParent => 'ಪೋಷಕರು';

  @override
  String get searchStudents => 'ಹೆಸರು ಅಥವಾ ರೋಲ್ ನಂಬರ್ ಮೂಲಕ ಹುಡುಕಿ';

  @override
  String get noStudentsTaught =>
      'ನೀವು ಕಲಿಸುವ ತರಗತಿಗಳಲ್ಲಿ ಇನ್ನೂ ಯಾವುದೇ ವಿದ್ಯಾರ್ಥಿಗಳಿಲ್ಲ';

  @override
  String noStudentMatches(String query) {
    return '“$query” ಗೆ ಹೊಂದುವ ವಿದ್ಯಾರ್ಥಿ ಇಲ್ಲ';
  }

  @override
  String get noGuardianOnRecord => 'ಯಾವುದೇ ಪೋಷಕರ ಮಾಹಿತಿ ದಾಖಲಾಗಿಲ್ಲ';

  @override
  String get shareTitle => 'ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳುವುದೇ?';

  @override
  String shareBody(String className, String title) {
    return '$className ವಿದ್ಯಾರ್ಥಿಗಳು ಮತ್ತು ಅವರ ಪೋಷಕರು ತಮ್ಮ ಆ್ಯಪ್‌ಗಳಲ್ಲಿ \"$title\" ನೋಡಬಹುದು. ಗೈರಾದ ವಿದ್ಯಾರ್ಥಿಗಳ ಪೋಷಕರಿಗೆ ಸೂಚನೆ ಹೋಗುತ್ತದೆ.';
  }

  @override
  String sharedWith(String className) {
    return '$className ಜೊತೆ ಹಂಚಿಕೊಳ್ಳಲಾಗಿದೆ';
  }

  @override
  String get noRecordings =>
      'ಇನ್ನೂ ಯಾವುದೇ ರೆಕಾರ್ಡಿಂಗ್ ಇಲ್ಲ.\nತರಗತಿಯ ಸಮಯದಲ್ಲಿ ಬೋರ್ಡ್‌ನಲ್ಲಿ ರೆಕಾರ್ಡ್ ಬಟನ್ ಒತ್ತಿ. ಬೋರ್ಡ್ ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ತಕ್ಷಣ ಪಾಠ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';

  @override
  String get uploading => 'ಅಪ್‌ಲೋಡ್ ಆಗುತ್ತಿದೆ';

  @override
  String get sharedWithClass => 'ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಲಾಗಿದೆ';

  @override
  String get noClass => 'ತರಗತಿ ಇಲ್ಲ';

  @override
  String get notShared => 'ಹಂಚಿಕೊಂಡಿಲ್ಲ';

  @override
  String get preparingTranscript => 'ಟ್ರಾನ್ಸ್‌ಕ್ರಿಪ್ಟ್ ಸಿದ್ಧವಾಗುತ್ತಿದೆ';

  @override
  String get transcriptReady => 'ಟ್ರಾನ್ಸ್‌ಕ್ರಿಪ್ಟ್ ಸಿದ್ಧ';

  @override
  String get noTranscript => 'ಟ್ರಾನ್ಸ್‌ಕ್ರಿಪ್ಟ್ ಇಲ್ಲ';

  @override
  String get noSound => 'ಧ್ವನಿ ಇಲ್ಲ';

  @override
  String get notLinkedToClass => 'ಯಾವುದೇ ತರಗತಿಗೆ ಸಂಬಂಧಿಸಿಲ್ಲ';

  @override
  String get play => 'ಪ್ಲೇ ಮಾಡಿ';

  @override
  String get shareWithClass => 'ತರಗತಿಯೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಿ';

  @override
  String get durationUnderMinute => 'ಒಂದು ನಿಮಿಷಕ್ಕಿಂತ ಕಡಿಮೆ';

  @override
  String durationMinutes(int minutes) {
    return '$minutes ನಿಮಿಷ';
  }

  @override
  String durationHours(int hours) {
    return '$hours ಗಂಟೆ';
  }

  @override
  String durationHoursMinutes(int hours, int minutes) {
    return '$hours ಗಂ $minutes ನಿಮಿಷ';
  }

  @override
  String get signOutTitle => 'ಸೈನ್ ಔಟ್ ಮಾಡುವುದೇ?';

  @override
  String get signOutBody =>
      'ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಲು ನಿಮ್ಮ ಪಾಸ್‌ವರ್ಡ್ ಬೇಕಾಗುತ್ತದೆ.';

  @override
  String get signOut => 'ಸೈನ್ ಔಟ್ ಮಾಡಿ';

  @override
  String comingLater(String feature) {
    return '$feature ಮುಂದಿನ ಅಪ್‌ಡೇಟ್‌ನಲ್ಲಿ ಬರಲಿದೆ';
  }

  @override
  String get account => 'ಖಾತೆ';

  @override
  String get institution => 'ಸಂಸ್ಥೆ';

  @override
  String get language => 'ಭಾಷೆ';

  @override
  String get server => 'ಸರ್ವರ್';

  @override
  String get comingSoon => 'ಶೀಘ್ರದಲ್ಲೇ ಬರಲಿದೆ';

  @override
  String get announcements => 'ಪ್ರಕಟಣೆಗಳು';

  @override
  String get announcementsBody => 'ನಿಮ್ಮ ತರಗತಿಗಳಿಗೆ ಸೂಚನೆಗಳನ್ನು ಕಳುಹಿಸಿ';

  @override
  String get studentDoubts => 'ವಿದ್ಯಾರ್ಥಿಗಳ ಸಂದೇಹಗಳು';

  @override
  String get studentDoubtsBody => 'ವಿದ್ಯಾರ್ಥಿಗಳ ಪ್ರಶ್ನೆಗಳಿಗೆ ಉತ್ತರಿಸಿ';

  @override
  String get mcqTests => 'MCQ ಟೆಸ್ಟ್‌ಗಳು';

  @override
  String get mcqTestsBody =>
      'ಬೋರ್ಡ್ ರಸಪ್ರಶ್ನೆಗಳೊಂದಿಗೆ ಹೊಂದಿಕೊಳ್ಳುವ ಆನ್‌ಲೈನ್ ಟೆಸ್ಟ್‌ಗಳು';

  @override
  String get roleAdmin => 'ಆಡಳಿತಾಧಿಕಾರಿ';

  @override
  String get rolePrincipal => 'ಪ್ರಾಂಶುಪಾಲರು';

  @override
  String get roleHod => 'ವಿಭಾಗದ ಮುಖ್ಯಸ್ಥರು';

  @override
  String get roleTeacher => 'ಶಿಕ್ಷಕರು';

  @override
  String get roleStudent => 'ವಿದ್ಯಾರ್ಥಿ';

  @override
  String get roleParent => 'ಪೋಷಕರು';

  @override
  String get roleLibrarian => 'ಗ್ರಂಥಪಾಲಕರು';

  @override
  String get roleAccountant => 'ಲೆಕ್ಕಿಗರು';

  @override
  String get languageSaveFailed =>
      'ಈ ಫೋನ್‌ನಲ್ಲಿ ಭಾಷೆ ಬದಲಾಗಿದೆ. ಮುಂದಿನ ಬಾರಿ ಆನ್‌ಲೈನ್ ಆದಾಗ ಇದು ನಿಮ್ಮ ಖಾತೆಯಲ್ಲಿ ಉಳಿಯುತ್ತದೆ.';

  @override
  String holidayNoClasses(String title) {
    return 'ರಜೆ: $title. ತರಗತಿಗಳಿಲ್ಲ.';
  }

  @override
  String get teaching => 'ಬೋಧನೆ';

  @override
  String get calendar => 'ಕ್ಯಾಲೆಂಡರ್';

  @override
  String get calendarBody => 'ರಜೆಗಳು, ಪರೀಕ್ಷೆಗಳು ಮತ್ತು ಕಾರ್ಯಕ್ರಮಗಳು';

  @override
  String get calendarHoliday => 'ರಜೆ';

  @override
  String get calendarExam => 'ಪರೀಕ್ಷೆ';

  @override
  String get calendarEvent => 'ಕಾರ್ಯಕ್ರಮ';

  @override
  String get calendarEmpty => 'ಮುಂದಿನ ಆರು ತಿಂಗಳ ಕ್ಯಾಲೆಂಡರ್‌ನಲ್ಲಿ ಏನೂ ಇಲ್ಲ.';

  @override
  String calendarFor(String programs) {
    return '$programs ಗಾಗಿ';
  }

  @override
  String get syllabus => 'ಪಠ್ಯಕ್ರಮ';

  @override
  String get syllabusProgress => 'ಪಠ್ಯಕ್ರಮದ ಪ್ರಗತಿ';

  @override
  String get syllabusProgressBody => 'ಪ್ರತಿ ತರಗತಿಗೆ ಕಲಿಸಿದ ವಿಷಯಗಳನ್ನು ಗುರುತಿಸಿ';

  @override
  String get syllabusUnlinked =>
      'ಈ ವಿಷಯವನ್ನು ಇನ್ನೂ ಪಠ್ಯಕ್ರಮಕ್ಕೆ ಜೋಡಿಸಿಲ್ಲ. ನಿಮ್ಮ ಆಡಳಿತಾಧಿಕಾರಿ KINETIX ERP → Syllabus ನಲ್ಲಿ ಜೋಡಿಸಬಹುದು.';

  @override
  String topicsTaught(int covered, int total) {
    return '$total ರಲ್ಲಿ $covered ವಿಷಯಗಳನ್ನು ಕಲಿಸಲಾಗಿದೆ';
  }

  @override
  String chapterTaught(int covered, int total) {
    return '$covered/$total';
  }

  @override
  String taughtOn(String date) {
    return '$date ರಂದು ಕಲಿಸಲಾಗಿದೆ';
  }

  @override
  String taughtOnBy(String date, String name) {
    return '$date ರಂದು ಕಲಿಸಲಾಗಿದೆ · $name';
  }

  @override
  String get taughtOnWhichDay => 'ಯಾವ ದಿನ ಕಲಿಸಲಾಯಿತು?';

  @override
  String get topicVideosTooltip => 'ಈ ವಿಷಯದ ವೀಡಿಯೊಗಳು';

  @override
  String get topicVideosTitle => 'ಈ ತರಗತಿಗೆ ವೀಡಿಯೊಗಳು';

  @override
  String get topicVideoLink => 'ಯೂಟ್ಯೂಬ್ ಲಿಂಕ್';

  @override
  String get topicVideoLinkHelp =>
      'ಲಿಂಕ್ ಅಂಟಿಸಿ. ಶೀರ್ಷಿಕೆ ಯೂಟ್ಯೂಬ್‌ನಿಂದ ಬರುತ್ತದೆ. ಪ್ರಾಂಶುಪಾಲರು ಹಂಚಲು ಅನುಮೋದಿಸುವವರೆಗೆ ಈ ತರಗತಿ ಮಾತ್ರ ನೋಡುತ್ತದೆ.';

  @override
  String get topicVideoAdd => 'ವೀಡಿಯೊ ಸೇರಿಸಿ';

  @override
  String get topicVideoAdded => 'ಈ ತರಗತಿಗೆ ವೀಡಿಯೊ ಸೇರಿಸಲಾಗಿದೆ';

  @override
  String get topicVideoNotAdded =>
      'ಆ ವೀಡಿಯೊ ಸೇರಿಸಲಾಗಲಿಲ್ಲ. ಲಿಂಕ್ ಪರೀಕ್ಷಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get topicVideoNone => 'ನೀವು ಈ ವಿಷಯಕ್ಕೆ ಇನ್ನೂ ವೀಡಿಯೊ ಸೇರಿಸಿಲ್ಲ.';

  @override
  String get topicVideoShare => 'ಎಲ್ಲರೊಂದಿಗೆ ಹಂಚಲು ಕೋರಿ';

  @override
  String get topicVideoShareSent => 'ಅನುಮೋದನೆಗಾಗಿ ಪ್ರಾಂಶುಪಾಲರಿಗೆ ಕಳುಹಿಸಲಾಗಿದೆ';

  @override
  String get topicVideoStatusNone => 'ಈ ತರಗತಿ ಮಾತ್ರ';

  @override
  String get topicVideoStatusPending => 'ಅನುಮೋದನೆಗೆ ಕಾಯುತ್ತಿದೆ';

  @override
  String get topicVideoStatusApproved => 'ಎಲ್ಲರೊಂದಿಗೆ ಹಂಚಲಾಗಿದೆ';

  @override
  String get topicVideoStatusRejected => 'ಅನುಮೋದನೆ ಸಿಗಲಿಲ್ಲ';

  @override
  String get topicVideoRemove => 'ವೀಡಿಯೊ ತೆಗೆಯಿರಿ';

  @override
  String get topicMarked => 'ಕಲಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಲಾಗಿದೆ';

  @override
  String get topicUnmarked => 'ಕಲಿಸಿಲ್ಲ ಎಂದು ಗುರುತಿಸಲಾಗಿದೆ';

  @override
  String get noClassesAssigned => 'ನೀವು ಇನ್ನೂ ಯಾವುದೇ ತರಗತಿಗೆ ಕಲಿಸುತ್ತಿಲ್ಲ.';

  @override
  String get submissions => 'ಸಲ್ಲಿಕೆಗಳು';

  @override
  String get statusHandedIn => 'ಸಲ್ಲಿಸಲಾಗಿದೆ';

  @override
  String get statusChecked => 'ಪರಿಶೀಲಿಸಲಾಗಿದೆ';

  @override
  String get statusReturned => 'ಹಿಂದಿರುಗಿಸಲಾಗಿದೆ';

  @override
  String get statusNotHandedIn => 'ಸಲ್ಲಿಸಿಲ್ಲ';

  @override
  String handedInAt(String when) {
    return '$when ರಂದು ಸಲ್ಲಿಸಲಾಗಿದೆ';
  }

  @override
  String get answer => 'ಉತ್ತರ';

  @override
  String get photosAndFiles => 'ಫೋಟೋಗಳು ಮತ್ತು ಫೈಲ್‌ಗಳು';

  @override
  String get openPdf => 'PDF ತೆರೆಯಿರಿ';

  @override
  String get couldNotOpenFile =>
      'ಈ ಫೈಲ್ ತೆರೆಯಲಾಗಲಿಲ್ಲ. PDF ತೆರೆಯುವ ಆ್ಯಪ್ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿ.';

  @override
  String get remarkOptional => 'ಟಿಪ್ಪಣಿ (ಐಚ್ಛಿಕ)';

  @override
  String get reviewRemarkHint => 'ಉದಾ. ಉತ್ತಮ ಕೆಲಸ, ಅಥವಾ ಏನನ್ನು ಮತ್ತೆ ಮಾಡಬೇಕು';

  @override
  String get returnWork => 'ಮತ್ತೆ ಮಾಡಲು ಹಿಂದಿರುಗಿಸಿ';

  @override
  String get checkWork => 'ಪರಿಶೀಲಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಿ';

  @override
  String get reviewNotifies =>
      'ವಿದ್ಯಾರ್ಥಿ ಮತ್ತು ಅವರ ಪೋಷಕರಿಗೆ ನಿಮ್ಮ ಟಿಪ್ಪಣಿಯೊಂದಿಗೆ ತಿಳಿಸಲಾಗುತ್ತದೆ.';

  @override
  String workChecked(String name) {
    return '$name ಅವರ ಹೋಂವರ್ಕ್ ಪರಿಶೀಲಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಲಾಗಿದೆ';
  }

  @override
  String workReturned(String name) {
    return '$name ಅವರ ಹೋಂವರ್ಕ್ ಮತ್ತೆ ಮಾಡಲು ಹಿಂದಿರುಗಿಸಲಾಗಿದೆ';
  }

  @override
  String photoOf(int index, int count) {
    return 'ಫೋಟೋ $index / $count';
  }

  @override
  String get errorNothingHandedIn => 'ಇನ್ನೂ ಏನನ್ನೂ ಸಲ್ಲಿಸಿಲ್ಲ';

  @override
  String get errorTopicNotInSyllabus => 'ಈ ವಿಷಯವು ಈ ಪಠ್ಯಕ್ರಮದಲ್ಲಿ ಇಲ್ಲ';

  @override
  String get errorFutureCoverage =>
      'ಮುಂದಿನ ದಿನಾಂಕಕ್ಕೆ ವಿಷಯವನ್ನು ಕಲಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಲಾಗದು';

  @override
  String get errorValidation =>
      'ಕೆಲವು ವಿವರಗಳು ಸರಿಯಿಲ್ಲ. ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get yearPlan => 'ವಾರ್ಷಿಕ ಯೋಜನೆ';

  @override
  String get yearPlanNone =>
      'ಇನ್ನೂ ವಾರ್ಷಿಕ ಯೋಜನೆ ಇಲ್ಲ. ನಿಮ್ಮ ವೇಳಾಪಟ್ಟಿಯ ಪ್ರಕಾರ, ರಜೆ ಮತ್ತು ಪರೀಕ್ಷೆಗಳನ್ನು ಬಿಟ್ಟು, KINETIX ಈ ವಿಷಯದ ಪಠ್ಯಕ್ರಮವನ್ನು ಅವಧಿಯ ವಾರಗಳಿಗೆ ಹಂಚಬಹುದು. ನಂತರ ನೀವು ವಿಷಯಗಳನ್ನು ಬದಲಿಸಬಹುದು.';

  @override
  String get makeYearPlan => 'ವಾರ್ಷಿಕ ಯೋಜನೆ ಮಾಡಿ';

  @override
  String get makePlan => 'ಯೋಜನೆ ಮಾಡಿ';

  @override
  String get remakeYearPlan => 'ಯೋಜನೆಯನ್ನು ಮತ್ತೆ ಮಾಡಿ';

  @override
  String get remakeYearPlanTitle => 'ವಾರ್ಷಿಕ ಯೋಜನೆಯನ್ನು ಮತ್ತೆ ಮಾಡಬೇಕೇ?';

  @override
  String get remakeYearPlanBody =>
      'ನೀವು ಆರಿಸುವ ದಿನಾಂಕಗಳಿಂದ ಎಲ್ಲಾ ವಾರಗಳನ್ನು ಮತ್ತೆ ಯೋಜಿಸಲಾಗುತ್ತದೆ, ನೀವು ಬದಲಿಸಿದ ವಿಷಯಗಳು ಹಿಂದಿನ ಸ್ಥಾನಕ್ಕೆ ಹೋಗುತ್ತವೆ. ಈಗಾಗಲೇ ಕಲಿಸಿದ ವಿಷಯಗಳು ಹಾಗೆಯೇ ಉಳಿಯುತ್ತವೆ.';

  @override
  String get remake => 'ಮತ್ತೆ ಮಾಡಿ';

  @override
  String get planDatesNote =>
      'ನೀವು ದಿನಾಂಕಗಳನ್ನು ಬದಲಿಸದಿದ್ದರೆ, ಯೋಜನೆ ಇಂದಿನಿಂದ 16 ವಾರಗಳು, ಶೈಕ್ಷಣಿಕ ವರ್ಷದ ಕೊನೆಯವರೆಗೆ ಇರುತ್ತದೆ.';

  @override
  String get planStartsOn => 'ಪ್ರಾರಂಭ ದಿನಾಂಕ';

  @override
  String get planEndsOn => 'ಮುಕ್ತಾಯ ದಿನಾಂಕ';

  @override
  String get yearPlanMade => 'ವಾರ್ಷಿಕ ಯೋಜನೆ ಸಿದ್ಧವಾಗಿದೆ';

  @override
  String get yearPlanUpdated => 'ಯೋಜನೆ ನವೀಕರಿಸಲಾಗಿದೆ';

  @override
  String get planNotStarted => 'ಪ್ರಾರಂಭವಾಗಿಲ್ಲ';

  @override
  String get planOnTrack => 'ಸಮಯಕ್ಕೆ ಸರಿಯಾಗಿದೆ';

  @override
  String get planAhead => 'ಯೋಜನೆಗಿಂತ ಮುಂದಿದೆ';

  @override
  String planBehindBy(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ವಿಷಯಗಳು ಹಿಂದಿವೆ',
      one: '1 ವಿಷಯ ಹಿಂದಿದೆ',
    );
    return '$_temp0';
  }

  @override
  String weekOf(String date) {
    return '$date ರ ವಾರ';
  }

  @override
  String get thisWeek => 'ಈ ವಾರ';

  @override
  String periodsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಅವಧಿಗಳು',
      one: '1 ಅವಧಿ',
    );
    return '$_temp0';
  }

  @override
  String get planLate => 'ತಡವಾಗಿದೆ';

  @override
  String get changeWeek => 'ವಾರ ಅಥವಾ ಅವಧಿಗಳನ್ನು ಬದಲಿಸಿ';

  @override
  String get planWeek => 'ವಾರ';

  @override
  String get planPeriods => 'ಅವಧಿಗಳು';

  @override
  String get fewerPeriods => 'ಕಡಿಮೆ ಅವಧಿಗಳು';

  @override
  String get morePeriods => 'ಹೆಚ್ಚು ಅವಧಿಗಳು';

  @override
  String get planLesson => 'ಯೋಜನೆ';

  @override
  String get lessonPlanned => 'ಯೋಜಿಸಲಾಗಿದೆ';

  @override
  String get lessonPlan => 'ಪಾಠ ಯೋಜನೆ';

  @override
  String get lessonTopics => 'ವಿಷಯಗಳು';

  @override
  String get noTopicsChosen => 'ಯಾವುದೇ ವಿಷಯ ಆರಿಸಿಲ್ಲ';

  @override
  String get chooseTopics => 'ವಿಷಯಗಳನ್ನು ಆರಿಸಿ';

  @override
  String get suggestedThisWeek => 'ಈ ವಾರದ ವಾರ್ಷಿಕ ಯೋಜನೆಯಲ್ಲಿದೆ';

  @override
  String get lessonObjectives => 'ಉದ್ದೇಶಗಳು';

  @override
  String get objectiveHint => 'ವಿದ್ಯಾರ್ಥಿಗಳು … ಮಾಡಲು ಸಾಧ್ಯವಾಗುತ್ತದೆ';

  @override
  String get addObjective => 'ಉದ್ದೇಶ ಸೇರಿಸಿ';

  @override
  String get lessonSteps => 'ಹಂತಗಳು';

  @override
  String get stepHint => 'ಈ ಹಂತದಲ್ಲಿ ಏನು ನಡೆಯುತ್ತದೆ';

  @override
  String get addStep => 'ಹಂತ ಸೇರಿಸಿ';

  @override
  String get minutesShortLabel => 'ನಿಮಿ';

  @override
  String stepsTotal(int planned, int length) {
    return '$length ರಲ್ಲಿ $planned ನಿಮಿ';
  }

  @override
  String stepsOver(int planned, int length) {
    return '$planned ನಿಮಿ, ಅವಧಿ $length ನಿಮಿ';
  }

  @override
  String get moveUp => 'ಮೇಲೆ ಸರಿಸಿ';

  @override
  String get moveDown => 'ಕೆಳಗೆ ಸರಿಸಿ';

  @override
  String get moreOptions => 'ಇನ್ನಷ್ಟು ಆಯ್ಕೆಗಳು';

  @override
  String get lessonMaterials => 'ಸಾಮಗ್ರಿಗಳು';

  @override
  String get materialHint => 'ಉದಾ. ಚಾರ್ಟ್ ಪೇಪರ್, ಪಠ್ಯಪುಸ್ತಕ ಪುಟ 42';

  @override
  String get addMaterial => 'ಸಾಮಗ್ರಿ ಸೇರಿಸಿ';

  @override
  String get lessonCheck => 'ಅರ್ಥವಾಗಿದೆಯೇ ಪರಿಶೀಲನೆ';

  @override
  String get lessonCheckHint =>
      'ವಿದ್ಯಾರ್ಥಿಗಳು ಏನು ಕಲಿತರು ಎಂದು ಹೇಗೆ ಪರಿಶೀಲಿಸುವಿರಿ';

  @override
  String get lessonHomework => 'ಹೋಂವರ್ಕ್';

  @override
  String get lessonHomeworkHint => 'ಐಚ್ಛಿಕ';

  @override
  String get draftWithAi => 'KINETIX AI ಮೂಲಕ ಕರಡು ಮಾಡಿ';

  @override
  String get drafting => 'KINETIX AI ಕರಡು ಮಾಡುತ್ತಿದೆ…';

  @override
  String get replaceWithDraftTitle => 'KINETIX AI ಕರಡಿನಿಂದ ಬದಲಿಸಬೇಕೇ?';

  @override
  String get replaceWithDraftBody =>
      'ಈ ಯೋಜನೆಯ ವಿಷಯಗಳು, ಉದ್ದೇಶಗಳು, ಹಂತಗಳು, ಸಾಮಗ್ರಿಗಳು ಮತ್ತು ಪರಿಶೀಲನೆ ಬದಲಾಗುತ್ತವೆ. ನಿಮ್ಮ ಹೋಂವರ್ಕ್ ಹಾಗೆಯೇ ಉಳಿಯುತ್ತದೆ.';

  @override
  String get replace => 'ಬದಲಿಸಿ';

  @override
  String get aiDraftLabel => 'AI ಕರಡು — ಬಳಸುವ ಮೊದಲು ಪರಿಶೀಲಿಸಿ';

  @override
  String get aiPreviewNote =>
      'ಮಾದರಿ: KINETIX AI ಸರ್ವರ್ ಸಂಪರ್ಕಗೊಂಡಿಲ್ಲ, ಆದ್ದರಿಂದ ಇದು ಮಾದರಿ ಕರಡು.';

  @override
  String get savePlan => 'ಯೋಜನೆ ಉಳಿಸಿ';

  @override
  String get lessonPlanSaved => 'ಪಾಠ ಯೋಜನೆ ಉಳಿಸಲಾಗಿದೆ';

  @override
  String reviewedOn(String date) {
    return '$date ರಂದು ಪರಿಶೀಲಿಸಲಾಗಿದೆ';
  }

  @override
  String get reviewRemark => 'ವಿಭಾಗ ಮುಖ್ಯಸ್ಥರ ಟಿಪ್ಪಣಿ';

  @override
  String get discardPlanBody =>
      'ನಿಮ್ಮ ಪಾಠ ಯೋಜನೆಯಲ್ಲಿ ಇನ್ನೂ ಉಳಿಸದ ಬದಲಾವಣೆಗಳಿವೆ.';

  @override
  String get errorPlanNoSyllabus =>
      'ಈ ವಿಷಯಕ್ಕೆ ಇನ್ನೂ ಪಠ್ಯಕ್ರಮ ಇಲ್ಲ. ಇದನ್ನು ಕೋರ್ಸ್‌ಗೆ ಜೋಡಿಸಲು ನಿಮ್ಮ ಆಡಳಿತಾಧಿಕಾರಿಗೆ ಕೇಳಿ.';

  @override
  String get errorPlanNoPeriods =>
      'ಈ ತರಗತಿಯ ವೇಳಾಪಟ್ಟಿಯಲ್ಲಿ ಈ ವಿಷಯಕ್ಕೆ ಯಾವುದೇ ಅವಧಿ ಇಲ್ಲ.';

  @override
  String get errorPlanNoTeachingDays =>
      'ಈ ದಿನಾಂಕಗಳ ನಡುವೆ ಯಾವುದೇ ಬೋಧನಾ ದಿನವಿಲ್ಲ.';

  @override
  String get errorPlanEndsBeforeStart =>
      'ಮುಕ್ತಾಯ ದಿನಾಂಕ ಪ್ರಾರಂಭ ದಿನಾಂಕದ ನಂತರ ಇರಬೇಕು.';

  @override
  String get errorPeriodNotOnDay => 'ಈ ತರಗತಿ ಆ ದಿನ ಇಲ್ಲ.';

  @override
  String get errorAiAllowance =>
      'ನಿಮ್ಮ ಸಂಸ್ಥೆ ಇಂದಿನ KINETIX AI ಮಿತಿಯನ್ನು ಬಳಸಿದೆ. ನಾಳೆ ಮತ್ತೆ ಲಭ್ಯ.';

  @override
  String get errorAiUnavailable =>
      'KINETIX AI ಈಗ ಲಭ್ಯವಿಲ್ಲ. ಒಂದು ನಿಮಿಷದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get errorAiUnusable =>
      'KINETIX AI ಬಳಸಬಹುದಾದ ಕರಡು ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String reviewedByOn(String name, String date) {
    return '$name ಅವರು $date ರಂದು ಪರಿಶೀಲಿಸಿದ್ದಾರೆ';
  }

  @override
  String get signInWithPhone => 'ಫೋನ್ ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ';

  @override
  String get signInWithPassword => 'ಪಾಸ್‌ವರ್ಡ್ ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ';

  @override
  String get phoneSignInSubtitle =>
      'ನಿಮ್ಮ ನೋಂದಾಯಿತ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಗೆ 6 ಅಂಕಿಯ ಕೋಡ್ ಕಳುಹಿಸುತ್ತೇವೆ';

  @override
  String get mobileNumber => 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ';

  @override
  String get enterMobileNumber => 'ನಿಮ್ಮ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ';

  @override
  String get invalidMobileNumber => 'ಸರಿಯಾದ 10 ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ';

  @override
  String get sendCode => 'ಕೋಡ್ ಕಳುಹಿಸಿ';

  @override
  String otpSentTo(String phone) {
    return '$phone ಗೆ ಕಳುಹಿಸಿದ 6 ಅಂಕಿಯ ಕೋಡ್ ನಮೂದಿಸಿ';
  }

  @override
  String get otpCode => 'ಸೈನ್ ಇನ್ ಕೋಡ್';

  @override
  String get enterOtp => '6 ಅಂಕಿಯ ಕೋಡ್ ನಮೂದಿಸಿ';

  @override
  String resendCodeIn(String time) {
    return '$time ನಂತರ ಕೋಡ್ ಮತ್ತೆ ಕಳುಹಿಸಿ';
  }

  @override
  String get resendCode => 'ಕೋಡ್ ಮತ್ತೆ ಕಳುಹಿಸಿ';

  @override
  String get codeResent => 'ಹೊಸ ಕೋಡ್ ಕಳುಹಿಸಲಾಗಿದೆ';

  @override
  String get changeNumber => 'ಸಂಖ್ಯೆ ಬದಲಿಸಿ';

  @override
  String get errorOtpInvalid =>
      'ಈ ಕೋಡ್ ತಪ್ಪಾಗಿದೆ ಅಥವಾ ಅವಧಿ ಮುಗಿದಿದೆ. SMS ಪರಿಶೀಲಿಸಿ ಅಥವಾ ಹೊಸ ಕೋಡ್ ಕಳುಹಿಸಿ.';

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
  String get recordingKept => 'ಉಳಿಸಲಾಗಿದೆ';

  @override
  String recordingDeletedOn(String date) {
    return '$date ರಂದು ಅಳಿಸಲಾಗುವುದು';
  }

  @override
  String get keepRecording => 'ಉಳಿಸಿ';

  @override
  String get dontKeepRecording => 'ಉಳಿಸಬೇಡಿ';

  @override
  String get keepRecordingTooltip =>
      'ಉಳಿಸಿದ ರೆಕಾರ್ಡಿಂಗ್‌ಗಳನ್ನು ಅವಧಿ ಮುಗಿದಾಗ ಅಳಿಸಲಾಗುವುದಿಲ್ಲ';

  @override
  String get phoneRemote => 'ಫೋನ್ ರಿಮೋಟ್';

  @override
  String remoteTitle(String board) {
    return 'ರಿಮೋಟ್ · $board';
  }

  @override
  String get remoteEnded => 'ಈ ಬೋರ್ಡ್‌ನಲ್ಲಿ ತರಗತಿ ಮುಗಿದಿದೆ.';

  @override
  String get remotePhotoSent => 'ಫೋಟೋ ಬೋರ್ಡ್‌ನಲ್ಲಿದೆ.';

  @override
  String get remotePhotoFailed => 'ಫೋಟೋ ಕಳುಹಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get remotePages => 'ಬೋರ್ಡ್ ಪುಟಗಳು';

  @override
  String get remotePrevious => 'ಹಿಂದಿನದು';

  @override
  String get remoteNext => 'ಮುಂದಿನದು';

  @override
  String remotePageOf(int page, int pages) {
    return 'ಪುಟ $page / $pages';
  }

  @override
  String get remoteSlides => 'ಸ್ಲೈಡ್‌ಗಳು ಮತ್ತು PDF';

  @override
  String get remoteNoSlides =>
      'ಇಲ್ಲಿಂದ ತಿರುಗಿಸಲು ಬೋರ್ಡ್‌ನಲ್ಲಿ ಸ್ಲೈಡ್‌ಗಳು ಅಥವಾ PDF ತೆರೆಯಿರಿ.';

  @override
  String remoteSlideOf(int slide, int slides) {
    return 'ಸ್ಲೈಡ್ $slide / $slides';
  }

  @override
  String get remotePointer => 'ಪಾಯಿಂಟರ್';

  @override
  String get remotePointerHint => 'ಬೋರ್ಡ್‌ನಲ್ಲಿ ತೋರಿಸಲು ಇಲ್ಲಿ ಬೆರಳು ಸರಿಸಿ';

  @override
  String get remoteClassroom => 'ತರಗತಿ ಸಾಧನಗಳು';

  @override
  String remoteTimerMinutes(int minutes) {
    return '$minutes ನಿಮಿಷದ ಟೈಮರ್';
  }

  @override
  String get remoteTimerStop => 'ಟೈಮರ್ ನಿಲ್ಲಿಸಿ';

  @override
  String get remotePickStudent => 'ವಿದ್ಯಾರ್ಥಿಯನ್ನು ಆರಿಸಿ';

  @override
  String get remoteShowPhoto => 'ಫೋಟೋ ತೋರಿಸಿ';

  @override
  String get remoteStartRecording => 'ಪಾಠ ರೆಕಾರ್ಡ್ ಮಾಡಿ';

  @override
  String get remoteStopRecording => 'ರೆಕಾರ್ಡಿಂಗ್ ನಿಲ್ಲಿಸಿ';

  @override
  String get answerCards => 'ಉತ್ತರ ಕಾರ್ಡ್‌ಗಳು';

  @override
  String get answerCardsMenuBody =>
      'ಫೋನ್ ಇಲ್ಲದ ವಿದ್ಯಾರ್ಥಿಗಳು ಬೋರ್ಡ್‌ನಲ್ಲಿ ಉತ್ತರಿಸಲು ಕಾರ್ಡ್‌ಗಳನ್ನು ಮುದ್ರಿಸಿ';

  @override
  String get answerCardsBody =>
      'ಪ್ರತಿ ವಿದ್ಯಾರ್ಥಿಗೆ ಹಾಜರಿ ಸಂಖ್ಯೆಯ ಪ್ರಕಾರ ಒಂದು ಕಾರ್ಡ್. ಬೋರ್ಡ್‌ನ \"ತರಗತಿಯನ್ನು ಕೇಳಿ\" ಯಲ್ಲಿ ಅವರು ಉತ್ತರ ಮೇಲಿರುವಂತೆ ಕಾರ್ಡ್ ಎತ್ತುತ್ತಾರೆ, ಬೋರ್ಡ್ ಒಂದೇ ಫೋಟೋದಿಂದ ಇಡೀ ತರಗತಿಯನ್ನು ಓದುತ್ತದೆ.';

  @override
  String get answerCardsPrintHint =>
      'Hold the card with your answer at the top. Keep your fingers off the black pattern.';

  @override
  String answerCardsReady(int count, String className) {
    return '$className ತರಗತಿಯ $count ಕಾರ್ಡ್‌ಗಳು ಮುದ್ರಣಕ್ಕೆ ಸಿದ್ಧ.';
  }

  @override
  String get answerCardsFailed =>
      'ಕಾರ್ಡ್‌ಗಳನ್ನು ಮಾಡಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get print => 'ಮುದ್ರಿಸಿ';

  @override
  String get filterMissing => 'ಬಾಕಿ';

  @override
  String remindMissing(int count) {
    return '$count ಮಂದಿಗೆ ನೆನಪಿಸಿ';
  }

  @override
  String remindTitle(int count) {
    return '$count ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ನೆನಪಿಸಬೇಕೇ?';
  }

  @override
  String get remindBody =>
      'ಈ ಹೋಂವರ್ಕ್ ಇನ್ನೂ ಸಲ್ಲಿಸಿಲ್ಲ ಎಂದು ಅವರಿಗೂ ಅವರ ಕುಟುಂಬಕ್ಕೂ ಸೂಚನೆ ಹೋಗುತ್ತದೆ.';

  @override
  String get remind => 'ನೆನಪಿಸಿ';

  @override
  String reminded(int count) {
    return '$count ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ಮತ್ತು ಅವರ ಕುಟುಂಬಗಳಿಗೆ ನೆನಪಿಸಲಾಗಿದೆ';
  }

  @override
  String get noneInFilter => 'ಇಲ್ಲಿ ಯಾವುದೇ ವಿದ್ಯಾರ್ಥಿ ಇಲ್ಲ';

  @override
  String get classAndSubject => 'ತರಗತಿ ಮತ್ತು ವಿಷಯ';

  @override
  String get classRoster => 'ತರಗತಿ ಪಟ್ಟಿ';

  @override
  String get classRosterBody => 'ನಿಮ್ಮ ವಿದ್ಯಾರ್ಥಿಗಳು; ಬ್ಯಾಡ್ಜ್ ನೀಡಿ';

  @override
  String get chooseClass => 'ತರಗತಿ ಆಯ್ಕೆಮಾಡಿ';

  @override
  String get driverMode => 'ಚಾಲಕ ಮೋಡ್';

  @override
  String get driverModeBody => 'ಬಸ್ ಪ್ರಯಾಣ ಆರಂಭಿಸಿ ಬಸ್ ಸ್ಥಳವನ್ನು ಹಂಚಿಕೊಳ್ಳಿ';

  @override
  String get driverNoRoutes =>
      'ನಿಮಗೆ ಇನ್ನೂ ಯಾವುದೇ ಮಾರ್ಗ ನಿಯೋಜಿಸಿಲ್ಲ. ಸಾರಿಗೆ ಕಚೇರಿಯನ್ನು ಕೇಳಿ.';

  @override
  String get driverRoute => 'ಮಾರ್ಗ';

  @override
  String get driverDirection => 'ದಿಕ್ಕು';

  @override
  String get driverPickup => 'ಪಿಕಪ್ (ಶಾಲೆಗೆ)';

  @override
  String get driverDrop => 'ಡ್ರಾಪ್ (ಮನೆಗೆ)';

  @override
  String get driverStart => 'ಪ್ರಯಾಣ ಆರಂಭಿಸಿ';

  @override
  String get driverEnd => 'ಪ್ರಯಾಣ ಮುಗಿಸಿ';

  @override
  String get driverRunning => 'ಪ್ರಯಾಣ ನಡೆಯುತ್ತಿದೆ';

  @override
  String get driverTripEnded => 'ಪ್ರಯಾಣ ಮುಗಿದಿದೆ';

  @override
  String get driverNextStops => 'ಮುಂದಿನ ನಿಲ್ದಾಣಗಳು';

  @override
  String get driverNoMoreStops => 'ಇನ್ನು ನಿಲ್ದಾಣಗಳಿಲ್ಲ';

  @override
  String driverLastSent(Object time) {
    return 'ಸ್ಥಳವನ್ನು $timeಕ್ಕೆ ಕಳುಹಿಸಲಾಗಿದೆ';
  }

  @override
  String get driverWaitingGps => 'GPS ಗಾಗಿ ಕಾಯಲಾಗುತ್ತಿದೆ...';

  @override
  String get driverLocationDenied =>
      'ಬಸ್ ಸ್ಥಳವನ್ನು ಹಂಚಿಕೊಳ್ಳಲು ಸ್ಥಳದ ಅನುಮತಿ ಬೇಕು. ಸೆಟ್ಟಿಂಗ್ಸ್‌ನಲ್ಲಿ ಅನುಮತಿಸಿ.';

  @override
  String get driverLocationOff => 'ಪ್ರಯಾಣ ಆರಂಭಿಸಲು ಫೋನ್‌ನ ಸ್ಥಳ (GPS) ಆನ್ ಮಾಡಿ.';

  @override
  String get driverSendFailing =>
      'ಸರ್ವರ್ ತಲುಪಲಾಗುತ್ತಿಲ್ಲ. ಪ್ರಯತ್ನ ಮುಂದುವರಿದಿದೆ...';

  @override
  String get driverKeepOpen => 'ಬಸ್ ಚಲಿಸುತ್ತಿರುವಾಗ ಈ ಪರದೆಯನ್ನು ತೆರೆದಿಡಿ.';

  @override
  String driverVehicle(Object regNo) {
    return 'ಬಸ್ $regNo';
  }

  @override
  String get workSection => 'ಕೆಲಸ';

  @override
  String get leaveTitle => 'ರಜೆ';

  @override
  String get leaveBody => 'ಬಾಕಿ, ಅರ್ಜಿ ಮತ್ತು ಅನುಮೋದನೆ';

  @override
  String get checkInTitle => 'ಹಾಜರಾತಿ';

  @override
  String get checkInBody => 'ನಿಮ್ಮ ದಿನ ದಾಖಲಿಸಿ, ತಿಂಗಳು ನೋಡಿ';

  @override
  String get payslipsTitle => 'ವೇತನ ಚೀಟಿಗಳು';

  @override
  String get payslipsBody => 'ನಿಮ್ಮ ಮಾಸಿಕ ವೇತನ ಚೀಟಿಗಳು';

  @override
  String get leaveMine => 'ನನ್ನ ರಜೆ';

  @override
  String get leaveApprovals => 'ಅನುಮೋದನೆಗೆ';

  @override
  String get leaveBalances => 'ಬಾಕಿ';

  @override
  String get leaveApply => 'ರಜೆಗೆ ಅರ್ಜಿ';

  @override
  String get leaveType => 'ರಜೆಯ ಪ್ರಕಾರ';

  @override
  String get leaveFrom => 'ಇಂದ';

  @override
  String get leaveTo => 'ವರೆಗೆ';

  @override
  String get leaveHalfDay => 'ಅರ್ಧ ದಿನ';

  @override
  String get leaveReason => 'ಕಾರಣ (ಐಚ್ಛಿಕ)';

  @override
  String get leaveSubmit => 'ಸಲ್ಲಿಸಿ';

  @override
  String leaveDaysCount(String days) {
    return 'ಕೆಲಸದ ದಿನಗಳು: $days';
  }

  @override
  String leaveAvailable(String days) {
    return '$days ಬಾಕಿ';
  }

  @override
  String leaveDaysLabel(String days) {
    return '$days ದಿನಗಳು';
  }

  @override
  String get leaveNone => 'ಇನ್ನೂ ರಜೆ ಕೋರಿಕೆಗಳಿಲ್ಲ.';

  @override
  String get leaveNoApprovals => 'ನಿಮ್ಮ ನಿರ್ಧಾರಕ್ಕೆ ಯಾವುದೂ ಬಾಕಿ ಇಲ್ಲ.';

  @override
  String get leaveCancelAction => 'ಕೋರಿಕೆ ರದ್ದುಮಾಡಿ';

  @override
  String get leaveApprove => 'ಅನುಮೋದಿಸಿ';

  @override
  String get leaveReject => 'ನಿರಾಕರಿಸಿ';

  @override
  String get leaveDecisionNote => 'ಟಿಪ್ಪಣಿ (ಐಚ್ಛಿಕ)';

  @override
  String get leaveStatusPending => 'ಬಾಕಿ';

  @override
  String get leaveStatusApproved => 'ಅನುಮೋದಿತ';

  @override
  String get leaveStatusRejected => 'ನಿರಾಕರಿಸಲಾಗಿದೆ';

  @override
  String get leaveStatusCancelled => 'ರದ್ದಾಗಿದೆ';

  @override
  String get checkInButton => 'ಹಾಜರಾಗಿ';

  @override
  String get checkOutButton => 'ನಿರ್ಗಮನ';

  @override
  String checkedInAt(String time) {
    return '$timeಕ್ಕೆ ಹಾಜರಾಗಿದ್ದೀರಿ';
  }

  @override
  String checkedOutAt(String time) {
    return '$timeಕ್ಕೆ ನಿರ್ಗಮಿಸಿದ್ದೀರಿ';
  }

  @override
  String get notCheckedIn => 'ನೀವು ಇಂದು ಹಾಜರಾಗಿಲ್ಲ.';

  @override
  String get attendanceMonth => 'ಈ ತಿಂಗಳು';

  @override
  String get attStatusPresent => 'ಹಾಜರು';

  @override
  String get attStatusAbsent => 'ಗೈರು';

  @override
  String get attStatusHalfDay => 'ಅರ್ಧ ದಿನ';

  @override
  String get attStatusOnLeave => 'ರಜೆಯಲ್ಲಿ';

  @override
  String get payslipNet => 'ನಿವ್ವಳ ವೇತನ';

  @override
  String get payslipGross => 'ಒಟ್ಟು';

  @override
  String get payslipEarnings => 'ಗಳಿಕೆ';

  @override
  String get payslipDeductions => 'ಕಡಿತಗಳು';

  @override
  String payslipDays(String paid, String lop) {
    return 'ಪಾವತಿ ದಿನಗಳು $paid, ವೇತನ ಕಡಿತ $lop';
  }

  @override
  String get payslipOpenPdf => 'PDF ತೆರೆಯಿರಿ';

  @override
  String get payslipsEmpty =>
      'ಇನ್ನೂ ವೇತನ ಚೀಟಿಗಳಿಲ್ಲ. ವೇತನ ಅಂತಿಮವಾದಾಗ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';

  @override
  String get roleHr => 'ಎಚ್‌ಆರ್ ವ್ಯವಸ್ಥಾಪಕ';

  @override
  String get navHome => 'ಮುಖಪುಟ';

  @override
  String get navClasses => 'ತರಗತಿಗಳು';

  @override
  String get navStudents => 'ವಿದ್ಯಾರ್ಥಿಗಳು';

  @override
  String get navMore => 'ಇನ್ನಷ್ಟು';

  @override
  String get homeSubtitle => 'ಇಂದಿನ ದಿನವನ್ನು ಉತ್ತಮಗೊಳಿಸೋಣ!';

  @override
  String get viewAll => 'ಎಲ್ಲವನ್ನೂ ನೋಡಿ';

  @override
  String get startClass => 'ತರಗತಿ ಆರಂಭಿಸಿ';

  @override
  String get quickActions => 'ತ್ವರಿತ ಕ್ರಿಯೆಗಳು';

  @override
  String get qaAttendance => 'ಹಾಜರಾತಿ';

  @override
  String get qaAssignment => 'ಅಸೈನ್‌ಮೆಂಟ್';

  @override
  String get qaQuiz => 'ರಸಪ್ರಶ್ನೆ';

  @override
  String get qaSmartboard => 'ಸ್ಮಾರ್ಟ್‌ಬೋರ್ಡ್';

  @override
  String get qaStudyMaterial => 'ಅಧ್ಯಯನ ಸಾಮಗ್ರಿ';

  @override
  String get qaAiAssistant => 'AI ಸಹಾಯಕ';

  @override
  String get pendingApprovals => 'ಬಾಕಿ ಇರುವ ಅನುಮೋದನೆಗಳು';

  @override
  String get allCaughtUp => 'ನಿಮಗಾಗಿ ಯಾವುದೂ ಬಾಕಿ ಇಲ್ಲ.';

  @override
  String get pickAClass => 'ತರಗತಿ ಆಯ್ಕೆಮಾಡಿ';

  @override
  String leaveRequestLine(String type, String days) {
    return '$type: $days ದಿನ';
  }

  @override
  String get workToolsSection => 'ಸಿಬ್ಬಂದಿ ಸಾಧನಗಳು';

  @override
  String get tasksTitle => 'ಕಾರ್ಯಗಳು';

  @override
  String get tasksBody => 'ನಿಮಗೆ ವಹಿಸಿದ ಮತ್ತು ನೀವು ಇತರರಿಗೆ ವಹಿಸಿದ ಕಾರ್ಯಗಳು';

  @override
  String get requestsTitle => 'ಮನವಿಗಳು ಮತ್ತು ಅನುಮೋದನೆಗಳು';

  @override
  String get requestsBody =>
      'ಮನವಿ ಪ್ರಾರಂಭಿಸಿ, ಅದನ್ನು ಗಮನಿಸಿ ಮತ್ತು ನಿಮ್ಮ ಬಳಿ ಬಂದವುಗಳ ಬಗ್ಗೆ ತೀರ್ಮಾನಿಸಿ';

  @override
  String get subsTitle => 'ಬದಲಿ ತರಗತಿಗಳು';

  @override
  String get subsBody => 'ಸಹೋದ್ಯೋಗಿಗಳ ಬದಲು ನೀವು ತೆಗೆದುಕೊಳ್ಳುವ ತರಗತಿಗಳು';

  @override
  String get dutiesTitle => 'ಮೇಲ್ವಿಚಾರಣೆ ಕರ್ತವ್ಯಗಳು';

  @override
  String get dutiesBody => 'ಪರೀಕ್ಷಾ ಕೊಠಡಿಯಲ್ಲಿ ನಿಮ್ಮ ಕರ್ತವ್ಯಗಳು';

  @override
  String get evalTitle => 'ಮೌಲ್ಯಮಾಪನ ಮೇಜು';

  @override
  String get evalBody => 'ನಿಮಗೆ ಹಂಚಿದ ಉತ್ತರ ಪತ್ರಿಕೆಗಳನ್ನು ಮೌಲ್ಯಮಾಪನ ಮಾಡಿ';

  @override
  String get mentoringTitle => 'ಮಾರ್ಗದರ್ಶನ';

  @override
  String get mentoringBody => 'ನಿಮ್ಮ ಮಾರ್ಗದರ್ಶಿತರು, ಅವಧಿಗಳು ಮತ್ತು ಯೋಜನೆಗಳು';

  @override
  String get courseRosterTitle => 'ಕೋರ್ಸ್ ಪಟ್ಟಿಗಳು';

  @override
  String get courseRosterBody =>
      'ನೀವು ಬೋಧಿಸುವ ಕೋರ್ಸ್‌ಗಳಿಗೆ ಯಾರು ನೋಂದಾಯಿಸಿದ್ದಾರೆ';

  @override
  String get surveysTitle => 'ಸಮೀಕ್ಷೆಗಳು';

  @override
  String get surveysBody => 'ನಿಮ್ಮ ಉತ್ತರಕ್ಕಾಗಿ ಕಾಯುತ್ತಿರುವ ಸಮೀಕ್ಷೆಗಳು';

  @override
  String get clubsTitle => 'ನಾನು ಸಂಯೋಜಿಸುವ ಕ್ಲಬ್‌ಗಳು';

  @override
  String get clubsBody => 'ನಿಮ್ಮ ಕ್ಲಬ್‌ಗಳ ಸದಸ್ಯರು ಮತ್ತು ಅಂಕಗಳು';

  @override
  String get tasksMineTab => 'ನನಗೆ ವಹಿಸಿದ್ದು';

  @override
  String get tasksByMeTab => 'ನಾನು ವಹಿಸಿದ್ದು';

  @override
  String get tasksEmpty => 'ಯಾವುದೇ ಬಾಕಿ ಕಾರ್ಯಗಳಿಲ್ಲ.';

  @override
  String taskFrom(String name) {
    return '$name ಅವರಿಂದ';
  }

  @override
  String taskTo(String name) {
    return '$name ಅವರಿಗೆ';
  }

  @override
  String taskDue(String when) {
    return 'ಕೊನೆಯ ದಿನ $when';
  }

  @override
  String get taskOverdue => 'ಅವಧಿ ಮೀರಿದೆ';

  @override
  String get taskStatusOpen => 'ತೆರೆದಿದೆ';

  @override
  String get taskStatusInProgress => 'ನಡೆಯುತ್ತಿದೆ';

  @override
  String get taskStatusDone => 'ಮುಗಿದಿದೆ';

  @override
  String get taskStatusCancelled => 'ರದ್ದಾಗಿದೆ';

  @override
  String get taskStart => 'ಪ್ರಾರಂಭಿಸಿ';

  @override
  String get taskMarkDone => 'ಮುಗಿಸಿ';

  @override
  String get taskCancelAction => 'ಕಾರ್ಯ ರದ್ದುಮಾಡಿ';

  @override
  String get taskPriorityHigh => 'ಹೆಚ್ಚಿನ ಆದ್ಯತೆ';

  @override
  String get taskPriorityUrgent => 'ತುರ್ತು';

  @override
  String get requestsInboxTab => 'ನನ್ನ ನಿರ್ಧಾರಕ್ಕೆ';

  @override
  String get requestsMineTab => 'ನನ್ನ ಮನವಿಗಳು';

  @override
  String get requestsStart => 'ಹೊಸ ಮನವಿ';

  @override
  String get requestsInboxEmpty => 'ನಿಮ್ಮ ನಿರ್ಧಾರಕ್ಕಾಗಿ ಏನೂ ಬಾಕಿ ಇಲ್ಲ.';

  @override
  String get requestsMineEmpty => 'ನೀವು ಯಾವುದೇ ಮನವಿ ಮಾಡಿಲ್ಲ.';

  @override
  String requestStep(String n, String total, String name) {
    return 'ಹಂತ $n / $total · $name';
  }

  @override
  String requestBy(String name) {
    return '$name ಅವರಿಂದ';
  }

  @override
  String get reqStatusPending => 'ಬಾಕಿ';

  @override
  String get reqStatusApproved => 'ಅನುಮೋದಿತ';

  @override
  String get reqStatusRejected => 'ತಿರಸ್ಕೃತ';

  @override
  String get reqStatusReturned => 'ಹಿಂದಿರುಗಿಸಿದೆ';

  @override
  String get reqStatusCancelled => 'ಹಿಂಪಡೆಯಲಾಗಿದೆ';

  @override
  String get requestApprove => 'ಅನುಮೋದಿಸಿ';

  @override
  String get requestReject => 'ತಿರಸ್ಕರಿಸಿ';

  @override
  String get requestReturn => 'ಬದಲಾವಣೆಗೆ ಹಿಂದಿರುಗಿಸಿ';

  @override
  String get requestComment => 'ಟಿಪ್ಪಣಿ (ಐಚ್ಛಿಕ)';

  @override
  String get requestWithdraw => 'ಮನವಿ ಹಿಂಪಡೆಯಿರಿ';

  @override
  String get requestHistory => 'ಇತಿಹಾಸ';

  @override
  String get requestAmountLabel => 'ಮೊತ್ತ (₹)';

  @override
  String get requestTitleLabel => 'ಶೀರ್ಷಿಕೆ';

  @override
  String get requestKindLabel => 'ಮನವಿಯ ಪ್ರಕಾರ';

  @override
  String get requestSubmit => 'ಮನವಿ ಕಳುಹಿಸಿ';

  @override
  String get requestNoRoutes => 'ಇನ್ನೂ ಯಾವುದೇ ಮನವಿ ಪ್ರಕಾರ ಹೊಂದಿಸಿಲ್ಲ.';

  @override
  String requestFieldNeeded(String field) {
    return '$field ಭರ್ತಿ ಮಾಡಿ';
  }

  @override
  String get requestActionSubmitted => 'ಸಲ್ಲಿಸಲಾಗಿದೆ';

  @override
  String get requestActionResubmitted => 'ಮತ್ತೆ ಕಳುಹಿಸಲಾಗಿದೆ';

  @override
  String get subsEmpty => 'ಮುಂದಿನ ಎರಡು ವಾರಗಳಲ್ಲಿ ನಿಮಗೆ ಯಾವುದೇ ಬದಲಿ ತರಗತಿ ಇಲ್ಲ.';

  @override
  String subsFor(String name) {
    return '$name ಅವರ ಬದಲು';
  }

  @override
  String get dutiesEmpty => 'ನಿಮಗೆ ಯಾವುದೇ ಮೇಲ್ವಿಚಾರಣೆ ಕರ್ತವ್ಯ ನೀಡಿಲ್ಲ.';

  @override
  String get dutyRoleChief => 'ಮುಖ್ಯ ಮೇಲ್ವಿಚಾರಕ';

  @override
  String get dutyRoleInvigilator => 'ಮೇಲ್ವಿಚಾರಕ';

  @override
  String get evalEmpty => 'ನಿಮಗೆ ಯಾವುದೇ ಉತ್ತರ ಪತ್ರಿಕೆ ಹಂಚಿಲ್ಲ.';

  @override
  String evalScript(String no) {
    return 'ಪತ್ರಿಕೆ $no';
  }

  @override
  String evalRound(String n) {
    return 'ಮೌಲ್ಯಮಾಪನ $n';
  }

  @override
  String get evalStatusTodo => 'ಮಾಡಬೇಕಿದೆ';

  @override
  String get evalStatusSubmitted => 'ಸಲ್ಲಿಸಲಾಗಿದೆ';

  @override
  String evalTotal(String total) {
    return 'ಒಟ್ಟು $total';
  }

  @override
  String evalQuestionLabel(String no, String max) {
    return 'ಪ್ರಶ್ನೆ $no ($max ರಲ್ಲಿ)';
  }

  @override
  String get evalMarksLabel => 'ಅಂಕಗಳು';

  @override
  String get evalCommentLabel => 'ಟಿಪ್ಪಣಿ';

  @override
  String get evalSave => 'ಅಂಕಗಳನ್ನು ಉಳಿಸಿ';

  @override
  String get evalSavedMsg => 'ಅಂಕಗಳನ್ನು ಉಳಿಸಲಾಗಿದೆ';

  @override
  String get evalSubmit => 'ಮೌಲ್ಯಮಾಪನ ಸಲ್ಲಿಸಿ';

  @override
  String get evalSubmitConfirm =>
      'ಈ ಮೌಲ್ಯಮಾಪನ ಸಲ್ಲಿಸುವಿರಾ? ನಂತರ ಅಂಕಗಳನ್ನು ಬದಲಿಸಲಾಗುವುದಿಲ್ಲ.';

  @override
  String evalSubmittedMsg(String total) {
    return 'ಮೌಲ್ಯಮಾಪನ ಸಲ್ಲಿಕೆಯಾಯಿತು. ಒಟ್ಟು $total.';
  }

  @override
  String get evalThirdNeeded =>
      'ಎರಡು ಮೌಲ್ಯಮಾಪನಗಳ ನಡುವೆ ಹೆಚ್ಚು ವ್ಯತ್ಯಾಸವಿದೆ, ಆದ್ದರಿಂದ ಮೂರನೇ ಮೌಲ್ಯಮಾಪನ ಏರ್ಪಡಿಸಲಾಗುವುದು.';

  @override
  String evalOverMax(String max) {
    return 'ಗರಿಷ್ಠ $max';
  }

  @override
  String get evalMissing =>
      'ಪ್ರತಿ ಪ್ರಶ್ನೆಗೆ ಅಂಕ ನಮೂದಿಸಿ (ಏನೂ ಬರೆದಿಲ್ಲದಿದ್ದರೆ 0).';

  @override
  String get evalLockedMsg => 'ಈ ಮೌಲ್ಯಮಾಪನ ಸಲ್ಲಿಕೆಯಾಗಿದ್ದು ಬದಲಿಸಲಾಗುವುದಿಲ್ಲ.';

  @override
  String evalPageLabel(String n, String total) {
    return 'ಪುಟ $n / $total';
  }

  @override
  String get evalNoPages => 'ಈ ಪತ್ರಿಕೆಯಲ್ಲಿ ಪುಟಗಳಿಲ್ಲ.';

  @override
  String get menteesEmpty => 'ನಿಮಗೆ ಮಾರ್ಗದರ್ಶಿತರು ಇಲ್ಲ.';

  @override
  String get riskHigh => 'ಹೆಚ್ಚಿನ ಅಪಾಯ';

  @override
  String get riskMedium => 'ಮಧ್ಯಮ ಅಪಾಯ';

  @override
  String get riskLow => 'ಕಡಿಮೆ ಅಪಾಯ';

  @override
  String get riskNone => 'ಸರಿಯಾಗಿದೆ';

  @override
  String menteeAttendance(String pct) {
    return 'ಹಾಜರಾತಿ $pct%';
  }

  @override
  String menteeFailing(String n) {
    return '$n ಪರೀಕ್ಷೆಗಳಲ್ಲಿ ಅನುತ್ತೀರ್ಣ';
  }

  @override
  String menteeFees(String n) {
    return '$n ಬಾಕಿ ಶುಲ್ಕಗಳು';
  }

  @override
  String menteeCases(String n) {
    return '$n ತೆರೆದ ಪ್ರಕರಣಗಳು';
  }

  @override
  String get mentorLogSession => 'ಅವಧಿ ದಾಖಲಿಸಿ';

  @override
  String get mentorSessions => 'ಅವಧಿಗಳು';

  @override
  String get mentorPlans => 'ಮಧ್ಯಸ್ಥಿಕೆ ಯೋಜನೆಗಳು';

  @override
  String get sessionModeInPerson => 'ನೇರವಾಗಿ';

  @override
  String get sessionModePhone => 'ಫೋನ್';

  @override
  String get sessionModeOnline => 'ಆನ್‌ಲೈನ್';

  @override
  String get sessionModeLabel => 'ಭೇಟಿಯ ವಿಧಾನ';

  @override
  String get sessionSummary => 'ಸಾರಾಂಶ';

  @override
  String get sessionNotes =>
      'ಖಾಸಗಿ ಟಿಪ್ಪಣಿಗಳು (ನೀವು, ವಿಭಾಗ ಮುಖ್ಯಸ್ಥರು ಮತ್ತು ಸಲಹೆಗಾರರು ಮಾತ್ರ ನೋಡಬಹುದು)';

  @override
  String get sessionFollowUp => 'ಮುಂದಿನ ಭೇಟಿ';

  @override
  String get sessionSave => 'ಅವಧಿ ಉಳಿಸಿ';

  @override
  String get sessionsNone => 'ಇನ್ನೂ ಯಾವುದೇ ಅವಧಿ ಇಲ್ಲ.';

  @override
  String get plansNone => 'ಇನ್ನೂ ಯಾವುದೇ ಯೋಜನೆ ಇಲ್ಲ.';

  @override
  String get planNew => 'ಹೊಸ ಯೋಜನೆ';

  @override
  String get planGoal => 'ಗುರಿ';

  @override
  String get planActionsLabel => 'ಕ್ರಮಗಳು (ಪ್ರತಿ ಸಾಲಿಗೆ ಒಂದು)';

  @override
  String get planReviewLabel => 'ಪರಿಶೀಲನೆ ದಿನಾಂಕ';

  @override
  String get planCreate => 'ಯೋಜನೆ ರಚಿಸಿ';

  @override
  String get planClose => 'ಯೋಜನೆ ಮುಚ್ಚಿ';

  @override
  String get planOutcome => 'ಫಲಿತಾಂಶ';

  @override
  String get planRatingImproved => 'ಸುಧಾರಿಸಿದೆ';

  @override
  String get planRatingNoChange => 'ಬದಲಾವಣೆ ಇಲ್ಲ';

  @override
  String get planRatingWorsened => 'ಹದಗೆಟ್ಟಿದೆ';

  @override
  String planReviewOn(String date) {
    return '$date ರಂದು ಪರಿಶೀಲನೆ';
  }

  @override
  String get planClosed => 'ಮುಚ್ಚಲಾಗಿದೆ';

  @override
  String get rosterTermLabel => 'ಅವಧಿ';

  @override
  String get rosterNoTerms => 'ಯಾವುದೇ ಅವಧಿ ಕಂಡುಬಂದಿಲ್ಲ.';

  @override
  String get rosterNoOfferings => 'ಈ ಅವಧಿಯಲ್ಲಿ ನೀವು ಯಾವುದೇ ಕೋರ್ಸ್‌ನ ಬೋಧಕರಲ್ಲ.';

  @override
  String rosterCounts(String reg, String wait) {
    return '$reg ನೋಂದಾಯಿತ, $wait ಕಾಯುವ ಪಟ್ಟಿಯಲ್ಲಿ';
  }

  @override
  String rosterWaitlist(String pos) {
    return 'ಕಾಯುವ ಪಟ್ಟಿ $pos';
  }

  @override
  String get rosterEmpty => 'ಇನ್ನೂ ಯಾರೂ ನೋಂದಾಯಿಸಿಲ್ಲ.';

  @override
  String get surveysEmpty => 'ನಿಮಗಾಗಿ ಯಾವುದೇ ಸಮೀಕ್ಷೆ ಬಾಕಿ ಇಲ್ಲ.';

  @override
  String get surveyAnonymous => 'ಅನಾಮಧೇಯ';

  @override
  String surveyClosesOn(String when) {
    return '$when ರಂದು ಮುಚ್ಚುತ್ತದೆ';
  }

  @override
  String get surveyAnswered => 'ಉತ್ತರಿಸಲಾಗಿದೆ';

  @override
  String get surveySubmit => 'ಉತ್ತರಗಳನ್ನು ಕಳುಹಿಸಿ';

  @override
  String get surveyThanks => 'ಧನ್ಯವಾದಗಳು, ನಿಮ್ಮ ಉತ್ತರಗಳನ್ನು ಕಳುಹಿಸಲಾಗಿದೆ.';

  @override
  String get surveyRequired => 'ಎಲ್ಲಾ ಕಡ್ಡಾಯ ಪ್ರಶ್ನೆಗಳಿಗೆ ಉತ್ತರಿಸಿ.';

  @override
  String get surveyAnswerHint => 'ನಿಮ್ಮ ಉತ್ತರ';

  @override
  String get clubsEmpty => 'ನೀವು ಯಾವುದೇ ಕ್ಲಬ್‌ನ ಸಂಯೋಜಕರಲ್ಲ.';

  @override
  String clubMembersCount(String n) {
    return '$n ಸದಸ್ಯರು';
  }

  @override
  String clubPendingCount(String n) {
    return '$n ಮನವಿಗಳು ಬಾಕಿ';
  }

  @override
  String clubPoints(String n) {
    return '$n ಅಂಕಗಳು';
  }

  @override
  String get clubNoMembers => 'ಇನ್ನೂ ಸದಸ್ಯರಿಲ್ಲ.';

  @override
  String get insightsTitle => 'ವಿದ್ಯಾರ್ಥಿ ಒಳನೋಟ';

  @override
  String get insightsBody => 'ತರಗತಿಯ ಹಾಜರಾತಿ, ಅಂಕಗಳು ಮತ್ತು ಅಪಾಯದ ಸೂಚನೆ';

  @override
  String get insightsAttendance => 'ಹಾಜರಾತಿ';

  @override
  String get insightsMarks => 'ಸರಾಸರಿ ಅಂಕ';

  @override
  String get insightsFlagged => 'ಗಮನ ಬೇಕು';

  @override
  String insightsAttendanceValue(String value) {
    return 'ಹಾಜರಾತಿ $value';
  }

  @override
  String insightsMarksValue(String value) {
    return 'ಅಂಕ $value';
  }

  @override
  String get copilotTitle => 'ಎಐ ಸಹಾಯಕ';

  @override
  String get copilotBody =>
      'ವಿವರಣೆ, ರಸಪ್ರಶ್ನೆ, ಮನೆಕೆಲಸ ಮತ್ತು ಪಾಠ ಯೋಜನೆಯ ಕರಡುಗಳು';

  @override
  String get copilotExplain => 'ವಿವರಿಸಿ';

  @override
  String get copilotQuiz => 'ರಸಪ್ರಶ್ನೆ';

  @override
  String get copilotHomework => 'ಮನೆಕೆಲಸ';

  @override
  String get copilotLessonPlan => 'ಪಾಠ ಯೋಜನೆ';

  @override
  String get copilotQuestionLabel => 'ಏನನ್ನು ವಿವರಿಸಬೇಕು?';

  @override
  String get copilotTopicLabel => 'ವಿಷಯ';

  @override
  String copilotHowMany(int n) {
    return 'ಪ್ರಶ್ನೆಗಳು: $n';
  }

  @override
  String copilotMinutes(int n) {
    return 'ನಿಮಿಷಗಳು: $n';
  }

  @override
  String get copilotGenerate => 'ಕರಡು ರಚಿಸಿ';

  @override
  String get copilotDraftNote =>
      'ಎಐ ಕರಡು. ಬಳಸುವ ಮೊದಲು ಪರಿಶೀಲಿಸಿ; ಇಲ್ಲಿಂದ ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ಏನನ್ನೂ ಕಳುಹಿಸಲಾಗುವುದಿಲ್ಲ.';

  @override
  String get copilotSampleDraft =>
      'ಮಾದರಿ ಮಾತ್ರ: ಈ ಶಾಲೆಯ ಸರ್ವರ್‌ಗೆ ಇನ್ನೂ ಎಐ ಮಾದರಿ ಜೋಡಿಸಿಲ್ಲ. ಬಳಸುವ ಮೊದಲು ಎಲ್ಲವನ್ನೂ ಪರಿಶೀಲಿಸಿ.';

  @override
  String get copilotKeyPoints => 'ಮುಖ್ಯ ಅಂಶಗಳು';

  @override
  String get copilotFollowUps => 'ವಿದ್ಯಾರ್ಥಿಗಳು ಮುಂದೆ ಕೇಳಬಹುದು';

  @override
  String get copilotQuestions => 'ಪ್ರಶ್ನೆಗಳು';

  @override
  String get copilotObjectives => 'ಉದ್ದೇಶಗಳು';

  @override
  String get copilotSteps => 'ಹಂತಗಳು';

  @override
  String get copilotMaterials => 'ಸಾಮಗ್ರಿ';

  @override
  String get copilotAssessment => 'ಮೌಲ್ಯಮಾಪನ';

  @override
  String get copilotCopy => 'ಕರಡು ನಕಲಿಸಿ';

  @override
  String get copilotCopied => 'ಕರಡು ನಕಲಾಗಿದೆ.';

  @override
  String get evalToolTick => 'ಸರಿ ಗುರುತು';

  @override
  String get evalToolCross => 'ತಪ್ಪು ಗುರುತು';

  @override
  String get evalToolComment => 'ಟಿಪ್ಪಣಿ';

  @override
  String get evalMarksOnPage => 'ಸ್ಕ್ರಿಪ್ಟ್‌ನ ಗುರುತುಗಳು';

  @override
  String get evalEarlierNote => 'ಮಸುಕಾದ ಗುರುತುಗಳು ಹಿಂದಿನ ಮೌಲ್ಯಮಾಪನಗಳದ್ದು.';

  @override
  String get evalCommentPrompt => 'ಈ ಸ್ಥಳದ ಬಗ್ಗೆ ಟಿಪ್ಪಣಿ';

  @override
  String get evalAddMark => 'ಸೇರಿಸಿ';

  @override
  String get appraisalTitle => 'ಸ್ವಯಂ ಮೌಲ್ಯಮಾಪನ';

  @override
  String get appraisalBody =>
      'ನಿಮ್ಮ ವಾರ್ಷಿಕ ಸ್ವಯಂ ಮೌಲ್ಯಮಾಪನವನ್ನು ತುಂಬಿ ಸಲ್ಲಿಸಿ';

  @override
  String get appraisalNoCycle => 'ಈಗ ಯಾವುದೇ ಮೌಲ್ಯಮಾಪನ ಚಕ್ರ ತೆರೆದಿಲ್ಲ.';

  @override
  String get appraisalCycle => 'ಚಕ್ರ';

  @override
  String get appraisalMax => 'ಗರಿಷ್ಠ';

  @override
  String get appraisalScore => 'ಅಂಕ';

  @override
  String get appraisalEvidence => 'ಸಾಕ್ಷ್ಯ';

  @override
  String appraisalOverMax(String max) {
    return 'ಅಂಕ 0 ಮತ್ತು $max ನಡುವೆ ಇರಬೇಕು';
  }

  @override
  String get appraisalNeedScore => 'ಕನಿಷ್ಠ ಒಂದು ಅಂಕ ನಮೂದಿಸಿ.';

  @override
  String get appraisalSubmitted => 'ಮೌಲ್ಯಮಾಪನವನ್ನು ಪರಿಶೀಲನೆಗೆ ಸಲ್ಲಿಸಲಾಗಿದೆ.';

  @override
  String get appraisalSaved => 'ಕರಡನ್ನು ಉಳಿಸಲಾಗಿದೆ.';

  @override
  String get appraisalLocked =>
      'ನಿಮ್ಮ ಮೌಲ್ಯಮಾಪನ ಸಲ್ಲಿಕೆಯಾಗಿದೆ, ಇನ್ನು ಬದಲಿಸಲಾಗುವುದಿಲ್ಲ.';

  @override
  String get appraisalSelfPercent => 'ಸ್ವಯಂ ಅಂಕ';

  @override
  String get appraisalSaveDraft => 'ಕರಡು ಉಳಿಸಿ';

  @override
  String get appraisalSubmit => 'ಮೌಲ್ಯಮಾಪನ ಸಲ್ಲಿಸಿ';

  @override
  String get housesTitle => 'ಹೌಸ್‌ಗಳು';

  @override
  String get housesBody => 'ಲೀಡರ್‌ಬೋರ್ಡ್ ಮತ್ತು ಹೌಸ್ ಅಂಕಗಳು';

  @override
  String get housesEmpty => 'ಇನ್ನೂ ಯಾವುದೇ ಹೌಸ್ ರಚಿಸಿಲ್ಲ.';

  @override
  String get housesMembers => 'ಸದಸ್ಯರು';

  @override
  String get houseStudent => 'ವಿದ್ಯಾರ್ಥಿ (ಐಚ್ಛಿಕ)';

  @override
  String get houseWholeHouse => 'ಇಡೀ ಹೌಸ್';

  @override
  String get housePoints => 'ಅಂಕಗಳು (ಕಳೆಯಲು ಮೈನಸ್)';

  @override
  String get houseCategory => 'ವರ್ಗ';

  @override
  String get houseReason => 'ಕಾರಣ';

  @override
  String get houseAward => 'ಅಂಕ ನೀಡಿ';

  @override
  String get housePointsRange =>
      '-100 ರಿಂದ 100 ರ ನಡುವೆ ಅಂಕ ನಮೂದಿಸಿ, ಸೊನ್ನೆ ಅಲ್ಲ.';

  @override
  String get houseReasonNeeded => 'ಕನಿಷ್ಠ 3 ಅಕ್ಷರಗಳ ಕಾರಣ ಬರೆಯಿರಿ.';

  @override
  String get housePointsSaved => 'ಅಂಕಗಳನ್ನು ದಾಖಲಿಸಲಾಗಿದೆ.';

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
  String get curriculumTitle => 'ಪಠ್ಯಕ್ರಮ';

  @override
  String get curriculumBody =>
      'ಸಕ್ರಿಯ ಪಠ್ಯಕ್ರಮ, ಘಟಕಗಳು ಮತ್ತು ಕೋರ್ಸ್ ಫಲಿತಾಂಶಗಳು';

  @override
  String get curriculumEmpty => 'ಇನ್ನೂ ಯಾವುದೇ ಸಕ್ರಿಯ ಪಠ್ಯಕ್ರಮ ಇಲ್ಲ.';

  @override
  String get curriculumNoSubjects => 'ಈ ಆವೃತ್ತಿಯಲ್ಲಿ ಯಾವುದೇ ವಿಷಯಗಳಿಲ್ಲ.';

  @override
  String get curriculumUnits => 'ಘಟಕಗಳು';

  @override
  String get curriculumOutcomes => 'ಕೋರ್ಸ್ ಫಲಿತಾಂಶಗಳು';

  @override
  String get courseFilesTitle => 'ಕೋರ್ಸ್ ಫೈಲ್‌ಗಳು';

  @override
  String get courseFilesBody =>
      'ನಿಮ್ಮ ತರಗತಿಗಳ ಕೋರ್ಸ್ ಫೈಲ್ ರಚಿಸಿ ಮತ್ತು ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ';

  @override
  String get courseFilesEmpty => 'ಕೋರ್ಸ್ ಫೈಲ್ ರಚಿಸಲು ನಿಮಗೆ ಯಾವುದೇ ತರಗತಿ ಇಲ್ಲ.';

  @override
  String get courseFilesBuild => 'ಹೊಸ ಆವೃತ್ತಿ ರಚಿಸಿ';

  @override
  String get courseFilesBuilt => 'ಕೋರ್ಸ್ ಫೈಲ್ ರಚಿಸಲಾಗಿದೆ';

  @override
  String courseFilesVersion(int n) {
    return 'ಆವೃತ್ತಿ $n';
  }

  @override
  String get courseFilesReviewed => 'ಪರಿಶೀಲನೆ ಆಗಿದೆ';

  @override
  String get courseFilesAwaiting => 'ಪರಿಶೀಲನೆಗೆ ಕಾಯುತ್ತಿದೆ';

  @override
  String get courseFilesOpenFailed => 'ಫೈಲ್ ತೆರೆಯಲಾಗಲಿಲ್ಲ';

  @override
  String get courseFilesNone => 'ಇನ್ನೂ ಯಾವುದೇ ಆವೃತ್ತಿ ರಚಿಸಿಲ್ಲ';

  @override
  String get accessEmbargoed => 'ತಡೆಹಿಡಿಯಲಾಗಿದೆ';

  @override
  String accessEmbargoedUntil(String date) {
    return '$date ವರೆಗೆ ತಡೆ';
  }

  @override
  String get accessOpen => 'ಮುಕ್ತ';

  @override
  String get accessRestricted => 'ನಿರ್ಬಂಧಿತ ಪ್ರವೇಶ';

  @override
  String get cfAssessments => 'ಮೌಲ್ಯಮಾಪನಗಳು';

  @override
  String get cfAttendance => 'ಹಾಜರಾತಿ ಅವಧಿಗಳು';

  @override
  String get cfLessonPlans => 'ಪಾಠ ಯೋಜನೆಗಳು';

  @override
  String get cfOutcomes => 'ಕೋರ್ಸ್ ಫಲಿತಾಂಶಗಳು';

  @override
  String get cfPeriods => 'ಅವಧಿಗಳು';

  @override
  String get cfRecordings => 'ರೆಕಾರ್ಡಿಂಗ್‌ಗಳು';

  @override
  String get cfTopics => 'ಕಲಿಸಿದ ವಿಷಯಗಳು';

  @override
  String get cfWhiteboards => 'ವೈಟ್‌ಬೋರ್ಡ್‌ಗಳು';

  @override
  String get courseFileGenerate => 'ಹೊಸ ಆವೃತ್ತಿ ರಚಿಸಿ';

  @override
  String courseFileGenerated(String n) {
    return 'ಆವೃತ್ತಿ $n ರಚಿಸಲಾಗಿದೆ.';
  }

  @override
  String courseFileMeta(String date, String name, String size) {
    return '$date ರಂದು $name ಅವರಿಂದ ರಚಿಸಲಾಗಿದೆ · $size';
  }

  @override
  String get courseFileNone => 'ಇನ್ನೂ ಯಾವುದೇ ಆವೃತ್ತಿ ರಚಿಸಲಾಗಿಲ್ಲ.';

  @override
  String get courseFileNotReviewed => 'ಇನ್ನೂ ಪರಿಶೀಲಿಸಿಲ್ಲ';

  @override
  String get courseFileOpenPdf => 'PDF ತೆರೆಯಿರಿ';

  @override
  String courseFileReviewed(String name) {
    return '$name ಅವರು ಪರಿಶೀಲಿಸಿದ್ದಾರೆ';
  }

  @override
  String courseFileVersion(String n) {
    return 'ಆವೃತ್ತಿ $n';
  }

  @override
  String datasetFiles(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ಫೈಲ್‌ಗಳು',
      one: '1 ಫೈಲ್',
    );
    return '$_temp0';
  }

  @override
  String obeAttainmentDirect(String n) {
    return 'ನೇರ $n';
  }

  @override
  String get obeAttainmentHeader => 'ಪ್ರತಿ CO ಸಾಧನೆ';

  @override
  String obeAttainmentIndirect(String n) {
    return 'ಪರೋಕ್ಷ $n';
  }

  @override
  String get obeAttainmentNone => 'ಈ ವರ್ಷದ ಸಾಧನೆಯನ್ನು ಇನ್ನೂ ಲೆಕ್ಕಹಾಕಿಲ್ಲ.';

  @override
  String get obeAttainmentRestricted =>
      'ಸಾಧನೆಯ ಅಂಕಿಅಂಶಗಳನ್ನು ವಿಭಾಗ ಮುಖ್ಯಸ್ಥರು ಮತ್ತು ಗುಣಮಟ್ಟ ಕಚೇರಿಗೆ ತೋರಿಸಲಾಗುತ್ತದೆ.';

  @override
  String obeAttainmentTarget(String n) {
    return 'ಗುರಿ $n';
  }

  @override
  String get obeBody => 'ಕೋರ್ಸ್ ಫಲಿತಾಂಶಗಳು, CO–PO ಮ್ಯಾಟ್ರಿಕ್ಸ್ ಮತ್ತು ಸಾಧನೆ';

  @override
  String get obeMatrixHeader => 'CO–PO ಮ್ಯಾಟ್ರಿಕ್ಸ್';

  @override
  String get obeMatrixLegend => 'ಸಂಬಂಧದ ಬಲ: 1 ಕಡಿಮೆ, 2 ಮಧ್ಯಮ, 3 ಹೆಚ್ಚು';

  @override
  String get obeMatrixNoPos =>
      'ಈ ವಿಷಯದ ಕಾರ್ಯಕ್ರಮಕ್ಕೆ ಇನ್ನೂ ಯಾವುದೇ ಕಾರ್ಯಕ್ರಮ ಫಲಿತಾಂಶಗಳನ್ನು (PO/PSO) ನಿಗದಿಪಡಿಸಿಲ್ಲ.';

  @override
  String get obeMet => 'ಗುರಿ ಸಾಧಿಸಲಾಗಿದೆ';

  @override
  String get obeNoOutcomes =>
      'ಈ ವಿಷಯಕ್ಕೆ ಇನ್ನೂ ಯಾವುದೇ ಕೋರ್ಸ್ ಫಲಿತಾಂಶಗಳನ್ನು ನಿಗದಿಪಡಿಸಿಲ್ಲ.';

  @override
  String get obeNotMet => 'ಗುರಿಗಿಂತ ಕಡಿಮೆ';

  @override
  String get obeStatusActive => 'ಸಕ್ರಿಯ';

  @override
  String get obeStatusDraft => 'ಕರಡು';

  @override
  String get obeStatusRetired => 'ಹಳೆಯದು';

  @override
  String get obeSubjectsEmpty => 'ತೋರಿಸಲು ಯಾವುದೇ ವಿಷಯ ಇಲ್ಲ.';

  @override
  String get obeTitle => 'ಕೋರ್ಸ್ ಫಲಿತಾಂಶಗಳು (CO/PO)';

  @override
  String obeVersion(String n) {
    return 'ಆವೃತ್ತಿ $n';
  }

  @override
  String get programmeMphil => 'ಎಂ.ಫಿಲ್.';

  @override
  String get programmePhd => 'ಪಿಎಚ್.ಡಿ.';

  @override
  String get projAccept => 'ಒಪ್ಪಿಕೊಳ್ಳಿ';

  @override
  String get projAccepted => 'ಒಪ್ಪಲಾಗಿದೆ';

  @override
  String get projAddLink => 'ಲಿಂಕ್ ಸೇರಿಸಿ';

  @override
  String get projCommentHint => 'ಸಂದೇಶ ಬರೆಯಿರಿ';

  @override
  String get projCritDocumentation => 'ದಾಖಲೀಕರಣ';

  @override
  String get projCritExecution => 'ಅನುಷ್ಠಾನ';

  @override
  String get projCritTeamwork => 'ತಂಡ ಕಾರ್ಯ';

  @override
  String get projCritUnderstanding => 'ತಿಳುವಳಿಕೆ';

  @override
  String get projDecline => 'ತಿರಸ್ಕರಿಸಿ';

  @override
  String get projDeclined => 'ತಿರಸ್ಕರಿಸಲಾಗಿದೆ';

  @override
  String get projDiscussionEmpty => 'ಇನ್ನೂ ಯಾವುದೇ ಸಂದೇಶಗಳಿಲ್ಲ. ಚರ್ಚೆ ಆರಂಭಿಸಿ.';

  @override
  String get projFiles => 'ಫೈಲ್‌ಗಳು ಮತ್ತು ಲಿಂಕ್‌ಗಳು';

  @override
  String get projFilesNone => 'ಇನ್ನೂ ಯಾವುದೇ ಫೈಲ್ ಅಥವಾ ಲಿಂಕ್ ಇಲ್ಲ.';

  @override
  String get projHub => 'ಶೋಕೇಸ್ ಮತ್ತು ನೇಮಕಾತಿ';

  @override
  String get projHubLookingFor => 'ಬೇಕಾದ ಕೌಶಲ್ಯಗಳು (ಅಲ್ಪವಿರಾಮದಿಂದ ಬೇರ್ಪಡಿಸಿ)';

  @override
  String get projHubOpenings => 'ಖಾಲಿ ಸ್ಥಾನಗಳು';

  @override
  String get projHubRecruiting => 'ಸೇರಲು ವಿದ್ಯಾರ್ಥಿಗಳನ್ನು ಹುಡುಕಲಾಗುತ್ತಿದೆ';

  @override
  String get projHubSaved => 'ಉಳಿಸಲಾಗಿದೆ.';

  @override
  String get projHubShowcase => 'ಶೋಕೇಸ್‌ನಲ್ಲಿ ತೋರಿಸಿ';

  @override
  String get projHubSummary => 'ಸಾರಾಂಶ';

  @override
  String get projLinkInvalid =>
      'ಶೀರ್ಷಿಕೆ ಮತ್ತು http ಯಿಂದ ಪ್ರಾರಂಭವಾಗುವ ವೆಬ್ ಲಿಂಕ್ ನಮೂದಿಸಿ.';

  @override
  String get projLinkTitle => 'ಶೀರ್ಷಿಕೆ';

  @override
  String get projLinkUrl => 'ವೆಬ್ ಲಿಂಕ್';

  @override
  String projMatchFit(String pct) {
    return '$pct% ಹೊಂದಾಣಿಕೆ';
  }

  @override
  String get projMatches => 'ಸೂಚಿತ ವಿದ್ಯಾರ್ಥಿಗಳು';

  @override
  String get projMatchesNone =>
      'ಹೊಂದುವ ವಿದ್ಯಾರ್ಥಿಗಳನ್ನು ನೋಡಲು ಬೇಕಾದ ಕೌಶಲ್ಯಗಳನ್ನು ಸೇರಿಸಿ.';

  @override
  String get projMembers => 'ತಂಡ';

  @override
  String projMilestoneDone(String date) {
    return '$date ರಂದು ಪೂರ್ಣಗೊಂಡಿದೆ';
  }

  @override
  String projMilestoneDue(String date) {
    return '$date ರೊಳಗೆ';
  }

  @override
  String get projMilestones => 'ಮೈಲಿಗಲ್ಲುಗಳು';

  @override
  String get projMilestonesNone => 'ಇನ್ನೂ ಯಾವುದೇ ಮೈಲಿಗಲ್ಲು ಇಲ್ಲ.';

  @override
  String projMyRole(String role) {
    return 'ನಿಮ್ಮ ಪಾತ್ರ: $role';
  }

  @override
  String get projPending => 'ಬಾಕಿ';

  @override
  String projPi(String name) {
    return '$name ಅವರ ನೇತೃತ್ವದಲ್ಲಿ';
  }

  @override
  String get projRecordResult => 'ಫಲಿತಾಂಶ ದಾಖಲಿಸಿ';

  @override
  String get projRecruiting => 'ನೇಮಕಾತಿ ನಡೆಯುತ್ತಿದೆ';

  @override
  String get projReply => 'ಉತ್ತರಿಸಿ';

  @override
  String projReplyingTo(String name) {
    return '$name ಅವರಿಗೆ ಉತ್ತರ';
  }

  @override
  String get projRequests => 'ಸೇರುವ ವಿನಂತಿಗಳು';

  @override
  String get projRequestsNone => 'ಸೇರುವ ವಿನಂತಿಗಳಿಲ್ಲ.';

  @override
  String projReviewAverage(String count, String pct) {
    return '$count ವಿಮರ್ಶೆಗಳು, ಸರಾಸರಿ $pct%';
  }

  @override
  String get projReviewComment => 'ಟಿಪ್ಪಣಿ';

  @override
  String get projReviewExternal => 'ಬಾಹ್ಯ';

  @override
  String get projReviewMentor => 'ಮಾರ್ಗದರ್ಶಕ';

  @override
  String get projReviewPeer => 'ಸಹಪಾಠಿ';

  @override
  String get projReviewsEmpty => 'ಇನ್ನೂ ಯಾವುದೇ ವಿಮರ್ಶೆ ಇಲ್ಲ.';

  @override
  String get projRoleAdmin => 'ನಿರ್ವಾಹಕರು';

  @override
  String get projRoleMember => 'ಸದಸ್ಯ';

  @override
  String get projRolePi => 'ಯೋಜನಾ ಮುಖ್ಯಸ್ಥ';

  @override
  String get projRoleStudent => 'ವಿದ್ಯಾರ್ಥಿ';

  @override
  String get projRoleSupervisor => 'ಮೇಲ್ವಿಚಾರಕ';

  @override
  String get projScheduleViva => 'ವೈವಾ ನಿಗದಿಪಡಿಸಿ';

  @override
  String projScoreOutOf(String max) {
    return 'ಪ್ರತಿ ಮಾನದಂಡಕ್ಕೆ $max ರಲ್ಲಿ ಅಂಕ ನೀಡಿ';
  }

  @override
  String get projShowcase => 'ಶೋಕೇಸ್';

  @override
  String get projTabDiscussion => 'ಚರ್ಚೆ';

  @override
  String get projTabOverview => 'ಅವಲೋಕನ';

  @override
  String get projTabReviews => 'ವಿಮರ್ಶೆಗಳು';

  @override
  String get projTabTeam => 'ತಂಡ ಮತ್ತು ನೇಮಕಾತಿ';

  @override
  String get projVivaPanel => 'ಸಮಿತಿ ಸದಸ್ಯರು (ಅಲ್ಪವಿರಾಮದಿಂದ ಬೇರ್ಪಡಿಸಿ)';

  @override
  String get projVivaPanelNeeded => 'ಕನಿಷ್ಠ ಒಬ್ಬ ಸಮಿತಿ ಸದಸ್ಯರನ್ನು ಸೇರಿಸಿ.';

  @override
  String get projVivaRemarks => 'ಟಿಪ್ಪಣಿಗಳು';

  @override
  String get projVivaScore => 'ಅಂಕ (0–100, ಐಚ್ಛಿಕ)';

  @override
  String get projVivaScoreInvalid => '0 ರಿಂದ 100 ರ ನಡುವೆ ಅಂಕ ನಮೂದಿಸಿ.';

  @override
  String get projVivaVenue => 'ಸ್ಥಳ';

  @override
  String get projVivas => 'ವೈವಾ';

  @override
  String get projVivasNone => 'ಯಾವುದೇ ವೈವಾ ನಿಗದಿಯಾಗಿಲ್ಲ.';

  @override
  String get projWriteReview => 'ಮಾರ್ಗದರ್ಶಕ ವಿಮರ್ಶೆ ಬರೆಯಿರಿ';

  @override
  String get projectsBody =>
      'ನಿಮ್ಮ ವಿದ್ಯಾರ್ಥಿ ಯೋಜನೆಗಳು: ಚರ್ಚೆ, ವಿಮರ್ಶೆ, ವೈವಾ, ನೇಮಕಾತಿ';

  @override
  String get projectsEmpty => 'ನೀವು ಯಾವುದೇ ಯೋಜನೆಯಲ್ಲಿ ಇಲ್ಲ.';

  @override
  String get projectsTitle => 'ಯೋಜನಾ ಮಾರ್ಗದರ್ಶನ';

  @override
  String get pubAddByDoi => 'DOI ಮೂಲಕ ಸೇರಿಸಿ';

  @override
  String get pubDoiBody =>
      'ಪ್ರಕಟಣೆಯ DOI ನಮೂದಿಸಿ; KINETIX ಅದರ ವಿವರಗಳನ್ನು DOI ರಿಜಿಸ್ಟ್ರಿಯಿಂದ ಓದುತ್ತದೆ.';

  @override
  String get pubImport => 'ಆಮದು ಮಾಡಿ';

  @override
  String get pubKindBook => 'ಪುಸ್ತಕ';

  @override
  String get pubKindChapter => 'ಪುಸ್ತಕ ಅಧ್ಯಾಯ';

  @override
  String get pubKindConference => 'ಸಮ್ಮೇಳನ ಪ್ರಬಂಧ';

  @override
  String get pubKindJournal => 'ಜರ್ನಲ್ ಲೇಖನ';

  @override
  String get resKindCapstone => 'ಕ್ಯಾಪ್‌ಸ್ಟೋನ್';

  @override
  String get resKindIndustry => 'ಉದ್ಯಮ';

  @override
  String get resKindResearch => 'ಸಂಶೋಧನೆ';

  @override
  String get resStatusActive => 'ಸಕ್ರಿಯ';

  @override
  String get resStatusCancelled => 'ರದ್ದುಗೊಂಡಿದೆ';

  @override
  String get resStatusCompleted => 'ಪೂರ್ಣಗೊಂಡಿದೆ';

  @override
  String get resStatusOnHold => 'ತಡೆಹಿಡಿಯಲಾಗಿದೆ';

  @override
  String get researchBody =>
      'ಯೋಜನೆಗಳು, ಸಂಶೋಧನಾ ವಿದ್ಯಾರ್ಥಿಗಳು, ಪ್ರಕಟಣೆಗಳು ಮತ್ತು ಡೇಟಾಸೆಟ್‌ಗಳು';

  @override
  String get researchDatasets => 'ಡೇಟಾಸೆಟ್‌ಗಳು';

  @override
  String get researchDatasetsEmpty => 'ಇನ್ನೂ ಯಾವುದೇ ಡೇಟಾಸೆಟ್ ಇಲ್ಲ.';

  @override
  String get researchProjects => 'ಯೋಜನೆಗಳು';

  @override
  String get researchProjectsEmpty => 'ನಿಮಗೆ ಯಾವುದೇ ಸಂಶೋಧನಾ ಯೋಜನೆ ಇಲ್ಲ.';

  @override
  String get researchPublications => 'ಪ್ರಕಟಣೆಗಳು';

  @override
  String get researchPublicationsEmpty => 'ಇನ್ನೂ ಯಾವುದೇ ಪ್ರಕಟಣೆ ದಾಖಲಾಗಿಲ್ಲ.';

  @override
  String get researchScholars => 'ಸಂಶೋಧನಾ ವಿದ್ಯಾರ್ಥಿಗಳು';

  @override
  String get researchScholarsEmpty =>
      'ನೀವು ಯಾವುದೇ ಸಂಶೋಧನಾ ವಿದ್ಯಾರ್ಥಿಯನ್ನು ಮೇಲ್ವಿಚಾರಣೆ ಮಾಡುತ್ತಿಲ್ಲ.';

  @override
  String get researchTitle => 'ಸಂಶೋಧನೆ';

  @override
  String get scholarAwarded => 'ಪದವಿ ಪ್ರದಾನ';

  @override
  String get scholarEnrolled => 'ದಾಖಲಾಗಿದ್ದಾರೆ';

  @override
  String get scholarThesisSubmitted => 'ಪ್ರಬಂಧ ಸಲ್ಲಿಸಲಾಗಿದೆ';

  @override
  String get scholarWithdrawn => 'ಹಿಂಪಡೆಯಲಾಗಿದೆ';

  @override
  String get similarityNone => 'ಸಾಮ್ಯತೆ ಪರಿಶೀಲನೆ ಇನ್ನೂ ನಡೆದಿಲ್ಲ.';

  @override
  String similarityScore(String pct, String limit) {
    return 'ಸಾಮ್ಯತೆ $pct% (ಮಿತಿ $limit%)';
  }

  @override
  String get thesisAbstract => 'ಸಾರಾಂಶ';

  @override
  String get thesisHistory => 'ಇತಿಹಾಸ';

  @override
  String get thesisNeedsText => 'ಸಲ್ಲಿಸುವ ಮೊದಲು ಪ್ರಬಂಧದ ಪಠ್ಯವನ್ನು ಸೇರಿಸಬೇಕು.';

  @override
  String get thesisNone => 'ಇನ್ನೂ ಪ್ರಬಂಧ ದಾಖಲೆ ಇಲ್ಲ. ತೆರೆಯಲು ಒತ್ತಿ.';

  @override
  String get thesisOpen => 'ಪ್ರಬಂಧ ದಾಖಲೆ ತೆರೆಯಿರಿ';

  @override
  String get thesisStageAwarded => 'ಪದವಿ ಪ್ರದಾನ';

  @override
  String get thesisStageDraft => 'ಕರಡು';

  @override
  String get thesisStageExamination => 'ಪರೀಕ್ಷಣೆ';

  @override
  String get thesisStageLabel => 'ಹಂತ';

  @override
  String get thesisStageSubmitted => 'ಸಲ್ಲಿಸಲಾಗಿದೆ';

  @override
  String get thesisStageSynopsis => 'ಸಿನಾಪ್ಸಿಸ್';

  @override
  String get thesisStageViva => 'ವೈವಾ';

  @override
  String get thesisSubmit => 'ಪ್ರಬಂಧ ಸಲ್ಲಿಸಿ';

  @override
  String get thesisSubmitBody =>
      'ಪ್ರಬಂಧವು ಕರಡಿನಿಂದ ಸಲ್ಲಿಕೆಯ ಹಂತಕ್ಕೆ ಹೋಗುತ್ತದೆ. ಮುಂದಿನ ಕ್ರಮವನ್ನು ಸಂಶೋಧನಾ ಕಚೇರಿ ನಿರ್ವಹಿಸುತ್ತದೆ.';

  @override
  String get thesisTitleLabel => 'ಪ್ರಬಂಧದ ಶೀರ್ಷಿಕೆ';

  @override
  String get thesisVivas => 'ವೈವಾ ಪರೀಕ್ಷೆಗಳು';

  @override
  String get thesisVivasNone => 'ಇನ್ನೂ ಯಾವುದೇ ವೈವಾ ನಿಗದಿಯಾಗಿಲ್ಲ.';

  @override
  String get vivaCancelled => 'ರದ್ದುಗೊಂಡಿದೆ';

  @override
  String get vivaFailed => 'ಅನುತ್ತೀರ್ಣ';

  @override
  String get vivaHeld => 'ನಡೆದಿದೆ';

  @override
  String get vivaPassed => 'ಉತ್ತೀರ್ಣ';

  @override
  String get vivaRevise => 'ಪರಿಷ್ಕರಿಸಿ ಮರುಸಲ್ಲಿಸಿ';

  @override
  String get vivaScheduled => 'ನಿಗದಿಯಾಗಿದೆ';

  @override
  String get markingHelp => 'ಅಂಕ ನೀಡಲು ಸಹಾಯ';

  @override
  String get markingHelpNote =>
      'AI ಕೇವಲ ಕರಡನ್ನು ನೀಡುತ್ತದೆ. ಅಂಕ ಮತ್ತು ಟಿಪ್ಪಣಿಯನ್ನು ನೀವು ನಿರ್ಧರಿಸುತ್ತೀರಿ.';

  @override
  String get markingHelpOutOf => 'ಒಟ್ಟು ಎಷ್ಟು ಅಂಕಗಳಲ್ಲಿ?';

  @override
  String get markingHelpAsk => 'ಕರಡು ಪಡೆಯಿರಿ';

  @override
  String get markingHelpUse => 'ಟಿಪ್ಪಣಿಯಾಗಿ ಬಳಸಿ';

  @override
  String markingHelpDraft(String marks, String max) {
    return '$max ರಲ್ಲಿ $marks ಸೂಚಿತ';
  }

  @override
  String get offlineTitle => 'ನೆಟ್‌ವರ್ಕ್ ಇಲ್ಲದೆ ಬೋರ್ಡ್ ಪರಿಶೀಲನೆ';

  @override
  String get offlineNeedKey =>
      'ಒಮ್ಮೆ ಆನ್‌ಲೈನ್ ಇರುವಾಗ ಬೋರ್ಡ್‌ಗೆ ಸಂಪರ್ಕಿಸಿ ತೆರೆಯಿರಿ, ಆಗ ಈ ಫೋನ್ ನಿಮ್ಮ ಸಂಸ್ಥೆಯ ಕೀಲಿಯನ್ನು ಇಟ್ಟುಕೊಳ್ಳುತ್ತದೆ.';

  @override
  String get offlineExpired =>
      'ಈ ಕೋಡ್ ಅವಧಿ ಮೀರಿದೆ. ಈಗಿನ ಕೋಡ್‌ಗಾಗಿ ಬೋರ್ಡ್ ನೋಡಿ.';

  @override
  String get offlineNotYet =>
      'ಈ ಕೋಡ್ ಇನ್ನೂ ಮಾನ್ಯವಾಗಿಲ್ಲ. ಈ ಫೋನ್‌ನ ಸಮಯ ಪರಿಶೀಲಿಸಿ.';

  @override
  String get offlineWrongInstitution => 'ಈ ಬೋರ್ಡ್ ಬೇರೊಂದು ಸಂಸ್ಥೆಗೆ ಸೇರಿದೆ.';

  @override
  String get offlineBad => 'ಇದು ನಿಜವಾದ KINETIX ಬೋರ್ಡ್ ಕೋಡ್ ಅಲ್ಲ.';

  @override
  String offlineVerified(String board, String time) {
    return 'ನಿಮ್ಮ ಸಂಸ್ಥೆಯ ನಿಜವಾದ ಬೋರ್ಡ್ ($board ರಲ್ಲಿ ಕೊನೆ). ಕೋಡ್ $time ವರೆಗೆ ಮಾನ್ಯ. ಅದಕ್ಕೆ ಸೈನ್ ಇನ್ ಆಗಲು ಇಂಟರ್ನೆಟ್ ಬೇಕು.';
  }

  @override
  String get deviceTrustTitle => 'ಈ ಫೋನ್';

  @override
  String get deviceTrustNew =>
      'ಇನ್ನೂ ವಿಶ್ವಾಸಾರ್ಹವಲ್ಲ. ಈ ಫೋನ್‌ನಿಂದ ಸೈನ್-ಇನ್ ಹೊಸದೆಂದು ಗುರುತಿಸದಂತೆ ಇದನ್ನು ವಿಶ್ವಾಸಾರ್ಹ ಮಾಡಿ.';

  @override
  String get deviceTrustTrusted => 'ವಿಶ್ವಾಸಾರ್ಹ';

  @override
  String get deviceTrustButton => 'ಈ ಫೋನ್ ವಿಶ್ವಾಸಾರ್ಹ ಮಾಡಿ';
}
