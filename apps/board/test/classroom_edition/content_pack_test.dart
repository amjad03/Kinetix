// The content pack (install from a zip, a folder or a URL; only changed items; sha checks;
// resume) and the smartboard video player, with a tiny generated fixture pack. The player is a
// fake (no real video). CE_SHOTS=<dir> writes 1920 × 1080 screenshots.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/classroom_edition/content_pack/content_library.dart';
import 'package:kinetix_board/classroom_edition/content_pack/content_pack.dart';
import 'package:kinetix_board/classroom_edition/content_pack/content_settings.dart';
import 'package:kinetix_board/classroom_edition/content_pack/pack_video_player.dart';
import 'package:kinetix_board/classroom_edition/local/classroom_store.dart';
import 'package:kinetix_board/core/device_store.dart';
import 'package:kinetix_board/core/secret_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/screen_fonts.dart';

final _out = Platform.environment['CE_SHOTS'];

/// A tiny "MP4": an ftyp box and some bytes (the fake player never decodes it).
Uint8List fakeMp4(int seed) => Uint8List.fromList([0, 0, 0, 24, ...ascii.encode('ftypmp42'), 0, 0, 0, 0, ...ascii.encode('mp42isom'), for (var i = 0; i < 200; i++) (i * seed) & 0xff]);

ContentItem item(String id, Uint8List bytes, {int version = 1, String topic = 'phy1-ch03.t01', ContentKind kind = ContentKind.video}) => ContentItem(
  id: id,
  kind: kind,
  title: 'Ohm’s law, $id',
  file: 'videos/$id.mp4',
  sha256: sha256.convert(bytes).toString(),
  size: bytes.length,
  version: version,
  chapterId: topic.split('.').first,
  topics: [topic],
  steps: ['$topic#2'],
  markers: const [(seconds: 0, title: 'Intro'), (seconds: 30, title: 'The circuit'), (seconds: 75, title: 'Graph')],
);

ContentManifest manifest(List<ContentItem> items, {String rev = '2026.11'}) => ContentManifest(id: 'puc-physics', title: 'PUC Physics videos', revision: rev, items: items);

class FakeFetcher implements ContentFetcher {
  FakeFetcher(this.files);
  final Map<String, Uint8List> files;
  final requests = <String>[];
  int? cutAfter;

  @override
  Future<Uint8List> get(Uri url) async {
    requests.add(url.path);
    return files[url.pathSegments.last]!;
  }

  @override
  Future<({bool partial, Stream<List<int>> body})> getFrom(Uri url, int from) async {
    final name = url.path.split('/ce/').last;
    requests.add('$name@$from');
    final b = files[name]!.sublist(from);
    final cut = cutAfter;
    if (cut != null) {
      cutAfter = null;
      final c = StreamController<List<int>>();
      c.add(b.sublist(0, cut));
      c.addError(const SocketException('cut off'));
      unawaited(c.close());
      return (partial: from > 0, body: c.stream);
    }
    return (partial: from > 0, body: Stream.value(b));
  }
}

class FakePlayer implements PackPlayer {
  final _s = ValueNotifier(const PackPlayerState());
  final calls = <String>[];
  @override
  ValueListenable<PackPlayerState> get state => _s;
  PackPlayerState _with({bool? playing, Duration? position, double? speed}) => PackPlayerState(
    ready: true,
    playing: playing ?? _s.value.playing,
    position: position ?? _s.value.position,
    duration: const Duration(seconds: 120),
    speed: speed ?? _s.value.speed,
  );
  @override
  Future<void> init() async => _s.value = _with(position: const Duration(seconds: 42));
  @override
  Future<void> play() async => _s.value = _with(playing: true);
  @override
  Future<void> pause() async => _s.value = _with(playing: false);
  @override
  Future<void> seekTo(Duration d) async {
    calls.add('seek ${d.inSeconds}');
    _s.value = _with(position: d);
  }

  @override
  Future<void> setSpeed(double s) async => _s.value = _with(speed: s);
  @override
  Widget view() => const DecoratedBox(
    decoration: BoxDecoration(gradient: LinearGradient(colors: [Color(0xFF1E3A8A), Color(0xFF0EA5E9)])),
    child: Center(child: Icon(Icons.electric_bolt, size: 200, color: Colors.white70)),
  );
  @override
  Future<void> dispose() async {}
}

Future<void> _shot(WidgetTester tester, String name) async {
  final out = _out;
  if (out == null) return;
  final box = tester.renderObject<RenderRepaintBoundary>(find.byKey(const Key('ce-shot')));
  final png = await tester.runAsync(() async {
    final img = await box.toImage();
    return (await img.toByteData(format: ui.ImageByteFormat.png))!.buffer.asUint8List();
  });
  Directory(out).createSync(recursive: true);
  File('$out/$name.png').writeAsBytesSync(png!);
}

void main() {
  late Directory tmp;
  final a = fakeMp4(3), b = fakeMp4(7);

  setUp(() => tmp = Directory.systemTemp.createTempSync('ce-pack'));
  tearDown(() {
    ContentLibrary.debugShared = null;
    if (tmp.existsSync()) tmp.deleteSync(recursive: true);
  });

  group('manifest', () {
    test('round-trips and leaves broken items out', () {
      final m = manifest([item('ohm', a)]);
      final j = m.toJson();
      (j['items'] as List).add({'id': 'bad', 'kind': 'video', 'file': '../x.mp4', 'sha256': 'x', 'size': 1});
      final back = ContentManifest.parse(utf8.encode(jsonEncode(j)));
      expect(back.items.single.id, 'ohm');
      expect(back.items.single.markers.length, 3);
      expect(back.items.single.chapterId, 'phy1-ch03');
      expect(back.problems.single, startsWith('bad:'));
    });

    test('refuses other formats and newer versions', () {
      expect(() => ContentManifest.parse(utf8.encode('{"format":"zynetix-paper-pack"}')), throwsFormatException);
      expect(() => ContentManifest.parse(utf8.encode(jsonEncode({'format': contentPackFormat, 'formatVersion': 99, 'items': []}))), throwsFormatException);
    });
  });

  group('library', () {
    test('installs a zip, skips unchanged items, replaces a newer version, rejects a bad sha', () async {
      final lib = ContentLibrary(tmp);
      final r1 = await lib.installZip(writeContentPack(manifest([item('ohm', a), item('lab1', b, kind: ContentKind.lab, topic: 'phy1-ch03.t02')]), {'videos/ohm.mp4': a, 'videos/lab1.mp4': b}));
      expect(r1.added, ['ohm', 'lab1']);
      expect(lib.fileOf(lib.items.firstWhere((i) => i.id == 'ohm')).readAsBytesSync(), a);
      expect(lib.videoFor('phy1-ch03.t01')?.id, 'ohm');
      expect(lib.videoFor('phy1-ch03.t02'), isNull, reason: 'a lab is not a video');
      expect(lib.search('circuit').map((i) => i.id), contains('ohm'));

      final r2 = await lib.installZip(writeContentPack(manifest([item('ohm', a), item('lab1', b, kind: ContentKind.lab, topic: 'phy1-ch03.t02')]), {'videos/ohm.mp4': a, 'videos/lab1.mp4': b}));
      expect(r2.unchanged, 2);
      expect(r2.added, isEmpty);

      final r3 = await lib.installZip(writeContentPack(manifest([item('ohm', b, version: 2)]), {'videos/ohm.mp4': b}));
      expect(r3.updated, ['ohm']);
      expect(lib.fileOf(lib.items.firstWhere((i) => i.id == 'ohm')).readAsBytesSync(), b);

      final bad = item('ohm', a, version: 3);
      final r4 = await lib.installZip(writeContentPack(manifest([bad]), {'videos/ohm.mp4': b}));
      expect(r4.problems.single, contains('ohm'));
      expect(lib.items.firstWhere((i) => i.id == 'ohm').version, 2, reason: 'the damaged file never replaced the good one');

      // Kept across a restart.
      final again = ContentLibrary(tmp);
      await again.load();
      expect(again.items.map((i) => i.id), unorderedEquals(['ohm', 'lab1']));

      await again.remove('lab1');
      expect(again.items.map((i) => i.id), ['ohm']);
      await again.removeAll();
      expect(again.isEmpty, isTrue);
    });

    test('installs a folder (Documents/Zynetix/Content)', () async {
      final src = Directory('${tmp.path}/usb')..createSync();
      File('${src.path}/manifest.json').writeAsStringSync(manifest([item('ohm', a)]).encode());
      Directory('${src.path}/videos').createSync();
      File('${src.path}/videos/ohm.mp4').writeAsBytesSync(a);
      final lib = ContentLibrary(Directory('${tmp.path}/app'));
      final r = await lib.installFolder(src);
      expect(r.added, ['ohm']);
    });

    test('updates over Wi-Fi only, resumes a cut-off download, fetches only changed items', () async {
      final lib = ContentLibrary(tmp);
      await lib.setBaseUrl('https://content.example/ce');
      final big = Uint8List.fromList(List.generate(5000, (i) => i & 0xff));
      final f = FakeFetcher({'manifest.json': utf8.encode(manifest([item('ohm', a), item('big', big)]).encode()), 'videos/ohm.mp4': a, 'videos/big.mp4': big});

      contentOnWifi = () async => false;
      expect(() => lib.updateFromUrl(fetcher: f), throwsFormatException);
      contentOnWifi = () async => true;

      f.cutAfter = 100;
      final r1 = await lib.updateFromUrl(fetcher: f);
      expect(r1.added, ['big'], reason: 'ohm was cut off first');
      expect(r1.problems.single, contains('ohm'));
      f.requests.clear();
      final r2 = await lib.updateFromUrl(fetcher: f);
      expect(r2.added, ['ohm']);
      expect(r2.unchanged, 1);
      expect(f.requests, contains('videos/ohm.mp4@100'), reason: 'carried on from the cut-off');

      // Resume: a new version of big, cut half way, then carried on from where it stopped.
      final big2 = Uint8List.fromList(List.generate(5000, (i) => (i * 3) & 0xff));
      f.files['manifest.json'] = utf8.encode(manifest([item('ohm', a), item('big', big2, version: 2)]).encode());
      f.files['videos/big.mp4'] = big2;
      f.cutAfter = 2000;
      final r3 = await lib.updateFromUrl(fetcher: f);
      expect(r3.problems.single, contains('big'));
      f.requests.clear();
      final r4 = await lib.updateFromUrl(fetcher: f);
      expect(r4.updated, ['big']);
      expect(f.requests, contains('videos/big.mp4@2000'), reason: 'resumed with a Range request');
      expect(f.requests.any((r) => r.startsWith('videos/ohm')), isFalse, reason: 'unchanged items are not downloaded');
      expect(lib.fileOf(lib.items.firstWhere((i) => i.id == 'big')).readAsBytesSync(), big2);
    });
  });

  group('screens', () {
    setUpAll(loadScreenFonts);

    Future<void> pump(WidgetTester tester, Widget child) async {
      tester.view
        ..physicalSize = const Size(1920, 1080)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp(debugShowCheckedModeBanner: false, home: RepaintBoundary(key: const Key('ce-shot'), child: child)));
      await tester.pump();
    }

    testWidgets('the video player: markers, ±10 s, speed, pause & draw', (tester) async {
      final fake = FakePlayer();
      packPlayerFor = (_) => fake;
      await pump(tester, PackVideoScreen(file: File('/nonexistent.mp4'), item: item('ohm', a)));
      await tester.pump();
      expect(find.byKey(const Key('pack-video-marker-1')), findsOneWidget);
      expect(find.text('0:42 / 2:00'), findsOneWidget);

      await tester.tap(find.byKey(const Key('pack-video-fwd10')));
      await tester.pump();
      expect(fake.calls.last, 'seek 52');
      await tester.tap(find.byKey(const Key('pack-video-back10')));
      await tester.pump();
      expect(fake.calls.last, 'seek 42');
      await tester.tap(find.byKey(const Key('pack-video-chapter-1')));
      await tester.pump();
      expect(fake.calls.last, 'seek 30');

      await tester.tap(find.byKey(const Key('pack-video-speed')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('1.25x').last);
      await tester.pumpAndSettle();
      expect(fake.state.value.speed, 1.25);

      await tester.tap(find.byKey(const Key('pack-video-play')));
      await tester.pump();
      expect(fake.state.value.playing, isTrue);
      await tester.tap(find.byKey(const Key('pack-video-draw')));
      await tester.pump();
      expect(fake.state.value.playing, isFalse, reason: 'Pause & draw pauses');
      final ink = tester.getRect(find.byKey(const Key('pack-video-ink')));
      final g = await tester.startGesture(ink.center - const Offset(200, 50));
      for (var i = 0; i < 20; i++) {
        await g.moveBy(const Offset(20, 6));
      }
      await g.up();
      await tester.pump();
      expect(find.byKey(const Key('pack-video-clear-ink')), findsOneWidget);
      await _shot(tester, 'pack-video-player');
    });

    testWidgets('Settings → Content lists what is installed', (tester) async {
      SharedPreferences.setMockInitialValues({});
      final lib = ContentLibrary(tmp);
      await tester.runAsync(() async {
        await lib.installZip(writeContentPack(manifest([item('ohm', a), item('lab1', b, kind: ContentKind.lab), item('sim1', b, kind: ContentKind.phet)]), {'videos/ohm.mp4': a, 'videos/lab1.mp4': b, 'videos/sim1.mp4': b}));
        await lib.setBaseUrl('https://content.example/ce');
      });
      final store = ClassroomStore(store: DeviceStore(secrets: MemorySecretStore()));
      await pump(
        tester,
        Scaffold(
          body: ListView(padding: const EdgeInsets.all(24), children: [ContentSettingsSection(store: store, library: lib), const SizedBox(height: 24), TopicVideoButton(topicId: 'phy1-ch03.t01', library: lib)]),
        ),
      );
      expect(find.byKey(const Key('ce-content-item-ohm')), findsOneWidget);
      expect(find.byKey(const Key('ce-content-remove-lab1')), findsOneWidget);
      expect(find.byKey(const Key('topic-video-phy1-ch03.t01')), findsOneWidget);
      expect(find.textContaining('3 items'), findsOneWidget);
      await _shot(tester, 'content-settings');
    });
  });
}
