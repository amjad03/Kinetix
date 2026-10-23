import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_board/core/fleet/fleet_agent.dart';
import 'package:kinetix_board/core/panel/panel_controller.dart';
import 'package:kinetix_board/features/panel/desktop_overlay.dart';
import 'package:kinetix_board/features/panel/panel_home_screen.dart';
import 'package:kinetix_board/features/panel/update_banner.dart';
import 'package:kinetix_board/l10n/l10n.dart';

// Zynetix panel platform (docs/zynetix/BOARD_PLAN.md, W4): app updates, the panel home and
// writing over other apps, with the platform channels faked.

class FakeInstaller extends UpdateInstaller {
  FakeInstaller(this.dir, {this.isSilent = false, this.outcome = InstallOutcome.started});
  final Directory dir;
  bool isSilent;
  InstallOutcome outcome;
  final installed = <String>[];

  @override
  Future<bool> silent() async => isSilent;

  @override
  Future<InstallOutcome> install(File file) async {
    installed.add(file.readAsStringSync());
    return outcome;
  }

  @override
  Future<Directory> directory() async => dir;
}

class FakeProbe implements DeviceProbe {
  @override
  Future<DeviceSnapshot> read() async => const DeviceSnapshot(os: 'android');
}

class FakeWindow extends DesktopOverlayWindow {
  FakeWindow({this.transparent = true}) : super(desktop: true);
  final bool transparent;
  final calls = <String>[];

  @override
  Future<bool> enter() async {
    calls.add('enter');
    return transparent;
  }

  @override
  Future<void> passThrough(bool on) async => calls.add('passThrough:$on');

  @override
  Future<void> exit() async => calls.add('exit');
}

class FakeGrabber extends ScreenGrabber {
  FakeGrabber(this.png) : super(os: 'macos');
  final Uint8List? png;
  int grabs = 0;

  @override
  Future<Uint8List?> grab() async {
    grabs++;
    return png;
  }
}

Widget app(Widget child) => MaterialApp(localizationsDelegates: AppLocalizations.localizationsDelegates, supportedLocales: AppLocalizations.supportedLocales, home: child);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory tmp;
  setUp(() => tmp = Directory.systemTemp.createTempSync('panel_test'));
  tearDown(() => tmp.deleteSync(recursive: true));

  const apk = 'fake apk bytes';
  final apkSha = sha256.convert(utf8.encode(apk)).toString();
  UpdateOffer offer({String? sha}) => UpdateOffer(releaseId: 'r1', version: '1.2.0', url: '/v1/devices/me/releases/r1/file', notes: 'Pen overlay', fileName: 'zynetix.apk', bytes: apk.length, sha256: sha ?? apkSha);

  group('models', () {
    test('versions order like the API', () {
      expect(compareVersions('1.10.0', '1.9.9'), greaterThan(0));
      expect(compareVersions('1.2.0+5', '1.2.0+12'), lessThan(0));
      expect(compareVersions('v2', '2.0.0'), 0);
    });

    test('offers and apps are read from the server answer', () {
      expect(UpdateOffer.fromJson(null), isNull);
      expect(UpdateOffer.fromJson({'version': '1'}), isNull);
      final o = UpdateOffer.fromJson({'releaseId': 'r', 'version': '1.1.0', 'url': '/f', 'bytes': 10, 'sha256': 'ab', 'notes': 'x'})!;
      expect((o.version, o.bytes, o.sha256, o.channel), ('1.1.0', 10, 'ab', 'stable'));
      final apps = LauncherApp.listFrom({
        'apps': [
          {'package': 'com.android.chrome', 'label': 'Chrome', 'iconUrl': null},
          {'label': 'broken'},
        ],
      });
      expect(apps, [const LauncherApp(package: 'com.android.chrome', label: 'Chrome')]);
    });
  });

  group('updater', () {
    late List<String> reports;
    PanelUpdater updater(FakeInstaller installer, {String body = apk}) => PanelUpdater(
      open: (url) async => (body: Stream<List<int>>.fromIterable([utf8.encode(body.substring(0, 4)), utf8.encode(body.substring(4))]), length: body.length),
      report: (id, state, {error}) async => reports.add(error == null ? state : '$state:$error'),
      installer: installer,
    );
    setUp(() => reports = []);

    test('offers the update, then downloads, checks and installs it', () async {
      final inst = FakeInstaller(tmp);
      final u = updater(inst);
      await u.onOffer(offer());
      expect(u.phase, UpdatePhase.available);
      expect(u.prompt, isTrue);
      await u.apply();
      expect(inst.installed, [apk]);
      expect(reports, ['downloading', 'downloaded', 'installing']);
      expect(u.phase, UpdatePhase.installing);
      // The same offer again (next health report) changes nothing.
      await u.onOffer(offer());
      expect(reports, hasLength(3));
    });

    test('a damaged download is not installed and is reported', () async {
      final inst = FakeInstaller(tmp);
      final u = updater(inst, body: 'other bytes!!');
      await u.onOffer(offer());
      await u.apply();
      expect(inst.installed, isEmpty);
      expect(u.phase, UpdatePhase.failed);
      expect(reports.last, startsWith('failed:'));
      expect(tmp.listSync(), isEmpty);
    });

    test('a device-owner panel installs without asking', () async {
      final inst = FakeInstaller(tmp, isSilent: true);
      await updater(inst).onOffer(offer());
      expect(inst.installed, [apk]);
    });

    test('Later postpones this release; desktop opens the installer', () async {
      final u = updater(FakeInstaller(tmp, outcome: InstallOutcome.opened));
      await u.onOffer(offer());
      u.postpone();
      await Future<void>.delayed(Duration.zero);
      expect(reports, ['declined']);
      expect(u.prompt, isFalse);
      await u.apply();
      expect(u.phase, UpdatePhase.opened);
      await u.onOffer(null);
      expect(u.offer, isNull);
    });

    test('Android installs through the panel channel and opens Settings when not allowed', () async {
      final calls = <String>[];
      const channel = MethodChannel('test/panel-install');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
        calls.add(call.method);
        return switch (call.method) {
          'installInfo' => {'deviceOwner': false, 'lastError': 'INSTALL_FAILED_VERSION_DOWNGRADE'},
          'installApk' => 'needsPermission',
          _ => null,
        };
      });
      final inst = AndroidUpdateInstaller(channel: channel);
      expect(await inst.silent(), isFalse);
      expect(await inst.lastError(), 'INSTALL_FAILED_VERSION_DOWNGRADE');
      expect(await inst.install(File('${tmp.path}/x.apk')), InstallOutcome.needsPermission);
      expect(calls, ['installInfo', 'installInfo', 'installApk', 'openInstallSettings']);
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, null);
    });
  });

  group('panel home', () {
    const chrome = LauncherApp(package: 'com.android.chrome', label: 'Chrome');
    const meet = LauncherApp(package: 'com.google.android.apps.meetings', label: 'Meet');
    InstalledApp installed(String p) => InstalledApp(package: p, label: p);

    test('shows the allowed apps that are installed; kiosk mode hides the rest and locks to the list', () async {
      final platform = FakeLauncherPlatform(apps: [installed(chrome.package), installed('com.example.game')]);
      String? saved;
      final home = PanelHome(platform: platform, save: (j) async => saved = j);
      await home.setAllowed([chrome, meet]);
      await home.refreshInstalled();
      expect(home.tiles.map((t) => t.app.package), [chrome.package]);
      expect(home.others.map((a) => a.package), ['com.example.game']);
      expect(PanelHome.decode(saved), [chrome, meet]);

      await home.setKiosk(true);
      expect(home.others, isEmpty);
      expect(platform.allowedCalls.last, [chrome.package, meet.package]);
      expect(await home.launch('com.example.game'), isFalse);
      expect(await home.launch(chrome.package), isTrue);
      expect(platform.launched, [chrome.package]);
      // A new list from the dashboard while in kiosk mode becomes the lock task packages at once.
      await home.setAllowed([meet]);
      expect(platform.allowedCalls.last, [meet.package]);
    });

    test('reads installed apps from the panel channel', () async {
      const channel = MethodChannel('test/panel-apps');
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
        if (call.method == 'installedApps') {
          return [
            {'package': 'com.android.chrome', 'label': 'Chrome', 'icon': Uint8List.fromList([1, 2])},
          ];
        }
        return call.method == 'launchApp';
      });
      final p = MethodChannelLauncherPlatform(android: true, channel: channel);
      final apps = await p.installed();
      expect(apps.single.label, 'Chrome');
      expect(apps.single.icon, [1, 2]);
      expect(await p.launch('com.android.chrome'), isTrue);
      expect(await MethodChannelLauncherPlatform(android: false, channel: channel).installed(), isEmpty);
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, null);
    });

    testWidgets('the panel home opens allowed apps and has the board as its main tile', (tester) async {
      final platform = FakeLauncherPlatform(apps: [installed(chrome.package)]);
      final home = PanelHome(platform: platform, cached: [chrome, meet]);
      var back = 0;
      await tester.pumpWidget(app(PanelHomeScreen(home: home, onBoard: () => back++)));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('panel-app-com.android.chrome')), findsOneWidget);
      expect(find.byKey(const Key('panel-app-com.google.android.apps.meetings')), findsNothing);
      await tester.tap(find.byKey(const Key('panel-app-com.android.chrome')));
      await tester.tap(find.byKey(const Key('panel-home-board')));
      expect(platform.launched, [chrome.package]);
      expect(back, 1);
    });
  });

  group('write over apps', () {
    test('Android asks for the overlay permission first, then starts the pen', () async {
      const channel = MethodChannel('test/overlay');
      var allowed = false;
      final calls = <String>[];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) async {
        calls.add(call.method);
        return call.method == 'canDraw' ? allowed : (call.method == 'start' ? true : null);
      });
      final o = AndroidAppOverlay(android: true, channel: channel, readFile: (path) async => Uint8List.fromList(utf8.encode(path)));
      expect(await o.start(), OverlayStart.needsPermission);
      allowed = true;
      expect(await o.start(), OverlayStart.started);
      expect(calls, ['canDraw', 'requestPermission', 'canDraw', 'start']);

      // The service comes back with the screenshot: the board gets its bytes.
      final got = o.captures.first;
      await TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.handlePlatformMessage(
        channel.name,
        const StandardMethodCodec().encodeMethodCall(const MethodCall('captured', '/cache/overlay-1.png')),
        (_) {},
      );
      expect(utf8.decode(await got), '/cache/overlay-1.png');
      expect(await AndroidAppOverlay(android: false).start(), OverlayStart.unsupported);
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(channel, null);
    });

    test('the desktop window channel is optional', () async {
      expect(await DesktopOverlayWindow(desktop: true, channel: const MethodChannel('test/no-native')).enter(), isFalse);
      expect(await DesktopOverlayWindow(desktop: false).enter(), isFalse);
    });

    test('screenshots with the system tool and cleans up', () async {
      final runs = <List<String>>[];
      final g = ScreenGrabber(
        os: 'macos',
        temp: () async => tmp,
        run: (exe, args) async {
          runs.add([exe, ...args]);
          File(args.last).writeAsBytesSync([137, 80, 78, 71]);
          return ProcessResult(0, 0, '', '');
        },
      );
      expect(await g.grab(), [137, 80, 78, 71]);
      expect(runs.single.first, 'screencapture');
      expect(tmp.listSync(), isEmpty);
      final win = ScreenGrabber(os: 'windows', temp: () async => tmp, run: (exe, args) async => ProcessResult(0, 1, '', 'denied'));
      expect(await win.grab(), isNull);
      expect(ScreenGrabber(os: 'linux').supported, isFalse);
    });

    test('the eraser takes away the strokes it touches', () {
      final ink = OverlayInk()
        ..start(const Offset(10, 10))
        ..extend(const Offset(50, 10))
        ..start(const Offset(200, 200));
      expect(ink.strokes, hasLength(2));
      ink
        ..erasing = true
        ..eraseAt(const Offset(30, 12));
      expect(ink.strokes.single.points.first, const Offset(200, 200));
      ink.clear();
      expect(ink.strokes, isEmpty);
    });

    testWidgets('on the desktop: write, use the app, and save a screenshot to the board', (tester) async {
      final window = FakeWindow();
      final grabber = FakeGrabber(Uint8List.fromList([1, 2, 3]));
      final panel = PanelController(updater: PanelUpdater(open: (_) => throw UnimplementedError(), report: (_, _, {error}) async {}, installer: FakeInstaller(tmp)), home: PanelHome(platform: FakeLauncherPlatform()), desktopWindow: window, grabber: grabber);
      Uint8List? result;
      await tester.pumpWidget(
        app(
          Builder(
            builder: (context) => TextButton(onPressed: () async => result = await DesktopOverlayScreen.open(context, panel), child: const Text('go')),
          ),
        ),
      );
      await tester.tap(find.text('go'));
      await tester.pumpAndSettle();
      await tester.drag(find.byKey(const Key('overlay-ink')), const Offset(120, 40));
      await tester.tap(find.byKey(const Key('overlay-use-app')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('overlay-pen')), findsNothing);
      await tester.tap(find.byKey(const Key('overlay-use-app')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('overlay-save')));
      await tester.pumpAndSettle();
      expect(result, [1, 2, 3]);
      expect(window.calls, ['enter', 'passThrough:true', 'passThrough:false', 'exit']);
      expect(grabber.grabs, 1);
    });
  });

  group('board wiring', () {
    test('the health report answer reaches the updater and the panel home', () async {
      final panel = PanelController(
        updater: PanelUpdater(open: (_) => throw UnimplementedError(), report: (_, _, {error}) async {}, installer: FakeInstaller(tmp)),
        home: PanelHome(platform: FakeLauncherPlatform(supported: false)),
      );
      final agent = FleetAgent(
        send: (_) async => {
          'update': {'releaseId': 'r9', 'version': '9.0.0', 'url': '/f'},
          'launcher': {
            'apps': [
              {'package': 'cn.wps.moffice_eng', 'label': 'WPS Office'},
            ],
          },
        },
        probe: FakeProbe(),
        app: () => const AppHealth(kiosk: 'off'),
        onAnswer: (a) => unawaited(panel.apply(a)),
      );
      await agent.reportNow();
      await Future<void>.delayed(Duration.zero);
      expect(panel.updater.offer?.version, '9.0.0');
      expect(panel.home.tiles.single.app.label, 'WPS Office');
      expect(panel.canWriteOverApps, isFalse);
    });

    testWidgets('the update banner offers Update now and Later', (tester) async {
      final reports = <String>[];
      final u = PanelUpdater(open: (_) => throw UnimplementedError(), report: (_, s, {error}) async => reports.add(s), installer: FakeInstaller(tmp));
      await tester.pumpWidget(app(Scaffold(body: UpdateBanner(updater: u))));
      expect(find.byKey(const Key('update-banner')), findsNothing);
      await u.onOffer(offer());
      await tester.pump();
      expect(find.text('Zynetix Board 1.2.0 is ready to install'), findsOneWidget);
      expect(find.text('Pen overlay'), findsOneWidget);
      await tester.tap(find.byKey(const Key('update-later')));
      await tester.pump();
      expect(find.byKey(const Key('update-banner')), findsNothing);
      expect(reports, ['declined']);
    });
  });
}
