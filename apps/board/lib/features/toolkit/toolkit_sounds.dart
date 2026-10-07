import 'dart:async';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Plays the toolkit's sounds: the timer's end (bell, chime or beep) and the stopwatch's lap
/// tick. The sounds are short WAVs in assets/sounds, synthesised by tool/generate_sounds.dart.
abstract class ToolkitSounds {
  /// The sounds the board plays; tests swap in a fake.
  static ToolkitSounds instance = AssetToolkitSounds();

  /// Plays [id] (`bell`, `chime`, `beep` or `lap`).
  Future<void> play(String id);
}

/// [ToolkitSounds] through audioplayers (Android's MediaPlayer, Windows' Media Foundation). One
/// player per sound, prepared on first use, so a second ring plays straight away. When the
/// plugin fails, the system alert sounds instead.
class AssetToolkitSounds implements ToolkitSounds {
  final Map<String, AudioPlayer> _players = {};

  static const ids = ['bell', 'chime', 'beep', 'lap'];

  Future<AudioPlayer> _player(String id) async {
    final ready = _players[id];
    if (ready != null) return ready;
    final p = AudioPlayer(playerId: 'kinetix-$id');
    try {
      // Duck the class's audio (a video, read-aloud) rather than stop it.
      await p.setAudioContext(AudioContextConfig(focus: AudioContextConfigFocus.duckOthers).build());
    } catch (_) {}
    await p.setReleaseMode(ReleaseMode.stop);
    await p.setSource(AssetSource('sounds/$id.wav'));
    return _players[id] = p;
  }

  @override
  Future<void> play(String id) async {
    if (!ids.contains(id)) return;
    try {
      final p = await _player(id);
      await p.stop();
      await p.seek(Duration.zero);
      await p.resume();
    } catch (e) {
      debugPrint('Toolkit sound $id: $e');
      _players.remove(id)?.dispose().ignore();
      unawaited(SystemSound.play(id == 'lap' ? SystemSoundType.click : SystemSoundType.alert));
    }
  }
}
