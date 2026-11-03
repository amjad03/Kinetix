import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:zynetix_ui/zynetix_ui.dart';

import '../../core/api.dart';
import '../../core/campus_services.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../l10n/l10n.dart';
import '../wallet/wallet_gateway.dart';

/// Opens [url] outside the app (the system browser). Tests replace it.
typedef UrlOpener = Future<bool> Function(Uri url);

/// Paying a fee from the Student app: amount → the gateway's checkout → the server confirms → the receipt.
///
/// The demo provider and Razorpay on a phone use the in-app checkout (as the canteen wallet does); every other
/// gateway (PayU, Cashfree, Easebuzz, CCAvenue, and Razorpay elsewhere) opens the server's launch page in the
/// browser, and the app asks the server whether the payment went through when the student comes back.
class FeePayFlow {
  FeePayFlow(this.api);

  final StudentApi api;

  /// Tests replace how the browser is opened.
  static UrlOpener? debugOpener;

  static Future<bool> _openExternally(Uri url) => launchUrl(url, mode: LaunchMode.externalApplication);

  /// Whether this fee can be paid here: the institution (or the fee's own fee account) has a gateway.
  static bool canPay(FeeAccount a, FeeInvoice i) => i.balancePaise > 0 && a.gatewayOf(i) != null;

  /// Runs the whole payment; returns the receipt once paid, or null (cancelled, failed, still pending).
  Future<(FeeReceipt, String)?> pay(BuildContext context, FeeAccount account, FeeInvoice invoice) async {
    final l = context.l10n;
    final messenger = ScaffoldMessenger.of(context);
    final amount = await FeePaySheet.show(context, invoice: invoice, allowPartial: account.allowPartial, minPartPaise: account.minPartPaise);
    if (amount == null || !context.mounted) return null;
    var confirming = false;
    try {
      final checkout = await api.feeCheckout(invoice.id, amountPaise: amount == invoice.balancePaise ? null : amount);
      if (!context.mounted) return null;
      final inApp = checkout.provider == 'demo' || (checkout.provider == 'razorpay' && (PaymentGateway.debugOverride != null || PaymentGateway.razorpaySupported));
      if (!inApp) {
        final url = checkout.launchUrl;
        final opened = url != null && await (debugOpener ?? _openExternally)(Uri.parse(url));
        if (!context.mounted) return null;
        if (!opened) {
          await _problem(context, l.walletFailedTitle, l.walletFailOpen);
          return null;
        }
        final r = await FeeBrowserWaitSheet.show(context, api: api, paymentId: checkout.paymentId);
        return r == null ? null : (r, checkout.paymentId);
      }
      final result = await PaymentGateway.forProvider(checkout.provider).pay(
        context,
        TopUpCheckout(topupId: checkout.paymentId, provider: checkout.provider, keyId: checkout.keyId, orderId: checkout.orderId, amountPaise: checkout.amountPaise, name: checkout.name, description: checkout.description),
      );
      if (!context.mounted) return null;
      switch (result) {
        case PaymentCancelled():
          messenger
            ..hideCurrentSnackBar()
            ..showSnackBar(SnackBar(content: Text(l.walletCancelled)));
          return null;
        case PaymentFailed failed:
          await _problem(context, l.walletFailedTitle, failed.describe(l));
          return null;
        case PaymentInWallet():
          await _problem(context, l.paymentPending, l.walletInWalletBody);
          return null;
        case PaymentSucceeded(:final providerPaymentId, :final signature):
          confirming = true;
          final receipt = await api.confirmFeePayment(checkout.paymentId, providerPaymentId: providerPaymentId, signature: signature);
          return (receipt, checkout.paymentId);
      }
    } on ApiException catch (e) {
      if (context.mounted) await _problem(context, confirming ? l.walletCouldNotConfirm : l.walletFailedTitle, describeError(l, e));
      return null;
    }
  }

  static Future<void> _problem(BuildContext context, String title, String message) => showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: Text(ctx.l10n.ok))],
    ),
  );
}

/// How much to pay: the whole balance, the instalment due now, or (when the institution allows it) a part.
enum FeePayChoice { full, instalment, part }

class FeePaySheet extends StatefulWidget {
  const FeePaySheet({super.key, required this.invoice, this.allowPartial = true, this.minPartPaise = 0});

  final FeeInvoice invoice;
  final bool allowPartial;
  final int minPartPaise;

  /// The amount to pay in paise, or null when the student backs out.
  static Future<int?> show(BuildContext context, {required FeeInvoice invoice, bool allowPartial = true, int minPartPaise = 0}) => showModalBottomSheet<int>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => FeePaySheet(invoice: invoice, allowPartial: allowPartial, minPartPaise: minPartPaise),
  );

  /// Null when [text] is a payable part of [balancePaise]; otherwise what is wrong.
  static String? validate(AppLocalizations l, String text, int balancePaise, {int minPaise = 0}) {
    if (text.trim().isEmpty) return l.walletEnterAmount;
    final paise = Fmt.parseRupees(text);
    if (paise == null) return l.walletEnterRupees;
    if (paise < 100) return l.walletMinAmount;
    if (paise > balancePaise) return l.feeMoreThanDue(Fmt.rupees(balancePaise));
    if (paise < minPaise && paise != balancePaise) return l.feeAtLeastPart(Fmt.rupees(minPaise));
    return null;
  }

  @override
  State<FeePaySheet> createState() => _FeePaySheetState();
}

class _FeePaySheetState extends State<FeePaySheet> {
  FeePayChoice _choice = FeePayChoice.full;
  final _amount = TextEditingController();
  String? _error;

  int get _balance => widget.invoice.balancePaise;

  int? get _dueNow {
    final d = widget.invoice.dueNowPaise;
    return d != null && d > 0 && d < _balance ? d : null;
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  void _submit() {
    switch (_choice) {
      case FeePayChoice.full:
        Navigator.pop(context, _balance);
      case FeePayChoice.instalment:
        Navigator.pop(context, _dueNow ?? _balance);
      case FeePayChoice.part:
        final err = FeePaySheet.validate(context.l10n, _amount.text, _balance, minPaise: widget.minPartPaise);
        if (err != null) return setState(() => _error = err);
        Navigator.pop(context, Fmt.parseRupees(_amount.text));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final c = context.colors;
    final paise = switch (_choice) {
      FeePayChoice.full => _balance,
      FeePayChoice.instalment => _dueNow ?? _balance,
      FeePayChoice.part => Fmt.parseRupees(_amount.text),
    };
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(Kx.s24, 0, Kx.s24, Kx.s24 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.invoice.title, style: context.text.headlineSmall),
            const SizedBox(height: Kx.s4),
            Text(l.feeBalanceDue(Fmt.rupees(_balance)), key: const Key('payBalance'), style: context.text.bodyLarge?.copyWith(color: c.onSurfaceVariant)),
            const SizedBox(height: Kx.s20),
            if (_dueNow != null || widget.allowPartial)
              SegmentedButton<FeePayChoice>(
                segments: [
                  ButtonSegment(value: FeePayChoice.full, label: Text(l.feePayFull, key: const Key('payFull'))),
                  if (_dueNow != null) ButtonSegment(value: FeePayChoice.instalment, label: Text(l.feePayInstalment(Fmt.rupees(_dueNow!)), key: const Key('payInstalment'))),
                  if (widget.allowPartial) ButtonSegment(value: FeePayChoice.part, label: Text(l.feePayPart, key: const Key('payPart'))),
                ],
                selected: {_choice},
                showSelectedIcon: false,
                onSelectionChanged: (s) => setState(() {
                  _choice = s.single;
                  _error = null;
                }),
              ),
            if (_choice == FeePayChoice.part) ...[
              const SizedBox(height: Kx.s16),
              TextField(
                key: const Key('payAmount'),
                controller: _amount,
                autofocus: true,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d{0,9}(\.\d{0,2})?'))],
                decoration: InputDecoration(labelText: l.walletAmount, prefixText: '₹ ', errorText: _error, border: const OutlineInputBorder()),
                onChanged: (_) => setState(() => _error = null),
                onSubmitted: (_) => _submit(),
              ),
            ],
            const SizedBox(height: Kx.s24),
            FilledButton(
              key: const Key('payContinue'),
              onPressed: _submit,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
              child: Text(paise == null ? l.feePayNow : l.walletDemoPay(Fmt.rupees(paise))),
            ),
          ],
        ),
      ),
    );
  }
}

/// After the gateway's page opened in the browser: the student comes back and the app asks the server whether the
/// payment went through (it also asks by itself when the app is back in front). Pops with the receipt once paid.
class FeeBrowserWaitSheet extends StatefulWidget {
  const FeeBrowserWaitSheet({super.key, required this.api, required this.paymentId});

  final StudentApi api;
  final String paymentId;

  static Future<FeeReceipt?> show(BuildContext context, {required StudentApi api, required String paymentId}) => showModalBottomSheet<FeeReceipt>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => FeeBrowserWaitSheet(api: api, paymentId: paymentId),
  );

  @override
  State<FeeBrowserWaitSheet> createState() => _FeeBrowserWaitSheetState();
}

class _FeeBrowserWaitSheetState extends State<FeeBrowserWaitSheet> with WidgetsBindingObserver {
  bool _checking = false;
  String? _note;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _check(quiet: true);
  }

  Future<void> _check({bool quiet = false}) async {
    if (_checking) return;
    final l = context.l10n;
    setState(() => _checking = true);
    try {
      final r = await widget.api.refreshFeePayment(widget.paymentId);
      if (!mounted) return;
      if (r.paid && r.receipt != null) return Navigator.pop(context, r.receipt);
      setState(() => _note = r.status == 'failed' ? l.walletFailedTitle : (quiet ? null : l.paymentPending));
    } on ApiException catch (e) {
      if (mounted && !quiet) setState(() => _note = describeError(l, e));
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Kx.s24, 0, Kx.s24, Kx.s24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l.payInBrowserTitle, style: context.text.headlineSmall),
            const SizedBox(height: Kx.s8),
            Text(l.payInBrowserBody, style: context.text.bodyLarge),
            if (_note != null) ...[
              const SizedBox(height: Kx.s12),
              Text(_note!, key: const Key('browserNote'), style: context.text.bodyMedium?.copyWith(color: context.colors.onSurfaceVariant)),
            ],
            const SizedBox(height: Kx.s24),
            FilledButton(
              key: const Key('checkPayment'),
              onPressed: _checking ? null : () => _check(),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)),
              child: Text(l.checkPayment),
            ),
            const SizedBox(height: Kx.s8),
            TextButton(onPressed: () => Navigator.pop(context), style: TextButton.styleFrom(minimumSize: const Size.fromHeight(Kx.target)), child: Text(l.cancel)),
          ],
        ),
      ),
    );
  }
}
