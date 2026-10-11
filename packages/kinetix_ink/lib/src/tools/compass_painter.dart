import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';

const _steel = [Color(0xFF8A9199), Color(0xFFF6F8FA), Color(0xFFC6CBD1), Color(0xFF7A8189), Color(0xFFB9BEC5)];
const _steelStops = [0.0, 0.28, 0.55, 0.85, 1.0];

ui.Gradient _across(double half, {List<Color> colors = _steel}) =>
    ui.Gradient.linear(Offset(0, -half), Offset(0, half), colors, colors.length == 5 ? _steelStops : null);

Paint _line(Color c, double w) => Paint()
  ..color = c
  ..strokeWidth = w
  ..style = PaintingStyle.stroke;

/// Paints a drafting compass in board units: knurled handle, hinge head with a screw, a needle leg
/// with a tip clamp and wheel, and a pencil leg with a bracket, adjusting wheel, lead holder and
/// lead. The needle point lands on [needle] and the lead tip on [pencil]; [k] is one screen pixel
/// in board units, so fine detail never shrinks below what a phone can show.
void paintCompass(Canvas canvas, {required Offset needle, required Offset pencil, required Offset hinge, required double k}) {
  final nl = needle - hinge, pl = pencil - hinge;
  final legLen = (nl.distance + pl.distance) / 2;
  if (legLen <= 0) return;
  // One width unit for the whole instrument: grows with the legs, never below a few pixels.
  final s = (legLen * 0.075).clamp(6 * k, 26 * k).toDouble();
  final axis = (needle + pencil) / 2 - hinge;
  final up = axis.distance == 0 ? const Offset(0, -1) : -axis / axis.distance;

  _shadow(canvas, hinge, needle, s);
  _shadow(canvas, hinge, pencil, s);
  _needleLeg(canvas, hinge, needle, pencil, s);
  _pencilLeg(canvas, hinge, pencil, needle, s);
  _head(canvas, hinge, up, s);
}

void _shadow(Canvas canvas, Offset a, Offset b, double s) {
  final off = Offset(s * 0.35, s * 0.5);
  canvas.drawLine(
    a + off,
    b + off,
    Paint()
      ..color = const Color(0x40000000)
      ..strokeWidth = s
      ..strokeCap = StrokeCap.round
      ..maskFilter = MaskFilter.blur(BlurStyle.normal, s * 0.35),
  );
}

/// +1 when [other] lies on the +y side of the leg from [from] to [to], else -1.
double _inner(Offset from, Offset to, Offset other) {
  final d = to - from, o = other - from;
  return (d.dx * o.dy - d.dy * o.dx) >= 0 ? 1 : -1;
}

/// Runs [draw] in a frame whose +x runs from [from] to [to] (length passed in), +y perpendicular.
void _frame(Canvas canvas, Offset from, Offset to, void Function(double len) draw) {
  final d = to - from;
  canvas
    ..save()
    ..translate(from.dx, from.dy)
    ..rotate(math.atan2(d.dy, d.dx));
  draw(d.distance);
  canvas.restore();
}

Path _taper(double x0, double x1, double w0, double w1) =>
    Path()..addPolygon([Offset(x0, -w0 / 2), Offset(x1, -w1 / 2), Offset(x1, w1 / 2), Offset(x0, w0 / 2)], true);

void _metal(Canvas canvas, Path p, double half, {double edge = 0.8}) {
  canvas.drawPath(p, Paint()..shader = _across(half));
  canvas.drawPath(p, _line(const Color(0x66303840), edge));
}

/// A round knurled wheel of radius [r] at [c].
void _wheel(Canvas canvas, Offset c, double r) {
  canvas.drawCircle(
    c,
    r,
    Paint()..shader = ui.Gradient.radial(c - Offset(r * 0.3, r * 0.3), r * 1.4, const [Color(0xFFF2F4F6), Color(0xFF8C939B)]),
  );
  final ridge = _line(const Color(0x88404850), math.max(0.6, r * 0.08));
  for (var i = 0; i < 16; i++) {
    final a = i * math.pi / 8;
    canvas.drawLine(c + Offset(math.cos(a), math.sin(a)) * r * 0.72, c + Offset(math.cos(a), math.sin(a)) * r, ridge);
  }
  canvas.drawCircle(c, r, ridge);
  canvas.drawCircle(c, r * 0.28, Paint()..color = const Color(0xFF5F666E));
}

void _needleLeg(Canvas canvas, Offset hinge, Offset needle, Offset pencil, double s) {
  final out = -_inner(hinge, needle, pencil);
  _frame(canvas, hinge, needle, (len) {
    _metal(canvas, _taper(0, len * 0.86, s, s * 0.72), s / 2);
    // Light seam along the leg.
    canvas.drawLine(Offset(0, -s * 0.18), Offset(len * 0.86, -s * 0.13), _line(const Color(0x88FFFFFF), s * 0.07));
    // Tip clamp: a bracket with a knurled wheel on the outer side.
    final foot = Path()
      ..moveTo(len * 0.78, -s * 0.4)
      ..lineTo(len * 0.9, -s * 0.28)
      ..lineTo(len * 0.9, s * 0.28)
      ..lineTo(len * 0.78, s * 0.4)
      ..close();
    _metal(canvas, foot, s * 0.4);
    _wheel(canvas, Offset(len * 0.84, out * s * 0.72), s * 0.5);
    // The needle itself.
    final nd = Path()..addPolygon([Offset(len * 0.9, -s * 0.11), Offset(len, 0), Offset(len * 0.9, s * 0.11)], true);
    canvas.drawPath(nd, Paint()..shader = _across(s * 0.11, colors: const [Color(0xFFE9ECEF), Color(0xFF6D747C)]));
  });
}

void _pencilLeg(Canvas canvas, Offset hinge, Offset pencil, Offset needle, double s) {
  final out = -_inner(hinge, pencil, needle);
  _frame(canvas, hinge, pencil, (len) {
    _metal(canvas, _taper(0, len * 0.68, s, s * 0.8), s / 2);
    canvas.drawLine(Offset(0, -s * 0.18), Offset(len * 0.68, -s * 0.14), _line(const Color(0x88FFFFFF), s * 0.07));
    // Bracket: a curved leaf with a rod and a knurled wheel on the outer side.
    final leaf = Path()
      ..moveTo(len * 0.5, out * s * 0.4)
      ..quadraticBezierTo(len * 0.55, out * s * 3.6, len * 0.7, out * s * 0.4)
      ..quadraticBezierTo(len * 0.62, out * s * 1.6, len * 0.5, out * s * 0.4)
      ..close();
    _metal(canvas, leaf, s * 1.6, edge: 0.7);
    final rodY = out * s * 1.6;
    canvas.drawLine(Offset(len * 0.54, rodY), Offset(len * 0.66, rodY), _line(const Color(0xFF69707A), s * 0.12));
    _wheel(canvas, Offset(len * 0.6, rodY), s * 0.4);
    // Lead holder: a sleeve, a knurled adjusting collar, then the lead cone and lead.
    _metal(canvas, _taper(len * 0.66, len * 0.92, s * 0.62, s * 0.5), s * 0.31);
    final collar = Rect.fromLTRB(len * 0.76, -s * 0.5, len * 0.84, s * 0.5);
    canvas.drawRRect(RRect.fromRectAndRadius(collar, Radius.circular(s * 0.12)), Paint()..shader = _across(s * 0.5));
    final knurl = _line(const Color(0x99404850), math.max(0.6, s * 0.05));
    for (var x = collar.left + s * 0.05; x < collar.right; x += math.max(s * 0.11, 1.2)) {
      canvas.drawLine(Offset(x, collar.top), Offset(x, collar.bottom), knurl);
    }
    canvas.drawPath(_taper(len * 0.92, len * 0.975, s * 0.5, s * 0.2), Paint()..shader = _across(s * 0.25));
    final lead = Path()..addPolygon([Offset(len * 0.975, -s * 0.1), Offset(len, 0), Offset(len * 0.975, s * 0.1)], true);
    canvas.drawPath(lead, Paint()..color = const Color(0xFF2B2F36));
  });
}

void _head(Canvas canvas, Offset hinge, Offset up, double s) {
  canvas
    ..save()
    ..translate(hinge.dx, hinge.dy)
    ..rotate(math.atan2(up.dy, up.dx));
  // Soft shadow under the head and handle.
  canvas.drawRRect(
    RRect.fromLTRBR(-1.4 * s + s * 0.3, -s * 0.9 + s * 0.45, 5.2 * s + s * 0.3, s * 0.9 + s * 0.45, Radius.circular(s * 0.3)),
    Paint()
      ..color = const Color(0x33000000)
      ..maskFilter = MaskFilter.blur(BlurStyle.normal, s * 0.3),
  );
  // Handle: a neck and a knurled grip.
  canvas.drawRRect(RRect.fromLTRBR(2.0 * s, -s * 0.34, 2.7 * s, s * 0.34, Radius.circular(s * 0.1)), Paint()..shader = _across(s * 0.34));
  final grip = RRect.fromLTRBR(2.7 * s, -s * 0.46, 5.2 * s, s * 0.46, Radius.circular(s * 0.16));
  canvas.drawRRect(grip, Paint()..shader = _across(s * 0.46));
  final knurl = _line(const Color(0x77404850), math.max(0.6, s * 0.05));
  for (var x = 2.8 * s; x < 5.1 * s; x += math.max(s * 0.14, 1.4)) {
    canvas.drawLine(Offset(x, -s * 0.44), Offset(x, s * 0.44), knurl);
  }
  canvas.drawRRect(grip, _line(const Color(0x66303840), 0.8));
  // Hinge head: a bright shield with a bevel, an embossed mark and the screw.
  final head = RRect.fromLTRBR(-1.4 * s, -s * 0.95, 2.1 * s, s * 0.95, Radius.circular(s * 0.3));
  canvas.drawRRect(head, Paint()..shader = _across(s * 0.95));
  canvas.drawRRect(head, _line(const Color(0x77303840), 0.9));
  canvas.drawRRect(head.deflate(s * 0.14), _line(const Color(0x66FFFFFF), 0.7));
  final mark = Offset(1.0 * s, 0);
  canvas.drawCircle(mark, s * 0.34, _line(const Color(0x88606870), math.max(0.6, s * 0.05)));
  canvas.drawCircle(mark, s * 0.14, _line(const Color(0x88606870), math.max(0.6, s * 0.05)));
  // Hinge screw with its slot.
  final screw = Offset(-0.55 * s, 0);
  canvas.drawCircle(
    screw,
    s * 0.3,
    Paint()..shader = ui.Gradient.radial(screw - Offset(s * 0.08, s * 0.08), s * 0.4, const [Color(0xFFF4F6F8), Color(0xFF7D848C)]),
  );
  canvas.drawCircle(screw, s * 0.3, _line(const Color(0x99303840), 0.8));
  canvas
    ..save()
    ..translate(screw.dx, screw.dy)
    ..rotate(-0.6)
    ..drawLine(Offset(-s * 0.24, 0), Offset(s * 0.24, 0), _line(const Color(0xFF3A4048), math.max(1, s * 0.08))..strokeCap = StrokeCap.round)
    ..restore();
  canvas.restore();
}
