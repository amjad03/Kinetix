import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/campus.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// The grievances this person raised, a form to raise one (with the anonymous option), and the
/// satisfaction rating once one is resolved. Student and Parent apps share it: the parent's
/// callbacks add the child's id.
class GrievancesScreen extends StatefulWidget {
  const GrievancesScreen({super.key, required this.load, required this.raise, required this.rate});

  final Future<List<GrievanceTicket>> Function() load;
  final Future<GrievanceTicket> Function({required String category, required String subject, required String description, required bool anonymous}) raise;
  final Future<void> Function(String id, int rating) rate;

  static Future<void> open(
    BuildContext context, {
    required Future<List<GrievanceTicket>> Function() load,
    required Future<GrievanceTicket> Function({required String category, required String subject, required String description, required bool anonymous}) raise,
    required Future<void> Function(String id, int rating) rate,
  }) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => GrievancesScreen(load: load, raise: raise, rate: rate)));

  @override
  State<GrievancesScreen> createState() => _GrievancesScreenState();
}

class _GrievancesScreenState extends State<GrievancesScreen> {
  List<GrievanceTicket>? _tickets;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    try {
      final t = await widget.load();
      if (mounted) {
        setState(() {
          _tickets = t;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  void _say(String text) => ScaffoldMessenger.of(context)..hideCurrentSnackBar()..showSnackBar(SnackBar(content: Text(text)));

  Future<void> _rate(GrievanceTicket t, int stars) async {
    try {
      await widget.rate(t.id, stars);
      if (mounted) _say(context.l10n.grievanceRated);
      await _reload();
    } catch (e) {
      if (mounted) _say(context.errorText(e));
    }
  }

  Future<void> _compose() async {
    final made = await showModalBottomSheet<GrievanceTicket>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _Composer(raise: widget.raise),
    );
    if (made != null && mounted) {
      _say(context.l10n.grievanceRecorded(made.ticketNo));
      await _reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final tickets = _tickets;
    return Scaffold(
      appBar: AppBar(title: Text(l.grievancesTitle)),
      floatingActionButton: FloatingActionButton.extended(key: const Key('raiseGrievance'), onPressed: _compose, icon: const Icon(Icons.add), label: Text(l.grievanceRaise)),
      body: tickets == null
          ? (_error == null
                ? const Center(child: CircularProgressIndicator())
                : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner(_error!, onRetry: _reload)))
          : RefreshIndicator(
              onRefresh: _reload,
              child: LayoutBuilder(
                builder: (context, box) => ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: EdgeInsets.fromLTRB(sideGutter(box.maxWidth), Kx.s8, sideGutter(box.maxWidth), 96),
                  children: [
                    if (tickets.isEmpty) Padding(padding: const EdgeInsets.only(top: Kx.s16), child: Text(l.grievanceNone, style: context.text.bodyLarge?.copyWith(color: context.colors.onSurfaceVariant))),
                    for (final t in tickets) _ticket(context, t),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _ticket(BuildContext context, GrievanceTicket t) {
    final l = context.l10n;
    final c = context.colors;
    return Card(
      key: Key('ticket-${t.id}'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${t.ticketNo} · ${t.subject}', style: context.text.titleSmall),
            const SizedBox(height: Kx.s4),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s4,
              children: [
                Pill(_statusLabel(l, t.status), background: Theme.of(context).colorScheme.secondaryContainer, foreground: Theme.of(context).colorScheme.onSecondaryContainer),
                Pill(_categoryLabel(l, t.category), background: Theme.of(context).colorScheme.secondaryContainer, foreground: Theme.of(context).colorScheme.onSecondaryContainer),
                if (t.anonymous) Pill(l.grievanceAnonymousTag, icon: Icons.visibility_off_outlined, background: Theme.of(context).colorScheme.secondaryContainer, foreground: Theme.of(context).colorScheme.onSecondaryContainer),
              ],
            ),
            if (t.open) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.grievanceDue(context.fmt.shortDay(t.slaDueAt)), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant))),
            if (t.resolution != null) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text('${l.grievanceResolution}: ${t.resolution}', style: context.text.bodyMedium)),
            if (t.canRate) ...[
              const SizedBox(height: Kx.s8),
              Text(l.grievanceRate, style: context.text.bodyMedium),
              Row(children: [for (var s = 1; s <= 5; s++) IconButton(key: Key('rate-${t.id}-$s'), tooltip: '$s', icon: const Icon(Icons.star_border), onPressed: () => _rate(t, s))]),
            ],
          ],
        ),
      ),
    );
  }
}

class _Composer extends StatefulWidget {
  const _Composer({required this.raise});

  final Future<GrievanceTicket> Function({required String category, required String subject, required String description, required bool anonymous}) raise;

  @override
  State<_Composer> createState() => _ComposerState();
}

class _ComposerState extends State<_Composer> {
  final _subject = TextEditingController();
  final _text = TextEditingController();
  String _category = 'academic';
  bool _anonymous = false;
  bool _sending = false;
  String? _problem;

  @override
  void dispose() {
    _subject.dispose();
    _text.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _sending = true;
      _problem = null;
    });
    try {
      final t = await widget.raise(category: _category, subject: _subject.text.trim(), description: _text.text.trim(), anonymous: _anonymous);
      if (mounted) Navigator.of(context).pop(t);
    } catch (e) {
      if (mounted) {
        setState(() {
          _sending = false;
          _problem = context.errorText(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final ready = _subject.text.trim().length >= 3 && _text.text.trim().length >= 10 && !_sending;
    return Padding(
      padding: EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, MediaQuery.of(context).viewInsets.bottom + Kx.s16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l.grievanceRaise, style: context.text.titleLarge),
            const SizedBox(height: Kx.s12),
            DropdownButtonFormField<String>(
              key: const Key('grievanceCategory'),
              initialValue: _category,
              decoration: InputDecoration(labelText: l.grievanceCategory),
              items: [for (final c in grievanceCategories) DropdownMenuItem(value: c, child: Text(_categoryLabel(l, c)))],
              onChanged: (v) => setState(() => _category = v ?? _category),
            ),
            if (confidentialCategories.contains(_category)) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.grievanceConfidentialHint, key: const Key('confidentialHint'), style: context.text.bodySmall)),
            const SizedBox(height: Kx.s12),
            TextField(key: const Key('grievanceSubject'), controller: _subject, maxLength: 200, decoration: InputDecoration(labelText: l.grievanceSubject), onChanged: (_) => setState(() {})),
            TextField(key: const Key('grievanceText'), controller: _text, minLines: 3, maxLines: 6, maxLength: 5000, decoration: InputDecoration(labelText: l.grievanceDescription), onChanged: (_) => setState(() {})),
            SwitchListTile(
              key: const Key('grievanceAnonymous'),
              contentPadding: EdgeInsets.zero,
              title: Text(l.grievanceAnonymous),
              subtitle: Text(l.grievanceAnonymousHint),
              value: _anonymous,
              onChanged: (v) => setState(() => _anonymous = v),
            ),
            if (_problem != null) Padding(padding: const EdgeInsets.only(bottom: Kx.s8), child: Text(_problem!, style: TextStyle(color: context.colors.error))),
            FilledButton(key: const Key('grievanceSubmit'), onPressed: ready ? _send : null, child: Text(l.grievanceSubmit)),
          ],
        ),
      ),
    );
  }
}

String _statusLabel(AppLocalizations l, String s) => switch (s) {
  'assigned' => l.grievanceStatus_assigned,
  'in_progress' => l.grievanceStatus_in_progress,
  'escalated' => l.grievanceStatus_escalated,
  'resolved' => l.grievanceStatus_resolved,
  'closed' => l.grievanceStatus_closed,
  'reopened' => l.grievanceStatus_reopened,
  _ => l.grievanceStatus_open,
};

String _categoryLabel(AppLocalizations l, String s) => switch (s) {
  'exam' => l.grievanceCat_exam,
  'fees' => l.grievanceCat_fees,
  'hostel' => l.grievanceCat_hostel,
  'transport' => l.grievanceCat_transport,
  'infrastructure' => l.grievanceCat_infrastructure,
  'staff_conduct' => l.grievanceCat_staff_conduct,
  'ragging' => l.grievanceCat_ragging,
  'harassment' => l.grievanceCat_harassment,
  'other' => l.grievanceCat_other,
  _ => l.grievanceCat_academic,
};
