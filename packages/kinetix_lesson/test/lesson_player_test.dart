import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

/// Two pages over 20 s: a line on page 1 at 1–2 s, a new page at 8 s, a dot on it at 9 s.
Map<String, dynamic> lessonJson() => {
  'v': 1,
  'canvas': {'w': 1920, 'h': 1080},
  'background': 'plain',
  'durationMs': 20000,
  'events': [
    [
      0,
      'L',
      [<Object>[]],
      0,
    ],
    [
      1000,
      'b',
      1,
      {
        't': 'pen',
        'c': 4279966495,
        'w': 4,
        'p': [100, 100],
      },
    ],
    [2000, 'p', 1, 400, 400],
    [2100, 'e', 1],
    [8000, 'n', 1],
    [
      9000,
      'b',
      2,
      {
        't': 'pen',
        'c': 4279966495,
        'w': 4,
        'p': [500, 500, 600, 600],
      },
    ],
    [9100, 'e', 2],
  ],
};

Map<String, dynamic> detailsJson({
  String transcriptState = 'done',
  String summaryState = 'done',
  String? transcript = 'Today we look at the issue of shares.',
  Object? summary = const {
    'summary': 'How companies issue shares.',
    'keyPoints': ['Shares can be issued at par or at a premium', 'Calls in arrears'],
  },
  bool hasAudio = true,
}) => {
  'id': 'r1',
  'title': 'Issue of shares',
  'startedAt': '2026-10-04T04:32:00Z',
  'durationMs': 20000,
  'hasAudio': hasAudio,
  'sectionName': 'BCom Sem 3 A',
  'subjectName': 'Corporate Accounting',
  'teacherName': 'Anita Sharma',
  'transcriptState': transcriptState,
  'summaryState': summaryState,
  'sharedAt': '2026-10-04T05:30:00Z',
  'finishedAt': '2026-10-04T05:29:00Z',
  'transcript': transcript,
  'summary': summary,
};

class FakeSource implements LessonSource {
  FakeSource({Map<String, dynamic>? details}) : details = details ?? detailsJson();

  Map<String, dynamic> details;
  bool fail = false;
  final calls = <String>[];

  @override
  Future<RecordingInfo> recording(String id) async {
    calls.add('recording $id');
    if (fail) throw const LessonLoadException('This recording is no longer shared with the class.');
    return RecordingInfo.fromJson(details);
  }

  @override
  Future<Lesson> lesson(String id) async {
    calls.add('events $id');
    return Lesson.fromJson(lessonJson());
  }

  @override
  LessonAudioLocation? audio(String id) => LessonAudioLocation(Uri.parse('http://test/v1/recordings/$id/audio'));
}

void main() {
  late List<(bool, LessonAudioLocation?)> audioRequests;

  Future<FakeSource> pump(WidgetTester tester, {FakeSource? source, Size size = const Size(412, 892), RecordingInfo? initial}) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    audioRequests = [];
    final s = source ?? FakeSource();
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        home: LessonPlayerScreen(
          source: s,
          recordingId: 'r1',
          initial: initial,
          audioFactory: (rec, location, length) async {
            audioRequests.add((rec.hasAudio, location));
            return SilentLessonAudio(length, audible: true);
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    return s;
  }

  LessonPlayer player(WidgetTester tester) => tester.widget<LessonView>(find.byType(LessonView)).player;
  String text(WidgetTester tester, String key) => tester.widget<Text>(find.byKey(Key(key))).data!;

  testWidgets('loads the lesson and shows its length, title and summary', (tester) async {
    final s = await pump(tester);
    expect(s.calls, ['recording r1', 'events r1']);
    expect(audioRequests.single.$1, isTrue);
    expect(audioRequests.single.$2!.uri.path, '/v1/recordings/r1/audio');
    expect(find.text('Issue of shares'), findsOneWidget);
    expect(text(tester, 'lessonElapsed'), '0:00');
    expect(text(tester, 'lessonTotal'), '0:20');
    expect(find.text('How companies issue shares.'), findsOneWidget);
    expect(find.text('Calls in arrears'), findsOneWidget);
    expect(find.byIcon(Icons.play_arrow), findsWidgets);
    expect(player(tester).strokes, isEmpty);
  });

  testWidgets('the board follows the clock while playing and stops at the end', (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const Key('lessonPlay')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 2500));
    await tester.pump(const Duration(milliseconds: 16));
    expect(text(tester, 'lessonElapsed'), '0:02');
    expect(player(tester).strokes, hasLength(1));
    expect(player(tester).strokes.single.points, hasLength(2));
    expect(find.byIcon(Icons.pause), findsOneWidget);
    expect(find.byKey(const Key('lessonPage')), findsNothing);

    // A new page at 8 s.
    await tester.pump(const Duration(seconds: 7));
    await tester.pump(const Duration(milliseconds: 16));
    expect(text(tester, 'lessonPage'), 'Page 2 of 2');
    expect(player(tester).strokes, hasLength(1));

    // Pausing holds the board still.
    await tester.tap(find.byKey(const Key('lessonPlay')));
    await tester.pump();
    final at = player(tester).position;
    await tester.pump(const Duration(seconds: 3));
    expect(player(tester).position, at);

    // Runs to the end and offers to replay.
    await tester.tap(find.byKey(const Key('lessonPlay')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 15));
    await tester.pump(const Duration(milliseconds: 16));
    await tester.pump(const Duration(milliseconds: 16));
    expect(text(tester, 'lessonElapsed'), '0:20');
    expect(player(tester).position, const Duration(seconds: 20));
    expect(find.byIcon(Icons.replay), findsNWidgets(2));
    await tester.pumpAndSettle(); // nothing left ticking
  });

  testWidgets('skips 10 s either way and cycles the speed', (tester) async {
    await pump(tester);
    await tester.tap(find.byKey(const Key('lessonForward10')));
    await tester.pump();
    expect(text(tester, 'lessonElapsed'), '0:10');
    expect(player(tester).pageIndex, 1);
    expect(text(tester, 'lessonPage'), 'Page 2 of 2');

    await tester.tap(find.byKey(const Key('lessonBack10')));
    await tester.pump();
    expect(text(tester, 'lessonElapsed'), '0:00');
    expect(player(tester).pageCount, 1);

    expect(find.text('1×'), findsOneWidget);
    await tester.tap(find.byKey(const Key('lessonSpeed')));
    await tester.pump();
    expect(find.text('1.5×'), findsOneWidget);
    await tester.tap(find.byKey(const Key('lessonSpeed')));
    await tester.pump();
    expect(find.text('2×'), findsOneWidget);

    // At 2×, two seconds of listening is four of lesson.
    await tester.tap(find.byKey(const Key('lessonPlay')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    await tester.pump(const Duration(milliseconds: 16));
    expect(text(tester, 'lessonElapsed'), '0:04');
    await tester.tap(find.byKey(const Key('lessonPlay')));
    await tester.pump();

    await tester.tap(find.byKey(const Key('lessonSpeed')));
    await tester.pump();
    expect(find.text('1×'), findsOneWidget);
  });

  testWidgets('dragging the slider moves the board', (tester) async {
    await pump(tester);
    final slider = find.byKey(const Key('lessonSeek'));
    final box = tester.getRect(slider);
    // The slider's track is inset; aim well past the middle.
    await tester.tapAt(Offset(box.left + box.width * 0.75, box.center.dy));
    await tester.pump();
    final pos = player(tester).position;
    expect(pos.inSeconds, inInclusiveRange(12, 17));
    expect(player(tester).pageIndex, 1);
  });

  testWidgets('a transcript still being prepared says so; none shows no tab', (tester) async {
    await pump(
      tester,
      source: FakeSource(
        details: detailsJson(transcriptState: 'queued', summaryState: 'none', transcript: null, summary: null),
      ),
    );
    expect(find.text('Transcript'), findsOneWidget);
    expect(find.text('Summary'), findsNothing);
    expect(find.text('Transcript is being prepared. Check back in a few minutes.'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await pump(
      tester,
      source: FakeSource(
        details: detailsJson(transcriptState: 'none', summaryState: 'none', transcript: null, summary: null, hasAudio: false),
      ),
    );
    expect(find.byType(TabBar), findsNothing);
    expect(find.text('This lesson was recorded without sound.'), findsOneWidget);
    expect(audioRequests.single.$2, isNull);
  });

  testWidgets('the transcript tab shows the text', (tester) async {
    await pump(tester);
    await tester.tap(find.text('Transcript'));
    await tester.pumpAndSettle();
    expect(find.text('Today we look at the issue of shares.'), findsOneWidget);
  });

  testWidgets('wide screens put the summary beside the board', (tester) async {
    await pump(tester, size: const Size(1280, 800));
    final board = tester.getRect(find.byType(LessonView));
    final summary = tester.getRect(find.text('How companies issue shares.'));
    expect(summary.left, greaterThan(board.right));
  });

  testWidgets('a missed class is marked; errors offer a retry', (tester) async {
    final initial = RecordingInfo.fromJson({...detailsJson(), 'missed': true});
    final s = FakeSource()..fail = true;
    await pump(tester, source: s, initial: initial);
    expect(find.text('This recording is no longer shared with the class.'), findsOneWidget);
    // The list's details show while it fails.
    expect(find.text('Issue of shares'), findsOneWidget);

    s.fail = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.byType(LessonView), findsOneWidget);
    expect(find.text('Missed this class. Watch the lesson to catch up.'), findsOneWidget);
  });

  testWidgets('lays out without overflow on a small phone with large text', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final initial = RecordingInfo.fromJson({...detailsJson(), 'missed': true});
    await pump(tester, size: const Size(360, 640), initial: initial);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await pump(tester, size: const Size(640, 360), initial: initial);
    expect(tester.takeException(), isNull);
  });

  group('SilentLessonAudio', () {
    test('keeps time at the chosen speed and stops at the end', () {
      final watch = _ManualStopwatch();
      final a = SilentLessonAudio(const Duration(seconds: 10), stopwatch: watch);
      expect(a.playing, isFalse);
      a.play();
      watch.ms = 2000;
      expect(a.position, const Duration(seconds: 2));
      a.setSpeed(2);
      watch.ms += 1000;
      expect(a.position, const Duration(seconds: 4));
      a.pause();
      watch.ms += 5000;
      expect(a.position, const Duration(seconds: 4));
      a.seek(const Duration(seconds: 9));
      a.play();
      watch.ms += 5000;
      expect(a.position, const Duration(seconds: 10));
      expect(a.completed, isTrue);
      expect(a.playing, isFalse);
      // Play again starts over.
      a.play();
      expect(a.position, Duration.zero);
    });
  });

  test('RecordingInfo reads the API shape', () {
    final r = RecordingInfo.fromJson({...detailsJson(transcriptState: 'failed'), 'missed': true});
    expect(r.duration, const Duration(seconds: 20));
    expect(r.transcriptState, Processing.failed);
    expect(r.summary!.keyPoints, hasLength(2));
    expect(r.missed, isTrue);
    expect(r.isShared, isTrue);
    expect(
      RecordingInfo.fromJson({'id': 'x', 'startedAt': '2026-10-04T04:32:00Z', 'transcriptState': 'weird'}).transcriptState,
      Processing.none,
    );
  });

  test('labels', () {
    expect(LessonFmt.clock(const Duration(seconds: 65)), '1:05');
    expect(LessonFmt.clock(const Duration(seconds: 3725)), '1:02:05');
    expect(LessonFmt.length(const Duration(minutes: 24, seconds: 10)), '24 min');
    expect(LessonFmt.length(const Duration(minutes: 65)), '1 h 5 min');
    expect(LessonFmt.length(const Duration(seconds: 20)), 'Under a minute');
    expect(LessonFmt.speed(1.5), '1.5×');
    expect(LessonFmt.speed(2), '2×');
  });
}

class _ManualStopwatch implements Stopwatch {
  int ms = 0;
  int _from = 0;
  int _acc = 0;
  bool _running = false;

  @override
  Duration get elapsed => Duration(milliseconds: elapsedMilliseconds);
  @override
  int get elapsedMilliseconds => _acc + (_running ? ms - _from : 0);
  @override
  bool get isRunning => _running;
  @override
  void start() {
    if (_running) return;
    _running = true;
    _from = ms;
  }

  @override
  void stop() {
    if (!_running) return;
    _acc += ms - _from;
    _running = false;
  }

  @override
  void reset() {
    _acc = 0;
    _from = ms;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
