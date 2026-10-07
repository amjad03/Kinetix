import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:kinetix_board/core/models.dart';
import 'package:kinetix_board/features/ai/voice_input.dart';
import 'package:kinetix_board/features/doc_camera/doc_camera.dart';

/// The board's speech recogniser in tests: [say] delivers words as if the teacher spoke.
class FakeVoiceInput extends VoiceInput {
  int listens = 0;
  AiLanguage? language;
  void Function(String words, bool done)? _onWords;

  @override
  Future<bool> listen(AiLanguage language, {required void Function(String words, bool done) onWords, required void Function(VoiceProblem p) onProblem}) async {
    listens++;
    this.language = language;
    _onWords = onWords;
    return true;
  }

  void say(String words, {bool done = false}) => _onWords?.call(words, done);

  @override
  Future<void> stop() async {}
}

/// A 2 × 2 PNG (a camera picture in tests).
final tinyPng = base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg==');

/// The document camera in tests: a coloured box for the live picture, [tinyPng] for stills.
class FakeDocCamera implements DocCameraSource {
  FakeDocCamera({this.available = true});

  final bool available;
  int pictures = 0;

  @override
  int get cameraCount => 1;

  @override
  Future<bool> start() async => available;

  @override
  Widget preview() => Container(key: const Key('fake-camera'), color: Colors.teal, width: 320, height: 240);

  @override
  Future<Uint8List?> takePicture() async {
    pictures++;
    return tinyPng;
  }

  @override
  Future<void> next() async {}

  @override
  Future<void> dispose() async {}
}
