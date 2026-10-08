import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../core/school_life.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'load_view.dart';

/// The class diary for a child, newest first; a guardian marks each entry as read.
class DiaryScreen extends StatelessWidget {
  const DiaryScreen({super.key, required this.api, required this.child});

  final ParentApi api;
  final Child child;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadView<List<DiaryEntry>>(
      title: l.diaryTitle(child.firstName),
      load: () => api.diary(child.id),
      builder: (context, entries, reload) {
        final unread = entries.where((e) => !e.acknowledged).length;
        return [
          if (unread > 0) Padding(padding: const EdgeInsets.only(bottom: Kx.s8), child: Text(l.diaryToAcknowledge(unread), key: const Key('diaryUnread'), style: context.text.titleSmall)),
          if (entries.isEmpty) EmptyNote(l.diaryEmpty),
          for (final e in entries) _EntryCard(entry: e, api: api, child: child, onChanged: reload),
        ];
      },
    );
  }
}

class _EntryCard extends StatefulWidget {
  const _EntryCard({required this.entry, required this.api, required this.child, required this.onChanged});

  final DiaryEntry entry;
  final ParentApi api;
  final Child child;
  final Future<void> Function() onChanged;

  @override
  State<_EntryCard> createState() => _EntryCardState();
}

class _EntryCardState extends State<_EntryCard> {
  bool _busy = false;

  Future<void> _ack() async {
    setState(() => _busy = true);
    try {
      await widget.api.acknowledgeDiary(widget.child.id, widget.entry.id);
      if (mounted) say(context, context.l10n.diaryAckDone);
      await widget.onChanged();
    } catch (e) {
      if (mounted) say(context, context.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final e = widget.entry;
    Widget part(String label, String text) => text.isEmpty
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.only(top: Kx.s8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: context.text.labelLarge?.copyWith(color: c.onSurfaceVariant)),
                Text(text, style: context.text.bodyLarge),
              ],
            ),
          );
    return Card(
      key: Key('diary-${e.id}'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(context.fmt.longDay(e.date), style: context.text.titleSmall),
            Text([if (e.subject != null) e.subject!, if (e.author.isNotEmpty) l.diaryBy(e.author)].join(' · '), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
            part(l.diaryClasswork, e.classwork),
            part(l.diaryHomework, e.homeworkNote),
            part(l.diaryNotice, e.notice),
            const SizedBox(height: Kx.s12),
            if (e.acknowledged)
              Pill(l.diaryAcknowledged, icon: Icons.check_circle_outline, background: Theme.of(context).colorScheme.secondaryContainer, foreground: Theme.of(context).colorScheme.onSecondaryContainer)
            else
              FilledButton.tonal(key: Key('ack-${e.id}'), onPressed: _busy ? null : _ack, child: Text(l.diaryAcknowledge)),
          ],
        ),
      ),
    );
  }
}
