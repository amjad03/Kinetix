import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:record/record.dart';

/// Why the board records without sound. Shown to the teacher as
/// "Recording the board without sound: [reason]".
class VoiceUnavailable implements Exception {
  const VoiceUnavailable(this.reason);
  final String reason;
  @override
  String toString() => reason;
}

/// The teacher's voice during a lesson recording. Kept behind this interface so tests can fake
/// it and so a board without a microphone still records its ink.
abstract class VoiceRecorder {
  /// Starts recording to [path] (AAC-LC in an .m4a file). Throws [VoiceUnavailable] when there
  /// is no microphone, permission is denied or the platform cannot record.
  Future<void> start(String path);

  Future<void> pause();

  Future<void> resume();

  /// Stops. Returns whether a usable audio file was written.
  Future<bool> stop();

  Future<void> dispose();
}

/// A board that never records sound (practice boards, unsupported platforms).
class NoVoiceRecorder implements VoiceRecorder {
  const NoVoiceRecorder([this.reason = 'this board cannot record sound']);
  final String reason;
  @override
  Future<void> start(String path) async => throw VoiceUnavailable(reason);
  @override
  Future<void> pause() async {}
  @override
  Future<void> resume() async {}
  @override
  Future<bool> stop() async => false;
  @override
  Future<void> dispose() async {}
}

/// Records the microphone with the `record` package: mono AAC-LC at 22.05 kHz and 48 kbit/s,
/// about 21 MB an hour, plenty for a voice.
///
/// On Linux `record` runs `parecord` (PulseAudio/PipeWire) into `ffmpeg`; when either is
/// missing or there is no input source, the board records ink only.
class MicVoiceRecorder implements VoiceRecorder {
  AudioRecorder? _rec;
  String? _path;

  /// Smaller files are a failed capture (for example parecord exiting at once): an .m4a
  /// header alone is under a kilobyte.
  static const _minBytes = 1024;

  @override
  Future<void> start(String path) async {
    if (kIsWeb || !(Platform.isAndroid || Platform.isWindows || Platform.isLinux || Platform.isMacOS || Platform.isIOS)) {
      throw const VoiceUnavailable('this board cannot record sound');
    }
    final rec = _rec ??= AudioRecorder();
    try {
      if (!await rec.hasPermission()) throw const VoiceUnavailable('the microphone permission was denied');
      final inputs = await rec.listInputDevices();
      // PulseAudio lists each speaker's "monitor" as a source too; that is not a microphone.
      if (inputs.where((d) => !d.id.endsWith('.monitor')).isEmpty) throw const VoiceUnavailable('no microphone found');
      if (!await rec.isEncoderSupported(AudioEncoder.aacLc)) throw const VoiceUnavailable('this board cannot record sound');
      await rec.start(
        const RecordConfig(encoder: AudioEncoder.aacLc, sampleRate: 22050, numChannels: 1, bitRate: 48000, autoGain: true, noiseSuppress: true),
        path: path,
      );
      _path = path;
    } on VoiceUnavailable {
      rethrow;
    } on ProcessException {
      // Linux without pactl, parecord or ffmpeg.
      throw const VoiceUnavailable('no microphone found');
    } catch (_) {
      throw const VoiceUnavailable('the microphone could not be started');
    }
  }

  @override
  Future<void> pause() async {
    try {
      await _rec?.pause();
    } catch (_) {}
  }

  @override
  Future<void> resume() async {
    try {
      await _rec?.resume();
    } catch (_) {}
  }

  @override
  Future<bool> stop() async {
    final path = _path;
    _path = null;
    if (path == null) return false;
    try {
      await _rec?.stop();
    } catch (_) {}
    final f = File(path);
    return f.existsSync() && f.lengthSync() >= _minBytes;
  }

  @override
  Future<void> dispose() async {
    final rec = _rec;
    _rec = null;
    try {
      await rec?.dispose();
    } catch (_) {}
  }
}
