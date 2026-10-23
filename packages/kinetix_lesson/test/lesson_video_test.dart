import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_lesson/kinetix_lesson.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'lesson_player_test.dart' show FakeSource, detailsJson, lessonJson;

class _VideoSource extends FakeSource implements LessonVideoSource {
  _VideoSource() : super(details: {...detailsJson(), 'hasVideo': true});

  @override
  LessonAudioLocation? video(String id) => LessonAudioLocation(Uri.parse('http://test/v1/recordings/$id/video'), headers: const {'authorization': 'Bearer t'});

  @override
  Future<Lesson> lesson(String id) async {
    final log = lessonJson();
    (log['events'] as List).add([5000, 'c', 'Calls in arrears']);
    return Lesson.fromJson(log);
  }
}

class _FakeVideo extends LessonVideo {
  _FakeVideo(this.location, {this.fail = false});
  final LessonAudioLocation location;
  final bool fail;
  final calls = <String>[];
  bool _playing = false;
  Duration _pos = Duration.zero;
  double _speed = 1;

  @override
  Future<void> open() async {
    calls.add('open');
    if (fail) throw UnsupportedError('no decoder');
  }

  @override
  bool get playing => _playing;
  @override
  bool get completed => false;
  @override
  Duration get position => _pos;
  @override
  Duration get duration => const Duration(seconds: 20);
  @override
  double get aspectRatio => 16 / 9;
  @override
  double get speed => _speed;
  @override
  Future<void> play() async {
    _playing = true;
    calls.add('play');
    notifyListeners();
  }

  @override
  Future<void> pause() async {
    _playing = false;
    calls.add('pause');
    notifyListeners();
  }

  @override
  Future<void> seek(Duration to) async {
    _pos = to;
    calls.add('seek ${to.inMilliseconds}');
    notifyListeners();
  }

  @override
  Future<void> setSpeed(double speed) async {
    _speed = speed;
    notifyListeners();
  }

  @override
  Widget view() => const SizedBox.expand(key: Key('fakeVideoView'));
}

void main() {
  late List<_FakeVideo> videos;
  var fail = false;

  setUp(() {
    videos = [];
    fail = false;
    LessonVideo.debugFactory = (location) {
      final v = _FakeVideo(location, fail: fail);
      videos.add(v);
      return v;
    };
    LessonAudio.debugFactory = (rec, location, length) async => SilentLessonAudio(length, audible: true);
  });
  tearDown(() {
    LessonVideo.debugFactory = null;
    LessonAudio.debugFactory = null;
  });

  Future<void> open(WidgetTester tester, LessonSource source, {bool hasVideo = true}) async {
    tester.view.physicalSize = const Size(412, 892);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final initial = RecordingInfo.fromJson({...detailsJson(), 'hasVideo': hasVideo});
    await tester.pumpWidget(
      MaterialApp(
        theme: KinetixTheme.light(),
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(onPressed: () => LessonPlayerScreen.open(context, source: source, recordingId: 'r1', initial: initial), child: const Text('open')),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  testWidgets('a recording with a video plays it with chapters, seeking and the summary', (tester) async {
    await open(tester, _VideoSource());
    expect(find.byType(LessonVideoScreen), findsOneWidget);
    expect(find.byKey(const Key('fakeVideoView')), findsOneWidget);
    final v = videos.single;
    expect(v.location.uri.path, '/v1/recordings/r1/video');
    expect(v.location.headers, {'authorization': 'Bearer t'});
    expect(find.text('How companies issue shares.'), findsOneWidget);

    await tester.tap(find.byKey(const Key('lessonPlay')));
    await tester.pump();
    expect(v.calls, ['open', 'play']);
    await tester.tap(find.byKey(const Key('chapter-0')));
    await tester.pump();
    expect(v.calls.last, 'seek 5000');
    await tester.tap(find.byKey(const Key('lessonForward10')));
    await tester.pump();
    expect(v.calls.last, 'seek 15000');
    await tester.tap(find.byKey(const Key('lessonSpeed')));
    await tester.pump();
    expect(v.speed, 1.5);

    // The board replay is one tap away.
    await tester.tap(find.byKey(const Key('lessonBoardReplay')));
    await tester.pumpAndSettle();
    expect(find.byType(LessonView), findsOneWidget);
  });

  testWidgets('a video this device cannot play falls back to the board replay', (tester) async {
    fail = true;
    await open(tester, _VideoSource());
    expect(find.byType(LessonVideoScreen), findsNothing);
    expect(find.byType(LessonView), findsOneWidget);
    expect(find.text("The video can't play on this device, so the board replay is shown."), findsOneWidget);
  });

  testWidgets('without a video, or a source that cannot stream one, the board replay opens', (tester) async {
    await open(tester, _VideoSource(), hasVideo: false);
    expect(find.byType(LessonView), findsOneWidget);
    expect(videos, isEmpty);
  });

  test('hasVideo is read from the API', () {
    expect(RecordingInfo.fromJson({...detailsJson(), 'hasVideo': true}).hasVideo, isTrue);
    expect(RecordingInfo.fromJson(detailsJson()).hasVideo, isFalse);
    expect(RecordingInfo.fromJson({...detailsJson(), 'hasVideo': true}).copyWith(keep: true).hasVideo, isTrue);
  });
}
