import 'dart:convert';
import 'dart:io' show gzip;
import 'dart:isolate';

import 'package:flutter/foundation.dart';

/// Heavy decoding off the UI isolate, so a slow panel keeps drawing while the lessons and the
/// question bank are read (a chapter is up to a few MB of JSON once unzipped; a subject's bank
/// more).
abstract final class OffThread {
  /// Whether work goes to another isolate. Widget tests turn it off
  /// (test/flutter_test_config.dart): their fake clock cannot wait for an isolate.
  static bool enabled = true;

  /// Runs [work] on another isolate ([Isolate.run]) and answers its result. [work] must not
  /// capture anything that cannot be sent (no widgets, no `this` of a stateful object).
  static Future<T> run<T>(T Function() work, {String? debugName}) => enabled ? Isolate.run(work, debugName: debugName) : Future.sync(work);
}

/// JSON from bytes that may be gzipped (by their magic number).
Object? decodeJsonBytes(Uint8List bytes) =>
    jsonDecode(utf8.decode(bytes.length > 2 && bytes[0] == 0x1f && bytes[1] == 0x8b ? gzip.decode(bytes) : bytes));

/// [decodeJsonBytes] off the UI isolate.
Future<Object?> decodeJsonOffThread(Uint8List bytes, {String? debugName}) => OffThread.run(() => decodeJsonBytes(bytes), debugName: debugName);

/// JSON text off the UI isolate.
Future<Object?> decodeJsonTextOffThread(String text, {String? debugName}) => OffThread.run(() => jsonDecode(text), debugName: debugName);
