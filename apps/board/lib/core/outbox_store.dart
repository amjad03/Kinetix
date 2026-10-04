import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Where the board keeps classroom operations (attendance, participation) until KINETIX Cloud
/// has them, so a crash, a restart or a dead network never loses a mark.
abstract class OutboxStore {
  Future<List<Map<String, dynamic>>> load();
  Future<void> save(List<Map<String, dynamic>> ops);
}

/// A JSON file in the app's support directory, replaced atomically on every change.
class FileOutboxStore implements OutboxStore {
  FileOutboxStore([Future<Directory> Function()? dir]) : _dirFn = dir ?? getApplicationSupportDirectory;

  final Future<Directory> Function() _dirFn;

  Future<File> get _file async => File('${(await _dirFn()).path}${Platform.pathSeparator}outbox.json');

  @override
  Future<List<Map<String, dynamic>>> load() async {
    try {
      final f = await _file;
      if (!await f.exists()) return [];
      return [for (final op in jsonDecode(await f.readAsString()) as List<dynamic>) Map<String, dynamic>.from(op as Map)];
    } catch (_) {
      return []; // a damaged file must not stop the board from starting
    }
  }

  @override
  Future<void> save(List<Map<String, dynamic>> ops) async {
    final f = await _file;
    await f.parent.create(recursive: true);
    final tmp = File('${f.path}.tmp');
    await tmp.writeAsString(jsonEncode(ops), flush: true);
    await tmp.rename(f.path);
  }
}

/// For tests and boards used without registering.
class MemoryOutboxStore implements OutboxStore {
  List<Map<String, dynamic>> ops = [];

  @override
  Future<List<Map<String, dynamic>>> load() async => [for (final op in ops) Map.of(op)];

  @override
  Future<void> save(List<Map<String, dynamic>> ops) async => this.ops = [for (final op in ops) Map.of(op)];
}
