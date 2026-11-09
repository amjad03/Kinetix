// Updates without the Play Store: the manifest, the daily check, the download's SHA-256, an APK
// from a USB drive, and Settings → This board → App updates.
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kinetix_board/classroom_edition/edition.dart';
import 'package:kinetix_board/classroom_edition/update/app_update.dart';
import 'package:kinetix_board/classroom_edition/update/update_settings.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _cert = '8c4c01f3fb0ab2bb6cd6eb10ff61f6ad695507ebbc00c7ed55445897bb49306a';

InstalledApp _installed({int code = 2001, String name = '1.0.0'}) =>
    InstalledApp(packageName: 'in.zynetix.classroom', versionCode: code, versionName: name, certificates: const [_cert], abis: const ['arm64-v8a', 'armeabi-v7a']);

final _apk = utf8.encode('not really an APK, but bytes to check') as List<int>;

Map<String, Object?> _manifest({int build = 2, String? sha, int? size}) => {
  'app': 'in.zynetix.classroom',
  'versionCode': build,
  'versionName': '1.1.$build',
  'notes': {'en': 'Updates from Settings.', 'kn': 'ಸೆಟ್ಟಿಂಗ್ಸ್‌ನಿಂದ ಅಪ್‌ಡೇಟ್.'},
  'apks': {
    'arm64-v8a': {'versionCode': 2000 + build, 'url': 'https://example.org/arm64.apk', 'sha256': sha ?? '${sha256.convert(_apk)}', 'size': size ?? _apk.length},
    'armeabi-v7a': {'versionCode': 1000 + build, 'url': 'https://example.org/v7a.apk', 'sha256': sha ?? '${sha256.convert(_apk)}', 'size': size ?? _apk.length},
  },
};

MockClient _server(Map<String, Object?> manifest, {List<Uri>? asked}) => MockClient((r) async {
  asked?.add(r.url);
  if (r.url.path.endsWith('.json')) return http.Response.bytes(utf8.encode(jsonEncode(manifest)), 200);
  if (r.url.path.endsWith('.apk')) return http.Response.bytes(_apk, 200);
  return http.Response('', 404);
});

void main() {
  late Directory tmp;
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    tmp = Directory.systemTemp.createTempSync('ce-update');
  });
  tearDown(() {
    tmp.deleteSync(recursive: true);
    Edition.classroom = Edition.built == 'classroom';
  });

  AppUpdates updates({Map<String, Object?>? manifest, FakeUpdatePlatform? platform, bool online = true, DateTime Function()? now, List<Uri>? asked}) => AppUpdates(
    platform: platform ?? FakeUpdatePlatform(app: _installed(), dir: tmp),
    client: () => _server(manifest ?? _manifest(), asked: asked),
    online: () async => online,
    now: now,
  );

  group('the manifest', () {
    test('per-ABI APKs; the installed split APK picks its own ABI', () {
      final m = UpdateManifest.fromJson(_manifest());
      expect(m.versionName, '1.1.2');
      expect(m.notesIn('kn'), contains('ಅಪ್‌ಡೇಟ್'));
      expect(m.notesIn('hi'), 'Updates from Settings.');
      expect(m.apkFor(_installed(code: 2001))!.abi, 'arm64-v8a');
      expect(m.apkFor(_installed(code: 1001))!.abi, 'armeabi-v7a');
      // A universal APK (no ABI in its versionCode): the device's first ABI.
      expect(m.apkFor(_installed(code: 1))!.abi, 'arm64-v8a');
      expect(_installed(code: 2001).abi, 'arm64-v8a');
    });

    test('only https links and real SHA-256s', () {
      final http = _manifest();
      ((http['apks']! as Map)['arm64-v8a'] as Map)['url'] = 'http://example.org/a.apk';
      expect(() => UpdateManifest.fromJson(http), throwsFormatException);
      expect(() => UpdateManifest.fromJson(_manifest(sha: 'abc')), throwsFormatException);
    });

    test('the published manifest URL is the apk-builds branch', () {
      expect(AppUpdates.defaultManifestUrl.toString(), 'https://raw.githubusercontent.com/amjad03/zynetix-smart-classroom/apk-builds/classroom-update.json');
    });
  });

  group('checking', () {
    test('newer, the same, or not for this board', () async {
      expect(await updates().check(), isA<UpdateAvailable>());
      final same = updates(platform: FakeUpdatePlatform(app: _installed(code: 2002, name: '1.1.2'), dir: tmp));
      expect(await same.check(), isA<UpToDate>());
      final other = _manifest()..['app'] = 'in.kinetix.board';
      expect(await updates(manifest: other).check(), isA<UpdateNotForThisBoard>());
      final noAbi = _manifest();
      (noAbi['apks']! as Map).remove('armeabi-v7a');
      expect(await updates(manifest: noAbi, platform: FakeUpdatePlatform(app: _installed(code: 1001), dir: tmp)).check(), isA<UpdateNotForThisBoard>());
      // Not Android (no installed app): nothing to check.
      expect(await updates(platform: FakeUpdatePlatform(dir: tmp)).check(), isA<UpdateCheckFailed>());
    });

    test('the quiet daily check: once a day, only online, and the badge', () async {
      var now = DateTime(2026, 11, 9, 9);
      final asked = <Uri>[];
      final offline = updates(online: false, now: () => now, asked: asked);
      expect(await offline.checkDaily(), isFalse);
      expect(asked, isEmpty);

      final u = updates(now: () => now, asked: asked);
      expect(await u.checkDaily(), isTrue);
      expect(u.availableVersion, '1.1.2');
      expect(asked, hasLength(1));
      now = now.add(const Duration(hours: 5));
      expect(await u.checkDaily(), isFalse, reason: 'checked today already');
      expect(asked, hasLength(1));
      now = now.add(const Duration(hours: 20));
      expect(await u.checkDaily(), isTrue);

      // A new start remembers the badge; once the update is installed it goes.
      final again = updates(now: () => now);
      await again.checkDaily();
      expect(again.availableVersion, '1.1.2');
      final installed = updates(platform: FakeUpdatePlatform(app: _installed(code: 2002), dir: tmp), now: () => now);
      await installed.checkDaily();
      expect(installed.availableVersion, isNull);
    });
  });

  group('downloading', () {
    test('checks the size and SHA-256; a damaged download is deleted', () async {
      final u = updates();
      final c = await u.check() as UpdateAvailable;
      final progress = <double>[];
      final f = await u.download(c.apk, onProgress: progress.add);
      expect(f.readAsBytesSync(), _apk);
      expect(progress.last, 1.0);

      final bad = updates(manifest: _manifest(sha: '${sha256.convert(utf8.encode('something else'))}'));
      final b = await bad.check() as UpdateAvailable;
      await expectLater(bad.download(b.apk), throwsA(isA<UpdateVerifyException>()));
      expect(tmp.listSync().whereType<File>().where((x) => x.path.endsWith('.part') || x.path.contains('2002')), hasLength(1), reason: 'only the good one is kept');

      final big = updates(manifest: _manifest(size: 4));
      final g = await big.check() as UpdateAvailable;
      await expectLater(big.download(g.apk), throwsA(isA<UpdateVerifyException>()));
    });

    test('installs only after "Install unknown apps" is allowed', () async {
      final p = FakeUpdatePlatform(app: _installed(), dir: tmp, allowed: false);
      final u = updates(platform: p);
      expect(await u.install('/x.apk'), isFalse);
      expect(p.permissionAsked, 1);
      expect(p.installs, isEmpty);
      p.allowed = true;
      expect(await u.install('/x.apk'), isTrue);
      expect(p.installs, ['/x.apk']);
    });
  });

  group('an APK from a USB drive', () {
    test('the same app, newer, signed by Zynetix', () async {
      final p = FakeUpdatePlatform(app: _installed(), dir: tmp, files: {
        '/usb/new.apk': const InstalledApp(packageName: 'in.zynetix.classroom', versionCode: 2002, versionName: '1.1.0', certificates: [_cert]),
        '/usb/old.apk': const InstalledApp(packageName: 'in.zynetix.classroom', versionCode: 2001, versionName: '1.0.0', certificates: [_cert]),
        '/usb/board.apk': const InstalledApp(packageName: 'in.kinetix.board', versionCode: 20, versionName: '2.0.0', certificates: [_cert]),
        '/usb/debug.apk': const InstalledApp(packageName: 'in.zynetix.classroom', versionCode: 2009, versionName: '9.9.9', certificates: ['00ff']),
      });
      final u = updates(platform: p);
      expect((await u.checkApk('/usb/new.apk')).problem, isNull);
      expect((await u.checkApk('/usb/old.apk')).problem, ApkProblem.notNewer);
      expect((await u.checkApk('/usb/board.apk')).problem, ApkProblem.otherApp);
      expect((await u.checkApk('/usb/debug.apk')).problem, ApkProblem.otherSigner);
      expect((await u.checkApk('/usb/photo.jpg')).problem, ApkProblem.notAnApk);
    });
  });

  group('Settings → This board → App updates', () {
    Future<void> pump(WidgetTester tester, AppUpdates u) async {
      tester.view
        ..physicalSize = const Size(1920, 1080)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: Padding(padding: const EdgeInsets.all(24), child: UpdateSection(updates: u)))));
      await tester.pump();
    }

    testWidgets('Check for update: notes, download, then Android installs', (tester) async {
      Edition.classroom = true;
      final p = FakeUpdatePlatform(app: _installed(), dir: tmp);
      final u = updates(platform: p);
      await tester.runAsync(() => pump(tester, u));
      await tester.pump();
      expect(find.text('Zynetix Classroom 1.0.0 on this board.'), findsOneWidget);
      await tester.tap(find.byKey(const Key('ce-update-check')));
      for (var i = 0; i < 5; i++) {
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
        await tester.pump();
      }
      expect(find.text('Zynetix Classroom 1.1.2 is ready'), findsOneWidget);
      expect(find.byKey(const Key('ce-update-notes')), findsOneWidget);
      await tester.tap(find.byKey(const Key('ce-update-download')));
      for (var i = 0; i < 10 && p.installs.isEmpty; i++) {
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
        await tester.pump();
      }
      expect(p.installs, hasLength(1));
      expect(File(p.installs.single).readAsBytesSync(), _apk);
      expect(find.byKey(const Key('ce-update-install')), findsOneWidget);
    });

    testWidgets('Install from USB…: a wrong APK is refused with the reason', (tester) async {
      Edition.classroom = true;
      final p = FakeUpdatePlatform(app: _installed(), dir: tmp, files: {
        '/usb/old.apk': const InstalledApp(packageName: 'in.zynetix.classroom', versionCode: 2001, versionName: '1.0.0', certificates: [_cert]),
        '/usb/new.apk': const InstalledApp(packageName: 'in.zynetix.classroom', versionCode: 2002, versionName: '1.1.0', certificates: [_cert]),
      });
      final u = updates(platform: p);
      final before = pickUpdateApk;
      addTearDown(() => pickUpdateApk = before);
      var pick = '/usb/old.apk';
      pickUpdateApk = () async => pick;
      await tester.runAsync(() => pump(tester, u));
      await tester.tap(find.byKey(const Key('ce-update-usb')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('ce-usb-problem')), findsOneWidget);
      expect(find.textContaining('already has 1.0.0'), findsOneWidget);
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      pick = '/usb/new.apk';
      await tester.tap(find.byKey(const Key('ce-update-usb')));
      await tester.pumpAndSettle();
      expect(find.text('Install Zynetix Classroom 1.1.0?'), findsOneWidget);
      await tester.tap(find.byKey(const Key('ce-usb-install')));
      await tester.pumpAndSettle();
      expect(p.installs, ['/usb/new.apk']);
    });

    testWidgets('the start screen badge shows only while an update waits', (tester) async {
      final u = updates();
      await tester.pumpWidget(MaterialApp(home: UpdateBadge(updates: u, child: const Text('Settings'))));
      expect(find.byKey(const Key('ce-update-badge')), findsNothing);
      await tester.runAsync(() => u.check());
      await tester.pump();
      expect(find.byKey(const Key('ce-update-badge')), findsOneWidget);
    });
  });
}
