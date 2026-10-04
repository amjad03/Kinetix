import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/family.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../widgets/common.dart';
import 'payment_gateway.dart';
import 'receipt_screen.dart';

/// One child's fees: what is due (with part payments), what is paid, and every payment's receipt.
/// "Pay now" takes the full balance or a part of it through the institution's online gateway.
class FeesScreen extends StatefulWidget {
  const FeesScreen({super.key, required this.family, required this.child, this.payInvoiceId});

  final FamilyController family;
  final Child child;

  /// Opened from Home's "Pay": starts paying this fee once loaded.
  final String? payInvoiceId;

  static Future<void> open(BuildContext context, FamilyController family, Child child, {String? payInvoiceId}) => Navigator.of(context)
      .push(
        MaterialPageRoute(
          builder: (_) => FeesScreen(family: family, child: child, payInvoiceId: payInvoiceId),
        ),
      );

  @override
  State<FeesScreen> createState() => _FeesScreenState();
}

class _FeesScreenState extends State<FeesScreen> {
  FamilyController get family => widget.family;
  ParentApi get api => family.api;
  String get childId => widget.child.id;

  /// "Starting payment…" / "Confirming payment…" over the screen while the server works.
  String? _busy;

  @override
  void initState() {
    super.initState();
    _load(first: true);
  }

  DateTime get _today => family.summaryOf(childId)?.today ?? DateTime.now();

  Future<void> _load({bool first = false}) async {
    final fees = await family.loadFees(childId);
    if (!first || !mounted || fees == null || widget.payInvoiceId == null) return;
    final inv = fees.invoice(widget.payInvoiceId!);
    if (inv != null && !inv.isPaid && PaymentGateway.available(fees.onlinePayments)) await _pay(inv, fees);
  }

  Future<void> _problem(String title, String message) => showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK'))],
    ),
  );

  /// Amount → checkout → the gateway → confirm with the server → receipt.
  Future<void> _pay(FeeInvoice invoice, StudentFees fees) async {
    final amount = await PaySheet.show(context, invoice: invoice, demo: fees.onlinePayments == OnlinePayments.demo);
    if (amount == null || !mounted) return;
    var confirming = false;
    try {
      setState(() => _busy = 'Starting payment…');
      final checkout = await api.checkout(invoice.id, amountPaise: amount);
      if (!mounted) return;
      setState(() => _busy = null);
      final result = await PaymentGateway.forProvider(checkout.provider).pay(context, checkout);
      if (!mounted) return;
      switch (result) {
        case PaymentCancelled():
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(const SnackBar(content: Text('Payment cancelled. Nothing was paid.')));
        case PaymentFailed(:final message):
          await _problem("Payment didn't go through", message);
        case PaymentInWallet(:final walletName):
          final wallet = walletName ?? 'your wallet app';
          await _problem(
            'Finish paying in $wallet',
            'When $wallet confirms the payment, the fee updates here and the receipt arrives in Updates.',
          );
          await _load();
        case PaymentSucceeded(:final providerPaymentId, :final signature):
          confirming = true;
          setState(() => _busy = 'Confirming payment…');
          final receipt = await api.confirmPayment(checkout.paymentId, providerPaymentId: providerPaymentId, signature: signature);
          if (!mounted) return;
          setState(() => _busy = null);
          _load();
          await ReceiptScreen.open(context, api, paymentId: checkout.paymentId, receipt: receipt, justPaid: true);
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = null);
      if (confirming) {
        await _problem(
          "We couldn't confirm this payment",
          '${e.message}. If money left your account, the college will get the confirmation from the payment '
              'gateway and this fee will update shortly. Otherwise, try again.',
        );
      } else if (e.status == 503) {
        await _problem('Online payment is not available', e.message);
      } else {
        await _problem("Payment didn't go through", e.message);
      }
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: family,
      builder: (context, _) {
        final fees = family.feesOf(childId);
        final error = family.feesErrorOf(childId);
        return Stack(
          children: [
            Scaffold(
              appBar: AppBar(title: Text("${widget.child.firstName}'s fees")),
              body: RefreshIndicator(
                onRefresh: _load,
                child: fees == null
                    ? ListView(
                        padding: const EdgeInsets.all(Kx.s16),
                        children: [
                          if (error != null)
                            ErrorBanner(error, onRetry: _load)
                          else
                            const Padding(
                              padding: EdgeInsets.all(Kx.s48),
                              child: Center(child: CircularProgressIndicator()),
                            ),
                        ],
                      )
                    : _body(context, fees, error),
              ),
            ),
            if (_busy != null) ...[
              const ModalBarrier(dismissible: false, color: Colors.black38),
              Center(
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: Kx.s24, vertical: Kx.s20),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const SizedBox.square(dimension: 24, child: CircularProgressIndicator(strokeWidth: 3)),
                        const SizedBox(width: Kx.s16),
                        Text(_busy!, style: context.text.bodyLarge),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ],
        );
      },
    );
  }

  Widget _body(BuildContext context, StudentFees fees, String? error) {
    final c = context.colors;
    final today = _today;
    final open = fees.open;
    final paid = fees.paid;
    final overdue = open.where((i) => i.isOverdue(today)).length;
    final canPay = PaymentGateway.available(fees.onlinePayments);
    final reason = PaymentGateway.unavailableReason(fees.onlinePayments);
    final titles = {for (final i in fees.invoices) i.id: i.title};

    return ListView(
      padding: const EdgeInsets.only(bottom: Kx.s32),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Kx.s16, Kx.s8, Kx.s16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (error != null) ...[ErrorBanner(error, onRetry: _load), const SizedBox(height: Kx.s12)],
              Text(fees.duePaise == 0 ? 'Nothing due' : 'Total due', style: context.text.labelLarge?.copyWith(color: c.onSurfaceVariant)),
              Text(
                Fmt.rupees(fees.duePaise),
                key: const Key('totalDue'),
                style: context.text.displaySmall?.copyWith(
                  fontWeight: FontWeight.w500,
                  color: overdue > 0 ? c.error : (fees.duePaise == 0 ? Tone.good(context) : c.onSurface),
                ),
              ),
              const SizedBox(height: Kx.s4),
              Wrap(
                spacing: Kx.s8,
                runSpacing: Kx.s4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(widget.child.sectionName, style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
                  if (overdue > 0)
                    Pill(
                      '$overdue overdue',
                      icon: Icons.warning_amber_rounded,
                      background: c.errorContainer,
                      foreground: c.onErrorContainer,
                    ),
                ],
              ),
              if (fees.onlinePayments == OnlinePayments.demo && open.isNotEmpty) ...[const SizedBox(height: Kx.s16), const DemoBanner()],
              if (reason != null && open.isNotEmpty) ...[const SizedBox(height: Kx.s16), CounterNotice(reason)],
            ],
          ),
        ),
        if (fees.invoices.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: Kx.s24),
            child: KxEmptyState(
              icon: Icons.receipt_long_outlined,
              message: 'No fees have been issued for ${widget.child.firstName} yet.\nNew fees from the college will show here.',
            ),
          ),
        if (open.isNotEmpty) ...[
          const KxSectionHeader('To pay'),
          for (final inv in open)
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s12),
              child: InvoiceCard(invoice: inv, today: today, onPay: canPay ? () => _pay(inv, fees) : null),
            ),
        ],
        if (paid.isNotEmpty) ...[
          const KxSectionHeader('Paid'),
          for (final inv in paid)
            ListTile(
              key: Key('paid-${inv.id}'),
              leading: IconBadge(Icons.check_rounded, background: Tone.goodContainer(context), foreground: Tone.good(context)),
              title: Text(inv.title),
              subtitle: Text('${Fmt.rupees(inv.amountPaise)} · was due ${Fmt.shortDay(inv.dueOn)}'),
              trailing: Pill('Paid', background: Tone.goodContainer(context), foreground: Tone.good(context)),
            ),
        ],
        if (fees.payments.isNotEmpty) ...[
          const KxSectionHeader('Payments and receipts'),
          for (final p in fees.payments)
            ListTile(
              key: Key('payment-${p.id}'),
              leading: const IconBadge(Icons.receipt_long_outlined),
              title: Text('${Fmt.rupees(p.amountPaise)} · ${titles[p.invoiceId] ?? 'Fee'}', maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: Text(
                [if (p.paidAt != null) Fmt.shortDay(p.paidAt!), p.method.label, if (p.receiptNo != null) p.receiptNo!].join(' · '),
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => ReceiptScreen.open(context, api, paymentId: p.id),
            ),
        ],
      ],
    );
  }
}

/// "Please pay at the fees counter", with why.
class CounterNotice extends StatelessWidget {
  const CounterNotice(this.message, {super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      key: const Key('payAtCounter'),
      padding: const EdgeInsets.all(Kx.s12),
      decoration: BoxDecoration(color: c.surfaceContainerHigh, borderRadius: Kx.radiusMd),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.storefront_outlined, color: c.onSurfaceVariant),
          const SizedBox(width: Kx.s12),
          Expanded(child: Text(message, style: context.text.bodyMedium)),
        ],
      ),
    );
  }
}

/// A fee still to pay: amount, due date (overdue in red), part payments as progress, "Pay now".
class InvoiceCard extends StatelessWidget {
  const InvoiceCard({super.key, required this.invoice, required this.today, this.onPay});

  final FeeInvoice invoice;
  final DateTime today;
  final VoidCallback? onPay;

  /// (label, background, foreground) for the due-date chip.
  static (String, Color, Color) dueChip(BuildContext context, FeeInvoice inv, DateTime today) {
    final c = context.colors;
    final days = Fmt.daysBetween(today, inv.dueOn);
    if (days < 0) return ('Overdue · was due ${Fmt.shortDay(inv.dueOn)}', c.errorContainer, c.onErrorContainer);
    if (days <= 7) return (Fmt.due(inv.dueOn, today), Tone.warnContainer(context), Tone.warn(context));
    return (Fmt.due(inv.dueOn, today), c.secondaryContainer, c.onSecondaryContainer);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final inv = invoice;
    final (label, bg, fg) = dueChip(context, inv, today);
    final overdue = inv.isOverdue(today);
    return Card(
      key: Key('invoice-${inv.id}'),
      child: Padding(
        padding: const EdgeInsets.all(Kx.s16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: Text(inv.title, style: context.text.titleMedium)),
                const SizedBox(width: Kx.s8),
                Text(
                  Fmt.rupees(inv.balancePaise),
                  style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w500, color: overdue ? c.error : c.onSurface),
                ),
              ],
            ),
            const SizedBox(height: Kx.s8),
            Align(
              alignment: Alignment.centerLeft,
              child: Pill(label, icon: overdue ? Icons.warning_amber_rounded : Icons.event_outlined, background: bg, foreground: fg),
            ),
            if (inv.paidPaise > 0) ...[
              const SizedBox(height: Kx.s12),
              ClipRRect(
                borderRadius: Kx.radiusSm,
                child: LinearProgressIndicator(
                  value: inv.progress,
                  minHeight: 8,
                  color: Tone.goodBar(context),
                  backgroundColor: c.surfaceContainerHighest,
                ),
              ),
              const SizedBox(height: Kx.s4),
              Text(
                '${Fmt.rupees(inv.paidPaise)} of ${Fmt.rupees(inv.amountPaise)} paid · ${Fmt.rupees(inv.balancePaise)} left',
                key: Key('progress-${inv.id}'),
                style: context.text.bodyMedium?.copyWith(color: c.onSurfaceVariant),
              ),
            ],
            if (onPay != null) ...[
              const SizedBox(height: Kx.s12),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.icon(
                  key: Key('pay-${inv.id}'),
                  onPressed: onPay,
                  icon: const Icon(Icons.currency_rupee, size: 18),
                  label: const Text('Pay now'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Full balance or a part of it, typed in rupees: at least ₹1 and no more than the balance.
class PaySheet extends StatefulWidget {
  const PaySheet({super.key, required this.invoice, this.demo = false});

  final FeeInvoice invoice;
  final bool demo;

  /// The amount to pay in paise, or null when the parent backs out.
  static Future<int?> show(BuildContext context, {required FeeInvoice invoice, bool demo = false}) => showModalBottomSheet<int>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => PaySheet(invoice: invoice, demo: demo),
  );

  /// Null when [text] is a payable amount against [balancePaise]; otherwise what is wrong.
  static String? validate(String text, int balancePaise) {
    if (text.trim().isEmpty) return 'Enter an amount';
    final paise = Fmt.parseRupees(text);
    if (paise == null) return 'Enter an amount in rupees, like 2500 or 2500.50';
    if (paise < 100) return 'The smallest payment is ₹1';
    if (paise > balancePaise) return 'That is more than the ${Fmt.rupees(balancePaise)} due';
    return null;
  }

  @override
  State<PaySheet> createState() => _PaySheetState();
}

class _PaySheetState extends State<PaySheet> {
  bool _part = false;
  final _amount = TextEditingController();
  String? _error;
  bool _tried = false;

  int get _balance => widget.invoice.balancePaise;

  int? get _paise => _part ? (PaySheet.validate(_amount.text, _balance) == null ? Fmt.parseRupees(_amount.text) : null) : _balance;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  void _submit() {
    if (_part) {
      final err = PaySheet.validate(_amount.text, _balance);
      setState(() {
        _tried = true;
        _error = err;
      });
      if (err != null) return;
    }
    Navigator.pop(context, _paise);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final paise = _paise;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(Kx.s24, 0, Kx.s24, Kx.s24 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Pay ${widget.invoice.title}', style: context.text.headlineSmall),
            const SizedBox(height: Kx.s4),
            Text(
              '${Fmt.rupees(_balance)} due',
              key: const Key('payBalance'),
              style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
            ),
            const SizedBox(height: Kx.s20),
            SegmentedButton<bool>(
              segments: [
                ButtonSegment(value: false, label: Text('Full ${Fmt.rupees(_balance)}', key: const Key('payFull'))),
                const ButtonSegment(value: true, label: Text('Part amount', key: Key('payPart'))),
              ],
              selected: {_part},
              showSelectedIcon: false,
              onSelectionChanged: (s) => setState(() {
                _part = s.single;
                _error = null;
                _tried = false;
              }),
            ),
            if (_part) ...[
              const SizedBox(height: Kx.s16),
              TextField(
                key: const Key('amountField'),
                controller: _amount,
                autofocus: true,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d{0,9}(\.\d{0,2})?'))],
                decoration: InputDecoration(
                  labelText: 'Amount',
                  prefixText: '₹ ',
                  helperText: 'Between ₹1 and ${Fmt.rupees(_balance)}',
                  errorText: _error,
                  border: const OutlineInputBorder(),
                ),
                onChanged: (_) => setState(() => _error = _tried ? PaySheet.validate(_amount.text, _balance) : null),
                onSubmitted: (_) => _submit(),
              ),
            ],
            if (widget.demo) ...[const SizedBox(height: Kx.s16), const DemoBanner()],
            const SizedBox(height: Kx.s24),
            FilledButton(
              key: const Key('payContinue'),
              onPressed: _submit,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
              child: Text(paise == null ? 'Pay' : 'Pay ${Fmt.rupees(paise)}'),
            ),
          ],
        ),
      ),
    );
  }
}
