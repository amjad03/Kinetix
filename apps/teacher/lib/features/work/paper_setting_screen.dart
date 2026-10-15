import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/exam_work_models.dart';
import '../../core/l10n.dart';
import '../../widgets/async_body.dart';

/// Question papers I am appointed to set or moderate (accept or decline, how far the sets are), and my requests to
/// unlock submitted marks with their decisions.
class PaperSettingScreen extends StatelessWidget {
  const PaperSettingScreen({super.key, required this.api});

  final TeacherApi api;

  Future<({List<QpAppointment> appointments, List<UnlockRequest> unlocks})> _load() async {
    final r = await Future.wait([api.myQpAppointments(), api.myUnlockRequests()]);
    return (appointments: r[0] as List<QpAppointment>, unlocks: r[1] as List<UnlockRequest>);
  }

  Future<void> _respond(BuildContext context, QpAppointment a, bool accept, Future<void> Function() reload) async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    String? note;
    if (!accept) {
      note = await showDialog<String>(context: context, builder: (_) => _ReasonDialog(title: l.qpDecline, label: l.qpDeclineWhy));
      if (note == null) return;
    }
    try {
      await api.respondQpAppointment(a.id, accept: accept, note: note);
      messenger.showSnackBar(SnackBar(content: Text(accept ? l.qpAccepted : l.qpDeclined)));
      await reload();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _withdraw(BuildContext context, UnlockRequest r, Future<void> Function() reload) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await api.cancelUnlockRequest(r.id);
      await reload();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  String _unlockState(AppLocalizations l, String s) => switch (s) {
    'pending' => l.unlockPending,
    'approved' => l.unlockApproved,
    'rejected' => l.unlockRejected,
    _ => l.unlockCancelled,
  };

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l.qpTitle)),
      body: AsyncBody<({List<QpAppointment> appointments, List<UnlockRequest> unlocks})>(
        load: _load,
        builder: (context, data, reload) => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(Kx.s16),
          children: [
            KxSectionHeader(l.qpAppointments),
            if (data.appointments.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: Kx.s8), child: Text(l.qpEmpty, key: const Key('noQp'))),
            for (final a in data.appointments)
              Card(
                key: Key('qp-${a.id}'),
                child: Padding(
                  padding: const EdgeInsets.all(Kx.s12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${a.code} ${a.subject}', style: context.text.titleSmall),
                      Text(a.session, style: context.text.bodySmall),
                      const SizedBox(height: Kx.s4),
                      Text([a.setter ? l.qpSetter : l.qpModerator, l.qpDue(a.dueOn), a.waiting ? l.qpWaiting : l.qpAcceptedState].join(' · ')),
                      if (a.setter && !a.waiting) Text(l.qpSets('${a.setsMade}', '${a.setsRequired}')),
                      if (!a.setter && a.toModerate > 0) Text(l.qpToModerate('${a.toModerate}'), key: Key('toModerate-${a.id}')),
                      if (a.remunerationPaise > 0) Text(l.qpFee((a.remunerationPaise / 100).toStringAsFixed(2))),
                      if (a.note != null && a.note!.isNotEmpty) Text(a.note!, style: context.text.bodySmall),
                      if (a.setter && !a.waiting) Text(l.qpSetHint, style: context.text.bodySmall),
                      if (a.waiting)
                        Padding(
                          padding: const EdgeInsets.only(top: Kx.s8),
                          child: Wrap(
                            spacing: Kx.s8,
                            children: [
                              OutlinedButton(key: Key('decline-${a.id}'), onPressed: () => _respond(context, a, false, reload), child: Text(l.qpDecline)),
                              FilledButton(key: Key('accept-${a.id}'), onPressed: () => _respond(context, a, true, reload), child: Text(l.qpAccept)),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: Kx.s16),
            KxSectionHeader(l.unlockTitle),
            if (data.unlocks.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: Kx.s8), child: Text(l.unlockNone, key: const Key('noUnlocks'))),
            for (final r in data.unlocks)
              ListTile(
                key: Key('unlock-${r.id}'),
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.lock_open_outlined),
                title: Text('${r.code} ${r.assessment} · ${r.section}'),
                subtitle: Text([_unlockState(l, r.status), r.reason, if (r.decisionNote != null) r.decisionNote!].join('\n')),
                isThreeLine: true,
                trailing: r.status == 'pending' ? TextButton(key: Key('withdraw-${r.id}'), onPressed: () => _withdraw(context, r, reload), child: Text(l.unlockWithdraw)) : null,
              ),
          ],
        ),
      ),
    );
  }
}

/// Asks for a reason (at least five characters): declining an appointment, or asking to unlock marks.
class _ReasonDialog extends StatefulWidget {
  const _ReasonDialog({required this.title, required this.label});

  final String title, label;

  @override
  State<_ReasonDialog> createState() => _ReasonDialogState();
}

class _ReasonDialogState extends State<_ReasonDialog> {
  final _c = TextEditingController();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(key: const Key('reason'), controller: _c, autofocus: true, maxLines: 3, maxLength: 500, decoration: InputDecoration(labelText: widget.label), onChanged: (_) => setState(() {})),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l.cancel)),
        FilledButton(key: const Key('reasonSend'), onPressed: _c.text.trim().length < 5 ? null : () => Navigator.pop(context, _c.text.trim()), child: Text(widget.title)),
      ],
    );
  }
}

/// Asks to unlock the marks of an assessment with a reason; tells the teacher how it went.
Future<void> askUnlock(BuildContext context, TeacherApi api, String assessmentId) async {
  final l = context.l10n;
  final messenger = ScaffoldMessenger.of(context);
  final reason = await showDialog<String>(context: context, builder: (_) => _ReasonDialog(title: l.unlockAsk, label: l.unlockWhy));
  if (reason == null) return;
  try {
    await api.askMarksUnlock(assessmentId, reason);
    messenger.showSnackBar(SnackBar(content: Text(l.unlockSent)));
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.message)));
  }
}
