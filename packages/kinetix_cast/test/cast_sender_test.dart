import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_cast/kinetix_cast.dart';

class FakeLink implements CastLink {
  final controller = StreamController<CastEvent>.broadcast();
  CastRequestResult result = const CastRequestResult(ok: true, castId: 'c1', approved: false);
  final signals = <Map<String, dynamic>>[];
  final stops = <String>[];
  var closed = false;

  @override
  Stream<CastEvent> get events => controller.stream;
  @override
  Future<CastRequestResult> request(String deviceId) async => result;
  @override
  void signal(String castId, Map<String, dynamic> data) => signals.add(data);
  @override
  void stop(String castId) => stops.add(castId);
  @override
  void close() => closed = true;
}

class FakePeer implements CastPeer {
  bool allow = true;
  bool closed = false;
  final handled = <Map<String, dynamic>>[];
  void Function(bool)? onLive;
  void Function(Map<String, dynamic>)? onSignal;
  List<IceServer>? servers;

  @override
  Future<bool> capture() async => allow;
  @override
  Future<void> connect(List<IceServer> servers, {required void Function(Map<String, dynamic>) onSignal, required void Function(bool live) onLive}) async {
    this.servers = servers;
    this.onSignal = onSignal;
    this.onLive = onLive;
    onSignal({'type': 'offer', 'sdp': 'v=0'});
  }

  @override
  Future<void> handleSignal(Map<String, dynamic> data) async => handled.add(data);
  @override
  Future<void> close() async => closed = true;
}

const board = CastBoard(deviceId: 'd1', name: 'Room 1 Board', section: 'BCom A', subject: 'Accounting', teacher: 'Asha');

void main() {
  late FakeLink link;
  late FakePeer peer;
  late CastSender sender;

  setUp(() {
    link = FakeLink();
    peer = FakePeer();
    sender = CastSender(link: link, peerFactory: () => peer);
  });

  test('a student waits for approval, then connects and goes live', () async {
    await sender.start(board);
    expect(sender.phase, CastPhase.waiting);
    link.controller.add(const CastApprovedEvent('c1', [IceServer(urls: ['stun:x'])]));
    await pumpEventQueue();
    expect(sender.phase, CastPhase.connecting);
    expect(peer.servers!.single.urls, ['stun:x']);
    expect(link.signals.single['type'], 'offer');

    link.controller.add(const CastSignalEvent('c1', {'type': 'answer', 'sdp': 'a'}));
    await pumpEventQueue();
    expect(peer.handled.single['type'], 'answer');
    peer.onLive!(true);
    expect(sender.phase, CastPhase.live);

    await sender.stop();
    expect(link.stops, ['c1']);
    expect(peer.closed, isTrue);
    expect(sender.phase, CastPhase.idle);
    expect(sender.ended, CastEndReason.stopped);
  });

  test('the class teacher on their own board connects straight away', () async {
    link.result = const CastRequestResult(ok: true, castId: 'c1', approved: true, iceServers: []);
    await sender.start(board);
    expect(sender.phase, CastPhase.connecting);
    expect(link.signals, isNotEmpty);
  });

  test('a declined request ends with the reason', () async {
    await sender.start(board);
    link.controller.add(const CastEndedEvent('c1', CastEndReason.declined));
    await pumpEventQueue();
    expect(sender.phase, CastPhase.idle);
    expect(sender.ended, CastEndReason.declined);
    expect(peer.closed, isTrue);
  });

  test('events of another cast are ignored', () async {
    await sender.start(board);
    link.controller.add(const CastEndedEvent('other', CastEndReason.classEnded));
    await pumpEventQueue();
    expect(sender.phase, CastPhase.waiting);
  });

  test('refusing the system dialog or the server leaves nothing running', () async {
    peer.allow = false;
    await sender.start(board);
    expect(sender.declinedCapture, isTrue);
    expect(sender.phase, CastPhase.idle);

    peer = FakePeer();
    link.result = const CastRequestResult(ok: false, error: 'No class is being taught on this board right now');
    await sender.start(board);
    expect(sender.error, 'No class is being taught on this board right now');
    expect(peer.closed, isTrue);
  });

  test('the system stopping the capture ends the cast', () async {
    link.result = const CastRequestResult(ok: true, castId: 'c1', approved: true);
    await sender.start(board);
    peer.onLive!(false);
    await pumpEventQueue();
    expect(link.stops, ['c1']);
    expect(sender.phase, CastPhase.idle);
  });

  test('every English string has Hindi and Kannada', () {
    for (final lang in ['hi', 'kn']) {
      expect(castStringTable[lang]!.keys.toSet(), castStringTable['en']!.keys.toSet());
    }
  });

  testWidgets('the page lists boards and starts a cast', (tester) async {
    await tester.pumpWidget(MaterialApp(home: CastPage(sender: sender, loadBoards: () async => [board])));
    await tester.pump();
    expect(find.text('Room 1 Board'), findsOneWidget);
    await tester.tap(find.byKey(const Key('cast-start')));
    await tester.pump();
    await tester.pump();
    expect(find.byKey(const Key('cast-stop')), findsOneWidget);
    expect(find.text('Waiting for the teacher to approve on the board…'), findsOneWidget);
    await tester.tap(find.byKey(const Key('cast-stop')));
    await tester.runAsync(() => pumpEventQueue());
    await tester.pump();
    expect(find.text('Sharing stopped.'), findsOneWidget);
  });
}
