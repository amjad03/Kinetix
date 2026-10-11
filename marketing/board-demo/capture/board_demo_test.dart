// KINETIX Board product demo: the real board app (demo server, Soundarya Central School,
// Class 10 B Science) driven by a stylus. Copied into apps/board/test/ for the capture only:
//   OUT=<fifo> VO=<vo.json> HAND=<hand.json> flutter test test/zz_board_demo_test.dart
//   PREVIEW=<dir> ... writes small stills instead of streaming frames.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/board_controller.dart';
import 'package:kinetix_board/core/kiosk/kiosk_pin.dart';
import 'package:kinetix_board/core/outbox_store.dart';
import 'package:kinetix_board/core/recording/recordings.dart';
import 'package:kinetix_board/demo/demo.dart';
import 'package:kinetix_board/demo/demo_server.dart';
import 'package:kinetix_board/l10n/l10n.dart';
import 'package:kinetix_board/main.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:kinetix_board/features/ai/voice_input.dart';

import 'support/captions_fakes.dart';
import 'support/recording_fakes.dart';
import 'support/screen_fonts.dart';
import 'zz_director.dart';

final env = Platform.environment;

Future<void> loadMathFonts() async {
  final pub = Directory('${env['HOME']}/.pub-cache/hosted/pub.dev');
  final math = pub.listSync().whereType<Directory>().firstWhere((d) => d.path.contains('flutter_math_fork'));
  final byFam = <String, List<File>>{};
  for (final f in Directory('${math.path}/lib/katex_fonts/fonts').listSync().whereType<File>()) {
    byFam.putIfAbsent(f.uri.pathSegments.last.split('-').first, () => []).add(f);
  }
  for (final e in byFam.entries) {
    final l = FontLoader('packages/flutter_math_fork/${e.key}');
    for (final f in e.value) {
      l.addFont(Future.value(ByteData.sublistView(f.readAsBytesSync())));
    }
    await l.load();
  }
}

/// Stands in for the device's handwriting model (ML Kit / Windows Ink are platform engines,
/// absent under flutter_test): it reads back the words the script wrote.
class ScriptedHandwriting implements HandwritingRecognizer {
  final queue = <String>[];
  @override
  String get engine => 'mlkit';
  @override
  bool get available => true;
  @override
  Future<HandwritingModelState> modelState(String language) async => HandwritingModelState.ready;
  @override
  Future<bool> prepare(String language) async => true;
  @override
  Future<List<String>> recognize(List<Stroke> strokes, {required String language, String preContext = ''}) async => queue.isEmpty ? const [] : [queue.first];
}

final hw = ScriptedHandwriting();
String? lastPoll;
Map<String, dynamic>? lastPollBody;

/// KINETIX AI answers for this lesson, in the API's shape (the demo server only has
/// placeholders; a live board gets these from the KINETIX AI service).
Map<String, dynamic>? aiAnswer(String path) {
  Map<String, dynamic> wrap(String task, Map<String, dynamic> r) => {
    'task': task,
    'result': r,
    'meta': {
      'provider': 'kinetix',
      'model': 'kinetix-edu',
      'cached': false,
      'preview': false,
      'sources': [
        {'topicId': 'cb10-light-2', 'title': 'NCERT Science 10, ch. 9: Refraction of light'},
      ],
    },
  };
  return switch (path) {
    '/v1/ai/explain' => wrap('explain', {
      'answer': 'Light from the pencil travels from water into air. Water is optically denser, so the ray speeds up as it leaves and bends away from the normal. Your eye traces the ray back in a straight line, so the part under water appears raised, and the pencil looks bent at the surface.',
      'keyPoints': ['Light changes speed when it changes medium', 'Denser to rarer: the ray bends away from the normal', 'The eye assumes light travels in straight lines'],
      'followUps': ['Why does a pool look shallower than it is?', 'What is the refractive index of water?'],
    }),
    '/v1/ai/lesson-plan' => wrap('lessonPlan', {
      'objectives': ['Trace a ray through a rectangular glass slab', 'State the two laws of refraction', 'Find n = sin i / sin r from measurements'],
      'steps': [
        {'minutes': 5, 'activity': 'Hook: the "broken" pencil in a glass of water. Ask the class why.'},
        {'minutes': 12, 'activity': 'Glass slab on the board: draw the normal, measure i and r for 30°, 45°, 60°'},
        {'minutes': 10, 'activity': 'Virtual lab: change the angle and record the lateral shift'},
        {'minutes': 10, 'activity': 'Pairs: compute sin i / sin r for each angle and compare'},
        {'minutes': 8, 'activity': 'Exit ticket: three questions on the laws of refraction'},
      ],
      'materials': ['NCERT Science ch. 9', 'Glass slab, pins, protractor', 'Virtual lab: glass slab'],
      'assessment': 'Exit ticket: draw the refracted and emergent rays and state Snell\'s law.',
    }),
    '/v1/ai/quiz' => wrap('quiz', {
      'questions': [
        {'question': 'A ray passes from air into glass. It bends…', 'options': ['towards the normal', 'away from the normal', 'along the surface', 'not at all'], 'answer': 0, 'explanation': 'Glass is optically denser than air, so light slows down and bends towards the normal.'},
        {'question': 'The refractive index of a medium is…', 'options': ['sin r / sin i', 'sin i / sin r', 'i × r', 'i − r'], 'answer': 1, 'explanation': 'Snell\'s law: n = sin i / sin r.'},
        {'question': 'The emergent ray from a glass slab is…', 'options': ['parallel to the incident ray', 'along the normal', 'perpendicular to the slab', 'reflected back'], 'answer': 0, 'explanation': 'The two faces are parallel, so the ray is displaced sideways but not deviated.'},
        {'question': 'Light travels fastest in…', 'options': ['glass', 'water', 'air', 'diamond'], 'answer': 2, 'explanation': 'Air has the lowest refractive index of the four.'},
        {'question': 'The refractive index of water is about…', 'options': ['1.00', '1.33', '1.52', '2.42'], 'answer': 1, 'explanation': 'Water: 1.33; crown glass: 1.52; diamond: 2.42.'},
      ],
    }),
    '/v1/ai/homework' => wrap('homework', {
      'title': 'Refraction through a glass slab',
      'instructions': 'Answer in your notebook. Draw neat ray diagrams with a ruler and protractor.',
      'questions': [
        {'question': 'Draw the path of a ray through a glass slab for i = 40°. Mark i, r and e.', 'marks': 3},
        {'question': 'State the two laws of refraction.', 'marks': 2},
        {'question': 'Light enters glass (n = 1.5) at 30°. Find the angle of refraction.', 'marks': 3},
        {'question': 'Why does a swimming pool look shallower than it is?', 'marks': 2},
      ],
    }),
    '/v1/ai/read-board' => wrap('readBoard', {
      'text': 'Refraction of light. Light bends towards the normal entering glass. n = sin i / sin r',
      'math': [r'n = \frac{\sin i}{\sin r}'],
    }),
    _ => null,
  };
}

/// Students answering a live poll from the Student App (realtime events, as the server sends them).
Future<void> answerPoll(DemoBoardServer server, Director d, List<String> answers, {int gap = 4}) async {
  final id = lastPoll;
  if (id == null) {
    d.log.writeln('no poll to answer');
    return;
  }
  for (final (i, a) in answers.indexed) {
    server.realtime.fire('poll.answered', {'pollId': id, 'studentId': 'cbse10-s${i + 1}', 'answer': a, 'source': i % 5 == 3 ? 'card' : 'app'});
    await d.emit(gap);
  }
}

double _cos(double deg) => Offset.fromDirection(deg * 3.141592653589793 / 180).dx;
double _sin(double deg) => Offset.fromDirection(deg * 3.141592653589793 / 180).dy;

void main() {
  setUpAll(() async {
    await loadScreenFonts();
    await loadMathFonts();
  });

  testWidgets('board demo', (tester) async {
    tester.view
      ..physicalSize = const Size(1920, 1080)
      ..devicePixelRatio = 1;
    Demo.enabled = false;
    // Stylus taps on text fields ask the platform about Scribe (Android stylus handwriting).
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.scribe, (c) async => false);
    final now = DateTime.now();
    SharedPreferences.setMockInitialValues({
      // Signed offline codes the institution issued earlier (shown only when the cloud is unreachable).
      'offline.codes': jsonEncode([
        {
          'token': 'kxo1.SOUNDARYA-CBSE.room204.${now.millisecondsSinceEpoch ~/ 1000}.ed25519.Q2xhc3MgMTAgQiBTY2llbmNlIEthdnlhIE1lbm9u',
          'validFrom': now.subtract(const Duration(hours: 1)).toUtc().toIso8601String(),
          'validUntil': now.add(const Duration(minutes: 15)).toUtc().toIso8601String(),
        },
      ]),
    });
    final server = DemoBoardServer(claimDelay: const Duration(hours: 2))..switchTo('cbse10');
    var offline = false;
    final voice = FakeVoiceInput();
    VoiceInput.create = () => voice;
    server.studentAnswerDelay = const Duration(hours: 6); // the script answers polls itself
    final client = MockClient((req) async {
      if (offline && !req.url.path.startsWith('/v1/ai')) throw const SocketException('Network is unreachable');
      if (req.url.path == '/v1/devices/me/profiles/me/pin' && req.method == 'PUT') {
        // The cloud stores the PIN as a PBKDF2 hash and hands the board the same, for checks offline.
        final pin = (jsonDecode(req.body) as Map)['pin'] as String;
        final salt = List<int>.generate(16, (i) => i * 7 + 3);
        final hash = pbkdf2Sha256(utf8.encode(pin), salt, 2000, 32);
        return http.Response(jsonEncode({'pin': {'algo': KioskPin.pbkdf2Sha256, 'iterations': 2000, 'salt': base64.encode(salt), 'hash': base64.encode(hash)}}), 200, headers: {'content-type': 'application/json'});
      }
      final ai = aiAnswer(req.url.path);
      if (ai != null) {
        return http.Response.bytes(utf8.encode(jsonEncode(ai)), 200, headers: {'content-type': 'application/json; charset=utf-8'});
      }
      final pm = RegExp(r'^/v1/polls/([^/]+)$').firstMatch(req.url.path);
      if (pm != null && req.method == 'PUT') {
        lastPoll = pm[1];
        lastPollBody = jsonDecode(req.body) as Map<String, dynamic>;
      }
      final copy = http.Request(req.method, req.url)
        ..headers.addAll(req.headers)
        ..bodyBytes = req.bodyBytes;
      return http.Response.fromStream(await server.client.send(copy));
    });
    final store = MemoryRecordingStore();
    final board = BoardController(
      apiFactory: (url) => ApiClient(baseUrl: url, client: client),
      realtimeFactory: (_) => server.realtime,
      outboxStore: MemoryOutboxStore(),
      handwriting: hw,
      recordings: Recordings(store: store, voice: () => FakeVoiceRecorder(store: store)),
    );
    board.startDemo(
      serverUrl: demoServerUrl,
      deviceToken: DemoBoardServer.deviceToken,
      deviceName: DemoBoardServer.deviceName,
      sessionToken: DemoBoardServer.sessionToken,
      session: server.session(),
    );
    final rk = GlobalKey();
    await tester.pumpWidget(RepaintBoundary(key: rk, child: KinetixBoardApp(controller: board)));
    for (var i = 0; i < 30; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    final vo = (jsonDecode(File(env['VO']!).readAsStringSync()) as Map).map((k, v) => MapEntry(k as String, (v as num).toDouble()));
    final hand = jsonDecode(File(env['HAND']!).readAsStringSync()) as Map<String, dynamic>;
    final d = Director(tester, rk, vo: vo, outPath: env['OUT'], previewDir: env['PREVIEW']);
    final only = env['ONLY']?.split(',').toSet();
    // Between chapters (under the title card) anything left open is put away.
    Future<void> cleanup() async {
      for (final nav in tester.stateList<NavigatorState>(find.byType(Navigator))) {
        nav.popUntil((r) => r.isFirst);
      }
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      for (final f in [find.byKey(const Key('popover-barrier')), find.byKey(const Key('panel-close')), find.text('End spotlight'), find.byKey(const Key('captions-stop'))]) {
        if (f.hitTestable().evaluate().isNotEmpty) {
          await tester.tap(f.hitTestable().first, warnIfMissed: false);
          for (var i = 0; i < 4; i++) {
            await tester.pump(const Duration(milliseconds: 100));
          }
        }
      }
      final cv = find.byType(WhiteboardCanvas);
      if (cv.evaluate().isNotEmpty) {
        final wb = tester.widget<WhiteboardCanvas>(cv.first).controller;
        wb.geoTools.value = const [];
        if (wb.protractor.value.visible) wb.toggleProtractor();
        if (wb.ruler.value.visible) wb.toggleRuler();
        wb.clearSelection();
      }
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
    }

    bool want(String chapter) => only == null || only.contains(chapter);
    if (!want('c1')) {
      for (final f in [find.byKey(const Key('conceptVideoSkip')), find.text('Not now')]) {
        if (f.evaluate().isNotEmpty) {
          await tester.tap(f.first);
          for (var i = 0; i < 10; i++) {
            await tester.pump(const Duration(milliseconds: 100));
          }
        }
      }
    }

    // ======================================================= cold open
    // Concept video suggestions and the PIN offer wait until chapter 1.
    final chapters = <String, Future<void> Function()>{
      'open': () async {
        await d.seg('s00');
        await d.air(const Offset(300, 200), ms: 500, hEnd: 0.1);
        await d.write(hand, 'title', const Offset(150, 110), 130, speed: 1.35);
        await d.endSeg(rest: const Offset(1300, 420));
      },
      'c1': () async {
        await d.chapter(1, 'Sign in and start the class');
        await d.seg('s10');
        await d.tapKey('class-chip');
        await d.emit(8);
        final qr = find.byType(Dialog);
        if (qr.evaluate().isNotEmpty) {
          final r = tester.getRect(qr.first);
          d.zoom(r.inflate(60), seconds: 4.5);
          await d.point(Offset(r.right - 130, r.center.dy), seconds: 1.8);
          await d.point(Offset(r.left + 200, r.center.dy + 30), seconds: 1.6);
        }
        await d.endSeg();
        await d.seg('s11');
        offline = true;
        await d.closeDialog();
        await d.tapKey('class-chip');
        await d.emit(10);
        final q2 = find.byKey(const Key('offline-qr'));
        if (q2.evaluate().isNotEmpty) {
          final r = tester.getRect(q2);
          d.callout('Signed offline code', r);
          await d.point(r.centerRight + const Offset(30, 0), seconds: 1.5);
          final note = find.byKey(const Key('offline-note'));
          if (note.evaluate().isNotEmpty) await d.point(tester.getCenter(note), seconds: 1.2);
        }
        await d.endSeg();
        offline = false;
        await d.closeDialog();
        await d.seg('s12');
        await d.tapKey('pin-offer-set');
        await d.emit(16);
        for (var round = 0; round < 2 && find.byKey(const Key('pin-dots')).evaluate().isNotEmpty; round++) {
          for (final digit in ['2', '5', '8', '0']) {
            await d.tapKey('pin-$digit');
          }
          if (find.byKey(const Key('pin-ok')).evaluate().isNotEmpty) await d.tapKey('pin-ok');
          await d.emit(16);
        }
        await d.tapKey('profile-button');
        await d.emit(4);
        await d.tapKey('menu-lock');
        await d.emit(12);
        if (find.byKey(const Key('pin-dots')).evaluate().isEmpty && find.byKey(const Key('profile-lock')).evaluate().isNotEmpty) {
          final names = find.descendant(of: find.byKey(const Key('profile-lock')), matching: find.byType(InkWell));
          if (names.evaluate().isNotEmpty) await d.tapFinder(names.first);
          await d.emit(8);
        }
        if (find.byKey(const Key('pin-dots')).evaluate().isNotEmpty) {
          d.callout('Shuffled keypad', tester.getRect(find.byKey(const Key('pin-dots'))).inflate(8));
          for (final digit in ['2', '5', '8', '0']) {
            await d.tapKey('pin-$digit');
          }
          if (find.byKey(const Key('pin-ok')).evaluate().isNotEmpty) await d.tapKey('pin-ok');
        }
        await d.emit(6);
        await d.endSeg();
        await d.seg('s13');
        final chip = d.rectOf('class-chip');
        if (chip != null) {
          d.callout('From the timetable', chip);
          await d.point(chip.bottomCenter + const Offset(0, 14), seconds: 1.4);
        }
        final card = d.rectOf('conceptVideoCard');
        if (card != null) {
          d.zoom(card.inflate(40), seconds: 4);
          await d.point(card.centerLeft + const Offset(60, -20), seconds: 1.2);
          await d.point(card.center + const Offset(40, 40), seconds: 1.2);
        }
        await d.endSeg();
        if (find.byKey(const Key('conceptVideoSkip')).evaluate().isNotEmpty) await d.tapKey('conceptVideoSkip');
        await d.seg('s14');
        await d.tapKey('tool-tools');
        await d.emit(6);
        await d.tapKey('drawer-todays-plan');
        await d.emit(10);
        if (find.text('Start step timer').evaluate().isNotEmpty) {
          await d.tapText('Start step timer');
          await d.emit(10);
        }
        await d.point(const Offset(1500, 520), seconds: 1.0);
        await d.endSeg();
        await d.seg('s15');
        await d.tapKey('panel-tab-books');
        await d.emit(10);
        await d.point(const Offset(1450, 300), seconds: 1.4);
        await d.tapKey('panel-close');
        await d.emit(6);
        await d.tapKey('profile-button');
        await d.emit(10);
        await d.point(const Offset(1700, 260), seconds: 1.2);
        await d.point(const Offset(1700, 520), seconds: 0.6);
        await d.endSeg();
        await d.dismissPopover();
      },
      'c2': () async {
        await d.chapter(2, 'Ink that feels like a pen');
        await d.seg('s20');
        await d.tapKey('tool-pen');
        await d.emit(4);
        if (find.byKey(const Key('pen-popover')).evaluate().isEmpty) await d.tapKey('tool-pen');
        await d.emit(6);
        final pop = d.rectOf('pen-popover');
        if (pop != null) d.zoom(pop.inflate(40), seconds: 5);
        await d.tapKey('pen-type-calligraphy');
        await d.tapKey('pen-type-pen');
        final th = d.rectOf('pen-thickness');
        if (th != null) await d.drag([Offset(th.left + th.width * 0.12, th.center.dy), Offset(th.left + th.width * 0.3, th.center.dy)], 500);
        await d.tapKey('pen-colour-2');
        await d.tapKey('pen-pressure');
        await d.point(d.centerOf('pen-palm') ?? const Offset(1500, 900), seconds: 0.6);
        await d.endSeg();
        await d.dismissPopover();
        await d.seg('s21');
        await d.write(hand, 'bends', const Offset(1100, 285), 66, speed: 1.7);
        await d.endSeg();
        await d.seg('s22');
        await d.shape('rectangle', const Offset(300, 450), const Offset(860, 700));
        await d.shape('line', const Offset(520, 330), const Offset(520, 820));
        await d.shape('arrow', const Offset(360, 330), const Offset(516, 446));
        await d.shapeAgain(const Offset(524, 454), const Offset(640, 696));
        await d.shapeAgain(const Offset(644, 704), const Offset(800, 820));
        await d.endSeg();
        await d.seg('s23');
        await d.tapKey('tool-pen');
        await d.emit(3);
        await d.dismissPopover();
        await d.write(hand, 'air', const Offset(180, 300), 90);
        await d.write(hand, 'glass', const Offset(880, 520), 90);
        await d.write(hand, 'i', const Offset(470, 330), 80);
        await d.write(hand, 'r', const Offset(540, 470), 80);
        await d.tapKey('tool-highlighter');
        await d.emit(3);
        await d.dismissPopover();
        await d.drag([const Offset(160, 222), const Offset(700, 226), const Offset(1240, 220)], 900);
        await d.endSeg();
        await d.seg('s24');
        await d.tapKey('tool-erase');
        await d.emit(3);
        await d.dismissPopover();
        await d.drag([const Offset(170, 360), const Offset(230, 335), const Offset(290, 365)], 450);
        await d.emit(6);
        await d.tapKey('undo');
        await d.emit(6);
        await d.tapKey('redo');
        await d.emit(6);
        await d.tapKey('undo');
        await d.emit(4);
        await d.endSeg();
        await d.seg('s25');
        await d.tapKey('tool-select');
        await d.emit(3);
        await d.dismissPopover();
        await d.drag([for (var a = 0; a <= 36; a++) Offset(600 + 470 * _cos(a * 10.0), 585 + 268 * _sin(a * 10.0))], 1100);
        await d.emit(8);
        await d.drag([const Offset(580, 575), const Offset(640, 590)], 600, holdMs: 120);
        await d.emit(10);
        await d.tapAt(const Offset(1500, 330));
        await d.endSeg();
        await d.seg('s26');
        await d.tapKey('tool-tools');
        await d.emit(6);
        await d.tapKey('drawer-protractor');
        await d.emit(10);
        await d.drag([const Offset(960, 560), const Offset(900, 520)], 700, holdMs: 100);
        await d.emit(10);
        await d.endSeg();
        if (find.byKey(const Key('protractor-close')).evaluate().isNotEmpty) await d.tapKey('protractor-close');
        await d.emit(14);
        if (find.byKey(const Key('protractor')).evaluate().isNotEmpty) {
          (tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas).first).controller as dynamic).toggleProtractor();
          await d.emit(2);
        }
      },
      'c3': () async {
        await d.chapter(3, 'AI pen, maths and diagrams');
        await d.seg('s30');
        await d.tapKey('tool-ai-pen');
        await d.emit(3);
        await d.dismissPopover();
        hw.queue
          ..clear()
          ..add('glass slab');
        await d.write(hand, 'slab', const Offset(1110, 400), 74, speed: 1.6);
        await d.emit(24);
        await d.tapKey('tool-pen');
        await d.emit(3);
        if (find.byKey(const Key('pen-popover')).evaluate().isEmpty) await d.tapKey('tool-pen');
        await d.emit(3);
        await d.tapKey('pen-mode-shapeAi');
        await d.dismissPopover();
        await d.stroke([
          for (var a = 0; a <= 380; a += 8) (Offset(1300 + (70 + 6 * _sin(a * 3.0)) * _cos(a - 90.0), 640 + (62 + 5 * _cos(a * 2.0)) * _sin(a - 90.0)), a * 2.6),
        ]);
        await d.emit(14);
        await d.endSeg();
        await d.seg('s31');
        await d.tapKey('tool-insert');
        await d.emit(5);
        await d.tapKey('insert-equation');
        await d.emit(8);
        final tex = find.descendant(of: find.byType(Dialog), matching: find.byType(TextField));
        if (tex.evaluate().isNotEmpty) {
          await d.tapFinder(tex.last);
          await d.type(tex.last, r'n = \frac{\sin i}{\sin r}', charsPerFrame: 2);
          await d.emit(10);
          await d.tapText('Put on the board');
        }
        await d.emit(12);
        await d.endSeg();
        await d.seg('s32');
        await d.tapKey('panel-ai');
        await d.emit(8);
        await d.tapKey('ai-tool-math');
        await d.emit(8);
        final mi = find.byKey(const Key('math-input'));
        if (mi.evaluate().isNotEmpty) {
          await d.tapFinder(mi);
          await d.type(mi, '2x + 5 = 17', charsPerFrame: 1);
          await d.tapKey('math-solve');
          await d.emit(14);
          final ans = d.rectOf('math-answer');
          if (ans != null) await d.point(ans.center, seconds: 0.8);
        }
        await d.endSeg();
        await d.seg('s33');
        await d.tapKey('panel-close');
        await d.emit(4);
        await d.tapKey('tool-tools');
        await d.emit(8);
        final dr = d.rectOf('tools-drawer-scroll');
        if (dr != null) {
          await d.drag([dr.center + const Offset(0, 250), dr.center - const Offset(0, 250)], 700);
          await d.emit(8);
          await d.drag([dr.center - const Offset(0, 200), dr.center + const Offset(0, 300)], 600);
          await d.emit(6);
        }
        await d.tapKey('drawer-periodic-table');
        await d.emit(12);
        await d.point(const Offset(1500, 400), seconds: 0.8);
        await d.endSeg();
        await d.tapKey('panel-close');
        await d.emit(4);
      },
      'c4': () async {
        await d.chapter(4, 'Pages, backgrounds and saving');
        await d.seg('s40');
        await d.tapKey('add-page');
        await d.emit(8);
        await d.tapKey('tool-pen');
        await d.emit(2);
        await d.dismissPopover();
        await d.write(hand, 'snell', const Offset(220, 200), 110, speed: 1.8);
        await d.tapKey('page-overview');
        await d.emit(10);
        final th = find.byKey(const Key('page-thumbnails'));
        await d.point(tester.getCenter(th.evaluate().isEmpty ? find.byKey(const Key('page-overview')) : th), seconds: 1.2);
        await d.endSeg();
        await d.tapKey('overview-close');
        await d.emit(4);
        await d.seg('s41');
        await d.tapKey('board-menu');
        await d.emit(5);
        await d.tapKey('tool-theme');
        await d.emit(8);
        for (final b in ['ruled', 'grid', 'dots', 'chalkboard']) {
          if (find.byKey(Key('bg-$b')).evaluate().isNotEmpty) {
            await d.tapKey('bg-$b');
            await d.emit(14);
          }
        }
        await d.tapKey('bg-plain');
        await d.emit(4);
        await d.endSeg();
        await d.dismissPopover();
        await d.seg('s42');
        await d.tapKey('board-menu');
        await d.emit(5);
        await d.tapKey('menu-versions');
        await d.emit(12);
        await d.point(const Offset(960, 500), seconds: 0.8);
        await d.closeDialog();
        await d.tapKey('quick-share');
        await d.emit(30);
        final sh = find.byKey(const Key('share-whiteboard'));
        if (sh.evaluate().isNotEmpty) {
          for (final k in ['share-qr', 'share-whatsapp']) {
            final c = d.centerOf(k);
            if (c != null) await d.point(c, seconds: 0.6);
          }
        }
        await d.endSeg();
        if (find.text('Close').evaluate().isNotEmpty) await d.tapText('Close');
        await d.emit(4);
        await d.dismissPopover();
      },
      'c5': () async {
        await d.chapter(5, '3D models, labs and simulations');
        await d.seg('s50');
        await d.tapKey('panel-ai');
        await d.emit(6);
        await d.tapKey('panel-tab-model3d');
        await d.emit(8);
        final msf = find.byWidgetPredicate((w) => w is TextField && (w.decoration?.hintText ?? '').contains('3D'));
        if (msf.evaluate().isNotEmpty) {
          await d.tapFinder(msf.first);
          await d.type(msf.first, 'cone', charsPerFrame: 1);
          await d.emit(6);
        }
        d.log.writeln('3D list: ${find.byType(Text).evaluate().map((e) => (e.widget as Text).data).whereType<String>().where((t) => t.length > 3).take(60).join(' | ')}');
        final wm = find.text('Frustum of a cone').hitTestable();
        if (wm.evaluate().isNotEmpty) await d.tapFinder(wm.first);
        await d.emit(20);
        final st = find.byType(CustomPaint).evaluate().isEmpty ? null : const Rect.fromLTWH(1060, 200, 760, 520);
        if (st != null) {
          await d.drag([st.center, st.center + const Offset(-180, 40)], 900);
          await d.emit(10);
          await d.drag([st.center + const Offset(-100, 0), st.center + const Offset(120, -60)], 900);
          await d.emit(20);
        }
        await d.endSeg();
        await d.seg('s51');
        await d.tapKey('panel-tab-labs');
        await d.emit(8);
        await d.tapText('Refraction through a glass slab');
        await d.emit(20);
        await d.drag([const Offset(1513, 262), const Offset(1460, 250), const Offset(1390, 268)], 1300, holdMs: 120);
        await d.emit(10);
        await d.drag([const Offset(1390, 268), const Offset(1470, 255)], 900, holdMs: 80);
        await d.emit(8);
        await d.endSeg();
        await d.seg('s52');
        await d.tapKey('panel-tab-sims');
        await d.emit(14);
        await d.tapKey('panel-tab-animations');
        await d.emit(14);
        await d.tapKey('panel-tab-videos');
        await d.emit(12);
        await d.tapKey('panel-tab-kit');
        await d.emit(12);
        await d.endSeg();
        await d.seg('s53');
        await d.tapKey('panel-close');
        await d.emit(4);
        await d.tapKey('tool-insert');
        await d.emit(8);
        final ins = find.byKey(const Key('insert-note'));
        if (ins.evaluate().isNotEmpty) await d.point(tester.getCenter(ins) + const Offset(-80, 0), seconds: 0.8);
        await d.tapKey('insert-note');
        await d.emit(8);
        final note = find.byType(TextField).hitTestable();
        if (note.evaluate().isNotEmpty) {
          await d.tapFinder(note.last);
          await d.type(note.last, 'Exit ticket: draw the emergent ray', charsPerFrame: 3);
        }
        if (find.text('Put on the board').hitTestable().evaluate().isNotEmpty) await d.tapText('Put on the board');
        await d.emit(8);
        await d.tapKey('panel-ai');
        await d.emit(4);
        await d.tapKey('panel-tab-web');
        await d.emit(12);
        await d.endSeg();
        await d.tapKey('panel-close');
        await d.emit(4);
      },
      'c6': () async {
        await d.chapter(6, 'KINETIX AI, built into the lesson');
        await d.seg('s60');
        await d.tapKey('panel-ai');
        await d.emit(6);
        if (find.byKey(const Key('panel-tab-ai')).evaluate().isNotEmpty) await d.tapKey('panel-tab-ai');
        await d.emit(4);
        final ask = find.byKey(const Key('ai-ask'));
        if (ask.evaluate().isNotEmpty) {
          await d.tapFinder(ask);
          final tf = find.descendant(of: ask, matching: find.byType(TextField));
          await d.type(tf.evaluate().isNotEmpty ? tf : ask, 'Why does a pencil look bent in a glass of water?');
          await d.tapKey('ai-ask-send');
          await d.ramp(3, 3);
          await d.emit(10);
          final ex = d.rectOf('ai-explanation');
          if (ex != null) await d.point(ex.center, seconds: 1.0);
          final src = d.rectOf('ai-sources');
          if (src != null) {
            d.callout('Sources', src);
            await d.point(src.center, seconds: 0.6);
          }
        }
        await d.endSeg();
        await d.seg('s61');
        if (find.byKey(const Key('ai-explanation-close')).evaluate().isNotEmpty) await d.tapKey('ai-explanation-close');
        if (find.byKey(const Key('panel-back')).evaluate().isNotEmpty) await d.tapKey('panel-back');
        await d.emit(4);
        await d.tapKey('ai-tool-lessonPlan');
        await d.emit(8);
        await d.tapKey('lesson-generate');
        await d.ramp(3, 3);
        await d.emit(8);
        final lp = d.rectOf('lesson-plan');
        if (lp != null) {
          await d.point(lp.topCenter + const Offset(0, 120), seconds: 0.8);
          await d.drag([lp.center + const Offset(0, 200), lp.center - const Offset(0, 150)], 700);
        }
        await d.endSeg();
        await d.seg('s62');
        if (find.byKey(const Key('panel-back')).evaluate().isNotEmpty) await d.tapKey('panel-back');
        await d.emit(4);
        await d.tapKey('ai-tool-quiz');
        await d.emit(8);
        await d.tapKey('quiz-generate');
        await d.ramp(3, 3);
        await d.emit(10);
        await d.point(const Offset(1450, 520), seconds: 0.6);
        if (find.byKey(const Key('panel-back')).evaluate().isNotEmpty) await d.tapKey('panel-back');
        await d.emit(4);
        await d.tapKey('ai-tool-readBoard');
        await d.ramp(2, 3);
        await d.emit(10);
        await d.endSeg();
        await d.tapKey('panel-close');
        await d.emit(4);
      },
      'c7': () async {
        await d.chapter(7, 'Live class responses');
        await d.seg('s70');
        await d.tapKey('attendance-chip');
        await d.emit(10);
        for (final n in ['Darshan Gowda', 'Kiran Patil']) {
          if (find.text(n).hitTestable().evaluate().isNotEmpty) await d.tapText(n);
          await d.emit(3);
        }
        final sub = find.byKey(const Key('attendance-submit'));
        if (sub.evaluate().isNotEmpty) {
          await d.tapFinder(sub);
        } else {
          await d.tapText('Save attendance');
        }
        await d.emit(10);
        await d.endSeg();
        await d.seg('s71');
        await d.tapKey('tool-tools');
        await d.emit(6);
        await d.tapKey('drawer-ask-class');
        await d.emit(10);
        final q = find.byKey(const Key('ask-question'));
        if (q.evaluate().isNotEmpty) {
          await d.tapFinder(q);
          final tf = find.descendant(of: q, matching: find.byType(TextField));
          await d.type(tf.evaluate().isNotEmpty ? tf : q, 'Entering glass, a ray of light bends…');
        }
        final cos = find.textContaining(RegExp(r'^CO\d'));
        if (cos.hitTestable().evaluate().isNotEmpty) await d.tapFinder(cos.hitTestable().first);
        await d.emit(4);
        await d.tapKey('ask-start');
        await d.emit(8);
        final pc = find.byKey(const Key('poll-count'));
        Rect? card;
        if (pc.evaluate().isNotEmpty) {
          final m = find.ancestor(of: pc, matching: find.byType(Material));
          card = tester.getRect(m.evaluate().isNotEmpty ? m.first : pc).inflate(24);
          d.zoom(Rect.fromCenter(center: card.center, width: card.width * 1.9, height: card.width * 1.9 * 9 / 16), seconds: 9);
        }
        final right = (lastPollBody?['correct'] as String?) ?? '0';
        await answerPoll(server, d, [right, right, '1', right, right, right, '2', right, right]);
        await d.endSeg();
        await d.seg('s72');
        await answerPoll(server, d, [right, '1', right, right, '3', right, right], gap: 3);
        if (find.byKey(const Key('poll-reveal')).evaluate().isNotEmpty) await d.tapKey('poll-reveal');
        await d.emit(10);
        if (find.byKey(const Key('poll-end')).evaluate().isNotEmpty) await d.tapKey('poll-end');
        await d.emit(10);
        await d.emit(8);
        await d.endSeg();
        await d.seg('s73');
        if (find.byKey(const Key('poll-end')).evaluate().isNotEmpty) await d.tapKey('poll-end');
        if (find.byKey(const Key('poll-dismiss')).evaluate().isNotEmpty) await d.tapKey('poll-dismiss');
        await d.emit(4);
        await d.tapKey('tool-tools');
        await d.emit(6);
        await d.tapKey('drawer-ask-class');
        await d.emit(10);
        await d.tapKey('ask-word-cloud');
        await d.emit(4);
        final q2 = find.byKey(const Key('ask-question'));
        if (q2.evaluate().isNotEmpty) {
          await d.tapFinder(q2);
          final tf = find.descendant(of: q2, matching: find.byType(TextField));
          await d.type(tf.evaluate().isNotEmpty ? tf : q2, 'One word: what does light do in glass?');
        }
        await d.tapKey('ask-start');
        await d.emit(6);
        await answerPoll(server, d, ['bends', 'refracts'], gap: 5);
        final wck = find.byKey(const Key('word-cloud'));
        if (wck.evaluate().isNotEmpty) {
          final m = find.ancestor(of: wck, matching: find.byType(Material));
          final r = tester.getRect(m.evaluate().isNotEmpty ? m.first : wck).inflate(24);
          d.zoom(Rect.fromCenter(center: r.center, width: r.width * 1.8, height: r.width * 1.8 * 9 / 16), seconds: 6);
        }
        await answerPoll(server, d, ['slows down', 'bends', 'changes direction', 'bends', 'slows down', 'towards normal', 'refracts', 'bends', 'slows down', 'refracts', 'bends', 'changes speed'], gap: 5);
        await d.endSeg();
        if (find.byKey(const Key('poll-end')).evaluate().isNotEmpty) await d.tapKey('poll-end');
        if (find.byKey(const Key('poll-dismiss')).evaluate().isNotEmpty) await d.tapKey('poll-dismiss');
        await d.emit(4);
        await d.seg('s74');
        Future<void> tool(String id, [int frames = 18]) async {
          await d.drawerTool(id, filter: 'classroom');
          await d.emit(frames);
        }
        await tool('toolkit-picker', 6);
        if (find.text('Pick').hitTestable().evaluate().isNotEmpty) await d.tapText('Pick');
        await d.emit(18);
        await d.closeOverlayTool();
        await tool('toolkit-timer', 8);
        if (find.text('Start').hitTestable().evaluate().isNotEmpty) await d.tapText('Start');
        await d.emit(10);
        await d.closeOverlayTool();
        await tool('scoreboard', 4);
        if (find.byKey(const Key('score-add-team')).evaluate().isNotEmpty) await d.tapKey('score-add-team');
        await d.emit(6);
        await tool('badges', 8);
        await tool('group-maker', 6);
        if (find.byKey(const Key('groups-make')).evaluate().isNotEmpty) await d.tapKey('groups-make');
        await d.emit(10);
        await tool('zones', 8);
        if (find.text('2 zones').hitTestable().evaluate().isNotEmpty) await d.tapText('2 zones');
        await d.emit(12);
        await d.endSeg();
        if (find.byKey(const Key('zones-end')).evaluate().isNotEmpty) await d.tapKey('zones-end');
        if (find.byKey(const Key('zones-off')).evaluate().isNotEmpty) await d.tapKey('zones-off');
        if (find.byKey(const Key('panel-close')).evaluate().isNotEmpty) await d.tapKey('panel-close');
        await d.emit(4);
      },
      'c8': () async {
        await d.chapter(8, 'Homework, marking and OBE');
        await d.seg('s80');
        await d.tapKey('panel-ai');
        await d.emit(6);
        if (find.byKey(const Key('panel-tab-ai')).evaluate().isNotEmpty) await d.tapKey('panel-tab-ai');
        await d.tapKey('ai-tool-homework');
        await d.emit(8);
        await d.tapKey('homework-generate');
        await d.ramp(3, 3);
        await d.emit(8);
        await d.tapKey('homework-send');
        await d.emit(10);
        if (find.byKey(const Key('send-homework-confirm')).evaluate().isNotEmpty) await d.tapKey('send-homework-confirm');
        await d.emit(12);
        await d.endSeg();
        await d.seg('s81');
        d.ev({'inset': ['teacher-navClasses.jpg', 'student-navLearn.jpg'], 'dur': ((vo['s81'] ?? 6) * fps).round()});
        await d.idle(1, rest: const Offset(1400, 700));
        await d.endSeg();
        if (find.byKey(const Key('panel-close')).evaluate().isNotEmpty) await d.tapKey('panel-close');
        await d.seg('s82');
        await d.tapKey('tool-tools');
        await d.emit(6);
        await d.tapKey('drawer-ask-class');
        await d.emit(10);
        final cos = find.textContaining(RegExp(r'^CO\d'));
        if (cos.hitTestable().evaluate().isNotEmpty) {
          final r = tester.getRect(cos.hitTestable().first);
          d.callout('Course outcomes', r.inflate(10));
          for (var i = 0; i < cos.hitTestable().evaluate().length && i < 2; i++) {
            await d.tapFinder(cos.hitTestable().at(i));
          }
        }
        await d.emit(10);
        await d.endSeg();
        await d.closeDialog();
        if (find.text('Cancel').hitTestable().evaluate().isNotEmpty) await d.tapText('Cancel');
        await d.emit(4);
      },
      'c9': () async {
        await d.chapter(9, 'Record, cast and share');
        await d.seg('s90');
        await d.tapKey('record');
        await d.emit(8);
        if (find.byKey(const Key('rec-notice-start')).evaluate().isNotEmpty) await d.tapKey('rec-notice-start');
        await d.emit(20);
        await d.tapKey('rec-marker');
        await d.emit(15);
        await d.tapKey('rec-marker', hold: true);
        await d.emit(15);
        await d.endSeg();
        await d.seg('s91');
        await d.tapKey('rec-stop');
        await d.emit(10);
        if (find.byKey(const Key('rec-save')).evaluate().isNotEmpty) await d.tapKey('rec-save');
        await d.ramp(2, 3);
        await d.tapKey('profile-button');
        await d.emit(5);
        await d.tapKey('menu-recordings');
        await d.emit(14);
        await d.endSeg();
        await d.closeDialog();
        await d.seg('s92');
        await d.drawerTool('live-captions');
        await d.emit(8);
        const line = 'When light enters the glass slab it slows down and bends towards the normal';
        final words = line.split(' ');
        for (var i = 1; i <= words.length; i++) {
          voice.say(words.take(i).join(' '), done: i == words.length);
          await d.emit(4);
        }
        await d.emit(10);
        await d.tapKey('panel-ai');
        await d.emit(4);
        await d.tapKey('panel-tab-cast');
        await d.emit(18);
        await d.tapKey('panel-close');
        if (find.byKey(const Key('captions-stop')).evaluate().isNotEmpty) await d.tapKey('captions-stop');
        await d.tapKey('profile-button');
        await d.emit(5);
        await d.tapKey('menu-projector');
        await d.emit(16);
        await d.endSeg();
        await d.closeDialog();
        if (find.text('Done').hitTestable().evaluate().isNotEmpty) await d.tapText('Done');
        await d.emit(4);
      },
      'c10': () async {
        await d.chapter(10, 'Comfort, languages and control');
        await d.seg('s100');
        await d.tapKey('board-menu');
        await d.emit(5);
        await d.tapKey('menu-eye-comfort');
        await d.emit(8);
        if (find.byKey(const Key('eye-protection')).evaluate().isNotEmpty) await d.tapKey('eye-protection');
        await d.emit(18);
        if (find.byKey(const Key('eye-protection')).evaluate().isNotEmpty) await d.tapKey('eye-protection');
        await d.emit(4);
        await d.dismissPopover();
        await d.tapKey('board-menu');
        await d.emit(5);
        await d.tapKey('menu-theme-toggle');
        await d.emit(20);
        await d.tapKey('board-menu');
        await d.emit(5);
        await d.tapKey('menu-theme-toggle');
        await d.emit(10);
        await d.endSeg();
        await d.seg('s101');
        for (final lang in ['hi', 'kn', 'en']) {
          final lf = find.byKey(Key('board-language-$lang')).hitTestable();
          if (lf.evaluate().isEmpty) {
            for (final nav in tester.stateList<NavigatorState>(find.byType(Navigator))) {
              nav.popUntil((r) => r.isFirst);
            }
            await d.emit(3);
            await d.tapKey('board-menu');
            await d.emit(5);
            await d.tapKey('menu-settings');
            await d.emit(10);
          }
          if (lf.evaluate().isNotEmpty) {
            await d.tapFinder(lf.first);
            await d.emit(lang == 'en' ? 8 : 40);
          } else {
            d.log.writeln('no language button $lang');
          }
        }
        board.setBoardLanguage(BoardLanguage.en);
        await d.endSeg();
        await d.seg('s102');
        if (find.text('Done').hitTestable().evaluate().isNotEmpty) await d.tapText('Done');
        await d.emit(4);
        for (final nav in tester.stateList<NavigatorState>(find.byType(Navigator))) {
          nav.popUntil((r) => r.isFirst);
        }
        board.setTheme(BoardTheme.light);
        board.setBoardLanguage(BoardLanguage.en);
        await d.emit(4);
        Future<void> tool(String id, [int frames = 18]) async {
          await d.drawerTool(id);
          await d.emit(frames);
        }
        await tool('voice-commands', 14);
        voice.say('next page');
        await d.emit(6);
        voice.say('next page', done: true);
        await d.emit(16);
        if (find.byKey(const Key('voice-close')).evaluate().isNotEmpty) await d.tapKey('voice-close');
        await d.closeDialog();
        await tool('toolkit-curtain', 20);
        if (find.text('Remove shade').hitTestable().evaluate().isNotEmpty) await d.tapText('Remove shade');
        await d.emit(4);
        await tool('toolkit-spotlight', 24);
        if (find.text('End spotlight').hitTestable().evaluate().isNotEmpty) await d.tapText('End spotlight');
        await d.emit(4);
        await d.endSeg();
        await d.seg('s103');
        await d.tapKey('board-menu');
        await d.emit(5);
        await d.tapKey('menu-customise-toolbar');
        await d.emit(18);
        await d.closeDialog();
        if (find.text('Done').hitTestable().evaluate().isNotEmpty) await d.tapText('Done');
        await tool('diagnostics', 24);
        await d.endSeg();
        if (find.byKey(const Key('panel-close')).evaluate().isNotEmpty) await d.tapKey('panel-close');
        await d.emit(4);
      },
      'c11': () async {
        await d.chapter(11, 'Works offline, syncs everywhere');
        await d.seg('s110');
        offline = true;
        await d.tapKey('attendance-chip');
        await d.emit(8);
        final sub = find.byKey(const Key('attendance-submit'));
        if (sub.evaluate().isNotEmpty) await d.tapFinder(sub);
        await d.emit(20);
        final clock = d.rectOf('board-clock');
        if (clock != null) {
          d.callout('Changes waiting to sync', clock.inflate(6));
          await d.point(clock.bottomCenter + const Offset(0, 14), seconds: 1.2);
        }
        offline = false;
        await d.ramp(6, 3);
        await d.endSeg();
        await d.seg('s111');
        await d.tapKey('quick-end-class');
        await d.emit(10);
        d.ev({'inset': ['teacher-navHome.jpg', 'student-navHome.jpg', 'parent-navHome.jpg'], 'dur': ((vo['s111'] ?? 8) * fps * 0.6).round(), 'delay': ((vo['s111'] ?? 8) * fps * 0.4).round()});
        if (find.text('End class').hitTestable().evaluate().isNotEmpty) await d.tapText('End class');
        await d.emit(20);
        await d.endSeg();
        d.endCard(vo['s112'] ?? 2.5);
      },
    };
    for (final e in chapters.entries) {
      if (want(e.key)) await e.value();
    }
    await d.finish();
    File('${env['LOG'] ?? '/tmp/kxd/director.log'}').writeAsStringSync(d.log.toString());
    offline = false;
    await tester.pumpWidget(const SizedBox());
    board.dispose();
    for (var i = 0; i < 100; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  }, timeout: const Timeout(Duration(minutes: 60)));
}
