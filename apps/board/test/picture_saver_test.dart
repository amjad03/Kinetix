import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/picture_saver.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final png = Uint8List.fromList([137, 80, 78, 71, 1, 2, 3]);

  test('Android: the picture goes to the gallery through MediaStore and says where', () async {
    const channel = MethodChannel('kinetix/gallery');
    MethodCall? seen;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
      seen = call;
      return 'content://media/external/images/media/42';
    });
    addTearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, null));
    final saver = PictureSaver(platform: TargetPlatform.android);
    expect(await saver.savePng('board.png', png), isTrue);
    expect(seen!.method, 'savePng');
    expect((seen!.arguments as Map)['name'], 'board.png');
    expect((seen!.arguments as Map)['bytes'], png);
    expect(saver.savedTo, 'Pictures/Zynetix');
  });

  test('Android: a refusal from the device is raised, not swallowed', () async {
    const channel = MethodChannel('kinetix/gallery');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async => throw PlatformException(code: 'gallery', message: 'full'));
    addTearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, null));
    expect(PictureSaver(platform: TargetPlatform.android).savePng('a.png', png), throwsA(isA<PlatformException>()));
  });

  test('computer: the file is written to Downloads, and a second save keeps the first', () async {
    final dir = await Directory.systemTemp.createTemp('shot');
    addTearDown(() => dir.delete(recursive: true));
    for (final os in [TargetPlatform.macOS, TargetPlatform.windows, TargetPlatform.linux]) {
      final saver = PictureSaver(platform: os, downloads: () async => dir);
      expect(await saver.savePng('${os.name}.png', png), isTrue);
      expect(File(saver.savedTo!).readAsBytesSync(), png);
    }
    final saver = PictureSaver(platform: TargetPlatform.macOS, downloads: () async => dir);
    await saver.savePng('macOS.png', png);
    expect(saver.savedTo, endsWith('macOS (2).png'));
    expect(dir.listSync(), hasLength(4));
  });

  test('computer without a Downloads folder says so', () async {
    final saver = PictureSaver(platform: TargetPlatform.macOS, downloads: () async => null);
    expect(saver.savePng('a.png', png), throwsA(isA<FileSystemException>()));
  });
}
