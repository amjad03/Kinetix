import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/core/api_client.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/core/recording/lesson_capture.dart';
import 'package:kinetix_board/core/recording/recording_store.dart';
import 'package:kinetix_board/core/recording/recordings.dart';
import 'package:kinetix_board/core/recording/voice_recorder.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import 'support/recording_fakes.dart';

/// The upload queue against a real folder on disk, as after a restart.
void main() {
  late Directory dir;
  late FakeRecordingsApi server;
  late ApiClient api;
  SessionContext? session;

  SessionContext teacher(String id, {String sessionId = 's1', String name = 'Anita Sharma'}) => SessionContext(
    sessionId: sessionId,
    expiresAt: DateTime.now().add(const Duration(hours: 1)),
    teacherId: id,
    teacherName: name,
    language: 'en',
    sectionName: 'BCom Sem 3 A',
    subjectName: 'Corporate Accounting',
  );

  setUp(() {
    dir = Directory.systemTemp.createTempSync('kx_rec_');
    server = FakeRecordingsApi();
    api = ApiClient(baseUrl: 'http://test', client: MockClient((req) async => await server.handle(req) ?? http.Response('[]', 200)))
      ..sessionToken = 'session';
    session = teacher('t1');
  });

  tearDown(() => dir.deleteSync(recursive: true));

  Recordings recordings() {
    final r = Recordings(store: FileRecordingStore(() async => dir), voice: () => const NoVoiceRecorder())
      ..attach(api: () => api, session: () => session);
    addTearDown(r.dispose);
    return r;
  }

  /// A captured lesson with one stroke, saved to disk with [audioBytes] of "audio".
  Future<CapturedLesson> capture(Recordings recs, String id, {int audioBytes = 0, String? sessionId = 's1'}) async {
    final pages = BoardPages();
    final c = await recs.newCapture(id: id, board: pages, background: BoardBackground.plain, canvas: const Size(1920, 1080));
    if (audioBytes > 0) File(c.audioPath).writeAsBytesSync(List.filled(audioBytes, 7));
    final lesson = await c.start();
    expect(lesson, 'this board cannot record sound');
    pages.current
      ..pointerDown(1, const InkPoint(10, 20))
      ..pointerMove(1, const InkPoint(30, 40))
      ..pointerMove(1, const InkPoint(60, 50))
      ..pointerUp(1);
    final done = await c.stop();
    c.dispose();
    return CapturedLesson(id: id, startedAt: done.startedAt, events: done.events, hasAudio: audioBytes > 0, sessionId: sessionId);
  }

  File file(String id, String name) => File('${dir.path}/$id/$name');

  test('saving uploads create → events → audio → finish(share), then deletes the media', () async {
    final recs = recordings();
    final id = '11111111-1111-4111-8111-111111111111';
    final c = await capture(recs, id, audioBytes: 5000);
    await recs.save(c, title: 'Corporate Accounting · 5 Oct', share: true, teacher: session!);
    await recs.kick();

    expect(server.steps, ['PUT create', 'PUT events', 'PUT audio', 'POST finish']);
    final events = server.requests[1];
    expect(events.headers['content-type'], 'application/octet-stream');
    final log = jsonDecode(utf8.decode(events.bodyBytes)) as Map<String, dynamic>;
    expect(log['v'], 2); // the lesson stream format (packages/kinetix_ink lesson.dart)
    expect(log['canvas'], {'w': 1920, 'h': 1080});
    expect((log['events'] as List).map((e) => (e as List)[1]), containsAll(['L', 'b', 'e']));
    final audio = server.requests[2];
    expect(audio.headers['content-type'], 'audio/mp4');
    expect(audio.bodyBytes, hasLength(5000));
    expect(jsonDecode(server.requests[3].body), {'durationMs': c.durationMs, 'share': true});

    final r = recs.items.single;
    expect(recs.statusOf(r), RecordingStatus.shared);
    expect(file(id, 'events.json').existsSync(), isFalse);
    expect(file(id, 'audio.m4a').existsSync(), isFalse);
    expect(jsonDecode(file(id, 'meta.json').readAsStringSync())['finishedAt'], isNotNull);
  });

  test('a recording made offline survives a restart and uploads when its teacher signs in', () async {
    session = null; // the class ended before the board could upload
    final first = recordings();
    final id = '22222222-2222-4222-8222-222222222222';
    final c = await capture(first, id);
    await first.save(c, title: 'Lesson', share: true, teacher: teacher('t1'));
    await first.kick();
    expect(server.requests, isEmpty);
    expect(first.statusOf(first.items.single), RecordingStatus.waiting);

    // Restart. Another teacher signs in: not theirs to upload.
    final second = recordings();
    session = teacher('t2', sessionId: 's2', name: 'Ravi Kumar');
    await second.load();
    expect(second.items.single.title, 'Lesson');
    await second.kick();
    expect(server.requests, isEmpty);

    // The teacher who recorded it signs in for a later class.
    session = teacher('t1', sessionId: 's3');
    await second.kick();
    expect(server.steps, ['PUT create', 'PUT events', 'POST finish']);
    // Created in a later class, so it is not shared automatically.
    expect(jsonDecode(server.requests.last.body)['share'], isFalse);
    final r = second.items.single;
    expect(second.statusOf(r), RecordingStatus.uploaded);
    expect(r.notShared, contains('later class'));

    // Uploaded-but-unshared: the teacher shares it from the list.
    await second.share(id);
    expect(second.statusOf(second.items.single), RecordingStatus.shared);
  });

  test('"already finished" counts as done; a network error retries later', () async {
    final recs = recordings();
    final id = '33333333-3333-4333-8333-333333333333';
    final c = await capture(recs, id, audioBytes: 2000);

    server.failNext['events'] = [503];
    await recs.save(c, title: 'Lesson', share: false, teacher: session!);
    await recs.kick();
    final r = recs.items.single;
    expect(recs.statusOf(r), RecordingStatus.waiting);
    expect(r.error, 'Failed (503)');
    expect(Recordings.backoff(1), const Duration(seconds: 5));
    expect(Recordings.backoff(3), const Duration(seconds: 20));
    expect(Recordings.backoff(20), const Duration(minutes: 5));

    // Meanwhile another board session finished it.
    server.recs[id]!['finishedAt'] = DateTime.now().toUtc().toIso8601String();
    await recs.retry(id);
    expect(server.steps, ['PUT create', 'PUT events', 'PUT events', 'POST finish']);
    expect(recs.statusOf(recs.items.single), RecordingStatus.uploaded);
  });

  test('without a timetabled class it uploads unshared; a refused upload waits for Retry', () async {
    server.sectionName = null;
    final recs = recordings();
    final c = await capture(recs, '44444444-4444-4444-8444-444444444444');
    await recs.save(c, title: 'Lesson', share: true, teacher: session!);
    await recs.kick();
    final r = recs.items.single;
    expect(recs.statusOf(r), RecordingStatus.uploaded);
    expect(r.notShared, contains('no one to share it with'));

    server.failNext['audio'] = [413];
    final big = await capture(recs, '55555555-5555-4555-8555-555555555555', audioBytes: 3000);
    await recs.save(big, title: 'Long lesson', share: false, teacher: session!);
    await recs.kick();
    final failed = recs.items.first;
    expect(recs.statusOf(failed), RecordingStatus.failed);
    expect(file(failed.id, 'audio.m4a').existsSync(), isTrue, reason: 'kept until it uploads');
    await recs.retry(failed.id);
    expect(recs.statusOf(recs.items.first), RecordingStatus.uploaded);
  });

  test('uploaded recordings are forgotten after a week; unsaved captures are cleaned up', () async {
    final recs = recordings();
    final c = await capture(recs, '66666666-6666-4666-8666-666666666666');
    await recs.save(c, title: 'Old lesson', share: false, teacher: session!);
    await recs.kick();
    await recs.newCapture(id: 'orphan', board: BoardPages(), background: BoardBackground.plain, canvas: const Size(10, 10));
    expect(Directory('${dir.path}/orphan').existsSync(), isTrue);

    final later = Recordings(store: FileRecordingStore(() async => dir), clock: () => DateTime.now().add(const Duration(days: 8)));
    await later.load();
    expect(later.items, isEmpty);
    expect(dir.listSync(), isEmpty);
  });
}
