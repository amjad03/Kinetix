import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/campus_services.dart';
import '../../core/format.dart';
import '../../core/self_service.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../../widgets/load_view.dart';
import 'gate_pass_screen.dart';

/// Everything hostel: applying for a seat, the room, out-passes, mess leave, room change or vacate
/// requests, and the monthly mess bills.
class HostelScreen extends StatefulWidget {
  const HostelScreen({super.key, required this.api, required this.studentId, this.now});

  final StudentApi api;
  final String studentId;

  /// For tests; defaults to the device clock.
  final DateTime Function()? now;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => HostelScreen(api: api, studentId: studentId)));

  @override
  State<HostelScreen> createState() => _HostelScreenState();
}

class _HostelScreenState extends State<HostelScreen> {
  HostelView? _view;
  HostelAccount? _account;
  List<HostelApplication>? _apps;
  ApiException? _error;

  DateTime get _today => DateUtils.dateOnly((widget.now ?? DateTime.now)());

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final both = await Future.wait<Object>([widget.api.hostel(widget.studentId), widget.api.hostelApplications(widget.studentId)]);
      final view = both[0] as HostelView;
      final apps = both[1] as List<HostelApplication>;
      final account = view.resident ? await widget.api.hostelAccount(widget.studentId) : const HostelAccount();
      if (mounted) {
        setState(() {
          _view = view;
          _apps = apps;
          _account = account;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _sheet(Widget sheet, String done) async {
    final sent = await showModalBottomSheet<bool>(context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => sheet);
    if (sent == true && mounted) {
      say(context, done);
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final v = _view;
    final a = _account;
    return Scaffold(
      appBar: AppBar(title: Text(l.hsTitle)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (v == null && _error == null) const KxLoading(),
            if (v != null && !v.resident) ..._notResident(context),
            if (v != null && v.resident && a != null) ..._resident(context, v, a),
          ],
        ),
      ),
    );
  }

  List<Widget> _notResident(BuildContext context) {
    final l = context.l10n;
    final apps = _apps ?? const <HostelApplication>[];
    final open = apps.where((x) => x.open).firstOrNull;
    return [
      KxCard(
        child: Row(
          children: [
            const KxIconBox(Icons.apartment_outlined),
            const SizedBox(width: Kx.s12),
            Expanded(child: Text(open == null ? l.hsNoSeat : l.hsApplicationOpen(open.number), style: context.text.bodyLarge)),
          ],
        ),
      ),
      const SizedBox(height: Kx.s12),
      if (open == null)
        FilledButton.icon(
          key: const Key('hsApply'),
          onPressed: () => _sheet(_ApplySheet(api: widget.api, studentId: widget.studentId), l.hsApplied),
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
          icon: const Icon(Icons.add_home_outlined),
          label: Text(l.hsApplyForSeat),
        ),
      if (apps.isNotEmpty) ...[
        SectionTitle(l.hsApplications),
        for (final x in apps)
          Card(
            key: Key('hostelApp-${x.id}'),
            child: ListTile(
              title: Text(x.number),
              subtitle: Text([if (x.createdAt != null) context.fmt.date(x.createdAt!), if (x.decisionNote.isNotEmpty) x.decisionNote].join(' · ')),
              trailing: _StatusPill(_appStatus(l, x.status), _appTone(x.status)),
            ),
          ),
      ],
    ];
  }

  List<Widget> _resident(BuildContext context, HostelView v, HostelAccount a) {
    final l = context.l10n;
    final c = context.colors;
    final pending = a.pendingRequest;
    return [
      KxCard(
        color: c.primaryContainer,
        child: Row(
          children: [
            Icon(Icons.bed_outlined, color: c.onPrimaryContainer, size: 32),
            const SizedBox(width: Kx.s12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(l.gatePassRoom(v.block ?? '', v.room ?? ''), key: const Key('hsRoom'), style: context.text.titleMedium?.copyWith(color: c.onPrimaryContainer, fontWeight: FontWeight.w600)),
                  if ((v.bed ?? '').isNotEmpty) Text(l.hsBed(v.bed!), style: context.text.bodyMedium?.copyWith(color: c.onPrimaryContainer)),
                ],
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: Kx.s12),
      KxActionGrid(
        children: [
          KxActionTile(key: const Key('hsOutPasses'), icon: Icons.badge_outlined, label: l.gatePassTitle, onTap: () async {
            await GatePassScreen.open(context, widget.api, widget.studentId);
            await _load();
          }),
          KxActionTile(key: const Key('hsMessLeave'), icon: Icons.no_meals_outlined, label: l.hsMessLeave, onTap: () => _sheet(_MessLeaveSheet(api: widget.api, studentId: widget.studentId, today: _today), l.hsMessLeaveSent)),
          KxActionTile(
            key: const Key('hsChangeRoom'),
            icon: Icons.swap_horiz,
            label: l.hsChangeOrVacate,
            onTap: pending != null ? () => say(context, l.hsRequestWaiting) : () => _sheet(_RequestSheet(api: widget.api, studentId: widget.studentId, today: _today), l.hsRequestSent),
          ),
        ],
      ),
      if (a.requests.isNotEmpty) ...[
        SectionTitle(l.hsRequests),
        for (final r in a.requests)
          Card(
            key: Key('hsRequest-${r.id}'),
            child: ListTile(
              leading: Icon(r.kind == 'vacate' ? Icons.logout : Icons.swap_horiz),
              title: Text(r.kind == 'vacate' ? l.hsVacate : l.hsRoomChange),
              subtitle: Text([l.hsFrom(context.fmt.date(r.effectiveOn)), r.reason, if (r.decisionNote.isNotEmpty) r.decisionNote].join(' · ')),
              trailing: _StatusPill(_reqStatus(l, r.status), _reqTone(r.status)),
            ),
          ),
      ],
      SectionTitle(l.hsMessBills),
      if (a.messBills.isEmpty) EmptyNote(l.hsNoBills),
      for (final b in a.messBills) _BillCard(bill: b),
      if (a.messLeaves.isNotEmpty) ...[
        SectionTitle(l.hsMessLeaves),
        for (final m in a.messLeaves)
          Card(
            key: Key('messLeave-${m.id}'),
            child: ListTile(
              leading: const Icon(Icons.no_meals_outlined),
              title: Text(context.fmt.dayRange(m.fromOn, m.toOn)),
              subtitle: m.reason.isEmpty ? null : Text(m.reason),
              trailing: _StatusPill(_reqStatus(l, m.status), _reqTone(m.status)),
            ),
          ),
      ],
    ];
  }

  static String _appStatus(AppLocalizations l, String s) => switch (s) {
    'approved' => l.hsAppApproved,
    'waitlisted' => l.hsAppWaitlisted,
    'allotted' => l.hsAppAllotted,
    'rejected' => l.hsAppRejected,
    'withdrawn' => l.hsAppWithdrawn,
    _ => l.hsAppApplied,
  };

  static KxTone _appTone(String s) => switch (s) {
    'approved' || 'allotted' => KxTone.success,
    'rejected' => KxTone.danger,
    'withdrawn' => KxTone.neutral,
    _ => KxTone.warning,
  };

  static String _reqStatus(AppLocalizations l, String s) => switch (s) {
    'approved' => l.hsApproved,
    'rejected' => l.hsRejected,
    'cancelled' => l.hsCancelled,
    _ => l.hsPending,
  };

  static KxTone _reqTone(String s) => switch (s) {
    'approved' => KxTone.success,
    'rejected' => KxTone.danger,
    'cancelled' => KxTone.neutral,
    _ => KxTone.warning,
  };
}

class _StatusPill extends StatelessWidget {
  const _StatusPill(this.label, this.tone);

  final String label;
  final KxTone tone;

  @override
  Widget build(BuildContext context) {
    final t = kxTone(context, tone);
    return ConstrainedBox(constraints: const BoxConstraints(maxWidth: 140), child: Pill(label, background: t.bg, foreground: t.fg));
  }
}

class _BillCard extends StatelessWidget {
  const _BillCard({required this.bill});

  final MessBill bill;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final b = bill;
    return Card(
      key: Key('messBill-${b.id}'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(context.fmt.month(b.monthStart), style: context.text.titleSmall)),
                Text(Fmt.rupees(b.netPaise), style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: Kx.s4),
            Text(l.hsBillDays(b.days), style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
            if (b.rebatePaise > 0) Text(l.hsBillRebate(b.rebateDays, Fmt.rupees(b.rebatePaise)), style: context.text.bodySmall?.copyWith(color: Tone.good(context))),
            Text(b.status == 'charged' ? l.hsBillCharged : l.hsBillDraft, style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}

/// Picks a date with the platform picker; shows it in a field.
class _DateField extends StatelessWidget {
  const _DateField({super.key, required this.label, required this.value, required this.first, required this.onPick});

  final String label;
  final DateTime value;
  final DateTime first;
  final ValueChanged<DateTime> onPick;

  @override
  Widget build(BuildContext context) => InkWell(
    borderRadius: Kx.radiusMd,
    onTap: () async {
      final d = await showDatePicker(context: context, initialDate: value.isBefore(first) ? first : value, firstDate: first, lastDate: first.add(const Duration(days: 365)));
      if (d != null) onPick(d);
    },
    child: InputDecorator(
      decoration: InputDecoration(labelText: label, suffixIcon: const Icon(Icons.event, size: 18)),
      child: Text(context.fmt.date(value), style: context.text.bodyLarge),
    ),
  );
}

/// A bottom sheet with a title, fields, an error and a send button.
class _SheetFrame extends StatelessWidget {
  const _SheetFrame({required this.title, required this.children, required this.sendLabel, required this.onSend, required this.busy, this.problem, this.sendKey});

  final String title;
  final List<Widget> children;
  final String sendLabel;
  final VoidCallback onSend;
  final bool busy;
  final Object? problem;
  final Key? sendKey;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, MediaQuery.viewInsetsOf(context).bottom + Kx.s16),
    child: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: context.text.titleLarge),
          const SizedBox(height: Kx.s16),
          ...children,
          if (problem != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner(problem!)),
          const SizedBox(height: Kx.s16),
          FilledButton(key: sendKey, onPressed: busy ? null : onSend, style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)), child: Text(sendLabel)),
        ],
      ),
    ),
  );
}

class _ApplySheet extends StatefulWidget {
  const _ApplySheet({required this.api, required this.studentId});

  final StudentApi api;
  final String studentId;

  @override
  State<_ApplySheet> createState() => _ApplySheetState();
}

class _ApplySheetState extends State<_ApplySheet> {
  String? _gender;
  final _distance = TextEditingController();
  final _needs = TextEditingController();
  bool _busy = false;
  Object? _problem;

  @override
  void dispose() {
    _distance.dispose();
    _needs.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final l = context.l10n;
    if (_gender == null) return setState(() => _problem = l.hsPickGender);
    final km = _distance.text.trim().isEmpty ? null : double.tryParse(_distance.text.trim());
    if (_distance.text.trim().isNotEmpty && km == null) return setState(() => _problem = l.hsDistanceNumber);
    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      await widget.api.applyForHostel(widget.studentId, gender: _gender!, distanceKm: km, needs: _needs.text.trim());
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _problem = e;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return _SheetFrame(
      title: l.hsApplyForSeat,
      sendLabel: l.hsApplySend,
      sendKey: const Key('hsApplySend'),
      onSend: _send,
      busy: _busy,
      problem: _problem,
      children: [
        Text(l.hsGender, style: context.text.labelLarge),
        const SizedBox(height: Kx.s8),
        Wrap(
          spacing: Kx.s8,
          children: [
            for (final (v, t) in [('female', l.hsGenderFemale), ('male', l.hsGenderMale), ('other', l.hsGenderOther)])
              ChoiceChip(key: Key('gender-$v'), label: Text(t), selected: _gender == v, onSelected: (_) => setState(() => _gender = v)),
          ],
        ),
        const SizedBox(height: Kx.s12),
        TextField(key: const Key('hsDistance'), controller: _distance, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: l.hsDistance, suffixText: l.hsKm)),
        TextField(key: const Key('hsNeeds'), controller: _needs, maxLength: 300, maxLines: 3, decoration: InputDecoration(labelText: l.hsNeeds)),
      ],
    );
  }
}

class _MessLeaveSheet extends StatefulWidget {
  const _MessLeaveSheet({required this.api, required this.studentId, required this.today});

  final StudentApi api;
  final String studentId;
  final DateTime today;

  @override
  State<_MessLeaveSheet> createState() => _MessLeaveSheetState();
}

class _MessLeaveSheetState extends State<_MessLeaveSheet> {
  late DateTime _from = widget.today.add(const Duration(days: 1));
  late DateTime _to = widget.today.add(const Duration(days: 1));
  final _reason = TextEditingController();
  bool _busy = false;
  Object? _problem;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_to.isBefore(_from)) return setState(() => _problem = context.l10n.hsEndBeforeStart);
    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      await widget.api.applyMessLeave(widget.studentId, from: _from, to: _to, reason: _reason.text.trim());
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _problem = e;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return _SheetFrame(
      title: l.hsMessLeave,
      sendLabel: l.hsSend,
      sendKey: const Key('hsMessLeaveSend'),
      onSend: _send,
      busy: _busy,
      problem: _problem,
      children: [
        Text(l.hsMessLeaveHelp, style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
        const SizedBox(height: Kx.s12),
        _DateField(key: const Key('mlFrom'), label: l.hsFromDate, value: _from, first: widget.today, onPick: (d) => setState(() => _from = d)),
        const SizedBox(height: Kx.s8),
        _DateField(key: const Key('mlTo'), label: l.hsToDate, value: _to, first: widget.today, onPick: (d) => setState(() => _to = d)),
        TextField(key: const Key('mlReason'), controller: _reason, maxLength: 300, decoration: InputDecoration(labelText: l.hsReasonOptional)),
      ],
    );
  }
}

class _RequestSheet extends StatefulWidget {
  const _RequestSheet({required this.api, required this.studentId, required this.today});

  final StudentApi api;
  final String studentId;
  final DateTime today;

  @override
  State<_RequestSheet> createState() => _RequestSheetState();
}

class _RequestSheetState extends State<_RequestSheet> {
  String _kind = 'change';
  late DateTime _on = widget.today.add(const Duration(days: 7));
  final _reason = TextEditingController();
  bool _busy = false;
  Object? _problem;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final l = context.l10n;
    if (_reason.text.trim().length < 3) return setState(() => _problem = l.hsReasonNeeded);
    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      await widget.api.requestHostelChange(widget.studentId, kind: _kind, reason: _reason.text.trim(), effectiveOn: _on);
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _problem = e;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return _SheetFrame(
      title: l.hsChangeOrVacate,
      sendLabel: l.hsSend,
      sendKey: const Key('hsRequestSend'),
      onSend: _send,
      busy: _busy,
      problem: _problem,
      children: [
        SegmentedButton<String>(
          segments: [
            ButtonSegment(value: 'change', label: Text(l.hsRoomChange), icon: const Icon(Icons.swap_horiz)),
            ButtonSegment(value: 'vacate', label: Text(l.hsVacate), icon: const Icon(Icons.logout)),
          ],
          selected: {_kind},
          onSelectionChanged: (s) => setState(() => _kind = s.first),
        ),
        const SizedBox(height: Kx.s12),
        _DateField(key: const Key('hrOn'), label: l.hsEffectiveOn, value: _on, first: widget.today, onPick: (d) => setState(() => _on = d)),
        TextField(key: const Key('hrReason'), controller: _reason, maxLength: 500, maxLines: 3, decoration: InputDecoration(labelText: l.hsReason)),
      ],
    );
  }
}
