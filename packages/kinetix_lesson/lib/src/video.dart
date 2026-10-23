import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:video_player/video_player.dart';

import 'recording.dart';

/// A source that can also stream a recording's lecture video (`GET /v1/recordings/:id/video`).
/// Apps whose [LessonSource] implements it get the video player for recordings with a video.
abstract class LessonVideoSource {
  /// The video's address and headers, or null when this app cannot stream it.
  LessonAudioLocation? video(String id);
}

/// Whether video_player has a backend here (none on Linux or Windows desktop).
bool get lessonVideoSupported => kIsWeb || const {TargetPlatform.android, TargetPlatform.iOS, TargetPlatform.macOS}.contains(defaultTargetPlatform);

/// The lecture video being played. Tests put a fake in [debugFactory].
abstract class LessonVideo extends ChangeNotifier {
  static LessonVideo Function(LessonAudioLocation location)? debugFactory;

  static LessonVideo create(LessonAudioLocation location) => (debugFactory ?? NetworkLessonVideo.new)(location);

  /// Opens the stream; throws when it cannot be played here.
  Future<void> open();
  bool get playing;
  bool get completed;
  Duration get position;
  Duration get duration;
  double get aspectRatio;
  double get speed;
  Future<void> play();
  Future<void> pause();
  Future<void> seek(Duration to);
  Future<void> setSpeed(double speed);
  Widget view();
}

/// Streams the video over HTTP (Range requests, so seeking is quick) with video_player.
class NetworkLessonVideo extends LessonVideo {
  NetworkLessonVideo(this.location);

  final LessonAudioLocation location;
  VideoPlayerController? _c;

  @override
  Future<void> open() async {
    final c = VideoPlayerController.networkUrl(location.uri, httpHeaders: location.headers);
    _c = c;
    await c.initialize();
    c.addListener(notifyListeners);
  }

  VideoPlayerValue? get _v => _c?.value;

  @override
  bool get playing => _v?.isPlaying ?? false;
  @override
  bool get completed => _v?.isCompleted ?? false;
  @override
  Duration get position => _v?.position ?? Duration.zero;
  @override
  Duration get duration => _v?.duration ?? Duration.zero;
  @override
  double get aspectRatio {
    final r = _v?.aspectRatio ?? 0;
    return r > 0 ? r : 16 / 9;
  }

  @override
  double get speed => _v?.playbackSpeed ?? 1;
  @override
  Future<void> play() async => _c?.play();
  @override
  Future<void> pause() async => _c?.pause();
  @override
  Future<void> seek(Duration to) async => _c?.seekTo(to);
  @override
  Future<void> setSpeed(double speed) async => _c?.setPlaybackSpeed(speed);
  @override
  Widget view() => _c == null ? const SizedBox.shrink() : VideoPlayer(_c!);

  @override
  void dispose() {
    final c = _c;
    _c = null;
    c?.removeListener(notifyListeners);
    c?.dispose();
    super.dispose();
  }
}
