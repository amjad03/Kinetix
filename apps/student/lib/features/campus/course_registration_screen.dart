import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/campus_life.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// Course registration: the term's offerings with seats left, register or drop, rank electives
/// for oversubscribed courses, and the student's own registrations with the credit total.
class CourseRegistrationScreen extends StatefulWidget {
  const CourseRegistrationScreen({super.key, required this.api, this.now});

  final StudentApi api;

  /// For tests; defaults to the device clock.
  final DateTime Function()? now;

  static Future<void> open(BuildContext context, StudentApi api) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CourseRegistrationScreen(api: api)));

  @override
  State<CourseRegistrationScreen> createState() => _CourseRegistrationScreenState();
}

class _CourseRegistrationScreenState extends State<CourseRegistrationScreen> {
  List<RegTerm>? _terms;
  RegTerm? _term;
  OfferingList? _offerings;
  MyRegistrations? _mine;
  ApiException? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _loadTerms();
  }

  Future<void> _loadTerms() async {
    setState(() => _error = null);
    try {
      final terms = await widget.api.registrationTerms();
      if (!mounted) return;
      final now = (widget.now ?? DateTime.now)();
      // The term running now, else the latest one.
      final current = terms.where((t) => !now.isBefore(t.startsOn) && !now.isAfter(t.endsOn.add(const Duration(days: 1)))).firstOrNull ?? terms.lastOrNull;
      setState(() {
        _terms = terms;
        _term = current;
      });
      if (current != null) await _load();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _load() async {
    final term = _term;
    if (term == null) return;
    try {
      final r = await Future.wait<Object>([widget.api.courseOfferings(term.id), widget.api.myRegistrations(term.id)]);
      if (mounted) {
        setState(() {
          _offerings = r[0] as OfferingList;
          _mine = r[1] as MyRegistrations;
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  /// Runs a change, tells the student what happened (or why not) and reloads.
  Future<void> _change(Future<void> Function() action, String done) async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      await action();
      messenger.showSnackBar(SnackBar(content: Text(done)));
    } on ApiException catch (e) {
      if (mounted) messenger.showSnackBar(SnackBar(content: Text(context.errorText(e))));
    }
    await _load();
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _drop(CourseOffering o) async {
    final l = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.courseRegDropTitle(o.subjectName)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
          FilledButton(key: const Key('confirmDrop'), onPressed: () => Navigator.pop(ctx, true), child: Text(l.courseRegDrop)),
        ],
      ),
    );
    if (ok == true) await _change(() => widget.api.dropCourse(o.offeringId), l.courseRegDropped);
  }

  Future<void> _rank() async {
    final term = _term;
    final list = _offerings;
    if (term == null || list == null) return;
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _RankSheet(api: widget.api, termId: term.id, electives: [for (final o in list.offerings) if (!o.isCore && !o.registered && o.eligible) o]),
    );
    if (saved == true) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.courseRegRankSaved)));
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final list = _offerings;
    final mine = _mine;
    final now = (widget.now ?? DateTime.now)();
    final open = list?.window?.isOpen(now) ?? false;
    final available = [for (final o in list?.offerings ?? const <CourseOffering>[]) if (!(o.registered && o.isCore)) o];
    return Scaffold(
      appBar: AppBar(title: Text(l.courseRegTitle)),
      body: RefreshIndicator(
        onRefresh: _term == null ? _loadTerms : _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s24),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _term == null ? _loadTerms : _load),
            if (_terms == null && _error == null) const KxLoading(),
            if (_terms != null && _term == null) KxEmptyState(icon: Icons.event_busy_outlined, message: l.courseRegNoTerm),
            if (_term != null && (list == null || mine == null) && _error == null) const KxLoading(),
            if (list != null && mine != null) ...[
              KxCard(
                key: const Key('regSummary'),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_term!.name, style: context.text.titleMedium),
                    const SizedBox(height: Kx.s4),
                    Text(
                      l.courseRegCredits(_n(mine.registeredCredits), _n(mine.maxCredits), _n(mine.minCredits)),
                      key: const Key('regCredits'),
                      style: context.text.bodyLarge,
                    ),
                    const SizedBox(height: Kx.s4),
                    Text(
                      list.window == null || !open ? l.courseRegClosed : l.courseRegAddDropUntil(context.fmt.dateTime(list.window!.addDropUntil)),
                      key: const Key('regWindow'),
                      style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              if (mine.registrations.isNotEmpty) ...[
                KxSectionHeader(l.courseRegMine),
                for (final r in mine.registrations) ...[_MineRow(r), const SizedBox(height: Kx.s8)],
              ],
              KxSectionHeader(l.courseRegAvailable),
              if (open && available.any((o) => !o.isCore && o.eligible && !o.registered))
                Align(
                  alignment: Alignment.centerLeft,
                  child: OutlinedButton.icon(key: const Key('rankElectives'), onPressed: _busy ? null : _rank, icon: const Icon(Icons.format_list_numbered), label: Text(l.courseRegRank)),
                ),
              if (list.offerings.isEmpty) KxEmptyState(icon: Icons.menu_book_outlined, message: l.courseRegNoOfferings),
              for (final o in available) ...[
                _OfferingCard(
                  offering: o,
                  open: open && !_busy,
                  onRegister: () => _change(() => widget.api.registerCourse(o.offeringId), l.courseRegRegisteredNow),
                  onDrop: () => _drop(o),
                ),
                const SizedBox(height: Kx.s12),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

/// 4.0 shows as "4", 3.5 as "3.5".
String _n(double v) => v == v.roundToDouble() ? v.round().toString() : v.toStringAsFixed(1);

class _MineRow extends StatelessWidget {
  const _MineRow(this.r);

  final MyRegistration r;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final (label, tone) = switch (r.status) {
      'registered' => switch (r.approval) {
        'approved' => (l.courseRegApproved, KxTone.success),
        'rejected' => (l.courseRegRejected, KxTone.danger),
        _ => (l.courseRegApprovalPending, KxTone.warning),
      },
      'waitlisted' => (l.courseRegWaitlisted, KxTone.warning),
      'preference' => (l.courseRegRanked('${r.preferenceRank ?? ''}'), KxTone.primary),
      _ => (l.courseRegNotAllotted, KxTone.neutral),
    };
    final t = kxTone(context, tone);
    return KxCard(
      key: Key('mine-${r.offeringId}'),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(r.subjectName, style: context.text.titleSmall),
                Text('${r.subjectCode} · ${l.courseRegCreditsOf(_n(r.credits))}', style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
              ],
            ),
          ),
          const SizedBox(width: Kx.s8),
          Flexible(child: Pill(label, background: t.bg, foreground: t.fg)),
        ],
      ),
    );
  }
}

class _OfferingCard extends StatelessWidget {
  const _OfferingCard({required this.offering, required this.open, required this.onRegister, required this.onDrop});

  final CourseOffering offering;
  final bool open;
  final VoidCallback onRegister;
  final VoidCallback onDrop;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final o = offering;
    final c = context.colors;
    final canRegister = open && o.eligible && !o.registered && o.seatsLeft > 0;
    return KxCard(
      key: Key('offering-${o.offeringId}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(o.subjectName, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
          Text(
            [o.subjectCode, o.isCore ? l.courseRegCore : (o.category == 'elective' ? l.courseRegElective : o.category), l.courseRegCreditsOf(_n(o.credits)), ?o.facultyName].join(' · '),
            style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
          ),
          const SizedBox(height: Kx.s4),
          Text(o.seatsLeft > 0 ? l.courseRegSeatsLeft('${o.seatsLeft}') : l.courseRegFull, style: context.text.bodySmall?.copyWith(color: o.seatsLeft > 0 ? c.onSurfaceVariant : c.error)),
          if (o.blockedText != null && !o.eligible) Text(o.blockedText!, key: Key('blocked-${o.offeringId}'), style: context.text.bodySmall?.copyWith(color: c.error)),
          const SizedBox(height: Kx.s8),
          if (o.registered && !o.isCore)
            OutlinedButton(key: Key('drop-${o.offeringId}'), onPressed: open ? onDrop : null, child: Text(l.courseRegDrop))
          else if (o.registered)
            Pill(l.courseRegRegisteredPill, background: kxTone(context, KxTone.success).bg, foreground: kxTone(context, KxTone.success).fg)
          else if (o.ranked)
            Pill(l.courseRegRanked('${o.myRank ?? ''}'), background: kxTone(context, KxTone.primary).bg, foreground: kxTone(context, KxTone.primary).fg)
          else
            FilledButton(key: Key('register-${o.offeringId}'), onPressed: canRegister ? onRegister : null, child: Text(l.courseRegRegister)),
        ],
      ),
    );
  }
}

/// Tick electives and drag them into order; the first is the most wanted.
class _RankSheet extends StatefulWidget {
  const _RankSheet({required this.api, required this.termId, required this.electives});

  final StudentApi api;
  final String termId;
  final List<CourseOffering> electives;

  @override
  State<_RankSheet> createState() => _RankSheetState();
}

class _RankSheetState extends State<_RankSheet> {
  late final List<CourseOffering> _order = [...widget.electives]..sort((a, b) => (a.myRank ?? 1 << 20).compareTo(b.myRank ?? 1 << 20));
  late final Set<String> _picked = {for (final o in widget.electives) if (o.ranked) o.offeringId};
  bool _saving = false;
  ApiException? _error;

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.api.setCoursePreferences(widget.termId, [for (final o in _order) if (_picked.contains(o.offeringId)) o.offeringId]);
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = e;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.8),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(l.courseRegRank, style: context.text.titleLarge),
              const SizedBox(height: Kx.s4),
              Text(l.courseRegRankHelp, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
              if (_error != null) ErrorBanner(_error!),
              if (_order.isEmpty) KxEmptyState(icon: Icons.format_list_numbered, message: l.courseRegRankNone),
              Flexible(
                child: ReorderableListView(
                  key: const Key('rankList'),
                  shrinkWrap: true,
                  onReorderItem: (from, to) => setState(() => _order.insert(to, _order.removeAt(from))),
                  children: [
                    for (final o in _order)
                      CheckboxListTile(
                        key: Key('rank-${o.offeringId}'),
                        value: _picked.contains(o.offeringId),
                        onChanged: (v) => setState(() => v == true ? _picked.add(o.offeringId) : _picked.remove(o.offeringId)),
                        title: Text(o.subjectName),
                        subtitle: Text(o.subjectCode),
                        controlAffinity: ListTileControlAffinity.leading,
                      ),
                  ],
                ),
              ),
              const SizedBox(height: Kx.s8),
              FilledButton(key: const Key('saveRank'), onPressed: _saving || _order.isEmpty ? null : _save, child: Text(l.courseRegRankSave)),
            ],
          ),
        ),
      ),
    );
  }
}
