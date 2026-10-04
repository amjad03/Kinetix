import 'package:flutter/widgets.dart';

import '../l10n/app_localizations.dart';
import 'api.dart';
import 'models.dart';

export '../l10n/app_localizations.dart';

/// The UI languages, as `preferredLanguage` codes from `GET /v1/me`.
const supportedLanguages = ['en', 'hi', 'kn'];

/// Each language in its own script, for the language picker (never translated).
const languageEndonyms = {'en': 'English', 'hi': 'हिन्दी', 'kn': 'ಕನ್ನಡ'};

/// The intl locale for dates and numbers: Indian English, Hindi or Kannada as used in India.
String intlLocaleFor(String language) => switch (language) {
  'hi' => 'hi_IN',
  'kn' => 'kn_IN',
  _ => 'en_IN',
};

extension L10nContext on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
}

/// Labels for values that come from the API as codes.
extension AppLocalizationsX on AppLocalizations {
  /// A plain-language message for a failed request. Messages the server is known to send are
  /// translated; anything else it says is shown as is (the API answers in English).
  String errorText(ApiException e) {
    switch (e.kind) {
      case ApiErrorKind.offline:
        return errorOffline;
      case ApiErrorKind.timeout:
        return errorTimeout;
      case ApiErrorKind.notTeacher:
        return errorNotTeacher;
      case ApiErrorKind.http:
        return switch (e.status) {
          403 => errorForbidden,
          404 => errorNotFound,
          429 => errorTooManyAttempts,
          _ => errorGeneric(e.status),
        };
      case ApiErrorKind.server:
        break;
    }
    final known = switch (e.message) {
      'Invalid or expired token' => errorSessionExpired,
      'Wrong institution, login or password' => errorWrongLogin,
      'This code is invalid or has expired. Use the new code on the board.' => errorCodeExpired,
      'Your account is not active' => errorAccountInactive,
      'You are not a teacher at the campus this board belongs to' => errorOtherCampus,
      'Not a KINETIX pairing QR code' => errorNotPairingQr,
      'Enter the 6-digit code shown on the board' => enterAllDigits,
      'Attendance cannot be taken for a future date' => errorFutureAttendance,
      'You do not teach this class' => errorNotYourClass,
      'That subject is not taught in this class' => errorSubjectNotInClass,
      'The due date has already passed' => errorDueDatePassed,
      'Enter marks before publishing' => errorEnterMarksFirst,
      'Some students are not in this class' => errorStudentsNotInClass,
      'The recording is still uploading' => errorRecordingUploading,
      'This recording was not made with a class, so there is no one to share it with' => errorRecordingNoClass,
      _ => null,
    };
    if (known != null) return known;
    if (e.status == 429) return errorTooManyAttempts;
    return e.message;
  }

  String attendanceStatus(AttendanceStatus s) => switch (s) {
    AttendanceStatus.present => statusPresent,
    AttendanceStatus.absent => statusAbsent,
    AttendanceStatus.late => statusLate,
    AttendanceStatus.excused => statusExcused,
  };

  String attendanceCount(AttendanceStatus s, int n) => switch (s) {
    AttendanceStatus.present => countPresent(n),
    AttendanceStatus.absent => countAbsent(n),
    AttendanceStatus.late => countLate(n),
    AttendanceStatus.excused => countExcused(n),
  };

  String assessmentKind(AssessmentKind k) => switch (k) {
    AssessmentKind.test => kindTest,
    AssessmentKind.assignment => kindAssignment,
    AssessmentKind.internal => kindInternal,
    AssessmentKind.exam => kindExam,
    AssessmentKind.practical => kindPractical,
  };

  String role(String code) => switch (code) {
    'tenant_admin' => roleAdmin,
    'principal' => rolePrincipal,
    'hod' => roleHod,
    'teacher' => roleTeacher,
    'student' => roleStudent,
    'guardian' => roleParent,
    'librarian' => roleLibrarian,
    'accountant' => roleAccountant,
    _ => code,
  };

  /// "Father", "Mother"…; a relation the app does not know is shown as recorded.
  String relation(String code) => switch (code.toLowerCase()) {
    'father' => relationFather,
    'mother' => relationMother,
    'guardian' => relationGuardian,
    '' || 'parent' => relationParent,
    _ => code[0].toUpperCase() + code.substring(1),
  };

  /// "Parent of Aarav Patel · BCom Sem 3 A", or "Student · …" when an adult student writes.
  String conversationAbout(Conversation c) => c.withStudent ? aboutStudent(c.className) : aboutParent(c.student.name, c.className);
}
