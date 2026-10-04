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

/// Words for an error: the app's own problems are translated; anything else the server said
/// (such as a validation message) is shown as sent.
String describeError(AppLocalizations l, Object error) {
  if (error is! ApiException) return error.toString();
  return switch (error.problem) {
    ApiProblem.timeout => l.errTimeout,
    ApiProblem.unreachable => l.errUnreachable,
    ApiProblem.wrongLogin => l.errWrongLogin,
    ApiProblem.notStudent => l.errNotStudent,
    ApiProblem.guardianAccount => l.errGuardianAccount,
    ApiProblem.teacherAccount => l.errTeacherAccount,
    ApiProblem.notLinked => l.errNotLinked,
    null => switch (error.status) {
      403 when error.message.isEmpty => l.errForbidden,
      404 when error.message.isEmpty => l.errNotFound,
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

  String assessmentKind(AssessmentKind k) => switch (k) {
    AssessmentKind.test => kindTest,
    AssessmentKind.assignment => kindAssignment,
    AssessmentKind.internal => kindInternal,
    AssessmentKind.exam => kindExam,
    AssessmentKind.practical => kindPractical,
  };
}
