import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import 'package:kinetix_3d/kinetix_3d.dart';
import 'package:kinetix_labs/kinetix_labs.dart';

import '../../l10n/l10n.dart';
import '../search/catalogue_browser.dart';
import '../search/catalogue_facets.dart';
import 'chrome.dart';
import 'layout/layout_strings.dart';

/// What the split panel shows. Opening any of these splits the screen with the whiteboard.
/// [page] is a tool's content (graph templates…); [host] is a dialog alone in the panel.
enum PanelKind { ai, books, quiz, homework, split, plan, kit, videos, animations, badges, sim, page, host, phet, camera, web, cast }

/// What the split screen shows beside the board: a second whiteboard, a 3D model or a lab.
enum SplitContent { whiteboard, model3d, lab }

extension SplitContentInfo on SplitContent {
  String label(AppLocalizations l) => switch (this) {
    SplitContent.whiteboard => l.splitWhiteboard,
    SplitContent.model3d => l.splitModel3d,
    SplitContent.lab => l.splitLab,
  };

  IconData get icon => switch (this) {
    SplitContent.whiteboard => Icons.draw_outlined,
    SplitContent.model3d => Icons.view_in_ar_outlined,
    SplitContent.lab => Icons.science_outlined,
  };
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
    required this.secondBoard,
    this.itemId,
    this.preset,
    this.onItem,
    this.onSnapshot,
    this.snapshotKey,
  });

  final SplitContent? content;
  final ValueChanged<SplitContent?> onContent;
  /// The second whiteboard: the same canvas, toolbar state and AI pen as the main board.
  final Widget secondBoard;

  /// The 3D model or lab shown (catalogue id), and an optional lab preset.
  final String? itemId;
  final String? preset;
  final void Function(String? id, String? preset)? onItem;

  /// Puts a picture of the 3D model or lab on the board, linked so it opens again from there.
  final VoidCallback? onSnapshot;

  /// Marks the model or lab view, for the picture ([RepaintBoundary]).
  final GlobalKey? snapshotKey;

  @override
  Widget build(BuildContext context) {
    final current = content;
    if (current == SplitContent.whiteboard) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _SplitHeader(content: SplitContent.whiteboard, onBack: () => onContent(null)),
          Expanded(
            child: secondBoard,
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
            onSnapshot: id == null || current == SplitContent.model3d ? null : onSnapshot,
          ),
          Expanded(
            child: id == null
                ? CatalogueBrowser(
                    key: ValueKey(kind),
                    kind: kind == SplitContent.model3d ? CatalogueKind.model3d : CatalogueKind.lab,
                    onPick: (id) => onItem?.call(id, null),
                  )
                : RepaintBoundary(
                    key: snapshotKey,
                    child: current == SplitContent.model3d
                        ? ModelView(key: ValueKey(id), id: id)
                        : LabView(key: ValueKey('$id/$preset'), id: id, preset: preset),
                  ),
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
  const _SplitHeader({required this.content, required this.onBack, this.title, this.onSnapshot});

  final SplitContent content;
  final VoidCallback onBack;
  final String? title;
  final VoidCallback? onSnapshot;

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
            if (onSnapshot != null)
              TextButton.icon(
                key: const Key('split-snapshot'),
                onPressed: onSnapshot,
                icon: const Icon(Icons.add_photo_alternate_outlined),
                label: Text(LayoutStrings.of(context).addToBoard),
              ),
          ],
        ),
      ),
    );
  }
}
