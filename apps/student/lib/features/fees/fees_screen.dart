import 'package:flutter/material.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';

/// "Fees are paid by your parent…": students see their fees but do not pay in this app.
const feesNote =
    'Fees are paid by your parent or guardian in the KINETIX Parent app, or at the college fees counter. '
    'Here you can see what is due and open your receipts.';

/// How an invoice reads: (label, background, foreground).
(String, Color, Color) invoiceStatus(BuildContext context, FeeInvoice inv, DateTime today) {
  final c = context.colors;
  if (inv.status == InvoiceStatus.paid) return ('Paid', Tone.goodContainer(context), Tone.good(context));
  if (inv.status == InvoiceStatus.cancelled) return ('Cancelled', c.surfaceContainerHighest, c.onSurfaceVariant);
  if (Fmt.daysBetween(today, inv.dueOn) < 0) return ('Overdue', c.errorContainer, c.onErrorContainer);
  if (inv.paidPaise > 0) return ('Part paid', Tone.warnContainer(context), Tone.warn(context));
  return ('Due', Tone.warnContainer(context), Tone.warn(context));
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
  String? _error;

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
      if (mounted) setState(() => _error = e.message);
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
            const SliverAppBar.large(title: Text('Fees')),
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
                    const SectionTitle('Fees'),
                    if (a.invoices.isEmpty)
                      Text('No fees have been issued to you.', style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
                    for (final inv in a.invoices) _InvoiceTile(invoice: inv, today: widget.today),
                    const SectionTitle('Payments'),
                    if (a.payments.isEmpty)
                      Text(
                        'No payments yet. Receipts appear here once a payment goes through.',
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
                              [Fmt.paymentMethod(p.method), if (p.paidAt != null) Fmt.date(p.paidAt!)].join(' · '),
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
          feesNote,
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
              Text(allPaid ? 'Nothing due' : 'Total due', style: context.text.labelLarge?.copyWith(color: c.onSurfaceVariant)),
              const SizedBox(height: Kx.s4),
              Text(
                allPaid ? 'All paid' : Fmt.rupees(account.duePaise),
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
                      ? '${Fmt.plural(overdue, 'fee')} overdue · next: ${due.first.title}'
                      : 'Next: ${due.first.title}, due ${Fmt.shortDay(due.first.dueOn)}',
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
  const _InvoiceTile({required this.invoice, required this.today});

  final FeeInvoice invoice;
  final DateTime today;

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
                if (invoice.paidPaise > 0 && invoice.status != InvoiceStatus.paid) '${Fmt.rupees(invoice.paidPaise)} paid',
                if (invoice.status == InvoiceStatus.due) 'due ${Fmt.shortDay(invoice.dueOn)}',
              ].join(' · '),
              style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
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
  String? _error;

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
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final r = _r;
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
      appBar: AppBar(title: const Text('Receipt')),
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
                            'Fee receipt',
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
                          row('Receipt no.', r.receiptNo),
                          if (r.paidAt != null) row('Paid on', '${Fmt.date(r.paidAt!)}, ${Fmt.time(r.paidAt!)}'),
                          row('Student', r.studentName),
                          row('Roll no.', r.rollNo),
                          row('Class', r.className),
                          row('For', r.invoiceTitle),
                          row('Method', Fmt.paymentMethod(r.method)),
                          if (r.reference != null && r.reference!.isNotEmpty) row('Reference', r.reference!),
                          const Divider(height: Kx.s24),
                          row('Fee amount', Fmt.rupees(r.invoiceAmountPaise)),
                          row('Balance', r.balancePaise == 0 ? 'Nil' : Fmt.rupees(r.balancePaise), strong: true),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: Kx.s12),
                  Text(
                    'Keep this for your records. Show it at the fees counter if anyone asks for proof of payment.',
                    style: context.text.bodySmall?.copyWith(color: c.onSurfaceVariant),
                  ),
                ],
              ),
            ),
    );
  }
}
