import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/exam_applications.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// Examination applications: the papers of each open session with whether the student may write them and why not,
/// the backlog and improvement papers to choose, the fee, and the application once submitted (number, fee, invoice).
class ExamApplicationsScreen extends StatefulWidget {
  const ExamApplicationsScreen({super.key, required this.api, required this.studentId});

  final StudentApi api;
  final String studentId;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ExamApplicationsScreen(api: api, studentId: studentId)));

  @override
  State<ExamApplicationsScreen> createState() => _ExamApplicationsScreenState();
}

class _ExamApplicationsScreenState extends State<ExamApplicationsScreen> {
  List<ExamApplication>? _apps;
  ApiException? _error;
  final Map<String, Set<String>> _chosen = {};
  String? _busy;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final apps = await widget.api.examApplications(widget.studentId);
      if (!mounted) return;
      setState(() {
        _apps = apps;
        for (final a in apps) {
          _chosen[a.sessionId] = {for (final s in a.subjects) if (s.optional && s.chosen) s.subjectId};
        }
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _submit(ExamApplication a) async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = a.sessionId);
    try {
      await widget.api.submitExamApplication(a.sessionId, widget.studentId, (_chosen[a.sessionId] ?? {}).toList());
      messenger.showSnackBar(SnackBar(content: Text(l.examAppSent)));
      await _load();
    } on ApiException catch (e) {
      if (mounted) messenger.showSnackBar(SnackBar(content: Text(context.errorText(e))));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final apps = _apps;
    return Scaffold(
      appBar: AppBar(title: Text(l.examAppTitle)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (apps == null && _error == null) const KxLoading(),
            if (apps != null && apps.isEmpty) KxCard(child: Text(l.examAppNone, key: const Key('noApplications'), style: context.text.bodyLarge)),
            for (final a in apps ?? const <ExamApplication>[]) ...[
              _ApplicationCard(
                app: a,
                chosen: _chosen[a.sessionId] ?? {},
                busy: _busy == a.sessionId,
                onToggle: (id, on) => setState(() {
                  final set = _chosen.putIfAbsent(a.sessionId, () => {});
                  on ? set.add(id) : set.remove(id);
                }),
                onSubmit: () => _submit(a),
              ),
              const SizedBox(height: Kx.s12),
            ],
          ],
        ),
      ),
    );
  }
}

class _ApplicationCard extends StatelessWidget {
  const _ApplicationCard({required this.app, required this.chosen, required this.busy, required this.onToggle, required this.onSubmit});

  final ExamApplication app;
  final Set<String> chosen;
  final bool busy;
  final void Function(String subjectId, bool on) onToggle;
  final VoidCallback onSubmit;

  String _state(BuildContext context) {
    final l = context.l10n;
    return switch (app.windowState) {
      'open' => l.examAppStateOpen,
      'late' => l.examAppStateLate,
      'upcoming' => l.examAppStateUpcoming,
      _ => l.examAppStateClosed,
    };
  }

  String _kind(BuildContext context, String kind) {
    final l = context.l10n;
    return switch (kind) {
      'backlog' => l.examAppKindBacklog,
      'improvement' => l.examAppKindImprovement,
      _ => l.examAppKindRegular,
    };
  }

  String _fee(BuildContext context, String? status) {
    final l = context.l10n;
    return switch (status) {
      'paid' => l.examAppFeePaid,
      'waived' => l.examAppFeeWaived,
      _ => l.examAppFeeDue,
    };
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final good = kxTone(context, KxTone.success);
    final bad = kxTone(context, KxTone.danger);
    final warn = kxTone(context, KxTone.warning);
    final editable = app.canSubmit && (app.feeStatus == null || app.feeStatus == 'due');
    return KxCard(
      key: Key('application-${app.sessionId}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(app.sessionName, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: Kx.s4),
          Wrap(
            spacing: Kx.s8,
            runSpacing: Kx.s4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Pill(_state(context), background: warn.bg, foreground: warn.fg),
              if (app.closesOn != null) Text(l.examAppCloses(app.closesOn!), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
            ],
          ),
          if (app.submitted) ...[
            const SizedBox(height: Kx.s8),
            Wrap(
              spacing: Kx.s8,
              runSpacing: Kx.s4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                if (app.applicationNo != null) Text(l.examAppNo(app.applicationNo!), key: Key('appNo-${app.sessionId}'), style: context.text.labelLarge),
                Pill(app.status == 'registered' ? l.examAppRegistered : l.examAppIneligible, background: app.status == 'registered' ? good.bg : bad.bg, foreground: app.status == 'registered' ? good.fg : bad.fg),
                if (app.feePaise != null) Pill('${l.examAppFee(rupeesOf(app.feePaise!))} · ${_fee(context, app.feeStatus)}', key: Key('appFee-${app.sessionId}'), background: app.feeStatus == 'due' ? warn.bg : good.bg, foreground: app.feeStatus == 'due' ? warn.fg : good.fg),
                if (app.invoiceNo != null) Text(l.examAppInvoice(app.invoiceNo!), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
              ],
            ),
          ],
          for (final b in app.blockers)
            Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(b, style: context.text.bodyMedium?.copyWith(color: c.error))),
          const SizedBox(height: Kx.s8),
          for (final s in app.subjects)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: Kx.s4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: Kx.target,
                    height: Kx.target,
                    child: s.optional
                        ? Checkbox(key: Key('choose-${s.subjectId}'), value: chosen.contains(s.subjectId), onChanged: editable && s.eligible ? (v) => onToggle(s.subjectId, v ?? false) : null)
                        : Icon(s.eligible ? Icons.check_circle_outline : Icons.block, color: s.eligible ? good.fg : bad.fg),
                  ),
                  const SizedBox(width: Kx.s8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${s.code} ${s.name}', style: context.text.bodyLarge),
                        Text([_kind(context, s.kind), if (s.examDate != null) s.examDate!, if (!s.eligible) l.examAppHeld].join(' · '), style: context.text.bodySmall?.copyWith(color: s.eligible ? c.onSurfaceVariant : c.error)),
                        for (final r in s.reasons) Text(r, style: context.text.bodySmall?.copyWith(color: c.error)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: Kx.s8),
          Text(l.examAppFee(rupeesOf(app.feeFor(chosen))), key: Key('feeTotal-${app.sessionId}'), style: context.text.titleMedium?.copyWith(color: c.primary, fontWeight: FontWeight.w600)),
          if (editable) ...[
            const SizedBox(height: Kx.s8),
            FilledButton(
              key: Key('submit-${app.sessionId}'),
              onPressed: busy ? null : onSubmit,
              child: Text(app.submitted ? l.examAppUpdate : l.examAppSubmit),
            ),
          ],
        ],
      ),
    );
  }
}
