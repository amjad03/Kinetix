import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../view.dart';
import '../whiteboard_controller.dart';
import 'geo_tool.dart';
import 'tool_strings.dart';

/// Draws the geometry box ([WhiteboardController.geoTools]) over the board and lets each tool be
/// moved (drag), turned (the round handle, or two fingers; 15° steps, hold the handle or Shift to
/// turn freely) and resized (pinch). The protractor's arm marks an angle; the compass's pencil
/// sets the radius and its hinge draws an arc (or a circle with its button).
///
/// The tools are the teacher's instruments: they are not page elements, so the projector and the
/// live class see the lines drawn with them, not the tools themselves.
class GeoToolsOverlay extends StatelessWidget {
  const GeoToolsOverlay({super.key, required this.controller});

  final WhiteboardController controller;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    return ListenableBuilder(
      listenable: Listenable.merge([c.geoTools, c.view, c.edgeLine, GeoCalibration.pxPerCm, GeoCalibration.inches]),
      builder: (context, _) {
        final view = c.view.value;
        final tools = c.geoTools.value;
        final line = c.edgeLine.value;
        return LayoutBuilder(
          builder: (context, box) => Stack(
            children: [
              for (final t in tools)
                Positioned.fill(
                  child: _GeoToolView(key: ValueKey('geo-${t.id}'), controller: c, tool: t, view: view),
                ),
              // Only the top tool shows its buttons; the chip reaches the rest of the stack.
              if (tools.isNotEmpty) _buttons(context, tools.last, view, box.maxWidth),
              if (tools.length > 1) Positioned(left: 8, bottom: 8, child: GeoStackChip(controller: c)),
              if (tools.isNotEmpty && (view.scale - 1).abs() > 0.02)
                Positioned(left: 8, top: 8, child: IgnorePointer(child: _Pill(ToolStrings.of(context).t('scaleNotTrue')))),
              if (line != null) _lengthPill(line, view),
            ],
          ),
        );
      },
    );
  }

  Widget _lengthPill(GeoEdge line, ViewState view) {
    final (a, b) = line;
    final d = b - a;
    final at = view.toScreen(b);
    return Positioned(
      left: at.dx + 14,
      top: at.dy - 40,
      child: IgnorePointer(child: _Pill('${GeoCalibration.format(d.distance)} · ${degrees360(math.atan2(-d.dy, d.dx)).round()}°')),
    );
  }

  Widget _buttons(BuildContext context, GeoTool t, ViewState view, double width) {
    final s = ToolStrings.of(context);
    final box = geoScreenBounds(t, view);
    final c = controller;
    Widget btn(String key, IconData icon, String tip, VoidCallback onTap) => IconButton(
      key: Key('geo-$key-${t.id}'),
      tooltip: tip,
      onPressed: onTap,
      icon: Icon(icon, size: 18, color: Colors.white),
      visualDensity: VisualDensity.compact,
      constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
      padding: EdgeInsets.zero,
    );
    return Positioned(
      left: (box.center.dx - 160).clamp(4.0, math.max(4.0, width - 324)),
      top: math.max(4, box.top - 48),
      width: 320,
      child: Center(
        child: Material(
          color: KxColor.inverse.withValues(alpha: 0.88),
          shape: const StadiumBorder(),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                btn(
                  'lock',
                  t.locked ? Icons.lock : Icons.lock_open,
                  t.locked ? s.t('unlock') : s.t('lock'),
                  () => c.updateGeoTool(t.copyWith(locked: !t.locked)),
                ),
                if (t.kind != GeoKind.compass) btn('flip', Icons.flip, s.t('flip'), () => c.updateGeoTool(t.copyWith(flipped: !t.flipped))),
                if (!t.locked) ...[
                  btn('smaller', Icons.remove, s.t('smaller'), () => c.updateGeoTool(t.copyWith(size: t.clampSize(t.size / 1.25)))),
                  btn('bigger', Icons.add, s.t('bigger'), () => c.updateGeoTool(t.copyWith(size: t.clampSize(t.size * 1.25)))),
                ],
                if (t.kind == GeoKind.compass)
                  btn('circle', Icons.radio_button_unchecked, s.t('circle'), () {
                    c.add(compassStroke(t.center, t.size, t.angle, 2 * math.pi, color: c.penColor, width: c.penWidth));
                  }),
                PopupMenuButton<String>(
                  key: Key('geo-more-${t.id}'),
                  icon: const Icon(Icons.straighten, size: 18, color: Colors.white),
                  tooltip: s.t('units'),
                  onSelected: (v) {
                    if (v == 'cal') {
                      showGeoCalibrationDialog(context);
                    } else {
                      GeoCalibration.inches.value = v == 'in';
                      GeoCalibration.onChanged?.call();
                    }
                  },
                  itemBuilder: (_) => [
                    CheckedPopupMenuItem(value: 'cm', checked: !GeoCalibration.inches.value, child: Text(s.t('cm'))),
                    CheckedPopupMenuItem(value: 'in', checked: GeoCalibration.inches.value, child: Text(s.t('inch'))),
                    PopupMenuItem(value: 'cal', child: Text(s.t('calibrate'))),
                  ],
                ),
                btn('close', Icons.close, s.t('close'), () => c.removeGeoTool(t.id)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Words for a tool in the stack chip.
String geoToolName(ToolStrings s, GeoKind k) => s.t(k.name);

IconData geoToolIcon(GeoKind k) => switch (k) {
  GeoKind.ruler => Icons.straighten,
  GeoKind.protractor || GeoKind.protractor360 => Icons.architecture,
  GeoKind.setSquare45 || GeoKind.setSquare3060 => Icons.change_history,
  GeoKind.compass => Icons.gesture,
};

/// A small chip shown while several tools are on the board: tap it for the list, then tap a
/// tool to bring it to the front (the front one is ticked). Reaches a tool buried under others.
class GeoStackChip extends StatefulWidget {
  const GeoStackChip({super.key, required this.controller});

  final WhiteboardController controller;

  @override
  State<GeoStackChip> createState() => _GeoStackChipState();
}

class _GeoStackChipState extends State<GeoStackChip> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final s = ToolStrings.of(context);
    final c = widget.controller;
    final tools = c.geoTools.value;
    return Material(
      color: KxColor.inverse.withValues(alpha: 0.9),
      borderRadius: BorderRadius.circular(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_open)
            for (final t in tools.reversed)
              InkWell(
                key: Key('geo-stack-item-${t.id}'),
                onTap: () {
                  c.bringGeoToFront(t.id);
                  setState(() => _open = false);
                },
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 44, minWidth: 160),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(geoToolIcon(t.kind), size: 18, color: Colors.white),
                        const SizedBox(width: 8),
                        Text(geoToolName(s, t.kind), style: const TextStyle(color: Colors.white)),
                        const Spacer(),
                        if (t.id == tools.last.id) const Icon(Icons.check, size: 18, color: Colors.white),
                      ],
                    ),
                  ),
                ),
              ),
          InkWell(
            key: const Key('geo-stack-chip'),
            borderRadius: BorderRadius.circular(20),
            onTap: () => setState(() => _open = !_open),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 44),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.layers, size: 18, color: Colors.white),
                    const SizedBox(width: 6),
                    Text('${s.t('toolStack')} ${tools.length}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The tool's box on screen (unturned), for placing its buttons.
Rect geoScreenBounds(GeoTool t, ViewState view) {
  final pts = switch (t.kind) {
    GeoKind.protractor ||
    GeoKind.protractor360 => [for (var i = 0; i < 16; i++) t.toBoard(Offset(math.cos(i * math.pi / 8), math.sin(i * math.pi / 8)) * t.size)],
    GeoKind.compass => [t.center, t.pencil, t.hinge],
    _ => [for (final p in t.outline) t.toBoard(p)],
  };
  var r = Rect.fromPoints(view.toScreen(pts.first), view.toScreen(pts.first));
  for (final p in pts) {
    final s = view.toScreen(p);
    r = r.expandToInclude(Rect.fromPoints(s, s));
  }
  return r;
}

class _Pill extends StatelessWidget {
  const _Pill(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(color: KxColor.inverse.withValues(alpha: 0.9), borderRadius: BorderRadius.circular(14)),
    child: Text(
      text,
      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 14),
    ),
  );
}

/// Which part of a tool a touch began on.
enum GeoPart { body, grip, rotate, arm, pencil, draw }

/// Where a tool's grip dot is, in tool units. The tool moves only when this dot is dragged (and
/// turns only from [geoRotateHandle]); the rest of it is locked so a pen can write along its edge.
Offset geoGripHandle(GeoTool t) => switch (t.kind) {
  GeoKind.ruler => Offset(-t.size / 2 + 34, GeoTool.rulerWidth * 0.6),
  GeoKind.protractor => Offset(-t.size * 0.78, 15),
  GeoKind.protractor360 => Offset(0, -t.size * 0.55),
  GeoKind.setSquare45 || GeoKind.setSquare3060 => Offset(t.size * 0.16, t.outline[2].dy * 0.2),
  GeoKind.compass => Offset(t.size / 2, -math.max(60.0, t.size * 0.45)),
};

/// Where a tool's turn handle is, in tool units.
Offset geoRotateHandle(GeoTool t) => switch (t.kind) {
  GeoKind.ruler => Offset(t.size / 2 - 34, GeoTool.rulerWidth * 0.6),
  GeoKind.protractor => Offset(t.size * 0.78, 15),
  GeoKind.protractor360 => Offset(0, t.size * 0.55),
  GeoKind.setSquare45 || GeoKind.setSquare3060 => Offset(t.size * 0.5, t.outline[2].dy * 0.18),
  GeoKind.compass => const Offset(-52, 0),
};

/// The part of [t] at board point [b]; handles are [reach] board units across.
GeoPart geoPartAt(GeoTool t, Offset b, double reach) {
  if (t.kind == GeoKind.compass) {
    if ((b - t.hinge).distance <= reach) return GeoPart.grip;
    if ((b - t.pencil).distance <= reach) return GeoPart.pencil;
    if ((b - t.toBoard(geoRotateHandle(t))).distance <= reach) return GeoPart.rotate;
    return GeoPart.body;
  }
  if ((t.kind == GeoKind.protractor || t.kind == GeoKind.protractor360) && (b - t.armTip).distance <= reach) return GeoPart.arm;
  if ((b - t.toBoard(geoGripHandle(t))).distance <= reach) return GeoPart.grip;
  if ((b - t.toBoard(geoRotateHandle(t))).distance <= reach) return GeoPart.rotate;
  return GeoPart.body;
}

class _GeoToolView extends StatefulWidget {
  const _GeoToolView({super.key, required this.controller, required this.tool, required this.view});

  final WhiteboardController controller;
  final GeoTool tool;
  final ViewState view;

  @override
  State<_GeoToolView> createState() => _GeoToolViewState();
}

class _GeoToolViewState extends State<_GeoToolView> {
  GeoPart _part = GeoPart.body;
  late GeoTool _start;
  Offset _startAt = Offset.zero;
  double _startPointer = 0;
  double _sweep = 0, _lastPointer = 0;
  bool _free = false, _drawing = false;
  // The compass pencil: undecided until the finger has moved, then along the leg (radius) or round it (arc).
  int _pencilMode = 0; // 0 undecided, 1 radius, 2 arc

  GeoTool get t => widget.tool;
  ViewState get v => widget.view;
  double get _reach => 26 / v.scale;

  void _begin(Offset local, int pointers) {
    // A touch on a tool raises it, so the one that was under another can be used.
    widget.controller.bringGeoToFront(t.id);
    final b = v.toBoard(local);
    _start = t;
    _startAt = b;
    _part = pointers > 1 ? GeoPart.body : geoPartAt(t, b, _reach);
    _startPointer = _lastPointer = math.atan2((b - t.center).dy, (b - t.center).dx);
    _sweep = 0;
    _drawing = false;
    _pencilMode = 0;
    if (HardwareKeyboard.instance.isShiftPressed) _free = true;
  }

  void _move(Offset local) {
    final b = v.toBoard(local);
    final c = widget.controller;
    final pointerAngle = math.atan2((b - t.center).dy, (b - t.center).dx);
    final compass = t.kind == GeoKind.compass;
    switch (_part) {
      case GeoPart.body || GeoPart.draw:
        break; // locked: only the dots move a tool
      case GeoPart.grip:
        if (!t.locked) c.updateGeoTool(t.copyWith(center: _start.center + (b - _startAt)));
      case GeoPart.rotate:
        if (!t.locked) c.updateGeoTool(t.copyWith(angle: snapAngle15(_start.angle + pointerAngle - _startPointer, free: _free || compass)));
      case GeoPart.arm:
        c.updateGeoTool(t.copyWith(arm: t.armTowards(b, free: false)));
      case GeoPart.pencil:
        if (_pencilMode == 0) {
          final d = b - _startAt;
          if (d.distance < 8 / v.scale) return;
          final dir = (_start.pencil - _start.center);
          final radial = (d.dx * dir.dx + d.dy * dir.dy) / dir.distance;
          final tangent = (d.dx * -dir.dy + d.dy * dir.dx) / dir.distance;
          _pencilMode = radial.abs() >= tangent.abs() ? 1 : 2;
          _drawing = _pencilMode == 2;
        }
        if (_pencilMode == 1) {
          c.updateGeoTool(t.copyWith(size: t.clampSize((b - t.center).distance)));
        } else {
          // Swinging the pencil leg round the needle draws the arc, as on paper.
          var d = pointerAngle - _lastPointer;
          if (d > math.pi) d -= 2 * math.pi;
          if (d < -math.pi) d += 2 * math.pi;
          _lastPointer = pointerAngle;
          _sweep = (_sweep + d).clamp(-2 * math.pi, 2 * math.pi);
          c.updateGeoTool(t.copyWith(angle: _start.angle + _sweep));
          setState(() {});
        }
    }
  }

  void _end() {
    final c = widget.controller;
    if (_drawing && _sweep.abs() > 0.03) {
      c.add(compassStroke(t.center, t.size, _start.angle, _sweep, color: c.penColor, width: c.penWidth));
    }
    _drawing = false;
    _free = false;
    setState(() => _sweep = 0);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.deferToChild,
      onScaleStart: (d) => _begin(d.localFocalPoint, d.pointerCount),
      onScaleUpdate: (d) => _move(d.localFocalPoint),
      onScaleEnd: (_) => _end(),
      child: CustomPaint(
        painter: GeoToolPainter(t, v, sweep: _drawing ? _sweep : 0, startAngle: _drawing ? _start.angle : t.angle, reach: _reach),
        child: const SizedBox.expand(),
      ),
    );
  }
}

const _ink = Color(0xFF2F343B);
const _accent = Color(0xFF0B7A8A);

TextPainter _text(String s, double size, {Color color = _ink, bool bold = false}) => TextPainter(
  text: TextSpan(
    text: s,
    style: TextStyle(fontSize: size, color: color, fontWeight: bold ? FontWeight.w700 : FontWeight.w500, fontFamily: KxFonts.board),
  ),
  textDirection: TextDirection.ltr,
)..layout();

/// Paints one tool in screen space, drawn in its own units under the view and the tool's turn.
class GeoToolPainter extends CustomPainter {
  GeoToolPainter(this.t, this.view, {this.sweep = 0, double? startAngle, this.reach = 26}) : startAngle = startAngle ?? t.angle;

  final GeoTool t;
  final ViewState view;
  final double sweep, startAngle, reach;

  double get _fy => t.flipped ? -1 : 1;

  /// Text that reads the right way round on a flipped tool, centred on [at].
  void _label(Canvas canvas, String s, Offset at, double size, {Color color = _ink, bool bold = false, double turn = 0}) {
    final tp = _text(s, size, color: color, bold: bold);
    canvas
      ..save()
      ..translate(at.dx, at.dy)
      ..scale(1, _fy)
      ..rotate(turn);
    tp.paint(canvas, Offset(-tp.width / 2, -tp.height / 2));
    canvas.restore();
  }

  @override
  void paint(Canvas canvas, Size size) {
    canvas
      ..save()
      ..translate(view.offset.dx, view.offset.dy)
      ..scale(view.scale);
    if (t.kind == GeoKind.compass) {
      _compass(canvas);
      canvas.restore();
      return;
    }
    canvas
      ..translate(t.center.dx, t.center.dy)
      ..rotate(t.angle)
      ..scale(1, _fy);
    final body = Paint()..color = const Color(0xD9FFFFFF);
    final edge = Paint()
      ..color = const Color(0x77000000)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2 / view.scale;
    final tick = Paint()
      ..color = _ink
      ..strokeWidth = 1 / view.scale;
    switch (t.kind) {
      case GeoKind.ruler:
        final r = Rect.fromLTWH(-t.size / 2, 0, t.size, GeoTool.rulerWidth);
        canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(6)), body);
        canvas.drawRRect(RRect.fromRectAndRadius(r, const Radius.circular(6)), edge);
        _scale(canvas, Offset(-t.size / 2, 0), t.size, tick, GeoTool.rulerWidth);
        // Live readout: the turn (to a tenth of a degree, as the protractor reads it) and the length.
        final turn = t.angleDegrees > 180 ? t.angleDegrees - 360 : t.angleDegrees;
        _label(
          canvas,
          '${(-turn).toStringAsFixed(1)}° · ${GeoCalibration.format(t.size)}',
          Offset(0, GeoTool.rulerWidth * 0.66),
          16,
          color: _accent,
          bold: true,
        );
      case GeoKind.setSquare45 || GeoKind.setSquare3060:
        final o = t.outline;
        final path = Path()..addPolygon(o, true);
        // The cut-out in the middle, like a real set square.
        final c = (o[0] + o[1] + o[2]) / 3;
        final inner = Path()..addPolygon([for (final p in o) c + (p - c) * 0.45], true);
        canvas.drawPath(Path.combine(PathOperation.difference, path, inner), body);
        canvas.drawPath(path, edge);
        canvas.drawPath(inner, edge);
        _scale(canvas, Offset.zero, t.size, tick, 30);
        final small = t.kind == GeoKind.setSquare45 ? '45°' : '30°', top = t.kind == GeoKind.setSquare45 ? '45°' : '60°';
        _label(canvas, '90°', const Offset(22, -18), 13);
        _label(canvas, small, o[1] + const Offset(-48, -12), 13);
        _label(canvas, top, o[2] + const Offset(14, 40), 13);
        _label(canvas, '${t.angleDegrees.round()}°', c + const Offset(0, 6), 16, color: _accent, bold: true);
      case GeoKind.protractor || GeoKind.protractor360:
        _protractor(canvas, body, edge, tick);
      case GeoKind.compass:
        break;
    }
    _knob(canvas, geoGripHandle(t), Icons.drag_indicator, color: _accent);
    _knob(canvas, geoRotateHandle(t), Icons.rotate_right);
    canvas.restore();
  }

  /// A scale along the zero line from [from], [length] long, ticks going in by [depth].
  void _scale(Canvas canvas, Offset from, double length, Paint tick, double depth) {
    final unit = GeoCalibration.unit;
    final parts = GeoCalibration.inches.value ? 16 : 10;
    final step = unit / parts;
    final fine = step * view.scale >= 4;
    final n = (length / step).floor();
    for (var i = 0; i <= n; i++) {
      final whole = i % parts == 0, half = i % (parts ~/ 2) == 0;
      if (!whole && !half && !fine) continue;
      final len = whole ? depth * 0.34 : (half ? depth * 0.24 : depth * 0.14);
      final x = from.dx + i * step;
      canvas.drawLine(Offset(x, from.dy), Offset(x, from.dy + (from.dy == 0 && t.kind != GeoKind.ruler ? -len : len)), tick);
      if (whole && i > 0 && i < n) {
        final y = t.kind == GeoKind.ruler ? depth * 0.48 : -depth * 0.5;
        _label(canvas, '${i ~/ parts}', Offset(x, y), 12);
      }
    }
    if (t.kind == GeoKind.ruler) _label(canvas, GeoCalibration.unitName, Offset(from.dx + 16, depth * 0.8), 11);
  }

  void _protractor(Canvas canvas, Paint body, Paint edge, Paint tick) {
    final r = t.size;
    final full = t.kind == GeoKind.protractor360;
    final path = Path();
    if (full) {
      path.addOval(Rect.fromCircle(center: Offset.zero, radius: r));
    } else {
      path
        ..moveTo(-r, 0)
        ..arcTo(Rect.fromCircle(center: Offset.zero, radius: r), math.pi, math.pi, false)
        ..lineTo(r, 30)
        ..lineTo(-r, 30)
        ..close();
    }
    canvas.drawPath(path, body);
    canvas.drawPath(path, edge);
    final fs = (r * 0.05).clamp(9.0, 14.0);
    for (var d = 0; d <= (full ? 359 : 180); d++) {
      final a = d * math.pi / 180;
      final dir = Offset(math.cos(a), -math.sin(a));
      final len = d % 10 == 0 ? r * 0.1 : (d % 5 == 0 ? r * 0.07 : r * 0.04);
      if (d % 5 != 0 && r * view.scale < 150) continue;
      canvas.drawLine(dir * r, dir * (r - len), tick);
      if (d % (full ? 30 : 10) == 0) {
        _label(canvas, '$d', dir * (r - len - fs * 1.2), fs);
        if (!full) _label(canvas, '${180 - d}', dir * (r - len - fs * 2.6), fs * 0.85, color: const Color(0xFFD7263D));
      }
    }
    canvas.drawLine(Offset(full ? -r : -r, 0), Offset(r, 0), tick..strokeWidth = 1.5 / view.scale);
    canvas.drawCircle(Offset.zero, 4, Paint()..color = _accent);
    // The arm marking an angle, with its reading.
    final tip = Offset(math.cos(t.arm), -math.sin(t.arm)) * r;
    final arm = Paint()
      ..color = _accent
      ..strokeWidth = 3 / view.scale;
    canvas.drawLine(Offset.zero, tip, arm);
    canvas.drawArc(Rect.fromCircle(center: Offset.zero, radius: r * 0.22), 0, -t.arm, false, arm..style = PaintingStyle.stroke);
    _label(canvas, '${t.armDegrees.round()}°', Offset(math.cos(t.arm / 2), -math.sin(t.arm / 2)) * r * 0.34, 16, color: _accent, bold: true);
    _knob(canvas, tip, Icons.open_with, color: _accent);
    if (!full) _label(canvas, '${t.angleDegrees.round()}°', const Offset(0, 18), 13, color: _accent, bold: true);
  }

  /// A leg from [a] (wide end) to [b] (narrow end) as a tapered bar.
  void _taper(Canvas canvas, Offset a, Offset b, double w0, double w1, Paint paint) {
    final d = b - a;
    if (d.distance == 0) return;
    final n = Offset(-d.dy, d.dx) / d.distance;
    canvas.drawPath(Path()..addPolygon([a + n * w0 / 2, b + n * w1 / 2, b - n * w1 / 2, a - n * w0 / 2], true), paint);
  }

  void _compass(Canvas canvas) {
    final needle = t.center, pencil = t.pencil, hinge = t.hinge;
    final k = 1 / view.scale;
    final steel = Paint()..color = const Color(0xFF8D96A3);
    final dark = Paint()..color = const Color(0xFF5B6470);
    // The radius, dashed, with its reading.
    final dash = Paint()
      ..color = _accent
      ..strokeWidth = 1.5 * k;
    final d = pencil - needle;
    final len = d.distance;
    for (var s = 0.0; s < len; s += 12) {
      canvas.drawLine(needle + d * (s / len), needle + d * (math.min(s + 6, len) / len), dash);
    }
    if (sweep != 0) {
      canvas.drawArc(
        Rect.fromCircle(center: needle, radius: t.size),
        startAngle,
        sweep,
        false,
        Paint()
          ..color = _accent.withValues(alpha: 0.6)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3 * k,
      );
    }
    // Needle leg: steel bar ending in a fine point.
    final nl = needle - hinge;
    final nTip = needle - nl / nl.distance * 4 * k;
    _taper(canvas, hinge, nTip, 9 * k, 2.5 * k, steel);
    canvas.drawCircle(needle, 2.2 * k, Paint()..color = const Color(0xFFD7263D));
    // Pencil leg: metal upper leg, wooden holder, graphite lead.
    final pl = pencil - hinge;
    final pu = pl / pl.distance;
    final holder = pencil - pu * 34 * k;
    _taper(canvas, hinge, holder, 9 * k, 8 * k, steel);
    _taper(canvas, holder, pencil - pu * 12 * k, 10 * k, 10 * k, Paint()..color = const Color(0xFFE0B26B));
    _taper(canvas, pencil - pu * 12 * k, pencil, 10 * k, 1.6 * k, Paint()..color = const Color(0xFF2B2F36));
    // Hinge: a collar with a stem and a screw.
    canvas.drawCircle(hinge, 10 * k, dark);
    canvas.drawCircle(hinge, 4 * k, steel);
    canvas.drawLine(hinge, hinge + Offset(0, -16 * k), Paint()..color = const Color(0xFF5B6470)..strokeWidth = 5 * k..strokeCap = StrokeCap.round);
    final mid = (needle + pencil) / 2;
    canvas
      ..save()
      ..translate(mid.dx, mid.dy)
      ..scale(k);
    final reading = sweep != 0 ? 'r = ${GeoCalibration.format(t.size)} · ${(sweep.abs() * 180 / math.pi).round()}°' : 'r = ${GeoCalibration.format(t.size)}';
    final tp = _text(reading, 14, color: _accent, bold: true);
    tp.paint(canvas, Offset(-tp.width / 2, 8));
    canvas.restore();
    // Dots: move (hinge), set radius / swing to draw (pencil), turn (behind the needle).
    _knobAt(canvas, hinge, Icons.drag_indicator, color: _accent);
    _knobAt(canvas, pencil, Icons.open_with, color: _accent);
    _knobAt(canvas, t.toBoard(geoRotateHandle(t)), Icons.rotate_right);
  }

  /// A round handle at tool point [at] (in the turned tool frame).
  void _knob(Canvas canvas, Offset at, IconData icon, {Color? color}) {
    canvas
      ..save()
      ..translate(at.dx, at.dy)
      ..scale(1 / view.scale, _fy / view.scale);
    _drawKnob(canvas, icon, color);
    canvas.restore();
  }

  /// A round handle at board point [at] (in the board frame).
  void _knobAt(Canvas canvas, Offset at, IconData icon, {Color? color}) {
    canvas
      ..save()
      ..translate(at.dx, at.dy)
      ..scale(1 / view.scale);
    _drawKnob(canvas, icon, color);
    canvas.restore();
  }

  void _drawKnob(Canvas canvas, IconData icon, Color? color) {
    canvas.drawCircle(Offset.zero, 18, Paint()..color = (color ?? KxColor.inverse).withValues(alpha: 0.85));
    final tp = TextPainter(
      text: TextSpan(
        text: String.fromCharCode(icon.codePoint),
        style: TextStyle(fontSize: 20, fontFamily: icon.fontFamily, package: icon.fontPackage, color: Colors.white),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(-tp.width / 2, -tp.height / 2));
  }

  @override
  bool? hitTest(Offset position) {
    final b = view.toBoard(position);
    // Only the dots take touches: the body lets the pen through to write along the edge.
    return geoPartAt(t, b, reach) != GeoPart.body;
  }

  @override
  bool shouldRepaint(GeoToolPainter old) => old.t != t || old.view != view || old.sweep != sweep || old.startAngle != startAngle || old.t.flipped != t.flipped;
}

/// Board units in one cm on a screen [diagonalInches] across whose logical size is [size].
double pxPerCmForDiagonal(Size size, double diagonalInches) =>
    diagonalInches <= 0 ? GeoCalibration.deviceDefault : math.sqrt(size.width * size.width + size.height * size.height) / (diagonalInches * 2.54);

/// A bank card is 8.56 cm wide: the reference a teacher can hold to the screen.
const double cardWidthCm = 8.56;

/// Matches the scales to this screen, three ways: type the screen's diagonal (the quick way for a
/// phone, a tablet or a panel), hold a bank card against the bar, or hold a real ruler against
/// the marks. Nudge with the + and - buttons for the last millimetre.
Future<void> showGeoCalibrationDialog(BuildContext context) async {
  final s = ToolStrings.of(context);
  final screen = MediaQuery.sizeOf(context);
  var px = GeoCalibration.pxPerCm.value;
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, set) => AlertDialog(
        title: Text(s.t('calibrateTitle')),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.t('calibrateHint')),
                const SizedBox(height: 12),
                TextField(
                  key: const Key('geo-calibrate-diagonal'),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(labelText: s.t('screenDiagonal'), suffixText: 'in', isDense: true),
                  onChanged: (v) {
                    final d = double.tryParse(v);
                    if (d != null && d >= 3 && d <= 150) set(() => px = pxPerCmForDiagonal(screen, d).clamp(15.0, 120.0));
                  },
                ),
                const SizedBox(height: 12),
                SizedBox(
                  height: 60,
                  child: ClipRect(
                    child: CustomPaint(key: const Key('geo-calibrate-scale'), painter: _CalibrationPainter(px), size: Size.infinite),
                  ),
                ),
                Text(s.t('calibrateCard'), style: const TextStyle(fontSize: 12)),
                const SizedBox(height: 4),
                Container(
                  key: const Key('geo-calibrate-card'),
                  width: cardWidthCm * px,
                  height: 5.4 * px,
                  decoration: BoxDecoration(border: Border.all(color: _accent, width: 2), borderRadius: BorderRadius.circular(0.3 * px)),
                  alignment: Alignment.center,
                  child: const Text('8.56 cm', style: TextStyle(color: _accent, fontWeight: FontWeight.w700)),
                ),
                Row(
                  children: [
                    IconButton(key: const Key('geo-calibrate-minus'), tooltip: '-', onPressed: () => set(() => px = (px - 0.2).clamp(15.0, 120.0)), icon: const Icon(Icons.remove)),
                    Expanded(child: Slider(key: const Key('geo-calibrate-slider'), value: px.clamp(15, 120), min: 15, max: 120, onChanged: (v) => set(() => px = v))),
                    IconButton(key: const Key('geo-calibrate-plus'), tooltip: '+', onPressed: () => set(() => px = (px + 0.2).clamp(15.0, 120.0)), icon: const Icon(Icons.add)),
                  ],
                ),
                Text('${(px * 2.54).round()} dpi · 1 ${s.t('cm')} = ${px.toStringAsFixed(1)} px'),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => set(() => px = GeoCalibration.deviceDefault), child: Text(s.t('reset'))),
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s.t('cancel'))),
          FilledButton(key: const Key('geo-calibrate-done'), onPressed: () => Navigator.pop(ctx, true), child: Text(s.t('done'))),
        ],
      ),
    ),
  );
  if (ok == true) {
    GeoCalibration.pxPerCm.value = px;
    GeoCalibration.onChanged?.call();
  }
}

class _CalibrationPainter extends CustomPainter {
  _CalibrationPainter(this.px);

  final double px;

  @override
  void paint(Canvas canvas, Size size) {
    final tick = Paint()
      ..color = _ink
      ..strokeWidth = 1;
    for (var i = 0; i * px / 10 < size.width; i++) {
      final x = i * px / 10;
      final len = i % 10 == 0 ? 28.0 : (i % 5 == 0 ? 18.0 : 10.0);
      canvas.drawLine(Offset(x, 0), Offset(x, len), tick);
      if (i % 10 == 0) _text('${i ~/ 10}', 12).paint(canvas, Offset(x + 2, 32));
    }
  }

  @override
  bool shouldRepaint(_CalibrationPainter old) => old.px != px;
}
