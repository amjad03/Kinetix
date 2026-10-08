import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/device_store.dart';
import 'package:kinetix_board/core/fleet/fleet_agent.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/core/secret_store.dart';
import 'package:kinetix_board/features/fleet/device_lock.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/board_fonts.dart';

// The IT device console, seen from the board: its health report and the remote actions it carries out.

class FakeProbe implements DeviceProbe {
  DeviceSnapshot snapshot = const DeviceSnapshot(os: 'android', osVersion: 'Android 13', storageFreeMb: 4096, storageTotalMb: 32768, batteryPercent: 80, charging: true);
  @override
  Future<DeviceSnapshot> read() async => snapshot;
}

/// A realtime link the test drives: events are fired by hand, requests are recorded and answered.
class FakeRealtime extends Realtime {
  FakeRealtime() : super('http://test');
  final handlers = <String, void Function(Map<String, dynamic>)>{};
  final requests = <(String, Object)>[];
  Object? pullReply = <Object>[];

  @override
  void on(String event, void Function(Map<String, dynamic>) handler) => handlers[event] = handler;
  @override
  void connect(String token) => Future.microtask(() => onReady?.call());
  @override
  Future<Object?> request(String event, Object data, {Duration timeout = const Duration(seconds: 5)}) async {
    requests.add((event, data));
    return event == RealtimeEvents.deviceActionsPull ? pullReply : {'ok': true};
  }

  @override
  void emit(String event, Object data) {}
  @override
  void dispose() {}

  void fire(String event, Map<String, dynamic> data) => handlers[event]!(data);
}

Future<(BoardController, FakeRealtime, List<http.Request>)> enrolledBoard({Map<String, dynamic>? config, Object? pull}) async {
  SharedPreferences.setMockInitialValues({'server_url': 'http://test', 'device_name': 'Room 1 Board'});
  final calls = <http.Request>[];
  final rt = FakeRealtime();
  if (pull != null) rt.pullReply = pull;
  final client = MockClient((req) async {
    calls.add(req);
    if (req.url.path == '/v1/devices/me/config') {
      return http.Response(jsonEncode(config ?? {'kiosk': {'enabled': true}, 'locked': false}), 200, headers: {'content-type': 'application/json'});
    }
    return http.Response('', 204);
  });
  final board = BoardController(
    store: DeviceStore(secrets: MemorySecretStore({'device_token': 'dev'})),
    apiFactory: (url) => ApiClient(baseUrl: url, client: client),
    realtimeFactory: (_) => rt,
    outboxStore: MemoryOutboxStore(),
    deviceProbe: FakeProbe(),
  );
  await board.start();
  await pumpEventQueue();
  return (board, rt, calls);
}

Map<String, dynamic> action(String id, String type, [Map<String, dynamic> params = const {}]) => {'id': id, 'type': type, 'params': params};

Matcher rec(String event, Object data) => predicate<(String, Object)>((r) => r.$1 == event && jsonEncode(r.$2) == jsonEncode(data), 'is $event with $data');

void main() {
  test('the health report names the app, OS, kiosk state, storage, battery and class', () async {
    final probe = FakeProbe();
    final agent = FleetAgent(send: (_) async {}, probe: probe, app: () => const AppHealth(kiosk: 'on', currentClass: 'Physics · BCom A', locked: false));
    final body = await agent.body();
    expect(body, {
      'os': 'android',
      'osVersion': 'Android 13',
      'appVersion': '0.1.0',
      'kiosk': 'on',
      'storageFreeMb': 4096,
      'storageTotalMb': 32768,
      'battery': {'percent': 80, 'charging': true},
      'currentClass': 'Physics · BCom A',
      'locked': false,
    });
    // A panel with no battery and no storage plugin reports only what it knows.
    probe.snapshot = const DeviceSnapshot(os: 'windows');
    final bare = await FleetAgent(send: (_) async {}, probe: probe, app: () => const AppHealth(kiosk: 'off')).body();
    expect(bare.keys, unorderedEquals(['os', 'appVersion', 'kiosk', 'locked']));
  });

  test('a failed report is retried on the next tick, not thrown', () async {
    var sent = 0;
    final agent = FleetAgent(send: (_) async => sent++ == 0 ? throw Exception('offline') : null, probe: FakeProbe(), app: () => const AppHealth(kiosk: 'unknown'));
    await agent.reportNow();
    await agent.reportNow();
    expect(sent, 2);
  });

  test('a board that connects reports its health to the API with its device token', () async {
    final (board, _, calls) = await enrolledBoard();
    await board.fleet.reportNow();
    final post = calls.lastWhere((r) => r.url.path == '/v1/devices/me/health');
    expect(post.headers['authorization'], 'Bearer dev');
    expect(jsonDecode(post.body), containsPair('appVersion', '0.1.0'));
    board.dispose();
  });

  test('lock and unlock: the board covers itself, remembers it, and acknowledges', () async {
    final (board, rt, _) = await enrolledBoard();
    rt.fire(RealtimeEvents.deviceAction, action('a1', 'lock'));
    await pumpEventQueue();
    expect(board.deviceLocked, isTrue);
    expect(rt.requests.last, rec(RealtimeEvents.deviceActionAck, {'id': 'a1', 'ok': true}));
    expect(await DeviceStore().setting('deviceLocked'), 'true');

    rt.fire(RealtimeEvents.deviceAction, action('a2', 'unlock'));
    await pumpEventQueue();
    expect(board.deviceLocked, isFalse);
    board.dispose();
  });

  test('the config says locked: a board that missed the action locks itself', () async {
    final (board, _, _) = await enrolledBoard(config: {'kiosk': {'enabled': true}, 'locked': true});
    await pumpEventQueue();
    expect(board.deviceLocked, isTrue);
    board.dispose();
  });

  test('actions sent while the board was offline are pulled and run when it connects', () async {
    final (board, rt, _) = await enrolledBoard(pull: [action('p1', 'message', {'text': 'Assembly at 11', 'seconds': 20})]);
    await pumpEventQueue();
    expect(rt.requests.any((r) => r.$1 == RealtimeEvents.deviceActionsPull), isTrue);
    expect(board.broadcasts.single.body, 'Assembly at 11');
    expect(board.broadcasts.single.senderName, 'IT');
    expect(rt.requests.last, rec(RealtimeEvents.deviceActionAck, {'id': 'p1', 'ok': true}));
    board.dispose();
  });

  test('restart is acknowledged first, then the app restarts', () async {
    final (board, rt, _) = await enrolledBoard();
    var restarted = false;
    board.restartApp = () async {
      expect(rt.requests.last.$1, RealtimeEvents.deviceActionAck);
      restarted = true;
    };
    rt.fire(RealtimeEvents.deviceAction, action('r1', 'restart_app'));
    await pumpEventQueue();
    expect(restarted, isTrue);
    board.dispose();
  });

  test('rename updates the name the board shows and keeps', () async {
    final (board, rt, _) = await enrolledBoard();
    rt.fire(RealtimeEvents.deviceAction, action('n1', 'rename_move', {'name': 'Lab Board'}));
    await pumpEventQueue();
    expect(board.deviceName, 'Lab Board');
    expect((await DeviceStore(secrets: MemorySecretStore({'device_token': 'dev'})).load()).name, 'Lab Board');
    board.dispose();
  });

  test('unpair: the board forgets its token and asks to be enrolled again', () async {
    final (board, rt, _) = await enrolledBoard();
    expect(board.stage, BoardStage.board);
    rt.fire(RealtimeEvents.deviceAction, action('u1', 'unpair'));
    await pumpEventQueue();
    expect(board.stage, BoardStage.needsEnrollment);
    expect(board.isEnrolled, isFalse);
    expect((await DeviceStore().load()).server, isNull);
    board.dispose();
  });

  test('an action it does not know is refused in the acknowledgement', () async {
    final (board, rt, _) = await enrolledBoard();
    rt.fire(RealtimeEvents.deviceAction, action('x1', 'self_destruct'));
    await pumpEventQueue();
    expect(rt.requests.last, rec(RealtimeEvents.deviceActionAck, {'id': 'x1', 'ok': false, 'error': 'Unknown action'}));
    board.dispose();
  });

  testWidgets('the lock screen covers the board and the IT PIN opens it', (tester) async {
    await loadBoardFonts();
    final (board, _, _) = (await tester.runAsync(() => enrolledBoard()))!;
    await tester.runAsync(() => board.setDeviceLocked(true));
    await tester.pumpWidget(MaterialApp(home: ListenableBuilder(listenable: board, builder: (_, _) => DeviceLockGate(board: board, child: const Scaffold(body: Text('the board'))))));
    expect(find.byKey(const Key('device-lock')), findsOneWidget);
    expect(find.text('This board is locked'), findsOneWidget);
    await tester.runAsync(() => board.setDeviceLocked(false));
    await tester.pump();
    expect(find.byKey(const Key('device-lock')), findsNothing);
    expect(find.text('the board'), findsOneWidget);
    board.dispose();
  });
}
