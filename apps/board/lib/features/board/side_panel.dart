import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'package:kinetix_ink/kinetix_ink.dart';

import 'chrome.dart';

/// What the side panel shows. Opening any of these splits the screen with the whiteboard.
enum PanelKind { ai, books, quiz, homework, split }

/// Content for the split-screen pane.
enum SplitContent { whiteboard, document, video, web, model3d, lab }

extension SplitContentInfo on SplitContent {
  String get label => switch (this) {
    SplitContent.whiteboard => 'Whiteboard',
    SplitContent.document => 'PDF / PPT',
    SplitContent.video => 'Video',
    SplitContent.web => 'Web page',
    SplitContent.model3d => '3D model',
    SplitContent.lab => 'Virtual lab',
  };

  IconData get icon => switch (this) {
    SplitContent.whiteboard => Icons.draw_outlined,
    SplitContent.document => Icons.slideshow_outlined,
    SplitContent.video => Icons.smart_display_outlined,
    SplitContent.web => Icons.public,
    SplitContent.model3d => Icons.view_in_ar_outlined,
    SplitContent.lab => Icons.science_outlined,
  };
}

/// The panel frame: a slim rail on the board-facing edge (drag to resize, swap side, close)
/// and the content. Mirrors the Teachmint side-panel pattern with Material 3 styling.
class SidePanelFrame extends StatelessWidget {
  const SidePanelFrame({
    super.key,
    required this.onLeft,
    required this.onClose,
    required this.onSwapSide,
    required this.onResize,
    required this.child,
  });

  /// True when the panel is on the left of the screen (the rail is then on its right edge).
  final bool onLeft;
  final VoidCallback onClose;
  final VoidCallback onSwapSide;

  /// Horizontal drag delta in logical pixels.
  final ValueChanged<double> onResize;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final rail = Container(
      width: 44,
      color: c.surfaceContainerLow,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          GestureDetector(
            onHorizontalDragUpdate: (d) => onResize(d.delta.dx),
            child: MouseRegion(
              cursor: SystemMouseCursors.resizeColumn,
              child: Tooltip(
                message: 'Drag to resize',
                child: Container(
                  width: 32,
                  height: 56,
                  decoration: BoxDecoration(color: c.surfaceContainerHighest, borderRadius: BorderRadius.circular(Kx.rMd)),
                  child: Icon(Icons.drag_indicator, color: c.onSurfaceVariant),
                ),
              ),
            ),
          ),
          const SizedBox(height: Kx.s12),
          IconButton(
            key: const Key('panel-swap'),
            tooltip: 'Move to the other side',
            onPressed: onSwapSide,
            icon: const Icon(Icons.swap_horiz),
          ),
          IconButton(key: const Key('panel-close'), tooltip: 'Close', onPressed: onClose, icon: const Icon(Icons.close)),
        ],
      ),
    );
    final body = Expanded(
      child: ColoredBox(color: c.surface, child: child),
    );
    return Material(
      elevation: 8,
      color: c.surface,
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: onLeft ? [body, rail] : [rail, body]),
    );
  }
}

/// A titled panel page.
class PanelPage extends StatelessWidget {
  const PanelPage({super.key, required this.icon, required this.title, required this.child, this.accent});

  final IconData icon;
  final String title;
  final Widget child;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s20, Kx.s24, Kx.s8),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: (accent ?? context.colors.primary).withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(Kx.rMd),
                ),
                child: Icon(icon, color: accent ?? context.colors.primary),
              ),
              const SizedBox(width: Kx.s12),
              Text(title, style: context.text.headlineSmall),
            ],
          ),
        ),
        Expanded(child: child),
      ],
    );
  }
}

/// KINETIX AI: ask anything, plus smart tools. The tools are shells until the India-hosted AI
/// platform is live (docs/architecture/ai-platform.md); each says so when tapped.
class AiPanel extends StatelessWidget {
  const AiPanel({super.key, this.classLabel});

  final String? classLabel;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    // Four tiles per row that fill the panel, whatever its width.
    var tileWidth = 104.0;
    Widget group(String title, List<Widget> tiles) => Padding(
      padding: const EdgeInsets.only(bottom: Kx.s20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant)),
          const SizedBox(height: Kx.s12),
          Wrap(spacing: Kx.s12, runSpacing: Kx.s12, children: tiles),
        ],
      ),
    );
    ChromeTile tile(IconData i, String l, Color col) =>
        ChromeTile(icon: i, label: l, color: col, soon: true, width: tileWidth, onTap: () => showComingSoon(context, 'KINETIX AI $l'));

    return PanelPage(
      icon: Icons.auto_awesome,
      title: 'KINETIX AI',
      accent: const Color(0xFFA142F4),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Kx.s24, Kx.s8, Kx.s24, Kx.s24),
        children: [
          SearchBar(
            hintText: classLabel == null ? 'Ask anything about a topic' : 'Ask anything about $classLabel',
            leading: const Padding(padding: EdgeInsets.only(left: 8), child: Icon(Icons.auto_awesome_outlined)),
            trailing: [
              IconButton(tooltip: 'Speak', onPressed: () => showComingSoon(context, 'Voice questions'), icon: const Icon(Icons.mic_none)),
            ],
            onSubmitted: (_) => showComingSoon(context, 'KINETIX AI answers'),
            elevation: const WidgetStatePropertyAll(0),
            backgroundColor: WidgetStatePropertyAll(c.surfaceContainerHigh),
            constraints: const BoxConstraints(minHeight: 56),
          ),
          Padding(
            padding: const EdgeInsets.only(top: Kx.s8, bottom: Kx.s24),
            child: Text(
              'Answers follow your syllabus and cite the textbook. Check before sharing with the class.',
              style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
            ),
          ),
          group('Teach', [
            tile(Icons.summarize_outlined, 'Summary', const Color(0xFF8AB4F8)),
            tile(Icons.quiz_outlined, 'Quick quiz', const Color(0xFF81C995)),
            tile(Icons.co_present_outlined, 'Lesson', const Color(0xFFFDD663)),
            tile(Icons.assignment_outlined, 'Homework', const Color(0xFFF28B82)),
          ]),
          group('Maths & science', [
            tile(Icons.functions, 'Math solver', const Color(0xFF8AB4F8)),
            tile(Icons.show_chart, 'Graph', const Color(0xFF81C995)),
            tile(Icons.grid_view, 'Periodic table', const Color(0xFFF28B82)),
            tile(Icons.science_outlined, 'Simulations', const Color(0xFFC58AF9)),
          ]),
          group('Look up', [
            tile(Icons.menu_book_outlined, 'Textbook', const Color(0xFFFDD663)),
            tile(Icons.public, 'Wikipedia', const Color(0xFFDADCE0)),
            tile(Icons.translate, 'Dictionary', const Color(0xFF78D9EC)),
            tile(Icons.document_scanner_outlined, 'Read board (OCR)', const Color(0xFFFCAD70)),
          ]),
        ],
      ),
    );
  }
}

/// A panel for a feature that is specified but not built yet.
class PlannedPanel extends StatelessWidget {
  const PlannedPanel({super.key, required this.icon, required this.title, required this.message, this.accent});

  final IconData icon;
  final String title;
  final String message;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    return PanelPage(
      icon: icon,
      title: title,
      accent: accent,
      child: KxEmptyState(icon: icon, message: message),
    );
  }
}

/// Split screen: pick what goes next to the whiteboard.
class SplitPanel extends StatelessWidget {
  const SplitPanel({super.key, required this.content, required this.onContent, required this.secondInk, required this.background});

  final SplitContent? content;
  final ValueChanged<SplitContent?> onContent;
  final InkController secondInk;
  final BoardBackground background;

  @override
  Widget build(BuildContext context) {
    final current = content;
    if (current == SplitContent.whiteboard) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SplitHeader(content: SplitContent.whiteboard, onBack: () => onContent(null)),
          Expanded(
            child: InkCanvas(controller: secondInk, background: background),
          ),
        ],
      );
    }
    if (current != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SplitHeader(content: current, onBack: () => onContent(null)),
          Expanded(
            child: KxEmptyState(icon: current.icon, message: 'The ${current.label} viewer is coming in an upcoming build.'),
          ),
        ],
      );
    }
    return PanelPage(
      icon: Icons.vertical_split_outlined,
      title: 'Split screen',
      child: ListView(
        padding: const EdgeInsets.all(Kx.s24),
        children: [
          Text(
            'Choose what to show next to the whiteboard.',
            style: context.text.bodyLarge?.copyWith(color: context.colors.onSurfaceVariant),
          ),
          const SizedBox(height: Kx.s16),
          Wrap(
            spacing: Kx.s12,
            runSpacing: Kx.s12,
            children: [
              for (final s in SplitContent.values)
                ChromeTile(
                  key: Key('split-${s.name}'),
                  icon: s.icon,
                  label: s.label,
                  soon: s != SplitContent.whiteboard,
                  onTap: () => onContent(s),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SplitHeader extends StatelessWidget {
  const _SplitHeader({required this.content, required this.onBack});

  final SplitContent content;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.colors.surfaceContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: Kx.s4),
        child: Row(
          children: [
            IconButton(tooltip: 'Choose something else', onPressed: onBack, icon: const Icon(Icons.arrow_back)),
            Icon(content.icon, size: 20, color: context.colors.onSurfaceVariant),
            const SizedBox(width: Kx.s8),
            Text(content.label, style: context.text.titleSmall),
          ],
        ),
      ),
    );
  }
}
