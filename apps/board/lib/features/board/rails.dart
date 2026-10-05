import 'package:flutter/material.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../l10n/l10n.dart';
import '../ai/ai_controller.dart';
import 'chrome.dart';
import 'kit/subjects.dart';
import 'side_panel.dart';

/// The rails layout (docs/design/design-system.md, "The board"): the board is full-bleed and
/// the tools float over it. Drawing tools and the subject's own tools on a rail at the left;
/// AI and the subject kit on a rail at the right; undo, pages and zoom in a pill at the bottom,
/// in reach of a teacher at an 86" panel.
///
/// For LKG to Class 5 (and the Simple board) the rails are bigger, every tool has its name and
/// letter, and there are fewer of them.

/// What the left rail's popovers are about.
enum RailPopover { write, erase, shapes, insert, tools, theme }

/// Sizes of the rails, for the board's safe area.
abstract final class RailSizes {
  static double button({required bool primary, required bool compact}) => primary ? 64 : (compact ? 44 : 52);
  static double rail({required bool primary, required bool compact}) => button(primary: primary, compact: compact) + 12 + 2 * Kx.s12;
}

/// The left rail: everyday drawing tools first, then the subject's tools, then class tools and
/// the paper.
class ToolRail extends StatelessWidget {
  const ToolRail({
    super.key,
    required this.wb,
    required this.style,
    required this.primary,
    required this.compact,
    required this.popover,
    required this.onPopover,
    required this.onSubjectTool,
    required this.subjectToolActive,
  });

  final WhiteboardController wb;
  final SubjectStyle style;
  final bool primary;
  final bool compact;
  final RailPopover? popover;

  /// Opens (or closes) a popover beside the rail.
  final ValueChanged<RailPopover> onPopover;

  /// Runs a subject tool; the rect is the button on screen.
  final void Function(SubjectTool tool, Rect anchor) onSubjectTool;
  final bool Function(SubjectTool tool) subjectToolActive;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final size = RailSizes.button(primary: primary, compact: compact);
    return ListenableBuilder(
      listenable: Listenable.merge([wb, wb.ruler, wb.protractor]),
      builder: (context, _) {
        final tool = wb.tool;
        Widget button({
          required Key key,
          required Widget icon,
          required String label,
          required String letter,
          required bool selected,
          required VoidCallback onTap,
          Color? iconColor,
          Color? selectedColor,
          Color? onSelected,
        }) => KxToolButton(
          key: key,
          size: size,
          icon: icon,
          tooltip: primary ? label : '$label  ($letter)',
          label: primary ? label : null,
          badge: primary ? letter : null,
          selected: selected,
          iconColor: iconColor,
          selectedColor: selectedColor,
          onSelected: onSelected,
          onTap: onTap,
        );
        // A second tap on the tool in use opens its options.
        void pick(BoardTool t, RailPopover? options) {
          if (wb.tool == t && options != null) {
            onPopover(options);
          } else {
            wb.tool = t;
          }
        }

        final children = <Widget>[
          button(
            key: const Key('tool-select'),
            icon: Transform.rotate(angle: -1.5708, child: const Icon(Icons.near_me_outlined)),
            label: l.toolSelect,
            letter: 'V',
            selected: tool == BoardTool.select,
            onTap: () => pick(BoardTool.select, null),
          ),
          if (!primary)
            button(
              key: const Key('tool-hand'),
              icon: const Icon(Icons.pan_tool_outlined),
              label: l.toolMove,
              letter: 'H',
              selected: tool == BoardTool.hand,
              onTap: () => pick(BoardTool.hand, null),
            ),
          button(
            key: const Key('tool-write'),
            icon: _PenIcon(color: inkColorFor(wb.penColor, wb.background)),
            label: l.pen,
            letter: 'P',
            selected: tool == BoardTool.pen || popover == RailPopover.write && tool != BoardTool.highlighter,
            onTap: () => pick(BoardTool.pen, RailPopover.write),
          ),
          button(
            key: const Key('tool-highlighter'),
            icon: const Icon(Icons.border_color_outlined),
            label: l.highlighter,
            letter: 'I',
            selected: tool == BoardTool.highlighter,
            onTap: () => pick(BoardTool.highlighter, RailPopover.write),
          ),
          button(
            key: const Key('tool-erase'),
            icon: const Icon(Icons.auto_fix_normal),
            label: l.toolErase,
            letter: 'E',
            selected: tool == BoardTool.eraser,
            onTap: () => pick(BoardTool.eraser, RailPopover.erase),
          ),
          button(
            key: const Key('tool-text'),
            icon: const Icon(Icons.title),
            label: l.toolText,
            letter: 'T',
            selected: tool == BoardTool.text,
            onTap: () => pick(BoardTool.text, null),
          ),
          button(
            key: const Key('tool-shapes'),
            icon: const Icon(Icons.interests_outlined),
            label: l.toolShapes,
            letter: 'S',
            selected: tool == BoardTool.shape || popover == RailPopover.shapes,
            onTap: () => onPopover(RailPopover.shapes),
          ),
          button(
            key: const Key('tool-insert'),
            icon: const Icon(Icons.add),
            label: l.toolInsert,
            letter: 'N',
            selected: tool == BoardTool.note || tool == BoardTool.math || tool == BoardTool.laser || popover == RailPopover.insert,
            onTap: () => onPopover(RailPopover.insert),
          ),
          if (style.tools.isNotEmpty) const KxToolbarGap(),
          for (final t in style.tools.take(primary ? 3 : 5))
            Builder(
              builder: (ctx) => KxToolButton(
                key: Key('subject-${t.name}'),
                size: size,
                icon: Icon(t.icon),
                iconColor: style.accent,
                selectedColor: style.container,
                onSelected: style.accent,
                tooltip: l.subjectToolName(t),
                label: primary ? l.subjectToolName(t) : null,
                selected: subjectToolActive(t),
                onTap: () {
                  final box = ctx.findRenderObject() as RenderBox;
                  onSubjectTool(t, box.localToGlobal(Offset.zero) & box.size);
                },
              ),
            ),
          const KxToolbarGap(),
          button(
            key: const Key('tool-tools'),
            icon: const Icon(Icons.work_outline),
            label: l.toolTools,
            letter: 'K',
            selected: popover == RailPopover.tools,
            onTap: () => onPopover(RailPopover.tools),
          ),
          button(
            key: const Key('tool-theme'),
            icon: const Icon(Icons.texture),
            label: l.toolTheme,
            letter: 'B',
            selected: popover == RailPopover.theme,
            onTap: () => onPopover(RailPopover.theme),
          ),
        ];
        return SingleChildScrollView(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: KxToolbar(children: children),
        );
      },
    );
  }
}

/// The right rail: KINETIX AI (marigold) in the subject's order, then Books and the subject kit.
class AiRail extends StatelessWidget {
  const AiRail({super.key, required this.ai, required this.style, required this.primary, required this.compact, required this.panel, required this.aiView, required this.onAi, required this.onPanel});

  final AiController ai;
  final SubjectStyle style;
  final bool primary;
  final bool compact;

  /// The side panel open now, and the AI page it shows.
  final PanelKind? panel;
  final AiView aiView;

  /// Opens the AI panel at a tool.
  final ValueChanged<AiView> onAi;

  /// Opens or closes a side panel.
  final ValueChanged<PanelKind> onPanel;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final size = RailSizes.button(primary: primary, compact: compact);
    final c = context.colors;
    Widget aiButton(Key key, IconData icon, String label, bool selected, VoidCallback onTap, {bool busy = false}) => KxToolButton(
      key: key,
      size: size,
      icon: Icon(icon),
      iconColor: c.tertiary,
      selectedColor: c.tertiaryContainer,
      onSelected: c.onTertiaryContainer,
      tooltip: label,
      label: primary ? label : null,
      selected: selected,
      busy: busy,
      onTap: onTap,
    );
    return ListenableBuilder(
      listenable: ai,
      builder: (context, _) {
        final aiOpen = panel == PanelKind.ai;
        return SingleChildScrollView(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: KxToolbar(
            children: [
              aiButton(const Key('panel-ai'), Icons.auto_awesome, primary ? l.aiAsk : l.toolAi, aiOpen && aiView == AiView.home, () => onPanel(PanelKind.ai)),
              const KxToolbarGap(),
              for (final v in aiOrderFor(style, primary: primary))
                aiButton(
                  Key(switch (v) {
                    AiView.quiz => 'panel-quiz',
                    AiView.homework => 'panel-homework',
                    _ => 'ai-rail-${v.name}',
                  }),
                  aiViewIcon(v),
                  aiViewName(l, v),
                  (v == AiView.quiz && panel == PanelKind.quiz) || (v == AiView.homework && panel == PanelKind.homework) || (aiOpen && aiView == v),
                  () => switch (v) {
                    AiView.quiz => onPanel(PanelKind.quiz),
                    AiView.homework => onPanel(PanelKind.homework),
                    _ => onAi(v),
                  },
                  busy: switch (v) {
                    AiView.quiz => ai.quiz.loading,
                    AiView.homework => ai.homework.loading,
                    AiView.lessonPlan => ai.lessonPlan.loading,
                    AiView.readBoard => ai.reading.loading,
                    _ => false,
                  },
                ),
              const KxToolbarGap(),
              KxToolButton(
                key: const Key('panel-books'),
                size: size,
                icon: const Icon(Icons.menu_book),
                tooltip: l.toolBooks,
                label: primary ? l.toolBooks : null,
                selected: panel == PanelKind.books,
                onTap: () => onPanel(PanelKind.books),
              ),
              KxToolButton(
                key: const Key('panel-kit'),
                size: size,
                icon: Icon(style.icon),
                iconColor: style.accent,
                selectedColor: style.container,
                onSelected: style.accent,
                tooltip: l.subjectKit(l.subjectName(style.subject)),
                label: primary ? l.kitShort : null,
                selected: panel == PanelKind.kit,
                onTap: () => onPanel(PanelKind.kit),
              ),
            ],
          ),
        );
      },
    );
  }
}

IconData aiViewIcon(AiView v) => switch (v) {
  AiView.home => Icons.auto_awesome,
  AiView.quiz => Icons.quiz_outlined,
  AiView.homework => Icons.assignment_outlined,
  AiView.lessonPlan => Icons.event_note_outlined,
  AiView.math => Icons.calculate_outlined,
  AiView.readBoard => Icons.document_scanner_outlined,
};

String aiViewName(AppLocalizations l, AiView v) => switch (v) {
  AiView.home => l.toolAi,
  AiView.quiz => l.toolQuiz,
  AiView.homework => l.toolHomework,
  AiView.lessonPlan => l.aiLessonPlan,
  AiView.math => l.aiMathSolver,
  AiView.readBoard => l.aiReadBoard,
};

/// Undo and redo, the pages, and the zoom: one pill at the bottom of the board.
class BoardPill extends StatelessWidget {
  const BoardPill({super.key, required this.wb, required this.primary});

  final WhiteboardController wb;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final s = primary ? 30.0 : 24.0;
    Widget icon(Key key, IconData i, String tip, VoidCallback? onTap) => IconButton(
      key: key,
      tooltip: tip,
      iconSize: s,
      style: IconButton.styleFrom(minimumSize: Size.square(primary ? 60 : 48)),
      onPressed: onTap,
      icon: Icon(i),
    );
    return ListenableBuilder(
      listenable: Listenable.merge([wb, wb.view]),
      builder: (context, _) => ChromeSurface(
        radius: Kx.rFull,
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            icon(const Key('undo'), Icons.undo, l.toolUndo, wb.canUndo ? wb.undo : null),
            icon(const Key('redo'), Icons.redo, l.toolRedo, wb.canRedo ? wb.redo : null),
            const ToolbarDivider(),
            icon(const Key('previous-page'), Icons.chevron_left, l.toolPrevious, wb.hasPrevious ? wb.previous : null),
            SizedBox(
              width: 56,
              child: Text('${wb.pageIndex + 1}/${wb.pageCount}', key: const Key('page-indicator'), textAlign: TextAlign.center, style: context.text.titleMedium),
            ),
            icon(const Key('next-page'), wb.hasNext ? Icons.chevron_right : Icons.add, wb.hasNext ? l.toolNext : l.toolNewPage, wb.hasNext ? wb.next : wb.addPage),
            if (!primary) ...[
              const ToolbarDivider(),
              icon(const Key('zoom-out'), Icons.remove, l.zoomOut, () => wb.zoomBy(1 / 1.25)),
              Tooltip(
                message: l.zoomReset,
                child: InkWell(
                  key: const Key('zoom-reset'),
                  borderRadius: BorderRadius.circular(Kx.rMd),
                  onTap: wb.resetZoom,
                  child: SizedBox(
                    width: 60,
                    height: 40,
                    child: Center(child: Text('${(wb.view.value.scale * 100).round()}%', style: context.text.labelLarge)),
                  ),
                ),
              ),
              icon(const Key('zoom-in'), Icons.add, l.zoomIn, () => wb.zoomBy(1.25)),
              icon(const Key('zoom-fit'), Icons.fit_screen_outlined, l.zoomFit, wb.fitContent),
            ],
          ],
        ),
      ),
    );
  }
}

/// The pen, with a dot of the ink it writes in.
class _PenIcon extends StatelessWidget {
  const _PenIcon({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    final c = IconTheme.of(context).color;
    final s = IconTheme.of(context).size ?? 24;
    return SizedBox(
      width: s,
      height: s,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Icon(Icons.edit_outlined, size: s, color: c),
          Positioned(
            right: -s * 0.12,
            bottom: -s * 0.12,
            child: Container(
              width: s * 0.42,
              height: s * 0.42,
              decoration: BoxDecoration(color: color.withValues(alpha: 1), shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
            ),
          ),
        ],
      ),
    );
  }
}
