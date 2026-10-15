// ZYNETIX Board product demo: the real board app (demo server, Soundarya Central School,
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
import 'package:zynetix_board/core/api_client.dart';
import 'package:zynetix_board/core/board_controller.dart';
import 'package:zynetix_board/core/kiosk/kiosk_pin.dart';
import 'package:zynetix_board/core/outbox_store.dart';
import 'package:zynetix_board/core/recording/recordings.dart';
import 'package:zynetix_board/demo/demo.dart';
import 'package:zynetix_board/demo/demo_server.dart';
import 'package:zynetix_board/l10n/l10n.dart';
import 'package:zynetix_board/main.dart';
import 'package:zynetix_ink/zynetix_ink.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:zynetix_board/features/ai/voice_input.dart';

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

/// ZYNETIX AI answers for this lesson, in the API's shape (the demo server only has
/// placeholders; a live board gets these from the ZYNETIX AI service).
Map<String, dynamic>? aiAnswer(String path) {
  Map<String, dynamic> wrap(String task, Map<String, dynamic> r) => {
    'task': task,
    'result': r,
    'meta': {
      'provider': 'zynetix',
      'model': 'zynetix-edu',
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
    '/v1/ai/lecture' => wrap('lecture', {
      'outline': ['What refraction is', 'Why light bends: speed changes', 'Laws of refraction', 'Refractive index n = sin i / sin r'],
      'explanation': 'Light travels at different speeds in different materials. When it crosses from air into glass it slows down, so it bends towards the normal.',
      'examples': ['A pencil looks bent in a glass of water', 'A pool looks shallower than it is'],
      'analogies': ['A shopping trolley rolling from a smooth floor onto carpet turns as one wheel slows first'],
      'boardPlan': ['Draw the slab and the normal', 'Mark i and r', 'Write n = sin i / sin r'],
      'activities': ['Trace rays through a glass slab with pins'],
      'recap': 'Light bends when its speed changes; n = sin i / sin r.',
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
      if (req.method == 'POST' && RegExp(r'^/v1/whiteboards/[^/]+/export$').hasMatch(req.url.path)) {
        return http.Response(jsonEncode({'path': '/s/refraction-10b.pdf'}), 200, headers: {'content-type': 'application/json'});
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
    await tester.pumpWidget(RepaintBoundary(key: rk, child: ZynetixBoardApp(controller: board)));
    for (var i = 0; i < 30; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    final vo = (jsonDecode(File(env['VO']!).readAsStringSync()) as Map).map((k, v) => MapEntry(k as String, (v as num).toDouble()));
    final hand = jsonDecode(File(env['HAND']!).readAsStringSync()) as Map<String, dynamic>;
    final words = (jsonDecode(File(env['WORDS']!).readAsStringSync()) as Map).map((k, v) => MapEntry(k as String, v as List<dynamic>));
    final script = jsonDecode(File(env['SCRIPT']!).readAsStringSync()) as Map<String, dynamic>;
    final voText = {for (final c in script['chapters'] as List) for (final sg in (c as Map)['segs'] as List) (sg as Map)['id'] as String: sg['vo'] as String};
    final d = Director(tester, rk, vo: vo, words: words, voText: voText, outPath: env['OUT'], previewDir: env['PREVIEW']);
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
    // Each feature lands on the word that names it: d.at(word) waits until just before it is
    // spoken (word timings: data/words.json), then the action runs; titles/spots are timed to it.
    Future<void> tool(String id, {String? filter, int frames = 8}) async {
      await d.drawerTool(id, filter: filter);
      await d.emit(frames);
    }

    Future<void> closeEverything() async {
      for (final nav in tester.stateList<NavigatorState>(find.byType(Navigator))) {
        nav.popUntil((r) => r.isFirst);
      }
      await d.emit(2);
    }

    Rect? textRect(String text) {
      final f = find.textContaining(text).hitTestable();
      return f.evaluate().isEmpty ? null : tester.getRect(f.first);
    }

    void hlText(String text, {String? label, double seconds = 2.0, bool zoom = true, double pad = 10}) {
      final r = textRect(text);
      if (r == null) {
        d.log.writeln('no text "$text" to highlight in ${d.frame}');
        return;
      }
      d.hl(r.inflate(pad), label: label, seconds: seconds, zoom: zoom);
    }

    // v3: one function per chapter; every beat marks its acts in the order of data/beats.json.
    Rect? rr(String key) => d.rectOf(key);
    Rect boardRect() => const Rect.fromLTWH(0, 0, 1920, 1080);
    Rect panelRect() => find.byKey(const Key('split-panel')).evaluate().isEmpty ? boardRect() : tester.getRect(find.byKey(const Key('split-panel')));
    Rect? dialogRect() => find.byType(Dialog).evaluate().isEmpty ? null : tester.getRect(find.byType(Dialog).first);
    WhiteboardController wbc() => tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas).first).controller;

    final chapters = <String, Future<void> Function()>{
      'open': () async {
        await d.beatStart('h4');
        await d.air(const Offset(260, 190), ms: 400, hEnd: 0.1);
        d.actOnPress(rect: const Rect.fromLTWH(120, 80, 1300, 260));
        await d.write(hand, 'title', const Offset(150, 110), 130, speed: 1.8);
        await d.beatEnd(settle: 0.8, rest: const Offset(1300, 420));
      },
      'c1': () async {
        await d.chapter(1, 'Walk in and sign in');
        await d.beatStart('b11');
        await d.air(d.centerOf('class-chip')! + const Offset(40, 160), ms: 500);
        d.actOnPress(rect: const Rect.fromLTWH(560, 300, 800, 480), label: 'Scan with the Teacher app');
        await d.tapKey('class-chip');
        await d.emit(6);
        final qr = find.byType(QrImageView);
        if (qr.evaluate().isNotEmpty) await d.point(tester.getRect(qr.first).centerLeft + const Offset(10, 40));
        await d.beatEnd(settle: 1.0);
        await d.beatStart('b12');
        final code = find.byKey(const Key('pairing-code'));
        d.hlAct(code.evaluate().isEmpty ? null : tester.getRect(code).inflate(10), label: '6-digit code');
        if (code.evaluate().isNotEmpty) await d.point(tester.getCenter(code) + const Offset(0, 30));
        await d.beatEnd(settle: 1.0);
        await d.beatStart('b13');
        offline = true;
        await d.closeDialog();
        d.actOnPress(rect: const Rect.fromLTWH(560, 300, 800, 480), label: 'Offline code');
        await d.tapKey('class-chip');
        await d.emit(8);
        final q2 = find.byKey(const Key('offline-qr'));
        if (q2.evaluate().isNotEmpty) await d.point(tester.getRect(q2).centerLeft + const Offset(10, 30));
        await d.beatEnd(settle: 1.0);
        offline = false;
        await d.closeDialog();
        await d.beatStart('b14');
        d.actOnPress(rect: const Rect.fromLTWH(0, 330, 1920, 480), label: 'Set a PIN');
        await d.tapKey('pin-offer-set');
        await d.emit(8);
        for (var round = 0; round < 2 && find.byKey(const Key('pin-dots')).evaluate().isNotEmpty; round++) {
          for (final digit in ['2', '5', '8', '0']) {
            await d.tapKey('pin-$digit');
          }
          if (find.byKey(const Key('pin-ok')).evaluate().isNotEmpty) await d.tapKey('pin-ok');
          await d.emit(6);
        }
        await d.beatEnd(settle: 0.4);
        await d.beatStart('b15');
        await d.tapKey('profile-button');
        await d.emit(4);
        d.actOnPress(rect: const Rect.fromLTWH(660, 240, 600, 560), label: 'Keys move every time');
        await d.tapKey('menu-lock');
        await d.emit(10);
        if (find.byKey(const Key('pin-dots')).evaluate().isEmpty && find.byKey(const Key('profile-lock')).evaluate().isNotEmpty) {
          final names = find.descendant(of: find.byKey(const Key('profile-lock')), matching: find.byType(InkWell));
          if (names.evaluate().isNotEmpty) await d.tapFinder(names.first);
          await d.emit(6);
        }
        await d.emit(8);
        for (final digit in ['2', '5', '8', '0']) {
          if (find.byKey(Key('pin-$digit')).evaluate().isNotEmpty) await d.tapKey('pin-$digit');
        }
        if (find.byKey(const Key('pin-ok')).evaluate().isNotEmpty) await d.tapKey('pin-ok');
        await d.beatEnd(settle: 0.6);
        await d.beatStart('b16');
        d.hlAct(rr('class-chip')?.inflate(8), label: 'From the timetable');
        await d.point(d.centerOf('class-chip')! + const Offset(0, 26));
        await d.beatEnd(settle: 1.2);
        await d.beatStart('b17');
        d.hlAct(rr('conceptVideoCard')?.inflate(10), label: 'English · Hindi · Kannada');
        await d.point(d.centerOf('conceptVideo-cv-cb2')!);
        await d.beatEnd(settle: 1.2);
        if (find.byKey(const Key('conceptVideoSkip')).evaluate().isNotEmpty) await d.tapKey('conceptVideoSkip');
        await d.beatStart('b18');
        await d.drawerFind('todays-plan');
        d.actOnPress(rect: const Rect.fromLTWH(960, 0, 960, 1080), label: 'Steps with timings');
        await d.tapKey('drawer-todays-plan');
        await d.emit(10);
        if (find.text('Start step timer').evaluate().isNotEmpty) await d.tapText('Start step timer');
        await d.beatEnd(settle: 0.8);
        await d.beatStart('b19');
        d.actOnPress(rect: panelRect(), label: 'Syllabus progress');
        await d.panelTab('books');
        await d.beatEnd(settle: 1.0);
        await d.beatStart('b1a');
        await d.tapKey('panel-close');
        await d.emit(4);
        d.actOnPress(rect: const Rect.fromLTWH(1500, 40, 420, 640), label: 'Profile menu');
        await d.tapKey('profile-button');
        await d.emit(6);
        await d.point(d.centerOf('menu-whiteboards')!);
        await d.point(d.centerOf('menu-recordings')!);
        await d.beatEnd(settle: 0.6);
        await d.dismissPopover();
      },
      'c2': () async {
        await d.chapter(2, 'Teach with ink');
        await d.beatStart('b21');
        d.actOnPress(rect: const Rect.fromLTWH(0, 380, 900, 700), label: 'Pen settings');
        await d.tapKey('tool-pen');
        await d.emit(3);
        if (find.byKey(const Key('pen-popover')).evaluate().isEmpty) await d.tapKey('tool-pen');
        await d.emit(4);
        final pop = rr('pen-popover') ?? const Rect.fromLTWH(0, 380, 900, 700);
        d.actOnPress(rect: pop);
        await d.tapKey('pen-colour-2');
        await d.emit(4);
        final th = rr('pen-thickness');
        if (th != null) {
          d.actOnPress(rect: pop);
          await d.drag([Offset(th.left + th.width * 0.12, th.center.dy), Offset(th.left + th.width * 0.3, th.center.dy)], 420);
        }
        await d.beatEnd(settle: 0.6);
        await d.dismissPopover();
        await d.beatStart('b22');
        await d.air(const Offset(1150, 300), ms: 400);
        d.actOnPress(rect: const Rect.fromLTWH(1040, 230, 860, 200));
        await d.write(hand, 'bends', const Offset(1100, 285), 66, speed: 1.9);
        await d.beatEnd(settle: 0.6);
        await d.beatStart('b23');
        await d.tapKey('tool-shapes');
        await d.emit(3);
        if (find.byKey(const Key('shape-rectangle')).evaluate().isEmpty) await d.tapKey('tool-shapes');
        await d.tapKey('shape-rectangle');
        await d.dismissPopover();
        d.actOnPress(rect: const Rect.fromLTWH(220, 360, 760, 420));
        await d.drag([const Offset(300, 450), const Offset(860, 700)], 520);
        d.clearSel();
        await d.beatEnd(settle: 0.8);
        await d.beatStart('b24');
        await d.tapKey('tool-shapes');
        await d.emit(3);
        if (find.byKey(const Key('shape-line')).evaluate().isEmpty) await d.tapKey('tool-shapes');
        await d.tapKey('shape-line');
        await d.dismissPopover();
        d.actOnPress(rect: const Rect.fromLTWH(220, 300, 760, 560));
        await d.drag([const Offset(520, 330), const Offset(520, 820)], 460);
        d.clearSel();
        await d.tapKey('tool-shapes');
        await d.emit(3);
        if (find.byKey(const Key('shape-arrow')).evaluate().isEmpty) await d.tapKey('tool-shapes');
        await d.tapKey('shape-arrow');
        await d.dismissPopover();
        d.actOnPress(rect: const Rect.fromLTWH(220, 300, 760, 560));
        await d.drag([const Offset(360, 330), const Offset(516, 446)], 380);
        d.clearSel();
        await d.drag([const Offset(524, 454), const Offset(640, 696)], 380);
        d.clearSel();
        await d.drag([const Offset(644, 704), const Offset(800, 820)], 380);
        d.clearSel();
        await d.beatEnd(settle: 0.6);
        await d.beatStart('b25');
        await d.tapKey('tool-pen');
        await d.emit(2);
        await d.dismissPopover();
        await d.air(const Offset(190, 330), ms: 380);
        d.actOnPress(rect: const Rect.fromLTWH(120, 260, 980, 560));
        await d.write(hand, 'air', const Offset(180, 300), 90, speed: 2.0);
        d.actOnPress(rect: const Rect.fromLTWH(120, 260, 980, 560));
        await d.write(hand, 'glass', const Offset(880, 520), 90, speed: 2.2);
        await d.write(hand, 'i', const Offset(470, 330), 80, speed: 2.0);
        await d.write(hand, 'r', const Offset(540, 470), 80, speed: 2.0);
        await d.beatEnd(settle: 0.6);
        await d.beatStart('b26');
        await d.tapKey('tool-highlighter');
        await d.emit(2);
        await d.dismissPopover();
        await d.air(const Offset(170, 222), ms: 400);
        d.actOnPress(rect: const Rect.fromLTWH(100, 90, 1240, 220));
        await d.drag([const Offset(160, 222), const Offset(700, 226), const Offset(1240, 220)], 900);
        await d.beatEnd(settle: 0.8);
        await d.beatStart('b27');
        await d.tapKey('tool-erase');
        await d.emit(2);
        await d.dismissPopover();
        await d.air(const Offset(170, 360), ms: 400);
        d.actOnPress(rect: const Rect.fromLTWH(100, 250, 700, 300));
        await d.drag([const Offset(170, 360), const Offset(230, 335), const Offset(290, 365)], 450);
        await d.beatEnd(settle: 0.8);
        await d.beatStart('b28');
        d.actOnPress(rect: const Rect.fromLTWH(100, 250, 700, 300), label: 'Undo');
        await d.tapKey('undo');
        await d.beatEnd(settle: 1.0);
        await d.beatStart('b29');
        await d.tapKey('tool-select');
        await d.emit(2);
        await d.dismissPopover();
        d.actOnPress(rect: const Rect.fromLTWH(80, 280, 1060, 600));
        await d.drag([for (var a = 0; a <= 36; a++) Offset(600 + 470 * _cos(a * 10.0), 585 + 268 * _sin(a * 10.0))], 1000);
        await d.emit(6);
        d.actOnPress(rect: const Rect.fromLTWH(80, 280, 1060, 600));
        await d.drag([const Offset(580, 575), const Offset(640, 590)], 600, holdMs: 120);
        await d.emit(4);
        await d.beatEnd(settle: 0.6);
        await d.tapAt(const Offset(1500, 330));
        await d.beatStart('b2a');
        await d.openDrawer();
        await d.emit(2);
        d.actOnPress(rect: rr('tools-drawer') ?? boardRect(), label: 'Geometry');
        await d.tapKey('drawer-filter-geometry');
        await d.emit(8);
        d.actOnPress(rect: const Rect.fromLTWH(480, 260, 960, 620), label: 'Protractor');
        await d.tapKey('drawer-protractor');
        await d.emit(8);
        await d.drag([const Offset(960, 560), const Offset(900, 520)], 700, holdMs: 100);
        await d.beatEnd(settle: 0.8);
        d.snap('ink');
      },
      'c3': () async {
        await d.chapter(3, 'Smart ink and maths');
        await d.beatStart('b31');
        await d.tapKey('tool-ai-pen');
        await d.emit(2);
        await d.dismissPopover();
        hw.queue
          ..clear()
          ..add('glass slab');
        await d.write(hand, 'slab', const Offset(1110, 400), 74, speed: 2.2);
        bool converted() => wbc().elements.whereType<TextElement>().any((e) => e.text.contains('glass'));
        for (var i = 0; i < 60 && !converted(); i++) {
          await d.emit();
        }
        // the act is the frame the ink turns into text
        d.log.writeln('ai pen converted: ${converted()} at ${d.frame}');
        d.actNow(rect: const Rect.fromLTWH(1040, 340, 700, 200), label: 'Handwriting to text');
        await d.emit();
        await d.beatEnd(settle: 1.0);
        await d.beatStart('b32');
        await d.tapKey('tool-pen');
        await d.emit(2);
        if (find.byKey(const Key('pen-popover')).evaluate().isEmpty) await d.tapKey('tool-pen');
        await d.emit(2);
        await d.tapKey('pen-mode-shapeAi');
        await d.dismissPopover();
        await d.stroke([
          for (var a = 0; a <= 380; a += 8) (Offset(1300 + (70 + 6 * _sin(a * 3.0)) * _cos(a - 90.0), 640 + (62 + 5 * _cos(a * 2.0)) * _sin(a - 90.0)), a * 2.6),
        ]);
        d.actNow(rect: const Rect.fromLTWH(1120, 500, 360, 280));
        await d.emit();
        await d.beatEnd(settle: 1.0);
        await d.beatStart('b33');
        await d.tapKey('tool-insert');
        await d.emit(4);
        await d.tapKey('insert-equation');
        await d.emit(6);
        final tex = find.descendant(of: find.byType(Dialog), matching: find.byType(TextField));
        if (tex.evaluate().isNotEmpty) {
          await d.tapFinder(tex.last);
          await d.type(tex.last, r'n = \frac{\sin i}{\sin r}', charsPerFrame: 3);
          await d.emit(4);
          final put = find.text('Put on the board').hitTestable();
          d.actOnPress(rect: const Rect.fromLTWH(1300, 0, 620, 300), label: "Snell's law");
          if (put.evaluate().isNotEmpty) await d.tapFinder(put.first);
        }
        await d.beatEnd(settle: 1.2);
        await d.beatStart('b34');
        await d.aiTab();
        await d.tapKey('ai-tool-math');
        await d.emit(4);
        final mi = find.byKey(const Key('math-input'));
        if (mi.evaluate().isNotEmpty) {
          await d.tapFinder(mi);
          await d.type(mi, '2x + 5 = 17', charsPerFrame: 2);
          d.actOnPress(rect: panelRect(), label: 'Every step');
          await d.tapKey('math-solve');
        }
        await d.beatEnd(settle: 1.2);
        d.snap('ai');
        await d.beatStart('b35');
        await d.tapKey('panel-close');
        await d.emit(2);
        await d.openDrawer();
        await d.emit(2);
        final dr = rr('tools-drawer') ?? boardRect();
        for (final (f, label) in [('science', 'Science'), ('maths', 'Maths'), ('cs', 'Computer science')]) {
          d.actOnPress(rect: dr, label: label);
          await d.tapKey('drawer-filter-$f');
          await d.emit(14);
        }
        await d.beatEnd(settle: 0.6);
        if (find.byKey(const Key('drawer-filter-all')).evaluate().isNotEmpty) await d.tapKey('drawer-filter-all');
      },
      'c4': () async {
        await d.chapter(4, 'Pages and saving');
        await d.beatStart('b41');
        await d.dismissPopover();
        final before = wbc().pageCount;
        d.actOnPress(rect: const Rect.fromLTWH(960, 540, 960, 540), label: 'Add page');
        await d.tapKey('add-page');
        await d.emit(6);
        if (wbc().pageCount == before) {
          d.log.writeln('add-page tap missed; adding');
          wbc().addPage();
          await d.emit(2);
        }
        await d.tapKey('tool-pen');
        await d.emit(2);
        await d.dismissPopover();
        await d.write(hand, 'snell', const Offset(220, 200), 110, speed: 2.8);
        await d.beatEnd(settle: 0.4);
        await d.beatStart('b42');
        d.actOnPress(rect: const Rect.fromLTWH(480, 560, 960, 520), label: 'Page overview');
        await d.tapKey('page-overview');
        await d.emit(10);
        await d.beatEnd(settle: 1.0);
        await d.tapKey('overview-close');
        await d.emit(4);
        await d.beatStart('b43');
        await d.tapKey('board-menu');
        await d.emit(4);
        await d.tapKey('tool-theme');
        await d.emit(6);
        for (final b in ['ruled', 'grid', 'chalkboard']) {
          d.actOnPress(rect: boardRect());
          if (find.byKey(Key('bg-$b')).evaluate().isNotEmpty) await d.tapKey('bg-$b');
          await d.emit(16);
        }
        await d.tapKey('bg-plain');
        await d.beatEnd(settle: 0.4);
        await d.dismissPopover();
        await d.beatStart('b44');
        d.actOnPress(rect: const Rect.fromLTWH(1000, 0, 920, 1080), label: 'Share');
        await d.tapKey('quick-share');
        await d.emit(24);
        Rect? tr(String t) {
          final f = find.textContaining(t).hitTestable();
          return f.evaluate().isEmpty ? null : tester.getRect(f.first).inflate(12);
        }

        d.hlAct(tr('WhatsApp'), label: 'WhatsApp');
        d.hlAct(tr('Email'), label: 'Email');
        await d.beatEnd(settle: 1.0);
        await closeEverything();
      },
      'c5': () async {
        await d.chapter(5, 'Bring the lesson to life');
        await d.beatStart('b51');
        await d.panelTab('model3d');
        await d.emit(4);
        final msf = find.byWidgetPredicate((w) => w is TextField && (w.decoration?.hintText ?? '').contains('3D'));
        if (msf.evaluate().isNotEmpty) {
          await d.tapFinder(msf.first);
          await d.type(msf.first, 'cone', charsPerFrame: 1);
          await d.emit(4);
        }
        final wm = find.text('Frustum of a cone').hitTestable();
        d.actOnPress(rect: panelRect());
        if (wm.evaluate().isNotEmpty) await d.tapFinder(wm.first);
        await d.emit(12);
        d.actOnPress(rect: const Rect.fromLTWH(1000, 60, 900, 640));
        await d.drag([const Offset(1450, 330), const Offset(1270, 370)], 900);
        await d.emit(4);
        await d.drag([const Offset(1350, 330), const Offset(1570, 270)], 900);
        await d.beatEnd(settle: 0.6);
        await d.beatStart('b52');
        await d.panelTab('labs');
        await d.emit(6);
        d.actOnPress(rect: panelRect());
        await d.tapText('Refraction through a glass slab');
        await d.emit(14);
        d.actOnPress(rect: const Rect.fromLTWH(1000, 120, 920, 620));
        await d.drag([const Offset(1513, 262), const Offset(1460, 250), const Offset(1390, 268)], 1300, holdMs: 120);
        await d.emit(4);
        await d.drag([const Offset(1390, 268), const Offset(1470, 255)], 900, holdMs: 80);
        await d.beatEnd(settle: 0.6);
        await d.beatStart('b53');
        for (final (t, label) in [('sims', 'PhET simulations'), ('animations', 'Animations'), ('videos', 'Concept videos'), ('kit', 'Science kit')]) {
          final tab = find.byKey(Key('panel-tab-$t'));
          if (tab.evaluate().isNotEmpty) {
            await tester.ensureVisible(tab);
            await d.emit(3);
          }
          d.tileOnPress(panelRect(), label: label);
          await d.tapKey('panel-tab-$t', visibleFirst: false);
          await d.emit(30);
        }
        await d.beatEnd(settle: 0.4);
        await d.beatStart('b54');
        await d.tapKey('panel-close');
        await d.emit(2);
        d.actOnPress(rect: const Rect.fromLTWH(560, 0, 760, 1080), label: 'Add menu');
        await d.tapKey('tool-insert');
        await d.emit(6);
        for (final (k, label) in [('insert-cat-pdf', 'PDF'), ('insert-cat-ppt', 'PowerPoint'), ('insert-picture', 'Pictures'), ('insert-note', 'Sticky notes')]) {
          d.hlAct(rr(k)?.inflate(6), label: label);
        }
        await d.point(d.centerOf('insert-note') ?? const Offset(900, 500));
        await d.beatEnd(settle: 1.0);
        await d.dismissPopover();
        await d.beatStart('b55');
        for (final (t, label) in [('web', 'Safe browser'), ('camera', 'Document camera')]) {
          if (find.byKey(const Key('split-panel')).evaluate().isEmpty) {
            await d.tapKey('panel-ai');
            await d.emit(10);
          }
          final tab = find.byKey(Key('panel-tab-$t'));
          if (tab.evaluate().isNotEmpty) {
            await tester.ensureVisible(tab);
            await d.emit(3);
          }
          d.tileOnPress(panelRect(), label: label);
          await d.tapKey('panel-tab-$t', visibleFirst: false);
          await d.emit(30);
        }
        await d.beatEnd(settle: 0.4);
        await closeEverything();
      },
      'c6': () async {
        await d.chapter(6, 'Your AI teaching assistant');
        await d.beatStart('b61');
        await d.aiTab();
        final ask = find.byKey(const Key('ai-ask'));
        if (ask.evaluate().isNotEmpty) {
          await d.tapFinder(ask);
          final tf = find.descendant(of: ask, matching: find.byType(TextField));
          await d.type(tf.evaluate().isNotEmpty ? tf : ask, 'Why does a pencil look bent in a glass of water?', charsPerFrame: 3);
          d.actOnPress(rect: panelRect(), label: 'Answer in seconds');
          await d.tapKey('ai-ask-send');
          await d.emit(12);
        }
        await d.beatEnd(settle: 1.0);
        await d.beatStart('b62');
        d.hlAct(rr('ai-sources')?.inflate(8), label: 'NCERT source');
        await d.point(d.centerOf('ai-sources') ?? const Offset(1400, 500));
        await d.beatEnd(settle: 1.0);
        await d.beatStart('b63');
        if (find.byKey(const Key('ai-explanation-close')).evaluate().isNotEmpty) await d.tapKey('ai-explanation-close');
        await d.tapKey('ai-tool-lessonPlan');
        await d.emit(4);
        d.actOnPress(rect: panelRect(), label: 'AI lesson builder');
        await d.tapKey('lesson-generate');
        await d.emit(14);
        await d.beatEnd(settle: 0.6);
        await d.beatStart('b64');
        Rect? tr(String t) {
          final f = find.textContaining(t).hitTestable();
          return f.evaluate().isEmpty ? null : tester.getRect(f.first).inflate(10);
        }

        d.hlAct(tr('OBJECTIVES'), label: 'Objectives');
        d.hlAct(tr('Hook:'), label: 'Steps');
        d.hlAct(tr('Virtual lab'), label: 'Activities');
        d.hlAct(tr('Exit ticket'), label: 'Exit ticket');
        await d.point(tester.getCenter(find.byKey(const Key('lesson-plan')).evaluate().isEmpty ? find.byType(Scaffold).first : find.byKey(const Key('lesson-plan'))));
        await d.beatEnd(settle: 1.0);
        d.snap('lesson');
        await d.beatStart('b65');
        for (final (tool, gen, label) in [('quiz', 'quiz-generate', 'Quick quiz'), ('homework', 'homework-generate', 'Homework'), ('lecture', 'lecture-generate', 'Lecture notes'), ('readBoard', null, 'Read board')]) {
          for (var i = 0; i < 3 && find.byKey(const Key('panel-back')).hitTestable().evaluate().isNotEmpty && find.byKey(Key('ai-tool-$tool')).hitTestable().evaluate().isEmpty; i++) {
            await d.tapKey('panel-back');
            await d.emit(2);
          }
          if (gen == null) {
            d.tileOnPress(panelRect(), label: label);
            await d.tapKey('ai-tool-$tool');
          } else {
            await d.tapKey('ai-tool-$tool');
            await d.emit(4);
            d.tileOnPress(panelRect(), label: label);
            await d.tapKey(gen);
          }
          await d.emit(30);
        }
        await d.beatEnd(settle: 0.4);
        await closeEverything();
      },
      'c7': () async {
        await d.chapter(7, 'The whole class answers');
        await d.beatStart('b71');
        d.actOnPress(rect: const Rect.fromLTWH(480, 140, 960, 760), label: "Tap who's absent");
        await d.tapKey('attendance-chip');
        await d.emit(6);
        for (final n in ['Darshan Gowda', 'Kiran Patil']) {
          if (find.text(n).hitTestable().evaluate().isNotEmpty) await d.tapText(n);
        }
        final sub = find.byKey(const Key('attendance-submit'));
        if (sub.evaluate().isNotEmpty) await d.tapFinder(sub);
        await d.beatEnd(settle: 0.6);
        await d.beatStart('b72');
        await d.drawerTool('ask-class');
        await d.emit(6);
        final q = find.byKey(const Key('ask-question'));
        if (q.evaluate().isNotEmpty) {
          await d.tapFinder(q);
          final tf = find.descendant(of: q, matching: find.byType(TextField));
          await d.type(tf.evaluate().isNotEmpty ? tf : q, 'Entering glass, a ray of light bends…', charsPerFrame: 3);
        }
        d.actOnPress(rect: const Rect.fromLTWH(0, 40, 760, 430), label: 'Live question');
        await d.tapKey('ask-start');
        await d.emit(8);
        await d.beatEnd(settle: 0.6);
        final right = (lastPollBody?['correct'] as String?) ?? '0';
        await d.beatStart('b73');
        d.actNow(rect: const Rect.fromLTWH(0, 40, 760, 430));
        await answerPoll(server, d, [right, right, '1'], gap: 4);
        await d.emit(20);
        d.actNow(rect: const Rect.fromLTWH(0, 40, 760, 430));
        await answerPoll(server, d, [right, right, '2', right, right, right], gap: 3);
        await d.beatEnd(settle: 0.6);
        d.snap('poll');
        await d.beatStart('b74');
        d.hlAct(rr('poll-scan')?.inflate(8), label: 'Scan answer cards');
        await answerPoll(server, d, [right, '1', right, '3'], gap: 4);
        await d.beatEnd(settle: 0.6);
        await d.beatStart('b75');
        final rev = find.byKey(const Key('poll-reveal')).evaluate().isNotEmpty ? 'poll-reveal' : 'poll-end';
        d.actOnPress(rect: const Rect.fromLTWH(0, 40, 760, 430), label: 'Right answer');
        await d.tapKey(rev);
        await d.emit(8);
        if (rev == 'poll-reveal' && find.byKey(const Key('poll-end')).evaluate().isNotEmpty) await d.tapKey('poll-end');
        await d.beatEnd(settle: 0.8);
        if (find.byKey(const Key('poll-dismiss')).evaluate().isNotEmpty) await d.tapKey('poll-dismiss');
        await d.beatStart('b76');
        await d.drawerTool('ask-class');
        await d.emit(6);
        await d.tapKey('ask-word-cloud');
        final q2 = find.byKey(const Key('ask-question'));
        if (q2.evaluate().isNotEmpty) {
          await d.tapFinder(q2);
          final tf = find.descendant(of: q2, matching: find.byType(TextField));
          await d.type(tf.evaluate().isNotEmpty ? tf : q2, 'One word: what does light do in glass?', charsPerFrame: 3);
        }
        d.actOnPress(rect: const Rect.fromLTWH(0, 40, 760, 430));
        await d.tapKey('ask-start');
        await d.emit(4);
        await answerPoll(server, d, ['bends', 'refracts'], gap: 5);
        await d.emit(10);
        d.actNow(rect: const Rect.fromLTWH(0, 40, 760, 430));
        await answerPoll(server, d, ['slows down', 'bends', 'changes direction', 'bends', 'slows down', 'towards normal', 'refracts', 'bends', 'slows down', 'refracts'], gap: 3);
        await d.beatEnd(settle: 0.6);
        if (find.byKey(const Key('poll-end')).evaluate().isNotEmpty) await d.tapKey('poll-end');
        if (find.byKey(const Key('poll-dismiss')).evaluate().isNotEmpty) await d.tapKey('poll-dismiss');
        await d.beatStart('b77');
        Future<void> tileTool(String id, String label, {Rect? rect}) async {
          await d.drawerFind(id, filter: 'classroom');
          d.tileOnPress(rect ?? boardRect(), label: label);
          await d.tapKey('drawer-$id');
          await d.emit(8);
        }

        await tileTool('toolkit-picker', 'Random picker', rect: const Rect.fromLTWH(1280, 0, 640, 360));
        if (find.text('Pick').hitTestable().evaluate().isNotEmpty) await d.tapText('Pick');
        await d.emit(24);
        await d.closeOverlayTool();
        await tileTool('toolkit-timer', 'Timer', rect: const Rect.fromLTWH(1280, 0, 640, 360));
        if (find.text('Start').hitTestable().evaluate().isNotEmpty) await d.tapText('Start');
        await d.emit(24);
        await d.closeOverlayTool();
        await tileTool('scoreboard', 'Scoreboard', rect: const Rect.fromLTWH(960, 0, 960, 540));
        if (find.byKey(const Key('score-add-team')).evaluate().isNotEmpty) await d.tapKey('score-add-team');
        await d.emit(20);
        await tileTool('badges', 'Badges', rect: const Rect.fromLTWH(960, 0, 960, 540));
        await d.emit(24);
        await d.beatEnd(settle: 0.3);
        await d.beatStart('b78');
        await tileTool('group-maker', 'Group maker', rect: const Rect.fromLTWH(960, 0, 960, 540));
        if (find.byKey(const Key('groups-make')).evaluate().isNotEmpty) await d.tapKey('groups-make');
        await d.emit(24);
        await tileTool('zones', 'Multi-user zones');
        if (find.text('2 zones').hitTestable().evaluate().isNotEmpty) await d.tapText('2 zones');
        await d.emit(24);
        await d.beatEnd(settle: 0.3);
      },
      'c8': () async {
        await d.chapter(8, 'Homework and marking');
        await d.beatStart('b81');
        await d.aiTab();
        await d.tapKey('ai-tool-homework');
        await d.emit(4);
        d.actOnPress(rect: panelRect(), label: 'Homework AI');
        await d.tapKey(find.byKey(const Key('homework-generate')).evaluate().isNotEmpty ? 'homework-generate' : 'homework-regenerate');
        await d.emit(14);
        await d.beatEnd(settle: 0.6);
        await d.beatStart('b82');
        d.actOnPress(rect: const Rect.fromLTWH(400, 860, 1200, 220), label: 'Sent');
        await d.tapKey('homework-send');
        await d.emit(6);
        if (find.byKey(const Key('send-homework-confirm')).evaluate().isNotEmpty) await d.tapKey('send-homework-confirm');
        await d.emit(8);
        await d.beatEnd(settle: 0.8);
        await closeEverything();
        await d.beatStart('b83');
        await d.idle(2.0, rest: const Offset(1400, 700));
        await d.beatEnd(settle: 0.2);
        await d.beatStart('b84');
        await d.drawerTool('ask-class');
        await d.emit(8);
        final cos = find.textContaining(RegExp(r'^CO\d')).hitTestable();
        d.actOnPress(rect: dialogRect() ?? boardRect(), label: 'Course outcome (OBE)');
        if (cos.evaluate().isNotEmpty) await d.tapFinder(cos.first);
        await d.emit(6);
        await d.beatEnd(settle: 0.8);
        await closeEverything();
      },
      'c9': () async {
        await d.chapter(9, 'Record and share the screen');
        await d.beatStart('b91');
        d.actOnPress(rect: const Rect.fromLTWH(480, 240, 960, 600), label: 'Consent first');
        await d.tapKey('record');
        await d.emit(8);
        if (find.byKey(const Key('rec-notice-start')).evaluate().isNotEmpty) await d.tapKey('rec-notice-start');
        await d.emit(4);
        await d.beatEnd(settle: 0.6);
        await d.beatStart('b92');
        final bar = rr('rec-marker')?.inflate(140) ?? const Rect.fromLTWH(0, 800, 700, 280);
        d.actOnPress(rect: bar, label: 'Chapter marker');
        await d.tapKey('rec-marker');
        await d.emit(10);
        d.actOnPress(rect: bar, label: 'Important moment');
        await d.tapKey('rec-marker', hold: true);
        await d.emit(6);
        await d.beatEnd(settle: 0.6);
        await d.beatStart('b93');
        await d.tapKey('rec-stop');
        await d.emit(6);
        if (find.byKey(const Key('rec-save')).evaluate().isNotEmpty) await d.tapKey('rec-save');
        await d.emit(2);
        await d.tapKey('profile-button');
        await d.emit(3);
        d.actOnPress(rect: const Rect.fromLTWH(480, 140, 960, 760), label: 'Recordings');
        await d.tapKey('menu-recordings');
        await d.emit(8);
        await d.beatEnd(settle: 0.8);
        await closeEverything();
        await d.beatStart('b94');
        await d.drawerFind('live-captions');
        d.tileOnPress(const Rect.fromLTWH(320, 640, 1280, 440), label: 'Live captions');
        await d.tapKey('drawer-live-captions');
        await d.emit(4);
        const line = 'When light enters the glass slab it slows down and bends towards the normal';
        final words = line.split(' ');
        for (var i = 1; i <= words.length; i++) {
          voice.say(words.take(i).join(' '), done: i == words.length);
          await d.emit(2);
        }
        if (find.byKey(const Key('captions-stop')).evaluate().isNotEmpty) await d.tapKey('captions-stop');
        await d.emit(2);
        if (find.byKey(const Key('split-panel')).evaluate().isEmpty) {
          await d.tapKey('panel-ai');
          await d.emit(10);
        }
        final ct = find.byKey(const Key('panel-tab-cast'));
        if (ct.evaluate().isNotEmpty) {
          await tester.ensureVisible(ct);
          await d.emit(3);
        }
        d.tileOnPress(panelRect(), label: 'Cast from phones');
        await d.tapKey('panel-tab-cast', visibleFirst: false);
        await d.emit(24);
        await d.tapKey('panel-close');
        await d.tapKey('profile-button');
        await d.emit(3);
        d.tileOnPress(const Rect.fromLTWH(480, 140, 960, 760), label: 'Second display');
        await d.tapKey('menu-projector');
        await d.emit(24);
        await closeEverything();
        await d.tapKey('board-menu');
        await d.emit(2);
        final fr = rr('menu-freeze') ?? const Rect.fromLTWH(0, 300, 400, 100);
        d.tileNow(fr.inflate(220), label: 'Freeze screen');
        await d.point(d.centerOf('menu-freeze') ?? const Offset(100, 400));
        await d.emit(20);
        await d.beatEnd(settle: 0.3);
        await d.dismissPopover();
      },
      'c10': () async {
        await d.chapter(10, 'Comfortable for everyone');
        await d.beatStart('b101');
        await d.tapKey('board-menu');
        await d.emit(3);
        await d.tapKey('menu-eye-comfort');
        await d.emit(6);
        d.actOnPress(rect: boardRect(), label: 'Eye comfort');
        if (find.byKey(const Key('eye-protection')).evaluate().isNotEmpty) await d.tapKey('eye-protection');
        await d.emit(14);
        if (find.byKey(const Key('eye-protection')).evaluate().isNotEmpty) await d.tapKey('eye-protection');
        await d.beatEnd(settle: 0.3);
        await d.dismissPopover();
        await d.beatStart('b102');
        await d.tapKey('board-menu');
        await d.emit(3);
        d.actOnPress(rect: boardRect());
        await d.tapKey('menu-theme-toggle');
        await d.emit(24);
        await d.tapKey('board-menu');
        await d.emit(3);
        await d.tapKey('menu-theme-toggle');
        await d.beatEnd(settle: 0.3);
        await d.beatStart('b103');
        await d.tapKey('board-menu');
        await d.emit(3);
        await d.tapKey('menu-settings');
        await d.emit(6);
        for (final (lang, label) in [('hi', 'हिंदी'), ('kn', 'ಕನ್ನಡ')]) {
          var lf = find.byKey(Key('board-language-$lang')).hitTestable();
          if (lf.evaluate().isEmpty) {
            await closeEverything();
            await d.tapKey('board-menu');
            await d.emit(3);
            await d.tapKey('menu-settings');
            await d.emit(6);
            lf = find.byKey(Key('board-language-$lang')).hitTestable();
          }
          d.actOnPress(rect: boardRect(), label: label);
          if (lf.evaluate().isNotEmpty) await d.tapFinder(lf.first);
          await d.emit(20);
        }
        await d.beatEnd(settle: 0.3);
        await closeEverything();
        board.setBoardLanguage(BoardLanguage.en);
        board.setTheme(BoardTheme.light);
        await d.emit(2);
        await d.beatStart('b104');
        await d.drawerFind('voice-commands');
        d.tileOnPress(const Rect.fromLTWH(480, 140, 960, 760), label: 'Voice commands');
        await d.tapKey('drawer-voice-commands');
        await d.emit(6);
        voice.say('next page');
        await d.emit(4);
        voice.say('next page', done: true);
        await d.emit(14);
        await closeEverything();
        if (find.byKey(const Key('previous-page')).evaluate().isNotEmpty) await d.tapKey('previous-page');
        await d.drawerFind('read-aloud');
        d.tileOnPress(const Rect.fromLTWH(960, 0, 960, 1080), label: 'Immersive reader');
        await d.tapKey('drawer-read-aloud');
        await d.emit(24);
        if (find.byKey(const Key('reader-close')).evaluate().isNotEmpty) await d.tapKey('reader-close');
        await closeEverything();
        await d.drawerFind('toolkit-curtain');
        d.tileOnPress(boardRect(), label: 'Screen shade');
        await d.tapKey('drawer-toolkit-curtain');
        await d.emit(24);
        if (find.text('Remove shade').hitTestable().evaluate().isNotEmpty) await d.tapText('Remove shade');
        await d.drawerFind('toolkit-spotlight');
        d.tileOnPress(boardRect(), label: 'Spotlight');
        await d.tapKey('drawer-toolkit-spotlight');
        await d.emit(24);
        if (find.byKey(const Key('spotlight-end')).hitTestable().evaluate().isNotEmpty) await d.tapKey('spotlight-end');
        await d.beatEnd(settle: 0.3);
        await d.beatStart('b105');
        await d.drawerFind('magnifier');
        await d.tapKey('drawer-magnifier');
        await d.emit(8);
        // the act is the lens itself fading in, not the drawer closing
        d.actNow(rect: const Rect.fromLTWH(0, 0, 1200, 700), label: 'Magnifier');
        final mg = d.rectOf('magnifier');
        if (mg != null) await d.drag([mg.center, mg.center + const Offset(160, 60)], 700, holdMs: 80);
        await d.beatEnd(settle: 0.6);
        if (find.byKey(const Key('magnifier-close')).hitTestable().evaluate().isNotEmpty) await d.tapKey('magnifier-close');
        await closeEverything();
      },
      'c11': () async {
        await d.chapter(11, 'Safe and managed');
        await d.beatStart('b111');
        await d.tapKey('board-menu');
        await d.emit(3);
        d.actOnPress(rect: const Rect.fromLTWH(960, 0, 960, 1080), label: 'Simple mode');
        await d.tapKey('menu-settings');
        await d.emit(10);
        final simple = find.textContaining('Simple board').hitTestable();
        if (simple.evaluate().isNotEmpty) await d.point(tester.getCenter(simple.first));
        await d.beatEnd(settle: 0.6);
        await closeEverything();
        await d.beatStart('b112');
        await d.tapKey('board-menu');
        await d.emit(3);
        d.actOnPress(rect: const Rect.fromLTWH(960, 0, 960, 1080), label: 'Customise toolbar');
        await d.tapKey('menu-customise-toolbar');
        await d.emit(10);
        await d.beatEnd(settle: 0.6);
        await closeEverything();
        await d.beatStart('b113');
        await d.drawerFind('touch-lock');
        d.tileNow((rr('drawer-touch-lock') ?? const Rect.fromLTWH(300, 300, 200, 120)).inflate(260), label: 'Touch lock');
        await d.point(d.centerOf('drawer-touch-lock') ?? const Offset(600, 500));
        await d.emit(20);
        await d.drawerFind('diagnostics');
        d.tileOnPress(const Rect.fromLTWH(960, 0, 960, 1080), label: 'Diagnostics');
        await d.tapKey('drawer-diagnostics');
        await d.emit(24);
        await d.beatEnd(settle: 0.3);
        await closeEverything();
      },
      'c12': () async {
        await d.chapter(12, 'Offline and in sync');
        await d.beatStart('b121');
        offline = true;
        await d.tapKey('attendance-chip');
        await d.emit(4);
        final sub = find.byKey(const Key('attendance-submit'));
        final who = find.text('Aditi Rao').hitTestable();
        d.actOnPress(rect: boardRect(), label: 'Saved offline');
        if (who.evaluate().isNotEmpty) await d.tapFinder(who.first);
        await d.emit(4);
        if (sub.evaluate().isNotEmpty) await d.tapFinder(sub);
        await d.emit(10);
        d.hlAct(rr('board-clock')?.inflate(10), label: 'Waiting to sync');
        await d.point(d.centerOf('board-clock')! + const Offset(0, 30));
        offline = false;
        await d.ramp(2, 3);
        await d.beatEnd(settle: 0.4);
        d.snap('sync');
        await d.beatStart('b122');
        d.actOnPress(rect: const Rect.fromLTWH(480, 140, 960, 760), label: 'End class');
        await d.tapKey('quick-end-class');
        await d.emit(8);
        if (find.text('End class').hitTestable().evaluate().isNotEmpty) await d.tapText('End class');
        await d.emit(10);
        await d.beatEnd(settle: 0.6);
        await d.beatStart('b123');
        await d.idle(2.0, rest: const Offset(1400, 700));
        await d.beatEnd(settle: 0.2);
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
  }, timeout: Timeout.none);
}
