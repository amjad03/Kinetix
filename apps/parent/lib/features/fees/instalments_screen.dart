import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/campus_extras.dart';
import '../../core/format.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';

/// A fee split into instalments: each part with its due date, amount and whether it is paid.
class InstalmentsScreen extends StatefulWidget {
  const InstalmentsScreen({super.key, required this.api, required this.invoiceId, required this.title});

  final ParentApi api;
  final String invoiceId;
  final String title;

  static Future<void> open(BuildContext context, ParentApi api, String invoiceId, String title) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => InstalmentsScreen(api: api, invoiceId: invoiceId, title: title)));

  @override
  State<InstalmentsScreen> createState() => _InstalmentsScreenState();
}

class _InstalmentsScreenState extends State<InstalmentsScreen> {
  InstalmentSchedule? _plan;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final p = await widget.api.instalments(widget.invoiceId);
      if (mounted) setState(() => _plan = p);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final plan = _plan;
    return Scaffold(
      appBar: AppBar(title: Text(l.instalmentsTitle)),
      body: plan == null
          ? (_error == null ? const Center(child: CircularProgressIndicator()) : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner(_error!, onRetry: _load)))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(Kx.s16),
                children: [
                  Text(widget.title, style: context.text.titleMedium),
                  const SizedBox(height: Kx.s4),
                  if (plan.instalments.isEmpty)
                    Text(l.instalmentsNone, key: const Key('instalmentsNone'), style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant))
                  else ...[
                    Text(l.instalmentsSummary(Fmt.rupees(plan.paidPaise), Fmt.rupees(plan.amountPaise)), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                    const SizedBox(height: Kx.s12),
                    for (final i in plan.instalments)
                      Builder(
                        builder: (context) {
                          final (label, bg, fg) = instalmentChip(context, i.status);
                          return Card(
                            key: Key('instalment-${i.seq}'),
                            child: ListTile(
                              title: Text(l.instalmentN(i.seq)),
                              subtitle: Text([Fmt.rupees(i.amountPaise), l.instalmentDueOn(context.fmt.shortDay(i.dueOn))].join(' · ')),
                              trailing: Pill(label, background: bg, foreground: fg),
                            ),
                          );
                        },
                      ),
                  ],
                ],
              ),
            ),
    );
  }
}

/// Label and colours for an instalment's status.
(String, Color, Color) instalmentChip(BuildContext context, String status) {
  final l = context.l10n;
  final c = context.colors;
  return switch (status) {
    'paid' => (l.instalmentPaid, Tone.goodContainer(context), Tone.good(context)),
    'overdue' => (l.instalmentOverdue, c.errorContainer, c.onErrorContainer),
    'partial' => (l.instalmentPartial, Tone.warnContainer(context), Tone.warn(context)),
    _ => (l.instalmentDue, c.secondaryContainer, c.onSecondaryContainer),
  };
}

/// All of a student's instalment plans in one list, each under its fee's name.
class AllInstalmentsScreen extends StatefulWidget {
  const AllInstalmentsScreen({super.key, required this.api, required this.studentId});

  final ParentApi api;
  final String studentId;

  static Future<void> open(BuildContext context, ParentApi api, String studentId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AllInstalmentsScreen(api: api, studentId: studentId)));

  @override
  State<AllInstalmentsScreen> createState() => _AllInstalmentsScreenState();
}

class _AllInstalmentsScreenState extends State<AllInstalmentsScreen> {
  List<InstalmentSchedule>? _plans;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final p = await widget.api.studentInstalments(widget.studentId);
      if (mounted) setState(() => _plans = p);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final plans = _plans;
    return Scaffold(
      appBar: AppBar(title: Text(l.instalmentsTitle)),
      body: plans == null
          ? (_error == null ? const Center(child: CircularProgressIndicator()) : Padding(padding: const EdgeInsets.all(Kx.s16), child: ErrorBanner(_error!, onRetry: _load)))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                key: const Key('allInstalments'),
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(Kx.s16),
                children: [
                  if (plans.isEmpty) Text(l.instalmentsNone, key: const Key('instalmentsNone'), style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
                  for (final plan in plans) ...[
                    Text(plan.title, style: context.text.titleMedium),
                    Text(l.instalmentsSummary(Fmt.rupees(plan.paidPaise), Fmt.rupees(plan.amountPaise)), style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                    const SizedBox(height: Kx.s8),
                    for (final i in plan.instalments)
                      Builder(
                        builder: (context) {
                          final (label, bg, fg) = instalmentChip(context, i.status);
                          return Card(
                            child: ListTile(
                              title: Text(l.instalmentN(i.seq)),
                              subtitle: Text([Fmt.rupees(i.amountPaise), l.instalmentDueOn(context.fmt.shortDay(i.dueOn))].join(' · ')),
                              trailing: Pill(label, background: bg, foreground: fg),
                            ),
                          );
                        },
                      ),
                    const SizedBox(height: Kx.s12),
                  ],
                ],
              ),
            ),
    );
  }
}
