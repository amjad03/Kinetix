import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/bench.dart';

/// Bar magnets: what they pull, how poles push and pull, and the field
/// shown by iron filings and compasses.
class MagnetsBench extends LabBench {
  const MagnetsBench();

  static const objects = {'nail': true, 'spoon': true, 'pin': true, 'rubber': false, 'comb': false, 'pencil': false, 'marble': false, 'foil': false, 'copper': false};

  static const north = Color(0xFFD64541), south = Color(0xFF2F6FC9);

  @override
  String get kind => 'magnets';

  @override
  LabParams get defaults => {'mode': 'test', 'object': 'nail', 'pair': 'NN'};

  @override
  LabParams get preview => {'mode': 'field', 'object': 'nail', 'pair': 'NN'};

  @override
  List<LabControl> controls(LabParams p) => [
        LabChoice('mode', tr('Try'), [('test', tr('What it pulls')), ('poles', tr('Two magnets')), ('field', tr('Iron filings'))]),
        if (pStr(p, 'mode', 'test') == 'test') LabChoice('object', tr('Object'), [for (final o in objects.keys) (o, objectName(o))]),
        if (pStr(p, 'mode', 'test') == 'poles') LabChoice('pair', tr('Facing poles'), [('NN', tr('N and N')), ('NS', tr('N and S')), ('SS', tr('S and S'))]),
      ];

  static String objectName(String id) => switch (id) {
        'nail' => tr('Iron nail'),
        'spoon' => tr('Steel spoon'),
        'pin' => tr('Pin'),
        'rubber' => tr('Eraser'),
        'comb' => tr('Plastic comb'),
        'pencil' => tr('Wooden pencil'),
        'marble' => tr('Glass marble'),
        'foil' => tr('Aluminium foil'),
        _ => tr('Copper wire'),
      };

  static String pairName(String pair) => switch (pair) { 'NS' => tr('N and S'), 'SS' => tr('S and S'), _ => tr('N and N') };

  @override
  List<LabColumn> get columns => [LabColumn(tr('What we tried')), LabColumn(tr('What happened')), LabColumn(tr('So'))];

  @override
  LabReading read(LabParams p) => switch (pStr(p, 'mode', 'test')) {
        'poles' => pStr(p, 'pair', 'NN') == 'NS'
            ? LabReading.row([pairName('NS'), tr('Pulled together'), tr('Unlike poles attract')])
            : LabReading.row([pairName(pStr(p, 'pair', 'NN')), tr('Pushed apart'), tr('Like poles repel')]),
        'field' => LabReading.row([tr('Iron filings'), tr('Lines from N to S, crowded near the poles'), tr('The magnetic field is strongest at the poles')]),
        _ => (objects[pStr(p, 'object', 'nail')] ?? false)
            ? LabReading.row([objectName(pStr(p, 'object', 'nail')), tr('Pulled to the magnet'), tr('Magnetic')])
            : LabReading.row([objectName(pStr(p, 'object', 'nail')), tr('Not pulled'), tr('Non-magnetic')]),
      };

  @override
  List<String> live(LabParams p) => [read(p).row![1] as String];

  @override
  String? result(List<List<Object>> rows) {
    if (rows.isEmpty) return null;
    final mag = {for (final r in rows) if (r[2] == tr('Magnetic')) '${r[0]}'};
    final non = {for (final r in rows) if (r[2] == tr('Non-magnetic')) '${r[0]}'};
    return [
      if (mag.isNotEmpty) tr('Magnetic: {list}.', {'list': mag.join(', ')}),
      if (non.isNotEmpty) tr('Non-magnetic: {list}.', {'list': non.join(', ')}),
      if (rows.any((r) => r[2] == tr('Like poles repel'))) tr('Like poles repel.'),
      if (rows.any((r) => r[2] == tr('Unlike poles attract'))) tr('Unlike poles attract.'),
    ].join(' ');
  }

  /// A bar magnet centred at [c]; [northRight] puts the north pole on the right.
  void _magnet(Canvas canvas, Offset c, double len, double thick, bool northRight) {
    final r = Rect.fromCenter(center: c, width: len, height: thick);
    final leftHalf = Rect.fromLTRB(r.left, r.top, r.center.dx, r.bottom), rightHalf = Rect.fromLTRB(r.center.dx, r.top, r.right, r.bottom);
    canvas.drawRect(leftHalf, fill(northRight ? south : north));
    canvas.drawRect(rightHalf, fill(northRight ? north : south));
    canvas.drawRect(r, stroke(LabInk.ink, 2));
    label(canvas, northRight ? 'S' : 'N', leftHalf.center, size: thick * 0.5, bold: true, color: Colors.white);
    label(canvas, northRight ? 'N' : 'S', rightHalf.center, size: thick * 0.5, bold: true, color: Colors.white);
  }

  @override
  void paint(Canvas canvas, Size size, LabParams p, double t) {
    final w = size.width, h = size.height;
    final mode = pStr(p, 'mode', 'test');
    final s = math.min(w, h);
    if (mode == 'field') {
      _field(canvas, size);
      return;
    }
    if (mode == 'poles') {
      final pair = pStr(p, 'pair', 'NN');
      final attract = pair == 'NS';
      final len = w * 0.3, thick = s * 0.12;
      final gap = attract ? 0.0 : w * 0.16;
      final c1 = Offset(w * 0.5 - len / 2 - gap / 2, h * 0.5), c2 = Offset(w * 0.5 + len / 2 + gap / 2, h * 0.5);
      // Magnet 1 shows its right end, magnet 2 its left end, to each other.
      _magnet(canvas, c1, len, thick, pair != 'SS');
      _magnet(canvas, c2, len, thick, pair != 'NN');
      if (attract) {
        label(canvas, tr('Pulled together'), Offset(w * 0.5, h * 0.25), size: 20, bold: true, color: LabInk.green);
      } else {
        final a = stroke(LabInk.red, 3);
        for (final dir in [-1.0, 1.0]) {
          final from = Offset(w * 0.5 + dir * gap * 0.15, h * 0.5 - thick);
          final to = from + Offset(dir * w * 0.12, 0);
          canvas.drawLine(from, to, a);
          arrowHead(canvas, to, to - from, a);
        }
        label(canvas, tr('Pushed apart'), Offset(w * 0.5, h * 0.25), size: 20, bold: true, color: LabInk.red);
      }
      return;
    }
    // What it pulls: the magnet on the left, the object on the right.
    final len = w * 0.36, thick = s * 0.12;
    final mc = Offset(w * 0.28, h * 0.5);
    _magnet(canvas, mc, len, thick, true);
    final o = pStr(p, 'object', 'nail');
    final pulled = objects[o] ?? false;
    final end = mc.dx + len / 2;
    // A pulled object touches the end of the magnet.
    final u = s * 0.05;
    final halfWidth = switch (o) { 'nail' => u * 3.8, 'spoon' => u * 3.7, 'pin' => u * 2.6, _ => u * 3 };
    final at = pulled ? Offset(end + halfWidth + 2, h * 0.5) : Offset(w * 0.74, h * 0.5);
    if (!pulled) {
      dashed(canvas, Offset(end + 10, h * 0.5), Offset(at.dx - 50, h * 0.5), stroke(LabInk.faint, 2));
    } else {
      label(canvas, tr('Pulled to the magnet'), Offset(w * 0.62, h * 0.24), size: 20, bold: true, color: LabInk.green);
    }
    _thing(canvas, o, at, s);
    label(canvas, objectName(o), at + Offset(0, s * 0.14), size: 15, bold: true);
    if (!pulled) label(canvas, tr('Not pulled'), Offset(w * 0.62, h * 0.24), size: 20, bold: true, color: LabInk.muted);
  }

  void _thing(Canvas canvas, String id, Offset c, double s) {
    final u = s * 0.05;
    switch (id) {
      case 'nail':
        canvas.drawRect(Rect.fromCenter(center: c, width: u * 7, height: u * 0.7), fill(const Color(0xFF7D848C)));
        canvas.drawRect(Rect.fromCenter(center: c - Offset(u * 3.5, 0), width: u * 0.6, height: u * 2), fill(const Color(0xFF7D848C)));
      case 'spoon':
        canvas.drawOval(Rect.fromCenter(center: c - Offset(u * 2.4, 0), width: u * 2.4, height: u * 1.6), fill(const Color(0xFFB8C0C8)));
        canvas.drawRect(Rect.fromLTWH(c.dx - u * 1.3, c.dy - u * 0.25, u * 4.5, u * 0.5), fill(const Color(0xFFB8C0C8)));
      case 'pin':
        canvas.drawLine(c - Offset(u * 2.5, 0), c + Offset(u * 2.5, 0), stroke(const Color(0xFF7D848C), 2));
        canvas.drawCircle(c + Offset(u * 2.5, 0), u * 0.4, fill(const Color(0xFFD64541)));
      case 'rubber':
        canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: c, width: u * 3.5, height: u * 1.8), const Radius.circular(4)), fill(const Color(0xFFF2A0B0)));
      case 'comb':
        final r = Rect.fromCenter(center: c, width: u * 6, height: u * 0.9);
        canvas.drawRect(r, fill(const Color(0xFF2B2B2B)));
        for (var k = 0; k < 16; k++) {
          canvas.drawLine(r.bottomLeft + Offset(r.width * (k + 0.5) / 16, 0), r.bottomLeft + Offset(r.width * (k + 0.5) / 16, u * 1.2), stroke(const Color(0xFF2B2B2B), 2));
        }
      case 'pencil':
        canvas.drawRect(Rect.fromCenter(center: c, width: u * 6, height: u * 0.9), fill(const Color(0xFFF2C12E)));
        canvas.drawPath(Path()..addPolygon([c + Offset(u * 3, -u * 0.45), c + Offset(u * 3.9, 0), c + Offset(u * 3, u * 0.45)], true), fill(const Color(0xFFE0B68A)));
      case 'marble':
        canvas.drawCircle(c, u * 1.2, fill(const Color(0xAA7FC8E8)));
        canvas.drawCircle(c - Offset(u * 0.4, u * 0.4), u * 0.3, fill(Colors.white.withValues(alpha: 0.7)));
      case 'foil':
        canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: c, width: u * 3, height: u * 2), const Radius.circular(6)), fill(const Color(0xFFD5DADF)));
      default:
        final path = Path()..moveTo(c.dx - u * 3, c.dy);
        for (var k = 1; k <= 6; k++) {
          path.quadraticBezierTo(c.dx - u * 3 + u * (k - 0.5), c.dy + (k.isOdd ? -u * 0.7 : u * 0.7), c.dx - u * 3 + u * k, c.dy);
        }
        canvas.drawPath(path, stroke(const Color(0xFFC0703C), 3));
    }
  }

  /// Iron filings and compass needles around one bar magnet.
  void _field(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final c = Offset(w * 0.5, h * 0.5);
    final len = w * 0.3, thick = math.min(w, h) * 0.11;
    final nPole = c + Offset(len * 0.4, 0), sPole = c - Offset(len * 0.4, 0);
    Offset field(Offset q) {
      final a = q - nPole, b = q - sPole;
      final da = math.pow(a.distance, 3).toDouble(), db = math.pow(b.distance, 3).toDouble();
      return a / (da == 0 ? 1 : da) - b / (db == 0 ? 1 : db);
    }

    final magnet = Rect.fromCenter(center: c, width: len, height: thick).inflate(4);
    // Filings: short dashes along the field, thicker near the poles.
    final rnd = math.Random(3);
    final filing = Paint()
      ..color = const Color(0xFF4A4A4A)
      ..strokeWidth = 1.6
      ..strokeCap = StrokeCap.round;
    for (var k = 0; k < 2600; k++) {
      final q = Offset(rnd.nextDouble() * w, rnd.nextDouble() * h);
      if (magnet.contains(q)) continue;
      final f = field(q);
      final m = f.distance;
      if (m == 0) continue;
      // Fewer filings stay where the field is weak.
      final strength = (m * math.pow(len, 2)).clamp(0.0, 4.0);
      if (rnd.nextDouble() > 0.25 + strength * 0.4) continue;
      final u = f / m * 6;
      canvas.drawLine(q - u, q + u, filing);
    }
    // A few field lines with arrows, from N round to S.
    for (final ang in [-80.0, -55.0, -30.0, 30.0, 55.0, 80.0]) {
      var q = nPole + Offset(math.cos(ang * math.pi / 180), math.sin(ang * math.pi / 180)) * 12;
      final path = Path()..moveTo(q.dx, q.dy);
      var arrowed = false;
      for (var step = 0; step < 900; step++) {
        final f = field(q);
        if (f.distance == 0) break;
        q = q + f / f.distance * 3;
        path.lineTo(q.dx, q.dy);
        if (!arrowed && step == 60) {
          arrowHead(canvas, q, f, stroke(LabInk.blue, 2), size: 9);
          arrowed = true;
        }
        if ((q - sPole).distance < 12 || q.dx < -50 || q.dx > w + 50 || q.dy < -50 || q.dy > h + 50) break;
      }
      canvas.drawPath(path, stroke(LabInk.blue.withValues(alpha: 0.55), 1.6));
    }
    _magnet(canvas, c, len, thick, true);
    // Compass needles point along the field (red end = north end of the needle).
    for (final at in [c + Offset(0, -h * 0.3), c + Offset(0, h * 0.3), c + Offset(w * 0.34, 0), c - Offset(w * 0.34, 0), c + Offset(w * 0.28, -h * 0.26), c + Offset(-w * 0.28, h * 0.26)]) {
      final f = field(at);
      final u = f / (f.distance == 0 ? 1 : f.distance) * 16;
      canvas.drawCircle(at, 20, fill(Colors.white));
      canvas.drawCircle(at, 20, stroke(LabInk.ink, 1.5));
      canvas.drawLine(at, at + u, stroke(north, 4));
      canvas.drawLine(at, at - u, stroke(south, 4));
    }
  }
}
