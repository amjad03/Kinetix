import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:kinetix_ink/kinetix_ink.dart';

import '../../core/board_controller.dart';
import '../../core/models.dart';
import 'chrome.dart';
import 'panel/panel_host.dart';
import 'sb_strings.dart';

/// Version history (spec §58, §86): earlier saves of the open board. Returns the restored board
/// and when it was saved, or null. The server keeps what was there as a version too, so a
/// restore can itself be undone from this list.
Future<(SavedBoard, String)?> showVersionHistory(BuildContext context, BoardController board) async {
  final api = board.api;
  if (api == null || board.whiteboardId.isEmpty) return null;
  final List<WhiteboardVersion> versions;
  try {
    versions = await api.whiteboardVersions(board.whiteboardId);
  } catch (e) {
    if (context.mounted) showBoardMessage(context, '$e');
    return null;
  }
  if (!context.mounted) return null;
  final s = SbStrings.of(context);
  final fmt = DateFormat('d MMM, HH:mm');
  final picked = await showPanelDialog<WhiteboardVersion>(
    context: context,
    builder: (context) => AlertDialog(
      key: const Key('version-history'),
      title: Text(s('versions')),
      content: SizedBox(
        width: 480,
        child: versions.isEmpty
            ? Text(s('versionsEmpty'))
            : ListView(
                shrinkWrap: true,
                children: [
                  for (final v in versions)
                    ListTile(
                      key: Key('version-${v.version}'),
                      title: Text(v.title),
                      subtitle: Text('${fmt.format(v.savedAt)} · ${s('pagesN', {'n': v.pageCount})}'),
                      trailing: FilledButton.tonal(onPressed: () => Navigator.of(context).pop(v), child: Text(s('restoreVersion'))),
                    ),
                ],
              ),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(s('cancel')))],
    ),
  );
  if (picked == null) return null;
  try {
    final restored = await api.restoreWhiteboard(board.whiteboardId, picked.version);
    return (restored, fmt.format(picked.savedAt));
  } catch (e) {
    if (context.mounted) showBoardMessage(context, '$e');
    return null;
  }
}
