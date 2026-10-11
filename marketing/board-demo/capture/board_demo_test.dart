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
import 'package:qr_flutter/qr_flutter.dart';
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

    final chapters = <String, Future<void> Function()>{
      'open': () async {
        await d.seg('s00');
        d.focus(const Rect.fromLTWH(120, 80, 1300, 300), seconds: 7);
        d.titleAt('real', 'The real board app');
        d.titleAt('stylus', 'Driven by a stylus');
        await d.air(const Offset(300, 200), ms: 400, hEnd: 0.1);
        await d.write(hand, 'title', const Offset(150, 110), 130, speed: 1.8);
        await d.endSeg(rest: const Offset(1300, 420));
      },
      'c1': () async {
        await d.chapter(1, 'Sign in and start the class');
        await d.seg('s10');
        await d.at('signing', lead: 0.6);
        await d.tapKey('class-chip');
        await d.emit(8);
        await d.at('qr', title: 'Scan the QR');
        final qr = find.byType(QrImageView);
        if (qr.evaluate().isNotEmpty) {
          d.hlFinder(qr, label: 'Scan with the Teacher app', seconds: 2.6);
          await d.point(tester.getRect(qr.first).centerLeft + const Offset(10, 40));
        }
        await d.at('six', title: 'Or type the code');
        final code = find.byKey(const Key('pairing-code'));
        d.hlFinder(code, label: '6-digit code', seconds: 2.4);
        if (code.evaluate().isNotEmpty) await d.point(tester.getCenter(code) + const Offset(0, 30));
        await d.at('passwords', title: 'No passwords');
        await d.endSeg();
        await d.seg('s11');
        offline = true;
        await d.closeDialog();
        await d.tapKey('class-chip');
        await d.emit(8);
        await d.at('signed', title: 'Signed offline code');
        final q2 = find.byKey(const Key('offline-qr'));
        d.hlFinder(q2, label: 'Works without internet', seconds: 3.2);
        if (q2.evaluate().isNotEmpty) await d.point(tester.getRect(q2).centerLeft + const Offset(10, 30));
        await d.at('verifies');
        d.hlKey('offline-note', label: 'Valid for 15 minutes', seconds: 2.4);
        await d.endSeg();
        offline = false;
        await d.closeDialog();
        await d.seg('s12');
        d.titleAt('pin', 'Personal PIN');
        await d.tapKey('pin-offer-set');
        await d.emit(9);
        for (var round = 0; round < 2 && find.byKey(const Key('pin-dots')).evaluate().isNotEmpty; round++) {
          for (final digit in ['2', '5', '8', '0']) {
            await d.tapKey('pin-$digit');
          }
          if (find.byKey(const Key('pin-ok')).evaluate().isNotEmpty) await d.tapKey('pin-ok');
          await d.emit(6);
        }
        await d.at('unlocks', lead: 1.6);
        await d.tapKey('profile-button');
        await d.emit(4);
        await d.tapKey('menu-lock');
        await d.emit(10);
        if (find.byKey(const Key('pin-dots')).evaluate().isEmpty && find.byKey(const Key('profile-lock')).evaluate().isNotEmpty) {
          final names = find.descendant(of: find.byKey(const Key('profile-lock')), matching: find.byType(InkWell));
          if (names.evaluate().isNotEmpty) await d.tapFinder(names.first);
          await d.emit(6);
        }
        await d.at('shuffled', title: 'Shuffled keypad');
        if (find.byKey(const Key('pin-dots')).evaluate().isNotEmpty) {
          final pad = tester.getRect(find.byKey(const Key('pin-1'))).expandToInclude(tester.getRect(find.byKey(const Key('pin-0'))));
          d.hl(pad.inflate(40), label: 'Keys move every time', seconds: 2.0);
          for (final digit in ['2', '5', '8', '0']) {
            await d.tapKey('pin-$digit');
          }
          if (find.byKey(const Key('pin-ok')).evaluate().isNotEmpty) await d.tapKey('pin-ok');
        }
        await d.emit(6);
        await d.endSeg();
        await d.seg('s13');
        await d.at('timetable', title: 'From the timetable');
        d.hlKey('class-chip', label: 'Class 10 B · Science', seconds: 2.6);
        await d.point(d.centerOf('class-chip')! + const Offset(0, 26));
        await d.at('refraction');
        d.hlKey('ctx-chip', label: 'Refraction through a glass slab', seconds: 2.2);
        await d.at('concept', title: 'Concept videos');
        d.focus(d.rectOf('conceptVideoCard')!.inflate(40), seconds: 6);
        await d.at('english');
        d.hlKey('conceptVideo-cv-cb1', label: 'English', seconds: 1.4, zoom: false);
        await d.point(d.centerOf('conceptVideo-cv-cb1')!);
        await d.at('hindi');
        d.hlKey('conceptVideo-cv-cb2', label: 'Hindi', seconds: 1.3, zoom: false);
        await d.point(d.centerOf('conceptVideo-cv-cb2')!);
        await d.at('kannada');
        d.hlKey('conceptVideo-cv-cb3', label: 'Kannada', seconds: 1.6, zoom: false);
        await d.point(d.centerOf('conceptVideo-cv-cb3')!);
        await d.endSeg();
        if (find.byKey(const Key('conceptVideoSkip')).evaluate().isNotEmpty) await d.tapKey('conceptVideoSkip');
        await d.seg('s14');
        await tool('todays-plan', frames: 8);
        await d.at('plan', nth: 1, title: "Today's plan from the ERP");
        await d.at('objectives');
        hlText('OBJECTIVES', label: 'Objectives', seconds: 1.4);
        await d.at('timed');
        hlText('Hook:', label: 'Timed steps', seconds: 1.4);
        await d.at('materials');
        hlText('MATERIALS', label: 'Materials', seconds: 1.3);
        await d.at('homework');
        hlText('HOMEWORK', label: 'Homework', seconds: 1.3);
        await d.at('timer', lead: 0.8, title: 'Step timer');
        if (find.text('Start step timer').evaluate().isNotEmpty) await d.tapText('Start step timer');
        await d.emit(6);
        await d.endSeg();
        await d.seg('s15');
        await d.tapKey('panel-tab-books');
        await d.emit(8);
        await d.at('syllabus', title: 'Books & syllabus');
        hlText('topics taught', label: 'Coverage so far', seconds: 2.4);
        await d.at('profile', lead: 0.9, title: 'Your profile menu');
        await d.tapKey('panel-close');
        await d.emit(4);
        await d.tapKey('profile-button');
        await d.emit(6);
        await d.at('whiteboards');
        d.hlKey('menu-whiteboards', label: 'Saved whiteboards', seconds: 1.3);
        await d.point(d.centerOf('menu-whiteboards')!);
        await d.at('recordings');
        d.hlKey('menu-recordings', label: 'Recordings', seconds: 1.3);
        await d.point(d.centerOf('menu-recordings')!);
        await d.at('training');
        d.hlKey('menu-training', label: 'Training', seconds: 1.3);
        await d.point(d.centerOf('menu-training')!);
        await d.at('tour');
        d.hlKey('menu-tour', label: 'Guided tour', seconds: 1.6);
        await d.point(d.centerOf('menu-tour')!);
        await d.endSeg();
        await d.dismissPopover();
      },
      'c2': () async {
        await d.chapter(2, 'Ink that feels like a pen');
        await d.seg('s20');
        await d.at('pen', nth: 0, lead: 0.8);
        await d.tapKey('tool-pen');
        await d.emit(3);
        if (find.byKey(const Key('pen-popover')).evaluate().isEmpty) await d.tapKey('tool-pen');
        await d.emit(4);
        final pop = d.rectOf('pen-popover');
        if (pop != null) d.focus(pop.inflate(40), seconds: 9);
        await d.at('type', title: 'Pen types');
        d.hlKey('pen-type-calligraphy', label: 'Pen type', seconds: 1.4, zoom: false);
        await d.tapKey('pen-type-calligraphy');
        await d.tapKey('pen-type-pen');
        await d.at('thickness', lead: 0.3, title: 'Thickness');
        final th = d.rectOf('pen-thickness');
        if (th != null) {
          d.hl(th.inflate(6), label: 'Thickness', seconds: 1.3, zoom: false);
          await d.drag([Offset(th.left + th.width * 0.12, th.center.dy), Offset(th.left + th.width * 0.3, th.center.dy)], 420);
        }
        await d.at('colour', lead: 0.3, title: 'Colour');
        d.hlFinder(find.byKey(const Key('pen-colour-0')), label: 'Colour', seconds: 1.3, zoom: false, pad: 6);
        await d.tapKey('pen-colour-2');
        await d.at('pressure', lead: 0.3, title: 'Pressure · palm rejection');
        d.hlKey('pen-pressure', label: 'Pressure', seconds: 1.0, zoom: false);
        await d.tapKey('pen-pressure');
        await d.at('smoothing', lead: 0.2);
        d.hlKey('pen-smoothing', label: 'Smoothing', seconds: 1.0, zoom: false);
        await d.at('palm', lead: 0.2);
        d.hlKey('pen-palm', label: 'Palm rejection', seconds: 1.6, zoom: false);
        await d.point(d.centerOf('pen-palm') ?? const Offset(1500, 900));
        await d.endSeg();
        await d.dismissPopover();
        await d.seg('s21');
        d.focus(const Rect.fromLTWH(1040, 230, 860, 200), seconds: 7);
        await d.at('handwriting', lead: 0.6, title: 'Natural handwriting');
        await d.write(hand, 'bends', const Offset(1100, 285), 66, speed: 2.0);
        await d.endSeg();
        await d.seg('s22');
        await d.at('shapes', lead: 1.0, title: 'Shapes');
        d.focus(const Rect.fromLTWH(220, 300, 760, 560), seconds: 9);
        await d.shape('rectangle', const Offset(300, 450), const Offset(860, 700));
        await d.at('line', lead: 1.2, title: 'Normal');
        await d.shape('line', const Offset(520, 330), const Offset(520, 820));
        await d.at('arrows', lead: 1.2, title: 'Ray arrows');
        await d.shape('arrow', const Offset(360, 330), const Offset(516, 446));
        await d.at('refracted', lead: 0.5);
        await d.shapeAgain(const Offset(524, 454), const Offset(640, 696));
        await d.at('emergent', lead: 0.5);
        await d.shapeAgain(const Offset(644, 704), const Offset(800, 820));
        await d.endSeg();
        await d.seg('s23');
        await d.tapKey('tool-pen');
        await d.emit(2);
        await d.dismissPopover();
        d.focus(const Rect.fromLTWH(140, 280, 960, 560), seconds: 8);
        d.titleAt('air', 'Labels by hand');
        await d.write(hand, 'air', const Offset(180, 300), 90, speed: 2.2);
        await d.at('glass', lead: 0.5);
        await d.write(hand, 'glass', const Offset(880, 520), 90, speed: 2.3);
        await d.at('incidence', lead: 0.4);
        await d.write(hand, 'i', const Offset(470, 330), 80, speed: 1.6);
        await d.at('refraction', lead: 0.4);
        await d.write(hand, 'r', const Offset(540, 470), 80, speed: 1.6);
        await d.at('highlighter', lead: 0.8, title: 'Highlighter');
        await d.tapKey('tool-highlighter');
        await d.emit(2);
        await d.dismissPopover();
        d.focus(const Rect.fromLTWH(120, 90, 1200, 220), seconds: 3);
        await d.drag([const Offset(160, 222), const Offset(700, 226), const Offset(1240, 220)], 900);
        await d.endSeg();
        await d.seg('s24');
        await d.at('eraser', lead: 0.8, title: 'Eraser');
        await d.tapKey('tool-erase');
        await d.emit(2);
        await d.dismissPopover();
        d.focus(const Rect.fromLTWH(120, 250, 700, 300), seconds: 2.5);
        await d.drag([const Offset(170, 360), const Offset(230, 335), const Offset(290, 365)], 450);
        await d.at('undo', lead: 0.4, title: 'Undo · redo');
        d.hlKey('undo', label: 'Undo', seconds: 1.0);
        await d.tapKey('undo');
        await d.at('redo', lead: 0.3);
        d.hlKey('redo', label: 'Redo', seconds: 1.0);
        await d.tapKey('redo');
        await d.emit(6);
        await d.tapKey('undo');
        await d.endSeg();
        await d.seg('s25');
        await d.at('lasso', lead: 0.9, title: 'Lasso select');
        await d.tapKey('tool-select');
        await d.emit(2);
        await d.dismissPopover();
        await d.drag([for (var a = 0; a <= 36; a++) Offset(600 + 470 * _cos(a * 10.0), 585 + 268 * _sin(a * 10.0))], 1000);
        await d.emit(4);
        await d.at('move', lead: 0.5);
        await d.drag([const Offset(580, 575), const Offset(640, 590)], 600, holdMs: 120);
        await d.emit(4);
        await d.at('selection', title: 'Resize · duplicate · group · lock');
        final bar = find.byWidgetPredicate((w) => w.key is ValueKey<String> && (w.key as ValueKey<String>).value.startsWith('selection'));
        if (bar.evaluate().isNotEmpty) d.hlFinder(bar.first, label: 'Selection bar', seconds: 3.0);
        await d.endSeg();
        await d.tapAt(const Offset(1500, 330));
        await d.seg('s26');
        await d.at('geometry', lead: 1.0, title: 'Geometry tools');
        await d.openDrawer(filter: 'geometry');
        await d.emit(2);
        await d.at('ruler');
        d.hlKey('drawer-ruler', label: 'Ruler', seconds: 1.2);
        await d.at('protractor');
        d.hlKey('drawer-protractor', label: 'Protractor', seconds: 1.2);
        await d.at('compass');
        d.hlKey('drawer-compass', label: 'Compass', seconds: 1.2);
        await d.at('set');
        d.hlKey('drawer-set-square-45', label: 'Set squares', seconds: 1.4);
        await d.at('protractor', nth: 0, lead: 0.6);
        await d.tapKey('drawer-protractor');
        await d.emit(8);
        d.focus(const Rect.fromLTWH(560, 300, 800, 520), seconds: 4);
        await d.drag([const Offset(960, 560), const Offset(900, 520)], 700, holdMs: 100);
        await d.endSeg();
      },
      'c3': () async {
        await d.chapter(3, 'AI pen, maths and diagrams');
        await d.seg('s30');
        await d.tapKey('tool-ai-pen');
        await d.emit(2);
        await d.dismissPopover();
        hw.queue
          ..clear()
          ..add('glass slab');
        d.focus(const Rect.fromLTWH(1040, 360, 700, 420), seconds: 11);
        d.titleAt('ai', 'AI pen: handwriting → text');
        await d.write(hand, 'slab', const Offset(1110, 400), 74, speed: 2.6);
        await d.emit(14);
        await d.at('shape', lead: 1.2, title: 'Shape AI');
        await d.tapKey('tool-pen');
        await d.emit(2);
        if (find.byKey(const Key('pen-popover')).evaluate().isEmpty) await d.tapKey('tool-pen');
        await d.emit(2);
        await d.tapKey('pen-mode-shapeAi');
        await d.dismissPopover();
        await d.at('rough', lead: 0.3);
        await d.stroke([
          for (var a = 0; a <= 380; a += 8) (Offset(1300 + (70 + 6 * _sin(a * 3.0)) * _cos(a - 90.0), 640 + (62 + 5 * _cos(a * 2.0)) * _sin(a - 90.0)), a * 2.6),
        ]);
        await d.emit(10);
        await d.endSeg();
        await d.seg('s31');
        await d.at('equations', lead: 0.8, title: 'Typeset equations');
        await d.tapKey('tool-insert');
        await d.emit(4);
        await d.tapKey('insert-equation');
        await d.emit(6);
        final tex = find.descendant(of: find.byType(Dialog), matching: find.byType(TextField));
        if (tex.evaluate().isNotEmpty) {
          await d.tapFinder(tex.last);
          await d.type(tex.last, r'n = \frac{\sin i}{\sin r}', charsPerFrame: 3);
          await d.emit(4);
          await d.at('placed', lead: 0.5);
          await d.tapText('Put on the board');
        }
        await d.emit(8);
        final mathEl = find.byWidgetPredicate((w) => w.runtimeType.toString() == 'Math');
        if (mathEl.evaluate().isNotEmpty) d.hlFinder(mathEl.last, label: "Snell's law", seconds: 2.0);
        await d.endSeg();
        await d.seg('s32');
        await d.at('math', lead: 1.0, title: 'Math solver · offline');
        await d.aiTab();
        await d.tapKey('ai-tool-math');
        await d.emit(4);
        final mi = find.byKey(const Key('math-input'));
        if (mi.evaluate().isNotEmpty) {
          await d.tapFinder(mi);
          await d.type(mi, '2x + 5 = 17', charsPerFrame: 2);
          await d.tapKey('math-solve');
          await d.emit(6);
          await d.at('step');
          d.hlKey('math-answer', label: 'Every step shown', seconds: 2.0);
        }
        await d.endSeg();
        await d.seg('s33');
        await d.tapKey('panel-close');
        await d.emit(2);
        await d.at('drawer', lead: 0.6, title: 'Tools drawer');
        await d.tapKey('tool-tools');
        await d.emit(4);
        final filters = d.rectOf('drawer-filter-all');
        if (filters != null) d.focus(d.rectOf('tools-drawer')!.inflate(20), seconds: 14);
        await d.at('science', lead: 0.4, title: 'Science');
        await d.tapKey('drawer-filter-science');
        await d.at('periodic', lead: 0.1);
        d.hlKey('drawer-periodic-table', seconds: 1.0, zoom: false);
        await d.at('circuits', lead: 0.1);
        d.hlKey('drawer-circuit', seconds: 0.9, zoom: false);
        await d.at('atoms', lead: 0.1);
        d.hlKey('drawer-atom', seconds: 1.0, zoom: false);
        await d.at('maths', lead: 0.4, title: 'Maths');
        await d.tapKey('drawer-filter-maths');
        await d.at('graphs', lead: 0.1);
        d.hlKey('drawer-graphs', seconds: 0.9, zoom: false);
        await d.at('equations', lead: 0.1);
        d.hlKey('drawer-equation', seconds: 0.9, zoom: false);
        await d.at('statistics', lead: 0.1);
        d.hlKey('drawer-stats', seconds: 1.0, zoom: false);
        await d.at('computer', lead: 0.4, title: 'Computer science');
        await d.tapKey('drawer-filter-cs');
        await d.at('flowcharts', lead: 0.1);
        d.hlKey('drawer-flowchart', seconds: 0.9, zoom: false);
        await d.at('code', lead: 0.1);
        d.hlKey('drawer-code-lab', seconds: 0.9, zoom: false);
        await d.at('logic', lead: 0.1);
        d.hlKey('drawer-logic-gates', seconds: 1.4, zoom: false);
        await d.endSeg();
        if (find.byKey(const Key('drawer-filter-all')).evaluate().isNotEmpty) await d.tapKey('drawer-filter-all');
        await closeEverything();
      },
      'c4': () async {
        await d.chapter(4, 'Pages, backgrounds and saving');
        await d.seg('s40');
        d.titleAt('add', 'Add pages');
        await d.dismissPopover();
        final pagesBefore = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas).first).controller.pages.length;
        d.hlKey('add-page', label: 'Add page', seconds: 1.2);
        await d.tapKey('add-page');
        await d.emit(6);
        final wbc = tester.widget<WhiteboardCanvas>(find.byType(WhiteboardCanvas).first).controller;
        if (wbc.pages.length == pagesBefore) {
          d.log.writeln('add-page tap missed; adding');
          wbc.addPage();
          await d.emit(2);
        }
        await d.tapKey('tool-pen');
        await d.emit(2);
        await d.dismissPopover();
        d.focus(const Rect.fromLTWH(160, 140, 1100, 300), seconds: 6);
        d.titleAt('two', 'Page 2: Snell\'s law');
        await d.write(hand, 'snell', const Offset(220, 200), 110, speed: 3.3);
        await d.at('overview', lead: 0.8, title: 'Page overview');
        await d.tapKey('page-overview');
        await d.emit(8);
        d.hlKey('page-thumbnails', label: 'Jump · reorder · export', seconds: 3.0);
        await d.at('export', lead: 0.4);
        d.hlKey('overview-export', label: 'Export PDF', seconds: 1.6, zoom: false);
        await d.endSeg();
        await d.tapKey('overview-close');
        await d.emit(4);
        await d.seg('s41');
        await d.tapKey('board-menu');
        await d.emit(4);
        await d.tapKey('tool-theme');
        await d.emit(6);
        d.titleAt('backgrounds', 'Backgrounds & templates');
        for (final (w, b) in [('ruled', 'ruled'), ('grid', 'grid'), ('dots', 'dots'), ('chalkboard', 'chalkboard')]) {
          await d.at(w, lead: 0.35);
          if (find.byKey(Key('bg-$b')).evaluate().isNotEmpty) await d.tapKey('bg-$b');
        }
        await d.at('all', lead: 0.3);
        d.hlKey('bg-scope', label: 'This page · every page', seconds: 1.6);
        await d.emit(10);
        await d.tapKey('bg-plain');
        await d.endSeg();
        await d.dismissPopover();
        await d.seg('s42');
        await d.at('saved', lead: 0.8, title: 'Saved & shared');
        await d.tapKey('quick-share');
        await d.emit(20);
        await d.at('whatsapp', lead: 0.2);
        hlText('WhatsApp', label: 'WhatsApp', seconds: 1.4);
        await d.at('email', lead: 0.2);
        hlText('Email', label: 'Email', seconds: 1.2);
        await d.endSeg();
        await closeEverything();
      },
      'c5': () async {
        await d.chapter(5, '3D models, labs and simulations');
        await d.seg('s50');
        await d.tapKey('panel-ai');
        await d.emit(4);
        await d.at('3d', lead: 1.2, title: '3D models');
        await d.tapKey('panel-tab-model3d');
        await d.emit(6);
        final msf = find.byWidgetPredicate((w) => w is TextField && (w.decoration?.hintText ?? '').contains('3D'));
        if (msf.evaluate().isNotEmpty) {
          await d.tapFinder(msf.first);
          await d.type(msf.first, 'cone', charsPerFrame: 1);
          await d.emit(4);
        }
        final wm = find.text('Frustum of a cone').hitTestable();
        if (wm.evaluate().isNotEmpty) await d.tapFinder(wm.first);
        await d.emit(12);
        d.focus(const Rect.fromLTWH(1000, 60, 900, 900), seconds: 8);
        await d.at('rotate', lead: 0.4, title: 'Rotate with the stylus');
        await d.drag([const Offset(1450, 330), const Offset(1270, 370)], 900);
        await d.emit(6);
        await d.drag([const Offset(1350, 330), const Offset(1570, 270)], 900);
        await d.at('measurements', title: 'Live measurements');
        hlText('Measurements', label: 'Measurements', seconds: 2.0, zoom: false);
        await d.endSeg();
        await d.seg('s51');
        await d.at('labs', lead: 0.9, title: 'Virtual labs');
        await d.tapKey('panel-tab-labs');
        await d.emit(6);
        await d.tapText('Refraction through a glass slab');
        await d.emit(14);
        d.focus(const Rect.fromLTWH(1000, 120, 920, 620), seconds: 7);
        await d.at('angle', lead: 0.6, title: 'Change the angle');
        await d.drag([const Offset(1513, 262), const Offset(1460, 250), const Offset(1390, 268)], 1300, holdMs: 120);
        await d.emit(6);
        await d.drag([const Offset(1390, 268), const Offset(1470, 255)], 900, holdMs: 80);
        await d.endSeg();
        await d.seg('s52');
        await d.at('phet', lead: 0.7, title: 'PhET simulations');
        await d.tapKey('panel-tab-sims');
        await d.at('animations', lead: 0.7, title: 'Animations');
        await d.tapKey('panel-tab-animations');
        await d.at('concept', lead: 0.7, title: 'Concept videos');
        await d.tapKey('panel-tab-videos');
        await d.at('kit', lead: 0.7, title: 'Subject kit');
        await d.tapKey('panel-tab-kit');
        await d.at('formulas', lead: 0.3);
        hlText('Formulas', label: 'Formulas & constants', seconds: 1.6);
        await d.endSeg();
        await d.seg('s53');
        await d.tapKey('panel-close');
        await d.emit(2);
        await d.at('add', lead: 0.7, title: 'The Add menu');
        await d.tapKey('tool-insert');
        await d.emit(6);
        for (final (w, k, label) in [
          ('pdfs', 'insert-cat-pdf', 'PDF'),
          ('powerpoint', 'insert-cat-ppt', 'PowerPoint'),
          ('pictures', 'insert-picture', 'Pictures'),
          ('tables', 'insert-cat-table', 'Tables'),
          ('sticky', 'insert-note', 'Sticky notes'),
          ('word', 'insert-card', 'Word cards'),
          ('covered', 'insert-answer', 'Covered answers'),
        ]) {
          await d.at(w, lead: 0.15);
          d.hlKey(k, label: label, seconds: 1.0, zoom: false);
          final c = d.centerOf(k);
          if (c != null) await d.point(c + const Offset(30, 10));
        }
        await d.dismissPopover();
        await d.at('safe', lead: 0.9, title: 'Safe browser');
        await d.tapKey('panel-ai');
        await d.emit(2);
        await d.tapKey('panel-tab-web');
        await d.at('camera', lead: 0.6, title: 'Document camera');
        await d.tapKey('panel-tab-camera');
        await d.endSeg();
        await closeEverything();
      },
      'c6': () async {
        await d.chapter(6, 'KINETIX AI, built into the lesson');
        await d.seg('s60');
        await d.aiTab();
        final ask = find.byKey(const Key('ai-ask'));
        if (ask.evaluate().isNotEmpty) {
          await d.tapFinder(ask);
          final tf = find.descendant(of: ask, matching: find.byType(TextField));
          await d.type(tf.evaluate().isNotEmpty ? tf : ask, 'Why does a pencil look bent in a glass of water?', charsPerFrame: 3);
          await d.tapKey('ai-ask-send');
          await d.skip(1);
          await d.emit(4);
        }
        d.titleAt('answers', 'Ask KINETIX AI');
        await d.at('language', lead: 0.3);
        d.hlKey('ai-explanation', label: 'Answer for Class 10', seconds: 2.4);
        await d.at('sources', lead: 0.3, title: 'With sources');
        d.hlKey('ai-sources', label: 'NCERT source', seconds: 2.2);
        await d.endSeg();
        await d.seg('s61');
        if (find.byKey(const Key('ai-explanation-close')).evaluate().isNotEmpty) await d.tapKey('ai-explanation-close');
        await d.at('lesson', lead: 0.8, title: 'AI lesson builder');
        await d.tapKey('ai-tool-lessonPlan');
        await d.emit(4);
        await d.tapKey('lesson-generate');
        await d.skip(1);
        await d.emit(4);
        await d.at('objectives', lead: 0.2);
        hlText('OBJECTIVES', label: 'Objectives', seconds: 1.2);
        await d.at('steps', lead: 0.2);
        hlText('Hook:', label: 'Steps', seconds: 1.2);
        await d.at('activities', lead: 0.2);
        hlText('Virtual lab', label: 'Activities', seconds: 1.2);
        await d.at('exit', lead: 0.2);
        hlText('Exit ticket', label: 'Exit ticket', seconds: 1.6);
        await d.endSeg();
        await d.seg('s62');
        if (find.byKey(const Key('panel-back')).evaluate().isNotEmpty) await d.tapKey('panel-back');
        await d.emit(2);
        await d.at('quizzes', lead: 0.6, title: 'Quick quiz');
        await d.tapKey('ai-tool-quiz');
        await d.emit(3);
        await d.tapKey('quiz-generate');
        await d.skip(1);
        await d.emit(3);
        await d.at('homework', lead: 0.6, title: 'Homework');
        if (find.byKey(const Key('panel-back')).evaluate().isNotEmpty) await d.tapKey('panel-back');
        await d.emit(2);
        d.hlKey('ai-tool-homework', label: 'Homework', seconds: 1.0);
        await d.at('lecture', lead: 0.2, title: 'Lecture notes');
        d.hlKey('ai-tool-lecture', label: 'Lecture notes', seconds: 1.0);
        await d.at('summarises', lead: 0.2, title: 'Board summary');
        d.hlKey('ai-tool-summary', label: 'Summary', seconds: 1.0);
        await d.at('read', lead: 0.6, title: 'Read board');
        await d.tapKey('ai-tool-readBoard');
        await d.skip(1);
        await d.emit(4);
        await d.endSeg();
        await closeEverything();
      },
      'c7': () async {
        await d.chapter(7, 'Live class responses');
        await d.seg('s70');
        d.titleAt('attendance', 'Attendance');
        await d.tapKey('attendance-chip');
        await d.emit(6);
        for (final n in ['Darshan Gowda', 'Kiran Patil']) {
          if (find.text(n).hitTestable().evaluate().isNotEmpty) await d.tapText(n);
        }
        await d.at('synced', lead: 0.6, title: 'Synced to the ERP');
        final sub = find.byKey(const Key('attendance-submit'));
        if (sub.evaluate().isNotEmpty) await d.tapFinder(sub);
        await d.emit(6);
        await d.endSeg();
        await d.seg('s71');
        await d.at('ask', lead: 0.8, title: 'Ask the class');
        await tool('ask-class', frames: 6);
        final q = find.byKey(const Key('ask-question'));
        if (q.evaluate().isNotEmpty) {
          await d.tapFinder(q);
          final tf = find.descendant(of: q, matching: find.byType(TextField));
          await d.type(tf.evaluate().isNotEmpty ? tf : q, 'Entering glass, a ray of light bends…', charsPerFrame: 3);
        }
        await d.tapKey('ask-start');
        await d.emit(6);
        final pc = find.byKey(const Key('poll-count'));
        if (pc.evaluate().isNotEmpty) {
          final m = find.ancestor(of: pc, matching: find.byType(Material));
          final card = tester.getRect(m.evaluate().isNotEmpty ? m.first : pc).inflate(24);
          d.focus(Rect.fromCenter(center: card.center, width: card.width * 1.9, height: card.width * 1.9 * 9 / 16), seconds: 14);
        }
        final right = (lastPollBody?['correct'] as String?) ?? '0';
        await d.at('student', title: 'Answers from the Student app');
        await answerPoll(server, d, [right, right, '1', right, right], gap: 3);
        await d.at('cards', title: 'Printed answer cards');
        d.hlKey('poll-scan', label: 'Camera scans the cards', seconds: 2.0, zoom: false);
        await answerPoll(server, d, [right, '2', right, right], gap: 3);
        await d.endSeg();
        await d.seg('s72');
        await d.at('live', title: 'Results build live');
        await answerPoll(server, d, [right, '1', right, right, '3', right, right], gap: 3);
        await d.at('reveal', lead: 0.6, title: 'Reveal the answer');
        if (find.byKey(const Key('poll-reveal')).evaluate().isNotEmpty) await d.tapKey('poll-reveal');
        if (find.byKey(const Key('poll-end')).evaluate().isNotEmpty) await d.tapKey('poll-end');
        await d.emit(6);
        await d.endSeg();
        await d.seg('s73');
        if (find.byKey(const Key('poll-dismiss')).evaluate().isNotEmpty) await d.tapKey('poll-dismiss');
        await d.at('word', lead: 0.8, title: 'Word cloud');
        await tool('ask-class', frames: 6);
        await d.tapKey('ask-word-cloud');
        final q2 = find.byKey(const Key('ask-question'));
        if (q2.evaluate().isNotEmpty) {
          await d.tapFinder(q2);
          final tf = find.descendant(of: q2, matching: find.byType(TextField));
          await d.type(tf.evaluate().isNotEmpty ? tf : q2, 'One word: what does light do in glass?', charsPerFrame: 3);
        }
        await d.tapKey('ask-start');
        await d.emit(4);
        await answerPoll(server, d, ['bends', 'refracts'], gap: 4);
        final wck = find.byKey(const Key('word-cloud'));
        if (wck.evaluate().isNotEmpty) {
          final m = find.ancestor(of: wck, matching: find.byType(Material));
          final r = tester.getRect(m.evaluate().isNotEmpty ? m.first : wck).inflate(24);
          d.focus(Rect.fromCenter(center: r.center, width: r.width * 1.8, height: r.width * 1.8 * 9 / 16), seconds: 8);
        }
        await d.at('grows', title: 'The cloud grows');
        await answerPoll(server, d, ['slows down', 'bends', 'changes direction', 'bends', 'slows down', 'towards normal', 'refracts', 'bends', 'slows down', 'refracts', 'bends', 'changes speed'], gap: 4);
        await d.endSeg();
        if (find.byKey(const Key('poll-end')).evaluate().isNotEmpty) await d.tapKey('poll-end');
        if (find.byKey(const Key('poll-dismiss')).evaluate().isNotEmpty) await d.tapKey('poll-dismiss');
        await d.seg('s74');
        await d.at('toolkit', lead: 0.8, title: 'Classroom toolkit');
        await d.drawerTool('toolkit-picker', filter: 'classroom');
        await d.emit(2);
        await d.at('picker', lead: 0.6, title: 'Random picker');
        if (find.text('Pick').hitTestable().evaluate().isNotEmpty) await d.tapText('Pick');
        await d.emit(12);
        await d.closeOverlayTool();
        await d.toolOnWord('timer', 'toolkit-timer', filter: 'classroom', title: 'Timer', prep: 1.6);
        if (find.text('Start').hitTestable().evaluate().isNotEmpty) await d.tapText('Start');
        await d.emit(6);
        await d.closeOverlayTool();
        await d.toolOnWord('scoreboards', 'scoreboard', filter: 'classroom', title: 'Scoreboards', prep: 1.6);
        if (find.byKey(const Key('score-add-team')).evaluate().isNotEmpty) await d.tapKey('score-add-team');
        await d.toolOnWord('badges', 'badges', filter: 'classroom', title: 'Badges', prep: 1.6);
        await d.toolOnWord('group', 'group-maker', filter: 'classroom', title: 'Group maker', prep: 1.6);
        if (find.byKey(const Key('groups-make')).evaluate().isNotEmpty) await d.tapKey('groups-make');
        await d.toolOnWord('zones', 'zones', filter: 'classroom', title: 'Multi-user zones', prep: 1.6);
        if (find.text('2 zones').hitTestable().evaluate().isNotEmpty) await d.tapText('2 zones');
        await d.emit(8);
        await d.endSeg();
      },
      'c8': () async {
        await d.chapter(8, 'Homework, marking and OBE');
        await d.seg('s80');
        await d.at('homework', lead: 1.0, title: 'Homework AI');
        await d.aiTab();
        await d.tapKey('ai-tool-homework');
        await d.emit(3);
        await d.tapKey('homework-generate');
        await d.skip(1);
        await d.emit(3);
        await d.at('sends', lead: 0.7, title: 'Sent to the Student app');
        await d.tapKey('homework-send');
        await d.emit(6);
        await d.at('due', lead: 0.3);
        d.hlKey('due-date', label: 'Due date', seconds: 1.5);
        if (find.byKey(const Key('send-homework-confirm')).evaluate().isNotEmpty) await d.tapKey('send-homework-confirm');
        await d.emit(6);
        await d.endSeg();
        await d.seg('s81');
        await d.at('classmates', title: 'Peer review');
        d.ev({'inset': ['student-navLearn.jpg'], 'dur': 120});
        await d.at('ai', title: 'AI-suggested marks');
        await d.at('teacher', lead: 0.2);
        d.ev({'inset': ['teacher-navClasses.jpg'], 'dur': 90, 'slot': 1});
        await d.endSeg();
        await closeEverything();
        await d.seg('s82');
        await d.at('outcomes', lead: 1.0, title: 'Course outcomes (OBE)');
        await tool('ask-class', frames: 6);
        final cos = find.textContaining(RegExp(r'^CO\d'));
        if (cos.hitTestable().evaluate().isNotEmpty) {
          d.hlFinder(cos.hitTestable().first, label: 'Tag a course outcome', seconds: 3);
          for (var i = 0; i < cos.hitTestable().evaluate().length && i < 2; i++) {
            await d.tapFinder(cos.hitTestable().at(i));
          }
        }
        await d.at('evidence', title: 'OBE evidence in the ERP');
        await d.endSeg();
        await closeEverything();
      },
      'c9': () async {
        await d.chapter(9, 'Record, cast and share');
        await d.seg('s90');
        await d.at('record', lead: 0.7, title: 'Record the lesson');
        await d.tapKey('record');
        await d.emit(4);
        await d.at('consent', title: 'Consent notice');
        d.hlKey('rec-notice', label: 'Shown first in each class', seconds: 1.8);
        await d.at('records', lead: 0.6);
        if (find.byKey(const Key('rec-notice-start')).evaluate().isNotEmpty) await d.tapKey('rec-notice-start');
        await d.emit(6);
        await d.at('markers', lead: 0.6, title: 'Chapter markers');
        await d.tapKey('rec-marker');
        await d.at('hold', lead: 0.5, title: 'Star important moments');
        await d.tapKey('rec-marker', hold: true);
        await d.emit(6);
        await d.endSeg();
        await d.seg('s91');
        await d.tapKey('rec-stop');
        await d.emit(6);
        if (find.byKey(const Key('rec-save')).evaluate().isNotEmpty) await d.tapKey('rec-save');
        await d.emit(2);
        await d.tapKey('profile-button');
        await d.emit(3);
        await d.at('recordings', lead: 0.4, title: 'Transcript · summary · chapters');
        await d.tapKey('menu-recordings');
        await d.emit(8);
        await d.at('shared', title: 'Shared with enrolled students');
        await d.endSeg();
        await closeEverything();
        await d.seg('s92');
        await d.at('captions', lead: 0.9, title: 'Live captions');
        await d.drawerTool('live-captions');
        await d.emit(4);
        const line = 'When light enters the glass slab it slows down and bends towards the normal';
        final words = line.split(' ');
        for (var i = 1; i <= words.length; i++) {
          voice.say(words.take(i).join(' '), done: i == words.length);
          await d.emit(3);
        }
        await d.at('cast', lead: 0.9, title: 'Cast from phones');
        if (find.byKey(const Key('captions-stop')).evaluate().isNotEmpty) await d.tapKey('captions-stop');
        await d.panelTab('cast');
        await d.at('projection', lead: 0.9, title: 'Screen projection');
        await d.tapKey('panel-close');
        await d.tapKey('profile-button');
        await d.emit(3);
        await d.tapKey('menu-projector');
        await d.emit(8);
        await d.at('freeze', lead: 1.0, title: 'Freeze screen');
        await closeEverything();
        await d.tapKey('board-menu');
        await d.emit(4);
        d.hlKey('menu-freeze', label: 'Freeze screen', seconds: 2.0);
        await d.point(d.centerOf('menu-freeze')!);
        await d.endSeg();
        await d.dismissPopover();
      },
      'c10': () async {
        await d.chapter(10, 'Comfort, languages and control');
        await d.seg('s100');
        await d.at('eye', lead: 0.8, title: 'Eye comfort');
        await d.tapKey('board-menu');
        await d.emit(3);
        await d.tapKey('menu-eye-comfort');
        await d.emit(4);
        if (find.byKey(const Key('eye-protection')).evaluate().isNotEmpty) await d.tapKey('eye-protection');
        await d.at('break', lead: 0.3, title: 'Break reminders 20-20-20');
        hlText('Break reminders', label: 'Break reminders', seconds: 2.0);
        await d.emit(8);
        if (find.byKey(const Key('eye-protection')).evaluate().isNotEmpty) await d.tapKey('eye-protection');
        await d.dismissPopover();
        await d.at('dark', lead: 0.8, title: 'Dark theme');
        await d.tapKey('board-menu');
        await d.emit(3);
        await d.tapKey('menu-theme-toggle');
        await d.emit(18);
        await d.tapKey('board-menu');
        await d.emit(3);
        await d.tapKey('menu-theme-toggle');
        await d.endSeg();
        await d.seg('s101');
        await d.tapKey('board-menu');
        await d.emit(3);
        await d.tapKey('menu-settings');
        await d.emit(6);
        await d.at('english', title: 'English · Hindi · Kannada');
        d.hlKey('board-language', label: 'Board language', seconds: 1.4);
        for (final (w, lang) in [('hindi', 'hi'), ('kannada', 'kn')]) {
          await d.at(w, lead: 0.4);
          var lf = find.byKey(Key('board-language-$lang')).hitTestable();
          if (lf.evaluate().isEmpty) {
            await closeEverything();
            await d.tapKey('board-menu');
            await d.emit(3);
            await d.tapKey('menu-settings');
            await d.emit(6);
            lf = find.byKey(Key('board-language-$lang')).hitTestable();
          }
          if (lf.evaluate().isNotEmpty) await d.tapFinder(lf.first);
        }
        await d.at('follows', title: 'Follows each teacher');
        await d.endSeg();
        await closeEverything();
        board.setBoardLanguage(BoardLanguage.en);
        board.setTheme(BoardTheme.light);
        await d.emit(2);
        await d.seg('s102');
        await d.toolOnWord('voice', 'voice-commands', title: 'Voice commands');
        voice.say('next page');
        await d.emit(4);
        voice.say('next page', done: true);
        await d.emit(6);
        if (find.byKey(const Key('voice-close')).evaluate().isNotEmpty) await d.tapKey('voice-close');
        await closeEverything();
        await d.toolOnWord('immersive', 'read-aloud', title: 'Immersive reader');
        await d.at('screen', lead: 1.9);
        if (find.byKey(const Key('reader-close')).evaluate().isNotEmpty) await d.tapKey('reader-close');
        await closeEverything();
        await d.toolOnWord('screen', 'toolkit-curtain', title: 'Screen shade', prep: 1.5);
        await d.at('spotlight', lead: 1.9);
        if (find.text('Remove shade').hitTestable().evaluate().isNotEmpty) await d.tapText('Remove shade');
        await d.toolOnWord('spotlight', 'toolkit-spotlight', title: 'Spotlight', prep: 1.5);
        await d.at('magnifier', lead: 1.9);
        if (find.byKey(const Key('spotlight-end')).hitTestable().evaluate().isNotEmpty) await d.tapKey('spotlight-end');
        await d.toolOnWord('magnifier', 'magnifier', title: 'Magnifier', prep: 1.5);
        final mg = d.rectOf('magnifier');
        if (mg != null) await d.drag([mg.center, mg.center + const Offset(160, 60)], 700, holdMs: 80);
        await d.endSeg();
        if (find.byKey(const Key('magnifier-close')).hitTestable().evaluate().isNotEmpty) await d.tapKey('magnifier-close');
        await closeEverything();
        await d.seg('s103');
        await d.at('settings', lead: 0.8, title: 'Board settings');
        await d.tapKey('board-menu');
        await d.emit(3);
        await d.tapKey('menu-settings');
        await d.emit(6);
        await d.at('simple', lead: 0.3, title: 'Simple mode');
        hlText('Simple board', label: 'Big labelled tools', seconds: 1.6);
        await d.at('toolbar', lead: 0.9, title: 'Custom toolbar');
        await closeEverything();
        await d.tapKey('board-menu');
        await d.emit(3);
        await d.tapKey('menu-customise-toolbar');
        await d.emit(4);
        await d.at('touch', lead: 1.0, title: 'Touch lock · kiosk');
        await closeEverything();
        await d.drawerFind('touch-lock');
        d.hlKey('drawer-touch-lock', label: 'Touch lock', seconds: 1.4);
        await d.point(d.centerOf('drawer-touch-lock') ?? const Offset(600, 500));
        await d.at('diagnostics', lead: 1.0, title: 'Device diagnostics');
        await d.drawerTool('diagnostics');
        await d.emit(6);
        await d.endSeg();
        await closeEverything();
      },
      'c11': () async {
        await d.chapter(11, 'Works offline, syncs everywhere');
        await d.seg('s110');
        offline = true;
        await d.at('drops', lead: 0.6, title: 'Keeps working offline');
        await d.tapKey('attendance-chip');
        await d.emit(4);
        final sub = find.byKey(const Key('attendance-submit'));
        if (sub.evaluate().isNotEmpty) await d.tapFinder(sub);
        await d.emit(6);
        await d.at('outbox', title: 'Outbox');
        d.hlKey('board-clock', label: 'Changes waiting to sync', seconds: 2.0);
        await d.at('back', lead: 0.2, title: 'Synced when back online');
        offline = false;
        await d.ramp(3, 3);
        await d.endSeg();
        await d.seg('s111');
        await d.at('end', lead: 0.8, title: 'End the class');
        await d.tapKey('quick-end-class');
        await d.emit(6);
        if (find.text('End class').hitTestable().evaluate().isNotEmpty) await d.tapText('End class');
        for (final (w, label) in [('attendance', 'Attendance'), ('polls', 'Polls'), ('homework', 'Homework'), ('recordings', 'Recordings'), ('evidence', 'Lesson evidence')]) {
          await d.at(w, lead: 0.1);
          d.chip(label);
        }
        await d.at('erp', title: 'Into the KINETIX ERP');
        await d.at('teacher', lead: 0.2, title: 'Teacher · Student · Parent apps');
        d.ev({'inset': ['teacher-navHome.jpg'], 'dur': 150});
        await d.at('student', lead: 0.2);
        d.ev({'inset': ['student-navHome.jpg'], 'dur': 110, 'slot': 1});
        await d.at('parent', lead: 0.2);
        d.ev({'inset': ['parent-navHome.jpg'], 'dur': 70, 'slot': 2});
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
