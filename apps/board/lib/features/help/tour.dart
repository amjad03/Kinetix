import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../l10n/l10n.dart';

/// One stop of a guided tour: the control to point at (by its key on the board) and what it
/// does. A stop whose control is not on screen is shown in the middle.
class CoachStep {
  const CoachStep({this.target, required this.icon, required this.title, required this.body});
  final Key? target;
  final IconData icon;
  final String title;
  final String body;
}

/// Where the widget with [key] is on screen, if it is.
Rect? screenRectOf(BuildContext context, Key key) {
  Rect? found;
  void visit(Element e) {
    if (found != null) return;
    if (e.widget.key == key) {
      final box = e.findRenderObject();
      if (box is RenderBox && box.attached && box.hasSize) {
        found = box.localToGlobal(Offset.zero) & box.size;
        return;
      }
    }
    e.visitChildren(visit);
  }

  context.visitChildElements(visit);
  return found;
}

/// The first-run tour and "Show me": a spotlight on one control at a time with a card that
/// says what it does. Shown once per board.
abstract final class BoardTour {
  /// Whether the tour starts by itself the first time the board opens (tests turn it off).
  static bool autoStart = true;

  static const _seenKey = 'kinetix.board.tour.seen';

  static Future<bool> seen() async {
    try {
      return (await SharedPreferences.getInstance()).getBool(_seenKey) ?? false;
    } catch (_) {
      return true;
    }
  }

  static Future<void> markSeen() async {
    try {
      await (await SharedPreferences.getInstance()).setBool(_seenKey, true);
    } catch (_) {}
  }

  /// Shows [steps] one at a time over [context]'s screen. True when the teacher went through
  /// to the end, false when they skipped.
  static Future<bool> show(BuildContext context, List<CoachStep> steps, {String? finishLabel}) async {
    if (steps.isEmpty) return false;
    final done = await Navigator.of(context).push<bool>(
      PageRouteBuilder(
        opaque: false,
        barrierDismissible: false,
        transitionDuration: Kx.fast,
        reverseTransitionDuration: Kx.fast,
        pageBuilder: (_, _, _) => CoachOverlay(steps: steps, boardContext: context, finishLabel: finishLabel),
        transitionsBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: child),
      ),
    );
    return done ?? false;
  }
}

/// The tour's scrim with a hole over the control, and the card beside it.
class CoachOverlay extends StatefulWidget {
  const CoachOverlay({super.key, required this.steps, required this.boardContext, this.finishLabel});
  final List<CoachStep> steps;

  /// Where the controls are looked up.
  final BuildContext boardContext;
  final String? finishLabel;

  @override
  State<CoachOverlay> createState() => _CoachOverlayState();
}

class _CoachOverlayState extends State<CoachOverlay> {
  int _i = 0;

  CoachStep get _step => widget.steps[_i];

  /// The control's place on screen, measured after each frame (not while building).
  Rect? _hole;

  @override
  void initState() {
    super.initState();
    _measure();
  }

  void _measure() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final key = _step.target;
      final r = key == null || !widget.boardContext.mounted ? null : screenRectOf(widget.boardContext, key)?.inflate(8);
      if (r != _hole) setState(() => _hole = r);
    });
  }

  void _go(int i) {
    setState(() => _i = i);
    _measure();
  }

  void _next() {
    if (_i < widget.steps.length - 1) {
      _go(_i + 1);
    } else {
      Navigator.pop(context, true);
    }
  }

  void _back() {
    if (_i > 0) _go(_i - 1);
  }

  @override
  Widget build(BuildContext context) {
    final last = _i == widget.steps.length - 1;
    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.escape): () => Navigator.pop(context, false),
        const SingleActivator(LogicalKeyboardKey.arrowRight): _next,
        const SingleActivator(LogicalKeyboardKey.enter): _next,
        const SingleActivator(LogicalKeyboardKey.arrowLeft): _back,
      },
      child: Focus(
        autofocus: true,
        child: Material(
          type: MaterialType.transparency,
          child: LayoutBuilder(
            builder: (context, c) {
              final size = c.biggest;
              final hole = _hole;
              return Stack(
                children: [
                  Positioned.fill(
                    child: GestureDetector(
                      key: const Key('coach-scrim'),
                      behavior: HitTestBehavior.opaque,
                      onTap: _next,
                      child: TweenAnimationBuilder<Rect?>(
                        tween: RectTween(end: hole ?? Rect.fromCenter(center: size.center(Offset.zero), width: 0, height: 0)),
                        duration: Kx.medium,
                        curve: Kx.emphasized,
                        builder: (context, r, _) => CustomPaint(painter: _Scrim(r, hole != null, context.colors.primaryContainer)),
                      ),
                    ),
                  ),
                  _card(context, size, hole, last),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  /// Beside the control when there is room, else above or below it.
  Widget _card(BuildContext context, Size size, Rect? hole, bool last) {
    final l = context.l10n;
    final c = context.colors;
    const gap = 16.0, margin = 16.0;
    final width = math.min(380.0, size.width - 2 * margin);
    double? left, top, bottom;
    // Beside a control: level with it, hanging down from one in the top half and standing up
    // from one in the bottom half, so the card stays on screen.
    (double?, double?) beside(Rect h) => h.center.dy < size.height / 2
        ? ((h.center.dy - 60).clamp(margin, size.height / 2), null)
        : (null, (size.height - h.center.dy - 60).clamp(margin, size.height / 2));
    if (hole == null) {
      left = (size.width - width) / 2;
      // A phone on its side has no room to spare above the card.
      top = size.height < 500 ? margin : size.height * 0.3;
    } else if (hole.right + gap + width + margin <= size.width) {
      left = hole.right + gap;
      (top, bottom) = beside(hole);
    } else if (hole.left - gap - width >= margin) {
      left = hole.left - gap - width;
      (top, bottom) = beside(hole);
    } else {
      left = (hole.center.dx - width / 2).clamp(margin, size.width - width - margin);
      if (hole.center.dy > size.height / 2) {
        bottom = size.height - hole.top + gap;
      } else {
        top = hole.bottom + gap;
      }
    }
    final s = _step;
    return AnimatedPositioned(
      duration: Kx.medium,
      curve: Kx.emphasized,
      left: left,
      top: top,
      bottom: bottom,
      width: width,
      child: Material(
        color: c.surface,
        elevation: 8,
        borderRadius: BorderRadius.circular(Kx.rXl),
        // Scrolls rather than run off a short screen.
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: math.max(160, size.height - (top ?? bottom ?? 0) - margin)),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(Kx.s20, Kx.s16, Kx.s12, Kx.s8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    CircleAvatar(radius: 18, backgroundColor: c.primaryContainer, child: Icon(s.icon, size: 20, color: c.onPrimaryContainer)),
                    const Spacer(),
                    if (widget.steps.length > 1) Text(l.tourStepOf(_i + 1, widget.steps.length), style: context.text.labelMedium?.copyWith(color: c.onSurfaceVariant)),
                  ],
                ),
                const SizedBox(height: Kx.s12),
                Text(s.title, key: const Key('coach-title'), style: context.text.titleLarge),
                const SizedBox(height: Kx.s4),
                Text(s.body, style: context.text.bodyLarge?.copyWith(height: 1.4)),
                const SizedBox(height: Kx.s8),
                Row(
                  children: [
                    if (!last) TextButton(key: const Key('coach-skip'), onPressed: () => Navigator.pop(context, false), child: Text(l.tourSkip)),
                    const Spacer(),
                    if (_i > 0) IconButton(tooltip: l.back, onPressed: _back, icon: const Icon(Icons.arrow_back)),
                    FilledButton(key: const Key('coach-next'), onPressed: _next, child: Text(last ? (widget.finishLabel ?? l.tourGotIt) : l.tourNext)),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Scrim extends CustomPainter {
  _Scrim(this.hole, this.ring, this.ringColor);
  final Rect? hole;
  final bool ring;
  final Color ringColor;

  @override
  void paint(Canvas canvas, Size size) {
    final all = Path()..addRect(Offset.zero & size);
    final h = hole;
    final dim = Paint()..color = const Color(0x99000000);
    if (h == null || h.isEmpty) {
      canvas.drawPath(all, dim);
      return;
    }
    final r = RRect.fromRectAndRadius(h, Radius.circular(math.min(28, h.shortestSide / 2)));
    canvas.drawPath(Path.combine(PathOperation.difference, all, Path()..addRRect(r)), dim);
    if (ring) {
      canvas.drawRRect(
        r,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3
          ..color = ringColor,
      );
    }
  }

  @override
  bool shouldRepaint(_Scrim old) => old.hole != hole || old.ring != ring || old.ringColor != ringColor;
}

/// The board's tour: the controls a teacher uses in every class.
List<CoachStep> boardTourSteps(AppLocalizations l) => [
  CoachStep(icon: Icons.waving_hand_outlined, title: l.tourWelcomeTitle, body: l.tourWelcomeBody),
  CoachStep(target: const Key('tool-pen'), icon: Icons.edit_outlined, title: l.tourPenTitle, body: l.tourPenBody),
  CoachStep(target: const Key('tool-erase'), icon: Icons.auto_fix_normal, title: l.tourEraseTitle, body: l.tourEraseBody),
  CoachStep(target: const Key('tool-insert'), icon: Icons.add, title: l.tourInsertTitle, body: l.tourInsertBody),
  CoachStep(target: const Key('tool-tools'), icon: Icons.work_outline, title: l.tourToolsTitle, body: l.tourToolsBody),
  CoachStep(target: const Key('panel-ai'), icon: Icons.auto_awesome, title: l.tourAiTitle, body: l.tourAiBody),
  CoachStep(target: const Key('panel-ai'), icon: Icons.menu_book, title: l.tourBooksTitle, body: l.tourBooksBody),
  CoachStep(target: const Key('next-page'), icon: Icons.auto_stories_outlined, title: l.tourPagesTitle, body: l.tourPagesBody),
  CoachStep(target: const Key('record'), icon: Icons.fiber_manual_record, title: l.tourRecordTitle, body: l.tourRecordBody),
  CoachStep(target: const Key('profile-button'), icon: Icons.help_outline, title: l.tourHelpTitle, body: l.tourHelpBody),
];
