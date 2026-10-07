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
  String get discardMarksBody => 'ನೀವು ನಮೂದಿಸಿದ ಕೆಲವು ಅಂಕಗಳನ್ನು ಇನ್ನೂ ಉಳಿಸಿಲ್ಲ.';

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
  String get institutionCodeChars => 'ಇಂಗ್ಲಿಷ್ ಅಕ್ಷರಗಳು, ಸಂಖ್ಯೆಗಳು ಮತ್ತು ಹೈಫನ್ (-) ಮಾತ್ರ ಬಳಸಿ';

  @override
  String get enterEmailOrPhone => 'ನಿಮ್ಮ ಇಮೇಲ್ ಅಥವಾ ಫೋನ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ';

  @override
  String get invalidEmail => 'ಸರಿಯಾದ ಇಮೇಲ್ ವಿಳಾಸ ನಮೂದಿಸಿ';

  @override
  String get invalidEmailOrPhone => 'ಸರಿಯಾದ ಇಮೇಲ್ ಅಥವಾ 10 ಅಂಕಿಯ ಫೋನ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ';

  @override
  String get enterPassword => 'ನಿಮ್ಮ ಪಾಸ್‌ವರ್ಡ್ ನಮೂದಿಸಿ';

  @override
  String get invalidServer => 'https://api.kinetix.in ರೀತಿಯ ಸರ್ವರ್ ವಿಳಾಸ ನಮೂದಿಸಿ';

  @override
  String get errorNotTeacher => 'ಈ ಆ್ಯಪ್ ಶಿಕ್ಷಕರಿಗಾಗಿ. ನಿಮ್ಮ ಖಾತೆಗೆ ಶಿಕ್ಷಕರ ಪಾತ್ರ ಇಲ್ಲ.';

  @override
  String get errorOffline => 'KINETIX ಸಂಪರ್ಕಿಸಲು ಆಗುತ್ತಿಲ್ಲ. ನಿಮ್ಮ ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕ ಮತ್ತು ಸರ್ವರ್ ವಿಳಾಸವನ್ನು ಪರಿಶೀಲಿಸಿ.';

  @override
  String get errorTimeout => 'ಸರ್ವರ್ ಪ್ರತಿಕ್ರಿಯಿಸಲು ತುಂಬಾ ಸಮಯ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get errorForbidden => 'ಇದಕ್ಕೆ ನಿಮಗೆ ಅನುಮತಿ ಇಲ್ಲ.';

  @override
  String get errorNotFound => 'ಸಿಗಲಿಲ್ಲ.';

  @override
  String get errorTooManyAttempts => 'ತುಂಬಾ ಪ್ರಯತ್ನಗಳಾಗಿವೆ. ಒಂದು ನಿಮಿಷ ಕಾದು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String errorGeneric(int status) {
    return 'ಏನೋ ತಪ್ಪಾಗಿದೆ ($status). ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';
  }

  @override
  String get errorSessionExpired => 'ನಿಮ್ಮ ಸೈನ್ ಇನ್ ಅವಧಿ ಮುಗಿದಿದೆ. ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಿ.';

  @override
  String get errorWrongLogin => 'ಸಂಸ್ಥೆಯ ಕೋಡ್, ಲಾಗಿನ್ ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್ ತಪ್ಪಾಗಿದೆ';

  @override
  String get errorCodeExpired => 'ಈ ಕೋಡ್ ತಪ್ಪಾಗಿದೆ ಅಥವಾ ಅದರ ಅವಧಿ ಮುಗಿದಿದೆ. ಬೋರ್ಡ್‌ನಲ್ಲಿರುವ ಹೊಸ ಕೋಡ್ ಬಳಸಿ.';

  @override
  String get errorAccountInactive => 'ನಿಮ್ಮ ಖಾತೆ ಸಕ್ರಿಯವಾಗಿಲ್ಲ';

  @override
  String get errorOtherCampus => 'ಈ ಬೋರ್ಡ್ ಇರುವ ಕ್ಯಾಂಪಸ್‌ನಲ್ಲಿ ನೀವು ಶಿಕ್ಷಕರಲ್ಲ';

  @override
  String get errorNotPairingQr => 'ಇದು KINETIX ಬೋರ್ಡ್‌ನ QR ಕೋಡ್ ಅಲ್ಲ';

  @override
  String get errorFutureAttendance => 'ಮುಂದಿನ ದಿನಾಂಕದ ಹಾಜರಾತಿಯನ್ನು ಈಗ ತೆಗೆದುಕೊಳ್ಳಲು ಆಗುವುದಿಲ್ಲ';

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
  String get errorRecordingNoClass => 'ಈ ರೆಕಾರ್ಡಿಂಗ್ ಯಾವುದೇ ತರಗತಿಯೊಂದಿಗೆ ಮಾಡಿಲ್ಲ, ಆದ್ದರಿಂದ ಹಂಚಿಕೊಳ್ಳಲು ಯಾರೂ ಇಲ್ಲ';

  @override
  String get recordingNotAvailable => 'ಈ ರೆಕಾರ್ಡಿಂಗ್ ಇನ್ನೂ ಲಭ್ಯವಿಲ್ಲ. ಇದು ಇನ್ನೂ ಬೋರ್ಡ್‌ನಿಂದ ಅಪ್‌ಲೋಡ್ ಆಗುತ್ತಿರಬಹುದು.';

  @override
  String get connectToBoard => 'ಬೋರ್ಡ್‌ಗೆ ಸಂಪರ್ಕಿಸಿ';

  @override
  String get connectToBoardBody => 'ಪಾಠ ಶುರು ಮಾಡಲು ತರಗತಿಯ ಬೋರ್ಡ್‌ನಲ್ಲಿರುವ QR ಕೋಡ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ';

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
  String get attendanceAlreadyTaken => 'ಹಾಜರಾತಿ ಈಗಾಗಲೇ ತೆಗೆದುಕೊಳ್ಳಲಾಗಿದೆ. ಬದಲಾವಣೆಗಳು ಹಿಂದಿನ ನಮೂದುಗಳನ್ನು ಬದಲಾಯಿಸುತ್ತವೆ.';

  @override
  String get attendanceHelp => 'ಎಲ್ಲರೂ ಮೊದಲಿಗೆ ಹಾಜರು. ಗೈರು ಎಂದು ಗುರುತಿಸಲು ಟ್ಯಾಪ್ ಮಾಡಿ, ತಡ ಎಂದು ಗುರುತಿಸಲು ಒತ್ತಿ ಹಿಡಿಯಿರಿ.';

  @override
  String get update => 'ಅಪ್‌ಡೇಟ್ ಮಾಡಿ';

  @override
  String get submit => 'ಸಲ್ಲಿಸಿ';

  @override
  String get enterAllDigits => 'ಬೋರ್ಡ್‌ನಲ್ಲಿ ಕಾಣುವ ಎಲ್ಲಾ 6 ಅಂಕಿಗಳನ್ನು ನಮೂದಿಸಿ';

  @override
  String get enterCodeTitle => 'ಬೋರ್ಡ್‌ನಲ್ಲಿರುವ ಕೋಡ್ ನಮೂದಿಸಿ';

  @override
  String get enterCodeBody => 'ಇದು QR ಕೋಡ್‌ನ ಕೆಳಗಿರುವ 6 ಅಂಕಿಯ ಸಂಖ್ಯೆ. ಪ್ರತಿ 2 ನಿಮಿಷಕ್ಕೊಮ್ಮೆ ಹೊಸ ಕೋಡ್ ಬರುತ್ತದೆ.';

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
  String get freeSessionBody => 'ಈಗ ವೇಳಾಪಟ್ಟಿಯಲ್ಲಿ ನಿಮಗೆ ಯಾವುದೇ ತರಗತಿ ಇಲ್ಲ, ಆದ್ದರಿಂದ ಬೋರ್ಡ್ ವಿದ್ಯಾರ್ಥಿಗಳ ಪಟ್ಟಿ ಇಲ್ಲದೆ ತೆರೆಯುತ್ತದೆ. 2 ಗಂಟೆಗಳ ನಂತರ ನೀವು ತಾನಾಗಿಯೇ ಸೈನ್ ಔಟ್ ಆಗುತ್ತೀರಿ.';

  @override
  String get qrNotOurs => 'ಇದು KINETIX ಬೋರ್ಡ್‌ನ ಕೋಡ್ ಅಲ್ಲ. ಬೋರ್ಡ್‌ನ ಪರದೆಯ ಮೇಲಿರುವ QR ಕೋಡ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ.';

  @override
  String get scanTitle => 'ಬೋರ್ಡ್‌ನ QR ಕೋಡ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ';

  @override
  String get torch => 'ಟಾರ್ಚ್';

  @override
  String get cameraDenied => 'ಸ್ಕ್ಯಾನ್ ಮಾಡಲು ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಕ್ಯಾಮೆರಾ ಅನುಮತಿ ನೀಡಿ, ಅಥವಾ ಬದಲಾಗಿ ಕೋಡ್ ನಮೂದಿಸಿ.';

  @override
  String get cameraUnavailable => 'ಕ್ಯಾಮೆರಾ ಲಭ್ಯವಿಲ್ಲ. ಬದಲಾಗಿ ಕೋಡ್ ನಮೂದಿಸಿ.';

  @override
  String get pointCamera => 'ಕ್ಯಾಮೆರಾವನ್ನು ಬೋರ್ಡ್‌ನಲ್ಲಿರುವ QR ಕೋಡ್ ಕಡೆಗೆ ತೋರಿಸಿ';

  @override
  String get enterCodeInstead => 'ಬದಲಾಗಿ ಕೋಡ್ ನಮೂದಿಸಿ';

  @override
  String get dueDate => 'ಸಲ್ಲಿಸುವ ದಿನಾಂಕ';

  @override
  String get assign => 'ನೀಡಿ';

  @override
  String get noClassesInTimetable => 'ನಿಮ್ಮ ವೇಳಾಪಟ್ಟಿಯಲ್ಲಿ ಇನ್ನೂ ಯಾವುದೇ ತರಗತಿಗಳಿಲ್ಲ';

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
  String get noHomework => 'ಇನ್ನೂ ಯಾವುದೇ ಹೋಂವರ್ಕ್ ಇಲ್ಲ.\nತರಗತಿಗೆ ಹೋಂವರ್ಕ್ ನೀಡಿದರೆ ಅದು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';

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
  String get assessmentTitleHint => 'ಉದಾ. ಯೂನಿಟ್ ಟೆಸ್ಟ್ 2: Redemption of shares';

  @override
  String get assessmentTitleRequired => 'ಶೀರ್ಷಿಕೆ ನೀಡಿ';

  @override
  String get kind => 'ಪ್ರಕಾರ';

  @override
  String get outOf => 'ಒಟ್ಟು ಅಂಕ';

  @override
  String get marksPrivateNote => 'ನೀವು ಪ್ರಕಟಿಸುವವರೆಗೆ ಅಂಕಗಳು ನಿಮಗೆ ಮಾತ್ರ ಕಾಣುತ್ತವೆ. ನಂತರ ವಿದ್ಯಾರ್ಥಿಗಳು ಮತ್ತು ಅವರ ಪೋಷಕರು ತಮ್ಮ ಅಂಕಗಳು ಮತ್ತು ತರಗತಿ ಸರಾಸರಿಯನ್ನು ನೋಡಬಹುದು.';

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
  String get publishBody => 'ತರಗತಿಯ ವಿದ್ಯಾರ್ಥಿಗಳು ಮತ್ತು ಪೋಷಕರಿಗೆ ಸೂಚನೆ ಹೋಗುತ್ತದೆ. ಅವರು ತಮ್ಮ ಅಂಕಗಳು, ತರಗತಿ ಸರಾಸರಿ ಮತ್ತು ಗರಿಷ್ಠ ಅಂಕವನ್ನು ನೋಡಬಹುದು.';

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
  String get publishCanCorrect => 'ಪ್ರಕಟಿಸಿದ ನಂತರವೂ ನೀವು ಅಂಕಗಳನ್ನು ಸರಿಪಡಿಸಬಹುದು.';

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
  String get publishedFamiliesSee => 'ಪ್ರಕಟಿಸಲಾಗಿದೆ · ಪೋಷಕರು ಈ ಅಂಕಗಳನ್ನು ನೋಡಬಹುದು';

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
  String get remarkHint => 'ಉದಾ. ಅಚ್ಚುಕಟ್ಟಾದ ಕೆಲಸ; ಜರ್ನಲ್ ಎಂಟ್ರಿಗಳನ್ನು ಪುನರಾವರ್ತಿಸಿ';

  @override
  String get noMessages => 'ಇನ್ನೂ ಯಾವುದೇ ಸಂದೇಶಗಳಿಲ್ಲ.\n“ಹೊಸ ಸಂದೇಶ” ಬಳಸಿ ವಿದ್ಯಾರ್ಥಿಯ ಪೋಷಕರಿಗೆ ಬರೆಯಿರಿ, ಅಥವಾ ಪೋಷಕರು ನಿಮಗೆ ಬರೆಯುವವರೆಗೆ ಕಾಯಿರಿ.';

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
  String get threadPrivacy => 'ಈ ಸಂಭಾಷಣೆ ನಿಮ್ಮ ಮತ್ತು ನೀವು ಆಯ್ಕೆಮಾಡುವ ವ್ಯಕ್ತಿಯ ನಡುವೆ ಇರುತ್ತದೆ. ಶಾಲೆಯ ಮುಖ್ಯಸ್ಥರು ಇದನ್ನು ಪರಿಶೀಲಿಸಬಹುದು.';

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
  String get noStudentsTaught => 'ನೀವು ಕಲಿಸುವ ತರಗತಿಗಳಲ್ಲಿ ಇನ್ನೂ ಯಾವುದೇ ವಿದ್ಯಾರ್ಥಿಗಳಿಲ್ಲ';

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
  String get noRecordings => 'ಇನ್ನೂ ಯಾವುದೇ ರೆಕಾರ್ಡಿಂಗ್ ಇಲ್ಲ.\nತರಗತಿಯ ಸಮಯದಲ್ಲಿ ಬೋರ್ಡ್‌ನಲ್ಲಿ ರೆಕಾರ್ಡ್ ಬಟನ್ ಒತ್ತಿ. ಬೋರ್ಡ್ ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ತಕ್ಷಣ ಪಾಠ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';

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
  String get signOutBody => 'ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಲು ನಿಮ್ಮ ಪಾಸ್‌ವರ್ಡ್ ಬೇಕಾಗುತ್ತದೆ.';

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
  String get mcqTestsBody => 'ಬೋರ್ಡ್ ರಸಪ್ರಶ್ನೆಗಳೊಂದಿಗೆ ಹೊಂದಿಕೊಳ್ಳುವ ಆನ್‌ಲೈನ್ ಟೆಸ್ಟ್‌ಗಳು';

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
  String get languageSaveFailed => 'ಈ ಫೋನ್‌ನಲ್ಲಿ ಭಾಷೆ ಬದಲಾಗಿದೆ. ಮುಂದಿನ ಬಾರಿ ಆನ್‌ಲೈನ್ ಆದಾಗ ಇದು ನಿಮ್ಮ ಖಾತೆಯಲ್ಲಿ ಉಳಿಯುತ್ತದೆ.';

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
  String get syllabusUnlinked => 'ಈ ವಿಷಯವನ್ನು ಇನ್ನೂ ಪಠ್ಯಕ್ರಮಕ್ಕೆ ಜೋಡಿಸಿಲ್ಲ. ನಿಮ್ಮ ಆಡಳಿತಾಧಿಕಾರಿ KINETIX ERP → Syllabus ನಲ್ಲಿ ಜೋಡಿಸಬಹುದು.';

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
  String get couldNotOpenFile => 'ಈ ಫೈಲ್ ತೆರೆಯಲಾಗಲಿಲ್ಲ. PDF ತೆರೆಯುವ ಆ್ಯಪ್ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿ.';

  @override
  String get remarkOptional => 'ಟಿಪ್ಪಣಿ (ಐಚ್ಛಿಕ)';

  @override
  String get reviewRemarkHint => 'ಉದಾ. ಉತ್ತಮ ಕೆಲಸ, ಅಥವಾ ಏನನ್ನು ಮತ್ತೆ ಮಾಡಬೇಕು';

  @override
  String get returnWork => 'ಮತ್ತೆ ಮಾಡಲು ಹಿಂದಿರುಗಿಸಿ';

  @override
  String get checkWork => 'ಪರಿಶೀಲಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಿ';

  @override
  String get reviewNotifies => 'ವಿದ್ಯಾರ್ಥಿ ಮತ್ತು ಅವರ ಪೋಷಕರಿಗೆ ನಿಮ್ಮ ಟಿಪ್ಪಣಿಯೊಂದಿಗೆ ತಿಳಿಸಲಾಗುತ್ತದೆ.';

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
  String get errorFutureCoverage => 'ಮುಂದಿನ ದಿನಾಂಕಕ್ಕೆ ವಿಷಯವನ್ನು ಕಲಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಲಾಗದು';

  @override
  String get errorValidation => 'ಕೆಲವು ವಿವರಗಳು ಸರಿಯಿಲ್ಲ. ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get yearPlan => 'ವಾರ್ಷಿಕ ಯೋಜನೆ';

  @override
  String get yearPlanNone => 'ಇನ್ನೂ ವಾರ್ಷಿಕ ಯೋಜನೆ ಇಲ್ಲ. ನಿಮ್ಮ ವೇಳಾಪಟ್ಟಿಯ ಪ್ರಕಾರ, ರಜೆ ಮತ್ತು ಪರೀಕ್ಷೆಗಳನ್ನು ಬಿಟ್ಟು, KINETIX ಈ ವಿಷಯದ ಪಠ್ಯಕ್ರಮವನ್ನು ಅವಧಿಯ ವಾರಗಳಿಗೆ ಹಂಚಬಹುದು. ನಂತರ ನೀವು ವಿಷಯಗಳನ್ನು ಬದಲಿಸಬಹುದು.';

  @override
  String get makeYearPlan => 'ವಾರ್ಷಿಕ ಯೋಜನೆ ಮಾಡಿ';

  @override
  String get makePlan => 'ಯೋಜನೆ ಮಾಡಿ';

  @override
  String get remakeYearPlan => 'ಯೋಜನೆಯನ್ನು ಮತ್ತೆ ಮಾಡಿ';

  @override
  String get remakeYearPlanTitle => 'ವಾರ್ಷಿಕ ಯೋಜನೆಯನ್ನು ಮತ್ತೆ ಮಾಡಬೇಕೇ?';

  @override
  String get remakeYearPlanBody => 'ನೀವು ಆರಿಸುವ ದಿನಾಂಕಗಳಿಂದ ಎಲ್ಲಾ ವಾರಗಳನ್ನು ಮತ್ತೆ ಯೋಜಿಸಲಾಗುತ್ತದೆ, ನೀವು ಬದಲಿಸಿದ ವಿಷಯಗಳು ಹಿಂದಿನ ಸ್ಥಾನಕ್ಕೆ ಹೋಗುತ್ತವೆ. ಈಗಾಗಲೇ ಕಲಿಸಿದ ವಿಷಯಗಳು ಹಾಗೆಯೇ ಉಳಿಯುತ್ತವೆ.';

  @override
  String get remake => 'ಮತ್ತೆ ಮಾಡಿ';

  @override
  String get planDatesNote => 'ನೀವು ದಿನಾಂಕಗಳನ್ನು ಬದಲಿಸದಿದ್ದರೆ, ಯೋಜನೆ ಇಂದಿನಿಂದ 16 ವಾರಗಳು, ಶೈಕ್ಷಣಿಕ ವರ್ಷದ ಕೊನೆಯವರೆಗೆ ಇರುತ್ತದೆ.';

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
  String get lessonCheckHint => 'ವಿದ್ಯಾರ್ಥಿಗಳು ಏನು ಕಲಿತರು ಎಂದು ಹೇಗೆ ಪರಿಶೀಲಿಸುವಿರಿ';

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
  String get replaceWithDraftBody => 'ಈ ಯೋಜನೆಯ ವಿಷಯಗಳು, ಉದ್ದೇಶಗಳು, ಹಂತಗಳು, ಸಾಮಗ್ರಿಗಳು ಮತ್ತು ಪರಿಶೀಲನೆ ಬದಲಾಗುತ್ತವೆ. ನಿಮ್ಮ ಹೋಂವರ್ಕ್ ಹಾಗೆಯೇ ಉಳಿಯುತ್ತದೆ.';

  @override
  String get replace => 'ಬದಲಿಸಿ';

  @override
  String get aiDraftLabel => 'AI ಕರಡು — ಬಳಸುವ ಮೊದಲು ಪರಿಶೀಲಿಸಿ';

  @override
  String get aiPreviewNote => 'ಮಾದರಿ: KINETIX AI ಸರ್ವರ್ ಸಂಪರ್ಕಗೊಂಡಿಲ್ಲ, ಆದ್ದರಿಂದ ಇದು ಮಾದರಿ ಕರಡು.';

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
  String get discardPlanBody => 'ನಿಮ್ಮ ಪಾಠ ಯೋಜನೆಯಲ್ಲಿ ಇನ್ನೂ ಉಳಿಸದ ಬದಲಾವಣೆಗಳಿವೆ.';

  @override
  String get errorPlanNoSyllabus => 'ಈ ವಿಷಯಕ್ಕೆ ಇನ್ನೂ ಪಠ್ಯಕ್ರಮ ಇಲ್ಲ. ಇದನ್ನು ಕೋರ್ಸ್‌ಗೆ ಜೋಡಿಸಲು ನಿಮ್ಮ ಆಡಳಿತಾಧಿಕಾರಿಗೆ ಕೇಳಿ.';

  @override
  String get errorPlanNoPeriods => 'ಈ ತರಗತಿಯ ವೇಳಾಪಟ್ಟಿಯಲ್ಲಿ ಈ ವಿಷಯಕ್ಕೆ ಯಾವುದೇ ಅವಧಿ ಇಲ್ಲ.';

  @override
  String get errorPlanNoTeachingDays => 'ಈ ದಿನಾಂಕಗಳ ನಡುವೆ ಯಾವುದೇ ಬೋಧನಾ ದಿನವಿಲ್ಲ.';

  @override
  String get errorPlanEndsBeforeStart => 'ಮುಕ್ತಾಯ ದಿನಾಂಕ ಪ್ರಾರಂಭ ದಿನಾಂಕದ ನಂತರ ಇರಬೇಕು.';

  @override
  String get errorPeriodNotOnDay => 'ಈ ತರಗತಿ ಆ ದಿನ ಇಲ್ಲ.';

  @override
  String get errorAiAllowance => 'ನಿಮ್ಮ ಸಂಸ್ಥೆ ಇಂದಿನ KINETIX AI ಮಿತಿಯನ್ನು ಬಳಸಿದೆ. ನಾಳೆ ಮತ್ತೆ ಲಭ್ಯ.';

  @override
  String get errorAiUnavailable => 'KINETIX AI ಈಗ ಲಭ್ಯವಿಲ್ಲ. ಒಂದು ನಿಮಿಷದ ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String get errorAiUnusable => 'KINETIX AI ಬಳಸಬಹುದಾದ ಕರಡು ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

  @override
  String reviewedByOn(String name, String date) {
    return '$name ಅವರು $date ರಂದು ಪರಿಶೀಲಿಸಿದ್ದಾರೆ';
  }

  @override
  String get signInWithPhone => 'ಫೋನ್ ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ';

  @override
  String get signInWithPassword => 'ಪಾಸ್‌ವರ್ಡ್ ಮೂಲಕ ಸೈನ್ ಇನ್ ಮಾಡಿ';

  @override
  String get phoneSignInSubtitle => 'ನಿಮ್ಮ ನೋಂದಾಯಿತ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಗೆ 6 ಅಂಕಿಯ ಕೋಡ್ ಕಳುಹಿಸುತ್ತೇವೆ';

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
  String get errorOtpInvalid => 'ಈ ಕೋಡ್ ತಪ್ಪಾಗಿದೆ ಅಥವಾ ಅವಧಿ ಮುಗಿದಿದೆ. SMS ಪರಿಶೀಲಿಸಿ ಅಥವಾ ಹೊಸ ಕೋಡ್ ಕಳುಹಿಸಿ.';

  @override
  String get demoChip => 'ಡೆಮೊ';

  @override
  String get demoBannerTitle => 'ಡೆಮೊ ಮೋಡ್';

  @override
  String get demoBannerBody => 'KINETIX ಡೆಮೊ ಕಾಲೇಜಿನ ಮಾದರಿ ಡೇಟಾ. ಯಾವುದನ್ನೂ ಸರ್ವರ್‌ಗೆ ಕಳುಹಿಸುವುದಿಲ್ಲ, ಮತ್ತು ನಿಮ್ಮ ಬದಲಾವಣೆಗಳು ಆ್ಯಪ್ ಮುಚ್ಚುವವರೆಗೆ ಮಾತ್ರ ಇರುತ್ತವೆ.';

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
  String get keepRecordingTooltip => 'ಉಳಿಸಿದ ರೆಕಾರ್ಡಿಂಗ್‌ಗಳನ್ನು ಅವಧಿ ಮುಗಿದಾಗ ಅಳಿಸಲಾಗುವುದಿಲ್ಲ';

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
  String get remoteNoSlides => 'ಇಲ್ಲಿಂದ ತಿರುಗಿಸಲು ಬೋರ್ಡ್‌ನಲ್ಲಿ ಸ್ಲೈಡ್‌ಗಳು ಅಥವಾ PDF ತೆರೆಯಿರಿ.';

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
  String get answerCardsMenuBody => 'ಫೋನ್ ಇಲ್ಲದ ವಿದ್ಯಾರ್ಥಿಗಳು ಬೋರ್ಡ್‌ನಲ್ಲಿ ಉತ್ತರಿಸಲು ಕಾರ್ಡ್‌ಗಳನ್ನು ಮುದ್ರಿಸಿ';

  @override
  String get answerCardsBody => 'ಪ್ರತಿ ವಿದ್ಯಾರ್ಥಿಗೆ ಹಾಜರಿ ಸಂಖ್ಯೆಯ ಪ್ರಕಾರ ಒಂದು ಕಾರ್ಡ್. ಬೋರ್ಡ್‌ನ \"ತರಗತಿಯನ್ನು ಕೇಳಿ\" ಯಲ್ಲಿ ಅವರು ಉತ್ತರ ಮೇಲಿರುವಂತೆ ಕಾರ್ಡ್ ಎತ್ತುತ್ತಾರೆ, ಬೋರ್ಡ್ ಒಂದೇ ಫೋಟೋದಿಂದ ಇಡೀ ತರಗತಿಯನ್ನು ಓದುತ್ತದೆ.';

  @override
  String get answerCardsPrintHint => 'Hold the card with your answer at the top. Keep your fingers off the black pattern.';

  @override
  String answerCardsReady(int count, String className) {
    return '$className ತರಗತಿಯ $count ಕಾರ್ಡ್‌ಗಳು ಮುದ್ರಣಕ್ಕೆ ಸಿದ್ಧ.';
  }

  @override
  String get answerCardsFailed => 'ಕಾರ್ಡ್‌ಗಳನ್ನು ಮಾಡಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.';

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
  String get remindBody => 'ಈ ಹೋಂವರ್ಕ್ ಇನ್ನೂ ಸಲ್ಲಿಸಿಲ್ಲ ಎಂದು ಅವರಿಗೂ ಅವರ ಕುಟುಂಬಕ್ಕೂ ಸೂಚನೆ ಹೋಗುತ್ತದೆ.';

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
  String get payslipsEmpty => 'ಇನ್ನೂ ವೇತನ ಚೀಟಿಗಳಿಲ್ಲ. ವೇತನ ಅಂತಿಮವಾದಾಗ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.';

  @override
  String get roleHr => 'ಎಚ್‌ಆರ್ ವ್ಯವಸ್ಥಾಪಕ';
}
