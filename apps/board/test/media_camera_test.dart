import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/class_camera/teacher_camera.dart';
import 'package:kinetix_board/core/realtime.dart';
import 'package:kinetix_board/features/doc_camera/doc_camera.dart' show DocCameraSource;
import 'package:kinetix_board/features/live/teacher_camera_tile.dart';
import 'package:kinetix_board/features/media/local_media.dart';

import 'support/fake_cloud.dart' show localized;

class _FakePlayer extends LocalMediaPlayer {
  _FakePlayer({this.fail = false});
  final bool fail;
  final calls = <String>[];
  bool _playing = false;
  Duration _pos = Duration.zero;

  @override
  Future<void> open() async {
    calls.add('open');
    if (fail) throw UnsupportedError('no player');
  }

  @override
  bool get playing => _playing;
  @override
  Duration get position => _pos;
  @override
  Duration get duration => const Duration(minutes: 2);
  @override
  double get aspectRatio => 16 / 9;
  @override
  Future<void> play() async {
    calls.add('play');
    _playing = true;
    notifyListeners();
  }

  @override
  Future<void> pause() async {
    calls.add('pause');
    _playing = false;
    notifyListeners();
  }

  @override
  Future<void> seek(Duration to) async {
    calls.add('seek ${to.inSeconds}');
    _pos = to;
    notifyListeners();
  }

  @override
  Widget? view() => const ColoredBox(key: Key('fake-video'), color: Color(0xFF223344));
}

class _FakeCamera implements DocCameraSource {
  _FakeCamera(this.ok);
  final bool ok;
  bool disposed = false;
  @override
  Future<bool> start() async => ok;
  @override
  Widget preview() => const ColoredBox(key: Key('fake-camera'), color: Color(0xFF8899AA));
  @override
  Future<Uint8List?> takePicture() async => null;
  @override
  int get cameraCount => 1;
  @override
  Future<void> next() async {}
  @override
  Future<void> dispose() async => disposed = true;
}

void main() {
  test('media files are told apart by their extension', () {
    expect(mediaKindOf('/mnt/usb/Lesson 3.MP4'), LocalMediaKind.video);
    expect(mediaKindOf('C:\\Music\\anthem.mp3'), LocalMediaKind.audio);
    expect(mediaKindOf('notes.pdf'), isNull);
  });

  group('Insert → Videos from files', () {
    late _FakePlayer player;
    final created = <(String, LocalMediaKind)>[];
    setUp(() {
      created.clear();
      player = _FakePlayer();
      LocalMediaPlayer.create = (path, kind) {
        created.add((path, kind));
        return player;
      };
    });
    tearDown(() {
      LocalMediaPlayer.create = (path, kind) => kind == LocalMediaKind.video ? VideoFilePlayer(path) : AudioFilePlayer(path);
    });

    Future<void> openChooser(WidgetTester tester) async {
      tester.view.physicalSize = const Size(1600, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      var concept = 0;
      await tester.pumpWidget(
        localized(
          'en',
          Scaffold(
            body: Builder(
              builder: (context) => TextButton(onPressed: () => chooseVideoSource(context, conceptVideos: () => concept++), child: const Text('Videos')),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Videos'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('insert-video-choice')), findsOneWidget);
      expect(concept, 0);
    }

    testWidgets('a video from a USB stick plays in the media pane, with a pen over it', (tester) async {
      pickLocalMedia = (kind) async => kind == LocalMediaKind.video ? '/storage/usb/Photosynthesis.mp4' : null;
      await openChooser(tester);
      await tester.tap(find.byKey(const Key('insert-video-file')));
      await tester.pumpAndSettle();

      expect(created.single, ('/storage/usb/Photosynthesis.mp4', LocalMediaKind.video));
      expect(find.byKey(const Key('local-media-pane')), findsOneWidget);
      expect(find.text('Photosynthesis.mp4'), findsOneWidget);
      expect(find.byKey(const Key('fake-video')), findsOneWidget);
      expect(player.calls, ['open', 'play']); // starts playing

      await tester.tap(find.byKey(const Key('media-play')));
      await tester.pump();
      expect(player.calls.last, 'pause');

      // Writing over the video: off until the pen is picked, then strokes; Clear removes them.
      final clear = find.byKey(const Key('media-clear'));
      expect(tester.widget<TextButton>(clear).onPressed, isNull);
      await tester.tap(find.byKey(const Key('media-pen')));
      await tester.pump();
      final ink = find.byKey(const Key('media-ink'));
      await tester.drag(ink, const Offset(80, 30));
      await tester.pump();
      expect(tester.widget<TextButton>(clear).onPressed, isNotNull);
      await tester.tap(clear);
      await tester.pump();
      expect(tester.widget<TextButton>(clear).onPressed, isNull);

      await tester.tap(find.byKey(const Key('media-close')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('local-media-pane')), findsNothing);
    });

    testWidgets('an audio file opens the pane with a visual; a file the board cannot play says so', (tester) async {
      pickLocalMedia = (kind) async => 'D:/anthem.mp3';
      player = _FakePlayer(fail: true);
      await openChooser(tester);
      await tester.tap(find.byKey(const Key('insert-audio-file')));
      await tester.pumpAndSettle();
      expect(created.single.$2, LocalMediaKind.audio);
      expect(find.text('This board cannot play this file.'), findsWidgets);
      expect(tester.widget<IconButton>(find.byKey(const Key('media-play'))).onPressed, isNull);
    });
  });

  group('Teacher camera', () {
    late List<(String, Object)> sent;
    late TeacherCamera cam;
    setUp(() {
      sent = [];
      cam = TeacherCamera(emit: (e, d) => sent.add((e, d)), interval: const Duration(milliseconds: 100));
    });
    tearDown(() => cam.dispose());

    testWidgets('pictures go out only while on, shown, and someone may watch', (tester) async {
      var shots = 0;
      cam.turnOn();
      expect([sent.single.$1, sent.single.$2], [RealtimeEvents.liveCameraState, {'on': true}]);
      cam.grab = () async {
        shots++;
        return Uint8List.fromList([0xFF, 0xD8, 1, 2]);
      };
      await tester.pump(const Duration(milliseconds: 350));
      expect(cam.sending, isFalse); // nobody watching
      expect(shots, 0);

      cam.setViewers(2);
      expect(cam.sending, isTrue);
      await tester.pump(const Duration(milliseconds: 350));
      final frames = sent.where((s) => s.$1 == RealtimeEvents.liveCamera).map((s) => s.$2 as Map).toList();
      expect(frames, hasLength(3));
      expect(frames.first, {'seq': 0, 'mime': 'image/jpeg', 'data': base64Encode([0xFF, 0xD8, 1, 2])});
      expect(frames.map((f) => f['seq']), [0, 1, 2]);

      cam.turnOff();
      expect(cam.sending, isFalse);
      expect([sent.last.$1, sent.last.$2], [RealtimeEvents.liveCameraState, {'on': false}]);
      await tester.pump(const Duration(milliseconds: 300));
      expect(shots, 3);
    });

    testWidgets('the tile shows the camera on the board and gives the controller its pictures', (tester) async {
      final source = _FakeCamera(true);
      TeacherCameraTile.source = () => source;
      addTearDown(() => TeacherCameraTile.source = PluginTeacherCamera.new);
      cam
        ..turnOn()
        ..setViewers(1);
      await tester.pumpWidget(
        localized(
          'en',
          Scaffold(
            body: ListenableBuilder(
              listenable: cam,
              builder: (context, _) => Stack(children: [if (cam.on) TeacherCameraTile(camera: cam, area: const Size(800, 600))]),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.byKey(const Key('fake-camera')), findsOneWidget);
      expect(cam.sending, isTrue); // the tile gave its picture
      expect(find.byKey(const Key('teacher-camera-live')), findsOneWidget);

      await tester.tap(find.byKey(const Key('teacher-camera-close')));
      await tester.pump();
      expect(cam.on, isFalse);
      expect(find.byKey(const Key('teacher-camera-tile')), findsNothing);
      expect(source.disposed, isTrue);
      expect(cam.sending, isFalse);
    });

    testWidgets('no camera: the tile says so and turns the camera off', (tester) async {
      TeacherCameraTile.source = () => _FakeCamera(false);
      addTearDown(() => TeacherCameraTile.source = PluginTeacherCamera.new);
      cam.turnOn();
      await tester.pumpWidget(localized('en', Scaffold(body: Stack(children: [TeacherCameraTile(camera: cam, area: const Size(800, 600))]))));
      await tester.pump();
      expect(cam.on, isFalse);
      expect(find.text('No camera is available on this board.'), findsOneWidget);
    });

    test('camera pictures are JPEGs', () {
      final rgba = Uint8List(4 * 8 * 6)..fillRange(0, 4 * 8 * 6, 200);
      final jpeg = encodeCameraJpeg(rgba, 8, 6);
      expect(jpeg.take(2), [0xFF, 0xD8]);
    });
  });
}
