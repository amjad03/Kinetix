import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/cast/cast_controller.dart';
import 'package:kinetix_board/core/cast/cast_receiver.dart';
import 'package:kinetix_board/features/cast/cast_panel.dart';
import 'package:kinetix_board/features/fleet/device_lock.dart' show deviceLockStringTable;
import 'package:kinetix_ink/kinetix_ink.dart';

import 'support/board_fonts.dart';

// Screens cast to the board by teachers' and students' devices (docs/architecture/screen-share-and-devices.md).

class FakeReceiver implements CastReceiver {
  bool closed = false;
  List<Map<String, dynamic>>? servers;
  void Function(Map<String, dynamic>)? sendSignal;
  void Function(bool)? onLive;
  final handled = <Map<String, dynamic>>[];

  @override
  Future<void> start(List<Map<String, dynamic>> iceServers, {required void Function(Map<String, dynamic>) sendSignal, required void Function(bool live) onLive}) async {
    servers = iceServers;
    this.sendSignal = sendSignal;
    this.onLive = onLive;
  }

  @override
  Future<void> handleSignal(Map<String, dynamic> data) async {
    handled.add(data);
    if (data['type'] == 'offer') sendSignal?.call({'type': 'answer', 'sdp': 'answer'});
  }

  @override
  Widget view() => const ColoredBox(color: Colors.blueGrey, child: SizedBox.expand());

  @override
  Future<Uint8List?> snapshot() async => null;

  @override
  final ValueNotifier<Size?> frameSize = ValueNotifier(null);

  @override
  Future<void> close() async => closed = true;
}

class Harness {
  final emitted = <(String, Object)>[];
  final requested = <(String, Object)>[];
  Object? reply = {'ok': true};
  final receivers = <FakeReceiver>[];
  late final CastController cast = CastController(
    emit: (e, d) => emitted.add((e, d)),
    request: (e, d) async {
      requested.add((e, d));
      return reply;
    },
    receiverFactory: () {
      final r = FakeReceiver();
      receivers.add(r);
      return r;
    },
  );
}

Matcher rec(String event, Object data) => predicate<(String, Object)>((r) => r.$1 == event && jsonEncode(r.$2) == jsonEncode(data), 'is $event with $data');

void main() {
  test('a student asks, the teacher allows, the offer is answered and the screen goes live', () async {
    final h = Harness();
    var attention = 0;
    h.cast.onAttention = () => attention++;
    h.cast.onPending({'castId': 'c1', 'name': 'Asha', 'role': 'student'});
    expect(h.cast.pending.single.name, 'Asha');
    expect(h.cast.shown, isEmpty);
    expect(attention, 1);

    await h.cast.approve('c1');
    expect(h.requested.single, rec('cast.decide', {'castId': 'c1', 'approve': true}));
    expect(h.cast.tile('c1')!.state, CastTileState.connecting);

    await h.cast.onIce({'castId': 'c1', 'name': 'Asha', 'role': 'student', 'iceServers': [{'urls': ['stun:x']}]});
    expect(h.receivers.single.servers, [{'urls': ['stun:x']}]);
    await h.cast.onSignal({'castId': 'c1', 'data': {'type': 'offer', 'sdp': 'v=0'}});
    expect(h.emitted.last, rec('cast.signal', {'castId': 'c1', 'data': {'type': 'answer', 'sdp': 'answer'}}));

    h.receivers.single.onLive!(true);
    expect(h.cast.tile('c1')!.state, CastTileState.live);
    expect(h.cast.shown.single.id, 'c1');
  });

  test('the class teacher casting their own screen is shown without a request', () async {
    final h = Harness();
    await h.cast.onIce({'castId': 'c9', 'name': 'Meena', 'role': 'teacher', 'iceServers': []});
    expect(h.cast.tile('c9')!.teacher, isTrue);
    expect(h.cast.pending, isEmpty);
    expect(h.receivers, hasLength(1));
  });

  test('declining removes the request and tells the server', () async {
    final h = Harness();
    h.cast.onPending({'castId': 'c1', 'name': 'Asha', 'role': 'student'});
    await h.cast.decline('c1');
    expect(h.cast.tiles, isEmpty);
    expect(h.requested.single, rec('cast.decide', {'castId': 'c1', 'approve': false}));
  });

  test('a request the server no longer knows is dropped on approval', () async {
    final h = Harness()..reply = {'ok': false};
    h.cast.onPending({'castId': 'c1', 'name': 'Asha', 'role': 'student'});
    await h.cast.approve('c1');
    expect(h.cast.tiles, isEmpty);
  });

  test('up to four side by side, one can fill the panel, and the teacher stops any', () async {
    final h = Harness();
    for (var i = 1; i <= 4; i++) {
      await h.cast.onIce({'castId': 'c$i', 'name': 'P$i', 'role': 'student', 'iceServers': []});
    }
    expect(h.cast.shown, hasLength(4));
    h.cast.focus('c2');
    expect(h.cast.shown.single.id, 'c2');
    h.cast.focus('c2');
    expect(h.cast.shown, hasLength(4));

    await h.cast.stop('c3');
    expect(h.emitted.last, rec('cast.stop', {'castId': 'c3'}));
    expect(h.receivers[2].closed, isTrue);
    expect(h.cast.shown.map((t) => t.id), ['c1', 'c2', 'c4']);
  });

  test('the sender leaving, a failed connection and the end of class remove screens', () async {
    final h = Harness();
    await h.cast.onIce({'castId': 'c1', 'name': 'A', 'role': 'student', 'iceServers': []});
    await h.cast.onIce({'castId': 'c2', 'name': 'B', 'role': 'student', 'iceServers': []});
    h.cast.onEnded({'castId': 'c1', 'reason': 'sender_left'});
    await pumpEventQueue();
    expect(h.cast.tile('c1'), isNull);
    expect(h.receivers[0].closed, isTrue);

    h.receivers[1].onLive!(false);
    await pumpEventQueue();
    expect(h.cast.tiles, isEmpty);

    await h.cast.onIce({'castId': 'c3', 'name': 'C', 'role': 'teacher', 'iceServers': []});
    await h.cast.classEnded();
    expect(h.cast.tiles, isEmpty);
  });

  test('marks drawn over a screen stay with it', () async {
    final h = Harness();
    await h.cast.onIce({'castId': 'c1', 'name': 'A', 'role': 'student', 'iceServers': []});
    h.cast.toggleAnnotate('c1');
    h.cast.addStroke('c1', Colors.red, const Offset(1, 1));
    h.cast.extendStroke('c1', const Offset(5, 5));
    expect(h.cast.tile('c1')!.strokes.single.$2, hasLength(2));
    h.cast.clearMarks('c1');
    expect(h.cast.tile('c1')!.strokes, isEmpty);
  });

  test('Hindi and Kannada have every English string', () {
    for (final t in [castStringTable, deviceLockStringTable]) {
      for (final lang in ['hi', 'kn']) {
        expect(t[lang]!.keys.toSet(), t['en']!.keys.toSet());
      }
    }
  });

  testWidgets('the panel asks the teacher to allow, then shows the screen with its controls', (tester) async {
    await loadBoardFonts();
    final h = Harness();
    final wb = WhiteboardController();
    addTearDown(wb.dispose);
    await tester.binding.setSurfaceSize(const Size(1000, 700));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: CastPanel(cast: h.cast, wb: wb))));
    expect(find.byKey(const Key('cast-empty')), findsOneWidget);

    h.cast.onPending({'castId': 'c1', 'name': 'Asha', 'role': 'student'});
    await tester.pump();
    expect(find.text('Asha wants to show their screen'), findsOneWidget);
    await tester.tap(find.byKey(const Key('cast-allow-c1')));
    await tester.pump();
    await h.cast.onIce({'castId': 'c1', 'name': 'Asha', 'role': 'student', 'iceServers': []});
    h.receivers.single.onLive!(true);
    await tester.pump();
    expect(find.byKey(const Key('cast-request-c1')), findsNothing);
    expect(find.text('Asha'), findsOneWidget);
    expect(find.byKey(const Key('cast-stop-c1')), findsOneWidget);

    // The phone turns: the same connection, the picture follows (spec 60).
    h.receivers.single.frameSize.value = const Size(720, 1600);
    await tester.pump();
    expect(find.byKey(const Key('cast-orientation-c1-portrait')), findsOneWidget);
    h.receivers.single.frameSize.value = const Size(1600, 720);
    await tester.pump();
    expect(find.byKey(const Key('cast-orientation-c1-landscape')), findsOneWidget);
    expect(h.receivers, hasLength(1), reason: 'no reconnect');

    await tester.tap(find.byKey(const Key('cast-annotate-c1')));
    await tester.pump();
    expect(h.cast.tile('c1')!.annotate, isTrue);
    await tester.tap(find.byKey(const Key('cast-stop-c1')));
    await tester.pump();
    expect(h.cast.tiles, isEmpty);
    expect(find.byKey(const Key('cast-empty')), findsOneWidget);
  });
}
