import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_teacher/app.dart';
import 'package:kinetix_teacher/core/app_state.dart';
import 'package:kinetix_teacher/core/l10n.dart';
import 'package:kinetix_teacher/core/models.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fake_api.dart';

/// A screen on its own, localised like the app.
Widget localizedApp({required Widget home, String language = 'en'}) => MaterialApp(
  theme: KinetixTheme.light(),
  locale: Locale(language),
  supportedLocales: AppLocalizations.supportedLocales,
  localizationsDelegates: const [
    AppLocalizations.delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ],
  home: home,
);

/// The strings for [language], for finders in localised tests.
AppLocalizations strings(String language) => lookupAppLocalizations(Locale(language));

/// A phone-sized view (logical pixels) with an optional text scale.
void phone(WidgetTester tester, {Size size = const Size(412, 892), double textScale = 1}) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
}

bool _fontsLoaded = false;

/// Loads the real bundled fonts (Google Sans, Noto Sans Devanagari and Kannada), so text in
/// layout tests has its true width and height instead of the test font's squares.
Future<void> loadAppFonts() async {
  if (_fontsLoaded) return;
  _fontsLoaded = true;
  final dir = Directory('../../packages/kinetix_ui/fonts');
  for (final family in ['GoogleSans', 'NotoSansDevanagari', 'NotoSansKannada']) {
    final loader = FontLoader('packages/kinetix_ui/$family');
    for (final f in dir.listSync().whereType<File>().where((f) => f.path.contains('$family-') && f.path.endsWith('.ttf'))) {
      loader.addFont(Future.value(ByteData.sublistView(f.readAsBytesSync())));
    }
    await loader.load();
  }
  // Icons, so they do not count as text.
  final icons = File(
    '${Platform.environment['FLUTTER_ROOT'] ?? '/opt/flutter'}/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
  );
  if (icons.existsSync()) {
    await (FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(icons.readAsBytesSync())))).load();
  }
}

/// A Monday with a class now and one later, homework, a published and a draft test.
void seed(FakeTeacherApi api, {String language = 'en'}) {
  api.profile = Me(
    id: api.profile.id,
    fullName: api.profile.fullName,
    roles: const ['teacher', 'hod'],
    preferredLanguage: language,
    institution: api.profile.institution,
    email: api.profile.email,
  );
  api.today = '2026-10-05';
  api.periodsByDate = {
    '2026-10-05': [api.period(isNow: true), api.period(slotId: 'slot2')],
  };
  final today = DateUtils.dateOnly(DateTime.now());
  api.homework = [
    Homework(
      id: 'h1',
      title: 'Exercise 4.2, questions 1–5',
      instructions: 'Show all working.',
      dueOn: today.add(const Duration(days: 1)),
      section: api.section,
      subject: api.subject,
    ),
    Homework(
      id: 'h2',
      title: 'Journal entries for share issue',
      instructions: '',
      dueOn: today.subtract(const Duration(days: 5)),
      section: api.section,
      subject: api.subject,
    ),
  ];
  api.addAssessment(
    title: 'Unit test 1',
    published: true,
    marks: {
      's1': const MarkInput(studentId: 's1', marks: 19),
      's2': const MarkInput(studentId: 's2', marks: 22.5),
      's3': const MarkInput(studentId: 's3', absent: true),
    },
  );
  api.addAssessment(title: 'Ledger assignment', maxMarks: 10);
}

Future<AppState> pumpApp(WidgetTester tester, FakeTeacherApi api, {Map<String, Object>? prefs, FakeRealtime? realtime}) async {
  if (prefs != null) SharedPreferences.setMockInitialValues(prefs);
  final state = AppState(api, await SharedPreferences.getInstance(), realtime: realtime);
  await tester.pumpWidget(TeacherApp(state: state));
  await state.restore();
  await tester.pumpAndSettle();
  return state;
}

Future<void> tapAndSettle(WidgetTester tester, Finder f) async {
  await tester.tap(f.hitTestable().first);
  await tester.pumpAndSettle();
}

/// Back, as the system back button does (asks first when there are unsaved changes).
Future<void> pop(WidgetTester tester) async {
  await TeacherApp.navigatorKey.currentState!.maybePop();
  await tester.pumpAndSettle();
}

/// Hides snackbars so they do not cover buttons at the bottom of the next screen.
Future<void> clearSnackBars(WidgetTester tester) async {
  tester.state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger).first).clearSnackBars();
  await tester.pumpAndSettle();
}
