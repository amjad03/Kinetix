import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import 'screen_video_recorder.dart';
import 'voice_recorder.dart';

/// A finished capture, waiting for the teacher to save or discard it.
class CapturedLesson {
  CapturedLesson({required this.id, required this.startedAt, required this.events, required this.hasAudio, required this.sessionId, this.hasVideo = false, this.videoMime});

  final String id;
  final DateTime startedAt;

  /// The ink event log (`{v, canvas, background, durationMs, events}`).
  final Map<String, Object?> events;
  final bool hasAudio;

  /// A video of the lecture (board view and voice) was written too.
  final bool hasVideo;
  final String? videoMime;

  /// The board session it was recorded in.
  final String? sessionId;

  int get durationMs => events['durationMs'] as int;
}

/// One lesson being recorded: the board's ink ([LessonRecorder]), the teacher's voice
/// ([VoiceRecorder]) and, where the board can, a video of the board ([ScreenVideoRecorder]),
/// started, paused and stopped together. The ink log is always kept: it carries the chapters
/// and replays the lesson on devices without the video.
class LessonCapture extends ChangeNotifier {
  LessonCapture({
    required this.id,
    required RecordableBoard board,
    required BoardBackground background,
    required Size canvas,
    required this.voice,
    required this.audioPath,
    this.sessionId,
    this.video,
    this.videoPath,
  }) : _ink = LessonRecorder(board: board, background: background, canvas: canvas);

  final String id;
  final String? sessionId;
  final LessonRecorder _ink;
  final VoiceRecorder voice;
  final String audioPath;
  final ScreenVideoRecorder? video;
  final String? videoPath;
  late DateTime startedAt;
  Timer? _tick;
  bool _hasVoice = false;
  bool _hasVideo = false;
  bool _stopped = false;

  /// Why there is no video, when the board tried to record one.
  String? noVideo;

  bool get isRecording => _ink.isRecording;
  bool get isPaused => _ink.isPaused;
  bool get hasVoice => _hasVoice;
  bool get hasVideo => _hasVideo;
  Duration get elapsed => _ink.elapsed;

  set background(BoardBackground b) => _ink.background = b;

  /// Grows the recorded canvas when the board area grows (a side panel closed). Strokes keep
  /// their coordinates, so the player only needs the largest area that was used.
  void fitCanvas(Size area) {
    final c = _ink.canvas;
    if (area.width > c.width || area.height > c.height) _ink.canvas = Size(math.max(c.width, area.width), math.max(c.height, area.height));
  }

  /// Starts recording. Returns why there is no sound, or null when the voice is recorded too.
  /// The microphone starts first so the ink clock never runs ahead of the audio.
  /// The video starts before both; when it records the microphone itself, the voice recorder
  /// is not started (one microphone cannot feed two recorders on every board).
  Future<String?> start() async {
    String? noSound;
    final v = video, vPath = videoPath;
    if (v != null && vPath != null) {
      try {
        await v.start(vPath);
        _hasVideo = true;
      } on VideoUnavailable catch (e) {
        noVideo = e.reason;
      } catch (_) {
        noVideo = 'the screen recorder could not start';
      }
    }
    if (!(_hasVideo && video!.capturesMic)) {
      try {
        await voice.start(audioPath);
        _hasVoice = true;
      } on VoiceUnavailable catch (e) {
        noSound = e.reason;
      } catch (_) {
        noSound = 'the microphone could not be started';
      }
    }
    startedAt = DateTime.now();
    _ink.start();
    _tick = Timer.periodic(const Duration(milliseconds: 500), (_) => notifyListeners());
    notifyListeners();
    return noSound;
  }

  Future<void> pause() async {
    if (!isRecording || isPaused) return;
    _ink.pause();
    notifyListeners();
    if (_hasVoice) await voice.pause();
    if (_hasVideo) await video!.pause();
  }

  Future<void> resume() async {
    if (!isRecording || !isPaused) return;
    if (_hasVideo) await video!.resume();
    if (_hasVoice) await voice.resume();
    _ink.resume();
    notifyListeners();
  }

  /// Chapters marked so far (Marker button), for the recording bar.
  int chapters = 0;

  /// Marks a chapter here (spec §56); titled "Chapter n" unless the teacher names it.
  void mark([String? title]) {
    if (!isRecording) return;
    chapters++;
    _ink.mark(title ?? 'Chapter $chapters');
    notifyListeners();
  }

  Future<CapturedLesson> stop() async {
    _stopped = true;
    _tick?.cancel();
    final events = _ink.stop();
    var hasAudio = false;
    if (_hasVoice) {
      try {
        hasAudio = await voice.stop();
      } catch (_) {}
    }
    var hasVideo = false;
    if (_hasVideo) {
      try {
        hasVideo = await video!.stop(voicePath: hasAudio ? audioPath : null);
      } catch (_) {}
    }
    notifyListeners();
    return CapturedLesson(
      id: id,
      startedAt: startedAt,
      events: events,
      hasAudio: hasAudio,
      sessionId: sessionId,
      hasVideo: hasVideo,
      videoMime: hasVideo ? video!.mime : null,
    );
  }

  @override
  void dispose() {
    _tick?.cancel();
    if (!_stopped && isRecording) _ink.stop();
    unawaited(voice.dispose());
    if (video != null) unawaited(video!.dispose());
    super.dispose();
  }
}
