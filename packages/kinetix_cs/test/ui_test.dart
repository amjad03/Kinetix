import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_cs/kinetix_cs.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import 'runner_test.dart' show FakePage, job;

Widget _app(Widget child, {Locale locale = const Locale('en')}) => MaterialApp(
  locale: locale,
  supportedLocales: const [Locale('en'), Locale('hi'), Locale('kn')],
  localizationsDelegates: GlobalMaterialLocalizations.delegates,
  home: Scaffold(body: SizedBox(width: 1400, height: 900, child: child)),
);

void main() {
  setUp(() {
    final view = TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
    view.physicalSize = const Size(1400, 900);
    view.devicePixelRatio = 1;
  });

  test('every string has English, Hindi and Kannada', () {
    for (final e in CsStrings.words.entries) {
      expect(e.value, hasLength(3), reason: e.key);
      expect(e.value.every((w) => w.trim().isNotEmpty), isTrue, reason: e.key);
      // Placeholders survive translation.
      for (final p in RegExp(r'\{\d\}').allMatches(e.value[0]).map((m) => m[0])) {
        expect(e.value[1].contains(p!) && e.value[2].contains(p), isTrue, reason: '${e.key} $p');
      }
    }
  });

  test('every algorithm runs on its defaults, every caption is translated, every frame draws', () {
    const s = CsStrings('kn');
    for (final k in AlgoKind.values) {
      final frames = algoFrames(k, values: _defaults[k]!.$1, extra: _defaults[k]!.$2);
      expect(frames, isNotEmpty, reason: k.name);
      for (final f in frames) {
        expect(CsStrings.words.containsKey(f.say.key), isTrue, reason: '${k.name}: ${f.say.key}');
        expect(s.t(f.say.key, f.say.args), isNot(contains('{0}')));
        expect(frameElements(f, caption: 'x'), isNotEmpty);
      }
    }
    expect(algoGroups.values.expand((g) => g).toSet(), AlgoKind.values.toSet());
  });

  test('every simulation runs on its defaults in all three languages', () {
    for (final lang in ['en', 'hi', 'kn']) {
      for (final k in SimKind.values) {
        final out = runSim(k, [for (final f in simFields(k)) f.initial], CsStrings(lang));
        expect(out.text, isNotEmpty, reason: '$lang ${k.name}');
        expect(out.board(), isNotEmpty);
      }
    }
    expect(simGroups.values.expand((g) => g).toSet(), SimKind.values.toSet());
    const en = CsStrings('en');
    expect(runSim(SimKind.cpu, ['P1 0 5\nP2 1 3\nP3 2 1', 'sched_roundRobin', '2'], en).text, contains('Average'));
    expect(runSim(SimKind.banker, ['0 1 0\n2 0 0\n3 0 2\n2 1 1\n0 0 2', '7 5 3\n3 2 2\n9 0 2\n2 2 2\n4 3 3', '3 3 2', 'P1: 1 0 2'], en).text, allOf(contains('⟨P1, P3, P4, P0, P2⟩'), contains('Granted')));
    expect(runSim(SimKind.normal, ['ABC', 'A->B, B->C'], en).text, contains('Highest normal form: 2NF'));
    expect(runSim(SimKind.subnet, ['10.0.0.0/8', '2'], en).text, contains('10.128.0.0/9'));
    expect(() => runSim(SimKind.subnet, ['nonsense', '0'], en), throwsFormatException);
    expect(() => runSim(SimKind.logic, ['A +', ''], en), throwsFormatException);
  });

  test('diagram parts and connectors', () {
    for (final p in FlowPart.values) {
      expect(flowPart(p, 'x'), isNotEmpty);
    }
    for (final p in ErPart.values) {
      expect(erPart(p, 'roll_no'), isNotEmpty);
    }
    final cls = umlClass('Student\n- roll: int\n- name: String\n--\n+ study(): void');
    expect(cls.whereType<TextElement>().map((t) => t.text), containsAll(['Student', '- roll: int', '+ study(): void']));
    expect(umlClass('Shape', interface: true).whereType<TextElement>().first.text, '«interface»');
    expect(lifeline(':Server').whereType<Stroke>().length, greaterThan(10)); // the dashes
    const a = Rect.fromLTWH(0, 0, 100, 50), b = Rect.fromLTWH(300, 0, 100, 50);
    final inh = connect(a, b, Connector.inheritance);
    final head = inh.whereType<PolygonElement>().single;
    expect(head.points.first, b.centerLeft);
    expect(head.fill, const Color(0xFFFFFFFF));
    expect(connect(a, b, Connector.composition).whereType<PolygonElement>().single.fill, inkColor);
    expect(connect(a, b, Connector.dependency).whereType<Stroke>().length, greaterThan(5));
    expect(connect(a, b, Connector.line, label: '1..N').whereType<TextElement>().single.text, '1..N');
    // Vertical neighbours connect bottom to top.
    final down = connect(a, a.shift(const Offset(0, 200)), Connector.arrow);
    expect(down.whereType<Stroke>().first.points.first.y, a.bottom);
  });

  testWidgets('the algorithm player steps, plays and puts the step on the board', (tester) async {
    final inserted = <List<BoardElement>>[];
    await tester.pumpWidget(_app(AlgoPlayer(kind: AlgoKind.bubble, onInsert: inserted.add)));
    expect(find.text('The unsorted array.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('algo-next')));
    await tester.pump();
    expect(find.text('Compare 27 and 38.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('algo-put')));
    expect(inserted.single.whereType<TextElement>().first.text, 'Compare 27 and 38.');
    await tester.enterText(find.byKey(const Key('algo-values')), '3 1 2');
    await tester.tap(find.byKey(const Key('algo-apply')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('algo-play')));
    await tester.pump(const Duration(seconds: 30));
    expect(find.textContaining('Sorted:'), findsOneWidget);
  });

  testWidgets('the algorithm player speaks Kannada', (tester) async {
    await tester.pumpWidget(_app(AlgoPlayer(kind: AlgoKind.stack, onInsert: (_) {}), locale: const Locale('kn')));
    expect(find.text('ಖಾಲಿ ಸ್ಟ್ಯಾಕ್.'), findsOneWidget);
  });

  testWidgets('a simulation recomputes as you type and puts its table on the board', (tester) async {
    final inserted = <List<BoardElement>>[];
    await tester.pumpWidget(_app(SimPanel(kind: SimKind.subnet, onInsert: inserted.add)));
    expect(find.textContaining('192.168.10.64/26'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('sim-addressPrefix')), '10.1.2.3/30');
    await tester.pump();
    expect(find.textContaining('10.1.2.0/30'), findsOneWidget);
    await tester.tap(find.byKey(const Key('sim-put')));
    final card = inserted.single.whereType<NoteElement>().single;
    expect(card.kind, NoteKind.code);
    expect(card.language, 'output');
    await tester.enterText(find.byKey(const Key('sim-addressPrefix')), 'x');
    await tester.pump();
    expect(find.text('Check what you typed'), findsOneWidget);
  });

  testWidgets('the code lab runs Python on the page, SQL on SQLite, and puts code and output on the board', (tester) async {
    final page = FakePage((p, js) {
      if (js.startsWith('kx.run(')) {
        final j = job(js);
        scheduleMicrotask(() {
          p.post({'id': j['id'], 'event': 'out', 'text': 'Namaskara, ${(j['stdin'] as String).trim()}!\n'});
          p.post({'id': j['id'], 'event': 'done', 'status': 'ok', 'ms': 5});
        });
      }
    });
    final inserted = <List<BoardElement>>[];
    await tester.pumpWidget(_app(CodeLab(webRunner: WebRunner(page: page), onInsert: inserted.add)));
    expect(find.text('Runs on this device, offline'), findsOneWidget);
    await tester.tap(find.byKey(const Key('code-run')));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await tester.pump();
    expect(find.text('Namaskara, Asha!'), findsOneWidget);
    expect(find.text('Finished'), findsOneWidget);

    await tester.tap(find.byKey(const Key('code-put')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Code and output'));
    await tester.pumpAndSettle();
    final notes = inserted.single.whereType<NoteElement>().toList();
    expect(notes.map((n) => n.language), ['python', 'output']);
    expect(notes.first.text, contains('input("Your name: ")'));
    expect(notes.last.top, greaterThan(notes.first.rect.bottom));

    // C needs the server: without one, the lab says so.
    await tester.tap(find.text('C').first);
    await tester.pump();
    expect(find.text("Runs on the college's server in India"), findsOneWidget);
    await tester.tap(find.byKey(const Key('code-run')));
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await tester.pump();
    expect(find.textContaining('C, C++ and Java run on the KINETIX server'), findsOneWidget);

    await tester.tap(find.text('SQL'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('code-run')));
    await tester.runAsync(() => Future<void>.delayed(const Duration(seconds: 2)));
    await tester.pump();
    expect(find.textContaining('Ananya Rao'), findsOneWidget);
    expect(jsonEncode(page.evals.where((e) => e.startsWith('kx.run(')).length), '1');
  });
}

extension on NoteElement {
  double get top => rect.top;
}

const _defaults = <AlgoKind, (String, String)>{
  AlgoKind.bubble: ('5 1 4 2 8', ''),
  AlgoKind.insertion: ('5 1 4 2 8', ''),
  AlgoKind.selection: ('5 1 4 2 8', ''),
  AlgoKind.merge: ('5 1 4 2 8', ''),
  AlgoKind.quick: ('5 1 4 2 8', ''),
  AlgoKind.heap: ('5 1 4 2 8', ''),
  AlgoKind.linear: ('5 1 4 2 8', '2'),
  AlgoKind.binary: ('5 1 4 2 8', '9'),
  AlgoKind.stack: ('push 1; push 2; pop; pop; pop; peek', ''),
  AlgoKind.queue: ('enqueue 1; dequeue; dequeue', ''),
  AlgoKind.list: ('1 2 3', 'insertHead 0; insertTail 4; insertAt 9 2; delete 2; delete 7; search 4'),
  AlgoKind.hash: ('10 17 24 3 4 5 6 7', '7'),
  AlgoKind.bst: ('50 30 70 20 40 60 80', '30 50 99'),
  AlgoKind.bfs: ('A-B, A-C, B-D', 'A'),
  AlgoKind.dfs: ('A-B, A-C, B-D', 'B'),
  AlgoKind.dijkstra: ('A-B 4, A-C 1, C-B 2', 'A'),
};
