import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart' show LessonStrings;

import '../core/api.dart';
import '../core/format.dart';
import '../core/models.dart';
import 'app_localizations.dart';

export 'app_localizations.dart';

/// The languages the app speaks. Hindi and Kannada are first drafts (see docs/i18n/family-apps.md).
enum AppLanguage {
  en('English'),
  hi('हिन्दी'),
  kn('ಕನ್ನಡ');

  const AppLanguage(this.nativeName);

  /// The language's name in itself, as the Language setting lists it.
  final String nativeName;

  Locale get locale => Locale(name);

  static AppLanguage? tryParse(String? code) => code == null ? null : values.asNameMap()[code.split(RegExp('[_-]')).first];
}

const appLocalizationsDelegates = <LocalizationsDelegate<Object>>[
  AppLocalizations.delegate,
  LessonStrings.delegate,
  GlobalMaterialLocalizations.delegate,
  GlobalWidgetsLocalizations.delegate,
  GlobalCupertinoLocalizations.delegate,
];

/// Before sign-in (and with no choice made): the device's first language the app speaks, else English.
Locale resolveDeviceLocale(List<Locale>? device, Iterable<Locale> supported) {
  for (final l in device ?? const <Locale>[]) {
    final lang = AppLanguage.tryParse(l.languageCode);
    if (lang != null) return lang.locale;
  }
  return AppLanguage.en.locale;
}

extension L10nContext on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
  Fmt get fmt => Fmt(AppLocalizations.of(this));

  /// [error] (an [ApiException], or text) in the app's language.
  String errorText(Object error) => describeError(AppLocalizations.of(this), error);
}

/// The server's English messages for errors this app can meet, by code: used when an older
/// server sends no `code`.
const errorCodeForMessage = <String, String>{
  'Wrong institution, login or password': 'AUTH_WRONG_LOGIN',
  'Your account is not active': 'AUTH_INACTIVE',
  'Invalid or expired token': 'AUTH_EXPIRED',
  'That subject is not taught in this class': 'SUBJECT_NOT_IN_CLASS',
  'Write an answer or add a photo': 'SUBMISSION_EMPTY',
  'This homework has already been checked': 'SUBMISSION_CHECKED',
  'This student hands in their own homework': 'SUBMISSION_STUDENT_ONLY',
  "In a school, the student's parent or guardian decides": 'CONSENT_GUARDIAN_DECIDES',
};

/// The error's code: the server's, else one recognised from its message.
String? errorCodeOf(ApiException e) => e.code ?? errorCodeForMessage[e.message];

/// Words for a server error code, or null when the code has none of its own (the caller then
/// words it from the status, or shows what the server said, such as a validation message).
String? describeErrorCode(AppLocalizations l, String? code) => switch (code) {
  'AUTH_WRONG_LOGIN' => l.errWrongLogin,
  'AUTH_INACTIVE' => l.errAccountInactive,
  'AUTH_EXPIRED' || 'UNAUTHORIZED' => l.errSignInAgain,
  'FORBIDDEN' => l.errForbidden,
  'NOT_FOUND' => l.errNotFound,
  'RATE_LIMITED' => l.errTooMany,
  'TOO_LARGE' => l.errTooLarge,
  'CONFLICT' => l.errConflict,
  'SUBJECT_NOT_IN_CLASS' => l.errSubjectNotInClass,
  'SUBMISSION_EMPTY' => l.errSubmissionEmpty,
  'SUBMISSION_CHECKED' => l.errSubmissionChecked,
  'SUBMISSION_STUDENT_ONLY' => l.errSubmissionStudentOnly,
  'CONSENT_GUARDIAN_DECIDES' => l.errConsentGuardianDecides,
  _ => null,
};

/// Words for an error: the app's own problems and the server's error codes are translated;
/// anything else the server said (such as a validation message) is shown as sent.
String describeError(AppLocalizations l, Object error) {
  if (error is! ApiException) return error.toString();
  return switch (error.problem) {
    ApiProblem.timeout => l.errTimeout,
    ApiProblem.unreachable => l.errUnreachable,
    ApiProblem.wrongLogin => l.errWrongLogin,
    ApiProblem.notGuardian => l.errNotGuardian,
    ApiProblem.teacherAccount => l.errTeacherAccount,
    null =>
      describeErrorCode(l, errorCodeOf(error)) ??
          switch (error.status) {
            403 when error.message.isEmpty => l.errForbidden,
            404 when error.message.isEmpty => l.errNotFound,
            413 => l.errTooLarge,
            429 => l.errTooMany,
            >= 500 => l.errGeneric(error.status),
            _ when error.message.isEmpty => l.errGeneric(error.status),
            _ => error.message,
          },
  };
}

extension AppLocalizationsLabels on AppLocalizations {
  String attendanceStatus(AttendanceStatus s) => switch (s) {
    AttendanceStatus.present => statusPresent,
    AttendanceStatus.absent => statusAbsent,
    AttendanceStatus.late => statusLate,
    AttendanceStatus.excused => statusExcused,
  };

  String paymentMethod(PaymentMethod m) => switch (m) {
    PaymentMethod.online => methodOnline,
    PaymentMethod.cash => methodCash,
    PaymentMethod.cheque => methodCheque,
    PaymentMethod.bankTransfer => methodBankTransfer,
    PaymentMethod.upi => 'UPI',
  };

  String assessmentKind(AssessmentKind k) => switch (k) {
    AssessmentKind.test => kindTest,
    AssessmentKind.assignment => kindAssignment,
    AssessmentKind.internal => kindInternal,
    AssessmentKind.exam => kindExam,
    AssessmentKind.practical => kindPractical,
  };
}
