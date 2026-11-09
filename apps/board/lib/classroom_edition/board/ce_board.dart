import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../class_tools/class_tools_hub.dart';
import '../ui/ce_style.dart';

/// One stop of the Classroom edition's guided tour, or of "Show me": the control (by its key on
/// the board), its icon and what to say.
class CeStep {
  const CeStep({required this.target, required this.icon, required this.title, required this.body, this.tryIt});

  final Key target;
  final IconData icon;
  final String title;
  final String body;

  /// "Try it now: …", on the practice board.
  final String? tryIt;
}

/// The guided tour (screen 11): Pen, Colours, Undo, Lessons and Class tools.
const ceTourSteps = [
  CeStep(
    target: Key('tool-pen'),
    icon: Icons.edit,
    title: 'This is your Pen',
    body: 'Tap it, then write on the board with your finger or the stylus. Made a mistake? Tap Undo — nothing can break.',
    tryIt: 'Try it now: write your name in the box on the board.',
  ),
  CeStep(
    target: Key('ce-colours'),
    icon: Icons.palette_outlined,
    title: 'Pick a colour',
    body: 'Colours has red, blue, green and more, and how thick the pen writes. The pen keeps your colour until you change it.',
    tryIt: 'Try it now: pick red and draw a circle.',
  ),
  CeStep(
    target: Key('undo'),
    icon: Icons.undo,
    title: 'Undo puts it back',
    body: 'Each tap takes back the last thing you did. The Eraser beside it rubs out just a part.',
    tryIt: 'Try it now: tap Undo to take your circle away.',
  ),
  CeStep(
    target: Key('ce-lessons'),
    icon: Icons.auto_stories_outlined,
    title: 'Your lessons',
    body: 'Ready lessons for 1st and 2nd PUC open beside the board. Put any step on the board with one tap.',
  ),
  CeStep(
    target: Key('ce-class-tools'),
    icon: Icons.school_outlined,
    title: 'Class tools',
    body: 'Class quiz, mock test, teams, pick a roll number and more — all by roll number, with no phones and no internet.',
  ),
];

/// Where the widget with [key] is, in [ancestor]'s coordinates (null when it is not on screen).
Rect? ceRectOf(BuildContext context, Key key, RenderBox ancestor) {
  Rect? found;
  void visit(Element e) {
    if (found != null) return;
    if (e.widget.key == key) {
      final box = e.findRenderObject();
      if (box is RenderBox && box.attached && box.hasSize) {
        found = MatrixUtils.transformRect(box.getTransformTo(ancestor), Offset.zero & box.size);
        return;
      }
    }
    e.visitChildren(visit);
  }

  context.visitChildElements(visit);
  return found;
}

/// The tour and "Show me" over the board: a dimmed board with a hole around the control and a
/// coach card above it. With [practice], the practice board's banner shows at the top.
class CeCoach extends StatefulWidget {
  const CeCoach({super.key, required this.steps, required this.boardContext, required this.onDone, this.practice = false, this.finishLabel = 'Done'});

  final List<CeStep> steps;

  /// Where the controls are looked up.
  final BuildContext boardContext;

  /// Called with true when the teacher went through to the end, false when they skipped.
  final ValueChanged<bool> onDone;
  final bool practice;
  final String finishLabel;

  @override
  State<CeCoach> createState() => _CeCoachState();
}

class _CeCoachState extends State<CeCoach> {
  int _i = 0;
  Rect? _hole;

  @override
  void initState() {
    super.initState();
    _measure();
  }

  void _measure() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !widget.boardContext.mounted) return;
      final me = context.findRenderObject();
      if (me is! RenderBox || !me.hasSize) return;
      final r = ceRectOf(widget.boardContext, widget.steps[_i].target, me);
      if (r != _hole) setState(() => _hole = r);
    });
  }

  void _next() {
    if (_i + 1 >= widget.steps.length) return widget.onDone(true);
    setState(() {
      _i++;
      _hole = null;
    });
    _measure();
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) {
      final size = box.biggest;
      final step = widget.steps[_i];
      final hole = (_hole ?? Rect.fromCenter(center: Offset(size.width / 2, size.height - 60), width: 0, height: 0)).inflate(10);
      final cardW = math.min(560.0, size.width - 48);
      final cardLeft = (hole.center.dx - cardW / 2).clamp(24.0, math.max(24.0, size.width - cardW - 24));
      final above = hole.top > size.height / 2;
      final many = widget.steps.length > 1;
      final last = _i == widget.steps.length - 1;
      final card = Container(
        key: const Key('ce-coach-card'),
        padding: const EdgeInsets.fromLTRB(32, 28, 32, 24),
        decoration: ceCard(r: 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                ceIconDot(step.icon, bg: CeC.lavender, size: 52),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (many) Text('Step ${_i + 1} of ${widget.steps.length}', style: ceText(15, w: FontWeight.w600, c: CeC.accent)),
                      Text(step.title, style: ceHeading(30)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(step.body, style: ceText(19, c: CeC.body, height: 1.4)),
            if (widget.practice && step.tryIt != null) ...[
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(color: CeC.mint, borderRadius: BorderRadius.circular(16)),
                child: Row(
                  children: [
                    const Icon(Icons.touch_app_outlined, color: CeC.navy),
                    const SizedBox(width: 10),
                    Expanded(child: Text(step.tryIt!, style: ceText(16, w: FontWeight.w600, c: CeC.navy))),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 22),
            Row(
              children: [
                if (many)
                  for (var i = 0; i < widget.steps.length; i++)
                    Container(
                      margin: const EdgeInsets.only(right: 6),
                      width: i == _i ? 24 : 8,
                      height: 8,
                      decoration: BoxDecoration(color: i == _i ? CeC.accent : CeC.line, borderRadius: BorderRadius.circular(4)),
                    ),
                const Spacer(),
                if (many && !last) ...[
                  TextButton(key: const Key('ce-tour-skip'), onPressed: () => widget.onDone(false), child: Text('Skip tour', style: ceText(17, w: FontWeight.w600, c: CeC.muted))),
                  const SizedBox(width: 8),
                ],
                FilledButton(key: const Key('ce-tour-next'), onPressed: _next, style: ceBigButton(), child: Text(last ? widget.finishLabel : 'Next')),
              ],
            ),
          ],
        ),
      );
      return Stack(
        key: const Key('ce-coach'),
        children: [
          // The board stays usable inside the hole: the teacher tries the tool there.
          Positioned.fill(
            child: CustomPaint(
              painter: _ScrimPainter(hole),
              child: _HoleBarrier(hole: hole),
            ),
          ),
          if (widget.practice) const Positioned(top: 96, left: 0, right: 0, child: Center(child: CePracticeBanner())),
          Positioned(left: cardLeft.toDouble(), width: cardW, bottom: above ? size.height - hole.top + 28 : null, top: above ? null : hole.bottom + 28, child: card),
          if (_hole != null)
            Positioned(
              left: hole.center.dx - 14,
              top: above ? hole.top - 30 : hole.bottom + 2,
              child: Icon(above ? Icons.arrow_drop_down_rounded : Icons.arrow_drop_up_rounded, size: 28, color: Colors.white),
            ),
        ],
      );
    },
  );
}

/// Swallows touches outside the hole (the board under the scrim), lets them through inside it.
class _HoleBarrier extends StatelessWidget {
  const _HoleBarrier({required this.hole});

  final Rect hole;

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      Positioned(left: 0, right: 0, top: 0, height: math.max(0, hole.top), child: const _Block()),
      Positioned(left: 0, right: 0, top: hole.bottom, bottom: 0, child: const _Block()),
      Positioned(left: 0, width: math.max(0, hole.left), top: hole.top, height: hole.height, child: const _Block()),
      Positioned(left: hole.right, right: 0, top: hole.top, height: hole.height, child: const _Block()),
    ],
  );
}

class _Block extends StatelessWidget {
  const _Block();

  @override
  Widget build(BuildContext context) => const AbsorbPointer(child: SizedBox.expand());
}

class _ScrimPainter extends CustomPainter {
  _ScrimPainter(this.hole);

  final Rect hole;

  @override
  void paint(Canvas canvas, Size size) {
    final rr = RRect.fromRectAndRadius(hole, const Radius.circular(22));
    final path = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Offset.zero & size)
      ..addRRect(rr);
    canvas.drawPath(path, Paint()..color = const Color(0xA60B1030));
    if (hole.isEmpty) return;
    canvas.drawRRect(
      rr,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4
        ..color = const Color(0xFFFFD54F),
    );
  }

  // Touches go to the barrier (outside the hole) or through to the board (inside it).
  @override
  bool? hitTest(Offset position) => false;

  @override
  bool shouldRepaint(_ScrimPainter old) => old.hole != hole;
}

/// "Practice board: nothing here is saved or shown to the class."
class CePracticeBanner extends StatelessWidget {
  const CePracticeBanner({super.key, this.onEnd});

  /// "End practice" (after the tour; null while it runs).
  final VoidCallback? onEnd;

  @override
  Widget build(BuildContext context) => Container(
    key: const Key('ce-practice-banner'),
    padding: EdgeInsets.fromLTRB(22, onEnd == null ? 12 : 6, onEnd == null ? 22 : 8, onEnd == null ? 12 : 6),
    decoration: ceCard(color: CeC.butter, r: 99),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.school_outlined, color: CeC.navy),
        const SizedBox(width: 10),
        Text('Practice board', style: ceText(17, w: FontWeight.w700, c: CeC.navy)),
        const SizedBox(width: 10),
        Flexible(child: Text('Nothing here is saved or shown to the class. Try anything.', overflow: TextOverflow.ellipsis, style: ceText(17, c: CeC.navy))),
        if (onEnd != null) ...[
          const SizedBox(width: 16),
          FilledButton(key: const Key('ce-end-practice'), onPressed: onEnd, style: ceBigButton().copyWith(minimumSize: const WidgetStatePropertyAll(Size(0, 44))), child: const Text('End practice')),
        ],
      ],
    ),
  );
}

/// The practice page: a box to write a name in.
List<BoardElement> cePracticePage() => [
  NoteElement(id: newElementId(), rect: const Rect.fromLTWH(660, 456, 600, 140), text: 'Write your name here', color: const Color(0xFFE1EDFB), fontSize: 34),
];

/// "What do I do now?" (screen 03): a next-step tip above the toolbar, Undo, and "Show me".
class CeWhatNow extends StatelessWidget {
  const CeWhatNow({super.key, required this.tip, this.onUndo, this.onShowMe});

  final String tip;
  final VoidCallback? onUndo;
  final VoidCallback? onShowMe;

  @override
  Widget build(BuildContext context) => Container(
    key: const Key('ce-what-now'),
    padding: const EdgeInsets.all(10),
    decoration: Kx.floating(radius: 99),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ceIconDot(Icons.lightbulb_outline, bg: CeC.butter, size: 48),
        const SizedBox(width: 14),
        Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('What do I do now?', style: ceText(16, w: FontWeight.w700, c: CeC.navy)),
            const SizedBox(height: 2),
            Text(tip, key: const Key('ce-what-now-tip'), style: ceText(15, c: const Color(0xFF334155))),
          ],
        ),
        const SizedBox(width: 18),
        Container(width: 1, height: 36, color: CeC.line),
        const SizedBox(width: 6),
        TextButton.icon(
          key: const Key('ce-what-now-undo'),
          onPressed: onUndo,
          style: TextButton.styleFrom(minimumSize: const Size(0, 48), foregroundColor: CeC.navy, textStyle: ceText(16, w: FontWeight.w600), shape: const StadiumBorder()),
          icon: const Icon(Icons.undo),
          label: const Text('Undo'),
        ),
        TextButton.icon(
          key: const Key('ce-show-me'),
          onPressed: onShowMe,
          style: TextButton.styleFrom(minimumSize: const Size(0, 48), foregroundColor: CeC.accent, textStyle: ceText(16, w: FontWeight.w600), shape: const StadiumBorder()),
          icon: const Icon(Icons.play_circle_outline),
          label: const Text('Show me'),
        ),
      ],
    ),
  );
}

/// What the board says to do next, and the control "Show me" points at.
({String tip, CeStep step}) ceNextStep({required BoardTool tool, required bool blank, required int elements, required bool panelLessons, required bool panelClassTools, required bool canAddPage, String? panelTip}) {
  if (panelLessons) {
    return (tip: panelTip ?? 'Pick a chapter, then put each step on the board.', step: ceTourSteps[3]);
  }
  if (panelClassTools) {
    return (tip: panelTip ?? 'Pick a tool. Everything works by roll number, no phones needed.', step: ceTourSteps[4]);
  }
  if (tool == BoardTool.eraser) {
    return (tip: 'Rub out what you need to. Tap Pen to write again.', step: ceTourSteps[0]);
  }
  if (blank) {
    return (tip: 'Pick the Pen and write today’s heading, or open Lessons.', step: ceTourSteps[0]);
  }
  if (elements > 25 && canAddPage) {
    return (
      tip: 'Page getting full? Add a new page at the bottom right.',
      step: const CeStep(target: Key('add-page'), icon: Icons.add, title: 'Add a page', body: 'A fresh page, and this one is kept. Previous and Next go between them.'),
    );
  }
  return (tip: 'Keep writing, or open Class tools for a quick class quiz.', step: ceTourSteps[4]);
}

/// The Class tools section at the top of Classroom Apps (screen 07).
Widget classToolsHeader(BuildContext ctx, {required void Function(String id) onTool}) => Column(
  crossAxisAlignment: CrossAxisAlignment.start,
  children: [
    Wrap(
      crossAxisAlignment: WrapCrossAlignment.end,
      spacing: Kx.s8,
      children: [
        Text('Class tools', style: ctx.text.titleMedium?.copyWith(color: CeC.navy, fontWeight: FontWeight.w600)),
        Text('Ready on this board · no phones, no internet', style: ctx.text.bodyMedium?.copyWith(color: CeC.muted)),
      ],
    ),
    const SizedBox(height: Kx.s12),
    LayoutBuilder(
      builder: (context, box) {
        final w = (box.maxWidth - 24) / 3;
        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            for (final t in classTools)
              classToolTile(
                t,
                width: w,
                height: 140,
                onTap: () {
                  Navigator.of(ctx).pop();
                  onTool(t.id);
                },
              ),
          ],
        );
      },
    ),
  ],
);
