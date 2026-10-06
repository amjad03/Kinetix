import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:kinetix_ui/kinetix_ui.dart';

Widget _app(Widget child, {Locale locale = const Locale('en')}) => MaterialApp(
  theme: KinetixTheme.light(),
  locale: locale,
  supportedLocales: const [Locale('en'), Locale('hi'), Locale('kn')],
  localizationsDelegates: GlobalMaterialLocalizations.delegates,
  home: Scaffold(body: child),
);

void main() {
  setUp(() {
    final view = TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
    view.physicalSize = const Size(1000, 2400);
    view.devicePixelRatio = 1;
  });
  tearDown(() => TestWidgetsFlutterBinding.instance.platformDispatcher.views.first.resetPhysicalSize());

  group('KxPicker', () {
    final items = [
      for (final c in ['Class 7 A', 'Class 7 B', 'Class 8 A'])
        for (final s in ['Maths', 'Science', 'English']) KxPickerItem(value: '$c/$s', label: s, group: c),
    ];

    testWidgets('shows the selection, opens a grouped, searchable sheet and ticks the chosen item', (tester) async {
      String? value = 'Class 7 B/Science';
      await tester.pumpWidget(
        _app(
          StatefulBuilder(
            builder: (context, setState) => KxPicker<String>(
              key: const Key('classSubject'),
              label: 'Class and subject',
              items: items,
              value: value,
              onChanged: (v) => setState(() => value = v),
            ),
          ),
        ),
      );
      expect(find.text('Class 7 B · Science'), findsOneWidget);

      await tester.tap(find.byKey(const Key('classSubject')));
      await tester.pumpAndSettle();
      // Section headers, subjects under them, a tick on the chosen one.
      expect(find.text('Class 7 A'), findsOneWidget);
      expect(find.text('Class 8 A'), findsOneWidget);
      final chosen = find.byKey(const ValueKey('kxPickerItem-Class 7 B · Science'));
      expect(find.descendant(of: chosen, matching: find.byIcon(Icons.check)), findsOneWidget);
      expect(find.byIcon(Icons.check), findsOneWidget);

      await tester.enterText(find.byKey(const Key('kxPickerSearch')), '8 a');
      await tester.pumpAndSettle();
      expect(find.text('Class 7 A'), findsNothing);
      expect(find.byKey(const ValueKey('kxPickerItem-Class 8 A · English')), findsOneWidget);

      await tester.enterText(find.byKey(const Key('kxPickerSearch')), 'zzz');
      await tester.pumpAndSettle();
      expect(find.text('Nothing matches “zzz”'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('kxPickerSearch')), 'english');
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('kxPickerItem-Class 8 A · English')));
      await tester.pumpAndSettle();
      expect(value, 'Class 8 A/English');
      expect(find.text('Class 8 A · English'), findsOneWidget);
    });

    testWidgets('validates in a form and has no search for a short list', (tester) async {
      final form = GlobalKey<FormState>();
      await tester.pumpWidget(
        _app(
          Form(
            key: form,
            child: KxPicker<int>(
              key: const Key('p'),
              label: 'Weeks',
              items: [for (var i = 1; i <= 4; i++) KxPickerItem(value: i, label: 'Week $i')],
              value: null,
              onChanged: (_) {},
              validator: (v) => v == null ? 'Choose a week' : null,
            ),
          ),
          locale: const Locale('hi'),
        ),
      );
      expect(find.text('चुनें'), findsOneWidget);
      expect(form.currentState!.validate(), isFalse);
      await tester.pump();
      expect(find.text('Choose a week'), findsOneWidget);
      await tester.tap(find.byKey(const Key('p')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('kxPickerSearch')), findsNothing);
      await tester.tap(find.text('Week 3'));
      await tester.pumpAndSettle();
      expect(form.currentState!.validate(), isTrue);
    });
  });

  testWidgets('KxCountChips filter, and a second tap shows all again', (tester) async {
    String? selected;
    await tester.pumpWidget(
      _app(
        StatefulBuilder(
          builder: (context, setState) => KxCountChips<String>(
            chips: const [
              KxCountChip(value: 'in', label: 'Handed in', count: 3, key: Key('c-in')),
              KxCountChip(value: 'missing', label: 'Missing', count: 2, key: Key('c-missing')),
            ],
            selected: selected,
            onSelected: (v) => setState(() => selected = v),
          ),
        ),
      ),
    );
    expect(find.byIcon(Icons.check), findsNothing);
    await tester.tap(find.byKey(const Key('c-missing')));
    await tester.pump();
    expect(selected, 'missing');
    expect(find.descendant(of: find.byKey(const Key('c-missing')), matching: find.byIcon(Icons.check)), findsOneWidget);
    await tester.tap(find.byKey(const Key('c-missing')));
    await tester.pump();
    expect(selected, isNull);
  });

  test('kxSquareJpegSync crops to the centre square and shrinks', () {
    final wide = img.Image(width: 1200, height: 800);
    final out = kxSquareJpegSync(Uint8List.fromList(img.encodePng(wide)), size: 256)!;
    final back = img.decodeJpg(out)!;
    expect((back.width, back.height), (256, 256));
    expect(kxSquareJpegSync(Uint8List.fromList([1, 2, 3])), isNull);
  });

  test('badges have names in every language and round-trip the API value', () {
    expect(KxBadge.values, hasLength(10));
    for (final b in KxBadge.values) {
      expect(KxBadge.fromApi(b.api), b);
      for (final l in ['en', 'hi', 'kn']) {
        expect(b.name(l), isNotEmpty);
      }
    }
    expect(KxBadge.masterOfMaths.name('kn'), 'ಗಣಿತ ಪರಿಣತ');
    expect(KxBadge.fromApi('gold_star'), isNull);
  });

  group('KxProfileEditScreen', () {
    Widget editor({
      required List<String> log,
      List<String>? subjects,
      Future<void> Function({required String fullName, required String? email, List<String>? teachingSubjects})? onSave,
    }) => _app(
      KxProfileEditScreen(
        fullName: 'Asha Rao',
        email: 'asha@x.in',
        phone: '+91 98450 00000',
        photo: null,
        teachingSubjects: subjects,
        pickImage: (source) async {
          log.add('pick ${source.name}');
          return Uint8List.fromList([1, 2, 3]);
        },
        processPhoto: (bytes) async => Uint8List.fromList([9, 9]),
        onPhoto: (jpeg) async => log.add('upload ${jpeg.length}'),
        onRemovePhoto: () async => log.add('remove'),
        onSave:
            onSave ??
            ({required fullName, required email, teachingSubjects}) async => log.add('save $fullName $email ${teachingSubjects?.join(',')}'),
        describeError: (e) => 'Failed: $e',
      ),
    );

    testWidgets('edits name, email and subjects; the phone is read-only with the reason', (tester) async {
      final log = <String>[];
      await tester.pumpWidget(editor(log: log, subjects: ['Maths']));
      expect(find.text('+91 98450 00000'), findsOneWidget);
      expect(find.textContaining('only your institution’s office can change it'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('nameField')), 'A');
      await tester.enterText(find.byKey(const Key('emailField')), 'nope');
      await tester.tap(find.byKey(const Key('saveProfile')));
      await tester.pump();
      expect(find.text('Enter your full name'), findsOneWidget);
      expect(find.text('Enter a valid email address'), findsOneWidget);
      expect(log, isEmpty);

      await tester.enterText(find.byKey(const Key('nameField')), 'Asha R. Rao');
      await tester.enterText(find.byKey(const Key('emailField')), '');
      await tester.enterText(find.byKey(const Key('subjectField')), 'Physics');
      await tester.tap(find.byKey(const Key('addSubject')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('saveProfile')));
      await tester.pumpAndSettle();
      expect(log, ['save Asha R. Rao null Maths,Physics']);
    });

    testWidgets('changes the photo from the camera and shows a failed save', (tester) async {
      final log = <String>[];
      await tester.pumpWidget(
        editor(
          log: log,
          onSave: ({required fullName, required email, teachingSubjects}) async => throw Exception('offline'),
        ),
      );
      expect(find.byKey(const Key('subjectField')), findsNothing);
      await tester.tap(find.byKey(const Key('changePhoto')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('photoRemove')), findsNothing);
      await tester.tap(find.byKey(const Key('photoCamera')));
      await tester.pumpAndSettle();
      expect(log, ['pick camera', 'upload 2']);
      expect(find.text('Photo updated'), findsOneWidget);

      await tester.tap(find.byKey(const Key('saveProfile')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('profileError')), findsOneWidget);
    });
  });
}
