import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/scholarships.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// Scholarships: the schemes open for applications, a form to apply (with the family income when a
/// scheme has an income test), and the state of earlier applications.
class ScholarshipScreen extends StatefulWidget {
  const ScholarshipScreen({super.key, required this.api, required this.studentId});

  final StudentApi api;
  final String studentId;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ScholarshipScreen(api: api, studentId: studentId)));

  @override
  State<ScholarshipScreen> createState() => _ScholarshipScreenState();
}

class _ScholarshipScreenState extends State<ScholarshipScreen> {
  List<ScholarshipScheme>? _schemes;
  List<ScholarshipApplication> _apps = const [];
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await Future.wait([widget.api.scholarshipSchemes(), widget.api.scholarshipApplications(widget.studentId)]);
      if (mounted) {
        setState(() {
          _schemes = r[0] as List<ScholarshipScheme>;
          _apps = r[1] as List<ScholarshipApplication>;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _apply(ScholarshipScheme s) async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _ApplySheet(api: widget.api, studentId: widget.studentId, scheme: s),
    );
    if (sent == true) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.scholarshipSentSnack)));
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final schemes = _schemes;
    return Scaffold(
      appBar: AppBar(title: Text(l.scholarshipTitle)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (schemes == null && _error == null) const KxLoading(),
            if (schemes != null && schemes.isEmpty) KxEmptyState(icon: Icons.workspace_premium_outlined, message: l.scholarshipNone),
            if (schemes != null)
              for (final s in schemes) ...[
                KxCard(
                  key: Key('scheme-${s.id}'),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(s.name, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
                      Text(s.percent ? l.scholarshipPercentOff(s.value) : l.scholarshipAmountOff(Fmt.rupees(s.value)), style: context.text.bodyMedium),
                      if (s.minPercentage != null) Text(l.scholarshipMinMarks(s.minPercentage!.round()), style: context.text.bodySmall),
                      if (s.maxIncomePaise != null) Text(l.scholarshipMaxIncome(Fmt.rupees(s.maxIncomePaise!)), style: context.text.bodySmall),
                      const SizedBox(height: Kx.s8),
                      FilledButton(key: Key('apply-${s.id}'), onPressed: () => _apply(s), child: Text(l.scholarshipApply)),
                    ],
                  ),
                ),
                const SizedBox(height: Kx.s12),
              ],
            if (_apps.isNotEmpty) KxSectionHeader(l.scholarshipMine),
            for (final a in _apps) ...[_AppCard(app: a), const SizedBox(height: Kx.s12)],
          ],
        ),
      ),
    );
  }
}

class _AppCard extends StatelessWidget {
  const _AppCard({required this.app});

  final ScholarshipApplication app;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final (label, tone) = switch (app.status) {
      ScholarshipStatus.pending => (l.leaveStatusPending, KxTone.warning),
      ScholarshipStatus.approved => (l.leaveStatusApproved, KxTone.success),
      ScholarshipStatus.rejected => (l.leaveStatusRejected, KxTone.danger),
      ScholarshipStatus.cancelled => (l.leaveStatusCancelled, KxTone.neutral),
    };
    final t = kxTone(context, tone);
    return KxCard(
      key: Key('application-${app.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [Expanded(child: Text(app.scheme, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600))), Pill(label, background: t.bg, foreground: t.fg)]),
          if (app.status == ScholarshipStatus.approved && app.awardedPaise > 0) Text(l.scholarshipAwarded(Fmt.rupees(app.awardedPaise)), style: context.text.bodyMedium),
          if (app.decisionNote != null && app.decisionNote!.isNotEmpty) Text(app.decisionNote!, style: context.text.bodySmall),
        ],
      ),
    );
  }
}

class _ApplySheet extends StatefulWidget {
  const _ApplySheet({required this.api, required this.studentId, required this.scheme});

  final StudentApi api;
  final String studentId;
  final ScholarshipScheme scheme;

  @override
  State<_ApplySheet> createState() => _ApplySheetState();
}

class _ApplySheetState extends State<_ApplySheet> {
  final _income = TextEditingController();
  final _note = TextEditingController();
  String? _problem;
  bool _busy = false;

  @override
  void dispose() {
    _income.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final l = context.l10n;
    final needsIncome = widget.scheme.maxIncomePaise != null;
    final rupees = int.tryParse(_income.text.trim());
    if (needsIncome && (rupees == null || rupees < 0)) return setState(() => _problem = l.scholarshipIncomeRequired);
    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      await widget.api.applyScholarship(widget.studentId, schemeId: widget.scheme.id, incomePaise: needsIncome ? rupees! * 100 : null, note: _note.text.trim());
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _problem = context.errorText(e);
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
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.scheme.name, style: context.text.titleLarge),
            const SizedBox(height: Kx.s16),
            if (widget.scheme.maxIncomePaise != null) ...[
              TextField(key: const Key('scholarshipIncome'), controller: _income, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l.scholarshipIncomeLabel)),
              const SizedBox(height: Kx.s12),
            ],
            TextField(key: const Key('scholarshipNote'), controller: _note, maxLines: 3, maxLength: 500, decoration: InputDecoration(labelText: l.scholarshipNoteLabel)),
            if (_problem != null) Padding(padding: const EdgeInsets.only(bottom: Kx.s8), child: ErrorBanner(_problem!)),
            const SizedBox(height: Kx.s8),
            SizedBox(width: double.infinity, child: FilledButton(key: const Key('sendScholarship'), onPressed: _busy ? null : _send, style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)), child: Text(l.scholarshipSend))),
          ],
        ),
      ),
    );
  }
}
