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
  /// A plain-language message for a failed request. The server's error `code` decides the
  /// words; older servers send no code, so the English messages they are known to send are
  /// matched instead. Anything else the server says is shown as is (the API answers in English).
  String errorText(ApiException e) {
    switch (e.kind) {
      case ApiErrorKind.offline:
        return errorOffline;
      case ApiErrorKind.timeout:
        return errorTimeout;
      case ApiErrorKind.notTeacher:
        return errorNotTeacher;
      case ApiErrorKind.server:
      case ApiErrorKind.http:
        break;
    }
    final byCode = switch (e.code) {
      'AUTH_EXPIRED' || 'UNAUTHORIZED' => errorSessionExpired,
      'AUTH_WRONG_LOGIN' => errorWrongLogin,
      'OTP_INVALID' => errorOtpInvalid,
      'AUTH_INACTIVE' => errorAccountInactive,
      'PAIRING_CODE_INVALID' => errorCodeExpired,
      'PAIRING_WRONG_CAMPUS' => errorOtherCampus,
      'NOT_YOUR_CLASS' => errorNotYourClass,
      'SUBJECT_NOT_IN_CLASS' => errorSubjectNotInClass,
      'STUDENTS_NOT_IN_CLASS' => errorStudentsNotInClass,
      'ATTENDANCE_FUTURE_DATE' => errorFutureAttendance,
      'HOMEWORK_DUE_PASSED' => errorDueDatePassed,
      'MARKS_EMPTY' => errorEnterMarksFirst,
      'RECORDING_UPLOADING' => errorRecordingUploading,
      'RECORDING_NO_CLASS' => errorRecordingNoClass,
      'SUBMISSION_MISSING' => errorNothingHandedIn,
      'TOPIC_NOT_IN_SYLLABUS' => errorTopicNotInSyllabus,
      'COVERAGE_FUTURE_DATE' => errorFutureCoverage,
      'PLAN_NO_SYLLABUS' => errorPlanNoSyllabus,
      'PLAN_NO_PERIODS' => errorPlanNoPeriods,
      'PLAN_NO_TEACHING_DAYS' => errorPlanNoTeachingDays,
      'PLAN_BAD_RANGE' => errorPlanEndsBeforeStart,
      'PERIOD_WRONG_DAY' => errorPeriodNotOnDay,
      _ => null,
    };
    if (byCode != null) return byCode;
    // Older servers (no code), and messages that have no code of their own.
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
      'Nothing has been handed in yet' => errorNothingHandedIn,
      "That topic is not in this subject's syllabus" => errorTopicNotInSyllabus,
      'A topic cannot be marked as taught in the future' => errorFutureCoverage,
      // Year plans and lesson plans, from servers that sent no code for them.
      'This subject has no syllabus yet. Link it to a course first.' => errorPlanNoSyllabus,
      'This subject has no periods in the timetable' => errorPlanNoPeriods,
      'There are no teaching days in these dates' => errorPlanNoTeachingDays,
      'The plan must end after it starts' => errorPlanEndsBeforeStart,
      'This period is not on that day' => errorPeriodNotOnDay,
      "Your institution has used today's KINETIX AI allowance. It resets tomorrow." => errorAiAllowance,
      'KINETIX AI is not reachable right now. Try again in a minute.' => errorAiUnavailable,
      'KINETIX AI could not produce a usable answer. Try again or rephrase.' => errorAiUnusable,
      _ => null,
    };
    if (known != null) return known;
    // Codes for the HTTP status: words for the ones a teacher can act on.
    final byStatus = switch (e.code) {
      'FORBIDDEN' => errorForbidden,
      'NOT_FOUND' => errorNotFound,
      'RATE_LIMITED' => errorTooManyAttempts,
      'VALIDATION' => errorValidation,
      'SERVER_ERROR' => errorGeneric(e.status),
      _ => null,
    };
    if (byStatus != null) return byStatus;
    if (e.kind == ApiErrorKind.http) {
      return switch (e.status) {
        403 => errorForbidden,
        404 => errorNotFound,
        429 => errorTooManyAttempts,
        _ => errorGeneric(e.status),
      };
    }
    if (e.status == 429) return errorTooManyAttempts;
    return e.message;
  }

  /// The banner on a year plan: "On track", "Behind by 2 topics", "Ahead", "Not started".
  String planStatus(PlanProgress p) => switch (p.status) {
    PlanStatus.notStarted => planNotStarted,
    PlanStatus.onTrack => planOnTrack,
    PlanStatus.behind => planBehindBy(p.behindBy),
    PlanStatus.ahead => planAhead,
  };

  String calendarKind(CalendarKind k) => switch (k) {
    CalendarKind.holiday => calendarHoliday,
    CalendarKind.exam => calendarExam,
    CalendarKind.event => calendarEvent,
  };

  /// "Handed in", "Checked", "Returned", or "Not handed in" for no status.
  String submissionStatus(SubmissionStatus? s) => switch (s) {
    SubmissionStatus.submitted => statusHandedIn,
    SubmissionStatus.checked => statusChecked,
    SubmissionStatus.returned => statusReturned,
    null => statusNotHandedIn,
  };

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
    'hr_manager' => roleHr,
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
