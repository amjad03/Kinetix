import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../core/school_life.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'load_view.dart';

/// Parent-teacher meetings: pick a meeting, then book, cancel or move a slot with each teacher.
class PtmScreen extends StatelessWidget {
  const PtmScreen({super.key, required this.api, required this.child});

  final ParentApi api;
  final Child child;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadView<(List<PtmEvent>, List<PtmBooking>)>(
      title: l.ptmTitle,
      load: () => (api.ptmEvents(), api.ptmBookings()).wait,
      builder: (context, data, reload) => [
        if (data.$2.isNotEmpty) ...[
          Heading(l.ptmMyBookings),
          for (final b in data.$2)
            Card(
              key: Key('booking-${b.slot.id}'),
              child: ListTile(
                title: Text('${b.slot.teacher} · ${context.fmt.time(b.slot.startsAt)}'),
                subtitle: Text('${b.student} · ${context.fmt.longDay(b.slot.startsAt)} · ${b.event}'),
              ),
            ),
          Heading(l.ptmMeetings),
        ],
        if (data.$1.isEmpty) EmptyNote(l.ptmNone),
        for (final e in data.$1)
          Card(
            key: Key('ptm-${e.id}'),
            child: ListTile(
              title: Text(e.title),
              subtitle: Text([context.fmt.longDay(e.date), if (e.location.isNotEmpty) e.location].join(' · ')),
              trailing: e.open ? const Icon(Icons.chevron_right) : Pill(l.ptmClosed, background: Theme.of(context).colorScheme.surfaceContainerHighest, foreground: context.colors.onSurfaceVariant),
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => PtmSlotsScreen(api: api, child: child, event: e))),
            ),
          ),
      ],
    );
  }
}

/// A meeting's slots for one child, grouped by teacher.
class PtmSlotsScreen extends StatefulWidget {
  const PtmSlotsScreen({super.key, required this.api, required this.child, required this.event});

  final ParentApi api;
  final Child child;
  final PtmEvent event;

  @override
  State<PtmSlotsScreen> createState() => _PtmSlotsScreenState();
}

class _PtmSlotsScreenState extends State<PtmSlotsScreen> {
  int _version = 0;
  bool _busy = false;

  Future<void> _run(Future<void> Function() action, String done) async {
    setState(() => _busy = true);
    try {
      await action();
      if (!mounted) return;
      say(context, done);
    } catch (e) {
      if (mounted) say(context, context.errorText(e));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _version++;
        });
      }
    }
  }

  Future<void> _cancel(PtmSlot s) async {
    final l = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.ptmCancelAsk),
        content: Text('${s.teacher} · ${context.fmt.time(s.startsAt)}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.ptmKeep)),
          FilledButton(key: const Key('ptmCancelConfirm'), onPressed: () => Navigator.pop(ctx, true), child: Text(l.ptmCancelBooking)),
        ],
      ),
    );
    if (ok == true) await _run(() => widget.api.ptmCancel(s.id), l.ptmCancelled);
  }

  Future<void> _move(PtmSlot s, List<PtmSlot> free) async {
    final l = context.l10n;
    final to = await showModalBottomSheet<PtmSlot>(
      context: context,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            Padding(padding: const EdgeInsets.all(Kx.s16), child: Text(l.ptmChooseNew, style: context.text.titleMedium)),
            for (final f in free) ListTile(key: Key('moveTo-${f.id}'), title: Text(_range(f)), onTap: () => Navigator.pop(ctx, f)),
          ],
        ),
      ),
    );
    if (to != null) await _run(() => widget.api.ptmReschedule(s.id, to.id), l.ptmMoved);
  }

  String _range(PtmSlot s) => '${context.fmt.time(s.startsAt)} – ${context.fmt.time(s.endsAt)}';

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return LoadView<List<PtmSlot>>(
      key: ValueKey(_version),
      title: widget.event.title,
      load: () => widget.api.ptmSlots(widget.event.id, widget.child.id),
      builder: (context, slots, reload) {
        final byTeacher = <String, List<PtmSlot>>{};
        for (final s in slots) {
          byTeacher.putIfAbsent(s.teacherId, () => []).add(s);
        }
        return [
          Text(context.fmt.longDay(widget.event.date), style: context.text.titleSmall),
          if (!widget.event.open) EmptyNote(l.ptmClosed),
          if (slots.isEmpty) EmptyNote(l.ptmNoSlots(widget.child.firstName)),
          for (final group in byTeacher.values) ...[
            Heading(group.first.teacher),
            for (final s in group)
              Card(
                key: Key('slot-${s.id}'),
                child: ListTile(
                  title: Text(_range(s)),
                  subtitle: s.mine ? Text(l.ptmYourBooking, style: TextStyle(color: context.colors.primary)) : null,
                  trailing: !widget.event.open
                      ? null
                      : s.mine
                      ? Wrap(
                          children: [
                            if (group.any((x) => !x.mine)) IconButton(key: Key('move-${s.id}'), tooltip: l.ptmReschedule, onPressed: _busy ? null : () => _move(s, [for (final x in group) if (!x.mine) x]), icon: const Icon(Icons.edit_calendar_outlined)),
                            IconButton(key: Key('cancel-${s.id}'), tooltip: l.ptmCancelBooking, onPressed: _busy ? null : () => _cancel(s), icon: const Icon(Icons.event_busy_outlined)),
                          ],
                        )
                      : group.any((x) => x.mine)
                      ? null
                      : FilledButton.tonal(key: Key('book-${s.id}'), onPressed: _busy ? null : () => _run(() => widget.api.ptmBook(s.id, widget.child.id), l.ptmBooked), child: Text(l.ptmBook)),
                ),
              ),
          ],
        ];
      },
    );
  }
}
