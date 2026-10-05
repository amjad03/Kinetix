import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';

/// The command channel between the app and the viewer page (kx.cmd / KX.postMessage).
void main() {
  group('commands', () {
    test('are JSON objects with the names the page knows', () {
      final all = [
        ViewerCommands.lang('hi'),
        ViewerCommands.labels(LabelMode.all),
        ViewerCommands.pick('aorta'),
        ViewerCommands.view([0, 0, 1]),
        ViewerCommands.reset(),
        ViewerCommands.explode(0.5),
        ViewerCommands.slice(normal: [0, 0, -1], offset: 0.01),
        ViewerCommands.hide(['aorta'], ['ra_blood']),
        ViewerCommands.variant('h2o'),
        ViewerCommands.animate('beat'),
        ViewerCommands.step(2),
        ViewerCommands.autoRotate(true),
        ViewerCommands.snapshot(),
        ViewerCommands.mirror(true),
        ViewerCommands.laser(points: const [Offset(0.5, 0.5)]),
        ViewerCommands.orbit(dx: 0.1),
        ViewerCommands.partAt(const Offset(0.5, 0.5)),
        ViewerCommands.state(),
      ];
      for (final c in all) {
        expect(ViewerCommands.names, contains(c['cmd']));
        // Survives the trip into JavaScript.
        expect(jsonDecode(jsonEncode(c)), c);
      }
    });

    test('every command the app can send is one viewer.js runs', () {
      final source = File('tool/models/src/viewer.js').readAsStringSync();
      final block = source.substring(source.indexOf('const commands = {'), source.indexOf('window.kx = {'));
      final names = RegExp(r'^  (\w+): ', multiLine: true).allMatches(block).map((m) => m.group(1)).toSet();
      expect(names, ViewerCommands.names);
      // The bundle the app ships was rebuilt after the source changed.
      final bundle = File('assets/viewer3d/viewer.js').readAsStringSync();
      for (final n in ['laser', 'orbit', 'partAt']) {
        expect(bundle, contains('$n:'), reason: 'run node tool/models/build_viewer.mjs');
      }
      expect(bundle, contains('chrome.webview'), reason: 'WebView2 messages');
    });

    test('carry their arguments', () {
      expect(ViewerCommands.labels(LabelMode.none), {'cmd': 'labels', 'mode': 'none'});
      expect(ViewerCommands.pick(null), {'cmd': 'pick', 'part': null});
      expect(ViewerCommands.explode(3)['amount'], 1.0);
      expect(ViewerCommands.slice(), {'cmd': 'slice'});
      expect(ViewerCommands.slice(id: 'half', normal: [0, 0, -1], normal2: [1, 0, 0]), {
        'cmd': 'slice', 'id': 'half', 'normal': [0, 0, -1], 'offset': 0, 'normal2': [1, 0, 0],
      });
      expect(ViewerCommands.animate(null), {'cmd': 'animate', 'id': null, 'step': 0});
      expect(ViewerCommands.orbit(dx: 0.2, dy: -0.1), {'cmd': 'orbit', 'dx': 0.2, 'dy': -0.1});
      expect(ViewerCommands.orbit(scale: 1.1)['scale'], 1.1);
    });

    test('laser points are clamped to the view and rounded', () {
      final c = ViewerCommands.laser(points: const [Offset(0.123456, 1.4), Offset(-0.2, 0.5)], fade: const Duration(milliseconds: 900));
      expect(c, {
        'cmd': 'laser',
        'pts': [
          [0.1235, 1.0],
          [0.0, 0.5],
        ],
        'fade': 900,
      });
      expect(ViewerCommands.laser(up: true), {'cmd': 'laser', 'up': true});
      expect(ViewerCommands.laser(off: true), {'cmd': 'laser', 'off': true});
    });
  });

  group('events', () {
    test('decode from the forms each WebView delivers', () {
      const json = '{"event":"pick","part":"aorta"}';
      expect(ViewerEvent.decode(json)!.part, 'aorta'); // Android: a JSON string
      expect(ViewerEvent.decode(jsonEncode(json))!.type, 'pick'); // WebView2: a string, JSON-encoded again
      expect(ViewerEvent.decode({'event': 'laser', 'part': null})!.type, 'laser'); // already decoded
      expect(ViewerEvent.decode('not json'), isNull);
      expect(ViewerEvent.decode('{"no":"event"}'), isNull);
      expect(ViewerEvent.decode(42), isNull);
    });

    test('carry pictures as data URLs', () {
      final png = ViewerEvent({'event': 'snapshot', 'png': 'data:image/png;base64,${base64Encode([137, 80, 78, 71])}'}).image;
      expect(png, [137, 80, 78, 71]);
      expect(ViewerEvent({'event': 'frame', 'jpg': 'data:image/jpeg;base64,AAE='}).image, [0, 1]);
      expect(ViewerEvent.dataUrlBytes('nonsense'), isNull);
      expect(ViewerEvent.dataUrlBytes(null), isNull);
    });
  });

  group('engine', () {
    test('holds commands until the model has loaded, then sends them in order', () async {
      final e = FakeViewerEngine();
      final events = <String>[];
      e.events.listen((v) => events.add(v.type));
      e.send(ViewerCommands.labels(LabelMode.all));
      e.send(ViewerCommands.variant('h2o'));
      expect(e.sent, isEmpty);
      await e.open('molecules', lang: 'kn');
      await pumpEventQueue();
      expect(e.opened, ['molecules:kn']);
      expect([for (final c in e.sent) c['cmd']], ['labels', 'variant']);
      expect(events, contains('loaded'));
      // Opening another model holds commands again.
      e.reset();
      e.send(ViewerCommands.pick('x'));
      expect(e.allOf('pick'), isEmpty);
      e.dispose();
    });

    test('answers a snapshot with a picture and the laser with the part under it', () async {
      final e = FakeViewerEngine()..partUnder = (at) => at.dx < 0.5 ? 'left_ventricle' : null;
      final got = <ViewerEvent>[];
      e.events.listen(got.add);
      await e.open('heart', lang: 'en');
      await pumpEventQueue();
      e.send(ViewerCommands.snapshot());
      e.send(ViewerCommands.laser(points: const [Offset(0.2, 0.5)]));
      e.send(ViewerCommands.laser(points: const [Offset(0.8, 0.5)]));
      await pumpEventQueue();
      expect(got.firstWhere((v) => v.type == 'snapshot').image, isNotEmpty);
      expect([for (final v in got) if (v.type == 'laser') v.part], ['left_ventricle', null]);
      e.dispose();
    });

    test('ignores everything after it is disposed', () async {
      final e = FakeViewerEngine();
      await e.open('heart', lang: 'en');
      await pumpEventQueue();
      e.dispose();
      e.send(ViewerCommands.reset());
      e.receive('{"event":"pick","part":"a"}');
      expect(e.allOf('reset'), isEmpty);
    });

    test('no WebView under test unless a fake is given', () {
      expect(Viewer3dEngine.create(), isNull);
      expect(Viewer3dEngine.available, isFalse);
      Viewer3dEngine.debugOverride = FakeViewerEngine.new;
      addTearDown(() => Viewer3dEngine.debugOverride = null);
      expect(Viewer3dEngine.available, isTrue);
      expect(Viewer3dEngine.create(), isA<FakeViewerEngine>());
    });
  });
}
