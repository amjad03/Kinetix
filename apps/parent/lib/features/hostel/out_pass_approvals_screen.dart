import 'package:flutter/material.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/family_care.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import '../school_life/load_view.dart';

/// "Sat 11 Oct, 6:00 pm".
String _when(BuildContext context, DateTime d) => '${context.fmt.shortDay(d)}, ${context.fmt.time(d)}';

/// Out-passes the children asked for that wait for the family: approve (it goes on to the warden)
/// or decline. The server tells the family with a push when one arrives.
class OutPassApprovalsScreen extends StatefulWidget {
  const OutPassApprovalsScreen({super.key, required this.api, this.childId});

  final ParentApi api;

  /// Only this child's passes; null for every child.
  final String? childId;

  static Future<void> open(BuildContext context, ParentApi api, {String? childId}) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => OutPassApprovalsScreen(api: api, childId: childId),
    ),
  );

  @override
  State<OutPassApprovalsScreen> createState() => _OutPassApprovalsScreenState();
}

class _OutPassApprovalsScreenState extends State<OutPassApprovalsScreen> {
  List<FamilyOutPass>? _passes;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final all = await widget.api.outPassesForFamily();
      final mine = [
        for (final p in all)
          if (widget.childId == null || p.studentId == widget.childId) p,
      ];
      if (mounted) setState(() => _passes = mine);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final list = _passes;
    return Scaffold(
      appBar: AppBar(title: Text(l.opApprovalsTitle)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, Kx.s32),
          children: [
            if (_error != null) ErrorBanner(_error!, onRetry: _load),
            if (list == null && _error == null) const KxLoading(),
            if (list != null && list.isEmpty) KxEmptyState(key: const Key('opEmpty'), icon: Icons.verified_outlined, message: l.opEmpty),
            for (final p in list ?? const <FamilyOutPass>[])
              Padding(
                padding: const EdgeInsets.only(bottom: Kx.s12),
                child: OutPassApprovalCard(api: widget.api, pass: p, onDecided: _load),
              ),
          ],
        ),
      ),
    );
  }
}

/// One out-pass waiting for the family, with Approve and Decline.
class OutPassApprovalCard extends StatefulWidget {
  const OutPassApprovalCard({super.key, required this.api, required this.pass, required this.onDecided});

  final ParentApi api;
  final FamilyOutPass pass;
  final Future<void> Function() onDecided;

  @override
  State<OutPassApprovalCard> createState() => _OutPassApprovalCardState();
}

class _OutPassApprovalCardState extends State<OutPassApprovalCard> {
  bool _busy = false;

  Future<void> _decide(bool approve) async {
    final l = context.l10n;
    final p = widget.pass;
    if (!approve) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(l.opDeclineTitle),
          content: Text(l.opDeclineBody(p.studentName)),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
            FilledButton(key: const Key('opConfirmDecline'), onPressed: () => Navigator.pop(ctx, true), child: Text(l.opDecline)),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    setState(() => _busy = true);
    try {
      await widget.api.decideOutPass(p.id, approve: approve);
      if (!mounted) return;
      say(context, approve ? l.opApproved(p.studentName) : l.opDeclined);
      await widget.onDecided();
    } on ApiException catch (e) {
      if (mounted) say(context, context.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final p = widget.pass;
    return KxCard(
      key: Key('familyPass-${p.id}'),
      color: Tone.warnContainer(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.badge_outlined, color: Tone.warn(context)),
              const SizedBox(width: Kx.s8),
              Expanded(
                child: Text(l.opAsks(p.studentName), style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: Kx.s8),
          Text(p.destination.isEmpty ? p.reason : '${p.reason} · ${p.destination}', style: context.text.bodyLarge),
          Text(l.opBackBy(_when(context, p.expectedBackAt)), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
          const SizedBox(height: Kx.s12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  key: Key('opDecline-${p.id}'),
                  onPressed: _busy ? null : () => _decide(false),
                  child: Text(l.opDecline),
                ),
              ),
              const SizedBox(width: Kx.s12),
              Expanded(
                child: FilledButton(
                  key: Key('opApprove-${p.id}'),
                  onPressed: _busy ? null : () => _decide(true),
                  child: _busy ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Text(l.opApprove),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// On Home: out-passes waiting for the family, if any; tapping opens them. Shows nothing otherwise.
class PendingOutPassesBanner extends StatefulWidget {
  const PendingOutPassesBanner({super.key, required this.api});

  final ParentApi api;

  @override
  State<PendingOutPassesBanner> createState() => _PendingOutPassesBannerState();
}

class _PendingOutPassesBannerState extends State<PendingOutPassesBanner> {
  int _count = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await widget.api.outPassesForFamily();
      if (mounted) setState(() => _count = list.length);
    } on ApiException {
      // A hostel-less institution (or no connection): the banner simply does not show.
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_count == 0) return const SizedBox.shrink();
    final l = context.l10n;
    return Padding(
      padding: const EdgeInsets.only(bottom: Kx.s12),
      child: KxCard(
        key: const Key('pendingOutPasses'),
        color: Tone.warnContainer(context),
        onTap: () async {
          await OutPassApprovalsScreen.open(context, widget.api);
          await _load();
        },
        child: Row(
          children: [
            Icon(Icons.badge_outlined, color: Tone.warn(context)),
            const SizedBox(width: Kx.s12),
            Expanded(
              child: Text(l.opWaiting(_count), style: context.text.bodyLarge?.copyWith(fontWeight: FontWeight.w500)),
            ),
            const Icon(Icons.chevron_right),
          ],
        ),
      ),
    );
  }
}
