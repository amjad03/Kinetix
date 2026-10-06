import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/class_audio/mic_capture.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/core/recording/voice_recorder.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Server events in, board events (with and without acks) out.
class FakeRealtime extends Realtime {
  FakeRealtime() : super('http://test');
  final handlers = <String, void Function(Map<String, dynamic>)>{};
  final sent = <(String, Object)>[];
  Object? ack = {'ok': true};

  @override
  void on(String event, void Function(Map<String, dynamic>) handler) => handlers[event] = handler;
  @override
  void connect(String token) {}
  @override
  void emit(String event, Object data) => sent.add((event, data));
  @override
  Future<Object?> request(String event, Object data, {Duration timeout = const Duration(seconds: 5)}) async {
    sent.add((event, data));
    return ack;
  }

  @override
  void dispose() {}

  void server(String event, [Map<String, dynamic> data = const {}]) => handlers[event]?.call(data);
  List<bool> get states => [for (final (e, d) in sent) if (e == RealtimeEvents.liveAudioState) (d as Map)['on'] as bool];
  List<Map> get chunks => [for (final (e, d) in sent) if (e == RealtimeEvents.liveAudio) d as Map];
}

/// A microphone the test feeds with PCM bytes.
class FakeMic implements MicCapture {
  VoiceUnavailable? failCheck;
  VoiceUnavailable? failStart;
  StreamController<Uint8List>? controller;
  int starts = 0, stops = 0;
  bool get capturing => controller != null;

  @override
  Future<void> check() async {
    if (failCheck != null) throw failCheck!;
  }

  @override
  Future<Stream<Uint8List>> start() async {
    if (failStart != null) throw failStart!;
    starts++;
    controller = StreamController<Uint8List>();
    return controller!.stream;
  }

  @override
  Future<void> stop() async {
    if (controller == null) return;
    stops++;
    final c = controller!;
    controller = null;
    unawaited(c.close());
  }

  @override
  Future<void> dispose() async {}

  /// [ms] of a quiet tone as PCM16LE bytes.
  void speak(int ms) {
    final n = 16 * ms;
    final b = ByteData(n * 2);
    for (var i = 0; i < n; i++) {
      b.setInt16(i * 2, (i % 32 < 16 ? 1000 : -1000), Endian.little);
    }
    controller!.add(b.buffer.asUint8List());
  }
}

void main() {
  late FakeRealtime rt;
  late FakeMic mic;
  late BoardController board;

  Future<void> pump(WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final client = MockClient((req) async {
      if (req.url.path == '/v1/sessions/current/live') return http.Response(req.body, 200);
      if (req.url.path == '/v1/devices/enroll') return http.Response(jsonEncode({'deviceToken': 'dev', 'device': {'name': 'Room 204 Board'}}), 201);
      return http.Response('[]', 200);
    });
    rt = FakeRealtime();
    mic = FakeMic();
    board = BoardController(
      apiFactory: (url) => ApiClient(baseUrl: url, client: client),
      realtimeFactory: (_) => rt,
      outboxStore: MemoryOutboxStore(),
      micFactory: () => mic,
    );
    await board.enroll('http://test', 'KX-AAAA-BBBB');
    board.onPaired(
      'session-token',
      SessionContext(
        sessionId: 's1',
        expiresAt: DateTime.now().add(const Duration(hours: 1)),
        teacherId: 't1',
        teacherName: 'Anita Sharma',
        language: 'en',
        sectionName: 'BCom Sem 3 A',
        subjectName: 'Corporate Accounting',
      ),
    );
    await tester.pumpWidget(MaterialApp(theme: KinetixTheme.light(), home: BoardScreen(board: board)));
    await tester.pumpAndSettle();
  }

  Future<void> settle(WidgetTester tester) async {
    // Capture starts and stops are chained futures (and a stream): a few frames flush them.
    for (var i = 0; i < 6; i++) {
      await tester.pump();
    }
  }

  void viewers(int listeners) =>
      rt.server(RealtimeEvents.liveViewers, {'count': listeners, 'leaders': 0, 'students': listeners, 'indicator': true, 'listeners': listeners});

  testWidgets('off by default; the toggle tells the server; no capture while nobody may listen', (tester) async {
    await pump(tester);
    expect(board.classAudio.enabled, isFalse);
    expect(tester.widget<IconButton>(find.byKey(const Key('class-audio'))).isSelected, isFalse);

    viewers(0);
    await tester.tap(find.byKey(const Key('class-audio')));
    await settle(tester);
    expect(rt.states, [true]);
    expect(tester.widget<IconButton>(find.byKey(const Key('class-audio'))).isSelected, isTrue);
    expect(mic.capturing, isFalse);
    expect(find.byKey(const Key('mic-on')), findsNothing);
    expect(rt.chunks, isEmpty);

    await tester.tap(find.byKey(const Key('class-audio')));
    await settle(tester);
    expect(rt.states, [true, false]);
    expect(tester.widget<IconButton>(find.byKey(const Key('class-audio'))).isSelected, isFalse);
    board.dispose();
  });

  testWidgets('sends 200 ms ADPCM chunks while students listen, shows "Mic on", and stops when they leave or audio is turned off', (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const Key('class-audio')));
    await settle(tester);

    viewers(2);
    await settle(tester);
    expect(mic.capturing, isTrue);
    expect(find.byKey(const Key('mic-on')), findsOneWidget);

    mic.speak(500); // two whole chunks and a bit
    await settle(tester);
    expect(rt.chunks, hasLength(2));
    expect([for (final c in rt.chunks) c['seq']], [0, 1]);
    expect(rt.chunks.first['rate'], 16000);
    expect(rt.chunks.first['codec'], 'ima-adpcm');
    final pcm = LiveAudioCodec.decodeBase64(rt.chunks.first['data'] as String);
    expect(pcm.length, LiveAudioCodec.chunkSamples);
    expect(pcm.reduce((a, b) => a > b ? a : b), greaterThan(500));

    // Everyone left: the microphone stops and nothing more is sent.
    viewers(0);
    await settle(tester);
    expect(mic.capturing, isFalse);
    expect(find.byKey(const Key('mic-on')), findsNothing);

    viewers(1);
    await settle(tester);
    expect(mic.starts, 2);
    mic.speak(200);
    await settle(tester);
    expect(rt.chunks.last['seq'], 2); // same "audio on": seq keeps counting

    await tester.tap(find.byKey(const Key('class-audio')));
    await settle(tester);
    expect(mic.capturing, isFalse);
    expect(rt.states.last, isFalse);
    expect(find.byKey(const Key('mic-on')), findsNothing);

    // Turned on again: seq restarts from 0.
    await tester.tap(find.byKey(const Key('class-audio')));
    await settle(tester);
    mic.speak(200);
    await settle(tester);
    expect(rt.chunks.last['seq'], 0);
    board.dispose();
  });

  testWidgets('no microphone: a message, and audio stays off', (tester) async {
    await pump(tester);
    mic.failCheck = const VoiceUnavailable('no microphone found');
    await tester.tap(find.byKey(const Key('class-audio')));
    await settle(tester);
    expect(find.text("Class audio isn't available: no microphone found"), findsOneWidget);
    expect(board.classAudio.enabled, isFalse);
    expect(rt.states, isEmpty);
    board.dispose();
  });

  testWidgets('the microphone busy (e.g. with the lesson recording): a message, and audio goes off again', (tester) async {
    await pump(tester);
    mic.failStart = const VoiceUnavailable('the microphone could not be started');
    await tester.tap(find.byKey(const Key('class-audio')));
    await settle(tester);
    viewers(1);
    await settle(tester);
    expect(find.text("Class audio isn't available: the microphone could not be started"), findsOneWidget);
    expect(board.classAudio.enabled, isFalse);
    expect(rt.states, [true, false]);
    expect(find.byKey(const Key('mic-on')), findsNothing);
    board.dispose();
  });

  testWidgets('re-sent after a reconnect, and off when the class ends', (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const Key('class-audio')));
    await settle(tester);
    viewers(1);
    await settle(tester);
    rt.onReady!();
    expect(rt.states, [true, true]);

    rt.server(RealtimeEvents.sessionEnded, {'sessionId': 's1'});
    await settle(tester);
    expect(board.classAudio.enabled, isFalse);
    expect(mic.capturing, isFalse);
    expect(rt.states.last, isFalse);
    expect(find.byKey(const Key('mic-on')), findsNothing);
    expect(find.byKey(const Key('class-audio')), findsNothing); // guest mode: no toggle
    await tester.pump(const Duration(seconds: 5));
    board.dispose();
  });
}
