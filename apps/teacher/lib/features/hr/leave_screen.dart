import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/hr_models.dart';
import '../../core/l10n.dart';
import '../../widgets/common.dart';

/// Roles that can decide other people's leave (the server limits heads of department to their staff).
const leaveApproverRoles = {'hod', 'principal', 'tenant_admin', 'hr_manager'};

String leaveStatusText(AppLocalizations l, LeaveStatus s) => switch (s) {
  LeaveStatus.pending => l.leaveStatusPending,
  LeaveStatus.approved => l.leaveStatusApproved,
  LeaveStatus.rejected => l.leaveStatusRejected,
  LeaveStatus.cancelled => l.leaveStatusCancelled,
};

/// Leave: balances, my requests, applying, and (for approvers) the requests waiting for a decision.
class LeaveScreen extends StatefulWidget {
  const LeaveScreen({super.key, required this.api, this.canApprove = false});

  final TeacherApi api;
  final bool canApprove;

  @override
  State<LeaveScreen> createState() => _LeaveScreenState();
}

class _LeaveScreenState extends State<LeaveScreen> {
  List<LeaveBalanceInfo>? _balances;
  List<LeaveRequestInfo> _mine = const [];
  List<LeaveRequestInfo> _pending = const [];
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final balances = await widget.api.leaveBalances();
      final mine = await widget.api.myLeaveRequests();
      final pending = widget.canApprove ? await widget.api.pendingLeaveRequests() : const <LeaveRequestInfo>[];
      if (mounted) {
        setState(() {
          _balances = balances;
          _mine = mine;
          _pending = pending;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _run(Future<void> Function() f) async {
    try {
      await f();
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.errorText(e))));
    }
  }

  Future<void> _apply() async {
    final done = await Navigator.of(context).push<bool>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => ApplyLeaveScreen(api: widget.api)));
    if (done == true) await _load();
  }

  Future<void> _decide(LeaveRequestInfo r, bool approve) async {
    final l = context.l10n;
    final note = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(approve ? l.leaveApprove : l.leaveReject),
        content: TextField(key: const Key('decisionNote'), controller: note, decoration: InputDecoration(labelText: l.leaveDecisionNote)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
          FilledButton(key: const Key('confirmDecision'), onPressed: () => Navigator.pop(ctx, true), child: Text(approve ? l.leaveApprove : l.leaveReject)),
        ],
      ),
    );
    final text = note.text.trim();
    if (ok == true) await _run(() async => widget.api.decideLeave(r.id, approve: approve, note: text.isEmpty ? null : text));
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    final balances = _balances;
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(key: const Key('applyLeave'), onPressed: _apply, icon: const Icon(Icons.add), label: Text(l.leaveApply)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverAppBar.large(title: Text(l.leaveTitle)),
            if (_error != null)
              SliverPadding(padding: const EdgeInsets.all(Kx.s16), sliver: SliverToBoxAdapter(child: ErrorBanner.api(_error!, onRetry: _load))),
            if (balances == null && _error == null)
              const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
            else if (balances != null)
              SliverList.list(
                children: [
                  if (widget.canApprove) ...[
                    KxSectionHeader(l.leaveApprovals),
                    if (_pending.isEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: Kx.s16), child: Text(l.leaveNoApprovals, key: const Key('noApprovals'))),
                    for (final r in _pending)
                      Card(
                        key: Key('pending-${r.id}'),
                        margin: const EdgeInsets.symmetric(horizontal: Kx.s16, vertical: Kx.s4),
                        child: Padding(
                          padding: const EdgeInsets.all(Kx.s12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${r.userName} · ${r.type.name}', style: context.text.titleSmall),
                              Text('${_range(f, r)} · ${l.leaveDaysLabel(daysText(r.days))}'),
                              if (r.reason.isNotEmpty) Text(r.reason),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  TextButton(key: Key('reject-${r.id}'), onPressed: () => _decide(r, false), child: Text(l.leaveReject)),
                                  FilledButton(key: Key('approve-${r.id}'), onPressed: () => _decide(r, true), child: Text(l.leaveApprove)),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                  KxSectionHeader(l.leaveBalances),
                  for (final b in balances)
                    ListTile(
                      key: Key('balance-${b.type.code}'),
                      title: Text(b.type.name),
                      trailing: Text(b.type.paid ? l.leaveAvailable(daysText(b.available)) : '—'),
                    ),
                  KxSectionHeader(l.leaveMine),
                  if (_mine.isEmpty) Padding(padding: const EdgeInsets.symmetric(horizontal: Kx.s16), child: Text(l.leaveNone, key: const Key('noLeave'))),
                  for (final r in _mine)
                    ListTile(
                      key: Key('leave-${r.id}'),
                      title: Text('${r.type.name} · ${l.leaveDaysLabel(daysText(r.days))}'),
                      subtitle: Text('${_range(f, r)}\n${leaveStatusText(l, r.status)}${r.decisionNote == null ? '' : ' · ${r.decisionNote}'}'),
                      isThreeLine: true,
                      trailing: r.status == LeaveStatus.pending
                          ? TextButton(key: Key('cancel-${r.id}'), onPressed: () => _run(() async => widget.api.cancelLeave(r.id)), child: Text(l.leaveCancelAction))
                          : null,
                    ),
                  const SizedBox(height: 88),
                ],
              ),
          ],
        ),
      ),
    );
  }

  static String _range(Fmt f, LeaveRequestInfo r) => r.fromDate == r.toDate ? f.shortDay(r.fromDate) : '${f.shortDay(r.fromDate)} – ${f.shortDay(r.toDate)}';
}

/// The apply form: type, dates, half day and a reason, with the working days previewed.
class ApplyLeaveScreen extends StatefulWidget {
  const ApplyLeaveScreen({super.key, required this.api});

  final TeacherApi api;

  @override
  State<ApplyLeaveScreen> createState() => _ApplyLeaveScreenState();
}

class _ApplyLeaveScreenState extends State<ApplyLeaveScreen> {
  List<LeaveTypeInfo>? _types;
  String? _typeId;
  DateTime _from = DateUtils.dateOnly(DateTime.now());
  DateTime _to = DateUtils.dateOnly(DateTime.now());
  bool _half = false;
  final _reason = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    widget.api.leaveTypes().then((t) {
      if (mounted) setState(() {
        _types = t;
        _typeId = t.firstOrNull?.id;
      });
    }, onError: (Object e) {
      if (mounted) setState(() => _error = e is ApiException ? context.l10n.errorText(e) : '$e');
    });
  }

  Future<void> _pick(bool from) async {
    final d = await showDatePicker(context: context, initialDate: from ? _from : _to, firstDate: DateTime.now().subtract(const Duration(days: 60)), lastDate: DateTime.now().add(const Duration(days: 365)));
    if (d == null) return;
    setState(() {
      if (from) {
        _from = d;
        if (_to.isBefore(d)) _to = d;
      } else {
        _to = d.isBefore(_from) ? _from : d;
      }
      if (_from != _to) _half = false;
    });
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.applyLeave(leaveTypeId: _typeId!, fromDate: dayString(_from), toDate: dayString(_to), halfDay: _half, reason: _reason.text.trim());
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = context.l10n.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final f = Fmt.of(context);
    final types = _types;
    return Scaffold(
      appBar: AppBar(title: Text(l.leaveApply)),
      body: types == null
          ? Center(child: _error == null ? const CircularProgressIndicator() : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner(_error!)))
          : ListView(
              padding: const EdgeInsets.all(Kx.s16),
              children: [
                DropdownButtonFormField<String>(
                  key: const Key('leaveType'),
                  initialValue: _typeId,
                  decoration: InputDecoration(labelText: l.leaveType),
                  items: [for (final t in types) DropdownMenuItem(value: t.id, child: Text(t.name))],
                  onChanged: (v) => setState(() => _typeId = v),
                ),
                ListTile(key: const Key('pickFrom'), title: Text(l.leaveFrom), trailing: Text(f.shortDay(_from)), onTap: () => _pick(true)),
                ListTile(key: const Key('pickTo'), title: Text(l.leaveTo), trailing: Text(f.shortDay(_to)), onTap: () => _pick(false)),
                SwitchListTile(key: const Key('halfDay'), title: Text(l.leaveHalfDay), value: _half, onChanged: _from == _to ? (v) => setState(() => _half = v) : null),
                TextField(key: const Key('leaveReason'), controller: _reason, maxLines: 3, maxLength: 500, decoration: InputDecoration(labelText: l.leaveReason)),
                Text(l.leaveDaysCount(daysText(leaveDays(_from, _to, halfDay: _half))), key: const Key('previewDays')),
                if (_error != null) Padding(padding: const EdgeInsets.only(top: Kx.s12), child: ErrorBanner(_error!)),
                const SizedBox(height: Kx.s16),
                FilledButton(key: const Key('submitLeave'), onPressed: _busy || _typeId == null ? null : _submit, child: Text(l.leaveSubmit)),
              ],
            ),
    );
  }
}
