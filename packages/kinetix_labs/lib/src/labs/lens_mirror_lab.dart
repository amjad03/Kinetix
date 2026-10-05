import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../lab_scaffold.dart';
import '../models/optics.dart';

String _signed(double v) {
  final s = v.toStringAsFixed(2);
  if (double.parse(s) == 0) return '0.00';
  return v > 0 ? '+$s' : s.replaceFirst('-', '−');
}

/// Ray diagrams for convex/concave lenses and concave/convex mirrors with the New Cartesian
/// sign convention. Drag the object (or use the slider and the position chips).
class LensMirrorLab extends StatefulWidget {
  const LensMirrorLab({super.key, this.preset});

  /// 'convex-lens', 'concave-lens', 'concave-mirror', 'convex-mirror', or just 'lens' / 'mirror'.
  final String? preset;

  @override
  State<LensMirrorLab> createState() => _LensMirrorLabState();
}

class _LensMirrorLabState extends State<LensMirrorLab> {
  late OpticKind _kind;
  double _f = 10; // |f| in cm
  double _u = 25; // |u| in cm
  static const double _objH = 3; // object height, cm

  @override
  void initState() {
    super.initState();
    _reset();
  }

  void _reset() {
    _kind = switch (widget.preset) {
      'concave-lens' => OpticKind.concaveLens,
      'concave-mirror' || 'mirror' => OpticKind.concaveMirror,
      'convex-mirror' => OpticKind.convexMirror,
      _ => OpticKind.convexLens,
    };
    _f = 10;
    _u = 25;
  }

  double get _uMin => 1;
  double get _uMax => 60;

  void _setU(double u) => setState(() => _u = u.clamp(_uMin, _uMax));

  @override
  Widget build(BuildContext context) {
    final img = formImage(_kind, -_u, _f);
    final pal = LabPalette(context);
    final lens = _kind.isLens;
    final twoF = lens ? '2F' : 'C';
    final pole = lens ? 'O' : 'P';
    final converging = _kind == OpticKind.convexLens || _kind == OpticKind.concaveMirror;
    return LabScaffold(
      title: lens ? 'Ray diagrams: lenses' : 'Ray diagrams: mirrors',
      subtitle: 'CBSE Class 10 Science · Light – Reflection and Refraction',
      formula: lens ? 'Lens formula  1/v − 1/u = 1/f    ·    m = v/u' : 'Mirror formula  1/v + 1/u = 1/f    ·    m = −v/u',
      aim: 'To locate the image formed by a ${_kind.title.toLowerCase()} for different object positions, using principal '
          'rays and the ${lens ? 'lens' : 'mirror'} formula with the New Cartesian sign convention.',
      observe: [
        'Distances are measured from the ${lens ? 'optical centre O' : 'pole P'}. Against the incident light (to the left) they are negative.',
        if (converging) 'Move the object from far away towards F: the real, inverted image moves away and grows.',
        if (converging) 'At F the rays come out parallel: the image is at infinity. Inside F the image is virtual, erect and magnified.',
        if (!converging) 'Wherever the object is, the image is virtual, erect and diminished.',
        'A negative magnification means the image is inverted.',
      ],
      onReset: () => setState(_reset),
      simulation: LayoutBuilder(builder: (context, box) {
        final view = _View(box.biggest, _f, _u);
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onHorizontalDragUpdate: (d) => _drag(view, d.localPosition.dx),
          onTapDown: (d) {
            if (d.localPosition.dx < view.toPx(0, 0).dx) _drag(view, d.localPosition.dx);
          },
          child: CustomPaint(
            key: const ValueKey('optics-canvas'),
            painter: _OpticsPainter(img, view, pal, _objH),
            size: Size.infinite,
          ),
        );
      }),
      readouts: [
        Readout('Object distance u', _signed(img.u), unit: 'cm'),
        Readout('Image distance v', img.atInfinity ? '∞' : _signed(img.v!), unit: img.atInfinity ? '' : 'cm', highlight: true, key: const ValueKey('readout-v')),
        Readout('Focal length f', _signed(img.f), unit: 'cm'),
        Readout('Magnification m', img.atInfinity ? '∞' : _signed(img.m!), key: const ValueKey('readout-m')),
        Readout('Nature', '${img.nature}, ${img.orientation.toLowerCase()}', key: const ValueKey('readout-nature')),
        Readout('Size', img.size),
        Readout('Object', img.objectPosition),
        Readout('Image', img.position),
      ],
      controls: [
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          children: [
            for (final k in OpticKind.values)
              ChoiceChip(label: Text(k.title), selected: _kind == k, onSelected: (_) => setState(() => _kind = k)),
          ],
        ),
        const SizedBox(height: Kx.s12),
        LabSliderRow(
          key: const ValueKey('slider-u'),
          label: 'Object distance |u|',
          value: _u,
          min: _uMin,
          max: _uMax,
          divisions: ((_uMax - _uMin) * 2).round(),
          unit: 'cm',
          onChanged: _setU,
        ),
        LabSliderRow(
          label: 'Focal length |f|',
          value: _f,
          min: 5,
          max: 20,
          divisions: 30,
          unit: 'cm',
          onChanged: (v) => setState(() => _f = v),
        ),
        const LabSectionLabel('Place the object'),
        Wrap(
          spacing: Kx.s8,
          runSpacing: Kx.s8,
          children: [
            ActionChip(label: Text('Beyond $twoF'), onPressed: () => _setU(2.6 * _f)),
            ActionChip(label: Text('At $twoF'), onPressed: () => _setU(2 * _f)),
            ActionChip(label: Text('Between F and $twoF'), onPressed: () => _setU(1.5 * _f)),
            ActionChip(label: const Text('At F'), onPressed: () => _setU(_f)),
            ActionChip(label: Text('Between F and $pole'), onPressed: () => _setU(0.5 * _f)),
          ],
        ),
      ],
    );
  }

  void _drag(_View view, double px) {
    var u = -view.toCm(px);
    // Snap to F and 2F so the special cases are easy to show.
    for (final target in [_f, 2 * _f]) {
      if ((u - target).abs() * view.scale < 10) u = target;
    }
    _setU(u);
  }
}

/// World (cm) ↔ screen mapping. The optic sits at x = 0, slightly right of centre.
class _View {
  _View(this.size, double f, double u) {
    final half = math.max(3.2 * f, u * 1.12);
    scale = size.width / (2 * half);
    // Heights are drawn taller than true scale, as in textbook diagrams. Straight lines stay
    // straight and meet at the same points, so the construction is still exact.
    yScale = math.max(scale, size.height * 0.2 / _LensMirrorLabState._objH);
    origin = Offset(size.width / 2, size.height * 0.55);
  }
  final Size size;
  late final double scale, yScale;
  late final Offset origin;

  Offset toPx(double x, double y) => Offset(origin.dx + x * scale, origin.dy - y * yScale);
  double toCm(double px) => (px - origin.dx) / scale;
}

class _OpticsPainter extends CustomPainter {
  _OpticsPainter(this.img, this.view, this.pal, this.objH);
  final OpticsImage img;
  final _View view;
  final LabPalette pal;
  final double objH;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.width < 50 || size.height < 50) return;
    final s = (math.min(size.width / 700, size.height / 380)).clamp(0.85, 1.6);
    final label = pal.textStyle.copyWith(fontSize: 14 * s, color: pal.ink, fontWeight: FontWeight.w600);
    final small = pal.textStyle.copyWith(fontSize: 12 * s, color: pal.muted);
    final kind = img.kind;
    final fa = img.f.abs();
    final lens = kind.isLens;
    final o = view.toPx(0, 0);
    canvas.clipRect(Offset.zero & size);

    // Principal axis.
    canvas.drawLine(Offset(0, o.dy), Offset(size.width, o.dy), Paint()
      ..color = pal.muted
      ..strokeWidth = 1.4 * s);

    // Focus and 2F / C marks.
    void mark(double x, String t) {
      final p = view.toPx(x, 0);
      canvas.drawCircle(p, 3.5 * s, Paint()..color = pal.ink);
      paintLabel(canvas, t, p + Offset(0, 8 * s), label, align: Alignment.topCenter);
    }

    if (lens) {
      for (final sign in [-1.0, 1.0]) {
        mark(sign * fa, 'F');
        mark(sign * 2 * fa, '2F');
      }
      paintLabel(canvas, 'O', o + Offset(-8 * s, 8 * s), label, align: Alignment.topRight);
    } else {
      final side = kind == OpticKind.concaveMirror ? -1.0 : 1.0;
      mark(side * fa, 'F');
      mark(side * 2 * fa, 'C');
      paintLabel(canvas, 'P', o + Offset(8 * s, 6 * s), label, align: Alignment.topLeft);
    }

    // The optic.
    final halfH = math.min(size.height * 0.45, view.yScale * objH * 1.7);
    _drawOptic(canvas, kind, o, halfH, s);

    // Object (an upright arrow) and image.
    final tip = Offset(img.u, objH);
    _arrow(canvas, view.toPx(img.u, 0), view.toPx(img.u, objH), pal.blue, 3.2 * s, dashed: false);
    paintLabel(canvas, 'Object', view.toPx(img.u, objH) - Offset(0, 8 * s), label.copyWith(color: pal.blue), align: Alignment.bottomCenter);

    final rays = <(Offset, Color)>[];
    // Hit points on the optic for the principal rays.
    // Paraxial rays meet the mirror at the pole's plane (x = 0); the drawn curve is shallow enough
    // that the difference does not show.
    double mirrorX(double y) => 0;
    rays.add((Offset(mirrorX(objH), objH), pal.amber)); // parallel to the axis
    rays.add((Offset(mirrorX(0), 0), pal.green)); // through O / to P
    // Through (or towards) F for lenses; towards C for mirrors.
    final aim = lens
        ? Offset(kind == OpticKind.convexLens ? -fa : fa, 0)
        : Offset(kind == OpticKind.concaveMirror ? -2 * fa : 2 * fa, 0);
    if ((aim.dx - img.u).abs() > 1e-6) {
      final y = objH + (0 - img.u) * (aim.dy - objH) / (aim.dx - img.u);
      if (y.abs() < size.height / view.yScale) rays.add((Offset(mirrorX(y), y), pal.purple));
    }

    final far = (size.width + size.height) / view.scale * 2;
    for (final (hit, color) in rays) {
      final paint = Paint()
        ..color = color
        ..strokeWidth = 2.4 * s
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round;
      final a = view.toPx(tip.dx, tip.dy), b = view.toPx(hit.dx, hit.dy);
      canvas.drawLine(a, b, paint);
      _midArrow(canvas, a, b, color, s);
      Offset dir;
      if (img.atInfinity) {
        // All outgoing rays parallel to the undeviated one.
        final through = Offset(0 - img.u, 0 - objH);
        dir = lens ? through : Offset(-through.dx, through.dy);
      } else {
        final im = Offset(img.v!, img.m! * objH);
        if (img.isReal) {
          dir = im - hit;
        } else {
          dir = hit - im;
          _dashed(canvas, view.toPx(hit.dx, hit.dy), view.toPx(im.dx, im.dy), paint..color = color.withValues(alpha: 0.7), s);
          paint.color = color;
        }
      }
      if (dir.distance == 0) continue;
      final end = hit + dir / dir.distance * far;
      final pb = view.toPx(end.dx, end.dy);
      canvas.drawLine(b, pb, paint);
      _midArrow(canvas, b, b + (pb - b) / (pb - b).distance * 120 * s, color, s);
    }

    if (img.atInfinity) {
      paintLabel(canvas, 'Rays emerge parallel: image at infinity', Offset(size.width / 2, 10 * s), label.copyWith(color: pal.red), align: Alignment.topCenter, background: pal.surface);
    } else {
      final base = view.toPx(img.v!, 0), top = view.toPx(img.v!, img.m! * objH);
      final onScreen = base.dx >= 0 && base.dx <= size.width;
      if (onScreen) {
        _arrow(canvas, base, top, pal.red, 3.2 * s, dashed: !img.isReal);
        paintLabel(canvas, img.isReal ? 'Image' : 'Image (virtual)', top + Offset(0, img.m! >= 0 ? -8 * s : 8 * s), label.copyWith(color: pal.red),
            align: img.m! >= 0 ? Alignment.bottomCenter : Alignment.topCenter, background: pal.surface.withValues(alpha: 0.8));
      } else {
        paintLabel(canvas, 'Image beyond the view, v = ${img.v!.toStringAsFixed(1)} cm ${base.dx < 0 ? '←' : '→'}',
            Offset(base.dx < 0 ? 8 * s : size.width - 8 * s, 10 * s), label.copyWith(color: pal.red), align: base.dx < 0 ? Alignment.topLeft : Alignment.topRight, background: pal.surface);
      }
    }
    paintLabel(canvas, 'Drag to move the object', Offset(10 * s, size.height - 8 * s), small, align: Alignment.bottomLeft);
  }

  void _drawOptic(Canvas canvas, OpticKind kind, Offset o, double halfH, double s) {
    final edge = Paint()
      ..color = pal.blue
      ..strokeWidth = 2.4 * s
      ..style = PaintingStyle.stroke;
    final fill = Paint()..color = pal.blue.withValues(alpha: 0.16);
    if (kind.isLens) {
      final bulge = 12 * s;
      final p = Path();
      if (kind == OpticKind.convexLens) {
        p
          ..moveTo(o.dx, o.dy - halfH)
          ..quadraticBezierTo(o.dx + bulge * 2, o.dy, o.dx, o.dy + halfH)
          ..quadraticBezierTo(o.dx - bulge * 2, o.dy, o.dx, o.dy - halfH);
      } else {
        final w = 10 * s;
        p
          ..moveTo(o.dx - w, o.dy - halfH)
          ..lineTo(o.dx + w, o.dy - halfH)
          ..quadraticBezierTo(o.dx + 1 * s, o.dy, o.dx + w, o.dy + halfH)
          ..lineTo(o.dx - w, o.dy + halfH)
          ..quadraticBezierTo(o.dx - 1 * s, o.dy, o.dx - w, o.dy - halfH);
      }
      canvas.drawPath(p, fill);
      canvas.drawPath(p, edge);
      return;
    }
    // Mirror: a gentle curve with hatching on the back.
    final dir = kind == OpticKind.concaveMirror ? -1.0 : 1.0;
    final fa = img.f.abs();
    final p = Path();
    final hatch = Paint()
      ..color = pal.muted
      ..strokeWidth = 1.4 * s;
    for (var i = 0; i <= 40; i++) {
      final yCm = (i / 40 * 2 - 1) * halfH / view.yScale;
      final x = dir * yCm * yCm / (4 * fa) * 0.12;
      final pt = view.toPx(x, yCm);
      if (i == 0) {
        p.moveTo(pt.dx, pt.dy);
      } else {
        p.lineTo(pt.dx, pt.dy);
      }
      if (i % 3 == 0) canvas.drawLine(pt, pt + Offset(10 * s, -8 * s), hatch);
    }
    canvas.drawPath(p, edge..strokeWidth = 3.6 * s);
  }

  void _arrow(Canvas canvas, Offset base, Offset tip, Color color, double width, {required bool dashed}) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = width
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    if (dashed) {
      _dashed(canvas, base, tip, paint, width / 3.2);
    } else {
      canvas.drawLine(base, tip, paint);
    }
    final d = tip - base;
    if (d.distance < 1) return;
    final u = d / d.distance, n = Offset(-u.dy, u.dx);
    final l = width * 4;
    canvas.drawPath(
      Path()
        ..moveTo(tip.dx, tip.dy)
        ..lineTo(tip.dx - u.dx * l + n.dx * l * 0.55, tip.dy - u.dy * l + n.dy * l * 0.55)
        ..lineTo(tip.dx - u.dx * l - n.dx * l * 0.55, tip.dy - u.dy * l - n.dy * l * 0.55)
        ..close(),
      Paint()..color = color,
    );
  }

  void _midArrow(Canvas canvas, Offset a, Offset b, Color color, double s) {
    final d = b - a;
    if (d.distance < 30 * s) return;
    final u = d / d.distance, n = Offset(-u.dy, u.dx);
    final m = a + d * 0.5;
    final l = 9 * s;
    canvas.drawPath(
      Path()
        ..moveTo(m.dx + u.dx * l / 2, m.dy + u.dy * l / 2)
        ..lineTo(m.dx - u.dx * l / 2 + n.dx * l * 0.5, m.dy - u.dy * l / 2 + n.dy * l * 0.5)
        ..lineTo(m.dx - u.dx * l / 2 - n.dx * l * 0.5, m.dy - u.dy * l / 2 - n.dy * l * 0.5)
        ..close(),
      Paint()..color = color,
    );
  }

  void _dashed(Canvas canvas, Offset a, Offset b, Paint paint, double s) {
    final d = b - a;
    final len = d.distance;
    if (len == 0) return;
    final u = d / len;
    final on = 8 * s, off = 6 * s;
    for (var t = 0.0; t < len; t += on + off) {
      canvas.drawLine(a + u * t, a + u * math.min(t + on, len), paint);
    }
  }

  @override
  bool shouldRepaint(_OpticsPainter old) => old.img.u != img.u || old.img.f != img.f || old.img.kind != img.kind || old.view.size != view.size || old.pal.ink != pal.ink;
}
