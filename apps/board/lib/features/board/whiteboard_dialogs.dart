import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api_client.dart';
import '../../core/models.dart';

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
    return AlertDialog(
      icon: const Icon(Icons.save_outlined),
      title: const Text('Save board'),
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
              decoration: const InputDecoration(labelText: 'Title'),
              onSubmitted: (_) => _submit(),
            ),
            SwitchListTile(
              key: const Key('save-share'),
              contentPadding: EdgeInsets.zero,
              title: const Text('Share with the class'),
              subtitle: Text(
                widget.classLabel == null
                    ? 'Available when the board is used in a timetabled class'
                    : 'Students and parents of ${widget.classLabel} can open it in their apps',
              ),
              value: _share,
              onChanged: widget.classLabel == null ? null : (v) => setState(() => _share = v),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(key: const Key('save-confirm'), onPressed: _submit, child: const Text('Save')),
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
    return AlertDialog(
      icon: const Icon(Icons.dashboard_outlined),
      title: const Text('Your whiteboards'),
      content: SizedBox(
        width: 640,
        height: 440,
        child: FutureBuilder(
          future: _boards,
          builder: (context, snap) {
            if (snap.hasError) {
              return KxEmptyState(icon: Icons.cloud_off, message: 'Could not load your boards.\n${snap.error}');
            }
            if (!snap.hasData) return const Center(child: CircularProgressIndicator());
            final boards = snap.data!;
            if (boards.isEmpty) {
              return const KxEmptyState(
                icon: Icons.dashboard_outlined,
                message: 'Boards you save appear here. Use Save, or save when you end the class.',
              );
            }
            return ListView.separated(
              itemCount: boards.length,
              separatorBuilder: (_, _) => const SizedBox(height: Kx.s8),
              itemBuilder: (context, i) {
                final b = boards[i];
                final details = [
                  b.sectionName,
                  b.subjectName,
                  '${b.pageCount} ${b.pageCount == 1 ? 'page' : 'pages'}',
                  _when(b.updatedAt),
                ].whereType<String>().join(' · ');
                return Material(
                  color: c.surfaceContainerHighest,
                  borderRadius: Kx.radiusLg,
                  child: ListTile(
                    key: Key('wb-${b.id}'),
                    shape: const RoundedRectangleBorder(borderRadius: Kx.radiusLg),
                    leading: Icon(Icons.draw_outlined, color: c.primary),
                    title: Text(b.title),
                    subtitle: Text(details),
                    onTap: () async {
                      Navigator.pop(context);
                      await widget.onOpen(b);
                    },
                    trailing: b.shared
                        ? Chip(avatar: const Icon(Icons.people_alt_outlined, size: 16), label: const Text('Shared'))
                        : b.sectionName == null
                        ? null
                        : TextButton.icon(
                            onPressed: _busy == b.id ? null : () => _share(b),
                            icon: const Icon(Icons.share_outlined, size: 18),
                            label: const Text('Share'),
                          ),
                  ),
                );
              },
            );
          },
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Close'))],
    );
  }

  static String _when(DateTime t) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final l = t.toLocal();
    return '${l.day} ${months[l.month - 1]}, ${l.hour.toString().padLeft(2, '0')}:${l.minute.toString().padLeft(2, '0')}';
  }
}
