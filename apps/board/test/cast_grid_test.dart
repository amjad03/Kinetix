import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/cast/cast_controller.dart';
import 'package:kinetix_board/features/cast/cast_panel.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'cast_test.dart' show Harness, rec;
import 'support/board_fonts.dart';

// Up to nine screens in a grid of 1, 2, 4, 6 or 9; a presenter; pausing; guests joining by code (Zynetix W5).

Future<void> live(Harness h, int n, {String role = 'student'}) async {
  for (var i = 1; i <= n; i++) {
    await h.cast.onIce({'castId': 'c$i', 'name': 'P$i', 'role': role, 'iceServers': []});
  }
}

void main() {
  test('the grid for each layout, and the automatic one picks the smallest that fits', () {
    expect([for (final n in [1, 2, 3, 4, 5, 6, 7, 9]) castGrid(CastLayout.auto, n).capacity], [1, 2, 4, 4, 6, 6, 9, 9]);
    expect(castGrid(CastLayout.two, 2), (cols: 2, rows: 1, capacity: 2));
    expect(castGrid(CastLayout.two, 2, wide: false), (cols: 1, rows: 2, capacity: 2));
    expect(castGrid(CastLayout.six, 3), (cols: 3, rows: 2, capacity: 6));
    expect(castGrid(CastLayout.nine, 1), (cols: 3, rows: 3, capacity: 9));
    expect(maxCasts, 9);
  });

  test('nine screens at once; a smaller layout shows the first ones and counts the rest', () async {
    final h = Harness();
    await live(h, 9);
    expect(h.cast.shown, hasLength(9));
    expect(h.cast.hidden, 0);
    h.cast.setLayout(CastLayout.four);
    expect(h.cast.shown.map((t) => t.id), ['c1', 'c2', 'c3', 'c4']);
    expect(h.cast.hidden, 5);
    h.cast.focus('c7');
    expect(h.cast.shown.single.id, 'c7');
    expect(h.cast.hidden, 0);
    // Choosing a layout leaves the single screen.
    h.cast.setLayout(CastLayout.one);
    expect(h.cast.focusedId, isNull);
    expect(h.cast.shown.single.id, 'c1');
  });

  test('the presenter comes first and the sender is told; stopping it clears the presenter', () async {
    final h = Harness();
    await live(h, 3);
    h.cast.setLayout(CastLayout.one);
    h.cast.promote('c3');
    expect(h.cast.presenterId, 'c3');
    expect(h.cast.shown.single.id, 'c3');
    expect(jsonEncode(h.emitted.last.$2), jsonEncode({'castId': 'c3', 'action': 'promote'}));
    expect(h.emitted.last.$1, 'cast.control');
    h.cast.promote('c3');
    expect(h.cast.presenterId, isNull);
    h.cast.promote('c2');
    await h.cast.stop('c2');
    expect(h.cast.presenterId, isNull);
  });

  test('pausing keeps the connection and tells the sender; showing again too', () async {
    final h = Harness();
    await live(h, 1);
    h.cast.toggleMute('c1');
    expect(h.cast.tile('c1')!.muted, isTrue);
    expect(h.receivers.single.closed, isFalse);
    expect(h.emitted.last, rec('cast.control', {'castId': 'c1', 'action': 'mute'}));
    h.cast.toggleMute('c1');
    expect(h.emitted.last, rec('cast.control', {'castId': 'c1', 'action': 'unmute'}));
  });

  test('a guest from the browser asks like anyone else', () {
    final h = Harness();
    h.cast.onPending({'castId': 'g1', 'name': 'Visitor', 'role': 'guest'});
    final t = h.cast.tile('g1')!;
    expect(t.guest, isTrue);
    expect(t.teacher, isFalse);
  });

  testWidgets('layout chips, the presenter spotlight, a paused screen and the join code with its QR', (tester) async {
    await loadBoardFonts();
    final h = Harness();
    final fetched = <bool>[];
    h.cast.fetchJoinCode = ({bool fresh = false}) async {
      fetched.add(fresh);
      return CastJoinInfo(fresh ? 'NEW234' : 'ABC234', 'http://192.168.1.20:3000/cast?code=${fresh ? 'NEW234' : 'ABC234'}');
    };
    final wb = WhiteboardController();
    addTearDown(wb.dispose);
    await tester.binding.setSurfaceSize(const Size(1200, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CastPanel(cast: h.cast, wb: wb))));
    await tester.pumpAndSettle();
    // Nothing shared yet: the code and its QR for any phone or laptop.
    expect(find.byKey(const Key('cast-join')), findsOneWidget);
    expect(find.text('ABC234'), findsOneWidget);
    expect(tester.widget<QrImageView>(find.byType(QrImageView)), isNotNull);
    expect(find.textContaining('http://192.168.1.20:3000/cast '), findsOneWidget);
    await tester.tap(find.byKey(const Key('cast-join-new')));
    await tester.pumpAndSettle();
    expect(find.text('NEW234'), findsOneWidget);
    expect(fetched, [false, true]);

    await live(h, 6);
    await tester.pump();
    expect(find.byKey(const Key('cast-grid-3-2')), findsOneWidget);
    await tester.tap(find.byKey(const Key('cast-layout-four')));
    await tester.pump();
    expect(find.byKey(const Key('cast-grid-2-2')), findsOneWidget);
    expect(find.text('+2 more'), findsOneWidget);

    await tester.tap(find.byKey(const Key('cast-layout-auto')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('cast-present-c4')));
    await tester.pump();
    expect(find.byKey(const Key('cast-spotlight')), findsOneWidget);
    expect(find.textContaining('P4 · Presenter'), findsOneWidget);

    await tester.tap(find.byKey(const Key('cast-mute-c4')));
    await tester.pump();
    expect(find.byKey(const Key('cast-paused-c4')), findsOneWidget);
  });

  testWidgets('without a class or offline the panel says when the code appears', (tester) async {
    final h = Harness();
    h.cast.fetchJoinCode = ({bool fresh = false}) async => null;
    final wb = WhiteboardController();
    addTearDown(wb.dispose);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CastPanel(cast: h.cast, wb: wb))));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('cast-join-unavailable')), findsOneWidget);
  });
}
