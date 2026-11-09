import 'dart:io';
import 'dart:typed_data';

import 'package:path_provider/path_provider.dart';

/// Where the past papers live: files by path under `past_papers/` in the app's storage
/// ([DirPaperStorage]); tests use [MemoryPaperStorage].
abstract class PaperStorage {
  Future<Uint8List?> read(String path);
  Future<void> write(String path, List<int> bytes);
  Future<void> delete(String path);

  /// Removes every file whose path starts with [prefix] ("papers/ab12/").
  Future<void> deleteAll(String prefix);

  /// Bytes free on the storage, when known (imports stop before the board fills up).
  Future<int?> freeBytes() async => null;
}

/// Files under [root] (normally `<app support>/past_papers`).
class DirPaperStorage extends PaperStorage {
  DirPaperStorage(this.root);

  final Directory root;

  /// `past_papers/` in the app's own storage (not visible to other apps, kept on update).
  static Future<DirPaperStorage> appStorage() async => DirPaperStorage(Directory('${(await getApplicationSupportDirectory()).path}/past_papers'));

  File _file(String path) {
    if (path.contains('..') || path.startsWith('/')) throw ArgumentError.value(path, 'path', 'not inside past_papers/');
    return File('${root.path}/$path');
  }

  @override
  Future<Uint8List?> read(String path) async {
    final f = _file(path);
    return await f.exists() ? f.readAsBytes() : null;
  }

  @override
  Future<void> write(String path, List<int> bytes) async {
    final f = _file(path);
    await f.parent.create(recursive: true);
    // Written next to it first, so a full disk or a pulled plug never leaves half an index.
    final tmp = File('${f.path}.part');
    await tmp.writeAsBytes(bytes, flush: true);
    await tmp.rename(f.path);
  }

  @override
  Future<void> delete(String path) async {
    final f = _file(path);
    if (await f.exists()) await f.delete();
  }

  @override
  Future<void> deleteAll(String prefix) async {
    final d = Directory('${root.path}/$prefix');
    if (prefix.isNotEmpty && !prefix.contains('..') && await d.exists()) await d.delete(recursive: true);
  }
}

/// Files in memory (tests, previews).
class MemoryPaperStorage extends PaperStorage {
  final files = <String, Uint8List>{};

  @override
  Future<Uint8List?> read(String path) async => files[path];

  @override
  Future<void> write(String path, List<int> bytes) async => files[path] = Uint8List.fromList(bytes);

  @override
  Future<void> delete(String path) async => files.remove(path);

  @override
  Future<void> deleteAll(String prefix) async => files.removeWhere((k, _) => k.startsWith(prefix));
}
