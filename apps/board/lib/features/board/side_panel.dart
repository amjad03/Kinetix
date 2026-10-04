import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_labs/kinetix_labs.dart';

import '../../l10n/l10n.dart';
import 'chrome.dart';

/// What the side panel shows. Opening any of these splits the screen with the whiteboard.
enum PanelKind { ai, books, quiz, homework, split }

/// Content for the split-screen pane.
enum SplitContent { whiteboard, document, video, web, model3d, lab }

extension SplitContentInfo on SplitContent {
  String label(AppLocalizations l) => switch (this) {
    SplitContent.whiteboard => l.splitWhiteboard,
    SplitContent.document => l.splitDocument,
    SplitContent.video => l.splitVideo,
    SplitContent.web => l.splitWeb,
    SplitContent.model3d => l.splitModel3d,
    SplitContent.lab => l.splitLab,
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
                message: context.l10n.dragToResize,
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
            tooltip: context.l10n.moveToOtherSide,
            onPressed: onSwapSide,
            icon: const Icon(Icons.swap_horiz),
          ),
          IconButton(key: const Key('panel-close'), tooltip: context.l10n.close, onPressed: onClose, icon: const Icon(Icons.close)),
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

/// A titled panel page. [onBack] adds a back arrow (sub-pages); [trailing] sits at the end of
/// the title row.
class PanelPage extends StatelessWidget {
  const PanelPage({super.key, required this.icon, required this.title, required this.child, this.accent, this.onBack, this.trailing});

  final IconData icon;
  final String title;
  final Widget child;
  final Color? accent;
  final VoidCallback? onBack;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: EdgeInsets.fromLTRB(onBack == null ? Kx.s24 : Kx.s12, Kx.s20, Kx.s16, Kx.s8),
          child: Row(
            children: [
              if (onBack != null) ...[
                IconButton(key: const Key('panel-back'), tooltip: context.l10n.back, onPressed: onBack, icon: const Icon(Icons.arrow_back)),
                const SizedBox(width: Kx.s4),
              ],
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
              Expanded(
                child: Text(title, style: context.text.headlineSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
              ),
              ?trailing,
            ],
          ),
        ),
        Expanded(child: child),
      ],
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
  const SplitPanel({
    super.key,
    required this.content,
    required this.onContent,
    required this.secondInk,
    required this.background,
    this.itemId,
    this.preset,
    this.onItem,
  });

  final SplitContent? content;
  final ValueChanged<SplitContent?> onContent;
  final InkController secondInk;
  final BoardBackground background;

  /// The 3D model or lab shown (catalogue id), and an optional lab preset.
  final String? itemId;
  final String? preset;
  final void Function(String? id, String? preset)? onItem;

  static bool isBuilt(SplitContent c) => c == SplitContent.whiteboard || c == SplitContent.model3d || c == SplitContent.lab;

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
    if (current == SplitContent.model3d || current == SplitContent.lab) {
      final kind = current!;
      final id = itemId;
      final title = id == null
          ? null
          : current == SplitContent.model3d
          ? ModelCatalogue.byId(id)?.title
          : LabCatalogue.byId(id)?.title;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SplitHeader(
            content: kind,
            title: title,
            onBack: () => id != null ? onItem?.call(null, null) : onContent(null),
          ),
          Expanded(
            child: id == null
                ? _CataloguePicker(kind: kind, onPick: (id) => onItem?.call(id, null))
                : current == SplitContent.model3d
                ? ModelView(key: ValueKey(id), id: id)
                : LabView(key: ValueKey('$id/$preset'), id: id, preset: preset),
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
            child: KxEmptyState(icon: current.icon, message: context.l10n.viewerComingSoon(current.label(context.l10n))),
          ),
        ],
      );
    }
    return PanelPage(
      icon: Icons.vertical_split_outlined,
      title: context.l10n.toolSplitScreen,
      child: ListView(
        padding: const EdgeInsets.all(Kx.s24),
        children: [
          Text(
            context.l10n.splitChoose,
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
                  label: s.label(context.l10n),
                  soon: !isBuilt(s),
                  onTap: () => onContent(s),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// The 3D models or labs that work offline on the board, grouped by subject.
class _CataloguePicker extends StatelessWidget {
  const _CataloguePicker({required this.kind, required this.onPick});

  final SplitContent kind;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final items = kind == SplitContent.model3d
        ? [for (final e in ModelCatalogue.entries) (id: e.id, title: e.title, group: e.subjects.first, tags: e.levels)]
        : [for (final e in LabCatalogue.entries) (id: e.id, title: e.title, group: e.subject, tags: e.levels)];
    final groups = <String, List<({String id, String title, String group, List<String> tags})>>{};
    for (final i in items) {
      groups.putIfAbsent(i.group, () => []).add(i);
    }
    final c = context.colors;
    return ListView(
      key: Key('catalogue-${kind.name}'),
      padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s24),
      children: [
        for (final g in groups.entries) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(Kx.s8, Kx.s16, Kx.s8, Kx.s8),
            child: Text(g.key, style: context.text.titleSmall?.copyWith(color: c.onSurfaceVariant)),
          ),
          for (final i in g.value)
            Card(
              margin: const EdgeInsets.only(bottom: Kx.s8),
              color: c.surfaceContainer,
              elevation: 0,
              child: ListTile(
                key: Key('pick-${i.id}'),
                leading: Icon(kind.icon, color: c.primary),
                title: Text(i.title),
                subtitle: i.tags.isEmpty ? null : Text(i.tags.join(' · ')),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => onPick(i.id),
              ),
            ),
        ],
      ],
    );
  }
}

class _SplitHeader extends StatelessWidget {
  const _SplitHeader({required this.content, required this.onBack, this.title});

  final SplitContent content;
  final VoidCallback onBack;
  final String? title;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.colors.surfaceContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Kx.s8, vertical: Kx.s4),
        child: Row(
          children: [
            IconButton(tooltip: context.l10n.chooseSomethingElse, onPressed: onBack, icon: const Icon(Icons.arrow_back)),
            Icon(content.icon, size: 20, color: context.colors.onSurfaceVariant),
            const SizedBox(width: Kx.s8),
            Expanded(child: Text(title ?? content.label(context.l10n), style: context.text.titleSmall, overflow: TextOverflow.ellipsis)),
          ],
        ),
      ),
    );
  }
}
