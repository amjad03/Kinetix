import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:kinetix_ui/kinetix_ui.dart';

import '../../core/api.dart';
import '../../core/family.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../../widgets/common.dart';
import 'instalments_screen.dart';
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
      actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: Text(context.l10n.ok))],
    ),
  );

  /// Amount → checkout → the gateway → confirm with the server → receipt.
  Future<void> _pay(FeeInvoice invoice, StudentFees fees) async {
    final amount = await PaySheet.show(context, invoice: invoice, demo: fees.onlinePayments == OnlinePayments.demo);
    if (amount == null || !mounted) return;
    final l = context.l10n;
    var confirming = false;
    try {
      setState(() => _busy = l.startingPayment);
      final checkout = await api.checkout(invoice.id, amountPaise: amount);
      if (!mounted) return;
      setState(() => _busy = null);
      final result = await PaymentGateway.forProvider(checkout.provider).pay(context, checkout);
      if (!mounted) return;
      switch (result) {
        case PaymentCancelled():
          ScaffoldMessenger.of(context)
            ..hideCurrentSnackBar()
            ..showSnackBar(SnackBar(content: Text(l.paymentCancelled)));
        case PaymentFailed failed:
          await _problem(l.paymentFailedTitle, failed.describe(l));
        case PaymentInWallet(:final walletName):
          final wallet = walletName ?? l.yourWalletApp;
          await _problem(l.finishInWallet(wallet), l.walletBody(wallet));
          await _load();
        case PaymentSucceeded(:final providerPaymentId, :final signature):
          confirming = true;
          setState(() => _busy = l.confirmingPayment);
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
        final reason = describeError(l, e);
        await _problem(l.couldNotConfirmTitle, l.couldNotConfirmBody(reason.endsWith('.') || reason.endsWith('।') ? reason : '$reason.'));
      } else if (e.status == 503) {
        await _problem(l.onlineNotAvailableTitle, describeError(l, e));
      } else {
        await _problem(l.paymentFailedTitle, describeError(l, e));
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
              appBar: AppBar(title: Text(context.l10n.childFees(widget.child.firstName))),
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

  Widget _body(BuildContext context, StudentFees fees, Object? error) {
    final c = context.colors;
    final l = context.l10n;
    final today = _today;
    final open = fees.open;
    final paid = fees.paid;
    final overdue = open.where((i) => i.isOverdue(today)).length;
    final canPay = PaymentGateway.available(fees.onlinePayments);
    final reason = PaymentGateway.unavailableReason(l, fees.onlinePayments);
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
              Text(fees.duePaise == 0 ? l.feesNothingDue : l.totalDue, style: context.text.labelLarge?.copyWith(color: c.onSurfaceVariant)),
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
                      l.nOverdue(overdue),
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
              message: l.noFeesIssuedLong(widget.child.firstName),
            ),
          ),
        if (fees.invoices.isNotEmpty)
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: TextButton.icon(
              key: const Key('allInstalments'),
              onPressed: () => AllInstalmentsScreen.open(context, api, widget.child.id),
              icon: const Icon(Icons.event_note_outlined),
              label: Text(l.instalmentsTitle),
            ),
          ),
        if (open.isNotEmpty) ...[
          KxSectionHeader(l.toPay),
          for (final inv in open)
            Padding(
              padding: const EdgeInsets.fromLTRB(Kx.s16, 0, Kx.s16, Kx.s12),
              child: InvoiceCard(
                invoice: inv,
                today: today,
                onPay: canPay ? () => _pay(inv, fees) : null,
                onInstalments: () => InstalmentsScreen.open(context, api, inv.id, inv.title),
              ),
            ),
        ],
        if (paid.isNotEmpty) ...[
          KxSectionHeader(l.paidHeader),
          for (final inv in paid)
            ListTile(
              key: Key('paid-${inv.id}'),
              leading: IconBadge(Icons.check_rounded, background: Tone.goodContainer(context), foreground: Tone.good(context)),
              title: Text(inv.title),
              subtitle: Text(l.paidLine(Fmt.rupees(inv.amountPaise), context.fmt.shortDay(inv.dueOn))),
              trailing: Pill(l.paidPill, background: Tone.goodContainer(context), foreground: Tone.good(context)),
            ),
        ],
        if (fees.payments.isNotEmpty) ...[
          KxSectionHeader(l.paymentsReceipts),
          for (final p in fees.payments)
            ListTile(
              key: Key('payment-${p.id}'),
              leading: const IconBadge(Icons.receipt_long_outlined),
              title: Text('${Fmt.rupees(p.amountPaise)} · ${titles[p.invoiceId] ?? l.feeLabel}', maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: Text(
                [if (p.paidAt != null) context.fmt.shortDay(p.paidAt!), l.paymentMethod(p.method), if (p.receiptNo != null) p.receiptNo!].join(' · '),
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
  const InvoiceCard({super.key, required this.invoice, required this.today, this.onPay, this.onInstalments});

  final FeeInvoice invoice;
  final DateTime today;
  final VoidCallback? onPay;
  final VoidCallback? onInstalments;

  /// (label, background, foreground) for the due-date chip.
  static (String, Color, Color) dueChip(BuildContext context, FeeInvoice inv, DateTime today) {
    final c = context.colors;
    final days = Fmt.daysBetween(today, inv.dueOn);
    final f = context.fmt;
    if (days < 0) return (f.l.overdueWasDue(f.shortDay(inv.dueOn)), c.errorContainer, c.onErrorContainer);
    if (days <= 7) return (f.due(inv.dueOn, today), Tone.warnContainer(context), Tone.warn(context));
    return (f.due(inv.dueOn, today), c.secondaryContainer, c.onSecondaryContainer);
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
                context.l10n.paidOfLeft(Fmt.rupees(inv.paidPaise), Fmt.rupees(inv.amountPaise), Fmt.rupees(inv.balancePaise)),
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
                  label: Text(context.l10n.payNow),
                ),
              ),
            ],
            if (onInstalments != null)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(key: Key('instalments-${inv.id}'), onPressed: onInstalments, child: Text(context.l10n.instalmentsButton)),
              ),
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
  static String? validate(AppLocalizations l, String text, int balancePaise) {
    if (text.trim().isEmpty) return l.enterAmount;
    final paise = Fmt.parseRupees(text);
    if (paise == null) return l.enterAmountRupees;
    if (paise < 100) return l.smallestPayment;
    if (paise > balancePaise) return l.moreThanDue(Fmt.rupees(balancePaise));
    return null;
  }

  @override
  State<PaySheet> createState() => _PaySheetState();
}

class _PaySheetState extends State<PaySheet> {
  bool _part = false;
  final _amount = TextEditingController();
  final _focus = FocusNode();
  String? _error;
  bool _tried = false;

  int get _balance => widget.invoice.balancePaise;

  int? get _paise =>
      _part ? (PaySheet.validate(context.l10n, _amount.text, _balance) == null ? Fmt.parseRupees(_amount.text) : null) : _balance;

  @override
  void dispose() {
    _amount.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _submit() {
    if (_part) {
      final err = PaySheet.validate(context.l10n, _amount.text, _balance);
      setState(() {
        _tried = true;
        _error = err;
      });
      if (err != null) return _focus.requestFocus();
    }
    Navigator.pop(context, _paise);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final l = context.l10n;
    final paise = _paise;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(Kx.s24, 0, Kx.s24, Kx.s24 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l.payTitle(widget.invoice.title), style: context.text.headlineSmall),
            const SizedBox(height: Kx.s4),
            Text(
              l.amountDue(Fmt.rupees(_balance)),
              key: const Key('payBalance'),
              style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant),
            ),
            const SizedBox(height: Kx.s20),
            SegmentedButton<bool>(
              segments: [
                ButtonSegment(value: false, label: Text(l.fullAmount(Fmt.rupees(_balance)), key: const Key('payFull'))),
                ButtonSegment(value: true, label: Text(l.partAmount, key: const Key('payPart'))),
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
                focusNode: _focus,
                autofocus: true,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d{0,9}(\.\d{0,2})?'))],
                decoration: InputDecoration(
                  labelText: l.amount,
                  prefixText: '₹ ',
                  helperText: l.amountRange(Fmt.rupees(_balance)),
                  errorText: _error,
                  border: const OutlineInputBorder(),
                ),
                onChanged: (_) => setState(() => _error = _tried ? PaySheet.validate(l, _amount.text, _balance) : null),
                onSubmitted: (_) => _submit(),
              ),
            ],
            if (widget.demo) ...[const SizedBox(height: Kx.s16), const DemoBanner()],
            const SizedBox(height: Kx.s24),
            FilledButton(
              key: const Key('payContinue'),
              onPressed: _submit,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
              child: Text(paise == null ? l.pay : l.payAmount(Fmt.rupees(paise))),
            ),
          ],
        ),
      ),
    );
  }
}
