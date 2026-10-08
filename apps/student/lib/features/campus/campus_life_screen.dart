import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/campus_life.dart';
import '../../core/format.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// Clubs (join or leave), events (register, cancel, waitlist) and the student's passes: each
/// registration shows its code to present at the door and, once attended, asks for feedback.
class CampusLifeScreen extends StatefulWidget {
  const CampusLifeScreen({super.key, required this.api, required this.studentId});

  final StudentApi api;
  final String studentId;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CampusLifeScreen(api: api, studentId: studentId)));

  @override
  State<CampusLifeScreen> createState() => _CampusLifeScreenState();
}

class _CampusLifeScreenState extends State<CampusLifeScreen> {
  List<MyClub>? _clubs;
  List<CampusEvent>? _events;
  List<MyEventRegistration>? _passes;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await Future.wait<Object>([widget.api.myClubs(widget.studentId), widget.api.campusEvents(widget.studentId), widget.api.myEventRegistrations(widget.studentId)]);
      if (mounted) {
        setState(() {
          _clubs = r[0] as List<MyClub>;
          _events = r[1] as List<CampusEvent>;
          _passes = r[2] as List<MyEventRegistration>;
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  /// Runs a change, says why when it fails, and reloads.
  Future<void> _act(Future<void> Function() action, {String? done}) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await action();
      if (done != null) messenger.showSnackBar(SnackBar(content: Text(done)));
    } on ApiException catch (e) {
      if (mounted) messenger.showSnackBar(SnackBar(content: Text(context.errorText(e))));
    }
    await _load();
  }

  Future<void> _feedback(MyEventRegistration r) async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _FeedbackSheet(api: widget.api, studentId: widget.studentId, registration: r),
    );
    if (sent == true) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.passFeedbackThanks)));
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final loading = _error == null && (_clubs == null || _events == null || _passes == null);
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l.campusLifeTitle),
          bottom: TabBar(tabs: [Tab(text: l.campusTabClubs), Tab(text: l.campusTabEvents), Tab(text: l.campusTabPasses)]),
        ),
        body: _error != null
            ? ListView(padding: const EdgeInsets.all(Kx.s16), children: [ErrorBanner(_error!, onRetry: _load)])
            : loading
            ? const KxLoading()
            : TabBarView(children: [_tab(_clubsList(context)), _tab(_eventsList(context)), _tab(_passesList(context))]),
      ),
    );
  }

  Widget _tab(List<Widget> children) => RefreshIndicator(
    onRefresh: _load,
    child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s12, Kx.s16, Kx.s24), children: children),
  );

  List<Widget> _clubsList(BuildContext context) {
    final l = context.l10n;
    final clubs = _clubs!;
    if (clubs.isEmpty) return [KxEmptyState(icon: Icons.groups_outlined, message: l.clubsNone)];
    return [
      for (final c in clubs) ...[
        KxCard(
          key: Key('club-${c.id}'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(c.name, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
              if (c.category.isNotEmpty) Text(c.category, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
              if (c.description.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(c.description, style: context.text.bodyMedium)),
              const SizedBox(height: Kx.s8),
              Row(
                children: [
                  if (c.member) Pill(l.clubMember, background: kxTone(context, KxTone.success).bg, foreground: kxTone(context, KxTone.success).fg),
                  if (c.requested) Flexible(child: Pill(l.clubRequested, background: kxTone(context, KxTone.warning).bg, foreground: kxTone(context, KxTone.warning).fg)),
                  if (c.member && c.points > 0) Padding(padding: const EdgeInsets.only(left: Kx.s8), child: Text(l.clubPoints('${c.points}'), style: context.text.bodySmall)),
                  const Spacer(),
                  if (c.member || c.requested)
                    TextButton(key: Key('leave-${c.id}'), onPressed: () => _act(() => widget.api.leaveClub(widget.studentId, c.id)), child: Text(l.clubLeave))
                  else
                    FilledButton(key: Key('join-${c.id}'), onPressed: () => _act(() => widget.api.joinClub(widget.studentId, c.id), done: l.clubJoinSent), child: Text(l.clubJoin)),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: Kx.s12),
      ],
    ];
  }

  List<Widget> _eventsList(BuildContext context) {
    final l = context.l10n;
    final events = _events!;
    if (events.isEmpty) return [KxEmptyState(icon: Icons.event_outlined, message: l.eventsNone)];
    return [
      for (final e in events) ...[
        KxCard(
          key: Key('event-${e.id}'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(e.title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
              Text([context.fmt.dateTime(e.startsAt), if (e.venue.isNotEmpty) e.venue].join(' · '), style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
              if (e.description.isNotEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(e.description, style: context.text.bodyMedium)),
              const SizedBox(height: Kx.s4),
              Text(
                [e.feePaise > 0 ? l.eventFee(Fmt.rupees(e.feePaise)) : l.eventFree, l.eventSeatsLeft('${e.seatsLeft}')].join(' · '),
                style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant),
              ),
              const SizedBox(height: Kx.s8),
              Row(
                children: [
                  if (e.seat != null)
                    Flexible(
                      child: Pill(
                        e.seat!.status == 'waitlisted' ? l.eventWaitlistedPill : l.eventRegisteredPill,
                        background: kxTone(context, e.seat!.status == 'waitlisted' ? KxTone.warning : KxTone.success).bg,
                        foreground: kxTone(context, e.seat!.status == 'waitlisted' ? KxTone.warning : KxTone.success).fg,
                      ),
                    ),
                  const Spacer(),
                  if (e.seat != null)
                    TextButton(key: Key('cancel-${e.id}'), onPressed: () => _act(() => widget.api.cancelEventRegistration(widget.studentId, e.id)), child: Text(l.eventCancelRegistration))
                  else
                    FilledButton(key: Key('register-${e.id}'), onPressed: () => _act(() => widget.api.registerForEvent(widget.studentId, e.id)), child: Text(e.seatsLeft > 0 ? l.eventRegister : l.eventJoinWaitlist)),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: Kx.s12),
      ],
    ];
  }

  List<Widget> _passesList(BuildContext context) {
    final l = context.l10n;
    final passes = _passes!;
    if (passes.isEmpty) return [KxEmptyState(icon: Icons.confirmation_number_outlined, message: l.passNone)];
    return [
      for (final r in passes) ...[
        KxCard(
          key: Key('pass-${r.id}'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(r.title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
              Text([context.fmt.dateTime(r.startsAt), if (r.venue.isNotEmpty) r.venue].join(' · '), style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
              const SizedBox(height: Kx.s8),
              if (r.status == 'waitlisted')
                Pill(l.eventWaitlistedPill, background: kxTone(context, KxTone.warning).bg, foreground: kxTone(context, KxTone.warning).fg)
              else if (r.checkedIn)
                Pill(l.passCheckedIn, icon: Icons.check, background: kxTone(context, KxTone.success).bg, foreground: kxTone(context, KxTone.success).fg)
              else ...[
                Text(l.passShowAtDoor, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
                const SizedBox(height: Kx.s4),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(Kx.s12),
                  decoration: BoxDecoration(color: context.colors.surfaceContainerHighest, borderRadius: Kx.radiusMd),
                  child: SelectableText(r.qrToken, key: Key('token-${r.id}'), textAlign: TextAlign.center, style: context.text.titleMedium?.copyWith(fontFamily: 'monospace', letterSpacing: 1.5)),
                ),
              ],
              if (r.canGiveFeedback) ...[
                const SizedBox(height: Kx.s8),
                OutlinedButton.icon(key: Key('feedback-${r.id}'), onPressed: () => _feedback(r), icon: const Icon(Icons.rate_review_outlined), label: Text(l.passFeedback)),
              ] else if (r.feedbackGiven)
                Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.passFeedbackDone, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant))),
            ],
          ),
        ),
        const SizedBox(height: Kx.s12),
      ],
    ];
  }
}

/// A 1-5 rating and an optional comment for an event the student attended.
class _FeedbackSheet extends StatefulWidget {
  const _FeedbackSheet({required this.api, required this.studentId, required this.registration});

  final StudentApi api;
  final String studentId;
  final MyEventRegistration registration;

  @override
  State<_FeedbackSheet> createState() => _FeedbackSheetState();
}

class _FeedbackSheetState extends State<_FeedbackSheet> {
  final _comment = TextEditingController();
  int _rating = 0;
  bool _sending = false;
  ApiException? _error;

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
      await widget.api.giveEventFeedback(widget.studentId, widget.registration.eventId, rating: _rating, comment: _comment.text.trim());
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _sending = false;
          _error = e;
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
            Text(widget.registration.title, style: context.text.bodyMedium),
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
