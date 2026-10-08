import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/school_life.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'load_view.dart';

/// Campus events open to the child: register (or join the waitlist when full) and cancel.
class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key, required this.api, required this.child});

  final ParentApi api;
  final Child child;

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  int _version = 0;
  bool _busy = false;

  Future<void> _run(Future<void> Function() action, String done) async {
    setState(() => _busy = true);
    try {
      await action();
      if (mounted) say(context, done);
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

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final scheme = Theme.of(context).colorScheme;
    return LoadView<List<CampusEvent>>(
      key: ValueKey(_version),
      title: l.eventsTitle(widget.child.firstName),
      load: () => widget.api.campusEvents(widget.child.id),
      builder: (context, events, reload) => [
        if (events.isEmpty) EmptyNote(l.eventsNone),
        for (final e in events)
          Card(
            key: Key('event-${e.id}'),
            child: Padding(
              padding: const EdgeInsets.all(Kx.s16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(e.title, style: context.text.titleSmall),
                  Text('${context.fmt.dateTime(e.startsAt)}${e.venue.isEmpty ? '' : ' · ${e.venue}'}', style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
                  if (e.description.isNotEmpty) Text(e.description, style: context.text.bodyMedium),
                  Text(
                    [if (e.feePaise > 0) l.eventFee(Fmt.rupees(e.feePaise)), l.eventSeatsLeft(e.seatsLeft)].join(' · '),
                    style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant),
                  ),
                  const SizedBox(height: Kx.s8),
                  if (e.registered) ...[
                    Pill(e.registrationStatus == 'waitlisted' ? l.eventWaitlisted : l.eventRegistered, icon: Icons.check_circle_outline, background: scheme.secondaryContainer, foreground: scheme.onSecondaryContainer),
                    TextButton(key: Key('unregister-${e.id}'), onPressed: _busy ? null : () => _run(() => widget.api.cancelEventRegistration(e.id, widget.child.id), l.eventCancelled), child: Text(l.eventCancelRegistration)),
                  ] else
                    FilledButton.tonal(
                      key: Key('register-${e.id}'),
                      onPressed: _busy ? null : () => _run(() => widget.api.registerForEvent(e.id, widget.child.id), e.seatsLeft > 0 ? l.eventRegisteredDone : l.eventWaitlistDone),
                      child: Text(e.seatsLeft > 0 ? l.eventRegister : l.eventJoinWaitlist),
                    ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
