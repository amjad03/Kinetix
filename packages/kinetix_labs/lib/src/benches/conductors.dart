import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// A cell, a switch and a bulb, with a gap between two clips for the
/// object being tested.
class ConductorsBench extends LabBench {
  const ConductorsBench();

  /// Whether each object conducts.
  static const objects = {
    'nail': true,
    'copper': true,
    'foil': true,
    'coin': true,
    'graphite': true,
    'plastic': false,
    'eraser': false,
    'wood': false,
    'glass': false,
    'paper': false,
  };

  @override
  String get kind => 'conductors';

  @override
  bool get animated => true;

  @override
  LabParams get defaults => {'object': 'nail', 'on': false};

  @override
  LabParams get preview => {'object': 'copper', 'on': true};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('object', tr('Object in the gap'), [for (final o in objects.keys) (o, objectName(o))]),
        LabToggle('on', tr('Switch on')),
      ];

  static String objectName(String id) => switch (id) {
        'nail' => tr('Iron nail'),
        'copper' => tr('Copper wire'),
        'foil' => tr('Aluminium foil'),
        'coin' => tr('Coin'),
        'graphite' => tr('Pencil lead (graphite)'),
        'plastic' => tr('Plastic scale'),
        'eraser' => tr('Eraser'),
        'wood' => tr('Wooden stick'),
        'glass' => tr('Glass rod'),
        _ => tr('Paper'),
      };

  static bool glows(LabParams p) => pBool(p, 'on') && (objects[pStr(p, 'object', 'nail')] ?? false);

  @override
  List<LabColumn> get columns => [LabColumn(tr('Object')), LabColumn(tr('Bulb glows?')), LabColumn(tr('Conductor or insulator'))];

  @override
  LabReading read(LabParams p) {
    if (!pBool(p, 'on')) return LabReading.not(tr('Switch on to test the object.'));
    final o = pStr(p, 'object', 'nail');
    final c = objects[o] ?? false;
    return LabReading.row([objectName(o), c ? tr('Yes') : tr('No'), c ? tr('Conductor') : tr('Insulator')]);
  }

  @override
  List<String> live(LabParams p) => [
        objectName(pStr(p, 'object', 'nail')),
        !pBool(p, 'on') ? tr('Switch off') : (glows(p) ? tr('The bulb glows') : tr('The bulb does not glow')),
      ];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final cond = {for (final r in rows) if (r[2] == tr('Conductor')) '${r[0]}'};
    final ins = {for (final r in rows) if (r[2] == tr('Insulator')) '${r[0]}'};
    return [
      if (cond.isNotEmpty) tr('Conductors: {list}.', {'list': cond.join(', ')}),
      if (ins.isNotEmpty) tr('Insulators: {list}.', {'list': ins.join(', ')}),
    ].join(' ');
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final on = pBool(p, 'on');
    final lit = glows(p);
    final wire = stroke(LabInk.wire, 3.5);
    // Wooden board.
    final board = Rect.fromLTWH(w * 0.06, h * 0.08, w * 0.88, h * 0.84);
    canvas.drawRRect(RRect.fromRectAndRadius(board, const Radius.circular(16)), fill(const Color(0xFFE9D8B8)));
    final left = w * 0.16, right = w * 0.84, top = h * 0.26, bottom = h * 0.72;

    // Cell on the left side.
    final cell = Rect.fromCenter(center: Offset(left, (top + bottom) / 2), width: 44, height: h * 0.22);
    canvas.drawLine(Offset(left, top), Offset(left, cell.top), wire);
    canvas.drawLine(Offset(left, cell.bottom), Offset(left, bottom), wire);
    canvas.drawRRect(RRect.fromRectAndRadius(cell, const Radius.circular(8)), fill(const Color(0xFF2F3B4A)));
    canvas.drawRect(Rect.fromLTWH(cell.left + 6, cell.top + 10, cell.width - 12, cell.height * 0.3), fill(const Color(0xFFE8A33D)));
    canvas.drawRect(Rect.fromCenter(center: cell.topCenter - const Offset(0, 4), width: 14, height: 8), fill(LabInk.faint));
    label(canvas, '+', cell.topCenter + const Offset(22, 6), size: 16, bold: true);
    label(canvas, '1.5 V', cell.center + const Offset(0, 16), size: 12, bold: true, color: Colors.white);

    // Switch on the top wire.
    final sx = w * 0.4;
    canvas.drawLine(Offset(left, top), Offset(sx - 26, top), wire);
    canvas.drawLine(Offset(sx + 26, top), Offset(w * 0.66, top), wire);
    canvas.drawCircle(Offset(sx - 26, top), 5, fill(LabInk.ink));
    canvas.drawCircle(Offset(sx + 26, top), 5, fill(LabInk.ink));
    final lever = on ? Offset(sx + 26, top) : Offset(sx + 16, top - 30);
    canvas.drawLine(Offset(sx - 26, top), lever, stroke(LabInk.ink, 4));
    label(canvas, on ? tr('Switch on') : tr('Switch off'), Offset(sx, top - 44), size: 13, color: LabInk.muted);

    // Bulb in its holder on the right.
    final bulb = Offset(w * 0.72, top - 4);
    canvas.drawLine(Offset(w * 0.66, top), Offset(bulb.dx - 12, top), wire);
    canvas.drawLine(Offset(bulb.dx + 12, top), Offset(right, top), wire);
    canvas.drawLine(Offset(right, top), Offset(right, bottom), wire);
    if (lit) {
      final glow = 34 + 3 * math.sin(t * 6);
      canvas.drawCircle(bulb - const Offset(0, 30), glow + 30, Paint()
        ..color = const Color(0x66FFD54F)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 24));
    }
    canvas.drawCircle(bulb - const Offset(0, 30), 26, fill(lit ? const Color(0xFFFFE680) : const Color(0x33E0E6EC)));
    canvas.drawCircle(bulb - const Offset(0, 30), 26, stroke(LabInk.ink, 2));
    final fil = Path()
      ..moveTo(bulb.dx - 8, bulb.dy - 22)
      ..quadraticBezierTo(bulb.dx - 4, bulb.dy - 42, bulb.dx, bulb.dy - 30)
      ..quadraticBezierTo(bulb.dx + 4, bulb.dy - 42, bulb.dx + 8, bulb.dy - 22);
    canvas.drawPath(fil, stroke(lit ? const Color(0xFFE67E22) : LabInk.muted, 2));
    canvas.drawRect(Rect.fromCenter(center: bulb + const Offset(0, 2), width: 30, height: 14), fill(const Color(0xFF8C939B)));

    // Two clips on the bottom wire, with the object between them.
    final gapL = Offset(w * 0.42, bottom), gapR = Offset(w * 0.6, bottom);
    canvas.drawLine(Offset(left, bottom), gapL - const Offset(14, 0), wire);
    canvas.drawLine(gapR + const Offset(14, 0), Offset(right, bottom), wire);
    for (final c in [gapL - const Offset(10, 0), gapR + const Offset(10, 0)]) {
      canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: c, width: 26, height: 14), const Radius.circular(3)), fill(const Color(0xFFC0392B)));
    }
    _object(canvas, pStr(p, 'object', 'nail'), gapL, gapR);
    label(canvas, objectName(pStr(p, 'object', 'nail')), (gapL + gapR) / 2 + const Offset(0, 40), size: 15, bold: true, halo: const Color(0xFFE9D8B8));

    // Charges flow round the loop when the bulb glows.
    if (lit) {
      final loop = [Offset(left, top), Offset(right, top), Offset(right, bottom), Offset(left, bottom), Offset(left, top)];
      final lens = [for (var k = 0; k < loop.length - 1; k++) (loop[k + 1] - loop[k]).distance];
      final total = lens.reduce((a, b) => a + b);
      for (var d = (t * 70) % 40; d < total; d += 40) {
        var rem = d;
        for (var k = 0; k < lens.length; k++) {
          if (rem <= lens[k]) {
            final at = Offset.lerp(loop[k], loop[k + 1], rem / lens[k])!;
            if (!cell.inflate(4).contains(at)) canvas.drawCircle(at, 3.2, fill(LabInk.accent));
            break;
          }
          rem -= lens[k];
        }
      }
    }
  }

  void _object(Canvas canvas, String id, Offset a, Offset b) {
    final mid = (a + b) / 2;
    final len = (b - a).distance;
    switch (id) {
      case 'nail':
        canvas.drawRect(Rect.fromCenter(center: mid, width: len, height: 7), fill(const Color(0xFF7D848C)));
        canvas.drawRect(Rect.fromCenter(center: a + const Offset(2, 0), width: 6, height: 20), fill(const Color(0xFF7D848C)));
      case 'copper':
        final path = Path()..moveTo(a.dx, a.dy);
        for (var k = 1; k <= 8; k++) {
          path.quadraticBezierTo(a.dx + len * (k - 0.5) / 8, a.dy + (k.isOdd ? -10 : 10), a.dx + len * k / 8, a.dy);
        }
        canvas.drawPath(path, stroke(const Color(0xFFC0703C), 4));
      case 'foil':
        final r = Rect.fromCenter(center: mid, width: len, height: 26);
        canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(6)), fill(const Color(0xFFD5DADF)));
        for (var k = 0; k < 5; k++) {
          canvas.drawLine(r.topLeft + Offset(len * (k + 0.5) / 5, 3), r.bottomLeft + Offset(len * (k + 0.2) / 5, -3), stroke(const Color(0xFFA7B0B8), 1.5));
        }
      case 'coin':
        canvas.drawLine(a, b, stroke(LabInk.wire, 3));
        canvas.drawCircle(mid, 20, fill(const Color(0xFFD9C37A)));
        canvas.drawCircle(mid, 20, stroke(const Color(0xFF8C7A2E), 2));
        label(canvas, '₹', mid, size: 18, bold: true, color: const Color(0xFF6B5A1E));
      case 'graphite':
        canvas.drawRect(Rect.fromCenter(center: mid, width: len, height: 5), fill(const Color(0xFF3A3A3A)));
      case 'plastic':
        final r = Rect.fromCenter(center: mid, width: len + 10, height: 22);
        canvas.drawRect(r, fill(const Color(0x885B9BD6)));
        for (var k = 0; k <= 10; k++) {
          canvas.drawLine(r.topLeft + Offset(r.width * k / 10, 0), r.topLeft + Offset(r.width * k / 10, k.isEven ? 8 : 5), stroke(LabInk.ink, 1));
        }
      case 'eraser':
        canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: mid, width: len * 0.7, height: 26), const Radius.circular(5)), fill(const Color(0xFFF2A0B0)));
      case 'wood':
        canvas.drawRect(Rect.fromCenter(center: mid, width: len, height: 12), fill(const Color(0xFFA06A3C)));
      case 'glass':
        canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: mid, width: len, height: 10), const Radius.circular(5)), fill(const Color(0x8899D5E0)));
        canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: mid, width: len, height: 10), const Radius.circular(5)), stroke(const Color(0xFF6FA8B8), 1.2));
      default:
        canvas.drawRect(Rect.fromCenter(center: mid, width: len, height: 30), fill(Colors.white));
        canvas.drawRect(Rect.fromCenter(center: mid, width: len, height: 30), stroke(LabInk.faint, 1));
    }
  }
}
