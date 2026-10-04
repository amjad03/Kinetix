import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:kinetix_ink/kinetix_ink.dart' show LiveAudioCodec;
import 'package:record/record.dart';

import '../recording/voice_recorder.dart' show VoiceUnavailable;

/// The board's microphone as a live stream for class audio: mono 16-bit little-endian PCM at
/// 16 kHz. Kept behind this interface so tests can fake it and so a board without a
/// microphone simply has no class audio. Failures throw [VoiceUnavailable] with the same
/// English reasons as the lesson recorder (shown via `voiceReason`).
abstract class MicCapture {
  /// Checks that there is a microphone and permission to use it, without capturing.
  Future<void> check();

  /// Starts capturing. The stream delivers PCM bytes in any sizes until [stop].
  Future<Stream<Uint8List>> start();

  Future<void> stop();

  Future<void> dispose();
}

/// A board that never sends class audio (unsupported platforms).
class NoMicCapture implements MicCapture {
  const NoMicCapture([this.reason = 'this board cannot record sound']);
  final String reason;
  @override
  Future<void> check() async => throw VoiceUnavailable(reason);
  @override
  Future<Stream<Uint8List>> start() async => throw VoiceUnavailable(reason);
  @override
  Future<void> stop() async {}
  @override
  Future<void> dispose() async {}
}

/// Captures the microphone with the `record` package's PCM stream, with the platform's echo
/// cancellation, noise suppression and automatic gain where it has them.
///
/// The lesson recorder (`MicVoiceRecorder`) may be recording the same microphone to a file at
/// the same time. This uses its own [AudioRecorder], so it simply tries a second capture:
/// Windows and recent Android versions usually allow it (Android may give one of the two
/// captures silence), older Android panels may refuse. When the start fails the teacher is
/// told class audio isn't available and it stays off; the lesson recording carries on.
class RecordMicCapture implements MicCapture {
  AudioRecorder? _rec;

  static const _config = RecordConfig(
    encoder: AudioEncoder.pcm16bits,
    sampleRate: LiveAudioCodec.sampleRate,
    numChannels: 1,
    autoGain: true,
    echoCancel: true,
    noiseSuppress: true,
  );

  bool get _platformOk =>
      !kIsWeb && (Platform.isAndroid || Platform.isWindows || Platform.isLinux || Platform.isMacOS || Platform.isIOS);

  @override
  Future<void> check() async {
    if (!_platformOk) throw const VoiceUnavailable('this board cannot record sound');
    final rec = _rec ??= AudioRecorder();
    try {
      if (!await rec.hasPermission()) throw const VoiceUnavailable('the microphone permission was denied');
      final inputs = await rec.listInputDevices();
      // PulseAudio lists each speaker's "monitor" as a source too; that is not a microphone.
      if (inputs.where((d) => !d.id.endsWith('.monitor')).isEmpty) throw const VoiceUnavailable('no microphone found');
      if (!await rec.isEncoderSupported(AudioEncoder.pcm16bits)) throw const VoiceUnavailable('this board cannot record sound');
    } on VoiceUnavailable {
      rethrow;
    } on ProcessException {
      throw const VoiceUnavailable('no microphone found');
    } catch (_) {
      throw const VoiceUnavailable('the microphone could not be started');
    }
  }

  @override
  Future<Stream<Uint8List>> start() async {
    if (!_platformOk) throw const VoiceUnavailable('this board cannot record sound');
    final rec = _rec ??= AudioRecorder();
    try {
      if (!await rec.hasPermission()) throw const VoiceUnavailable('the microphone permission was denied');
      return await rec.startStream(_config);
    } on VoiceUnavailable {
      rethrow;
    } on ProcessException {
      throw const VoiceUnavailable('no microphone found');
    } catch (_) {
      // Includes the microphone being held by another capture the platform won't share.
      throw const VoiceUnavailable('the microphone could not be started');
    }
  }

  @override
  Future<void> stop() async {
    try {
      await _rec?.stop();
    } catch (_) {}
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
