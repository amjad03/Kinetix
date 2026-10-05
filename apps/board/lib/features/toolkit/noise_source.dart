import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:record/record.dart';

/// Why the noise meter cannot listen.
enum NoiseProblem { permission, noMicrophone, unavailable }

class NoiseUnavailable implements Exception {
  const NoiseUnavailable(this.problem);
  final NoiseProblem problem;
  @override
  String toString() => 'NoiseUnavailable(${problem.name})';
}

/// The room's sound level for the noise meter: 0 (silent) to 1 (very loud), a few times a
/// second. Only the level is worked out, on the board; nothing is recorded, kept or sent.
abstract class NoiseSource {
  /// Starts listening. Throws [NoiseUnavailable].
  Future<Stream<double>> start();
  Future<void> stop();
  Future<void> dispose();
}

/// The sound level of 16-bit little-endian PCM: its RMS in dBFS, from −60 dB (a quiet room) to
/// 0 dB (clipping), as 0 to 1.
double pcm16Level(Uint8List pcm) {
  final n = pcm.length ~/ 2;
  if (n == 0) return 0;
  final data = ByteData.sublistView(pcm);
  var sum = 0.0;
  for (var i = 0; i < n; i++) {
    final s = data.getInt16(i * 2, Endian.little) / 32768;
    sum += s * s;
  }
  final rms = math.sqrt(sum / n);
  if (rms <= 0) return 0;
  final db = 20 * math.log(rms) / math.ln10;
  return ((db + 60) / 60).clamp(0.0, 1.0);
}

/// The board's microphone through the `record` package's PCM stream. Automatic gain and noise
/// suppression are off, so a loud class reads as loud.
class MicNoiseSource implements NoiseSource {
  AudioRecorder? _rec;
  StreamSubscription<Uint8List>? _sub;
  StreamController<double>? _out;

  static const _config = RecordConfig(encoder: AudioEncoder.pcm16bits, sampleRate: 16000, numChannels: 1);

  @override
  Future<Stream<double>> start() async {
    if (kIsWeb || !(Platform.isAndroid || Platform.isWindows || Platform.isLinux || Platform.isMacOS || Platform.isIOS)) {
      throw const NoiseUnavailable(NoiseProblem.unavailable);
    }
    final rec = _rec ??= AudioRecorder();
    final Stream<Uint8List> pcm;
    try {
      if (!await rec.hasPermission()) throw const NoiseUnavailable(NoiseProblem.permission);
      pcm = await rec.startStream(_config);
    } on NoiseUnavailable {
      rethrow;
    } on ProcessException {
      throw const NoiseUnavailable(NoiseProblem.noMicrophone);
    } catch (_) {
      // Includes the microphone being held by class audio or a recording the platform won't share.
      throw const NoiseUnavailable(NoiseProblem.unavailable);
    }
    final out = _out = StreamController<double>();
    // About six readings a second: 16 kHz mono, 16-bit, so 5 333 bytes each.
    final buffer = BytesBuilder(copy: false);
    _sub = pcm.listen((chunk) {
      buffer.add(chunk);
      if (buffer.length >= 5334) out.add(pcm16Level(buffer.takeBytes()));
    }, onError: (Object _) {});
    return out.stream;
  }

  @override
  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
    await _out?.close();
    _out = null;
    try {
      await _rec?.stop();
    } catch (_) {}
  }

  @override
  Future<void> dispose() async {
    await stop();
    final rec = _rec;
    _rec = null;
    try {
      await rec?.dispose();
    } catch (_) {}
  }
}
