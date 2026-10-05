import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:kinetix_3d/kinetix_3d.dart';

Duration ms(int v) => Duration(milliseconds: v);

void main() {
  group('trail', () {
    test('fades: points older than the fade time are dropped', () {
      final t = LaserTrail(fade: ms(1000));
      t.down(const Offset(0, 0), ms(0));
      t.move(const Offset(10, 0), ms(100));
      t.move(const Offset(20, 0), ms(600));
      t.up();
      expect(t.points, hasLength(3));
      expect(t.lifeOf(t.points[1], ms(600)), closeTo(0.5, 1e-9));
      t.prune(ms(1050));
      expect([for (final p in t.points) p.at.dx], [10, 20]);
      t.prune(ms(1700));
      expect(t.isEmpty, isTrue);
    });

    test('keeps the tip while the finger is still down', () {
      final t = LaserTrail(fade: ms(500));
      t.down(const Offset(5, 5), ms(0));
      t.prune(ms(5000));
      expect(t.points, hasLength(1));
      expect(t.tip, const Offset(5, 5));
      t.up();
      expect(t.tip, isNull);
      t.prune(ms(5000));
      expect(t.isEmpty, isTrue);
    });

    test('segments fade from new to old and strokes are not joined', () {
      final t = LaserTrail(fade: ms(1000));
      t.down(const Offset(0, 0), ms(0));
      t.move(const Offset(10, 0), ms(200));
      t.up();
      t.down(const Offset(100, 100), ms(400));
      t.move(const Offset(110, 100), ms(500));
      final s = t.segments(ms(600));
      expect(s, hasLength(2), reason: 'no line from (10, 0) to (100, 100)');
      expect(s[0].life, closeTo(0.6, 1e-9));
      expect(s[1].life, closeTo(0.9, 1e-9));
      expect(s[1].from, const Offset(100, 100));
    });

    test('tiny movements add no points; a move without a down starts a stroke', () {
      final t = LaserTrail();
      t.move(const Offset(1, 1), ms(0));
      expect(t.drawing, isTrue);
      t.move(const Offset(1.3, 1.2), ms(10));
      expect(t.points, hasLength(1));
      t.clear();
      expect(t.isEmpty, isTrue);
      expect(t.drawing, isFalse);
    });
  });

  group('batches to the viewer', () {
    test('at most one command per interval, the rest on tick or lift', () {
      final sent = <Map<String, dynamic>>[];
      final b = LaserBatcher(send: sent.add, fade: ms(1200), interval: ms(33));
      b.add(const Offset(0.1, 0.1), ms(0));
      b.add(const Offset(0.2, 0.1), ms(10));
      b.add(const Offset(0.3, 0.1), ms(20));
      expect(sent, hasLength(1));
      expect(sent.single['pts'], [
        [0.1, 0.1],
      ]);
      expect(sent.single['fade'], 1200);
      b.tick(ms(30));
      expect(sent, hasLength(1));
      b.tick(ms(40));
      expect(sent, hasLength(2));
      expect(sent[1]['pts'], [
        [0.2, 0.1],
        [0.3, 0.1],
      ]);
      b.add(const Offset(0.4, 0.1), ms(45));
      b.up(ms(46));
      expect(sent.last['up'], isTrue);
      expect(sent.last['pts'], [
        [0.4, 0.1],
      ]);
      expect(b.hasPending, isFalse);
      b.off();
      expect(sent.last, {'cmd': 'laser', 'off': true});
    });
  });

  group('two fingers turn the model', () {
    test('a drag across the whole height turns it once round', () {
      final c = twoFingerOrbit(from: const Offset(100, 100), to: const Offset(500, 100), spreadFrom: 80, spreadTo: 80, height: 400)!;
      expect(c['cmd'], 'orbit');
      expect(c['dx'], closeTo(2 * math.pi, 1e-9));
      expect(c['dy'], 0);
      expect(c.containsKey('scale'), isFalse);
    });

    test('spreading the fingers comes closer', () {
      final c = twoFingerOrbit(from: const Offset(100, 100), to: const Offset(100, 100), spreadFrom: 100, spreadTo: 150, height: 400)!;
      expect(c['scale'], closeTo(1.5, 1e-9));
    });

    test('nothing for a still hand or an empty view', () {
      expect(twoFingerOrbit(from: const Offset(10, 10), to: const Offset(10.1, 10), spreadFrom: 50, spreadTo: 50, height: 400), isNull);
      expect(twoFingerOrbit(from: Offset.zero, to: const Offset(50, 0), spreadFrom: 0, spreadTo: 0, height: 0), isNull);
    });
  });
}
