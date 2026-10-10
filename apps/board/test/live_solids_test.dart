import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_board/features/board/live_solids.dart';
import 'package:kinetix_board/l10n/gen/app_localizations.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

Future<(WhiteboardController, ValueNotifier<String?>)> _pump(WidgetTester tester, {String locale = 'en'}) async {
  final wb = WhiteboardController();
  addTearDown(wb.dispose);
  final armed = ValueNotifier<String?>(null);
  addTearDown(armed.dispose);
  wb.insert([
    ImageElement(
      id: 'cube1',
      rect: const Rect.fromLTWH(200, 200, 400, 320),
      bytes: Uint8List(0),
      link: EmbedLink(kind: EmbedLink.model3d, id: SolidKind.cube.id, preset: const SolidView().encode()),
    ),
  ]);
  tester.view.physicalSize = const Size(1200, 900);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      locale: Locale(locale),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(
        body: ListenableBuilder(
          listenable: wb,
          builder: (context, _) => Stack(children: [Positioned.fill(child: LiveSolidsLayer(wb: wb, view: const ViewState(), armed: armed))]),
        ),
      ),
    ),
  );
  await tester.pump();
  return (wb, armed);
}

Offset _mid(WidgetTester tester) => tester.getCenter(find.byKey(const Key('live-solid-view')));

/// Lets the picture render (real async work) until [done].
Future<void> _until(WidgetTester tester, bool Function() done) async {
  await tester.runAsync(() async {
    for (var i = 0; i < 100 && !done(); i++) {
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
  });
  await tester.pump();
}

ImageElement _cube(WhiteboardController wb) => wb.byId('cube1')! as ImageElement;

void main() {
  testWidgets('a solid on the board is live 3D: one finger turns it and the turn is kept', (tester) async {
    final (wb, _) = await _pump(tester);
    expect(find.byKey(const Key('live-solid-view')), findsOneWidget);
    wb.tool = BoardTool.select;
    await tester.pump();
    final before = SolidView.decode(_cube(wb).link!.preset)!;
    await tester.dragFrom(_mid(tester), const Offset(80, 30));
    await _until(tester, () => _cube(wb).bytes.isNotEmpty);
    final after = SolidView.decode(_cube(wb).link!.preset)!;
    expect(after.yaw, greaterThan(before.yaw + 20));
    expect(after.pitch, isNot(before.pitch));
    expect(_cube(wb).bytes, isNotEmpty, reason: 'a fresh picture is kept for other viewers');
  });

  testWidgets('tap selects the solid, a second tap on a face opens the colour picker and the face colour is kept', (tester) async {
    final (wb, _) = await _pump(tester);
    wb.tool = BoardTool.select;
    await tester.pump();
    await tester.tapAt(_mid(tester));
    await tester.pump();
    expect(wb.selection, {'cube1'});
    expect(find.byKey(const Key('live-solid-move')), findsOneWidget);
    await tester.tapAt(_mid(tester));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('face-colour-picker')), findsOneWidget);
    await tester.tap(find.byKey(const Key('face-palette-3')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('face-colour-apply')));
    await _until(tester, () => SolidView.decode(_cube(wb).link!.preset)!.faces.isNotEmpty);
    await tester.pumpAndSettle();
    final look = SolidView.decode(_cube(wb).link!.preset)!;
    expect(look.faces, isNotEmpty);
    expect(look.faces.values.toSet(), {0xFF43A047});
    expect(recentFaceColours.value.first, const Color(0xFF43A047));
    // The look survives saving the preset text and reading it back.
    expect(SolidView.decode(look.encode())!.faces, look.faces);
  });

  testWidgets('the move dot moves the solid on the board', (tester) async {
    final (wb, _) = await _pump(tester);
    wb.tool = BoardTool.select;
    wb.select({'cube1'});
    await tester.pump();
    final from = _cube(wb).rect.center;
    await tester.dragFrom(tester.getCenter(find.byKey(const Key('live-solid-move'))), const Offset(100, 60));
    await _until(tester, () => _cube(wb).rect.center != from);
    expect(_cube(wb).rect.center.dx, greaterThan(from.dx + 70)); // the first few pixels are touch slop
    expect(_cube(wb).rect.center.dy, greaterThan(from.dy + 30));
  });

  testWidgets('the picker is in Hindi and Kannada', (tester) async {
    for (final (code, word) in [('hi', 'सतह का रंग'), ('kn', 'ಮುಖದ ಬಣ್ಣ')]) {
      final (wb, _) = await _pump(tester, locale: code);
      wb.tool = BoardTool.select;
      wb.select({'cube1'});
      await tester.pump();
      await tester.tapAt(_mid(tester));
      await tester.pumpAndSettle();
      expect(find.text(word), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    }
  });
}
