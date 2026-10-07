import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:kinetix_ink/kinetix_ink.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import 'chrome.dart';
import 'panel/panel_host.dart';

/// "Save board": a title and whether to share it with the class.
class SaveBoardDialog extends StatefulWidget {
  const SaveBoardDialog({super.key, required this.initialTitle, required this.classLabel});

  final String initialTitle;

  /// The class this board can be shared with, or null when there is none (ad-hoc session).
  final String? classLabel;

  @override
  State<SaveBoardDialog> createState() => _SaveBoardDialogState();
}

class _SaveBoardDialogState extends State<SaveBoardDialog> {
  late final _title = TextEditingController(text: widget.initialTitle);
  late bool _share = widget.classLabel != null;

  void _submit() {
    final title = _title.text.trim();
    if (title.isEmpty) return;
    Navigator.pop(context, (title: title, share: _share));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AlertDialog(
      scrollable: true,
      icon: const Icon(Icons.save_outlined),
      title: Text(l.saveBoard),
      content: SizedBox(
        width: 480,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              key: const Key('save-title'),
              controller: _title,
              autofocus: true,
              maxLength: 120,
              decoration: InputDecoration(labelText: l.titleLabel),
              onSubmitted: (_) => _submit(),
            ),
            SwitchListTile(
              key: const Key('save-share'),
              contentPadding: EdgeInsets.zero,
              title: Text(l.shareWithClass),
              subtitle: Text(widget.classLabel == null ? l.shareNeedsClass : l.shareBoardHint(widget.classLabel!)),
              value: _share,
              onChanged: widget.classLabel == null ? null : (v) => setState(() => _share = v),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('save-confirm'), onPressed: _submit, child: Text(l.save)),
      ],
    );
  }
}

/// "Your whiteboards": the teacher's saved boards; open one to continue it or share it.
class WhiteboardsDialog extends StatefulWidget {
  const WhiteboardsDialog({super.key, required this.api, required this.onOpen});

  final ApiClient api;
  final Future<void> Function(WhiteboardSummary) onOpen;

  @override
  State<WhiteboardsDialog> createState() => _WhiteboardsDialogState();
}

class _WhiteboardsDialogState extends State<WhiteboardsDialog> {
  late Future<List<WhiteboardSummary>> _boards = widget.api.whiteboards();
  String? _busy;

  Future<void> _share(WhiteboardSummary b) async {
    setState(() => _busy = b.id);
    try {
      await widget.api.shareWhiteboard(b.id);
      setState(() => _boards = widget.api.whiteboards());
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    return AlertDialog(
      icon: const Icon(Icons.dashboard_outlined),
      title: Text(l.yourWhiteboards),
      // A phone gives the list its width.
      insetPadding: MediaQuery.sizeOf(context).width < 600 ? const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s24) : const EdgeInsets.symmetric(horizontal: 40, vertical: 24),
      contentPadding: MediaQuery.sizeOf(context).width < 600 ? const EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, 0) : null,
      content: SizedBox(
        width: 640,
        height: 440,
        child: FutureBuilder(
          future: _boards,
          builder: (context, snap) {
            if (snap.hasError) {
              return KxEmptyState(icon: Icons.cloud_off, message: l.couldNotLoadBoards('${snap.error}'));
            }
            if (!snap.hasData) return const Center(child: CircularProgressIndicator());
            final boards = snap.data!;
            if (boards.isEmpty) {
              return KxEmptyState(icon: Icons.dashboard_outlined, message: l.noBoardsYet);
            }
            // A phone's dialog is narrow: Share and Shared are icons there, so the title has room.
            final narrow = MediaQuery.sizeOf(context).width < 600;
            return ListView.separated(
              itemCount: boards.length,
              separatorBuilder: (_, _) => const SizedBox(height: Kx.s8),
              itemBuilder: (context, i) {
                final b = boards[i];
                final details = [
                  b.sectionName,
                  b.subjectName,
                  l.pageCount(b.pageCount),
                  DateFormat('d MMM, HH:mm', context.dateLocale).format(b.updatedAt.toLocal()),
                ].whereType<String>().join(' · ');
                return Material(
                  color: c.surfaceContainerHighest,
                  borderRadius: Kx.radiusLg,
                  child: ListTile(
                    key: Key('wb-${b.id}'),
                    shape: const RoundedRectangleBorder(borderRadius: Kx.radiusLg),
                    leading: narrow ? null : Icon(Icons.draw_outlined, color: c.primary),
                    titleTextStyle: narrow ? context.text.titleSmall : null,
                    title: Text(b.title),
                    subtitle: Text(details),
                    onTap: () async {
                      Navigator.pop(context);
                      await widget.onOpen(b);
                    },
                    trailing: b.shared
                        ? (narrow
                              ? Tooltip(message: l.shared, child: Icon(Icons.people_alt_outlined, color: c.primary))
                              : Chip(avatar: const Icon(Icons.people_alt_outlined, size: 16), label: Text(l.shared)))
                        : b.sectionName == null
                        ? null
                        : narrow
                        ? IconButton(tooltip: l.share, onPressed: _busy == b.id ? null : () => _share(b), icon: const Icon(Icons.share_outlined))
                        : TextButton.icon(
                            onPressed: _busy == b.id ? null : () => _share(b),
                            icon: const Icon(Icons.share_outlined, size: 18),
                            label: Text(l.share),
                          ),
                  ),
                );
              },
            );
          },
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: Text(l.close))],
    );
  }
}

/// What a Clear asks about: this page (with "Clear all pages" beside it when there are more),
/// this page only, or every page.
enum ClearScope { choose, page, all }

/// Clear: asks first ("Clear this page?" / "Clear all N pages?"), then clears this page or every
/// page (imported pages keep their pictures). Both undo, and the message after it has an Undo too.
/// Every Clear on the board comes here: the toolbar, the menu, the page overview, the eraser's
/// card and the phone's More sheet.
Future<void> confirmClearBoard(BuildContext context, WhiteboardController wb, {ClearScope scope = ClearScope.choose}) async {
  final l = context.l10n;
  final allOnly = scope == ClearScope.all;
  if (allOnly ? !wb.canClearAllPages : (scope == ClearScope.page && !wb.canClearPage)) return;
  final all = await showPanelDialog<bool>(
    context: context,
    builder: (context) => BoardChromeTheme(
      child: AlertDialog(
        key: const Key('clear-dialog'),
        icon: const Icon(Icons.delete_sweep_outlined),
        title: Text(allOnly ? l.clearAllPagesTitle(wb.pageCount) : l.clearThisPageTitle),
        content: Text(l.clearBoardBody),
        actions: [
          TextButton(key: const Key('clear-cancel'), onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
          if (allOnly)
            FilledButton(key: const Key('clear-all-pages'), onPressed: () => Navigator.pop(context, true), child: Text(l.clearAllPages))
          else if (scope == ClearScope.choose && wb.pageCount > 1)
            OutlinedButton(
              key: const Key('clear-all-pages'),
              onPressed: wb.canClearAllPages ? () => Navigator.pop(context, true) : null,
              child: Text(l.clearAllPages),
            ),
          if (!allOnly)
            FilledButton(
              key: const Key('clear-this-page'),
              onPressed: wb.canClearPage ? () => Navigator.pop(context, false) : null,
              child: Text(l.clearPage),
            ),
        ],
      ),
    ),
  );
  if (all == null || !context.mounted) return;
  if (all) {
    final undo = wb.clearAllPages();
    showBoardMessage(context, l.clearedAllPages, action: (l.toolUndo, undo));
  } else {
    wb.clearPage();
    showBoardMessage(context, l.clearedPage, action: (l.toolUndo, wb.undo));
  }
}
