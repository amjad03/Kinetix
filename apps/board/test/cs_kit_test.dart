import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/kit/cs/cs_kit.dart';
import 'package:kinetix_board/features/board/kit/kit_panel.dart';
import 'package:kinetix_board/features/board/kit/subjects.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_cs/kinetix_cs.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

const phone = Size(390, 844), panel = Size(1920, 1080);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<WhiteboardController> pumpKit(WidgetTester tester, Size size, {Locale locale = const Locale('en')}) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final wb = WhiteboardController();
    addTearDown(wb.dispose);
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        locale: locale,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: Align(
            alignment: Alignment.topRight,
            child: SizedBox(
              width: size.width < 600 ? size.width : 420,
              child: SubjectKitPanel(
                board: BoardController()..skipEnrollment(),
                wb: wb,
                style: subjectStyles[Subject.computer]!,
                primary: false,
                onAi: (_) {},
                onPanel: (_) {},
                onSplit: (_) {},
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    return wb;
  }

  Future<void> openTab(WidgetTester tester, KitTab tab) async {
    await tester.dragUntilVisible(find.byKey(Key('kit-${tab.name}')), find.byType(ListView).first, const Offset(-120, 0));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key('kit-${tab.name}')));
    await tester.pumpAndSettle();
  }

  Future<void> tapItem(WidgetTester tester, String key) async {
    await tester.scrollUntilVisible(find.byKey(Key('cs-$key')), 200, scrollable: find.descendant(of: find.byType(CsKitTab), matching: find.byType(Scrollable)).first);
    await tester.tap(find.byKey(Key('cs-$key')));
    await tester.pumpAndSettle();
  }

  Future<void> tapKey(WidgetTester tester, String key) async {
    await tester.ensureVisible(find.byKey(Key(key)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key(key)));
    await tester.pumpAndSettle();
  }

  test('computer science and BCA/MCA classes get the CS kit and the code lab', () {
    final s = styleOf('BCA Data Structures');
    expect(s.subject, Subject.computer);
    expect(s.tools.first, SubjectTool.codeLab);
    expect(kitTabsFor(s, primary: false), containsAllInOrder([KitTab.lesson, KitTab.algorithms, KitTab.csLabs, KitTab.diagrams]));
    expect(styleOf('Computer Networks').subject, Subject.computer);
    expect(styleOf('MCA Operating Systems').subject, Subject.computer);
    expect(styleOf('BCA Discrete Mathematics').subject, Subject.maths);
  });

  for (final size in [panel, phone]) {
    testWidgets('an algorithm opens, steps and goes on the board (${size.width.toInt()} wide)', (tester) async {
      final wb = await pumpKit(tester, size);
      expect(find.byKey(const Key('kit-algorithms')), findsOneWidget);
      await tapItem(tester, 'quick');
      expect(find.byType(AlgoPlayer), findsOneWidget);
      await tester.tap(find.byKey(const Key('algo-next')));
      await tester.pump();
      await tester.ensureVisible(find.byKey(const Key('algo-put')));
      await tester.tap(find.byKey(const Key('algo-put')));
      await tester.pumpAndSettle();
      expect(find.byType(AlgoPlayer), findsNothing);
      expect(wb.elements.whereType<TextElement>().first.text, 'Pivot: 10.');
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('a CS lab puts its working on the board', (tester) async {
    final wb = await pumpKit(tester, panel);
    await openTab(tester, KitTab.csLabs);
    await tapItem(tester, 'cpu');
    expect(find.textContaining('Average'), findsOneWidget);
    await tester.tap(find.byKey(const Key('sim-put')));
    await tester.pumpAndSettle();
    expect(wb.elements.whereType<NoteElement>().single.text, contains('FCFS'));
    // The Gantt chart is drawn as boxes.
    expect(wb.elements.whereType<PolygonElement>().length, greaterThanOrEqualTo(4));
  });

  testWidgets('diagram parts go on the board and two selected shapes are connected', (tester) async {
    final wb = await pumpKit(tester, panel);
    await openTab(tester, KitTab.diagrams);
    await tapKey(tester, 'cs-conn_inheritance');
    expect(find.text('Select two shapes first.'), findsOneWidget);

    await tapKey(tester, 'cs-classBox');
    await tester.tap(find.byKey(const Key('cs-add')));
    await tester.pumpAndSettle();
    final first = wb.selection;
    await tapKey(tester, 'cs-er_entity');
    await tester.enterText(find.byKey(const Key('cs-label')), 'Person');
    await tester.tap(find.byKey(const Key('cs-add')));
    await tester.pumpAndSettle();
    wb.select({...first, ...wb.selection});
    final before = wb.elements.length;
    await tapKey(tester, 'cs-conn_inheritance');
    final added = wb.elements.skip(before).toList();
    expect(added.whereType<PolygonElement>().single.fill, const Color(0xFFFFFFFF));
    expect(wb.elements.whereType<TextElement>().map((t) => t.text), containsAll(['Student', 'Person', '+ register(): void']));
  });

  testWidgets('the code lab opens over the board and runs SQL on the device', (tester) async {
    final wb = await pumpKit(tester, panel);
    await tapItem(tester, 'codeLab');
    expect(find.byType(CodeLab), findsOneWidget);
    await tester.tap(find.text('SQL'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('code-run')));
    await tester.runAsync(() => Future<void>.delayed(const Duration(seconds: 2)));
    await tester.pump();
    expect(find.textContaining('Ananya Rao'), findsOneWidget);
    await tester.tap(find.byKey(const Key('code-put')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Code and output'));
    await tester.pumpAndSettle();
    final notes = wb.elements.whereType<NoteElement>().toList();
    expect(notes.map((n) => n.language), ['sql', 'output']);
    expect(notes.last.text, contains('rows in set'));
  });

  testWidgets('the CS kit speaks Hindi', (tester) async {
    await pumpKit(tester, panel, locale: const Locale('hi'));
    expect(find.text('एल्गोरिद्म'), findsWidgets);
    expect(find.text('बबल सॉर्ट'), findsOneWidget);
  });
}
