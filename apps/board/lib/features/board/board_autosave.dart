import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:path_provider/path_provider.dart';

/// Where the autosaved board is kept.
abstract class AutosaveStore {
  /// The board last written, or null.
  Future<String?> read();
  Future<void> write(String data);
  Future<void> clear();
}

/// A file in the app's own folder (application support: not the teacher's Documents), written
/// beside itself and renamed into place, so a power cut mid-write keeps the copy before.
class FileAutosaveStore implements AutosaveStore {
  FileAutosaveStore({Future<Directory> Function()? dir}) : _dir = dir ?? getApplicationSupportDirectory;

  final Future<Directory> Function() _dir;

  Future<File> _file() async {
    final dir = await _dir();
    await dir.create(recursive: true);
    return File('${dir.path}${Platform.pathSeparator}autosave_board.json');
  }

  @override
  Future<String?> read() async {
    final f = await _file();
    return await f.exists() ? f.readAsString() : null;
  }

  @override
  Future<void> write(String data) async {
    final f = await _file();
    final tmp = File('${f.path}.tmp');
    await tmp.writeAsString(data, flush: true);
    await tmp.rename(f.path);
  }

  @override
  Future<void> clear() async {
    final f = await _file();
    if (await f.exists()) await f.delete();
  }
}

/// For tests and boards without a file system.
class MemoryAutosaveStore implements AutosaveStore {
  String? data;
  int writes = 0;

  @override
  Future<String?> read() async => data;

  @override
  Future<void> write(String data) async {
    this.data = data;
    writes++;
  }

  @override
  Future<void> clear() async => data = null;
}

/// Autosave: the open board is kept on this device a moment after each change and when the app
/// is put away, so a crash, a power cut or a closed app loses nothing; the next start brings it
/// back ([start]). A blank board (End class, New) clears it at once, so the next class starts
/// clean. Saving to "Your Whiteboards" in the cloud is separate (signed-in teachers).
class BoardAutosave {
  BoardAutosave({required this.wb, required this.snapshot, AutosaveStore? store, this.delay = const Duration(seconds: 2)}) : _store = store ?? defaultStore;

  /// The store new boards use. Tests replace it with a [MemoryAutosaveStore].
  static AutosaveStore defaultStore = FileAutosaveStore();

  final WhiteboardController wb;

  /// The board as it stands (pages, papers, 3D notes).
  final SavedBoard Function() snapshot;
  final AutosaveStore _store;

  /// How long after the last change it writes.
  final Duration delay;

  Timer? _timer;
  bool _dirty = false;
  bool _started = false, _disposed = false;

  /// Nothing is kept now (cleared, or nothing was there): a blank board need not clear again.
  bool _empty = false;
  Future<void> _last = Future.value();

  /// Something on the board changed: written after [delay], or cleared now when the board is blank.
  void changed() {
    _timer?.cancel();
    _timer = null;
    if (wb.isBlank) {
      _dirty = false;
      if (!_empty) _queue(_store.clear);
      _empty = true;
      return;
    }
    _dirty = true;
    _timer = Timer(delay, () => unawaited(flush()));
  }

  /// Writes any change now (the app is being put away); completes when it is on disk.
  Future<void> flush() {
    _timer?.cancel();
    _timer = null;
    if (!_dirty) return _last;
    _dirty = false;
    _empty = false;
    final String data;
    try {
      data = jsonEncode(snapshot().toJson());
    } catch (e) {
      debugPrint('Autosave: board not encoded: $e');
      return _last;
    }
    return _queue(() => _store.write(data));
  }

  /// One write at a time, in order; a failure is reported, not thrown.
  Future<void> _queue(Future<void> Function() f) => _last = _last.then((_) => f()).catchError((Object e) => debugPrint('Autosave: $e'));

  /// Reads the board kept last time (null: none, blank or unreadable), then keeps this board
  /// from now on. Nothing is written or cleared before, so the board kept last time is never
  /// lost to the blank board the app opens on.
  Future<SavedBoard?> start() async {
    if (_started) return null;
    _started = true;
    SavedBoard? saved;
    try {
      final data = await _store.read();
      _empty = data == null || data.isEmpty;
      if (!_empty) {
        final b = SavedBoard.fromJson((jsonDecode(data!) as Map).cast<String, dynamic>());
        if (b.pages.any((p) => p.isNotEmpty)) saved = b;
      }
    } catch (e) {
      debugPrint('Autosave: last board not read: $e');
    }
    if (_disposed) return null;
    wb.committed.addListener(changed);
    // Written on before the read finished: keep that.
    if (!wb.isBlank) changed();
    return saved;
  }

  /// Stops listening and writes what is waiting.
  Future<void> dispose() {
    _disposed = true;
    if (_started) wb.committed.removeListener(changed);
    return flush();
  }
}
