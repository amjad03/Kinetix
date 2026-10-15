import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A torch, an object and a screen 100 cm away. How much light the object
/// lets through decides the shadow; its distance decides the size.
class ShadowsBench extends LabBench {
  const ShadowsBench();

  static const screenCm = 100.0;
  static const objectCm = 10.0; // height of every object

  /// Fraction of light each object lets through, and its colour.
  static const objects = {
    'glass': (0.92, Color(0x6699D5E0)),
    'butter': (0.5, Color(0xCCF3EBD3)),
    'frosted': (0.55, Color(0xAADCE7EC)),
    'wood': (0.0, Color(0xFFA06A3C)),
    'steel': (0.0, Color(0xFF9AA3AC)),
    'card': (0.0, Color(0xFFC9B38A)),
  };

  @override
  String get kind => 'shadows';

  @override
  LabParams get defaults => {'object': 'card', 'dist': 50.0};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('object', tr('Object'), [for (final o in objects.keys) (o, objectName(o))]),
        LabSlider('dist', tr('Distance from the torch'), 10, 90, divisions: 16, unit: ' cm'),
      ];

  static String objectName(String id) => switch (id) {
        'glass' => tr('Glass sheet'),
        'butter' => tr('Butter paper'),
        'frosted' => tr('Frosted glass'),
        'wood' => tr('Wooden block'),
        'steel' => tr('Steel plate'),
        _ => tr('Cardboard shape'),
      };

  static double shadowCm(LabParams p) => objectCm * screenCm / pNum(p, 'dist', 50);

  static (String through, String type, String shadow) nature(String id) {
    final k = objects[id]?.$1 ?? 0;
    if (k > 0.8) return (tr('Almost all'), tr('Transparent'), tr('None'));
    if (k > 0.2) return (tr('Some'), tr('Translucent'), tr('Faint'));
    return (tr('None'), tr('Opaque'), tr('Dark'));
  }

  @override
  List<LabColumn> get columns => [
        LabColumn(tr('Object')),
        LabColumn(tr('Light through')),
        LabColumn(tr('Type')),
        LabColumn(tr('Shadow')),
        LabColumn(tr('Distance from torch (cm)'), 0),
        LabColumn(tr('Shadow height (cm)'), 1),
      ];

  @override
  LabReading read(LabParams p) {
    final o = pStr(p, 'object', 'card');
    final (through, type, shadow) = nature(o);
    final clear = (objects[o]?.$1 ?? 0) > 0.8;
    return LabReading.row([objectName(o), through, type, shadow, pNum(p, 'dist', 50).round(), clear ? '—' : (shadowCm(p) * 10).round() / 10]);
  }

  @override
  List<String> live(LabParams p) {
    final (_, type, shadow) = nature(pStr(p, 'object', 'card'));
    return [type, '${tr('Shadow')}: $shadow', if ((objects[pStr(p, 'object', 'card')]?.$1 ?? 0) <= 0.8) tr('Shadow height {x} cm', {'x': shadowCm(p).toStringAsFixed(1)})];
  }

  @override
  LabGraph graph(LabParams p) => LabGraph(4, 5, fromZero: false, include: (r) => r[5] is num);

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final byType = <String, Set<String>>{};
    for (final r in rows) {
      byType.putIfAbsent('${r[2]}', () => {}).add('${r[0]}');
    }
    final sized = [for (final r in rows) if (r[5] is num) r]..sort((a, b) => (a[4] as num).compareTo(b[4] as num));
    return [
      for (final e in byType.entries) '${e.key}: ${e.value.join(', ')}.',
      if (sized.length > 1 && sized.first[4] != sized.last[4])
        tr('At {d1} cm from the torch the shadow was {h1} cm tall; at {d2} cm it was {h2} cm: the nearer the object is to the torch, the bigger its shadow.', {
          'd1': sized.first[4],
          'h1': sized.first[5],
          'd2': sized.last[4],
          'h2': sized.last[5],
        }),
    ].join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final o = pStr(p, 'object', 'card');
    final (k, colour) = objects[o] ?? objects['card']!;
    final d = pNum(p, 'dist', 50);
    // Torch at x = 0 cm, screen at 100 cm; heights drawn at the same scale.
    final axisY = h * 0.5;
    final sx = (w * 0.78) / screenCm;
    final sy = math.min(sx, (h * 0.42) / (objectCm * screenCm / 10 / 2));
    Offset map(double x, double y) => Offset(w * 0.1 + x * sx, axisY - y * sy);

    // The room is dark; the torch lights a cone.
    canvas.drawRect(Offset.zero & size, fill(const Color(0xFF2A2D33)));
    final src = map(0, 0);
    final cone = Path()
      ..moveTo(src.dx, src.dy)
      ..lineTo(map(screenCm, 40).dx, map(screenCm, 40).dy)
      ..lineTo(map(screenCm, -40).dx, map(screenCm, -40).dy)
      ..close();
    canvas.drawPath(cone, fill(const Color(0x22FFF3C4)));

    // Screen, lit where the cone reaches it.
    final screenTop = map(screenCm, 40), screenBottom = map(screenCm, -40);
    final screen = Rect.fromLTRB(screenTop.dx, math.max(8, screenTop.dy), screenTop.dx + 14, math.min(h - 8, screenBottom.dy));
    canvas.drawRect(screen, fill(const Color(0xFFFFF6D8)));

    // The shadow: dark for opaque, faint for translucent, none for transparent.
    final half = objectCm / 2 * screenCm / d;
    final shTop = map(screenCm, half), shBottom = map(screenCm, -half);
    final shadow = Rect.fromLTRB(screen.left, math.max(screen.top, shTop.dy), screen.right, math.min(screen.bottom, shBottom.dy));
    if (k < 0.8) canvas.drawRect(shadow, fill(Color.lerp(const Color(0xFF1B1F24), const Color(0xFFFFF6D8), k)!.withValues(alpha: 0.95)));
    canvas.drawRect(screen, stroke(const Color(0xFFBFB39A), 1.5));
    label(canvas, tr('Screen'), Offset(screen.center.dx, screen.bottom + 16), size: 13, color: Colors.white);

    // Rays from the torch past the top and bottom of the object.
    final ray = stroke(const Color(0x88FFE680), 1.5);
    dashed(canvas, src, map(screenCm, half), ray);
    dashed(canvas, src, map(screenCm, -half), ray);

    // The object.
    final objTop = map(d, objectCm / 2), objBottom = map(d, -objectCm / 2);
    final obj = Rect.fromLTRB(objTop.dx - 5, objTop.dy, objTop.dx + 5, objBottom.dy);
    canvas.drawRect(obj, fill(colour));
    canvas.drawRect(obj, stroke(Colors.white.withValues(alpha: 0.6), 1.2));
    label(canvas, objectName(o), Offset(obj.center.dx, obj.top - 16), size: 14, bold: true, color: Colors.white);

    // Torch body.
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: src - const Offset(30, 0), width: 60, height: 26), const Radius.circular(6)), fill(const Color(0xFF6E757D)));
    canvas.drawCircle(src, 9, fill(const Color(0xFFFFF3C4)));
    label(canvas, tr('Torch'), src + const Offset(-30, 30), size: 13, color: Colors.white);

    // Distance markers along the floor.
    final floor = h * 0.9;
    canvas.drawLine(Offset(map(0, 0).dx, floor), Offset(map(screenCm, 0).dx, floor), stroke(const Color(0xFF8C929A), 1.5));
    for (var cm = 0; cm <= screenCm; cm += 10) {
      final x = map(cm.toDouble(), 0).dx;
      canvas.drawLine(Offset(x, floor - 4), Offset(x, floor + 4), stroke(const Color(0xFF8C929A), 1.5));
      label(canvas, '$cm', Offset(x, floor + 16), size: 10, color: const Color(0xFFB9BFC6));
    }
    canvas.drawLine(Offset(objTop.dx, obj.bottom + 4), Offset(objTop.dx, floor - 6), stroke(Colors.white.withValues(alpha: 0.3), 1));
    if (k < 0.8) label(canvas, '${(half * 2).toStringAsFixed(1)} cm', Offset(screen.right + 34, screen.center.dy), size: 14, bold: true, color: Colors.white);
  }
}
