import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/governance_models.dart';
import '../../core/l10n.dart';
import '../../widgets/async_body.dart';

DateTime _day(String ymd) => DateTime.tryParse(ymd) ?? DateTime(2000);

/// Policies that apply to me (read and acknowledge), minutes of committee meetings waiting for my approval
/// (read, approve or object), and the committee actions I own (report what was done).
class GovernanceScreen extends StatelessWidget {
  const GovernanceScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l.govTitle),
          bottom: TabBar(isScrollable: true, tabs: [Tab(key: const Key('tabPolicies'), text: l.govPoliciesTab), Tab(key: const Key('tabMinutes'), text: l.govMinutesTab), Tab(key: const Key('tabActions'), text: l.govActionsTab)]),
        ),
        body: TabBarView(children: [_Policies(api: api), _Minutes(api: api), _Actions(api: api)]),
      ),
    );
  }
}

class _Policies extends StatelessWidget {
  const _Policies({required this.api});

  final TeacherApi api;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return AsyncBody<List<MyPolicy>>(
      key: const Key('gov-policies'),
      load: api.myPolicies,
      isEmpty: (p) => p.isEmpty,
      empty: l.govNoPolicies,
      builder: (context, policies, reload) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          for (final p in policies)
            Card(
              key: Key('policy-${p.versionId}'),
              child: ListTile(
                title: Text(p.title),
                subtitle: Text(p.pending ? l.govToAcknowledge(p.version) : p.mustAcknowledge && p.acknowledgedAt != null ? l.govAcknowledgedOn(f.shortDay(p.acknowledgedAt!.toLocal())) : l.govForInfo(p.version)),
                trailing: Icon(p.pending ? Icons.pending_actions_outlined : Icons.check_circle_outline, color: p.pending ? context.colors.error : null),
                onTap: () async {
                  final done = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => PolicyReader(api: api, versionId: p.versionId)));
                  if (done == true) await reload();
                },
              ),
            ),
        ],
      ),
    );
  }
}

/// One policy's text; "I have read it" records my acknowledgement.
class PolicyReader extends StatelessWidget {
  const PolicyReader({super.key, required this.api, required this.versionId});

  final TeacherApi api;
  final String versionId;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.govPolicyTitle)),
      body: AsyncBody<PolicyText>(
        load: () => api.policyText(versionId),
        builder: (context, p, _) => ListView(
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            Text(p.title, style: context.text.titleMedium),
            Text(l.govVersion(p.version), style: context.text.bodySmall),
            const SizedBox(height: Kx.s12),
            Text(p.body, key: const Key('policy-body')),
            const SizedBox(height: Kx.s16),
            if (p.mustAcknowledge && p.acknowledgedAt == null)
              FilledButton(
                key: const Key('acknowledge'),
                onPressed: () async {
                  if (await runOrSnack(context, () => api.acknowledgePolicy(versionId)) && context.mounted) Navigator.of(context).pop(true);
                },
                child: Text(l.govAcknowledge),
              ),
          ],
        ),
      ),
    );
  }
}

class _Minutes extends StatelessWidget {
  const _Minutes({required this.api});

  final TeacherApi api;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return AsyncBody<MyGovernance>(
      key: const Key('gov-minutes'),
      load: api.myGovernance,
      isEmpty: (g) => g.toSign.isEmpty && g.upcoming.isEmpty && g.committees.isEmpty,
      empty: l.govNoMinutes,
      builder: (context, g, reload) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          if (g.toSign.isEmpty) Padding(padding: const EdgeInsets.only(bottom: Kx.s8), child: Text(l.govNoMinutes)),
          for (final m in g.toSign)
            Card(
              key: Key('minutes-${m.meetingId}'),
              child: ListTile(
                title: Text(m.title),
                subtitle: Text('${m.committee} · ${f.shortDay(_day(m.meetingOn))}'),
                trailing: const Icon(Icons.draw_outlined),
                onTap: () async {
                  final done = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => MinutesReader(api: api, meetingId: m.meetingId)));
                  if (done == true) await reload();
                },
              ),
            ),
          if (g.upcoming.isNotEmpty) KxSectionHeader(l.govUpcoming),
          for (final m in g.upcoming) ListTile(title: Text(m.title), subtitle: Text('${m.committee} · ${f.shortDay(_day(m.meetingOn))}')),
          if (g.committees.isNotEmpty) KxSectionHeader(l.govMyCommittees),
          for (final c in g.committees) ListTile(dense: true, title: Text(c.name), subtitle: Text(_role(l, c.role))),
        ],
      ),
    );
  }
}

String _role(AppLocalizations l, String r) => switch (r) {
  'chair' => l.govRoleChair,
  'secretary' => l.govRoleSecretary,
  _ => l.govRoleMember,
};

/// The circulated minutes: proceedings and each resolution; approve, or object with a reason.
class MinutesReader extends StatelessWidget {
  const MinutesReader({super.key, required this.api, required this.meetingId});

  final TeacherApi api;
  final String meetingId;

  Future<void> _object(BuildContext context) async {
    final l = context.l10n;
    final ctl = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.govObject),
        content: TextField(key: const Key('objection'), controller: ctl, maxLines: 3, decoration: InputDecoration(labelText: l.govObjectionLabel)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l.cancel)),
          FilledButton(key: const Key('sendObjection'), onPressed: () => Navigator.pop(ctx, ctl.text.trim()), child: Text(l.govObject)),
        ],
      ),
    );
    if (reason == null || reason.length < 3 || !context.mounted) return;
    if (await runOrSnack(context, () => api.signMinutes(meetingId, approve: false, comment: reason)) && context.mounted) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l.govMinutesTitle)),
      body: AsyncBody<MeetingMinutes>(
        load: () => api.meetingMinutes(meetingId),
        builder: (context, m, _) => ListView(
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            Text(m.title, style: context.text.titleMedium),
            Text('${m.committee} · ${f.longDay(_day(m.meetingOn))}', style: context.text.bodySmall),
            const SizedBox(height: Kx.s12),
            if (m.minutes.isNotEmpty) Text(m.minutes),
            for (final i in m.items)
              Padding(
                padding: const EdgeInsets.only(top: Kx.s12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${i.seq}. ${i.title}', style: context.text.titleSmall),
                    if (i.resolution.isNotEmpty) Text(l.govResolved(i.resolution)),
                  ],
                ),
              ),
            const SizedBox(height: Kx.s16),
            if (m.canSign)
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s8,
                children: [
                  FilledButton(
                    key: const Key('approveMinutes'),
                    onPressed: () async {
                      if (await runOrSnack(context, () => api.signMinutes(meetingId, approve: true)) && context.mounted) Navigator.of(context).pop(true);
                    },
                    child: Text(l.govApprove),
                  ),
                  OutlinedButton(key: const Key('objectMinutes'), onPressed: () => _object(context), child: Text(l.govObject)),
                ],
              )
            else
              Text(l.govAlreadySigned),
          ],
        ),
      ),
    );
  }
}

class _Actions extends StatelessWidget {
  const _Actions({required this.api});

  final TeacherApi api;

  Future<void> _report(BuildContext context, CommitteeAction a, Future<void> Function() reload) async {
    final l = context.l10n;
    final ctl = TextEditingController(text: a.actionTaken);
    final text = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.govReport),
        content: TextField(key: const Key('actionTaken'), controller: ctl, maxLines: 4, decoration: InputDecoration(labelText: l.govActionTakenLabel)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l.cancel)),
          FilledButton(key: const Key('sendReport'), onPressed: () => Navigator.pop(ctx, ctl.text.trim()), child: Text(l.govMarkDone)),
        ],
      ),
    );
    if (text == null || text.length < 3 || !context.mounted) return;
    if (await runOrSnack(context, () => api.reportCommitteeAction(a.id, text))) await reload();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    return AsyncBody<MyGovernance>(
      key: const Key('gov-actions'),
      load: api.myGovernance,
      isEmpty: (g) => g.actions.isEmpty,
      empty: l.govNoActions,
      builder: (context, g, reload) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(Kx.s16),
        children: [
          for (final a in g.actions)
            Card(
              key: Key('action-${a.id}'),
              child: Padding(
                padding: const EdgeInsets.all(Kx.s12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(a.title, style: context.text.titleSmall),
                    Text('${a.committee} · ${l.govDue(f.shortDay(_day(a.dueOn)))}', style: context.text.bodySmall),
                    if (a.overdue) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Chip(label: Text(l.govOverdue), visualDensity: VisualDensity.compact)),
                    Align(alignment: Alignment.centerRight, child: FilledButton(key: Key('report-${a.id}'), onPressed: () => _report(context, a, reload), child: Text(l.govReport))),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
