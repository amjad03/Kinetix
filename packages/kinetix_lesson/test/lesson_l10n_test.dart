import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'lesson_player_test.dart' show FakeSource, detailsJson;

/// The player in Hindi and Kannada: its own words, dates in the language, Western digits, and
/// no overflow on small phones with larger text.
void main() {
  Future<void> pump(
    WidgetTester tester,
    Locale locale, {
    bool registerDelegate = true,
    FakeSource? source,
    RecordingInfo? initial,
    Size size = const Size(412, 892),
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        locale: locale,
        supportedLocales: const [Locale('en'), Locale('hi'), Locale('kn')],
        localizationsDelegates: [
          if (registerDelegate) LessonStrings.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: LessonPlayerScreen(
          source: source ?? FakeSource(),
          recordingId: 'r1',
          initial: initial,
          audioFactory: (rec, location, length) async => SilentLessonAudio(length, audible: true),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  final missed = RecordingInfo.fromJson({...detailsJson(), 'missed': true});

  testWidgets('Hindi: tabs, notes, page count and the date', (tester) async {
    await pump(tester, const Locale('hi'), initial: missed);
    expect(find.text('सारांश'), findsOneWidget);
    expect(find.text('ट्रांसक्रिप्ट'), findsOneWidget);
    expect(find.text('मुख्य बातें'), findsOneWidget);
    expect(find.text('यह कक्षा छूट गई। जो छूटा उसे पूरा करने के लिए पाठ देखें।'), findsOneWidget);
    // Day and month in Hindi, digits stay Western: "रवि 4 अक्तू॰, 10:02 am" (the time is local).
    expect(find.textContaining(RegExp(r'· रवि 4 \S+, \d+:\d\d [ap]m$')), findsOneWidget);
    expect(find.textContaining(RegExp('[०-९]')), findsNothing);
    await tester.tap(find.byKey(const Key('lessonForward10')));
    await tester.pump();
    expect(tester.widget<Text>(find.byKey(const Key('lessonPage'))).data, 'पेज 2 / 2');
    expect(tester.widget<IconButton>(find.byKey(const Key('lessonPlay'))).tooltip, 'चलाएँ');
  });

  testWidgets('Kannada follows the app locale even without the delegate registered', (tester) async {
    await pump(tester, const Locale('kn'), registerDelegate: false);
    expect(find.text('ಸಾರಾಂಶ'), findsOneWidget);
    expect(find.text('ಪ್ರತಿಲಿಪಿ'), findsOneWidget);
    expect(find.textContaining(RegExp(r'· ಭಾನು 4 \S+, \d+:\d\d [ap]m$')), findsOneWidget);
    expect(tester.widget<IconButton>(find.byKey(const Key('lessonBack10'))).tooltip, '10 ಸೆಕೆಂಡ್ ಹಿಂದೆ');
  });

  testWidgets('pending summary and errors are translated; an app can word its own load error', (tester) async {
    await pump(
      tester,
      const Locale('kn'),
      source: FakeSource(details: detailsJson(summaryState: 'queued', summary: null, hasAudio: false)),
    );
    expect(find.text('ಸಾರಾಂಶ ಸಿದ್ಧವಾಗುತ್ತಿದೆ. ಕೆಲವು ನಿಮಿಷಗಳ ನಂತರ ಮತ್ತೆ ನೋಡಿ.'), findsOneWidget);
    expect(find.text('ಈ ಪಾಠವನ್ನು ಧ್ವನಿ ಇಲ್ಲದೆ ರೆಕಾರ್ಡ್ ಮಾಡಲಾಗಿದೆ.'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await pump(tester, const Locale('hi'), source: _Failing());
    expect(find.text('अपना संदेश'), findsOneWidget);
    expect(find.text('फिर से कोशिश करें'), findsOneWidget);
  });

  test('lengths in each language', () {
    final hi = LessonStrings.forLocale(const Locale('hi'));
    final kn = LessonStrings.forLocale(const Locale('kn'));
    expect(LessonFmt.length(const Duration(minutes: 24), hi), '24 मिनट');
    expect(LessonFmt.length(const Duration(minutes: 65), hi), '1 घंटा 5 मिनट');
    expect(LessonFmt.length(const Duration(minutes: 120), hi), '2 घंटे');
    expect(LessonFmt.length(const Duration(seconds: 20), kn), 'ಒಂದು ನಿಮಿಷಕ್ಕಿಂತ ಕಡಿಮೆ');
    expect(LessonFmt.length(const Duration(minutes: 65), kn), '1 ಗಂಟೆ 5 ನಿಮಿಷ');
    expect(LessonStrings.forLocale(const Locale('ta')).summary, 'Summary');
  });

  for (final locale in const [Locale('hi'), Locale('kn')]) {
    for (final size in const [Size(360, 640), Size(430, 932), Size(640, 360)]) {
      testWidgets('${locale.languageCode} at ${size.width.round()}×${size.height.round()}, text ×1.3: no overflow', (tester) async {
        tester.platformDispatcher.textScaleFactorTestValue = 1.3;
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        await pump(tester, locale, size: size, initial: missed);
        await tester.tap(find.byKey(const Key('lessonForward10')));
        await tester.pump();
        expect(tester.takeException(), isNull);
      });
    }
  }
}

/// A source whose app words its own error (as the Parent and Student apps do).
class _Failing extends FakeSource {
  @override
  Future<RecordingInfo> recording(String id) async =>
      throw LessonLoadException('Your own message', describe: (context) => Localizations.localeOf(context).languageCode == 'hi' ? 'अपना संदेश' : 'x');
}
