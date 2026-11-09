import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

/// The board's own crash log, in the app's storage (`logs/crash.log`), never sent anywhere:
/// what went wrong, when, and where in the code, for whoever looks after the board. It rotates
/// at [maxBytes] (`crash.1.log`, `crash.2.log` …, [keep] files in all), so it never fills the
/// panel. The Classroom edition's backups carry it.
class CrashLog {
  CrashLog({Future<Directory> Function()? dir, this.maxBytes = 256 * 1024, this.keep = 3, DateTime Function()? now})
    : _dir = dir ?? _defaultDir,
      _now = now ?? DateTime.now;

  /// The log the app writes to. Tests replace it.
  static CrashLog instance = CrashLog();

  static Future<Directory> _defaultDir() async => Directory('${(await getApplicationSupportDirectory()).path}${Platform.pathSeparator}logs');

  final Future<Directory> Function() _dir;
  final DateTime Function() _now;
  final int maxBytes, keep;

  /// Stack lines kept per entry.
  static const stackLines = 40;

  Future<void> _last = Future.value();

  Future<Directory> dir() async {
    final d = await _dir();
    await d.create(recursive: true);
    return d;
  }

  File _file(Directory d, int i) => File('${d.path}${Platform.pathSeparator}${i == 0 ? 'crash.log' : 'crash.$i.log'}');

  /// Adds an entry; one write at a time, and a failure to write is never thrown.
  Future<void> record(Object error, StackTrace? stack, {String source = '', bool fatal = false, String? app}) {
    final entry = StringBuffer()
      ..writeln('--- ${_now().toIso8601String()} ${fatal ? 'FATAL' : 'error'}${source.isEmpty ? '' : ' · $source'}${app == null ? '' : ' · $app'}')
      ..writeln('$error'.trim());
    final lines = '${stack ?? ''}'.trim().split('\n').where((l) => l.trim().isNotEmpty).take(stackLines);
    for (final l in lines) {
      entry.writeln('  $l');
    }
    return _last = _last.then((_) => _append(entry.toString())).catchError((Object e) => debugPrint('Crash log not written: $e'));
  }

  Future<void> _append(String text) async {
    final d = await dir();
    final f = _file(d, 0);
    if (await f.exists() && await f.length() + text.length > maxBytes) await _rotate(d);
    await f.writeAsString(text, mode: FileMode.append, flush: true);
  }

  Future<void> _rotate(Directory d) async {
    for (var i = keep - 1; i >= 1; i--) {
      final from = _file(d, i - 1);
      if (await from.exists()) await from.rename(_file(d, i).path);
    }
  }

  /// The log files there are, newest first.
  Future<List<File>> files() async {
    await _last;
    try {
      final d = await dir();
      return [
        for (var i = 0; i < keep; i++)
          if (await _file(d, i).exists()) _file(d, i),
      ];
    } catch (_) {
      return const [];
    }
  }

  /// The whole log, oldest entries first.
  Future<String> readAll() async {
    final out = StringBuffer();
    for (final f in (await files()).reversed) {
      out.write(await f.readAsString());
    }
    return out.toString();
  }
}
