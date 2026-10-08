import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/campus_services.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// Leave: the student's applications and their state, and a form to apply for days off.
/// The class teacher decides; a waiting request can be withdrawn.
class LeaveScreen extends StatefulWidget {
  const LeaveScreen({super.key, required this.api, required this.studentId, this.now});

  final StudentApi api;
  final String studentId;

  /// For tests; defaults to the device clock.
  final DateTime Function()? now;

  static Future<void> open(BuildContext context, StudentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => LeaveScreen(api: api, studentId: studentId)));

  @override
  State<LeaveScreen> createState() => _LeaveScreenState();
}

class _LeaveScreenState extends State<LeaveScreen> {
  List<LeaveRequest>? _items;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await widget.api.leaveRequests(widget.studentId);
      if (mounted) setState(() => _items = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _apply() async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _ApplySheet(api: widget.api, studentId: widget.studentId, today: widget.now?.call() ?? DateTime.now()),
    );
    if (sent == true) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.leaveSentSnack)));
      await _load();
    }
  }

  Future<void> _withdraw(LeaveRequest r) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await widget.api.cancelLeave(r.id);
      await _load();
    } on ApiException catch (e) {
      if (mounted) messenger.showSnackBar(SnackBar(content: Text(context.errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final items = _items;
    return Scaffold(
      appBar: AppBar(title: Text(l.leaveScreenTitle)),
      floatingActionButton: FloatingActionButton.extended(key: const Key('applyLeave'), onPressed: _apply, icon: const Icon(Icons.add), label: Text(l.leaveApplyTitle)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 96),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (items == null && _error == null) const KxLoading(),
            if (items != null && items.isEmpty) KxEmptyState(icon: Icons.event_available_outlined, message: l.leaveNone),
            if (items != null)
              for (final r in items) ...[_LeaveCard(request: r, onWithdraw: () => _withdraw(r)), const SizedBox(height: Kx.s12)],
          ],
        ),
      ),
    );
  }
}

class _LeaveCard extends StatelessWidget {
  const _LeaveCard({required this.request, required this.onWithdraw});

  final LeaveRequest request;
  final VoidCallback onWithdraw;

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final (label, tone) = switch (request.status) {
      LeaveStatus.pending => (l.leaveStatusPending, KxTone.warning),
      LeaveStatus.approved => (l.leaveStatusApproved, KxTone.success),
      LeaveStatus.rejected => (l.leaveStatusRejected, KxTone.danger),
      LeaveStatus.cancelled => (l.leaveStatusCancelled, KxTone.neutral),
    };
    final t = kxTone(context, tone);
    return KxCard(
      key: Key('leave-${request.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(context.fmt.dayRange(request.fromDate, request.toDate), style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600))),
              Pill(label, background: t.bg, foreground: t.fg),
            ],
          ),
          const SizedBox(height: Kx.s4),
          Text(request.reason, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
          if (request.decisionNote != null && request.decisionNote!.isNotEmpty)
            Padding(padding: const EdgeInsets.only(top: Kx.s4), child: Text(request.decisionNote!, style: context.text.bodyMedium)),
          if (request.status == LeaveStatus.pending)
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: TextButton(key: Key('withdraw-${request.id}'), style: TextButton.styleFrom(minimumSize: const Size(Kx.target, Kx.target)), onPressed: onWithdraw, child: Text(l.leaveWithdraw)),
            ),
        ],
      ),
    );
  }
}

class _ApplySheet extends StatefulWidget {
  const _ApplySheet({required this.api, required this.studentId, required this.today});

  final StudentApi api;
  final String studentId;
  final DateTime today;

  @override
  State<_ApplySheet> createState() => _ApplySheetState();
}

class _ApplySheetState extends State<_ApplySheet> {
  late DateTime _from = DateUtils.dateOnly(widget.today);
  late DateTime _to = _from;
  final _reason = TextEditingController();
  String? _problem;
  bool _busy = false;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _pick(bool from) async {
    final first = DateUtils.dateOnly(widget.today);
    final picked = await showDatePicker(
      context: context,
      initialDate: from ? _from : _to,
      firstDate: first,
      lastDate: first.add(const Duration(days: 365)),
    );
    if (picked == null) return;
    setState(() {
      if (from) {
        _from = picked;
        if (_to.isBefore(_from)) _to = _from;
      } else {
        _to = picked;
      }
      _problem = null;
    });
  }

  Future<void> _send() async {
    final l = context.l10n;
    if (_to.isBefore(_from)) return setState(() => _problem = l.leaveToBeforeFrom);
    if (_reason.text.trim().length < 3) return setState(() => _problem = l.leaveReasonRequired);
    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      await widget.api.applyLeave(widget.studentId, from: _from, to: _to, reason: _reason.text.trim());
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
    final fmt = context.fmt;
    return Padding(
      padding: EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, MediaQuery.viewInsetsOf(context).bottom + Kx.s16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.leaveApplyTitle, style: context.text.titleLarge),
            const SizedBox(height: Kx.s16),
            Row(
              children: [
                Expanded(child: _DateField(key: const Key('leaveFrom'), label: l.leaveFromLabel, value: fmt.shortDay(_from), onTap: () => _pick(true))),
                const SizedBox(width: Kx.s12),
                Expanded(child: _DateField(key: const Key('leaveTo'), label: l.leaveToLabel, value: fmt.shortDay(_to), onTap: () => _pick(false))),
              ],
            ),
            const SizedBox(height: Kx.s12),
            TextField(key: const Key('leaveReason'), controller: _reason, maxLines: 3, maxLength: 500, decoration: InputDecoration(labelText: l.leaveReasonLabel)),
            if (_problem != null) Padding(padding: const EdgeInsets.only(bottom: Kx.s8), child: ErrorBanner(_problem!)),
            const SizedBox(height: Kx.s8),
            SizedBox(
              width: double.infinity,
              child: FilledButton(key: const Key('sendLeave'), onPressed: _busy ? null : _send, style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)), child: Text(l.leaveSend)),
            ),
          ],
        ),
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({super.key, required this.label, required this.value, required this.onTap});

  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: Kx.radiusMd,
    child: InputDecorator(
      decoration: InputDecoration(labelText: label, suffixIcon: const Icon(Icons.calendar_today_outlined, size: 18)),
      child: Text(value, style: context.text.bodyLarge, maxLines: 2, overflow: TextOverflow.ellipsis),
    ),
  );
}
