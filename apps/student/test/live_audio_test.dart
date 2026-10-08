import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_ink/kinetix_ink.dart' show AdpcmState, LiveAudioCodec;
import 'package:kinetix_student/core/live.dart';
import 'package:kinetix_student/core/live_audio_player.dart';

import 'fake_api.dart';
import 'fake_live.dart';
import 'helpers.dart';

/// Hearing the teacher's class audio in a live class.
void main() {
  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 8; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }

  const device = '11111111-2222-3333-4444-555555555555';

  List<List<dynamic>> snapshot() => [
    [0, 'L', [<dynamic>[]], 0],
    [0, 'k', 'plain'],
  ];

  /// 200 ms of a tone as the board sends it.
  final state = AdpcmState();
  String chunk() => LiveAudioCodec.encodeBase64(
    Int16List.fromList([for (var i = 0; i < LiveAudioCodec.chunkSamples; i++) i % 40 < 20 ? 2000 : -2000]),
    state,
  );

  Future<FakeLiveConnection> open(WidgetTester tester, {required bool allowed, required bool on, Size size = const Size(412, 892)}) async {
    final server = FakeLiveServer()
      ..ack = LiveWatchAck(ok: true, teacher: 'Anita Sharma', subject: 'Corporate Accounting', audioAllowed: allowed, audioOn: on);
    FakeLiveAudioPlayer.last = null;
    await pumpApp(tester, live: server, size: size, setup: (api) => api.liveClass = FakeStudentApi.corporateLive());
    await tester.ensureVisible(find.byKey(const Key('watchLive')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('watchLive')));
    await settle(tester);
    final conn = server.last;
    conn.send(LiveFrame(device, snapshot()));
    await settle(tester);
    return conn;
  }

  testWidgets('plays the class audio while the teacher\'s mic is on; mute stops it', (tester) async {
    final conn = await open(tester, allowed: true, on: true);
    final player = FakeLiveAudioPlayer.last!;
    expect(player.playing, isTrue);
    expect(find.text("Teacher's mic is on"), findsOneWidget);
    expect(find.byTooltip('Mute the class'), findsOneWidget);
    expect(find.byKey(const Key('liveNoSound')), findsNothing);

    conn.send(LiveAudioChunk(device, 0, chunk()));
    conn.send(LiveAudioChunk(device, 1, chunk()));
    conn.send(LiveAudioChunk('99999999-2222-3333-4444-555555555555', 0, chunk())); // another board
    await settle(tester);
    expect(player.fed, hasLength(2));
    expect(player.fed.first.length, LiveAudioCodec.chunkSamples);
    expect(player.fed.first.reduce((a, b) => a > b ? a : b), greaterThan(1000));

    await tester.tap(find.byKey(const Key('liveMute')));
    await settle(tester);
    expect(player.playing, isFalse);
    expect(find.byTooltip('Unmute the class'), findsOneWidget);
    conn.send(LiveAudioChunk(device, 2, chunk()));
    await settle(tester);
    expect(player.fed, hasLength(2));

    await tester.tap(find.byKey(const Key('liveMute')));
    await settle(tester);
    expect(player.playing, isTrue);
    conn.send(LiveAudioChunk(device, 3, chunk()));
    await settle(tester);
    expect(player.fed, hasLength(3));

    // The teacher turns the mic off.
    conn.send(const LiveAudioState(device, false));
    await settle(tester);
    expect(player.playing, isFalse);
    expect(find.text("Teacher's mic is off"), findsOneWidget);
    expect(find.byKey(const Key('liveMute')), findsNothing);

    // ...and on again.
    conn.send(const LiveAudioState(device, true));
    await settle(tester);
    expect(player.playing, isTrue);

    // Leaving stops playback.
    await tester.tap(find.byKey(const Key('leaveLive')));
    await settle(tester);
    expect(player.playing, isFalse);
  });

  testWidgets('stops when the class ends', (tester) async {
    final conn = await open(tester, allowed: true, on: true);
    final player = FakeLiveAudioPlayer.last!;
    expect(player.playing, isTrue);
    conn.send(const LiveEnded(device, 'class_ended'));
    await settle(tester);
    expect(player.playing, isFalse);
    conn.send(LiveAudioChunk(device, 5, chunk()));
    await settle(tester);
    expect(player.fed, isEmpty);
    expect(find.byKey(const Key('liveMute')), findsNothing);
  });

  testWidgets('no audio when this student may not listen', (tester) async {
    final conn = await open(tester, allowed: false, on: true);
    conn.send(LiveAudioChunk(device, 0, chunk()));
    await settle(tester);
    expect(FakeLiveAudioPlayer.last?.fed ?? const [], isEmpty);
    expect(FakeLiveAudioPlayer.last?.playing ?? false, isFalse);
    expect(find.text('Board only: no sound'), findsOneWidget);
    expect(find.byKey(const Key('liveMute')), findsNothing);
  });

  testWidgets('the mic turned on after joining starts playback', (tester) async {
    final conn = await open(tester, allowed: true, on: false);
    expect(find.text("Teacher's mic is off"), findsOneWidget);
    expect(FakeLiveAudioPlayer.last?.playing ?? false, isFalse);
    conn.send(const LiveAudioState(device, true));
    await settle(tester);
    expect(FakeLiveAudioPlayer.last!.playing, isTrue);
    expect(find.text("Teacher's mic is on"), findsOneWidget);
  });

  testWidgets('fits a small phone with large text', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    await open(tester, allowed: true, on: true, size: const Size(320, 568));
    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('liveMute')), findsOneWidget);
  });

  group('jitter buffer', () {
    Int16List piece([int n = LiveAudioCodec.chunkSamples]) => Int16List(n);

    test('holds back about 400 ms before playing, then tops the device up', () {
      final b = LiveJitterBuffer();
      b.add(piece());
      expect(b.take(0), isEmpty);
      b.add(piece());
      expect(b.take(0).length, 6400);
      b.add(piece());
      expect(b.take(6400), isEmpty); // the device has enough
      expect(b.take(3000).length, 3200);
    });

    test('drops the oldest audio when more than 1.5 s piles up, to stay live', () {
      final b = LiveJitterBuffer();
      for (var i = 0; i < 10; i++) {
        b.add(piece());
      }
      expect(b.queued, lessThanOrEqualTo(24000));
      expect(b.queued, greaterThanOrEqualTo(6400));
      expect(b.dropped, greaterThan(0));
    });

    test('builds up again after running dry', () {
      final b = LiveJitterBuffer();
      b.add(piece());
      b.add(piece());
      expect(b.take(0), isNotEmpty);
      b.underrun();
      b.add(piece());
      expect(b.take(0), isEmpty);
    });
  });
}
