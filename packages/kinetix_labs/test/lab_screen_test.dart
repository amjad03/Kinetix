import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_labs/kinetix_labs.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

Widget _host(Widget child, {Size size = const Size(1280, 800), Locale? locale}) => MediaQuery(
      data: MediaQueryData(size: size),
      child: MaterialApp(
        theme: KinetixTheme.light(),
        locale: locale,
        supportedLocales: const [Locale('en'), Locale('hi'), Locale('kn')],
        localizationsDelegates: const [DefaultWidgetsLocalizations.delegate, DefaultMaterialLocalizations.delegate],
        home: Scaffold(body: SizedBox(width: size.width, height: size.height, child: child)),
      ),
    );

Future<void> _size(WidgetTester t, Size size) async {
  t.view.physicalSize = size;
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.reset);
}

void main() {
  for (final (name, size) in [('board', Size(1280, 800)), ('phone', Size(400, 800))]) {
    testWidgets("Ohm's law on a $name: key in, record readings, see the result and the graph", (t) async {
      await _size(t, size);
      await t.pumpWidget(_host(const LabScreen(labId: 'ohms-law'), size: size));
      await t.pump();
      expect(find.byKey(const ValueKey('lab-bench')), findsOneWidget);
      // No key in: no reading, and the bench says why.
      await t.tap(find.byKey(const ValueKey('lab-record')));
      await t.pump();
      expect(find.byKey(const ValueKey('lab-why')), findsOneWidget);
      final state = t.state<LabScreenState>(find.byType(LabScreen));
      state.params = {...state.params, 'on': true};
      for (var i = 0; i < 3; i++) {
        state.record();
        state.params = {...state.params, 'cells': i + 2};
      }
      await t.pump();
      expect(state.rows.length, 3);
      expect(find.byKey(const ValueKey('lab-table')), findsOneWidget);
      await t.drag(find.byKey(const ValueKey('lab-readings')), const Offset(0, -400));
      await t.pump();
      expect(find.byKey(const ValueKey('lab-result')), findsOneWidget);
      await t.pump(const Duration(seconds: 5));
    });
  }

  testWidgets('steps, guide and viva: walk through and reveal answers', (t) async {
    await _size(t, const Size(1280, 800));
    await t.pumpWidget(_host(const LabScreen(labId: 'glass-slab')));
    await t.pump();
    await t.tap(find.byKey(const ValueKey('lab-tab-steps')));
    await t.pump();
    await t.tap(find.byKey(const ValueKey('lab-step-next')));
    await t.pump();
    expect(find.text('Step 2 of ${LabLibrary.instance.byId('glass-slab')!.steps.length}'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('lab-tab-guide')));
    await t.pump();
    expect(find.byKey(const ValueKey('lab-guide')), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('lab-tab-viva')));
    await t.pump();
    await t.tap(find.byKey(const ValueKey('lab-show-answer-0')));
    await t.pump();
    expect(find.byKey(const ValueKey('lab-answer-0')), findsOneWidget);
  });

  testWidgets('in Kannada the lab speaks Kannada', (t) async {
    await _size(t, const Size(1280, 800));
    await t.pumpWidget(_host(const LabScreen(labId: 'ohms-law', lang: LabLang.kn)));
    await t.pump();
    expect(find.text(LabLibrary.instance.byId('ohms-law')!.title.of(LabLang.kn)), findsOneWidget);
    currentLabLang = LabLang.en;
  });

  testWidgets('a LabSpeech above the lab reads its steps and guide aloud', (t) async {
    await _size(t, const Size(1280, 800));
    final said = <String>[];
    await t.pumpWidget(_host(LabSpeech(speak: said.add, child: const LabScreen(labId: 'ohms-law'))));
    await t.pump();
    await t.tap(find.byKey(const ValueKey('lab-tab-guide')));
    await t.pump();
    await t.tap(find.byTooltip('Read aloud').first);
    expect(said.single, LabLibrary.instance.byId('ohms-law')!.aim.of(LabLang.en));
  });

  testWidgets('put on board: the report picture reaches the board', (t) async {
    await _size(t, const Size(1280, 800));
    Uint8List? got;
    String? title;
    await t.pumpWidget(_host(LabScreen(labId: 'glass-slab', onToBoard: (png, name) => (got, title) = (png, name))));
    await t.pump();
    await t.runAsync(() async {
      await t.tap(find.byKey(const ValueKey('lab-board')));
      for (var i = 0; i < 50 && got == null; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
    });
    await t.pump();
    expect(got, isNotNull);
    expect(got!.sublist(0, 4), [0x89, 0x50, 0x4E, 0x47]);
    expect(title, LabLibrary.instance.byId('glass-slab')!.title.of(LabLang.en));
    await t.pump(const Duration(seconds: 3));
  });

  testWidgets('an unknown lab says so instead of failing', (t) async {
    await _size(t, const Size(1280, 800));
    await t.pumpWidget(_host(const LabScreen(labId: 'no-such-lab')));
    expect(find.byType(KxEmptyState), findsOneWidget);
  });

  testWidgets('the browser filters by domain and words, and opens a lab', (t) async {
    await _size(t, const Size(400, 800));
    LabEntry? opened;
    await t.pumpWidget(_host(LabBrowser(onOpen: (context, e) => opened = e), size: const Size(400, 800)));
    await t.pump();
    expect(find.byKey(const ValueKey('lab-list')), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('lab-domain-chemistry')));
    await t.pump();
    expect(find.byKey(const ValueKey('lab-open-indicators')), findsOneWidget);
    expect(find.byKey(const ValueKey('lab-open-ohms-law')), findsNothing);
    await t.tap(find.byKey(const ValueKey('lab-domain-all')));
    await t.enterText(find.byKey(const ValueKey('lab-search')), 'glass slab');
    await t.pump();
    await t.tap(find.byKey(const ValueKey('lab-open-glass-slab')));
    expect(opened?.id, 'glass-slab');
  });

  testWidgets('the projector view draws the lab the teacher mirrors', (t) async {
    await _size(t, const Size(1280, 800));
    Map<String, dynamic>? sent;
    await t.pumpWidget(_host(LabScreen(labId: 'glass-slab', mirror: LabMirror(wanted: () => true, send: (s) => sent = s))));
    await t.pump();
    expect(sent?['lab'], 'glass-slab');
    await t.pumpWidget(_host(LabProjectorView(state: sent!)));
    expect(find.byKey(const ValueKey('projector-lab-bench')), findsOneWidget);
  });

  testWidgets('LabView opens bench labs and simulations by id', (t) async {
    await _size(t, const Size(1280, 800));
    await t.pumpWidget(_host(const LabView(id: 'resistors')));
    await t.pump();
    expect(find.byType(LabScreen), findsOneWidget);
    await t.pumpWidget(_host(const LabView(id: 'lab.break-even')));
    await t.pump();
    expect(find.byType(LabScreen), findsNothing);
    expect(find.byType(BreakEvenLab), findsOneWidget);
  });
}
