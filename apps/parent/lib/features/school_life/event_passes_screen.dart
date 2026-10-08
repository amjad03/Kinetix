import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../core/school_life.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'load_view.dart';

/// The child's event passes: a QR code to show at the door, and feedback once checked in.
class EventPassesScreen extends StatefulWidget {
  const EventPassesScreen({super.key, required this.api, required this.child});

  final ParentApi api;
  final Child child;

  @override
  State<EventPassesScreen> createState() => _EventPassesScreenState();
}

class _EventPassesScreenState extends State<EventPassesScreen> {
  int _version = 0;

  Future<void> _feedback(EventPass pass) async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _FeedbackSheet(api: widget.api, childId: widget.child.id, pass: pass),
    );
    if (sent == true && mounted) {
      say(context, context.l10n.passFeedbackThanks);
      setState(() => _version++);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final scheme = Theme.of(context).colorScheme;
    return LoadView<List<EventPass>>(
      key: ValueKey(_version),
      title: l.passesTitle(widget.child.firstName),
      load: () => widget.api.eventPasses(widget.child.id),
      builder: (context, passes, reload) => [
        if (passes.isEmpty) EmptyNote(l.passesNone),
        for (final p in passes)
          Card(
            key: Key('pass-${p.id}'),
            child: Padding(
              padding: const EdgeInsets.all(Kx.s16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(p.title, style: context.text.titleSmall),
                  Text('${context.fmt.dateTime(p.startsAt)}${p.venue.isEmpty ? '' : ' · ${p.venue}'}', style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
                  const SizedBox(height: Kx.s8),
                  if (p.status == 'waitlisted')
                    Pill(l.eventWaitlisted, icon: Icons.hourglass_empty, background: scheme.secondaryContainer, foreground: scheme.onSecondaryContainer)
                  else if (p.checkedIn)
                    Pill(l.passCheckedIn, icon: Icons.check, background: scheme.secondaryContainer, foreground: scheme.onSecondaryContainer)
                  else ...[
                    Text(l.passShowAtDoor, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
                    const SizedBox(height: Kx.s8),
                    Center(
                      child: Container(
                        key: Key('qr-${p.id}'),
                        color: Colors.white,
                        padding: const EdgeInsets.all(Kx.s8),
                        child: QrImageView(data: p.qrToken, size: 160, backgroundColor: Colors.white),
                      ),
                    ),
                    Center(child: SelectableText(p.qrToken, key: Key('token-${p.id}'), style: context.text.bodySmall?.copyWith(fontFamily: 'monospace'))),
                  ],
                  if (p.canGiveFeedback) ...[
                    const SizedBox(height: Kx.s8),
                    OutlinedButton.icon(key: Key('feedback-${p.id}'), onPressed: () => _feedback(p), icon: const Icon(Icons.rate_review_outlined), label: Text(l.passFeedback)),
                  ] else if (p.feedbackGiven)
                    Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.passFeedbackDone, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant))),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// A 1-5 rating and an optional comment for an event the child attended.
class _FeedbackSheet extends StatefulWidget {
  const _FeedbackSheet({required this.api, required this.childId, required this.pass});

  final ParentApi api;
  final String childId;
  final EventPass pass;

  @override
  State<_FeedbackSheet> createState() => _FeedbackSheetState();
}

class _FeedbackSheetState extends State<_FeedbackSheet> {
  final _comment = TextEditingController();
  int _rating = 0;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await widget.api.giveEventFeedback(widget.pass.eventId, widget.childId, rating: _rating, comment: _comment.text.trim());
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _sending = false;
          _error = context.errorText(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Padding(
      padding: EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, MediaQuery.viewInsetsOf(context).bottom + Kx.s16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l.passFeedbackTitle, style: context.text.titleLarge),
            Text(widget.pass.title, style: context.text.bodyMedium),
            const SizedBox(height: Kx.s12),
            Wrap(
              spacing: Kx.s8,
              children: [for (var i = 1; i <= 5; i++) ChoiceChip(key: Key('star-$i'), label: Text('$i'), selected: _rating == i, onSelected: (_) => setState(() => _rating = i))],
            ),
            const SizedBox(height: Kx.s12),
            TextField(key: const Key('feedbackComment'), controller: _comment, maxLines: 3, maxLength: 2000, decoration: InputDecoration(labelText: l.passFeedbackComment)),
            if (_error != null) ErrorBanner(_error!),
            FilledButton(key: const Key('sendFeedback'), onPressed: _rating == 0 || _sending ? null : _send, child: Text(l.passFeedbackSend)),
          ],
        ),
      ),
    );
  }
}
