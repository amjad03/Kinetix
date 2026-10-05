import 'dart:async';
import 'dart:ui';

import 'package:kinetix_ink/kinetix_ink.dart';

/// Streams the board to school leaders watching it live (docs/architecture/live-classroom.md).
///
/// Runs only while someone watches: a [LessonRecorder] in streaming mode notes every change,
/// and every [interval] the new events go out as one frame. A viewer who joins gets a full
/// snapshot first. Nothing is stored on the board or in the cloud.
class LiveStream {
  LiveStream({required this.board, required this.send, this.interval = const Duration(milliseconds: 150)});

  final RecordableBoard board;
  final void Function(List<List<Object?>> events) send;
  final Duration interval;

  LessonRecorder? _recorder;
  Timer? _timer;

  bool get isStreaming => _recorder != null;

  /// Starts (with a snapshot) or sends a fresh snapshot if already streaming.
  void start({required BoardBackground background, required Size canvas}) {
    if (_recorder != null) {
      _recorder!.snapshotNow();
      _flush();
      return;
    }
    _recorder = LessonRecorder(board: board, background: background, canvas: canvas)..start();
    _flush();
    _timer = Timer.periodic(interval, (_) => _flush());
  }

  set background(BoardBackground b) => _recorder?.background = b;

  void stop() {
    _timer?.cancel();
    _timer = null;
    _recorder?.stop();
    _recorder = null;
  }

  void _flush() {
    final events = _recorder?.drain();
    if (events != null && events.isNotEmpty) send(events);
  }
}
