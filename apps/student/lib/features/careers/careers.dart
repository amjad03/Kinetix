import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/campus.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// Drives open to the student with their eligibility, their registrations and offers, and internships.
/// The Student App passes [onRegister], [onWithdraw] and [onRespond]; the Parent App leaves them out
/// and the screen is read-only.
class CareersScreen extends StatefulWidget {
  const CareersScreen({super.key, required this.load, this.onRegister, this.onWithdraw, this.onRespond, this.onPrepare});

  final Future<CareerOverview> Function() load;
  final Future<void> Function(String driveId)? onRegister;
  final Future<void> Function(String driveId)? onWithdraw;
  final Future<void> Function(String offerId, bool accept)? onRespond;

  /// Opens career preparation (resume, tests, mock interviews, recommendations, assistant); the Student App only.
  final VoidCallback? onPrepare;

  static Future<void> open(
    BuildContext context, {
    required Future<CareerOverview> Function() load,
    Future<void> Function(String driveId)? onRegister,
    Future<void> Function(String driveId)? onWithdraw,
    Future<void> Function(String offerId, bool accept)? onRespond,
    VoidCallback? onPrepare,
  }) => Navigator.of(context).push(
    MaterialPageRoute(builder: (_) => CareersScreen(load: load, onRegister: onRegister, onWithdraw: onWithdraw, onRespond: onRespond, onPrepare: onPrepare)),
  );

  @override
  State<CareersScreen> createState() => _CareersScreenState();
}

class _CareersScreenState extends State<CareersScreen> {
  CareerOverview? _data;
  Object? _error;
  String? _busy;

  bool get _canAct => widget.onRegister != null;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    try {
      final d = await widget.load();
      if (mounted) {
        setState(() {
          _data = d;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _act(String key, Future<void> Function() fn) async {
    setState(() => _busy = key);
    try {
      await fn();
      await _reload();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context)..hideCurrentSnackBar()..showSnackBar(SnackBar(content: Text(context.errorText(e))));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final d = _data;
    return Scaffold(
      appBar: AppBar(title: Text(l.careersTitle)),
      body: d == null
          ? (_error == null
                ? const Center(child: CircularProgressIndicator())
                : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner(_error!, onRetry: _reload)))
          : RefreshIndicator(
              onRefresh: _reload,
              child: LayoutBuilder(
                builder: (context, box) => ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: EdgeInsets.fromLTRB(sideGutter(box.maxWidth), Kx.s8, sideGutter(box.maxWidth), Kx.s32),
                  children: [
                    Text(
                      d.cgpa == null ? l.careersNoResult : l.careersAcademics(d.cgpa.toString(), d.backlogs),
                      key: const Key('careersAcademics'),
                      style: context.text.titleMedium,
                    ),
                    if (widget.onPrepare != null)
                      Card(
                        child: ListTile(
                          key: const Key('openCareerPrep'),
                          leading: const Icon(Icons.rocket_launch_outlined),
                          title: Text(l.prepTitle),
                          subtitle: Text(l.prepSubtitle),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: widget.onPrepare,
                        ),
                      ),
                    if (!_canAct) Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(l.careersViewOnly, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant))),
                    if (d.placed) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.careersPlaced, key: const Key('careersPlaced'), style: context.text.bodyLarge)),
                    if (d.offers.isNotEmpty) ...[_Title(l.careersOffers), for (final o in d.offers) _offer(context, o)],
                    _Title(l.careersDrives),
                    if (d.drives.isEmpty) Text(l.careersNoDrives, style: context.text.bodyLarge?.copyWith(color: context.colors.onSurfaceVariant)),
                    for (final x in d.drives) _drive(context, x),
                    if (d.internships.isNotEmpty) ...[_Title(l.careersInternships), for (final i in d.internships) _internship(context, i)],
                  ],
                ),
              ),
            ),
    );
  }

  Widget _drive(BuildContext context, CareerDrive x) {
    final l = context.l10n;
    final c = context.colors;
    final lines = [
      x.roleTitle,
      if (x.ctcLpa != null) l.careersPackage(lakhs(x.ctcLpa!)),
      if (x.minCgpa > 0) l.careersMinCgpa(lakhs(x.minCgpa)),
      if (x.location.isNotEmpty) x.location,
    ];
    return Card(
      key: Key('drive-${x.id}'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${x.company} · ${x.title}', style: context.text.titleSmall),
            Text(lines.join(' · '), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
            const SizedBox(height: Kx.s8),
            if (x.registered)
              Row(
                children: [
                  Pill(_regLabel(l, x.registrationStatus!), icon: Icons.check_circle_outline, background: Theme.of(context).colorScheme.secondaryContainer, foreground: Theme.of(context).colorScheme.onSecondaryContainer),
                  const Spacer(),
                  if (_canAct && x.registrationStatus == 'registered')
                    TextButton(key: Key('withdraw-${x.id}'), onPressed: _busy != null ? null : () => _act(x.id, () => widget.onWithdraw!(x.id)), child: Text(l.careersWithdraw)),
                ],
              )
            else if (!x.eligible)
              Text(x.reasons.map((r) => _reasonLabel(l, r)).join(' · '), key: Key('reasons-${x.id}'), style: context.text.bodyMedium?.copyWith(color: c.error))
            else if (_canAct)
              FilledButton(key: Key('register-${x.id}'), onPressed: _busy != null ? null : () => _act(x.id, () => widget.onRegister!(x.id)), child: Text(l.careersRegister)),
          ],
        ),
      ),
    );
  }

  Widget _offer(BuildContext context, CareerOffer o) {
    final l = context.l10n;
    return Card(
      key: Key('offer-${o.id}'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text([o.roleTitle, if (o.ctcLpa != null) l.careersPackage(lakhs(o.ctcLpa!))].join(' · '), style: context.text.titleSmall),
            const SizedBox(height: Kx.s4),
            Text(_offerLabel(l, o.status), style: context.text.bodyMedium),
            if (_canAct && o.status == 'offered' && widget.onRespond != null)
              Padding(
                padding: const EdgeInsets.only(top: Kx.s8),
                child: Row(
                  children: [
                    FilledButton(key: Key('accept-${o.id}'), onPressed: _busy != null ? null : () => _act(o.id, () => widget.onRespond!(o.id, true)), child: Text(l.careersAccept)),
                    const SizedBox(width: Kx.s8),
                    OutlinedButton(key: Key('decline-${o.id}'), onPressed: _busy != null ? null : () => _act(o.id, () => widget.onRespond!(o.id, false)), child: Text(l.careersDecline)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _internship(BuildContext context, CareerInternship i) => ListTile(
    key: Key('internship-${i.id}'),
    contentPadding: EdgeInsets.zero,
    leading: const Icon(Icons.work_outline),
    title: Text(i.title),
    subtitle: Text('${i.orgName} · ${i.startsOn} - ${i.endsOn}'),
  );
}

String _regLabel(AppLocalizations l, String s) => switch (s) {
  'shortlisted' => l.careersReg_shortlisted,
  'rejected' => l.careersReg_rejected,
  'selected' => l.careersReg_selected,
  'withdrawn' => l.careersReg_withdrawn,
  _ => l.careersReg_registered,
};

String _offerLabel(AppLocalizations l, String s) => switch (s) {
  'accepted' => l.careersOffer_accepted,
  'declined' => l.careersOffer_declined,
  'withdrawn' => l.careersOffer_withdrawn,
  'expired' => l.careersOffer_expired,
  _ => l.careersOffer_offered,
};

String _reasonLabel(AppLocalizations l, String s) => switch (s) {
  'deadline_passed' => l.careersReason_deadline_passed,
  'no_results' => l.careersReason_no_results,
  'cgpa_below' => l.careersReason_cgpa_below,
  'backlogs_exceeded' => l.careersReason_backlogs_exceeded,
  'program_not_eligible' => l.careersReason_program_not_eligible,
  _ => l.careersReason_not_open,
};

class _Title extends StatelessWidget {
  const _Title(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(Kx.s4, Kx.s24, Kx.s4, Kx.s8),
    child: Text(text, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500)),
  );
}
