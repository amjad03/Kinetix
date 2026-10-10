import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'instalments_screen.dart';

/// "Fees are paid by your parent…": students see their fees but do not pay in this app.
String feesNote(AppLocalizations l) => l.feesNote;

/// How an invoice reads: (label, background, foreground).
(String, Color, Color) invoiceStatus(BuildContext context, FeeInvoice inv, DateTime today) {
  final c = context.colors;
  final l = context.l10n;
  if (inv.status == InvoiceStatus.paid) return (l.invoicePaid, Tone.goodContainer(context), Tone.good(context));
  if (inv.status == InvoiceStatus.cancelled) return (l.invoiceCancelled, c.surfaceContainerHighest, c.onSurfaceVariant);
  if (Fmt.daysBetween(today, inv.dueOn) < 0) return (l.invoiceOverdue, c.errorContainer, c.onErrorContainer);
  if (inv.paidPaise > 0) return (l.invoicePartPaid, Tone.warnContainer(context), Tone.warn(context));
  return (l.invoiceDue, Tone.warnContainer(context), Tone.warn(context));
}

/// The student's invoices and payments, read-only, with receipts.
class FeesScreen extends StatefulWidget {
  const FeesScreen({super.key, required this.api, required this.studentId, required this.today});

  final StudentApi api;
  final String studentId;
  final DateTime today;

  static Future<void> open(BuildContext context, StudentApi api, String studentId, {required DateTime today}) => Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => FeesScreen(api: api, studentId: studentId, today: today),
    ),
  );

  @override
  State<FeesScreen> createState() => _FeesScreenState();
}

class _FeesScreenState extends State<FeesScreen> {
  FeeAccount? _account;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final a = await widget.api.fees(widget.studentId);
      if (mounted) setState(() => _account = a);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final a = _account;
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverAppBar.large(title: Text(context.l10n.fees)),
            if (_error != null)
              CenteredSliver(
                sliver: SliverToBoxAdapter(child: ErrorBanner(_error!, onRetry: _load)),
              )
            else if (a == null)
              const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
            else
              CenteredSliver(
                bottom: Kx.s32,
                sliver: SliverList.list(
                  children: [
                    FeesTotalCard(account: a, today: widget.today),
                    const SizedBox(height: Kx.s12),
                    _Note(),
                    SectionTitle(context.l10n.fees),
                    if (a.invoices.isNotEmpty)
                      Align(
                        alignment: AlignmentDirectional.centerEnd,
                        child: TextButton.icon(
                          key: const Key('allInstalments'),
                          onPressed: () => AllInstalmentsScreen.open(context, widget.api, widget.studentId),
                          icon: const Icon(Icons.event_note_outlined),
                          label: Text(context.l10n.instalmentsTitle),
                        ),
                      ),
                    if (a.invoices.isEmpty)
                      Text(context.l10n.noFeesIssued, style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
                    for (final inv in a.invoices) _InvoiceTile(invoice: inv, today: widget.today, onInstalments: () => InstalmentsScreen.open(context, widget.api, inv.id, inv.title)),
                    SectionTitle(context.l10n.payments),
                    if (a.payments.isEmpty)
                      Text(
                        context.l10n.noPayments,
                        key: const Key('noPayments'),
                        style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
                      ),
                    for (final p in a.payments)
                      Card(
                        child: ListTile(
                          key: Key('payment-${p.id}'),
                          leading: IconBadge(
                            Icons.receipt_long_outlined,
                            background: Tone.goodContainer(context),
                            foreground: Tone.good(context),
                          ),
                          title: Text(Fmt.rupees(p.amountPaise)),
                          subtitle: Text(
                            [
                              ?a.invoiceOf(p)?.title,
                              [context.fmt.paymentMethod(p.method), if (p.paidAt != null) context.fmt.date(p.paidAt!)].join(' · '),
                            ].join('\n'),
                          ),
                          isThreeLine: a.invoiceOf(p) != null,
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => ReceiptScreen.open(context, widget.api, p.id),
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
}

class _Note extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Icon(Icons.info_outline, size: 18, color: context.colors.onSurfaceVariant),
      const SizedBox(width: Kx.s8),
      Expanded(
        child: Text(
          feesNote(context.l10n),
          key: const Key('feesNote'),
          style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant),
        ),
      ),
    ],
  );
}

/// The amount due (or "All paid") in large type.
class FeesTotalCard extends StatelessWidget {
  const FeesTotalCard({super.key, required this.account, required this.today, this.onTap});

  final FeeAccount account;
  final DateTime today;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final due = account.invoices.where((i) => i.balancePaise > 0).toList()..sort((a, b) => a.dueOn.compareTo(b.dueOn));
    final overdue = due.where((i) => Fmt.daysBetween(today, i.dueOn) < 0).length;
    final allPaid = account.duePaise == 0;
    return Card(
      key: const Key('feesTotal'),
      color: allPaid ? Tone.goodContainer(context) : c.surfaceContainerLow,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(Kx.s16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(allPaid ? context.l10n.feesNothingDue : context.l10n.totalDue, style: context.text.labelLarge?.copyWith(color: c.onSurfaceVariant)),
              const SizedBox(height: Kx.s4),
              Text(
                allPaid ? context.l10n.allPaid : Fmt.rupees(account.duePaise),
                key: const Key('feesDue'),
                style: context.text.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w500,
                  color: allPaid ? Tone.good(context) : (overdue > 0 ? c.error : c.onSurface),
                ),
              ),
              if (due.isNotEmpty) ...[
                const SizedBox(height: Kx.s4),
                Text(
                  overdue > 0
                      ? context.l10n.feesOverdueNext(overdue, due.first.title)
                      : context.l10n.nextFeeDue(due.first.title, context.fmt.shortDay(due.first.dueOn)),
                  style: context.text.bodyMedium?.copyWith(color: overdue > 0 ? c.error : c.onSurfaceVariant),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _InvoiceTile extends StatelessWidget {
  const _InvoiceTile({required this.invoice, required this.today, this.onInstalments});

  final FeeInvoice invoice;
  final DateTime today;
  final VoidCallback? onInstalments;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (label, bg, fg) = invoiceStatus(context, invoice, today);
    return Card(
      key: Key('invoice-${invoice.id}'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: Text(invoice.title, style: context.text.titleSmall)),
                const SizedBox(width: Kx.s8),
                Pill(label, background: bg, foreground: fg),
              ],
            ),
            const SizedBox(height: Kx.s4),
            Text(
              [
                Fmt.rupees(invoice.amountPaise),
                if (invoice.paidPaise > 0 && invoice.status != InvoiceStatus.paid) context.l10n.amountPaidShort(Fmt.rupees(invoice.paidPaise)),
                if (invoice.status == InvoiceStatus.due) context.l10n.dueOnShort(context.fmt.shortDay(invoice.dueOn)),
              ].join(' · '),
              style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
            ),
            if (onInstalments != null)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(key: Key('instalments-${invoice.id}'), onPressed: onInstalments, child: Text(context.l10n.instalmentsButton)),
              ),
          ],
        ),
      ),
    );
  }
}

/// A fee receipt, laid out like the printed one.
class ReceiptScreen extends StatefulWidget {
  const ReceiptScreen({super.key, required this.api, required this.paymentId});

  final StudentApi api;
  final String paymentId;

  static Future<void> open(BuildContext context, StudentApi api, String paymentId) => Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => ReceiptScreen(api: api, paymentId: paymentId),
    ),
  );

  @override
  State<ReceiptScreen> createState() => _ReceiptScreenState();
}

class _ReceiptScreenState extends State<ReceiptScreen> {
  FeeReceipt? _r;
  ApiException? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await widget.api.receipt(widget.paymentId);
      if (mounted) setState(() => _r = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final r = _r;
    final l = context.l10n;
    Widget row(String label, String value, {bool strong = false}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: Kx.s8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: Text(label, style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
          ),
          const SizedBox(width: Kx.s12),
          Expanded(
            flex: 3,
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: (strong ? context.text.titleMedium : context.text.bodyLarge)?.copyWith(fontWeight: strong ? FontWeight.w700 : null),
            ),
          ),
        ],
      ),
    );

    return Scaffold(
      appBar: AppBar(title: Text(l.receipt)),
      body: _error != null
          ? Padding(
              padding: const EdgeInsets.all(Kx.s16),
              child: Align(
                alignment: Alignment.topCenter,
                child: ErrorBanner(_error!, onRetry: _load),
              ),
            )
          : r == null
          ? const Center(child: CircularProgressIndicator())
          : LayoutBuilder(
              builder: (context, box) => ListView(
                padding: EdgeInsets.fromLTRB(sideGutter(box.maxWidth), Kx.s8, sideGutter(box.maxWidth), Kx.s32),
                children: [
                  Card(
                    key: const Key('receipt'),
                    child: Padding(
                      padding: const EdgeInsets.all(Kx.s16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Icon(Icons.verified_outlined, color: Tone.good(context), size: 36),
                          const SizedBox(height: Kx.s8),
                          Text(r.institution, textAlign: TextAlign.center, style: context.text.titleMedium),
                          Text(
                            l.feeReceipt,
                            textAlign: TextAlign.center,
                            style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
                          ),
                          const SizedBox(height: Kx.s16),
                          Text(
                            Fmt.rupees(r.amountPaise),
                            key: const Key('receiptAmount'),
                            textAlign: TextAlign.center,
                            style: context.text.displaySmall?.copyWith(fontWeight: FontWeight.w500),
                          ),
                          const Divider(height: Kx.s32),
                          row(l.receiptNoLabel, r.receiptNo),
                          if (r.paidAt != null) row(l.paidOn, context.fmt.dateTime(r.paidAt!)),
                          row(l.studentLabel, r.studentName),
                          row(l.rollNoLabel, r.rollNo),
                          row(l.classLabel, r.className),
                          row(l.forLabel, r.invoiceTitle),
                          row(l.method, context.fmt.paymentMethod(r.method)),
                          if (r.reference != null && r.reference!.isNotEmpty) row(l.reference, r.reference!),
                          const Divider(height: Kx.s24),
                          row(l.feeAmount, Fmt.rupees(r.invoiceAmountPaise)),
                          row(l.balance, r.balancePaise == 0 ? l.nil : Fmt.rupees(r.balancePaise), strong: true),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: Kx.s12),
                  Text(
                    l.keepReceipt,
                    style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                  ),
                ],
              ),
            ),
    );
  }
}
