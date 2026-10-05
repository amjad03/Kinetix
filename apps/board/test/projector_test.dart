import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart' show Model3dScope;
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/features/board/board_screen.dart';
import 'package:kinetix_board/features/projector/projector_controller.dart';
import 'package:kinetix_board/features/projector/projector_screen.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A second screen the test plugs in and out; it records what the board sends.
class FakeProjectorDisplay implements ProjectorDisplay {
  final attached = <ExternalDisplay>[];
  final sent = <Map<String, dynamic>>[];
  ExternalDisplay? open;
  bool refuse = false;
  final _changes = StreamController<void>.broadcast();
  final _ready = StreamController<void>.broadcast();

  void plug(ExternalDisplay d) {
    attached.add(d);
    _changes.add(null);
  }

  void unplug() {
    attached.clear();
    _changes.add(null);
  }

  /// The projector engine started (again).
  void started() => _ready.add(null);

  List<List<dynamic>> get events => [for (final m in sent) if (m['t'] == 'ev') ...(m['e'] as List).cast<List<dynamic>>()];

  @override
  Future<List<ExternalDisplay>> displays() async => List.of(attached);
  @override
  Stream<void> get changes => _changes.stream;
  @override
  Stream<void> get ready => _ready.stream;
  @override
  Future<bool> show(ExternalDisplay d) async {
    if (refuse) return false;
    open = d;
    return true;
  }

  @override
  Future<void> hide() async => open = null;
  @override
  Future<void> send(String message) async => sent.add(jsonDecode(message) as Map<String, dynamic>);
}

const _hdmi = ExternalDisplay(id: '2', name: 'HDMI projector', width: 1920, height: 1080);

/// A 1×1 PNG, for the 3D model's and the lab's pictures.
final _png = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');

MathElement _equation(String id, String tex) => MathElement(id: id, position: const Offset(100, 100), latex: tex, color: Colors.black, fontSize: 40, size: const Size(120, 40));

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<(ProjectorController, FakeProjectorDisplay, WhiteboardController)> attached({bool auto = true}) async {
    final fake = FakeProjectorDisplay();
    final p = ProjectorController(display: fake, splitInterval: const Duration(hours: 1));
    final wb = WhiteboardController();
    addTearDown(() {
      p.dispose();
      wb.dispose();
    });
    await p.start();
    if (!auto) p.setAuto(false);
    p.attach(ProjectorSource(board: wb, background: () => BoardBackground.plain, canvas: () => const Size(1920, 1080)));
    return (p, fake, wb);
  }

  group('Projector mode', () {
    test('opens by itself when a screen is plugged in, and closes when it is unplugged', () async {
      final (p, fake, _) = await attached();
      expect(p.isShowing, isFalse);
      fake.plug(_hdmi);
      await pumpEventQueue();
      expect(p.showing, _hdmi);
      expect(fake.open, _hdmi);
      // The class's board starts with a full snapshot.
      expect(fake.events.where((e) => e[1] == 'L'), isNotEmpty);

      fake.unplug();
      await pumpEventQueue();
      expect(p.isShowing, isFalse);
    });

    test('streams what the teacher writes, without the tools', () async {
      final (p, fake, wb) = await attached();
      fake.plug(_hdmi);
      await pumpEventQueue();
      wb.insert([_equation('e1', 'a^2+b^2=c^2')]);
      await Future<void>.delayed(const Duration(milliseconds: 250)); // the stream's frame interval

      final feed = ProjectorFeed();
      addTearDown(feed.dispose);
      for (final m in fake.sent) {
        feed.apply(jsonEncode(m));
      }
      expect(feed.started, isTrue);
      expect(feed.player.elements.whereType<MathElement>().single.latex, 'a^2+b^2=c^2');
    });

    test('with "start by itself" off, the teacher opens it; off altogether, never', () async {
      final (p, fake, _) = await attached(auto: false);
      fake.plug(_hdmi);
      await pumpEventQueue();
      expect(p.isShowing, isFalse);
      expect(p.available, isTrue);
      await p.show();
      expect(p.isShowing, isTrue);

      p.setEnabled(false);
      await pumpEventQueue();
      expect(p.isShowing, isFalse);
      await p.show();
      expect(p.isShowing, isFalse);
      expect((await SharedPreferences.getInstance()).getString('setting.projectorEnabled'), 'false');
    });

    test('the 3D model, blanking, and a restarted projector screen', () async {
      final (p, fake, _) = await attached();
      fake.plug(_hdmi);
      await pumpEventQueue();
      expect(p.wantsPictures, isTrue);
      p.send3d(_png);
      expect(fake.sent.last, {'t': 'img', 'k': 'm3d', 'd': base64Encode(_png)});
      p.setBlank(true);
      expect(p.wantsPictures, isFalse);
      expect(fake.sent.last, {'t': 'blank', 'on': true});

      fake.sent.clear();
      fake.started();
      await pumpEventQueue();
      expect(fake.sent.map((m) => m['t']), containsAll(['blank', 'img', 'ev']));
      expect(fake.events.where((e) => e[1] == 'L'), isNotEmpty, reason: 'a fresh snapshot');
    });

    test('nothing is sent while no screen is showing', () async {
      final (p, fake, wb) = await attached(auto: false);
      wb.insert([_equation('e1', 'x')]);
      p.send3d(_png);
      await pumpEventQueue();
      expect(fake.sent, isEmpty);
    });
  });

  group('The projector screen', () {
    Widget app(ProjectorFeed feed) => MaterialApp(home: Scaffold(body: ProjectorView(feed: feed)));

    testWidgets('shows the board, then the 3D model or lab beside it, or a blank screen', (tester) async {
      final feed = ProjectorFeed();
      addTearDown(feed.dispose);
      await tester.pumpWidget(app(feed));
      expect(find.byKey(const Key('projector-waiting')), findsOneWidget);

      final wb = WhiteboardController()..insert([_equation('e1', 'E=mc^2')]);
      addTearDown(wb.dispose);
      final rec = LessonRecorder(board: wb, background: BoardBackground.plain, canvas: const Size(1920, 1080))..start();
      feed.apply(jsonEncode({'t': 'ev', 'e': rec.drain()}));
      rec.stop();
      await tester.pump();
      expect(find.byKey(const Key('projector-board')), findsOneWidget);
      // No tools: just the board.
      expect(find.byType(IconButton), findsNothing);
      expect(find.byType(FilledButton), findsNothing);

      feed.apply(jsonEncode({'t': 'img', 'k': 'm3d', 'd': base64Encode(_png)}));
      await tester.pump();
      expect(find.byKey(const Key('projector-3d')), findsOneWidget);
      feed.apply(jsonEncode({'t': 'img', 'k': 'm3d', 'd': null}));
      feed.apply(jsonEncode({'t': 'img', 'k': 'split', 'd': base64Encode(_png)}));
      await tester.pump();
      expect(find.byKey(const Key('projector-lab')), findsOneWidget);

      feed.apply(jsonEncode({'t': 'blank', 'on': true}));
      await tester.pump();
      expect(find.byKey(const Key('projector-blank')), findsOneWidget);
      expect(find.byKey(const Key('projector-board')), findsNothing);
    });

    testWidgets('the projector engine\'s app takes frames from the channel and asks for a snapshot', (tester) async {
      const channel = MethodChannel('kinetix/projector_feed');
      final calls = <String>[];
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
        calls.add(call.method);
        return null;
      });
      addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, null));
      await tester.pumpWidget(const ProjectorApp());
      expect(calls, ['ready']);

      final wb = WhiteboardController()..insert([_equation('e1', 'x+1')]);
      addTearDown(wb.dispose);
      final rec = LessonRecorder(board: wb, background: BoardBackground.plain, canvas: const Size(1920, 1080))..start();
      final frame = jsonEncode({'t': 'ev', 'e': rec.drain()});
      rec.stop();
      await tester.binding.defaultBinaryMessenger.handlePlatformMessage(
        channel.name,
        const StandardMethodCodec().encodeMethodCall(MethodCall('frame', frame)),
        (_) {},
      );
      await tester.pump();
      expect(find.byKey(const Key('projector-board')), findsOneWidget);
    });
  });

  testWidgets('the board screen feeds the projector: the whiteboard, and the 3D viewer through its mirror', (tester) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final fake = FakeProjectorDisplay()..attached.add(_hdmi);
    final board = BoardController(projector: ProjectorController(display: fake))..skipEnrollment();
    await tester.runAsync(board.projector.start);
    await tester.pumpWidget(MaterialApp(theme: KinetixTheme.light(), home: BoardScreen(board: board)));
    await tester.pumpAndSettle();
    expect(board.projector.isShowing, isTrue);
    expect(fake.events.where((e) => e[1] == 'L'), isNotEmpty);

    // The board screen gives every 3D viewer the projector as its mirror.
    final mirror = tester.widget<Model3dScope>(find.byType(Model3dScope)).mirror!;
    expect(mirror.wanted(), isTrue);
    mirror.send(_png);
    expect(fake.sent.last, {'t': 'img', 'k': 'm3d', 'd': base64Encode(_png)});

    await tester.pumpWidget(const SizedBox());
    expect(board.projector.isShowing, isTrue, reason: 'the screen stays; the stream waits for the board');
    board.dispose();
  });
}
