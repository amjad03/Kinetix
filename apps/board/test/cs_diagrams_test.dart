import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/board/kit/college/biz/kit_editors.dart';
import 'package:kinetix_board/features/board/kit/cs/cs_diagram_editor.dart';
import 'package:kinetix_board/features/board/kit/cs/cs_diagram_samples.dart';
import 'package:kinetix_board/features/board/kit/cs/cs_diagram_strings.dart';
import 'package:kinetix_board/features/board/kit/cs/cs_kit.dart';
import 'package:kinetix_board/features/board/kit/subjects.dart';
import 'package:kinetix_board/features/curriculum/curriculum_registry.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_cs/kinetix_cs.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

const accent = Color(0xFF006879);

/// The computer science kit's live diagrams (UML, ER, schema, automata): the ready samples, the
/// editor (typing, dragging, running a string, SQL for the code lab), reopening a panel from the
/// board, and where the curriculum puts the kit.
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('Hindi and Kannada have every English key; every type and sample is named', () {
    final en = csDiagramStringTable['en']!.keys.toSet();
    for (final lang in ['hi', 'kn']) {
      expect(csDiagramStringTable[lang]!.keys.toSet(), en, reason: lang);
      expect(csDiagramStringTable[lang]!.values.every((v) => v.trim().isNotEmpty), isTrue);
    }
    for (final t in CsDiagramType.values) {
      expect(en, containsAll(['type.${t.name}', 'help.${t.name}']));
    }
    for (final x in CsDiagramSample.values) {
      expect(en, contains('sample.${x.name}'));
    }
    expect(isCsDiagramKit(KitKind.csDiagram), isTrue);
    expect(isCsDiagramKit(KitKind.timing), isFalse);
  });

  test('every sample reads whole: its kind, boxes and lines; library, bank and student DB are all there', () {
    for (final x in CsDiagramSample.values) {
      final d = sampleDiagram(x);
      expect(d.type, sampleType(x), reason: x.name);
      final p = d.parsed;
      expect(p.nodes.length, greaterThanOrEqualTo(2), reason: x.name);
      expect(p.edges, isNotEmpty, reason: x.name);
      // Nothing named in a line is left without a box.
      for (final e in p.edges) {
        expect(p.nodes.keys, containsAll({e.from, e.to}), reason: x.name);
      }
    }
    final lib = sampleDiagram(CsDiagramSample.libraryClasses).parsed;
    expect(lib.nodes['Person']!.kind, 'abstract');
    expect(lib.edges.map((e) => e.kind).toSet(), containsAll(['inherit', 'compose', 'aggregate', 'line', 'arrow']));
    final er = sampleDiagram(CsDiagramSample.studentEr).parsed;
    expect(er.nodes.values.map((n) => n.kind).toSet(), containsAll(['entity', 'weak', 'key', 'partial', 'multi', 'derived', 'relationship', 'idrel']));
    for (final x in [CsDiagramSample.dfaEnds01, CsDiagramSample.dfaEvenZeros]) {
      expect(isDeterministic(sampleDiagram(x).parsed), isTrue, reason: x.name);
    }
    final nfa = sampleDiagram(CsDiagramSample.nfaContains01).parsed;
    expect(isDeterministic(nfa), isFalse);
    expect([for (final w in ['1101', '1110', '0001']) automatonAccepts(nfa, w)], [true, false, true]);
    expect(automatonAccepts(sampleDiagram(CsDiagramSample.dfaEvenZeros).parsed, '1001'), isTrue);
  });

  test('the ER and schema samples become SQL that SQLite takes', () async {
    for (final x in [CsDiagramSample.studentEr, CsDiagramSample.bankEr, CsDiagramSample.libraryEr, CsDiagramSample.studentSchema, CsDiagramSample.librarySchema]) {
      final d = sampleDiagram(x);
      final sql = d.type == CsDiagramType.er ? erToSql(d.parsed) : schemaToSql(d.parsed);
      final r = await SqlRunner().run(RunRequest(CodeLanguage.sql, "$sql\nSELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;"));
      expect(r.status, RunStatus.ok, reason: '${x.name}\n$sql\n${r.stderr}');
      expect(r.stdout, contains(x == CsDiagramSample.bankEr ? 'payment' : (x.name.startsWith('library') ? 'book' : 'student')), reason: x.name);
    }
    final student = erToSql(sampleDiagram(CsDiagramSample.studentEr).parsed);
    expect(student, allOf(contains('CREATE TABLE enrols'), contains('CREATE TABLE guardian'), contains('CREATE TABLE student_phone'), contains('REFERENCES department(dept_id)')));
  });

  group('the kit', () {
    Future<WhiteboardController> pumpKit(WidgetTester tester) async {
      tester.view.physicalSize = const Size(1920, 1400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final wb = WhiteboardController();
      addTearDown(wb.dispose);
      await tester.pumpWidget(
        MaterialApp(
          theme: KinetixTheme.light(),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: Align(alignment: Alignment.topRight, child: SizedBox(width: 460, child: CsKitTab(tab: KitTab.diagrams, wb: wb, accent: accent))),
          ),
        ),
      );
      await tester.pump();
      return wb;
    }

    Future<void> tap(WidgetTester tester, Key key) async {
      await tester.ensureVisible(find.byKey(key));
      await tester.tap(find.byKey(key));
      await tester.pumpAndSettle();
    }

    testWidgets('a DFA: run a string step by step; drag a state; it goes on the board and opens again', (tester) async {
      final wb = await pumpKit(tester);
      await tap(tester, const Key('csd-sample-dfaEnds01'));
      expect(find.byKey(const Key('csd-editor')), findsOneWidget);
      expect(find.byKey(const Key('csd-help')), findsOneWidget);
      await tap(tester, const Key('csd-run'));
      expect(tester.widget<Text>(find.byKey(const Key('csd-verdict'))).data, 'States now: {q0}');
      await tap(tester, const Key('csd-next'));
      await tap(tester, const Key('csd-next'));
      await tap(tester, const Key('csd-next'));
      expect(tester.widget<Text>(find.byKey(const Key('csd-verdict'))).data, 'States now: {q1}');
      await tap(tester, const Key('csd-end'));
      expect(tester.widget<Text>(find.byKey(const Key('csd-verdict'))).data, 'Accepted');
      await tester.enterText(find.byKey(const Key('csd-input')), '110');
      await tester.pumpAndSettle();
      await tap(tester, const Key('csd-end'));
      expect(tester.widget<Text>(find.byKey(const Key('csd-verdict'))).data, 'Rejected');
      // Drag q0 to the right.
      const natural = Size(1240, 860);
      final d = sampleDiagram(CsDiagramSample.dfaEnds01);
      final q0 = layoutDiagram(d.parsed, const {}, natural)['q0']!;
      final box = tester.getRect(find.byKey(const Key('csd-preview')));
      final scale = box.width / natural.width;
      await tester.dragFrom(box.topLeft + q0 * scale, const Offset(80, 0));
      await tester.pumpAndSettle();
      await tap(tester, const Key('csd-done'));
      final k = wb.elements.whereType<KitElement>().single;
      expect(k.kind, KitKind.csDiagram);
      final saved = CsDiagram.fromJson(k.data);
      expect((saved.input, saved.step), ('110', 3));
      expect(saved.pos['q0']!.dx, greaterThan(q0.dx + 40));
      expect(saved.pos['q1'], isNotNull, reason: 'the other boxes stay where they were');
      // Opened again, as a tap on the board panel would, the text changed and saved in place.
      final edited = editKit(tester.element(find.byType(CsKitTab)), k);
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('csd-title')), 'Ends in 01 (edited)');
      await tap(tester, const Key('csd-tidy'));
      await tap(tester, const Key('csd-done'));
      final back = await edited;
      expect(back!.id, k.id);
      expect(CsDiagram.fromJson(back.data).title, 'Ends in 01 (edited)');
      expect(CsDiagram.fromJson(back.data).pos, isEmpty);
    });

    testWidgets('an ER diagram: type a change, it redraws; its SQL opens in the code lab', (tester) async {
      String? sql;
      openSqlInCodeLab = (_, s) async => sql = s;
      final wb = await pumpKit(tester);
      await tap(tester, const Key('csd-sample-studentEr'));
      final spec = tester.widget<TextField>(find.byKey(const Key('csd-spec'))).controller!;
      await tester.enterText(find.byKey(const Key('csd-spec')), '${spec.text}entity Hostel\n  *hostel_id\nStudent -- Stays : N\nStays -- Hostel : 1\nrelationship Stays\n');
      await tester.pumpAndSettle();
      await tap(tester, const Key('csd-sql'));
      expect(sql, allOf(contains('CREATE TABLE hostel'), contains('REFERENCES hostel(hostel_id)')));
      await tap(tester, const Key('csd-done'));
      final d = CsDiagram.fromJson(wb.elements.whereType<KitElement>().single.data);
      expect(d.parsed.nodes['Stays']!.kind, 'relationship');
    });

    testWidgets('a blank class diagram of each kind can be started; cancel leaves the board alone', (tester) async {
      final wb = await pumpKit(tester);
      for (final t in [CsDiagramType.classes, CsDiagramType.sequence, CsDiagramType.schema]) {
        await tap(tester, Key('csd-new-${t.name}'));
        expect(find.byKey(const Key('csd-editor')), findsOneWidget);
        await tap(tester, const Key('csd-cancel'));
      }
      expect(wb.elements, isEmpty);
      // The old parts are still offered beside the live diagrams.
      expect(find.byKey(const Key('cs-classBox')), findsOneWidget);
    });
  });

  test('registry: CS / IS papers, AI-ML and school Computer Science bring the algorithms, the code lab and the diagrams', () {
    List<String> f(String id) => CurriculumRegistry.choice(id)!.subject.features;
    for (final id in ['be-cse/data-structures', 'be-cse/algorithms', 'be-cse/operating-systems', 'be-cse/computer-networks', 'be-aiml/aiml-data-structures', 'class-12/computer-science', 'class-11/computer-science']) {
      expect(f(id), contains('tool:algorithms'), reason: id);
    }
    for (final id in ['be-cse/dbms', 'be-cse/software-engineering', 'be-cse/oop-java', 'be-cse/theory-of-computation', 'be-aiml/dbms', 'be-aiml/oop-java', 'class-12/computer-science']) {
      expect(f(id), contains('kit:diagrams'), reason: id);
    }
    for (final id in ['be-cse/oop-java', 'be-cse/dbms', 'be-cse/theory-of-computation', 'be-aiml/oop-java']) {
      expect(f(id), contains('tool:code-lab'), reason: id);
      expect(subjectSamples[id.split('/').last], isNotEmpty, reason: id);
    }
    expect(CurriculumRegistry.choice('be-cse/theory-of-computation')!.subject.name, 'Theory of Computation');
  });
}
