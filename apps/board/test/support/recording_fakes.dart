import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:kinetix_board/core/recording/recording_store.dart';
import 'package:kinetix_board/core/recording/screen_video_recorder.dart';
import 'package:kinetix_board/core/recording/voice_recorder.dart';

/// A screen recorder that "records" [bytes] of video into a [MemoryRecordingStore] (mem://
/// paths) or a real file, or fails like a board that cannot record video.
class FakeVideoRecorder implements ScreenVideoRecorder {
  FakeVideoRecorder({this.store, this.capturesMic = true, this.unavailable, this.bytes = 20000});

  final MemoryRecordingStore? store;
  @override
  final bool capturesMic;
  final String? unavailable;
  final int bytes;
  final List<String> calls = [];
  String? _path;
  String? voicePath;

  @override
  String get extension => 'mp4';
  @override
  String get mime => 'video/mp4';

  @override
  Future<void> start(String path) async {
    calls.add('start');
    if (unavailable != null) throw VideoUnavailable(unavailable!);
    _path = path;
  }

  @override
  Future<void> pause() async => calls.add('pause');
  @override
  Future<void> resume() async => calls.add('resume');

  @override
  Future<bool> stop({String? voicePath}) async {
    calls.add('stop');
    this.voicePath = voicePath;
    final path = _path;
    if (path == null) return false;
    final data = Uint8List.fromList(List.generate(bytes, (i) => i % 253));
    if (path.startsWith('mem://')) {
      store?.video[Uri.parse(path).host] = data;
    } else {
      File(path).writeAsBytesSync(data);
    }
    return true;
  }

  @override
  Future<void> dispose() async => calls.add('dispose');
}

/// Recordings kept in memory, for widget tests (real file I/O does not run under fake time).
class MemoryRecordingStore implements RecordingStore {
  final Map<String, Map<String, dynamic>> metas = {};
  final Map<String, Uint8List> events = {};
  final Map<String, Uint8List> audio = {};
  final Map<String, Uint8List> video = {};
  final Set<String> prepared = {};

  @override
  Future<List<Map<String, dynamic>>> loadAll() async => [for (final m in metas.values) jsonDecode(jsonEncode(m)) as Map<String, dynamic>];
  @override
  Future<String> prepare(String id) async {
    prepared.add(id);
    return 'mem://$id/audio.m4a';
  }

  @override
  Future<void> writeMeta(String id, Map<String, dynamic> meta) async => metas[id] = jsonDecode(jsonEncode(meta)) as Map<String, dynamic>;
  @override
  Future<void> writeEvents(String id, Uint8List json) async => events[id] = json;
  @override
  Future<Uint8List> readEvents(String id) async => events[id]!;
  @override
  Future<int?> audioLength(String id) async => audio[id]?.length;
  @override
  Stream<List<int>> readAudio(String id) =>
      Stream.fromIterable([audio[id]!.sublist(0, audio[id]!.length ~/ 2), audio[id]!.sublist(audio[id]!.length ~/ 2)]);
  @override
  Future<String> prepareVideo(String id, String extension) async => 'mem://$id/video.$extension';
  @override
  Future<int?> videoLength(String id) async => video[id]?.length;
  @override
  Future<Uint8List> readVideo(String id, int offset, int length) async {
    final v = video[id]!;
    return Uint8List.sublistView(v, offset, offset + length > v.length ? v.length : offset + length);
  }

  @override
  Future<void> deleteMedia(String id) async {
    events.remove(id);
    audio.remove(id);
    video.remove(id);
  }

  @override
  Future<void> delete(String id) async {
    metas.remove(id);
    prepared.remove(id);
    await deleteMedia(id);
  }
}

/// A microphone that "records" by putting bytes in a [MemoryRecordingStore], or has none.
class FakeVoiceRecorder implements VoiceRecorder {
  FakeVoiceRecorder({this.store, this.unavailable});

  final MemoryRecordingStore? store;

  /// When set, [start] fails like a board without a microphone.
  final String? unavailable;
  final List<String> calls = [];
  String? _id;

  @override
  Future<void> start(String path) async {
    calls.add('start');
    if (unavailable != null) throw VoiceUnavailable(unavailable!);
    _id = Uri.parse(path).host;
  }

  @override
  Future<void> pause() async => calls.add('pause');
  @override
  Future<void> resume() async => calls.add('resume');
  @override
  Future<bool> stop() async {
    calls.add('stop');
    if (_id == null) return false;
    store?.audio[_id!] = Uint8List.fromList(List.generate(4000, (i) => i % 251));
    return true;
  }

  @override
  Future<void> dispose() async => calls.add('dispose');
}

/// A fake recordings API: records each request, and answers like services/api.
class FakeRecordingsApi {
  final List<http.Request> requests = [];
  final Map<String, Map<String, dynamic>> recs = {};

  /// Lecture video chunks received, by recording and chunk number.
  final Map<String, Map<int, List<int>>> videoChunks = {};
  String? sectionName = 'BCom Sem 3 A';

  /// Status to answer for a path suffix (e.g. 'events' → 500), once per entry.
  final Map<String, List<int>> failNext = {};

  List<String> get steps => [
    for (final r in requests)
      if (r.url.path.startsWith('/v1/recordings/')) '${r.method} ${r.url.pathSegments.length > 3 ? r.url.pathSegments[3] : 'create'}',
  ];

  Map<String, dynamic> _view(String id) => {
    'id': id,
    ...recs[id]!,
    'sectionId': sectionName == null ? null : 'sec-1',
    'sectionName': sectionName,
    'subjectName': 'Corporate Accounting',
  };

  Future<http.Response?> handle(http.Request req) async {
    final seg = req.url.pathSegments;
    if (seg.length < 2 || seg[1] != 'recordings') return null;
    requests.add(req);
    if (seg.length == 2 && req.method == 'GET') return http.Response(jsonEncode([for (final id in recs.keys) _view(id)]), 200);
    final id = seg[2];
    final step = seg.length > 3 ? seg[3] : 'create';
    final fail = failNext[step];
    if (fail != null && fail.isNotEmpty) {
      final status = fail.removeAt(0);
      return http.Response(jsonEncode({'message': status == 400 ? 'This recording is already finished' : 'Failed ($status)'}), status);
    }
    switch (step) {
      case 'create':
        final b = jsonDecode(req.body) as Map<String, dynamic>;
        recs.putIfAbsent(
          id,
          () => {'title': b['title'], 'startedAt': b['startedAt'], 'durationMs': null, 'hasAudio': false, 'sharedAt': null, 'finishedAt': null},
        );
        if (recs[id]!['finishedAt'] == null) recs[id]!['title'] = b['title'];
        return http.Response(jsonEncode(_view(id)), 200);
      case 'events':
        if (recs[id]?['finishedAt'] != null) return http.Response('{"message":"This recording is already finished"}', 400);
        return http.Response('', 204);
      case 'audio':
        if (recs[id]?['finishedAt'] != null) return http.Response('{"message":"This recording is already finished"}', 400);
        recs[id]!['hasAudio'] = true;
        return http.Response('', 204);
      case 'finish':
        final b = jsonDecode(req.body) as Map<String, dynamic>;
        if (b['share'] == true && sectionName == null) {
          return http.Response('{"message":"This recording was not made with a class, so there is no one to share it with"}', 403);
        }
        recs[id]!['finishedAt'] ??= DateTime.now().toUtc().toIso8601String();
        recs[id]!['durationMs'] = b['durationMs'];
        if (b['share'] == true) recs[id]!['sharedAt'] = DateTime.now().toUtc().toIso8601String();
        return http.Response(jsonEncode(_view(id)), 200);
      case 'share':
        recs[id]!['sharedAt'] = DateTime.now().toUtc().toIso8601String();
        return http.Response(jsonEncode(_view(id)), 200);
      case 'video':
        if (recs[id]?['finishedAt'] != null) return http.Response('{"message":"This recording is already finished"}', 400);
        if (seg[4] == 'chunks') {
          (videoChunks[id] ??= {})[int.parse(seg[5])] = req.bodyBytes;
          return http.Response('', 204);
        }
        final b = jsonDecode(req.body) as Map<String, dynamic>;
        final got = videoChunks[id] ?? {};
        if (got.length != b['chunks']) return http.Response('{"message":"Video chunks missing"}', 400);
        recs[id]!['hasVideo'] = true;
        recs[id]!['videoMime'] = b['mime'];
        return http.Response(jsonEncode(_view(id)), 200);
      case 'share-links':
        if (recs[id]?['sharedAt'] == null) return http.Response('{"message":"Share the recording with the class before making a link"}', 400);
        final b = jsonDecode(req.body) as Map<String, dynamic>;
        return http.Response(
          jsonEncode({
            'url': 'http://test/v1/public/recordings/demo/0123456789abcdef0123456789abcdef',
            'expiresAt': DateTime.now().toUtc().add(Duration(hours: b['expiresInHours'] as int)).toIso8601String(),
          }),
          201,
        );
    }
    return http.Response('{"message":"Not found"}', 404);
  }
}
