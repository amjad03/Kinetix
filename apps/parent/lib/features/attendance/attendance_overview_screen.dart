import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/family_care.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../school_life/load_view.dart';

String _pct(double? v) => v == null ? '–' : '${Fmt.marks(v)}%';

KxTone _tone(double? pct, AttendancePolicyView p) {
  if (pct == null) return KxTone.neutral;
  if (pct < p.thresholdPct) return KxTone.danger;
  if (pct < p.warnPct) return KxTone.warning;
  return KxTone.success;
}

/// The child's attendance by subject against the minimum the university (or board, or the college)
/// sets: a shortage alert opens it. Each short subject says how many classes would make it up.
class AttendanceOverviewScreen extends StatefulWidget {
  const AttendanceOverviewScreen({super.key, required this.api, required this.child});

  final ParentApi api;
  final Child child;

  static Future<void> open(BuildContext context, ParentApi api, Child child) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AttendanceOverviewScreen(api: api, child: child)));

  @override
  State<AttendanceOverviewScreen> createState() => _AttendanceOverviewScreenState();
}

class _AttendanceOverviewScreenState extends State<AttendanceOverviewScreen> {
  AttendanceOverview? _data;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final d = await widget.api.attendanceOverview(widget.child.id);
      if (mounted) setState(() => _data = d);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final d = _data;
    return Scaffold(
      appBar: AppBar(title: Text(l.atBySubjectFor(widget.child.firstName))),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (d == null && _error == null) const KxLoading(),
            if (d != null) ...[
              _OverallCard(data: d, name: widget.child.firstName),
              const SizedBox(height: Kx.s8),
              Text(
                d.policy.profile == null || d.policy.profile!.isEmpty ? l.atRuleOwn(Fmt.marks(d.policy.thresholdPct)) : l.atRuleBody(Fmt.marks(d.policy.thresholdPct), d.policy.profile!),
                key: const Key('atRule'),
                style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
              ),
              if (d.policy.perSubject) Text(l.atPerSubjectRule, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
              SectionTitle(l.atSubjects),
              if (d.subjects.isEmpty) EmptyNote(l.atNoSubjects),
              for (final s in d.subjects) _SubjectRow(subject: s, policy: d.policy),
              if (d.leaves.isNotEmpty) ...[
                SectionTitle(l.atLeaves),
                for (final x in d.leaves)
                  Card(
                    key: Key('childLeave-${x.id}'),
                    child: ListTile(
                      leading: Icon(x.kind == 'on_duty' ? Icons.emoji_events_outlined : (x.kind == 'medical' ? Icons.medical_services_outlined : Icons.event_busy_outlined)),
                      title: Text(switch (x.kind) { 'on_duty' => l.atKindOnDuty, 'medical' => l.atKindMedical, _ => l.atKindPersonal }),
                      subtitle: Text([context.fmt.dayRange(x.fromDate, x.toDate), if (x.reason.isNotEmpty) x.reason].join(' · ')),
                      trailing: Text(switch (x.status) { 'approved' => l.atApproved, 'rejected' => l.atDeclined, 'cancelled' => l.atWithdrawn, 'revoked' => l.atRevoked, _ => l.atAwaiting }, style: context.text.labelLarge),
                    ),
                  ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _OverallCard extends StatelessWidget {
  const _OverallCard({required this.data, required this.name});

  final AttendanceOverview data;
  final String name;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final d = data;
    final p = d.policy;
    final pct = d.overall.counted;
    final tone = d.status == 'detained' || d.status == 'condonable' ? KxTone.danger : (d.warning ? KxTone.warning : _tone(pct, p));
    final t = kxTone(context, tone);
    final short = d.subjects.where((s) => s.short).toList();
    final message = switch (d.status) {
      'detained' => l.atDetained(name),
      'condonable' => short.isEmpty ? l.atShortOverall(name, Fmt.marks(p.thresholdPct)) : l.atShortIn(name, short.map((s) => s.subject).join(', ')),
      _ => d.warning ? l.atClose(name, Fmt.marks(p.thresholdPct)) : l.atFine(name),
    };
    return KxCard(
      key: const Key('atOverall'),
      color: t.bg,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(d.windowLabel.isEmpty ? l.atOverall : l.atOverallIn(d.windowLabel), style: context.text.titleSmall?.copyWith(color: t.fg))),
              Text(_pct(pct), key: const Key('atOverallPct'), style: context.text.headlineSmall?.copyWith(color: t.fg, fontWeight: FontWeight.w700)),
            ],
          ),
          Text(l.atHeldAttended(d.overall.attended, d.overall.held), style: context.text.bodySmall?.copyWith(color: t.fg)),
          const SizedBox(height: Kx.s8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(tone == KxTone.success ? Icons.check_circle_outline : Icons.warning_amber_rounded, color: t.fg, size: 20),
              const SizedBox(width: Kx.s8),
              Expanded(child: Text(message, key: const Key('atStatus'), style: context.text.bodyMedium?.copyWith(color: t.fg, fontWeight: FontWeight.w500))),
            ],
          ),
        ],
      ),
    );
  }
}

class _SubjectRow extends StatelessWidget {
  const _SubjectRow({required this.subject, required this.policy});

  final SubjectAttendance subject;
  final AttendancePolicyView policy;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final s = subject;
    final pct = s.counted;
    final tone = s.short ? KxTone.danger : _tone(pct, policy);
    final need = s.classesToReach(policy.thresholdPct);
    return Card(
      key: Key('atSubject-${s.subjectId}'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(s.subject, style: context.text.titleSmall)),
                if (s.code.isNotEmpty) Text(s.code, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
              ],
            ),
            const SizedBox(height: Kx.s8),
            KxProgressBar(value: (pct ?? 0) / 100, label: _pct(pct), tone: tone),
            const SizedBox(height: Kx.s4),
            Text(l.atHeldAttended(s.attended, s.held), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
            if (tone == KxTone.danger && need > 0)
              Padding(
                padding: const EdgeInsets.only(top: Kx.s4),
                child: Text(l.atNeedClasses(need, Fmt.marks(policy.thresholdPct)), key: Key('atNeed-${s.subjectId}'), style: context.text.bodyMedium?.copyWith(color: c.error, fontWeight: FontWeight.w500)),
              )
            else if (tone == KxTone.warning)
              Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.atCloseSubject(Fmt.marks(policy.thresholdPct)), style: context.text.bodyMedium?.copyWith(color: Tone.warn(context)))),
          ],
        ),
      ),
    );
  }
}
