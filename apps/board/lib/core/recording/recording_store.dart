import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';

/// Where lesson recordings wait for upload. One folder per recording:
///
/// ```
/// <app support>/recordings/<id>/meta.json     what the upload queue knows (LocalRecording)
///                               events.json   the ink event log
///                               audio.m4a     the teacher's voice, when there is any
/// ```
abstract class RecordingStore {
  /// Every saved recording's metadata. Folders without metadata are recordings that never got
  /// saved (the app closed mid-lesson); they are removed.
  Future<List<Map<String, dynamic>>> loadAll();

  /// Makes room for a new recording and returns the path its audio is recorded to.
  Future<String> prepare(String id);

  Future<void> writeMeta(String id, Map<String, dynamic> meta);

  Future<void> writeEvents(String id, Uint8List json);

  Future<Uint8List> readEvents(String id);

  /// The size of the recorded audio, or null when there is none.
  Future<int?> audioLength(String id);

  Stream<List<int>> readAudio(String id);

  /// Removes the event log and audio (after upload), keeping the metadata.
  Future<void> deleteMedia(String id);

  /// Removes everything about the recording.
  Future<void> delete(String id);
}

class FileRecordingStore implements RecordingStore {
  FileRecordingStore([Future<Directory> Function()? root]) : _rootFn = root ?? _defaultRoot;

  final Future<Directory> Function() _rootFn;
  Directory? _root;

  static Future<Directory> _defaultRoot() async => Directory('${(await getApplicationSupportDirectory()).path}${Platform.pathSeparator}recordings');

  Future<Directory> get _dir async => _root ??= await (await _rootFn()).create(recursive: true);

  Future<File> _file(String id, String name) async => File('${(await _dir).path}${Platform.pathSeparator}$id${Platform.pathSeparator}$name');

  @override
  Future<List<Map<String, dynamic>>> loadAll() async {
    final out = <Map<String, dynamic>>[];
    await for (final e in (await _dir).list()) {
      if (e is! Directory) continue;
      final meta = File('${e.path}${Platform.pathSeparator}meta.json');
      try {
        if (await meta.exists()) {
          out.add(jsonDecode(await meta.readAsString()) as Map<String, dynamic>);
        } else {
          await e.delete(recursive: true);
        }
      } catch (_) {
        // A damaged metadata file: leave it for a person to look at rather than lose audio.
      }
    }
    return out;
  }

  @override
  Future<String> prepare(String id) async {
    final audio = await _file(id, 'audio.m4a');
    await audio.parent.create(recursive: true);
    return audio.path;
  }

  @override
  Future<void> writeMeta(String id, Map<String, dynamic> meta) async {
    final f = await _file(id, 'meta.json');
    await f.parent.create(recursive: true);
    // Write then rename, so a power cut never leaves half a file.
    final tmp = File('${f.path}.tmp');
    await tmp.writeAsString(jsonEncode(meta), flush: true);
    await tmp.rename(f.path);
  }

  @override
  Future<void> writeEvents(String id, Uint8List json) async {
    final f = await _file(id, 'events.json');
    await f.parent.create(recursive: true);
    await f.writeAsBytes(json, flush: true);
  }

  @override
  Future<Uint8List> readEvents(String id) async => (await _file(id, 'events.json')).readAsBytes();

  @override
  Future<int?> audioLength(String id) async {
    final f = await _file(id, 'audio.m4a');
    return await f.exists() ? f.length() : null;
  }

  @override
  Stream<List<int>> readAudio(String id) async* {
    yield* (await _file(id, 'audio.m4a')).openRead();
  }

  @override
  Future<void> deleteMedia(String id) async {
    for (final name in ['events.json', 'audio.m4a']) {
      final f = await _file(id, name);
      if (await f.exists()) await f.delete();
    }
  }

  @override
  Future<void> delete(String id) async {
    final d = (await _file(id, 'meta.json')).parent;
    if (await d.exists()) await d.delete(recursive: true);
  }
}
