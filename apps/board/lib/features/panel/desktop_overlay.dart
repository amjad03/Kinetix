import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/panel/panel_controller.dart';
import '../../l10n/l10n.dart';

/// One stroke of the overlay's pen.
class OverlayStroke {
  OverlayStroke(this.color, this.width, [List<Offset>? points]) : points = points ?? [];
  final Color color;
  final double width;
  final List<Offset> points;
}

/// The overlay's ink: strokes, the eraser (removes whole strokes it touches) and clear.
class OverlayInk extends ChangeNotifier {
  final strokes = <OverlayStroke>[];
  bool erasing = false;
  Color color = const Color(0xFFE53935);
  double width = 6;

  void start(Offset p) {
    if (erasing) return eraseAt(p);
    strokes.add(OverlayStroke(color, width, [p]));
    notifyListeners();
  }

  void extend(Offset p) {
    if (erasing) return eraseAt(p);
    if (strokes.isEmpty) return;
    strokes.last.points.add(p);
    notifyListeners();
  }

  void eraseAt(Offset p, {double radius = 18}) {
    final before = strokes.length;
    strokes.removeWhere((s) => s.points.any((q) => (q - p).distance <= radius + s.width / 2));
    if (strokes.length != before) notifyListeners();
  }

  void clear() {
    if (strokes.isEmpty) return;
    strokes.clear();
    notifyListeners();
  }
}

class _InkPainter extends CustomPainter {
  _InkPainter(this.ink) : super(repaint: ink);
  final OverlayInk ink;

  @override
  void paint(Canvas canvas, Size size) {
    for (final s in ink.strokes) {
      final paint = Paint()
        ..color = s.color
        ..strokeWidth = s.width
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..style = PaintingStyle.stroke;
      if (s.points.length == 1) {
        canvas.drawCircle(s.points.first, s.width / 2, paint..style = PaintingStyle.fill);
        continue;
      }
      final path = Path()..moveTo(s.points.first.dx, s.points.first.dy);
      for (final p in s.points.skip(1)) {
        path.lineTo(p.dx, p.dy);
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(_InkPainter old) => old.ink != ink;
}

/// "Write over apps" on macOS and Windows: the board's window turns into a transparent,
/// always-on-top layer over the whole desktop (DesktopOverlayWindow) with pen, eraser, clear,
/// "use the app" (the window shrinks to its toolbar so the apps underneath can be used) and
/// "save to board", a screenshot with the ink that comes back as a new board page. When the
/// window cannot be made see-through it writes on a still of the screen instead.
class DesktopOverlayScreen extends StatefulWidget {
  const DesktopOverlayScreen({super.key, required this.panel, required this.transparent, this.still});

  final PanelController panel;
  final bool transparent;

  /// The screen as it was, when the window is not see-through.
  final Uint8List? still;

  /// Runs the overlay; answers the PNG to put on a new page, or null when closed without saving.
  static Future<Uint8List?> open(BuildContext context, PanelController panel) async {
    final nav = Navigator.of(context);
    final transparent = await panel.desktopWindow.enter();
    final still = transparent ? null : await panel.grabber.grab();
    try {
      return await nav.push<Uint8List>(
        // Opaque: the board behind is not painted, so a see-through window shows the desktop.
        PageRouteBuilder<Uint8List>(opaque: true, pageBuilder: (_, _, _) => DesktopOverlayScreen(panel: panel, transparent: transparent, still: still)),
      );
    } finally {
      await panel.desktopWindow.exit();
    }
  }

  @override
  State<DesktopOverlayScreen> createState() => _DesktopOverlayScreenState();
}

class _DesktopOverlayScreenState extends State<DesktopOverlayScreen> {
  final ink = OverlayInk();
  final _shot = GlobalKey();
  bool _compact = false;
  bool _hideBar = false;
  bool _saving = false;

  @override
  void dispose() {
    ink.dispose();
    super.dispose();
  }

  Future<void> _useApp(bool on) async {
    setState(() => _compact = on);
    await widget.panel.desktopWindow.passThrough(on);
  }

  Future<Uint8List?> _renderInk() async {
    final b = _shot.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    if (b == null) return null;
    final image = await b.toImage(pixelRatio: View.of(context).devicePixelRatio);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    return data?.buffer.asUint8List();
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _hideBar = true;
    });
    if (_compact) await _useApp(false);
    await WidgetsBinding.instance.endOfFrame;
    // See-through: the screen itself, with the ink on it; else the still with the ink.
    Uint8List? png = widget.transparent ? await widget.panel.grabber.grab() : null;
    png ??= await _renderInk();
    if (!mounted) return;
    Navigator.of(context).pop(png);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final bar = _Toolbar(
      compact: _compact,
      erasing: ink.erasing,
      saving: _saving,
      onPen: () => setState(() => ink.erasing = false),
      onEraser: () => setState(() => ink.erasing = true),
      onClear: ink.clear,
      onUseApp: () => unawaited(_useApp(!_compact)),
      onSave: () => unawaited(_save()),
      onClose: () => Navigator.of(context).pop(),
      labels: (pen: l.overlayPen, eraser: l.overlayEraser, clear: l.overlayClear, useApp: l.overlayPassThrough, save: l.overlayCapture, close: l.overlayClose),
    );
    if (_compact) return Material(type: MaterialType.transparency, child: Center(child: bar));
    return Material(
      type: MaterialType.transparency,
      child: Stack(
        children: [
          Positioned.fill(
            child: RepaintBoundary(
              key: _shot,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (widget.still != null) Image.memory(widget.still!, fit: BoxFit.cover) else if (!widget.transparent) const ColoredBox(color: Colors.white),
                  // A nearly invisible fill so a see-through window still takes the pen everywhere.
                  if (widget.transparent) const ColoredBox(color: Color(0x01000000)),
                  GestureDetector(
                    key: const Key('overlay-ink'),
                    behavior: HitTestBehavior.opaque,
                    onPanStart: (d) => ink.start(d.localPosition),
                    onPanUpdate: (d) => ink.extend(d.localPosition),
                    onTapDown: (d) => ink.start(d.localPosition),
                    child: CustomPaint(painter: _InkPainter(ink), size: Size.infinite),
                  ),
                ],
              ),
            ),
          ),
          if (!_hideBar) Positioned(right: Kx.s16, top: 0, bottom: 0, child: Center(child: bar)),
        ],
      ),
    );
  }
}

class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.compact,
    required this.erasing,
    required this.saving,
    required this.onPen,
    required this.onEraser,
    required this.onClear,
    required this.onUseApp,
    required this.onSave,
    required this.onClose,
    required this.labels,
  });

  final bool compact, erasing, saving;
  final VoidCallback onPen, onEraser, onClear, onUseApp, onSave, onClose;
  final ({String pen, String eraser, String clear, String useApp, String save, String close}) labels;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    Widget b(Key key, IconData icon, String tip, VoidCallback? onTap, {bool selected = false}) => IconButton(
      key: key,
      tooltip: tip,
      isSelected: selected,
      onPressed: onTap,
      icon: Icon(icon),
      style: IconButton.styleFrom(backgroundColor: selected ? c.primaryContainer : null, minimumSize: const Size(56, 56)),
    );
    return Material(
      elevation: 6,
      color: c.surface,
      borderRadius: BorderRadius.circular(Kx.rXl),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!compact) ...[
              b(const Key('overlay-pen'), Icons.edit, labels.pen, onPen, selected: !erasing),
              b(const Key('overlay-eraser'), Icons.auto_fix_normal_outlined, labels.eraser, onEraser, selected: erasing),
              b(const Key('overlay-clear'), Icons.layers_clear_outlined, labels.clear, onClear),
            ],
            b(const Key('overlay-use-app'), compact ? Icons.edit : Icons.touch_app_outlined, compact ? labels.pen : labels.useApp, onUseApp, selected: compact),
            b(const Key('overlay-save'), Icons.add_photo_alternate_outlined, labels.save, saving ? null : onSave),
            b(const Key('overlay-close'), Icons.close, labels.close, onClose),
          ],
        ),
      ),
    );
  }
}
