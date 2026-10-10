import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/features/insert/document_import.dart';
import 'package:kinetix_board/features/insert/presentation_pane.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

/// Spec §28: intelligent split, draggable divider, Add Page, Add All Pages, Edge-to-Edge and
/// handing the deck to the presenter app for animations.
void main() {
  Stroke at(double x) => Stroke(id: 's$x', points: [InkPoint(x, 300), InkPoint(x + 40, 320)], style: const InkStyle(tool: InkTool.pen, color: Color(0xFF000000), width: 4));

  test('the slides go where the board is empty', () {
    expect(presentationGoesLeft([at(1500)]), isTrue, reason: 'writing on the right');
    expect(presentationGoesLeft([at(200)]), isFalse, reason: 'writing on the left');
    expect(presentationGoesLeft([]), isTrue, reason: 'empty: the default side');
    expect(presentationGoesLeft([at(200), at(1500)]), isTrue, reason: 'both: the default side');
  });

  testWidgets('pages, divider, edge to edge and present', (tester) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    // A 1×1 PNG.
    final png = Uint8List.fromList(const [
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1F, 0x15, 0xC4,
      0x89, 0, 0, 0, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0, 1, 0, 0, 5, 0, 1, 0x0D, 0x0A, 0x2D, 0xB4, 0, 0, 0, 0, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ]);
    final p = Presentation(name: 'deck.pptx', bytes: Uint8List(4), pages: [for (var i = 0; i < 3; i++) ImportedPage(png, const Size(1600, 900))], left: true);
    final wb = WhiteboardController();
    String? opened;
    openInPresenter = (name, _) async {
      opened = name;
      return true;
    };
    var closed = false;
    await tester.pumpWidget(MaterialApp(
      theme: KinetixTheme.light(),
      home: Scaffold(
        body: ListenableBuilder(
          listenable: p,
          builder: (context, _) => PresentationPane(
            p: p,
            wb: wb,
            onClose: () => closed = true,
            labels: PresentationLabels(previous: 'p', next: 'n', addPage: 'a', addAll: 'all', edgeToEdge: 'e', present: 'pr', close: 'c', noPresenter: 'none', added: (n) => '$n', addSelected: (n) => 'sel$n'),
          ),
        ),
      ),
    ));
    expect(find.byKey(const Key('ppt-thumb-2')), findsOneWidget);
    await tester.tap(find.byKey(const Key('ppt-next')));
    await tester.pump();
    expect(find.text('2/3'), findsOneWidget);
    await tester.tap(find.byKey(const Key('ppt-thumb-0')));
    await tester.pump();
    expect(p.index, 0);
    await tester.tap(find.byKey(const Key('ppt-add-1')));
    await tester.pump();
    expect(wb.pageCount, 2);
    await tester.tap(find.byKey(const Key('ppt-add-all')));
    await tester.pump();
    expect(wb.pageCount, 5);
    await tester.tap(find.byKey(const Key('ppt-chip-0')));
    await tester.tap(find.byKey(const Key('ppt-chip-2')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('ppt-add-selected')));
    await tester.pump();
    expect(wb.pageCount, 7);
    expect(p.selected, isEmpty);
    await tester.tap(find.byKey(const Key('ppt-present')));
    await tester.pump();
    expect(opened, 'deck.pptx');
    await tester.tap(find.byKey(const Key('ppt-close')));
    expect(closed, isTrue);
  });
}
