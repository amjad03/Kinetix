import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/attachments.dart';
import '../../core/format.dart';
import '../../core/campus.dart' show lakhs;
import '../../core/models.dart';
import '../../core/placement_pass.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// The student's own placement dashboard: where they stand (marks, backlogs, class 10 and 12, gap years, opt-in,
/// debarment, documents the cell must verify), the drives they registered for with each round's result and
/// interview slot, offers, training attendance and scores, internship credits against what the programme asks,
/// apprenticeships and alumni referrals. The Student App passes [onUpload] and [onAskReferral]; the Parent App
/// leaves them out and the screen only reads.
class PlacementDashboardScreen extends StatefulWidget {
  const PlacementDashboardScreen({super.key, required this.load, this.onUpload, this.mentors, this.onAskReferral});

  final Future<PlacementDashboard> Function() load;
  final Future<void> Function(String kind, UploadFile file)? onUpload;
  final Future<List<AlumniMentor>> Function()? mentors;
  final Future<void> Function({required String alumniId, required String company, required String role, required String message})? onAskReferral;

  static Future<void> open(
    BuildContext context, {
    required Future<PlacementDashboard> Function() load,
    Future<void> Function(String kind, UploadFile file)? onUpload,
    Future<List<AlumniMentor>> Function()? mentors,
    Future<void> Function({required String alumniId, required String company, required String role, required String message})? onAskReferral,
  }) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PlacementDashboardScreen(load: load, onUpload: onUpload, mentors: mentors, onAskReferral: onAskReferral)));

  @override
  State<PlacementDashboardScreen> createState() => _PlacementDashboardScreenState();
}

class _PlacementDashboardScreenState extends State<PlacementDashboardScreen> {
  PlacementDashboard? _data;
  Object? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    try {
      final d = await widget.load();
      if (mounted) setState(() => (_data = d, _error = null));
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  void _toast(String text) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));

  Future<void> _upload(String kind) async {
    final l = context.l10n;
    final files = await AttachmentPicker.instance.pick(AttachmentSource.pdf, max: 1);
    if (files.isEmpty || !mounted) return;
    setState(() => _busy = true);
    try {
      await widget.onUpload!(kind, files.first);
      _toast(l.ppUploaded);
      await _reload();
    } catch (e) {
      if (mounted) _toast(context.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _askReferral() async {
    final l = context.l10n;
    final list = await widget.mentors!();
    if (!mounted) return;
    if (list.isEmpty) return _toast(l.ppNoMentors);
    final sent = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, builder: (_) => _ReferralSheet(mentors: list, send: widget.onAskReferral!));
    if (sent == true && mounted) {
      _toast(l.ppReferralSent);
      await _reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final d = _data;
    return Scaffold(
      appBar: AppBar(title: Text(l.ppTitle)),
      body: d == null
          ? (_error == null ? const Center(child: CircularProgressIndicator()) : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner(_error!, onRetry: _reload)))
          : RefreshIndicator(
              onRefresh: _reload,
              child: LayoutBuilder(
                builder: (context, box) => ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: EdgeInsets.fromLTRB(sideGutter(box.maxWidth), Kx.s8, sideGutter(box.maxWidth), Kx.s32),
                  children: [
                    _standing(context, d),
                    _Title(l.ppDocuments),
                    for (final doc in d.standing.documents) _document(context, doc),
                    _Title(l.ppDrives),
                    if (d.registrations.isEmpty) Text(l.ppNoDrives, style: context.text.bodyLarge?.copyWith(color: context.colors.onSurfaceVariant)),
                    for (final r in d.registrations) _registration(context, r),
                    if (d.offers.isNotEmpty) ...[
                      _Title(l.careersOffers),
                      for (final o in d.offers)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.workspace_premium_outlined),
                          title: Text('${o.company} · ${o.role}'),
                          subtitle: Text([if (o.ctcLpa != null) l.careersPackage(lakhs(o.ctcLpa!)), _category(l, o.category)].join(' · ')),
                        ),
                    ],
                    if (d.training.isNotEmpty) ...[_Title(l.ppTraining), for (final t in d.training) _training(context, t)],
                    _Title(l.ppCredits),
                    Text(d.creditsRequired > 0 && d.creditsShort > 0 ? l.ppCreditsLine(_num(d.creditsEarned), _num(d.creditsRequired), _num(d.creditsShort)) : l.ppCreditsMet(_num(d.creditsEarned)), key: const Key('ppCredits'), style: context.text.bodyLarge),
                    if (d.creditsRequired > 0) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: LinearProgressIndicator(value: (d.creditsEarned / d.creditsRequired).clamp(0, 1).toDouble())),
                    if (d.apprenticeships.isNotEmpty) ...[
                      _Title(l.ppApprenticeships),
                      for (final a in d.apprenticeships)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.engineering_outlined),
                          title: Text('${a.establishment} · ${_apStatus(l, a.status)}'),
                          subtitle: Text('${a.role}\n${l.ppStipend(Fmt.rupees(a.stipendPaise), Fmt.rupees(a.govtSharePaise))}'),
                          isThreeLine: true,
                        ),
                    ],
                    _Title(l.ppReferrals),
                    for (final r in d.referrals)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.handshake_outlined),
                        title: Text('${r.company} · ${r.alumni}'),
                        subtitle: Text([_refStatus(l, r.status), if (r.note.isNotEmpty) r.note].join(' · ')),
                      ),
                    if (widget.onAskReferral != null && widget.mentors != null)
                      Align(alignment: AlignmentDirectional.centerStart, child: OutlinedButton.icon(key: const Key('ppAskReferral'), onPressed: _busy ? null : _askReferral, icon: const Icon(Icons.person_search_outlined), label: Text(l.ppAskReferral))),
                  ],
                ),
              ),
            ),
    );
  }

  Widget _standing(BuildContext context, PlacementDashboard d) {
    final l = context.l10n;
    final s = d.standing;
    String pct(double? v) => v == null ? '—' : '${_num(v)}%';
    final c = context.colors;
    return Card(
      key: const Key('ppStanding'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(s.cgpa == null ? l.ppNoResult : l.ppMarks(s.cgpa!.toStringAsFixed(2), '${s.backlogs}', '${s.backlogHistory}'), style: context.text.titleMedium),
            const SizedBox(height: Kx.s4),
            Text(l.ppSchool(pct(s.tenthPct), pct(s.twelfthPct)), style: context.text.bodyMedium),
            if (s.gapYears != null) Text(l.ppGap('${s.gapYears}'), style: context.text.bodyMedium),
            const SizedBox(height: Kx.s8),
            Text(l.ppCounts('${d.eligibleOpenDrives}', '${d.registered}', '${d.shortlisted}', '${d.offerCount}'), key: const Key('ppCounts'), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
            if (s.placedCategory != null) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.ppPlaced(_category(l, s.placedCategory!)), style: context.text.bodyLarge)),
            if (s.optedIn == false) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.ppOptedOut, style: context.text.bodyLarge?.copyWith(color: c.error))),
            if (s.debarredUntil != null) Padding(padding: const EdgeInsets.only(top: Kx.s8), child: Text(l.ppDebarred(s.debarredUntil!), key: const Key('ppDebarred'), style: context.text.bodyLarge?.copyWith(color: c.error))),
          ],
        ),
      ),
    );
  }

  Widget _document(BuildContext context, RequiredDocument doc) {
    final l = context.l10n;
    final ok = doc.status == 'verified';
    return ListTile(
      key: Key('ppDoc-${doc.kind}'),
      contentPadding: EdgeInsets.zero,
      leading: Icon(ok ? Icons.verified_outlined : doc.status == 'rejected' ? Icons.error_outline : Icons.description_outlined, color: ok ? Colors.green.shade700 : doc.status == 'rejected' ? context.colors.error : null),
      title: Text(_docName(l, doc.kind)),
      subtitle: Text(_docStatus(l, doc.status)),
      trailing: widget.onUpload != null && !ok ? TextButton(key: Key('ppUpload-${doc.kind}'), onPressed: _busy ? null : () => _upload(doc.kind), child: Text(l.ppUpload)) : null,
    );
  }

  Widget _registration(BuildContext context, PlacementRegistration r) {
    final l = context.l10n;
    return Card(
      key: Key('ppReg-${r.id}'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${r.company} · ${r.roleTitle}', style: context.text.titleSmall),
            Text(r.title, style: context.text.bodySmall?.copyWith(color: context.colors.onSurfaceVariant)),
            const SizedBox(height: Kx.s8),
            for (final x in r.rounds)
              Padding(
                padding: const EdgeInsets.only(bottom: Kx.s4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(x.result == 'pass' ? Icons.check_circle : x.result == null ? Icons.radio_button_unchecked : Icons.cancel, size: 18, color: x.result == 'pass' ? Colors.green.shade700 : x.result == null ? context.colors.onSurfaceVariant : context.colors.error),
                    const SizedBox(width: Kx.s8),
                    Expanded(
                      child: Text(
                        [x.name, _result(l, x.result), if (x.result == null && x.slotStartsAt != null) l.ppSlot('${MaterialLocalizations.of(context).formatMediumDate(x.slotStartsAt!)} ${TimeOfDay.fromDateTime(x.slotStartsAt!).format(context)}', x.slotVenue ?? '')].join(' · '),
                        style: context.text.bodyMedium,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _training(BuildContext context, PlacementTraining t) {
    final l = context.l10n;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.model_training_outlined),
      title: Text(t.title),
      subtitle: Text([if (t.attendancePct != null) l.ppAttendance(_num(t.attendancePct!)), for (final s in t.scores) l.ppScore(s.test, _num(s.score), _num(s.max))].join(' · ')),
    );
  }
}

/// A whole number without decimals, else one decimal place.
String _num(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);

String _category(AppLocalizations l, String c) => switch (c) {
  'super_dream' => l.ppCategory_super_dream,
  'dream' => l.ppCategory_dream,
  _ => l.ppCategory_regular,
};

String _docName(AppLocalizations l, String k) => switch (k) {
  'marks_10' => l.ppDoc_marks_10,
  'marks_12' => l.ppDoc_marks_12,
  'semester_marks' => l.ppDoc_semester_marks,
  'id_proof' => l.ppDoc_id_proof,
  _ => l.ppDoc_resume,
};

String _docStatus(AppLocalizations l, String s) => switch (s) {
  'verified' => l.ppDocStatus_verified,
  'pending' => l.ppDocStatus_pending,
  'rejected' => l.ppDocStatus_rejected,
  _ => l.ppDocStatus_missing,
};

String _result(AppLocalizations l, String? r) => switch (r) {
  'pass' => l.ppResult_pass,
  'fail' => l.ppResult_fail,
  'absent' => l.ppResult_absent,
  _ => l.ppResult_waiting,
};

String _refStatus(AppLocalizations l, String s) => switch (s) {
  'referred' => l.ppRefStatus_referred,
  'interviewing' => l.ppRefStatus_interviewing,
  'hired' => l.ppRefStatus_hired,
  'declined' => l.ppRefStatus_declined,
  'closed' => l.ppRefStatus_closed,
  _ => l.ppRefStatus_requested,
};

String _apStatus(AppLocalizations l, String s) => switch (s) {
  'contract_registered' => l.ppApStatus_contract_registered,
  'ongoing' => l.ppApStatus_ongoing,
  'completed' => l.ppApStatus_completed,
  'terminated' => l.ppApStatus_terminated,
  _ => l.ppApStatus_enrolled,
};

/// Picks an alumnus who takes requests and asks them for a referral at a company.
class _ReferralSheet extends StatefulWidget {
  const _ReferralSheet({required this.mentors, required this.send});

  final List<AlumniMentor> mentors;
  final Future<void> Function({required String alumniId, required String company, required String role, required String message}) send;

  @override
  State<_ReferralSheet> createState() => _ReferralSheetState();
}

class _ReferralSheetState extends State<_ReferralSheet> {
  late AlumniMentor _who = widget.mentors.first;
  late final _company = TextEditingController(text: widget.mentors.first.employer);
  final _role = TextEditingController();
  final _message = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _company.dispose();
    _role.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => (_busy = true, _error = null));
    try {
      await widget.send(alumniId: _who.id, company: _company.text.trim(), role: _role.text.trim(), message: _message.text.trim());
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) setState(() => (_busy = false, _error = context.errorText(e)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final ready = _company.text.trim().isNotEmpty && _message.text.trim().length >= 10;
    return Padding(
      padding: EdgeInsets.fromLTRB(Kx.s16, Kx.s16, Kx.s16, Kx.s16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l.ppAskReferral, style: context.text.titleMedium),
          const SizedBox(height: Kx.s12),
          DropdownButtonFormField<AlumniMentor>(
            key: const Key('ppRefWho'),
            initialValue: _who,
            isExpanded: true,
            decoration: InputDecoration(labelText: l.ppReferralAlumnus),
            items: [for (final m in widget.mentors) DropdownMenuItem(value: m, child: Text([m.name, if (m.employer.isNotEmpty) m.employer].join(' · '), overflow: TextOverflow.ellipsis))],
            onChanged: (m) => setState(() {
              _who = m ?? _who;
              if (m != null && m.employer.isNotEmpty) _company.text = m.employer;
            }),
          ),
          TextField(key: const Key('ppRefCompany'), controller: _company, decoration: InputDecoration(labelText: l.ppReferralCompany), onChanged: (_) => setState(() {})),
          TextField(key: const Key('ppRefRole'), controller: _role, decoration: InputDecoration(labelText: l.ppReferralRole)),
          TextField(key: const Key('ppRefMessage'), controller: _message, minLines: 2, maxLines: 4, maxLength: 1000, decoration: InputDecoration(labelText: l.ppReferralMessage), onChanged: (_) => setState(() {})),
          if (_error != null) Text(_error!, style: TextStyle(color: context.colors.error)),
          const SizedBox(height: Kx.s8),
          FilledButton(key: const Key('ppRefSend'), onPressed: _busy || !ready ? null : _send, child: Text(l.ppReferralSend)),
        ],
      ),
    );
  }
}

class _Title extends StatelessWidget {
  const _Title(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(Kx.s4, Kx.s24, Kx.s4, Kx.s8),
    child: Text(text, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w500)),
  );
}
