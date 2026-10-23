import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/recording/lesson_capture.dart';
import 'package:kinetix_board/core/recording/recording_store.dart';
import 'package:kinetix_board/core/recording/recordings.dart';
import 'package:kinetix_board/core/recording/screen_video_recorder.dart';
import 'package:kinetix_board/features/recording/recording_ui.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import 'support/fake_cloud.dart' show localized;
import 'support/recording_fakes.dart';

/// The lecture as a real video: capture, chunked upload, share link and the screen recorders.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory dir;
  late FakeRecordingsApi server;
  late ApiClient api;
  late List<http.Request> sent;

  /// Requests to fail once with 503, by "METHOD path suffix".
  final failOnce = <String>{};

  final teacher = SessionContext(
    sessionId: 's1',
    expiresAt: DateTime.now().add(const Duration(hours: 1)),
    teacherId: 't1',
    teacherName: 'Anita Sharma',
    language: 'en',
    sectionName: 'BCom Sem 3 A',
    subjectName: 'Corporate Accounting',
  );

  setUp(() {
    dir = Directory.systemTemp.createTempSync('kx_video_');
    server = FakeRecordingsApi();
    sent = [];
    failOnce.clear();
    api = ApiClient(
      baseUrl: 'http://test',
      client: MockClient((req) async {
        sent.add(req);
        final key = '${req.method} ${req.url.path.split('/').skip(4).join('/')}';
        if (failOnce.remove(key)) return http.Response('{"message":"busy"}', 503);
        return await server.handle(req) ?? http.Response('[]', 200);
      }),
    )..sessionToken = 'session';
  });

  tearDown(() => dir.deleteSync(recursive: true));

  Recordings recordings(ScreenVideoRecorder video, {FakeVoiceRecorder? voice}) {
    final r = Recordings(
      store: FileRecordingStore(() async => dir),
      voice: () => voice ?? FakeVoiceRecorder(),
      video: ({frames}) => video,
      videoChunkBytes: 8000,
    )..attach(api: () => api, session: () => teacher);
    addTearDown(r.dispose);
    return r;
  }

  Future<CapturedLesson> record(Recordings recs, String id) async {
    final pages = BoardPages();
    final c = await recs.newCapture(id: id, board: pages, background: BoardBackground.plain, canvas: const Size(1920, 1080));
    await c.start();
    pages.current
      ..pointerDown(1, const InkPoint(10, 20))
      ..pointerMove(1, const InkPoint(60, 50))
      ..pointerUp(1);
    c.mark('Goodwill');
    final done = await c.stop();
    c.dispose();
    return done;
  }

  test('a video that carries the microphone replaces the voice recorder, keeps chapters, and uploads in chunks', () async {
    final video = FakeVideoRecorder(bytes: 20000);
    final voice = FakeVoiceRecorder();
    final recs = recordings(video, voice: voice);
    const id = '33333333-3333-4333-8333-333333333333';
    final lesson = await record(recs, id);
    expect(video.calls, ['start', 'stop', 'dispose']);
    expect(voice.calls, isNot(contains('start'))); // one microphone, one recorder
    expect(lesson.hasVideo, isTrue);
    expect(lesson.videoMime, 'video/mp4');
    expect((lesson.events['events'] as List).any((e) => (e as List)[1] == 'c'), isTrue, reason: 'the chapter is in the ink log');

    await recs.save(lesson, title: 'Goodwill', share: true, teacher: teacher);
    // The second chunk fails once: the queue resumes from it, not from the start.
    failOnce.add('PUT video/chunks/1');
    await recs.kick();
    expect(recs.items.single.videoChunksSent, 1);
    await recs.kick();

    final chunks = sent.where((r) => r.url.path.contains('/video/chunks/')).toList();
    expect(chunks.map((r) => r.url.pathSegments.last), ['0', '1', '1', '2']);
    final joined = [for (final i in [0, 1, 2]) ...server.videoChunks[id]![i]!];
    expect(joined, hasLength(20000));
    expect(joined.take(5), [0, 1, 2, 3, 4]);
    final finalize = sent.lastWhere((r) => r.url.path.endsWith('/video/finalize'));
    expect(jsonDecode(finalize.body), {'chunks': 3, 'mime': 'video/mp4'});
    expect(server.steps.where((s) => s != 'PUT video'), ['PUT create', 'PUT events', 'POST video', 'POST finish']);

    final r = recs.items.single;
    expect(recs.statusOf(r), RecordingStatus.shared);
    expect(r.videoSent, isTrue);
    expect(File('${dir.path}/$id/video.mp4').existsSync(), isFalse, reason: 'the cloud keeps it');

    final link = await recs.shareLink(id);
    expect(link.url, endsWith('/0123456789abcdef0123456789abcdef'));
    expect(jsonDecode(sent.last.body), {'expiresInHours': 48});
  });

  test('a frame-built video keeps the separate voice and mixes it in; no video still records', () async {
    final video = FakeVideoRecorder(capturesMic: false);
    final voice = FakeVoiceRecorder();
    final recs = recordings(video, voice: voice);
    final c = await recs.newCapture(id: 'a1', board: BoardPages(), background: BoardBackground.plain, canvas: const Size(800, 600));
    await c.start();
    await c.pause();
    await c.resume();
    await c.stop();
    c.dispose();
    expect(voice.calls, containsAll(['start', 'pause', 'resume', 'stop']));
    expect(video.calls, ['start', 'pause', 'resume', 'stop', 'dispose']);

    final none = recordings(FakeVideoRecorder(unavailable: 'screen recording was not allowed'));
    final d = await none.newCapture(id: 'a2', board: BoardPages(), background: BoardBackground.plain, canvas: const Size(800, 600));
    await d.start();
    expect(d.noVideo, 'screen recording was not allowed');
    final lesson = await d.stop();
    d.dispose();
    expect(lesson.hasVideo, isFalse);

    // The institution turned video off: no recorder is made.
    none.videoEnabled = false;
    final e = await none.newCapture(id: 'a3', board: BoardPages(), background: BoardBackground.plain, canvas: const Size(800, 600));
    expect(e.video, isNull);
    e.dispose();
  });

  group('PlatformScreenRecorder', () {
    const channel = MethodChannel('zynetix/screen_recorder');
    final calls = <MethodCall>[];
    TestDefaultBinaryMessenger m() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    tearDown(() {
      m().setMockMethodCallHandler(channel, null);
      calls.clear();
    });

    test('starts with the size and rate, pauses, and stops into a file', () async {
      final path = '${dir.path}/video.mp4';
      m().setMockMethodCallHandler(channel, (call) async {
        calls.add(call);
        if (call.method == 'stop') {
          File(path).writeAsBytesSync(List.filled(4096, 1));
          return true;
        }
        return null;
      });
      final rec = PlatformScreenRecorder(macOS: false);
      expect((rec.capturesMic, rec.mime), (true, 'video/mp4'));
      await rec.start(path);
      await rec.pause();
      await rec.resume();
      expect(await rec.stop(), isTrue);
      expect(calls.map((c) => c.method), ['start', 'pause', 'resume', 'stop']);
      expect(calls.first.arguments, {'path': path, 'maxSize': 1920, 'fps': 15, 'bitrate': 2500000});
      expect(PlatformScreenRecorder(macOS: true).mime, 'video/quicktime');
    });

    test('a declined prompt or a missing recorder is a board without video', () async {
      m().setMockMethodCallHandler(channel, (call) async => throw PlatformException(code: 'denied'));
      await expectLater(PlatformScreenRecorder(macOS: false).start('${dir.path}/v.mp4'), throwsA(isA<VideoUnavailable>().having((e) => e.reason, 'reason', 'screen recording was not allowed')));
      m().setMockMethodCallHandler(channel, null);
      await expectLater(PlatformScreenRecorder(macOS: false).start('${dir.path}/v.mp4'), throwsA(isA<VideoUnavailable>()));
    });
  });

  testWidgets('FrameVideoRecorder pipes letterboxed frames into ffmpeg and mixes in the voice', (tester) async {
    await tester.runAsync(() async {
      final runs = <List<String>>[];
      final stdin = <int>[];
      Future<Process> start(String exe, List<String> args) async {
        runs.add([exe, ...args]);
        final out = args.last;
        if (runs.length == 1) return _FakeProcess(stdin, onClose: () => File(out).writeAsBytesSync(List.filled(3000, 2)));
        File(out).writeAsBytesSync(List.filled(5000, 3)); // the mixed file
        return _FakeProcess([]);
      }

      final rec = ui.PictureRecorder();
      ui.Canvas(rec).drawRect(const Rect.fromLTWH(0, 0, 40, 20), Paint()..color = const Color(0xFFFF0000));
      final frame = await rec.endRecording().toImage(40, 20);
      final video = FrameVideoRecorder(frames: () async => frame.clone(), width: 32, height: 18, fps: 20, start: start);
      final path = '${dir.path}/lesson.mp4';
      await video.start(path);
      await Future<void>.delayed(const Duration(milliseconds: 300));
      final voice = File('${dir.path}/voice.m4a')..writeAsBytesSync(List.filled(2000, 1));
      expect(await video.stop(voicePath: voice.path), isTrue);

      expect(runs.first, containsAllInOrder(['ffmpeg', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '32x18', '-r', '20', '-i', '-']));
      expect(video.framesWritten, greaterThan(0));
      expect(stdin.length, video.framesWritten * 32 * 18 * 4);
      expect(runs[1], containsAllInOrder(['-i', '$path.video.mp4', '-i', voice.path]));
      expect(File(path).lengthSync(), 5000);
      expect(File('$path.video.mp4').existsSync(), isFalse);
      frame.dispose();
    });
  });

  test('FrameVideoRecorder without ffmpeg is a board without video', () async {
    final video = FrameVideoRecorder(frames: () async => null, start: (exe, args) => throw const ProcessException('ffmpeg', [], 'not found'));
    await expectLater(video.start('${dir.path}/x.mp4'), throwsA(isA<VideoUnavailable>()));
  });

  testWidgets('the share link shows as a QR code with its expiry', (tester) async {
    final link = RecordingLink(url: 'http://test/v1/public/recordings/demo/0123456789abcdef0123456789abcdef', expiresAt: DateTime(2026, 10, 25, 14, 30));
    await tester.pumpWidget(localized('en', Scaffold(body: RecordingLinkDialog(link: link))));
    expect(find.byKey(const Key('rec-link-qr')), findsOneWidget);
    expect(find.text(link.url), findsOneWidget);
    expect(find.textContaining('until 25 Oct, 14:30'), findsOneWidget);
  });
}

class _FakeProcess implements Process {
  _FakeProcess(List<int> sink, {this.onClose}) : _sink = sink {
    stdin = IOSink(_Collect(sink, () {
      onClose?.call();
      _exit.complete(0);
    }));
    if (onClose == null) _exit.complete(0);
  }

  final List<int> _sink;
  final void Function()? onClose;
  final _exit = Completer<int>();

  @override
  late final IOSink stdin;
  @override
  Stream<List<int>> get stdout => const Stream.empty();
  @override
  Stream<List<int>> get stderr => const Stream.empty();
  @override
  Future<int> get exitCode => _exit.future;
  @override
  int get pid => 1;
  @override
  bool kill([ProcessSignal signal = ProcessSignal.sigterm]) => true;

  int get received => _sink.length;
}

class _Collect implements StreamConsumer<List<int>> {
  _Collect(this.out, this.done);
  final List<int> out;
  final void Function() done;

  @override
  Future<void> addStream(Stream<List<int>> stream) async {
    await for (final c in stream) {
      out.addAll(c);
    }
  }

  @override
  Future<void> close() async => done();
}
